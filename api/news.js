export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  var gnewsKey = process.env.GNEWS_API_KEY;
  var guardianKey = process.env.GUARDIAN_API_KEY;

  try {
    if (gnewsKey) {
      var gnews = await fetchGNews(gnewsKey);
      if (gnews.length) {
        return send(res, gnews, 'GNews');
      }
    }

    if (guardianKey) {
      var guardian = await fetchGuardian(guardianKey);
      if (guardian.length) {
        return send(res, guardian, 'Guardian');
      }
    }

    var rss = await fetchAllRss();
    if (rss.length) {
      return send(res, rss, 'RSS');
    }

    res.status(503).json({
      error: 'No news sources available. Add GNEWS_API_KEY to Vercel.',
      articles: [],
      provider: null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load news', articles: [], provider: null });
  }
}

function send(res, articles, provider) {
  res.status(200).json({
    articles: dedupe(articles).sort(byDate).slice(0, 24),
    provider: provider,
    updated: new Date().toISOString()
  });
}

async function fetchGNews(apiKey) {
  var categories = ['general', 'world', 'technology', 'business'];
  var batches = await Promise.all(
    categories.map(function (category) {
      var url =
        'https://gnews.io/api/v4/top-headlines?category=' + category +
        '&lang=en&max=10&apikey=' + encodeURIComponent(apiKey);
      return fetch(url).then(function (r) {
        if (!r.ok) return [];
        return r.json();
      }).then(function (data) {
        return (data.articles || []).map(normalizeGNews);
      }).catch(function () { return []; });
    })
  );
  return batches.flat();
}

function normalizeGNews(article) {
  return {
    id: article.url || article.id,
    title: article.title || '',
    summary: article.description || article.content || '',
    source: article.source && article.source.name ? article.source.name : 'GNews',
    pubDate: article.publishedAt || '',
    ts: article.publishedAt ? Date.parse(article.publishedAt) || 0 : 0,
    image: article.image || ''
  };
}

async function fetchGuardian(apiKey) {
  var url =
    'https://content.guardianapis.com/search?api-key=' + encodeURIComponent(apiKey) +
    '&show-fields=trailText,headline,thumbnail&page-size=20&order-by=newest';
  var response = await fetch(url);
  if (!response.ok) return [];
  var data = await response.json();
  return (data.response && data.response.results || []).map(function (item) {
    return {
      id: item.webUrl || item.id,
      title: (item.fields && item.fields.headline) || item.webTitle || '',
      summary: (item.fields && item.fields.trailText) || '',
      source: 'Guardian',
      pubDate: item.webPublicationDate || '',
      ts: item.webPublicationDate ? Date.parse(item.webPublicationDate) || 0 : 0,
      image: (item.fields && item.fields.thumbnail) || ''
    };
  }).filter(function (a) { return a.title; });
}

async function fetchAllRss() {
  var feeds = [
    { source: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { source: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
    { source: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' }
  ];
  var batches = await Promise.all(
    feeds.map(function (feed) {
      return fetchFeed(feed.source, feed.url, 10);
    })
  );
  return batches.flat();
}

async function fetchFeed(source, url, limit) {
  try {
    var response = await fetch(url, {
      headers: { 'User-Agent': 'Brief-MRBD/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return [];
    var xml = await response.text();
    return parseRss(xml, source, limit);
  } catch (e) {
    return [];
  }
}

function parseRss(xml, source, limit) {
  var items = xml.split(/<item[\s>]/i).slice(1, limit + 1);
  return items.map(function (chunk, index) {
    var title = tag(chunk, 'title');
    var link = linkFromChunk(chunk) || source + '-' + index;
    var summary = stripHtml(tag(chunk, 'description') || tag(chunk, 'content:encoded') || tag(chunk, 'summary'));
    var pubDate = tag(chunk, 'pubDate') || tag(chunk, 'published') || tag(chunk, 'updated');
    return {
      id: link,
      title: title,
      summary: summary.slice(0, 600),
      source: source,
      pubDate: pubDate,
      ts: pubDate ? Date.parse(pubDate) || 0 : 0,
      image: ''
    };
  }).filter(function (a) { return a.title; });
}

function linkFromChunk(chunk) {
  var href = chunk.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (href) return decode(href[1]);
  return tag(chunk, 'link');
}

function tag(xml, name) {
  var re = new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>', 'i');
  var match = xml.match(re);
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
  return decode(String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function dedupe(articles) {
  var seen = {};
  return articles.filter(function (a) {
    if (!a.id || seen[a.id]) return false;
    seen[a.id] = true;
    return true;
  });
}

function byDate(a, b) {
  return b.ts - a.ts;
}
