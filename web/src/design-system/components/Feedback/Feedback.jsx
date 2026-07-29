import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import styles from './Feedback.module.css';

/* ------------------------------- Banner --------------------------------- */

export function Banner({ tone = 'accent', title, children, actions }) {
  return (
    <div className={`${styles.banner} ${styles[`banner-${tone}`] || ''}`}>
      <div className={styles.bannerBody}>
        {title && <strong>{title} </strong>}
        {children}
      </div>
      {actions && <div className={styles.bannerActions}>{actions}</div>}
    </div>
  );
}

/* ------------------------------ EmptyState ------------------------------ */

export function EmptyState({ title, children, action }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
        </svg>
      </span>
      <div>
        {title && <p className={styles.emptyTitle}>{title}</p>}
        {children && <p className={styles.emptyBody}>{children}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------- Skeleton ------------------------------- */

export const Skeleton = ({ width = '100%', height = 14, radius }) => (
  <span
    className={styles.skeleton}
    style={{ width, height, display: 'block', borderRadius: radius }}
    aria-hidden="true"
  />
);

export const SkeletonTable = ({ rows = 5, columns = 4 }) => (
  <div aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }).map((_, r) => (
      <div className={styles.skeletonRow} key={r}>
        {Array.from({ length: columns }).map((__, c) => (
          <Skeleton key={c} width={c === 0 ? '32%' : '18%'} height={13} />
        ))}
      </div>
    ))}
  </div>
);

/* -------------------------------- Toasts -------------------------------- */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((options) => {
    const id = ++counter.current;
    const entry = typeof options === 'string' ? { title: options } : options;
    setToasts((current) => [...current, { id, tone: 'default', ...entry }]);
    window.setTimeout(() => dismiss(id), entry.duration || 4200);
  }, [dismiss]);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toastViewport} role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`${styles.toast} ${styles[`toast-${item.tone}`] || ''}`}>
            <span className={styles.toastMark} />
            <div>
              <p className={styles.toastTitle}>{item.title}</p>
              {item.body && <p className={styles.toastBody}>{item.body}</p>}
            </div>
            <button className={styles.toastClose} onClick={() => dismiss(item.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
