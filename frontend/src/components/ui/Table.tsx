import type { ReactNode } from "react";
import styles from "./Table.module.css";

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  empty?: ReactNode;
  footer?: ReactNode;
  zebra?: boolean;
}

export default function Table<T>({ columns, rows, keyOf, empty, footer, zebra = true }: Props<T>) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={`${styles.th} ${styles[`align-${c.align ?? "left"}`]}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyOf(row)} className={zebra ? undefined : undefined}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`${styles.td} ${styles[`align-${c.align ?? "left"}`]} ${c.mono ? styles.mono : ""}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty ?? "Sin resultados"}
              </td>
            </tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
