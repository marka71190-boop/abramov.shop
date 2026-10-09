/**
 * СДЭК (API v2): https://api-docs.cdek.ru/
 *
 * Включается, когда заданы CDEK_CLIENT_ID и CDEK_CLIENT_SECRET.
 * Учебная среда: CDEK_TEST_MODE=true (api.edu.cdek.ru).
 * Город отправки, ПВЗ сдачи посылок и тарифы — в админке → «Настройки» → «Доставка».
 */
import "server-only";
import { SELLER } from "@/lib/site";

const BASE = () =>
  process.env.CDEK_API_URL || (process.env.CDEK_TEST_MODE === "true" ? "https://api.edu.cdek.ru/v2" : "https://api.cdek.ru/v2");

export const cdekEnabled = () => !!(process.env.CDEK_CLIENT_ID && process.env.CDEK_CLIENT_SECRET);

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const id = process.env.CDEK_CLIENT_ID;
  const secret = process.env.CDEK_CLIENT_SECRET;
  if (!id || !secret) throw new Error("СДЭК не настроен: нет CDEK_CLIENT_ID / CDEK_CLIENT_SECRET");
  const res = await fetch(`${BASE()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`СДЭК: не удалось авторизоваться (HTTP ${res.status})`);
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE() + path, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { errors?: { message: string }[]; requests?: { errors?: { message: string }[] }[] };
  if (!res.ok) {
    const msg = data.errors?.map((e) => e.message).join("; ") || data.requests?.[0]?.errors?.map((e) => e.message).join("; ");
    throw new Error(`СДЭК ${res.status}: ${msg || "ошибка"}`);
  }
  return data;
}

// ---------------- Города и пункты выдачи ----------------

export interface CdekCity {
  code: number;
  name: string; // «Краснодар, Краснодарский край»
}

export async function findCities(query: string): Promise<CdekCity[]> {
  try {
    const q = new URLSearchParams({ name: query, country_code: "RU" });
    const list = await api<Array<{ code: number; full_name: string }>>(`/location/suggest/cities?${q}`);
    return list.slice(0, 10).map((c) => ({ code: c.code, name: c.full_name.replace(/, Россия$/, "") }));
  } catch {
    // Старый способ поиска — на случай, если подсказки недоступны
    const q = new URLSearchParams({ city: query, country_codes: "RU", size: "10" });
    const list = await api<Array<{ code: number; city: string; region?: string }>>(`/location/cities?${q}`);
    return list.map((c) => ({ code: c.code, name: c.region ? `${c.city}, ${c.region}` : c.city }));
  }
}

export interface CdekPoint {
  code: string;
  name: string;
  address: string;
  workTime: string;
  postalCode: string | null;
}

const pointsCache = new Map<number, { at: number; points: CdekPoint[] }>();

export async function getPickupPoints(cityCode: number): Promise<CdekPoint[]> {
  const hit = pointsCache.get(cityCode);
  if (hit && Date.now() - hit.at < 3600_000) return hit.points;
  const q = new URLSearchParams({ city_code: String(cityCode), type: "PVZ", is_handout: "true" });
  const list = await api<
    Array<{
      code: string;
      name: string;
      work_time?: string;
      location: { address_full?: string; address?: string; postal_code?: string };
    }>
  >(`/deliverypoints?${q}`);
  const points = list
    .map((p) => ({
      code: p.code,
      name: p.name,
      address: p.location.address ?? p.location.address_full ?? "",
      workTime: p.work_time ?? "",
      postalCode: p.location.postal_code ?? null,
    }))
    .sort((a, b) => a.address.localeCompare(b.address, "ru"));
  pointsCache.set(cityCode, { at: Date.now(), points });
  return points;
}

// ---------------- Расчёт доставки ----------------

export interface Parcel {
  weight: number; // г
  length: number; // см
  width: number;
  height: number;
}

/** Одна коробка на заказ: вес — сумма, длина и ширина — по самому крупному товару, высота — сумма. */
export function parcelFor(items: { weightGrams: number; lengthCm: number; widthCm: number; heightCm: number; quantity: number }[]): Parcel {
  let weight = 100; // упаковка
  let length = 1;
  let width = 1;
  let height = 0;
  for (const i of items) {
    weight += i.weightGrams * i.quantity;
    length = Math.max(length, i.lengthCm);
    width = Math.max(width, i.widthCm);
    height += i.heightCm * i.quantity;
  }
  return { weight, length, width, height: Math.max(1, Math.min(height, 150)) };
}

export interface CdekQuote {
  cost: number; // копейки
  periodMin: number;
  periodMax: number;
}

const quoteCache = new Map<string, { at: number; quote: CdekQuote }>();

export async function calculate(p: { fromCityCode: number; toCityCode: number; tariff: number; parcel: Parcel }): Promise<CdekQuote> {
  const key = JSON.stringify(p);
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return hit.quote;
  const data = await api<{ total_sum: number; period_min: number; period_max: number }>("/calculator/tariff", {
    method: "POST",
    body: {
      tariff_code: p.tariff,
      from_location: { code: p.fromCityCode },
      to_location: { code: p.toCityCode },
      packages: [p.parcel],
    },
  });
  const quote = { cost: Math.ceil(data.total_sum) * 100, periodMin: data.period_min, periodMax: data.period_max };
  quoteCache.set(key, { at: Date.now(), quote });
  if (quoteCache.size > 2000) quoteCache.clear();
  return quote;
}

// ---------------- Отправления ----------------

export async function createShipment(p: {
  number: string;
  tariff: number;
  shipmentPoint: string;
  pvzCode?: string | null;
  toCityCode?: number | null;
  address?: string | null;
  recipient: { name: string; email: string; phone: string };
  parcel: Parcel;
  items: { name: string; sku: string; price: number; weight: number; quantity: number }[];
}): Promise<string> {
  const body: Record<string, unknown> = {
    type: 1, // интернет-магазин
    number: p.number,
    tariff_code: p.tariff,
    shipment_point: p.shipmentPoint,
    sender: { company: SELLER.name },
    recipient: { name: p.recipient.name, email: p.recipient.email, phones: [{ number: p.recipient.phone.replace(/[^\d+]/g, "") }] },
    packages: [
      {
        number: "1",
        ...p.parcel,
        items: p.items.map((i) => ({
          name: i.name.slice(0, 255),
          ware_key: i.sku.slice(0, 50),
          payment: { value: 0 }, // заказ оплачен онлайн
          cost: i.price / 100,
          weight: i.weight,
          amount: i.quantity,
        })),
      },
    ],
  };
  if (p.pvzCode) body.delivery_point = p.pvzCode;
  else body.to_location = { code: p.toCityCode, address: p.address };
  const data = await api<{ entity?: { uuid: string } }>("/orders", { method: "POST", body });
  if (!data.entity?.uuid) throw new Error("СДЭК не вернул номер отправления");
  return data.entity.uuid;
}

export interface CdekOrderInfo {
  cdekNumber: string | null;
  status: string | null; // код последнего статуса
  statusName: string | null;
}

export async function getShipment(uuid: string): Promise<CdekOrderInfo> {
  const data = await api<{
    entity?: { cdek_number?: string; statuses?: { code: string; name: string; date_time: string }[] };
    requests?: { state: string; errors?: { message: string }[] }[];
  }>(`/orders/${encodeURIComponent(uuid)}`);
  const failed = data.requests?.find((r) => r.state === "INVALID");
  if (failed) throw new Error(`СДЭК отклонил отправление: ${failed.errors?.map((e) => e.message).join("; ") ?? ""}`);
  const statuses = [...(data.entity?.statuses ?? [])].sort((a, b) => +new Date(b.date_time) - +new Date(a.date_time));
  return { cdekNumber: data.entity?.cdek_number ?? null, status: statuses[0]?.code ?? null, statusName: statuses[0]?.name ?? null };
}

/** Статусы, после которых посылка уже у СДЭК (заказ — «В пути»). */
export const CDEK_IN_TRANSIT = new Set([
  "RECEIVED_AT_SHIPMENT_WAREHOUSE",
  "READY_TO_SHIP_AT_SENDING_OFFICE",
  "READY_FOR_SHIPMENT_IN_TRANSIT_CITY",
  "READY_FOR_SHIPMENT_IN_SENDER_CITY",
  "RETURNED_TO_SENDER_CITY_WAREHOUSE",
  "TAKEN_BY_TRANSPORTER_FROM_SENDER_CITY",
  "SENT_TO_TRANSIT_CITY",
  "ACCEPTED_IN_TRANSIT_CITY",
  "ACCEPTED_AT_TRANSIT_WAREHOUSE",
  "TAKEN_BY_TRANSPORTER_FROM_TRANSIT_CITY",
  "SENT_TO_RECIPIENT_CITY",
  "ACCEPTED_IN_RECIPIENT_CITY",
  "ACCEPTED_AT_RECIPIENT_CITY_WAREHOUSE",
  "ACCEPTED_AT_PICK_UP_POINT",
  "TAKEN_BY_COURIER",
]);

export const trackUrl = (track: string) => `https://www.cdek.ru/ru/tracking/?order_id=${encodeURIComponent(track)}`;
