import { type NextRequest } from "next/server";
import { cueSvg, parseCueKey, resolveCue, defaultSelection } from "@/lib/cue-config";
import { getCueConfig } from "@/lib/cue";

/** Миниатюра собранного кия для корзины и оформления заказа */
export async function GET(req: NextRequest) {
  const cfg = await getCueConfig();
  const sel = parseCueKey(req.nextUrl.searchParams.get("c") ?? "") ?? defaultSelection(cfg);
  let r = resolveCue(cfg, sel);
  if (typeof r === "string") r = resolveCue(cfg, defaultSelection(cfg));
  const svg =
    typeof r === "string"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#141416"/></svg>`
      : cueSvg(r, { thumb: true, id: "t" });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
