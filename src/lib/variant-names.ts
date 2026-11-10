/**
 * «Основной» — вариант, который сайт создаёт сам у нового товара. Когда у товара появились настоящие
 * варианты (H+, PM, PH…), «Основной» покупателю не нужен: в магазине его не показываем.
 */
export const isPlaceholderVariant = (name: string | null | undefined) => /^\s*основной(\s+вариант)?\s*$/i.test(name ?? "");

/** Варианты для покупателя: без «Основного», если есть другие */
export function shopVariants<T extends { name: string }>(list: T[]): T[] {
  const real = list.filter((v) => !isPlaceholderVariant(v.name));
  return real.length ? real : list;
}
