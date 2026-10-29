/* 정치인 한마디: 댓글·답글·공감 + 인증된 의원실 공식 답글 — prototype/generate.py 의 PC_JS 에서 만든다. 저장은 worker.js /pc/* · 의원실은 /ofc/* */
(function () {
  var box = document.getElementById("pcBox");
  if (!box) return;
  var $ = function (id) { return document.getElementById(id); };
  var T = box.getAttribute("data-t"), list = $("pcList"), msg = $("pcMsg"), form = $("pcForm"), more = $("pcMore"),
      count = $("pcCount"), sortBtn = $("pcSort");
  var tops = [], kids = {}, total = 0, all = false, byLikes = false, open = true, shown = {};
  var ERR = { bad: "욕설·비방 표현이 들어 있어 올릴 수 없습니다.", link: "링크는 올릴 수 없습니다.", slow: "잠시 뒤에 다시 남겨 주세요.",
              closed: "지금은 댓글을 받지 않습니다.", invalid: "2자 이상 300자 이하로 적어 주세요." };

  function send(path, body) {
    return fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(cls, text, fn) { var b = el("button", cls, text); b.type = "button"; b.onclick = fn; return b; }
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    return m < 1 ? "방금" : m < 60 ? m + "분 전" : m < 1440 ? Math.floor(m / 60) + "시간 전" : Math.floor(m / 1440) + "일 전";
  }
  function answered(r) { return (kids[r.id] || []).some(function (c) { return c.off; }); }

  function post(text, parent, button, out, done) {
    button.disabled = true; out.textContent = "";
    var sup = ""; try { sup = localStorage.getItem("pt_sup") || ""; } catch (e) {}   /* 후원자의 벽에 이름을 남긴 기기 — 승인됐으면 배지 */
    var team = (window.PTW && PTW.team()) || "";                                     /* 내 편 색으로 댓글 테두리 + 진영 화력 +2 */
    send("/pc/post", { t: T, body: text, parent: parent, hp: form.hp.value, sup: sup, team: team }).then(function (d) {
      button.disabled = false;
      if (!d.ok) { out.textContent = ERR[d.error] || "올리지 못했습니다. 다시 시도해 주세요."; return; }
      if (parent) { (kids[parent] = kids[parent] || []).push(d.row); shown[parent] = true; } else tops.unshift(d.row);
      total++; done(); draw();
    }).catch(function () { button.disabled = false; out.textContent = "올리지 못했습니다. 연결을 확인해 주세요."; });
  }

  function item(r, isReply) {
    var cls = isReply ? "pc-item pc-reply" : "pc-item";
    if (r.off) cls += " pc-off"; else if (r.team) cls += " t-" + r.team;
    if (r.pin && !isReply) cls += " pc-pinned";
    var it = el("div", cls), acts = el("div", "pc-acts"), n = (kids[r.id] || []).length;
    if (r.pin && !isReply) it.appendChild(el("div", "pc-pin", "📌 의원실이 고정한 글"));
    var meta = el("div", "pc-meta");
    if (r.off) { meta.appendChild(el("b", "pc-ofc-name", r.nick)); meta.appendChild(el("span", "pc-ofc-tag", "✅ 공식 답글")); }
    else meta.appendChild(document.createTextNode(({ b: "🔵 ", w: "⚪ ", r: "🔴 " }[r.team] || "") + r.nick));
    if (r.badge) { var bd = el("a", "pc-sup", r.badge <= 100 ? "☕ 창립 후원자" : "☕ 후원자"); bd.href = "/supporters.html"; bd.title = "후원자의 벽 제" + r.badge + "석"; meta.appendChild(bd); }
    meta.appendChild(document.createTextNode("· " + ago(r.at)));
    it.appendChild(meta);
    it.appendChild(el("p", "", r.body));
    var like = btn("pc-act" + (r.liked ? " on" : ""), (r.liked ? "♥" : "♡") + " 공감" + (r.likes ? " " + r.likes : ""), function () {
      like.disabled = true;
      send("/pc/like", { id: r.id }).then(function (d) { if (d.ok) { r.liked = d.liked; r.likes = d.likes; } draw(); })
        .catch(function () { like.disabled = false; });
    });
    acts.appendChild(like);
    if (!isReply) acts.appendChild(btn("pc-act", shown[r.id] ? "답글 접기" : "답글" + (n ? " " + n : ""), function () { shown[r.id] = !shown[r.id]; draw(); }));
    var rep = btn("pc-report", "신고", function () {
      if (!confirm("이 글을 신고할까요?")) return;
      send("/pc/report", { id: r.id }).then(function () { rep.textContent = "신고됨"; rep.disabled = true; }).catch(function () {});
    });
    acts.appendChild(rep); it.appendChild(acts);
    if (!isReply && shown[r.id]) {
      var wrap = el("div", "pc-replies");
      (kids[r.id] || []).forEach(function (c) { wrap.appendChild(item(c, true)); });
      if (open) {
        var f = el("form", "pc-form pc-rform"), i = el("input"), b = el("button", "", "답글 남기기"), out = el("p", "pc-msg");
        i.name = "body"; i.maxLength = 300; i.required = true; i.placeholder = "답글 (300자)"; i.setAttribute("aria-label", "답글");
        b.type = "submit"; out.setAttribute("role", "status"); f.appendChild(i); f.appendChild(b);
        f.addEventListener("submit", function (ev) { ev.preventDefault(); post(i.value, r.id, b, out, function () {}); });
        wrap.appendChild(f); wrap.appendChild(out);
      }
      it.appendChild(wrap);
    } else if (!isReply && answered(r)) {                     /* 답글을 접어 두어도 의원실 공식 답글은 보인다 */
      var ow = el("div", "pc-replies");
      (kids[r.id] || []).filter(function (c) { return c.off; }).forEach(function (c) { ow.appendChild(item(c, true)); });
      it.appendChild(ow);
    }
    return it;
  }

  function draw() {
    list.textContent = "";
    if (!tops.length) list.appendChild(el("div", "pc-empty", open ? "아직 한마디가 없습니다. 첫 번째로 남겨 보세요." : "아직 한마디가 없습니다."));
    var view = tops.slice();
    // 고정한 글 → (접힌 상태) 의원실이 답한 글 → 공감 많은 글. 펼치면 최신순(또는 공감순)
    view.sort(function (a, b) {
      return (b.pin || 0) - (a.pin || 0) || (!all ? answered(b) - answered(a) : 0) ||
        (byLikes || !all ? b.likes - a.likes : 0) || b.id - a.id;
    });
    (all ? view : view.slice(0, 1)).forEach(function (r) { list.appendChild(item(r, false)); });
    box.className = all ? "pc-box open" : "pc-box";
    more.hidden = all || tops.length <= 1;
    more.textContent = "댓글 " + total + "개 모두 보기";
    count.textContent = total ? total.toLocaleString("ko-KR") + "개" : "";
    sortBtn.hidden = !all || tops.length < 2;
    sortBtn.textContent = byLikes ? "최신순으로 보기" : "공감순으로 보기";
  }

  function office(o) {                                          /* 인증된 의원실이 있으면 배지·안내를 바꾼다 */
    var on = !!o;
    [].forEach.call(document.querySelectorAll("[data-ofc-on]"), function (e) { e.hidden = !on; });
    [].forEach.call(document.querySelectorAll("[data-ofc-off]"), function (e) { e.hidden = on; });
  }

  more.onclick = function () { all = true; draw(); };
  sortBtn.onclick = function () { byLikes = !byLikes; draw(); };
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    post(form.body.value, 0, form.querySelector("button"), msg, function () { form.body.value = ""; });
  });
  fetch("/pc/list?t=" + encodeURIComponent(T)).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok) return;
    open = d.open; total = d.total;
    tops = d.rows.filter(function (r) { return !r.parent; });                     // 최신순으로 내려온다
    d.rows.slice().reverse().forEach(function (r) { if (r.parent) (kids[r.parent] = kids[r.parent] || []).push(r); });   // 답글은 오래된 순
    if (!open) { form.hidden = true; msg.textContent = ERR.closed; }
    office(d.office);
    draw();
  }).catch(function () {});
})();
