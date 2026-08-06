import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface Props {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  pad?: boolean;
  className?: string;
}

export default function Card({ title, actions, children, pad = true, className }: Props) {
  return (
    <section className={`${styles.card} ${pad ? styles.pad : ""} ${className ?? ""}`}>
      {(title || actions) && (
        <header className={styles.header}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
