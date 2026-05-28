// 정치탈탈 커뮤니티 실시간 댓글 API (Cloudflare Pages Function)
// D1 바인딩 필요: 변수명 DB  (대시보드 → Pages → Settings → Functions → D1 bindings)
//
// 엔드포인트:
//   GET  /api/comments  → 최근 50개 댓글
//   POST /api/comments  { body: "내용" } → 댓글 작성 (닉네임 자동 부여)

const NICKS = [
  "관심시민", "데이터러버", "우리동네유권자", "팩트체커",
  "초보관찰자", "조용한관전러", "숫자로보는유권자", "동네지킴이",
];
const MAX_LEN = 500;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function sha256short(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

// 제어문자 제거 (탭/개행/캐리지리턴은 허용) — 소스에 제어문자를 넣지 않기 위해 charCode로 필터
function stripControls(s) {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 32 || c === 9 || c === 10 || c === 13) out += ch;
  }
  return out;
}

// GET: 최근 댓글 목록
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: "db_not_bound" }, 503);
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, nickname, body, created_at FROM comments WHERE status = 'visible' ORDER BY created_at DESC LIMIT 50"
    ).all();
    return json({ ok: true, comments: results || [] });
  } catch (e) {
    return json({ ok: false, error: "db_error", detail: String(e) }, 500);
  }
}

// POST: 댓글 작성
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "db_not_bound" }, 503);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  let body = (data.body || "").toString().trim();
  if (!body) return json({ ok: false, error: "empty" }, 400);
  if (body.length > MAX_LEN) body = body.slice(0, MAX_LEN);
  body = stripControls(body);
  if (!body) return json({ ok: false, error: "empty" }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = ip ? await sha256short(ip) : "";
  const now = Date.now();

  // 간단한 레이트리밋: 같은 IP가 5초 내 재작성 시 거부
  if (ipHash) {
    try {
      const recent = await env.DB.prepare(
        "SELECT created_at FROM comments WHERE ip_hash = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(ipHash).first();
      if (recent && now - recent.created_at < 5000) {
        return json({ ok: false, error: "too_fast" }, 429);
      }
    } catch (e) {
      // 무시하고 진행
    }
  }

  const nickname = NICKS[Math.floor(Math.random() * NICKS.length)] + (Math.floor(Math.random() * 900) + 100);

  try {
    const res = await env.DB.prepare(
      "INSERT INTO comments (nickname, body, created_at, ip_hash) VALUES (?, ?, ?, ?)"
    ).bind(nickname, body, now, ipHash).run();
    return json({
      ok: true,
      comment: { id: res.meta.last_row_id, nickname, body, created_at: now },
    });
  } catch (e) {
    return json({ ok: false, error: "db_error", detail: String(e) }, 500);
  }
}
