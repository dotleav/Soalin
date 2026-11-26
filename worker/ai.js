const CLASSAI_URL = "https://router.classai.id/v1/chat/completions";
const AI_MODEL = "claude-haiku-5.5";
const ALLOWED = ["https://dotleav.github.io", "https://soalin.onrender.com", "http://localhost:8000", "http://127.0.0.1:8000"];

export default {
  async fetch(req, env) {
    const origin = req.headers.get("origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (!ALLOWED.includes(origin)) return json({ error: "Origin tidak diizinkan." }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ error: "Method tidak diizinkan." }, 405);

    const { system = "", user = "", maxTokens = 4000 } = await req.json().catch(() => ({}));
    if (typeof user !== "string" || !user.trim() || user.length > 60000 || typeof system !== "string") {
      return json({ error: "Input tidak valid atau terlalu panjang." }, 400);
    }

    try {
      const r = await fetch(CLASSAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CLASSAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }],
          max_tokens: Math.min(Number(maxTokens) || 4000, 8000),
          temperature: 0.2,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return json({ error: data?.error?.message || `Router AI error ${r.status}` }, 502);
      return json({ text: data?.choices?.[0]?.message?.content || "" });
    } catch {
      return json({ error: "Gagal menghubungi AI." }, 502);
    }
  },
};
