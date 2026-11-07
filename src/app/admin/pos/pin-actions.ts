"use server";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { confirmPinSet, PinError, requestPinSet } from "@/lib/pin";
import { createRateLimiter } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/viewer";

export type PinState = { ok?: string; error?: string; step?: "code" | "done" };

const sendLimit = createRateLimiter({ limit: 3, windowMs: 15 * 60_000 });

export async function pinRequestAction(_: PinState, fd: FormData): Promise<PinState> {
  const me = await requireAdmin();
  if (me.role !== "OWNER" && me.role !== "MANAGER" && !me.extraRoles.includes("MANAGER")) return { error: "PIN задают владелец и менеджеры" };
  const pin = String(fd.get("pin") ?? "");
  if (pin !== String(fd.get("pin2") ?? "")) return { error: "PIN и повтор не совпадают" };
  if (!sendLimit(me.id)) return { error: "Код уже отправляли несколько раз — подождите 15 минут" };
  try {
    await requestPinSet(me, pin);
    return { step: "code", ok: `Код подтверждения отправлен на ${me.email}` };
  } catch (e) {
    return { error: e instanceof PinError ? e.message : "Не получилось отправить код" };
  }
}

export async function pinConfirmAction(_: PinState, fd: FormData): Promise<PinState> {
  const me = await requireAdmin();
  try {
    await confirmPinSet(me.id, String(fd.get("code") ?? "").replace(/\D/g, "").slice(0, 6));
    // Сам PIN и код в журнал не пишем
    await audit(me.id, "pin.set", "user", me.id);
    revalidatePath("/admin/pos/pin");
    return { step: "done", ok: "PIN действует. Им можно подтверждать скидки и возвраты в кассе" };
  } catch (e) {
    return { step: "code", error: e instanceof PinError ? e.message : "Не получилось подтвердить" };
  }
}
