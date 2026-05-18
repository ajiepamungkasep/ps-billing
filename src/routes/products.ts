import { Hono } from "hono";
import db from "../db/database.js";
import { readJsonBody, toNonNegativeInteger, toPositiveInteger, toPositiveNumber } from "../utils.js";

const products = new Hono();

products.get("/", async (c) => {
  const rows = await db.query(`SELECT * FROM products WHERE active=1 ORDER BY category, name`).all();
  return c.json({ success: true, data: rows });
});

products.post("/", async (c) => {
  const body = await readJsonBody<{ name?: string; price?: number; stock?: number; category?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { name, price, stock, category } = body.data;
  const safePrice = toPositiveNumber(price);
  const safeStock = stock === undefined ? 0 : toNonNegativeInteger(stock);
  if (!name || !safePrice || safeStock === null) return c.json({ success: false, error: "name, price > 0, stock >= 0 required" }, 400);
  const result = await db.query(`INSERT INTO products (name, price, stock, category) VALUES (?,?,?,?)`).run(name, safePrice, safeStock, category || "food");
  return c.json({ success: true, id: result.lastInsertRowid });
});

products.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonBody<{ name?: string; price?: number; stock?: number; category?: string; active?: number }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { name, price, stock, category, active } = body.data;
  const safePrice = toPositiveNumber(price);
  const safeStock = toNonNegativeInteger(stock);
  if (!name || !safePrice || safeStock === null) return c.json({ success: false, error: "name, price > 0, stock >= 0 required" }, 400);
  await db.query(`UPDATE products SET name=?, price=?, stock=?, category=?, active=? WHERE id=?`).run(name, safePrice, safeStock, category || "food", active ?? 1, id);
  return c.json({ success: true });
});

products.delete("/:id", async (c) => {
  await db.query(`UPDATE products SET active=0 WHERE id=?`).run(c.req.param("id"));
  return c.json({ success: true });
});

export default products;

export const orders = new Hono();
orders.get("/session/:session_id", async (c) => {
  const rows = await db.query(`SELECT o.*, p.name as product_name, p.category FROM orders o JOIN products p ON p.id = o.product_id WHERE o.session_id=? ORDER BY o.created_at`).all(c.req.param("session_id"));
  return c.json({ success: true, data: rows });
});

orders.post("/", async (c) => {
  const body = await readJsonBody<{ session_id?: number; station_id?: number; product_id?: number; quantity?: number }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { session_id, station_id, product_id, quantity } = body.data;
  const safeProductId = toPositiveInteger(product_id);
  const safeQuantity = toPositiveInteger(quantity);
  if (!safeProductId || !safeQuantity) return c.json({ success: false, error: "product_id & quantity required" }, 400);

  const product = (await db.query(`SELECT * FROM products WHERE id=? AND active=1`).get(safeProductId)) as any;
  if (!product) return c.json({ success: false, error: "Produk tidak ditemukan" }, 404);
  if (Number(product.stock) < safeQuantity) return c.json({ success: false, error: "Stok tidak cukup" }, 400);

  const subtotal = Number(product.price) * safeQuantity;
  const result = await db.query(`INSERT INTO orders (session_id, station_id, product_id, quantity, unit_price, subtotal) VALUES (?,?,?,?,?,?)`).run(session_id || null, station_id || null, safeProductId, safeQuantity, Number(product.price), subtotal);
  await db.query(`UPDATE products SET stock = stock - ? WHERE id=?`).run(safeQuantity, safeProductId);

  if (!session_id) {
    await db.query(`INSERT INTO cash_flow (type, category, amount, description, ref_id) VALUES ('income','product',?,?,?)`).run(subtotal, `Penjualan ${product.name} x${quantity}`, result.lastInsertRowid);
  }

  return c.json({ success: true, id: result.lastInsertRowid, subtotal });
});

export const timerPricing = new Hono();
timerPricing.get("/", async (c) => c.json({ success: true, data: await db.query(`SELECT * FROM timer_pricing WHERE active=1 ORDER BY console_type, price`).all() }));
timerPricing.post("/", async (c) => {
  const body = await readJsonBody<{ label?: string; console_type?: string; duration_minutes?: number; price?: number; type?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { label, console_type, duration_minutes, price, type } = body.data;
  const safePrice = toPositiveNumber(price);
  const safeConsoleType = ["PS2", "PS3", "PS4"].includes(String(console_type)) ? console_type : "PS4";
  if (!label || !safePrice) return c.json({ success: false, error: "label & price required" }, 400);
  const result = await db.query(`INSERT INTO timer_pricing (label, console_type, duration_minutes, price, type) VALUES (?,?,?,?,?)`).run(label, safeConsoleType, duration_minutes || null, safePrice, type || "hourly");
  return c.json({ success: true, id: result.lastInsertRowid });
});

timerPricing.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await readJsonBody<{ label?: string; console_type?: string; duration_minutes?: number; price?: number; type?: string; active?: number }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { label, console_type, duration_minutes, price, type, active } = body.data;
  const safePrice = toPositiveNumber(price);
  const safeConsoleType = ["PS2", "PS3", "PS4"].includes(String(console_type)) ? console_type : "PS4";
  if (!label || !safePrice) return c.json({ success: false, error: "label & price required" }, 400);
  await db.query(`UPDATE timer_pricing SET label=?, console_type=?, duration_minutes=?, price=?, type=?, active=? WHERE id=?`).run(label, safeConsoleType, duration_minutes || null, safePrice, type || "hourly", active ?? 1, id);
  return c.json({ success: true });
});
timerPricing.delete("/:id", async (c) => { await db.query(`UPDATE timer_pricing SET active=0 WHERE id=?`).run(c.req.param("id")); return c.json({ success: true }); });

export const cashFlow = new Hono();
cashFlow.get("/summary", async (c) => {
  const start = c.req.query("start");
  const end = c.req.query("end");
  const date = new Date().toISOString().split("T")[0];
  const params: any[] = [];
  let filter = "DATE(created_at) = ?";
  if (start && end) { filter = "DATE(created_at) BETWEEN ? AND ?"; params.push(start, end); } else params.push(date);
  const summary = await db.query(`SELECT type, category, COUNT(*) as count, SUM(amount) as total FROM cash_flow WHERE ${filter} GROUP BY type, category`).all(...params);
  const income = Number(((await db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='income' AND ${filter}`).get(...params)) as any).t);
  const expense = Number(((await db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='expense' AND ${filter}`).get(...params)) as any).t);
  return c.json({ success: true, start: start || date, end: end || date, income, expense, net: income - expense, breakdown: summary });
});

cashFlow.get("/", async (c) => {
  const start = c.req.query("start"); const end = c.req.query("end"); const limit = c.req.query("limit") || "100";
  let q = `SELECT * FROM cash_flow`; const params: any[] = [];
  if (start && end) { q += ` WHERE DATE(created_at) BETWEEN ? AND ?`; params.push(start, end); }
  else if (c.req.query("date")) { q += ` WHERE DATE(created_at)=?`; params.push(c.req.query("date")); }
  q += ` ORDER BY created_at DESC LIMIT ?`; params.push(parseInt(limit));
  return c.json({ success: true, data: await db.query(q).all(...params) });
});

cashFlow.post("/expense", async (c) => {
  const body = await readJsonBody<{ amount?: number; description?: string; category?: string }>(c.req.raw);
  if (!body.ok) return c.json({ success: false, error: body.error }, 400);
  const { amount, description, category } = body.data;
  const safeAmount = toPositiveNumber(amount);
  if (!safeAmount || !description) return c.json({ success: false, error: "amount & description required" }, 400);
  await db.query(`INSERT INTO cash_flow (type, category, amount, description) VALUES ('expense',?,?,?)`).run(category || "operational", safeAmount, description);
  return c.json({ success: true });
});

export const dashboard = new Hono();
dashboard.get("/stats", async (c) => {
  const today = new Date().toISOString().split("T")[0];
  const totalStations = Number(((await db.query(`SELECT COUNT(*) as c FROM stations`).get()) as any).c);
  const activeStations = Number(((await db.query(`SELECT COUNT(*) as c FROM stations WHERE status='in_use'`).get()) as any).c);
  const todaySessions = Number(((await db.query(`SELECT COUNT(*) as c FROM sessions WHERE DATE(start_time)=? AND status='finished'`).get(today)) as any).c);
  const todayIncome = Number(((await db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='income' AND DATE(created_at)=?`).get(today)) as any).t);
  const monthIncome = Number(((await db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='income' AND TO_CHAR(created_at, 'YYYY-MM')=TO_CHAR(NOW(),'YYYY-MM')`).get()) as any).t);
  const weekly = await db.query(`SELECT DATE(created_at) as date, SUM(amount) as income FROM cash_flow WHERE type='income' AND created_at >= NOW() - INTERVAL '6 days' GROUP BY DATE(created_at) ORDER BY date`).all();
  return c.json({ success: true, stats: { total_stations: totalStations, active_stations: activeStations, available_stations: totalStations - activeStations, today_sessions: todaySessions, today_income: todayIncome, month_income: monthIncome, weekly_income: weekly } });
});
