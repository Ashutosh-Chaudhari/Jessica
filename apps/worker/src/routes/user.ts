import { Hono, type Context } from "hono";
import { computeProgress, type AuthUser } from "@jessica/types";
import type { App } from "../types.ts";
import { fail, failFromError } from "../utils/respond.ts";

export const user = new Hono<App>();

async function displayNameOf(c: Context<App>): Promise<string> {
  const me = c.get("user");
  const profile = await c.get("ctx").repo.getProfile(me.id);
  return profile?.display_name || me.email.split("@")[0] || "there";
}

user.get("/auth/me", async (c) => {
  const me = c.get("user");
  try {
    const authUser: AuthUser = {
      id: me.id,
      email: me.email,
      display_name: await displayNameOf(c),
    };
    return c.json(authUser);
  } catch (error) {
    return failFromError(c, error);
  }
});

user.get("/profile", async (c) => {
  try {
    return c.json({ display_name: await displayNameOf(c) });
  } catch (error) {
    return failFromError(c, error);
  }
});

user.patch("/profile", async (c) => {
  const ctx = c.get("ctx");
  try {
    const body = (await c.req.json()) as { display_name?: unknown };
    const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
    if (name.length < 1 || name.length > 60) return fail(c, "invalid_request", "display_name length");

    await ctx.repo.updateDisplayName(c.get("user").id, name);
    return c.json({ display_name: name });
  } catch (error) {
    return failFromError(c, error);
  }
});

/** Spec section 61: deleting the account removes every trace of it. */
user.delete("/profile", async (c) => {
  try {
    await c.get("ctx").repo.deleteAccount(c.get("user").id);
    return c.json({ ok: true });
  } catch (error) {
    return failFromError(c, error);
  }
});

user.get("/history", async (c) => {
  try {
    return c.json(await c.get("ctx").repo.listAttempts(c.get("user").id));
  } catch (error) {
    return failFromError(c, error);
  }
});

user.get("/history/:id", async (c) => {
  try {
    const attempt = await c.get("ctx").repo.getAttempt(c.get("user").id, c.req.param("id"));
    return attempt ? c.json(attempt) : fail(c, "not_found");
  } catch (error) {
    return failFromError(c, error);
  }
});

user.get("/progress", async (c) => {
  try {
    const repo = c.get("ctx").repo;
    const userId = c.get("user").id;
    const [recent, totals] = await Promise.all([
      repo.progressRows(userId),
      repo.progressTotals(userId),
    ]);
    return c.json(computeProgress(recent, totals));
  } catch (error) {
    return failFromError(c, error);
  }
});
