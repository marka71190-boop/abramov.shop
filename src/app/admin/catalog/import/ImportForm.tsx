"use client";
import Link from "next/link";
import { useState } from "react";
import type { ApplyResult, Plan } from "@/lib/catalog-import";
import { applyImportAction, finishImportAction } from "./actions";

const BATCH = 5;

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  async function check() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPlan(null);
    setResults(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/admin/catalog-import", { method: "POST", body: fd })
      .then((x) => x.json())
      .catch(() => ({ error: "Нет связи с сервером" }));
    setBusy(false);
    if (r.error) setError(r.error);
    else setPlan(r);
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    setDone(0);
    const all: ApplyResult[] = [];
    for (let i = 0; i < plan.items.length; i += BATCH) {
      const batch = plan.items.slice(i, i + BATCH);
      const r = await applyImportAction(batch.map((x) => x.input)).catch(() => ({ error: "Нет связи с сервером" }) as { error: string; results?: undefined });
      if (r.results) all.push(...r.results);
      else all.push(...batch.map((x) => ({ sku: x.input.productSku, ok: false, error: r.error ?? "ошибка", warnings: [] })));
      setDone(Math.min(plan.items.length, i + BATCH));
    }
    const counts = { created: all.filter((r) => r.ok && r.created).length, updated: all.filter((r) => r.ok && !r.created).length, failed: all.filter((r) => !r.ok).length };
    await finishImportAction(counts).catch(() => {});
    setResults(all);
    setBusy(false);
  }

  const creates = plan?.items.filter((x) => x.action === "create").length ?? 0;
  const updates = plan?.items.filter((x) => x.action === "update").length ?? 0;

  if (results) {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    const warn = results.filter((r) => r.warnings.length);
    return (
      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Готово</h2>
        <div className="form-ok">
          Создано товаров: {ok.filter((r) => r.created).length}, обновлено: {ok.filter((r) => !r.created).length}
          {failed.length ? `, не загрузилось: ${failed.length}` : ""}
        </div>
        {failed.length > 0 && (
          <div className="form-error">
            {failed.map((r) => (
              <div key={r.sku}>
                {r.sku}: {r.error}
              </div>
            ))}
          </div>
        )}
        {warn.length > 0 && (
          <div className="notice notice--muted" style={{ margin: 0 }}>
            <strong>Не все фото загрузились — товары сохранены без них:</strong>
            {warn.map((r) =>
              r.warnings.map((w, i) => (
                <div key={r.sku + i} className="small">
                  {r.sku}: {w}
                </div>
              )),
            )}
          </div>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          Новые товары — черновики, если в колонке «Показывать» не стояло «Да». Проверьте их в каталоге и опубликуйте.
        </p>
        <div className="row">
          <Link className="btn btn--gold btn--sm" href="/admin/catalog">
            В каталог
          </Link>
          <button
            type="button"
            className="btn btn--line btn--sm"
            onClick={() => {
              setResults(null);
              setPlan(null);
              setFile(null);
            }}
          >
            Загрузить ещё файл
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>1. Таблица</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Новые товары — заполните шаблон. Поменять цены и остатки — выгрузите каталог, исправьте и загрузите обратно. Подойдёт файл из Excel, Google Таблиц
          (Файл → Скачать → Microsoft Excel) или Numbers.
        </p>
        <div className="row">
          <a className="btn btn--line btn--sm" href="/admin/catalog/template">
            Скачать шаблон
          </a>
          <a className="btn btn--line btn--sm" href="/admin/catalog/export">
            Выгрузить каталог
          </a>
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>2. Загрузка</h2>
        <div className="row" style={{ alignItems: "center" }}>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPlan(null);
              setError(null);
            }}
          />
          <button type="button" className="btn btn--gold btn--sm" disabled={!file || busy} onClick={check}>
            {busy && !plan ? "Проверяем…" : "Проверить файл"}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
      </div>

      {plan && (
        <div className="panel stack">
          <h2 style={{ marginBottom: 0 }}>3. Проверка</h2>
          <div className="row" style={{ gap: 10 }}>
            <span className="pill pill--ok">новых: {creates}</span>
            <span className="pill">обновится: {updates}</span>
            {plan.errors.length > 0 && <span className="pill pill--bad">ошибок: {plan.errors.length}</span>}
          </div>
          {plan.newCategories.length > 0 && (
            <div className="small">
              Будут созданы категории: <b>{plan.newCategories.join(", ")}</b>
            </div>
          )}
          {plan.hiddenCategories.length > 0 && (
            <div className="notice" style={{ margin: 0 }}>
              Категории <b>{plan.hiddenCategories.join(", ")}</b> скрыты на сайте — товары в них покупатели не увидят, пока вы не опубликуете категорию в
              каталоге.
            </div>
          )}
          {plan.errors.length > 0 && (
            <div className="form-error">
              <div style={{ marginBottom: 6 }}>Эти строки пропустим — исправьте и загрузите файл снова:</div>
              {plan.errors.slice(0, 50).map((e, i) => (
                <div key={i} className="small">
                  Строка {e.row}: {e.text}
                </div>
              ))}
              {plan.errors.length > 50 && <div className="small">…и ещё {plan.errors.length - 50}</div>}
            </div>
          )}
          {plan.items.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Артикул</th>
                    <th>Товар</th>
                    <th></th>
                    <th>Что изменится</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((x) => (
                    <tr key={x.input.productSku}>
                      <td className="small">{x.input.productSku}</td>
                      <td>{x.name}</td>
                      <td>
                        <span className={`pill ${x.action === "create" ? "pill--ok" : ""}`}>{x.action === "create" ? "новый" : "обновление"}</span>
                      </td>
                      <td className="small">{x.changes.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {busy && plan && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="meter__bar">
                <div className="meter__fill" style={{ width: `${(done / Math.max(1, plan.items.length)) * 100}%` }} />
              </div>
              <div className="small muted">
                Загружено {done} из {plan.items.length}. Фото скачиваются — не закрывайте страницу.
              </div>
            </div>
          )}
          <div>
            <button type="button" className="btn btn--gold" disabled={busy || !plan.items.length} onClick={apply}>
              {busy ? "Загружаем…" : `Загрузить ${plan.items.length} товар(ов)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
