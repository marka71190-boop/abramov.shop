#!/bin/sh
# Старт контейнера: обновить структуру базы, дозаполнить справочники, запустить сайт.
set -e
node scripts/migrate.mjs
node scripts/seed.mjs
exec node server.js
