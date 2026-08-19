// Uji end-to-end jalur produksi (handler Hono asli) terhadap DB Postgres lokal.
// Butuh: DATABASE_URL lokal + PGSSL=0. Jalankan: bun run scripts/e2e-billing-fixes.ts
import { createApp } from "../src/app.js";
import db from "../src/db/database.js";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin-token-valid";
let app: any;

async function api(method: string, path: string, body?: any) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["Authorization"] = "Bearer " + ADMIN_TOKEN;
  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await app.fetch(req);
  let json: any = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  app = await createApp();
  await db.query(`SELECT 1`).all(); // pastikan koneksi

  // ── Setup data test ──
  // Insert langsung via db.query (pakai shim produksi)
  const stRes = await db.query(`INSERT INTO stations (name, type, status) VALUES ('E2E-PS4', 'PS4', 'available') RETURNING id`).run();
  const stationId = stRes.lastInsertRowid!;
  const prRes = await db.query(`INSERT INTO timer_pricing (label, console_type, duration_minutes, price, type) VALUES ('E2E PKG', 'PS4', 60, 10000, 'package') RETURNING id`).run();
  const pricingId = prRes.lastInsertRowid!;
  // console_inventory PS4 = 1
  await db.query(`UPDATE console_inventory SET total_units=1 WHERE console_type='PS4'`).run();

  console.log("setup: station", stationId, "pricing", pricingId);

  // ── Test 1: start billing ──
  const startRes = await api("POST", "/api/billing/start", {
    station_id: stationId, pricing_id: pricingId, console_type: "PS4", customer_name: "E2E",
  });
  console.log("1) start:", startRes.status, JSON.stringify(startRes.json));
  const sessionId = startRes.json?.session_id;
  if (!sessionId) throw new Error("start gagal");

  // station harus in_use
  const stInUse = await db.query(`SELECT status FROM stations WHERE id=?`).get(stationId) as any;
  console.log("   station status:", stInUse.status, "(expect in_use)");

  // ── Test 2: dua stop paralel (simulasi retry Vercel) ──
  const [r1, r2] = await Promise.all([
    api("POST", `/api/billing/stop/${sessionId}`),
    api("POST", `/api/billing/stop/${sessionId}`),
  ]);
  console.log("2) stop parallel:", r1.status, r2.status, "| success:", r1.json?.success, r2.json?.success);

  const cfCount = await db.query(`SELECT COUNT(*) as c FROM cash_flow WHERE ref_id=?`).get(sessionId) as any;
  const sess = await db.query(`SELECT status FROM sessions WHERE id=?`).get(sessionId) as any;
  const stAfter = await db.query(`SELECT status FROM stations WHERE id=?`).get(stationId) as any;
  console.log("   cash_flow rows:", cfCount.c, "(expect 1) | session:", sess.status, "| station:", stAfter.status);
  const okIdempotent = Number(cfCount.c) === 1 && sess.status === "finished" && stAfter.status === "available";

  // ── Test 3: kapasitas — station available dengan sesi basi active ──
  // buat 2 sesi basi 'active' di station available (simulasi data lama)
  await db.query(`INSERT INTO sessions (station_id, console_type, pricing_id, status, start_time) VALUES (?, 'PS4', ?, 'active', NOW() - INTERVAL '5 days')`).run(stationId, pricingId);
  await db.query(`INSERT INTO sessions (station_id, console_type, pricing_id, status, start_time) VALUES (?, 'PS4', ?, 'active', NOW() - INTERVAL '3 days')`).run(stationId, pricingId);

  // start baru harus BERHASIL (karena station available; sesi basi tidak menghitung kuota)
  const start2 = await api("POST", "/api/billing/start", {
    station_id: stationId, pricing_id: pricingId, console_type: "PS4", customer_name: "E2E-2",
  });
  console.log("3) start with stale sessions:", start2.status, "(expect 200)");
  const okCapacity = start2.status === 200;

  // stop sesi kedua (otomatis menutup semua sesi active lain di station)
  const session2 = start2.json?.session_id;
  await api("POST", `/api/billing/stop/${session2}`);
  const activeLeft = await db.query(`SELECT COUNT(*) as c FROM sessions WHERE station_id=? AND status='active'`).get(stationId) as any;
  console.log("   active sessions left after stop:", activeLeft.c, "(expect 0)");
  const okCleanup = Number(activeLeft.c) === 0;

  // ── Cleanup ──
  await db.query(`DELETE FROM cash_flow WHERE ref_id IN (?, ?)`).run(sessionId, session2);
  await db.query(`DELETE FROM orders WHERE station_id=?`).run(stationId);
  await db.query(`DELETE FROM sessions WHERE station_id=?`).run(stationId);
  await db.query(`DELETE FROM stations WHERE id=?`).run(stationId);
  await db.query(`DELETE FROM timer_pricing WHERE id=?`).run(pricingId);
  await db.query(`UPDATE console_inventory SET total_units=0 WHERE console_type='PS4'`).run();

  const ok = okIdempotent && okCapacity && okCleanup;
  console.log(ok ? "\n✅ PASS: semua fix terverifikasi via handler Hono asli" : "\n❌ FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error("E2E ERROR:", e);
  process.exit(1);
});
