import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { audienceCount, loadPromo, promoProblem, renderEmail } from "@/lib/campaigns";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { mailEnabled, renderMail } from "@/lib/mail";
import { telegramEnabled } from "@/lib/telegram";
import { requireAdmin } from "@/lib/viewer";
import { CAMPAIGN_STATUS } from "../status";
import { DraftControls, MailingForm, RunControls, type PromoOption } from "../MailingForm";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function CampaignPage({ params, searchParams }: Props) {
  const me = await requireAdmin();
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const c = id === "new" ? null : await db.query.campaign.findFirst({ where: eq(s.campaign.id, id) });
  if (id !== "new" && !c) notFound();

  const promoRows = await db.query.promoCode.findMany({ orderBy: desc(s.promoCode.createdAt), limit: 200 });
  const promos: PromoOption[] = promoRows.map((p) => ({
    id: p.id,
    code: p.code,
    type: p.type,
    value: p.value,
    minOrder: p.minOrder,
    endsAt: p.endsAt ? fmtDate(p.endsAt) : null,
    problem: promoProblem(p),
  }));

  const back = (
    <p className="small" style={{ margin: 0 }}>
      <Link href="/admin/mailing">← Рассылки</Link>
    </p>
  );

  if (!c) {
    return (
      <>
        {back}
        <h1>Новая рассылка</h1>
        <MailingForm campaign={null} promos={promos} saved={false} mail={mailEnabled()} telegram={telegramEnabled()} />
      </>
    );
  }

  // Предпросмотр письма — как его увидит покупатель (с вашим именем)
  const { promo, categoryName } = await loadPromo(c);
  const m = renderEmail(c, promo, categoryName, me);
  const preview = renderMail(m.title, m.body, m.button, m.extra);
  const st = CAMPAIGN_STATUS[c.status];

  if (c.status === "DRAFT") {
    const aud = await audienceCount(c);
    const recipients = aud.email + aud.telegram;
    return (
      <>
        {back}
        <h1>
          {c.subject} <span className="pill">{st.text}</span>
        </h1>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <MailingForm
            campaign={c}
            promos={promos}
            saved={saved === "1"}
            mail={mailEnabled()}
            telegram={telegramEnabled()}
          />
          <div className="stack">
            <div className="panel stack">
              <strong>Кому уйдёт</strong>
              <div className="muted small">
                {c.channelEmail && <div>На почту: {num(aud.email)}</div>}
                {c.channelTelegram && <div>В Telegram: {num(aud.telegram)}</div>}
                {recipients === 0 && <div style={{ color: "var(--c-danger)" }}>Пока некому: никто не дал согласие на рассылку.</div>}
              </div>
              <DraftControls id={c.id} recipients={recipients} />
            </div>
            <div className="label">Так выглядит письмо</div>
            <iframe title="Предпросмотр письма" srcDoc={preview} className="mail-preview" sandbox="" />
          </div>
        </div>
      </>
    );
  }

  const done = c.sent + c.failed + c.skipped;
  const pct = c.total ? Math.round((done / c.total) * 100) : 100;
  const problems = await db.query.campaignRecipient.findMany({
    where: and(eq(s.campaignRecipient.campaignId, c.id), inArray(s.campaignRecipient.status, ["FAILED"])),
    orderBy: asc(s.campaignRecipient.sentAt),
    limit: 50,
  });

  return (
    <>
      {back}
      <h1>
        {c.subject} <span className={`pill ${st.pill}`}>{st.text}</span>
      </h1>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="panel stack">
            <div className="meter">
              <div className="meter__row">
                <span className="muted">Отправлено</span>
                <strong>
                  {num(done)} из {num(c.total)} · {pct}%
                </strong>
              </div>
              <div className="meter__bar">
                <div className="meter__fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="small">
              <div>Доставлено: {num(c.sent)}</div>
              <div>Ошибки: {num(c.failed)}</div>
              <div className="muted">Пропущено (отписались, заблокированы, остановлено): {num(c.skipped)}</div>
            </div>
            <div className="muted small">
              {c.startedAt && <>Запущена {fmtDateTime(c.startedAt)}. </>}
              {c.finishedAt && <>Завершена {fmtDateTime(c.finishedAt)}.</>}
              {c.status === "SENDING" && " Страница обновляется сама."}
            </div>
            <RunControls id={c.id} sending={c.status === "SENDING"} />
          </div>
          {problems.length > 0 && (
            <div className="panel stack">
              <strong>Не доставлено</strong>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {problems.map((r) => (
                      <tr key={r.id}>
                        <td className="small">{r.channel === "email" ? r.address : "Telegram"}</td>
                        <td className="small muted">{r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="stack">
          <div className="label">Письмо</div>
          <iframe title="Письмо" srcDoc={preview} className="mail-preview" sandbox="" />
        </div>
      </div>
    </>
  );
}
