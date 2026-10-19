/* 좌우 뉴스 — prototype/generate.py 의 NEWS_JS 에서 만든다 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ago(t) { var m = Math.max(1, Math.round((Date.now() - t) / 60000));
    return m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전'; }
  function item(r, ck) {
    var a = el('a', 'nw-item'); a.href = '/news.html?id=' + r.id; if (ck) a.dataset.ck = ck;
    a.appendChild(el('span', 'nw-t', r.title));
    a.appendChild(el('span', 'nw-m', r.src + ' · ' + ago(r.at) + (r.c ? ' · 💬 ' + r.c : '')));
    var li = el('li'); li.appendChild(a); return li;
  }
  function fill(ul, rows, ck) { ul.textContent = ''; rows.forEach(function (r) { ul.appendChild(item(r, ck)); }); }
  function pair(p, ck) {
    var d = el('div', 'nw-pair'); d.appendChild(el('div', 'nw-pk', '⚔️ 같은 사건, 다른 제목'));
    [['l', p.l], ['r', p.r]].forEach(function (x) {
      var a = el('a', 'nw-pl nw-pl-' + x[0]); a.href = '/news.html?id=' + x[1].id; if (ck) a.dataset.ck = ck;
      a.appendChild(el('span', 'nw-pt', x[1].title)); a.appendChild(el('span', 'nw-ps', x[1].src)); d.appendChild(a);
    });
    return d;
  }
  var home = $('nwBox'), list = $('nwList'), detail = $('nwDetail');
  var id = (new URLSearchParams(location.search).get('id') || '');
  if (detail && /^[a-f0-9]{16}$/.test(id)) {
    fetch('/news/item?id=' + id).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { $('nwTitle').textContent = '기사를 찾지 못했습니다. 오래된 헤드라인은 목록에서 빠집니다.'; return; }
      var it = d.item, L = it.side === 'L';
      detail.classList.add(L ? 'is-l' : 'is-r');
      $('nwSide').textContent = (L ? '🔵 진보 성향 매체 · ' : '🔴 보수 성향 매체 · ') + it.src;
      $('nwTitle').textContent = it.title; document.title = it.title + ' | 정치탈탈 좌우 뉴스';
      $('nwMeta').textContent = ago(it.at) + (it.c ? ' · 댓글 ' + it.c + '개' : '');
      $('nwOrig').href = it.link; $('nwOrig').textContent = it.src + '에서 기사 전문 보기 ↗';
      $('nwOtherH').textContent = (L ? '🔴 같은 시각, 보수 성향 매체 헤드라인' : '🔵 같은 시각, 진보 성향 매체 헤드라인');
      fill($('nwOther'), d.other, 'news-other');
    }).catch(function () {});
    return;
  }
  if (!home && !list) return;
  fetch('/news/list?n=' + (home ? 3 : 20)).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok || d.L.length < 2 || d.R.length < 2) return;
    fill($('nwL'), d.L, home ? 'home-news' : 'news-item'); fill($('nwR'), d.R, home ? 'home-news' : 'news-item');
    var ps = $('nwPairs');
    (home ? d.pairs.slice(0, 1) : d.pairs).forEach(function (p) { ps.appendChild(pair(p, home ? 'home-news-pair' : 'news-pair')); });
    (home || list).hidden = false;
  }).catch(function () {});
})();
