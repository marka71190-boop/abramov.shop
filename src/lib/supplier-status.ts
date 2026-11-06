/** Статусы заказа поставщику — для списка и карточки */
export const SO_STATUS: Record<string, { text: string; tone: string }> = {
  DRAFT: { text: "черновик", tone: "" },
  ORDERED: { text: "заказали — ждём", tone: "pill--warn" },
  RECEIVED: { text: "принят на склад", tone: "pill--ok" },
  CANCELLED: { text: "отменён", tone: "" },
};
