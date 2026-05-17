# Supabase + Vercel Migration Guide

## 1) Ambil DATABASE_URL dari Supabase
1. Buka Supabase project -> **Settings** -> **Database**.
2. Copy **Connection string** (pakai Transaction Pooler untuk Vercel).
3. Simpan sebagai `DATABASE_URL` di Vercel Project Settings -> Environment Variables.

## 2) Buat schema
- Buka Supabase SQL Editor.
- Jalankan `supabase/schema.sql`.

## 3) Migrasi data dari SQLite lama (opsional)
- Export per tabel ke CSV dari SQLite.
- Import CSV ke tabel Supabase melalui Table Editor.

## 4) Refactor backend ke Postgres
Aplikasi saat ini masih memakai `bun:sqlite`, jadi butuh refactor query layer sebelum deploy penuh ke Vercel.

## 5) Checklist go-live
- [ ] `DATABASE_URL` sudah di-set di Vercel (Production, Preview, Development)
- [ ] Semua endpoint CRUD dites manual
- [ ] Test redeploy: data tetap ada
- [ ] Backup policy Supabase aktif
