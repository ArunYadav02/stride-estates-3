import styles from './Card.module.css';

export function Card({ title, subtitle, actions, flush = false, className = '', children }) {
  return (
    <section className={`${styles.card} ${className}`}>
      {(title || actions) && (
        <header className={styles.header}>
          {title && (
            <div>
              <h2 className={styles.title}>{title}</h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={`${styles.body} ${flush ? styles.flush : ''}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, tone }) {
  return (
    <div className={`${styles.card} ${styles.stat} ${tone ? styles[`tone-${tone}`] : ''}`}>
      <span className="label">{label}</span>
      <span className={styles.statValue}>{value}</span>
      {note && <span className={styles.statNote}>{note}</span>}
    </div>
  );
}

export function PageHeader({ title, lede, actions }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        {lede && <p className={styles.pageLede}>{lede}</p>}
      </div>
      {actions && <div className={styles.actions} style={{ marginLeft: 'auto' }}>{actions}</div>}
    </header>
  );
}
