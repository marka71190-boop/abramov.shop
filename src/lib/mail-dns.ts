/**
 * Проверка DNS-записей почты домена: SPF, DKIM, DMARC, MX.
 * Без них письма магазина попадают в спам или не доходят. Запросы — напрямую к публичным DNS
 * (Яндекс, Cloudflare, Google), чтобы видеть свежие записи, а не кэш хостинга.
 */
import "server-only";
import { Resolver } from "node:dns/promises";

export type Check = { ok: boolean; warn?: boolean; title: string; host: string; value?: string; note: string };

const SELECTORS = ["dkim", "mail", "default", "timeweb", "s1", "selector1"];

function resolver() {
  const r = new Resolver({ timeout: 4000, tries: 2 });
  r.setServers(["77.88.8.8", "1.1.1.1", "8.8.8.8"]);
  return r;
}

async function txt(r: Resolver, host: string): Promise<{ records: string[]; error?: string }> {
  try {
    return { records: (await r.resolveTxt(host)).map((parts) => parts.join("")) };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return { records: [] };
    return { records: [], error: code ?? String(e) };
  }
}

/** Примерная длина ключа DKIM в битах по длине base64 */
function keyBits(p: string) {
  const bytes = Math.floor((p.replace(/[^A-Za-z0-9+/]/g, "").length * 3) / 4);
  return bytes > 500 ? 4096 : bytes > 250 ? 2048 : bytes > 120 ? 1024 : bytes * 8;
}

export function mailDomain() {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  return (/@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from)?.[1] ?? "abramov.shop").toLowerCase();
}

export async function checkMailDns(domain = mailDomain()) {
  const r = resolver();
  const out: Check[] = [];

  // Сначала убеждаемся, что DNS вообще отвечает: у живого домена всегда есть NS-записи
  try {
    await r.resolveNs(domain);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "ошибка";
    return {
      domain,
      at: new Date().toISOString(),
      checks: [{ ok: false, title: "DNS не ответил", host: domain, note: `Сервер не смог спросить DNS о домене ${domain} (${code}). Если домен написан верно — попробуйте через минуту` }] as Check[],
    };
  }

  // MX
  try {
    const mx = (await r.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
    out.push({ ok: mx.length > 0, title: "MX — куда приходит почта", host: domain, value: mx.map((m) => `${m.priority} ${m.exchange}`).join(", "), note: mx.length ? "Есть" : "Нет MX — ответы покупателей не дойдут" });
  } catch {
    out.push({ ok: false, title: "MX — куда приходит почта", host: domain, note: "Нет MX-записи — письма на ящик домена не дойдут" });
  }

  // SPF
  const root = await txt(r, domain);
  const spf = root.records.filter((t) => /^v=spf1\b/i.test(t.trim()));
  out.push(
    spf.length === 1
      ? {
          ok: true,
          warn: !/timeweb/i.test(spf[0]) && /timeweb/i.test(process.env.SMTP_HOST ?? ""),
          title: "SPF — кому можно отправлять от домена",
          host: domain,
          value: spf[0],
          note: !/timeweb/i.test(spf[0]) && /timeweb/i.test(process.env.SMTP_HOST ?? "") ? "Запись есть, но в ней нет Timeweb — добавьте include:_spf.timeweb.ru" : "В порядке",
        }
      : {
          ok: false,
          title: "SPF — кому можно отправлять от домена",
          host: domain,
          value: spf.join(" | ") || undefined,
          note: spf.length > 1 ? "Две SPF-записи — так нельзя, почтовики считают SPF сломанным. Оставьте одну" : root.error ? `DNS не ответил (${root.error})` : "Нет SPF-записи",
        },
  );

  // DKIM — перебираем частые селекторы
  let dkim: Check | null = null;
  for (const sel of SELECTORS) {
    const host = `${sel}._domainkey.${domain}`;
    const res = await txt(r, host);
    const rec = res.records.find((t) => /p=/.test(t)) ?? res.records[0];
    if (!rec) continue;
    const v = rec.trim();
    const p = /(?:^|;)\s*p=([^;]*)/.exec(v)?.[1]?.trim() ?? "";
    const problems: string[] = [];
    // v=DKIM1 по стандарту необязателен (RFC 6376), но если он есть — должен стоять первым
    if (/v=DKIM1/i.test(v) && !/^v=DKIM1/i.test(v)) problems.push("v=DKIM1 должен стоять в самом начале значения");
    if (!p) problems.push("нет ключа p= (пустой ключ означает «ключ отозван»)");
    if (/["\\]/.test(v)) problems.push("в значении лишние кавычки или обратные слэши — скопируйте без них");
    if (/\s/.test(p)) problems.push("в ключе есть пробелы или переносы строк — ключ должен быть одной строкой");
    if (p && keyBits(p) < 1024) problems.push("ключ обрезан — скопируйте значение целиком");
    dkim = {
      ok: problems.length === 0,
      title: "DKIM — подпись писем",
      host,
      value: v.length > 120 ? `${v.slice(0, 60)}…${v.slice(-30)}` : v,
      note: problems.length ? problems.join("; ") : `В порядке: ключ ~${keyBits(p)} бит, селектор «${sel}»`,
    };
    break;
  }
  out.push(
    dkim ?? {
      ok: false,
      title: "DKIM — подпись писем",
      host: `dkim._domainkey.${domain}`,
      note: `Запись не найдена (проверили селекторы: ${SELECTORS.join(", ")}). Скопируйте TXT-запись dkim._domainkey из панели почты Timeweb в DNS домена. Новая запись видна через 15 минут – 24 часа`,
    },
  );

  // DMARC
  const dm = await txt(r, `_dmarc.${domain}`);
  const dmarc = dm.records.find((t) => /^v=DMARC1/i.test(t.trim()));
  out.push(
    dmarc
      ? { ok: true, title: "DMARC — что делать с поддельными письмами", host: `_dmarc.${domain}`, value: dmarc, note: "В порядке" }
      : { ok: false, warn: true, title: "DMARC — что делать с поддельными письмами", host: `_dmarc.${domain}`, note: "Нет записи. Добавьте TXT: v=DMARC1; p=none — Gmail и Яндекс охотнее доверяют таким доменам" },
  );

  return { domain, checks: out, at: new Date().toISOString() };
}
