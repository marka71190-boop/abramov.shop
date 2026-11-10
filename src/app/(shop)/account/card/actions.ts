"use server";
import { cardToken } from "@/lib/bonus-card";
import { qrSvg } from "@/lib/qr";
import { getViewer } from "@/lib/viewer";

/** Свежий QR бонусной карты: экран карты обновляет его каждую минуту */
export async function cardQrAction(): Promise<{ qr?: string; balance?: number; error?: string }> {
  const u = await getViewer();
  if (!u || u.isDevice) return { error: "Войдите в аккаунт" };
  return { qr: await qrSvg(cardToken(u.id)), balance: u.bonusBalance };
}
