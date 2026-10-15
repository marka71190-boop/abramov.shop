import type { Metadata } from "next";

export const metadata: Metadata = { robots: { index: false } };

/** Страницы для печати: белый лист, без шапки и подвала сайта. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-root">{children}</div>;
}
