import type { Metadata } from "next";
import { and, eq, inArray, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema as s } from "@/db";
import { cdekEnabled } from "@/lib/cdek";
import { getActiveConsent } from "@/lib/consent";
import { prettyPhone } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail } from "@/lib/site";
import { getActiveBan, isAdmin, requireUser } from "@/lib/viewer";
import { isPublic } from "@/lib/visibility";
import { yookassaEnabled, yookassaTestMode } from "@/lib/yookassa";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "Оформление заказа", robots: { index: false } };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  if (getActiveBan(user)) redirect("/account");
  if (!(await getActiveConsent(user.id, "PERSONAL_DATA"))) redirect("/consent");

  const [settings, ordersBefore, docs] = await Promise.all([
    getSettings(),
    db.$count(s.order, and(eq(s.order.userId, user.id), ne(s.order.status, "CANCELLED"))),
    db.select().from(s.page).where(inArray(s.page.slug, ["offer", "returns"])),
  ]);
  const published = (slug: string) => docs.some((d) => d.slug === slug && isPublic(d));
  const payments = yookassaEnabled();

  return (
    <section className="container page-pad">
      <h1 className="h2" style={{ marginBottom: 28 }}>
        Оформление
      </h1>
      {settings.checkout.notice && <div className="notice">{settings.checkout.notice}</div>}
      {!payments && (
        <div className="notice notice--muted">
          {isAdmin(user)
            ? "ЮKassa ещё не подключена. Вы админ — заказ создастся, а на его странице будет кнопка тестовой оплаты."
            : "Онлайн-оплата подключается. Пока заказ можно оформить через поддержку в Telegram."}
        </div>
      )}
      {payments && yookassaTestMode() && isAdmin(user) && (
        <div className="notice notice--muted">Тестовый магазин ЮKassa: деньги не списываются. Карта для теста: 5555 5555 5555 4477.</div>
      )}
      <CheckoutForm
        user={{
          name: user.name,
          phone: prettyPhone(user.phone),
          email: isPlaceholderEmail(user.email) ? "" : user.email,
          bonus: user.bonusBalance,
        }}
        canReferral={!user.referredById && ordersBefore === 0}
        delivery={{ pvz: settings.delivery.pvzEnabled, courier: settings.delivery.courierEnabled, cdek: cdekEnabled() }}
        maxPerItem={settings.checkout.maxQtyPerItem}
        canPay={payments || isAdmin(user)}
        testMode={!payments}
        docs={{ offer: published("offer"), returns: published("returns") }}
      />
    </section>
  );
}
