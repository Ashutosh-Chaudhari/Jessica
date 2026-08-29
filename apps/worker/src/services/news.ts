/**
 * Current-information retrieval (spec section 18).
 *
 * Gemini's own search grounding was the obvious shortcut here, but grounded
 * requests return 429 on the free tier, so current topics come from public RSS
 * exactly as the spec describes.
 *
 * ponytail: ~40 lines of string handling instead of an XML parser dependency.
 * Workers have no DOMParser, RSS is a fixed shape, and we only want headlines.
 * If we ever need namespaced elements or CDATA edge cases, swap in a real
 * parser then.
 */

export interface NewsItem {
  title: string;
  url: string;
  publishedAt: string | null;
}

/** One parameterised feed covers every category we care about. */
const FEED = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=en-US&gl=US&ceid=US:en`;

/**
 * Query per topic category. Broad on purpose - the generator wants a sense of
 * what is being discussed, not a specific story to quiz people on.
 */
export const NEWS_QUERIES = [
  "technology",
  "science research",
  "business economy",
  "society culture",
  "environment energy",
] as const;

/** The Worker gets 10ms of CPU; do not regex a 130 KB document 100 times. */
const MAX_ITEMS = 20;

/**
 * A slow feed must not become a slow challenge. Retrieval is optional context,
 * so give up quickly and generate without it.
 */
const FETCH_TIMEOUT_MS = 4000;

const FIRST_TAG = (chunk: string, tag: string): string | null => {
  const open = chunk.indexOf(`<${tag}>`);
  if (open === -1) return null;
  const close = chunk.indexOf(`</${tag}>`, open);
  if (close === -1) return null;
  return chunk.slice(open + tag.length + 2, close);
};

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&") // last: otherwise it re-decodes the others
    .trim();
}

/** Google News appends " - Publisher" to every headline. */
function stripPublisher(title: string): string {
  const cut = title.lastIndexOf(" - ");
  return cut > 20 ? title.slice(0, cut).trim() : title;
}

export function parseRss(xml: string, limit = MAX_ITEMS): NewsItem[] {
  const items: NewsItem[] = [];

  // One split beats running a global regex over the whole document.
  for (const chunk of xml.split("<item>").slice(1, limit + 1)) {
    const rawTitle = FIRST_TAG(chunk, "title");
    const url = FIRST_TAG(chunk, "link");
    if (!rawTitle || !url) continue;

    const title = stripPublisher(decodeEntities(rawTitle));
    if (title.length < 15) continue; // not a usable headline

    const pubDate = FIRST_TAG(chunk, "pubDate");
    const parsed = pubDate ? new Date(decodeEntities(pubDate)) : null;

    items.push({
      title,
      url: decodeEntities(url),
      publishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    });
  }
  return items;
}

/**
 * Level 3 of the topic strategy (spec section 20). Never throws - a dead feed
 * degrades the topic to a non-current one rather than failing the request.
 */
export async function fetchHeadlines(query: string): Promise<NewsItem[]> {
  try {
    const response = await fetch(FEED(query), {
      headers: { "user-agent": "Jessica/0.1 (speaking practice app)" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`news feed ${query}: HTTP ${response.status}`);
      return [];
    }
    return parseRss(await response.text());
  } catch (error) {
    console.error(`news feed ${query} unreachable:`, error);
    return [];
  }
}
