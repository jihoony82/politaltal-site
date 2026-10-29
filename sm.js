/* 📮 신문고 — prototype/generate.py SM_JS 에서 만든다. 저장 = worker /sm/*. 글은 전부 textContent 로만 넣는다 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function api(path, body) {
    var o = body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {};
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return { ok: false, error: "server" }; }); }).catch(function () { return { ok: false, error: "net" }; });
  }
  var ERR = { phone: "휴대폰 번호를 확인해 주세요.", sms_off: "문자 인증을 준비 중입니다. 잠시 뒤 다시 해 주세요.", wait: "방금 보냈습니다. 1분 뒤에 다시 받을 수 있어요.",
    slow: "오늘 할 수 있는 횟수를 넘었습니다. 내일 다시 해 주세요.", send: "문자를 보내지 못했습니다. 다시 눌러 주세요.", wrong: "인증번호가 맞지 않습니다.",
    expired: "인증번호 시간이 지났습니다. 다시 받아 주세요.", tries: "5번 틀렸습니다. 인증번호를 새로 받아 주세요.", invalid: "입력을 확인해 주세요.",
    link: "주소(링크)는 넣을 수 없습니다.", bad: "욕설·비방 표현은 쓸 수 없습니다.", net: "연결이 끊겼습니다. 다시 눌러 주세요.", server: "잠시 문제가 생겼습니다. 다시 눌러 주세요." };
  var ST = { "new": ["접수", "st-new"], seen: ["확인 중", "st-seen"], done: ["답변 완료", "st-done"] };
  var day = function (ts) { var d = new Date(ts); return d.getFullYear() + "." + (d.getMonth() + 1) + "." + d.getDate(); };
  var digits = function (v) { return String(v || "").replace(/\D/g, ""); };
  function say(box, d, ok) { box.className = "sm-msg " + (d.ok ? "ok" : "err"); box.textContent = d.ok ? (ok || "") : (ERR[d.error] || "다시 시도해 주세요."); }
  function mine() { try { return JSON.parse(localStorage.getItem("sm_mine") || "[]"); } catch (e) { return []; } }
  function card(r, label, opt) {                                 /* 민원·청원 한 건 */
    opt = opt || {};
    var c = el("article", "sm-item"), top = el("div", "sm-top"), st = ST[r.status] || ST["new"];
    top.appendChild(el("span", "sm-cat", r.cat)); if (r.pub === 0) top.appendChild(el("span", "sm-lock", "🔒 비공개"));
    top.appendChild(el("span", "sm-st " + st[1], st[0])); c.appendChild(top);
    c.appendChild(el("h3", "sm-title", r.title));
    c.appendChild(el("div", "sm-meta", (opt.to ? opt.to + " · " : "") + r.nick + " · " + day(r.at)));
    var body = el("p", "sm-body", r.body); c.appendChild(body);
    if (!opt.full && (r.body.length > 140 || r.body.split("\n").length > 4)) {
      body.className += " clamp";
      var mb = el("button", "sm-more", "더 보기"); mb.type = "button"; mb.onclick = function () { body.className = "sm-body"; mb.remove(); }; c.appendChild(mb);
    }
    if (r.answer) { var a = el("div", "sm-ans"); a.appendChild(el("b", "", "✅ " + label + " 답변 · " + day(r.answered_at))); a.appendChild(el("p", "", r.answer)); c.appendChild(a); }
    else if (opt.full) c.appendChild(el("p", "sm-wait", r.status === "seen" ? label + "이 확인하고 있습니다. 답변이 오면 문자로 알려 드립니다." : "접수됐습니다. 답변이 오면 문자로 알려 드립니다."));
    if (opt.acts) {
      var acts = el("div", "sm-acts"), lk = el("button", "sm-like" + (r.liked ? " on" : ""), "🤝 함께해요 " + (r.likes || 0)), rp = el("button", "sm-rep", "신고");
      lk.type = rp.type = "button"; lk.setAttribute("aria-pressed", r.liked ? "true" : "false");
      lk.onclick = function () {
        if (r.liked) return;
        lk.disabled = true;
        api("/sm/like", { id: r.id }).then(function (d) { lk.disabled = false; if (d.ok) { r.liked = 1; lk.className = "sm-like on"; lk.textContent = "🤝 함께해요 " + d.likes; lk.setAttribute("aria-pressed", "true"); } });
      };
      rp.onclick = function () { if (confirm("이 글을 신고할까요? 욕설·비방·허위사실·개인정보 노출일 때만 눌러 주세요.")) api("/sm/report", { id: r.id }).then(function () { rp.textContent = "신고함"; rp.disabled = true; }); };
      acts.appendChild(lk); acts.appendChild(rp); c.appendChild(acts);
    }
    return c;
  }

  /* ① 의원·단체장 페이지의 신문고 */
  var box = $("smBox");
  if (box) {
    var T = box.getAttribute("data-t"), LABEL = box.getAttribute("data-label"), form = $("smForm"), msg = $("smMsg");
    var load = function () {
      api("/sm/list?t=" + encodeURIComponent(T)).then(function (d) {
        if (!d.ok) return;
        [["data-sm-n", d.n], ["data-sm-done", d.done], ["data-sm-priv", d.priv]].forEach(function (x) {
          [].forEach.call(document.querySelectorAll("[" + x[0] + "]"), function (e) { e.textContent = Number(x[1] || 0).toLocaleString("ko-KR"); });
        });
        var of = $("smOfc"); of.hidden = false; of.textContent = "";
        if (d.office) { of.className = "sm-ofc on"; of.textContent = "✅ " + LABEL + "이 인증하고 직접 답합니다."; }
        else {
          of.className = "sm-ofc"; of.appendChild(document.createTextNode(LABEL + "이 아직 인증 전이에요. 접수된 민원은 인증되는 즉시 전달됩니다. "));
          var a = el("a", "ofc-cta-link", "담당자이신가요? 인증하기 →"); a.href = "/office"; of.appendChild(a);
        }
        var list = $("smList"); list.textContent = "";
        list.appendChild(el("h3", "sm-lh", "공개 청원 " + d.rows.length + "건"));
        if (!d.rows.length) list.appendChild(el("p", "sm-empty", "아직 공개 청원이 없어요. 첫 번째로 남겨 주세요."));
        d.rows.forEach(function (r) { r.pub = 1; list.appendChild(card(r, LABEL, { acts: true })); });
      });
    };
    load();
    $("smGo").onclick = function () { form.hidden = false; this.hidden = true; $("smDone").hidden = true; form.title.focus(); };
    form.body.oninput = function () { $("smCnt").textContent = this.value.length + " / 2000"; };
    $("smOtp").onclick = function () {
      var b = this; b.disabled = true;
      api("/sm/otp", { phone: digits(form.phone.value) }).then(function (d) {
        b.disabled = false; say(msg, d, "문자로 6자리를 보냈습니다. 10분 안에 넣어 주세요.");
        if (d.ok) { form.code.hidden = false; b.textContent = "다시 받기"; if (d.dev) form.code.value = d.dev; form.code.focus(); }
      });
    };
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form, pub = f.querySelector("input[name=pub]:checked").value === "1", cat = f.querySelector("input[name=cat]:checked").value;
      var bad = f.title.value.trim().length < 4 ? "제목을 4자 이상 적어 주세요." : f.body.value.trim().length < 10 ? "내용을 10자 이상 적어 주세요."
        : !f.code.value ? "휴대폰 인증번호를 받아 넣어 주세요." : !f.agree.checked ? "개인정보 수집·이용에 동의해 주세요." : "";
      if (bad) { msg.className = "sm-msg err"; msg.textContent = bad; return; }
      var b = f.querySelector(".sm-submit"); b.disabled = true;
      api("/sm/post", { t: T, cat: cat, title: f.title.value, body: f.body.value, nick: f.nick.value, pub: pub, phone: digits(f.phone.value), code: digits(f.code.value), agree: true })
        .then(function (d) {
          b.disabled = false;
          if (!d.ok) { say(msg, d); return; }
          try { var m = mine(); m.unshift({ k: d.k, title: f.title.value.slice(0, 40), to: LABEL, at: Date.now() }); localStorage.setItem("sm_mine", JSON.stringify(m.slice(0, 30))); } catch (x) {}
          form.hidden = true; form.reset(); f.code.hidden = true; $("smGo").hidden = false; msg.textContent = "";
          var dn = $("smDone"); dn.hidden = false; dn.textContent = "";
          dn.appendChild(el("b", "", "✅ 접수됐습니다 (접수번호 " + d.id + ")"));
          dn.appendChild(el("p", "", (pub ? "공개 청원으로 아래 목록에 올라갔습니다. " : "비공개 민원은 " + LABEL + "과 운영자만 봅니다. ") + "답변이 오면 문자로 알려 드려요. 이 주소로 언제든 확인할 수 있습니다."));
          var row = el("div", "sm-linkrow"), inp = el("input"), cp = el("button", "", "주소 복사");
          inp.readOnly = true; inp.value = d.link; cp.type = "button";
          cp.onclick = function () { inp.select(); (navigator.clipboard ? navigator.clipboard.writeText(d.link) : Promise.reject()).catch(function () { document.execCommand("copy"); }).then(function () { cp.textContent = "복사했어요"; }); };
          row.appendChild(inp); row.appendChild(cp); dn.appendChild(row);
          load();
        });
    });
  }

  /* ② 신문고 안내 페이지(/sinmungo.html) — 내 민원(?k=)·내가 낸 것·찾기·최근 청원 */
  var hub = $("smHub");
  if (hub) {
    var k = (location.search.match(/[?&]k=([a-f0-9]{24})/) || [])[1];
    if (k) api("/sm/mine?k=" + k).then(function (d) {
      var b = $("smMine"); b.hidden = false; b.textContent = "";
      if (!d.ok) { b.appendChild(el("p", "sm-empty", "찾을 수 없는 주소입니다. 주소를 다시 확인해 주세요.")); return; }
      b.appendChild(el("h2", "sm-lh", "📬 내 민원"));
      b.appendChild(card(d.row, d.row.label, { full: true, to: d.row.label }));
      var go = el("a", "sm-golink", d.row.label + " 페이지 신문고로 →"); go.href = d.row.page + ".html#sm"; b.appendChild(go);
    });
    var my = mine(), mb = $("smMy");
    if (my.length) {
      mb.hidden = false;
      my.forEach(function (x) { var a = el("a", "sm-myrow"); a.href = "/sinmungo.html?k=" + x.k; a.appendChild(el("b", "", x.title)); a.appendChild(el("small", "", x.to + " · " + day(x.at))); mb.appendChild(a); });
    }
    var LIST = null, q = $("smQ"), res = $("smRes"), lastQ = null;
    q.addEventListener("input", function () {
      var v = q.value.trim(); if (v === lastQ) return; lastQ = v;
      var go = function () {
        res.textContent = ""; if (!v) return;
        LIST.filter(function (x) { return x[1].indexOf(v) >= 0 || x[2].indexOf(v) >= 0; }).slice(0, 12).forEach(function (x) {
          var a = el("a", "sm-pick"); a.href = x[0] + "#sm"; a.appendChild(el("b", "", x[1])); a.appendChild(el("small", "", x[2])); res.appendChild(a);
        });
        if (!res.children.length) res.appendChild(el("p", "sm-empty", "찾는 사람이 없습니다. 현직 국회의원·시도지사·시장·군수·구청장만 있어요."));
      };
      if (LIST) return go();
      Promise.all(["/data/members-mini.json", "/data/local-mini.json"].map(function (u) { return fetch(u).then(function (r) { return r.json(); }); })).then(function (x) {
        LIST = Object.keys(x[0]).map(function (c) { var m = x[0][c]; return ["/politician/" + c + ".html", m.name + " 의원", m.party + " · " + m.district]; })
          .concat(Object.keys(x[1]).map(function (t) { var m = x[1][t]; return ["/local/" + t.slice(2) + ".html", m[0] + " " + m[4], m[1] + " · " + m[2]]; }));
        go();
      });
    });
    api("/sm/recent").then(function (d) {
      if (!d.ok) return;
      $("smAllN").textContent = Number(d.n).toLocaleString("ko-KR"); $("smAllDone").textContent = Number(d.done).toLocaleString("ko-KR");
      var b = $("smRecent"); b.textContent = "";
      if (!d.rows.length) b.appendChild(el("p", "sm-empty", "아직 올라온 공개 청원이 없어요. 위에서 의원·단체장을 찾아 첫 번째로 남겨 주세요."));
      d.rows.forEach(function (r) {
        var a = el("a", "sm-rrow"), st = ST[r.status] || ST["new"]; a.href = r.page + ".html#sm";
        var t = el("div", "sm-top"); t.appendChild(el("span", "sm-cat", r.cat)); t.appendChild(el("span", "sm-st " + st[1], st[0])); a.appendChild(t);
        a.appendChild(el("b", "", r.title)); a.appendChild(el("small", "", r.label + " · 🤝 " + r.likes + " · " + day(r.at))); b.appendChild(a);
      });
    });
  }
})();
