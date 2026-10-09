import "server-only";
import { db, schema as s } from "@/db";
import { getRequestMeta } from "@/lib/request";

/** Запись в журнал действий админов: кто, что и когда изменил. */
export async function audit(actorId: string, action: string, entity: string, entityId?: string | null, details?: unknown) {
  const { ip } = await getRequestMeta();
  await db.insert(s.auditLog).values({ actorId, action, entity, entityId: entityId ?? null, details: details ?? null, ip });
}
