"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { rub } from "@/lib/format";
import { GiftError, issueGiftCard, mailRecipient, refundGiftCard, resendBuyer, voidGiftCard } from "@/lib/giftcards";
import { requireAdmin } from "@/lib/viewer";
import type { ActionState } from "../actions";

const IssueIn = z.object({
  amount: z.coerce.number().int("Сумма — целое число рублей").min(1, "Укажите сумму").max(1_000_000),
  expires: z.string().optional(),
  forever: z.string().optional(),
  recipientName: z.string().trim().max(60).optional(),
  senderName: z.string().trim().max(60).optional(),
  message: z.string().trim().max(300).optional(),
  recipientEmail: z.union([z.literal(""), z.email("Проверьте почту получателя").max(200)]).optional(),
  sendDate: z.string().optional(),
  note: z.string().trim().max(300).optional(),
});

export async function issueGiftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const me = await requireAdmin("OWNER");
  const p = IssueIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  let expiresAt: Date | null = null;
  if (d.forever !== "on") {
    if (!d.expires) return { error: "Укажите, до какого числа действует сертификат, или отметьте «бессрочно»" };
    expiresAt = new Date(`${d.expires}T23:59:59+03:00`);
    if (Number.isNaN(+expiresAt) || expiresAt <= new Date()) return { error: "Срок действия — дата в будущем" };
  }
  let sendAt: Date | null = null;
  if (d.recipientEmail && d.sendDate) {
    const at = new Date(`${d.sendDate}T10:00:00+03:00`);
    if (!Number.isNaN(+at) && at > new Date()) sendAt = at;
  }
  const card = await issueGiftCard(me.id, {
    amount: d.amount * 100,
    expiresAt,
    recipientName: d.recipientName,
    recipientEmail: d.recipientEmail || null,
    senderName: d.senderName,
    message: d.message,
    sendAt,
    note: d.note,
  });
  await audit(me.id, "gift.issue", "gift", card.id, { amount: card.initialAmount, note: d.note || undefined });
  revalidatePath("/admin/gift-cards");
  redirect(`/admin/gift-cards/${card.id}?issued=1`);
}

async function run(id: string, fn: () => Promise<string>): Promise<ActionState> {
  await requireAdmin("OWNER");
  try {
    const ok = await fn();
    revalidatePath(`/admin/gift-cards/${id}`);
    revalidatePath("/admin/gift-cards");
    return { ok };
  } catch (e) {
    if (e instanceof GiftError) return { error: e.message };
    console.error("[gift] admin:", e);
    return { error: e instanceof Error ? e.message : "Не получилось" };
  }
}

export async function voidGiftAction(id: string) {
  return run(id, async () => {
    const me = await requireAdmin("OWNER");
    await voidGiftCard(id);
    await audit(me.id, "gift.void", "gift", id);
    return "Сертификат аннулирован — им больше нельзя платить";
  });
}

export async function refundGiftAction(id: string) {
  return run(id, async () => {
    const me = await requireAdmin("OWNER");
    const amount = await refundGiftCard(id);
    await audit(me.id, "gift.refund", "gift", id, { amount });
    return `Покупателю возвращено ${rub(amount)}, сертификат закрыт`;
  });
}

export async function resendGiftAction(id: string, to: "buyer" | "recipient") {
  return run(id, async () => {
    if (to === "buyer") {
      await resendBuyer(id);
      return "Письмо покупателю отправлено ещё раз";
    }
    const c = await db.query.giftCard.findFirst({ where: eq(s.giftCard.id, id) });
    if (!c?.recipientEmail || c.sentAt) throw new GiftError("Письмо получателю уже отправлено или почты нет");
    await mailRecipient(c);
    return "Письмо получателю отправлено";
  });
}
