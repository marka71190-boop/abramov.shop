import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { requireCashier } from "@/lib/viewer";

export const metadata: Metadata = { title: "Касса", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Раздел кассира: только касса, без админки */
export default async function KassaLayout({ children }: { children: React.ReactNode }) {
  const { me, admin } = await requireCashier();
  return (
    <div className="club-app">
      <header className="club-app__bar">
        <Link href="/kassa" className="brand" aria-label="Касса">
          <Logo id="kassa" />
          <span className="brand__shop" style={{ fontSize: 16 }}>
            КАССА
          </span>
        </Link>
        <div className="row small" style={{ gap: 14 }}>
          <span className="muted">{me.name}</span>
          {admin && <Link href="/admin">Админка</Link>}
          {!me.isDevice && <Link href="/">На сайт</Link>}
          <SignOutButton className="linklike" to={me.isDevice ? "/kassa/login" : "/"}>
            Выйти
          </SignOutButton>
        </div>
      </header>
      <main className="container club-app__main stack" style={{ gap: 16 }}>
        {children}
      </main>
    </div>
  );
}
