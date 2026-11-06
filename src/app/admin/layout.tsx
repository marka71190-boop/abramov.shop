import { and, eq, inArray, or } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { db, schema as s } from "@/db";
import type { BadgeKey } from "@/lib/admin-sections";
import { lowStockCount } from "@/lib/low-stock";
import { openReturnsCount } from "@/lib/returns";
import { rolesOf } from "@/lib/roles";
import { requireAdmin } from "@/lib/viewer";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Админка", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Счётчики в меню: сколько ждёт действия. Ошибка одного счётчика не ломает админку */
async function badges(): Promise<Partial<Record<BadgeKey, number>>> {
  const safe = (p: Promise<number>) => p.catch(() => 0);
  const [orders, returns, stock, questions, reviews, service, orgs, turnkey, coaches] = await Promise.all([
    // Собрать и отправить + заказы из-за рубежа, где ждут расчёт доставки
    safe(db.$count(s.order, or(inArray(s.order.status, ["PAID", "ASSEMBLING"]), and(eq(s.order.status, "AWAITING_PAYMENT"), eq(s.order.shippingPending, true))))),
    safe(openReturnsCount()),
    safe(lowStockCount()),
    safe(db.$count(s.productQuestion, eq(s.productQuestion.status, "NEW"))),
    safe(db.$count(s.review, eq(s.review.status, "PENDING"))),
    safe(db.$count(s.serviceRequest, eq(s.serviceRequest.status, "NEW"))),
    safe(db.$count(s.organization, eq(s.organization.status, "PENDING"))),
    safe(db.$count(s.turnkeyRequest, and(eq(s.turnkeyRequest.status, "NEW")))),
    safe(db.$count(s.coachApplication, eq(s.coachApplication.status, "NEW"))),
  ]);
  return { orders, returns, stock, questions, reviews, service, orgs, turnkey, coaches };
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
        <AdminNav roles={rolesOf(me)} sections={me.role === "OWNER" ? null : (me.adminSections ?? null)} badges={await badges()} />
      </nav>
      <main className="admin__main">{children}</main>
    </div>
  );
}
