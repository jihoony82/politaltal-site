// 정치탈탈 — /bills/* 법안 상세 동적 렌더링 Worker
// wrangler.jsonc의 assets.run_worker_first=["/bills/*"] 로 /bills/* 만 이 Worker를
// 거치고, 나머지 모든 경로(홈·의원·커뮤니티 등)는 정적 자산으로 직행한다(무위험).
// 데이터·상태·발의자카드·CTA는 generate.py가 _billsrc/data.json 에 미리 구워두므로
// 여기선 로직 없이 문자열 조립만 한다. 껍데기(_billsrc/shell.html)는 page()가 토큰으로
// 생성해 실제 페이지와 자동 동기화된다.

let CACHE = null; // {shell, data} — 아이솔레이트 전역 캐시(웜 요청은 재파싱 안 함)

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function load(env, origin) {
  if (CACHE) return CACHE;
  const [shell, data] = await Promise.all([
    env.ASSETS.fetch(new URL("/_billsrc/shell.html", origin)).then(r => r.text()),
    env.ASSETS.fetch(new URL("/_billsrc/data.json", origin)).then(r => r.json()),
  ]);
  CACHE = { shell, data };
  return CACHE;
}

function renderBill(no, C) {
  const D = C.data;
  const b = D.bills[no];
  if (!b) return null;

  const st = D.status[b.pr] || {
    label: esc(b.pr), rawLabel: b.pr, badgeClass: "bill-badge-gray",
    stepper: "", final: !!b.pr,
  };
  const mem = b.rst ? D.members[b.rst] : null;
  const proposerCard = mem
    ? mem.card
    : `<div class="embedded-member-card missing">📍 발의자 정보 없음 (${esc(b.pt || "—")})</div>`;
  const coproposers = (b.pt.includes("등") && b.pt.includes("인"))
    ? `<div class="bill-co-line">👥 <span>${esc(b.pt)}</span></div>` : "";
  const procDateHtml = (b.prd && st.final)
    ? `<div class="bill-meta-row"><span>의결일</span><strong>${esc(b.prd)}</strong></div>` : "";
  const likms = b.du || `https://likms.assembly.go.kr/bill/billDetail.do?billId=${b.bid}`;

  const body = `
        <div class="container" style="max-width:680px;">
          <a href="/list.html" class="back-link">← 의원 목록으로</a>

          <div class="bill-detail-card">
            <div class="bill-head-row">
              <span class="bill-no">의안번호 ${esc(no)}</span>
              <span class="bill-cat-tag">${esc(b.cat)}</span>
              <span class="bill-badge ${st.badgeClass}">${st.label}</span>
            </div>
            <h1 class="bill-title">${esc(b.nm)}</h1>

            <div class="bill-meta-grid">
              <div class="bill-meta-row"><span>발의일</span><strong>${esc(b.pd || "—")}</strong></div>
              <div class="bill-meta-row"><span>소관위원회</span><strong>${esc(b.cm || "—")}</strong></div>
              ${procDateHtml}
            </div>

            <h3 class="bill-section-title">📍 진행 단계</h3>
            ${st.stepper}

            <h3 class="bill-section-title">👤 대표 발의</h3>
            ${proposerCard}
            ${coproposers}

            <h3 class="bill-section-title">🔗 원문 보기</h3>
            <a href="${esc(likms)}" target="_blank" rel="noopener" class="ext-link-card">
              <span class="ext-icon">📑</span>
              <div class="ext-info">
                <div class="ext-title">국회 의안정보시스템에서 전문 보기</div>
                <div class="ext-desc">제안이유·주요내용·심사보고서 등 공식 문서</div>
              </div>
              <span class="ext-arrow">↗</span>
            </a>

            <div style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--color-border);font-size:11.5px;color:var(--color-text-soft);line-height:1.6;">
              출처: 열린국회정보 · 마지막 업데이트는 사이트 빌드 시점 기준입니다.<br>
              "대안반영폐기"는 다른 법안에 흡수돼 따로 폐기된 경우로, 사실상 반영된 케이스입니다.
            </div>
          </div>

          <div class="share-row">${D.shareHtml}</div>

          ${D.ctaHtml}
        </div>
        `;

  // ── head 필드(build_bill_pages와 동일 산식) ──
  const nmFull = b.nm.replace(/"/g, "'");
  const title = esc(`${b.nm.slice(0, 40)} - 법안 상세 - 정치탈탈`);
  const desc = esc(`제22대 의안번호 ${no} · ${nmFull.slice(0, 80)} · ${st.rawLabel} · `
    + `발의일 ${b.pd || "미상"} · 소관위 ${b.cm || "미상"}`);
  const proposerName = mem ? mem.name : "";
  const kw = esc([
    nmFull.slice(0, 30), `의안번호 ${no}`, b.cat, st.rawLabel,
    proposerName ? `${proposerName} 발의` : "", "국회 법안", "22대 국회",
  ].filter(Boolean).join(","));
  const jsonld = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Legislation",
    "name": "${esc(nmFull)}",
    "legislationIdentifier": "${no}",
    "legislationDate": "${b.pd || ""}",
    "legislationType": "Bill",
    "url": "https://politaltal.com/bills/${no}.html",
    "legislationJurisdiction": {
      "@type": "AdministrativeArea",
      "name": "대한민국 국회",
      "addressCountry": "KR"
    },
    "legislationLegalForce": "${st.rawLabel}",
    "creator": {
      "@type": "Person",
      "name": "${esc(proposerName)}"
    }
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type": "ListItem", "position": 1, "name": "홈", "item": "https://politaltal.com/"},
      {"@type": "ListItem", "position": 2, "name": "의원 목록", "item": "https://politaltal.com/list.html"},
      {"@type": "ListItem", "position": 3, "name": "법안 ${no}", "item": "https://politaltal.com/bills/${no}.html"}
    ]
  }
  </script>`;

  return C.shell
    .split("@@B_TITLE@@").join(title)
    .split("@@B_DESC@@").join(desc)
    .split("@@B_KEYWORDS@@").join(kw)
    .split("@@B_PATH@@").join(`/bills/${no}`)  // 확장자 없는 최종 URL(canonical·og)
    .split("@@B_JSONLD@@").join(jsonld)
    .split("@@B_BODY@@").join(body);
}

// ── 앱 푸시 토큰 저장소 (/push/*) ─────────────────────────────────────────
// D1(PUSH_DB)에 기기 토큰만 저장한다. 발송은 CI(poc/send_push.py)가 한다.
// 목록 조회·정리는 발송기가 ES256 JWT로 인증 — 공개키만 여기 있고 워커에는 비밀값이 없다.
const PUSH_ADMIN_JWK = { kty: "EC", crv: "P-256",
  x: "6nDP_wZjxYIQbEP3Cr-q4LNKV_I2EnxBSDp4xBoQeNw", y: "nM6MRRhBQZ8GAbMmXZ4uteltV00wIxsQmvaJtjllDhE" };
let PUSH_READY = false;
const pj = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const b64u = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function pushAdminOk(request) {
  const tok = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const [h, p, sig] = tok.split(".");
  if (!h || !p || !sig) return false;
  const key = await crypto.subtle.importKey("jwk", PUSH_ADMIN_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, b64u(sig), new TextEncoder().encode(h + "." + p));
  if (!ok) return false;
  const claims = JSON.parse(new TextDecoder().decode(b64u(p)));
  return claims.aud === "politaltal-push" && claims.exp > Date.now() / 1000;   // 발송기는 수명 2분짜리만 발급
}

async function handlePush(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "push store not provisioned" }, 503);
  if (!PUSH_READY) {
    await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS push_tokens (token TEXT PRIMARY KEY, platform TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    PUSH_READY = true;
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (request.method !== "POST") return pj({ ok: false, error: "method" }, 405);
  const body = await request.json().catch(() => ({}));

  if (path === "/push/register" || path === "/push/unregister") {
    // 앱 웹뷰는 사이트와 같은 오리진에서 호출한다 — 다른 사이트발 요청은 받지 않음
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const token = String(body.token || "").trim();
    const platform = String(body.platform || "").toLowerCase();
    if (token.length < 20 || token.length > 4096 || !["ios", "android"].includes(platform))
      return pj({ ok: false, error: "invalid" }, 400);
    if (path === "/push/unregister") {
      await env.PUSH_DB.prepare("DELETE FROM push_tokens WHERE token = ?").bind(token).run();
    } else {
      await env.PUSH_DB.prepare(
        "INSERT INTO push_tokens (token, platform, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(token) DO UPDATE SET platform = excluded.platform, updated_at = excluded.updated_at"
      ).bind(token, platform, Date.now()).run();
    }
    return pj({ ok: true });
  }

  if (path === "/push/admin") {
    if (!(await pushAdminOk(request))) return pj({ ok: false, error: "unauthorized" }, 401);
    if (body.op === "list") {
      const { results } = await env.PUSH_DB.prepare("SELECT token, platform FROM push_tokens").all();
      return pj({ ok: true, tokens: results });
    }
    if (body.op === "stats") return pj(await statsSummary(env));      // 자정 요약(poc/daily_digest.py)
    if (body.op === "prune" && Array.isArray(body.tokens)) {      // 무효(삭제된 앱) 토큰 정리
      for (const t of body.tokens.slice(0, 500))
        await env.PUSH_DB.prepare("DELETE FROM push_tokens WHERE token = ?").bind(String(t)).run();
      return pj({ ok: true, pruned: Math.min(body.tokens.length, 500) });
    }
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 방문 집계 (/t) ──────────────────────────────────────────────────────
// 페이지마다 한 번 sendBeacon → 날짜(한국 시각)별 카운터만 올린다. 쿠키·IP·기기 식별값은 저장하지 않는다.
// 방문 = 다른 사이트에서(또는 주소를 직접 쳐서) 들어온 조회 — Cloudflare Web Analytics 와 같은 정의.
// ponytail: 조회 1건 = D1 쓰기 3~5행. 하루 1.5만 뷰쯤에서 무료 한도(쓰기 10만/일)에 닿는다 → 그때는 표본 집계나 Analytics Engine 으로.
let STATS_READY = false;
const NO_CONTENT = () => new Response(null, { status: 204 });
const kstDay = (ago = 0) => new Date(Date.now() + 9 * 3600e3 - ago * 86400e3).toISOString().slice(0, 10);
async function statsReady(env) {
  if (STATS_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS stats (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, kind, key))");
  STATS_READY = true;
}

async function handleHit(request, env, url) {
  const ua = request.headers.get("user-agent") || "";
  if (request.method !== "POST" || !env.PUSH_DB || request.headers.get("origin") !== url.origin
      || /bot|crawl|spider|headless|lighthouse|preview/i.test(ua)) return NO_CONTENT();
  let b = {};
  try { b = JSON.parse(await request.text()); } catch (e) { return NO_CONTENT(); }
  if (b.c) {                                   // 띠 클릭(유튜브 구독·이어서 보기) — 이름표만 센다
    if (!/^[a-z0-9-]{1,30}$/.test(String(b.c))) return NO_CONTENT();
    await statsReady(env);
    await env.PUSH_DB.prepare("INSERT INTO stats (day, kind, key, n) VALUES (?, 'click', ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1").bind(kstDay(), String(b.c)).run();
    return NO_CONTENT();
  }
  let path = String(b.p || "");
  try { path = decodeURIComponent(path); } catch (e) {}
  path = path.split("?")[0].replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  if (!path.startsWith("/") || path.length > 120 || /[\s<>"']/.test(path)) return NO_CONTENT();
  let ref = String(b.r || "").toLowerCase();
  if (ref.length > 60 || !/^[a-z0-9.:-]*$/.test(ref)) ref = "";
  const plat = /PolitaltalApp/.test(ua) ? (/iPhone|iPad|iPod/.test(ua) ? "ios" : "android") : "web";
  await statsReady(env);
  const day = kstDay();
  const up = (kind, key) => env.PUSH_DB.prepare(
    "INSERT INTO stats (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1").bind(day, kind, key);
  const rows = [up("pv", ""), up("path", path), up("plat", plat)];
  if (ref !== url.host) rows.push(up("visit", ""), up("ref", ref || "(직접)"));
  await env.PUSH_DB.batch(rows);
  if (HOT_PATH.test(path)) await hotCount(env, request, day, path);
  return NO_CONTENT();
}

// ── 실시간 많이 찾는 정치인 (/hot) ───────────────────────────────────────
// 의원·지자체장 페이지를 본 사람 수(같은 사람=IP 해시는 하루 한 정치인에 1번)를 stats kind 'hot' 으로 센다. 원본 IP는 저장하지 않는다.
// 순위 = 오늘×2 + 어제, 화살표는 어제 기준 순위와 비교. 'hot' 기록이 모자라는 동안은 조회수(kind 'path')로 채운다.
// ponytail: IP를 바꿔 가며 누르면 순위를 올릴 수 있다 — 조작이 보이면 Turnstile 이나 앱·웹 가중치를 붙일 것
const HOT_PATH = /^\/(politician|local)\/[A-Za-z0-9]{4,12}$/;
let HOT_READY = false;
async function hotCount(env, request, day, path) {
  await pcReady(env);
  if (!HOT_READY) {
    await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS hot_seen (day TEXT NOT NULL, h TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY (day, h, path))");
    HOT_READY = true;
  }
  const h = await sha16(PC_SALT + day + (request.headers.get("cf-connecting-ip") || "local"));
  const r = await env.PUSH_DB.prepare("INSERT OR IGNORE INTO hot_seen (day, h, path) VALUES (?, ?, ?)").bind(day, h, path).run();
  if (r.meta.changes) await env.PUSH_DB.prepare(
    "INSERT INTO stats (day, kind, key, n) VALUES (?, 'hot', ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1").bind(day, path).run();
  if (Math.random() < 0.02) await env.PUSH_DB.prepare("DELETE FROM hot_seen WHERE day < ?").bind(kstDay(1)).run();
}

async function handleHot(env) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await statsReady(env);
  const rank = async (d0, d1) => {
    const q = (kind) => env.PUSH_DB.prepare(
      "SELECT key, SUM(CASE WHEN day = ? THEN 2 * n ELSE n END) AS s FROM stats WHERE kind = ? AND day IN (?, ?) " +
      "AND (key LIKE '/politician/%' OR key LIKE '/local/%') GROUP BY key ORDER BY s DESC LIMIT 10").bind(d0, kind, d0, d1).all().then((r) => r.results);
    const hot = await q("hot");
    if (hot.length >= 10) return hot.map((r) => r.key);
    const seen = new Set(hot.map((r) => r.key));
    return [...seen, ...(await q("path")).map((r) => r.key).filter((k) => !seen.has(k))].slice(0, 10);
  };
  const [now, prev] = await Promise.all([rank(kstDay(0), kstDay(1)), rank(kstDay(1), kstDay(2))]);
  const rows = now.map((path) => ({ path, was: prev.indexOf(path) + 1 }));   // was 0 = 새로 들어옴
  return new Response(JSON.stringify({ ok: true, rows }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
}

// 관리자 화면·자정 요약용: 최근 30일 일별 합계 + 최근 7일 인기 페이지·유입 경로·앱/웹 + 푸시 구독 기기 수
async function statsSummary(env) {
  await statsReady(env);
  const q = (sql, ...a) => env.PUSH_DB.prepare(sql).bind(...a).all().then((r) => r.results, () => []);
  const [daily, paths, refs, plats, push, wall, clicks, pc] = await Promise.all([
    q("SELECT day, kind, n FROM stats WHERE kind IN ('pv', 'visit') AND day >= ? ORDER BY day", kstDay(29)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'path' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 15", kstDay(6)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'ref' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 10", kstDay(6)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'plat' AND day >= ? GROUP BY key", kstDay(6)),
    q("SELECT platform AS key, COUNT(*) AS n FROM push_tokens GROUP BY platform"),
    q("SELECT status AS key, COUNT(*) AS n FROM wall GROUP BY status"),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'click' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 20", kstDay(6)),
    q("SELECT SUM(created_at > ?) AS fresh, SUM(status = 'visible' AND reports > 0) AS reported, SUM(status = 'hidden') AS hidden FROM pc", Date.now() - 86400e3),
  ]);
  return { ok: true, today: kstDay(), daily, paths, refs, plats, push, wall, clicks, pc: pc[0] || {} };
}

// ── 후원자의 벽 (/wall/*) ───────────────────────────────────────────────
// 후원한 사람이 표시 이름·한마디를 남긴다 → 운영자가 입금을 확인하고 승인해야 공개된다(사전 검수).
// 입금자명은 확인용이라 관리자에게만 보이고, 승인하는 순간 지운다.
// ponytail: 공개 목록 500명 상한, 대기 300건이 쌓이면 접수를 멈춘다(도배 방지). 넘어서면 페이지 나눔·속도 제한을.
let WALL_READY = false;
async function wallReady(env) {
  if (WALL_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS wall (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, msg TEXT NOT NULL DEFAULT '', payer TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'wait', created_at INTEGER NOT NULL, approved_at INTEGER NOT NULL DEFAULT 0)");
  WALL_READY = true;
}
const wallText = (v, max) => String(v || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const wallPublic = (env) => env.PUSH_DB.prepare(
  "SELECT name, msg, approved_at FROM wall WHERE status = 'ok' ORDER BY approved_at, id LIMIT 500").all()
  .then((r) => r.results.map((x, i) => ({ no: i + 1, name: x.name, msg: x.msg, day: new Date(x.approved_at + 9 * 3600e3).toISOString().slice(0, 10) })));

async function handleWall(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await wallReady(env);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/wall/list" && request.method === "GET") return pj({ ok: true, seats: await wallPublic(env) });
  if (path === "/wall/sign" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const name = wallText(b.name, 20), msg = wallText(b.msg, 100), payer = wallText(b.payer, 20);
    if (b.hp || !name || !payer) return pj({ ok: false, error: "invalid" }, 400);      // hp = 사람 눈에 안 보이는 칸(봇만 채운다)
    const { n } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM wall WHERE status = 'wait'").first();
    if (n >= 300) return pj({ ok: false, error: "busy" }, 429);
    await env.PUSH_DB.prepare("INSERT INTO wall (name, msg, payer, created_at) VALUES (?, ?, ?, ?)").bind(name, msg, payer, Date.now()).run();
    return pj({ ok: true });
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 정치인 한마디 (/pc/*) ───────────────────────────────────────────────
// 의원·지자체장 페이지 상단의 익명 댓글 + 답글(한 단계) + 공감. 올리면 바로 보이고(사후 검수), 서로 다른 3명이 신고하면 자동으로 숨는다.
// IP는 저장하지 않는다 — DB에만 있는 소금을 섞은 해시 앞 16자를 도배 방지·신고 중복 확인에만 쓴다.
// 관리자 화면에서 숨김·삭제하고, '댓글 받기'를 통째로 닫을 수 있다(선거 기간 등).
// ponytail: 금칙어는 단순 포함 검사라 우회할 수 있다 — 신고·관리자 숨김이 2차 방어. 도배가 늘면 Turnstile 을 붙일 것.
const PC_NICKS = ["관심시민", "데이터러버", "우리동네유권자", "팩트체커", "초보관찰자", "조용한관전러", "숫자로보는유권자", "동네지킴이"];
const PC_BAD = ["씨발", "시발", "씨바", "ㅅㅂ", "병신", "ㅂㅅ", "좆", "지랄", "개새끼", "썅", "닥쳐", "죽여", "죽인다", "살해", "테러",
  "미친놈", "미친년", "창녀", "걸레", "빨갱이", "토착왜구", "홍어", "틀딱"];
const PC_LINK = /https?:|www\.|\.(com|net|kr|io|me|co)\b|open\.kakao/i;
const PC_TARGET = /^(?:[pl]:[A-Za-z0-9]{4,12}|n:[a-f0-9]{16})$/;   // p:의원 코드 · l:지자체장 번호 · n:뉴스 헤드라인
let PC_READY = false, PC_SALT = "";
async function pcReady(env) {
  if (PC_READY) return;
  await env.PUSH_DB.batch([
    env.PUSH_DB.prepare("CREATE TABLE IF NOT EXISTS pc (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, nick TEXT NOT NULL, body TEXT NOT NULL, ip_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'visible', reports INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, parent INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0)"),
    env.PUSH_DB.prepare("CREATE INDEX IF NOT EXISTS pc_target ON pc (target, id)"),
    env.PUSH_DB.prepare("CREATE TABLE IF NOT EXISTS pc_likes (cid INTEGER NOT NULL, ip_hash TEXT NOT NULL, PRIMARY KEY (cid, ip_hash))"),
    env.PUSH_DB.prepare("CREATE TABLE IF NOT EXISTS pc_reports (cid INTEGER NOT NULL, ip_hash TEXT NOT NULL, PRIMARY KEY (cid, ip_hash))"),
    env.PUSH_DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
  ]);
  await env.PUSH_DB.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES ('pc_salt', ?)").bind(crypto.randomUUID() + crypto.randomUUID()).run();
  PC_SALT = (await env.PUSH_DB.prepare("SELECT v FROM kv WHERE k = 'pc_salt'").first()).v;
  PC_READY = true;
}
const sha16 = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))]
  .slice(0, 8).map((x) => x.toString(16).padStart(2, "0")).join("");
const pcOpen = async (env) => !(await env.PUSH_DB.prepare("SELECT v FROM kv WHERE k = 'pc_closed'").first());

async function handlePc(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await pcReady(env);
  const path = url.pathname.replace(/\/+$/, "");
  const who = await sha16(PC_SALT + (request.headers.get("cf-connecting-ip") || "local"));
  if (path === "/pc/recent" && request.method === "GET") {        // 홈 '방금 올라온 한마디' — 신고 없는 최근 7일 댓글 3개
    const { results } = await env.PUSH_DB.prepare(
      "SELECT target, nick, body FROM pc WHERE status = 'visible' AND parent = 0 AND reports = 0 AND target NOT LIKE 'n:%' AND created_at > ? ORDER BY id DESC LIMIT 3")
      .bind(Date.now() - 7 * 86400e3).all();
    return pj({ ok: true, rows: results });
  }
  if (path === "/pc/list" && request.method === "GET") {
    const t = url.searchParams.get("t") || "";
    if (!PC_TARGET.test(t)) return pj({ ok: false, error: "invalid" }, 400);
    // ponytail: 댓글·답글 합쳐 최근 300개만 내려보낸다 — 넘어서면 '이전 댓글 더 보기'(페이지 나눔)를 붙일 것
    const { results } = await env.PUSH_DB.prepare(
      "SELECT id, parent, nick, body, likes, created_at AS at, EXISTS(SELECT 1 FROM pc_likes l WHERE l.cid = pc.id AND l.ip_hash = ?) AS liked " +
      "FROM pc WHERE target = ? AND status = 'visible' ORDER BY id DESC LIMIT 300").bind(who, t).all();
    const { n } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM pc WHERE target = ? AND status = 'visible'").bind(t).first();
    return pj({ ok: true, open: await pcOpen(env), total: n, rows: results });
  }
  if (request.method !== "POST" || request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
  const b = await request.json().catch(() => ({}));

  if (path === "/pc/post") {
    const t = String(b.t || "");
    const body = String(b.body || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim();
    const parent = b.parent == null ? 0 : b.parent;
    if (b.hp || !PC_TARGET.test(t) || body.length < 2 || body.length > 300 || !Number.isInteger(parent) || parent < 0) return pj({ ok: false, error: "invalid" }, 400);
    if (!(await pcOpen(env))) return pj({ ok: false, error: "closed" }, 403);
    if (t.startsWith("n:")) { await newsReady(env); if (!(await env.PUSH_DB.prepare("SELECT id FROM news WHERE id = ?").bind(t.slice(2)).first())) return pj({ ok: false, error: "invalid" }, 400); }
    if (parent && !(await env.PUSH_DB.prepare("SELECT id FROM pc WHERE id = ? AND target = ? AND parent = 0 AND status = 'visible'").bind(parent, t).first()))
      return pj({ ok: false, error: "invalid" }, 400);
    if (PC_LINK.test(body)) return pj({ ok: false, error: "link" }, 400);
    const flat = body.replace(/[^가-힣ㄱ-ㅎa-z]/gi, "");                        // 띄어쓰기·기호로 쪼갠 욕설도 잡는다
    if (PC_BAD.some((w) => flat.includes(w))) return pj({ ok: false, error: "bad" }, 400);
    const now = Date.now(), day = now - 86400e3;
    const mine = await env.PUSH_DB.prepare("SELECT MAX(created_at) AS last, COUNT(*) AS n FROM pc WHERE ip_hash = ? AND created_at > ?").bind(who, day).first();
    const all = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM pc WHERE created_at > ?").bind(day).first();
    if ((mine.last && now - mine.last < 30000) || mine.n >= 20 || all.n >= 3000) return pj({ ok: false, error: "slow" }, 429);
    const h = await sha16(who + t);                                           // 같은 페이지에서는 같은 별명, 다른 페이지와는 이어지지 않게
    const nick = PC_NICKS[parseInt(h.slice(0, 6), 16) % PC_NICKS.length] + " " + h.slice(6, 9);
    const r = await env.PUSH_DB.prepare("INSERT INTO pc (target, nick, body, ip_hash, created_at, parent) VALUES (?, ?, ?, ?, ?, ?)").bind(t, nick, body, who, now, parent).run();
    return pj({ ok: true, row: { id: r.meta.last_row_id, parent, nick, body, likes: 0, liked: 0, at: now } });
  }
  if (path === "/pc/like" && Number.isInteger(b.id)) {                         // 한 사람 한 번 — 다시 누르면 취소
    if (!(await env.PUSH_DB.prepare("SELECT id FROM pc WHERE id = ? AND status = 'visible'").bind(b.id).first())) return pj({ ok: false, error: "invalid" }, 400);
    const ins = await env.PUSH_DB.prepare("INSERT OR IGNORE INTO pc_likes (cid, ip_hash) VALUES (?, ?)").bind(b.id, who).run();
    const liked = ins.meta.changes === 1;
    if (!liked) await env.PUSH_DB.prepare("DELETE FROM pc_likes WHERE cid = ? AND ip_hash = ?").bind(b.id, who).run();
    const row = await env.PUSH_DB.prepare("UPDATE pc SET likes = MAX(0, likes + ?) WHERE id = ? RETURNING likes").bind(liked ? 1 : -1, b.id).first();
    return pj({ ok: true, liked, likes: row.likes });
  }
  if (path === "/pc/report" && Number.isInteger(b.id)) {
    const ins = await env.PUSH_DB.prepare("INSERT OR IGNORE INTO pc_reports (cid, ip_hash) VALUES (?, ?)").bind(b.id, who).run();
    if (ins.meta.changes) await env.PUSH_DB.prepare(
      "UPDATE pc SET reports = reports + 1, status = CASE WHEN reports + 1 >= 3 THEN 'hidden' ELSE status END WHERE id = ?").bind(b.id).run();
    return pj({ ok: true });
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 후원·지출 장부 (/ledger/*) ───────────────────────────────────────────
// 관리자(admin.html)가 들어온 후원·나간 지출을 적는다. 공개되는 것은 /ledger/summary 의
// '지난 달까지' 월 합계·기부 영수증 링크뿐 — 메모(입금자명 등)는 관리자에게만 나간다.
// 인증: 긴 무작위 키의 SHA-256만 둔다(공개 저장소라 키는 못 둠). 원본 = 운영자 맥 ~/.config/politaltal/ledger-admin.key
const LEDGER_KEY_SHA256 = "6ebe63593c6e5e84afff3590aabb6bfa81172eee8ba17798da13ecace4c052e0";
const LEDGER_CH = { in: ["kakaopay", "bank", "card", "appstore", "play", "etc"], out: ["server", "domain", "pgfee", "charity", "etc"] };
let LEDGER_READY = false;

async function ledgerAdminOk(request) {
  const key = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  if (key.length < 32) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("") === LEDGER_KEY_SHA256;
}

// 입력 검증 — 통과하면 저장할 행, 아니면 null
function ledgerRow(b) {
  const kind = String(b.kind || ""), day = String(b.day || ""), channel = String(b.channel || "");
  const amount = Number(b.amount), memo = String(b.memo || "").trim(), link = String(b.link || "").trim();
  if (!LEDGER_CH[kind] || !LEDGER_CH[kind].includes(channel)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || isNaN(Date.parse(day))) return null;
  if (!Number.isInteger(amount) || amount < 1 || amount > 1e9) return null;
  if (memo.length > 200 || link.length > 300) return null;
  if (link && (kind !== "out" || !/^https:\/\/[^\s"'<>]+$/.test(link))) return null;   // 공개 페이지에 href로 나감
  return { kind, day, amount, channel, memo, link };
}

async function ledgerReady(env) {
  if (LEDGER_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, day TEXT NOT NULL, amount INTEGER NOT NULL, channel TEXT NOT NULL, memo TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)");
  LEDGER_READY = true;
}

async function handleLedger(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await ledgerReady(env);
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/ledger/summary" && request.method === "GET") {
    const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7);   // 한국 시각 기준 이번 달 — 끝난 달만 공개
    const { results: rows } = await env.PUSH_DB.prepare(
      "SELECT substr(day, 1, 7) AS month, kind, channel, SUM(amount) AS total FROM ledger " +
      "WHERE substr(day, 1, 7) < ? GROUP BY month, kind, channel ORDER BY month").bind(month).all();
    const { results: charity } = await env.PUSH_DB.prepare(
      "SELECT day, amount, link FROM ledger WHERE kind = 'out' AND channel = 'charity' AND substr(day, 1, 7) < ? ORDER BY day DESC").bind(month).all();
    return pj({ ok: true, rows, charity });
  }

  if (path === "/ledger/admin" && request.method === "POST") {
    if (!(await ledgerAdminOk(request))) return pj({ ok: false, error: "unauthorized" }, 401);
    const body = await request.json().catch(() => ({}));
    if (body.op === "list") {
      // ponytail: 최근 2000건 상한 — 넘어가면 월 단위 조회로
      const { results } = await env.PUSH_DB.prepare("SELECT id, kind, day, amount, channel, memo, link FROM ledger ORDER BY day DESC, id DESC LIMIT 2000").all();
      return pj({ ok: true, rows: results });
    }
    if (body.op === "add") {
      const r = ledgerRow(body);
      if (!r) return pj({ ok: false, error: "invalid" }, 400);
      await env.PUSH_DB.prepare("INSERT INTO ledger (kind, day, amount, channel, memo, link, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(r.kind, r.day, r.amount, r.channel, r.memo, r.link, Date.now()).run();
      return pj({ ok: true });
    }
    if (body.op === "delete" && Number.isInteger(body.id)) {
      await env.PUSH_DB.prepare("DELETE FROM ledger WHERE id = ?").bind(body.id).run();
      return pj({ ok: true });
    }
    if (body.op === "stats") return pj(await statsSummary(env));
    if (body.op === "pc_list") {
      await pcReady(env);
      const { results } = await env.PUSH_DB.prepare(
        "SELECT id, target, parent, nick, body, status, reports, likes, created_at FROM pc ORDER BY (status = 'visible' AND reports > 0) DESC, id DESC LIMIT 200").all();
      return pj({ ok: true, open: await pcOpen(env), rows: results });
    }
    if (body.op === "pc_act" && Number.isInteger(body.id) && ["hide", "show", "delete"].includes(body.action)) {
      await pcReady(env);
      const id = body.id, db = env.PUSH_DB;
      if (body.action === "hide") await db.prepare("UPDATE pc SET status = 'hidden' WHERE id = ?").bind(id).run();
      else if (body.action === "show") await db.batch([                      // 다시 공개하면 신고 기록도 비운다(곧바로 또 숨지 않게)
        db.prepare("DELETE FROM pc_reports WHERE cid = ?").bind(id),
        db.prepare("UPDATE pc SET status = 'visible', reports = 0 WHERE id = ?").bind(id)]);
      else await db.batch([                                                  // 삭제: 달린 답글과 공감·신고 기록까지 함께
        db.prepare("DELETE FROM pc_likes WHERE cid IN (SELECT id FROM pc WHERE id = ? OR parent = ?)").bind(id, id),
        db.prepare("DELETE FROM pc_reports WHERE cid IN (SELECT id FROM pc WHERE id = ? OR parent = ?)").bind(id, id),
        db.prepare("DELETE FROM pc WHERE id = ? OR parent = ?").bind(id, id)]);
      return pj({ ok: true });
    }
    if (body.op === "pc_open" && typeof body.open === "boolean") {
      await pcReady(env);
      await (body.open ? env.PUSH_DB.prepare("DELETE FROM kv WHERE k = 'pc_closed'")
                       : env.PUSH_DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('pc_closed', '1')")).run();
      return pj({ ok: true, open: body.open });
    }
    if (body.op === "wall_list") {
      await wallReady(env);
      const { results } = await env.PUSH_DB.prepare("SELECT id, name, msg, payer, status, created_at FROM wall ORDER BY status DESC, id DESC LIMIT 800").all();
      return pj({ ok: true, rows: results });
    }
    if ((body.op === "wall_ok" || body.op === "wall_del") && Number.isInteger(body.id)) {
      await wallReady(env);
      await (body.op === "wall_del"
        ? env.PUSH_DB.prepare("DELETE FROM wall WHERE id = ?").bind(body.id)
        : env.PUSH_DB.prepare("UPDATE wall SET status = 'ok', payer = '', approved_at = ? WHERE id = ? AND status = 'wait'").bind(Date.now(), body.id)).run();
      return pj({ ok: true });
    }
    // 집계를 시작하기 전 날짜를 Cloudflare 수치로 채울 때만 쓴다 — 지난 날짜, 그리고 비어 있는 날만
    if (body.op === "stats_set" && /^\d{4}-\d{2}-\d{2}$/.test(String(body.day)) && body.day < kstDay()
        && Number.isInteger(body.pv) && Number.isInteger(body.visit) && body.pv >= 0 && body.visit >= 0) {
      await statsReady(env);
      await env.PUSH_DB.batch(["pv", "visit"].map((k) => env.PUSH_DB.prepare(
        "INSERT OR IGNORE INTO stats (day, kind, key, n) VALUES (?, ?, '', ?)").bind(body.day, k, body[k])));
      return pj({ ok: true });
    }
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 카드 후원 (/pay/*) ──────────────────────────────────────────────────
// 페이앱 리셀러 본계정 키 + subuserid(코코요 판매점 cocoyo2nd)로 결제창을 만든다 — 매출은 코코요 판매점으로 잡힌다.
// 키는 워커 비밀값(PAYAPP_USERID·LINKKEY·LINKVAL·SUBUSERID)에만 있다. 없으면 /pay/on 이 false → 후원 페이지가 카드 칸을 숨긴다.
// 결제 완료 통보(feedback)가 오면 장부에 '카드' 후원으로 자동 기록, 승인 취소가 오면 그 기록을 지운다.
// 휴대폰 번호는 페이앱이 요구해서 그대로 넘길 뿐 여기 저장하지 않는다.
const PAYAPP_API = "https://api.payapp.kr/oapi/apiLoad.html";
let PAY_READY = false;
const payOn = (env) => !!(env.PAYAPP_USERID && env.PAYAPP_LINKKEY && env.PAYAPP_LINKVAL);

async function payReady(env) {
  if (PAY_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS pay (code TEXT PRIMARY KEY, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'wait', mul_no TEXT NOT NULL DEFAULT '', ledger_id INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, paid_at INTEGER NOT NULL DEFAULT 0)");
  await ledgerReady(env);
  PAY_READY = true;
}

async function handlePay(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/pay/on") return pj({ ok: true, on: !!env.PUSH_DB && payOn(env) });
  if (!env.PUSH_DB || !payOn(env)) return pj({ ok: false, error: "off" }, 503);
  await payReady(env);
  const db = env.PUSH_DB;

  if (path === "/pay/card" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const amount = Number(b.amount), phone = String(b.phone || "").replace(/\D/g, "");
    if (!Number.isInteger(amount) || amount < 1000 || amount > 1000000 || !/^01[016789]\d{7,8}$/.test(phone))
      return pj({ ok: false, error: "invalid" }, 400);
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM pay WHERE status = 'wait' AND created_at > ?").bind(Date.now() - 86400e3).first();
    if (n >= 300) return pj({ ok: false, error: "busy" }, 429);          // 결제창 남발 방지(하루 300건)
    const code = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x & 31]).join("");
    await db.prepare("INSERT INTO pay (code, amount, created_at) VALUES (?, ?, ?)").bind(code, amount, Date.now()).run();
    const form = new URLSearchParams({
      cmd: "payrequest", userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY,
      goodname: "정치탈탈 운영 후원", price: String(amount), recvphone: phone,
      smsuse: "n", openpaytype: "card", reqaddr: "0", var1: code,
      feedbackurl: `${url.origin}/pay/feedback`,
      returnurl: `${url.origin}/donate.html?paid=${code}#sign`,
    });
    if (env.PAYAPP_SUBUSERID) form.set("subuserid", env.PAYAPP_SUBUSERID);
    const res = await fetch(PAYAPP_API, { method: "POST", body: form,
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8", accept: "application/json" } });
    const text = await res.text();
    let d; try { d = JSON.parse(text); } catch { d = Object.fromEntries(new URLSearchParams(text)); }   // 응답이 JSON·쿼리문자열 둘 다 온다
    if (String(d.state) !== "1" || !d.payurl) {
      console.log("payapp payrequest fail", text.slice(0, 300));
      await db.prepare("DELETE FROM pay WHERE code = ?").bind(code).run();
      return pj({ ok: false, error: "pg" }, 502);
    }
    await db.prepare("UPDATE pay SET mul_no = ? WHERE code = ?").bind(String(d.mul_no || ""), code).run();
    return pj({ ok: true, payurl: d.payurl });
  }

  if (path === "/pay/feedback" && request.method === "POST") {
    const f = new URLSearchParams(await request.text());
    if (!f.get("linkval") || f.get("linkval") !== env.PAYAPP_LINKVAL) return new Response("AUTH_FAIL", { status: 401 });
    const code = String(f.get("var1") || ""), state = String(f.get("pay_state") || ""), price = Number(f.get("price"));
    if (state === "4") {                                                  // 결제 완료 — 금액이 만든 값과 같을 때만, 한 번만
      const r = await db.prepare("UPDATE pay SET status = 'paid', paid_at = ?, mul_no = ? WHERE code = ? AND status = 'wait' AND amount = ?")
        .bind(Date.now(), String(f.get("mul_no") || ""), code, price).run();
      if (r.meta.changes === 1) {
        const ins = await db.prepare("INSERT INTO ledger (kind, day, amount, channel, memo, link, created_at) VALUES ('in', ?, ?, 'card', ?, '', ?)")
          .bind(kstDay(), price, `카드 ${code} · 수수료 빼기 전`, Date.now()).run();
        await db.prepare("UPDATE pay SET ledger_id = ? WHERE code = ?").bind(ins.meta.last_row_id, code).run();
      }
    } else if (state === "9" || state === "64") {                         // 승인 취소 — 장부에서도 뺀다
      const row = await db.prepare("SELECT ledger_id FROM pay WHERE code = ? AND status = 'paid'").bind(code).first();
      if (row) await db.batch([
        db.prepare("UPDATE pay SET status = 'cancel' WHERE code = ?").bind(code),
        db.prepare("DELETE FROM ledger WHERE id = ?").bind(row.ledger_id),
      ]);
    }
    return new Response("SUCCESS", { headers: { "content-type": "text/plain" } });   // 페이앱은 SUCCESS 를 기대한다
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 좌우 뉴스 (/news/*) ───────────────────────────────────────────────────
// 진보·보수 성향 매체(일반적 분류) 정치면 RSS 헤드라인을 20분마다 모은다(크론). 제목·링크·시각만 저장 — 기사 본문은 저장·표시하지 않는다(저작권).
// '같은 사건, 다른 제목' = 양쪽 헤드라인의 핵심 낱말이 3개 이상 겹치면서 표현은 다른 쌍.
// ponytail: 낱말 겹침으로만 짝짓는다 — 엉뚱한 짝이 보이면 NEWS_STOP 에 흔한 낱말을 더 넣을 것
const NEWS_FEEDS = [
  { side: "L", src: "한겨레", url: "https://www.hani.co.kr/rss/politics/" },
  { side: "L", src: "경향신문", url: "https://www.khan.co.kr/rss/rssdata/politic_news.xml" },
  { side: "L", src: "오마이뉴스", url: "http://rss.ohmynews.com/rss/politics.xml" },
  { side: "R", src: "조선일보", url: "https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml" },
  { side: "R", src: "동아일보", url: "https://rss.donga.com/politics.xml" },
  { side: "R", src: "데일리안", url: "https://www.dailian.co.kr/rss/politics" },
];
const NEWS_STOP = new Set(("정부 국회 대통령 민주당 민주 국민의힘 국힘 여야 여당 야당 의원 대표 장관 발언 논란 속보 단독 종합 이재명 대통령실 " +
  "정치 위원장 사과 비판 공방 국감 국정감사 오늘 내일 관련 추진 요구 지적 강조 우려 입장 반발 비난 사진 영상 포토 與 野 李").split(" "));
let NEWS_READY = false;
async function newsReady(env) {
  if (NEWS_READY) return;
  await env.PUSH_DB.batch([
    env.PUSH_DB.prepare("CREATE TABLE IF NOT EXISTS news (id TEXT PRIMARY KEY, side TEXT NOT NULL, src TEXT NOT NULL, title TEXT NOT NULL, link TEXT NOT NULL, at INTEGER NOT NULL, seen INTEGER NOT NULL)"),
    env.PUSH_DB.prepare("CREATE INDEX IF NOT EXISTS news_at ON news (side, at)"),
  ]);
  NEWS_READY = true;
}

const newsText = (t) => t.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&middot;/g, "·").replace(/&hellip;/g, "…").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

async function newsFeed(f) {
  // 피드 앞쪽 100KB만 읽는다(최신 기사가 앞에 있고, 큰 피드를 통째로 파싱하면 무료 요금제 CPU 한도에 걸린다)
  const res = await fetch(f.url, { headers: { "user-agent": "Mozilla/5.0 (politaltal.com news)" }, cf: { cacheTtl: 300 } });
  if (!res.ok || !res.body) return [];
  const reader = res.body.getReader(), parts = [];
  let n = 0;
  while (n < 100000) { const { done, value } = await reader.read(); if (done) break; parts.push(value); n += value.length; }
  reader.cancel().catch(() => {});
  const buf = new Uint8Array(n); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  const xml = new TextDecoder().decode(buf), out = [], now = Date.now();
  for (const [i, it] of (xml.match(/<item[\s>][\s\S]*?<\/item>/g) || []).slice(0, 15).entries()) {
    const title = newsText((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "");
    let link = newsText((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    if (!title || !/^https?:\/\//.test(link)) continue;
    link = link.replace(/([?&])utm_[^&]*/g, "$1").replace(/[?&]+$/, "").replace(/^http:\/\//, "https://");
    const d = Date.parse(newsText((it.match(/<(?:pubDate|dc:date)>([\s\S]*?)<\/(?:pubDate|dc:date)>/) || [])[1] || ""));
    // 시각이 없는 피드(한겨레)는 피드 순서(최신이 앞)대로 1분씩 당겨 둔다 — 처음 모을 때 한 매체가 맨 위를 다 차지하지 않게
    out.push({ id: await sha16(link), side: f.side, src: f.src, title: title.slice(0, 200), link, at: d && d <= now ? d : now - i * 60e3 });
  }
  return out;
}

async function newsFetch(env) {
  await newsReady(env);
  const all = (await Promise.all(NEWS_FEEDS.map((f) => newsFeed(f).catch(() => [])))).flat(), now = Date.now();
  const db = env.PUSH_DB;
  const stmts = all.map((r) => db.prepare("INSERT OR IGNORE INTO news (id, side, src, title, link, at, seen) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(r.id, r.side, r.src, r.title, r.link, r.at, now));
  stmts.push(db.prepare("DELETE FROM news WHERE seen < ? AND id NOT IN (SELECT substr(target, 3) FROM pc WHERE target LIKE 'n:%')").bind(now - 7 * 86400e3));
  await pcReady(env);
  await db.batch(stmts);
  await db.prepare("INSERT INTO kv (k, v) VALUES ('news_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(now)).run();
  return all.length;
}

function newsToks(s) {
  const out = new Set();
  for (let w of s.replace(/[‘’“”'"…·,.!?()\[\]<>|/~\-]/g, " ").split(/\s+/)) {
    if (w.length > 2) w = w.replace(/(으로|에서|까지|부터|은|는|이|가|을|를|에|의|도|로|과|와|만|께|서)$/, "");
    if (w.length >= 2 && !NEWS_STOP.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return out;
}

// 같은 사건을 다르게 쓴 쌍 — 겹치는 낱말이 많을수록, 표현이 다를수록 점수가 높다. 한 기사는 한 번만 쓴다.
function newsPairs(L, R, k) {
  const c = [];
  for (const a of L) { const ta = newsToks(a.title);
    for (const b of R) { const tb = newsToks(b.title); let sh = 0; for (const w of ta) if (tb.has(w)) sh++;
      if (sh >= 3) c.push({ a, b, score: sh * (1 - sh / (ta.size + tb.size - sh)) ** 2 }); } }
  c.sort((x, y) => y.score - x.score);
  const used = new Set(), out = [];
  for (const p of c) { if (out.length >= k) break; if (used.has(p.a.id) || used.has(p.b.id)) continue;
    used.add(p.a.id); used.add(p.b.id); out.push({ l: p.a, r: p.b }); }
  return out;
}

async function handleNews(request, env, url, ctx) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await newsReady(env); await pcReady(env);
  const db = env.PUSH_DB, path = url.pathname.replace(/\/+$/, "");
  const last = await db.prepare("SELECT v FROM kv WHERE k = 'news_at'").first();
  if (!last || Date.now() - +last.v > 40 * 60e3) {                      // 크론이 멈췄거나 첫 실행 — 이번 요청에서 한 번 채운다
    if (!last) await newsFetch(env); else ctx.waitUntil(newsFetch(env));
  }
  const cnt = "(SELECT COUNT(*) FROM pc WHERE pc.target = 'n:' || news.id AND pc.status = 'visible') AS c";
  const side = (sd, n) => db.prepare(`SELECT id, src, title, link, at, ${cnt} FROM news WHERE side = ? AND at > ? ORDER BY at DESC LIMIT ?`)
    .bind(sd, Date.now() - 36 * 3600e3, n).all().then((r) => r.results);
  const cache = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" };
  if (path === "/news/list") {
    const n = Math.min(Math.max(+url.searchParams.get("n") || 10, 1), 30);
    const [L, R] = await Promise.all([side("L", 40), side("R", 40)]);
    const pairs = newsPairs(L.filter((r) => r.at > Date.now() - 24 * 3600e3), R.filter((r) => r.at > Date.now() - 24 * 3600e3), 3);
    // 한 매체가 칸을 다 차지하지 않게 매체별 최신순으로 번갈아 놓는다
    const mix = (rows) => { const by = {}; rows.forEach((r) => (by[r.src] = by[r.src] || []).push(r)); const q = Object.values(by), out = [];
      for (let i = 0; out.length < rows.length; i++) q.forEach((x) => { if (x[i]) out.push(x[i]); }); return out; };
    return new Response(JSON.stringify({ ok: true, L: mix(L).slice(0, n), R: mix(R).slice(0, n), pairs }), { headers: cache });
  }
  if (path === "/news/item") {
    const id = url.searchParams.get("id") || "";
    if (!/^[a-f0-9]{16}$/.test(id)) return pj({ ok: false, error: "invalid" }, 400);
    const item = await db.prepare(`SELECT id, side, src, title, link, at, ${cnt} FROM news WHERE id = ?`).bind(id).first();
    if (!item) return pj({ ok: false, error: "not found" }, 404);
    const other = await side(item.side === "L" ? "R" : "L", 8);
    return new Response(JSON.stringify({ ok: true, item, other }), { headers: cache });
  }
  return pj({ ok: false, error: "not found" }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    if (env.PUSH_DB) ctx.waitUntil(newsFetch(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/news/")) {
      try { return await handleNews(request, env, url, ctx); } catch (e) { return pj({ ok: false, error: "server" }, 500); }
    }
    if (url.pathname === "/t") return handleHit(request, env, url).catch(NO_CONTENT);
    if (url.pathname === "/hot") return handleHot(env).catch(() => pj({ ok: false, error: "server" }, 500));
    const api = url.pathname.startsWith("/push/") ? handlePush : url.pathname.startsWith("/ledger/") ? handleLedger
      : url.pathname.startsWith("/wall/") ? handleWall : url.pathname.startsWith("/pc/") ? handlePc
      : url.pathname.startsWith("/pay/") ? handlePay : null;
    if (api) {
      try { return await api(request, env, url); }
      catch (e) { return pj({ ok: false, error: "server" }, 500); }
    }
    const mt = url.pathname.match(/^\/bills\/([^\/]+?)(?:\.html)?\/?$/);
    if (mt) {
      try {
        const no = decodeURIComponent(mt[1]);
        const C = await load(env, url.origin);
        const html = renderBill(no, C);
        if (html) {
          return new Response(html, {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "public, max-age=0, must-revalidate",
            },
          });
        }
      } catch (e) {
        // 렌더 실패 → 정적 자산으로 폴백(1단계는 기존 파일이 있어 안전)
      }
    }
    return env.ASSETS.fetch(request);
  },
};
