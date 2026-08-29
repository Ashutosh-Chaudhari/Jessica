// Run: npm test   (node --test, no framework)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRss } from "./news.ts";

const item = (inner: string) => `<rss><channel><item>${inner}</item></channel></rss>`;

test("parseRss pulls title, url and date out of a real Google News item", () => {
  const [got] = parseRss(
    item(
      `<title>NSF launches three new Science and Technology Centers - U.S. National Science Foundation (.gov)</title>` +
        `<link>https://news.google.com/rss/articles/CBMihAFBVV95cUx</link>` +
        `<guid isPermaLink="false">CBMihAFBVV95cUx</guid>` +
        `<pubDate>Tue, 25 Aug 2026 15:56:00 GMT</pubDate>` +
        `<description>&lt;a href="https://example.test"&gt;read more&lt;/a&gt;</description>`,
    ),
  );
  assert.equal(got?.title, "NSF launches three new Science and Technology Centers");
  assert.equal(got?.url, "https://news.google.com/rss/articles/CBMihAFBVV95cUx");
  assert.equal(got?.publishedAt, "2026-08-25T15:56:00.000Z");
});

test("parseRss decodes entities, ampersand last", () => {
  const [got] = parseRss(
    item(`<title>Fish &amp;amp; chips &lt;b&gt;win&lt;/b&gt; the public vote</title><link>http://a.test/1</link>`),
  );
  // &amp;amp; must survive as "&amp;" - decoding &amp; first would eat it twice.
  assert.equal(got?.title, "Fish &amp; chips <b>win</b> the public vote");
});

test("parseRss unwraps CDATA", () => {
  const [got] = parseRss(
    item(`<title><![CDATA[Why the grid keeps failing in summer]]></title><link>http://a.test/2</link>`),
  );
  assert.equal(got?.title, "Why the grid keeps failing in summer");
});

test("parseRss keeps a hyphen that is not a publisher separator", () => {
  const [got] = parseRss(item(`<title>Cost-of-living pressure eases - BBC News</title><link>http://a.test/3</link>`));
  assert.equal(got?.title, "Cost-of-living pressure eases");

  // Too early in the string to be a publisher suffix; leave it alone.
  const [short] = parseRss(item(`<title>AI - the next decade of computing</title><link>http://a.test/4</link>`));
  assert.equal(short?.title, "AI - the next decade of computing");
});

test("parseRss drops items it cannot use", () => {
  assert.deepEqual(parseRss(""), []);
  assert.deepEqual(parseRss("<rss><channel><title>Feed</title></channel></rss>"), []);
  assert.deepEqual(parseRss(item(`<title>A perfectly good headline here</title>`)), []); // no link
  assert.deepEqual(parseRss(item(`<link>http://a.test/5</link>`)), []); // no title
  assert.deepEqual(parseRss(item(`<title>Too short</title><link>http://a.test/6</link>`)), []);
});

test("parseRss reports an unparseable date as null rather than an invalid Date", () => {
  const [got] = parseRss(
    item(`<title>A headline long enough to keep</title><link>http://a.test/7</link><pubDate>not a date</pubDate>`),
  );
  assert.equal(got?.publishedAt, null);
});

test("parseRss honours the item limit, because the Worker has 10ms of CPU", () => {
  const many = `<rss><channel>${Array.from(
    { length: 100 },
    (_, i) => `<item><title>Headline number ${i} with enough length</title><link>http://a.test/${i}</link></item>`,
  ).join("")}</channel></rss>`;

  assert.equal(parseRss(many).length, 20); // default cap
  assert.equal(parseRss(many, 5).length, 5);
});
