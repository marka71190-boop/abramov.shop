"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { createDevice, DeviceError, disableDevice, resetDevicePassword, updateDevice } from "@/lib/kassa-devices";
import { qrSvg } from "@/lib/qr";
import { SITE } from "@/lib/site";
import { requireAdmin } from "@/lib/viewer";

export interface Credentials {
  name: string;
  login: string;
  password: string;
  url: string;
  qr: string; // SVG: ссылка на вход с подставленным логином
}
export type DeviceState = { ok?: string; error?: string; creds?: Credentials };

const msg = (e: unknown) => (e instanceof DeviceError ? e.message : "Не получилось — попробуйте ещё раз");

async function credsOf(name: string, login: string, password: string): Promise<Credentials> {
  const url = `${SITE.url}/kassa/login?login=${encodeURIComponent(login)}`;
  return { name, login, password, url, qr: await qrSvg(url) };
}

const refresh = () => {
  revalidatePath("/admin/pos/devices");
  revalidatePath("/admin/customers");
};

export async function createDeviceAction(_: DeviceState, fd: FormData): Promise<DeviceState> {
  const me = await requireAdmin("OWNER");
  try {
    const d = await createDevice({
      name: String(fd.get("name") ?? ""),
      clubId: String(fd.get("clubId") ?? ""),
      login: String(fd.get("login") ?? ""),
      password: String(fd.get("password") ?? ""),
    });
    // Пароль в журнал не пишем
    await audit(me.id, "kassa.device_create", "user", d.id, { login: d.login, club: String(fd.get("clubId") ?? "") });
    refresh();
    return { ok: "Телефон кассы создан", creds: await credsOf(d.name, d.login, d.password) };
  } catch (e) {
    if (!(e instanceof DeviceError)) console.error("[kassa] создание телефона:", e);
    return { error: msg(e) };
  }
}

export async function resetDeviceAction(id: string): Promise<DeviceState> {
  const me = await requireAdmin("OWNER");
  try {
    const r = await resetDevicePassword(String(id).slice(0, 64));
    await audit(me.id, "kassa.device_password", "user", id);
    refresh();
    return { ok: "Новый пароль выдан — на телефоне нужно войти заново", creds: await credsOf("", r.login, r.password) };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function disableDeviceAction(id: string): Promise<DeviceState> {
  const me = await requireAdmin("OWNER");
  try {
    await disableDevice(String(id).slice(0, 64), me.id);
    await audit(me.id, "kassa.device_disable", "user", id);
    refresh();
    return { ok: "Отключён: на телефоне касса закрылась, старый пароль больше не подходит" };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function updateDeviceAction(_: DeviceState, fd: FormData): Promise<DeviceState> {
  const me = await requireAdmin("OWNER");
  const id = String(fd.get("id") ?? "").slice(0, 64);
  try {
    await updateDevice(id, { name: String(fd.get("name") ?? ""), clubId: String(fd.get("clubId") ?? "") });
    await audit(me.id, "kassa.device_update", "user", id, { club: String(fd.get("clubId") ?? "") });
    refresh();
    return { ok: "Сохранено" };
  } catch (e) {
    return { error: msg(e) };
  }
}
