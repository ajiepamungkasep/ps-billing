# 🎮 PS Billing System

Duplikasi dari PSBillingInstaller, dibangun ulang dengan stack modern yang lebih simpel, cepat, dan ringan.

## Stack

| Layer | Tech | Kenapa |
|---|---|---|
| Runtime | **Bun** | 3x lebih cepat dari Node.js, built-in bundler |
| Backend | **Hono.js** | Ultra-lightweight web framework ~14KB |
| Database | **SQLite** (bun:sqlite) | Zero-config, file-based, no server needed |
| Frontend | **Alpine.js** | Reaktif tanpa build step, 15KB |
| Styling | Custom CSS | Dark mode, clean, zero dependency |

## Fitur

- ✅ **Dashboard** — stats harian, status station real-time
- ✅ **Stations** — kelola unit PS, mulai/stop sesi, set maintenance
- ✅ **Billing** — start/stop timer, hitung tagihan otomatis
- ✅ **Produk** — manajemen produk + stok
- ✅ **Order** — pesan produk dalam sesi aktif
- ✅ **Paket Harga** — per jam, paket tetap, atau open (main bebas)
- ✅ **Cash Flow** — rekap pemasukan & pengeluaran harian
- ✅ **Riwayat** — history semua sesi

## Cara Jalankan

### Install Bun (jika belum)
```bash
curl -fsSL https://bun.sh/install | bash
```

### Install dependencies & jalankan
```bash
bun install
bun run dev      # development (hot reload)
bun run start    # production
```

Akses di: http://localhost:3000

### Build binary (opsional)
```bash
bun run build
./ps-billing     # jalankan langsung tanpa Bun
```

## Struktur Project

```
ps-billing/
├── src/
│   ├── index.ts              # Entry point Hono
│   ├── db/
│   │   └── database.ts       # SQLite schema + seed
│   └── routes/
│       ├── stations.ts       # CRUD station
│       ├── billing.ts        # Start/stop sesi
│       └── products.ts       # Produk, order, pricing, cashflow, dashboard
├── public/
│   ├── index.html            # SPA dengan Alpine.js
│   ├── css/style.css
│   └── js/app.js
├── ps_billing.db             # Database SQLite (auto-generated)
└── package.json
```

## API Endpoints

| Method | Path | Deskripsi |
|---|---|---|
| GET | /api/stations | Semua station + status |
| POST | /api/stations | Tambah station |
| PUT | /api/stations/:id | Update station |
| POST | /api/billing/start | Mulai sesi |
| POST | /api/billing/stop/:id | Stop & hitung tagihan |
| GET | /api/billing/active | Sesi aktif |
| GET | /api/billing/history | Riwayat sesi |
| GET | /api/products | Daftar produk |
| POST | /api/orders | Tambah order produk |
| GET | /api/pricing | Paket harga |
| GET | /api/cashflow/summary | Ringkasan cash flow |
| POST | /api/cashflow/expense | Catat pengeluaran |
| GET | /api/dashboard/stats | Statistik dashboard |

## Perbandingan vs Original

| | Original (PHP) | Baru (Hono + Bun) |
|---|---|---|
| Server | Apache + PHP engine | Bun (built-in) |
| Database | MySQL server | SQLite file |
| Frontend | Vanilla JS | Alpine.js (reaktif) |
| Setup | XAMPP/WAMP | `bun install && bun run start` |
| RAM Usage | ~150MB | ~30MB |
| Binary | PSBillingInstaller.exe | Single binary via `bun build` |
