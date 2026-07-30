import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { money, dateTime } from '../../lib/format';
import {
  Card, PageHeader, Badge, Banner, Button, Field, Input, Select, Modal,
  EmptyState, SkeletonTable, Skeleton, useToast,
} from '../../design-system';
import styles from './ConciergePage.module.css';

const READABLE = {
  budget_pence: 'Budget',
  timeline: 'Timing',
  position: 'Position',
  name: 'Name',
  booked_slot: 'Viewing',
  note: 'Note',
};

const POSITION_LABEL = {
  cash: 'Cash buyer',
  mortgage_agreed: 'Mortgage agreed',
  needs_mortgage: 'Needs a mortgage',
  chain: 'Has something to sell',
  chain_free: 'Chain free',
  tenant: 'Currently renting',
};

const PROMPTS = [
  'Can I just book a viewing on Saturday?',
  "Not sure yet, depends what's out there",
  'Around £1,700 a month',
  'Hoping to move next month',
  "I'm chain free, nothing to sell",
  'Can I speak to an actual person?',
  'My landlord is evicting us',
  'Do you have anything in Manchester?',
];

export default function ConciergePage() {
  const toast = useToast();
  const list = useAsync(() => api.conversations(), []);
  const meta = useAsync(() => api.conciergeMeta(), []);
  const [activeId, setActiveId] = useState(null);
  const [starting, setStarting] = useState(false);

  const conversations = list.data?.conversations || [];
  const currentId = activeId || conversations[0]?.id;

  return (
    <>
      <PageHeader
        title="Lead concierge"
        lede="Answers portal enquiries in seconds, at any hour — without being allowed to improvise"
        actions={<Button variant="primary" onClick={() => setStarting(true)}>Simulate an enquiry</Button>}
      />

      {meta.data && (
        <Banner tone={meta.data.provider === 'local' ? 'warning' : 'accent'}>
          {meta.data.provider === 'local' ? (
            <>Running the <strong>scripted concierge</strong>: the state machine, fact extraction, guardrails
            and diary booking are all live — only the phrasing is templated. Add <code>AI_API_KEY</code> and the
            model writes the wording instead. Everything else is unchanged, by design.</>
          ) : (
            <>Wording written by <strong>{meta.data.provider}</strong>. The state machine, the fact validation and
            the booking are still enforced in code — the model only ever proposes.</>
          )}
        </Banner>
      )}

      {list.data && (
        <div className="cols cols-4">
          <Stat label="Live" value={list.data.summary.live} />
          <Stat label="Viewings booked" value={list.data.summary.booked} tone="success" />
          <Stat label="Passed to a person" value={list.data.summary.escalated} tone={list.data.summary.escalated ? 'warning' : undefined} />
          <Stat label="Needed care" value={list.data.summary.sensitive} tone={list.data.summary.sensitive ? 'danger' : undefined} />
        </div>
      )}

      <div className={styles.layout}>
        <Card title="Enquiries" flush>
          {list.loading ? <SkeletonTable rows={4} columns={1} /> :
           conversations.length === 0 ? <EmptyState title="No enquiries yet" /> : (
            <div className={styles.list}>
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`${styles.item} ${conversation.id === currentId ? styles.itemOn : ''}`}
                  onClick={() => setActiveId(conversation.id)}
                >
                  <span className={styles.itemTop}>
                    <span className={styles.handle}>{conversation.handle}</span>
                    {conversation.sensitive ? <Badge tone="danger">care</Badge>
                      : conversation.escalated ? <Badge tone="warning">person</Badge>
                      : conversation.state === 'BOOKED' ? <Badge tone="success">booked</Badge>
                      : <Badge tone="accent" dot>live</Badge>}
                  </span>
                  <span className="faint">{conversation.source} · {conversation.line1 || 'general'}</span>
                  <span className={styles.preview}>{conversation.last_message}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {currentId ? (
          <Thread key={currentId} id={currentId} onChanged={list.reload} toast={toast} states={meta.data?.states} />
        ) : (
          <Card><EmptyState title="Pick an enquiry" /></Card>
        )}
      </div>

      <StartEnquiry
        open={starting}
        onClose={() => setStarting(false)}
        onStarted={(id) => { setActiveId(id); list.reload(); }}
      />
    </>
  );
}

/* ----------------------------- one thread ------------------------------- */

function Thread({ id, onChanged, toast, states = [] }) {
  const { loading, data, reload } = useAsync(() => api.conversation(id), [id]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const conversation = data?.conversation;
  const messages = data?.messages || [];

  const send = async (text) => {
    const body = (text ?? draft).trim();
    if (!body) return;
    setSending(true);
    try {
      const result = await api.sendConciergeMessage(id, body);
      setDraft('');
      if (result.booked) toast({ tone: 'success', title: 'Viewing booked', body: result.booked.label });
      if (result.sensitive) toast({ tone: 'danger', title: 'Passed to a person', body: 'This one needed care, not automation.' });
      reload();
      onChanged();
    } catch (error) {
      toast({ tone: 'danger', title: error.message });
    } finally {
      setSending(false);
    }
  };

  const takeOver = async () => {
    await api.conciergeHandover(id, 'Taken over from the concierge');
    toast({ tone: 'success', title: 'You own this conversation now' });
    reload();
    onChanged();
  };

  if (loading) return <Card><Skeleton height={320} /></Card>;

  const terminal = conversation.state === 'HANDOVER' || conversation.state === 'BOOKED';
  const activeIndex = states.findIndex((s) => s.id === conversation.state);

  return (
    <>
      <Card
        title={conversation.handle}
        subtitle={`${conversation.source} · ${data.property ? data.property.line1 : 'no property attached'}`}
        actions={!conversation.escalated && (
          <Button size="sm" onClick={takeOver}>Take over</Button>
        )}
        flush
      >
        {conversation.sensitive && (
          <div style={{ padding: 'var(--space-3) var(--space-4)' }}>
            <Banner tone="danger" title="Automation stopped.">
              {conversation.escalation_reason}. Nothing further is sent automatically on this thread.
            </Banner>
          </div>
        )}

        <div className={styles.thread}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.turn} ${
                message.role === 'enquirer' ? styles.fromEnquirer
                : message.role === 'system' ? styles.fromSystem
                : styles.fromAssistant
              }`}
            >
              <div className={styles.bubble}>{message.body}</div>
              {message.reason && <span className={styles.why}>{message.reason}</span>}
              {message.guardrail?.problems && (
                <div className={styles.blocked}>
                  <strong>Guardrail: </strong>
                  {message.guardrail.problems.join('; ')}
                  {message.guardrail.discarded && (
                    <div style={{ marginTop: 4, opacity: 0.85 }}>
                      Discarded: “{message.guardrail.discarded}”
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!terminal ? (
          <div className={styles.composer}>
            <div className={styles.composerRow}>
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && send()}
                placeholder="Reply as the enquirer…"
              />
              <Button variant="primary" onClick={() => send()} loading={sending}>Send</Button>
            </div>
            <div className="row-wrap">
              {PROMPTS.map((prompt) => (
                <Button key={prompt} size="sm" onClick={() => send(prompt)} disabled={sending}>{prompt}</Button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.note}>
            {conversation.state === 'BOOKED'
              ? 'Viewing booked and written to the diary. Anything else on this thread goes to the office in the morning.'
              : 'A person owns this conversation. The concierge will not send anything else.'}
          </div>
        )}
      </Card>

      <div className={styles.side} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <Card title="Conversation state" flush>
          <div className={styles.machine}>
            {states.filter((s) => s.id !== 'HANDOVER').map((state, index) => (
              <div
                key={state.id}
                className={`${styles.step} ${
                  activeIndex > index ? styles.stepDone : activeIndex === index ? styles.stepNow : ''
                }`}
              >
                <span className={styles.stepMark}>{activeIndex > index ? '✓' : index + 1}</span>
                {state.label}
              </div>
            ))}
            {conversation.state === 'HANDOVER' && (
              <div className={`${styles.step} ${styles.stepNow} ${styles.stepTerminal}`}>
                <span className={styles.stepMark}>!</span>
                Passed to a person
              </div>
            )}
          </div>
          <p className={styles.note}>
            The server owns this machine. It advances one step only when the fact that step exists to
            collect has been captured and validated — the model cannot move it, however well the
            conversation is going.
          </p>
        </Card>

        <Card title="Captured" flush>
          {Object.keys(conversation.facts).length === 0 ? (
            <EmptyState title="Nothing verified yet" />
          ) : (
            <div className={styles.facts}>
              {Object.entries(conversation.facts).map(([key, value]) => (
                <div className={styles.fact} key={key}>
                  <span className="label">{READABLE[key] || key}</span>
                  <span className={styles.factValue}>
                    {key === 'budget_pence' ? money(value)
                      : key === 'position' ? POSITION_LABEL[value] || value
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {data.slots.length > 0 && (
          <Card title="Offered slots" subtitle="Real gaps in the live diary" flush>
            <div className={styles.facts}>
              {data.slots.map((slot) => (
                <div className={styles.fact} key={slot.iso}>
                  <span>{slot.label}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

/* ------------------------- start a new enquiry -------------------------- */

function StartEnquiry({ open, onClose, onStarted }) {
  const properties = useAsync(() => api.properties({ status: 'available' }), []);
  const [form, setForm] = useState({ handle: '07700 900550', property_id: '', source: 'Rightmove', message: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const first = properties.data?.properties?.[0];
    if (first && !form.property_id) setForm((f) => ({ ...f, property_id: first.id }));
  }, [properties.data, form.property_id]);

  const submit = async () => {
    setBusy(true);
    try {
      const { conversation_id: id } = await api.startConversation(form);
      onStarted(id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Simulate an inbound enquiry"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Start</Button>
        </>
      }
    >
      <div className="stack">
        <Banner tone="accent">
          In production this endpoint is a portal webhook, not a button. The flow is identical.
        </Banner>
        <Field label="Their number or email">
          <Input value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} />
        </Field>
        <Field label="Property enquired about">
          <Select value={form.property_id} onChange={(e) => setForm((f) => ({ ...f, property_id: e.target.value }))}>
            {(properties.data?.properties || []).map((property) => (
              <option key={property.id} value={property.id}>{property.reference} — {property.line1}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}>
            {['Rightmove', 'Zoopla', 'OnTheMarket', 'Agency website', 'SMS'].map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </Select>
        </Field>
        <Field label="Their first message" optional>
          <Input
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Is this still available?"
          />
        </Field>
      </div>
    </Modal>
  );
}

/* Small local stat, so the page does not depend on the dashboard's layout. */
function Stat({ label, value, tone }) {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 4 }}>
        <span className="label">{label}</span>
        <span style={{
          fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)',
          letterSpacing: 'var(--tracking-tighter)', lineHeight: 1.1,
          color: tone ? `var(--${tone})` : undefined,
        }}>{value}</span>
      </div>
    </Card>
  );
}
