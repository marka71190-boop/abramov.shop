// Заставки запуска на iPhone/iPad (apple-touch-startup-image) → public/splash. Размеры — как в src/lib/splash.ts.
// Запуск: npm i --no-save playwright @fontsource/montserrat && node scripts/make-splash.cjs
const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "../public/splash");
const FONT = path.join(__dirname, "../node_modules/@fontsource/montserrat/files/montserrat-latin-500-normal.woff2");
const FONT_CYR = path.join(__dirname, "../node_modules/@fontsource/montserrat/files/montserrat-cyrillic-500-normal.woff2");

// [css ширина, css высота, dpr] — портрет
const DEVICES = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [420, 912, 3], // Air
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6–8 Plus
  [375, 667, 2], // 6–8, SE 2/3
  [320, 568, 2], // SE 1
  [768, 1024, 2], // iPad 9.7, mini
  [744, 1133, 2], // iPad mini 6
  [810, 1080, 2], // iPad 10.2
  [820, 1180, 2], // iPad Air, iPad 10
  [834, 1194, 2], // iPad Pro 11
  [834, 1210, 2], // iPad Pro 11 M4
  [1024, 1366, 2], // iPad Pro 12.9
  [1032, 1376, 2], // iPad Pro 13 M4
];

const GOLD = "M277,163 Q279,163 281,167 L413,389 L338,389 Q330,389 325,381 L276,301 L184,450 Q178,459 167,459 L95,459 L273,167 Q275,163 277,163 Z";
const SILVER = "M302,164 L372,164 Q382,164 387,172 L525,389 L439,389 Z";
const LETTERS = [["A", 218], ["B", 264], ["R", 306], ["A", 346], ["M", 392], ["O", 446], ["V", 496]];

const html = (w, h) => {
  const tablet = w >= 700;
  const logoW = Math.round(w * (tablet ? 0.34 : 0.58));
  return `<!doctype html><html><head><style>
@font-face{font-family:M;src:url(data:font/woff2;base64,${fs.readFileSync(FONT).toString("base64")}) format("woff2");font-weight:500}
@font-face{font-family:M;src:url(data:font/woff2;base64,${fs.readFileSync(FONT_CYR).toString("base64")}) format("woff2");font-weight:500;unicode-range:U+0400-04FF}
html,body{margin:0;width:${w}px;height:${h}px;background:radial-gradient(120% 70% at 50% 42%,#17150f 0%,#0a0a0a 62%);overflow:hidden}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(logoW * 0.12)}px;padding-bottom:${Math.round(h * 0.04)}px}
svg{width:${logoW}px;height:auto;display:block}
.t{font-family:M;font-weight:500;color:#8a8a91;font-size:${Math.round(logoW * 0.062)}px;letter-spacing:.32em;text-transform:uppercase;padding-left:.32em}
</style></head><body><div class="c">
<svg viewBox="86 150 456 320"><path fill="#dcbf83" d="${GOLD}"/><path fill="#b1afb0" d="${SILVER}"/>
<g fill="#dcbf83" font-family="M" font-weight="500" font-size="46">${LETTERS.map(([c, x]) => `<text x="${x}" y="458">${c}</text>`).join("")}</g></svg>
<div class="t">Русский бильярд</div></div></body></html>`;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const list = [];
  for (const [cw, ch, dpr] of DEVICES) {
    const W = cw * dpr, H = ch * dpr;
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(html(W, H));
    await p.evaluate(() => document.fonts.ready);
    const png = await p.screenshot({ type: "png" });
    await p.close();
    const name = `splash-${W}x${H}.png`;
    await sharp(png).png({ palette: true, colors: 128, compressionLevel: 9, dither: 0.6 }).toFile(path.join(OUT, name));
    list.push({ url: `/splash/${name}`, media: `(device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)` });
  }
  await b.close();
  console.log(list.length, "готово");
})();
