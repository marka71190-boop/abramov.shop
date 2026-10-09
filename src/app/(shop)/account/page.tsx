import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { db, schema as s } from "@/db";
import { getActiveConsent } from "@/lib/consent";
import { fmtDate, fmtDateTime, num, prettyPhone, rub } from "@/lib/format";
import { makeReferralCode, TIER_NAME, tierProgress } from "@/lib/loyalty";
import { getSettings } from "@/lib/settings";
import { requireUser } from "@/lib/viewer";
import { setMarketing, setTelegramNotify } from "./actions";
import { CopyButton, RealEmailForm, Toggle } from "./Toggles";
import { isPlaceholderEmail } from "@/lib/site";

export const metadata: Metadata = { title: "Личный кабинет", robots: { index: false } };

const STATUS: Record<string, { text: string; color: string }> = {
  AWAITING_PAYMENT: { text: "Ожидает оплаты", color: "var(--c-dim)" },
  PAID: { text: "Оплачен", color: "var(--c-gold)" },
  ASSEMBLING: { text: "Собираем", color: "var(--c-gold)" },
  SHIPPED: { text: "В пути · СДЭК", color: "var(--c-gold)" },
  DELIVERED: { text: "Получен", color: "var(--c-success)" },
  CANCELLED: { text: "Отменён", color: "var(--c-danger)" },
  REFUNDED: { text: "Возврат", color: "var(--c-danger)" },
};

const BONUS_REASON: Record<string, string> = {
  ORDER_ACCRUAL: "Бонусы за заказ",
  ORDER_SPEND: "Оплата заказа",
  REFERRAL: "Приглашённый друг",
  BIRTHDAY: "С днём рождения",
  WELCOME: "Приветственные бонусы",
  MANUAL: "Начисление от магазина",
  EXPIRED: "Сгорели",
  REFUND: "Возврат",
};

export default async function AccountPage() {
  let user = await requireUser("/account");
  const settings = await getSettings();

  // Реферальный код выдаём при первом заходе в кабинет
  if (!user.referralCode) {
    for (let i = 0; i < 5 && !user.referralCode; i++) {
      const [u] = await db
        .update(s.user)
        .set({ referralCode: makeReferralCode() })
        .where(eq(s.user.id, user.id))
        .returning()
        .catch(() => []);
      if (u) user = u;
    }
  }

  const [orders, pd, mk, referrals, bonusLog] = await Promise.all([
    db.query.order.findMany({ where: eq(s.order.userId, user.id), orderBy: desc(s.order.createdAt), limit: 10, with: { items: true } }),
    getActiveConsent(user.id, "PERSONAL_DATA"),
    getActiveConsent(user.id, "MARKETING"),
    db.$count(s.user, eq(s.user.referredById, user.id)),
    db.query.bonusTransaction.findMany({ where: eq(s.bonusTransaction.userId, user.id), orderBy: desc(s.bonusTransaction.createdAt), limit: 8 }),
  ]);

  // Без действующего согласия на обработку ПДн кабинетом пользоваться нельзя
  if (!pd) redirect("/consent");

  const progress = tierProgress(Math.floor(user.totalSpent / 100), settings.loyalty);
  const firstName = user.name.split(" ")[0] || user.name;

  return (
    <div className="container account">
      <nav className="account__nav" aria-label="Разделы кабинета">
        <Link href="/account" aria-current="page">
          Обзор
        </Link>
        <Link href="#orders">Заказы</Link>
        <Link href="#bonus">Бонусы</Link>
        <Link href="#settings">Настройки</Link>
        <SignOutButton>Выйти</SignOutButton>
      </nav>

      <div className="account__main">
        <h1 className="h2" style={{ fontSize: "clamp(34px, 4vw, 52px)" }}>
          Здравствуйте, {firstName}
        </h1>

        {isPlaceholderEmail(user.email) && <RealEmailForm />}

        <div id="bonus" className="grid-2">
          <div className="bonus-card">
            <div className="stripe" aria-hidden />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="label">Бонусная карта</span>
              <span className="tag" style={{ padding: "4px 12px" }}>
                {TIER_NAME[progress.current]}
              </span>
            </div>
            <div>
              <div className="bonus-card__balance">{num(user.bonusBalance)}</div>
              <div className="muted small">бонусов на счёте, 1 бонус = 1 ₽</div>
            </div>
            {progress.next ? (
              <div className="meter">
                <div className="meter__row small">
                  <span className="muted">До уровня {TIER_NAME[progress.next]}</span>
                  <span>осталось {num(progress.left)} ₽</span>
                </div>
                <div className="meter__bar" style={{ height: 4 }}>
                  <div className="meter__fill" style={{ width: `${progress.percent}%` }} />
                </div>
              </div>
            ) : (
              <div className="small gold">Максимальный уровень — {settings.loyalty.tiers.BLACK.percent}% бонусами</div>
            )}
          </div>

          <div className="panel stack">
            <div className="label">Приведи друга</div>
            <p style={{ margin: 0, fontSize: 15 }}>
              Поделитесь кодом: после первой покупки друга вы получите {num(settings.loyalty.referralBonus)} бонусов.
            </p>
            {user.referralCode && (
              <div className="row">
                <div className="code-box">{user.referralCode}</div>
                <CopyButton text={user.referralCode} />
              </div>
            )}
            {user.referralCode && (
              <div className="muted small" style={{ wordBreak: "break-all" }}>
                Или ссылкой: abramov.shop/?ref={user.referralCode}
              </div>
            )}
            <div className="muted small">Приглашено друзей: {referrals}</div>
          </div>
        </div>

        <section id="orders" className="panel">
          <h2>Мои заказы</h2>
          {orders.length === 0 ? (
            <p className="empty" style={{ paddingTop: 8 }}>
              Заказов пока нет. <Link href="/#catalog">Перейти в каталог</Link>
            </p>
          ) : (
            orders.map((o) => {
              const st = STATUS[o.status];
              const count = o.items.reduce((a, i) => a + i.quantity, 0);
              return (
                <Link key={o.id} href={`/order/${o.number}`} className="row-line row-line--link">
                  <div style={{ flex: "1 1 180px" }}>
                    <div style={{ fontWeight: 600 }}>{o.number}</div>
                    <div className="muted small">
                      {fmtDate(o.createdAt)} · {count} шт.
                    </div>
                  </div>
                  <div className="row" style={{ flex: "1 1 200px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />
                    {st.text}
                  </div>
                  <div className="muted small" style={{ flex: "1 1 140px" }}>
                    {o.trackNumber ? `Трек: ${o.trackNumber}` : ""}
                  </div>
                  <div className="display" style={{ fontSize: 22, fontWeight: 400 }}>
                    {rub(o.total)}
                  </div>
                </Link>
              );
            })
          )}
        </section>

        {bonusLog.length > 0 && (
          <section className="panel">
            <h2>История бонусов</h2>
            {bonusLog.map((b) => (
              <div key={b.id} className="row-line">
                <div>
                  <div>{b.comment ?? BONUS_REASON[b.reason]}</div>
                  <div className="muted small">
                    {fmtDate(b.createdAt)}
                    {b.expiresAt && b.amount > 0 ? ` · действуют до ${fmtDate(b.expiresAt)}` : ""}
                  </div>
                </div>
                <div className="display" style={{ fontSize: 22, fontWeight: 400, color: b.amount > 0 ? "var(--c-gold)" : "var(--c-muted)" }}>
                  {b.amount > 0 ? "+" : "−"}
                  {num(Math.abs(b.amount))}
                </div>
              </div>
            ))}
          </section>
        )}

        <section id="settings" className="panel">
          <h2>Профиль, уведомления и согласия</h2>
          <div className="row-line">
            <div>
              <div>{user.name}</div>
              <div className="muted small">
                {isPlaceholderEmail(user.email) ? "почта не указана" : user.email}
                {user.phone ? ` · ${prettyPhone(user.phone)}` : ""}
              </div>
            </div>
          </div>
          <div className="row-line">
            <div>
              <div>Статус заказа в Telegram</div>
              <div className="muted small">Бот пришлёт трек-номер и сообщит, когда посылка приедет</div>
            </div>
            <Toggle label="Уведомления в Telegram" on={user.notifyTelegram} action={setTelegramNotify} />
          </div>
          <div className="row-line">
            <div>
              <div>Новости и акции</div>
              <div className="muted small">
                {mk ? `Согласие дано ${fmtDateTime(mk.createdAt)}. ` : ""}Можно отключить в любой момент
              </div>
            </div>
            <Toggle label="Новости и акции" on={!!mk} action={setMarketing} />
          </div>
          <div className="row-line">
            <div>
              <div>Согласие на обработку персональных данных</div>
              <div className="muted small">
                {pd
                  ? `Дано ${fmtDateTime(pd.createdAt)}, редакция от ${pd.document.version.split("-").reverse().join(".")}`
                  : "Не найдено"}
              </div>
            </div>
            <Link href="/p/consent" className="small">
              Открыть документ
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
