/** Подпись и цвет статуса сертификата в админке. */
export const STATUS_PILL = (c: { status: string; expiresAt: Date | null; balance: number; refundedAt: Date | null }) => {
  if (c.status === "PENDING") return { text: "ждёт оплату", tone: "pill--warn" };
  if (c.status === "VOID") return { text: c.refundedAt ? "деньги возвращены" : "недействителен", tone: "pill--bad" };
  if (c.expiresAt && c.expiresAt <= new Date()) return { text: "истёк", tone: "pill--bad" };
  if (c.balance <= 0) return { text: "израсходован", tone: "" };
  return { text: "действует", tone: "pill--ok" };
};
