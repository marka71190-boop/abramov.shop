/** Вопросы о товаре: что показать в карточке и как сообщить об ответе */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";

export type Question = typeof s.productQuestion.$inferSelect;

/** Опубликованные вопросы с ответами — для всех */
export async function publicQuestions(productId: string) {
  return db.query.productQuestion.findMany({
    where: and(eq(s.productQuestion.productId, productId), eq(s.productQuestion.status, "PUBLISHED")),
    with: { user: { columns: { name: true } } },
    orderBy: desc(s.productQuestion.answeredAt),
    limit: 100,
  });
}

/** Свои вопросы, которые ещё ждут ответа, — видит только автор */
export async function myPendingQuestions(userId: string, productId: string) {
  return db.query.productQuestion.findMany({
    where: and(eq(s.productQuestion.productId, productId), eq(s.productQuestion.userId, userId), eq(s.productQuestion.status, "NEW")),
    orderBy: desc(s.productQuestion.createdAt),
  });
}

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Ответ готов: письмо автору, Telegram и уведомление на телефон (если подключены) */
export async function notifyAnswered(questionId: string) {
  try {
    const q = await db.query.productQuestion.findFirst({
      where: eq(s.productQuestion.id, questionId),
      with: { user: { columns: { id: true, email: true } }, product: { columns: { name: true, slug: true } } },
    });
    if (!q?.user || !q.answer) return;
    const url = `${SITE.url}/product/${q.product.slug}#questions`;
    const { notifyUser, esc } = await import("@/lib/telegram");
    void notifyUser(q.user.id, `💬 Ответили на ваш вопрос о «${esc(q.product.name)}»`, { text: "Посмотреть ответ", url });
    const { sendMail } = await import("@/lib/mail");
    await sendMail(
      q.user.email,
      `Ответ на ваш вопрос о «${q.product.name}»`,
      "Ответили на ваш вопрос",
      `<b>${escHtml(q.product.name)}</b><br><br><span style="color:#a3a3a8">Вы спросили:</span><br>${escHtml(q.text).replace(/\n/g, "<br>")}<br><br><span style="color:#a3a3a8">Ответ Abramov Shop:</span><br>${escHtml(q.answer).replace(/\n/g, "<br>")}`,
      { text: "Открыть товар", url },
    ).catch((e) => console.error("[questions] письмо:", e));
  } catch (e) {
    console.error("[questions] уведомление:", e instanceof Error ? e.message : e);
  }
}
