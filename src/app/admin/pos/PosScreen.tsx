import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { listClubs } from "@/lib/clubs";
import { fmtDateTime, rub } from "@/lib/format";
import { POS_METHODS, type PosMethod } from "@/lib/pos";
import { variantOptions } from "@/lib/stock-moves";
import { getSettings } from "@/lib/settings";
import type { UserRow } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";
import { CancelSale, PosTerminal } from "./PosTerminal";

const STATUS: Record<string, string> = {
  PAID: "оплачено",
  PENDING: "ждём оплату",
  CANCELLED: "отменено",
};

/** Начало сегодняшнего дня по Москве */
function mskToday() {
  const d = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${d}T00:00:00+03:00`);
}

/**
 * Экран кассы: для админки (/admin/pos) и для кассира (/kassa).
 * Кассир не меняет цены, даёт скидку в пределах лимита, видит только свои продажи и не видит прибыль.
 */
export async function PosScreen({
  me,
  admin,
  readonly = false,
}: {
  me: UserRow;
  admin: boolean;
  readonly?: boolean;
}) {
  const from = mskToday();
  const [options, clubs, sales, usedPlaces, settings] = await Promise.all([
    variantOptions(),
    listClubs().catch(() => []),
    db.query.posSale.findMany({
      where: and(
        gte(s.posSale.createdAt, from),
        admin ? undefined : eq(s.posSale.sellerId, me.id),
      ),
      orderBy: desc(s.posSale.createdAt),
      with: { items: true },
    }),
    db
      .selectDistinct({ place: s.posSale.place })
      .from(s.posSale)
      .where(
        and(
          isNotNull(s.posSale.place),
          gte(s.posSale.createdAt, new Date(Date.now() - 90 * 86400_000)),
        ),
      )
      .limit(30),
    getSettings(),
  ]);
  const places = [
    ...new Set([
      ...clubs.map((c) => c.name),
      ...usedPlaces.map((p) => p.place!).filter(Boolean),
    ]),
  ];
  const paid = sales.filter((x) => x.status === "PAID");
  const by = (m: PosMethod) =>
    paid.filter((x) => x.method === m).reduce((a, x) => a + x.total, 0);
  const total = paid.reduce((a, x) => a + x.total, 0);
  const profit = paid.reduce((a, x) => a + x.total - x.cost - x.fee, 0);
  const [{ noCost }] = await db
    .select({ noCost: sql<number>`count(*)::int` })
    .from(s.posSaleItem)
    .innerJoin(s.posSale, eq(s.posSale.id, s.posSaleItem.saleId))
    .where(
      and(
        gte(s.posSale.createdAt, from),
        eq(s.posSale.status, "PAID"),
        sql`${s.posSaleItem.unitCost} is null`,
      ),
    );

  return (
    <>
      <h1>Касса</h1>
      <p className="muted" style={{ margin: 0 }}>
        {admin ? (
          <>
            Продажа вживую — в клубе или на турнире. Товар сразу списывается с
            остатка, продажа попадает в{" "}
            <Link href="/admin/finance">финансы</Link>.
          </>
        ) : (
          "Продажа вживую — товар сразу списывается с остатка."
        )}{" "}
        Наличные: сайт только учитывает продажу, чек пробивайте на своей кассе.
      </p>
      <div className="pos-wrap">
        {!readonly && (
          <section className="panel pos-panel">
            <PosTerminal
              options={options.map((o) => ({
                id: o.id,
                name: o.name,
                sku: o.sku,
                stock: o.stock,
                price: o.price,
                cost: null,
                image: o.image,
              }))}
              places={places}
              ykEnabled={yookassaEnabled()}
              canEditPrice={admin}
              maxDiscountPct={
                admin ? null : settings.finance.cashierMaxDiscount
              }
            />
          </section>
        )}

        <section className="stack" style={{ gap: 12 }}>
          <h2 className="h4" style={{ margin: 0 }}>
            {admin ? "Сегодня" : "Мои продажи сегодня"}
          </h2>
          <div className="stats">
            <div className="stat">
              <div className="muted small">Продано</div>
              <div className="stat__value">{rub(total)}</div>
              <div className="muted small">{paid.length} чек.</div>
            </div>
            <div className="stat">
              <div className="muted small">Наличные</div>
              <div className="stat__value">{rub(by("CASH"))}</div>
            </div>
            <div className="stat">
              <div className="muted small">СБП и карта</div>
              <div className="stat__value">{rub(by("SBP") + by("CARD"))}</div>
            </div>
            {admin && (me.role === "OWNER" || me.role === "DIRECTOR") && (
              <div className="stat">
                <div className="muted small">Прибыль с товара</div>
                <div className="stat__value">{rub(profit)}</div>
                {noCost > 0 && (
                  <div className="small form-error">
                    без закупки: {noCost} поз.
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Когда</th>
                  <th>Товары</th>
                  <th style={{ textAlign: "right" }}>Сумма</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sales.map((x) => (
                  <tr
                    key={x.id}
                    className={
                      x.status === "CANCELLED" ? "is-muted" : undefined
                    }
                  >
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(x.createdAt).slice(-5)}
                      <div className="muted">{x.number}</div>
                    </td>
                    <td className="small">
                      {x.items
                        .map(
                          (i) =>
                            `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`,
                        )
                        .join(", ")}
                      <div className="muted">
                        {POS_METHODS[x.method as PosMethod] ?? x.method}
                        {x.place ? ` · ${x.place}` : ""}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {x.status === "CANCELLED" ? (
                        <s>{rub(x.total)}</s>
                      ) : (
                        rub(x.total)
                      )}
                      <div className="small">
                        {x.status === "PENDING" ? (
                          <span className="pill pill--warn">
                            {STATUS[x.status]}
                          </span>
                        ) : (
                          <span className="muted">
                            {STATUS[x.status] ?? x.status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!readonly &&
                        x.status !== "CANCELLED" &&
                        (admin || x.status === "PENDING") && (
                          <CancelSale
                            id={x.id}
                            paid={x.status === "PAID"}
                            cash={x.method === "CASH"}
                          />
                        )}
                    </td>
                  </tr>
                ))}
                {!sales.length && (
                  <tr>
                    <td colSpan={4} className="muted">
                      Сегодня продаж ещё не было
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Неоплаченный QR отменяется сам через 20 минут — товар возвращается
            на склад.
            {admin ? (
              <>
                {" "}
                Все движения — в{" "}
                <Link href="/admin/stock/history?t=POS">журнале</Link>.
              </>
            ) : (
              " Ошиблись в оплаченной продаже — попросите менеджера отменить её."
            )}
          </p>
        </section>
      </div>
    </>
  );
}
