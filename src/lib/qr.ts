import "server-only";
import QRCode from "qrcode";

/** QR-код в виде SVG (для печати): тёмные модули, прозрачный фон. */
export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#0000" } });
}
