import { asc, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { db, schema as s } from "@/db";
import { fmtDate, prettyPhone } from "@/lib/format";
import { countryText } from "@/lib/foreign";
import { getSettings } from "@/lib/settings";
import { SELLER } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";
import { receiptLines } from "@/lib/yookassa";
import { guessCustoms } from "@/lib/customs";
import { PrintBar } from "../orders/PrintButton";

export const metadata: Metadata = { title: "Инвойс для таможни" };

type Props = { searchParams: Promise<{ ids?: string | string[]; copies?: string; auto?: string }> };

/** Название страны по-английски: по коду, а для вписанной вручную — ищем код по русскому названию */
function countryEn(code: string, nameRu: string) {
  const en = new Intl.DisplayNames(["en"], { type: "region" });
  if (code !== "XX") return en.of(code) ?? nameRu;
  const ru = new Intl.DisplayNames(["ru"], { type: "region" });
  const want = nameRu.trim().toLowerCase();
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const c = String.fromCharCode(a, b);
      try {
        const n = ru.of(c);
        if (n && n !== c && n.toLowerCase() === want) return en.of(c) ?? nameRu;
      } catch {}
    }
  return nameRu;
}

const money = (kop: number) => (kop / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kg = (g: number) => (g / 1000).toLocaleString("ru-RU", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const hasCyrillic = (v: string) => /[а-яё]/i.test(v);

/**
 * Инвойс (commercial invoice) для заказов за рубеж, которые отправляем Почтой России.
 * В нём всё, что нужно для таможенной декларации CN 23: описание по-английски, код ТН ВЭД,
 * страна производства, количество, вес и стоимость. ?ids=id1,id2&copies=2
 */
export default async function CustomsInvoice({ searchParams }: Props) {
  await requireAdmin();
  const { ids = "", copies = "1", auto } = await searchParams;
  // ids=a,b из ссылки или ids=a&ids=b из формы с галочками
  const list = [ids]
    .flat()
    .flatMap((x) => x.split(","))
    .filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 50);
  const n = Math.min(3, Math.max(1, Number(copies) || 1));
  const [orders, settings] = await Promise.all([
    list.length
      ? db.query.order.findMany({
          where: inArray(s.order.id, list),
          orderBy: asc(s.order.createdAt),
          with: { items: { orderBy: asc(s.orderItem.name), with: { product: { columns: { nameEn: true, hsCode: true, originCountry: true, weightGrams: true } } } } },
        })
      : Promise.resolve([]),
    getSettings(),
  ]);
  const b2b = settings.b2b;

  const sheets = await Promise.all(
    orders.map(async (o) => {
      const countryRu = await countryText(o.country, o.countryName);
      const country = countryEn(o.country, countryRu);
      // Стоимость товара — сколько покупатель реально заплатил (после скидок), без доставки и сбора
      const shares = receiptLines(
        o.items.map((i) => ({ name: i.name, price: i.price, quantity: i.quantity })),
        o.total - o.shippingCost - o.foreignFee,
        0,
      );
      const rows = o.items.map((i) => {
        const amount = shares.filter((l) => l.name === i.name).reduce((a, l) => a + l.price * l.quantity, 0) || i.price * i.quantity;
        const weight = (i.product?.weightGrams ?? 300) * i.quantity;
        // Пустые таможенные поля товара — подставляем по названию (кий, мел, наклейки…)
        const guess = guessCustoms(i.name);
        return {
          id: i.id,
          ru: i.name,
          en: i.product?.nameEn || guess.nameEn || "",
          hs: i.product?.hsCode || guess.hsCode || "",
          origin: i.product?.originCountry ?? "",
          qty: i.quantity,
          weight,
          unit: Math.round(amount / i.quantity),
          amount,
        };
      });
      const goods = rows.reduce((a, r) => a + r.amount, 0);
      const weight = rows.reduce((a, r) => a + r.weight, 0);
      const address = [o.address, o.city, o.postalCode, country].filter(Boolean).join(", ");
      const missing = [
        ...rows.filter((r) => !r.en).map((r) => `нет названия по-английски: ${r.ru}`),
        ...rows.filter((r) => !r.hs).map((r) => `нет кода ТН ВЭД: ${r.ru}`),
        ...rows.filter((r) => !r.origin).map((r) => `нет страны производства: ${r.ru}`),
        ...(hasCyrillic(`${o.address ?? ""} ${o.city ?? ""}`) ? ["адрес получателя написан кириллицей — для международной посылки нужен латиницей"] : []),
        ...(o.deliveryType !== "MANUAL" ? ["это заказ СДЭК — инвойс Почты для него обычно не нужен"] : []),
      ];
      return { o, country, countryRu, rows, goods, weight, address, missing };
    }),
  );

  return (
    <>
      <PrintBar count={orders.length} auto={auto === "1"} />
      {orders.length === 0 && <p className="no-print" style={{ padding: 24 }}>Заказы не выбраны.</p>}
      {sheets.map(({ o, country, rows, goods, weight, address, missing }) =>
        Array.from({ length: n }, (_, copy) => (
          <div key={`${o.id}-${copy}`} className="sheet invoice customs">
            {copy === 0 && missing.length > 0 && (
              <div className="invoice__warn no-print">
                Заполните перед печатью ({o.number}): {missing.join("; ")}. Таможенные поля товара — в карточке товара → «Для таможни».
              </div>
            )}
            <h1 className="invoice__title">
              COMMERCIAL INVOICE № {o.number} · {fmtDate(o.paidAt ?? o.createdAt)}
              <div className="customs__sub">Инвойс № {o.number} от {fmtDate(o.paidAt ?? o.createdAt)}</div>
            </h1>

            <table className="customs__parties">
              <tbody>
                <tr>
                  <td>
                    <div className="invoice__cap">Sender / Отправитель</div>
                    <b>{SELLER.nameEn}</b>
                    <div className="customs__ru">{SELLER.name}</div>
                    <div>INN / ИНН {SELLER.inn}</div>
                    <div>{SELLER.actualAddressEn}</div>
                    <div className="customs__ru">{SELLER.actualAddress}</div>
                    <div>
                      {b2b.phone ? `${b2b.phone} · ` : ""}
                      {SELLER.email}
                    </div>
                  </td>
                  <td>
                    <div className="invoice__cap">Recipient / Получатель</div>
                    <b>{o.customerName}</b>
                    <div>{address}</div>
                    <div>
                      {prettyPhone(o.phone)}
                      {o.email ? ` · ${o.email}` : ""}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            <table className="invoice__items customs__items">
              <thead>
                <tr>
                  <th>№</th>
                  <th>
                    Description of goods
                    <br />
                    <small>Описание товара</small>
                  </th>
                  <th>
                    HS code
                    <br />
                    <small>Код ТН ВЭД</small>
                  </th>
                  <th>
                    Origin
                    <br />
                    <small>Страна</small>
                  </th>
                  <th>
                    Qty
                    <br />
                    <small>Кол-во</small>
                  </th>
                  <th>
                    Net weight, kg
                    <br />
                    <small>Вес нетто</small>
                  </th>
                  <th>
                    Unit price, RUB
                    <br />
                    <small>Цена</small>
                  </th>
                  <th>
                    Amount, RUB
                    <br />
                    <small>Сумма</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="num">{i + 1}</td>
                    <td>
                      {r.en ? <b>{r.en}</b> : <b className="customs__empty">—</b>}
                      <div className="customs__ru">{r.ru}</div>
                    </td>
                    <td className="num">{r.hs || <span className="customs__empty">—</span>}</td>
                    <td style={{ textAlign: "center" }}>{r.origin || <span className="customs__empty">—</span>}</td>
                    <td className="num">{r.qty}</td>
                    <td className="num">{kg(r.weight)}</td>
                    <td className="num">{money(r.unit)}</td>
                    <td className="num">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <table className="invoice__totals">
              <tbody>
                <tr>
                  <td>Total value of goods / Стоимость товаров:</td>
                  <td>
                    <b>{money(goods)} RUB</b>
                  </td>
                </tr>
                <tr>
                  <td>Postage / Доставка:</td>
                  <td>{money(o.shippingCost)} RUB</td>
                </tr>
                <tr>
                  <td>Total net weight / Вес нетто:</td>
                  <td>{kg(weight)} kg</td>
                </tr>
                <tr>
                  <td>Number of items / Мест товара:</td>
                  <td>{rows.reduce((a, r) => a + r.qty, 0)}</td>
                </tr>
              </tbody>
            </table>

            <div className="invoice__terms">
              <div>Reason for export / Цель отправки: Sale of goods / Продажа товара</div>
              <div>Destination country / Страна назначения: {country}</div>
              <div>Currency / Валюта: RUB (Russian rouble)</div>
              {o.trackNumber && <div>Tracking number / Трек-номер: {o.trackNumber}</div>}
            </div>

            <p style={{ margin: 0, fontSize: 11.5 }}>
              I hereby certify that the information on this invoice is true and correct and the contents of this shipment are as stated above.
              <br />
              Подтверждаю, что сведения в инвойсе верны и содержимое отправления соответствует описанию.
            </p>

            <div className="invoice__sign">
              <div className="invoice__signrow">
                <span>Signature / Подпись</span>
                <span className="invoice__signcell">
                  {b2b.signatureUrl && <img className="invoice__signimg" src={b2b.signatureUrl} alt="" />}
                  <span className="invoice__line" />
                </span>
                <span className="invoice__signcell invoice__signcell--wide">
                  <span className="invoice__line invoice__line--text">{SELLER.name.replace(/^ИП\s+/, "")}</span>
                </span>
                <span>Date / Дата: {fmtDate(new Date())}</span>
              </div>
            </div>
          </div>
        )),
      )}
    </>
  );
}
