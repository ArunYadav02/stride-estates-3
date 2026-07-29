import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { dateTime, shortDate, relativeDays } from '../../lib/format';
import {
  Card, Stat, PageHeader, Badge, Banner, Table, Row, Cell, CellStack,
  EmptyState, SkeletonTable, Button,
} from '../../design-system';
import { useAsync } from '../../lib/hooks';

export default function DashboardPage() {
  const { loading, error, data } = useAsync(() => api.dashboard(), []);

  if (loading) {
    return (
      <>
        <PageHeader title="Dashboard" lede="What needs you today" />
        <div className="cols cols-4">
          {[0, 1, 2, 3].map((i) => <Card key={i}><SkeletonTable rows={1} columns={1} /></Card>)}
        </div>
        <Card flush><SkeletonTable rows={5} /></Card>
      </>
    );
  }

  if (error) return <Banner tone="danger">{error.message}</Banner>;

  const { counts, upcoming, certificates, activity } = data;
  const overdue = certificates.filter((c) => c.days_remaining < 0);
  const soon = certificates.filter((c) => c.days_remaining >= 0 && c.days_remaining <= 30);

  return (
    <>
      <PageHeader
        title="Dashboard"
        lede="What needs you today"
        actions={<Button as={Link} to="/studio" variant="primary">Write a listing</Button>}
      />

      {(overdue.length > 0 || soon.length > 0) && (
        <Banner
          tone={overdue.length ? 'danger' : 'warning'}
          title={overdue.length
            ? `${overdue.length} certificate${overdue.length > 1 ? 's have' : ' has'} expired.`
            : `${soon.length} certificate${soon.length > 1 ? 's expire' : ' expires'} within 30 days.`}
          actions={<Button as={Link} to="/compliance" size="sm">Open compliance</Button>}
        >
          {overdue.length > 0 && 'A lapsed gas safety certificate is a criminal offence, not an admin slip.'}
        </Banner>
      )}

      <div className="cols cols-4">
        <Stat label="Available" value={counts.available} note="on the market" />
        <Stat label="Progressing" value={counts.under_offer} note="under offer or agreed" />
        <Stat label="Applicants" value={counts.applicants} note="registered and active" />
        <Stat label="Viewings" value={counts.viewings_week} note="booked this week" />
      </div>

      <div className="cols cols-main">
        <Card
          title="Next viewings"
          flush
          actions={<Button as={Link} to="/diary" variant="ghost" size="sm">Open diary</Button>}
        >
          {upcoming.length === 0 ? (
            <EmptyState title="Diary is clear">
              Nothing is booked. Register an applicant and the matching engine will suggest who to call.
            </EmptyState>
          ) : (
            <Table columns={[{ label: 'When' }, { label: 'Property' }, { label: 'Applicant' }]}>
              {upcoming.map((viewing) => (
                <Row key={viewing.id}>
                  <Cell><span className="num">{dateTime(viewing.starts_at)}</span></Cell>
                  <Cell><CellStack primary={viewing.line1} secondary={viewing.reference} /></Cell>
                  <Cell>{viewing.first_name} {viewing.last_name}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Compliance watch" flush>
          {certificates.length === 0 ? (
            <EmptyState title="No certificates recorded" />
          ) : (
            <Table>
              {certificates.slice(0, 6).map((cert, i) => (
                <Row key={i}>
                  <Cell>
                    <CellStack
                      primary={cert.line1}
                      secondary={`${cert.property_reference} · expires ${shortDate(cert.expires_on)}`}
                    />
                  </Cell>
                  <Cell align="right">
                    <Badge tone={cert.days_remaining < 0 ? 'danger' : cert.days_remaining <= 30 ? 'warning' : 'neutral'}>
                      {relativeDays(cert.days_remaining)}
                    </Badge>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card title="Recent activity" flush>
        {activity.length === 0 ? (
          <EmptyState title="Nothing has happened yet" />
        ) : (
          <Table tight>
            {activity.map((item) => (
              <Row key={item.id}>
                <Cell><Badge plain>{item.entity}</Badge></Cell>
                <Cell><span className="strong">{item.action}</span> <span className="muted">{item.detail}</span></Cell>
                <Cell align="right"><span className="faint">{item.user_name} · {shortDate(item.created_at)}</span></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
