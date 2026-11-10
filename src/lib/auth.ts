import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { CONSENT_COOKIE, findPendingConsent, linkPendingConsents } from "@/lib/consent";
import { isPlaceholderEmail, SITE } from "@/lib/site";

// Вход — только по почте и паролю. Вход через VK ID и Google убран: так никто не войдёт в чужой
// аккаунт через внешний сервис с той же почтой.
const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

// Адрес сайта для входа по Face ID; PASSKEY_ORIGIN — только для автотестов (по IP вход по Face ID невозможен)
const siteOrigin = (process.env.PASSKEY_ORIGIN || process.env.BETTER_AUTH_URL || SITE.url).replace(/\/$/, "");

export const auth = betterAuth({
  appName: SITE.name,
  baseURL: process.env.BETTER_AUTH_URL || SITE.url,
  secret: process.env.BETTER_AUTH_SECRET,
  // Дополнительные адреса сайта, с которых разрешён вход (например, технический домен Timeweb), через запятую
  trustedOrigins: (process.env.TRUSTED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: s.user, session: s.session, account: s.account, verification: s.verification, passkey: s.passkey },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 60 * 60, // ссылка действует час
    revokeSessionsOnPasswordReset: true, // после смены пароля выходим на всех устройствах
    /** Ссылку отправляем на почту (если настроена) и в Telegram (если привязан). */
    sendResetPassword: async ({ user, token }) => {
      const base = (process.env.BETTER_AUTH_URL || SITE.url).replace(/\/$/, "");
      const url = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      const [{ sendMail }, tg, full] = await Promise.all([
        import("@/lib/mail"),
        import("@/lib/telegram"),
        db.query.user.findFirst({ where: eq(s.user.id, user.id), columns: { telegramChatId: true, name: true } }),
      ]);
      if (!isPlaceholderEmail(user.email)) {
        await sendMail(
          user.email,
          "Восстановление пароля — Abramov Shop",
          "Новый пароль",
          "Кто-то (надеемся, вы) запросил смену пароля на abramov.shop. Ссылка действует 1 час.<br>Если это были не вы — просто проигнорируйте письмо.",
          { text: "Задать новый пароль", url },
        ).catch((e) => console.error("[mail] reset:", e instanceof Error ? e.message : e));
      }
      if (full?.telegramChatId && tg.telegramEnabled()) {
        await tg
          .send(full.telegramChatId, "🔑 Запрошена смена пароля на сайте. Ссылка действует 1 час. Если это были не вы — ничего не делайте.", [
            { text: "Задать новый пароль", url },
          ])
          .catch((e) => console.error("[telegram] reset:", e instanceof Error ? e.message : e));
      }
    },
  },
  /*
   * Подтверждение почты. Войти и купить можно и без него — письмо со ссылкой уходит
   * сразу после регистрации, а приветственные бонусы начисляются после подтверждения.
   */
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24 * 3, // ссылка действует 3 дня
    sendVerificationEmail: async ({ user, url }) => {
      const [{ sendMail, mailEnabled }, { getSettings }] = await Promise.all([import("@/lib/mail"), import("@/lib/settings")]);
      if (!mailEnabled() || isPlaceholderEmail(user.email)) return;
      const welcome = (await getSettings()).loyalty.welcomeBonus;
      // Не ждём отправки: регистрация не должна тормозить из-за почтового сервера
      void sendMail(
        user.email,
        "Подтвердите почту — Abramov Shop",
        "Подтвердите почту",
        `Здравствуйте! Вы зарегистрировались на abramov.shop. Нажмите кнопку ниже, чтобы подтвердить, что это ваш адрес.` +
          (welcome > 0 ? `<br><br>После подтверждения начислим <b>${welcome}</b> приветственных бонусов.` : "") +
          `<br><br>Ссылка действует 3 дня. Если вы не регистрировались — просто проигнорируйте письмо.`,
        { text: "Подтвердить почту", url },
      ).catch((e) => console.error("[mail] verify:", e instanceof Error ? e.message : e));
    },
    afterEmailVerification: async (user) => {
      const { grantWelcomeBonus } = await import("@/lib/bonuses");
      await grantWelcomeBonus(user.id).catch((e) => console.error("[bonus] welcome:", e));
    },
  },
  user: {
    // Телефон из формы регистрации записываем сами (из журнала согласий), напрямую его не принимаем
    additionalFields: { phone: { type: "string", required: false, input: false } },
  },
  // Привязка входа через другие сервисы выключена: вход только по почте и паролю
  account: { accountLinking: { enabled: false } },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 дней
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    // Повторное письмо с подтверждением — не чаще 3 раз в 10 минут
    customRules: {
      "/send-verification-email": { window: 600, max: 3 },
      // Код для входа: не больше 5 писем и 10 попыток ввода за 10 минут с одного адреса
      "/email-otp/send-verification-otp": { window: 600, max: 5 },
      "/sign-in/email-otp": { window: 600, max: 10 },
    },
  },
  databaseHooks: {
    user: {
      update: {
        // Почту подтвердили входом по коду — приветственные бонусы (повторно не начисляются)
        after: async (u) => {
          if (!u.emailVerified) return;
          const { grantWelcomeBonus } = await import("@/lib/bonuses");
          await grantWelcomeBonus(u.id).catch((e) => console.error("[bonus] welcome:", e));
        },
      },
      create: {
        /**
         * Главная защита: аккаунт НЕ создаётся без отметки согласия на обработку ПДн.
         * Отметка записывается в журнал в момент нажатия галочки (/api/consent),
         * а здесь мы проверяем её по cookie.
         */
        before: async (newUser, ctx) => {
          // Пауза приёма данных (админка → Настройки): новые аккаунты не создаются, кроме владельца
          const { getSettings } = await import("@/lib/settings");
          if ((await getSettings()).pdPause && !(ownerEmail && newUser.email?.toLowerCase() === ownerEmail)) {
            throw new APIError("FORBIDDEN", { code: "REGISTRATION_PAUSED", message: "Регистрация временно закрыта" });
          }
          const token = ctx?.getCookie(CONSENT_COOKIE);
          const pending = token ? await findPendingConsent(token) : null;
          if (!pending) {
            throw new APIError("BAD_REQUEST", {
              code: "CONSENT_REQUIRED",
              message: "Отметьте согласие на обработку персональных данных",
            });
          }
        },
        after: async (created, ctx) => {
          const token = ctx?.getCookie(CONSENT_COOKIE);
          if (!token) return;
          const linked = await linkPendingConsents(token, created.id, created.email);
          const phone = (created.phone as string | null | undefined) || linked.find((c) => c.phone)?.phone;
          // Владелец магазина (OWNER_EMAIL) сразу получает доступ к админке
          const role = ownerEmail && created.email.toLowerCase() === ownerEmail ? ("OWNER" as const) : undefined;
          if (phone || role) await db.update(s.user).set({ ...(phone ? { phone } : {}), ...(role ? { role } : {}) }).where(eq(s.user.id, created.id));
          // Приветственные бонусы: сразу — если почта уже подтверждена или почта на сайте не настроена
          // и подтвердить её нечем; иначе — после перехода по ссылке из письма (afterEmailVerification)
          const { mailEnabled } = await import("@/lib/mail");
          if (created.emailVerified || !mailEnabled()) {
            const { grantWelcomeBonus } = await import("@/lib/bonuses");
            await grantWelcomeBonus(created.id).catch((e) => console.error("[bonus] welcome:", e));
          }
        },
      },
    },
  },
  plugins: [
    /*
     * Вход по коду из письма — без пароля. Только для уже зарегистрированных:
     * новый аккаунт без согласия на обработку данных так создать нельзя (disableSignUp).
     * Если почта не была подтверждена, вход по коду её подтверждает (старый пароль при этом
     * сбрасывается — защита от чужих аккаунтов на вашу почту; задать новый можно в кабинете).
     */
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      disableSignUp: true,
      storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => {
        if (type !== "sign-in" || isPlaceholderEmail(email)) return;
        const { sendMail } = await import("@/lib/mail");
        void sendMail(
          email,
          `Код для входа: ${otp} — Abramov Shop`,
          "Код для входа",
          `Ваш код для входа на abramov.shop:<br><br><b style="font-size:30px;letter-spacing:6px">${otp}</b><br><br>Код действует 10 минут. Никому его не сообщайте — сотрудники магазина его не спрашивают.<br>Если вы не входили на сайт — просто проигнорируйте письмо.`,
        ).catch((e) => console.error("[mail] otp:", e instanceof Error ? e.message : e));
      },
    }),
    /*
     * Вход по Face ID, Touch ID или отпечатку (passkey). Добавить можно только из своего кабинета,
     * войдя недавно (сутки) — чужой старой сессией ключ не подменить. В базе — лишь открытый ключ,
     * отпечаток и лицо не покидают телефон.
     */
    passkey({ rpID: new URL(siteOrigin).hostname, rpName: SITE.name, origin: siteOrigin }),
    nextCookies(),
  ],
});

