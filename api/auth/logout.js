import { handler, json, methodNotAllowed } from "../../lib/http.js";
import { endSession, clearCookie, tokenFromRequest } from "../../lib/auth.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  await endSession(tokenFromRequest(req));
  res.setHeader("Set-Cookie", clearCookie());
  json(res, 200, { ok: true });
});
