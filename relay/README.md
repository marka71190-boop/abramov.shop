# Релей для Telegram

С серверов в России `api.telegram.org` часто не открывается (запросы висят до таймаута).
Сайт получает сообщения боту «длинным опросом» — все запросы исходящие, поэтому достаточно
релея, через который сайт ходит к Telegram. Данные клиентов остаются в базе в России,
через релей идут только сообщения бота.

## Вариант 1. Cloudflare Workers (бесплатно, без сервера)

1. dash.cloudflare.com → зарегистрироваться → **Workers & Pages** → **Create** → **Create Worker** → имя `abramov-tg` → **Deploy**.
2. **Edit code** → вставить содержимое `cloudflare-worker.js` → **Deploy**.
3. **Settings → Variables and Secrets → Add**: тип *Secret*, имя `RELAY_KEY`, значение — длинная случайная строка.
4. В Timeweb добавить переменную и пересобрать сайт:
   ```
   TELEGRAM_API_URL=https://abramov-tg.<ваш-аккаунт>.workers.dev/<RELAY_KEY>
   ```
5. Админка → Настройки → «Telegram-бот» → «Проверить».

## Вариант 2. Небольшой сервер за границей

Если Cloudflare с сервера Timeweb тоже не открывается: облачный сервер в Нидерландах или Казахстане
(самый маленький), на нём Caddy:

```
tg.ваш-домен {
    @ok remote_ip <IP приложения Timeweb>
    handle @ok {
        reverse_proxy https://api.telegram.org {
            header_up Host api.telegram.org
        }
    }
    respond 403
}
```

На сайте: `TELEGRAM_API_URL=https://tg.ваш-домен`.
