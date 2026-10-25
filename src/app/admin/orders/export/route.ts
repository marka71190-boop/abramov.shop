/** GET /admin/orders/export?days=30 — заказы за период в CSV для Excel. */
import { and, desc, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { orderStatus } from "@/lib/order-status";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  let t = v == null ? "" : String(v);
  // Имя, адрес и комментарий пишет покупатель: «=…», «+…», «-…», «@…» Excel выполнил бы как формулу
  if (/^[=+\-@\t\r]/.test(t) && !/^[+-]?\d[\d\s.,]*$/.test(t)) t = `'${t}`; // телефон +7… и суммы — не формулы
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const money = (k: number) => (k / 100).toFixed(2).replace(".", ",");
const msk = (d: Date | null) => (d ? new Date(+d + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "");

export async function GET(request: Request) {
  // Выгрузка всех заказов с телефонами и адресами — только владелец
  if ((await getViewer())?.role !== "OWNER") return new Response("Нет доступа", { status: 403 });
  const days = Math.min(3650, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const from = new Date(Date.now() - days * 86400_000);
  const rows = await db.query.order.findMany({
    where: and(gte(s.order.createdAt, from)),
    orderBy: desc(s.order.createdAt),
    with: { items: true, promo: { columns: { code: true } } },
  });
  const head = ["Номер", "Создан", "Оплачен", "Статус", "Покупатель", "Телефон", "Почта", "Город", "Адрес", "Доставка", "Трек", "Товары", "Сумма товаров", "Скидка", "Промокод", "Бонусами", "Доставка, ₽", "Итого"];
  const lines = rows.map((o) =>
    [
      o.number,
      msk(o.createdAt),
      msk(o.paidAt),
      orderStatus(o.status, o.deliveryType).text,
      o.customerName,
      o.phone,
      o.email,
      o.city,
      o.address,
      o.deliveryType === "COURIER" ? "Курьер" : "ПВЗ",
      o.trackNumber,
      o.items.map((i) => `${i.name} × ${i.quantity}`).join("; "),
      money(o.subtotal),
      money(o.discount + o.bundleDiscount),
      o.promo?.code,
      money(o.bonusSpent),
      money(o.shippingCost),
      money(o.total),
    ]
      .map(cell)
      .join(";"),
  );
  const csv = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="abramov-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
