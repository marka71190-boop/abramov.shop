import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

const HINTS: Record<string, string> = {
  ENOTFOUND: "адрес базы не найден — проверьте хост в DATABASE_URL",
  EAI_AGAIN: "адрес базы не найден — проверьте хост в DATABASE_URL",
  ECONNREFUSED: "база не принимает подключения на этом адресе и порту",
  ETIMEDOUT: "база не отвечает",
  "28P01": "неверный пароль пользователя базы",
  "28000": "пользователю запрещено подключаться к этой базе",
  "3D000": "базы с таким именем нет",
  "42P01": "таблиц нет — миграции не применились, см. логи приложения",
  SELF_SIGNED_CERT_IN_CHAIN: "сертификат базы не прошёл проверку",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "сертификат базы не прошёл проверку",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "сертификат базы не прошёл проверку",
  ERR_TLS_CERT_ALTNAME_INVALID: "имя в сертификате не совпадает с адресом базы",
};

/**
 * Проверка состояния для Timeweb. Отвечает 200, пока сайт запущен, — чтобы новая версия
 * включалась, а причина проблем с базой была видна прямо здесь, в поле db.
 * Пароли и адреса сюда не выводятся.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1 from "user" limit 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch (e) {
    const err = (e as { cause?: { code?: string } }).cause ?? (e as { code?: string });
    const code = (err as { code?: string })?.code ?? "UNKNOWN";
    return Response.json({ ok: false, db: "error", code, hint: HINTS[code] ?? "см. «Логи приложения»" });
  }
}
