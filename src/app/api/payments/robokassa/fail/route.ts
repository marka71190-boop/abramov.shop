/** Fail URL: покупатель отказался от оплаты — обратно к заказу, можно оплатить снова */
import { backTo } from "../_lib";

export const dynamic = "force-dynamic";

const handle = (req: Request) => backTo(req, "fail");
export const GET = handle;
export const POST = handle;
