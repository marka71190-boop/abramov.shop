"use server";
import { suggestForCart } from "@/lib/recommend";

/** «Добавьте к заказу» для корзины — по товарам в ней. */
export async function cartUpsellAction(variantIds: unknown) {
  if (!Array.isArray(variantIds)) return [];
  const ids = variantIds.filter((x): x is string => typeof x === "string").slice(0, 50).map((x) => x.slice(0, 64));
  return suggestForCart(ids, 4).catch(() => []);
}
