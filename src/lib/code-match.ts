/**
 * Совпадение отсканированного кода с товаром: по штрихкоду (EAN-13) или по артикулу.
 * Общий для кассы, ревизии и поиска товара — работает и в браузере.
 */
const norm = (t: string) => t.trim().toLowerCase().replace(/ё/g, "е");

export function codeMatches(o: { sku: string | null; barcode?: string | null; oldSku?: string | null }, code: string) {
  const c = code.trim();
  if (!c) return false;
  if (o.barcode) {
    const digits = c.replace(/\D/g, "");
    // UPC-A (12 цифр) — тот же EAN-13 с ведущим нулём
    if (digits === o.barcode || (digits.length === 12 && `0${digits}` === o.barcode)) return true;
  }
  // Прежний артикул — со старых этикеток
  return (!!o.sku && norm(o.sku) === norm(c)) || (!!o.oldSku && norm(o.oldSku) === norm(c));
}
