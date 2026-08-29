import type { Repository } from "@jessica/database";

/**
 * Tells the site owner when a new person starts using Jessica.
 *
 * Three delivery options, all optional, checked in order. Configure whichever
 * you actually want and leave the rest unset:
 *
 *   1. Email, via Resend. Needs no domain and no DNS: their free tier sends
 *      from onboarding@resend.dev to the address on your own account, which is
 *      exactly this use case. Cloudflare's own Email Service cannot do this -
 *      it requires a domain onboarded to Cloudflare DNS.
 *   2. A phone push, via ntfy.sh. No account at all: pick a topic name,
 *      install the app, done.
 *   3. A Discord or Slack incoming webhook.
 *
 * Nothing here is allowed to affect the user. Every failure is swallowed, and
 * the caller runs it with waitUntil, so nobody signing up ever waits on it.
 */

export interface NotifyConfig {
  resendApiKey?: string;
  emailTo?: string;
  webhookUrl?: string;
}

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
    `${e.displayName} just started using Jessica.`,
    `${e.users} ${e.users === 1 ? "person has" : "people have"} signed up in total.`,
    `${e.attemptsToday} ${e.attemptsToday === 1 ? "attempt" : "attempts"} today. ${budget}`,
  ].join("\n");
}

/** True when nothing is configured, so the caller can skip all the work. */
export function isNotifyConfigured(config: NotifyConfig): boolean {
  return Boolean((config.resendApiKey && config.emailTo) || config.webhookUrl);
}

async function report(what: string, response: Response): Promise<void> {
  if (!response.ok) {
    console.error(`notify via ${what}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

async function deliver(config: NotifyConfig, subject: string, message: string): Promise<void> {
  if (config.resendApiKey && config.emailTo) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        // Resend's shared sender. Works with no domain and no DNS records,
        // but only delivers to the address registered on the account.
        from: "Jessica <onboarding@resend.dev>",
        to: [config.emailTo],
        subject,
        text: message,
      }),
    });
    await report("resend", response);
    return;
  }

  if (!config.webhookUrl) return;

  // ntfy wants the message as the raw body, with the title in a header.
  if (new URL(config.webhookUrl).hostname.endsWith("ntfy.sh")) {
    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: { title: subject, "content-type": "text/plain" },
      body: message,
    });
    await report("ntfy", response);
    return;
  }

  // Discord reads `content`, Slack reads `text`; sending both means one URL
  // works with either service.
  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: message, text: message }),
  });
  await report("webhook", response);
}

/**
 * Announces a user the first time they do anything, and never again.
 *
 * Returns without touching the database when nothing is configured, so the app
 * runs identically for anyone who clones it without notifications set up.
 */
export async function announceIfNew(
  repo: Repository,
  userId: string,
  config: NotifyConfig,
  dailyBudget: number,
): Promise<void> {
  if (!isNotifyConfigured(config)) return;

  try {
    // Claims the announcement atomically; null means somebody already did it.
    const profile = await repo.claimNewUserNotification(userId);
    if (!profile) return;

    const snapshot = await repo.siteSnapshot();
    const name = profile.display_name || "Someone";

    await deliver(
      config,
      `${name} just started using Jessica`,
      formatNewUserMessage({
        displayName: name,
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
