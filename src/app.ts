import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import * as XLSX from "xlsx";
import { initDB } from "./db/database.js";
import stations from "./routes/stations.js";
import billing from "./routes/billing.js";
import products, { orders, timerPricing, cashFlow, dashboard } from "./routes/products.js";
import { readJsonBody } from "./utils.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const USER_PASSWORD = process.env.USER_PASSWORD || "user";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "admin-token-valid";
const USER_TOKEN = process.env.USER_TOKEN || "user-token-valid";

let initPromise: Promise<void> | null = null;
const DB_INIT_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

async function ensureDbInitialized() {
  if (!initPromise) initPromise = initDB();
  await withTimeout(initPromise, DB_INIT_TIMEOUT_MS, "DB init");
}

export async function createApp() {
  const app = new Hono();
  const apiPrefixes = ["/api", ""];
  app.use("*", logger());
  app.onError((error, c) => {
    console.error("Unhandled app error", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500
    );
  });
  for (const prefix of apiPrefixes) {
    app.use(`${prefix}/*`, cors());
  }


  for (const prefix of apiPrefixes) app.use(`${prefix}/*`, async (c, next) => {
    const bypassInitPaths = new Set([
      "/api/health",
      "/health",
      "/api/login",
      "/login",
      "/api/admin/login",
      "/admin/login",
    ]);
    if (bypassInitPaths.has(c.req.path)) return await next();

    try {
      await ensureDbInitialized();
      return await next();
    } catch (error) {
      console.error("Database initialization failed", error);
      return c.json({ success: false, error: "Database unavailable" }, 503);
    }
  });

  for (const prefix of apiPrefixes) {
    app.post(`${prefix}/login`, async (c) => {
      const body = await readJsonBody<{ password?: string; role?: string }>(c.req.raw);
      if (!body.ok) return c.json({ success: false, error: body.error }, 400);
      const { password, role } = body.data;
      const isAdmin = role === "admin" && password === ADMIN_PASSWORD;
      const isUser = role === "user" && password === USER_PASSWORD;
      if (isAdmin || isUser) return c.json({ success: true, token: isAdmin ? ADMIN_TOKEN : USER_TOKEN, isAdmin });
      return c.json({ success: false, error: "Password atau role salah!" }, 401);
    });

    app.post(`${prefix}/admin/login`, async (c) => {
      const body = await readJsonBody<{ username?: string; password?: string }>(c.req.raw);
      if (!body.ok) return c.json({ success: false, error: body.error }, 400);
      const { username, password } = body.data;
      if (username === "admin" && password === ADMIN_PASSWORD) return c.json({ success: true, token: ADMIN_TOKEN });
      return c.json({ success: false, error: "Username atau password salah!" }, 401);
    });
  }

  for (const prefix of apiPrefixes) app.use(`${prefix}/*`, async (c, next) => {
    const isReadMode = c.req.method === "GET";
    const isLogin = c.req.path.includes("/login") || c.req.path.includes("/admin/login");
    if (isLogin || isReadMode) return await next();
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token === ADMIN_TOKEN) return await next();
    return c.json({ success: false, error: "Akses ditolak - login admin diperlukan" }, 403);
  });

  for (const prefix of apiPrefixes) {
    app.route(`${prefix}/stations`, stations);
    app.route(`${prefix}/billing`, billing);
    app.route(`${prefix}/products`, products);
    app.route(`${prefix}/orders`, orders);
    app.route(`${prefix}/pricing`, timerPricing);
    app.route(`${prefix}/cashflow`, cashFlow);
    app.route(`${prefix}/dashboard`, dashboard);
    app.get(`${prefix}/health`, (c) => c.json({ status: "ok", app: "PS Billing", version: "1.0.0" }));
  }

  app.get("/api/export/stations", async () => {
    const db = (await import("./db/database.js")).default;
    const rows = await db.query("SELECT * FROM stations").all();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stations");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=stations.xlsx" } });
  });

  app.get("/api/export/cashflow", async (c) => {
    const db = (await import("./db/database.js")).default;
    const start = c.req.query("start");
    const end = c.req.query("end");
    const params: any[] = [];
    let query = "SELECT * FROM cash_flow";
    if (start && end) { query += " WHERE DATE(created_at) BETWEEN ? AND ?"; params.push(start, end); }
    else { const date = new Date().toISOString().split("T")[0]; query += " WHERE DATE(created_at)=?"; params.push(date); }
    query += " ORDER BY created_at DESC";
    const rows = await db.query(query).all(...params);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cash Flow");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=cashflow.xlsx" } });
  });

  app.get("/api/export/history", async (c) => {
    const db = (await import("./db/database.js")).default;
    const start = c.req.query("start");
    const end = c.req.query("end");
    const params: any[] = [];
    let query = `SELECT s.id, st.name as station_name, s.customer_name, tp.label as pricing_label, s.start_time, s.end_time, s.duration_minutes, s.total_price, s.status, s.notes FROM sessions s JOIN stations st ON s.station_id = st.id LEFT JOIN timer_pricing tp ON s.pricing_id = tp.id WHERE s.status='finished'`;
    if (start && end) { query += " AND DATE(s.start_time) BETWEEN ? AND ?"; params.push(start, end); }
    else { const date = new Date().toISOString().split("T")[0]; query += " AND DATE(s.start_time)=?"; params.push(date); }
    query += " ORDER BY s.start_time DESC";
    const rows = await db.query(query).all(...params);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "History");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=history.xlsx" } });
  });

  return app;
}

export default createApp;
