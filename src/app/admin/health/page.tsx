import { fmtDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/viewer";
import { watchdogStatus } from "@/lib/watchdog";
import { HealthButtons } from "./Buttons";

export const dynamic = "force-dynamic";

const ago = (t: number | null) => {
  if (!t) return "—";
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? "только что" : m < 60 ? `${m} мин назад` : m < 1440 ? `${Math.round(m / 60)} ч назад` : fmtDateTime(new Date(t));
};

/** Состояние сайта: что проверяет сторож и что сейчас сломано */
export default async function HealthPage() {
  await requireAdmin("OWNER");
  const { checks, errors } = watchdogStatus();
  const bad = checks.filter((c) => c.ok === false);

  return (
    <>
      <h1>Состояние сайта</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 760 }}>
        Сторож раз в 5 минут проверяет базу, ЮKassa, СДЭК, почту и Telegram-бота, следит за фоновыми задачами и ошибками на страницах. Если что-то
        сломалось и не чинится само — пишет владельцу и менеджерам в Telegram и уведомлением на телефон, а когда заработает — сообщит «снова
        работает».
      </p>

      <div className={checks.length === 0 ? "notice notice--muted" : bad.length ? "form-error" : "form-ok"} role="status">
        {checks.length === 0
          ? "Первая проверка — через пару минут после запуска сайта."
          : bad.length
            ? `Не работает: ${bad.map((c) => c.title).join(", ")}`
            : "Всё работает"}
      </div>
      <HealthButtons />

      {checks.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Что проверяем</th>
                <th>Состояние</th>
                <th>Последний раз работало</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.key}>
                  <td>{c.title}</td>
                  <td>
                    <span className={`pill ${c.ok === false ? "pill--bad" : c.ok ? "pill--ok" : ""}`}>
                      {c.ok === false ? `сбой${c.fails > 1 ? ` ×${c.fails}` : ""}` : c.ok ? "работает" : "ещё не проверяли"}
                    </span>
                  </td>
                  <td className="small">{ago(c.lastOkAt)}</td>
                  <td className="small muted" style={{ maxWidth: 380 }}>
                    {c.lastError ? `${c.lastError} · ${ago(c.lastErrorAt)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="panel stack">
        <h2 className="h4" style={{ margin: 0 }}>
          Ошибки на страницах за последний час
        </h2>
        {errors.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Ошибок не было.
          </p>
        ) : (
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
            {errors.map((e, i) => (
              <li key={i}>
                <b>{e.path || "/"}</b> · {ago(e.at)} · <span className="muted">{e.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel stack">
        <h2 className="h4" style={{ margin: 0 }}>
          Если сайт упадёт целиком
        </h2>
        <p className="small" style={{ margin: 0 }}>
          Тогда сам сайт написать не сможет — нужна проверка снаружи. Бесплатно это делает Яндекс Метрика: <b>Метрика → счётчик сайта →
          Настройки → Уведомления → «Мониторинг сайта»</b> — включите и укажите свой телефон или почту. Метрика каждые несколько минут открывает
          abramov.shop и сразу сообщит, если он не отвечает.
        </p>
      </section>
    </>
  );
}
