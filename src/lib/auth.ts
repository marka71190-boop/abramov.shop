import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { CONSENT_COOKIE, findPendingConsent, linkPendingConsents } from "@/lib/consent";
import { SITE } from "@/lib/site";

const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  appName: SITE.name,
  baseURL: process.env.BETTER_AUTH_URL || SITE.url,
  secret: process.env.BETTER_AUTH_SECRET,
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
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          prompt: "select_account",
        },
      }
    : {},
  account: {
    // Если человек сначала зарегистрировался по почте, а потом зашёл через Google с той же почтой — это один аккаунт
    accountLinking: { enabled: true, trustedProviders: ["google"] },
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
         * владелец почты входит через Google, Google подтверждает почту — и мы удаляем
         * пароль, заданный без подтверждения. Дальше вход — через Google.
         */
        after: async (acc) => {
          if (acc.providerId !== "google") return;
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
          const phone = linked.find((c) => c.phone)?.phone;
          if (phone) await db.update(s.user).set({ phone }).where(eq(s.user.id, created.id));
        },
      },
    },
  },
  plugins: [nextCookies()],
});


export const isGoogleEnabled = googleEnabled;
