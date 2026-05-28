// 정치탈탈 댓글 신고 API (Cloudflare Pages Function)
// POST /api/report  { id: 123 }  → 신고 누적, 3회 이상이면 자동 숨김

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "db_not_bound" }, 503);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const id = parseInt(data.id, 10);
  if (!id) return json({ ok: false, error: "bad_id" }, 400);

  try {
    await env.DB.prepare(
      "UPDATE comments SET report_count = report_count + 1, " +
      "status = CASE WHEN report_count + 1 >= 3 THEN 'hidden' ELSE status END " +
      "WHERE id = ?"
    ).bind(id).run();
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "db_error", detail: String(e) }, 500);
  }
}
