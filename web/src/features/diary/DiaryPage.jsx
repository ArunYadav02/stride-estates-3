import { useState } from 'react';
import { api } from '../../lib/api';
import { dateTime, dayMonth, time } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import {
  Card, PageHeader, Badge, Button, Field, Select, Input, Table, Row, Cell, CellStack,
  EmptyState, SkeletonTable, Banner, Modal, useToast, Tabs,
} from '../../design-system';
import { IconPlus } from '../../layout/icons';

export default function DiaryPage() {
  const toast = useToast();
  const [booking, setBooking] = useState(false);
  const [tab, setTab] = useState('upcoming');
  const { loading, error, data, reload } = useAsync(() => api.viewings(), []);

  const viewings = data?.viewings || [];
  const now = new Date().toISOString();
  const upcoming = viewings.filter((v) => v.starts_at >= now && v.status === 'booked');
  const past = viewings.filter((v) => v.starts_at < now || v.status !== 'booked').reverse();
  const shown = tab === 'upcoming' ? upcoming : past;

  const setStatus = async (id, status) => {
    try {
      await api.updateViewing(id, { status });
      toast({ tone: 'success', title: `Marked ${status.replace('_', ' ')}` });
      reload();
    } catch (err) {
      toast({ tone: 'danger', title: err.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Diary"
        lede="Viewings across the team"
        actions={
          <Button variant="primary" onClick={() => setBooking(true)}>
            <IconPlus width={14} height={14} /> Book viewing
          </Button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { value: 'past', label: 'Past & closed', count: past.length },
        ]}
      />

      <Card flush>
        {loading ? <SkeletonTable rows={5} columns={4} /> :
         error ? <Banner tone="danger">{error.message}</Banner> :
         shown.length === 0 ? (
          <EmptyState title={tab === 'upcoming' ? 'Diary is clear' : 'Nothing here yet'}>
            {tab === 'upcoming' && 'Book a viewing and it appears here. Clashes are rejected automatically.'}
          </EmptyState>
        ) : (
          <Table columns={[{ label: 'When', width: 190 }, { label: 'Property' }, { label: 'Applicant' }, { label: '', align: 'right' }]}>
            {shown.map((viewing) => (
              <Row key={viewing.id}>
                <Cell>
                  <CellStack
                    primary={<span className="num">{dayMonth(viewing.starts_at)}</span>}
                    secondary={`${time(viewing.starts_at)} · ${viewing.negotiator || 'unassigned'}`}
                  />
                </Cell>
                <Cell><CellStack primary={viewing.line1} secondary={`${viewing.reference} · ${viewing.postcode}`} /></Cell>
                <Cell><CellStack primary={`${viewing.first_name} ${viewing.last_name}`} secondary={viewing.phone} /></Cell>
                <Cell align="right">
                  {viewing.status === 'booked' && viewing.starts_at >= now ? (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <Button size="sm" onClick={() => setStatus(viewing.id, 'attended')}>Attended</Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(viewing.id, 'cancelled')}>Cancel</Button>
                    </div>
                  ) : (
                    <Badge tone={viewing.status === 'no_show' ? 'danger' : viewing.status === 'attended' ? 'success' : 'neutral'}>
                      {viewing.status.replace('_', ' ')}
                    </Badge>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <BookingModal open={booking} onClose={() => setBooking(false)} onBooked={reload} />
    </>
  );
}

function BookingModal({ open, onClose, onBooked }) {
  const toast = useToast();
  const properties = useAsync(() => api.properties({ status: 'available' }), []);
  const applicants = useAsync(() => api.applicants(), []);
  const [form, setForm] = useState({ property_id: '', contact_id: '', date: '', time: '10:00' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createViewing({
        property_id: form.property_id,
        contact_id: form.contact_id,
        starts_at: new Date(`${form.date}T${form.time}`).toISOString(),
      });
      toast({ tone: 'success', title: 'Viewing booked' });
      onBooked();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book a viewing"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Book</Button>
        </>
      }
    >
      <div className="stack">
        {error && <Banner tone="danger">{error.message}</Banner>}

        <Field label="Property">
          <Select value={form.property_id} onChange={set('property_id')}>
            <option value="">Choose…</option>
            {(properties.data?.properties || []).map((property) => (
              <option key={property.id} value={property.id}>{property.reference} — {property.line1}</option>
            ))}
          </Select>
        </Field>

        <Field label="Applicant">
          <Select value={form.contact_id} onChange={set('contact_id')}>
            <option value="">Choose…</option>
            {(applicants.data?.applicants || []).map((applicant) => (
              <option key={applicant.contact_id} value={applicant.contact_id}>
                {applicant.first_name} {applicant.last_name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="cols cols-2">
          <Field label="Date"><Input type="date" value={form.date} onChange={set('date')} /></Field>
          <Field label="Time" hint="A clash with the same negotiator is rejected">
            <Input type="time" value={form.time} onChange={set('time')} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
