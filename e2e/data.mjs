/** Общие тестовые данные: fixtures их создают, тесты ими входят */
export const E2E = {
  base: process.env.E2E_BASE ?? "http://127.0.0.1:3000",
  owner: { email: "owner@e2e.test", password: "e2e-owner-pass-1", pin: "482915" },
  club: { id: "e2e-club-0000-0000-000000000001", name: "Клуб E2E" },
  kassa: { login: "kassa-e2e", password: "e2e-kassa-pass-1" },
  /** Обычный покупатель — паспорт кия: привязка и передача */
  player: { email: "player@e2e.test", password: "e2e-player-pass-1" },
  products: [
    { name: "Мел тестовый E2E", slug: "mel-e2e", price: 50_000, stock: 20, club: 10 },
    { name: "Кий тестовый E2E", slug: "kiy-e2e", price: 3_000_000, stock: 3, club: 2 },
  ],
};
