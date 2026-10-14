import { handler, fail, query, methodNotAllowed } from "../../lib/http.js";
import { beginFlow, providerConfigured, PROVIDERS } from "../../lib/oauth.js";

// GET /api/auth/oauth-start?provider=google|x|dev
// Redirects to the provider's authorization page (or the dev stub).
export default handler(async (req, res) => {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const { provider } = query(req);
  if (provider !== "dev" && !PROVIDERS[provider]) {
    return fail(res, 400, "bad_provider", "Unknown sign-in provider.");
  }
  if (!providerConfigured(provider)) {
    return fail(
      res, 503, "provider_not_configured",
      `${provider === "dev" ? "Dev sign-in" : PROVIDERS[provider].label + " sign-in"} is not configured on this deployment yet. Use email below - OAuth activates at launch (see ARCHITECTURE.md).`
    );
  }
  const { url } = await beginFlow(provider);
  res.statusCode = 302;
  res.setHeader("Location", url);
  res.end();
});
