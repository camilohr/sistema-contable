import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type Tone = "ok" | "info" | "warn" | "err" | "neutral" | "deudora" | "acreedora" | "mov" | "terc";

const toneClass: Record<Tone, string> = {
  ok: styles.ok,
  info: styles.info,
  warn: styles.warn,
  err: styles.err,
  neutral: styles.neutral,
  deudora: styles.deudora,
  acreedora: styles.acreedora,
  mov: styles.mov,
  terc: styles.terc,
};

export default function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`${styles.badge} ${toneClass[tone]}`}>{children}</span>;
}
