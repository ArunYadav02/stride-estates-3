import styles from './Form.module.css';

export function Field({ label, hint, error, optional, htmlFor, children }) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={`label ${styles.label}`} htmlFor={htmlFor}>
          {label}
          {optional && <span className={styles.optional}>optional</span>}
        </label>
      )}
      {children}
      {error ? <span className={styles.error}>{error}</span>
             : hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}

export const Input = ({ invalid, className = '', ...rest }) => (
  <input className={`${styles.control} ${invalid ? styles.invalid : ''} ${className}`} {...rest} />
);

export const Textarea = ({ invalid, className = '', ...rest }) => (
  <textarea className={`${styles.control} ${invalid ? styles.invalid : ''} ${className}`} {...rest} />
);

export const Select = ({ invalid, className = '', children, ...rest }) => (
  <span className={styles.selectWrap}>
    <select className={`${styles.control} ${invalid ? styles.invalid : ''} ${className}`} {...rest}>
      {children}
    </select>
  </span>
);

export const Checkbox = ({ label, ...rest }) => (
  <label className={styles.checkbox}>
    <input type="checkbox" {...rest} />
    {label}
  </label>
);

export function Segmented({ value, onChange, options, ariaLabel }) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`${styles.segment} ${value === option.value ? styles.segmentOn : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', ...rest }) {
  return (
    <span className={styles.search}>
      <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        className={styles.control}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
    </span>
  );
}
