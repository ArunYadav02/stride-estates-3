import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { money, shortDate } from '../../lib/format';
import {
  Card, PageHeader, Stat, Badge, Banner, Button, Table, Row, Cell, CellStack,
  EmptyState, Skeleton, useToast,
} from '../../design-system';
import ChainRail from './ChainRail';

const POSITION_LABEL = {
  cash: 'Cash', mortgage_agreed: 'Mortgage agreed', needs_mortgage: 'Needs mortgage',
  chain: 'In a chain', chain_free: 'Chain free', tenant: 'Renting',
};

const STATUS_TONE = { accepted: 'success', pending: 'warning', declined: 'neutral', withdrawn: 'neutral' };

export default function SalesPage() {
  const toast = useToast();
  const { loading, error, data, reload } = useAsync(() => api.sales(), []);

  if (loading) return <><PageHeader title="Sales progression" /><Skeleton height={280} radius="var(--radius-md)" /></>;
  if (error) return <Banner tone="danger">{error.message}</Banner>;

  const { summary, chains, offers, milestones } = data;

  const decide = async (id, status) => {
    try {
      await api.updateOffer(id, status);
      toast({ tone: 'success', title: `Offer ${status}` });
      reload();
    } catch (err) {
      toast({ tone: 'danger', title: err.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Sales progression"
        lede="Offer to exchange, chain by chain"
      />

      <Banner tone="accent">
        Around a quarter of agreed sales in England fall through, and almost never because of your own
        link — it is somebody else's, three houses away, that nobody was watching. So the chain is the
        object here, not your instruction.
      </Banner>

      <div className="cols cols-4">
        <Stat label="Sales agreed" value={summary.agreed} note={money(summary.pipeline_pence)} />
        <Stat label="Chains at risk" value={summary.chains_at_risk}
              note="blocked or badly behind" tone={summary.chains_at_risk ? 'warning' : undefined} />
        <Stat label="Ready to exchange" value={summary.ready_to_exchange} note="every link clear" tone="success" />
        <Stat label="Longest running" value={`${summary.longest_days}d`} note="since offer accepted" />
      </div>

      {chains.length === 0 ? (
        <Card><EmptyState title="No chains yet">Accept an offer and a chain is created for it.</EmptyState></Card>
      ) : (
        chains.map((chain) => (
          <Card
            key={chain.id}
            title={chain.name}
            subtitle={`${chain.length} links · ${chain.progress_percent}% through · ${chain.oldest_days} days since the first offer`}
            actions={chain.at_risk
              ? <Badge tone="warning" dot>{chain.blocked_count || 1} link holding everyone up</Badge>
              : <Badge tone="success" dot>Moving</Badge>}
            flush
          >
            {chain.what_to_chase && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-subtle)' }}>
                <p className="label" style={{ marginBottom: 4 }}>What to chase this morning</p>
                <p>{chain.what_to_chase}</p>
              </div>
            )}
            <ChainRail chain={chain} milestones={milestones} />
          </Card>
        ))
      )}

      <Card title="Offers" flush>
        {offers.length === 0 ? <EmptyState title="No offers recorded" /> : (
          <Table
            columns={[
              { label: 'Property' },
              { label: 'Buyer' },
              { label: 'Offer', align: 'right' },
              { label: 'Against asking', align: 'right' },
              { label: 'Position' },
              { label: 'Status', align: 'right' },
            ]}
          >
            {offers.map((offer) => {
              const delta = offer.amount_pence - offer.asking_pence;
              const percent = ((offer.amount_pence / offer.asking_pence) * 100).toFixed(1);
              return (
                <Row key={offer.id}>
                  <Cell><CellStack primary={offer.line1} secondary={offer.reference} /></Cell>
                  <Cell>
                    <CellStack
                      primary={offer.first_name ? `${offer.first_name} ${offer.last_name}` : 'Unnamed buyer'}
                      secondary={shortDate(offer.created_at)}
                    />
                  </Cell>
                  <Cell align="right"><span className="num strong">{money(offer.amount_pence)}</span></Cell>
                  <Cell align="right">
                    <span className="num" style={{ color: delta < 0 ? 'var(--warning)' : 'var(--success)' }}>
                      {percent}%
                    </span>
                    <span className="faint" style={{ display: 'block' }}>
                      {delta < 0 ? `${money(Math.abs(delta))} under` : 'at or above'}
                    </span>
                  </Cell>
                  <Cell><span className="muted">{POSITION_LABEL[offer.position] || '—'}</span></Cell>
                  <Cell align="right">
                    {offer.status === 'pending' ? (
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="primary" onClick={() => decide(offer.id, 'accepted')}>Accept</Button>
                        <Button size="sm" variant="ghost" onClick={() => decide(offer.id, 'declined')}>Decline</Button>
                      </div>
                    ) : (
                      <Badge tone={STATUS_TONE[offer.status]}>{offer.status}</Badge>
                    )}
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
