/**
 * Письма покупателям: восстановление пароля, подтверждение оплаты, трек-номер.
 *
 * Включается переменными SMTP_HOST, SMTP_USER, SMTP_PASS (+ SMTP_PORT, SMTP_FROM).
 * Например, Gmail: smtp.gmail.com, порт 465, пароль приложения из настроек аккаунта Google.
 */
import "server-only";
import nodemailer from "nodemailer";
import { isPlaceholderEmail, SITE } from "@/lib/site";

export const mailEnabled = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: nodemailer.Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transport;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Простой фирменный шаблон: графит, золото, кнопка. */
function layout(title: string, body: string, button?: { text: string; url: string }, footerHtml?: string) {
  return `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#f3f2ef">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121212;border:1px solid #2a2a2a">
<tr><td style="padding:28px 32px 8px;font-size:22px;letter-spacing:3px;font-weight:bold"><span style="color:#dcbf83">ABRAMOV</span> SHOP</td></tr>
<tr><td style="padding:8px 32px 0;font-size:20px;font-weight:bold">${esc(title)}</td></tr>
<tr><td style="padding:12px 32px 8px;font-size:15px;line-height:1.6;color:#d6d5d2">${body}</td></tr>
${button ? `<tr><td style="padding:12px 32px 28px"><a href="${button.url}" style="display:inline-block;background:#dcbf83;color:#0a0a0a;text-decoration:none;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;font-size:14px">${esc(button.text)}</a></td></tr>` : ""}
<tr><td style="padding:16px 32px 24px;font-size:12px;color:#7a7a80;border-top:1px solid #2a2a2a">${esc(SITE.name)} · <a href="${SITE.url}" style="color:#dcbf83">${SITE.url.replace(/^https?:\/\//, "")}</a>${footerHtml ? `<br><br>${footerHtml}` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

export interface MailExtra {
  /** Мелкий текст под письмом (например, «Отписаться») */
  footerHtml?: string;
  /** Дополнительные заголовки (List-Unsubscribe для рассылок) */
  headers?: Record<string, string>;
}

const toText = (html: string) =>
  html
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

export function renderMail(title: string, bodyHtml: string, button?: { text: string; url: string }, extra: MailExtra = {}) {
  return layout(title, bodyHtml, button, extra.footerHtml);
}

export async function sendMail(
  to: string,
  subject: string,
  title: string,
  bodyHtml: string,
  button?: { text: string; url: string },
  extra: MailExtra = {},
) {
  if (!mailEnabled() || isPlaceholderEmail(to)) return false;
  const from = process.env.SMTP_FROM || `Abramov Shop <${process.env.SMTP_USER}>`;
  const text =
    `${title}\n\n${toText(bodyHtml)}${button ? `\n\n${button.text}: ${button.url}` : ""}` + (extra.footerHtml ? `\n\n---\n${toText(extra.footerHtml)}` : "");
  await getTransport().sendMail({ from, to, subject, html: layout(title, bodyHtml, button, extra.footerHtml), text, headers: extra.headers });
  return true;
}

/** Для админки: проверка подключения к почтовому серверу. */
export async function verifyMail() {
  await getTransport().verify();
}

export { esc as escHtml };
