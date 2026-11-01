/* 의원·단체장 페이지 '최근 일주일 뉴스' — prototype/generate.py 의 WHO_JS 에서 만든다 */
(function () {
  var box = document.getElementById("whoNews");
  if (!box) return;
  fetch("/news/who?t=" + encodeURIComponent(box.getAttribute("data-t"))).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok) return;
    if (!d.L.length && !d.R.length) {                         /* 기사가 없으면 없다고 말한다(대표 11-02) */
      box.querySelector(".nw-cols").hidden = true;
      document.getElementById("whoEmpty").hidden = false;
      box.hidden = false;
      return;
    }
    [["L", "whoL"], ["R", "whoR"]].forEach(function (p) {
      var ul = document.getElementById(p[1]);
      d[p[0]].forEach(function (r) {
        var li = document.createElement("li"), a = document.createElement("a"), t = document.createElement("span"), m = document.createElement("span"), at = new Date(r.at);
        a.className = "nw-item"; a.href = r.link; a.target = "_blank"; a.rel = "noopener nofollow"; a.setAttribute("data-ck", "who-news");
        t.className = "nw-t"; t.textContent = r.title;
        m.className = "nw-m"; m.textContent = r.src + " · " + (at.getMonth() + 1) + "/" + at.getDate();
        a.appendChild(t); a.appendChild(m); li.appendChild(a); ul.appendChild(li);
      });
      if (!d[p[0]].length) { var e = document.createElement("li"); e.className = "nw-none"; e.textContent = "이번 주 기사 없음"; ul.appendChild(e); }
    });
    var more = document.getElementById("whoMore");
    more.hidden = Math.max(d.L.length, d.R.length) <= 2;
    more.onclick = function () { more.textContent = box.classList.toggle("all") ? "접기" : "더보기"; };
    box.hidden = false;
  }).catch(function () {});
})();
