"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { notifyAnswered } from "@/lib/questions";
import { requireAdmin } from "@/lib/viewer";

const In = z.object({
  id: z.string().max(64),
  text: z.string().trim().min(2, "Вопрос пустой").max(1000),
  answer: z.string().trim().max(3000).default(""),
  publish: z.string().optional(),
});

/** Ответить / поправить вопрос (например, убрать телефон) / показать или скрыть */
export async function saveQuestion(_: { ok?: string; error?: string }, form: FormData): Promise<{ ok?: string; error?: string }> {
  const me = await requireAdmin();
  const p = In.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const q = await db.query.productQuestion.findFirst({ where: eq(s.productQuestion.id, d.id), with: { product: { columns: { slug: true } } } });
  if (!q) return { error: "Вопрос не найден" };
  const publish = d.publish === "on";
  if (publish && !d.answer) return { error: "Чтобы показать вопрос на сайте, напишите ответ" };
  const firstAnswer = !q.answer && !!d.answer;
  await db
    .update(s.productQuestion)
    .set({
      text: d.text.replace(/\r\n/g, "\n"),
      answer: d.answer ? d.answer.replace(/\r\n/g, "\n") : null,
      answeredAt: d.answer ? (q.answeredAt ?? new Date()) : null,
      answeredById: d.answer ? (q.answeredById ?? me.id) : null,
      status: d.answer ? (publish ? "PUBLISHED" : "HIDDEN") : "NEW",
    })
    .where(eq(s.productQuestion.id, d.id));
  await audit(me.id, firstAnswer ? "question.answer" : "question.update", "product_question", d.id, { publish });
  if (firstAnswer) void notifyAnswered(d.id);
  revalidatePath(`/product/${q.product.slug}`);
  revalidatePath("/admin/questions");
  return { ok: firstAnswer ? "Ответ сохранён — покупателю ушло уведомление" : "Сохранено" };
}

export async function deleteQuestion(id: string) {
  const me = await requireAdmin("OWNER");
  const q = await db.query.productQuestion.findFirst({ where: eq(s.productQuestion.id, id), with: { product: { columns: { slug: true } } } });
  if (!q) return;
  await db.delete(s.productQuestion).where(eq(s.productQuestion.id, id));
  await audit(me.id, "question.delete", "product_question", id);
  revalidatePath(`/product/${q.product.slug}`);
  revalidatePath("/admin/questions");
}
