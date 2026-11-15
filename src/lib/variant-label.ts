/**
 * Короткие подписи вариантов. У товаров, заведённых списком, вариант часто назван полным именем:
 * «Биток Aramith Premier Pyramid ø68мм бордовый», «…желтый». Общее начало покупателю не нужно — оставляем различие:
 * «бордовый», «желтый». Общий файл для сервера и браузера.
 */
export function shortVariantNames(names: string[]): string[] {
  if (names.length < 2) return names;
  const words = names.map((n) => n.trim().split(/\s+/));
  let head = 0;
  while (words.every((w) => w.length > head + 1 && w[head].toLowerCase() === words[0][head].toLowerCase())) head++;
  if (!head) return names;
  return words.map((w) => {
    const s = w.slice(head).join(" ");
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  });
}

/** «9 вариантов», «2 варианта», «1 вариант» */
export function variantsCount(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? "вариант" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "варианта" : "вариантов"}`;
}
