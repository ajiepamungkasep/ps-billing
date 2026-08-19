// Salin bersih test-stop-idempotency (tanpa dekorasi debug)
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
const sql = postgres(connectionString, { max: 1, prepare: false, ssl: false });

async function main() {
  const [station] = await sql`INSERT INTO stations (name, type, status) VALUES ('TEST-STOP-' || floor(random()*100000), 'PS4', 'available') RETURNING id`;
  const [pricing] = await sql`INSERT INTO timer_pricing (label, console_type, duration_minutes, price, type) VALUES ('TEST PKG', 'PS4', 60, 1000, 'package') RETURNING id`;
  const [session] = await sql`INSERT INTO sessions (station_id, console_type, pricing_id, status, start_time) VALUES (${station.id}, 'PS4', ${pricing.id}, 'active', NOW() - INTERVAL '30 minutes') RETURNING id`;
  const sessionId = session.id;
  console.log("setup ok, sessionId =", sessionId);

  const stop = async () => {
    const [s] = await sql`SELECT id, status FROM sessions WHERE id=${sessionId} AND status='active' FOR UPDATE`;
    if (!s) return { stopped: false };
    await sql`UPDATE sessions SET status='finished', end_time=NOW(), duration_minutes=30, total_price=1000 WHERE id=${sessionId}`;
    await sql`UPDATE stations SET status='available' WHERE id=${station.id}`;
    await sql`INSERT INTO cash_flow (type, category, amount, description, ref_id) VALUES ('income', 'billing', 1000, 'TEST', ${sessionId})`;
    return { stopped: true };
  };

  const results = [];
  results.push(await stop());
  results.push(await stop());

  const cfCount = await sql`SELECT COUNT(*)::int as c FROM cash_flow WHERE ref_id=${sessionId}`;
  const sessStatus = await sql`SELECT status FROM sessions WHERE id=${sessionId}`;

  console.log("stop results:", JSON.stringify(results));
  console.log("cash_flow rows:", cfCount[0].c, "| session status:", sessStatus[0].status);

  const ok = results.filter((r) => r.stopped).length === 1 && cfCount[0].c === 1 && sessStatus[0].status === "finished";
  console.log(ok ? "PASS" : "FAIL");

  await sql`DELETE FROM cash_flow WHERE ref_id=${sessionId}`;
  await sql`DELETE FROM sessions WHERE id=${sessionId}`;
  await sql`DELETE FROM stations WHERE id=${station.id}`;
  await sql`DELETE FROM timer_pricing WHERE id=${pricing.id}`;
  await sql.end();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERR:", e.message);
  await sql.end();
  process.exit(1);
});
