import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { db, schema as s } from "@/db";
import type { BadgeKey } from "@/lib/admin-sections";
import { lowStockCount } from "@/lib/low-stock";
import { openReturnsCount } from "@/lib/returns";
import { requireAdmin } from "@/lib/viewer";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Админка", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Счётчики в меню: сколько ждёт действия. Ошибка одного счётчика не ломает админку */
async function badges(): Promise<Partial<Record<BadgeKey, number>>> {
  const safe = (p: Promise<number>) => p.catch(() => 0);
  const [orders, returns, stock, questions, reviews, service, orgs, turnkey] = await Promise.all([
    safe(db.$count(s.order, inArray(s.order.status, ["PAID", "ASSEMBLING"]))),
    safe(openReturnsCount()),
    safe(lowStockCount()),
    safe(db.$count(s.productQuestion, eq(s.productQuestion.status, "NEW"))),
    safe(db.$count(s.review, eq(s.review.status, "PENDING"))),
    safe(db.$count(s.serviceRequest, eq(s.serviceRequest.status, "NEW"))),
    safe(db.$count(s.organization, eq(s.organization.status, "PENDING"))),
    safe(db.$count(s.turnkeyRequest, and(eq(s.turnkeyRequest.status, "NEW")))),
  ]);
  return { orders, returns, stock, questions, reviews, service, orgs, turnkey };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdmin();
  return (
    <div className="admin">
      <nav className="admin__side" aria-label="Разделы админки">
        <Link href="/admin" className="brand">
          <Logo id="admin" />
          <span className="brand__shop" style={{ fontSize: 16 }}>
            ADMIN
          </span>
        </Link>
        <AdminNav role={me.role} sections={me.role === "MANAGER" ? (me.adminSections ?? null) : null} badges={await badges()} />
      </nav>
      <main className="admin__main">{children}</main>
    </div>
  );
}
