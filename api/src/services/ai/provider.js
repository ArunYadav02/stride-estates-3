// ---------------------------------------------------------------------------
// AI provider adapter.
//
// The pipeline is real and always runs. Which brain executes it is a config
// choice: with no API key it uses a local rules-based writer, and it says so
// in the response. Set AI_PROVIDER and AI_API_KEY and the exact same pipeline
// runs against a vision model.
//
// This matters more than it looks. Building the orchestration first and the
// model second means the product works on day one, costs nothing to demo, and
// degrades honestly if a key expires mid-month — instead of a blank screen in
// front of a paying agent.
// ---------------------------------------------------------------------------

import { config } from '../../config.js';

const MODELS = {
  openai: { vision: 'gpt-4o', text: 'gpt-4o-mini' },
  anthropic: { vision: 'claude-sonnet-4-6', text: 'claude-sonnet-4-6' },
};

/** Strip markdown fences a model may wrap around JSON, then parse. */
export function parseModelJson(text, fallback) {
  try {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const start = cleaned.indexOf('{');
    const arrayStart = cleaned.indexOf('[');
    const from = start === -1 ? arrayStart : arrayStart === -1 ? start : Math.min(start, arrayStart);
    return JSON.parse(from > 0 ? cleaned.slice(from) : cleaned);
  } catch (error) {
    return fallback;
  }
}

async function callOpenAI({ system, user, images = [], model }) {
  const content = [{ type: 'text', text: user }];
  images.forEach((url) => content.push({ type: 'image_url', image_url: { url } }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic({ system, user, images = [], model }) {
  const content = [];
  images.forEach((url) => content.push({ type: 'image', source: { type: 'url', url } }));
  content.push({ type: 'text', text: user });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic responded ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = await response.json();
  return (data.content || []).filter((block) => block.type === 'text').map((b) => b.text).join('\n');
}

export const provider = {
  get name() {
    return config.ai.apiKey ? config.ai.provider : 'local';
  },

  get canSeeImages() {
    return Boolean(config.ai.apiKey);
  },

  /** One call. `kind` picks the vision or the cheaper text model. */
  async complete({ system, user, images = [], kind = 'text' }) {
    if (!config.ai.apiKey) throw new Error('No AI provider configured.');
    const model = MODELS[config.ai.provider]?.[kind];
    if (!model) throw new Error(`Unknown AI provider "${config.ai.provider}".`);

    return config.ai.provider === 'anthropic'
      ? callAnthropic({ system, user, images, model })
      : callOpenAI({ system, user, images, model });
  },
};
