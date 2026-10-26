import { asc, eq } from "drizzle-orm";
import { BanModal } from "@/components/BanModal";
import { CartProvider, RefCatcher } from "@/components/cart/CartProvider";
import { PromoTimer } from "@/components/cart/PromoTimer";
import { CompareBar } from "@/components/product/Compare";
import { Analytics } from "@/components/analytics/Analytics";
import { CookieBanner } from "@/components/analytics/CookieBanner";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { TopStrip } from "@/components/banners/TopStrip";
import { activeBanners } from "@/lib/banners";
import { STRIP_COOKIE } from "@/lib/banners-shared";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { db, schema as s } from "@/db";
import { getPublicCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";
import { publicWhere } from "@/lib/visibility";
import { and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);
  const admin = isAdmin(viewer);

  // Режим техработ: покупатели видят заглушку, админы — сайт с предупреждением
  if (settings.maintenance && !admin) {
    return (
      <main className="maintenance">
        <div>
          <Logo id="maint" animated title="Abramov" />
          <h1 className="h2">Скоро вернёмся</h1>
          <p className="muted" style={{ maxWidth: 480, margin: "16px auto 24px" }}>
            {settings.maintenanceMessage}
          </p>
          <a className="btn btn--line" href={`https://t.me/${settings.supportTelegram}`}>
            Написать @{settings.supportTelegram}
          </a>
        </div>
      </main>
    );
  }

  const cueOn = (await import("@/lib/cue").then((m) => m.getCueConfig())).enabled;
  const [footerPages, categories, strip, jar] = await Promise.all([
    db
      .select({ slug: s.page.slug, title: s.page.title })
      .from(s.page)
      .where(and(publicWhere(s.page), eq(s.page.showInFooter, true)))
      .orderBy(asc(s.page.sortOrder)),
    getPublicCategories(),
    activeBanners("STRIP", 5),
    cookies(),
  ]);
  // Объявления, которые посетитель закрыл крестиком, не показываем неделю
  const hidden = new Set(decodeURIComponent(jar.get(STRIP_COOKIE)?.value ?? "").split("."));
  const stripItems = strip.filter((b) => !hidden.has(b.id));

  const ban = admin ? null : getActiveBan(viewer);
  // Номер счётчика Яндекс Метрики — из переменной YANDEX_METRIKA_ID в Timeweb
  const metrikaId = Number(process.env.YANDEX_METRIKA_ID) || null;

  return (
    <CartProvider signedIn={!!viewer}>
      <RefCatcher />
      <PromoTimer />
      <CompareBar />
      <Suspense fallback={null}>
        <Analytics metrikaId={metrikaId} />
      </Suspense>
      <CookieBanner analytics={!!metrikaId} />
      {settings.maintenance && admin && (
        <div className="notice">
          Включён режим техработ — покупатели видят заглушку. <a href="/admin/settings">Выключить</a>
        </div>
      )}
      {settings.pdPause &&
        (admin ? (
          <div className="notice">
            Приём заказов и регистрация на паузе — покупатели видят только каталог. <a href="/admin/settings#pd-pause">Выключить</a>
          </div>
        ) : (
          <div className="notice">{settings.pdPauseMessage}</div>
        ))}
      <div className="ban-shell" inert={ban ? true : undefined}>
        {stripItems.length > 0 && <TopStrip items={stripItems} />}
        <Header signedIn={!!viewer} admin={admin} club={viewer?.role === "CLUB"} cue={cueOn} categories={categories.map((c) => ({ slug: c.slug, name: c.name }))} />
        <main id="main">{children}</main>
        <Footer pages={footerPages} telegram={settings.supportTelegram} email={settings.supportEmail} cue={cueOn} />
      </div>
      {ban && <BanModal reason={ban.reason} until={ban.until} ticket={ban.ticket} telegram={settings.supportTelegram} />}
    </CartProvider>
  );
}
