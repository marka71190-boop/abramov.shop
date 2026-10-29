import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SignOutButton } from "@/components/SignOutButton";
import { requireCoach } from "@/lib/trainings";
import { isAdmin } from "@/lib/viewer";

export const metadata: Metadata = { title: "Кабинет тренера", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const me = await requireCoach();
  return (
    <div className="club-app ym-hide-content">
      <header className="club-app__bar">
        <Link href="/coach" className="brand" aria-label="Кабинет тренера">
          <Logo id="coach" />
          <span className="brand__shop" style={{ fontSize: 16 }}>
            ТРЕНЕР
          </span>
        </Link>
        <div className="row small" style={{ gap: 14 }}>
          <span className="muted">{me.name}</span>
          {isAdmin(me) && <Link href="/admin/coaches">Админка</Link>}
          <Link href="/trenirovki">Расписание на сайте</Link>
          <SignOutButton className="linklike">Выйти</SignOutButton>
        </div>
      </header>
      <main className="container club-app__main">{children}</main>
    </div>
  );
}
