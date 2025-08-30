// netlify/functions/refmap.js
// Простий key-value стор з Upstash Redis (free tier) або іншим KV.
// Задайте в налаштуваннях Netlify змінні оточення: UPSTASH_URL, UPSTASH_TOKEN.

export async function handler(event) {
  const { UPSTASH_URL, UPSTASH_TOKEN } = process.env;
  if (!UPSTASH_URL || !UPSTASH_TOKEN)
    return { statusCode: 501, body: JSON.stringify({ error: "KV not configured" }) };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${UPSTASH_TOKEN}`,
  };

  // GET /api/refmap?owner=EQxxxx -> { ref: EQyyyy|null }
  if (event.httpMethod === "GET") {
    const owner = (event.queryStringParameters?.owner || "").trim();
    if (!owner) return { statusCode: 400, body: JSON.stringify({ error: "owner required" }) };
    const key = `magt:ref:${owner}`;
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`);
    if (!res.ok) return { statusCode: 500, body: JSON.stringify({ error: "kv get failed" }) };
    const json = await res.json().catch(()=>({}));
    const ref = json?.result || null;
    return { statusCode: 200, body: JSON.stringify({ ref }) };
  }

  // POST { owner, ref }
  if (event.httpMethod === "POST") {
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}
    const owner = (body.owner || "").trim();
    const ref   = (body.ref || "").trim();
    if (!owner || !ref) return { statusCode: 400, body: JSON.stringify({ error: "owner/ref required" }) };
    const key = `magt:ref:${owner}`;
    // не перезаписуємо, якщо вже є (optional)
    const chk = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`);
    const ex  = chk.ok ? (await chk.json().catch(()=>({}))).result : null;
    if (ex) return { statusCode: 200, body: JSON.stringify({ ok:true, existed:true }) };

    const set = await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(ref)}`, { method: "POST", headers });
    if (!set.ok) return { statusCode: 500, body: JSON.stringify({ error: "kv set failed" }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
}
