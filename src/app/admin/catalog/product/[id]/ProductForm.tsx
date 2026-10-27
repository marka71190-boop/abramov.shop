"use client";
import { NewAttribute } from "../../attributes/NewAttribute";
import { useActionState, useRef, useState } from "react";
import { slugify } from "@/lib/slug";
import { deleteProduct, saveProduct } from "../../../shop-actions";

interface Variant {
  key: string; // id сохранённого варианта или временный ключ нового
  id?: string;
  name: string;
  sku: string;
  price: string;
  stock: number;
  isActive: boolean;
}
interface Image {
  url: string;
  alt: string;
  variantKey: string | null;
}

export interface ProductData {
  id: string;
  name: string;
  slug: string;
  categoryId: string | null;
  description: string;
  searchTags: string;
  videos: { url: string; title: string }[];
  channel: string;
  wholesalePrice: number | null;
  wholesaleMin: number;
  price: number;
  oldPrice: number | null;
  sku: string | null;
  visibility: "DRAFT" | "HIDDEN" | "PUBLISHED";
  publishAt: Date | null;
  isLimited: boolean;
  limitedTotal: number | null;
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  sortOrder: number;
  previewToken: string;
  variants: { id: string; name: string; sku: string | null; price: number | null; stock: number; isActive: boolean }[];
  images: { url: string; alt: string; variantId: string | null }[];
}

type Brief = { id: string; name: string; sku: string | null; visibility: "DRAFT" | "HIDDEN" | "PUBLISHED" };
export type AttrDef = { id: string; name: string; unit: string; type: string; options: string[]; categoryIds: string[] };

/** Характеристики товара: показываем общие и те, что для выбранной категории */
function AttrPanel({
  defs: initial,
  values,
  onChange,
  categoryId,
  categoryName,
}: {
  defs: AttrDef[];
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  categoryId: string;
  categoryName?: string;
}) {
  const [defs, setDefs] = useState(initial);
  const shown = defs.filter((a) => !a.categoryIds.length || a.categoryIds.includes(categoryId) || values[a.id]);
  const set = (id: string, v: string) => onChange({ ...values, [id]: v });
  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>Характеристики</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Видны в карточке, фильтрах и сравнении. Пустые не показываются. Нет нужной — добавьте свою кнопкой ниже. Все характеристики —{" "}
        <a href="/admin/catalog/attributes">Каталог → Характеристики</a>.
      </p>
      <div className="form-grid">
        {shown.map((a) => (
          <label key={a.id} className="field">
            {a.name}
            {a.unit ? `, ${a.unit}` : ""}
            {a.type === "select" ? (
              <select className="select" value={values[a.id] ?? ""} onChange={(e) => set(a.id, e.target.value)}>
                <option value="">—</option>
                {a.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" inputMode={a.type === "number" ? "decimal" : undefined} value={values[a.id] ?? ""} onChange={(e) => set(a.id, e.target.value)} />
            )}
          </label>
        ))}
      </div>
      <NewAttribute
        categoryId={categoryId}
        categoryName={categoryName}
        onCreated={(a) => setDefs((d) => (d.some((x) => x.id === a.id) ? d.map((x) => (x.id === a.id ? a : x)) : [...d, a]))}
      />
    </div>
  );
}

/** «С этим покупают»: ручная подборка; пусто — подбираем сами по покупкам и категории */
function RelatedPicker({ all, value, onChange }: { all: Brief[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const byId = new Map(all.map((p) => [p.id, p]));
  const needle = q.trim().toLowerCase();
  const found = needle
    ? all.filter((p) => !value.includes(p.id) && (p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle))).slice(0, 8)
    : [];
  const shift = (i: number, d: number) => {
    const a = [...value];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  return (
    <div className="panel stack">
      <h2 style={{ marginBottom: 0 }}>С этим покупают</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Эти товары покажем первыми в карточке и в корзине. Не выбрано — подберём сами: что чаще берут вместе, затем популярное из той же категории. Черновики и скрытые покупателям не видны.
      </p>
      {value.length > 0 && (
        <ol className="stack" style={{ gap: 6, margin: 0, paddingLeft: 20 }}>
          {value.map((id, i) => {
            const p = byId.get(id);
            return (
              <li key={id}>
                <div className="row" style={{ gap: 8, justifyContent: "space-between" }}>
                  <span>
                    {p?.name ?? "Удалённый товар"}
                    {p && p.visibility !== "PUBLISHED" && <span className="muted small"> · {p.visibility === "DRAFT" ? "черновик" : "скрыт"}</span>}
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => shift(i, -1)} disabled={i === 0} aria-label="Выше">
                      ↑
                    </button>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => shift(i, 1)} disabled={i === value.length - 1} aria-label="Ниже">
                      ↓
                    </button>
                    <button type="button" className="btn btn--line btn--sm" onClick={() => onChange(value.filter((x) => x !== id))} aria-label="Убрать">
                      ×
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {value.length < 12 ? (
        <label className="field">
          Добавить товар
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или артикул" />
        </label>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          Выбрано максимум — 12 товаров.
        </p>
      )}
      {found.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {found.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn btn--line btn--sm"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                onChange([...value, p.id]);
                setQ("");
              }}
            >
              + {p.name}
              {p.sku ? <span className="muted"> · {p.sku}</span> : null}
            </button>
          ))}
        </div>
      )}
      {needle && !found.length && <p className="small muted" style={{ margin: 0 }}>Ничего не нашли</p>}
    </div>
  );
}

const newKey = () => `new-${Math.random().toString(36).slice(2, 10)}`;
const toLocal = (d: Date | null) => (d ? new Date(+new Date(d) + 3 * 3600_000).toISOString().slice(0, 16) : "");
const rubStr = (k: number | null | undefined) => (k == null ? "" : String(k / 100));

/** Где продаётся товар: розница, оптовый каталог или оба */
function WholesaleFields({ product }: { product: ProductData | null }) {
  const [channel, setChannel] = useState(product?.channel ?? "RETAIL");
  return (
    <div className="form-grid">
      <label className="field">
        Где продаётся
        <select className="select" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="RETAIL">Только розница</option>
          <option value="BOTH">Розница и оптовый каталог</option>
          <option value="WHOLESALE">Только оптовый каталог</option>
        </select>
        {channel === "WHOLESALE" && <span className="muted small">Покупатели в рознице товар не видят. «Цена» выше — оптовая.</span>}
      </label>
      {channel === "BOTH" && (
        <label className="field">
          Оптовая цена, ₽
          <input className="input" name="wholesalePrice" type="number" min={1} step="0.01" defaultValue={rubStr(product?.wholesalePrice)} />
          <span className="muted small">Для всех вариантов. Пусто — как в рознице</span>
        </label>
      )}
      {channel !== "RETAIL" && (
        <label className="field">
          Минимальная партия, шт.
          <input className="input" name="wholesaleMin" type="number" min={1} max={10000} defaultValue={product?.wholesaleMin ?? 1} />
        </label>
      )}
    </div>
  );
}

export function ProductForm({
  product,
  categories,
  saved,
  canDelete,
  allProducts,
  related: relatedInit,
  attrDefs = [],
  attrValues: attrInit = {},
}: {
  product: ProductData | null;
  categories: { id: string; name: string }[];
  saved: boolean;
  canDelete: boolean;
  allProducts: Brief[];
  related: string[];
  attrDefs?: AttrDef[];
  attrValues?: Record<string, string>;
}) {
  const [attrs, setAttrs] = useState<Record<string, string>>(attrInit);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [related, setRelated] = useState<string[]>(relatedInit);
  const [state, action, pending] = useActionState(saveProduct, saved ? { ok: "Товар создан" } : {});
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [limited, setLimited] = useState(product?.isLimited ?? false);
  const [variants, setVariants] = useState<Variant[]>(
    product?.variants.map((v) => ({ key: v.id, id: v.id, name: v.name, sku: v.sku ?? "", price: rubStr(v.price), stock: v.stock, isActive: v.isActive })) ?? [
      { key: newKey(), name: "Основной", sku: "", price: "", stock: 0, isActive: true },
    ],
  );
  const [images, setImages] = useState<Image[]>(product?.images.map((im) => ({ url: im.url, alt: im.alt, variantKey: im.variantId })) ?? []);
  const [uploading, setUploading] = useState(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setV = (i: number, patch: Partial<Variant>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const move = <T,>(arr: T[], i: number, d: number) => {
    const a = [...arr];
    const j = i + d;
    if (j < 0 || j >= a.length) return a;
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploadErr(null);
    for (const f of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/admin/media", { method: "POST", body: fd }).then((x) => x.json());
        if (r.url) setImages((im) => [...im, { url: r.url, alt: "", variantKey: null }]);
        else setUploadErr(r.error ?? "Не удалось загрузить");
      } catch {
        setUploadErr("Не удалось загрузить — проверьте интернет");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  const totalStock = variants.filter((v) => v.isActive).reduce((a, v) => a + (Number(v.stock) || 0), 0);

  return (
    <form action={action} className="stack">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      <input type="hidden" name="images" value={JSON.stringify(images)} />
      <input type="hidden" name="related" value={JSON.stringify(related)} />
      <input type="hidden" name="attrs" value={JSON.stringify(attrs)} />

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Основное</h2>
        <div className="form-grid">
          <label className="field">
            Название
            <input
              className="input"
              name="name"
              value={name}
              required
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </label>
          <label className="field">
            Адрес: /product/…
            <input
              className="input"
              name="slug"
              value={slug}
              required
              pattern="[a-z0-9\-]{2,80}"
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setSlugTouched(true);
              }}
            />
          </label>
          <label className="field">
            Категория
            <select className="select" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Без категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Артикул
            <input className="input" name="sku" defaultValue={product?.sku ?? ""} />
          </label>
          <label className="field">
            Цена, ₽
            <input className="input" name="price" type="number" min={1} step="0.01" required defaultValue={rubStr(product?.price)} />
          </label>
          <label className="field">
            Старая цена, ₽ (зачёркнутая)
            <input className="input" name="oldPrice" type="number" min={1} step="0.01" defaultValue={rubStr(product?.oldPrice)} />
          </label>
          <label className="field">
            Видимость
            <select className="select" name="visibility" defaultValue={product?.visibility ?? "DRAFT"}>
              <option value="DRAFT">Черновик</option>
              <option value="HIDDEN">Скрыто</option>
              <option value="PUBLISHED">Опубликовано</option>
            </select>
          </label>
          <label className="field">
            Открыть автоматически (МСК)
            <input className="input" type="datetime-local" name="publishAt" defaultValue={toLocal(product?.publishAt ?? null)} />
          </label>
        </div>
        <WholesaleFields product={product} />
        <label className="field">
          Описание
          <textarea className="textarea" name="description" defaultValue={product?.description} style={{ minHeight: 160, paddingTop: 12 }} />
        </label>
        <label className="field">
          Слова для поиска
          <input
            className="input"
            name="searchTags"
            defaultValue={product?.searchTags ?? ""}
            maxLength={1000}
            placeholder="Например: джос, джосс, jos"
          />
          <span className="muted small">
            Через запятую: как ещё покупатели могут назвать товар — бренд по-русски, сокращения, частые ошибки. На сайте эти слова не видны, по ним
            только ищут. Название, варианты, артикул и описание искать и так умеет — их сюда писать не нужно.
          </span>
        </label>
        <label className="field">
          Видеообзоры
          <textarea
            className="textarea"
            name="videos"
            defaultValue={(product?.videos ?? []).map((v) => (v.title ? `${v.url} | ${v.title}` : v.url)).join("\n")}
            placeholder={"https://vkvideo.ru/video-123456_789012 | Обзор кия: баланс и удар\nhttps://rutube.ru/video/…"}
            style={{ minHeight: 76, paddingTop: 12 }}
          />
          <span className="muted small">
            По ссылке в строке, после «|» — подпись. Подходят VK Видео, Rutube и YouTube (YouTube в России открывается не у всех — лучше VK или
            Rutube). Видео появится в карточке под описанием; плеер загружается только когда покупатель нажмёт «смотреть».
          </span>
        </label>
        <div className="row" style={{ gap: 24, alignItems: "flex-end" }}>
          <label className="check">
            <input type="checkbox" name="isLimited" checked={limited} onChange={(e) => setLimited(e.target.checked)} />
            <span>Лимитированная серия — показывать «осталось N из M»</span>
          </label>
          {limited && (
            <label className="field">
              Тираж, шт.
              <input className="input" name="limitedTotal" type="number" min={1} defaultValue={product?.limitedTotal ?? ""} style={{ minHeight: 40 }} />
            </label>
          )}
        </div>
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Фото</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Первое фото — обложка. Подойдёт любой формат кадра — квадрат 1000×1000, вертикальный или горизонтальный, страница товара
          подстроится. JPG или PNG до 15 МБ, сайт сам уменьшит и сожмёт.
          {variants.length > 1 && " У каждого фото выберите вариант — покупатель увидит эти фото, когда выберет вариант. «Общее» показывается всегда."}
        </p>
        <div className="img-grid">
          {images.map((im, i) => (
            <div key={im.url + i} className="img-tile">
              <img src={im.url} alt="" />
              {i === 0 && <span className="tag" style={{ position: "absolute", top: 6, left: 6, padding: "3px 8px", fontSize: 11 }}>Обложка</span>}
              {variants.length > 1 && (
                <select
                  className="img-tile__variant"
                  aria-label="Вариант для фото"
                  value={im.variantKey ?? ""}
                  onChange={(e) => setImages((a) => a.map((x, j) => (j === i ? { ...x, variantKey: e.target.value || null } : x)))}
                >
                  <option value="">Общее фото</option>
                  {variants.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.name || "Без названия"}
                    </option>
                  ))}
                </select>
              )}
              <div className="img-tile__bar">
                <button type="button" aria-label="Левее" disabled={i === 0} onClick={() => setImages((a) => move(a, i, -1))}>
                  ←
                </button>
                <button type="button" aria-label="Правее" disabled={i === images.length - 1} onClick={() => setImages((a) => move(a, i, 1))}>
                  →
                </button>
                <button type="button" aria-label="Удалить фото" onClick={() => setImages((a) => a.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            </div>
          ))}
          <label className="img-tile img-tile--add">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
            {uploading ? `Загружаем… ${uploading}` : "+ Добавить фото"}
          </label>
        </div>
        {uploadErr && <div className="form-error">{uploadErr}</div>}
      </div>

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Варианты и остатки</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Размер, цвет, вес — у каждого свой остаток. Если вариант один, покупатель выбор не увидит. Всего в наличии: {totalStock} шт.
        </p>
        <div className="table-wrap">
          <table className="table variants-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Артикул</th>
                <th>Цена, ₽ (если другая)</th>
                <th>Остаток</th>
                <th>В продаже</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={v.key}>
                  <td>
                    <input className="input" value={v.name} onChange={(e) => setV(i, { name: e.target.value })} required />
                  </td>
                  <td>
                    <input className="input" value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" type="number" min={1} step="0.01" value={v.price} onChange={(e) => setV(i, { price: e.target.value })} />
                  </td>
                  <td>
                    <input className="input" type="number" min={0} value={v.stock} onChange={(e) => setV(i, { stock: Math.max(0, Math.trunc(Number(e.target.value))) })} />
                  </td>
                  <td>
                    <button type="button" className="toggle" aria-pressed={v.isActive} aria-label="В продаже" onClick={() => setV(i, { isActive: !v.isActive })}>
                      <span />
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="linklike small"
                      disabled={variants.length === 1}
                      onClick={() => {
                        const removed = variants[i];
                        setVariants((vs) => vs.filter((_, j) => j !== i));
                        setImages((a) => a.map((x) => (x.variantKey === removed.key ? { ...x, variantKey: null } : x)));
                      }}
                    >
                      Убрать
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <button type="button" className="btn btn--line btn--sm" onClick={() => setVariants((vs) => [...vs, { key: newKey(), name: "", sku: "", price: "", stock: 0, isActive: true }])}>
            + Вариант
          </button>
        </div>
      </div>

      <AttrPanel defs={attrDefs} values={attrs} onChange={setAttrs} categoryId={categoryId} categoryName={categories.find((c) => c.id === categoryId)?.name} />

      <RelatedPicker all={allProducts} value={related} onChange={setRelated} />

      <div className="panel stack">
        <h2 style={{ marginBottom: 0 }}>Для расчёта доставки СДЭК</h2>
        <div className="form-grid">
          <label className="field">
            Вес в упаковке, г
            <input className="input" name="weightGrams" type="number" min={1} defaultValue={product?.weightGrams ?? 300} />
          </label>
          <label className="field">
            Длина, см
            <input className="input" name="lengthCm" type="number" min={1} defaultValue={product?.lengthCm ?? 10} />
          </label>
          <label className="field">
            Ширина, см
            <input className="input" name="widthCm" type="number" min={1} defaultValue={product?.widthCm ?? 10} />
          </label>
          <label className="field">
            Высота, см
            <input className="input" name="heightCm" type="number" min={1} defaultValue={product?.heightCm ?? 10} />
          </label>
          <label className="field">
            Порядок в каталоге
            <input className="input" name="sortOrder" type="number" defaultValue={product?.sortOrder ?? 0} />
          </label>
        </div>
      </div>

      {state.error && <div className="form-error">{state.error}</div>}
      {state.ok && <div className="form-ok">{state.ok}</div>}
      <div className="row">
        <button className="btn btn--gold btn--sm" disabled={pending || uploading > 0}>
          {pending ? "Сохраняем…" : "Сохранить товар"}
        </button>
        {product && (
          <a className="btn btn--line btn--sm" href={`/product/${product.slug}?preview=${product.previewToken}`} target="_blank" rel="noreferrer">
            Предпросмотр
          </a>
        )}
        {product && canDelete && (
          <button
            type="button"
            className="btn btn--danger btn--sm"
            onClick={() => confirm("Удалить товар? В старых заказах он останется по названию.") && deleteProduct(product.id)}
          >
            Удалить
          </button>
        )}
      </div>
    </form>
  );
}
