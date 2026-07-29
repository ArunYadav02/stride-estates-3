// Money is pence everywhere in the system and becomes pounds exactly here.

export const money = (pence, { listingType, compact = false } = {}) => {
  const value = Number(pence || 0) / 100;
  const text = value.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
    notation: compact && value >= 100000 ? 'compact' : 'standard',
  });
  return listingType === 'let' ? `${text} pcm` : text;
};

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const dayMonth = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export const time = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

export const dateTime = (iso) => (iso ? `${dayMonth(iso)}, ${time(iso)}` : '—');

export const relativeDays = (days) => {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `${days} days`;
};

export const addressLine = (property) =>
  [property.area, property.city, property.postcode].filter(Boolean).join(' · ');

export const typeLabel = {
  flat: 'Flat', terraced: 'Terraced', semi: 'Semi-detached',
  detached: 'Detached', studio: 'Studio',
};
