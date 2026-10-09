import { asc, eq } from "drizzle-orm";
import { BanModal } from "@/components/BanModal";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { db, schema as s } from "@/db";
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

  const footerPages = await db
    .select({ slug: s.page.slug, title: s.page.title })
    .from(s.page)
    .where(and(publicWhere(s.page), eq(s.page.showInFooter, true)))
    .orderBy(asc(s.page.sortOrder));

  const ban = admin ? null : getActiveBan(viewer);

  return (
    <>
      {settings.maintenance && admin && (
        <div className="notice">
          Включён режим техработ — покупатели видят заглушку. <a href="/admin/settings">Выключить</a>
        </div>
      )}
      <div className="ban-shell" inert={ban ? true : undefined}>
        <Header signedIn={!!viewer} admin={admin} />
        <main id="main">{children}</main>
        <Footer pages={footerPages} telegram={settings.supportTelegram} email={settings.supportEmail} />
      </div>
      {ban && <BanModal reason={ban.reason} until={ban.until} ticket={ban.ticket} telegram={settings.supportTelegram} />}
    </>
  );
}
