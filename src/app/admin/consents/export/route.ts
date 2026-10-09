import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { CONSENT_KIND_LABEL, CONSENT_SOURCE_LABEL, consentRows, consentWhere } from "@/lib/consent-query";
import { fmtDateTime } from "@/lib/format";
import { getViewer, isAdmin } from "@/lib/viewer";

/** Выгрузка журнала согласий. CSV с «;» и BOM — Excel открывает кириллицу без танцев. */
export async function GET(req: Request) {
  const me = await getViewer();
  if (!me || !isAdmin(me)) return new NextResponse("Нет доступа", { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await consentRows(consentWhere(sp));

  const cell = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const header = [
    "Дата и время (МСК)",
    "Вид согласия",
    "Где отмечено",
    "Имя",
    "Телефон",
    "Почта",
    "Аккаунт",
    "IP",
    "Браузер",
    "Редакция документа",
    "SHA-256 текста",
    "Отозвано",
    "ID записи",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        fmtDateTime(r.createdAt),
        CONSENT_KIND_LABEL[r.kind],
        CONSENT_SOURCE_LABEL[r.source],
        r.name,
        r.phone,
        r.email,
        r.userEmail,
        r.ip,
        r.userAgent,
        r.docVersion,
        r.docHash,
        r.revokedAt ? fmtDateTime(r.revokedAt) : "",
        r.id,
      ]
        .map(cell)
        .join(";"),
    );
  }

  await audit(me.id, "consent.export", "consent", null, { filter: sp, rows: rows.length });

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="consents-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
