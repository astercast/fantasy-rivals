import { handler, json, fail, readBody, methodNotAllowed } from "../../lib/http.js";
import { createUser, findUserByEmail, startSession, sessionCookie } from "../../lib/auth.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const { email, displayName, password } = await readBody(req);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(res, 400, "bad_email", "Enter a valid email address.");
  }
  if (!displayName || String(displayName).trim().length < 2) {
    return fail(res, 400, "bad_name", "Pick a display name (2+ characters).");
  }
  if (!password || String(password).length < 8) {
    return fail(res, 400, "weak_password", "Password must be at least 8 characters.");
  }
  if (await findUserByEmail(email)) {
    return fail(res, 409, "email_taken", "An account with that email already exists. Try signing in.");
  }
  const user = await createUser({
    email,
    displayName: String(displayName).trim(),
    password: String(password),
  });
  const token = await startSession(user.id);
  res.setHeader("Set-Cookie", sessionCookie(token));
  json(res, 201, { ok: true, user });
});
