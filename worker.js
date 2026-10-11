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
    if (body.op === "prune" && Array.isArray(body.tokens)) {      // 무효(삭제된 앱) 토큰 정리
      for (const t of body.tokens.slice(0, 500))
        await env.PUSH_DB.prepare("DELETE FROM push_tokens WHERE token = ?").bind(String(t)).run();
      return pj({ ok: true, pruned: Math.min(body.tokens.length, 500) });
    }
  }
  return pj({ ok: false, error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/push/")) {
      try { return await handlePush(request, env, url); }
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
