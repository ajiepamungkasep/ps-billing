import { Hono } from "hono";
import db from "../db/database";
import { parseSqliteDateTime, readJsonBody, toPositiveInteger } from "../utils";

const billing = new Hono();

billing.post("/start", async (c) => {
  const body = await readJsonBody<{ station_id?: number; pricing_id?: number; customer_name?: string; notes?: string; timerMode?: string; custom_duration_minutes?: number }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);

  const { station_id, pricing_id, customer_name, notes, timerMode, custom_duration_minutes } = body.data;
  const safeStationId = toPositiveInteger(station_id);
  const safePricingId = toPositiveInteger(pricing_id);
  if (!safeStationId || !safePricingId) return c.json({ success: false, error: "station_id & pricing_id required" }, 400);

  const safeCustomDuration = custom_duration_minutes ? toPositiveInteger(custom_duration_minutes) : null;
  const station = (await db.query(`SELECT * FROM stations WHERE id=?`).get(safeStationId)) as any;
  if (!station) return c.json({ success: false, error: "Station tidak ditemukan" }, 404);
  if (station.status === "in_use") return c.json({ success: false, error: "Station sedang dipakai" }, 400);

  const pricing = (await db.query(`SELECT * FROM timer_pricing WHERE id=?`).get(safePricingId)) as any;
  if (!pricing) return c.json({ success: false, error: "Paket tidak ditemukan" }, 404);

  const session = await db.query(`INSERT INTO sessions (station_id, pricing_id, customer_name, notes, custom_duration_minutes) VALUES (?, ?, ?, ?, ?)`).run(safeStationId, safePricingId, customer_name || null, notes || null, safeCustomDuration);
  await db.query(`UPDATE stations SET status='in_use' WHERE id=?`).run(safeStationId);

  return c.json({ success: true, session_id: session.lastInsertRowid, station: station.name, pricing: pricing.label, start_time: new Date().toISOString(), timerMode });
});

billing.post("/stop/:session_id", async (c) => {
  const sessionId = c.req.param("session_id");
  const session = (await db.query(`SELECT s.*, tp.price, tp.duration_minutes, tp.type as pricing_type, tp.label FROM sessions s LEFT JOIN timer_pricing tp ON tp.id = s.pricing_id WHERE s.id=? AND s.status='active'`).get(sessionId)) as any;
  if (!session) return c.json({ success: false, error: "Session tidak ditemukan atau sudah selesai" }, 404);

  const start = parseSqliteDateTime(session.start_time);
  if (!start) return c.json({ success: false, error: "Waktu mulai sesi tidak valid" }, 500);
  const diffMinutes = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 60000));
  const billingTotal = session.pricing_type === "open" ? Math.ceil(diffMinutes / 60) * Number(session.price) : Number(session.price);

  const orderTotal = Number(((await db.query(`SELECT COALESCE(SUM(subtotal), 0) as total FROM orders WHERE session_id=?`).get(sessionId)) as any)?.total || 0);
  const grandTotal = billingTotal + orderTotal;

  await db.query(`UPDATE sessions SET status='finished', end_time=NOW(), duration_minutes=?, total_price=? WHERE id=?`).run(diffMinutes, grandTotal, sessionId);
  await db.query(`UPDATE stations SET status='available' WHERE id=?`).run(session.station_id);
  await db.query(`INSERT INTO cash_flow (type, category, amount, description, ref_id) VALUES ('income', 'billing', ?, ?, ?)`).run(grandTotal, `Sesi ${session.label} - ${session.customer_name || "Guest"}`, sessionId);

  return c.json({ success: true, session_id: sessionId, duration_minutes: diffMinutes, billing_price: billingTotal, order_total: orderTotal, grand_total: grandTotal });
});

billing.get("/active", async (c) => {
  const rows = await db.query(`
    SELECT s.*, st.name as station_name, st.type as station_type, tp.label as pricing_label,
      tp.price as pricing_price, tp.type as pricing_type,
      COALESCE(s.custom_duration_minutes, tp.duration_minutes) as duration_minutes,
      ROUND(EXTRACT(EPOCH FROM (NOW() - s.start_time))/60) as elapsed_minutes
    FROM sessions s
    JOIN stations st ON st.id = s.station_id
    LEFT JOIN timer_pricing tp ON tp.id = s.pricing_id
    WHERE s.status='active'
    ORDER BY s.start_time
  `).all();
  return c.json({ success: true, data: rows });
});

billing.get("/history", async (c) => {
  const limit = c.req.query("limit") || "50";
  const start = c.req.query("start");
  const end = c.req.query("end");
  let query = `SELECT s.*, st.name as station_name, tp.label as pricing_label FROM sessions s JOIN stations st ON st.id = s.station_id LEFT JOIN timer_pricing tp ON tp.id = s.pricing_id WHERE s.status='finished'`;
  const params: any[] = [];
  if (start && end) { query += ` AND DATE(s.start_time) BETWEEN ? AND ?`; params.push(start, end); }
  else if (c.req.query("date")) { query += ` AND DATE(s.start_time) = ?`; params.push(c.req.query("date")); }
  query += ` ORDER BY s.end_time DESC LIMIT ?`;
  params.push(Math.min(parseInt(limit, 10) || 50, 500));
  const rows = await db.query(query).all(...params);
  return c.json({ success: true, data: rows });
});

export default billing;
