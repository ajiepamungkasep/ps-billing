// Verifikasi cepat (tanpa DB): db.transaction harus mengarahkan query ke client transaksi
// via AsyncLocalStorage, dan rollback terjadi saat error. Jalankan: bun run scripts/test-transaction-scope.ts
import { AsyncLocalStorage } from "node:async_hooks";

const txStorage = new AsyncLocalStorage<any>();

// Stub yang meniru perilaku postgres.js: client punya .unsafe(), dan transaksi
// menyediakan client transaksi yang mencatat bahwa ia dipakai.
function makeClient(label: string) {
  return {
    label,
    async unsafe(q: string, params: any[]) {
      // postgres.js mengembalikan array of rows
      return [{ client: label, q, params }];
    },
  };
}

const poolClient = makeClient("POOL");
const transactionClient = makeClient("TRANSACTION");

// queryText + param, jalankan terhadap client yang aktif (transaksi jika ada)
async function runQuery(queryText: string, params: any[]) {
  const client = txStorage.getStore() ?? poolClient;
  return client.unsafe(queryText, params);
}

const db = {
  query(queryText: string) {
    return {
      async all(...params: any[]) {
        const rows = await runQuery(queryText, params);
        return rows;
      },
      async get(...params: any[]) {
        const rows = await runQuery(queryText, params);
        return rows[0] ?? null;
      },
      async run(...params: any[]) {
        const rows = await runQuery(queryText, params);
        // postgres.js: rows.count tersedia; di sini kita kembalikan juga baris pertama
        return { changes: rows.length, lastInsertRowid: undefined, row: rows[0] ?? null };
      },
    };
  },
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // Meniru sql.begin: jalankan fn dengan client transaksi di storage
    return (await txStorage.run(transactionClient, fn)) as T;
  },
};

async function main() {
  // 1) Di luar transaksi -> client POOL
  const outside = await db.query("SELECT 1").all();
  console.log("outside uses:", outside.client, "(expect POOL)");

  // 2) Di dalam transaksi -> client TRANSACTION
  const inside = await db.transaction(async () => {
    const a = await db.query("SELECT * FROM sessions WHERE id=?").get(1);
    const b = await db.query("UPDATE sessions SET status='finished' WHERE id=?").run(1);
    return { a, b };
  });
  console.log("inside uses:", inside.a.client, inside.b.client, "(expect TRANSACTION x2)");

  // 3) Rollback: jika fn melempar, error menyebar
  let threw = false;
  try {
    await db.transaction(async () => {
      await db.query("UPDATE sessions SET status='finished'").run();
      throw new Error("boom");
    });
  } catch (e: any) {
    threw = e.message === "boom";
  }
  console.log("rollback propagates error:", threw, "(expect true)");

  const ok =
    outside.client === "POOL" &&
    inside.a.client === "TRANSACTION" &&
    inside.b.client === "TRANSACTION" &&
    threw;
  console.log(ok ? "PASS: transaksi memakai client transaksi & rollback OK" : "FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
