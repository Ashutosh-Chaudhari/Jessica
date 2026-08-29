import type { MiddlewareHandler } from "hono";
import type { App } from "../types.ts";
import { fail } from "../utils/respond.ts";

/**
 * Verifies a Supabase session token by asking Supabase (spec section 7).
 *
 * ponytail: one subrequest per authenticated call instead of local JWKS
 * verification. Simpler, always agrees with Supabase about revocation, and the
 * Worker free tier allows 50 subrequests per request. Move to cached JWKS
 * verification if request volume ever makes the extra hop matter.
 */
export const requireUser: MiddlewareHandler<App> = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token) return fail(c, "unauthorized");

  let response: Response;
  try {
    response = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: c.env.SUPABASE_SERVICE_ROLE_KEY },
    });
  } catch (error) {
    return fail(c, "provider_unavailable", error);
  }

  if (response.status === 401 || response.status === 403) return fail(c, "unauthorized");
  // Anything else that is not OK is Supabase having a bad day - do not sign the
  // user out over it (spec section 78).
  if (!response.ok) return fail(c, "provider_unavailable", `supabase auth ${response.status}`);

  const user = (await response.json().catch(() => null)) as { id?: string; email?: string } | null;
  if (!user?.id) return fail(c, "unauthorized");

  c.set("user", { id: user.id, email: user.email ?? "" });
  await next();
};
