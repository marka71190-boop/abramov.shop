// Сканер штрихкодов в кассе: wasm-файл распознавания отдаём со своего сайта, а не с чужого CDN.
// Запускается перед сборкой (npm run build) — версия всегда совпадает с установленным пакетом.
import { copyFileSync, mkdirSync } from "node:fs";
import { existsSync } from "node:fs";

// zxing-wasm может лежать у barcode-detector или в корне node_modules
const src = ["node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", "node_modules/barcode-detector/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm"].find((p) => existsSync(p));
if (!src) throw new Error("[zxing] не найден zxing_reader.wasm — выполните npm install");
mkdirSync("public/zxing", { recursive: true });
copyFileSync(src, "public/zxing/zxing_reader.wasm");
console.log("[zxing] zxing_reader.wasm → public/zxing/");
