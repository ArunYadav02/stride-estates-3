import { useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import {
  Card, PageHeader, Badge, Banner, Button, Field, Input, Select,
  Table, Row, Cell, CellStack, EmptyState, Skeleton, SkeletonTable,
} from '../../design-system';
import { IconSearch } from '../../layout/icons';

const SUGGESTIONS = [
  'Can the tenant keep a dog?',
  'Is subletting or Airbnb allowed?',
  'How fast must emergency repairs be done?',
  'How much notice is needed to inspect?',
  'Where can visitors park?',
  'What happens to the deposit?',
];

export default function DocumentsPage() {
  const { loading, error, data } = useAsync(() => api.documents(), []);
  const [chosen, setChosen] = useState(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(null);

  const documents = data?.documents || [];
  const documentId = chosen || documents[0]?.id;

  const ask = async (text) => {
    const query = (text ?? question).trim();
    if (!query || !documentId) return;
    setQuestion(query);
    setAsking(true);
    setAskError(null);
    try {
      setResult(await api.askDocument(documentId, query));
    } catch (err) {
      setAskError(err);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <PageHeader title="Document search" lede="Ask a contract a question, get the clause and the page" />

      <Banner tone="accent">
        Answers are lifted straight out of the document with a page reference — nothing is
        paraphrased or invented. If the clause is not there, it says so rather than guessing.
      </Banner>

      {loading ? <Skeleton height={200} radius="var(--radius-md)" /> :
       error ? <Banner tone="danger">{error.message}</Banner> :
       documents.length === 0 ? (
        <Card><EmptyState title="No documents indexed yet" /></Card>
      ) : (
        <div className="cols cols-main">
          <div className="stack">
            <Card title="Ask">
              <div className="stack">
                <Field label="Document">
                  <Select value={documentId} onChange={(e) => { setChosen(e.target.value); setResult(null); }}>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title} — {doc.page_count} pages
                      </option>
                    ))}
                  </Select>
                </Field>

                <form onSubmit={(e) => { e.preventDefault(); ask(); }}>
                  <Field label="Question">
                    <Input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g. can the tenant keep a cat?"
                    />
                  </Field>
                </form>

                <div className="row-wrap">
                  {SUGGESTIONS.map((suggestion) => (
                    <Button key={suggestion} size="sm" onClick={() => ask(suggestion)}>{suggestion}</Button>
                  ))}
                </div>

                <div>
                  <Button variant="primary" onClick={() => ask()} loading={asking} disabled={!question.trim()}>
                    <IconSearch width={14} height={14} /> Search the document
                  </Button>
                </div>

                {askError && <Banner tone="danger">{askError.message}</Banner>}
              </div>
            </Card>

            {result && (
              <Card title="Answer" subtitle={result.found ? 'Taken verbatim from the document' : undefined}>
                <p style={{ fontSize: 'var(--text-lg)', lineHeight: 1.65 }}>{result.answer}</p>

                {result.citations.length > 0 && (
                  <div className="stack" style={{ marginTop: 'var(--space-5)' }}>
                    <p className="label">Where it says that</p>
                    {result.citations.map((citation, i) => (
                      <div key={i} style={{
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--space-3)',
                        background: 'var(--surface-inset)',
                      }}>
                        <div className="row" style={{ marginBottom: 6 }}>
                          <Badge tone="accent">Page {citation.page}</Badge>
                          <Badge>Paragraph {citation.paragraph}</Badge>
                          <span className="faint push">confidence {citation.confidence}</span>
                        </div>
                        <p className="muted" style={{ lineHeight: 1.6 }}>{citation.excerpt}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          <Card title="Indexed" subtitle="Chunked and searchable" flush>
            <Table>
              {documents.map((doc) => (
                <Row key={doc.id} onClick={() => { setChosen(doc.id); setResult(null); }} selected={doc.id === documentId}>
                  <Cell>
                    <CellStack
                      primary={doc.title}
                      secondary={`${doc.kind} · ${doc.page_count} pages · ${doc.chunk_count} chunks`}
                    />
                  </Cell>
                </Row>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
