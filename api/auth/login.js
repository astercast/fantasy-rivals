import { handler, json, fail, readBody, methodNotAllowed } from "../../lib/http.js";
import { findUserByEmail, verifyPassword, startSession, sessionCookie } from "../../lib/auth.js";
import { tooManyAttempts, recordAttempt } from "../../lib/rate-limit.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (await tooManyAttempts(req, "login")) {
    return fail(res, 429, "rate_limited", "Too many sign-in tries. Wait a few minutes and try again.");
  }
  const { email, password } = await readBody(req);
  const row = email ? await findUserByEmail(email) : null;
  if (!row || !verifyPassword(String(password || ""), row.pass_salt, row.pass_hash)) {
    await recordAttempt(req, "login");
    return fail(res, 401, "bad_credentials", "Email or password didn't match.");
  }
  const token = await startSession(row.id);
  res.setHeader("Set-Cookie", sessionCookie(token));
  json(res, 200, {
    ok: true,
    user: { id: row.id, email: row.email, displayName: row.display_name, isAdmin: !!row.is_admin },
  });
});
