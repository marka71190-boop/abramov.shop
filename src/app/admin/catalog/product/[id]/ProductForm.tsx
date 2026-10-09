"use client";
import { useActionState, useRef, useState } from "react";
import { slugify } from "@/lib/slug";
import { deleteProduct, saveProduct } from "../../../shop-actions";

interface Variant {
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
}

export interface ProductData {
  id: string;
  name: string;
  slug: string;
  categoryId: string | null;
  description: string;
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
  images: { url: string; alt: string }[];
}

const toLocal = (d: Date | null) => (d ? new Date(+new Date(d) + 3 * 3600_000).toISOString().slice(0, 16) : "");
const rubStr = (k: number | null | undefined) => (k == null ? "" : String(k / 100));

export function ProductForm({
  product,
  categories,
  saved,
  canDelete,
}: {
  product: ProductData | null;
  categories: { id: string; name: string }[];
  saved: boolean;
  canDelete: boolean;
}) {
  const [state, action, pending] = useActionState(saveProduct, saved ? { ok: "Товар создан" } : {});
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [limited, setLimited] = useState(product?.isLimited ?? false);
  const [variants, setVariants] = useState<Variant[]>(
    product?.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku ?? "", price: rubStr(v.price), stock: v.stock, isActive: v.isActive })) ?? [
      { name: "Основной", sku: "", price: "", stock: 0, isActive: true },
    ],
  );
  const [images, setImages] = useState<Image[]>(product?.images ?? []);
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
        if (r.url) setImages((im) => [...im, { url: r.url, alt: "" }]);
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
            <select className="select" name="categoryId" defaultValue={product?.categoryId ?? ""}>
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
        <label className="field">
          Описание
          <textarea className="textarea" name="description" defaultValue={product?.description} style={{ minHeight: 160, paddingTop: 12 }} />
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
          Первое фото — обложка. Загружайте JPG или PNG до 15 МБ: сайт сам уменьшит и сожмёт.
        </p>
        <div className="img-grid">
          {images.map((im, i) => (
            <div key={im.url + i} className="img-tile">
              <img src={im.url} alt="" />
              {i === 0 && <span className="tag" style={{ position: "absolute", top: 6, left: 6, padding: "3px 8px", fontSize: 11 }}>Обложка</span>}
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
                <tr key={v.id ?? `new-${i}`}>
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
                      onClick={() => setVariants((vs) => vs.filter((_, j) => j !== i))}
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
          <button type="button" className="btn btn--line btn--sm" onClick={() => setVariants((vs) => [...vs, { name: "", sku: "", price: "", stock: 0, isActive: true }])}>
            + Вариант
          </button>
        </div>
      </div>

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
