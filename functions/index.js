// Hapus room yang sudah lebih dari 24 jam. Jalan tiap 60 menit.
// Deploy: firebase deploy --only database,functions (butuh paket Blaze).
const { onSchedule } = require("firebase-functions/v2/scheduler");
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
