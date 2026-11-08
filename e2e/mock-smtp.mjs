/**
 * Почта для автотестов: принимает письма и складывает в файл (по строке JSON на письмо). Никуда не отправляет.
 * node e2e/mock-smtp.mjs <файл> [порт=2525]
 */
import fs from "node:fs";
import net from "node:net";

const [file = "e2e/.run/mail.jsonl", port = "2525"] = process.argv.slice(2);
net
  .createServer((sock) => {
    let data = false;
    let buf = "";
    let rcpt = [];
    const say = (s) => sock.write(s + "\r\n");
    say("220 e2e smtp");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (data) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          const raw = buf.slice(0, end);
          buf = buf.slice(end + 5);
          data = false;
          const subj = /^Subject: (.*)$/im.exec(raw)?.[1] ?? "";
          fs.appendFileSync(file, JSON.stringify({ to: rcpt, subject: subj, raw }) + "\n");
          rcpt = [];
          say("250 OK");
          continue;
        }
        const i = buf.indexOf("\r\n");
        if (i < 0) return;
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") say("250 e2e");
        else if (cmd === "RCPT") (rcpt.push(/<([^>]+)>/.exec(line)?.[1] ?? ""), say("250 OK"));
        else if (cmd === "DATA") ((data = true), say("354 go"));
        else if (cmd === "QUIT") (say("221 bye"), sock.end());
        else say("250 OK");
      }
    });
    sock.on("error", () => {});
  })
  .listen(Number(port), "127.0.0.1", () => console.log(`[smtp] :${port} → ${file}`));
