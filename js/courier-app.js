// ERP & CRM Tizimi - Kuryer Mobil Ilovasi Logikasi

window.formatMoney = function(amount, currency = 'UZS') {
    if (currency === 'UZS') {
        return new Intl.NumberFormat('uz-UZ', { style: 'decimal' }).format(amount) + " so'm";
    } else {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
};

window.CourierApp = {
    activeTab: 'active', // 'active', 'history'
    courierUser: null,
    receiptsList: [],

    init: function() {
        this.setupEventListeners();
        this.checkAuth();
    },

    setupEventListeners: function() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.onsubmit = (e) => {
                e.preventDefault();
                this.handleLogin();
            };
        }
    },

    checkAuth: function() {
        const stored = localStorage.getItem('activeCourier');
        const loginView = document.getElementById('login-view');
        const appView = document.getElementById('app-view');

        if (stored) {
            try {
                this.courierUser = JSON.parse(stored);
                if (loginView) loginView.style.display = 'none';
                if (appView) appView.style.display = 'flex';
                this.showApp();
            } catch (e) {
                localStorage.removeItem('activeCourier');
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    },

    showLogin: function() {
        this.courierUser = null;
        const loginView = document.getElementById('login-view');
        const appView = document.getElementById('app-view');
        if (loginView) loginView.style.display = 'flex';
        if (appView) appView.style.display = 'none';
    },

    handleLogin: async function() {
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorBanner = document.getElementById('login-error');

        if (!usernameInput || !passwordInput) return;

        const login = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (errorBanner) errorBanner.style.display = 'none';

        try {
            const response = await fetch('/api/courier/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login, password })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || 'Login xatosi');
            }

            const data = await response.json();
            localStorage.setItem('activeCourier', JSON.stringify(data.employee));
            this.courierUser = data.employee;

            // Clear inputs
            usernameInput.value = '';
            passwordInput.value = '';

            this.checkAuth();
        } catch (err) {
            console.error('Courier login failed:', err);
            if (errorBanner) {
                errorBanner.textContent = err.message || "Noto'g'ri login yoki parol!";
                errorBanner.style.display = 'block';
            }
        }
    },

    logout: function() {
        if (confirm('Tizimdan chiqishni xohlaysizmi?')) {
            localStorage.removeItem('activeCourier');
            this.showLogin();
        }
    },

    showApp: function() {
        const nameLabel = document.getElementById('courier-name');
        const avatarLabel = document.getElementById('courier-avatar');
        if (nameLabel && this.courierUser) {
            nameLabel.textContent = this.courierUser.name;
            if (avatarLabel) {
                avatarLabel.textContent = this.courierUser.name.charAt(0).toUpperCase();
            }
        }
        this.loadData();
    },

    loadData: async function() {
        if (!this.courierUser) return;
        
        try {
            const res = await fetch(`/api/courier/receipts?courier_name=${encodeURIComponent(this.courierUser.name)}`);
            if (!res.ok) throw new Error('Failed to load receipts');
            
            const data = await res.json();
            this.receiptsList = Array.isArray(data) ? data : [];
            this.calculateBalance();
            this.render();
        } catch (e) {
            console.error('Error loading courier data:', e);
        }
    },

    calculateBalance: function() {
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        // Sum up delivery fees for all delivered receipts today
        const today = new Date().toDateString();
        
        let todayFeeTotal = 0;
        let todayDeliveredCount = 0;

        this.receiptsList.forEach(r => {
            let items = r.items;
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch(e) { items = {}; }
            }
            if (items && items.delivery && items.delivery.status === 'delivered') {
                // Check if created today
                const createdDate = new Date(r.created_at).toDateString();
                if (createdDate === today) {
                    todayFeeTotal += (items.delivery.fee || 15000);
                    todayDeliveredCount++;
                }
            }
        });

        const balanceVal = document.getElementById('courier-balance');
        const countLabel = document.getElementById('courier-delivered-count');

        if (balanceVal) balanceVal.textContent = formatMoney(todayFeeTotal, currency);
        if (countLabel) countLabel.textContent = todayDeliveredCount + ' ta buyurtma';
    },

    switchTab: function(tabName) {
        this.activeTab = tabName;
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        this.render();
    },

    render: function() {
        const container = document.getElementById('deliveries-list');
        const countActiveBadge = document.getElementById('count-active');
        if (!container) return;

        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        // Helper to parse items safely
        const parseItems = (r) => {
            let items = r.items;
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch(e) { items = {}; }
            }
            return items || {};
        };

        const activeReceipts = [];
        const historyReceipts = [];
        let activeCount = 0;

        this.receiptsList.forEach(r => {
            const parsed = parseItems(r);
            const status = parsed.delivery?.status || '';

            if (status === 'shipped' || status === 'waiting_cash_confirm') {
                activeReceipts.push({ ...r, parsed, deliveryStatus: status });
                if (status === 'shipped') {
                    activeCount++; // Count shipped as active waiting for delivery action
                }
            } else if (status === 'delivered' || status === 'cancelled') {
                historyReceipts.push({ ...r, parsed, deliveryStatus: status });
            }
        });

        // Update counts
        if (countActiveBadge) {
            countActiveBadge.textContent = activeCount;
            countActiveBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
        }

        const listToRender = this.activeTab === 'active' ? activeReceipts : historyReceipts;

        if (listToRender.length === 0) {
            container.innerHTML = `
                <div class="empty-placeholder">
                    <i class="fas ${this.activeTab === 'active' ? 'fa-truck-loading' : 'fa-history'}"></i>
                    <p>${this.activeTab === 'active' ? 'Faol yetkazib berish buyurtmalari yo\'q.' : 'Yetkazib berishlar tarixi bo\'sh.'}</p>
                </div>
            `;
            return;
        }

        let html = '';
        listToRender.forEach(r => {
            const dateObj = new Date(r.created_at);
            const formattedDate = isNaN(dateObj.getTime()) ? r.created_at : dateObj.toLocaleString('uz-UZ', { hour12: false });
            const dev = r.parsed.delivery || {};

            let badgeClass = 'badge-secondary';
            let badgeText = 'Noma\'lum';
            if (r.deliveryStatus === 'shipped') {
                badgeClass = 'badge-primary';
                badgeText = 'Yo\'lda';
            } else if (r.deliveryStatus === 'waiting_cash_confirm') {
                badgeClass = 'badge-warning';
                badgeText = 'Tasdiq kutilmoqda';
            } else if (r.deliveryStatus === 'delivered') {
                badgeClass = 'badge-success';
                badgeText = 'Yetkazildi';
            } else if (r.deliveryStatus === 'cancelled') {
                badgeClass = 'badge-danger';
                badgeText = 'Bekor qilindi';
            }

            // Products list string
            const prods = r.parsed.products || [];
            const prodListText = prods.map(p => `${p.quantity}x ${p.name}`).join(', ');

            // Cash collection block
            let collectHtml = '';
            if (dev.collect_required) {
                collectHtml = `
                    <div class="collect-box">
                        <span><i class="fas fa-coins"></i> Mijozdan olinadi:</span>
                        <strong>${formatMoney(dev.collect_amount || 0, currency)}</strong>
                    </div>
                `;
            }

            // Actions row
            let actionsHtml = '';
            if (r.deliveryStatus === 'shipped') {
                const completeLabel = dev.collect_required ? 'Yetkazdim (Pul olindi)' : 'Yetkazdim';
                actionsHtml = `
                    <div class="btn-group-row">
                        <button class="btn btn-success" onclick="CourierApp.completeDelivery('${r.id}', true)">
                            <i class="fas fa-check-circle"></i> ${completeLabel}
                        </button>
                        <button class="btn btn-secondary" onclick="CourierApp.completeDelivery('${r.id}', false)">
                            <i class="fas fa-times-circle" style="color: var(--danger)"></i> Bekor qilish
                        </button>
                    </div>
                `;
            } else if (r.deliveryStatus === 'waiting_cash_confirm') {
                actionsHtml = `
                    <div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 6px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; margin-top: 4px;">
                        <i class="fas fa-spinner fa-spin" style="margin-right: 4px;"></i> Kassa tomonidan naqd pul tasdiqlanishi kutilmoqda...
                    </div>
                `;
            }

            // Maps link helper
            const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(dev.address || '')}`;

            html += `
                <div class="delivery-card">
                    <div class="delivery-card-header">
                        <div>
                            <h4>${r.code || 'CH-' + r.id.substring(0, 8)}</h4>
                            <div class="date">${formattedDate}</div>
                        </div>
                        <span class="badge ${badgeClass}">${badgeText}</span>
                    </div>

                    <div class="detail-item">
                        <i class="fas fa-user"></i>
                        <span>Xaridor: <strong>${r.parsed.customer_name || '-'}</strong></span>
                    </div>

                    <div class="detail-item">
                        <i class="fas fa-phone-alt"></i>
                        <span>Telefon: <a href="tel:${r.parsed.customer_phone}">${r.parsed.customer_phone || '-'}</a></span>
                    </div>

                    <div class="detail-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>Manzil: <strong>${dev.address || '-'}</strong> <a href="${mapsUrl}" target="_blank" style="margin-left:8px; color:var(--info); font-family:inherit; font-size:12px;"><i class="fas fa-map" style="color:var(--info)"></i> Navigatsiya</a></span>
                    </div>

                    <div class="detail-item">
                        <i class="fas fa-box"></i>
                        <span style="font-size: 12px; color: var(--text-muted); max-height: 40px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${prodListText}</span>
                    </div>

                    ${collectHtml}

                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px; border-top:1px solid var(--border-color); padding-top:8px; margin-top:4px;">
                        <span style="color:var(--text-muted)">Dastavka haqi:</span>
                        <strong style="color:var(--accent); font-family:'JetBrains Mono';">${formatMoney(dev.fee || 15000, currency)}</strong>
                    </div>

                    ${actionsHtml}
                </div>
            `;
        });

        container.innerHTML = html;
    },

    completeDelivery: async function(receiptId, success) {
        const receipt = this.receiptsList.find(r => r.id === receiptId);
        if (!receipt) return;

        let itemsObj = receipt.items;
        if (typeof itemsObj === 'string') {
            try {
                itemsObj = JSON.parse(itemsObj);
            } catch(e) {
                itemsObj = {};
            }
        }
        if (!itemsObj || typeof itemsObj !== 'object') return;
        if (!itemsObj.delivery) itemsObj.delivery = {};

        const isCollectRequired = !!itemsObj.delivery.collect_required;

        let nextStatus = '';
        let confirmMsg = '';

        if (success) {
            if (isCollectRequired) {
                nextStatus = 'waiting_cash_confirm';
                confirmMsg = "Mijozdan pul olganingizni va buyurtmani kassa tasdig'iga yuborishni tasdiqlaysizmi?";
            } else {
                nextStatus = 'delivered';
                confirmMsg = "Buyurtma yetkazilganligini tasdiqlaysizmi?";
            }
        } else {
            nextStatus = 'cancelled';
            confirmMsg = "Buyurtmani bekor qilishni tasdiqlaysizmi?";
        }

        if (!confirm(confirmMsg)) return;

        itemsObj.delivery.status = nextStatus;

        const updatedReceipt = {
            ...receipt,
            items: itemsObj
        };

        try {
            const response = await fetch('/api/receipts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedReceipt)
            });

            if (!response.ok) throw new Error('API update failed');
            
            // Reload local cache & render
            await this.loadData();
        } catch(e) {
            console.error('Failed to update receipt delivery status:', e);
            alert('Xatolik yuz berdi: statusni yangilab bo\'lmadi.');
        }
    }
};

// Initialize Courier App
document.addEventListener('DOMContentLoaded', () => {
    window.CourierApp.init();
});
