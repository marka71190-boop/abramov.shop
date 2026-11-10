import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { clubTitle } from "@/lib/club-label";
import { listClubs } from "@/lib/clubs";
import { fmtDateTime, rub } from "@/lib/format";
import { methodLabel, type PosMethod } from "@/lib/pos";
import { variantOptions } from "@/lib/stock-moves";
import { getSettings } from "@/lib/settings";
import { seesMoney, type UserRow } from "@/lib/viewer";
import { yookassaEnabled } from "@/lib/yookassa";
import { currentShift, expectedCash, shiftTotals } from "@/lib/pos-shifts";
import { saleLocation } from "@/lib/club-stock";
import { pinApprovers } from "@/lib/pin";
import { pendingApprovalsCount } from "@/lib/pos-approval";
import { countClubs } from "@/lib/stock-count";
import { CancelSale, PosTerminal, ShiftPanel } from "./PosTerminal";
import { ReturnPanel } from "./ReturnPanel";
import { GiftSell } from "./GiftSell";
import { PickupPanel } from "./PickupPanel";
import { pickupQueue } from "@/lib/pickup";

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
export async function PosScreen({ me, admin, readonly = false, returnNumber = "" }: { me: UserRow; admin: boolean; readonly?: boolean; returnNumber?: string }) {
  const from = mskToday();
  // Остатки: у клуба смены свой учёт — показываем остаток клуба, иначе склад
  const shift = readonly ? null : await currentShift(me.id);
  const loc = await saleLocation(shift?.clubId);
  const [options, clubs, sales, usedPlaces, settings, approvers] = await Promise.all([
    variantOptions(loc),
    listClubs().catch(() => []),
    db.query.posSale.findMany({
      where: and(gte(s.posSale.createdAt, from), admin ? undefined : eq(s.posSale.sellerId, me.id)),
      orderBy: desc(s.posSale.createdAt),
      with: { items: true },
    }),
    db
      .selectDistinct({ place: s.posSale.place })
      .from(s.posSale)
      .where(and(isNotNull(s.posSale.place), gte(s.posSale.createdAt, new Date(Date.now() - 90 * 86400_000))))
      .limit(30),
    getSettings(),
    admin ? Promise.resolve(null) : pinApprovers(),
  ]);
  // Клубы продавца: кассир, закреплённый за клубами, — только они; остальные — любой клуб или турнир
  const fixed = !admin && me.clubIds.length > 0;
  const sellerClubs = (fixed ? clubs.filter((c) => me.clubIds.includes(c.id)) : clubs).map((c) => ({ id: c.id, title: clubTitle(c) }));
  const clubTitles = new Set(clubs.map((c) => clubTitle(c)));
  const places = [...new Set(usedPlaces.map((p) => p.place!).filter((p) => p && !clubTitles.has(p)))];
  const paid = sales.filter((x) => x.status === "PAID");
  const by = (m: PosMethod) => paid.filter((x) => x.method === m).reduce((a, x) => a + x.total, 0);
  const total = paid.reduce((a, x) => a + x.total, 0);
  const profit = paid.reduce((a, x) => a + x.total - x.cost - x.fee, 0);
  const shiftT = shift ? await shiftTotals(shift.id) : null;
  const [{ noCost }] = await db
    .select({ noCost: sql<number>`count(*)::int` })
    .from(s.posSaleItem)
    .innerJoin(s.posSale, eq(s.posSale.id, s.posSaleItem.saleId))
    .where(and(gte(s.posSale.createdAt, from), eq(s.posSale.status, "PAID"), sql`${s.posSaleItem.unitCost} is null`));

  const waiting = admin ? await pendingApprovalsCount(me.id).catch(() => 0) : 0;
  // Заказы с сайта к выдаче: кассиру — его клубов (или клуба смены), админу — все
  const pickupClubIds = admin ? null : me.clubIds.length ? me.clubIds : shift?.clubId ? [shift.clubId] : [];
  const pickups = readonly ? [] : await pickupQueue(pickupClubIds).catch(() => []);
  // Ревизия с телефона кассы — в клубах со своим учётом остатков
  const canCount = !admin && !readonly && (await countClubs(me.clubIds.length ? me.clubIds : null).catch(() => [])).length > 0;

  return (
    <>
      {waiting > 0 && (
        <Link href="/admin/pos/approvals" className="notice" style={{ display: "block", borderColor: "var(--c-gold)" }}>
          <b>Касса ждёт вашего подтверждения{waiting > 1 ? ` (${waiting})` : ""}</b> — открыть →
        </Link>
      )}
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Касса</h1>
        {canCount && (
          <Link href="/kassa/count" className="small">
            Ревизия →
          </Link>
        )}
        {admin && (
          <span className="row small" style={{ gap: 16 }}>
            <Link href="/admin/pos/approvals">Ждут подтверждения →</Link>
            <Link href="/admin/pos/report">Скидки и возвраты →</Link>
            {seesMoney(me) && <Link href="/admin/pos/staff">Продажи сотрудников →</Link>}
            <Link href="/admin/pos/pin">Мой PIN →</Link>
            {me.role === "OWNER" && <Link href="/admin/pos/devices">Телефоны кассы →</Link>}
            <Link href="/admin/pos/shifts">Смены и сверка наличных →</Link>
          </span>
        )}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {admin ? (
          <>
            Продажа вживую — в клубе или на турнире. Товар сразу списывается с остатка, продажа попадает в <Link href="/admin/finance">финансы</Link>.
          </>
        ) : (
          "Продажа вживую — товар сразу списывается с остатка."
        )}{" "}
      </p>
      <div className="pos-wrap">
        {!readonly && (
          <section className="panel pos-panel stack" style={{ gap: 16 }}>
            <ShiftPanel
              places={places}
              clubs={sellerClubs}
              allowOther={!fixed}
              askName={me.isDevice}
              shift={
                shift && shiftT
                  ? {
                      openedAt: shift.openedAt.toISOString(),
                      place: shift.place,
                      staffName: shift.staffName,
                      opening: shift.openingCash,
                      cash: shiftT.cash,
                      other: shiftT.other,
                      count: shiftT.count,
                      pending: shiftT.pending,
                      moves: shiftT.moves,
                      refunds: shiftT.refunds,
                      expected: expectedCash(shift.openingCash, shiftT),
                    }
                  : null
              }
            />
            {shift && (
              <PosTerminal
                options={options.map((o) => ({
                  id: o.id,
                  name: o.name,
                  sku: o.sku,
                  barcode: o.barcode,
                  oldSku: o.oldSku,
                  stock: o.stock,
                  price: o.price,
                  cost: null,
                  image: o.image,
                }))}
                places={places}
                ykEnabled={yookassaEnabled()}
                canEditPrice={admin}
                maxDiscountPct={admin ? null : settings.finance.cashierMaxDiscount}
                approvers={approvers}
              />
            )}
            {loc && shift && <p className="muted small" style={{ margin: 0 }}>Остатки — товара этого клуба. Привезти со склада — «Склад» → «Перемещение».</p>}
            {!readonly && (
              <div className="pos-tools">
                <ReturnPanel key={returnNumber} approvers={approvers} initialNumber={returnNumber} />
                {shift && <GiftSell nominals={settings.giftCards.nominals} ykEnabled={yookassaEnabled()} />}
                <PickupPanel queue={pickups} />
              </div>
            )}
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
            {admin && seesMoney(me) && (
              <div className="stat">
                <div className="muted small">Прибыль с товара</div>
                <div className="stat__value">{rub(profit)}</div>
                {noCost > 0 && <div className="small form-error">без закупки: {noCost} поз.</div>}
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
                  <tr key={x.id} className={x.status === "CANCELLED" ? "is-muted" : undefined}>
                    <td className="small" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateTime(x.createdAt).slice(-5)}
                      <div className="muted">{x.number}</div>
                    </td>
                    <td className="small">
                      {x.items.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join(", ")}
                      <div className="muted">
                        {x.kind === "GIFT" ? `🎁 сертификат · ${methodLabel(x.method)}` : methodLabel(x.method)}
                        {x.place ? ` · ${x.place}` : ""}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {x.status === "CANCELLED" ? <s>{rub(x.total)}</s> : rub(x.total)}
                      <div className="small">
                        {x.status === "PENDING" ? (
                          <span className="pill pill--warn">{STATUS[x.status]}</span>
                        ) : (
                          <span className="muted">{STATUS[x.status] ?? x.status}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {!readonly && x.status === "PENDING" && <CancelSale id={x.id} paid={false} cash={x.method === "CASH"} />}
                      {!readonly && x.status === "PAID" && x.refunded < x.total && (
                        <Link href={`?return=${x.number}#return`} className="small" scroll={false}>
                          Возврат
                        </Link>
                      )}
                      {x.refunded > 0 && <div className="small muted">возврат {rub(x.refunded)}</div>}
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
            Неоплаченный QR отменяется сам через 20 минут — товар возвращается на склад. Возврат оплаченной покупки — кнопкой «Возврат»{admin ? "" : " с PIN менеджера"}.
            {admin ? (
              <>
                {" "}
                Все движения — в <Link href="/admin/stock/history?t=POS">журнале</Link>.
              </>
            ) : (
              ""
            )}
          </p>
        </section>
      </div>
    </>
  );
}
