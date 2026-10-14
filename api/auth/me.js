import { handler, json, methodNotAllowed } from "../../lib/http.js";
import { currentUser } from "../../lib/session.js";
import { providerStatus } from "../../lib/oauth.js";

export default handler(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const user = await currentUser(req);
  json(res, 200, { ok: true, user, providers: providerStatus() });
});
