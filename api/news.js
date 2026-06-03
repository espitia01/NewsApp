export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const feeds = [
    { source: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { source: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' }
  ];

  try {
    const batches = await Promise.all(
      feeds.map(function (feed) {
        return fetchFeed(feed.source, feed.url, 8);
      })
    );
    const articles = batches.flat().sort(byDate).slice(0, 20);
    res.status(200).json({ articles: articles, updated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load news', articles: [] });
  }
}

async function fetchFeed(source, url, limit) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MRBD-NewsApp/1.0' }
  });
  if (!response.ok) return [];
  const xml = await response.text();
  return parseRss(xml, source, limit);
}

function parseRss(xml, source, limit) {
  const items = xml.split(/<item[\s>]/i).slice(1, limit + 1);
  return items.map(function (chunk, index) {
    const title = tag(chunk, 'title');
    const link = tag(chunk, 'link') || source + '-' + index;
    const summary = stripHtml(tag(chunk, 'description') || tag(chunk, 'content:encoded'));
    const pubDate = tag(chunk, 'pubDate');
    return {
      id: link,
      title: title,
      summary: summary.slice(0, 500),
      source: source,
      pubDate: pubDate,
      ts: pubDate ? Date.parse(pubDate) || 0 : 0
    };
  }).filter(function (a) { return a.title; });
}

function tag(xml, name) {
  const re = new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i');
  const match = xml.match(re);
  return match ? decode(match[1].trim()) : '';
}

function decode(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value) {
  return decode(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function byDate(a, b) {
  return b.ts - a.ts;
}
