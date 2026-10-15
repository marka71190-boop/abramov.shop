import { desc } from "drizzle-orm";
import Link from "next/link";
import { db, schema as s } from "@/db";
import { sendingQuota, subscriberStats } from "@/lib/campaigns";
import { fmtDateTime, num } from "@/lib/format";
import { mailEnabled } from "@/lib/mail";
import { telegramEnabled } from "@/lib/telegram";
import { requireAdmin } from "@/lib/viewer";
import { CAMPAIGN_STATUS } from "./status";

export default async function MailingPage() {
  await requireAdmin();
  const [campaigns, subs, quota] = await Promise.all([
    db.query.campaign.findMany({ orderBy: desc(s.campaign.createdAt), limit: 100, with: { promo: { columns: { code: true } } } }),
    subscriberStats(),
    sendingQuota(),
  ]);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Рассылки</h1>
        <Link href="/admin/mailing/new" className="btn btn--gold">
          Новая рассылка
        </Link>
      </div>

      <div className="panel stack">
        <div className="stats" style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <div className="label">Подписчиков с почтой</div>
            <div style={{ fontSize: 28, fontFamily: "var(--font-display)" }}>{num(subs.all)}</div>
            <div className="muted small">из них подтвердили почту: {num(subs.verified)}</div>
          </div>
          <div>
            <div className="label">В Telegram</div>
            <div style={{ fontSize: 28, fontFamily: "var(--font-display)" }}>{num(subs.telegram)}</div>
          </div>
          <div>
            <div className="label">Писем рассылок за сутки</div>
            <div style={{ fontSize: 28, fontFamily: "var(--font-display)" }}>
              {num(quota.used)} <span className="muted" style={{ fontSize: 16 }}>из {num(quota.limit)}</span>
            </div>
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Письма получают только те, кто дал согласие на рассылку — при регистрации, при оформлении заказа или в личном кабинете («Новости и
          акции»). Этого требует закон о рекламе. В каждом письме есть ссылка «Отписаться». Письма уходят постепенно — {quota.perMinute} в
          минуту и не больше {num(quota.limit)} в сутки (ограничение почтового сервиса); большая рассылка растянется, сайт продолжит сам.
        </p>
        {!mailEnabled() && <div className="form-error">Почта на сайте не настроена — можно отправлять только в Telegram.</div>}
        {!telegramEnabled() && !mailEnabled() && <div className="form-error">Ни почта, ни Telegram-бот не подключены — отправлять некуда.</div>}
      </div>

      {campaigns.length === 0 ? (
        <p className="muted">Рассылок пока не было.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Тема</th>
                <th>Промокод</th>
                <th>Статус</th>
                <th>Доставлено</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/mailing/${c.id}`} style={{ fontWeight: 600 }}>
                      {c.subject}
                    </Link>
                  </td>
                  <td>{c.promo?.code ?? "—"}</td>
                  <td>
                    <span className={`pill ${CAMPAIGN_STATUS[c.status].pill}`}>{CAMPAIGN_STATUS[c.status].text}</span>
                  </td>
                  <td>{c.status === "DRAFT" ? "—" : `${num(c.sent)} из ${num(c.total)}`}</td>
                  <td className="small">{fmtDateTime(c.startedAt ?? c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
