import { useState } from 'react';
import { api } from '../../lib/api';
import { Modal, Button, Field, Input, Textarea, Select, Checkbox, Banner, useToast } from '../../design-system';

const BLANK = {
  listing_type: 'let', line1: '', city: 'Hounslow', area: '', postcode: '',
  property_type: 'flat', bedrooms: 2, bathrooms: 1, price: '',
  furnished: 'unfurnished', pets_allowed: false, epc_rating: '',
  available_from: '', description: '', features: '',
};

export default function PropertyForm({ open, onClose, onCreated }) {
  const toast = useToast();
  const [values, setValues] = useState(BLANK);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((current) => ({ ...current, [key]: value }));
  };

  const invalid = (field) => error?.fields?.includes(field);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { property } = await api.createProperty({
        ...values,
        bedrooms: Number(values.bedrooms),
        bathrooms: Number(values.bathrooms),
        price_pence: Math.round(Number(values.price) * 100),
        features: values.features.split(',').map((f) => f.trim()).filter(Boolean),
      });
      toast({ tone: 'success', title: `${property.reference} added`, body: property.line1 });
      setValues(BLANK);
      onCreated?.(property);
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
      title="New instruction"
      wide
      footer={
        <>
          <Button onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy}>Save property</Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error && <Banner tone="danger">{error.message}</Banner>}

        <div className="cols cols-4">
          <Field label="Tenure">
            <Select value={values.listing_type} onChange={set('listing_type')}>
              <option value="let">To let</option>
              <option value="sale">For sale</option>
            </Select>
          </Field>
          <Field label="Type">
            <Select value={values.property_type} onChange={set('property_type')}>
              {['flat', 'terraced', 'semi', 'detached', 'studio'].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>
          </Field>
          <Field label="Bedrooms">
            <Input type="number" min="0" value={values.bedrooms} onChange={set('bedrooms')} invalid={invalid('bedrooms')} />
          </Field>
          <Field label="Bathrooms">
            <Input type="number" min="1" value={values.bathrooms} onChange={set('bathrooms')} />
          </Field>
        </div>

        <div className="cols cols-4">
          <Field label="Address">
            <Input value={values.line1} onChange={set('line1')} invalid={invalid('line1')} placeholder="12 Example Road" />
          </Field>
          <Field label="Area" hint="Used for matching">
            <Input value={values.area} onChange={set('area')} placeholder="Hounslow West" />
          </Field>
          <Field label="Town">
            <Input value={values.city} onChange={set('city')} invalid={invalid('city')} />
          </Field>
          <Field label="Postcode">
            <Input value={values.postcode} onChange={set('postcode')} invalid={invalid('postcode')} placeholder="TW3 1PA" />
          </Field>
        </div>

        <div className="cols cols-4">
          <Field label={values.listing_type === 'let' ? 'Rent (£ pcm)' : 'Asking price (£)'}>
            <Input type="number" value={values.price} onChange={set('price')} invalid={invalid('price_pence')} />
          </Field>
          <Field label="Furnishing">
            <Select value={values.furnished} onChange={set('furnished')}>
              {['unfurnished', 'part', 'furnished'].map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="EPC" optional>
            <Input value={values.epc_rating} onChange={set('epc_rating')} maxLength={2} placeholder="C" />
          </Field>
          <Field label="Available from" optional>
            <Input type="date" value={values.available_from} onChange={set('available_from')} />
          </Field>
        </div>

        <Field label="Features" hint="Comma separated — these feed the matching engine and the listing writer">
          <Input value={values.features} onChange={set('features')} placeholder="garden, parking, ensuite" />
        </Field>

        <Field label="Notes" optional hint="Anything the photographs will not show">
          <Textarea rows={3} value={values.description} onChange={set('description')} />
        </Field>

        <Checkbox label="Pets considered" checked={values.pets_allowed} onChange={set('pets_allowed')} />
      </form>
    </Modal>
  );
}
