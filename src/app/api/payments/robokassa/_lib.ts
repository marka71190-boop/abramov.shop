import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema as s } from "@/db";
import { SITE } from "@/lib/site";

/** Параметры запроса Робокассы: и GET, и POST (form-urlencoded) */
export async function rkParams(req: Request): Promise<URLSearchParams> {
  const url = new URL(req.url);
  if (req.method === "POST") {
    const body = await req.text().catch(() => "");
    const p = new URLSearchParams(body);
    url.searchParams.forEach((v, k) => {
      if (!p.has(k)) p.set(k, v);
    });
    return p;
  }
  return url.searchParams;
}


/** Вернуть покупателя на страницу заказа по номеру счёта */
export async function backTo(req: Request, flag: string) {
  const p = await rkParams(req);
  const inv = p.get("InvId") ?? "";
  if (/^\d+$/.test(inv)) {
    const row = await db.query.payment.findFirst({ where: and(eq(s.payment.provider, "robokassa"), eq(s.payment.externalId, inv)), with: { order: { columns: { number: true } } } });
    if (row?.order) return NextResponse.redirect(`${SITE.url}/order/${row.order.number}?from=${flag}`, 303);
  }
  return NextResponse.redirect(`${SITE.url}/account#orders`, 303);
}
