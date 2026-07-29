import styles from './Button.module.css';

/**
 * One button. Variants are visual only — every one of them is a <button> or an
 * <a>, keyboard reachable, with the same focus treatment.
 */
export function Button({
  variant = 'default',
  size = 'md',
  loading = false,
  block = false,
  iconOnly = false,
  as: Tag = 'button',
  className = '',
  children,
  ...rest
}) {
  const classes = [
    styles.button,
    styles[variant],
    size !== 'md' && styles[size],
    block && styles.block,
    iconOnly && styles.iconOnly,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag className={classes} disabled={Tag === 'button' ? rest.disabled || loading : undefined} {...rest}>
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      {children}
    </Tag>
  );
}
