import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { money, addressLine, typeLabel, shortDate } from '../../lib/format';
import { useAsync, useDebounced } from '../../lib/hooks';
import {
  Card, PageHeader, StatusBadge, Table, Row, Cell, CellStack,
  SearchInput, Segmented, Button, EmptyState, SkeletonTable, Banner,
} from '../../design-system';
import { IconPlus } from '../../layout/icons';
import PropertyForm from './PropertyForm';

export default function PropertiesPage() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [tenure, setTenure] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);

  const search = useDebounced(term, 250);
  const { loading, error, data, reload } = useAsync(
    () => api.properties({ q: search, listing_type: tenure, status }),
    [search, tenure, status]
  );

  return (
    <>
      <PageHeader
        title="Properties"
        lede="Everything on your books"
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <IconPlus width={14} height={14} /> Add property
          </Button>
        }
      />

      <div className="row-wrap">
        <div style={{ minWidth: 260 }}>
          <SearchInput value={term} onChange={setTerm} placeholder="Address, postcode or reference" />
        </div>
        <Segmented
          ariaLabel="Tenure"
          value={tenure}
          onChange={setTenure}
          options={[
            { value: '', label: 'All' },
            { value: 'let', label: 'Lettings' },
            { value: 'sale', label: 'Sales' },
          ]}
        />
        <Segmented
          ariaLabel="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Any status' },
            { value: 'available', label: 'Available' },
            { value: 'under_offer', label: 'Progressing' },
          ]}
        />
        {data && <span className="faint push">{data.properties.length} shown</span>}
      </div>

      <Card flush>
        {loading ? <SkeletonTable rows={6} columns={5} /> :
         error ? <Banner tone="danger">{error.message}</Banner> :
         data.properties.length === 0 ? (
          <EmptyState
            title="Nothing matches those filters"
            action={<Button onClick={() => { setTerm(''); setTenure(''); setStatus(''); }}>Clear filters</Button>}
          >
            Try a wider search, or add your first instruction.
          </EmptyState>
        ) : (
          <Table
            columns={[
              { label: 'Reference', width: 110 },
              { label: 'Address' },
              { label: 'Type' },
              { label: 'Beds', width: 70 },
              { label: 'Price', align: 'right' },
              { label: 'Status', width: 130 },
              { label: 'Listed', width: 120 },
            ]}
          >
            {data.properties.map((property) => (
              <Row key={property.id} onClick={() => navigate(`/properties/${property.id}`)}>
                <Cell><span className="num muted">{property.reference}</span></Cell>
                <Cell><CellStack primary={property.line1} secondary={addressLine(property)} /></Cell>
                <Cell><span className="muted">{typeLabel[property.property_type]}</span></Cell>
                <Cell><span className="num">{property.bedrooms || '—'}</span></Cell>
                <Cell align="right">
                  <span className="num strong">{money(property.price_pence, { listingType: property.listing_type })}</span>
                </Cell>
                <Cell><StatusBadge status={property.status} /></Cell>
                <Cell><span className="faint">{shortDate(property.created_at)}</span></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <PropertyForm open={adding} onClose={() => setAdding(false)} onCreated={reload} />
    </>
  );
}
