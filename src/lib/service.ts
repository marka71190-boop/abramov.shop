/**
 * Мастерская: заявки на замену наклейки, ремонт и реставрацию киёв.
 *
 * Как работает:
 *   • покупатель выбирает услуги из прайса, описывает проблему (можно с фото) и способ: принести в клуб или прислать СДЭК;
 *   • мастер принимает кий, ставит итоговую цену и срок, отмечает этапы (с комментарием и фото) — покупателю письмо;
 *   • оплата — онлайн по ссылке (ЮKassa, чек «услуга») или на месте в клубе;
 *   • вернуть — в клубе или СДЭК.
 * В Telegram — только номер заявки и этап, без имени, телефона и адреса.
 */
import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { fmtDate, rub } from "@/lib/format";
import { escHtml, mailEnabled, sendMail } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { createPaymentFor, fromMoney, getPayment, yookassaEnabled, type YkPayment } from "@/lib/yookassa";

export type ServiceStatus = "NEW" | "RECEIVED" | "IN_WORK" | "READY" | "DONE" | "CANCELLED";
export type ServiceRow = typeof s.serviceRequest.$inferSelect;

export const SERVICE_STATUS: Record<ServiceStatus, { text: string; tone: "dim" | "gold" | "ok" | "bad" }> = {
  NEW: { text: "Ждём кий", tone: "dim" },
  RECEIVED: { text: "Кий у мастера", tone: "gold" },
  IN_WORK: { text: "В работе", tone: "gold" },
  READY: { text: "Готов", tone: "ok" },
  DONE: { text: "Выдан", tone: "ok" },
  CANCELLED: { text: "Отменена", tone: "bad" },
};

export class ServiceError extends Error {}

const abs = (url: string) => (url.startsWith("/") ? `${SITE.url}${url}` : url);

function serviceNumber() {
  const msk = new Date(Date.now() + 3 * 3600_000);
  const day = msk.toISOString().slice(2, 10).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => abc[b % abc.length]).join("");
  return `RM-${day}-${tail}`;
}

export async function servicePrices(all = false) {
  return db.query.serviceItem.findMany({
    where: all ? undefined : eq(s.serviceItem.isActive, true),
    orderBy: [asc(s.serviceItem.sortOrder), asc(s.serviceItem.name)],
  });
}

export interface ServiceInput {
  itemIds: string[];
  description: string;
  photos: string[];
  name: string;
  phone: string;
  email: string;
  handover: "CLUB" | "CDEK";
  clubId?: string | null;
  returnMethod: "CLUB" | "CDEK";
  returnAddress?: string | null;
}

export async function createServiceRequest(userId: string, input: ServiceInput) {
  const settings = await getSettings();
  if (!settings.service.enabled) throw new ServiceError("Приём заявок в мастерскую временно приостановлен");
  const prices = await servicePrices();
  const items = prices.filter((p) => input.itemIds.includes(p.id));
  if (!items.length) throw new ServiceError("Выберите, что нужно сделать");
  const { getClub } = await import("@/lib/clubs");
  const club = input.clubId ? await getClub(input.clubId) : null;
  if ((input.handover === "CLUB" || input.returnMethod === "CLUB") && (!club || !club.isActive || !club.service)) throw new ServiceError("Выберите клуб");
  if (input.handover === "CDEK" && !settings.service.cdekAddress.trim()) throw new ServiceError("Отправка СДЭК пока не настроена — принесите кий в клуб");
  if (input.returnMethod === "CDEK" && (input.returnAddress ?? "").trim().length < 5) throw new ServiceError("Укажите, куда отправить кий: город и пункт СДЭК или адрес");

  let row: ServiceRow | undefined;
  for (let i = 0; i < 5 && !row; i++) {
    [row] = await db
      .insert(s.serviceRequest)
      .values({
        number: serviceNumber(),
        userId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        items: items.map((p) => ({ id: p.id, name: p.name, price: p.price, priceFrom: p.priceFrom, days: p.days })),
        description: input.description.trim().slice(0, 2000),
        photos: input.photos.slice(0, 6),
        handover: input.handover,
        clubId: club?.id ?? null,
        returnMethod: input.returnMethod,
        returnAddress: input.returnMethod === "CDEK" ? input.returnAddress!.trim().slice(0, 300) : null,
      })
      .onConflictDoNothing()
      .returning();
  }
  if (!row) throw new ServiceError("Не удалось создать заявку — попробуйте ещё раз");
  await db.insert(s.serviceEvent).values({ requestId: row.id, status: "NEW" });
  await auditSystem(userId, "service.create", "service", row.id, { number: row.number });
  void mailCustomer(row, "NEW", null, null).catch((e) => console.error("[service] письмо:", e));
  void notifyAdminsNew(row).catch(() => {});
  void import("@/lib/club-staff").then((m) => m.notifyClubService(row, "NEW")).catch(() => {});
  return row;
}

export async function serviceEvents(requestId: string) {
  return db.query.serviceEvent.findMany({ where: eq(s.serviceEvent.requestId, requestId), orderBy: asc(s.serviceEvent.createdAt) });
}

export async function userRequests(userId: string) {
  return db.query.serviceRequest.findMany({ where: eq(s.serviceRequest.userId, userId), orderBy: desc(s.serviceRequest.createdAt), limit: 20 });
}

/** Ориентировочная сумма по прайсу (если цену ещё не назвал мастер) */
export const estimate = (r: Pick<ServiceRow, "items">) => r.items.reduce((a, i) => a + i.price, 0);
export const isEstimateFrom = (r: Pick<ServiceRow, "items">) => r.items.some((i) => i.priceFrom);

/** Мастер отмечает этап: комментарий и фото видит покупатель */
export async function setServiceStatus(
  id: string,
  status: ServiceStatus,
  opts: { note?: string | null; photo?: string | null; price?: number | null; readyBy?: Date | null; actorId: string },
) {
  const r = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.id, id) });
  if (!r) throw new ServiceError("Заявка не найдена");
  if (r.status === "DONE" || r.status === "CANCELLED") throw new ServiceError("Заявка уже закрыта");
  const note = opts.note?.trim().slice(0, 1000) || null;
  const photo = opts.photo && /^(\/|https:\/\/)[^\s"<>]+$/.test(opts.photo) ? opts.photo : null;
  const patch: Partial<ServiceRow> = { status, updatedAt: new Date() };
  if (opts.price != null) patch.price = opts.price;
  if (opts.readyBy !== undefined) patch.readyBy = opts.readyBy;
  const [next] = await db.update(s.serviceRequest).set(patch).where(eq(s.serviceRequest.id, id)).returning();
  await db.insert(s.serviceEvent).values({ requestId: id, status, note, photo, createdById: opts.actorId });
  await mailCustomer(next, status, note, photo).catch((e) => console.error("[service] письмо:", e));
  await tgCustomer(next, status).catch(() => {});
  if (status === "READY" || status === "CANCELLED") void import("@/lib/club-staff").then((m) => m.notifyClubService(next, status)).catch(() => {});
  return next;
}

/** Цена и срок без смены этапа (письмо не шлём) */
export async function updateServiceTerms(id: string, price: number | null, readyBy: Date | null) {
  await db.update(s.serviceRequest).set({ price, readyBy, updatedAt: new Date() }).where(eq(s.serviceRequest.id, id));
}

/** Счёт на оплату онлайн: ссылка ЮKassa, письмо покупателю */
export async function billService(id: string) {
  const r = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.id, id) });
  if (!r) throw new ServiceError("Заявка не найдена");
  if (!r.price || r.price < 100) throw new ServiceError("Сначала укажите итоговую цену");
  if (r.paidAt) throw new ServiceError("Заявка уже оплачена");
  if (!yookassaEnabled()) throw new ServiceError("ЮKassa не подключена — отметьте оплату на месте");
  const attempt = Date.now().toString(36);
  const p = await createPaymentFor({
    key: `svc-${r.id}-${r.price}-${attempt}`,
    amount: r.price,
    returnUrl: `${SITE.url}/service/${r.number}?from=pay`,
    description: `Мастерская Abramov, заявка ${r.number}`,
    metadata: { shop: "abramov.shop", asServiceId: r.id },
    customer: { email: r.email, phone: r.phone },
    receipt: [{ name: `Ремонт кия по заявке ${r.number}: ${r.items.map((i) => i.name).join(", ")}`.slice(0, 128), quantity: 1, price: r.price, kind: "service" }],
  });
  const url = p.confirmation!.confirmation_url!;
  await db.update(s.serviceRequest).set({ paymentId: p.id, paymentStatus: "PENDING", payUrl: url, updatedAt: new Date() }).where(eq(s.serviceRequest.id, r.id));
  if (mailEnabled() && !isPlaceholderEmail(r.email)) {
    await sendMail(
      r.email,
      `Оплата по заявке ${r.number} — ${rub(r.price)}`,
      "Счёт на оплату",
      `Стоимость работ по заявке <b>${escHtml(r.number)}</b>: <b>${rub(r.price)}</b>.<br><br>Оплатить можно картой, через СБП или SberPay — чек придёт на почту.`,
      { text: `Оплатить ${rub(r.price)}`, url },
    ).catch((e) => console.error("[service] счёт:", e));
  }
  return url;
}

export async function markServicePaidOffline(id: string, actorId: string) {
  await db
    .update(s.serviceRequest)
    .set({ paymentStatus: "OFFLINE", paidAt: new Date(), updatedAt: new Date() })
    .where(and(eq(s.serviceRequest.id, id)));
  await auditSystem(actorId, "service.paid_offline", "service", id);
}

/** Уведомление ЮKassa или возврат покупателя со страницы оплаты */
export async function applyServicePayment(p: YkPayment) {
  const r = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.paymentId, p.id) });
  if (!r || r.paidAt) return r?.id ?? null;
  if (p.status === "succeeded" && r.price && fromMoney(p.amount) >= r.price) {
    const [done] = await db
      .update(s.serviceRequest)
      .set({ paymentStatus: "SUCCEEDED", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(s.serviceRequest.id, r.id))
      .returning();
    await auditSystem(null, "service.paid", "service", r.id, { amount: r.price });
    const { notifyAdmins } = await import("@/lib/telegram");
    await notifyAdmins(`💳 Оплачена заявка в мастерскую <b>${r.number}</b> — ${rub(r.price)}`, { text: "Открыть", url: `${SITE.url}/admin/service/${r.id}` });
    return done.id;
  }
  if (p.status === "canceled") await db.update(s.serviceRequest).set({ paymentStatus: "CANCELED" }).where(eq(s.serviceRequest.id, r.id));
  return r.id;
}

export async function syncServicePayment(r: ServiceRow) {
  if (!r.paymentId || r.paidAt || !yookassaEnabled()) return;
  try {
    await applyServicePayment(await getPayment(r.paymentId));
  } catch (e) {
    console.error("[service] sync:", e);
  }
}

// ---------- Письма и Telegram

async function clubInfo(clubId: string | null) {
  if (!clubId) return null;
  const { getClub, clubMapUrl } = await import("@/lib/clubs");
  const c = await getClub(clubId);
  return c ? { ...c, map: clubMapUrl(c) } : null;
}

async function mailCustomer(r: ServiceRow, status: ServiceStatus, note: string | null, photo: string | null) {
  if (!mailEnabled() || isPlaceholderEmail(r.email)) return;
  const url = `${SITE.url}/service/${r.number}`;
  const club = await clubInfo(r.clubId);
  const settings = await getSettings();
  const clubHtml = club
    ? `<b>${escHtml(club.name)}</b><br>${escHtml(club.city)}, ${escHtml(club.address)}${club.workTime ? `<br><span style="color:#a3a3a8">${escHtml(club.workTime)}</span>` : ""}<br><a href="${club.map}" style="color:#dcbf83">Как добраться →</a>`
    : "";
  const noteHtml = note ? `<div style="margin:16px 0;padding:14px 16px;border-left:3px solid #dcbf83;background:#1a1a1d;color:#f3f2ef">${escHtml(note).replace(/\n/g, "<br>")}<div style="color:#a3a3a8;font-size:12px;margin-top:6px">— мастер</div></div>` : "";
  const photoHtml = photo ? `<div style="margin:16px 0"><img src="${escHtml(abs(photo))}" alt="Фото" style="display:block;width:100%;max-width:536px;height:auto;border:1px solid #2a2a2a"></div>` : "";
  const terms =
    (r.price ? `Стоимость работ: <b>${rub(r.price)}</b>.` : "") + (r.readyBy ? `${r.price ? " " : ""}Будет готов к <b>${fmtDate(r.readyBy)}</b>.` : "");
  let title = "";
  let body = "";
  if (status === "NEW") {
    title = "Заявка в мастерскую принята";
    body =
      `Номер заявки — <b>${escHtml(r.number)}</b>. Работы: ${escHtml(r.items.map((i) => i.name).join(", "))}.<br><br>` +
      (r.handover === "CLUB"
        ? `Принесите кий в клуб и назовите номер заявки администратору:<br>${clubHtml}`
        : `Отправьте кий СДЭК (в тубусе или жёсткой упаковке) по адресу:<br><b>${escHtml(settings.service.cdekAddress).replace(/\n/g, "<br>")}</b><br>В комментарии к отправлению укажите номер заявки <b>${escHtml(r.number)}</b>.`) +
      `<br><br><span style="color:#a3a3a8">Мастер посмотрит кий, назовёт точную цену и срок — пришлём письмо.</span>`;
  } else if (status === "RECEIVED") {
    title = "Кий у мастера";
    body = `Получили кий по заявке <b>${escHtml(r.number)}</b>. ${terms}`;
  } else if (status === "IN_WORK") {
    title = "Мастер работает над кием";
    body = `Новости по заявке <b>${escHtml(r.number)}</b>. ${terms}`;
  } else if (status === "READY") {
    title = "Кий готов!";
    body =
      `Работы по заявке <b>${escHtml(r.number)}</b> закончены.` +
      (r.price && !r.paidAt ? ` К оплате: <b>${rub(r.price)}</b>${r.payUrl ? " — можно онлайн по кнопке ниже" : r.returnMethod === "CLUB" ? " — на месте в клубе" : ""}.` : "") +
      "<br><br>" +
      (r.returnMethod === "CLUB" ? `Забирайте в клубе — назовите номер заявки:<br>${clubHtml}` : `Отправим СДЭК${r.price && !r.paidAt ? " после оплаты" : ""} по адресу: ${escHtml(r.returnAddress ?? "")}. Трек-номер пришлём.`);
  } else if (status === "DONE") {
    title = r.returnMethod === "CLUB" ? "Кий выдан" : "Кий отправлен";
    body = `Заявка <b>${escHtml(r.number)}</b> закрыта. Спасибо, что доверили кий нашей мастерской!`;
  } else {
    title = "Заявка отменена";
    body = `Заявка <b>${escHtml(r.number)}</b> отменена.`;
  }
  const button = status === "READY" && r.payUrl && !r.paidAt && r.price ? { text: `Оплатить ${rub(r.price)}`, url: r.payUrl } : { text: "Открыть заявку", url };
  await sendMail(r.email, `${title} — ${r.number}`, title, body + noteHtml + photoHtml, button);
}

async function tgCustomer(r: ServiceRow, status: ServiceStatus) {
  if (!r.userId) return;
  const { notifyUser } = await import("@/lib/telegram");
  await notifyUser(r.userId, `🛠 Заявка в мастерскую <b>${r.number}</b>: ${SERVICE_STATUS[status].text.toLowerCase()}.`, { text: "Открыть заявку", url: `${SITE.url}/service/${r.number}` });
}

async function notifyAdminsNew(r: ServiceRow) {
  const { notifyAdmins } = await import("@/lib/telegram");
  const club = await clubInfo(r.clubId);
  await notifyAdmins(
    `🛠 <b>Новая заявка в мастерскую ${r.number}</b>\n${r.items.map((i) => `• ${i.name}`).join("\n")}\n${r.handover === "CLUB" ? `Принесут в клуб${club ? `: ${club.name}, ${club.city}` : ""}` : "Пришлют СДЭК"}`,
    { text: "Открыть в админке", url: `${SITE.url}/admin/service/${r.id}` },
  );
}
