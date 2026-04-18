// src/routes/products.ts
import { Hono } from "hono";
import db from "../db/database";

const products = new Hono();

// GET all products
products.get("/", (c) => {
  const rows = db.query(`SELECT * FROM products WHERE active=1 ORDER BY category, name`).all();
  return c.json({ success: true, data: rows });
});

// POST add product
products.post("/", async (c) => {
  const { name, price, stock, category } = await c.req.json();
  if (!name || !price) return c.json({ success: false, error: "name & price required" }, 400);
  const result = db.query(`INSERT INTO products (name, price, stock, category) VALUES (?,?,?,?)`).run(name, price, stock || 0, category || "food");
  return c.json({ success: true, id: result.lastInsertRowid });
});

// PUT update product
products.put("/:id", async (c) => {
  const id = c.req.param("id");
  const { name, price, stock, category, active } = await c.req.json();
  db.query(`UPDATE products SET name=?, price=?, stock=?, category=?, active=? WHERE id=?`)
    .run(name, price, stock, category, active ?? 1, id);
  return c.json({ success: true });
});

// DELETE product (soft delete)
products.delete("/:id", (c) => {
  const id = c.req.param("id");
  db.query(`UPDATE products SET active=0 WHERE id=?`).run(id);
  return c.json({ success: true });
});

export default products;


// ── Orders ─────────────────────────────────────────────────────────────────
export const orders = new Hono();

// GET orders by session
orders.get("/session/:session_id", (c) => {
  const sid = c.req.param("session_id");
  const rows = db.query(`
    SELECT o.*, p.name as product_name, p.category
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE o.session_id=? ORDER BY o.created_at
  `).all(sid);
  return c.json({ success: true, data: rows });
});

// POST add order (beli produk)
orders.post("/", async (c) => {
  const { session_id, station_id, product_id, quantity } = await c.req.json();
  if (!product_id || !quantity) return c.json({ success: false, error: "product_id & quantity required" }, 400);

  const product = db.query(`SELECT * FROM products WHERE id=? AND active=1`).get(product_id) as any;
  if (!product) return c.json({ success: false, error: "Produk tidak ditemukan" }, 404);
  if (product.stock < quantity) return c.json({ success: false, error: "Stok tidak cukup" }, 400);

  const subtotal = product.price * quantity;

  const result = db.query(`
    INSERT INTO orders (session_id, station_id, product_id, quantity, unit_price, subtotal)
    VALUES (?,?,?,?,?,?)
  `).run(session_id || null, station_id || null, product_id, quantity, product.price, subtotal);

  // Kurangi stok
  db.query(`UPDATE products SET stock = stock - ? WHERE id=?`).run(quantity, product_id);

  // Catat cash flow jika tidak dalam sesi (beli langsung)
  if (!session_id) {
    db.query(`INSERT INTO cash_flow (type, category, amount, description, ref_id) VALUES ('income','product',?,?,?)`)
      .run(subtotal, `Penjualan ${product.name} x${quantity}`, result.lastInsertRowid);
  }

  return c.json({ success: true, id: result.lastInsertRowid, subtotal });
});


// ── Timer Pricing ────────────────────────────────────────────────────────────
export const timerPricing = new Hono();

timerPricing.get("/", (c) => {
  const rows = db.query(`SELECT * FROM timer_pricing WHERE active=1 ORDER BY price`).all();
  return c.json({ success: true, data: rows });
});

timerPricing.post("/", async (c) => {
  const { label, duration_minutes, price, type } = await c.req.json();
  if (!label || !price) return c.json({ success: false, error: "label & price required" }, 400);
  const result = db.query(`INSERT INTO timer_pricing (label, duration_minutes, price, type) VALUES (?,?,?,?)`).run(label, duration_minutes || null, price, type || "hourly");
  return c.json({ success: true, id: result.lastInsertRowid });
});

timerPricing.put("/:id", async (c) => {
  const id = c.req.param("id");
  const { label, duration_minutes, price, type, active } = await c.req.json();
  db.query(`UPDATE timer_pricing SET label=?, duration_minutes=?, price=?, type=?, active=? WHERE id=?`)
    .run(label, duration_minutes || null, price, type, active ?? 1, id);
  return c.json({ success: true });
});

timerPricing.delete("/:id", (c) => {
  db.query(`UPDATE timer_pricing SET active=0 WHERE id=?`).run(c.req.param("id"));
  return c.json({ success: true });
});


// ── Cash Flow ─────────────────────────────────────────────────────────────────
export const cashFlow = new Hono();

// GET summary harian
cashFlow.get("/summary", (c) => {
  const start = c.req.query("start");
  const end = c.req.query("end");
  const date = new Date().toISOString().split("T")[0];
  const params: any[] = [];
  let filter = "DATE(created_at) = ?";

  if (start && end) {
    filter = "DATE(created_at) BETWEEN ? AND ?";
    params.push(start, end);
  } else {
    params.push(date);
  }

  const summary = db.query(`
    SELECT 
      type,
      category,
      COUNT(*) as count,
      SUM(amount) as total
    FROM cash_flow
    WHERE ${filter}
    GROUP BY type, category
  `).all(...params);

  const income = (db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='income' AND ${filter}`).get(...params) as any).t;
  const expense = (db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='expense' AND ${filter}`).get(...params) as any).t;

  return c.json({ success: true, start: start || date, end: end || date, income, expense, net: income - expense, breakdown: summary });
});

// GET cash flow list
cashFlow.get("/", (c) => {
  const start = c.req.query("start");
  const end = c.req.query("end");
  const limit = c.req.query("limit") || "100";
  let q = `SELECT * FROM cash_flow`;
  const params: any[] = [];
  if (start && end) {
    q += ` WHERE DATE(created_at) BETWEEN ? AND ?`;
    params.push(start, end);
  } else if (c.req.query("date")) {
    q += ` WHERE DATE(created_at)=?`;
    params.push(c.req.query("date"));
  }
  q += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(parseInt(limit));
  return c.json({ success: true, data: db.query(q).all(...params) });
});

// POST manual expense (pengeluaran)
cashFlow.post("/expense", async (c) => {
  const { amount, description, category } = await c.req.json();
  if (!amount || !description) return c.json({ success: false, error: "amount & description required" }, 400);
  db.query(`INSERT INTO cash_flow (type, category, amount, description) VALUES ('expense',?,?,?)`)
    .run(category || "operational", amount, description);
  return c.json({ success: true });
});


// ── Dashboard Stats ──────────────────────────────────────────────────────────
export const dashboard = new Hono();

dashboard.get("/stats", (c) => {
  const today = new Date().toISOString().split("T")[0];

  const totalStations = (db.query(`SELECT COUNT(*) as c FROM stations`).get() as any).c;
  const activeStations = (db.query(`SELECT COUNT(*) as c FROM stations WHERE status='in_use'`).get() as any).c;
  const todaySessions = (db.query(`SELECT COUNT(*) as c FROM sessions WHERE DATE(start_time)=? AND status='finished'`).get(today) as any).c;
  const todayIncome = (db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='income' AND DATE(created_at)=?`).get(today) as any).t;
  const monthIncome = (db.query(`SELECT COALESCE(SUM(amount),0) as t FROM cash_flow WHERE type='income' AND strftime('%Y-%m', created_at)=strftime('%Y-%m','now')`).get() as any).t;

  // Income 7 hari terakhir
  const weekly = db.query(`
    SELECT DATE(created_at) as date, SUM(amount) as income
    FROM cash_flow WHERE type='income' AND created_at >= date('now','-6 days')
    GROUP BY DATE(created_at) ORDER BY date
  `).all();

  return c.json({
    success: true,
    stats: {
      total_stations: totalStations,
      active_stations: activeStations,
      available_stations: totalStations - activeStations,
      today_sessions: todaySessions,
      today_income: todayIncome,
      month_income: monthIncome,
      weekly_income: weekly
    }
  });
});
