import { handler, query, methodNotAllowed } from "../../lib/http.js";
import { consumeState, exchangeCode, userForOAuthIdentity, PROVIDERS } from "../../lib/oauth.js";
import { startSession, sessionCookie } from "../../lib/auth.js";

// GET /api/auth/oauth-callback?provider=google|x|dev&code=...&state=...
// Completes the authorization-code flow, links/creates the account by
// verified email, starts a session, and lands on the dashboard.
export default handler(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const { provider, code, state, error } = query(req);
  const back = (msg) => {
    res.statusCode = 302;
    res.setHeader("Location", `/login.html?oauth_error=${encodeURIComponent(msg)}`);
    res.end();
  };
  if (provider !== "dev" && !PROVIDERS[provider]) return back("Unknown provider.");
  if (error) return back("Sign-in was cancelled at the provider.");
  if (!code || !state) return back("Missing authorization response.");
  const stored = await consumeState(provider, state);
  if (!stored) return back("Sign-in session expired - try again.");
  try {
    const profile = await exchangeCode(provider, code, stored.verifier);
    const user = await userForOAuthIdentity(provider, profile);
    const token = await startSession(user.id);
    res.setHeader("Set-Cookie", sessionCookie(token));
    res.statusCode = 302;
    res.setHeader("Location", "/dashboard.html");
    res.end();
  } catch (err) {
    console.error(err);
    back("Sign-in failed at the provider - try again or use email.");
  }
});
