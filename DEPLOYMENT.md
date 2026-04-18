# PS Billing System - Deployment Guide

## 🚀 Deploy ke Railway (Gratis)

Railway adalah hosting gratis yang cocok untuk aplikasi ini karena:
- Mendukung Bun runtime
- Persistent storage untuk SQLite database
- Free tier: 512MB RAM, 1GB disk, unlimited bandwidth
### Mengapa Railway vs Vercel?

**Railway**:
- ✅ Persistent disk storage (1GB free) - database SQLite tersimpan
- ✅ Support full-stack apps dengan database lokal
- ✅ Support Bun runtime langsung
- ✅ Cocok untuk apps dengan state/data yang perlu disimpan

**Vercel**:
- ❌ Storage tidak persistent (data hilang saat redeploy)
- ❌ Serverless functions - kurang cocok untuk database file-based
- ❌ Perlu external database (PlanetScale, Supabase) atau adapter kompleks
- ✅ Lebih cepat untuk static sites + API sederhana

**Kesimpulan**: Railway lebih cocok karena aplikasi ini pakai SQLite yang butuh persistent storage.
### Langkah-langkah Deploy:

#### 1. Persiapkan Repository GitHub
```bash
# Buat repo baru di GitHub (github.com/new)
# Atau jika sudah ada, push kode kamu

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/username/repo-name.git
git push -u origin main
```

#### 2. Daftar Railway
- Kunjungi [railway.app](https://railway.app)
- Daftar dengan GitHub account
- Verifikasi email

#### 3. Deploy Aplikasi
- Klik "New Project" → "Deploy from GitHub repo"
- Pilih repository kamu
- Railway akan auto-detect sebagai Bun app
- Klik "Deploy"

#### 4. Setup Environment Variables (Opsional)
- Di Railway dashboard, klik project → "Variables"
- Jika perlu custom port: `PORT=3000` (default sudah ok)

#### 5. Setup Database Persistence
- Railway otomatis provide persistent storage
- Database file `ps_billing.db` akan tersimpan di `/app/`

#### 6. Akses Aplikasi
- Setelah deploy selesai, Railway akan kasih URL publik
- Contoh: `https://ps-billing-production.up.railway.app`

### ⚠️ Catatan Penting

- **Database**: Data akan persistent selama project aktif
- **Backup**: Export data Excel secara berkala untuk backup
- **Limits**: Free tier Railway cukup untuk penggunaan ringan
- **Upgrade**: Jika perlu lebih resource, upgrade ke paid plan

### 🔧 Troubleshooting

Jika deploy gagal:
1. Pastikan `package.json` ada dan scripts benar
2. Cek Railway logs untuk error
3. Pastikan semua dependencies ter-install

### 📱 Post-Deploy Checklist

- [ ] Test login admin/user
- [ ] Test semua fitur (billing, products, export)
- [ ] Verifikasi data tersimpan di database
- [ ] Test export Excel

---

**Alternatif Hosting Lain:**
- **Vercel**: Cocok untuk serverless, tapi SQLite kurang ideal
- **Render**: Mirip Railway, free tier dengan persistent disk
- **Netlify**: Lebih untuk static sites + functions

Railway direkomendasikan untuk aplikasi ini.