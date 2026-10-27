import { and, desc, eq, ne } from "drizzle-orm";
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
import { BirthdayForm, CopyButton, RealEmailForm, SetPasswordNotice, TelegramConnect, Toggle, VerifyEmailNotice } from "./Toggles";
import { mailEnabled } from "@/lib/mail";
import { expiringSoon } from "@/lib/bonuses";
import { ProductCard } from "@/components/product/ProductCard";
import { getPublicProductsByIds } from "@/lib/catalog";
import { ratingsFor } from "@/lib/reviews";
import { telegramEnabled } from "@/lib/telegram";
import { pushPublicKey } from "@/lib/push";
import { PushToggle } from "@/components/pwa/PushToggle";
import { isPlaceholderEmail } from "@/lib/site";
import { ReturnCard } from "@/components/returns/ReturnCard";
import { listReturns } from "@/lib/returns";
import { listAddresses, MAX_ADDRESSES } from "@/lib/addresses";
import { cdekEnabled } from "@/lib/cdek";
import { AddressBook } from "@/components/delivery/AddressBook";

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
  REVIEW: "За отзыв",
};

const VERIFY_ERROR: Record<string, string> = {
  TOKEN_EXPIRED: "Ссылка для подтверждения устарела. Отправьте письмо ещё раз — кнопка ниже.",
  INVALID_TOKEN: "Ссылка для подтверждения неверная или уже использована. Отправьте письмо ещё раз — кнопка ниже.",
  INVALID_USER: "Эта ссылка — для другого аккаунта. Выйдите и откройте её снова.",
  USER_NOT_FOUND: "Аккаунт для этой ссылки не найден.",
  EMAIL_TAKEN: "Эта почта уже привязана к другому аккаунту. Укажите другую или напишите в поддержку.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ verified?: string; error?: string }> }) {
  const sp = await searchParams;
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

  const [orders, pd, mk, referrals, bonusLog, hasPassword] = await Promise.all([
    db.query.order.findMany({ where: eq(s.order.userId, user.id), orderBy: desc(s.order.createdAt), limit: 10, with: { items: true } }),
    getActiveConsent(user.id, "PERSONAL_DATA"),
    getActiveConsent(user.id, "MARKETING"),
    db.$count(s.user, eq(s.user.referredById, user.id)),
    db.query.bonusTransaction.findMany({ where: eq(s.bonusTransaction.userId, user.id), orderBy: desc(s.bonusTransaction.createdAt), limit: 8 }),
    // Пароль есть? Раньше входили через Google или VK — пароля могло не быть
    db.$count(s.account, and(eq(s.account.userId, user.id), eq(s.account.providerId, "credential"))).then((n) => n > 0),
  ]);

  // Без действующего согласия на обработку ПДн кабинетом пользоваться нельзя
  if (!pd) redirect("/consent");

  const telegram = telegramEnabled();
  const burning = await expiringSoon(user.id, user.bonusBalance, 30);
  const favRows = await db.query.favorite.findMany({ where: eq(s.favorite.userId, user.id), orderBy: desc(s.favorite.createdAt), limit: 24 });
  const favorites = await getPublicProductsByIds(favRows.map((f) => f.productId));
  const returns = await listReturns({ userId: user.id });
  const addresses = await listAddresses(user.id);
  const { userRequests, SERVICE_STATUS } = await import("@/lib/service");
  const services = await userRequests(user.id);
  const gifts = await db.query.giftCard.findMany({
    where: and(eq(s.giftCard.buyerId, user.id), ne(s.giftCard.status, "PENDING")),
    orderBy: desc(s.giftCard.createdAt),
    limit: 20,
  });
  const favRatings = await ratingsFor(favorites.map((f) => f.id));
  const progress = tierProgress(Math.floor(user.totalSpent / 100), settings.loyalty);
  const firstName = user.name.split(" ")[0] || user.name;

  return (
    <div className="container account ym-hide-content">
      <nav className="account__nav" aria-label="Разделы кабинета">
        <Link href="/account" aria-current="page">
          Обзор
        </Link>
        <Link href="#orders">Заказы</Link>
        <Link href="#bonus">Бонусы</Link>
        {returns.length > 0 && <Link href="#returns">Возвраты</Link>}
        {services.length > 0 && <Link href="#service">Мастерская</Link>}
        <Link href="#favorites">Избранное</Link>
        <Link href="#settings">Настройки</Link>
        <SignOutButton>Выйти</SignOutButton>
      </nav>

      <div className="account__main">
        <h1 className="h2" style={{ fontSize: "clamp(34px, 4vw, 52px)" }}>
          Здравствуйте, {firstName}
        </h1>

        {user.organizationId &&
          (await (async () => {
            const { orgOf, ORG_STATUS } = await import("@/lib/wholesale");
            const org = await orgOf(user.id);
            if (!org) return null;
            return (
              <div className="notice notice--muted" style={{ margin: 0 }}>
                {org.name}: {ORG_STATUS[org.status].text.toLowerCase()}.{" "}
                <Link href="/opt">{org.status === "APPROVED" ? "Оптовый каталог →" : "Подробнее →"}</Link>
              </div>
            );
          })())}
        {user.role === "CLUB" && (
          <div className="notice notice--muted" style={{ margin: 0 }}>
            Вы администратор клуба. <Link href="/club">Открыть раздел «Клуб» →</Link> — заказы на выдачу и кии для мастерской. Чтобы получать
            уведомления в Telegram, подключите его ниже в «Настройках».
          </div>
        )}

        {sp.verified && sp.error ? (
          <div className="form-error" role="alert">
            {VERIFY_ERROR[sp.error] ?? "Не получилось подтвердить почту. Отправьте письмо ещё раз."}
          </div>
        ) : sp.verified && user.emailVerified ? (
          <div className="form-ok" role="status">
            Почта подтверждена.
            {bonusLog.some((b) => b.reason === "WELCOME") && settings.loyalty.welcomeBonus > 0
              ? ` Приветственные бонусы начислены — ${num(settings.loyalty.welcomeBonus)}.`
              : ""}
          </div>
        ) : null}
        {isPlaceholderEmail(user.email) && <RealEmailForm />}
        {!isPlaceholderEmail(user.email) && !hasPassword && mailEnabled() && <SetPasswordNotice email={user.email} />}
        {!user.emailVerified && !isPlaceholderEmail(user.email) && mailEnabled() && (
          <VerifyEmailNotice email={user.email} welcome={settings.loyalty.welcomeBonus} />
        )}

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
              {burning && (
                <div className="small" style={{ color: "var(--c-danger)", marginTop: 6 }}>
                  {num(burning.amount)} сгорят {fmtDate(burning.date)}
                </div>
              )}
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

        <section id="addresses" className="panel">
          <h2>Мои адреса</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Сохраните до {MAX_ADDRESSES} адресов доставки — при оформлении заказа останется выбрать нужный. Получателем может быть другой человек,
            например если отправляете подарок.
          </p>
          <AddressBook
            addresses={addresses.map((a) => ({
              id: a.id,
              label: a.label,
              deliveryType: a.deliveryType,
              city: a.city,
              cdekCityCode: a.cdekCityCode,
              address: a.address,
              postalCode: a.postalCode,
              cdekPvzCode: a.cdekPvzCode,
              recipientName: a.recipientName,
              recipientPhone: a.recipientPhone,
              note: a.note,
              isDefault: a.isDefault,
            }))}
            me={{ name: user.name, phone: user.phone ?? "" }}
            delivery={{ pvz: settings.delivery.pvzEnabled, courier: settings.delivery.courierEnabled, cdek: cdekEnabled() }}
            max={MAX_ADDRESSES}
          />
        </section>

        {returns.length > 0 && (
          <section id="returns" className="panel">
            <h2>Возвраты и обмены</h2>
            <div className="rlist">
              {returns.map((r) => (
                <ReturnCard key={r.id} r={r} />
              ))}
            </div>
          </section>
        )}

        {services.length > 0 && (
          <section id="service" className="panel">
            <h2>Мастерская</h2>
            {services.map((r) => (
              <Link key={r.id} href={`/service/${r.number}`} className="row-line row-line--link">
                <span>
                  <b>{r.number}</b> <span className="muted small">· {r.items.map((i) => i.name).join(", ")}</span>
                </span>
                <span className="small">{SERVICE_STATUS[r.status].text}</span>
              </Link>
            ))}
            <p className="small" style={{ margin: "10px 0 0" }}>
              <Link href="/service">Новая заявка в мастерскую →</Link>
            </p>
          </section>
        )}

        {gifts.length > 0 && (
          <section id="gifts" className="panel">
            <h2>Подарочные сертификаты</h2>
            <div className="stack" style={{ gap: 8 }}>
              {gifts.map((g) => (
                <Link key={g.id} href={`/gift/${g.token}`} className="row-line" style={{ color: "inherit", textDecoration: "none" }}>
                  <div>
                    <div>
                      {rub(g.initialAmount)}
                      {g.recipientName ? ` · для ${g.recipientName}` : ""}
                    </div>
                    <div className="muted small">
                      {g.status === "VOID"
                        ? g.refundedAt
                          ? "деньги возвращены"
                          : "недействителен"
                        : g.expiresAt && g.expiresAt <= new Date()
                          ? `срок истёк ${fmtDate(g.expiresAt)}`
                          : `осталось ${rub(g.balance)}${g.expiresAt ? ` · до ${fmtDate(g.expiresAt)}` : ""}`}
                    </div>
                  </div>
                  <span className="small gold">Открыть →</span>
                </Link>
              ))}
            </div>
            <p className="small" style={{ marginBottom: 0 }}>
              <Link href="/gift">Купить ещё сертификат</Link>
            </p>
          </section>
        )}

        {favorites.length > 0 && (
          <section id="favorites" className="panel">
            <h2>Избранное</h2>
            <p className="muted small" style={{ marginTop: -6 }}>
              {mk ? (
                <>📉 Когда товар из избранного подешевеет, пришлём письмо.</>
              ) : (
                <>
                  📉 Хотите узнавать, когда товар из избранного подешевеет? Включите «Новости и акции» в <a href="#settings">настройках</a> ниже.
                </>
              )}
            </p>
            <div className="products" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
              {favorites.map((p) => (
                <ProductCard key={p.id} p={p} rating={favRatings.get(p.id)} favorite />
              ))}
            </div>
          </section>
        )}

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
          {telegram && (
            <div className="row-line">
              <div>
                <div>Telegram {user.telegramChatId ? <span className="pill pill--ok" style={{ marginLeft: 6 }}>подключён</span> : null}</div>
                <div className="muted small">
                  {user.telegramChatId ? "Бот пришлёт оплату, трек-номер СДЭК и начисление бонусов" : "Подключите — бот пришлёт трек-номер и сообщит, когда посылка приедет"}
                </div>
              </div>
              <div className="row" style={{ gap: 16 }}>
                {user.telegramChatId && <Toggle label="Уведомления в Telegram" on={user.notifyTelegram} action={setTelegramNotify} />}
                <TelegramConnect linked={!!user.telegramChatId} />
              </div>
            </div>
          )}
          {pushPublicKey() && (
            <div className="row-line" id="push">
              <div>
                <div>Уведомления на телефон</div>
                <div className="muted small">
                  Оплата, трек-номер и готовность заказа — прямо на экран. Удобнее всего в <Link href="/app">приложении</Link>
                </div>
              </div>
              <PushToggle publicKey={pushPublicKey()} signedIn />
            </div>
          )}
          {settings.loyalty.birthdayBonus > 0 && (
            <div className="row-line">
              <div>
                <div>День рождения</div>
                <div className="muted small">
                  {user.birthday
                    ? `${fmtDate(user.birthday)} — в этот день подарим ${num(settings.loyalty.birthdayBonus)} бонусов`
                    : `Укажите заранее — в день рождения подарим ${num(settings.loyalty.birthdayBonus)} бонусов. Дату можно указать один раз`}
                </div>
              </div>
              {!user.birthday && <BirthdayForm />}
            </div>
          )}
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
