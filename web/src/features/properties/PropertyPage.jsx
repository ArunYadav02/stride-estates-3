import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { money, shortDate, dateTime, addressLine, typeLabel } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import {
  Card, Badge, StatusBadge, Banner, Button, Segmented, Table, Row, Cell, CellStack,
  EmptyState, Meter, Tags, KeyValue, KeyValueGrid, Skeleton, useToast, Breadcrumbs,
} from '../../design-system';
import { IconSparkle } from '../../layout/icons';
import PhotoManager from './PhotoManager';

const STATUSES = (listingType) => [
  { value: 'available', label: 'Available' },
  { value: 'under_offer', label: 'Under offer' },
  { value: listingType === 'let' ? 'let_agreed' : 'sold', label: listingType === 'let' ? 'Let agreed' : 'Sold' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export default function PropertyPage() {
  const { id } = useParams();
  const toast = useToast();
  const { loading, error, data, reload } = useAsync(() => api.property(id), [id]);
  const matches = useAsync(() => api.propertyMatches(id), [id]);
  const [saving, setSaving] = useState(false);

  if (loading) return <Skeleton height={280} radius="var(--radius-md)" />;
  if (error) return <Banner tone="danger">{error.message}</Banner>;

  const { property, certificates, viewings, documents } = data;

  const changeStatus = async (status) => {
    setSaving(true);
    try {
      await api.setPropertyStatus(property.id, status);
      toast({ tone: 'success', title: 'Status updated' });
      reload();
    } catch (err) {
      toast({ tone: 'danger', title: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Breadcrumbs items={[{ label: 'Properties', to: '/properties' }, { label: property.reference }]} />

      <div className="row-wrap">
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)' }}>{property.line1}</h1>
          <p className="muted">{addressLine(property)}</p>
        </div>
        <div className="push row">
          <StatusBadge status={property.status} />
          <Button as={Link} to={`/studio?property=${property.id}`} variant="primary" size="sm">
            <IconSparkle width={14} height={14} /> Write the listing
          </Button>
        </div>
      </div>

      <div className="row-wrap">
        <Segmented
          ariaLabel="Property status"
          value={property.status}
          onChange={changeStatus}
          options={STATUSES(property.listing_type)}
        />
        {saving && <span className="faint">Saving…</span>}
      </div>

      <div className="cols cols-main">
        <div className="stack">
          <Card title="Photographs" subtitle="First photograph is the primary image">
            <PhotoManager propertyId={property.id} />
          </Card>

          <Card title="Details">
            <KeyValueGrid columns={3}>
              <KeyValue label="Price" value={money(property.price_pence, { listingType: property.listing_type })} />
              <KeyValue label="Tenure" value={property.listing_type === 'let' ? 'To let' : 'For sale'} />
              <KeyValue label="Type" value={typeLabel[property.property_type]} />
              <KeyValue label="Bedrooms" value={property.bedrooms || 'Studio'} />
              <KeyValue label="Bathrooms" value={property.bathrooms} />
              <KeyValue label="Furnishing" value={property.furnished || '—'} />
              <KeyValue label="EPC" value={property.epc_rating || '—'} />
              <KeyValue label="Available" value={property.available_from ? shortDate(property.available_from) : '—'} />
              <KeyValue label="Pets" value={property.pets_allowed ? 'Considered' : 'Not permitted'} />
            </KeyValueGrid>

            {property.features.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <p className="label" style={{ marginBottom: 6 }}>Features</p>
                <Tags items={property.features} />
              </div>
            )}

            {property.description && (
              <p className="muted" style={{ marginTop: 'var(--space-4)', lineHeight: 1.65 }}>
                {property.description}
              </p>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card title="Who to call" subtitle="Ranked, with the reasoning" flush>
            {matches.loading ? <Skeleton height={90} /> :
             matches.data?.matches.length === 0 ? (
              <EmptyState title="No matches yet">
                Nobody registered fits this property. Register applicants and they appear here automatically.
              </EmptyState>
            ) : (
              <Table>
                {(matches.data?.matches || []).map((match) => (
                  <Row key={match.applicant.contact_id}>
                    <Cell>
                      <CellStack primary={match.applicant.name} secondary={match.applicant.phone} />
                      <div style={{ marginTop: 6 }}>
                        <Tags items={match.reasons.slice(0, 2)} />
                      </div>
                    </Cell>
                    <Cell align="right"><Meter score={match.score} /></Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Certificates" flush>
            {certificates.length === 0 ? <EmptyState title="None recorded" /> : (
              <Table tight>
                {certificates.map((cert) => (
                  <Row key={cert.id}>
                    <Cell>
                      <CellStack
                        primary={<span className="capitalise">{cert.kind.replace(/_/g, ' ')}</span>}
                        secondary={cert.reference}
                      />
                    </Cell>
                    <Cell align="right"><span className="num faint">{shortDate(cert.expires_on)}</span></Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Viewing history" flush>
            {viewings.length === 0 ? <EmptyState title="No viewings yet" /> : (
              <Table tight>
                {viewings.map((viewing) => (
                  <Row key={viewing.id}>
                    <Cell>
                      <CellStack
                        primary={`${viewing.first_name} ${viewing.last_name}`}
                        secondary={dateTime(viewing.starts_at)}
                      />
                    </Cell>
                    <Cell align="right">
                      <Badge tone={viewing.status === 'no_show' ? 'danger' : viewing.status === 'attended' ? 'success' : 'neutral'}>
                        {viewing.status.replace('_', ' ')}
                      </Badge>
                    </Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          {documents.length > 0 && (
            <Card title="Documents" flush>
              <Table tight>
                {documents.map((doc) => (
                  <Row key={doc.id}>
                    <Cell><CellStack primary={doc.title} secondary={`${doc.page_count} pages · ${doc.kind}`} /></Cell>
                    <Cell align="right"><Button as={Link} to="/documents" size="sm" variant="ghost">Ask</Button></Cell>
                  </Row>
                ))}
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
