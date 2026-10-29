import Anthropic from "@anthropic-ai/sdk";   // 의원실 AI 답글 초안·민심 요약(handleOfc2)

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
// ── 앱 인앱결제 검증 ────────────────────────────────────────────────
// 애플: StoreKit 2 거래 JWS(x5c 3장) — 루트가 Apple Root CA G3 인지(지문), 중간·잎 인증서 서명이 이어지는지, 잎에 애플 '영수증 서명' OID 가 있는지,
//       그 잎 키로 JWS 서명이 맞는지 확인한다(개발자 인증서로 위조한 JWS 를 막으려면 OID 검사가 필수).
const APPLE_ROOT_G3_SHA256 = "63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179";
const b64std = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, "0")).join("");
const has = (u8, seq) => { outer: for (let i = 0; i <= u8.length - seq.length; i++) { for (let j = 0; j < seq.length; j++) if (u8[i + j] !== seq[j]) continue outer; return true; } return false; };
function asn(buf, pos) {                                   // DER 한 칸: {tag, hdr(시작), start(내용), end}
  let len = buf[pos + 1], p = pos + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + buf[p++]; }
  return { tag: buf[pos], hdr: pos, start: p, end: p + len };
}
const kids = (buf, node) => { const out = []; for (let p = node.start; p < node.end;) { const c = asn(buf, p); out.push(c); p = c.end; } return out; };
const OID_P256 = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07], OID_P384 = [0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22];
const OID_SHA384 = [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03];
const OID_APPLE_RECEIPT_LEAF = [0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01];   // 1.2.840.113635.100.6.11.1
function certParts(der) {
  const cert = asn(der, 0), [tbs, alg, sig] = kids(der, cert), t = kids(der, tbs);
  const spki = t[t[0].tag === 0xa0 ? 6 : 5];
  const spkiBytes = der.slice(spki.hdr, spki.end);
  return { tbs: der.slice(tbs.hdr, tbs.end), hash: has(der.slice(alg.hdr, alg.end), OID_SHA384) ? "SHA-384" : "SHA-256",
           sig: der.slice(sig.start + 1, sig.end), spki: spkiBytes, curve: has(spkiBytes, OID_P384) ? "P-384" : has(spkiBytes, OID_P256) ? "P-256" : "" };
}
function rawSig(derSig, size) {                            // ECDSA-Sig-Value(DER) → r‖s (WebCrypto 형식)
  const seq = asn(derSig, 0), [r, s] = kids(derSig, seq), out = new Uint8Array(size * 2);
  const put = (n, off) => { let v = derSig.slice(n.start, n.end); while (v.length > size && v[0] === 0) v = v.slice(1); out.set(v, off + size - v.length); };
  put(r, 0); put(s, size); return out;
}
const ecKey = (spki, curve) => crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: curve }, false, ["verify"]);
async function signedBy(child, parent) {
  const key = await ecKey(parent.spki, parent.curve);
  return crypto.subtle.verify({ name: "ECDSA", hash: child.hash }, key, rawSig(child.sig, parent.curve === "P-384" ? 48 : 32), child.tbs);
}
async function verifyAppleJws(jws, rootSha = APPLE_ROOT_G3_SHA256) {
  const [h, p, s] = String(jws || "").split(".");
  if (!s) return null;
  const head = JSON.parse(new TextDecoder().decode(b64u(h)));
  if (head.alg !== "ES256" || !Array.isArray(head.x5c) || head.x5c.length !== 3) return null;
  const ders = head.x5c.map(b64std);
  if (hex(new Uint8Array(await crypto.subtle.digest("SHA-256", ders[2]))) !== rootSha) return null;
  const [leaf, mid, root] = ders.map(certParts);
  if (!has(ders[0], OID_APPLE_RECEIPT_LEAF) || leaf.curve !== "P-256") return null;
  if (!(await signedBy(mid, root)) || !(await signedBy(leaf, mid))) return null;
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, await ecKey(leaf.spki, "P-256"), b64u(s), new TextEncoder().encode(h + "." + p));
  return ok ? JSON.parse(new TextDecoder().decode(b64u(p))) : null;
}

// 구글: 구매 토큰을 Play 개발자 API(purchases.products.get)로 확인. 서비스 계정 JSON = 비밀값 PLAY_SA(대표가 등록).
// 돌려줌: {sandbox} 확인됨 · false 가짜 토큰 · null 확인 못 함(키 없음·권한 없음 — 이때는 'unverified'로 적고 화력은 준다).
// ponytail: PLAY_SA 없으면 안드로이드 결제는 검증 없이 받는다 — 키를 등록하면 바로 검증으로 바뀐다.
async function verifyGoogle(env, productId, token) {
  if (!env.PLAY_SA) return null;
  try {
    const sa = JSON.parse(env.PLAY_SA), now = Math.floor(Date.now() / 1000);
    const enc = (u8) => btoa(String.fromCharCode(...u8)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const te = (o) => enc(new TextEncoder().encode(JSON.stringify(o)));
    const unsigned = te({ alg: "RS256", typ: "JWT" }) + "." + te({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
    const key = await crypto.subtle.importKey("pkcs8", b64std(sa.private_key.replace(/-----[^-]+-----|\s/g, "")), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const jwt = unsigned + "." + enc(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))));
    const t = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST",
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) })).json();
    if (!t.access_token) return null;
    const r = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.politaltal/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`,
      { headers: { authorization: "Bearer " + t.access_token } });
    if (r.status === 401 || r.status === 403) return null;
    if (r.status !== 200) return false;
    const j = await r.json();
    return j.purchaseState === 0 ? { sandbox: j.purchaseType === 0 } : false;
  } catch (e) { return null; }
}
// 앱 상품 → [가격(원, 스토어 수수료 빼기 전), 화력]. 화력 지원 3종 + 응원 3종(응원도 내 성향 화력 +100 — 웹 후원과 같게)
const IAP_ITEMS = {
  "com.politaltal.fire.small": [1000, 100], "com.politaltal.fire.medium": [5000, 600], "com.politaltal.fire.large": [10000, 1500],
  "com.politaltal.support.small": [5000, 100], "com.politaltal.support.medium": [10000, 100], "com.politaltal.support.large": [30000, 100],
};

// ── 정치 전장 (/war) ─────────────────────────────────────────────────
// 파랑·하양(중립)·빨강 진영의 '오늘의 화력' = 참여 점수. 여론조사가 아니다(같은 사람이 여러 번 참여, 표본 없음 — 화면에도 그렇게 쓴다).
// b=진보 성향(파랑) · w=중도(하양) · r=보수 성향(빨강). 정치인은 정당으로 편을 매기지 않는다 — 고른 사람의 성향에만 쌓인다.
// 편 고르기 1 · 응원 1 · 팩트 폭탄 1(의원마다 하루 한 번) · 청기홍기 점수(한 판 30점, 하루 10판) · 댓글 2 · 후원 승인 100 · 화력 상점(유료).
// 중복은 hot_seen(하루·IP 해시)으로 막는다. ponytail: IP를 바꿔 가며 누르면 올릴 수 있다 — 조작이 보이면 Turnstile.
const WAR_T = /^[bwr]$/;
async function warAdd(env, team, n, day = kstDay()) {
  await statsReady(env);
  await env.PUSH_DB.prepare("INSERT INTO stats (day, kind, key, n) VALUES (?, 'war', ?, ?) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + ?")
    .bind(day, team, n, n).run();
}
// 이 기기(브라우저 uid) 누적 — 내 표(하루 한 번 출석 투표한 날 수)·내가 보탠 화력. 이름·연락처와 묶지 않는다.
let WAR_ME_READY = false;
async function warMe(env, uid, team = "", votes = 0, fire = 0, day = kstDay()) {
  if (!/^[a-f0-9]{16}$/.test(uid || "")) return null;
  if (!WAR_ME_READY) {
    await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS war_me (uid TEXT PRIMARY KEY, team TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0, fire INTEGER NOT NULL DEFAULT 0, first_day TEXT NOT NULL, last_day TEXT NOT NULL)");
    WAR_ME_READY = true;
  }
  if (votes || fire) await env.PUSH_DB.prepare("INSERT INTO war_me (uid, team, votes, fire, first_day, last_day) VALUES (?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(uid) DO UPDATE SET team = excluded.team, votes = votes + excluded.votes, fire = fire + excluded.fire, last_day = excluded.last_day")
    .bind(uid, team, votes, fire, day, day).run();
  return env.PUSH_DB.prepare("SELECT votes, fire, first_day, last_day FROM war_me WHERE uid = ?").bind(uid).first();
}
async function handleWar(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await pcReady(env); await statsReady(env); await hotReady(env);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/war/today" && request.method === "GET") {
    const q = (day) => env.PUSH_DB.prepare("SELECT key, n FROM stats WHERE day = ? AND kind = 'war'").bind(day).all()
      .then((r) => Object.fromEntries(r.results.map((x) => [x.key, x.n])));
    const out = { ok: true, today: await q(kstDay()), yday: await q(kstDay(1)) };
    // 점수판은 누적(매일 0시에 지우지 않는다 — 대표 10-29). 오늘 몫은 today 로 따로
    const tot = await env.PUSH_DB.prepare("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'war' GROUP BY key").all();
    out.total = Object.fromEntries(tot.results.map((x) => [x.key, x.n]));
    // 시작 점수(대표 10-29: 진보·보수 1,250 · 중도 670) — 화면 설명에 '시작 점수 포함'으로 밝혀 둔다. 일별 기록(today·yday)엔 안 넣는다
    for (const [k, v] of Object.entries({ b: 1250, w: 670, r: 1250 })) out.total[k] = (out.total[k] || 0) + v;
    const uid = url.searchParams.get("uid") || "";
    if (uid) out.me = await warMe(env, uid);
    const t = url.searchParams.get("t") || "";
    if (PC_TARGET.test(t)) {
      const { results } = await env.PUSH_DB.prepare("SELECT kind, SUM(n) AS n FROM stats WHERE kind IN ('cheer', 'bomb') AND key = ? GROUP BY kind").bind(t).all();
      out.t = Object.fromEntries(results.map((x) => [x.kind, x.n]));
    }
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": uid ? "no-store" : "public, max-age=15" } });
  }
  if (path === "/war/iap" && request.method === "POST") {         // 앱 인앱결제(애플·구글) — 스토어 서명·조회로 확인한 거래만, 거래마다 한 번
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const team = WAR_T.test(b.team) ? b.team : "", item = IAP_ITEMS[b.productId];
    if (!team || !item) return pj({ ok: false, error: "invalid" }, 400);
    let tx = "", status = "paid";
    if (b.platform === "ios") {
      const t = await verifyAppleJws(b.jws).catch(() => null);
      if (!t || t.bundleId !== "com.politaltal" || t.productId !== b.productId) return pj({ ok: false, error: "verify" }, 400);
      tx = "ios:" + t.transactionId; if (t.environment === "Sandbox") status = "sandbox";
    } else if (b.platform === "android") {
      const tok = String(b.purchaseToken || "");
      if (tok.length < 20 || tok.length > 600) return pj({ ok: false, error: "invalid" }, 400);
      const v = await verifyGoogle(env, b.productId, tok);
      if (v === false) return pj({ ok: false, error: "verify" }, 400);
      tx = "and:" + (await sha16(tok)); status = v === null ? "unverified" : v.sandbox ? "sandbox" : "paid";
    } else return pj({ ok: false, error: "invalid" }, 400);
    await env.PUSH_DB.exec(SALES_SQL);                              // 운영 수익 — 시험 결제(sandbox)는 관리자 합계에서 빠진다
    const r = await env.PUSH_DB.prepare("INSERT OR IGNORE INTO sales (mul_no, code, item, amount, team, fire, day, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(tx, b.platform, b.productId.includes(".fire.") ? "iap-fire" : "iap-support", item[0], team, item[1], kstDay(), Date.now(), status).run();
    if (!r.meta.changes) return pj({ ok: true, dup: true });
    await warAdd(env, team, item[1]);
    return pj({ ok: true, n: item[1], to: team, me: await warMe(env, b.uid, team, 0, item[1]) });
  }
  if (path !== "/war/fire" || request.method !== "POST" || request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
  const b = await request.json().catch(() => ({}));
  const kind = String(b.kind || ""), team = WAR_T.test(b.team) ? b.team : "";
  if (!team) return pj({ ok: false, error: "invalid" }, 400);
  const day = kstDay(), h = await sha16(PC_SALT + day + (request.headers.get("cf-connecting-ip") || "local"));
  const once = async (k) => (await env.PUSH_DB.prepare("INSERT OR IGNORE INTO hot_seen (day, h, path) VALUES (?, ?, ?)").bind(day, h, k).run()).meta.changes === 1;
  let n = 0, to = team;
  const uid = /^[a-f0-9]{16}$/.test(b.uid || "") ? b.uid : "";
  if (kind === "join") {                                            // 매일 출석 투표 1표 — 기기마다 하루 한 번, 같은 IP는 하루 20표까지(통신사 공유 IP 고려). ponytail: 기기 표식을 지우면 다시 투표 가능 — 조작 보이면 Turnstile
    if (uid) {
      const { c } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS c FROM hot_seen WHERE day = ? AND h = ? AND path LIKE 'war:join:%'").bind(day, h).first();
      if (c < 20 && await once(`war:join:${uid}`)) n = 1;
    } else if (await once("war:join")) n = 1;
  } else if (kind === "cheer" || kind === "bomb") {
    const t = String(b.t || "");
    if (!PC_TARGET.test(t) || t.startsWith("n:")) return pj({ ok: false, error: "invalid" }, 400);
    if (!(await once(`war:${kind}:${t}`))) return pj({ ok: true, dup: true });
    await env.PUSH_DB.prepare("INSERT INTO stats (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1").bind(day, kind, t).run();
    n = 1;
  } else if (kind === "game") {
    const { c } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS c FROM hot_seen WHERE day = ? AND h = ? AND path LIKE 'war:game:%'").bind(day, h).first();
    if (c >= 10) return pj({ ok: true, capped: true });
    await once(`war:game:${Date.now()}`);
    n = Math.max(0, Math.min(30, Math.floor(Number(b.n) || 0)));
  } else return pj({ ok: false, error: "invalid" }, 400);
  if (n) await warAdd(env, to, n, day);
  return pj({ ok: true, n, to, me: uid ? await warMe(env, uid, team, kind === "join" && n ? 1 : 0, n, day) : null });
}

// ponytail: IP를 바꿔 가며 누르면 순위를 올릴 수 있다 — 조작이 보이면 Turnstile 이나 앱·웹 가중치를 붙일 것
const HOT_PATH = /^\/(politician|local)\/[A-Za-z0-9]{4,12}$/;
let HOT_READY = false;
async function hotReady(env) {
  if (HOT_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS hot_seen (day TEXT NOT NULL, h TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY (day, h, path))");
  HOT_READY = true;
}
async function hotCount(env, request, day, path) {
  await pcReady(env); await hotReady(env);
  const h = await sha16(PC_SALT + day + (request.headers.get("cf-connecting-ip") || "local"));
  const r = await env.PUSH_DB.prepare("INSERT OR IGNORE INTO hot_seen (day, h, path) VALUES (?, ?, ?)").bind(day, h, path).run();
  if (r.meta.changes) await env.PUSH_DB.prepare(
    "INSERT INTO stats (day, kind, key, n) VALUES (?, 'hot', ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1").bind(day, path).run();
  if (Math.random() < 0.02) await env.PUSH_DB.prepare("DELETE FROM hot_seen WHERE day < ?").bind(kstDay(1)).run();
}

// 같은 관심이면 국회의원·광역단체장·시장이 위로(대표 10-23: "군수는 약하다"). 이름표 = 정적 파일 data/pc-names.json(직함으로 판단)
let HOT_NAMES = null, HOT_NAMES_AT = 0;
async function hotNames(env, origin) {
  if (!HOT_NAMES || Date.now() - HOT_NAMES_AT > 3600e3) {
    try { HOT_NAMES = await (await env.ASSETS.fetch(new Request(origin + "/data/pc-names.json"))).json(); HOT_NAMES_AT = Date.now(); }
    catch (e) { HOT_NAMES = HOT_NAMES || {}; }
  }
  return HOT_NAMES;
}
const HOT_METRO = /^(서울|부산|대구|인천|광주|대전|울산|세종)시장$|통합시장$|지사$/;
function hotWeight(path, names) {
  if (path.startsWith("/politician/")) return 3;
  const t = (names["l:" + path.split("/")[2]] || "").split(" ").slice(1).join(" ");
  return HOT_METRO.test(t) ? 3 : /시장$/.test(t) ? 2 : /구청장$/.test(t) ? 1 : 0.6;   // 나머지 = 군수
}

async function handleHot(env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await statsReady(env);
  let pg = url.searchParams.get("p");
  if (pg) {
    try { pg = decodeURIComponent(pg); } catch (e) {}       // location.pathname 은 한글이 %인코딩돼 온다(/t 와 같은 키로 맞춤)
    const key = pg.split("?")[0].replace(/\.html$/, "").replace(/\/+$/, "") || "/";
    const r = await env.PUSH_DB.prepare("SELECT n FROM stats WHERE day = ? AND kind = 'path' AND key = ?").bind(kstDay(), key).first();
    return new Response(JSON.stringify({ ok: true, n: r ? r.n : 0 }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120" } });
  }
  const names = await hotNames(env, url.origin);
  const rank = async (d0, d1) => {
    const q = (kind) => env.PUSH_DB.prepare(
      "SELECT key, SUM(CASE WHEN day = ? THEN 2 * n ELSE n END) AS s FROM stats WHERE kind = ? AND day IN (?, ?) " +
      "AND (key LIKE '/politician/%' OR key LIKE '/local/%') GROUP BY key ORDER BY s DESC LIMIT 60").bind(d0, kind, d0, d1).all().then((r) => r.results);
    const top = (rows) => rows.map((r) => ({ key: r.key, s: r.s * hotWeight(r.key, names) })).sort((a, b) => b.s - a.s).map((r) => r.key);
    const hot = top(await q("hot"));
    if (hot.length >= 10) return hot.slice(0, 10);
    const seen = new Set(hot);
    return [...hot, ...top(await q("path")).filter((k) => !seen.has(k))].slice(0, 10);
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
  const [daily, paths, refs, plats, push, wall, clicks, pc, wallWait] = await Promise.all([
    q("SELECT day, kind, n FROM stats WHERE kind IN ('pv', 'visit') AND day >= ? ORDER BY day", kstDay(29)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'path' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 15", kstDay(6)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'ref' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 10", kstDay(6)),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'plat' AND day >= ? GROUP BY key", kstDay(6)),
    q("SELECT platform AS key, COUNT(*) AS n FROM push_tokens GROUP BY platform"),
    q("SELECT status AS key, COUNT(*) AS n FROM wall GROUP BY status"),
    q("SELECT key, SUM(n) AS n FROM stats WHERE kind = 'click' AND day >= ? GROUP BY key ORDER BY n DESC LIMIT 20", kstDay(6)),
    q("SELECT SUM(created_at > ?) AS fresh, SUM(status = 'visible' AND reports > 0) AS reported, SUM(status = 'hidden') AS hidden FROM pc", Date.now() - 86400e3),
    q("SELECT name, payer, created_at FROM wall WHERE status = 'wait' ORDER BY id LIMIT 5"),   // 자정 요약에서 입금 내역과 바로 맞춰 보게
  ]);
  return { ok: true, today: kstDay(), daily, paths, refs, plats, push, wall, clicks, pc: pc[0] || {}, wall_wait: wallWait };
}

// ── 후원자의 벽 (/wall/*) ───────────────────────────────────────────────
// 후원한 사람이 표시 이름·한마디를 남긴다 → 운영자가 입금을 확인하고 승인해야 공개된다(사전 검수).
// 입금자명은 확인용이라 관리자에게만 보이고, 승인하는 순간 지운다.
// ponytail: 공개 목록 500명 상한, 대기 300건이 쌓이면 접수를 멈춘다(도배 방지). 넘어서면 페이지 나눔·속도 제한을.
let WALL_READY = false;
async function wallReady(env) {
  if (WALL_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS wall (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, msg TEXT NOT NULL DEFAULT '', payer TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'wait', created_at INTEGER NOT NULL, approved_at INTEGER NOT NULL DEFAULT 0)");
  // tok = 이름을 남긴 브라우저에만 주는 무작위 표식. 승인되면 그 브라우저가 '제n석'을 알고 댓글에 후원자 배지를 단다(개인정보 아님)
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN tok TEXT NOT NULL DEFAULT ''").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN team TEXT NOT NULL DEFAULT ''").run().catch(() => {});   // 불 색 b·w·r(없으면 금색)
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN phone TEXT NOT NULL DEFAULT ''").run().catch(() => {});  // 문자 받기 동의한 사람만, 숫자만
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN sms_ok INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN thanked INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN reply TEXT NOT NULL DEFAULT ''").run().catch(() => {});   // 운영자 답글(방명록 아래 공개)
  await env.PUSH_DB.prepare("ALTER TABLE wall ADD COLUMN claim TEXT NOT NULL DEFAULT ''").run().catch(() => {});   // 한 번 쓰는 '내 자리' 링크 코드
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS sms_log (blast TEXT NOT NULL, wid INTEGER NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL, PRIMARY KEY (blast, wid))");
  WALL_READY = true;
}
// ── 후원자 문자(솔라피) ──────────────────────────────────────────────
// 비밀값 SOLAPI_API_KEY·SOLAPI_API_SECRET(대표가 poc/setup_sms_secrets.sh 로 등록), 발신번호 SOLAPI_SENDER(없으면 대표 번호).
// 받는 사람 = 후원자의 벽에서 '문자 받기'에 동의하고 번호를 남긴 사람만. 문자마다 수신 거부 링크(/wall/stop)를 붙인다 — 누르면 번호를 지운다.
const SMS_FROM = (env) => String(env.SOLAPI_SENDER || "01040104968").replace(/\D/g, "");
const smsOn = (env) => !!(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET);
async function smsSend(env, to, text, extra = {}) {          // extra = { type: 'VOICE', voiceOptions } 등 메시지 필드 덮어쓰기
  if (!smsOn(env)) return { ok: false, error: "off" };
  const date = new Date().toISOString(), salt = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SOLAPI_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(date + salt)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  let bytes = 0; for (const ch of text) bytes += ch.charCodeAt(0) > 127 ? 2 : 1;
  const type = extra.type || (bytes <= 90 ? "SMS" : "LMS");
  try {
    const r = await fetch("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST",
      headers: { Authorization: `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${sig}`, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ to, from: SMS_FROM(env), text, ...(type === "LMS" ? { subject: "정치탈탈" } : {}), ...extra, type }] }),
    });
    const j = await r.json().catch(() => ({}));
    const fail = (j.failedMessageList || [])[0];
    return r.status === 200 && !fail ? { ok: true } : { ok: false, error: (fail && fail.statusMessage) || j.errorMessage || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: "network" }; }
}
const seatUrl = (no) => `https://politaltal.com/supporters?seat=${no}`;
const stopUrl = (tok) => `https://politaltal.com/wall/stop?t=${tok}`;
async function wallTok(env, id) {                       // 토큰이 없던 옛 후원자(10-24 전)도 링크를 받을 수 있게 만들어 둔다
  const w = await env.PUSH_DB.prepare("SELECT tok FROM wall WHERE id = ?").bind(id).first();
  if (!w) return "";
  if (w.tok) return w.tok;
  const tok = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
  await env.PUSH_DB.prepare("UPDATE wall SET tok = ? WHERE id = ? AND tok = ''").bind(tok, id).run();
  return (await env.PUSH_DB.prepare("SELECT tok FROM wall WHERE id = ?").bind(id).first()).tok;
}
async function wallThanks(env, id) {                    // 승인 직후 감사 문자(거래 안내라 '(광고)' 없음)
  const w = await env.PUSH_DB.prepare("SELECT name, phone, sms_ok FROM wall WHERE id = ? AND status = 'ok'").bind(id).first();
  if (!w || !w.phone || !w.sms_ok || !smsOn(env)) return { ok: false, error: "skip" };
  const seat = await wallSeat(env, await wallTok(env, id));
  const r = await smsSend(env, w.phone,
    `[정치탈탈] ${w.name}님, 고맙습니다!\n시민 본회의 제${seat.no}석에 불이 켜졌습니다.\n\n` +
    `후원금은 전액 국민을 위한 좋은 일에 쓰고, 쓴 곳은 매달 공개합니다. 정치인의 일, 끝까지 함께 지켜봐요.\n${w.name}님께도 좋은 일만 가득하길 바랍니다.\n\n` +
    `내 자리 보기·자랑하기\n${seatUrl(seat.no)}\n\n수신거부 ${stopUrl(await wallTok(env, id))}`);
  if (r.ok) await env.PUSH_DB.prepare("UPDATE wall SET thanked = ? WHERE id = ?").bind(Date.now(), id).run();
  return r;
}

// 승인된 자리 번호(승인 순서) — 없으면 0
async function wallSeat(env, tok) {
  if (!/^[a-f0-9]{16}$/.test(tok || "")) return null;
  const w = await env.PUSH_DB.prepare("SELECT id, name, status, team, approved_at FROM wall WHERE tok = ?").bind(tok).first();
  if (!w) return null;
  if (w.status !== "ok") return { status: w.status, name: w.name, no: 0, team: w.team };
  const { n } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM wall WHERE status = 'ok' AND (approved_at < ? OR (approved_at = ? AND id <= ?))")
    .bind(w.approved_at, w.approved_at, w.id).first();
  return { status: "ok", name: w.name, no: n, team: w.team };
}
const wallText = (v, max) => String(v || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const wallPublic = (env) => env.PUSH_DB.prepare(
  "SELECT name, msg, team, reply, approved_at FROM wall WHERE status = 'ok' ORDER BY approved_at, id LIMIT 500").all()
  .then((r) => r.results.map((x, i) => ({ no: i + 1, name: x.name, msg: x.msg, team: x.team, reply: x.reply, at: x.approved_at, day: new Date(x.approved_at + 9 * 3600e3).toISOString().slice(0, 10) })));

async function handleWall(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await wallReady(env);
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/wall/list" && request.method === "GET") {
    // 금액은 내보내지 않는다(합계도 장부 페이지에서 '끝난 달'만 — 이번 달 합계가 오르면 누가 얼마 냈는지 보이므로)
    const seats = await wallPublic(env);
    const out = url.searchParams.has("brief")            // 모든 페이지 상단 띠용 — 자리 수와 마지막 점등만
      ? { ok: true, n: seats.length, last: seats.length ? { no: seats.length, name: seats[seats.length - 1].name, at: seats[seats.length - 1].at } : null }
      : { ok: true, seats };
    return new Response(JSON.stringify(out),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
  }
  if (path === "/wall/stop" && request.method === "GET") {        // 문자 수신 거부 — 번호를 바로 지운다
    const t = url.searchParams.get("t") || "";
    if (/^[a-f0-9]{16}$/.test(t)) await env.PUSH_DB.prepare("UPDATE wall SET sms_ok = 0, phone = '' WHERE tok = ?").bind(t).run();
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>수신 거부</title>' +
      '<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px 20px;color:#0a2540"><h1 style="font-size:22px">문자 수신을 끊었습니다</h1>' +
      '<p style="line-height:1.7">남겨 주신 번호는 지웠습니다. 후원자의 벽 자리는 그대로 있어요.<br>그동안 함께해 주셔서 고맙습니다.</p><p><a href="/supporters">후원자의 벽 보기</a></p></body>',
      { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (path === "/wall/claim" && request.method === "POST") {     // 한 번 쓰는 '내 자리' 링크 → 이 기기에 자리 토큰을 준다(공개 답글에 붙여도 한 사람만)
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const c = String(b.c || "");
    const w = /^[a-f0-9]{12}$/.test(c) && await env.PUSH_DB.prepare("SELECT id FROM wall WHERE claim = ?").bind(c).first();
    if (!w) return pj({ ok: false, error: "used" }, 404);
    const tok = await wallTok(env, w.id);
    await env.PUSH_DB.prepare("UPDATE wall SET claim = '' WHERE id = ?").bind(w.id).run();
    return pj({ ok: true, tok });
  }
  if (path === "/wall/team" && request.method === "POST") {      // 내 자리 불 색(성향) — 처음 고를 때 그 성향 화력 +100
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const tok = String(b.tok || ""), team = WAR_T.test(b.team) ? b.team : "";
    if (!/^[a-f0-9]{16}$/.test(tok) || !team) return pj({ ok: false, error: "invalid" }, 400);
    const w = await env.PUSH_DB.prepare("SELECT team, status FROM wall WHERE tok = ?").bind(tok).first();
    if (!w) return pj({ ok: false, error: "not found" }, 404);
    await env.PUSH_DB.prepare("UPDATE wall SET team = ? WHERE tok = ?").bind(team, tok).run();
    if (!w.team && w.status === "ok") await warAdd(env, team, 100);
    return pj({ ok: true, team });
  }
  if (path === "/wall/me" && request.method === "GET") {
    const me = await wallSeat(env, url.searchParams.get("tok"));
    return pj({ ok: true, me: me || { status: "none" } });
  }
  if (path === "/wall/sign" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const name = wallText(b.name, 20), msg = wallText(b.msg, 100), payer = wallText(b.payer, 20);
    if (b.hp || !name || !payer) return pj({ ok: false, error: "invalid" }, 400);      // hp = 사람 눈에 안 보이는 칸(봇만 채운다)
    const { n } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM wall WHERE status = 'wait'").first();
    if (n >= 300) return pj({ ok: false, error: "busy" }, 429);
    const tok = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, "0")).join("");
    const team = WAR_T.test(b.team) ? b.team : "";
    const phone = String(b.phone || "").replace(/\D/g, ""), smsOk = b.sms === true && /^01[016789]\d{7,8}$/.test(phone);   // 동의 없으면 번호를 저장하지 않는다
    await env.PUSH_DB.prepare("INSERT INTO wall (name, msg, payer, created_at, tok, team, phone, sms_ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(name, msg, payer, Date.now(), tok, team, smsOk ? phone : "", smsOk ? 1 : 0).run();
    return pj({ ok: true, tok });
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
  await env.PUSH_DB.prepare("ALTER TABLE pc ADD COLUMN badge INTEGER NOT NULL DEFAULT 0").run().catch(() => {});   // 후원자 자리 번호(0=없음)
  await env.PUSH_DB.prepare("ALTER TABLE pc ADD COLUMN team TEXT NOT NULL DEFAULT ''").run().catch(() => {});        // 글쓴이 진영 b·w·r
  await env.PUSH_DB.prepare("ALTER TABLE pc ADD COLUMN off INTEGER NOT NULL DEFAULT 0").run().catch(() => {});       // 1 = 인증된 의원실 공식 답글(/ofc/reply)
  await env.PUSH_DB.prepare("ALTER TABLE pc ADD COLUMN pin INTEGER NOT NULL DEFAULT 0").run().catch(() => {});       // 의원실이 고정한 시각(0=아님)
  await env.PUSH_DB.prepare("ALTER TABLE pc ADD COLUMN orep TEXT NOT NULL DEFAULT ''").run().catch(() => {});        // 의원실 우선 신고 사유
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
      "SELECT id, parent, nick, body, likes, badge, team, off, pin, created_at AS at, EXISTS(SELECT 1 FROM pc_likes l WHERE l.cid = pc.id AND l.ip_hash = ?) AS liked " +
      "FROM pc WHERE target = ? AND status = 'visible' ORDER BY id DESC LIMIT 300").bind(who, t).all();
    const { n } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM pc WHERE target = ? AND status = 'visible'").bind(t).first();
    return pj({ ok: true, open: await pcOpen(env), total: n, rows: results, office: await ofcPublic(env, t, url.origin) });
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
    let badge = 0;
    if (b.sup) { await wallReady(env); const seat = await wallSeat(env, String(b.sup)); if (seat && seat.status === "ok") badge = seat.no; }
    const team = WAR_T.test(b.team) ? b.team : "";
    const r = await env.PUSH_DB.prepare("INSERT INTO pc (target, nick, body, ip_hash, created_at, parent, badge, team) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(t, nick, body, who, now, parent, badge, team).run();
    if (team) await warAdd(env, team, 2);
    return pj({ ok: true, row: { id: r.meta.last_row_id, parent, nick, body, likes: 0, liked: 0, at: now, badge, team } });
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
      "UPDATE pc SET reports = reports + 1, status = CASE WHEN reports + 1 >= 3 AND off = 0 THEN 'hidden' ELSE status END WHERE id = ?").bind(b.id).run();
    return pj({ ok: true });
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 의원실 센터 (/ofc/*) ──────────────────────────────────────────────
// 설계 = 10_의원실센터_설계.md. 인증 = 담당자 휴대폰 문자 + 의원회관 공식 대표번호(열린국회 공개값, data/office-tel.json — 신청자가 못 바꿈)로 거는 ARS + 운영자 승인.
// 공문은 받지 않는다(대표 10-29). 의원실은 시민 글을 지우거나 숨길 수 없다 — 공식 답글·고정·우선 신고만.
// 세션 = 문자로 확인한 휴대폰(쿠키 ofc, HttpOnly). 어느 의원실 팀인지는 ofc_mem.
const OFC_T = /^p:[A-Za-z0-9]{4,12}$/;
const OFC_PHONE = /^01[016789]\d{7,8}$/;
const OFC_SEATS = { free: 3, pro: 5 };
const OFC_REVERIFY = 180 * 86400e3;                       // 6개월마다 ARS 다시(임기 중 담당자가 바뀌는 일이 잦다)
const OFC_REP = ["욕설·비방", "허위사실", "개인정보 노출", "도배·광고", "기타"];
let OFC_READY = false, OFC_TEL = null, OFC_TEL_AT = 0;
async function ofcReady(env) {
  if (OFC_READY) return;
  await pcReady(env);
  const db = env.PUSH_DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ofc (t TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ok', verified_at INTEGER NOT NULL, plan TEXT NOT NULL DEFAULT 'free', pro_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_app (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, phone TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'call', ars_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_mem (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, phone TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff', status TEXT NOT NULL DEFAULT 'ok', created_at INTEGER NOT NULL, last_at INTEGER NOT NULL DEFAULT 0, UNIQUE (t, phone))"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_code (k TEXT PRIMARY KEY, h TEXT NOT NULL, at INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_sess (h TEXT PRIMARY KEY, phone TEXT NOT NULL, exp INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_cnt (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, k))"),
    // 2단계: 결제 한 건(카드 매달 결제 한 번·계좌이체 신청 한 번), 의원실 소식, 담당자 배정
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_bill (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, kind TEXT NOT NULL, months INTEGER NOT NULL, amount INTEGER NOT NULL, " +
      "status TEXT NOT NULL DEFAULT 'wait', code TEXT NOT NULL DEFAULT '', mul_no TEXT NOT NULL DEFAULT '', payer TEXT NOT NULL DEFAULT '', buyer TEXT NOT NULL DEFAULT '', " +
      "biz TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', mem_id INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, " +
      "paid_at INTEGER NOT NULL DEFAULT 0, from_at INTEGER NOT NULL DEFAULT 0, to_at INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS ofc_bill_mul ON ofc_bill (mul_no) WHERE mul_no != ''"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_post (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, body TEXT NOT NULL, photos TEXT NOT NULL DEFAULT '[]', " +
      "yt TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ok', mem_id INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ofc_assign (cid INTEGER PRIMARY KEY, t TEXT NOT NULL, mem_id INTEGER NOT NULL, at INTEGER NOT NULL)"),
  ]);
  for (const c of ["bill_name", "bill_no", "bill_email"])          // 세금계산서·영수증 받을 곳
    await db.prepare(`ALTER TABLE ofc ADD COLUMN ${c} TEXT NOT NULL DEFAULT ''`).run().catch(() => {});
  OFC_READY = true;
}
async function ofcTel(env, origin) {                      // {"p:코드": [이름, 정당, 지역구, 대표번호 숫자]} — 현직만(임기 끝나면 빠져 자동으로 막힌다)
  if (!OFC_TEL || Date.now() - OFC_TEL_AT > 3600e3) {
    try { OFC_TEL = await (await env.ASSETS.fetch(new Request(origin + "/data/office-tel.json"))).json(); OFC_TEL_AT = Date.now(); }
    catch (e) { OFC_TEL = OFC_TEL || {}; }
  }
  return OFC_TEL;
}
const ofcRand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, "0")).join("");
const ofcMask = (p) => String(p).replace(/^(\d{3})\d+(\d{4})$/, "$1-****-$2");
const ofcText = (v, max) => String(v || "").replace(/[\u0000-\u0009\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
async function ofcCount(env, k, max) {                    // 오늘 k 를 한 번 더 — max 를 넘으면 false
  const r = await env.PUSH_DB.prepare("INSERT INTO ofc_cnt (day, k, n) VALUES (?, ?, 1) ON CONFLICT(day, k) DO UPDATE SET n = n + 1 RETURNING n").bind(kstDay(), k).first();
  return r.n <= max;
}
async function ofcRecent(env, k, gap) {
  const r = await env.PUSH_DB.prepare("SELECT at FROM ofc_code WHERE k = ?").bind(k).first();
  return !!r && Date.now() - r.at < gap;
}
async function ofcIssue(env, k, len = 6) {               // 문자 = 6자리(휴대폰이 자동으로 채움), 전화로 듣는 ARS = 4자리(대표 10-29: 길면 받아 적기 힘들다)
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** len).padStart(len, "0");
  await env.PUSH_DB.prepare("INSERT OR REPLACE INTO ofc_code (k, h, at, tries) VALUES (?, ?, ?, 0)").bind(k, await sha16(PC_SALT + k + code), Date.now()).run();
  return code;
}
async function ofcCheck(env, k, code, ttl) {              // "ok" | "expired" | "tries" | "wrong" — 5번 틀리면 새 번호를 받아야 한다
  const r = await env.PUSH_DB.prepare("SELECT h, at, tries FROM ofc_code WHERE k = ?").bind(k).first();
  if (!r || Date.now() - r.at > ttl) return "expired";
  if (r.tries >= 5) return "tries";
  if (r.h !== await sha16(PC_SALT + k + String(code || "").replace(/\D/g, ""))) {
    await env.PUSH_DB.prepare("UPDATE ofc_code SET tries = tries + 1 WHERE k = ?").bind(k).run();
    return "wrong";
  }
  await env.PUSH_DB.prepare("DELETE FROM ofc_code WHERE k = ?").bind(k).run();
  return "ok";
}
async function ofcSess(env, request) {
  const tok = ((request.headers.get("cookie") || "").match(/(?:^|;\s*)ofc=([a-f0-9]{32})/) || [])[1];
  if (!tok) return null;
  const s = await env.PUSH_DB.prepare("SELECT phone FROM ofc_sess WHERE h = ? AND exp > ?").bind(await sha16(tok), Date.now()).first();
  return s ? s.phone : null;
}
async function ofcMem(env, phone, t, tels) {               // 팀원 + 의원실 상태. live=false 면 읽기만(재인증·임기 끝·운영자 정지)
  const m = await env.PUSH_DB.prepare(
    "SELECT m.id, m.name, m.role, o.name AS oname, o.status AS ost, o.verified_at, o.plan, o.pro_until FROM ofc_mem m JOIN ofc o ON o.t = m.t " +
    "WHERE m.t = ? AND m.phone = ? AND m.status = 'ok'").bind(t, phone).first();
  if (!m) return null;
  m.why = m.ost !== "ok" ? "off" : !tels[t] ? "term" : Date.now() - m.verified_at > OFC_REVERIFY ? "reverify" : "";
  m.live = !m.why;
  m.until = m.verified_at + OFC_REVERIFY;
  m.plan = m.pro_until > Date.now() ? "pro" : "free";
  return m;
}
async function ofcPublic(env, t, origin) {                 // 정치인 페이지에 '의원실 인증' 배지를 달지
  if (!OFC_T.test(t)) return null;
  await ofcReady(env);
  const o = await env.PUSH_DB.prepare("SELECT name, pro_until FROM ofc WHERE t = ? AND status = 'ok' AND verified_at > ?").bind(t, Date.now() - OFC_REVERIFY).first();
  if (!o || !(await ofcTel(env, origin))[t]) return null;
  const posts = o.pro_until > Date.now() && !(await ofcKv(env, "ofc_posts_off"))
    ? (await env.PUSH_DB.prepare("SELECT id, body, photos, yt, created_at AS at FROM ofc_post WHERE t = ? AND status = 'ok' ORDER BY id DESC LIMIT 5").bind(t).all())
      .results.map((p) => ({ ...p, photos: JSON.parse(p.photos).map((k) => "/ofc/m/" + k) }))
    : [];
  return { name: o.name, posts };
}
async function ofcVoice(env, to, who, code) {             // ARS 인증 전화. 머리말(headerMessage)은 쓰지 않는다 — 넣으면 받는 사람이 번호를 눌러야 본문이 나오는 경우가 있다(솔라피 안내)
  const say = code.split("").join(", ");
  return smsSend(env, to, `안녕하세요. 정치탈탈입니다. ${who} 의원실 직원분이 요청하신 의원실 인증 전화입니다. ` +
    `인증번호는 ${say} 입니다. 다시 한 번 알려 드립니다. ${say} 입니다. 마지막으로 한 번 더, ${say} 입니다. ` +
    "요청하지 않으셨다면 끊으셔도 됩니다. 감사합니다.", { type: "VOICE", voiceOptions: { voiceType: "FEMALE" } });
}
function ofcCookie(res, v, age) {
  res.headers.append("set-cookie", `ofc=${v}; Path=/ofc; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`);
  return res;
}

async function handleOfc(request, env, url) {
  if (!env.PUSH_DB) return pj({ ok: false, error: "store not provisioned" }, 503);
  await ofcReady(env);
  const db = env.PUSH_DB, now = Date.now(), path = url.pathname.replace(/\/+$/, ""), post = request.method === "POST";
  if (post && request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
  if (path.startsWith("/ofc/m/") && request.method === "GET") {   // 의원실 소식 사진(공개)
    const key = path.slice(7), o = OFC_KEY.test(key) && env.OFC_MEDIA ? await env.OFC_MEDIA.get(key) : null;
    if (!o) return new Response("not found", { status: 404 });
    return new Response(o.body, { headers: { "content-type": o.httpMetadata.contentType || "image/jpeg", "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff" } });
  }
  const b = post && path !== "/ofc/upload" ? await request.json().catch(() => ({})) : {};
  const tels = await ofcTel(env, url.origin);
  const dev = env.OFC_DEV === "1" && !smsOn(env);          // 로컬 점검 전용 — 문자·전화 대신 응답에 번호를 실어 준다(운영엔 이 값이 없다)
  const ip = await sha16(PC_SALT + (request.headers.get("cf-connecting-ip") || "local"));

  if (path === "/ofc/pub") {                                 // 안내 페이지 숫자 — 지난 30일 방문·의원 페이지 조회(정치탈탈 자체 집계, 개인 식별 없음)
    await statsReady(env);
    const v = await db.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'visit' THEN n END), 0) AS visits, COALESCE(SUM(CASE WHEN kind = 'path' AND key LIKE '/politician/%' THEN n END), 0) AS pol " +
      "FROM stats WHERE day >= ? AND day < ? AND kind IN ('visit', 'path')").bind(kstDay(30), kstDay(0)).first();
    const o = await db.prepare("SELECT COUNT(*) AS n FROM ofc WHERE status = 'ok' AND verified_at > ?").bind(now - OFC_REVERIFY).first();
    return new Response(JSON.stringify({ ok: true, visits30: v.visits, pol30: v.pol, offices: o.n }),
      { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600" } });
  }
  if (path.startsWith("/ofc/embed/") && !post) {             // 공식 성적표 위젯 — 공개 자료라 누구나 붙일 수 있다(의원실 홈페이지 iframe). 10분 캐시
    const hit = await caches.default.match(request);
    if (hit) return hit;
    const t = "p:" + path.slice(11), f = await ofcFacts(env, url.origin, t);
    if (!f) return new Response("not found", { status: 404 });
    const ok = tels[t] && await db.prepare("SELECT 1 FROM ofc WHERE t = ? AND status = 'ok' AND verified_at > ?").bind(t, now - OFC_REVERIFY).first();
    const c = await db.prepare("SELECT COUNT(*) AS n, (SELECT COUNT(*) FROM pc WHERE target = ?1 AND off = 1 AND status = 'visible') AS r " +
      "FROM pc WHERE target = ?1 AND parent = 0 AND off = 0 AND status = 'visible'").bind(t).first();
    const last = f.list.filter((x) => OFC_PASS.includes(x[3])).sort((a, x) => (x[4] > a[4] ? 1 : -1))[0];
    const page = `${url.origin}/politician/${t.slice(2)}`;
    const res = new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(f.name)} 의원 성적표 | 정치탈탈</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;background:transparent;color:#0a2540;word-break:keep-all}
a.c{display:block;max-width:420px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;text-decoration:none;color:inherit}
.h{display:flex;gap:12px;align-items:center}.h img{width:56px;height:56px;border-radius:50%;object-fit:cover;background:#f1f5f9}.h b{font-size:18px;font-weight:900}
.h small{display:block;font-size:12.5px;color:#64748b;margin-top:2px}.v{display:inline-block;font-size:11px;font-weight:800;color:#1d4ed8;background:#eff6ff;border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:2px}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:14px 0 10px}.g div{background:#f4f6fa;border-radius:10px;padding:9px 2px;text-align:center}
.g b{display:block;font-size:19px;font-weight:900}.g span{font-size:11px;color:#64748b}.l{font-size:13px;line-height:1.5;margin-top:6px}.l em{font-style:normal;color:#64748b}
.go{margin-top:12px;background:#0a2540;color:#fff;border-radius:10px;padding:10px;text-align:center;font-size:14px;font-weight:800}.s{font-size:11px;color:#94a3b8;margin-top:8px;text-align:center}
</style></head><body><a class="c" href="${page}" target="_blank" rel="noopener">
<div class="h"><img src="/images/politicians/${esc(t.slice(2))}.jpg" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(f.name)} 의원</b>${ok ? '<span class="v">✅ 의원실 인증</span>' : ""}
<small>${esc(f.party)} · ${esc(f.district)}${f.term ? " · " + esc(f.term) : ""}</small></div></div>
<div class="g"><div><b>${f.bills}</b><span>대표발의</span></div><div><b>${f.passed}</b><span>그대로 통과</span></div><div><b>${Math.round(f.part_rate)}%</b><span>표결 참여</span></div><div><b>${f.overall}</b><span>종합 점수</span></div></div>
${last ? `<p class="l"><em>최근 통과</em> 「${esc(last[1])}」 ${esc(last[4].slice(0, 7).replace("-", "."))}</p>` : ""}
<p class="l"><em>시민 한마디</em> ${c.n.toLocaleString("ko-KR")}개${c.r ? ` · 의원실 답글 ${c.r.toLocaleString("ko-KR")}개` : ""}</p>
<div class="go">정치탈탈에서 성적표 전체 보기 →</div><p class="s">국회 공개 데이터 · ${esc(f.at)} 기준 · 정치탈탈 집계</p></a></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600", "x-content-type-options": "nosniff" } });
    await caches.default.put(request, res.clone());
    return res;
  }
  if (path === "/ofc/otp" && post) {                         // 휴대폰 문자 인증번호
    const phone = String(b.phone || "").replace(/\D/g, ""), k = "sms:" + phone;
    if (!OFC_PHONE.test(phone)) return pj({ ok: false, error: "phone" }, 400);
    if (!smsOn(env) && !dev) return pj({ ok: false, error: "sms_off" }, 503);
    if (await ofcRecent(env, k, 60e3)) return pj({ ok: false, error: "wait" }, 429);
    if (!(await ofcCount(env, k, 10)) || !(await ofcCount(env, "smsip:" + ip, 20)) || !(await ofcCount(env, "sms", 500))) return pj({ ok: false, error: "slow" }, 429);
    const code = await ofcIssue(env, k);
    if (dev) return pj({ ok: true, dev: code });
    const r = await smsSend(env, phone, `[정치탈탈 의원실 센터] 인증번호 ${code}\n5분 안에 입력해 주세요.`);
    return r.ok ? pj({ ok: true }) : pj({ ok: false, error: "send" }, 502);
  }
  if (path === "/ofc/login" && post) {
    const phone = String(b.phone || "").replace(/\D/g, "");
    if (!OFC_PHONE.test(phone)) return pj({ ok: false, error: "phone" }, 400);
    const r = await ofcCheck(env, "sms:" + phone, b.code, 5 * 60e3);
    if (r !== "ok") return pj({ ok: false, error: r }, 400);
    const tok = ofcRand(16);
    await db.batch([
      db.prepare("INSERT INTO ofc_sess (h, phone, exp) VALUES (?, ?, ?)").bind(await sha16(tok), phone, now + 30 * 86400e3),
      db.prepare("DELETE FROM ofc_sess WHERE exp < ?").bind(now),
      db.prepare("UPDATE ofc_mem SET last_at = ? WHERE phone = ?").bind(now, phone),
    ]);
    return ofcCookie(pj({ ok: true }), tok, 30 * 86400);
  }
  if (path === "/ofc/logout" && post) {
    const tok = ((request.headers.get("cookie") || "").match(/(?:^|;\s*)ofc=([a-f0-9]{32})/) || [])[1];
    if (tok) await db.prepare("DELETE FROM ofc_sess WHERE h = ?").bind(await sha16(tok)).run();
    return ofcCookie(pj({ ok: true }), "", 0);
  }

  const phone = await ofcSess(env, request);
  if (!phone) return pj({ ok: false, error: "login" }, 401);

  if (path === "/ofc/me") {
    const out = [];
    for (const { t } of (await db.prepare("SELECT t FROM ofc_mem WHERE phone = ? AND status = 'ok'").bind(phone).all()).results) {
      const m = await ofcMem(env, phone, t, tels);
      if (m) out.push({ t, me: m.name, role: m.role, oname: m.oname, plan: m.plan, pro_until: m.pro_until, live: m.live, why: m.why, until: m.until });
    }
    const apps = (await db.prepare("SELECT id, t, name, role, status, created_at FROM ofc_app WHERE phone = ? AND status IN ('call', 'review', 'no') ORDER BY id DESC LIMIT 5")
      .bind(phone).all()).results;
    return pj({ ok: true, phone: ofcMask(phone), mem: out, apps });
  }
  if (path === "/ofc/apply" && post) {                       // 인증 신청 — 다음 단계는 대표번호 ARS
    const t = String(b.t || ""), name = ofcText(b.name, 20), role = ofcText(b.role, 20);
    if (!OFC_T.test(t) || !tels[t] || name.length < 2 || role.length < 2) return pj({ ok: false, error: "invalid" }, 400);
    const o = await db.prepare("SELECT status, verified_at FROM ofc WHERE t = ?").bind(t).first();
    if (o && (o.status !== "ok" || now - o.verified_at < OFC_REVERIFY)) return pj({ ok: false, error: o.status === "ok" ? "exists" : "off" }, 409);   // 이미 인증된 의원실 = 그 의원실 관리자에게 초대받기
    if (await db.prepare("SELECT id FROM ofc_app WHERE t = ? AND phone = ? AND status = 'review'").bind(t, phone).first()) return pj({ ok: false, error: "review" }, 409);
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM ofc_app WHERE phone = ? AND created_at > ?").bind(phone, now - 86400e3).first();
    if (n >= 3) return pj({ ok: false, error: "slow" }, 429);
    await db.prepare("DELETE FROM ofc_app WHERE t = ? AND phone = ? AND status IN ('call', 'no')").bind(t, phone).run();
    const r = await db.prepare("INSERT INTO ofc_app (t, phone, name, role, created_at) VALUES (?, ?, ?, ?, ?)").bind(t, phone, name, role, now).run();
    return pj({ ok: true, id: r.meta.last_row_id });
  }
  if (path === "/ofc/call" && post) {                        // 의원회관 대표번호로 ARS — 번호는 우리 명단에서만(신청자가 못 바꾼다)
    const t = String(b.t || ""), tel = OFC_T.test(t) && tels[t] && tels[t][3];
    if (!tel) return pj({ ok: false, error: "invalid" }, 400);
    const app = await db.prepare("SELECT id FROM ofc_app WHERE t = ? AND phone = ? AND status = 'call'").bind(t, phone).first();
    const m = app ? null : await ofcMem(env, phone, t, tels);
    if (!app && !(m && m.role === "owner" && m.why === "reverify")) return pj({ ok: false, error: "invalid" }, 400);
    if (!smsOn(env) && !dev) return pj({ ok: false, error: "sms_off" }, 503);
    const k = "ars:" + t + ":" + phone;
    if (await ofcRecent(env, k, 180e3)) return pj({ ok: false, error: "wait" }, 429);
    // 의원실에 장난 전화가 가지 않게: 의원실마다 하루 3통, 신청자마다 하루 3통, 전체 하루 40통
    if (!(await ofcCount(env, "ars:" + t, 3)) || !(await ofcCount(env, "arsph:" + phone, 3)) || !(await ofcCount(env, "ars", 40))) return pj({ ok: false, error: "slow" }, 429);
    const code = await ofcIssue(env, k, 4);
    if (dev) return pj({ ok: true, dev: code });
    const r = await ofcVoice(env, tel, tels[t][0], code);
    return r.ok ? pj({ ok: true }) : pj({ ok: false, error: "send" }, 502);
  }
  if (path === "/ofc/callcheck" && post) {
    const t = String(b.t || "");
    if (!OFC_T.test(t)) return pj({ ok: false, error: "invalid" }, 400);
    const r = await ofcCheck(env, "ars:" + t + ":" + phone, b.code, 10 * 60e3);
    if (r !== "ok") return pj({ ok: false, error: r }, 400);
    const app = await db.prepare("SELECT id FROM ofc_app WHERE t = ? AND phone = ? AND status = 'call'").bind(t, phone).first();
    if (app) {
      await db.prepare("UPDATE ofc_app SET status = 'review', ars_at = ? WHERE id = ?").bind(now, app.id).run();
      await ofcTell(env, `[정치탈탈 관리] ${tels[t][0]} 의원실 인증 신청 — 대표번호 전화 확인 끝. 관리자 화면에서 승인해 주세요.`);
      return pj({ ok: true, next: "review" });
    }
    const m = await ofcMem(env, phone, t, tels);
    if (m && m.role === "owner" && m.why === "reverify") {
      await db.prepare("UPDATE ofc SET verified_at = ? WHERE t = ?").bind(now, t).run();
      return pj({ ok: true, next: "live" });
    }
    return pj({ ok: false, error: "invalid" }, 400);
  }

  // ↓ 여기부터는 그 의원실 팀원만
  const t = String((post && path !== "/ofc/upload" ? b.t : url.searchParams.get("t")) || "");
  const m = OFC_T.test(t) ? await ofcMem(env, phone, t, tels) : null;
  if (!m) return pj({ ok: false, error: "member" }, 403);
  const r2 = await handleOfc2(request, env, url, path, b, t, m, tels);
  if (r2) return r2;

  if (path === "/ofc/stats") {                               // 홈 탭 — 이 의원 페이지 조회수(정치탈탈 집계)·한마디 수
    await statsReady(env);
    const key = "/politician/" + t.slice(2);
    const sum = (kind, d) => db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM stats WHERE kind = ? AND key = ? AND day >= ?").bind(kind, key, kstDay(d)).first().then((r) => r.n);
    const [v0, v7, v30, u7] = await Promise.all([sum("path", 0), sum("path", 6), sum("path", 29), sum("hot", 6)]);
    const series = (await db.prepare("SELECT day, n FROM stats WHERE kind = 'path' AND key = ? AND day >= ? ORDER BY day").bind(key, kstDay(13)).all()).results;
    const c = await db.prepare("SELECT COALESCE(SUM(created_at > ?), 0) AS d7, COUNT(*) AS n FROM pc WHERE target = ? AND parent = 0 AND off = 0 AND status = 'visible'")
      .bind(now - 7 * 86400e3, t).first();
    return pj({ ok: true, views: { today: v0, d7: v7, d30: v30 }, people7: u7, series, comments: c });
  }
  if (path === "/ofc/inbox") {                               // 한마디함 — 시민 글(답글 포함). 의원실은 숨긴 글을 볼 수도, 지울 수도 없다
    const rows = (await db.prepare(
      "SELECT id, parent, nick, body, likes, badge, team, off, pin, orep, created_at AS at, (SELECT mem_id FROM ofc_assign a WHERE a.cid = pc.id) AS asg " +
      "FROM pc WHERE target = ? AND status = 'visible' ORDER BY id DESC LIMIT 800")
      .bind(t).all()).results;
    return pj({ ok: true, oname: m.oname, live: m.live, why: m.why, pro: ofcPro(m), me: m.id, rows });
  }
  if (path === "/ofc/team") {
    const rows = (await db.prepare("SELECT id, name, role, phone, last_at FROM ofc_mem WHERE t = ? AND status = 'ok' ORDER BY role = 'owner' DESC, id").bind(t).all()).results
      .map((x) => ({ ...x, phone: ofcMask(x.phone), me: x.id === m.id }));
    return pj({ ok: true, rows, seats: OFC_SEATS[m.plan] || 3, owner: m.role === "owner" });
  }
  if (!post) return pj({ ok: false, error: "not found" }, 404);

  if (path === "/ofc/reply") {                               // 공식 답글 — 시민 글 아래 한 단계, 이름 = 'OOO 의원실'
    if (!m.live) return pj({ ok: false, error: m.why }, 403);
    const body = ofcText(b.body, 600);
    if (!Number.isInteger(b.parent) || body.length < 2 || body.length > 500) return pj({ ok: false, error: "invalid" }, 400);
    if (!(await db.prepare("SELECT id FROM pc WHERE id = ? AND target = ? AND parent = 0 AND off = 0 AND status = 'visible'").bind(b.parent, t).first()))
      return pj({ ok: false, error: "invalid" }, 400);
    const nick = m.oname + " 의원실";
    const r = await db.prepare("INSERT INTO pc (target, nick, body, ip_hash, created_at, parent, off) VALUES (?, ?, ?, ?, ?, ?, 1)")
      .bind(t, nick, body, "ofc:" + m.id, now, b.parent).run();
    return pj({ ok: true, row: { id: r.meta.last_row_id, parent: b.parent, nick, body, likes: 0, off: 1, at: now } });
  }
  if (path === "/ofc/del" && Number.isInteger(b.id)) {      // 지울 수 있는 것은 우리 의원실 답글뿐
    const r = await db.prepare("DELETE FROM pc WHERE id = ? AND target = ? AND off = 1").bind(b.id, t).run();
    if (r.meta.changes) await db.batch([db.prepare("DELETE FROM pc_likes WHERE cid = ?").bind(b.id), db.prepare("DELETE FROM pc_reports WHERE cid = ?").bind(b.id)]);
    return pj({ ok: !!r.meta.changes });
  }
  if (path === "/ofc/pin" && Number.isInteger(b.id)) {      // 시민 글 고정(맨 위, 3개까지)
    if (!m.live) return pj({ ok: false, error: m.why }, 403);
    if (b.on) {
      const { n } = await db.prepare("SELECT COUNT(*) AS n FROM pc WHERE target = ? AND pin > 0 AND status = 'visible'").bind(t).first();
      if (n >= 3) return pj({ ok: false, error: "pin_max" }, 409);
    }
    const r = await db.prepare("UPDATE pc SET pin = ? WHERE id = ? AND target = ? AND parent = 0 AND off = 0").bind(b.on ? now : 0, b.id, t).run();
    return pj({ ok: !!r.meta.changes });
  }
  if (path === "/ofc/report" && Number.isInteger(b.id) && OFC_REP.includes(b.why)) {   // 우선 신고 — 운영자가 보고 판단(의원실이 직접 숨기지 않는다)
    const r = await db.prepare("UPDATE pc SET orep = ? WHERE id = ? AND target = ? AND off = 0").bind(b.why, b.id, t).run();
    return pj({ ok: !!r.meta.changes });
  }
  if (path === "/ofc/invite") {
    if (m.role !== "owner" || m.ost !== "ok") return pj({ ok: false, error: "owner" }, 403);
    const p = String(b.phone || "").replace(/\D/g, ""), name = ofcText(b.name, 20);
    if (!OFC_PHONE.test(p) || name.length < 2) return pj({ ok: false, error: "invalid" }, 400);
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM ofc_mem WHERE t = ? AND status = 'ok' AND phone != ?").bind(t, p).first();
    if (n >= (OFC_SEATS[m.plan] || 3)) return pj({ ok: false, error: "seats" }, 409);
    await db.prepare("INSERT INTO ofc_mem (t, phone, name, role, created_at) VALUES (?, ?, ?, 'staff', ?) ON CONFLICT(t, phone) DO UPDATE SET status = 'ok', name = excluded.name")
      .bind(t, p, name, now).run();
    const s = smsOn(env) ? await smsSend(env, p, `[정치탈탈] ${name}님, ${m.oname} 의원실 팀에 초대됐습니다.\n이 번호로 로그인하세요: politaltal.com/office/app`) : { ok: false };
    return pj({ ok: true, sms: s.ok });
  }
  if (path === "/ofc/kick" && Number.isInteger(b.id)) {
    if (m.role !== "owner") return pj({ ok: false, error: "owner" }, 403);
    const r = await db.prepare("UPDATE ofc_mem SET status = 'off' WHERE id = ? AND t = ? AND role != 'owner'").bind(b.id, t).run();
    return pj({ ok: !!r.meta.changes });
  }
  return pj({ ok: false, error: "not found" }, 404);
}

// ── 의원실 센터 2단계: Pro·의원실 소식·주간 리포트·AI 답글 초안·담당자 배정 ──────────────
// Pro = 월 299,000원(부가세 포함, 대표 10-29) · 1년 = 10개월 값. 카드 = 페이앱 매달 자동결제(정치자금 카드도 같은 결제창),
// 계좌 = 정치자금 계좌에서 이체 → 운영자가 관리자 화면에서 입금 확인. 공급자 코코요, 세금계산서는 운영자가 홈택스에서 발행하고 여기엔 표시만.
// 돈은 노출·순위·점수와 무관하다 — Pro 가 여는 것은 의원실 소식 칸·리포트·AI 초안·담당자 배정·팀 5명뿐.
const OFC_PRICE = { 1: 299000, 12: 2990000 };
const OFC_KEY = /^p\/[A-Za-z0-9]{4,12}\/[a-f0-9]{16}\.(jpg|png|webp)$/;    // 의원실 소식 사진(R2 OFC_MEDIA)
const ofcPro = (m) => m.pro_until > Date.now();
const ofcAddMonths = (from, n) => { const d = new Date(from); d.setUTCMonth(d.getUTCMonth() + n); return d.getTime(); };
const ofcYt = (v) => ((String(v || "").match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})/) || [])[1] || "");
const ofcKv = async (env, k) => ((await env.PUSH_DB.prepare("SELECT v FROM kv WHERE k = ?").bind(k).first()) || {}).v || "";
async function ofcTell(env, text) {                      // 운영자(대표 번호)에게 알림 문자 — 실패해도 흐름은 계속
  try { if (smsOn(env)) await smsSend(env, SMS_FROM(env), text); } catch (e) {}
}
async function ofcExtend(env, t, months) {               // Pro 기간 = 남은 기간 끝에서부터 늘린다
  const o = await env.PUSH_DB.prepare("SELECT pro_until FROM ofc WHERE t = ?").bind(t).first();
  const from = Math.max(Date.now(), (o && o.pro_until) || 0), to = ofcAddMonths(from, months);
  await env.PUSH_DB.prepare("UPDATE ofc SET pro_until = ? WHERE t = ?").bind(to, t).run();
  return { from, to };
}
async function ofcBillPaid(env, id, mul) {               // 계좌 입금 확인 → 기간 늘리고 운영 수익(sales)에 적는다
  const db = env.PUSH_DB, b = await db.prepare("SELECT * FROM ofc_bill WHERE id = ? AND status = 'wait'").bind(id).first();
  if (!b) return null;
  await payReady(env);
  const { from, to } = await ofcExtend(env, b.t, b.months), now = Date.now();
  await db.batch([
    db.prepare("UPDATE ofc_bill SET status = 'paid', paid_at = ?, from_at = ?, to_at = ?, mul_no = ? WHERE id = ?").bind(now, from, to, mul, id),
    db.prepare("INSERT OR IGNORE INTO sales (mul_no, code, item, amount, day, at) VALUES (?, ?, 'ofc', ?, ?, ?)").bind(mul, "B" + id, b.amount, kstDay(), now),
  ]);
  return { ...b, from_at: from, to_at: to };
}
async function ofcPayFeedback(env, code, mul, state, price, rebillNo) {   // 페이앱 → 카드 매달 결제 한 건마다
  const db = env.PUSH_DB, p = await db.prepare("SELECT ref, amount FROM pay WHERE code = ? AND kind = 'ofc'").bind(code).first();
  await ofcReady(env);
  if (p && state === "4" && price === p.amount) {
    const o = (await db.prepare("SELECT bill_name, bill_no, bill_email FROM ofc WHERE t = ?").bind(p.ref).first()) || {}, now = Date.now();
    const r = await db.prepare("INSERT OR IGNORE INTO ofc_bill (t, kind, months, amount, status, code, mul_no, buyer, biz, email, created_at, paid_at) " +
      "VALUES (?, 'card', 1, ?, 'paid', ?, ?, ?, ?, ?, ?, ?)").bind(p.ref, price, code, mul, o.bill_name || "", o.bill_no || "", o.bill_email || "", now, now).run();
    if (r.meta.changes === 1) {
      const { from, to } = await ofcExtend(env, p.ref, 1);
      await db.batch([
        db.prepare("UPDATE ofc_bill SET from_at = ?, to_at = ? WHERE id = ?").bind(from, to, r.meta.last_row_id),
        db.prepare("UPDATE pay SET status = CASE WHEN status = 'stopped' THEN status ELSE 'active' END, paid_at = ?, rebill_no = CASE WHEN ? != '' THEN ? ELSE rebill_no END WHERE code = ?")
          .bind(now, rebillNo, rebillNo, code),
        db.prepare("INSERT OR IGNORE INTO sales (mul_no, code, item, amount, day, at) VALUES (?, ?, 'ofc', ?, ?, ?)").bind(mul, code, price, kstDay(), now),
      ]);
    }
  } else if (state === "9" || state === "64") {                            // 카드 취소 → 그 달만큼 기간·수익을 되돌린다
    const b = await db.prepare("SELECT id, t, from_at, to_at FROM ofc_bill WHERE mul_no = ? AND status = 'paid'").bind(mul).first();
    if (b) await db.batch([
      db.prepare("UPDATE ofc_bill SET status = 'cancel' WHERE id = ?").bind(b.id),
      db.prepare("UPDATE ofc SET pro_until = pro_until - ? WHERE t = ?").bind(b.to_at - b.from_at, b.t),
      db.prepare("UPDATE sales SET status = 'cancel' WHERE mul_no = ?").bind(mul),
    ]);
  }
  return new Response("SUCCESS", { headers: { "content-type": "text/plain" } });
}

// 주 = 한국 시각 월요일 0시부터 7일. w=0 이번 주, 1 지난주…
function ofcWeek(w) {
  const day = 86400e3, kst = Date.now() + 9 * 3600e3, dow = (new Date(kst).getUTCDay() + 6) % 7;
  const start = Math.floor(kst / day) * day - dow * day - 9 * 3600e3 - w * 7 * day;
  const days = [...Array(7)].map((_, i) => new Date(start + 9 * 3600e3 + i * day).toISOString().slice(0, 10));
  return { start, end: start + 7 * day, days };
}
// ponytail: 띄어쓰기로 자르고 흔한 조사만 떼는 단순 낱말 세기 — 형태소 분석이 아니라 '대충의 화제'만. 엉뚱한 낱말이 위에 뜨면 OFC_STOP 에 더할 것
const OFC_STOP = new Set(("의원 의원님 의원실 정말 진짜 너무 그냥 이번 지금 우리 국민 대한민국 생각 하는 있는 없는 합니다 입니다 해주세요 주세요 바랍니다 " +
  "하세요 같은 그리고 하지만 그런 이런 저런 많이 정치 국회 응원합니다 화이팅 감사합니다 어떻게 언제 왜 무엇 뭐").split(" "));
function ofcWords(texts) {
  const c = new Map();
  for (const x of texts) for (let w of x.replace(/[^가-힣a-zA-Z0-9\s]/g, " ").split(/\s+/)) {
    w = w.replace(/(으로|에서|에게|한테|까지|부터|이라|이나|처럼|보다|하고|이랑|은|는|이|가|을|를|에|의|도|로|와|과|요|만)$/, "");
    if (w.length < 2 || OFC_STOP.has(w) || /^\d+$/.test(w)) continue;
    c.set(w, (c.get(w) || 0) + 1);
  }
  return [...c].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => ({ w, n }));
}

// Claude — 의원실 답글 초안·주간 민심 요약. 키 = 워커 비밀값 ANTHROPIC_API_KEY(대표가 poc/setup_ai_secret.sh 로 등록), 없으면 'ai_off'.
// 짧은 글이라 effort low. 안전 분류기가 거절하면 서버가 다른 모델로 다시 돌린다(fallbacks: "default").
const OFC_AI_MODEL = "claude-opus-5-5";
async function ofcAi(env, system, user) {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "ai_off" };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY.trim() });   // 붙여 넣을 때 딸려 온 줄바꿈·공백 제거
  try {
    const res = await client.beta.messages.create({
      model: OFC_AI_MODEL, max_tokens: 16000, output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system, messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "ai_refused" };
    const text = res.content.filter((x) => x.type === "text").map((x) => x.text).join("").trim();
    return text ? { ok: true, text } : { ok: false, error: "ai_fail" };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "ai_busy" };
    if (e instanceof Anthropic.APIError) { console.log("ofc ai", e.status, e.message); return { ok: false, error: "ai_fail", detail: `${e.constructor.name} ${e.status} ${e.message}`.slice(0, 300) }; }   // detail 은 관리자 ai_test 에만 나간다
    throw e;
  }
}
const OFC_DRAFT_SYS = "당신은 대한민국 국회의원실의 소통 담당 보좌진입니다. 시민이 정치탈탈(국회 공개 데이터로 의원 의정활동을 보여 주는 사이트)의 의원 페이지에 남긴 한마디에 " +
  "의원실 이름으로 달 공식 답글 초안을 씁니다. 담당자가 읽고 고쳐서 올립니다.\n" +
  "- 두세 문장, 존댓말, 정중하고 담백하게. 시민의 말을 먼저 받아 주고 답합니다.\n" +
  "- 사실을 지어내지 마세요. 법안 이름·일정·숫자를 모르면 쓰지 말고 '확인해서 안내드리겠습니다'처럼 씁니다.\n" +
  "- 비판에는 변명하지 말고 사실과 앞으로의 노력으로 답합니다. 욕설은 따라 하지 않습니다.\n" +
  "- 다른 정당·정치인을 비방하지 않습니다. 지지 호소·투표 독려 같은 선거운동성 표현은 쓰지 않습니다.\n" +
  "- 개인 민원은 의원실 대표번호로 연락해 달라고 안내합니다.\n" +
  "- 답글 본문만 쓰세요. 인사말 머리표·따옴표·설명을 붙이지 마세요.";
const OFC_SUM_SYS = "당신은 국회의원실 보고서를 쓰는 보좌진입니다. 한 주 동안 시민이 의원 페이지에 남긴 한마디들을 의원께 보고할 요약으로 정리합니다.\n" +
  "- 주제별로 3~5개 항목. 항목마다 한 줄 제목과 한두 문장 설명, 대표 의견을 짧게 따옴표로 하나.\n" +
  "- 의견이 갈리면 양쪽을 모두 적습니다. 거친 표현은 '강한 비판' 정도로 순화합니다.\n" +
  "- 주어진 글에 없는 사실·숫자는 만들지 않습니다.\n" +
  "- 마지막 줄에 '의원실이 답하면 좋을 질문' 한두 개를 적습니다.\n" +
  "- 꾸밈 없는 한국어 평문으로, 항목은 '• '로 시작합니다.";

// 월요일 오전 9시(한국) — Pro 의원실 관리자에게 지난주 민심 요약 문자(한 주에 한 번)
async function ofcWeekly(env) {
  const kst = new Date(Date.now() + 9 * 3600e3);
  if (kst.getUTCDay() !== 1 || kst.getUTCHours() !== 9 || !smsOn(env)) return;
  await ofcReady(env);
  const db = env.PUSH_DB, k = "ofc_wk:" + kstDay();
  if (!(await db.prepare("INSERT OR IGNORE INTO kv (k, v) VALUES (?, '1')").bind(k).run()).meta.changes) return;
  const { start, end, days } = ofcWeek(1);
  const offices = (await db.prepare("SELECT t, name FROM ofc WHERE status = 'ok' AND pro_until > ? AND verified_at > ?").bind(Date.now(), Date.now() - OFC_REVERIFY).all()).results;
  for (const o of offices) {
    const c = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(NOT EXISTS(SELECT 1 FROM pc r WHERE r.parent = pc.id AND r.off = 1)), 0) AS open FROM pc " +
      "WHERE target = ? AND parent = 0 AND off = 0 AND status = 'visible' AND created_at >= ? AND created_at < ?").bind(o.t, start, end).first();
    const v = await db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM stats WHERE kind = 'path' AND key = ? AND day >= ? AND day <= ?")
      .bind("/politician/" + o.t.slice(2), days[0], days[6]).first();
    const owners = (await db.prepare("SELECT phone FROM ofc_mem WHERE t = ? AND role = 'owner' AND status = 'ok'").bind(o.t).all()).results;
    for (const w of owners) await smsSend(env, w.phone,
      `[정치탈탈] ${o.name} 의원실 지난주 민심\n한마디 ${c.n}개(답 안 함 ${c.open}개) · 페이지 조회 ${v.n.toLocaleString("ko-KR")}회\n리포트: politaltal.com/office/app`);
  }
}

// ── 의원실 센터 3단계: 성적표 위젯·의정보고 자료(카드뉴스·쇼츠 대본·보고서 초안) ──
// 의원 숫자 = generate.py 가 매일 쓰는 data/facts/코드.json(국회 공개 데이터), 소통 숫자 = D1(정치탈탈 집계)
const OFC_PASS = ["원안가결", "수정가결"], OFC_REFL = ["대안반영폐기", "수정안반영폐기"];
async function ofcFacts(env, origin, t) {
  if (!OFC_T.test(t)) return null;
  try { const r = await env.ASSETS.fetch(new Request(`${origin}/data/facts/${t.slice(2)}.json`)); return r.ok ? await r.json() : null; }
  catch (e) { return null; }
}
async function ofcKitData(env, origin, t, months) {        // months 0 = 22대 국회 전체
  const f = await ofcFacts(env, origin, t);
  if (!f) return null;
  await statsReady(env);
  const db = env.PUSH_DB, from = months ? new Date(ofcAddMonths(Date.now() + 9 * 3600e3, -months)).toISOString().slice(0, 10) : "2024-05-30";
  const fromTs = Date.parse(from + "T00:00:00+09:00"), L = f.list.map(([no, name, pd, res, rd]) => ({ no, name, pd, res, rd }));
  const c = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(EXISTS(SELECT 1 FROM pc r WHERE r.parent = pc.id AND r.off = 1)), 0) AS ans, " +
    "(SELECT COUNT(*) FROM pc WHERE target = ?1 AND off = 1 AND status = 'visible' AND created_at >= ?2) AS rep " +
    "FROM pc WHERE target = ?1 AND parent = 0 AND off = 0 AND status = 'visible' AND created_at >= ?2").bind(t, fromTs).first();
  const v = await db.prepare("SELECT COALESCE(SUM(CASE WHEN kind = 'path' THEN n END), 0) AS views, COALESCE(SUM(CASE WHEN kind = 'cheer' THEN n END), 0) AS cheer, " +
    "COALESCE(SUM(CASE WHEN kind = 'bomb' THEN n END), 0) AS bomb FROM stats WHERE ((kind = 'path' AND key = ?) OR (kind IN ('cheer', 'bomb') AND key = ?)) AND day >= ?")
    .bind("/politician/" + t.slice(2), t, from).first();
  delete f.list;
  return { f, months, from, to: kstDay(0),
    proposed: L.filter((b) => b.pd >= from),
    passed: L.filter((b) => OFC_PASS.includes(b.res) && b.rd >= from).sort((a, b) => (b.rd > a.rd ? 1 : -1)),
    reflected: L.filter((b) => OFC_REFL.includes(b.res) && b.rd >= from),
    talk: { comments: c.n, answered: c.ans, replies: c.rep, views: v.views, cheer: v.cheer, bomb: v.bomb } };
}
const OFC_KIT_SYS = "당신은 대한민국 국회의원실 보좌진입니다. 아래 '자료'(국회 공개 데이터와 정치탈탈 집계)만으로 의정활동 홍보물 초안을 씁니다. 의원실이 읽고 고쳐서 씁니다.\n" +
  "- 자료에 없는 사실·숫자·성과·일정을 지어내지 마세요. 법안은 이름에서 알 수 있는 만큼만 말하고, 효과나 통과 뒤 바뀐 점을 단정하지 마세요.\n" +
  "- '계류 중'인 법안을 통과된 것처럼 쓰지 마세요. '위원회 대안에 반영'은 따로 낸 법안의 내용이 위원회 대안에 담긴 것이라고 풀어 씁니다.\n" +
  "- 순위·최고·1위 같은 말은 자료에 있을 때만 씁니다.\n" +
  "- 다른 정당·정치인을 비방하거나 견주지 마세요. 지지 호소·투표 독려·'다시 뽑아 달라' 같은 선거운동 표현은 쓰지 마세요.\n" +
  "- 시민 한마디·답글·조회 숫자가 작으면(두 자리 미만) 숫자를 쓰지 말고, 의견을 남길 수 있는 곳을 안내하는 말로 대신합니다.\n" +
  "- 쉬운 말, 존댓말, 짧은 문장. 꾸밈 기호(**, #)는 아래에서 시킨 것만 씁니다.\n\n";
const OFC_KIT_ASK = {
  shorts: "세로 쇼츠(40~60초) 대본을 쓰세요.\n- 장면 6~8개. 장면마다 '장면 1' 처럼 번호 줄, '[화면] …' 한 줄, '[자막] …' 한 줄(15자 안팎), '[말] …' 한두 문장.\n" +
    "- 첫 장면은 3초 안에 숫자나 질문으로 궁금하게 엽니다.\n- 마지막 장면은 시민 의견을 듣겠다는 말로 맺습니다.\n- 맨 끝에 '제목: …', '설명: …' 두 줄을 붙입니다.",
  report: "의정활동 보고서 초안의 글 부분을 쓰세요. 숫자 표와 법안 목록은 따로 붙으니 숫자·법안 이름을 길게 늘어놓지 마세요.\n" +
    "- 네 단락. 단락마다 맨 앞에 '## 제목' 한 줄: ## 인사말 / ## 이 기간 의정활동 / ## 시민과의 소통 / ## 앞으로\n" +
    "- '이 기간 의정활동'은 법안을 분야별로 묶고, 통과한 것과 새로 낸 것을 구분합니다.\n- '앞으로'는 구체 약속 대신 계속 힘쓰겠다는 정도로.\n- 전체 700~1000자.",
};
function ofcKitText(k) {                                    // AI 에 넘길 자료 — 사실만
  const f = k.f, b = (x) => `「${x.name}」(${(x.rd || x.pd).slice(0, 7)})`;
  return `자료 (${k.from} ~ ${k.to}${k.months ? `, 최근 ${k.months}개월` : ", 22대 국회 전체"})\n` +
    `- 의원: ${f.name} 의원(${f.party}, ${f.district}${f.term ? ", " + f.term : ""})${f.committee ? `, 위원회: ${f.committee}` : ""}\n` +
    `- 이 기간 대표발의 ${k.proposed.length}건, 본회의 통과(가결) ${k.passed.length}건, 위원회 대안에 반영 ${k.reflected.length}건\n` +
    `- 22대 국회 전체: 대표발의 ${f.bills}건 중 그대로 통과 ${f.passed}건, 계류 중 ${f.pending}건, 본회의 표결 참여율 ${f.part_rate}%\n` +
    `- 발의 법안 분야(22대 전체, 많은 순): ${f.cats.map(([c, n]) => `${c} ${n}건`).join(", ") || "없음"}\n` +
    `- 이 기간 통과한 법안: ${k.passed.slice(0, 30).map(b).join(", ") || "없음"}\n` +
    `- 이 기간 위원회 대안에 반영된 법안: ${k.reflected.slice(0, 20).map(b).join(", ") || "없음"}\n` +
    `- 이 기간 새로 낸 법안: ${k.proposed.slice(0, 40).map((x) => `「${x.name}」(${x.res || "계류 중"})`).join(", ") || "없음"}\n` +
    `- 정치탈탈 의원 페이지(이 기간): 시민 한마디 ${k.talk.comments}개, 의원실 공식 답글 ${k.talk.replies}개, 페이지 조회 ${k.talk.views}회`;
}

// /ofc/* 2단계 길 — handleOfc 가 팀원 확인(m)까지 마친 뒤 부른다. 처리하지 않으면 null
async function handleOfc2(request, env, url, path, b, t, m, tels) {
  const db = env.PUSH_DB, now = Date.now(), post = request.method === "POST";
  const proOnly = () => (ofcPro(m) ? null : pj({ ok: false, error: "pro" }, 402));

  if (path === "/ofc/billing") {                             // 요금 탭 — 지금 요금제·결제 내역·계좌 안내
    await payReady(env);
    const o = await db.prepare("SELECT pro_until, bill_name, bill_no, bill_email FROM ofc WHERE t = ?").bind(t).first();
    const bills = (await db.prepare("SELECT id, kind, months, amount, status, payer, buyer, biz, email, tax, created_at, paid_at, from_at, to_at FROM ofc_bill WHERE t = ? ORDER BY id DESC LIMIT 60")
      .bind(t).all()).results;
    const sub = await db.prepare("SELECT code, paid_at FROM pay WHERE kind = 'ofc' AND ref = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(t).first();
    return pj({ ok: true, oname: m.oname, owner: m.role === "owner", pro_until: o.pro_until, price: OFC_PRICE, card: payOn(env), sub: sub || null,
      bank: await ofcKv(env, "ofc_bank"), profile: { name: o.bill_name, no: o.bill_no, email: o.bill_email }, bills });
  }
  if (path === "/ofc/weekly") {                              // 주간 민심 리포트(Pro) — /ofc/report 는 우선 신고
    const no = proOnly(); if (no) return no;
    const w = Math.min(Math.max(parseInt(url.searchParams.get("w") || "0", 10) || 0, 0), 26);
    const cur = ofcWeek(w), prev = ofcWeek(w + 1), key = "/politician/" + t.slice(2);
    const rows = (await db.prepare("SELECT id, body, likes, team, created_at AS at FROM pc WHERE target = ? AND parent = 0 AND off = 0 AND status = 'visible' AND created_at >= ? AND created_at < ?")
      .bind(t, prev.start, cur.end).all()).results;
    const ans = new Map((await db.prepare("SELECT parent, MIN(created_at) AS at FROM pc WHERE target = ? AND off = 1 GROUP BY parent").bind(t).all()).results.map((r) => [r.parent, r.at]));
    const these = rows.filter((r) => r.at >= cur.start), before = rows.filter((r) => r.at < cur.start);
    const answered = these.filter((r) => ans.has(r.id)), team = { b: 0, w: 0, r: 0, "": 0 };
    these.forEach((r) => { team[r.team in team ? r.team : ""]++; });
    const views = (await db.prepare("SELECT day, n FROM stats WHERE kind = 'path' AND key = ? AND day >= ? AND day <= ?").bind(key, prev.days[0], cur.days[6]).all()).results;
    const sum = (ds) => views.filter((v) => ds.includes(v.day)).reduce((a, v) => a + v.n, 0);
    const war = (await db.prepare("SELECT kind, SUM(n) AS n FROM stats WHERE kind IN ('cheer', 'bomb') AND key = ? AND day >= ? AND day <= ? GROUP BY kind")
      .bind(t, cur.days[0], cur.days[6]).all()).results;
    return pj({ ok: true, oname: m.oname, days: cur.days, comments: these.length, before: before.length, answered: answered.length,
      hours: answered.length ? Math.round(answered.reduce((a, r) => a + (ans.get(r.id) - r.at), 0) / answered.length / 360e4) / 10 : null,
      team, words: ofcWords(these.map((r) => r.body)),
      top: these.slice().sort((a, x) => x.likes - a.likes || x.id - a.id).slice(0, 5).map((r) => ({ ...r, done: ans.has(r.id) })),
      views: sum(cur.days), views_before: sum(prev.days), series: cur.days.map((d) => (views.find((v) => v.day === d) || { n: 0 }).n),
      cheer: (war.find((x) => x.kind === "cheer") || { n: 0 }).n, bomb: (war.find((x) => x.kind === "bomb") || { n: 0 }).n,
      ai: await ofcKv(env, `rep:${t}:${cur.days[0]}`), ai_on: !!env.ANTHROPIC_API_KEY });
  }
  if (path === "/ofc/posts") {                               // 소식 탭 — 우리가 올린 소식
    const rows = (await db.prepare("SELECT id, body, photos, yt, status, created_at AS at FROM ofc_post WHERE t = ? ORDER BY id DESC LIMIT 50").bind(t).all()).results;
    return pj({ ok: true, rows: rows.map((r) => ({ ...r, photos: JSON.parse(r.photos) })), quiet: !!(await ofcKv(env, "ofc_posts_off")), media: !!env.OFC_MEDIA });
  }
  const kitMonths = (v) => ([1, 3, 6, 12, 0].includes(+v) ? +v : 3);
  if (path === "/ofc/kit") {                                 // 의정보고 자료(Pro) — 카드뉴스·보고서 표에 쓸 숫자와 법안 목록
    const no = proOnly(); if (no) return no;
    const k = await ofcKitData(env, url.origin, t, kitMonths(url.searchParams.get("months")));
    return k ? pj({ ok: true, ...k, ai_on: !!env.ANTHROPIC_API_KEY, quiet: !!(await ofcKv(env, "ofc_posts_off")) }) : pj({ ok: false, error: "term" }, 404);
  }
  if (!post) return null;

  if (path === "/ofc/kit/ai" && OFC_KIT_ASK[b.kind]) {       // 쇼츠 대본·보고서 글 초안(Pro) — 자료에 있는 사실만으로
    const no = proOnly(); if (no) return no;
    if (!env.ANTHROPIC_API_KEY) return pj({ ok: false, error: "ai_off" }, 503);
    const k = await ofcKitData(env, url.origin, t, kitMonths(b.months));
    if (!k) return pj({ ok: false, error: "term" }, 404);
    if (!(await ofcCount(env, "ai:" + t, 40))) return pj({ ok: false, error: "slow" }, 429);
    const r = await ofcAi(env, OFC_KIT_SYS + OFC_KIT_ASK[b.kind], ofcKitText(k));
    return r.ok ? pj({ ok: true, text: r.text.slice(0, 6000) }) : pj({ ok: false, error: r.error }, 503);
  }

  if (path === "/ofc/pro/card") {                            // 카드 매달 자동결제 시작(첫 달은 등록하며 바로 결제)
    if (m.role !== "owner") return pj({ ok: false, error: "owner" }, 403);
    if (!payOn(env)) return pj({ ok: false, error: "pg_off" }, 503);
    await payReady(env);
    const phone = String(b.phone || "").replace(/\D/g, "");
    if (!OFC_PHONE.test(phone)) return pj({ ok: false, error: "phone" }, 400);
    if (await db.prepare("SELECT code FROM pay WHERE kind = 'ofc' AND ref = ? AND status = 'active'").bind(t).first()) return pj({ ok: false, error: "active" }, 409);
    const code = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x & 31]).join("");
    await db.prepare("INSERT INTO pay (code, amount, created_at, kind, ref) VALUES (?, ?, ?, 'ofc', ?)").bind(code, OFC_PRICE[1], now, t).run();
    const form = new URLSearchParams({
      cmd: "rebillRegist", userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY,
      goodname: `정치탈탈 의원실 Pro(${m.oname} 의원실)`, goodprice: String(OFC_PRICE[1]), recvphone: phone, smsuse: "n", openpaytype: "card",
      rebillCycleType: "Month", rebillCycleMonth: String(Math.min(+kstDay().slice(8, 10), 28)),
      rebillExpire: `${+kstDay().slice(0, 4) + 5}${kstDay().slice(4)}`, var1: code,
      feedbackurl: `${url.origin}/pay/feedback`, returnurl: `${url.origin}/office/app?paid=${code}`,
    });
    if (env.PAYAPP_SUBUSERID) form.set("subuserid", env.PAYAPP_SUBUSERID);
    const text = await (await fetch(PAYAPP_API, { method: "POST", body: form,
      headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8", accept: "application/json" } })).text();
    let d; try { d = JSON.parse(text); } catch { d = Object.fromEntries(new URLSearchParams(text)); }
    if (String(d.state) !== "1" || !d.payurl) {
      console.log("payapp ofc rebill fail", text.slice(0, 300));
      await db.prepare("DELETE FROM pay WHERE code = ?").bind(code).run();
      return pj({ ok: false, error: "pg" }, 502);
    }
    await db.prepare("UPDATE pay SET rebill_no = ? WHERE code = ?").bind(String(d.rebill_no || ""), code).run();
    return pj({ ok: true, payurl: d.payurl });
  }
  if (path === "/ofc/pro/stop") {                            // 카드 자동결제 해지 — 이미 낸 기간은 그대로
    if (m.role !== "owner") return pj({ ok: false, error: "owner" }, 403);
    const s = await db.prepare("SELECT code, rebill_no FROM pay WHERE kind = 'ofc' AND ref = ? AND status = 'active'").bind(t).first();
    if (!s) return pj({ ok: false, error: "invalid" }, 400);
    if (s.rebill_no) {
      const p = new URLSearchParams(await (await fetch(PAYAPP_API, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: new URLSearchParams({ cmd: "rebillCancel", userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY, rebill_no: s.rebill_no }) })).text());
      if (p.get("state") !== "1") { console.log("ofc rebillCancel fail", p.get("errorMessage")); return pj({ ok: false, error: "pg" }, 502); }
    }
    await db.prepare("UPDATE pay SET status = 'stopped' WHERE code = ?").bind(s.code).run();
    return pj({ ok: true });
  }
  if (path === "/ofc/pro/bank") {                            // 계좌이체 신청(1개월·12개월) — 운영자가 입금을 확인하면 열린다
    const months = b.months === 12 ? 12 : b.months === 1 ? 1 : 0;
    const payer = ofcText(b.payer, 20), buyer = ofcText(b.buyer, 40), biz = String(b.biz || "").replace(/[^\d-]/g, "").slice(0, 20);
    const email = String(b.email || "").trim().slice(0, 80);
    if (!months || payer.length < 2 || buyer.length < 2 || (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) return pj({ ok: false, error: "invalid" }, 400);
    await db.batch([
      db.prepare("DELETE FROM ofc_bill WHERE t = ? AND kind = 'bank' AND status = 'wait'").bind(t),
      db.prepare("INSERT INTO ofc_bill (t, kind, months, amount, status, payer, buyer, biz, email, mem_id, created_at) VALUES (?, 'bank', ?, ?, 'wait', ?, ?, ?, ?, ?, ?)")
        .bind(t, months, OFC_PRICE[months], payer, buyer, biz, email, m.id, now),
      db.prepare("UPDATE ofc SET bill_name = ?, bill_no = ?, bill_email = ? WHERE t = ?").bind(buyer, biz, email, t),
    ]);
    await ofcTell(env, `[정치탈탈 관리] ${m.oname} 의원실 Pro 계좌이체 신청\n${OFC_PRICE[months].toLocaleString("ko-KR")}원(${months}개월) · 입금자 ${payer}`);
    return pj({ ok: true });
  }
  if (path === "/ofc/pro/profile") {                         // 세금계산서·영수증 받을 곳(카드 결제에도 쓴다)
    const buyer = ofcText(b.buyer, 40), biz = String(b.biz || "").replace(/[^\d-]/g, "").slice(0, 20), email = String(b.email || "").trim().slice(0, 80);
    if (buyer.length < 2 || (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) return pj({ ok: false, error: "invalid" }, 400);
    await db.prepare("UPDATE ofc SET bill_name = ?, bill_no = ?, bill_email = ? WHERE t = ?").bind(buyer, biz, email, t).run();
    return pj({ ok: true });
  }
  if (path === "/ofc/upload") {                              // 소식 사진 — 폰에서 줄여서 올린다(2.5MB 까지, JPEG·PNG·WebP 만)
    const no = proOnly(); if (no) return no;
    if (!m.live) return pj({ ok: false, error: m.why }, 403);
    if (!env.OFC_MEDIA) return pj({ ok: false, error: "media_off" }, 503);
    const buf = new Uint8Array(await request.arrayBuffer());
    const ext = buf[0] === 0xff && buf[1] === 0xd8 ? "jpg" : buf[0] === 0x89 && buf[1] === 0x50 ? "png"
      : buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50 ? "webp" : "";
    if (!ext || buf.length < 500 || buf.length > 2.5e6) return pj({ ok: false, error: "invalid" }, 400);
    if (!(await ofcCount(env, "up:" + t, 60))) return pj({ ok: false, error: "slow" }, 429);
    const key = `p/${t.slice(2)}/${ofcRand(8)}.${ext}`;
    await env.OFC_MEDIA.put(key, buf, { httpMetadata: { contentType: ext === "jpg" ? "image/jpeg" : "image/" + ext } });
    return pj({ ok: true, key });
  }
  if (path === "/ofc/post") {                                // 의원실 소식 올리기(Pro) — 의원 페이지 소통 칸 맨 위에 '의원실 제공'으로
    const no = proOnly(); if (no) return no;
    if (!m.live) return pj({ ok: false, error: m.why }, 403);
    if (await ofcKv(env, "ofc_posts_off")) return pj({ ok: false, error: "quiet" }, 403);
    const body = ofcText(b.body, 1200), yt = ofcYt(b.yt);
    const photos = (Array.isArray(b.photos) ? b.photos : []).filter((k) => typeof k === "string" && OFC_KEY.test(k) && k.startsWith(`p/${t.slice(2)}/`)).slice(0, 4);
    if (body.length < 2 || body.length > 1000 || (b.yt && !yt)) return pj({ ok: false, error: "invalid" }, 400);
    if (!(await ofcCount(env, "post:" + t, 10))) return pj({ ok: false, error: "slow" }, 429);
    const r = await db.prepare("INSERT INTO ofc_post (t, body, photos, yt, mem_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(t, body, JSON.stringify(photos), yt, m.id, now).run();
    return pj({ ok: true, id: r.meta.last_row_id });
  }
  if (path === "/ofc/post/del" && Number.isInteger(b.id)) {
    const p = await db.prepare("SELECT photos FROM ofc_post WHERE id = ? AND t = ?").bind(b.id, t).first();
    if (!p) return pj({ ok: false, error: "invalid" }, 400);
    await db.prepare("DELETE FROM ofc_post WHERE id = ?").bind(b.id).run();
    if (env.OFC_MEDIA) for (const k of JSON.parse(p.photos)) await env.OFC_MEDIA.delete(k).catch(() => {});
    return pj({ ok: true });
  }
  if (path === "/ofc/draft" && Number.isInteger(b.id)) {    // AI 답글 초안(Pro) — 담당자가 고쳐서 올린다
    const no = proOnly(); if (no) return no;
    const c = await db.prepare("SELECT body FROM pc WHERE id = ? AND target = ? AND parent = 0 AND off = 0 AND status = 'visible'").bind(b.id, t).first();
    if (!c) return pj({ ok: false, error: "invalid" }, 400);
    if (!env.ANTHROPIC_API_KEY) return pj({ ok: false, error: "ai_off" }, 503);
    if (!(await ofcCount(env, "ai:" + t, 40))) return pj({ ok: false, error: "slow" }, 429);
    const reps = (await db.prepare("SELECT body, off FROM pc WHERE parent = ? AND status = 'visible' ORDER BY id LIMIT 10").bind(b.id).all()).results;
    const who = tels[t];
    const r = await ofcAi(env, OFC_DRAFT_SYS,
      `의원: ${who[0]} 의원(${who[1] || "무소속"}, ${who[2]})\n\n시민 한마디:\n${c.body}\n` +
      (reps.length ? `\n이미 달린 답글:\n${reps.map((x) => (x.off ? "[의원실] " : "[시민] ") + x.body).join("\n")}\n` : "") +
      "\n이 한마디에 달 의원실 공식 답글 초안을 써 주세요.");
    return r.ok ? pj({ ok: true, text: r.text.replace(/^["“]|["”]$/g, "").slice(0, 500) }) : pj({ ok: false, error: r.error }, 503);
  }
  if (path === "/ofc/weekly/ai") {                           // 이번 주(또는 지난주) 민심 AI 요약(Pro) — 한 주에 한 번 만들어 두고 다시 쓴다
    const no = proOnly(); if (no) return no;
    const w = b.w === 1 ? 1 : 0, wk = ofcWeek(w), k = `rep:${t}:${wk.days[0]}`;
    const old = await ofcKv(env, k);
    if (old && w === 1) return pj({ ok: true, text: old });
    const rows = (await db.prepare("SELECT body, likes FROM pc WHERE target = ? AND parent = 0 AND off = 0 AND status = 'visible' AND created_at >= ? AND created_at < ? ORDER BY likes DESC, id DESC LIMIT 200")
      .bind(t, wk.start, wk.end).all()).results;
    if (rows.length < 3) return pj({ ok: false, error: "few" }, 400);
    if (!env.ANTHROPIC_API_KEY) return pj({ ok: false, error: "ai_off" }, 503);
    if (!(await ofcCount(env, "ai:" + t, 40))) return pj({ ok: false, error: "slow" }, 429);
    const r = await ofcAi(env, OFC_SUM_SYS, `${tels[t][0]} 의원 페이지, ${wk.days[0]}~${wk.days[6]} 시민 한마디 ${rows.length}개(공감 많은 순):\n\n` +
      rows.map((x, i) => `${i + 1}. (공감 ${x.likes}) ${x.body}`).join("\n"));
    if (!r.ok) return pj({ ok: false, error: r.error }, 503);
    await db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").bind(k, r.text).run();
    return pj({ ok: true, text: r.text });
  }
  if (path === "/ofc/assign" && Number.isInteger(b.id)) {   // 담당자 배정(Pro) — mem 0 이면 풀기
    const no = proOnly(); if (no) return no;
    if (!(await db.prepare("SELECT id FROM pc WHERE id = ? AND target = ? AND parent = 0").bind(b.id, t).first())) return pj({ ok: false, error: "invalid" }, 400);
    if (!b.mem) { await db.prepare("DELETE FROM ofc_assign WHERE cid = ?").bind(b.id).run(); return pj({ ok: true }); }
    if (!Number.isInteger(b.mem) || !(await db.prepare("SELECT id FROM ofc_mem WHERE id = ? AND t = ? AND status = 'ok'").bind(b.mem, t).first()))
      return pj({ ok: false, error: "invalid" }, 400);
    await db.prepare("INSERT OR REPLACE INTO ofc_assign (cid, t, mem_id, at) VALUES (?, ?, ?, ?)").bind(b.id, t, b.mem, now).run();
    return pj({ ok: true });
  }
  return null;
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
        "SELECT id, target, parent, nick, body, status, reports, likes, off, orep, created_at FROM pc ORDER BY (status = 'visible' AND orep != '') DESC, (status = 'visible' AND reports > 0) DESC, id DESC LIMIT 200").all();
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
    if (body.op === "ofc_list") {
      await ofcReady(env);
      const db = env.PUSH_DB, tels = await ofcTel(env, url.origin);
      const apps = (await db.prepare("SELECT id, t, phone, name, role, status, ars_at, created_at FROM ofc_app WHERE status IN ('call', 'review') ORDER BY status = 'review' DESC, id DESC LIMIT 100").all()).results
        .map((a) => ({ ...a, who: (tels[a.t] || [a.t])[0], tel: (tels[a.t] || [])[3] || "" }));
      const offices = (await db.prepare("SELECT o.t, o.name, o.status, o.verified_at, o.pro_until, (SELECT COUNT(*) FROM ofc_mem m WHERE m.t = o.t AND m.status = 'ok') AS mem, " +
        "(SELECT COUNT(*) FROM pc WHERE pc.target = o.t AND pc.off = 1) AS replies FROM ofc o ORDER BY o.verified_at DESC").all()).results;
      return pj({ ok: true, apps, offices });
    }
    if (body.op === "ofc_ok" && Number.isInteger(body.id)) {         // ARS 를 통과한 신청만 — 신청자가 그 의원실 관리자(owner)가 된다
      await ofcReady(env);
      const db = env.PUSH_DB, a = await db.prepare("SELECT * FROM ofc_app WHERE id = ? AND status = 'review'").bind(body.id).first();
      const who = a && (await ofcTel(env, url.origin))[a.t];
      if (!who) return pj({ ok: false, error: "invalid" }, 400);
      const now = Date.now();
      await db.batch([
        db.prepare("INSERT INTO ofc (t, name, verified_at, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(t) DO UPDATE SET status = 'ok', name = excluded.name, verified_at = excluded.verified_at")
          .bind(a.t, who[0], a.ars_at, now),
        db.prepare("INSERT INTO ofc_mem (t, phone, name, role, created_at) VALUES (?, ?, ?, 'owner', ?) ON CONFLICT(t, phone) DO UPDATE SET status = 'ok', role = 'owner', name = excluded.name")
          .bind(a.t, a.phone, a.name, now),
        db.prepare("UPDATE ofc_app SET status = 'ok' WHERE id = ?").bind(a.id),
      ]);
      const sms = smsOn(env) ? await smsSend(env, a.phone, `[정치탈탈] ${who[0]} 의원실 인증이 끝났습니다.\n지금부터 시민 한마디에 공식 답글을 달 수 있습니다.\npolitaltal.com/office/app`) : { ok: false };
      return pj({ ok: true, sms: sms.ok });
    }
    if (body.op === "voice_test" && /^0\d{8,10}$/.test(String(body.to || ""))) {   // ARS 시험 전화(운영자 번호로) — 발신번호와 같은 번호에는 걸 수 없다
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1e4).padStart(4, "0");
      return pj({ ...(await ofcVoice(env, body.to, "시험", code)), code });
    }
    if (body.op === "ofc_bills") {                                   // Pro 결제: 계좌 입금 대기 먼저
      await ofcReady(env);
      const rows = (await env.PUSH_DB.prepare("SELECT b.*, o.name FROM ofc_bill b JOIN ofc o ON o.t = b.t ORDER BY (b.status = 'wait') DESC, b.id DESC LIMIT 100").all()).results;
      const posts = (await env.PUSH_DB.prepare("SELECT p.id, p.t, p.body, p.photos, p.yt, p.status, p.created_at, o.name FROM ofc_post p JOIN ofc o ON o.t = p.t ORDER BY p.id DESC LIMIT 50").all()).results;
      return pj({ ok: true, rows, posts, bank: await ofcKv(env, "ofc_bank"), quiet: !!(await ofcKv(env, "ofc_posts_off")) });
    }
    if (body.op === "ofc_bill_paid" && Number.isInteger(body.id)) {  // 계좌 입금 확인 → Pro 열고 신청한 사람에게 문자
      await ofcReady(env);
      const bill = await ofcBillPaid(env, body.id, "bank:" + body.id);
      if (!bill) return pj({ ok: false, error: "invalid" }, 400);
      const who = await env.PUSH_DB.prepare("SELECT m.phone, o.name FROM ofc_mem m JOIN ofc o ON o.t = m.t WHERE m.id = ?").bind(bill.mem_id).first();
      const sms = who && smsOn(env) ? await smsSend(env, who.phone, `[정치탈탈] ${who.name} 의원실 Pro 입금을 확인했습니다.\n` +
        `${new Date(bill.to_at + 9 * 3600e3).toISOString().slice(0, 10)}까지 Pro 를 쓰실 수 있습니다.\npolitaltal.com/office/app`) : { ok: false };
      return pj({ ok: true, sms: sms.ok });
    }
    if (body.op === "ofc_bill_tax" && Number.isInteger(body.id) && typeof body.on === "boolean") {   // 세금계산서 발행 표시(발행은 홈택스에서)
      await ofcReady(env);
      await env.PUSH_DB.prepare("UPDATE ofc_bill SET tax = ? WHERE id = ?").bind(body.on ? Date.now() : 0, body.id).run();
      return pj({ ok: true });
    }
    if (body.op === "ofc_bill_cancel" && Number.isInteger(body.id)) {
      await ofcReady(env);
      const r = await env.PUSH_DB.prepare("UPDATE ofc_bill SET status = 'cancel' WHERE id = ? AND status = 'wait'").bind(body.id).run();
      return pj({ ok: !!r.meta.changes });
    }
    if (body.op === "ofc_bank" && typeof body.text === "string" && body.text.length <= 120) {   // 의원실에 보여 줄 입금 계좌(빈 글 = 지우기)
      await pcReady(env);
      const v = body.text.replace(/[<>]/g, "").trim();
      await (v ? env.PUSH_DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('ofc_bank', ?)").bind(v) : env.PUSH_DB.prepare("DELETE FROM kv WHERE k = 'ofc_bank'")).run();
      return pj({ ok: true });
    }
    if (body.op === "ofc_quiet" && typeof body.off === "boolean") {  // 선거운동 기간 — 의원실 소식 쓰기·보이기를 멈춘다
      await pcReady(env);
      await (body.off ? env.PUSH_DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('ofc_posts_off', '1')") : env.PUSH_DB.prepare("DELETE FROM kv WHERE k = 'ofc_posts_off'")).run();
      return pj({ ok: true });
    }
    if (body.op === "ofc_grant" && OFC_T.test(String(body.t)) && Number.isInteger(body.days) && body.days > 0 && body.days <= 400) {   // 시범 의원실에 Pro 기간 주기(무료)
      await ofcReady(env);
      const r = await env.PUSH_DB.prepare("UPDATE ofc SET pro_until = MAX(pro_until, ?) + ? WHERE t = ?").bind(Date.now(), body.days * 86400e3, body.t).run();
      return pj({ ok: !!r.meta.changes });
    }
    if (body.op === "ai_test") {                                     // Claude 키·모델 확인용 — 가짜 한마디로 초안 한 번(키 값은 내보내지 않고 모양만)
      const k = String(env.ANTHROPIC_API_KEY || "");
      if (body.shape) return pj({ ok: true, len: k.length, kind: k.trim().slice(0, 10), space: /\s/.test(k) });
      if (OFC_KIT_ASK[body.kind] && OFC_T.test(String(body.t))) {     // 의정보고 AI(쇼츠·보고서)를 실제 의원 자료로 시험
        const kd = await ofcKitData(env, url.origin, body.t, [1, 3, 6, 12, 0].includes(body.months) ? body.months : 3);
        return kd ? pj(await ofcAi(env, OFC_KIT_SYS + OFC_KIT_ASK[body.kind], ofcKitText(kd))) : pj({ ok: false, error: "facts" }, 404);
      }
      return pj(await ofcAi(env, OFC_DRAFT_SYS, "의원: 시험 의원(무소속, 서울 시험구)\n\n시민 한마디:\n우리 동네 버스 배차 간격이 너무 길어요. 개선 계획이 있나요?\n\n이 한마디에 달 의원실 공식 답글 초안을 써 주세요."));
    }
    if (body.op === "ofc_post_hide" && Number.isInteger(body.id) && typeof body.hide === "boolean") {
      await ofcReady(env);
      await env.PUSH_DB.prepare("UPDATE ofc_post SET status = ? WHERE id = ?").bind(body.hide ? "hidden" : "ok", body.id).run();
      return pj({ ok: true });
    }
    if (body.op === "ofc_no" && Number.isInteger(body.id)) {
      await ofcReady(env);
      const r = await env.PUSH_DB.prepare("UPDATE ofc_app SET status = 'no' WHERE id = ? AND status IN ('call', 'review')").bind(body.id).run();
      return pj({ ok: !!r.meta.changes });
    }
    if (body.op === "ofc_off" && OFC_T.test(String(body.t)) && typeof body.off === "boolean") {   // 운영자 정지·해제(사칭·남용 때)
      await ofcReady(env);
      const r = await env.PUSH_DB.prepare("UPDATE ofc SET status = ? WHERE t = ?").bind(body.off ? "off" : "ok", body.t).run();
      return pj({ ok: !!r.meta.changes });
    }
    if (body.op === "pc_open" && typeof body.open === "boolean") {
      await pcReady(env);
      await (body.open ? env.PUSH_DB.prepare("DELETE FROM kv WHERE k = 'pc_closed'")
                       : env.PUSH_DB.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('pc_closed', '1')")).run();
      return pj({ ok: true, open: body.open });
    }
    if (body.op === "sales") {
      await env.PUSH_DB.exec(SALES_SQL);
      const { results } = await env.PUSH_DB.prepare("SELECT code, item, amount, team, fire, day, status FROM sales ORDER BY at DESC LIMIT 300").all();
      return pj({ ok: true, rows: results });
    }
    if (body.op === "wall_list") {
      await wallReady(env);
      const { results } = await env.PUSH_DB.prepare("SELECT id, name, msg, payer, status, created_at, team, sms_ok, thanked, reply FROM wall ORDER BY status DESC, id DESC LIMIT 800").all();
      return pj({ ok: true, rows: results });
    }
    if ((body.op === "wall_ok" || body.op === "wall_del") && Number.isInteger(body.id)) {
      await wallReady(env);
      const r = await (body.op === "wall_del"
        ? env.PUSH_DB.prepare("DELETE FROM wall WHERE id = ?").bind(body.id)
        : env.PUSH_DB.prepare("UPDATE wall SET status = 'ok', payer = '', approved_at = ? WHERE id = ? AND status = 'wait'").bind(Date.now(), body.id)).run();
      let sms = null;
      if (body.op === "wall_ok" && r.meta.changes === 1) {             // 후원 = 고른 성향에 화력 100(금액과 무관, 한 명당 한 번) + 감사 문자
        const w = await env.PUSH_DB.prepare("SELECT team FROM wall WHERE id = ?").bind(body.id).first();
        if (w && WAR_T.test(w.team)) await warAdd(env, w.team, 100);
        sms = await wallThanks(env, body.id);
      }
      return pj({ ok: true, sms });
    }
    if (body.op === "wall_team" && Number.isInteger(body.id) && WAR_T.test(body.team)) {   // 운영자가 대신 색 지정(화력 없음)
      await wallReady(env);
      await env.PUSH_DB.prepare("UPDATE wall SET team = ? WHERE id = ?").bind(body.team, body.id).run();
      return pj({ ok: true });
    }
    if (body.op === "wall_link" && Number.isInteger(body.id)) {      // 자리 링크(색 고르기용) — 연락처가 없는 후원자에게 대표가 직접 보낸다
      await wallReady(env);
      if (!(await wallTok(env, body.id))) return pj({ ok: false, error: "not found" }, 404);
      const c = [...crypto.getRandomValues(new Uint8Array(6))].map((x) => x.toString(16).padStart(2, "0")).join("");   // 새로 만들면 예전 링크는 무효
      await env.PUSH_DB.prepare("UPDATE wall SET claim = ? WHERE id = ?").bind(c, body.id).run();
      return pj({ ok: true, claim: `https://politaltal.com/supporters?claim=${c}` });
    }
    if (body.op === "wall_reply" && Number.isInteger(body.id) && typeof body.text === "string") {   // 방명록 운영자 답글(빈 글 = 지우기)
      await wallReady(env);
      await env.PUSH_DB.prepare("UPDATE wall SET reply = ? WHERE id = ?").bind(body.text.replace(/\s+/g, " ").trim().slice(0, 500), body.id).run();
      return pj({ ok: true });
    }
    if (body.op === "sms_status") {
      await wallReady(env);
      const { n } = await env.PUSH_DB.prepare("SELECT COUNT(*) AS n FROM wall WHERE status = 'ok' AND sms_ok = 1 AND phone != ''").first();
      return pj({ ok: true, on: smsOn(env), to: n });
    }
    if (body.op === "sms_blast" && typeof body.text === "string" && body.text.trim().length >= 5) {
      // 소식 일괄 — 같은 날 같은 글은 사람마다 한 번만(sms_log). 광고성이면 '(광고)'를 붙이고 밤 9시~아침 8시엔 막는다(정보통신망법).
      await wallReady(env);
      if (!smsOn(env)) return pj({ ok: false, error: "off" });
      const hour = new Date(Date.now() + 9 * 3600e3).getUTCHours();
      if (body.ad && (hour >= 21 || hour < 8)) return pj({ ok: false, error: "night" });
      const text = body.text.trim().slice(0, 900), blast = await sha16(text + kstDay());
      const { results } = await env.PUSH_DB.prepare("SELECT id, name, phone, tok FROM wall WHERE status = 'ok' AND sms_ok = 1 AND phone != '' ORDER BY id LIMIT 1000").all();
      let sent = 0, failed = 0, skipped = 0;
      for (const w of results) {
        const lock = await env.PUSH_DB.prepare("INSERT OR IGNORE INTO sms_log (blast, wid, at, ok) VALUES (?, ?, ?, 0)").bind(blast, w.id, Date.now()).run();
        if (!lock.meta.changes) { skipped++; continue; }
        const r = await smsSend(env, w.phone, (body.ad ? "(광고)" : "") + "[정치탈탈] " + text.replaceAll("{이름}", w.name) +
          `\n\n수신거부 ${stopUrl(w.tok || await wallTok(env, w.id))}`);
        await env.PUSH_DB.prepare("UPDATE sms_log SET ok = ? WHERE blast = ? AND wid = ?").bind(r.ok ? 1 : 0, blast, w.id).run();
        r.ok ? sent++ : failed++;
      }
      return pj({ ok: true, sent, failed, skipped });
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
// 화력 상점(게임 아이템) — [가격, 화력]. 이 돈은 운영 수익이라 후원 장부(ledger)가 아니라 sales 에 따로 적는다(후원금은 전액 좋은 일).
const FIRE_PACKS = { f1: [1000, 100], f5: [5000, 600], f10: [10000, 1500] };
const SALES_SQL = "CREATE TABLE IF NOT EXISTS sales (mul_no TEXT PRIMARY KEY, code TEXT NOT NULL, item TEXT NOT NULL, amount INTEGER NOT NULL, team TEXT NOT NULL DEFAULT '', fire INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'paid')";
async function fireFeedback(env, row, code, mul, state, price) {
  const db = env.PUSH_DB;
  if (state === "4" && price === row.amount) {
    const r = await db.prepare("INSERT OR IGNORE INTO sales (mul_no, code, item, amount, team, fire, day, at) VALUES (?, ?, 'fire', ?, ?, ?, ?, ?)")
      .bind(mul, code, price, row.team, row.fire, kstDay(), Date.now()).run();
    if (r.meta.changes === 1) {
      await warAdd(env, row.team, row.fire);
      await db.prepare("UPDATE pay SET status = 'paid', paid_at = ? WHERE code = ?").bind(Date.now(), code).run();
    }
  } else if (state === "9" || state === "64") {                         // 결제 취소 → 그날 화력도 회수
    const x = await db.prepare("SELECT team, fire, day FROM sales WHERE mul_no = ? AND status = 'paid'").bind(mul).first();
    if (x) {
      await db.prepare("UPDATE sales SET status = 'cancel' WHERE mul_no = ?").bind(mul).run();
      await warAdd(env, x.team, -x.fire, x.day);
      await db.prepare("UPDATE pay SET status = 'cancel' WHERE code = ?").bind(code).run();
    }
  }
  return new Response("SUCCESS", { headers: { "content-type": "text/plain" } });
}
let PAY_READY = false;
const payOn = (env) => !!(env.PAYAPP_USERID && env.PAYAPP_LINKKEY && env.PAYAPP_LINKVAL);

async function payReady(env) {
  if (PAY_READY) return;
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS pay (code TEXT PRIMARY KEY, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'wait', mul_no TEXT NOT NULL DEFAULT '', ledger_id INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, paid_at INTEGER NOT NULL DEFAULT 0)");
  // kind once/monthly · rebill_no = 페이앱 정기결제 번호. 실제 결제(첫 달·매달)는 pay_charges 에 결제번호(mul_no)마다 한 줄
  await env.PUSH_DB.prepare("ALTER TABLE pay ADD COLUMN kind TEXT NOT NULL DEFAULT 'once'").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE pay ADD COLUMN rebill_no TEXT NOT NULL DEFAULT ''").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE pay ADD COLUMN team TEXT NOT NULL DEFAULT ''").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE pay ADD COLUMN fire INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
  await env.PUSH_DB.prepare("ALTER TABLE pay ADD COLUMN ref TEXT NOT NULL DEFAULT ''").run().catch(() => {});      // kind 'ofc' = 의원실 t
  await env.PUSH_DB.exec(SALES_SQL);
  await env.PUSH_DB.exec("CREATE TABLE IF NOT EXISTS pay_charges (mul_no TEXT PRIMARY KEY, code TEXT NOT NULL, amount INTEGER NOT NULL, at INTEGER NOT NULL, ledger_id INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'paid')");
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
    const pack = b.item === "fire" ? FIRE_PACKS[b.pack] : null, team = WAR_T.test(b.team) ? b.team : "";
    if (b.item === "fire" && (!pack || !team)) return pj({ ok: false, error: "invalid" }, 400);
    const amount = pack ? pack[0] : Number(b.amount), phone = String(b.phone || "").replace(/\D/g, ""), monthly = !pack && b.monthly === true;
    if (!Number.isInteger(amount) || amount < 1000 || amount > 1000000 || !/^01[016789]\d{7,8}$/.test(phone))
      return pj({ ok: false, error: "invalid" }, 400);
    const { n } = await db.prepare("SELECT COUNT(*) AS n FROM pay WHERE status = 'wait' AND created_at > ?").bind(Date.now() - 86400e3).first();
    if (n >= 300) return pj({ ok: false, error: "busy" }, 429);          // 결제창 남발 방지(하루 300건)
    const code = [...crypto.getRandomValues(new Uint8Array(8))].map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x & 31]).join("");
    await db.prepare("INSERT INTO pay (code, amount, created_at, kind, team, fire) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(code, amount, Date.now(), pack ? "fire" : monthly ? "monthly" : "once", team, pack ? pack[1] : 0).run();
    const form = new URLSearchParams(monthly ? {
      // 매달 오늘과 같은 날(29~31일이면 28일) 자동 결제, 5년 뒤 자동 종료. 첫 결제는 카드 등록 때 바로
      cmd: "rebillRegist", userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY,
      goodname: "정치탈탈 정기 후원", goodprice: String(amount), recvphone: phone, smsuse: "n", openpaytype: "card",
      rebillCycleType: "Month", rebillCycleMonth: String(Math.min(+kstDay().slice(8, 10), 28)),
      rebillExpire: `${+kstDay().slice(0, 4) + 5}${kstDay().slice(4)}`, var1: code,
      feedbackurl: `${url.origin}/pay/feedback`,
      returnurl: `${url.origin}/donate.html?paid=${code}&m=1#sign`,
    } : {
      cmd: "payrequest", userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY,
      goodname: pack ? "정치탈탈 화력 지원(게임 아이템)" : "정치탈탈 후원", price: String(amount), recvphone: phone,
      smsuse: "n", openpaytype: "card", reqaddr: "0", var1: code,
      feedbackurl: `${url.origin}/pay/feedback`,
      returnurl: pack ? `${url.origin}/fire.html?paid=${code}` : `${url.origin}/donate.html?paid=${code}#sign`,
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
    await db.prepare("UPDATE pay SET mul_no = ?, rebill_no = ? WHERE code = ?").bind(String(d.mul_no || ""), String(d.rebill_no || ""), code).run();
    return pj({ ok: true, payurl: d.payurl, code });
  }

  if (path === "/pay/stop" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) return pj({ ok: false, error: "origin" }, 403);
    const b = await request.json().catch(() => ({}));
    const code = String(b.code || "");
    const row = /^[A-Z2-9]{8}$/.test(code) && await db.prepare("SELECT rebill_no, status FROM pay WHERE code = ? AND kind = 'monthly'").bind(code).first();
    if (!row) return pj({ ok: false, error: "not found" }, 404);
    if (row.status === "stopped") return pj({ ok: true, already: true });
    if (row.rebill_no) {
      const res = await fetch(PAYAPP_API, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded; charset=utf-8" },
        body: new URLSearchParams({ cmd: "rebillCancel", userid: env.PAYAPP_USERID, linkkey: env.PAYAPP_LINKKEY, rebill_no: row.rebill_no }) });
      const p = new URLSearchParams(await res.text());
      if (p.get("state") !== "1") { console.log("rebillCancel fail", p.get("errorMessage")); return pj({ ok: false, error: "pg" }, 502); }
    }
    await db.prepare("UPDATE pay SET status = 'stopped' WHERE code = ?").bind(code).run();
    return pj({ ok: true });
  }

  if (path === "/pay/feedback" && request.method === "POST") {
    const f = new URLSearchParams(await request.text());
    if (!f.get("linkval") || f.get("linkval") !== env.PAYAPP_LINKVAL) return new Response("AUTH_FAIL", { status: 401 });
    const code = String(f.get("var1") || ""), state = String(f.get("pay_state") || ""), price = Number(f.get("price") || f.get("goodprice"));
    const mul = String(f.get("mul_no") || code);
    const row = await db.prepare("SELECT kind, amount, status, team, fire FROM pay WHERE code = ?").bind(code).first();
    if (row && row.kind === "fire") return fireFeedback(env, row, code, mul, state, price);
    if (row && row.kind === "ofc") return ofcPayFeedback(env, code, mul, state, price, String(f.get("rebill_no") || ""));
    if (state === "4" && row && price === row.amount) {                   // 결제 완료 — 금액이 만든 값과 같을 때만, 결제번호마다 한 번만
      const r = await db.prepare("INSERT OR IGNORE INTO pay_charges (mul_no, code, amount, at) VALUES (?, ?, ?, ?)").bind(mul, code, price, Date.now()).run();
      if (r.meta.changes === 1) {
        const ins = await db.prepare("INSERT INTO ledger (kind, day, amount, channel, memo, link, created_at) VALUES ('in', ?, ?, 'card', ?, '', ?)")
          .bind(kstDay(), price, `카드${row.kind === "monthly" ? " 정기" : ""} ${code} · 수수료 빼기 전`, Date.now()).run();
        await db.batch([
          db.prepare("UPDATE pay_charges SET ledger_id = ? WHERE mul_no = ?").bind(ins.meta.last_row_id, mul),
          db.prepare("UPDATE pay SET status = ?, paid_at = ?, ledger_id = ?, rebill_no = CASE WHEN ? != '' THEN ? ELSE rebill_no END WHERE code = ?")
            .bind(row.kind === "monthly" ? (row.status === "stopped" ? "stopped" : "active") : "paid", Date.now(), ins.meta.last_row_id,
                  String(f.get("rebill_no") || ""), String(f.get("rebill_no") || ""), code),
        ]);
      }
    } else if (state === "9" || state === "64") {                         // 승인 취소 — 그 결제 건만 장부에서 뺀다
      const ch = await db.prepare("SELECT ledger_id FROM pay_charges WHERE mul_no = ? AND status = 'paid'").bind(mul).first();
      if (ch) await db.batch([
        db.prepare("UPDATE pay_charges SET status = 'cancel' WHERE mul_no = ?").bind(mul),
        db.prepare("DELETE FROM ledger WHERE id = ?").bind(ch.ledger_id),
        db.prepare("UPDATE pay SET status = 'cancel' WHERE code = ? AND kind = 'once'").bind(code),
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
    if (env.PUSH_DB) ctx.waitUntil(ofcWeekly(env).catch((e) => console.log("ofc weekly", e.message)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/news/")) {
      try { return await handleNews(request, env, url, ctx); } catch (e) { return pj({ ok: false, error: "server" }, 500); }
    }
    if (url.pathname === "/t") return handleHit(request, env, url).catch(NO_CONTENT);
    if (url.pathname === "/hot") return handleHot(env, url).catch(() => pj({ ok: false, error: "server" }, 500));
    const api = url.pathname.startsWith("/push/") ? handlePush : url.pathname.startsWith("/ledger/") ? handleLedger
      : url.pathname.startsWith("/wall/") ? handleWall : url.pathname.startsWith("/pc/") ? handlePc
      : url.pathname.startsWith("/pay/") ? handlePay : url.pathname.startsWith("/war/") ? handleWar
      : url.pathname.startsWith("/ofc/") ? handleOfc : null;
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
