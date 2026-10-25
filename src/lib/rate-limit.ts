import "server-only";

/** Простое ограничение частоты запросов в памяти процесса (сайт работает в одном контейнере). */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return function check(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return true;
  };
}

/**
 * Защита от подбора кодов: сколько разных неверных кодов прислали с одного ключа (IP или аккаунта)
 * за окно. Один и тот же неверный код считается один раз — пересчёт корзины не блокирует покупателя.
 */
export function createGuessGuard({ limit, windowMs }: { limit: number; windowMs: number }) {
  const misses = new Map<string, Map<string, number>>();
  const live = (key: string, now: number) => {
    const m = misses.get(key);
    if (!m) return 0;
    for (const [code, t] of m) if (now - t >= windowMs) m.delete(code);
    if (!m.size) misses.delete(key);
    return m.size;
  };
  return {
    blocked(keys: string[]) {
      const now = Date.now();
      return keys.some((k) => live(k, now) >= limit);
    },
    miss(keys: string[], code: string) {
      const now = Date.now();
      for (const k of keys) misses.set(k, (misses.get(k) ?? new Map()).set(code, now));
      if (misses.size > 5000) for (const k of [...misses.keys()]) live(k, now);
    },
  };
}
