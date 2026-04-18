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

    isLoggedIn: false,
    isAdmin: false,
    loginPassword: '',
    loginRole: 'admin',

    async login() {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.loginPassword, role: this.loginRole })
      }).then(res => res.json());

      console.log('Login response:', r);
      if (r.success) {
        sessionStorage.setItem('ps_admin_token', r.token);
        sessionStorage.setItem('ps_is_admin', r.isAdmin ? 'true' : 'false');
        console.log('✅ Token saved:', sessionStorage.getItem('ps_admin_token'));
        this.isLoggedIn = true;
        this.isAdmin = r.isAdmin;
        this.showToast(`✅ Login berhasil sebagai ${r.isAdmin ? 'Admin' : 'User'}`);
        await this.setupAfterAuth();
      } else {
        this.showToast(r.error || 'Login gagal', 'error');
      }
    },

    logout() {
      sessionStorage.removeItem('ps_admin_token');
      sessionStorage.removeItem('ps_is_admin');
      this.isLoggedIn = false;
      this.isAdmin = false;
      this.loginPassword = '';
      this.page = 'dashboard';
      this.modal = '';
      this.showToast('✅ Logout berhasil');
      console.log('✅ Logged out, session cleared');
    },

    // Cari dan GANTI fungsi api() bawaan dengan ini:
    async api(path, options = {}) {
      try {
const token = sessionStorage.getItem('ps_admin_token');
        const headers = {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': 'Bearer ' + token }),
          ...options.headers
        };
        
        console.log('API Request:', path, 'Token:', token, 'Headers:', headers);
        
        const res = await fetch('/api' + path, {
          ...options,
          headers
        });
        const data = await res.json();
        
        console.log('API Response:', path, data);
        
        // Check untuk auth error
        if (!data.success && (data.error?.includes("Akses ditolak") || data.error?.includes("login"))) {
          console.warn('Auth error detected, logging out');
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

      if (savedToken) {
        this.isLoggedIn = true;
        this.isAdmin = savedIsAdmin === 'true';
        console.log('✅ Session restored:', { isAdmin: this.isAdmin });
        await this.setupAfterAuth();
      } else {
        this.isLoggedIn = false;
        this.isAdmin = false;
        console.log('❌ No session, show login page');
      }
      this.authChecked = true;
    },
    
    async setupAfterAuth() {
      this.updateClock();
      setInterval(() => this.updateClock(), 1000);

      await this.loadDashboard();
      await this.loadStations();
      await this.loadPricing();

      setInterval(() => {
        if (this.page === 'dashboard' || this.page === 'stations') {
          this.loadStations();
          if (this.page === 'dashboard') this.loadDashboard();
        }
      }, 30000);
    },

    async init() {
      console.warn('init() deprecated, gunakan checkAuth() atau login()');
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

    getElapsed(startTime) {
      if (!startTime) return '';
      const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 60000);
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return h > 0 ? `${h}j ${m}m` : `${m} menit`;
    },

    showToast(msg, type = 'success') {
      this.toast = { show: true, msg, type };
      setTimeout(() => this.toast.show = false, 3000);
    },

    // ── Load Data ──────────────────────────────────────────────────────────
    async loadDashboard() {
      const r = await this.api('/dashboard/stats');
      if (r.success) this.stats = r.stats;
    },

    async loadStations() {
      const r = await this.api('/stations');
      if (r.success) this.stations = r.data;
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
      this.selectedStation = station;
      this.billResult = null;
      this.form = { customer_name: '', pricing_id: null, notes: '' };
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
        this.showToast('✅ Sesi selesai. Total: ' + this.formatRp(r.grand_total));
      } else {
        this.showToast(r.error || 'Gagal stop sesi', 'error');
      }
    },

    // ── Orders ─────────────────────────────────────────────────────────────
    openAddOrder(station) {
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
      this.form = { name: '', price: '', stock: 0, category: 'food' };
      this.modal = 'addProduct';
    },

    openEditProduct(p) {
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
      this.form = { label: '', price: '', type: 'package', duration_minutes: '' };
      this.modal = 'addPricing';
    },

    openEditPricing(p) {
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
