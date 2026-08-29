import type { Repository } from "@jessica/database";

/**
 * Tells the site owner when a new person starts using Jessica.
 *
 * Deliberately a generic webhook rather than an email integration: it needs no
 * domain, no verified sender and no third-party account beyond one the owner
 * already has. The payload carries both `content` and `text` because Discord
 * reads the first and Slack the second, and each ignores the other - so the
 * same URL works with either without a config switch.
 *
 * Nothing here is allowed to affect the user. Every failure is swallowed, and
 * the caller runs it with waitUntil so the person signing up never waits for
 * someone else's Discord server to respond.
 */

export interface NewUserEvent {
  displayName: string;
  /** Totals at the moment they arrived, so the ping doubles as a status report. */
  users: number;
  attemptsToday: number;
  callsToday: number;
  dailyBudget: number;
}

export function formatNewUserMessage(e: NewUserEvent): string {
  const budget =
    e.dailyBudget > 0
      ? `${e.callsToday}/${e.dailyBudget} AI calls used today (${Math.round((e.callsToday / e.dailyBudget) * 100)}%)`
      : `${e.callsToday} AI calls today (no cap set)`;

  return [
    `**${e.displayName}** just started using Jessica.`,
    `${e.users} ${e.users === 1 ? "person has" : "people have"} signed up in total.`,
    `${e.attemptsToday} ${e.attemptsToday === 1 ? "attempt" : "attempts"} today · ${budget}`,
  ].join("\n");
}

async function post(url: string, message: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Discord reads `content`, Slack reads `text`. Sending both means one URL
    // works with either service.
    body: JSON.stringify({ content: message, text: message }),
  });
  if (!response.ok) {
    console.error(`notify webhook: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

/**
 * Announces a user the first time they do anything, and never again.
 *
 * Returns without touching the network when no webhook is configured, so the
 * app runs identically for anyone who clones it without one.
 */
export async function announceIfNew(
  repo: Repository,
  userId: string,
  webhookUrl: string | undefined,
  dailyBudget: number,
): Promise<void> {
  if (!webhookUrl) return;

  try {
    // Claims the announcement atomically; null means somebody already did it.
    const profile = await repo.claimNewUserNotification(userId);
    if (!profile) return;

    const snapshot = await repo.siteSnapshot();
    await post(
      webhookUrl,
      formatNewUserMessage({
        displayName: profile.display_name || "Someone",
        users: snapshot.users,
        attemptsToday: snapshot.attemptsToday,
        callsToday: snapshot.callsToday,
        dailyBudget,
      }),
    );
  } catch (error) {
    // A notification failing is never worth degrading the request that
    // triggered it. The claim is already committed, so this will not retry -
    // which is the right trade: a missed ping beats a duplicate storm.
    console.error("announceIfNew:", error);
  }
}
