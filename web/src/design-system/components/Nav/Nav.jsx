import { Link } from 'react-router-dom';
import styles from './Nav.module.css';

export function Tabs({ value, onChange, items }) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={`${styles.tab} ${value === item.value ? styles.tabOn : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Breadcrumbs = ({ items = [] }) => (
  <nav className={styles.crumbs} aria-label="Breadcrumb">
    {items.map((item, i) => (
      <span key={item.label} className="row" style={{ gap: 6 }}>
        {i > 0 && <span className={styles.sep}>/</span>}
        {item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}
      </span>
    ))}
  </nav>
);
