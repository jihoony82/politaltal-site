/* 박스 허브 — prototype/generate.py HUB_JS 에서 만든다 */
(function () {
  var sheets = [].slice.call(document.querySelectorAll(".hub-sheet"));
  if (!sheets.length) return;
  var root = document.documentElement, opened = null, pushed = false;
  root.classList.add("hub-js");
  sheets.forEach(function (s) {
    if (s.querySelector(":scope > .hub-bar")) return;
    var bar = document.createElement("div"), back = document.createElement("button"), t = document.createElement("b");
    bar.className = "hub-bar"; back.type = "button"; back.className = "hub-back"; back.textContent = "← 뒤로";
    t.textContent = s.getAttribute("data-title") || ""; back.onclick = close;
    bar.appendChild(back); bar.appendChild(t); s.insertBefore(bar, s.firstChild);
  });
  function open(id, push) {
    var s = document.getElementById(id);
    if (!s || !s.classList.contains("hub-sheet")) return false;
    if (opened && opened !== s) opened.classList.remove("open");
    s.classList.add("open"); s.scrollTop = 0; opened = s; root.classList.add("sheet-open");
    if (push) { history.pushState({ hub: id }, "", "#" + id); pushed = true; }
    try { window.dispatchEvent(new Event("resize")); navigator.sendBeacon("/t", JSON.stringify({ c: "sheet-" + id })); } catch (e) {}
    return true;
  }
  function shut() { if (opened) opened.classList.remove("open"); opened = null; root.classList.remove("sheet-open"); }
  function close() {
    if (pushed && history.state && history.state.hub) { history.back(); return; }
    shut(); history.replaceState(null, "", location.pathname + location.search);
  }
  window.hubOpen = function (id) { return open(id, true); };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1), t = id && /^[\w-]+$/.test(id) && document.getElementById(id);
    var s = t && (t.classList.contains("hub-sheet") ? t : t.closest(".hub-sheet"));
    if (!s) return;
    e.preventDefault();
    if (opened !== s) open(s.id, true);
    if (s !== t) setTimeout(function () { t.scrollIntoView({ block: "start" }); }, 60);
  });
  window.addEventListener("popstate", function () { var id = location.hash.slice(1); if (!(id && open(id, false))) shut(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && opened) close(); });
  var h = decodeURIComponent(location.hash.slice(1)), el = h && /^[\w-]+$/.test(h) && document.getElementById(h);
  if (el) {                                                   /* 카드 안 요소로 바로 온 주소 → 그 카드를 열고 그 자리로 */
    var s = el.classList.contains("hub-sheet") ? el : el.closest(".hub-sheet");
    if (s && open(s.id, false) && s !== el) setTimeout(function () { el.scrollIntoView({ block: "start" }); }, 60);
  }
})();
