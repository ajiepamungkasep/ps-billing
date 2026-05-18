import * as XLSX from "xlsx";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const historyPath = process.argv[2];
const cashflowPath = process.argv[3];

if (!historyPath || !cashflowPath) {
  throw new Error("Usage: bun run scripts/import-railway-xlsx.ts <history.xlsx> <cashflow.xlsx>");
}

const sql = postgres(connectionString, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  prepare: false,
  ssl: "require",
});

type HistoryRow = {
  id: number;
  station_name: string;
  customer_name: string | null;
  pricing_label: string | null;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  total_price: number | null;
  status: string;
  notes: string | null;
};

type CashflowRow = {
  id: number;
  type: string;
  category: string | null;
  amount: number;
  description: string | null;
  ref_id: number | null;
  created_at: string;
};

function readSheet<T>(filePath: string): T[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: null });
}

function inferStationType(name: string) {
  const upper = name.toUpperCase();
  if (upper.includes("PS5")) return "PS5";
  if (upper.includes("PS4")) return "PS4";
  if (upper.includes("PS3")) return "PS3";
  if (upper.includes("PS2")) return "PS2";
  return "PS4";
}

function inferPricingType(label: string) {
  const upper = label.toUpperCase();
  if (upper.includes("LOSS") || upper.includes("BEBAS") || upper.includes("OPEN")) return "open";
  if (upper.includes("JAM")) return "package";
  return "package";
}

function inferDurationMinutes(label: string) {
  const match = label.toUpperCase().match(/(\d+)\s*JAM/);
  if (!match) return null;
  return Number(match[1]) * 60;
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(" ", "T") + "Z";
}

async function ensureStation(name: string) {
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM stations WHERE name = ${name} LIMIT 1
  `;
  if (existing[0]?.id) return existing[0].id;

  const inserted = await sql<{ id: number }[]>`
    INSERT INTO stations (name, type, status)
    VALUES (${name}, ${inferStationType(name)}, 'available')
    RETURNING id
  `;
  return inserted[0].id;
}

async function ensurePricing(label: string, samplePrice: number | null) {
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM timer_pricing WHERE label = ${label} LIMIT 1
  `;
  if (existing[0]?.id) return existing[0].id;

  const price = samplePrice && samplePrice > 0 ? samplePrice : 1;
  const inserted = await sql<{ id: number }[]>`
    INSERT INTO timer_pricing (label, duration_minutes, price, type, active)
    VALUES (${label}, ${inferDurationMinutes(label)}, ${price}, ${inferPricingType(label)}, 0)
    RETURNING id
  `;
  return inserted[0].id;
}

async function importHistory(rows: HistoryRow[]) {
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await sql<{ id: number }[]>`
      SELECT id FROM sessions WHERE id = ${row.id} LIMIT 1
    `;
    if (existing[0]?.id) {
      skipped++;
      continue;
    }

    const stationId = await ensureStation(row.station_name);
    const pricingId = row.pricing_label
      ? await ensurePricing(row.pricing_label, row.total_price)
      : null;

    await sql`
      INSERT INTO sessions (
        id,
        station_id,
        customer_name,
        pricing_id,
        start_time,
        end_time,
        duration_minutes,
        total_price,
        status,
        notes
      ) VALUES (
        ${row.id},
        ${stationId},
        ${row.customer_name},
        ${pricingId},
        ${toTimestamp(row.start_time)},
        ${toTimestamp(row.end_time)},
        ${row.duration_minutes},
        ${row.total_price ?? 0},
        ${row.status || "finished"},
        ${row.notes}
      )
    `;
    inserted++;
  }

  return { inserted, skipped };
}

async function importCashflow(rows: CashflowRow[]) {
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await sql<{ id: number }[]>`
      SELECT id FROM cash_flow WHERE id = ${row.id} LIMIT 1
    `;
    if (existing[0]?.id) {
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO cash_flow (
        id,
        type,
        category,
        amount,
        description,
        ref_id,
        created_at
      ) VALUES (
        ${row.id},
        ${row.type},
        ${row.category},
        ${row.amount},
        ${row.description},
        ${row.ref_id},
        ${toTimestamp(row.created_at)}
      )
    `;
    inserted++;
  }

  return { inserted, skipped };
}

async function syncSequences() {
  await sql`
    SELECT setval('sessions_id_seq', COALESCE((SELECT MAX(id) FROM sessions), 1), true)
  `;
  await sql`
    SELECT setval('cash_flow_id_seq', COALESCE((SELECT MAX(id) FROM cash_flow), 1), true)
  `;
  await sql`
    SELECT setval('stations_id_seq', COALESCE((SELECT MAX(id) FROM stations), 1), true)
  `;
  await sql`
    SELECT setval('timer_pricing_id_seq', COALESCE((SELECT MAX(id) FROM timer_pricing), 1), true)
  `;
}

async function main() {
  const historyRows = readSheet<HistoryRow>(historyPath);
  const cashflowRows = readSheet<CashflowRow>(cashflowPath);

  console.log(`History rows: ${historyRows.length}`);
  console.log(`Cashflow rows: ${cashflowRows.length}`);

  const historyResult = await importHistory(historyRows);
  const cashflowResult = await importCashflow(cashflowRows);
  await syncSequences();

  console.log("Import complete");
  console.log("History:", historyResult);
  console.log("Cashflow:", cashflowResult);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 2 });
}
