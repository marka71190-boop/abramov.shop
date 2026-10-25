/** Success URL: покупатель вернулся после оплаты — на страницу заказа (оплату там сверим с Робокассой) */
import { backTo } from "../_lib";

export const dynamic = "force-dynamic";

const handle = (req: Request) => backTo(req, "pay");
export const GET = handle;
export const POST = handle;
