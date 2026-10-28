/* 정치 전장: 내 편 고르기·오늘의 화력·응원/팩트 폭탄 — prototype/generate.py 의 WAR_JS 에서 만든다. 저장은 site/worker.js /war/* */
(function () {
  var T = { b: { name: "진보 성향", short: "진보", dot: "🔵", heart: "💙" }, w: { name: "중도", short: "중도", dot: "⚪", heart: "🤍" },
            r: { name: "보수 성향", short: "보수", dot: "🔴", heart: "❤️" } };
  var get = function () { try { var t = localStorage.getItem("pt_team"); return T[t] ? t : ""; } catch (e) { return ""; } };
  var fire = function (body) {
    return fetch("/war/fire", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return {}; });
  };
  var set = function (t) {
    try { localStorage.setItem("pt_team", t); } catch (e) {}
    fire({ kind: "join", team: t });
    document.dispatchEvent(new CustomEvent("pt-team", { detail: t }));
  };
  var sheet, sheetCb;
  function pick(cb) {
    sheetCb = cb;
    if (!sheet) {
      sheet = document.createElement("div"); sheet.className = "war-sheet";
      sheet.innerHTML = '<div class="wsh-card" role="dialog" aria-modal="true" aria-label="내 편 고르기"><p class="wsh-h">⚔️ 내 성향은? 화력을 보탤 편을 고르세요</p><div class="war-pick">' +
        ["b", "w", "r"].map(function (k) { return '<button type="button" data-team="' + k + '">' + T[k].dot + " " + T[k].short + "</button>"; }).join("") +
        '</div><p class="wsh-fine">언제든 바꿀 수 있어요 · 이 기기에만 저장됩니다</p><button type="button" class="wsh-x">닫기</button></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener("click", function (e) {
        var b = e.target.closest("[data-team]");
        if (b) { set(b.dataset.team); sheet.hidden = true; if (sheetCb) sheetCb(b.dataset.team); }
        else if (e.target === sheet || e.target.className === "wsh-x") sheet.hidden = true;
      });
    }
    sheet.hidden = false;
  }
  function paint() {
    var t = get(), host = document.querySelector(".header-actions"), c = document.getElementById("warChip");
    if (host && !c) { c = document.createElement("button"); c.type = "button"; c.id = "warChip"; c.onclick = function () { pick(); }; host.insertBefore(c, host.firstChild); }
    if (c) { c.className = "war-chip" + (t ? " t-" + t : ""); c.textContent = t ? T[t].dot + " " + T[t].short : "⚔️ 편 고르기"; }
    [].forEach.call(document.querySelectorAll(".war-pick [data-team]"), function (b) { b.setAttribute("aria-pressed", b.dataset.team === t ? "true" : "false"); });
  }
  document.addEventListener("pt-team", paint);
  // 앱 인앱결제 거래를 서버에 넘겨 화력으로 — 애플은 서명된 거래(JWS), 구글은 구매 토큰. 서버가 스토어 서명·조회로 확인한다
  var iap = function (t, pid, team) {
    var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return fetch("/war/iap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ios
      ? { platform: "ios", productId: pid, team: team, jws: t && t.jwsRepresentation }
      : { platform: "android", productId: pid, team: team, purchaseToken: t && t.purchaseToken }) })
      .then(function (r) { return r.json(); }).catch(function () { return {}; });
  };
  window.PTW = { T: T, team: get, pick: pick, fire: fire, iap: iap };

  function gauge() {                                   /* 홈 맨 위: 오늘의 화력 */
    var box = document.getElementById("warBox");
    if (!box) return;
    box.addEventListener("click", function (e) { var b = e.target.closest(".war-pick [data-team]"); if (b) set(b.dataset.team); });
    if (!document.getElementById("fireB")) return;   /* 선거 임박 모드엔 점수판이 없다 */
    fetch("/war/today").then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) return;
      var f = d.today || {}, y = d.yday || {}, v = { b: f.b || 0, w: f.w || 0, r: f.r || 0 }, sum = v.b + v.w + v.r;
      ["b", "w", "r"].forEach(function (k) {
        document.getElementById("fire" + k.toUpperCase()).textContent = v[k].toLocaleString("ko-KR");
        box.querySelector(".war-bar ." + k).style.flexGrow = sum ? v[k] : 1;
      });
      var yb = y.b || 0, yr = y.r || 0;
      if (yb || yr) document.getElementById("warY").textContent = "어제는 " + (yb === yr ? "무승부" : (yb > yr ? "🔵 진보" : "🔴 보수") + " 승리") + " · ";
    }).catch(function () {});
  }
  function pbox() {                                    /* 정치인·지자체장 페이지: 응원 · 팩트 폭탄 */
    var box = document.getElementById("warP");
    if (!box) return;
    var t = box.getAttribute("data-t"), facts = [];
    try { facts = JSON.parse(box.getAttribute("data-f") || "[]"); } catch (e) {}
    var q = function (sel) { return box.querySelector(sel); }, msg = q(".wp-msg"), list = q(".wp-facts");
    var num = function (sel, n) { q(sel + " b").textContent = n.toLocaleString("ko-KR"); };
    var cnt = { cheer: 0, bomb: 0 };
    fetch("/war/today?t=" + encodeURIComponent(t)).then(function (r) { return r.json(); }).then(function (d) {
      var x = d.t || {}; cnt.cheer = x.cheer || 0; cnt.bomb = x.bomb || 0; num(".wp-cheer", cnt.cheer); num(".wp-bomb", cnt.bomb);
    }).catch(function () {});
    q(".wp-cheer").onclick = function () {
      var go = function (me) {
        fire({ kind: "cheer", team: me, t: t }).then(function (r) {
          if (r.dup) msg.textContent = "오늘은 이미 응원했어요. 내일 또 힘을 보태 주세요!";
          else if (r.ok) { num(".wp-cheer", ++cnt.cheer); msg.textContent = T[me].heart + " 응원 완료! " + T[me].name + " 화력 +1"; }
        });
      };
      if (get()) go(get()); else pick(go);
    };
    if (!facts.length) { q(".wp-bomb").hidden = true; q(".wp-acts").style.gridTemplateColumns = "1fr"; return; }
    facts.forEach(function (f) {
      var b = document.createElement("button"); b.type = "button"; b.textContent = "💣 " + f;
      b.onclick = function () {
        var go = function (me) {
          fire({ kind: "bomb", team: me, t: t }).then(function (r) {
            list.hidden = true;
            if (r.dup) msg.textContent = "오늘은 이미 던졌어요. 내일 또 던질 수 있어요.";
            else if (r.ok) {
              num(".wp-bomb", ++cnt.bomb); box.classList.add("boom"); setTimeout(function () { box.classList.remove("boom"); }, 700);
              msg.textContent = "💥 팩트 투척! “" + f + "” — " + T[me].name + " 화력 +1";
            }
          });
        };
        if (get()) go(get()); else pick(go);
      };
      list.appendChild(b);
    });
    q(".wp-bomb").onclick = function () { list.hidden = !list.hidden; };
  }
  function start() { paint(); gauge(); pbox(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
