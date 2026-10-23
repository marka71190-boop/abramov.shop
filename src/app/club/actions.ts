"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema as s } from "@/db";
import { auditSystem } from "@/lib/audit";
import { assertClubAccess } from "@/lib/club-staff";
import { getClub } from "@/lib/clubs";
import { markDelivered, OrderError, setStatus } from "@/lib/orders";
import { markServicePaidOffline, ServiceError, setServiceStatus } from "@/lib/service";

export type ClubOp = "arrived" | "given" | "svc-received" | "svc-paid" | "svc-given";
export type ClubResult = { ok?: string; error?: string };

const fail = (e: unknown): ClubResult => ({ error: e instanceof OrderError || e instanceof ServiceError || e instanceof Error ? e.message : "Не получилось" });

export async function clubAction(op: ClubOp, id: string): Promise<ClubResult> {
  try {
    if (op === "arrived" || op === "given") {
      const o = await db.query.order.findFirst({ where: eq(s.order.id, id), columns: { id: true, status: true, pickupClubId: true, deliveryType: true, number: true } });
      if (!o || o.deliveryType !== "PICKUP") return { error: "Заказ не найден" };
      const me = await assertClubAccess(o.pickupClubId);
      if (op === "arrived") {
        if (o.status !== "PAID" && o.status !== "ASSEMBLING") return { error: "Заказ уже отмечен или закрыт — обновите страницу" };
        await setStatus(o.id, "SHIPPED", me.id);
        await auditSystem(me.id, "club.order_arrived", "order", o.id, { club: o.pickupClubId });
        revalidatePath("/club");
        return { ok: `${o.number}: покупателю отправили «Можно забирать»` };
      }
      if (o.status !== "SHIPPED") return { error: "Сначала отметьте, что заказ пришёл в клуб" };
      await markDelivered(o.id, me.id);
      revalidatePath("/club");
      return { ok: `${o.number} выдан` };
    }

    const r = await db.query.serviceRequest.findFirst({ where: eq(s.serviceRequest.id, id) });
    if (!r) return { error: "Заявка не найдена" };
    const me = await assertClubAccess(r.clubId);
    if (op === "svc-received") {
      if (r.status !== "NEW" || r.handover !== "CLUB") return { error: "Кий по этой заявке уже принят — обновите страницу" };
      const club = await getClub(r.clubId);
      await setServiceStatus(r.id, "RECEIVED", { note: `Кий принят в клубе${club ? ` «${club.name}»` : ""}. Передаём мастеру.`, actorId: me.id });
      revalidatePath("/club");
      return { ok: `${r.number}: кий принят` };
    }
    if (op === "svc-paid") {
      if (r.status !== "READY") return { error: "Оплату принимаем, когда кий готов" };
      if (r.paidAt) return { error: "Уже оплачено" };
      if (!r.price) return { error: "Мастер ещё не указал цену" };
      await markServicePaidOffline(r.id, me.id);
      revalidatePath("/club");
      return { ok: `${r.number}: оплата отмечена` };
    }
    if (r.status !== "READY" || r.returnMethod !== "CLUB") return { error: "Эту заявку нельзя выдать в клубе — обновите страницу" };
    if (r.price && !r.paidAt) return { error: "Сначала примите оплату и нажмите «Оплачено на месте»" };
    await setServiceStatus(r.id, "DONE", { note: null, actorId: me.id });
    revalidatePath("/club");
    return { ok: `${r.number}: кий выдан` };
  } catch (e) {
    return fail(e);
  }
}
