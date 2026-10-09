#!/bin/sh
# Старт контейнера. Сначала поднимаем сайт (чтобы проверка состояния Timeweb сразу получила ответ),
# потом в фоне обновляем структуру базы и справочники. Причины проблем с базой — в «Логах приложения»
# и на странице /api/health.

# Слушаем все интерфейсы и тот же порт, что в EXPOSE (платформа может подставить свой HOSTNAME)
export HOSTNAME=0.0.0.0
export PORT=3000

echo "[старт] Abramov Shop, порт $PORT"
if [ -s "$NODE_EXTRA_CA_CERTS" ]; then
  echo "[старт] Сертификат Timeweb подключён"
else
  echo "[старт] ВНИМАНИЕ: сертификата Timeweb нет — подключение к базе с sslmode=verify-full не пройдёт"
fi

echo "[старт] Запускаю сайт"
node server.js &
SERVER_PID=$!
trap 'kill -TERM $SERVER_PID 2>/dev/null' TERM INT

if node scripts/migrate.mjs; then
  node scripts/seed.mjs || echo "[старт] ВНИМАНИЕ: начальные данные не записались, см. ошибку выше"
  echo "[старт] База готова"
else
  echo "[старт] ВНИМАНИЕ: база не готова — причина выше, сайт работает без неё"
fi

wait $SERVER_PID
