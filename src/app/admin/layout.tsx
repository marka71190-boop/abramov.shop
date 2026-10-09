import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireAdmin } from "@/lib/viewer";
import { AdminNav } from "./AdminNav";

export const metadata: Metadata = { title: "Админка", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

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
        <AdminNav owner={me.role === "OWNER"} />
      </nav>
      <main className="admin__main">{children}</main>
    </div>
  );
}
