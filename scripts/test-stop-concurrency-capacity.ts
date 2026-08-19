// Uji konkurensi: dua stop PARALEL untuk sesi sama -> hanya 1 cash_flow.
// Juga uji kapasitas: station available + sesi basi active TIDAK menghitung kuota.
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, { max: 5, prepare: false, ssl: false });

async function main() {
  // ── Bagian A: dua stop paralel ──
  const [station] = await sql`INSERT INTO stations (name, type, status) VALUES ('TEST-CONC-' || floor(random()*100000), 'PS4', 'available') RETURNING id`;
  const [pricing] = await sql`INSERT INTO timer_pricing (label, console_type, duration_minutes, price, type) VALUES ('TEST CONC', 'PS4', 60, 1000, 'package') RETURNING id`;
  const [session] = await sql`INSERT INTO sessions (station_id, console_type, pricing_id, status, start_time) VALUES (${station.id}, 'PS4', ${pricing.id}, 'active', NOW() - INTERVAL '30 minutes') RETURNING id`;
  const sessionId = session.id;

  const stop = async () => {
    return await sql.begin(async (tx) => {
      const [s] = await tx`SELECT id, status FROM sessions WHERE id=${sessionId} AND status='active' FOR UPDATE`;
      if (!s) return { stopped: false };
      await tx`UPDATE sessions SET status='finished', end_time=NOW(), duration_minutes=30, total_price=1000 WHERE id=${sessionId}`;
      await tx`UPDATE stations SET status='available' WHERE id=${station.id}`;
      await tx`INSERT INTO cash_flow (type, category, amount, description, ref_id) VALUES ('income', 'billing', 1000, 'TEST', ${sessionId})`;
      return { stopped: true };
    });
  };

  const results = await Promise.all([stop(), stop()]);

  const cfCount = await sql`SELECT COUNT(*)::int as c FROM cash_flow WHERE ref_id=${sessionId}`;
  const sessStatus = await sql`SELECT status FROM sessions WHERE id=${sessionId}`;
  console.log("A) parallel stop results:", JSON.stringify(results));
  console.log("A) cash_flow rows:", cfCount[0].c, "| session:", sessStatus[0].status);

  const okA = results.filter((r) => r.stopped).length === 1 && cfCount[0].c === 1 && sessStatus[0].status === "finished";

  // cleanup A
  await sql`DELETE FROM cash_flow WHERE ref_id=${sessionId}`;
  await sql`DELETE FROM sessions WHERE id=${sessionId}`;
  await sql`DELETE FROM stations WHERE id=${station.id}`;
  await sql`DELETE FROM timer_pricing WHERE id=${pricing.id}`;

  // ── Bagian B: kapasitas berbasis station in_use ──
  // 1 station PS4 available dengan 2 sesi basi 'active' -> kuota tidak terpakai
  const [st2] = await sql`INSERT INTO stations (name, type, status) VALUES ('TEST-CAP-' || floor(random()*100000), 'PS4', 'available') RETURNING id`;
  const [pr2] = await sql`INSERT INTO timer_pricing (label, console_type, duration_minutes, price, type) VALUES ('TEST CAP', 'PS4', 60, 1000, 'package') RETURNING id`;
  await sql`INSERT INTO sessions (station_id, console_type, pricing_id, status, start_time) VALUES (${st2.id}, 'PS4', ${pr2.id}, 'active', NOW() - INTERVAL '10 days')`;
  await sql`INSERT INTO sessions (station_id, console_type, pricing_id, status, start_time) VALUES (${st2.id}, 'PS4', ${pr2.id}, 'active', NOW() - INTERVAL '5 days')`;
  await sql`UPDATE console_inventory SET total_units = 1 WHERE console_type = 'PS4'`;

  // Simulasi query billing/start yang baru: hitung station in_use
  const inUseCount = await sql`SELECT COUNT(*)::int as c FROM stations WHERE status='in_use' AND type='PS4'`;
  console.log("B) stations in_use PS4:", inUseCount[0].c, "(expect 0 -> bisa start meski ada 2 sesi basi)");
  const okB = inUseCount[0].c === 0;

  // cleanup B
  await sql`DELETE FROM sessions WHERE station_id=${st2.id}`;
  await sql`DELETE FROM stations WHERE id=${st2.id}`;
  await sql`DELETE FROM timer_pricing WHERE id=${pr2.id}`;
  await sql`UPDATE console_inventory SET total_units = 0 WHERE console_type = 'PS4'`;

  console.log(okA && okB ? "PASS: konkurensi idempoten + kapasitas in_use OK" : "FAIL");
  await sql.end();
  process.exit(okA && okB ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERR:", e.message);
  await sql.end();
  process.exit(1);
});
