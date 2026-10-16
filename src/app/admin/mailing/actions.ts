"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { audit } from "@/lib/audit";
import { cancelCampaign, processCampaigns, sendTest, startCampaign } from "@/lib/campaigns";
import { requireAdmin } from "@/lib/viewer";

export type MailingState = { error?: string; ok?: string };

const CampaignIn = z.object({
  id: z.string().optional(),
  promoCodeId: z.string().optional(),
  subject: z.string().trim().min(3, "Напишите тему письма").max(150, "Тема слишком длинная — до 150 символов"),
  title: z.string().trim().min(2, "Напишите заголовок").max(120),
  body: z.string().trim().max(4000, "Текст слишком длинный — до 4000 символов").default(""),
  buttonText: z.string().trim().max(40).optional(),
  buttonUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || /^(\/[^\s"<>]*|https:\/\/[^\s"<>]+)$/.test(v), "Ссылка кнопки: адрес на сайте вида /catalog или полная ссылка https://…")
    .optional(),
});

export async function saveCampaign(_: MailingState, form: FormData): Promise<MailingState> {
  const me = await requireAdmin("OWNER");
  const p = CampaignIn.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message };
  const d = p.data;
  const channelEmail = form.get("channelEmail") === "on";
  const channelTelegram = form.get("channelTelegram") === "on";
  if (!channelEmail && !channelTelegram) return { error: "Выберите, куда отправлять: почта или Telegram" };
  const values = {
    subject: d.subject,
    title: d.title,
    body: d.body,
    promoCodeId: d.promoCodeId || null,
    buttonText: d.buttonText || null,
    buttonUrl: d.buttonUrl || null,
    channelEmail,
    channelTelegram,
    onlyVerified: form.get("onlyVerified") === "on",
  };
  let id = d.id;
  if (id) {
    const [row] = await db
      .update(s.campaign)
      .set(values)
      .where(and(eq(s.campaign.id, id), eq(s.campaign.status, "DRAFT")))
      .returning({ id: s.campaign.id });
    if (!row) return { error: "Рассылка уже запущена — изменить её нельзя. Сделайте копию." };
  } else {
    const [row] = await db
      .insert(s.campaign)
      .values({ ...values, createdById: me.id })
      .returning({ id: s.campaign.id });
    id = row.id;
    await audit(me.id, "campaign.create", "campaign", id, { subject: d.subject });
  }
  revalidatePath("/admin/mailing");
  redirect(`/admin/mailing/${id}?saved=1`);
}

async function draft(id: string) {
  const c = await db.query.campaign.findFirst({ where: eq(s.campaign.id, id) });
  if (!c) throw new Error("Рассылка не найдена");
  return c;
}

export async function testCampaign(id: string): Promise<MailingState> {
  const me = await requireAdmin("OWNER");
  try {
    const done = await sendTest(await draft(id), me);
    if (!done.length) return { error: "Некуда отправить тест: у вас не указана почта или не подключён Telegram" };
    return { ok: `Отправлено: ${done.join(" и ")}. Проверьте, как выглядит.` };
  } catch (e) {
    return { error: `Не удалось отправить: ${e instanceof Error ? e.message : e}` };
  }
}

export async function launchCampaign(id: string): Promise<MailingState> {
  const me = await requireAdmin("OWNER");
  const c = await draft(id);
  if (c.status !== "DRAFT") return { error: "Рассылка уже запущена" };
  try {
    const total = await startCampaign(c);
    await audit(me.id, "campaign.start", "campaign", id, { subject: c.subject, total });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  // Первую партию отправляем сразу, дальше — фоновая задача раз в минуту
  void processCampaigns().catch((e) => console.error("[mailing]", e));
  revalidatePath(`/admin/mailing/${id}`);
  revalidatePath("/admin/mailing");
  return { ok: "Рассылка запущена" };
}

export async function stopCampaign(id: string): Promise<MailingState> {
  const me = await requireAdmin("OWNER");
  await cancelCampaign(id);
  await audit(me.id, "campaign.stop", "campaign", id);
  revalidatePath(`/admin/mailing/${id}`);
  return { ok: "Рассылка остановлена" };
}

export async function deleteCampaign(id: string) {
  const me = await requireAdmin("OWNER");
  await db.delete(s.campaign).where(and(eq(s.campaign.id, id), eq(s.campaign.status, "DRAFT")));
  await audit(me.id, "campaign.delete", "campaign", id);
  redirect("/admin/mailing");
}

/** Копия любой рассылки в новый черновик — чтобы повторить или поправить запущенную. */
export async function copyCampaign(id: string) {
  const me = await requireAdmin("OWNER");
  const c = await draft(id);
  const [row] = await db
    .insert(s.campaign)
    .values({
      subject: c.subject,
      title: c.title,
      body: c.body,
      promoCodeId: c.promoCodeId,
      buttonText: c.buttonText,
      buttonUrl: c.buttonUrl,
      channelEmail: c.channelEmail,
      channelTelegram: c.channelTelegram,
      onlyVerified: c.onlyVerified,
      createdById: me.id,
    })
    .returning({ id: s.campaign.id });
  redirect(`/admin/mailing/${row.id}`);
}
