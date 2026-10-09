# ── Abramov Shop — сборка для Timeweb Cloud App Platform (фреймворк «Dockerfile») ──
# Секреты (база, ключи входа, ЮKassa, СДЭК) сюда НЕ пишем — они задаются в панели Timeweb → «Переменные».

FROM node:22-alpine AS build
WORKDIR /app
# Секрет-заглушка нужен только чтобы сборка не ругалась; настоящий задаётся в панели Timeweb
ENV NEXT_TELEMETRY_DISABLED=1 BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Сайт и скрипт начального наполнения базы (в один файл, без TypeScript на сервере)
RUN npm run build \
 && npx esbuild scripts/seed.ts --bundle --platform=node --format=esm --packages=external --outfile=build/seed.mjs

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TZ=Europe/Moscow
ENV NEXT_PUBLIC_SITE_URL=https://abramov.shop BETTER_AUTH_URL=https://abramov.shop

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Миграции базы и их запуск при старте
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/build/seed.mjs ./scripts/seed.mjs
COPY --from=build /app/docker/entrypoint.sh ./entrypoint.sh

# Корневой сертификат Timeweb: база подключается по домену с защищённым соединением (sslmode=verify-full)
RUN mkdir -p /app/certs \
 && (wget -qO /app/certs/timeweb-root.crt https://st.timeweb.com/cloud-static/ca.crt \
     || echo "ВНИМАНИЕ: сертификат Timeweb не скачался — подключение к базе по домену с TLS не заработает")
ENV NODE_EXTRA_CA_CERTS=/app/certs/timeweb-root.crt

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["./entrypoint.sh"]
