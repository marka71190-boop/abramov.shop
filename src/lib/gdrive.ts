/**
 * Google Диск магазина: папки с фото и видео проверки товаров.
 *
 * Подключение — один раз в админке (OAuth, кнопка «Подключить Google Диск»), ключ клиента —
 * переменные GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET (вход покупателей через Google на сайте не используется).
 * Доступ к Диску только к файлам, которые создал сам сайт (scope drive.file) — остальное
 * содержимое Диска сайту не видно.
 *
 * Токен хранится в базе зашифрованным (AES-256-GCM, ключ из BETTER_AUTH_SECRET).
 * На Диск уходят только фото и видео товара и номер заказа — никаких персональных данных.
 *
 * Если сервер не достаёт до Google напрямую — GOOGLE_API_URL (релей, как для Telegram).
 */
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { serverSecret } from "@/lib/secret";
import { SITE } from "@/lib/site";

const API = () => (process.env.GOOGLE_API_URL || "https://www.googleapis.com").replace(/\/$/, "");
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token";
const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPE = "openid email https://www.googleapis.com/auth/drive.file";
const ROOT_NAME = "Abramov Shop — проверка товаров";
const KEY = "google_drive";

export const driveConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const redirectUri = () => `${SITE.url}/api/google/drive/callback`;

interface Stored {
  token: string; // зашифрованный refresh token
  email: string | null;
  rootId: string | null;
  connectedAt: string;
}

// ---------- Шифрование токена

const key = () => createHash("sha256").update(`${serverSecret("dev")}:gdrive`).digest();
function encrypt(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
function decrypt(blob: string) {
  const [iv, tag, data] = blob.split(".").map((x) => Buffer.from(x, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

async function stored(): Promise<Stored | null> {
  const row = await db.query.setting.findFirst({ where: eq(s.setting.key, KEY) });
  return (row?.value as Stored | undefined) ?? null;
}
async function store(v: Stored) {
  await db
    .insert(s.setting)
    .values({ key: KEY, value: v })
    .onConflictDoUpdate({ target: s.setting.key, set: { value: v, updatedAt: new Date() } });
}

export async function driveStatus() {
  const v = await stored();
  return { configured: driveConfigured(), connected: !!v, email: v?.email ?? null, connectedAt: v?.connectedAt ?? null, rootId: v?.rootId ?? null };
}

export async function disconnectDrive() {
  cache = null;
  await db.delete(s.setting).where(eq(s.setting.key, KEY));
}

// ---------- OAuth

export function authUrl(state: string) {
  const u = new URL(AUTH_URL());
  u.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // без этого Google не выдаст refresh token повторно
    include_granted_scopes: "true",
    state,
  }).toString();
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Google: ${j.error_description || j.error || res.status}`);
  return j;
}

/** Обмен кода из OAuth на токены, сохранение и создание корневой папки. */
export async function finishConnect(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google не выдал постоянный доступ — отключите сайт в настройках аккаунта Google и подключите заново");
  let email: string | null = null;
  try {
    email = JSON.parse(Buffer.from(t.id_token!.split(".")[1], "base64url").toString("utf8")).email ?? null;
  } catch {}
  cache = { token: t.access_token!, exp: Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000 };
  await store({ token: encrypt(t.refresh_token), email, rootId: null, connectedAt: new Date().toISOString() });
  const rootId = await createFolder(ROOT_NAME, null, false);
  await store({ token: encrypt(t.refresh_token), email, rootId, connectedAt: new Date().toISOString() });
  return email;
}

let cache: { token: string; exp: number } | null = null;

async function accessToken() {
  if (cache && cache.exp > Date.now()) return cache.token;
  const v = await stored();
  if (!v) throw new Error("Google Диск не подключён — админка → Настройки");
  const t = await tokenRequest({ refresh_token: decrypt(v.token), grant_type: "refresh_token" });
  cache = { token: t.access_token!, exp: Date.now() + (t.expires_in ?? 3600) * 1000 - 60_000 };
  return cache.token;
}

async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.json ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) },
    body: init.json ? JSON.stringify(init.json) : init.body,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`Google Диск: ${j?.error?.message || res.status}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

// ---------- Папки и файлы

/** Папка; public — «все, у кого есть ссылка, могут смотреть» (файлы внутри наследуют доступ). */
async function createFolder(name: string, parentId: string | null, isPublic: boolean) {
  const f = await api<{ id: string }>("/drive/v3/files?fields=id", {
    method: "POST",
    json: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
  });
  if (isPublic) await api(`/drive/v3/files/${f.id}/permissions?fields=id`, { method: "POST", json: { type: "anyone", role: "reader", allowFileDiscovery: false } });
  return f.id;
}

const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/** Папка заказа (создаётся при первой загрузке). Название — только номер заказа. */
export async function orderFolder(orderId: string, label: string) {
  const insp = await db.query.orderInspection.findFirst({ where: eq(s.orderInspection.orderId, orderId) });
  if (insp?.folderId) return { id: insp.folderId, url: insp.folderUrl ?? folderUrl(insp.folderId) };
  const v = await stored();
  if (!v) throw new Error("Google Диск не подключён — админка → Настройки");
  let rootId = v.rootId;
  if (!rootId) {
    rootId = await createFolder(ROOT_NAME, null, false);
    await store({ ...v, rootId });
  }
  const id = await createFolder(label, rootId, true);
  const url = folderUrl(id);
  await db
    .insert(s.orderInspection)
    .values({ orderId, folderId: id, folderUrl: url })
    .onConflictDoUpdate({ target: s.orderInspection.orderId, set: { folderId: id, folderUrl: url, updatedAt: new Date() } });
  return { id, url };
}

/**
 * Начать загрузку файла (resumable upload). Зрителям запрещаем скачивать, печатать и копировать
 * (copyRequiresWriterPermission). Возвращает адрес сессии, куда сервер дальше шлёт куски файла.
 */
export async function startUpload(folderId: string, name: string, mimeType: string, size: number) {
  const res = await fetch(`${API()}/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,createdTime,webViewLink,parents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name, parents: [folderId], copyRequiresWriterPermission: true }),
    signal: AbortSignal.timeout(30_000),
  });
  const loc = res.headers.get("location");
  if (!res.ok || !loc) throw new Error(`Google Диск не принял файл (${res.status})`);
  // Через релей адрес сессии нужно вести тоже через релей
  return process.env.GOOGLE_API_URL && loc.startsWith("https://www.googleapis.com") ? loc.replace("https://www.googleapis.com", API()) : loc;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
  parents?: string[];
}

/** Отправить кусок файла. Возвращает файл, когда загружен последний кусок, иначе null. */
export async function uploadChunk(session: string, chunk: Uint8Array, start: number, total: number): Promise<DriveFile | null> {
  const end = start + chunk.byteLength - 1;
  const res = await fetch(session, {
    method: "PUT",
    headers: { "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.byteLength) },
    body: chunk as unknown as BodyInit,
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 308) return null;
  if (!res.ok) throw new Error(`Google Диск: загрузка прервалась (${res.status})`);
  return (await res.json()) as DriveFile;
}

export async function trashFile(fileId: string) {
  await api(`/drive/v3/files/${fileId}`, { method: "PATCH", json: { trashed: true } });
}

/** Ссылка для встраивания просмотра (фото и видео) — без кнопки скачивания для зрителей. */
export const previewUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/preview`;
export const viewUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;
