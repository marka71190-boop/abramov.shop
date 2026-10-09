import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { fmtDate, fmtDateTime, num, prettyPhone, rub } from "@/lib/format";
import { ORDER_STATUS, TONE_PILL } from "@/lib/order-status";
import { getActiveBan, requireAdmin } from "@/lib/viewer";
import { unbanUser } from "../../actions";
import { BanForm, BonusForm, RoleForm } from "./forms";

const CONSENT_KIND = { PERSONAL_DATA: "Обработка ПДн", MARKETING: "Рассылки" } as const;
const SOURCE = { REGISTRATION: "Регистрация", GOOGLE: "Google", VK: "VK ID", CHECKOUT: "Заказ", ACCOUNT: "Кабинет", RECONSENT: "Повторное" } as const;

type Props = { params: Promise<{ id: string }> };

export default async function CustomerPage({ params }: Props) {
  const me = await requireAdmin();
  const { id } = await params;
  const u = await db.query.user.findFirst({ where: eq(s.user.id, id) });
  if (!u) notFound();

  const [consents, bonuses, orders, accounts] = await Promise.all([
    db.query.consent.findMany({ where: eq(s.consent.userId, id), orderBy: desc(s.consent.createdAt), with: { document: true } }),
    db.query.bonusTransaction.findMany({ where: eq(s.bonusTransaction.userId, id), orderBy: desc(s.bonusTransaction.createdAt), limit: 20 }),
    db.query.order.findMany({ where: eq(s.order.userId, id), orderBy: desc(s.order.createdAt), limit: 20 }),
    db.select({ providerId: s.account.providerId }).from(s.account).where(eq(s.account.userId, id)),
  ]);
  const ban = getActiveBan(u);
  const unban = unbanUser.bind(null, u.id);

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        <Link href="/admin/customers">← Клиенты</Link>
      </p>
      <h1>{u.name}</h1>

      <div className="grid-2">
        <div className="panel stack" style={{ gap: 8 }}>
          <div>
            <span className="muted">Почта:</span> {u.email}
          </div>
          <div>
            <span className="muted">Телефон:</span> {prettyPhone(u.phone) || "—"}
          </div>
          <div>
            <span className="muted">Вход:</span> {accounts.map((a) => (a.providerId === "credential" ? "почта и пароль" : a.providerId === "vk" ? "VK ID" : a.providerId === "google" ? "Google" : a.providerId)).join(", ")}
          </div>
          <div>
            <span className="muted">Регистрация:</span> {fmtDateTime(u.createdAt)}
          </div>
          <div>
            <span className="muted">Бонусы:</span> {num(u.bonusBalance)} · <span className="muted">уровень</span> {u.tier} ·{" "}
            <span className="muted">покупок на</span> {rub(u.totalSpent)}
          </div>
          <div>
            <span className="muted">Реферальный код:</span> {u.referralCode ?? "—"}
          </div>
          {me.role === "OWNER" && <RoleForm userId={u.id} role={u.role} />}
        </div>

        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>Блокировка</h2>
          {ban ? (
            <>
              <div className="form-error">
                <strong>Заблокирован{ban.until ? ` до ${fmtDate(ban.until)}` : " бессрочно"}</strong>
                <br />
                Причина: {ban.reason}
                <br />
                Номер обращения: {ban.ticket}
              </div>
              <form action={unban}>
                <button className="btn btn--line btn--sm">Разблокировать</button>
              </form>
            </>
          ) : u.role === "OWNER" ? (
            <p className="muted">Владельца заблокировать нельзя.</p>
          ) : (
            <BanForm userId={u.id} />
          )}
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Бонусы</h2>
        <BonusForm userId={u.id} />
        {bonuses.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Сумма</th>
                  <th>Причина</th>
                  <th>Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {bonuses.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDateTime(b.createdAt)}</td>
                    <td style={{ color: b.amount > 0 ? "var(--c-success)" : "var(--c-danger)" }}>
                      {b.amount > 0 ? "+" : ""}
                      {num(b.amount)}
                    </td>
                    <td>{b.reason}</td>
                    <td>{b.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Согласия</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата и время (МСК)</th>
                <th>Вид</th>
                <th>Где</th>
                <th>Редакция</th>
                <th>IP</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDateTime(c.createdAt)}</td>
                  <td>{CONSENT_KIND[c.kind]}</td>
                  <td>{SOURCE[c.source]}</td>
                  <td>{c.document.version}</td>
                  <td>{c.ip}</td>
                  <td>
                    {c.revokedAt ? (
                      <span className="pill pill--bad">Отозвано {fmtDate(c.revokedAt)}</span>
                    ) : (
                      <span className="pill pill--ok">Действует</span>
                    )}
                  </td>
                </tr>
              ))}
              {!consents.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    Согласий нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Заказы</h2>
        {orders.length ? (
          orders.map((o) => (
            <div key={o.id} className="row-line">
              <Link href={`/admin/orders/${o.id}`}>{o.number}</Link>
              <span className="muted">{fmtDate(o.createdAt)}</span>
              <span className={`pill ${TONE_PILL[ORDER_STATUS[o.status].tone]}`}>{ORDER_STATUS[o.status].text}</span>
              <span>{rub(o.total)}</span>
            </div>
          ))
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Заказов нет
          </p>
        )}
      </div>
    </>
  );
}
