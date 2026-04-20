// src/db/database.ts
// SQLite via Bun's built-in driver (zero dependencies needed)

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DATABASE_PATH || "ps_billing.db";
const dbDir = dirname(DB_PATH);
if (dbDir && dbDir !== "." && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH, { create: true });

// Enable WAL mode for better concurrent performance
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function initDB() {
  db.exec(`
    -- Stations (unit PS)
    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'PS4', -- PS4, PS5, PC, etc
      status TEXT NOT NULL DEFAULT 'available', -- available, in_use, maintenance
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Products (snack, minuman, dll)
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'food',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Timer Pricing (harga per durasi)
    CREATE TABLE IF NOT EXISTS timer_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,        -- e.g. "1 Jam", "2 Jam", "Main Bebas"
      duration_minutes INTEGER,   -- NULL = open/bebas
      price REAL NOT NULL,
      type TEXT DEFAULT 'hourly', -- hourly, package, open
      active INTEGER DEFAULT 1
    );

    -- Sessions (sesi main aktif)
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_id INTEGER NOT NULL REFERENCES stations(id),
      customer_name TEXT,
      pricing_id INTEGER REFERENCES timer_pricing(id),
      custom_duration_minutes INTEGER,
      start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      duration_minutes INTEGER,
      total_price REAL DEFAULT 0,
      status TEXT DEFAULT 'active', -- active, finished, cancelled
      notes TEXT
    );

    -- Orders (pesanan produk)
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions(id),
      station_id INTEGER REFERENCES stations(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Cash Flow (pemasukan/pengeluaran)
    CREATE TABLE IF NOT EXISTS cash_flow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL, -- income, expense
      category TEXT,      -- billing, product, operational, etc
      amount REAL NOT NULL,
      description TEXT,
      ref_id INTEGER,     -- session_id or order_id
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Seed data jika kosong
    INSERT OR IGNORE INTO stations (id, name, type, status) VALUES
      (1, 'PS4 - Unit 1', 'PS4', 'available'),
      (2, 'PS4 - Unit 2', 'PS4', 'available'),
      (3, 'PS4 - Unit 3', 'PS4', 'available'),
      (4, 'PS5 - Unit 1', 'PS5', 'available'),
      (5, 'PS5 - Unit 2', 'PS5', 'available');

    INSERT OR IGNORE INTO timer_pricing (id, label, duration_minutes, price, type) VALUES
      (1, '1 Jam',       60,   8000,  'hourly'),
      (2, '2 Jam',       120,  15000, 'package'),
      (3, '3 Jam',       180,  20000, 'package'),
      (4, 'Main Bebas',  NULL, 6000,  'open');

    INSERT OR IGNORE INTO products (id, name, price, stock, category) VALUES
      (1, 'Air Mineral',   3000, 50, 'drink'),
      (2, 'Indomie Goreng',5000, 30, 'food'),
      (3, 'Kopi Sachet',   4000, 40, 'drink'),
      (4, 'Chiki',         3000, 60, 'snack'),
      (5, 'Teh Botol',     5000, 30, 'drink');
  `);

  const sessionColumns = db.query(`PRAGMA table_info(sessions)`).all() as { name: string }[];
  const hasCustomDurationColumn = sessionColumns.some((column) => column.name === "custom_duration_minutes");
  if (!hasCustomDurationColumn) {
    db.exec(`ALTER TABLE sessions ADD COLUMN custom_duration_minutes INTEGER;`);
  }

  console.log("✅ Database initialized");
}

export default db;
