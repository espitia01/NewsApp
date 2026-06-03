(function () {
  'use strict';

  var DPAD = {
    UP: 'ArrowUp',
    DOWN: 'ArrowDown',
    LEFT: 'ArrowLeft',
    RIGHT: 'ArrowRight',
    SELECT: 'Enter',
    BACK: 'Escape'
  };

  var READ_KEY = 'brief_read';
  var LAST_INDEX_KEY = 'brief_last_index';

  var feedScreen = document.getElementById('feed');
  var articleScreen = document.getElementById('article-screen');
  var articleListEl = document.getElementById('article-list');
  var feedMetaEl = document.getElementById('feed-meta');
  var statusBarEl = document.getElementById('status-bar');
  var articleHeroEl = document.getElementById('article-hero');
  var articleImageEl = document.getElementById('article-image');
  var articleTitleEl = document.getElementById('article-title');
  var articleSourceEl = document.getElementById('article-source');
  var articleTimeEl = document.getElementById('article-time');
  var articleSummaryEl = document.getElementById('article-summary');
  var readBtn = document.getElementById('read-btn');

  var articles = [];
  var feedProvider = '';
  var selectedIndex = 0;
  var currentIndex = 0;
  var articleMode = false;
  var lastFocusedControl = null;
  var loading = false;

  function esc(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function loadReadSet() {
    try {
      var raw = localStorage.getItem(READ_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveReadSet(set) {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(set));
    } catch (e) {}
  }

  function isRead(id) {
    return !!loadReadSet()[id];
  }

  function markRead(id) {
    var set = loadReadSet();
    set[id] = Date.now();
    saveReadSet(set);
  }

  function loadLastIndex() {
    try {
      var idx = parseInt(localStorage.getItem(LAST_INDEX_KEY), 10);
      return idx >= 0 ? idx : 0;
    } catch (e) {
      return 0;
    }
  }

  function saveLastIndex(index) {
    try {
      localStorage.setItem(LAST_INDEX_KEY, String(index));
    } catch (e) {}
  }

  function rememberFocus(el) {
    if (el && el.classList && el.classList.contains('focusable')) {
      lastFocusedControl = el;
    }
  }

  function restoreFocus() {
    if (
      lastFocusedControl &&
      document.contains(lastFocusedControl) &&
      lastFocusedControl.offsetParent !== null
    ) {
      lastFocusedControl.focus();
      return;
    }
    var focusables = getVisibleFocusables();
    if (focusables.length) focusables[0].focus();
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    var ts = Date.parse(dateStr);
    if (!ts) return '';
    var diff = Math.max(0, Date.now() - ts);
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 48) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function setStatus(text, isError) {
    statusBarEl.textContent = text;
    statusBarEl.classList.toggle('error', !!isError);
  }

  function thumbHtml(article) {
    if (article.image) {
      return '<span class="article-thumb-wrap"><img class="article-thumb" src="' +
        esc(article.image) + '" alt="" loading="lazy"></span>';
    }
    return '<span class="article-thumb-placeholder" aria-hidden="true"></span>';
  }

  function fetchFromUrl(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('fail');
      return r.json();
    });
  }

  function fetchNewsApi() {
    var endpoints = ['/api/news'];
    if (window.location.hostname.indexOf('github.io') !== -1) {
      endpoints.push('https://brief-mrbd.vercel.app/api/news');
    }

    function tryNext(i) {
      if (i >= endpoints.length) return Promise.reject(new Error('no api'));
      return fetchFromUrl(endpoints[i]).catch(function () {
        return tryNext(i + 1);
      });
    }

    return tryNext(0).then(function (data) {
      feedProvider = data.provider || 'News';
      return data.articles || [];
    });
  }

  function fetchHackerNews() {
    return fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
      .then(function (r) { return r.json(); })
      .then(function (ids) {
        return Promise.all(ids.slice(0, 15).map(function (id) {
          return fetch('https://hacker-news.firebaseio.com/v0/item/' + id + '.json')
            .then(function (r) { return r.json(); })
            .then(function (item) {
              return {
                id: String(item.id),
                title: item.title,
                summary: item.url ? 'Source: ' + item.url : 'Hacker News discussion.',
                source: 'HN',
                pubDate: item.time ? new Date(item.time * 1000).toISOString() : '',
                ts: item.time ? item.time * 1000 : 0,
                image: ''
              };
            });
        }));
      });
  }

  function loadArticles(force) {
    if (loading && !force) return;
    loading = true;
    setStatus('Loading headlines…');

    fetchNewsApi().catch(function () {
      feedProvider = 'HN';
      return fetchHackerNews();
    }).then(function (items) {
      articles = items.filter(function (a) { return a && a.title; });
      if (!articles.length) throw new Error('empty');
      if (selectedIndex >= articles.length) selectedIndex = 0;
      renderArticleList();
      setStatus(feedProvider + ' · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      feedMetaEl.textContent = String(articles.length).padStart(2, '0');
    }).catch(function () {
      setStatus('Could not load news', true);
      feedMetaEl.textContent = '--';
      if (!articles.length) {
        articleListEl.innerHTML = '<div class="empty-state">Check connection and press &#8635; to retry.</div>';
      }
    }).then(function () {
      loading = false;
    });
  }

  function renderArticleList() {
    articleListEl.innerHTML = '';

    articles.forEach(function (article, index) {
      var btn = document.createElement('button');
      var read = isRead(article.id);
      btn.className = 'article-item focusable' +
        (index === selectedIndex ? ' selected' : '') +
        (read ? ' read' : '');
      btn.type = 'button';
      btn.tabIndex = 0;
      btn.setAttribute('role', 'listitem');
      btn.dataset.index = String(index);
      btn.dataset.action = 'open-article';

      btn.innerHTML =
        thumbHtml(article) +
        '<div class="article-info">' +
          '<span class="source-pill-sm">' + esc(article.source) + '</span>' +
          '<div class="article-headline">' + esc(article.title) + '</div>' +
          '<div class="article-meta">' +
            (article.pubDate ? timeAgo(article.pubDate) : '') +
          '</div>' +
        '</div>';

      articleListEl.appendChild(btn);
    });
  }

  function updateSelection(index) {
    selectedIndex = index;
    saveLastIndex(index);
    renderArticleList();
    var items = articleListEl.querySelectorAll('.article-item');
    if (items[index]) items[index].focus();
  }

  function showScreen(name) {
    feedScreen.classList.toggle('hidden', name !== 'feed');
    articleScreen.classList.toggle('hidden', name !== 'article');
    articleMode = name === 'article';
  }

  function setArticleHero(image) {
    if (image) {
      articleHeroEl.classList.remove('no-image');
      articleImageEl.classList.remove('hidden');
      articleImageEl.src = image;
    } else {
      articleHeroEl.classList.add('no-image');
      articleImageEl.classList.add('hidden');
      articleImageEl.removeAttribute('src');
    }
  }

  function openArticle(index, triggerEl) {
    rememberFocus(triggerEl || document.activeElement);
    currentIndex = index;
    selectedIndex = index;
    saveLastIndex(index);

    var article = articles[index];
    setArticleHero(article.image || '');
    articleSourceEl.textContent = article.source;
    articleTitleEl.textContent = article.title;
    articleTimeEl.textContent = article.pubDate ? timeAgo(article.pubDate) : '';
    articleSummaryEl.textContent = article.summary || 'No summary available.';

    showScreen('article');
    document.querySelector('.article-back').focus();
  }

  function goBack() {
    showScreen('feed');
    renderArticleList();
    var items = articleListEl.querySelectorAll('.article-item');
    if (items[selectedIndex]) items[selectedIndex].focus();
  }

  function toggleMarkRead() {
    var article = articles[currentIndex];
    if (!article) return;
    markRead(article.id);
    goBack();
  }

  function getVisibleFocusables() {
    var screen = articleMode ? articleScreen : feedScreen;
    return Array.from(
      screen.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
    ).filter(function (el) {
      return el.offsetParent !== null;
    });
  }

  function moveFocus(direction) {
    var focusables = getVisibleFocusables();
    if (!focusables.length) return;

    var idx = focusables.indexOf(document.activeElement);
    if (idx === -1) {
      restoreFocus();
      return;
    }

    var next;
    if (direction === 'up' || direction === 'left') {
      next = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      next = idx < focusables.length - 1 ? idx + 1 : 0;
    }

    focusables[next].focus();
    rememberFocus(focusables[next]);
  }

  document.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;

    rememberFocus(target);

    switch (target.dataset.action) {
      case 'open-article': {
        var idx = parseInt(target.dataset.index, 10);
        if (idx === selectedIndex) {
          openArticle(idx, target);
        } else {
          updateSelection(idx);
        }
        break;
      }
      case 'back':
        goBack();
        break;
      case 'refresh':
        loadArticles(true);
        break;
      case 'mark-read':
        toggleMarkRead();
        break;
    }
  });

  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case DPAD.UP:
        moveFocus('up');
        e.preventDefault();
        break;
      case DPAD.DOWN:
        moveFocus('down');
        e.preventDefault();
        break;
      case DPAD.LEFT:
        moveFocus('left');
        e.preventDefault();
        break;
      case DPAD.RIGHT:
        moveFocus('right');
        e.preventDefault();
        break;
      case DPAD.SELECT:
        if (document.activeElement.classList.contains('focusable')) {
          document.activeElement.click();
        }
        e.preventDefault();
        break;
      case DPAD.BACK:
        if (articleMode) goBack();
        e.preventDefault();
        break;
    }
  });

  document.addEventListener('focusin', function (e) {
    if (e.target.classList && e.target.classList.contains('focusable')) {
      rememberFocus(e.target);
    }
  });

  selectedIndex = loadLastIndex();
  loadArticles(false);
  showScreen('feed');
  setTimeout(restoreFocus, 150);
})();
