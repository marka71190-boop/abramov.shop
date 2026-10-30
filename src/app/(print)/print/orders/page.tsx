import { asc, inArray } from "drizzle-orm";
import { firstNameOf } from "@/lib/names";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { db, schema as s } from "@/db";
import { fmtDate, fmtDateTime, num, prettyPhone, rub } from "@/lib/format";
import { CHECKLIST } from "@/lib/inspection";
import { qrSvg } from "@/lib/qr";
import { DEFECT_DAYS, QUALITY_DAYS } from "@/lib/returns";
import { getSettings } from "@/lib/settings";
import { SELLER, SITE } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";
import { PrintBar } from "./PrintButton";

export const metadata: Metadata = { title: "Печать заказов" };

type Props = { searchParams: Promise<{ ids?: string; doc?: string; auto?: string }> };

/**
 * Печать: сборочный лист (для склада) и листовка в посылку (для покупателя).
 * ?ids=id1,id2&doc=all|packing|insert
 */
export default async function PrintOrders({ searchParams }: Props) {
  await requireAdmin();
  const { ids = "", doc = "all", auto } = await searchParams;
  const list = ids.split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 100);
  const orders = list.length
    ? await db.query.order.findMany({
        where: inArray(s.order.id, list),
        orderBy: asc(s.order.createdAt),
        with: {
          items: { orderBy: asc(s.orderItem.name), with: { product: { columns: { sku: true }, with: { images: { limit: 1, orderBy: asc(s.productImage.sortOrder) } } } } },
          user: { columns: { name: true } },
          inspection: true,
        },
      })
    : [];
  const variantIds = orders.flatMap((o) => o.items.map((i) => i.variantId)).filter((x): x is string => !!x);
  const variants = variantIds.length
    ? await db.query.productVariant.findMany({ where: inArray(s.productVariant.id, variantIds), columns: { id: true, sku: true } })
    : [];
  const settings = await getSettings();
  const qrs = new Map(
    await Promise.all(
      orders.map(async (o) => [o.id, { order: await qrSvg(`${SITE.url}/order/${o.number}`), admin: await qrSvg(`${SITE.url}/admin/orders/${o.id}`) }] as const),
    ),
  );
  const showPacking = doc === "all" || doc === "packing";
  const showInsert = doc === "all" || doc === "insert";
  const domain = SITE.url.replace(/^https?:\/\//, "");

  return (
    <>
      <PrintBar count={orders.length} auto={auto === "1"} />
      {orders.length === 0 && <p className="no-print" style={{ padding: 24 }}>Заказы не выбраны.</p>}
      {orders.map((o) => {
        const qr = qrs.get(o.id)!;
        const first = firstNameOf(o.customerName || o.user?.name || "");
        const insp = o.inspection;
        return (
          <div key={o.id}>
            {showPacking && (
              <section className="sheet">
                <header className="sheet__head">
                  <div>
                    <div className="sheet__label">Сборочный лист</div>
                    <div className="sheet__number">{o.number}</div>
                    <div className="sheet__muted">
                      Заказ от {fmtDateTime(o.createdAt)}
                      {o.paidAt ? ` · оплачен ${fmtDateTime(o.paidAt)}` : " · не оплачен"}
                    </div>
                  </div>
                  <div className="sheet__qr" dangerouslySetInnerHTML={{ __html: qr.admin }} title="Заказ в админке" />
                </header>

                <div className="sheet__grid">
                  <div>
                    <div className="sheet__label">Получатель</div>
                    <div>{o.customerName}</div>
                    <div>{prettyPhone(o.phone)}</div>
                  </div>
                  <div>
                    <div className="sheet__label">{o.deliveryType === "COURIER" ? "Курьер СДЭК" : "Пункт выдачи СДЭК"}</div>
                    <div>
                      {o.city}
                      {o.address ? `, ${o.address}` : ""}
                    </div>
                    {o.trackNumber && <div className="sheet__muted">Трек {o.trackNumber}</div>}
                  </div>
                </div>

                <table className="sheet__table">
                  <thead>
                    <tr>
                      <th style={{ width: 52 }} />
                      <th>Товар</th>
                      <th>Артикул</th>
                      <th style={{ width: 50 }}>Шт.</th>
                      <th style={{ width: 70 }}>Собрано</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <td>{i.product?.images[0] ? <img src={i.product.images[0].url} alt="" /> : null}</td>
                        <td>
                          {i.name}
                          {i.spec && <div className="small muted" style={{ whiteSpace: "pre-line" }}>{i.spec}</div>}
                        </td>
                        <td>{variants.find((v) => v.id === i.variantId)?.sku ?? i.product?.sku ?? "—"}</td>
                        <td className="sheet__qty">{i.quantity}</td>
                        <td>
                          <span className="box" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="sheet__muted">
                  Всего позиций: {o.items.length}, штук: {o.items.reduce((a, i) => a + i.quantity, 0)} · сумма заказа {rub(o.total)}
                </div>

                {o.comment && (
                  <div className="sheet__note">
                    <b>Комментарий покупателя:</b> {o.comment}
                  </div>
                )}

                <div className="sheet__grid">
                  <div>
                    <div className="sheet__label">Серийный номер</div>
                    <div className="line">{insp?.serialNumber ?? ""}</div>
                  </div>
                  <div>
                    <div className="sheet__label">Номер пломбы</div>
                    <div className="line">{insp?.sealNumber ?? ""}</div>
                  </div>
                </div>

                <div>
                  <div className="sheet__label">Проверка перед упаковкой</div>
                  <ul className="sheet__checks">
                    {CHECKLIST.map((c) => (
                      <li key={c}>
                        <span className={`box${insp?.checklist.includes(c) ? " box--on" : ""}`} /> {c}
                      </li>
                    ))}
                    <li>
                      <span className={`box${insp?.checkedAt ? " box--on" : ""}`} /> Фото и видео загружены в заказ
                    </li>
                    <li>
                      <span className="box" /> Листовка вложена в посылку
                    </li>
                  </ul>
                </div>

                <footer className="sheet__sign">
                  <span>Собрал ________________</span>
                  <span>Проверил ________________</span>
                  <span>Дата ____________</span>
                </footer>
              </section>
            )}

            {showInsert && (
              <section className="sheet sheet--insert">
                <header className="insert__head">
                  <Logo id={`p-${o.id}`} />
                  <div>
                    <div className="insert__brand">ABRAMOV SHOP</div>
                    <div className="sheet__muted">{domain}</div>
                  </div>
                </header>

                <h1 className="insert__title">{first ? `${first}, спасибо за заказ!` : "Спасибо за заказ!"}</h1>
                <p>
                  Заказ <b>{o.number}</b>. Наведите камеру на QR-код — откроется страница заказа: статус, чек, фото и видео проверки товара, возврат и обмен.
                </p>

                <div className="insert__qr">
                  <div dangerouslySetInnerHTML={{ __html: qr.order }} />
                  <div>
                    <div className="sheet__label">Ваш заказ</div>
                    <div>
                      {domain}/order/{o.number}
                    </div>
                    {insp?.checkedAt && (
                      <p className="sheet__muted">
                        Мы лично проверили товар {fmtDate(insp.checkedAt)}
                        {insp.serialNumber ? `, серийный номер ${insp.serialNumber}` : ""}
                        {insp.sealNumber ? `, пломба № ${insp.sealNumber}` : ""}.
                      </p>
                    )}
                  </div>
                </div>

                <div className="insert__cols">
                  <div>
                    <h2>Бонусы</h2>
                    <p>
                      {o.bonusAccrued > 0 ? (
                        <>
                          За этот заказ начислим <b>{num(o.bonusAccrued / 100)}</b> бонусов после получения.{" "}
                        </>
                      ) : null}
                      1 бонус = 1 ₽, ими можно оплатить до {settings.loyalty.maxSpendPercent}% следующего заказа.
                      {settings.loyalty.reviewBonus > 0 && (
                        <>
                          {" "}
                          За отзыв о покупке — ещё <b>{num(settings.loyalty.reviewBonus)}</b> бонусов.
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <h2>Возврат и обмен</h2>
                    <p>
                      Не подошёл — верните в течение {QUALITY_DAYS} дней без следов использования, в упаковке{insp?.sealNumber ? " и с целой пломбой" : ""}.
                      Брак или повреждение — в течение {Math.round(DEFECT_DAYS / 365)} лет. Заявку оформите на странице заказа, рассмотрим за 7 дней.
                    </p>
                  </div>
                </div>

                <div className="insert__tip">
                  Совет: вскройте посылку прямо в пункте СДЭК и проверьте товар. Если упаковка или товар повреждены — попросите сотрудника составить акт.
                </div>

                <footer className="insert__foot">
                  <span>Вопросы — Telegram @{settings.supportTelegram} · {SELLER.email}</span>
                  <span>
                    {SELLER.name}, ИНН {SELLER.inn}
                  </span>
                </footer>
              </section>
            )}
          </div>
        );
      })}
    </>
  );
}
