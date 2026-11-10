import { asc, eq, inArray } from "drizzle-orm";
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
  // Код товара — артикул варианта или товара (если товар ещё есть в каталоге)
  const vIds = o.items.map((i) => i.variantId).filter((x): x is string => !!x);
  const skus = vIds.length
    ? await db
        .select({ id: s.productVariant.id, v: s.productVariant.sku, p: s.product.sku })
        .from(s.productVariant)
        .innerJoin(s.product, eq(s.product.id, s.productVariant.productId))
        .where(inArray(s.productVariant.id, vIds))
    : [];
  const code = (variantId: string | null) => {
    const r = skus.find((x) => x.id === variantId);
    return r?.v || r?.p || "";
  };
  const rows = [
    ...o.items.map((i) => ({ name: i.name, code: code(i.variantId), qty: i.quantity, unit: "шт", price: i.price, sum: i.price * i.quantity })),
    ...(o.shippingCost > 0 ? [{ name: o.deliveryType === "COURIER" ? "Доставка курьером СДЭК" : "Доставка до пункта выдачи СДЭК", code: "", qty: 1, unit: "усл", price: o.shippingCost, sum: o.shippingCost }] : []),
  ];
  const discount = o.discount + o.bundleDiscount + o.bonusSpent;
  const paid = !["AWAITING_PAYMENT", "CANCELLED"].includes(o.status);
  // «В т. ч. НДС 5 %» — считаем сумму НДС; «Без НДС» — пишем как есть
  const rate = Number(b.vatNote.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(",", ".")) || 0;
  const vat = rate > 0 && !/без/i.test(b.vatNote) ? Math.round((o.total * rate) / (100 + rate)) : 0;
  const qtyTotal = rows.reduce((a, r) => a + r.qty, 0);
  const seller = SELLER.name.replace(/^ИП\s+/, "Индивидуальный предприниматель ");
  const longDate = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).format(o.createdAt);

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
              <td colSpan={2} rowSpan={2} style={{ width: "50%" }}>
                {b.bankName || "—"}
                <div className="invoice__cap">Банк получателя</div>
              </td>
              <td style={{ width: "8%" }}>БИК</td>
              <td style={{ width: "24%" }}>{b.bik || "—"}</td>
              <td rowSpan={4} className="invoice__qrcell">
                {qr ? (
                  <>
                    <div className="invoice__qr" dangerouslySetInnerHTML={{ __html: qr }} />
                    <span>Отсканируйте для оплаты</span>
                  </>
                ) : null}
              </td>
            </tr>
            <tr>
              <td>Сч. №</td>
              <td>{b.corrAccount || "—"}</td>
            </tr>
            <tr>
              <td>ИНН {SELLER.inn}</td>
              <td>КПП</td>
              <td rowSpan={2}>Сч. №</td>
              <td rowSpan={2}>{b.account || "—"}</td>
            </tr>
            <tr>
              <td colSpan={2}>
                {seller}
                <div className="invoice__cap">Получатель</div>
              </td>
            </tr>
          </tbody>
        </table>

        <h1 className="invoice__title">
          Счёт на оплату № {o.number} от {longDate}
        </h1>

        <table className="invoice__parties">
          <tbody>
            <tr>
              <td>
                Поставщик
                <div className="invoice__cap">(исполнитель):</div>
              </td>
              <td>
                <b>
                  {seller}, ИНН {SELLER.inn}, ОГРНИП {SELLER.ogrnip}, {SELLER.legalAddress}
                  {b.phone ? `, тел.: ${b.phone}` : ""}
                </b>
              </td>
            </tr>
            <tr>
              <td>
                Покупатель
                <div className="invoice__cap">(заказчик):</div>
              </td>
              <td>
                <b>
                  {org?.name ?? o.customerName}
                  {org ? `, ИНН ${org.inn}${org.kpp ? `, КПП ${org.kpp}` : ""}${org.legalAddress ? `, ${org.legalAddress}` : ""}` : ""}
                </b>
              </td>
            </tr>
            <tr>
              <td>Основание:</td>
              <td>
                <b>Заказ № {o.number} на сайте abramov.shop</b>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="invoice__items">
          <thead>
            <tr>
              <th>№</th>
              <th>Товар (Услуга)</th>
              <th>Код</th>
              <th>Кол-во</th>
              <th>Ед.</th>
              <th>Цена</th>
              <th>Сумма</th>
            </tr>
            <tr className="invoice__colnums">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <td key={n}>{n}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.code}</td>
                <td className="num">{num(r.qty)}</td>
                <td>{r.unit}</td>
                <td className="num">{money(r.price)}</td>
                <td className="num">{money(r.sum)}</td>
              </tr>
            ))}
            <tr className="invoice__sumrow">
              <td colSpan={3} />
              <td className="num">{num(qtyTotal)}</td>
              <td colSpan={2} />
              <td className="num">{money(rows.reduce((a, r) => a + r.sum, 0))}</td>
            </tr>
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
              <td>
                <b>Итого:</b>
              </td>
              <td className="num">
                <b>{money(o.total)}</b>
              </td>
            </tr>
            <tr>
              <td>
                <b>{vat ? `В том числе НДС ${String(rate).replace(".", ",")}%:` : b.vatNote}</b>
              </td>
              <td className="num">
                <b>{vat ? money(vat) : "—"}</b>
              </td>
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
          Всего наименований {rows.length}, на сумму {money(o.total)} руб.
          <br />
          <b>{rublesInWords(o.total)}</b>
        </p>
        <div className="invoice__terms">
          <div>Оплата данного счёта означает согласие с условиями поставки товара (оферта: abramov.shop/p/offer).</div>
          <div>
            В назначении платежа укажите: «{invoicePurpose(o, b.vatNote)}».
            {o.expiresAt && o.status === "AWAITING_PAYMENT" && <> Счёт действителен до {fmtDate(o.expiresAt)} — до этой даты товар зарезервирован.</>}
          </div>
          <div>Отгрузка — на следующий день после поступления денег на расчётный счёт Поставщика: доставкой СДЭК или самовывозом из клуба.</div>
        </div>
        <div className="invoice__sign">
          <div className="invoice__signrow">
            <b>Предприниматель</b>
            <span className="invoice__signcell">
              {b.signatureUrl && <img src={b.signatureUrl} alt="" className="invoice__signimg" />}
              <span className="invoice__line" />
              <span className="invoice__cap">подпись</span>
            </span>
            <span className="invoice__signcell invoice__signcell--wide">
              <span className="invoice__line invoice__line--text">{shortName(SELLER.name)}</span>
              <span className="invoice__cap">расшифровка подписи</span>
            </span>
          </div>
          <div className="invoice__mp">
            <span>М.П.</span>
            {b.stampUrl && <img src={b.stampUrl} alt="" className="invoice__stamp" />}
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
