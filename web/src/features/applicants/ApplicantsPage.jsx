import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import {
  Card, PageHeader, Badge, Table, Row, Cell, CellStack, Meter, Tags,
  EmptyState, SkeletonTable, Banner, Avatar,
} from '../../design-system';

export default function ApplicantsPage() {
  const [selected, setSelected] = useState(null);
  const { loading, error, data } = useAsync(() => api.applicants(), []);

  const applicants = data?.applicants || [];
  const active = selected || applicants[0];

  return (
    <>
      <PageHeader title="Applicants" lede="Who is looking, and what fits them" />

      <div className="cols cols-main">
        <Card title="Registered" flush>
          {loading ? <SkeletonTable rows={6} columns={3} /> :
           error ? <Banner tone="danger">{error.message}</Banner> :
           applicants.length === 0 ? <EmptyState title="Nobody registered yet" /> : (
            <Table columns={[{ label: 'Applicant' }, { label: 'Looking for' }, { label: 'Budget', align: 'right' }]}>
              {applicants.map((applicant) => (
                <Row
                  key={applicant.contact_id}
                  onClick={() => setSelected(applicant)}
                  selected={active?.contact_id === applicant.contact_id}
                >
                  <Cell>
                    <div className="row">
                      <Avatar name={`${applicant.first_name} ${applicant.last_name}`} />
                      <CellStack
                        primary={`${applicant.first_name} ${applicant.last_name}`}
                        secondary={applicant.phone || applicant.email}
                      />
                    </div>
                  </Cell>
                  <Cell>
                    <Badge tone={applicant.listing_type === 'let' ? 'neutral' : 'info'}>
                      {applicant.listing_type === 'let' ? 'renting' : 'buying'}
                    </Badge>
                    <span className="faint" style={{ display: 'block', marginTop: 3 }}>
                      {applicant.min_bedrooms}+ bed · {applicant.areas.join(', ') || 'anywhere'}
                    </span>
                  </Cell>
                  <Cell align="right">
                    <span className="num strong">
                      {money(applicant.max_price_pence, { listingType: applicant.listing_type })}
                    </span>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>

        {active ? <Matches applicant={active} /> : (
          <Card><EmptyState title="Pick an applicant" >Their matches appear here.</EmptyState></Card>
        )}
      </div>
    </>
  );
}

function Matches({ applicant }) {
  const { loading, data } = useAsync(() => api.applicantMatches(applicant.contact_id), [applicant.contact_id]);

  return (
    <Card
      title={`Send to ${applicant.first_name}`}
      subtitle="Ranked with the reasoning, so you can say why on the phone"
      flush
    >
      {loading ? <SkeletonTable rows={4} columns={2} /> :
       (data?.matches || []).length === 0 ? (
        <EmptyState title="Nothing fits right now">
          Their criteria are stricter than the current stock. They stay registered — new instructions
          are matched automatically.
        </EmptyState>
      ) : (
        <Table>
          {data.matches.map((match) => (
            <Row key={match.property.id}>
              <Cell>
                <Link to={`/properties/${match.property.id}`} className="strong">
                  {match.property.line1}
                </Link>
                <span className="faint" style={{ display: 'block' }}>
                  {match.property.reference} · {match.property.bedrooms} bed ·{' '}
                  {money(match.property.price_pence, { listingType: match.property.listing_type })}
                </span>
                <div style={{ marginTop: 6 }}><Tags items={match.reasons} /></div>
              </Cell>
              <Cell align="right"><Meter score={match.score} /></Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}
