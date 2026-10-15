"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelReturn, createReturn, ReturnError } from "@/lib/returns";
import { requireActiveUser } from "@/lib/viewer";

const In = z.object({
  orderNumber: z.string().max(40),
  kind: z.enum(["QUALITY", "DEFECT"]),
  resolution: z.enum(["REFUND", "EXCHANGE", "DISCOUNT"]),
  reason: z.string().trim().min(2, "Выберите причину").max(120),
  comment: z.string().trim().max(2000).default(""),
  photos: z.array(z.string().regex(/^\/media\/[0-9a-f-]{36}$/)).max(5),
  items: z.array(z.object({ orderItemId: z.string().max(64), quantity: z.number().int().min(0).max(999) })).max(50),
});

export async function submitReturn(input: z.input<typeof In>): Promise<{ error?: string; number?: string }> {
  const u = await requireActiveUser();
  const p = In.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Проверьте форму" };
  if (p.data.reason === "Другое" && p.data.comment.length < 5) return { error: "Опишите причину в комментарии" };
  try {
    // Без revalidatePath: страницы кабинета и заказа и так собираются заново при каждом заходе,
    // а обновление текущей страницы стёрло бы сообщение об успехе
    const r = await createReturn(u.id, p.data);
    return { number: r.number };
  } catch (e) {
    if (e instanceof ReturnError) return { error: e.message };
    console.error("[returns] create:", e);
    return { error: "Не удалось отправить заявку. Попробуйте ещё раз или напишите в поддержку" };
  }
}

export async function cancelMyReturn(number: string): Promise<{ error?: string }> {
  const u = await requireActiveUser();
  try {
    await cancelReturn(u.id, number);
    revalidatePath("/account");
    return {};
  } catch (e) {
    return { error: e instanceof ReturnError ? e.message : "Не удалось отменить" };
  }
}
