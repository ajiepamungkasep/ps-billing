import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const sql = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

function toPgPlaceholders(query: string) {
  let idx = 0;
  return query.replace(/\?/g, () => `$${++idx}`);
}

export type RunResult = {
  changes: number;
  lastInsertRowid?: number;
};

class Statement {
  constructor(private readonly queryText: string) {}

  async all(...params: any[]) {
    const pgQuery = toPgPlaceholders(this.queryText);
    return sql.unsafe(pgQuery, params);
  }

  async get(...params: any[]) {
    const rows = await this.all(...params);
    return rows[0] ?? null;
  }

  async run(...params: any[]): Promise<RunResult> {
    const pgQuery = toPgPlaceholders(this.queryText);
    const returningId = /\binsert\b/i.test(this.queryText) && !/\breturning\b/i.test(this.queryText);
    const finalQuery = returningId ? `${pgQuery} RETURNING id` : pgQuery;
    const rows = await sql.unsafe(finalQuery, params);
    const firstRow = rows[0] as Record<string, any> | undefined;
    return {
      changes: rows.count ?? rows.length,
      lastInsertRowid: firstRow?.id ? Number(firstRow.id) : undefined,
    };
  }
}

const db = {
  query(queryText: string) {
    return new Statement(queryText);
  },
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return sql.begin(async () => fn());
  },
};

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS stations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'PS4',
      status TEXT NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'food',
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS timer_pricing (
      id BIGSERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      duration_minutes INTEGER,
      price NUMERIC NOT NULL,
      type TEXT DEFAULT 'hourly',
      active INTEGER DEFAULT 1
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id BIGSERIAL PRIMARY KEY,
      station_id BIGINT NOT NULL REFERENCES stations(id),
      customer_name TEXT,
      pricing_id BIGINT REFERENCES timer_pricing(id),
      custom_duration_minutes INTEGER,
      start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_time TIMESTAMPTZ,
      duration_minutes INTEGER,
      total_price NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'active',
      notes TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT REFERENCES sessions(id),
      station_id BIGINT REFERENCES stations(id),
      product_id BIGINT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price NUMERIC NOT NULL,
      subtotal NUMERIC NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cash_flow (
      id BIGSERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      category TEXT,
      amount NUMERIC NOT NULL,
      description TEXT,
      ref_id BIGINT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO stations (name, type, status)
    SELECT 'PS4 - Unit 1', 'PS4', 'available'
    WHERE NOT EXISTS (SELECT 1 FROM stations)
  `;

  await sql`
    INSERT INTO stations (name, type, status)
    SELECT 'PS4 - Unit 2', 'PS4', 'available'
    WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name = 'PS4 - Unit 2')
  `;

  await sql`
    INSERT INTO stations (name, type, status)
    SELECT 'PS4 - Unit 3', 'PS4', 'available'
    WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name = 'PS4 - Unit 3')
  `;

  await sql`
    INSERT INTO stations (name, type, status)
    SELECT 'PS5 - Unit 1', 'PS5', 'available'
    WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name = 'PS5 - Unit 1')
  `;

  await sql`
    INSERT INTO stations (name, type, status)
    SELECT 'PS5 - Unit 2', 'PS5', 'available'
    WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name = 'PS5 - Unit 2')
  `;

  await sql`
    INSERT INTO timer_pricing (label, duration_minutes, price, type)
    SELECT '1 Jam', 60, 8000, 'hourly'
    WHERE NOT EXISTS (SELECT 1 FROM timer_pricing)
  `;

  await sql`
    INSERT INTO timer_pricing (label, duration_minutes, price, type)
    SELECT '2 Jam', 120, 15000, 'package'
    WHERE NOT EXISTS (SELECT 1 FROM timer_pricing WHERE label='2 Jam')
  `;

  await sql`
    INSERT INTO timer_pricing (label, duration_minutes, price, type)
    SELECT '3 Jam', 180, 20000, 'package'
    WHERE NOT EXISTS (SELECT 1 FROM timer_pricing WHERE label='3 Jam')
  `;

  await sql`
    INSERT INTO timer_pricing (label, duration_minutes, price, type)
    SELECT 'Main Bebas', NULL, 6000, 'open'
    WHERE NOT EXISTS (SELECT 1 FROM timer_pricing WHERE label='Main Bebas')
  `;

  await sql`
    INSERT INTO products (name, price, stock, category)
    SELECT 'Air Mineral', 3000, 50, 'drink'
    WHERE NOT EXISTS (SELECT 1 FROM products)
  `;

  console.log("✅ Database initialized (Postgres)");
}

export default db;
