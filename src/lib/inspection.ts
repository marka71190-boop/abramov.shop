/**
 * Проверка товара перед отправкой и загрузка фото и видео на Google Диск.
 * Файл идёт кусками через сервер: браузер → сайт → Google. Так не нужны настройки CORS
 * у Google, а при необходимости весь трафик можно пустить через релей.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fmtDateTime } from "@/lib/format";
import { orderFolder, startUpload, uploadChunk } from "@/lib/gdrive";
import { escHtml, sendMail } from "@/lib/mail";
import { isPlaceholderEmail, SITE } from "@/lib/site";
import { notifyUser } from "@/lib/telegram";

export const CHUNK = 4 * 1024 * 1024; // кратно 256 КБ — требование Google; 4 МБ проходят через любой прокси
export const MAX_FILE = 2 * 1024 * 1024 * 1024; // 2 ГБ

export const CHECKLIST = [
  "Внешний вид: без сколов, царапин и трещин",
  "Комплектность и упаковка",
  "Кий: прямизна — прокат по столу",
  "Кий: соединение без люфта и посторонних звуков",
  "Кий: наклейка и втулка",
  "Кий: серийный номер сверен",
  "Пломба на соединении",
];

interface Upload {
  orderId: string;
  returnId: string | null;
  folderId: string;
  session: string;
  name: string;
  mimeType: string;
  size: number;
  offset: number;
  userId: string;
  created: number;
}
const g = globalThis as unknown as { __asUploads?: Map<string, Upload> };
const uploads = (g.__asUploads ??= new Map());

export async function beginUpload(p: { orderId: string; returnId?: string | null; name: string; mimeType: string; size: number; userId: string }) {
  if (!/^(image|video)\//.test(p.mimeType)) throw new Error("Можно загружать только фото и видео");
  if (!(p.size > 0) || p.size > MAX_FILE) throw new Error("Файл больше 2 ГБ");
  const o = await db.query.order.findFirst({ where: eq(s.order.id, p.orderId), columns: { id: true, number: true } });
  if (!o) throw new Error("Заказ не найден");
  const folder = await orderFolder(o.id, o.number);
  const ext = p.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? "";
  // Имя файла на Диске — без исходного названия с телефона (там бывают имена и даты)
  const kind = p.mimeType.startsWith("video/") ? "видео" : "фото";
  const msk = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 19).replace("T", " ");
  const name = `${o.number} ${p.returnId ? "возврат" : "отправка"} ${kind} ${msk} МСК${ext}`;
  const session = await startUpload(folder.id, name, p.mimeType, p.size);
  for (const [k, v] of uploads) if (Date.now() - v.created > 6 * 3600_000) uploads.delete(k);
  const id = randomBytes(16).toString("hex");
  uploads.set(id, { orderId: o.id, returnId: p.returnId ?? null, folderId: folder.id, session, name, mimeType: p.mimeType, size: p.size, offset: 0, userId: p.userId, created: Date.now() });
  return { uploadId: id, chunk: CHUNK };
}

export async function putChunk(uploadId: string, userId: string, offset: number, data: Uint8Array) {
  const u = uploads.get(uploadId);
  if (!u || u.userId !== userId) throw new Error("Загрузка не найдена — начните заново");
  if (offset !== u.offset) throw new Error(`Ожидался кусок с позиции ${u.offset}`);
  const f = await uploadChunk(u.session, data, offset, u.size);
  u.offset += data.byteLength;
  if (!f) return { done: false, received: u.offset };
  uploads.delete(uploadId);
  if (f.parents && !f.parents.includes(u.folderId)) throw new Error("Файл оказался не в той папке");
  const [m] = await db
    .insert(s.inspectionMedia)
    .values({
      orderId: u.orderId,
      returnId: u.returnId,
      driveFileId: f.id,
      name: f.name,
      mimeType: f.mimeType || u.mimeType,
      size: f.size ? Number(f.size) : u.size,
      driveCreatedAt: f.createdTime ? new Date(f.createdTime) : new Date(),
      webViewLink: f.webViewLink ?? null,
      uploadedById: userId,
    })
    .returning();
  return { done: true, received: u.offset, media: m };
}

export async function loadInspection(orderId: string) {
  const [insp, media] = await Promise.all([
    db.query.orderInspection.findFirst({ where: eq(s.orderInspection.orderId, orderId) }),
    db.query.inspectionMedia.findMany({ where: and(eq(s.inspectionMedia.orderId, orderId), isNull(s.inspectionMedia.returnId)), orderBy: asc(s.inspectionMedia.createdAt) }),
  ]);
  return { insp: insp ?? null, media };
}

/** Покупателю: «заказ проверен перед отправкой» — письмо и Telegram. */
export async function notifyChecked(orderId: string) {
  const o = await db.query.order.findFirst({ where: eq(s.order.id, orderId) });
  const insp = await db.query.orderInspection.findFirst({ where: eq(s.orderInspection.orderId, orderId) });
  if (!o || !insp?.checkedAt) return;
  const link = `${SITE.url}/order/${o.number}#inspection`;
  const lines = [
    `Мы лично проверили ваш заказ <b>${escHtml(o.number)}</b> перед отправкой ${fmtDateTime(insp.checkedAt)} и сняли фото и видео — посмотреть их можно на странице заказа.`,
    insp.serialNumber ? `Серийный номер: <b>${escHtml(insp.serialNumber)}</b>.` : "",
    insp.sealNumber ? `Номер пломбы: <b>${escHtml(insp.sealNumber)}</b> — при получении проверьте, что пломба цела.` : "",
    "Совет: вскройте посылку в пункте СДЭК и проверьте товар. Если упаковка или товар повреждены — попросите сотрудника составить акт.",
  ].filter(Boolean);
  if (!isPlaceholderEmail(o.email)) {
    await sendMail(o.email, `Заказ ${o.number} проверен перед отправкой`, "Заказ проверен", lines.join("<br><br>"), { text: "Фото и видео", url: link }).catch((e) =>
      console.error("[mail] inspection:", e instanceof Error ? e.message : e),
    );
  }
  if (o.userId) await notifyUser(o.userId, `✅ Заказ <b>${escHtml(o.number)}</b> проверен перед отправкой — фото и видео на странице заказа.`, { text: "Посмотреть", url: link });
}
