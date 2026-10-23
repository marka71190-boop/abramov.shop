import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { requireClubStaff } from "@/lib/club-staff";

export const metadata: Metadata = { title: "Клуб — выдача и мастерская", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ClubLayout({ children }: { children: React.ReactNode }) {
  const { me, admin } = await requireClubStaff();
  return (
    <div className="club-app ym-hide-content">
      <header className="club-app__bar">
        <Link href="/club" className="brand" aria-label="Раздел клуба">
          <Logo id="club" />
          <span className="brand__shop" style={{ fontSize: 16 }}>
            КЛУБ
          </span>
        </Link>
        <div className="row small" style={{ gap: 14 }}>
          <span className="muted">{me.name}</span>
          {admin && <Link href="/admin">Админка</Link>}
          <Link href="/">На сайт</Link>
          <SignOutButton className="linklike">Выйти</SignOutButton>
        </div>
      </header>
      <main className="container club-app__main">{children}</main>
    </div>
  );
}
