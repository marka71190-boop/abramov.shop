"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/viewer";

export async function toggleCoach(userId: string) {
  const me = await requireAdmin();
  const p = await db.query.coachProfile.findFirst({ where: eq(s.coachProfile.userId, userId) });
  if (!p) return;
  await db.update(s.coachProfile).set({ isPublished: !p.isPublished }).where(eq(s.coachProfile.userId, userId));
  await audit(me.id, p.isPublished ? "coach.hide" : "coach.show", "user", userId);
  revalidatePath("/admin/coaches");
  revalidatePath("/trenirovki", "layout");
}
