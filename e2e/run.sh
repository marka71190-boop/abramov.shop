#!/usr/bin/env bash
# Автотесты сайта целиком: своя база (PGlite), заглушки почты и ЮKassa, собранный сайт, браузер Chromium.
#   bash e2e/run.sh            — собрать сайт и прогнать тесты
#   E2E_SKIP_BUILD=1 bash e2e/run.sh — без сборки (сайт уже собран с NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000)
# Нужен пакет playwright (npm i --no-save playwright) и Chromium (npx playwright install chromium).
set -euo pipefail
cd "$(dirname "$0")/.."
RUN=e2e/.run
rm -rf "$RUN" && mkdir -p "$RUN"

export DATABASE_URL=postgresql://postgres@127.0.0.1:5433/postgres
export BETTER_AUTH_SECRET=e2e-only-secret-0123456789abcdef0123456789
export NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
export E2E_BASE=$NEXT_PUBLIC_SITE_URL
export SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_USER=shop@abramov.shop SMTP_PASS=e2e
export YOOKASSA_SHOP_ID=e2e YOOKASSA_SECRET_KEY=e2e YOOKASSA_API_URL=http://127.0.0.1:4010/v3
export OWNER_EMAIL=owner@e2e.test
# Вход по Face ID не работает на адресе-IP: в тесте passkey сайт открывается как localhost
export PASSKEY_ORIGIN=http://localhost:3000 TRUSTED_ORIGINS=http://localhost:3000
# Робокасса в тестовом режиме (выдуманные пароли, на настоящую Робокассу запросы не уходят) и курсы ЦБ из заглушки
export ROBOKASSA_LOGIN=e2e ROBOKASSA_PASSWORD1=e2e-pass1 ROBOKASSA_PASSWORD2=e2e-pass2 ROBOKASSA_TEST=1 CBR_RATES_URL=http://127.0.0.1:4010/cbr
export NODE_ENV=production

pids=()
# Каждый процесс — в своей группе (setsid): гасим вместе с дочерними (next start запускает next-server)
cleanup() {
  for p in "${pids[@]}"; do kill -- "-$p" 2>/dev/null || kill "$p" 2>/dev/null || true; done
  pkill -f "dev-db.mjs $RUN" 2>/dev/null || true
}
trap cleanup EXIT

wait_port() { for _ in $(seq 1 120); do (echo > /dev/tcp/127.0.0.1/$1) 2>/dev/null && return 0; sleep 0.5; done; echo "порт $1 не открылся"; return 1; }

setsid node scripts/dev-db.mjs "$RUN/db" > "$RUN/db.log" 2>&1 & pids+=($!)
setsid node e2e/mock-smtp.mjs "$RUN/mail.jsonl" 2525 > "$RUN/smtp.log" 2>&1 & pids+=($!)
setsid node e2e/mock-yookassa.mjs 4010 > "$RUN/yookassa.log" 2>&1 & pids+=($!)
wait_port 5433

echo "== миграции, начальные данные, тестовые данные"
node scripts/migrate.mjs
npx tsx scripts/seed.ts > "$RUN/seed.log" 2>&1 || { cat "$RUN/seed.log"; exit 1; }
npx tsx --conditions=react-server --tsconfig tsconfig.json e2e/fixtures.mts

if [ -z "${E2E_SKIP_BUILD:-}" ]; then
  echo "== сборка"
  npm run build > "$RUN/build.log" 2>&1 || { tail -40 "$RUN/build.log"; exit 1; }
fi

echo "== запуск сайта"
setsid node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000 > "$RUN/next.log" 2>&1 & pids+=($!)
wait_port 3000
for _ in $(seq 1 60); do curl -sf -o /dev/null "$E2E_BASE/robots.txt" && break; sleep 1; done

echo "== тесты"
# E2E_TESTS="e2e/stock.test.mjs" — прогнать только часть
if ! node --test --test-concurrency=1 --test-timeout=180000 --test-reporter=spec ${E2E_TESTS:-e2e/*.test.mjs}; then
  echo "== последние строки лога сайта"; tail -60 "$RUN/next.log"
  exit 1
fi
