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
  return NO_CONTENT();
}

// 관리자 화면·자정 요약용: 최근 30일 일별 합계 + 최근 7일 인기 페이지·유입 경로·앱/웹 + 푸시 구독 기기 수
async function statsSummary(env) {
  await statsReady(env);
  const q = (sql, ...a) => env.PUSH_DB.prepare(sql).bind(...a).all().then((r) => r.results, () => []);
  const [daily, paths, refs, plats, push, wall, clicks] = await Promise.all([
    q("SELECT day, kind, n FROM stats WHERE kind IN ('pv', 'visit') AND day >= ? ORDER BY day", kstDay(29)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'path' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 15", kstDay(6)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'ref' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 10", kstDay(6)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'plat' AND day >= ? GROUP BY key", kstDay(6)),
    q("SELECT platform AS key, COUNT(*) AS n FROM push_tokens GROUP BY platform"),
    q("SELECT status AS key, COUNT(*) AS n FROM wall GROUP BY status"),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'click' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 20", kstDay(6)),
  ]);
  return { ok: true, today: kstDay(), daily, paths, refs, plats, push, wall, clicks };
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

// ── 후원·지출 장부 (/ledger/*) ───────────────────────────────────────────
// 관리자(admin.html)가 들어온 후원·나간 지출을 적는다. 공개되는 것은 /ledger/summary 의
// '지난 달까지' 월 합계·기부 영수증 링크뿐 — 메모(입금자명 등)는 관리자에게만 나간다.
// 인증: 긴 무작위 키의 SHA-256만 둔다(공개 저장소라 키는 못 둠). 원본 = 운영자 맥 ~/.config/politaltal/ledger-admin.key
const LEDGER_KEY_SHA256 = "6ebe63593c6e5e84afff3590aabb6bfa81172eee8ba17798da13ecace4c052e0";
const LEDGER_CH = { in: ["kakaopay", "bank", "appstore", "play", "etc"], out: ["server", "domain", "charity", "etc"] };
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

async function handleLedger(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  if (!LEDGER_READY) {
    await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, day TEXT NOT NULL, amount INTEGER NOT NULL, channel TEXT NOT NULL, memo TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)");
    LEDGER_READY = true;
  }
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/t") return handleHit(request, env, url).catch(NO_CONTENT);
    const api = url.pathname.startsWith("/push/") ? handlePush : url.pathname.startsWith("/ledger/") ? handleLedger
      : url.pathname.startsWith("/wall/") ? handleWall : null;
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
