"use server";
import { revalidatePath } from "next/cache";
import { deleteAddress, saveAddress, setDefaultAddress } from "@/lib/addresses";
import { getSettings } from "@/lib/settings";
import { getActiveBan, getViewer, isAdmin } from "@/lib/viewer";

async function me() {
  const u = await getViewer();
  if (!u || getActiveBan(u)) return null;
  return u;
}

export async function saveAddressAction(raw: unknown): Promise<{ ok?: string; error?: string; id?: string }> {
  const u = await me();
  if (!u) return { error: "Войдите в аккаунт" };
  const settings = await getSettings();
  if (settings.pdPause && !isAdmin(u)) return { error: settings.pdPauseMessage };
  const r = await saveAddress(u.id, raw);
  if ("error" in r) return { error: r.error };
  revalidatePath("/account");
  return { ok: "Адрес сохранён", id: r.address.id };
}

export async function deleteAddressAction(id: string) {
  const u = await me();
  if (!u) return;
  await deleteAddress(u.id, String(id).slice(0, 64));
  revalidatePath("/account");
}

export async function defaultAddressAction(id: string) {
  const u = await me();
  if (!u) return;
  await setDefaultAddress(u.id, String(id).slice(0, 64));
  revalidatePath("/account");
}
