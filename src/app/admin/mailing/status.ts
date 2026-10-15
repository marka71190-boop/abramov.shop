export const CAMPAIGN_STATUS = {
  DRAFT: { text: "черновик", pill: "" },
  SENDING: { text: "отправляется", pill: "pill--warn" },
  DONE: { text: "отправлена", pill: "pill--ok" },
  CANCELLED: { text: "остановлена", pill: "pill--bad" },
} as const;
