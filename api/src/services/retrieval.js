// ---------------------------------------------------------------------------
// Document intelligence: chunk, index, retrieve, cite.
//
// This is the feature an agent will actually pay for. A buyer asks "can I keep
// a dog in this building?" and the answer is on page 24 of a 60-page HOA pack.
//
// v0.1 retrieves with BM25 — classical information retrieval, no API key, no
// per-query cost, and it runs offline. It is genuinely good at exactly this
// kind of question, because the words in the question ("dog", "pet") tend to
// be the words in the clause.
//
// Phase 2 swaps `scoreChunks` for cosine similarity over embeddings and keeps
// everything else, including the citation format. Writing the interface first
// is the difference between a swap and a rewrite.
// ---------------------------------------------------------------------------

import { uuid } from '../lib/helpers.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'be', 'was', 'were',
  'for', 'on', 'at', 'by', 'with', 'as', 'that', 'this', 'it', 'from', 'any', 'may',
  'shall', 'will', 'can', 'i', 'you', 'we', 'they', 'do', 'does', 'not', 'no',
]);

/** Lowercase, strip punctuation, drop stop words, crude singularisation. */
export function tokenise(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map((word) => (word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word));
}

/**
 * Split a document into retrievable chunks.
 *
 * Pages are separated by a form feed or the marker `[[page]]`; paragraphs by a
 * blank line. Chunks are ~180 words with ~40 words of overlap, so a clause that
 * straddles a boundary still appears whole in at least one chunk. Page and
 * paragraph numbers ride along, because an answer without a citation is just a
 * rumour.
 */
export function chunkDocument(text, { targetWords = 180, overlapWords = 40 } = {}) {
  const pages = String(text).split(/\f|\[\[page\]\]/g);
  const chunks = [];
  let ordinal = 0;

  pages.forEach((pageText, pageIndex) => {
    const paragraphs = pageText
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = paragraph.split(' ');

      if (words.length <= targetWords) {
        chunks.push({
          page: pageIndex + 1,
          paragraph: paragraphIndex + 1,
          ordinal: ordinal++,
          content: paragraph,
        });
        return;
      }

      // Long paragraph: slide a window across it with overlap.
      const step = Math.max(1, targetWords - overlapWords);
      for (let start = 0; start < words.length; start += step) {
        const slice = words.slice(start, start + targetWords);
        if (!slice.length) break;
        chunks.push({
          page: pageIndex + 1,
          paragraph: paragraphIndex + 1,
          ordinal: ordinal++,
          content: slice.join(' '),
        });
        if (start + targetWords >= words.length) break;
      }
    });
  });

  return chunks.map((chunk) => ({
    ...chunk,
    id: uuid(),
    token_count: tokenise(chunk.content).length,
  }));
}

/**
 * BM25. k1 controls how fast term frequency saturates, b how much long chunks
 * are penalised. These are the standard values and they are fine.
 */
export function scoreChunks(chunks, query, { k1 = 1.5, b = 0.75 } = {}) {
  const queryTerms = [...new Set(tokenise(query))];
  if (!queryTerms.length || !chunks.length) return [];

  const tokenised = chunks.map((chunk) => tokenise(chunk.content));
  const avgLength = tokenised.reduce((sum, t) => sum + t.length, 0) / tokenised.length || 1;

  // Document frequency per query term.
  const docFreq = new Map();
  queryTerms.forEach((term) => {
    docFreq.set(term, tokenised.filter((tokens) => tokens.includes(term)).length);
  });

  return chunks
    .map((chunk, i) => {
      const tokens = tokenised[i];
      let score = 0;

      queryTerms.forEach((term) => {
        const freq = tokens.filter((t) => t === term).length;
        if (!freq) return;
        const n = docFreq.get(term) || 0;
        const idf = Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5));
        const norm = freq * (k1 + 1) /
          (freq + k1 * (1 - b + b * (tokens.length / avgLength)));
        score += idf * norm;
      });

      return { chunk, raw: score };
    })
    .filter((hit) => hit.raw > 0)
    .sort((a, b2) => b2.raw - a.raw);
}

/**
 * Pull the sentence that best answers the question out of the winning chunk.
 * Extractive, not generative — it can only ever return words that are actually
 * in the document, which is the right trade for anything legally binding.
 */
export function extractAnswer(chunkContent, query) {
  const queryTerms = new Set(tokenise(query));
  const sentences = chunkContent.split(/(?<=[.;:])\s+/).filter((s) => s.trim().length > 20);
  if (!sentences.length) return chunkContent;

  let best = sentences[0];
  let bestHits = -1;

  sentences.forEach((sentence) => {
    const hits = tokenise(sentence).filter((token) => queryTerms.has(token)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = sentence;
    }
  });

  return best.trim();
}

/**
 * The public interface. Phase 2 changes the body of this function to use
 * embeddings; the shape of what it returns must not change.
 */
export function answerQuestion(chunks, question, { topK = 3 } = {}) {
  const hits = scoreChunks(chunks, question).slice(0, topK);
  if (!hits.length) {
    return {
      found: false,
      answer: 'Nothing in this document appears to cover that. Try different wording, or check the original.',
      citations: [],
      method: 'bm25',
    };
  }

  const top = Math.max(...hits.map((h) => h.raw));

  return {
    found: true,
    answer: extractAnswer(hits[0].chunk.content, question),
    citations: hits.map((hit) => ({
      page: hit.chunk.page,
      paragraph: hit.chunk.paragraph,
      confidence: Number((hit.raw / top).toFixed(2)),
      excerpt: hit.chunk.content.slice(0, 320) + (hit.chunk.content.length > 320 ? '…' : ''),
    })),
    method: 'bm25',
  };
}
