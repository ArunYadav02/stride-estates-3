import { useEffect } from 'react';
import styles from './Overlay.module.css';

function useDismiss(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

function Shell({ open, onClose, title, footer, children, variant = 'modal', wide = false }) {
  useDismiss(open, onClose);
  if (!open) return null;

  const isDrawer = variant === 'drawer';

  return (
    <div
      className={`${styles.scrim} ${isDrawer ? styles.drawerScrim : ''}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        className={`${styles.modal} ${isDrawer ? styles.drawer : ''} ${wide ? styles.wide : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}

export const Modal = (props) => <Shell {...props} variant="modal" />;
export const Drawer = (props) => <Shell {...props} variant="drawer" />;
