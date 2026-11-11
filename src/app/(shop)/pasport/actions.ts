"use server";
import { revalidatePath } from "next/cache";
import { acceptTransfer, cancelTransfer, claimPassport, PassportError, startTransfer } from "@/lib/cue-passport";
import { qrSvg } from "@/lib/qr";
import { getViewer } from "@/lib/viewer";

type R = { ok?: string; error?: string; link?: string; qr?: string; login?: boolean };

async function me() {
  const u = await getViewer();
  return u && !u.isDevice ? u : null;
}
const fail = (e: unknown): R => (e instanceof PassportError ? { error: e.message } : (console.error("[passport]", e), { error: "Не получилось — попробуйте ещё раз" }));

/** Привязать кий кодом с карточки */
export async function claimAction(code: string, claim: string): Promise<R> {
  const u = await me();
  if (!u) return { login: true };
  try {
    await claimPassport(code, String(claim).slice(0, 20), u.id);
    revalidatePath(`/pasport/${code}`);
    return { ok: "Кий привязан к вашему аккаунту" };
  } catch (e) {
    return fail(e);
  }
}

/** Ссылка, чтобы передать кий новому владельцу */
export async function transferAction(passportId: string): Promise<R> {
  const u = await me();
  if (!u) return { login: true };
  try {
    const link = await startTransfer(String(passportId).slice(0, 64), u.id);
    return { link, qr: await qrSvg(link) };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelTransferAction(passportId: string, code: string): Promise<R> {
  const u = await me();
  if (!u) return { login: true };
  await cancelTransfer(String(passportId).slice(0, 64), u.id);
  revalidatePath(`/pasport/${code}`);
  return { ok: "Передача отменена — старая ссылка больше не работает" };
}

/** Новый владелец принимает кий */
export async function acceptAction(code: string, token: string): Promise<R> {
  const u = await me();
  if (!u) return { login: true };
  try {
    await acceptTransfer(code, String(token).slice(0, 64), u.id);
    revalidatePath(`/pasport/${code}`);
    return { ok: "Готово — теперь это ваш кий" };
  } catch (e) {
    return fail(e);
  }
}
