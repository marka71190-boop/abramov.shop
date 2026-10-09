import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { CONSENT_COOKIE, findPendingConsent, linkPendingConsents } from "@/lib/consent";
import { normalizePhone } from "@/lib/format";
import { placeholderEmail, SITE } from "@/lib/site";

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const vkEnabled = Boolean(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET);
const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase() || null;

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (googleEnabled) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    prompt: "select_account",
  };
}
if (vkEnabled) {
  socialProviders.vk = {
    clientId: process.env.VK_CLIENT_ID as string,
    clientSecret: process.env.VK_CLIENT_SECRET as string,
    // У части пользователей VK нет почты: тогда ставим служебный адрес, а в кабинете просим указать настоящий
    mapProfileToUser: (profile) => ({
      email: profile.user.email || placeholderEmail("vk", profile.user.user_id),
      phone: normalizePhone(String(profile.user.phone ?? "")) ?? undefined,
    }),
  };
}

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
    schema: { user: s.user, session: s.session, account: s.account, verification: s.verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  socialProviders,
  user: {
    // Телефон приходит из VK ID; из форм его напрямую не принимаем (input: false)
    additionalFields: { phone: { type: "string", required: false, input: false } },
  },
  account: {
    // Зарегистрировался по почте, а потом зашёл через Google или VK с той же почтой — это один аккаунт
    accountLinking: { enabled: true, trustedProviders: ["google", "vk"] },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 дней
    updateAge: 60 * 60 * 24,
  },
  rateLimit: { enabled: true, window: 60, max: 30 },
  databaseHooks: {
    account: {
      create: {
        /*
         * Защита от «захвата» аккаунта: злоумышленник мог заранее зарегистрироваться
         * по чужой почте с паролем (почту мы пока не подтверждаем). Когда настоящий
         * владелец почты входит через Google или VK, сервис подтверждает почту — и мы удаляем
         * пароль, заданный без подтверждения. Дальше вход — через Google или VK.
         */
        after: async (acc) => {
          if (acc.providerId !== "google" && acc.providerId !== "vk") return;
          await db
            .delete(s.account)
            .where(and(eq(s.account.userId, acc.userId), eq(s.account.providerId, "credential")));
          await db.update(s.user).set({ emailVerified: true }).where(eq(s.user.id, acc.userId));
        },
      },
    },
    user: {
      create: {
        /**
         * Главная защита: аккаунт НЕ создаётся без отметки согласия на обработку ПДн.
         * Отметка записывается в журнал в момент нажатия галочки (/api/consent),
         * а здесь мы проверяем её по cookie — и для регистрации по почте, и для Google.
         */
        before: async (_user, ctx) => {
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
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export const isGoogleEnabled = googleEnabled;
export const isVkEnabled = vkEnabled;
