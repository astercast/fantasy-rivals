import { handler, json, fail, readBody, methodNotAllowed } from "../../lib/http.js";
import { findUserByEmail, verifyPassword, startSession, sessionCookie } from "../../lib/auth.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const { email, password } = await readBody(req);
  const row = email ? await findUserByEmail(email) : null;
  if (!row || !verifyPassword(String(password || ""), row.pass_salt, row.pass_hash)) {
    return fail(res, 401, "bad_credentials", "Email or password didn't match.");
  }
  const token = await startSession(row.id);
  res.setHeader("Set-Cookie", sessionCookie(token));
  json(res, 200, {
    ok: true,
    user: { id: row.id, email: row.email, displayName: row.display_name, isAdmin: !!row.is_admin },
  });
});
