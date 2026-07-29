import styles from './Table.module.css';

export function Table({ columns = [], children, tight = false }) {
  return (
    <div className={styles.wrap}>
      <table className={`${styles.table} ${tight ? styles.tight : ''}`}>
        {columns.length > 0 && (
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key || column.label} className={column.align === 'right' ? styles.right : ''}
                    style={column.width ? { width: column.width } : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Row = ({ onClick, selected, children }) => (
  <tr
    className={`${onClick ? styles.clickable : ''} ${selected ? styles.selected : ''}`}
    onClick={onClick}
  >
    {children}
  </tr>
);

export const Cell = ({ align, children, ...rest }) => (
  <td className={align === 'right' ? styles.right : ''} {...rest}>{children}</td>
);

/** Two-line cell: the thing, then the context underneath it. */
export const CellStack = ({ primary, secondary }) => (
  <>
    <span className={styles.primary}>{primary}</span>
    {secondary && <span className={styles.secondary}>{secondary}</span>}
  </>
);
