import styles from './Badge.module.css';

export function Badge({ tone = 'neutral', dot = false, plain = false, children }) {
  return (
    <span className={`${styles.badge} ${styles[tone] || ''} ${plain ? styles.plain : ''}`}>
      {dot && <i className={styles.dot} />}
      {children}
    </span>
  );
}

/** Property status has one canonical colour across the whole product. */
const STATUS = {
  available:   { tone: 'success', label: 'Available' },
  under_offer: { tone: 'warning', label: 'Under offer' },
  let_agreed:  { tone: 'warning', label: 'Let agreed' },
  sold:        { tone: 'info',    label: 'Sold' },
  withdrawn:   { tone: 'neutral', label: 'Withdrawn' },
};

export function StatusBadge({ status }) {
  const config = STATUS[status] || { tone: 'neutral', label: status };
  return <Badge tone={config.tone} dot>{config.label}</Badge>;
}
