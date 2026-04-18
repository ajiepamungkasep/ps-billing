// src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import * as XLSX from 'xlsx';
import { initDB } from "./db/database";
import stations from "./routes/stations";
import billing from "./routes/billing";
import products, { orders, timerPricing, cashFlow, dashboard } from "./routes/products";

// Init database
initDB();

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("/api/*", cors());

// Tambahkan baris ini setelah app.use("/api/*", cors());

const ADMIN_PASSWORD = "admin"; // Ubah password sesuai keinginan

// 1. Endpoint Login
app.post("/api/login", async (c) => {
  const { password, role } = await c.req.json();
  const isAdmin = role === 'admin' && password === ADMIN_PASSWORD;
  const isUser = role === 'user' && password === 'user'; // Simple user password
  
  if (isAdmin || isUser) {
    const token = isAdmin ? "admin-token-valid" : "user-token-valid";
    return c.json({ success: true, token, isAdmin });
  }
  return c.json({ success: false, error: "Password atau role salah!" }, 401);
});

// 2. Middleware Proteksi API
app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  const path = c.req.path;
  const isReadMode = method === "GET";
  const isLogin = path.includes("/login");
  const isExport = path.includes("/export");
  
  // Skip auth untuk login
  if (isLogin) {
    await next();
    return;
  }
  
  const authHeader = c.req.header("Authorization") || "";
  const isAdmin = authHeader === "Bearer admin-token-valid";
  const isUser = authHeader === "Bearer user-token-valid";
  
  console.log(`[AUTH] ${method} ${path} | Auth: ${authHeader || 'none'} | Admin: ${isAdmin}, User: ${isUser}`);
  
  // Validasi token
  if (!isAdmin && !isUser) {
    console.warn(`[AUTH FAIL] ${path} - No valid token`);
    return c.json({ success: false, error: "Akses ditolak. Harus login." }, 401);
  }

  // Export hanya untuk admin
  if (isExport && !isAdmin) {
    console.warn(`[AUTH FAIL] ${path} - Export hanya admin`);
    return c.json({ success: false, error: "Akses ditolak. Hanya admin yang bisa export." }, 403);
  }
  
  // GET request boleh untuk user dan admin
  if (isReadMode) {
    await next();
    return;
  }
  
  // POST/PUT/DELETE hanya admin & billing endpoints khusus user
  if (!isAdmin && !path.includes("/billing/start") && !path.includes("/billing/end")) {
    console.warn(`[AUTH FAIL] ${path} - Only admin can modify`);
    return c.json({ success: false, error: "Akses ditolak. Hanya admin yang bisa edit." }, 403);
  }
  
  await next();
});

// API Routes
app.route("/api/stations", stations);
app.route("/api/billing", billing);
app.route("/api/products", products);
app.route("/api/orders", orders);
app.route("/api/pricing", timerPricing);
app.route("/api/cashflow", cashFlow);
app.route("/api/dashboard", dashboard);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", app: "PS Billing", version: "1.0.0" }));

// Export endpoints
app.get("/api/export/stations", async (c) => {
  const db = (await import("./db/database")).default;
  const stations = db.query("SELECT * FROM stations").all();
  const ws = XLSX.utils.json_to_sheet(stations);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stations");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=stations.xlsx"
    }
  });
});

app.get("/api/export/cashflow", async (c) => {
  try {
    const db = (await import("./db/database")).default;
    const start = c.req.query("start");
    const end = c.req.query("end");
    const params: any[] = [];
    let query = "SELECT * FROM cash_flow";

    if (start && end) {
      query += " WHERE DATE(created_at) BETWEEN ? AND ?";
      params.push(start, end);
    } else {
      const date = new Date().toISOString().split('T')[0];
      query += " WHERE DATE(created_at) = ?";
      params.push(date);
    }

    query += " ORDER BY created_at DESC";
    const cashflows = db.query(query).all(...params);
    const ws = XLSX.utils.json_to_sheet(cashflows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=cashflow.xlsx"
      }
    });
  } catch (e: any) {
    console.error('[Export Cashflow Error]', e.message);
    return c.json({ success: false, error: 'Export gagal: ' + e.message }, 500);
  }
});

app.get("/api/export/history", async (c) => {
  try {
    const db = (await import("./db/database")).default;
    const start = c.req.query("start");
    const end = c.req.query("end");
    const params: any[] = [];
    let query = `
      SELECT s.id, st.name as station_name, s.customer_name, tp.label as pricing_label,
             s.start_time, s.end_time, s.duration_minutes, s.total_price, s.status, s.notes
      FROM sessions s
      JOIN stations st ON s.station_id = st.id
      LEFT JOIN timer_pricing tp ON s.pricing_id = tp.id
      WHERE s.status='finished'`;

    if (start && end) {
      query += ` AND DATE(s.start_time) BETWEEN ? AND ?`;
      params.push(start, end);
    } else {
      const date = new Date().toISOString().split('T')[0];
      query += ` AND DATE(s.start_time) = ?`;
      params.push(date);
    }
    query += ` ORDER BY s.start_time DESC`;

    const history = db.query(query).all(...params);
    const ws = XLSX.utils.json_to_sheet(history);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "History");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=history.xlsx"
      }
    });
  } catch (e: any) {
    console.error('[Export History Error]', e.message);
    return c.json({ success: false, error: 'Export gagal: ' + e.message }, 500);
  }
});

// Serve static files (frontend)
app.use("/*", serveStatic({ root: "./public" }));

// Fallback ke index.html (SPA)
app.get("*", serveStatic({ path: "./public/index.html" }));

const PORT = parseInt(process.env.PORT || "3000");
console.log(`🎮 PS Billing berjalan di http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
