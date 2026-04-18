// src/routes/stations.ts
import { Hono } from "hono";
import db from "../db/database";
import { readJsonBody } from "../utils";

const stations = new Hono();

// GET all stations with active session info
stations.get("/", (c) => {
  const rows = db.query(`
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

// POST add station
stations.post("/", async (c) => {
  const body = await readJsonBody<{ name?: string; type?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);

  const { name, type } = body.data;
  if (!name || !type) return c.json({ success: false, error: "name & type required" }, 400);
  
  const result = db.query(`INSERT INTO stations (name, type) VALUES (?, ?)`).run(name, type);
  return c.json({ success: true, id: result.lastInsertRowid });
});

// PUT update station
stations.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonBody<{ name?: string; type?: string; status?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);

  const { name, type, status } = body.data;
  if (!name || !type || !status) return c.json({ success: false, error: "name, type, status required" }, 400);
  db.query(`UPDATE stations SET name=?, type=?, status=? WHERE id=?`).run(name, type, status, id);
  return c.json({ success: true });
});

// DELETE station
stations.delete("/:id", (c) => {
  const id = c.req.param("id");
  db.query(`DELETE FROM stations WHERE id=?`).run(id);
  return c.json({ success: true });
});

export default stations;
