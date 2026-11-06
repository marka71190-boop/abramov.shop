/**
 * Подпись клуба: у сети несколько клубов с одним названием в одном городе,
 * поэтому везде показываем название вместе с улицей: «Клуб «Чемпион» · ул. Красная, 176».
 * Общий файл для сервера и браузера.
 */
export interface ClubLike {
  name: string;
  address?: string | null;
  city?: string | null;
}

/** «Клуб «Чемпион» · ул. Красная, 176» */
export const clubTitle = (c: ClubLike) => (c.address ? `${c.name} · ${c.address}` : c.name);

/** «Клуб «Чемпион» · ул. Красная, 176, Краснодар» — когда важен и город */
export const clubTitleCity = (c: ClubLike) => [clubTitle(c), c.city].filter(Boolean).join(", ");
