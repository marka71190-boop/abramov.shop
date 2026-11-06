"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { audit } from "@/lib/audit";
import { ApplyError, GAMES, RANKS, submitApplication } from "@/lib/coach-apply";
import { requireUser } from "@/lib/viewer";

export type ApplyState = { ok?: boolean; error?: string; values?: Record<string, string | string[]> };

const In = z.object({
  fullName: z.string().trim().min(5, "Укажите фамилию, имя и отчество").max(120),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[^\d+]/g, ""))
    .pipe(z.string().regex(/^\+?\d{10,12}$/, "Телефон — например +7 900 123-45-67")),
  city: z.string().trim().max(80).optional(),
  rank: z.string().refine((v) => !v || RANKS.includes(v), "Выберите звание из списка").optional(),
  games: z.array(z.string().refine((v) => GAMES.includes(v))).max(10),
  coachYears: z.coerce.number().int().min(0).max(70).optional(),
  achievements: z.string().trim().max(2000).optional(),
  about: z.string().trim().min(30, "Расскажите о себе и тренировках — хотя бы пару предложений").max(3000),
  clubIds: z.array(z.string().max(64)).min(1, "Отметьте хотя бы один наш клуб, где будете тренировать").max(30),
  price: z.coerce.number().min(0).max(100000).optional(),
  links: z.string().trim().max(500).optional(),
  clubsOnly: z.literal("on", { message: "Подтвердите, что тренировки — только в наших клубах" }),
});

export async function applyCoach(_: ApplyState, fd: FormData): Promise<ApplyState> {
  const me = await requireUser("/trenirovki/stat-trenerom");
  const raw: Record<string, string | string[]> = {
    ...Object.fromEntries([...fd.entries()].filter(([k]) => !["games", "clubIds"].includes(k)).map(([k, v]) => [k, String(v)])),
    games: fd.getAll("games").map(String),
    clubIds: fd.getAll("clubIds").map(String),
  };
  const values = raw;
  const p = In.safeParse({ ...raw, coachYears: raw.coachYears || undefined, price: raw.price || undefined, rank: raw.rank || undefined });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте заявку", values };
  const d = p.data;
  const clubs = await db.query.club.findMany({ columns: { id: true, isActive: true } });
  const clubIds = d.clubIds.filter((id) => clubs.some((c) => c.id === id && c.isActive));
  if (!clubIds.length) return { error: "Отметьте хотя бы один наш клуб", values };
  try {
    const row = await submitApplication(me.id, {
      fullName: d.fullName,
      phone: d.phone,
      city: d.city || null,
      rank: d.rank || null,
      games: d.games,
      coachYears: d.coachYears ?? null,
      achievements: d.achievements || null,
      about: d.about,
      clubIds,
      pricePerHour: d.price ? Math.round(d.price * 100) : null,
      links: d.links || null,
      clubsOnlyAccepted: true,
    });
    await audit(me.id, "coach.apply", "coach_application", row.id);
  } catch (e) {
    return { error: e instanceof ApplyError ? e.message : "Не получилось отправить заявку. Попробуйте ещё раз", values };
  }
  revalidatePath("/trenirovki/stat-trenerom");
  revalidatePath("/admin/coaches");
  return { ok: true };
}

