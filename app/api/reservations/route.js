// This route runs on Vercel's server (Node.js), not in the browser -- so
// none of the iOS Safari/WebKit-specific fetch quirks we ran into apply
// here. The browser only ever talks to our own domain (same-origin,
// nothing cross-site, no CORS involved at all); this route then forwards
// the actual write to Supabase from the server side.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function forward(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request) {
  const { rows } = await request.json();
  const result = await forward("POST", "reservations", rows);
  if (!result.ok) return jsonResponse({ error: result.text || `HTTP ${result.status}` }, result.status);
  return jsonResponse({ ok: true }, 200);
}

export async function PATCH(request) {
  const { id, patch } = await request.json();
  const result = await forward("PATCH", `reservations?id=eq.${id}`, patch);
  if (!result.ok) return jsonResponse({ error: result.text || `HTTP ${result.status}` }, result.status);
  return jsonResponse({ ok: true }, 200);
}

export async function DELETE(request) {
  const { id } = await request.json();
  const result = await forward("DELETE", `reservations?id=eq.${id}`);
  if (!result.ok) return jsonResponse({ error: result.text || `HTTP ${result.status}` }, result.status);
  return jsonResponse({ ok: true }, 200);
}
