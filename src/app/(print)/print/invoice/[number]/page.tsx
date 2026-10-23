import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtDate, num, rub } from "@/lib/format";
import { invoicePurpose, invoiceQrText, rublesInWords } from "@/lib/invoice";
import { qrSvg } from "@/lib/qr";
import { getSettings } from "@/lib/settings";
import { SELLER } from "@/lib/site";
import { getViewer, isAdmin } from "@/lib/viewer";
import { InvoiceBar } from "./InvoiceBar";

export const metadata: Metadata = { title: "Счёт на оплату", robots: { index: false } };

type Props = { params: Promise<{ number: string }>; searchParams: Promise<{ auto?: string }> };

/** Счёт на оплату для организации: печать или «Сохранить как PDF» */
export default async function InvoicePage({ params, searchParams }: Props) {
  const [{ number }, { auto }] = await Promise.all([params, searchParams]);
  const me = await getViewer();
  if (!me) redirect(`/login?next=${encodeURIComponent(`/print/invoice/${number}`)}`);
  const o = await db.query.order.findFirst({ where: eq(s.order.number, number), with: { items: { orderBy: asc(s.orderItem.name) } } });
  if (!o || o.paymentMethod !== "INVOICE") notFound();
  const mine = o.userId === me.id || (!!o.organizationId && me.organizationId === o.organizationId) || isAdmin(me);
  if (!mine) notFound();
  const org = o.organizationId ? await db.query.organization.findFirst({ where: eq(s.organization.id, o.organizationId) }) : null;
  const settings = await getSettings();
  const b = settings.b2b;
  const bankReady = !!(b.account && b.bik && b.bankName);
  const qr = bankReady ? await qrSvg(invoiceQrText(o, b)) : null;
  const rows = [
    ...o.items.map((i) => ({ name: i.name, qty: i.quantity, unit: "шт.", price: i.price, sum: i.price * i.quantity })),
    ...(o.shippingCost > 0 ? [{ name: o.deliveryType === "COURIER" ? "Доставка курьером СДЭК" : "Доставка до пункта выдачи СДЭК", qty: 1, unit: "усл.", price: o.shippingCost, sum: o.shippingCost }] : []),
  ];
  const discount = o.discount + o.bundleDiscount + o.bonusSpent;
  const paid = !["AWAITING_PAYMENT", "CANCELLED"].includes(o.status);

  return (
    <>
      <InvoiceBar auto={auto === "1"} />
      <div className="sheet invoice">
        {!bankReady && <div className="invoice__warn no-print">Реквизиты банка не заполнены: Админка → Настройки → «Опт и счета».</div>}
        {o.status === "CANCELLED" && <div className="invoice__warn">Заказ отменён — счёт недействителен.</div>}
        {paid && <div className="invoice__ok">Оплачен {o.paidAt ? fmtDate(o.paidAt) : ""}</div>}
        <table className="invoice__bank">
          <tbody>
            <tr>
              <td colSpan={2} rowSpan={2} style={{ width: "58%" }}>
                {b.bankName || "—"}
                <div className="invoice__cap">Банк получателя</div>
              </td>
              <td style={{ width: "10%" }}>БИК</td>
              <td>{b.bik || "—"}</td>
            </tr>
            <tr>
              <td>Сч. №</td>
              <td>{b.corrAccount || "—"}</td>
            </tr>
            <tr>
              <td>ИНН {SELLER.inn}</td>
              <td>КПП —</td>
              <td rowSpan={2}>Сч. №</td>
              <td rowSpan={2}>{b.account || "—"}</td>
            </tr>
            <tr>
              <td colSpan={2}>
                {SELLER.name}
                <div className="invoice__cap">Получатель</div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="invoice__title-row">
          <h1 className="invoice__title">
            Счёт на оплату № {o.number} от {fmtDate(o.createdAt)}
          </h1>
          {qr && (
            <div className="invoice__qr">
              <div dangerouslySetInnerHTML={{ __html: qr }} />
              <span>Оплата по QR в приложении банка</span>
            </div>
          )}
        </div>

        <table className="invoice__parties">
          <tbody>
            <tr>
              <td>Поставщик:</td>
              <td>
                <b>{SELLER.name}</b>, ИНН {SELLER.inn}, ОГРНИП {SELLER.ogrnip}, {SELLER.legalAddress}
              </td>
            </tr>
            <tr>
              <td>Покупатель:</td>
              <td>
                <b>{org?.name ?? o.customerName}</b>
                {org ? `, ИНН ${org.inn}${org.kpp ? `, КПП ${org.kpp}` : ""}${org.legalAddress ? `, ${org.legalAddress}` : ""}` : ""}
              </td>
            </tr>
            <tr>
              <td>Основание:</td>
              <td>Заказ {o.number}</td>
            </tr>
          </tbody>
        </table>

        <table className="invoice__items">
          <thead>
            <tr>
              <th>№</th>
              <th>Товары (работы, услуги)</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Цена</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td className="num">{num(r.qty)}</td>
                <td>{r.unit}</td>
                <td className="num">{money(r.price)}</td>
                <td className="num">{money(r.sum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="invoice__totals">
          <tbody>
            {discount > 0 && (
              <tr>
                <td>Скидка:</td>
                <td className="num">−{money(discount)}</td>
              </tr>
            )}
            <tr>
              <td>Итого:</td>
              <td className="num">{money(o.total)}</td>
            </tr>
            <tr>
              <td>{b.vatNote}</td>
              <td className="num">{/без/i.test(b.vatNote) ? "—" : ""}</td>
            </tr>
            <tr>
              <td>
                <b>Всего к оплате:</b>
              </td>
              <td className="num">
                <b>{money(o.total)}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ margin: 0 }}>
          Всего наименований {rows.length}, на сумму {rub(o.total)}
          <br />
          <b>{rublesInWords(o.total)}</b>
        </p>
        <p className="sheet__muted" style={{ margin: 0 }}>
          Назначение платежа: «{invoicePurpose(o, b.vatNote)}».
          {o.expiresAt && o.status === "AWAITING_PAYMENT" && (
            <>
              {" "}
              Счёт действителен до {fmtDate(o.expiresAt)} — до этой даты товар зарезервирован.
            </>
          )}
        </p>
        <div className="invoice__sign">
          <div>
            Предприниматель <span className="invoice__line" /> {shortName(SELLER.name)}
          </div>
        </div>
      </div>
    </>
  );
}

const money = (kop: number) => (kop / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «ИП Абрамова Алина Гургеновна» → «Абрамова А. Г.» */
function shortName(full: string) {
  const [last, first, middle] = full.replace(/^ИП\s+/, "").split(/\s+/);
  return [last, first ? `${first[0]}.` : "", middle ? `${middle[0]}.` : ""].filter(Boolean).join(" ");
}
