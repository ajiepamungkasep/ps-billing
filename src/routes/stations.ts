// src/routes/stations.ts
import { Hono } from "hono";
import db from "../db/database";
import { readJsonBody } from "../utils";

const stations = new Hono();

stations.get("/", async (c) => {
  const rows = await db.query(`
    SELECT 
      s.*,
      sess.id as session_id,
      sess.customer_name,
      sess.start_time,
      sess.pricing_id,
      tp.label as pricing_label,
      COALESCE(sess.custom_duration_minutes, tp.duration_minutes) as duration_minutes,
      tp.price as pricing_price,
      tp.type as pricing_type
    FROM stations s
    LEFT JOIN sessions sess ON sess.station_id = s.id AND sess.status = 'active'
    LEFT JOIN timer_pricing tp ON tp.id = sess.pricing_id
    ORDER BY s.id
  `).all();
  return c.json({ success: true, data: rows });
});

stations.post("/", async (c) => {
  const body = await readJsonBody<{ name?: string; type?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { name, type } = body.data;
  if (!name || !type) return c.json({ success: false, error: "name & type required" }, 400);
  const result = await db.query(`INSERT INTO stations (name, type) VALUES (?, ?)`).run(name, type);
  return c.json({ success: true, id: result.lastInsertRowid });
});

stations.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonBody<{ name?: string; type?: string; status?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { name, type, status } = body.data;
  if (!name || !type || !status) return c.json({ success: false, error: "name, type, status required" }, 400);
  await db.query(`UPDATE stations SET name=?, type=?, status=? WHERE id=?`).run(name, type, status, id);
  return c.json({ success: true });
});

stations.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ success: false, error: "ID station tidak valid" }, 400);

  try {
    const activeSession = (await db.query(`SELECT id FROM sessions WHERE station_id = ? AND status = 'active' LIMIT 1`).get(id)) as unknown as { id: number } | null;
    if (activeSession) return c.json({ success: false, error: "Station masih dipakai (sesi aktif), hentikan dulu sebelum menghapus" }, 400);

    const station = (await db.query(`SELECT id FROM stations WHERE id = ?`).get(id)) as unknown as { id: number } | null;
    if (!station) return c.json({ success: false, error: "Station tidak ditemukan" }, 404);

    const result = await db.transaction(async () => {
      await db.query(`DELETE FROM orders WHERE station_id = ?`).run(id);
      await db.query(`DELETE FROM sessions WHERE station_id = ?`).run(id);
      return db.query(`DELETE FROM stations WHERE id = ?`).run(id);
    });

    if (!result.changes) return c.json({ success: false, error: "Station gagal dihapus" }, 500);
    return c.json({ success: true });
  } catch (e: any) {
    console.error("[Delete Station Error]", e?.message || e);
    return c.json({ success: false, error: "Gagal menghapus station" }, 500);
  }
});

export default stations;
