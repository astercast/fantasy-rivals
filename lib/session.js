// session.js - resolve the signed-in user for an API request.
import { tokenFromRequest, userForToken } from "./auth.js";

export async function currentUser(req) {
  return userForToken(tokenFromRequest(req));
}
