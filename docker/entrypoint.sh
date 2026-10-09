#!/bin/sh
# Старт контейнера: обновить структуру базы, дозаполнить справочники, запустить сайт.
# Сайт запускается в любом случае: если база недоступна, в логах будет причина,
# а /api/health будет отвечать 503, пока DATABASE_URL не исправят.

# Слушаем все интерфейсы и тот же порт, что в EXPOSE (платформа может подставить свой HOSTNAME)
export HOSTNAME=0.0.0.0
export PORT=3000

echo "[старт] Abramov Shop, порт $PORT"
if [ -s "$NODE_EXTRA_CA_CERTS" ]; then
  echo "[старт] Сертификат Timeweb подключён"
else
  echo "[старт] ВНИМАНИЕ: сертификата Timeweb нет — подключение к базе с sslmode=verify-full не пройдёт"
fi

if node scripts/migrate.mjs; then
  node scripts/seed.mjs || echo "[старт] ВНИМАНИЕ: начальные данные не записались, см. ошибку выше"
else
  echo "[старт] ВНИМАНИЕ: база не готова, сайт запускается без неё — причина выше"
fi

echo "[старт] Запускаю сайт"
exec node server.js
