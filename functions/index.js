// Hapus room yang sudah lebih dari 24 jam. Jalan tiap 60 menit.
// Proxy AI (aiChat): browser tidak pernah memegang kunci Classai; kunci disimpan sebagai Secret.
// Deploy: firebase functions:secrets:set CLASSAI_KEY
//         firebase deploy --only database,functions   (butuh paket Blaze)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

exports.cleanupRooms = onSchedule("every 60 minutes", async () => {
  const cutoff = Date.now() - MAX_AGE_MS;
  const snap = await admin.database().ref("rooms").orderByChild("meta/createdAt").endAt(cutoff).get();
  const updates = {};
  snap.forEach((room) => { updates[room.key] = null; });
  if (Object.keys(updates).length) await admin.database().ref("rooms").update(updates);
});

// ── AI proxy ke Classai Router (OpenAI-compatible) ──────────────────────
const CLASSAI_KEY = defineSecret("CLASSAI_KEY");
const CLASSAI_URL = "https://router.classai.id/v1/chat/completions";
const AI_MODEL = "claude-haiku-5.5"; // ganti kalau mau model lain, mis. claude-sonnet-5.5
const ALLOWED_ORIGINS = ["https://dotleav.github.io", "https://soalin-abcd.onrender.com", "http://localhost:8000", "http://127.0.0.1:8000"];
const MAX_INPUT_CHARS = 60000;
const MAX_OUTPUT_TOKENS = 8000;

exports.aiChat = onRequest(
  { region: "asia-southeast1", secrets: [CLASSAI_KEY], timeoutSeconds: 120, maxInstances: 10 },
  async (req, res) => {
    const origin = req.get("origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);
    if (allowed) res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (!allowed) return res.status(403).json({ error: "Origin tidak diizinkan." });
    if (req.method !== "POST") return res.status(405).json({ error: "Method tidak diizinkan." });

    const { system = "", user = "", maxTokens = 4000 } = req.body || {};
    if (typeof user !== "string" || !user.trim() || user.length > MAX_INPUT_CHARS || typeof system !== "string") {
      return res.status(400).json({ error: "Input tidak valid atau terlalu panjang." });
    }

    try {
      const r = await fetch(CLASSAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${CLASSAI_KEY.value()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: user },
          ],
          max_tokens: Math.min(Number(maxTokens) || 4000, MAX_OUTPUT_TOKENS),
          temperature: 0.2,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: data?.error?.message || `Router AI error ${r.status}` });
      res.json({ text: data?.choices?.[0]?.message?.content || "" });
    } catch (e) {
      res.status(502).json({ error: "Gagal menghubungi AI." });
    }
  }
);
