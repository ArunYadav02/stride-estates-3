import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { IconSearch } from './icons';
import styles from './CommandPalette.module.css';

const PAGES = [
  { id: 'nav-dashboard', label: 'Dashboard', to: '/', group: 'Go to' },
  { id: 'nav-properties', label: 'Properties', to: '/properties', group: 'Go to' },
  { id: 'nav-applicants', label: 'Applicants', to: '/applicants', group: 'Go to' },
  { id: 'nav-diary', label: 'Diary & viewings', to: '/diary', group: 'Go to' },
  { id: 'nav-compliance', label: 'Compliance', to: '/compliance', group: 'Go to' },
  { id: 'nav-maintenance', label: 'Maintenance', to: '/maintenance', group: 'Go to' },
  { id: 'nav-documents', label: 'Document search', to: '/documents', group: 'Go to' },
  { id: 'nav-studio', label: 'Listing studio', to: '/studio', group: 'Go to' },
];

/**
 * ⌘K. Navigation and search over everything on the books, in one box.
 * The data is fetched once when the palette first opens and reused, because an
 * agency's stock list is small and a request per keystroke is rude.
 */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTerm('');
    setCursor(0);
    window.setTimeout(() => inputRef.current?.focus(), 10);

    if (!index) {
      Promise.all([api.properties(), api.applicants()])
        .then(([properties, applicants]) => setIndex({
          properties: properties.properties,
          applicants: applicants.applicants,
        }))
        .catch(() => setIndex({ properties: [], applicants: [] }));
    }
  }, [open, index]);

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();

    const pages = PAGES.filter((page) => !needle || page.label.toLowerCase().includes(needle));

    const properties = (index?.properties || [])
      .filter((property) => !needle || [property.reference, property.line1, property.postcode, property.area]
        .filter(Boolean).some((value) => value.toLowerCase().includes(needle)))
      .slice(0, 6)
      .map((property) => ({
        id: `p-${property.id}`,
        label: property.line1,
        sub: `${property.reference} · ${property.bedrooms} bed · ${money(property.price_pence, { listingType: property.listing_type })}`,
        to: `/properties/${property.id}`,
        group: 'Properties',
      }));

    const applicants = (index?.applicants || [])
      .filter((applicant) => needle && `${applicant.first_name} ${applicant.last_name}`.toLowerCase().includes(needle))
      .slice(0, 5)
      .map((applicant) => ({
        id: `a-${applicant.contact_id}`,
        label: `${applicant.first_name} ${applicant.last_name}`,
        sub: `${applicant.min_bedrooms}+ bed up to ${money(applicant.max_price_pence, { listingType: applicant.listing_type })}`,
        to: '/applicants',
        group: 'Applicants',
      }));

    return [...properties, ...applicants, ...pages];
  }, [term, index]);

  useEffect(() => setCursor(0), [term]);

  if (!open) return null;

  const choose = (item) => {
    navigate(item.to);
    onClose();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') return onClose();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => Math.min(results.length - 1, c + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    }
    if (event.key === 'Enter' && results[cursor]) {
      event.preventDefault();
      choose(results[cursor]);
    }
  };

  let lastGroup = null;

  return (
    <div className={styles.scrim} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Search">
        <div className={styles.inputRow}>
          <IconSearch width={17} height={17} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            className={styles.input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search properties, applicants, or jump to a page…"
          />
        </div>

        <div className={styles.results}>
          {results.length === 0 ? (
            <p className={styles.none}>Nothing matches “{term}”.</p>
          ) : (
            results.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header && <p className={`label ${styles.group}`}>{header}</p>}
                  <button
                    type="button"
                    className={`${styles.item} ${i === cursor ? styles.itemOn : ''}`}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(item)}
                  >
                    <span>
                      {item.label}
                      {item.sub && <span className={styles.itemSub}>{item.sub}</span>}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className={styles.footer}>
          <span><span className={styles.key}>↑↓</span>navigate</span>
          <span><span className={styles.key}>↵</span>open</span>
          <span><span className={styles.key}>esc</span>close</span>
        </div>
      </div>
    </div>
  );
}
