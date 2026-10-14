// oauth.js - one-click sign-in with Google and X (authorization-code flow),
// plus a clearly-marked DEV provider used only when RF_DEV_AUTH=1 locally.
//
// Configuration is env-only (never committed):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   X_CLIENT_ID / X_CLIENT_SECRET
//   OAUTH_REDIRECT_BASE  (e.g. https://<site> - callback is <base>/api/auth/oauth-callback?provider=google)
// When a provider's env is absent, that provider reports { configured:false }
// and the UI disables the button with an honest label - the wiring is real
// and switches on the moment credentials exist. Production app registration
// is a deploy-time step parked in ARCHITECTURE.md.

import { randomBytes, createHash } from "node:crypto";
import { one, q, newId } from "./db.js";
import { hashPassword } from "./auth.js";

export const PROVIDERS = {
  google: {
    label: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    clientId: () => process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET || "",
    profile(json) {
      return {
        providerUserId: json.sub,
        email: json.email || null,
        emailVerified: !!json.email_verified,
        displayName: json.name || (json.email ? json.email.split("@")[0] : "Player"),
      };
    },
  },
  x: {
    label: "X",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    profileUrl: "https://api.twitter.com/2/users/me",
    scope: "tweet.read users.read",
    clientId: () => process.env.X_CLIENT_ID || "",
    clientSecret: () => process.env.X_CLIENT_SECRET || "",
    profile(json) {
      const d = json.data || {};
      return {
        providerUserId: d.id,
        // X's /2/users/me does not return email without elevated access;
        // when absent we link on provider id only and ask for an email later.
        email: d.email || null,
        emailVerified: false,
        displayName: d.name || d.username || "Player",
      };
    },
  },
};

export function providerConfigured(name) {
  if (name === "dev") return process.env.RF_DEV_AUTH === "1";
  const p = PROVIDERS[name];
  return !!(p && p.clientId() && p.clientSecret());
}

export function providerStatus() {
  return {
    google: providerConfigured("google"),
    x: providerConfigured("x"),
    dev: providerConfigured("dev"),
    email: true,
  };
}

export function redirectUri(provider) {
  const base = (process.env.OAUTH_REDIRECT_BASE || "").replace(/\/$/, "");
  return `${base}/api/auth/oauth-callback?provider=${provider}`;
}

// PKCE + state, held in a short-lived signed cookie is overkill for wave 1;
// state is stored server-side (oauth_states table would need DDL) - instead
// we keep a single-use in-DB nonce via the sessions-style table below.
// To stay DDL-free we reuse `events` with league_id NULL as the nonce store.
export async function beginFlow(provider) {
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await q(
    "INSERT INTO events (id, league_id, type, payload, created_at) VALUES (?, NULL, 'oauth_state', ?, ?)",
    [newId(), JSON.stringify({ provider, state, verifier }), new Date().toISOString()]
  );
  if (provider === "dev") {
    return { url: `/api/auth/oauth-callback?provider=dev&state=${state}&code=dev-code`, state };
  }
  const p = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: p.clientId(),
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: p.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (provider === "google") params.set("access_type", "online");
  return { url: `${p.authUrl}?${params.toString()}`, state };
}

export async function consumeState(provider, state) {
  const rows = await q(
    "SELECT id, payload FROM events WHERE type = 'oauth_state' ORDER BY created_at DESC LIMIT 50"
  );
  for (const row of rows) {
    let payload = {};
    try { payload = JSON.parse(row.payload); } catch { continue; }
    if (payload.provider === provider && payload.state === state) {
      await q("DELETE FROM events WHERE id = ?", [row.id]);
      return payload;
    }
  }
  return null;
}

export async function exchangeCode(provider, code, verifier) {
  if (provider === "dev") {
    // Dev-mode stub: deterministic local identity, no network. Only
    // reachable when RF_DEV_AUTH=1 (see providerConfigured).
    return {
      providerUserId: "dev-user-1",
      email: "dev@rivals.local",
      emailVerified: true,
      displayName: "Dev Player",
    };
  }
  const p = PROVIDERS[provider];
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(provider),
    code_verifier: verifier,
    client_id: p.clientId(),
  });
  const tokenRes = await fetch(p.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${p.clientId()}:${p.clientSecret()}`).toString("base64"),
    },
    body,
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
  const tokens = await tokenRes.json();
  const profileRes = await fetch(p.profileUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) throw new Error(`profile fetch failed (${profileRes.status})`);
  return p.profile(await profileRes.json());
}

// Find-or-create the user for an OAuth identity. Linking rule: a verified
// provider email matching an existing account links to it; otherwise a new
// account is created. Identity rows live in `events`-free dedicated table -
// see oauth_identities in schema (added by ensureOAuthSchema at boot).
export async function userForOAuthIdentity(provider, profile) {
  const linked = await one(
    "SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?",
    [provider, String(profile.providerUserId)]
  );
  if (linked) {
    return one("SELECT * FROM users WHERE id = ?", [linked.user_id]);
  }
  let user = null;
  if (profile.email && profile.emailVerified) {
    user = await one("SELECT * FROM users WHERE email = ?", [profile.email.toLowerCase()]);
  }
  if (!user) {
    const { salt, hash } = hashPassword(randomBytes(24).toString("hex"));
    const id = newId();
    const email = (profile.email || `${provider}-${profile.providerUserId}@oauth.rivals.local`).toLowerCase();
    await q(
      "INSERT INTO users (id, email, display_name, pass_hash, pass_salt, is_admin, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
      [id, email, profile.displayName, hash, salt, new Date().toISOString()]
    );
    user = { id, email, display_name: profile.displayName };
  }
  await q(
    "INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
    [newId(), user.id, provider, String(profile.providerUserId), new Date().toISOString()]
  );
  return user;
}
