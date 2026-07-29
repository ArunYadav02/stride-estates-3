import { api } from '../../lib/api';
import { shortDate, relativeDays } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import {
  Card, PageHeader, Stat, Badge, Banner, Table, Row, Cell, CellStack,
  EmptyState, SkeletonTable,
} from '../../design-system';

const TONE = { expired: 'danger', urgent: 'warning', soon: 'neutral', ok: 'success' };

export default function CompliancePage() {
  const { loading, error, data } = useAsync(() => api.compliance(), []);

  if (loading) return <><PageHeader title="Compliance" /><Card flush><SkeletonTable rows={6} columns={5} /></Card></>;
  if (error) return <Banner tone="danger">{error.message}</Banner>;

  const { summary, items } = data;

  return (
    <>
      <PageHeader title="Compliance" lede="Certificates and the dates they lapse" />

      {summary.expired > 0 && (
        <Banner tone="danger" title={`${summary.expired} certificate${summary.expired > 1 ? 's have' : ' has'} expired.`}>
          A property let without a valid gas safety certificate is a criminal offence, and it blocks
          a Section 21 notice. Deal with these before anything else on your desk.
        </Banner>
      )}

      <div className="cols cols-4">
        <Stat label="Expired" value={summary.expired} note="act today" tone={summary.expired ? 'danger' : undefined} />
        <Stat label="Within 30 days" value={summary.urgent} note="book the renewal" tone={summary.urgent ? 'warning' : undefined} />
        <Stat label="Within 90 days" value={summary.soon} note="on the horizon" />
        <Stat label="In date" value={summary.ok} note="nothing to do" />
      </div>

      <Card title="Every certificate" subtitle="Soonest first" flush>
        {items.length === 0 ? <EmptyState title="No certificates recorded yet" /> : (
          <Table
            columns={[
              { label: 'Property' },
              { label: 'Certificate' },
              { label: 'Reference' },
              { label: 'Expires' },
              { label: 'Status', align: 'right' },
            ]}
          >
            {items.map((item) => (
              <Row key={item.id}>
                <Cell><CellStack primary={item.line1} secondary={`${item.property_reference} · ${item.postcode}`} /></Cell>
                <Cell>{item.label}</Cell>
                <Cell><span className="num muted">{item.reference || '—'}</span></Cell>
                <Cell><span className="num">{shortDate(item.expires_on)}</span></Cell>
                <Cell align="right">
                  <Badge tone={TONE[item.severity]} dot={item.severity !== 'ok'}>
                    {relativeDays(item.days_remaining)}
                  </Badge>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
