import { api } from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import {
  Card, PageHeader, Stat, Badge, Banner, Button, Table, Row, Cell, CellStack,
  EmptyState, SkeletonTable, Select, useToast,
} from '../../design-system';

const PRIORITY_TONE = { urgent: 'danger', normal: 'warning', low: 'neutral' };
const STATUSES = ['open', 'assigned', 'scheduled', 'resolved'];

export default function MaintenancePage() {
  const toast = useToast();
  const { loading, error, data, reload } = useAsync(() => api.maintenance(), []);

  const update = async (id, patch) => {
    try {
      await api.updateTicket(id, patch);
      toast({ tone: 'success', title: 'Ticket updated' });
      reload();
    } catch (err) {
      toast({ tone: 'danger', title: err.message });
    }
  };

  if (loading) return <><PageHeader title="Maintenance" /><Card flush><SkeletonTable rows={5} columns={4} /></Card></>;
  if (error) return <Banner tone="danger">{error.message}</Banner>;

  const { summary, items } = data;

  return (
    <>
      <PageHeader title="Maintenance" lede="Repairs, in the order they should be dealt with" />

      {summary.breaching > 0 && (
        <Banner tone="danger" title={`${summary.breaching} ticket${summary.breaching > 1 ? 's are' : ' is'} past its response target.`}>
          Urgent means somebody is cold, unsafe or without water tonight. The target is 24 hours.
        </Banner>
      )}

      <div className="cols cols-4">
        <Stat label="Open" value={summary.open} note="not yet resolved" />
        <Stat label="Urgent" value={summary.urgent} note="24-hour target" tone={summary.urgent ? 'danger' : undefined} />
        <Stat label="Breaching" value={summary.breaching} note="past target" tone={summary.breaching ? 'warning' : undefined} />
        <Stat label="Resolved" value={summary.resolved} note="closed" />
      </div>

      <Card title="Tickets" subtitle="Urgent first, then oldest" flush>
        {items.length === 0 ? (
          <EmptyState title="Nothing outstanding">
            Tenants can raise these from the client portal once it ships.
          </EmptyState>
        ) : (
          <Table
            columns={[
              { label: 'Issue' },
              { label: 'Property' },
              { label: 'Raised' },
              { label: 'Status', width: 170, align: 'right' },
            ]}
          >
            {items.map((ticket) => (
              <Row key={ticket.id}>
                <Cell>
                  <div className="row" style={{ gap: 8, marginBottom: 3 }}>
                    <Badge tone={PRIORITY_TONE[ticket.priority]} dot>{ticket.priority}</Badge>
                    {ticket.breaching && <Badge tone="danger">past target</Badge>}
                  </div>
                  <CellStack primary={ticket.title} secondary={ticket.detail} />
                </Cell>
                <Cell><CellStack primary={ticket.line1} secondary={ticket.reference} /></Cell>
                <Cell>
                  <CellStack
                    primary={ticket.first_name ? `${ticket.first_name} ${ticket.last_name}` : 'Agency'}
                    secondary={`${ticket.age_hours}h ago`}
                  />
                </Cell>
                <Cell align="right">
                  <Select
                    value={ticket.status}
                    onChange={(event) => update(ticket.id, { status: event.target.value })}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </Select>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
