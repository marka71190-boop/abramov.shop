/** Журнал: разделы и время чтения. Общий для сервера и браузера */
export const SECTIONS: Record<string, string> = {
  choose: "Выбор кия",
  care: "Уход и ремонт",
  game: "Игра и техника",
  club: "Свой клуб",
  news: "Новости",
  tips: "Советы",
};

/** «≈ 4 мин чтения»: 180 слов в минуту */
export function readMinutes(body: string) {
  const words = body.replace(/\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]*\)/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

/** Ссылки на товары внутри текста: [[product:slug]] */
export const productSlugsIn = (body: string) => [...new Set([...body.matchAll(/\[\[product:([a-z0-9-]+)\]\]/g)].map((m) => m[1]))];
