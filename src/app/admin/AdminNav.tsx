"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_GROUPS, canSee, sectionOf, type BadgeKey } from "@/lib/admin-sections";

const OPEN_KEY = "admin-nav-open";

/**
 * Меню админки: разделы по группам, редко нужные группы свёрнуты.
 * Счётчик у пункта — сколько ждёт действия. На телефоне — кнопка «Меню» и выдвижная панель.
 */
export function AdminNav({ role, sections, badges }: { role: string; sections: string[] | null; badges: Partial<Record<BadgeKey, number>> }) {
  const path = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
      if (v && typeof v === "object") setOpen(v);
    } catch {}
  }, []);
  // Перешли на страницу — закрываем меню на телефоне
  useEffect(() => setDrawer(false), [path]);

  const toggle = (k: string, now: boolean) => {
    const next = { ...open, [k]: !now };
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {}
  };

  const current = sectionOf(path);
  const groups = ADMIN_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(role, sections, i)) })).filter((g) => g.items.length);
  const total = groups.flatMap((g) => g.items).reduce((a, i) => a + (i.badge ? (badges[i.badge] ?? 0) : 0), 0);

  return (
    <>
      <button type="button" className="admin-nav__toggle" aria-expanded={drawer} onClick={() => setDrawer((d) => !d)}>
        <span aria-hidden="true">☰</span> Меню
        {current && <span className="admin-nav__here">· {current.label}</span>}
        {total > 0 && <span className="admin-badge">{total}</span>}
      </button>
      <div className={`admin-nav${drawer ? " is-open" : ""}`}>
        {groups.map((g) => {
          const hasCurrent = g.items.some((i) => i.key === current?.key);
          const isOpen = hasCurrent || (open[g.key] ?? !g.collapsed);
          const groupBadge = g.items.reduce((a, i) => a + (i.badge ? (badges[i.badge] ?? 0) : 0), 0);
          return (
            <div key={g.key} className="admin-nav__group">
              <button type="button" className="admin-nav__head" aria-expanded={isOpen} onClick={() => toggle(g.key, isOpen)} disabled={hasCurrent}>
                <span>{g.label}</span>
                {!isOpen && groupBadge > 0 && <span className="admin-badge">{groupBadge}</span>}
                <span className="admin-nav__chev" aria-hidden="true">
                  {isOpen ? "–" : "+"}
                </span>
              </button>
              {isOpen &&
                g.items.map((i) => {
                  const n = i.badge ? (badges[i.badge] ?? 0) : 0;
                  return (
                    <Link key={i.key} href={i.href} aria-current={i.key === current?.key ? "page" : undefined}>
                      <span>{i.label}</span>
                      {n > 0 && <span className="admin-badge">{n}</span>}
                    </Link>
                  );
                })}
            </div>
          );
        })}
        <Link href="/" className="admin-nav__site">
          ← На сайт
        </Link>
      </div>
    </>
  );
}
