/** Понятные сообщения вместо кодов ошибок библиотеки входа. */
const MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS: "Аккаунт с такой почтой уже есть. Войдите или восстановите пароль.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Аккаунт с такой почтой уже есть. Войдите или восстановите пароль.",
  INVALID_EMAIL_OR_PASSWORD: "Неверная почта или пароль",
  INVALID_EMAIL: "Проверьте адрес почты",
  PASSWORD_TOO_SHORT: "Пароль должен быть не короче 8 символов",
  PASSWORD_TOO_LONG: "Слишком длинный пароль",
  CONSENT_REQUIRED: "Отметьте согласие на обработку персональных данных",
  TOO_MANY_REQUESTS: "Слишком много попыток. Подождите минуту.",
};

export function authErrorMessage(err: { code?: string; message?: string; status?: number } | null | undefined) {
  if (!err) return "Что-то пошло не так. Попробуйте ещё раз.";
  if (err.status === 429) return MESSAGES.TOO_MANY_REQUESTS;
  if (err.code && MESSAGES[err.code]) return MESSAGES[err.code];
  if (err.message && /[а-яё]/i.test(err.message)) return err.message;
  return "Что-то пошло не так. Попробуйте ещё раз.";
}

/** Разрешаем возвращать пользователя только на страницы нашего сайта. */
export function safeNext(next: string | null | undefined, fallback = "/account") {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
