/** Баннеры — серверная часть: что показывать сейчас */
import "server-only";
import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { BannerPlace, PublicBanner } from "@/lib/banners-shared";
import { safeUrl } from "@/lib/banners-shared";

/** Включённые баннеры, у которых наступило время показа и не закончилось */
export async function activeBanners(place: BannerPlace, limit = 8): Promise<PublicBanner[]> {
  const now = new Date();
  try {
    const rows = await db
      .select()
      .from(s.banner)
      .where(
        and(
          eq(s.banner.place, place),
          eq(s.banner.isActive, true),
          or(isNull(s.banner.startsAt), lte(s.banner.startsAt, now)),
          or(isNull(s.banner.endsAt), gt(s.banner.endsAt, now)),
        ),
      )
      .orderBy(asc(s.banner.sortOrder), desc(s.banner.createdAt))
      .limit(limit);
    return rows
      .map((b) => ({
        id: b.id,
        label: b.label,
        title: b.title,
        text: b.text,
        image: b.image,
        imageMobile: b.imageMobile,
        buttonText: b.buttonText,
        url: safeUrl(b.url),
        tone: b.tone,
        endsAt: b.endsAt ? +b.endsAt : null,
        countdown: b.countdown && !!b.endsAt,
      }))
      .filter((b) => (place === "HOME" ? !!(b.image || b.title) : !!(b.title || b.text)));
  } catch (e) {
    // Баннеры не должны ронять страницу (например, до применения миграции)
    console.error("[banners]", e);
    return [];
  }
}

/** Состояние баннера для админки */
export function bannerState(b: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()) {
  if (!b.isActive) return { key: "off", label: "Выключен" } as const;
  if (b.endsAt && b.endsAt <= now) return { key: "ended", label: "Показ закончился" } as const;
  if (b.startsAt && b.startsAt > now) return { key: "soon", label: "Запланирован" } as const;
  return { key: "live", label: "Показывается" } as const;
}
