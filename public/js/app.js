// public/js/app.js

function app() {
  return {
    page: 'dashboard',
    modal: '',
    clock: '',
    toast: { show: false, msg: '', type: 'success' },

    // Data
    stations: [],
    products: [],
    pricing: [],
    cashflows: [],
    cfSummary: {},
    history: [],
    stats: {},

    // Form
    form: {},
    selectedStation: null,
    billResult: null,
    orderCart: {},

    // Dates
    cfStartDate: new Date().toISOString().split('T')[0],
    cfEndDate: new Date().toISOString().split('T')[0],
    histStartDate: new Date().toISOString().split('T')[0],
    histEndDate: new Date().toISOString().split('T')[0],
    authChecked: false,

    isAdmin: false,
    adminLogin: { username: 'admin', password: '' },
    _clockInterval: null,
    _refreshInterval: null,

    // Timer & Alarm state
    stationTimers: {},
    _timerIntervals: [],
    alarmQueue: [],
    alarmPlaying: false,
    _audioCtx: null,

    openAdminLogin() {
      this.adminLogin = { username: 'admin', password: '' };
      this.modal = 'adminLogin';
    },

    async loginAdmin() {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.adminLogin.username,
          password: this.adminLogin.password
        })
      }).then(res => res.json());

      if (r.success) {
        sessionStorage.setItem('ps_admin_token', r.token);
        sessionStorage.setItem('ps_is_admin', 'true');
        this.isAdmin = true;
        this.modal = '';

        // Init AudioContext di sini (butuh user gesture agar browser izinkan suara)
        try {
          this._audioCtx = new AudioContext();
          this._audioCtx.resume();
        } catch(e) {
          console.warn('AudioContext gagal:', e);
        }

        this.showToast('✅ Login admin berhasil');
        await this.loadPricing();
      } else {
        this.showToast(r.error || 'Login gagal', 'error');
      }
    },

    logout() {
      sessionStorage.removeItem('ps_admin_token');
      sessionStorage.removeItem('ps_is_admin');
      this.isAdmin = false;
      this.page = 'dashboard';
      this.modal = '';
      // Clear semua timer saat logout
      this._timerIntervals.forEach(id => clearInterval(id));
      this._timerIntervals = [];
      this.stationTimers = {};
      this.alarmQueue = [];
      this.showToast('✅ Kembali ke guest mode');
      this.loadDashboard();
      this.loadStations();
    },

    async api(path, options = {}) {
      try {
        const token = sessionStorage.getItem('ps_admin_token');
        const headers = {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': 'Bearer ' + token }),
          ...options.headers
        };

        const res = await fetch('/api' + path, {
          ...options,
          headers
        });
        const data = await res.json();

        if (!data.success && (data.error?.includes("Akses ditolak") || data.error?.includes("login"))) {
          this.showToast('Sesi admin berakhir, kembali ke guest mode', 'error');
          this.logout();
        }
        return data;
      } catch (e) {
        console.error('API Error:', e);
        this.showToast('Gagal koneksi ke server: ' + e.message, 'error');
        return { success: false };
      }
    },

    async checkAuth() {
      const savedToken = sessionStorage.getItem('ps_admin_token');
      const savedIsAdmin = sessionStorage.getItem('ps_is_admin');

      if (savedToken && savedIsAdmin === 'true') {
        this.isAdmin = true;

        // Init AudioContext juga saat restore session (user sudah pernah login)
        try {
          this._audioCtx = new AudioContext();
          this._audioCtx.resume();
        } catch(e) {}
      } else {
        this.isAdmin = false;
      }
      await this.setupAfterAuth();
      this.authChecked = true;
    },

    async setupAfterAuth() {
      this.updateClock();
      if (!this._clockInterval) {
        this._clockInterval = setInterval(() => this.updateClock(), 1000);
      }

      await this.loadDashboard();
      await this.loadStations();
      if (this.isAdmin) await this.loadPricing();

      if (!this._refreshInterval) this._refreshInterval = setInterval(() => {
        if (this.page === 'dashboard' || this.page === 'stations') {
          this.loadStations();
          if (this.page === 'dashboard') this.loadDashboard();
        }
      }, 30000);
    },

    async init() {
      console.warn('init() deprecated, gunakan checkAuth()');
    },

    updateClock() {
      const now = new Date();
      this.clock = now.toLocaleString('id-ID', {
        weekday: 'short', day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    },

    formatRp(n) {
      return 'Rp ' + Number(n).toLocaleString('id-ID');
    },

    formatTime(dt) {
      if (!dt) return '-';
      return new Date(dt).toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    },

    // Format detik ke HH:MM:SS
    fmtTimer(sec) {
      const s = Math.abs(Math.floor(sec));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      return [h, m, ss].map(v => String(v).padStart(2, '0')).join(':');
    },

    showToast(msg, type = 'success', duration = 3000) {
      this.toast = { show: true, msg, type };
      setTimeout(() => this.toast.show = false, duration);
    },

    // ── Alarm & Auto-stop ──────────────────────────────────────────────────

    playAlarm() {
      if (this.alarmPlaying) return;
      if (!this._audioCtx) return;
      this.alarmPlaying = true;

      const ctx = this._audioCtx;
      const beepCount = 5;
      const beepDuration = 0.15;
      const beepGap = 0.1;

      for (let i = 0; i < beepCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = 880;
        const start = ctx.currentTime + i * (beepDuration + beepGap);
        gain.gain.setValueAtTime(0.3, start);
        gain.gain.setValueAtTime(0, start + beepDuration);
        osc.start(start);
        osc.stop(start + beepDuration);
      }

      const totalDuration = beepCount * (beepDuration + beepGap) * 1000;
      setTimeout(() => { this.alarmPlaying = false; }, totalDuration);
    },

    triggerAlarm(station) {
      const already = this.alarmQueue.find(a => a.station_id === station.id);
      if (!already) {
        this.alarmQueue.push({ station_id: station.id, station_name: station.name });
      }
      this.playAlarm();
      this.showToast(`⚠ Waktu habis: ${station.name} — segera selesaikan sesi!`, 'error', 8000);
    },

    async autoStopStation(station) {
      const r = await this.api('/billing/stop/' + station.session_id, { method: 'POST' });
      if (r.success) {
        this.alarmQueue = this.alarmQueue.filter(a => a.station_id !== station.id);
        this.showToast(`✅ Auto-stop: ${station.name} — sesi selesai otomatis`);
        await this.loadStations();
        await this.loadDashboard();
      } else {
        this.showToast(`Gagal auto-stop ${station.name}: ` + (r.error || 'Error'), 'error');
      }
    },

    // ── Timer System ───────────────────────────────────────────────────────

    startStationTimers(stations) {
      // Clear interval lama
      this._timerIntervals.forEach(id => clearInterval(id));
      this._timerIntervals = [];

      stations.forEach(station => {
        if (station.status !== 'in_use' || !station.start_time) return;

        const intervalId = setInterval(() => {
          const elapsed = Math.floor((Date.now() - new Date(station.start_time).getTime()) / 1000);

          let display = '';
          let isOvertime = false;

          if (station.duration_minutes) {
            // Paket waktu: countdown
            const remaining = (station.duration_minutes * 60) - elapsed;
            if (remaining >= 0) {
              display = this.fmtTimer(remaining);
              isOvertime = false;
            } else {
              display = '+' + this.fmtTimer(Math.abs(remaining));
              isOvertime = true;
            }

            // Trigger alarm & auto-stop sekali saja saat habis
            if (remaining <= 0 && !station._alarmFired) {
              station._alarmFired = true;
              if (this.isAdmin) {
                this.triggerAlarm(station);
              }
              this.autoStopStation(station);
            }
          } else {
            // Main bebas / open: countup
            display = this.fmtTimer(elapsed);
            isOvertime = false;
          }

          this.stationTimers[station.id] = { display, isOvertime };
        }, 1000);

        this._timerIntervals.push(intervalId);
      });
    },

    // ── Load Data ──────────────────────────────────────────────────────────

    async loadDashboard() {
      const r = await this.api('/dashboard/stats');
      if (r.success) this.stats = r.stats;
    },

    async loadStations() {
      const r = await this.api('/stations');
      if (r.success) {
        // Preserve _alarmFired flag agar tidak re-trigger setiap 30 detik
        const prev = this.stations;
        this.stations = r.data.map(s => {
          const old = prev.find(p => p.id === s.id);
          if (old?._alarmFired) s._alarmFired = true;
          return s;
        });
        this.startStationTimers(this.stations);
      }
    },

    async loadProducts() {
      const r = await this.api('/products');
      if (r.success) this.products = r.data;
    },

    async loadPricing() {
      const r = await this.api('/pricing');
      if (r.success) this.pricing = r.data;
    },

    async loadCashflow() {
      const query = `/cashflow?start=${this.cfStartDate}&end=${this.cfEndDate}&limit=200`;
      const [cf, summary] = await Promise.all([
        this.api(query),
        this.api(`/cashflow/summary?start=${this.cfStartDate}&end=${this.cfEndDate}`)
      ]);
      if (cf.success) this.cashflows = cf.data;
      if (summary.success) this.cfSummary = summary;
    },

    async loadHistory() {
      const r = await this.api(`/billing/history?start=${this.histStartDate}&end=${this.histEndDate}&limit=100`);
      if (r.success) this.history = r.data;
    },

    // ── Billing ────────────────────────────────────────────────────────────

    openStartBilling(station) {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.selectedStation = station;
      this.billResult = null;
      this.form = { customer_name: '', pricing_id: null, notes: '' };
      if (!this.pricing.length) this.loadPricing();
      this.modal = 'start';
    },

    async startBilling() {
      if (!this.form.pricing_id) return;
      const r = await this.api('/billing/start', {
        method: 'POST',
        body: JSON.stringify({
          station_id: this.selectedStation.id,
          pricing_id: this.form.pricing_id,
          customer_name: this.form.customer_name,
          notes: this.form.notes
        })
      });
      if (r.success) {
        this.showToast(`✅ Sesi dimulai di ${this.selectedStation.name}`);
        this.modal = '';
        await this.loadStations();
        await this.loadDashboard();
      } else {
        this.showToast(r.error || 'Gagal memulai sesi', 'error');
      }
    },

    openStopBilling(station) {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.selectedStation = station;
      this.billResult = null;
      this.modal = 'stop';
    },

    async stopBilling() {
      const sessionId = this.selectedStation.session_id;
      if (!sessionId) return;
      const r = await this.api('/billing/stop/' + sessionId, { method: 'POST' });
      if (r.success) {
        this.billResult = r;
        // Hapus dari alarmQueue jika ada
        this.alarmQueue = this.alarmQueue.filter(a => a.station_id !== this.selectedStation.id);
        this.showToast('✅ Sesi selesai. Total: ' + this.formatRp(r.grand_total));
      } else {
        this.showToast(r.error || 'Gagal stop sesi', 'error');
      }
    },

    // ── Orders ─────────────────────────────────────────────────────────────

    openAddOrder(station) {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.selectedStation = station;
      this.orderCart = {};
      if (this.products.length === 0) this.loadProducts();
      this.modal = 'order';
    },

    increaseQty(product) {
      this.orderCart[product.id] = (this.orderCart[product.id] || 0) + 1;
    },

    decreaseQty(product) {
      if ((this.orderCart[product.id] || 0) > 0) {
        this.orderCart[product.id]--;
      }
    },

    getOrderTotal() {
      return this.products.reduce((sum, p) => {
        return sum + (this.orderCart[p.id] || 0) * p.price;
      }, 0);
    },

    async submitOrder() {
      const items = this.products.filter(p => (this.orderCart[p.id] || 0) > 0);
      for (const p of items) {
        await this.api('/orders', {
          method: 'POST',
          body: JSON.stringify({
            session_id: this.selectedStation.session_id,
            station_id: this.selectedStation.id,
            product_id: p.id,
            quantity: this.orderCart[p.id]
          })
        });
      }
      this.showToast(`✅ ${items.length} item dipesan`);
      this.modal = '';
      await this.loadProducts();
    },

    // ── Station ────────────────────────────────────────────────────────────

    openAddStation() {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.form = { name: '', type: 'PS4' };
      this.modal = 'addStation';
    },

    async addStation() {
      const r = await this.api('/stations', {
        method: 'POST',
        body: JSON.stringify({ name: this.form.name, type: this.form.type })
      });
      if (r.success) {
        this.showToast('✅ Station ditambahkan');
        this.modal = '';
        this.loadStations();
      }
    },

    async setMaintenance(id, isMaintenace) {
      const station = this.stations.find(s => s.id === id);
      await this.api('/stations/' + id, {
        method: 'PUT',
        body: JSON.stringify({
          name: station.name,
          type: station.type,
          status: isMaintenace ? 'maintenance' : 'available'
        })
      });
      this.loadStations();
    },

    async deleteStation(id) {
      if (!confirm('Hapus station ini? Pastikan tidak ada sesi aktif.')) return;
      const r = await this.api(`/stations/${id}`, { method: 'DELETE' });
      if (r.success) {
        this.showToast('✅ Station dihapus');
        this.loadStations();
      } else {
        this.showToast(r.error || 'Gagal hapus station', 'error');
      }
    },

    // ── Product ────────────────────────────────────────────────────────────

    openAddProduct() {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.form = { name: '', price: '', stock: 0, category: 'food' };
      this.modal = 'addProduct';
    },

    openEditProduct(p) {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.form = { ...p };
      this.modal = 'addProduct';
    },

    async saveProduct() {
      const method = this.form.id ? 'PUT' : 'POST';
      const path = this.form.id ? `/products/${this.form.id}` : '/products';
      const r = await this.api(path, {
        method,
        body: JSON.stringify(this.form)
      });
      if (r.success) {
        this.showToast('✅ Produk disimpan');
        this.modal = '';
        this.loadProducts();
      }
    },

    async deleteProduct(id) {
      if (!confirm('Hapus produk ini?')) return;
      const r = await this.api(`/products/${id}`, { method: 'DELETE' });
      if (r.success) {
        this.showToast('✅ Produk dihapus');
        this.loadProducts();
      } else {
        this.showToast(r.error || 'Gagal hapus produk', 'error');
      }
    },

    // ── Pricing ────────────────────────────────────────────────────────────

    openAddPricing() {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.form = { label: '', price: '', type: 'package', duration_minutes: '' };
      this.modal = 'addPricing';
    },

    openEditPricing(p) {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.form = { ...p };
      this.modal = 'addPricing';
    },

    async savePricing() {
      const method = this.form.id ? 'PUT' : 'POST';
      const path = this.form.id ? `/pricing/${this.form.id}` : '/pricing';
      const r = await this.api(path, {
        method,
        body: JSON.stringify(this.form)
      });
      if (r.success) {
        this.showToast('✅ Paket disimpan');
        this.modal = '';
        this.loadPricing();
      }
    },

    async deletePricing(id) {
      if (!confirm('Hapus paket harga ini?')) return;
      const r = await this.api(`/pricing/${id}`, { method: 'DELETE' });
      if (r.success) {
        this.showToast('✅ Paket dihapus');
        this.loadPricing();
      } else {
        this.showToast(r.error || 'Gagal hapus paket', 'error');
      }
    },

    // ── Cash Flow ──────────────────────────────────────────────────────────

    openAddExpense() {
      if (!this.isAdmin) return this.showToast('Login admin diperlukan', 'error');
      this.form = { amount: '', description: '', category: 'operational' };
      this.modal = 'expense';
    },

    async saveExpense() {
      const r = await this.api('/cashflow/expense', {
        method: 'POST',
        body: JSON.stringify(this.form)
      });
      if (r.success) {
        this.showToast('✅ Pengeluaran dicatat');
        this.modal = '';
        this.loadCashflow();
      }
    },

    // ── Export ─────────────────────────────────────────────────────────────

    async downloadFile(filename, data) {
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    },

    async exportStations() {
      try {
        const token = sessionStorage.getItem('ps_admin_token');
        const res = await fetch('/api/export/stations', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
          this.showToast('Gagal export stations: ' + res.statusText, 'error');
          return;
        }
        const blob = await res.blob();
        this.downloadFile('stations.xlsx', blob);
        this.showToast('✅ Export stations berhasil');
      } catch (e) {
        this.showToast('Error export: ' + e.message, 'error');
      }
    },

    async exportCashflow() {
      try {
        const token = sessionStorage.getItem('ps_admin_token');
        const res = await fetch(`/api/export/cashflow?start=${this.cfStartDate}&end=${this.cfEndDate}`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
          this.showToast('Gagal export cashflow: ' + res.statusText, 'error');
          return;
        }
        const blob = await res.blob();
        this.downloadFile('cashflow.xlsx', blob);
        this.showToast('✅ Export cashflow berhasil');
      } catch (e) {
        this.showToast('Error export: ' + e.message, 'error');
      }
    },

    async exportHistory() {
      try {
        const token = sessionStorage.getItem('ps_admin_token');
        const res = await fetch(`/api/export/history?start=${this.histStartDate}&end=${this.histEndDate}`, {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) {
          this.showToast('Gagal export history: ' + res.statusText, 'error');
          return;
        }
        const blob = await res.blob();
        this.downloadFile('history.xlsx', blob);
        this.showToast('✅ Export history berhasil');
      } catch (e) {
        this.showToast('Error export: ' + e.message, 'error');
      }
    }
  };
}
