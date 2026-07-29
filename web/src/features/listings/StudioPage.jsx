import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync, useCopy } from '../../lib/hooks';
import { money, addressLine } from '../../lib/format';
import {
  Card, PageHeader, Banner, Button, Field, Select, Input, Badge,
  EmptyState, Skeleton, Tags, useToast,
} from '../../design-system';
import { IconSparkle, IconCopy, IconCheck } from '../../layout/icons';
import styles from './StudioPage.module.css';

const CHANNELS = [
  { key: 'portal', label: 'Portal listing', hint: 'Rightmove, Zoopla, your own site' },
  { key: 'social', label: 'Instagram caption', hint: 'Under 300 characters' },
  { key: 'email', label: 'Applicant email', hint: 'Sent to matched applicants' },
];

export default function StudioPage() {
  const toast = useToast();
  const { copied, copy } = useCopy();
  const [params] = useSearchParams();

  const properties = useAsync(() => api.properties(), []);
  const options = useAsync(() => api.listingOptions(), []);

  const [propertyId, setPropertyId] = useState(params.get('property') || '');
  const [tone, setTone] = useState('balanced');
  const [hints, setHints] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const list = properties.data?.properties || [];
  const selected = list.find((p) => p.id === propertyId) || (propertyId ? null : list[0]);
  const activeId = propertyId || selected?.id || '';

  const generate = async () => {
    if (!activeId) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await api.generateListing({
        property_id: activeId,
        tone,
        hints: hints.split(',').map((h) => h.trim()).filter(Boolean),
      });
      setResult(response);
      if (!response.compliance.passed) {
        toast({
          tone: 'danger',
          title: 'Copy needs a look',
          body: `Contains: ${response.compliance.breaches.join(', ')}`,
        });
      }
    } catch (error) {
      toast({ tone: 'danger', title: 'Generation failed', body: error.message });
    } finally {
      setBusy(false);
    }
  };

  const provider = options.data?.provider;
  const vision = options.data?.vision;

  return (
    <>
      <PageHeader
        title="Listing studio"
        lede="Photographs and facts in, marketing copy out"
      />

      {options.data && (
        <Banner tone={vision ? 'accent' : 'warning'}>
          {vision ? (
            <>Connected to <strong>{provider}</strong>. Photographs are analysed for features, then the copy is written from what was actually seen.</>
          ) : (
            <>Running the <strong>local writer</strong>: real copy from your typed facts and the property record, but photographs are not analysed. Add <code>AI_API_KEY</code> to the API's <code>.env</code> to switch the same pipeline onto a vision model.</>
          )}
        </Banner>
      )}

      <div className="cols cols-main">
        <div className="stack">
          <Card title="1 · Choose the property">
            {properties.loading ? <Skeleton height={40} /> : (
              <div className="stack">
                <Field label="Property">
                  <Select value={activeId} onChange={(e) => { setPropertyId(e.target.value); setResult(null); }}>
                    {list.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.reference} — {property.line1}
                      </option>
                    ))}
                  </Select>
                </Field>

                {selected && (
                  <div className="row-wrap">
                    <Badge tone="accent">{money(selected.price_pence, { listingType: selected.listing_type })}</Badge>
                    <Badge>{selected.bedrooms || 0} bed</Badge>
                    <Badge>{selected.property_type}</Badge>
                    <span className="faint">{addressLine(selected)}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="2 · Pick a tone" subtitle="Same facts, different reader">
            <div className={styles.toneGrid}>
              {(options.data?.tones || []).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.tone} ${tone === option.id ? styles.toneOn : ''}`}
                  onClick={() => setTone(option.id)}
                >
                  <span className={styles.toneName}>{option.id}</span>
                  <span className={styles.toneWhy}>{option.description}</span>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 'var(--space-4)' }}>
              <Field
                label="Extra features"
                optional
                hint="Anything the photographs will not show — comma separated"
              >
                <Input
                  value={hints}
                  onChange={(e) => setHints(e.target.value)}
                  placeholder="new boiler, south-facing garden, chain free"
                />
              </Field>
            </div>
          </Card>

          <div className="row">
            <Button variant="primary" size="lg" onClick={generate} loading={busy} disabled={!activeId}>
              <IconSparkle width={15} height={15} />
              {busy ? 'Writing…' : 'Generate copy'}
            </Button>
            {result && <span className="faint">{result.features.length} features used</span>}
          </div>

          {result && (
            <div className={styles.output}>
              {CHANNELS.map((channel) => {
                const text = channel.key === 'email'
                  ? `Subject: ${result.copy.email_subject}\n\n${result.copy.email}`
                  : result.copy[channel.key];
                return (
                  <div className={styles.channel} key={channel.key}>
                    <div className={styles.channelHead}>
                      <strong>{channel.label}</strong>
                      <span className="faint">{channel.hint}</span>
                      <span className={styles.count}>{text.length} chars</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const ok = await copy(text, channel.key);
                          if (ok) toast({ tone: 'success', title: `${channel.label} copied` });
                        }}
                      >
                        {copied === channel.key
                          ? <><IconCheck width={13} height={13} /> Copied</>
                          : <><IconCopy width={13} height={13} /> Copy</>}
                      </Button>
                    </div>
                    <p className={styles.channelBody}>{text}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="stack">
          <Card title="How this works">
            <div className={styles.pipeline}>
              <Step done={Boolean(result)} active={busy} n="1">
                Look at the photographs and list only what is visible
              </Step>
              <Step done={Boolean(result)} active={busy} n="2">
                Write three drafts using nothing but those features and your facts
              </Step>
              <Step done={Boolean(result)} active={false} n="3">
                Check the result against advertising rules before you see it
              </Step>
            </div>

            <p className="faint" style={{ marginTop: 'var(--space-4)', lineHeight: 1.6 }}>
              Two separate steps, not one prompt. When the copy is wrong you can see immediately
              whether the model mis-saw the room or mis-wrote the sentence.
            </p>
          </Card>

          {result && (
            <>
              <Card title="Compliance check">
                {result.compliance.passed ? (
                  <div className="row" style={{ color: 'var(--success)' }}>
                    <IconCheck width={15} height={15} />
                    <span>No banned phrasing. No invented features.</span>
                  </div>
                ) : (
                  <Banner tone="danger" title="Rewrite before publishing.">
                    Contains {result.compliance.breaches.join(', ')}.
                  </Banner>
                )}
                <p className="faint" style={{ marginTop: 'var(--space-3)', lineHeight: 1.6 }}>
                  The Consumer Protection Regulations apply to property adverts: no misleading
                  omissions, no invented features, nothing that describes the likely occupant.
                  Every generation is checked before it reaches you.
                </p>
              </Card>

              <Card title="What it used">
                <p className="faint" style={{ marginBottom: 'var(--space-3)' }}>{result.extraction_note}</p>
                <Tags items={result.features} />
                <p className="faint" style={{ marginTop: 'var(--space-3)' }}>
                  Written by <strong>{result.provider}</strong>
                  {result.photos_analysed > 0 && ` from ${result.photos_analysed} photographs`}
                  {result.fell_back && ' (the model returned something unusable, so the local writer took over)'}
                </p>
              </Card>
            </>
          )}

          {!result && !busy && (
            <Card flush>
              <EmptyState title="Nothing generated yet">
                Pick a property and a tone, then generate. Copy lands in three formats ready to paste.
              </EmptyState>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const Step = ({ n, done, active, children }) => (
  <div className={styles.step}>
    <span className={`${styles.stepMark} ${done ? styles.stepDone : active ? styles.stepActive : ''}`}>
      {done ? '✓' : n}
    </span>
    <span className={done ? '' : 'muted'}>{children}</span>
  </div>
);
