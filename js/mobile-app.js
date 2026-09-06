// Webzone Mobile Application Logic (PWA / Touch-First App)

window.MobileApp = {
    currentUser: null,
    currentCompany: null,
    activeView: 'home',
    clientsCache: [],
    inventoryCache: [],
    html5QrScanner: null,
    deferredPrompt: null,

    init: async function() {
        this.setupPwaInstall();
        this.checkAuth();
    },

    setupPwaInstall: function() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const banner = document.getElementById('mobile-install-banner');
            if (banner) banner.style.display = 'flex';
        });

        window.addEventListener('appinstalled', () => {
            const banner = document.getElementById('mobile-install-banner');
            if (banner) banner.style.display = 'none';
            this.deferredPrompt = null;
        });
    },

    installPwa: async function() {
        if (!this.deferredPrompt) {
            alert("Ilovani o'rnatish uchun brauzer menyusidan 'Bosh ekranga qo'shish' (Add to Home screen) tugmasini bosing.");
            return;
        }
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            const banner = document.getElementById('mobile-install-banner');
            if (banner) banner.style.display = 'none';
        }
        this.deferredPrompt = null;
    },

    checkAuth: function() {
        const savedAuth = localStorage.getItem('mobile_auth');
        if (savedAuth) {
            try {
                const parsed = JSON.parse(savedAuth);
                this.currentUser = parsed.user;
                this.currentCompany = parsed.user.company_id || 'giperbrendstroy';
                document.cookie = `company_id=${this.currentCompany}; path=/`;
                
                // Show app UI, hide login
                document.getElementById('mobile-login-view').style.display = 'none';
                document.getElementById('mobile-app-header').style.display = 'flex';
                document.getElementById('mobile-app-nav').style.display = 'flex';
                
                this.updateHeaderUserInfo();
                this.renderNavigation();

                if (this.currentUser.role === 'usta') {
                    this.switchView('usta-cabinet');
                } else {
                    this.switchView('home');
                    this.refreshUserPermissions();
                }
                return;
            } catch(e) {
                localStorage.removeItem('mobile_auth');
            }
        }

        // Show login view
        document.getElementById('mobile-login-view').style.display = 'block';
        document.getElementById('mobile-app-header').style.display = 'none';
        document.getElementById('mobile-app-nav').style.display = 'none';
    },

    refreshUserPermissions: async function() {
        if (!this.currentUser) return;
        try {
            const url = this.currentUser.id 
                ? `/api/mobile/permissions?employee_id=${encodeURIComponent(this.currentUser.id)}`
                : `/api/mobile/permissions?role=${encodeURIComponent(this.currentUser.role || '')}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.ok && Array.isArray(data.my_permissions)) {
                    this.currentUser.mobile_permissions = data.my_permissions;
                    const saved = JSON.parse(localStorage.getItem('mobile_auth') || '{}');
                    saved.user = this.currentUser;
                    localStorage.setItem('mobile_auth', JSON.stringify(saved));
                    this.renderNavigation();
                }
            }
        } catch (e) {
            console.warn("Could not refresh live mobile permissions:", e);
        }
    },

    hasPermission: function(permKey) {
        if (!this.currentUser) return false;
        
        // 1. Agar foydalanuvchiga ruxsatlar biriktirilgan bo'lsa (serverdan olingan), unga qat'iy amal qilinadi
        const perms = this.currentUser.mobile_permissions;
        if (Array.isArray(perms)) {
            return perms.includes(permKey);
        }

        // 2. Agar hali ruxsatlar yuklanmagan bo'lsa, faqat admin/superadmin uchun boshlang'ich ruxsat
        const role = (this.currentUser.role || '').toLowerCase();
        if (role.includes('admin') || role.includes('superadmin')) {
            return true;
        }
        return false;
    },
    loginType: 'usta',

    setLoginType: function(type) {
        this.loginType = type;
        const tabUsta = document.getElementById('tab-login-usta');
        const tabStaff = document.getElementById('tab-login-staff');
        const formUsta = document.getElementById('m-form-usta-login');
        const formStaff = document.getElementById('m-form-staff-login');
        const errorEl = document.getElementById('m-login-error');

        if (errorEl) errorEl.style.display = 'none';

        if (type === 'usta') {
            if (tabUsta) tabUsta.classList.add('active');
            if (tabStaff) tabStaff.classList.remove('active');
            if (formUsta) formUsta.style.display = 'block';
            if (formStaff) formStaff.style.display = 'none';
        } else {
            if (tabStaff) tabStaff.classList.add('active');
            if (tabUsta) tabUsta.classList.remove('active');
            if (formStaff) formStaff.style.display = 'block';
            if (formUsta) formUsta.style.display = 'none';
        }
    },

    openLoginScanner: function() {
        const modal = document.getElementById('m-scanner-modal');
        if (!modal) return;
        modal.classList.add('active');

        const resultEl = document.getElementById('m-scanner-result');
        if (resultEl) resultEl.textContent = "Kamerani kartangizdagi shtrix-kodga qarating";

        if (typeof Html5Qrcode === 'undefined') {
            if (resultEl) resultEl.textContent = "Kamera skaneri kutubxonasi yuklanmadi. Shtrix-kodni qo'lda kiriting.";
            return;
        }

        try {
            this.html5QrScanner = new Html5Qrcode("scanner-reader");
            const config = { fps: 10, qrbox: { width: 250, height: 180 } };
            this.html5QrScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    const cleanCode = (decodedText || '').trim();
                    const barcodeInput = document.getElementById('m-login-usta-barcode');
                    if (barcodeInput) {
                        barcodeInput.value = cleanCode;
                    }
                    this.closeScanner();
                },
                () => {}
            ).catch(err => {
                if (resultEl) resultEl.textContent = "Kameraga ulanib bo'lmadi: " + (err.message || err);
            });
        } catch(e) {
            if (resultEl) resultEl.textContent = "Kamera ishga tushmadi: " + e.message;
        }
    },

    loginUsta: async function(e) {
        if (e) e.preventDefault();
        const barcodeInput = document.getElementById('m-login-usta-barcode');
        const phoneInput = document.getElementById('m-login-usta-phone');
        const errorEl = document.getElementById('m-login-error');
        const btn = document.getElementById('m-btn-usta-login');

        const barcode = (barcodeInput ? barcodeInput.value : '').trim();
        const phone = (phoneInput ? phoneInput.value : '').trim();

        if (!barcode || !phone) {
            if (errorEl) {
                errorEl.textContent = "Shtrix-kod va telefon raqamingizni kiriting!";
                errorEl.style.display = 'block';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tekshirilmoqda...';
        }
        if (errorEl) errorEl.style.display = 'none';

        try {
            const resp = await fetch('/api/auth/usta-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    barcode: barcode,
                    phone: phone,
                    company_id: 'giperbrendstroy'
                })
            });

            const data = await resp.json();
            if (!resp.ok || data.status !== 'success') {
                throw new Error(data.detail || "Shtrix-kod yoki telefon raqami noto'g'ri");
            }

            this.currentUser = data.user;
            this.currentCompany = data.user.company_id || 'giperbrendstroy';
            localStorage.setItem('mobile_auth', JSON.stringify({ user: data.user }));
            document.cookie = `company_id=${this.currentCompany}; path=/`;

            document.getElementById('mobile-login-view').style.display = 'none';
            document.getElementById('mobile-app-header').style.display = 'flex';
            document.getElementById('mobile-app-nav').style.display = 'flex';

            this.updateHeaderUserInfo();
            this.renderNavigation();
            this.switchView('usta-cabinet');

        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err.message || "Tizimga kirishda xatolik yuz berdi";
                errorEl.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Shaxsiy Kabinetga Kirish';
            }
        }
    },

    login: async function(e) {
        if (e) e.preventDefault();
        const companyInput = document.getElementById('m-login-company');
        const loginInput = document.getElementById('m-login-username');
        const passInput = document.getElementById('m-login-password');
        const errorEl = document.getElementById('m-login-error');
        const btn = document.getElementById('m-btn-login');

        const company_id = (companyInput ? companyInput.value : '').trim().toLowerCase();
        const login = (loginInput ? loginInput.value : '').trim();
        const password = (passInput ? passInput.value : '').trim();

        if (!login || !password) {
            if (errorEl) {
                errorEl.textContent = "Login va parolni kiriting!";
                errorEl.style.display = 'block';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Tekshirilmoqda...';
        }
        if (errorEl) errorEl.style.display = 'none';

        try {
            const resp = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_id: company_id || 'giperbrendstroy',
                    login: login,
                    password: password
                })
            });

            const data = await resp.json();
            if (!resp.ok || data.status !== 'success') {
                throw new Error(data.detail || "Login yoki parol noto'g'ri");
            }

            this.currentUser = data.user;
            this.currentCompany = data.user.company_id || 'giperbrendstroy';
            localStorage.setItem('mobile_auth', JSON.stringify({ user: data.user }));
            document.cookie = `company_id=${this.currentCompany}; path=/`;

            document.getElementById('mobile-login-view').style.display = 'none';
            document.getElementById('mobile-app-header').style.display = 'flex';
            document.getElementById('mobile-app-nav').style.display = 'flex';

            this.updateHeaderUserInfo();
            this.renderNavigation();
            
            if (this.currentUser.role === 'usta') {
                this.switchView('usta-cabinet');
            } else {
                this.switchView('home');
            }

        } catch (err) {
            if (errorEl) {
                errorEl.textContent = err.message || "Tizimga kirishda xatolik yuz berdi";
                errorEl.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ilovaga Kirish';
            }
        }
    },

    logout: function() {
        if (!confirm("Haqiqatan ham mobil ilovadan chiqmoqchimisiz?")) return;
        localStorage.removeItem('mobile_auth');
        this.currentUser = null;
        if (this.html5QrScanner) {
            try { this.html5QrScanner.stop(); } catch(e) {}
        }
        location.reload();
    },

    updateHeaderUserInfo: function() {
        if (!this.currentUser) return;
        const compEl = document.getElementById('m-header-company');
        const userEl = document.getElementById('m-profile-name');
        const roleEl = document.getElementById('m-profile-role');

        let compName = this.currentCompany;
        if (compName === 'giperbrendstroy') compName = 'Giper Brend Stroy';
        else if (compName === 'protechctiy') compName = 'Protech City';

        if (this.currentUser.role === 'usta') {
            if (compEl) compEl.textContent = 'Usta Kabineti';
            if (userEl) userEl.textContent = this.currentUser.name || 'Usta';
            if (roleEl) roleEl.textContent = 'VIP Usta';
            return;
        }

        if (compEl) compEl.textContent = compName;
        if (userEl) userEl.textContent = this.currentUser.name || this.currentUser.id;
        if (roleEl) roleEl.textContent = (this.currentUser.role || 'Xodim').split(';')[0];
    },

    hasPermission: function(permKey) {
        if (!this.currentUser) return false;
        const role = (this.currentUser.role || '').toLowerCase();
        if (role.includes('admin') || role.includes('superadmin') || role.includes('direktor')) {
            return true;
        }
        const perms = this.currentUser.mobile_permissions || [];
        return perms.includes(permKey);
    },

    renderNavigation: function() {
        const navContainer = document.getElementById('mobile-app-nav');
        if (!navContainer) return;

        if (this.currentUser && this.currentUser.role === 'usta') {
            navContainer.innerHTML = `
                <a href="javascript:void(0)" class="nav-item active" id="nav-tab-usta-cabinet" onclick="MobileApp.switchView('usta-cabinet')">
                    <i class="fas fa-hammer"></i>
                    <span>Kabinet</span>
                </a>
                <a href="javascript:void(0)" class="nav-item" id="nav-tab-usta-receipts" onclick="MobileApp.switchView('usta-receipts')">
                    <i class="fas fa-receipt"></i>
                    <span>Xaridlarim</span>
                </a>
                <a href="javascript:void(0)" class="nav-item" onclick="MobileApp.logout()">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Chiqish</span>
                </a>
            `;
            return;
        }

        let itemsHtml = `
            <a href="javascript:void(0)" class="nav-item active" id="nav-tab-home" onclick="MobileApp.switchView('home')">
                <i class="fas fa-home"></i>
                <span>Asosiy</span>
            </a>
        `;

        if (this.hasPermission('m_crm')) {
            itemsHtml += `
                <a href="javascript:void(0)" class="nav-item" id="nav-tab-clients" onclick="MobileApp.switchView('clients')">
                    <i class="fas fa-users"></i>
                    <span>Mijozlar</span>
                </a>
            `;
        }

        if (this.hasPermission('m_scanner')) {
            itemsHtml += `
                <div class="nav-item nav-item-scan" onclick="MobileApp.openScanner()">
                    <div class="nav-scan-btn">
                        <i class="fas fa-qrcode"></i>
                    </div>
                </div>
            `;
        }

        if (this.hasPermission('m_erp')) {
            itemsHtml += `
                <a href="javascript:void(0)" class="nav-item" id="nav-tab-inventory" onclick="MobileApp.switchView('inventory')">
                    <i class="fas fa-boxes"></i>
                    <span>Ombor</span>
                </a>
            `;
        } else if (this.hasPermission('m_receipts')) {
            itemsHtml += `
                <a href="javascript:void(0)" class="nav-item" id="nav-tab-receipts" onclick="MobileApp.switchView('receipts')">
                    <i class="fas fa-receipt"></i>
                    <span>Cheklar</span>
                </a>
            `;
        }

        itemsHtml += `
            <a href="javascript:void(0)" class="nav-item" id="nav-tab-profile" onclick="MobileApp.switchView('profile')">
                <i class="fas fa-user-circle"></i>
                <span>Profil</span>
            </a>
        `;

        navContainer.innerHTML = itemsHtml;
    },

    switchView: function(viewName) {
        this.activeView = viewName;
        document.querySelectorAll('.view-container').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        const targetView = document.getElementById(`m-view-${viewName}`);
        if (targetView) targetView.classList.add('active');

        const targetNav = document.getElementById(`nav-tab-${viewName}`);
        if (targetNav) targetNav.classList.add('active');

        window.scrollTo(0, 0);

        if (viewName === 'home') {
            this.loadDashboardData();
            this.renderHomeActions();
        } else if (viewName === 'clients') {
            this.loadClients();
        } else if (viewName === 'inventory') {
            this.loadInventory();
        } else if (viewName === 'receipts') {
            this.loadRecentReceipts();
        } else if (viewName === 'profile') {
            this.renderProfilePermissions();
        } else if (viewName === 'usta-cabinet') {
            this.loadUstaCabinet();
        } else if (viewName === 'usta-receipts') {
            this.loadUstaAllReceipts();
        }
    },

    ustaReceiptsCache: [],

    loadUstaCabinet: async function() {
        if (!this.currentUser || this.currentUser.role !== 'usta') return;

        // 1. Populate VIP Card Info
        const nameEl = document.getElementById('m-usta-card-name');
        const phoneEl = document.getElementById('m-usta-card-phone');
        const barcodeEl = document.getElementById('m-usta-card-barcode');
        const bonusEl = document.getElementById('m-usta-bonus-val');

        if (nameEl) nameEl.textContent = this.currentUser.name || 'Usta';
        if (phoneEl) phoneEl.textContent = this.currentUser.phone || '';
        if (barcodeEl) barcodeEl.textContent = this.currentUser.barcode || '';
        if (bonusEl) bonusEl.textContent = `${Number(this.currentUser.bonus || 0).toLocaleString('uz-UZ')} so'm`;

        // 2. Fetch live receipts and updated bonus
        const recentList = document.getElementById('m-usta-recent-receipts-list');
        const countBadge = document.getElementById('m-usta-receipts-count');
        if (recentList) {
            recentList.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Cheklar yuklanmoqda...</div>';
        }

        try {
            const cid = this.currentUser.id;
            const bc = encodeURIComponent(this.currentUser.barcode || '');
            const ph = encodeURIComponent(this.currentUser.phone || '');
            const url = `/api/clients/${cid}/receipts?barcode=${bc}&phone=${ph}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.ok) {
                    if (data.bonus !== undefined && data.bonus !== null) {
                        this.currentUser.bonus = Number(data.bonus);
                        if (bonusEl) bonusEl.textContent = `${this.currentUser.bonus.toLocaleString('uz-UZ')} so'm`;
                        const saved = JSON.parse(localStorage.getItem('mobile_auth') || '{}');
                        if (saved.user) {
                            saved.user.bonus = this.currentUser.bonus;
                            localStorage.setItem('mobile_auth', JSON.stringify(saved));
                        }
                    }

                    this.ustaReceiptsCache = data.receipts || [];
                    if (countBadge) countBadge.textContent = `${this.ustaReceiptsCache.length} ta`;
                    this.renderUstaReceipts(this.ustaReceiptsCache.slice(0, 5), recentList);
                    this.loadUstaPayouts();
                    return;
                }
            }
            if (recentList) recentList.innerHTML = '<div style="text-align: center; padding: 15px; color: var(--text-muted); font-size: 12px;">Cheklar topilmadi</div>';
        } catch (e) {
            console.warn("Could not load usta receipts:", e);
            if (recentList) recentList.innerHTML = '<div style="text-align: center; padding: 15px; color: var(--text-muted); font-size: 12px;">Cheklarni yuklashda xatolik</div>';
        } finally {
            this.loadUstaPayouts();
        }
    },

    loadUstaAllReceipts: function() {
        const allList = document.getElementById('m-usta-all-receipts-list');
        if (!allList) return;
        if (!this.ustaReceiptsCache || this.ustaReceiptsCache.length === 0) {
            allList.innerHTML = '<div style="text-align: center; padding: 40px 16px; color: var(--text-muted);"><i class="fas fa-receipt" style="font-size: 32px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>Hozircha xarid cheklari mavjud emas</div>';
            return;
        }
        this.renderUstaReceipts(this.ustaReceiptsCache, allList);
    },

    renderUstaReceipts: function(receipts, container) {
        if (!container) return;
        if (!receipts || receipts.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12.5px;">Hozircha xarid cheklari mavjud emas</div>';
            return;
        }

        let html = '';
        receipts.forEach((r, idx) => {
            const rid = r.id || `rec_${idx}`;
            const total = Number(r.total_amount || 0);
            const dateStr = r.created_at ? new Date(r.created_at).toLocaleString('uz-UZ', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
            const code = r.code || r.id?.substring(0, 8) || `№ ${idx + 1}`;
            
            let items = [];
            if (Array.isArray(r.items)) {
                items = r.items;
            } else if (r.items && typeof r.items === 'object') {
                if (Array.isArray(r.items.rows)) items = r.items.rows;
                else if (Array.isArray(r.items.items)) items = r.items.items;
            }

            const itemsCount = items.length;

            html += `
                <div class="usta-receipt-card" onclick="MobileApp.toggleReceiptDetails('${rid}')">
                    <div class="usta-receipt-top">
                        <div>
                            <div class="usta-receipt-code"><i class="fas fa-receipt" style="color: #38bdf8; margin-right: 5px;"></i> Chek: ${code}</div>
                            <div class="usta-receipt-date"><i class="far fa-clock"></i> ${dateStr}</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="usta-receipt-sum">${total.toLocaleString('uz-UZ')} so'm</div>
                            <div style="font-size: 11px; color: var(--text-muted);">${itemsCount > 0 ? `${itemsCount} xil tovar` : 'Xarid'} &bull; <i class="fas fa-chevron-down" style="font-size: 9px;"></i></div>
                        </div>
                    </div>
                    
                    <div id="details-${rid}" class="usta-receipt-details">
                        ${itemsCount > 0 ? items.map(it => {
                            const itName = it.name || it.product_name || 'Tovar';
                            const itQty = it.quantity || it.qty || 1;
                            const itPrice = Number(it.price || 0);
                            const itTotal = Number(it.total || (itQty * itPrice) || 0);
                            return `
                                <div class="usta-receipt-item-row">
                                    <div class="usta-receipt-item-name">${itName}</div>
                                    <div class="usta-receipt-item-qty">${itQty} dona</div>
                                    <div class="usta-receipt-item-price">${itTotal.toLocaleString('uz-UZ')} so'm</div>
                                </div>
                            `;
                        }).join('') : `
                            <div style="font-size: 11.5px; color: var(--text-muted); padding: 4px 0;">
                                To'lov turi: ${r.payment_type || 'Naqd / Karta'}
                            </div>
                        `}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    toggleReceiptDetails: function(rid) {
        const el = document.getElementById(`details-${rid}`);
        if (el) {
            el.classList.toggle('open');
        }
    },

    syncUstaBonus: async function(btn) {
        if (!this.currentUser || !this.currentUser.id) return;
        const icon = btn ? btn.querySelector('i') : null;
        if (icon) icon.classList.add('fa-spin');

        try {
            const resp = await fetch(`/api/clients/${this.currentUser.id}/sync-bonus`, { method: 'POST' });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.bonus !== undefined) {
                    this.currentUser.bonus = Number(data.bonus);
                    const bonusEl = document.getElementById('m-usta-bonus-val');
                    if (bonusEl) bonusEl.textContent = `${this.currentUser.bonus.toLocaleString('uz-UZ')} so'm`;
                    const saved = JSON.parse(localStorage.getItem('mobile_auth') || '{}');
                    if (saved.user) {
                        saved.user.bonus = this.currentUser.bonus;
                        localStorage.setItem('mobile_auth', JSON.stringify(saved));
                    }
                }
            }
        } catch (e) {
            console.warn("Could not sync live bonus:", e);
        } finally {
            if (icon) icon.classList.remove('fa-spin');
        }
    },

    // --- PAYOUT (BONUSNI KARTAGA YECHISH) MANTIQI ---
    openPayoutModal: function() {
        const user = this.currentUser || JSON.parse(localStorage.getItem('mobile_auth') || '{}').user || {};
        this.currentUser = user;
        const modal = document.getElementById('m-payout-modal');
        if (!modal) {
            console.error("m-payout-modal topilmadi!");
            return;
        }

        const currentBonus = Number(user.bonus || 0);
        const balEl = document.getElementById('m-payout-modal-balance');
        if (balEl) balEl.textContent = `${currentBonus.toLocaleString('uz-UZ')} so'm`;

        const phoneInput = document.getElementById('m-payout-phone');
        if (phoneInput && !phoneInput.value) phoneInput.value = user.phone || '';

        const nameInput = document.getElementById('m-payout-card-holder');
        if (nameInput && !nameInput.value) nameInput.value = user.name || '';

        const amtInput = document.getElementById('m-payout-amount');
        if (amtInput) amtInput.value = '';

        const cardInput = document.getElementById('m-payout-card-number');
        if (cardInput) cardInput.value = '';

        const errEl = document.getElementById('m-payout-error');
        if (errEl) errEl.style.display = 'none';

        const formCont = document.getElementById('m-payout-form-container');
        if (formCont) formCont.style.display = 'block';

        const succCont = document.getElementById('m-payout-success-container');
        if (succCont) succCont.style.display = 'none';

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closePayoutModal: function() {
        const modal = document.getElementById('m-payout-modal');
        if (modal) modal.classList.remove('active');
        document.body.style.overflow = '';
    },

    setPayoutQuickAmount: function(val) {
        const amtInput = document.getElementById('m-payout-amount');
        if (!amtInput) return;
        const user = this.currentUser || JSON.parse(localStorage.getItem('mobile_auth') || '{}').user || {};
        if (val === 'all') {
            amtInput.value = Math.floor(Number(user.bonus || 0));
        } else {
            amtInput.value = val;
        }
    },

    formatCardNumber: function(input) {
        let val = (input.value || '').replace(/\D/g, '').substring(0, 16);
        let formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ');
        input.value = formatted;

        const badge = document.getElementById('m-payout-card-badge');
        if (badge) {
            if (val.startsWith('8600') || val.startsWith('5614')) {
                badge.textContent = 'Uzcard';
                badge.style.color = '#10b981';
            } else if (val.startsWith('9860')) {
                badge.textContent = 'Humo';
                badge.style.color = '#f59e0b';
            } else if (val.startsWith('4')) {
                badge.textContent = 'Visa';
                badge.style.color = '#38bdf8';
            } else {
                badge.textContent = '16 xonali';
                badge.style.color = '#9ca3af';
            }
        }
    },

    submitPayoutRequest: async function(e) {
        if (e) e.preventDefault();
        const amtInput = document.getElementById('m-payout-amount');
        const cardInput = document.getElementById('m-payout-card-number');
        const holderInput = document.getElementById('m-payout-card-holder');
        const phoneInput = document.getElementById('m-payout-phone');
        const errEl = document.getElementById('m-payout-error');
        const btn = document.getElementById('m-btn-payout-submit');

        const amount = parseFloat(amtInput ? amtInput.value : 0);
        const card_number = (cardInput ? cardInput.value : '').replace(/\s+/g, '');
        const card_holder = (holderInput ? holderInput.value : '').trim();
        const phone = (phoneInput ? phoneInput.value : '').trim();
        const user = this.currentUser || JSON.parse(localStorage.getItem('mobile_auth') || '{}').user || {};
        this.currentUser = user;
        const currentBonus = Number(user.bonus || 0);

        if (isNaN(amount) || amount <= 0) {
            if (errEl) {
                errEl.textContent = "Iltimos, to'g'ri summa kiriting!";
                errEl.style.display = 'block';
            }
            return;
        }

        if (amount > currentBonus) {
            if (errEl) {
                errEl.textContent = `Yechiladigan summa mavjud bonusdan (${currentBonus.toLocaleString('uz-UZ')} so'm) ko'p bo'lishi mumkin emas!`;
                errEl.style.display = 'block';
            }
            return;
        }

        if (card_number.length < 16) {
            if (errEl) {
                errEl.textContent = "Karta raqami kamida 16 xonali bo'lishi kerak!";
                errEl.style.display = 'block';
            }
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yuborilmoqda...';
        }
        if (errEl) errEl.style.display = 'none';

        try {
            const resp = await fetch('/api/payout/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.currentUser.id,
                    amount: amount,
                    card_number: card_number,
                    card_holder: card_holder,
                    phone: phone,
                    company_id: this.currentCompany || 'giperbrendstroy'
                })
            });

            const data = await resp.json();
            if (!resp.ok || !data.ok) {
                throw new Error(data.detail || "So'rovni yuborib bo'lmadi");
            }

            // Show success container
            document.getElementById('m-payout-form-container').style.display = 'none';
            const succCont = document.getElementById('m-payout-success-container');
            succCont.style.display = 'block';

            const tgBtn = document.getElementById('m-payout-direct-tg-btn');
            if (tgBtn && data.direct_tg_url) {
                tgBtn.href = data.direct_tg_url;
            }

            this.loadUstaPayouts();

        } catch (err) {
            if (errEl) {
                errEl.textContent = err.message || "Xatolik yuz berdi";
                errEl.style.display = 'block';
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Buxgalteriyaga So\'rov Yuborish';
            }
        }
    },

    loadUstaPayouts: async function() {
        const user = this.currentUser || JSON.parse(localStorage.getItem('mobile_auth') || '{}').user || {};
        const uid = user.id || user.client_id;
        if (!uid) return;
        const box = document.getElementById('m-usta-payouts-box');
        const listEl = document.getElementById('m-usta-payouts-list');
        const countBadge = document.getElementById('m-usta-payouts-count');
        if (!box || !listEl) return;

        try {
            const res = await fetch(`/api/payout/requests?client_id=${encodeURIComponent(uid)}`);
            if (res.ok) {
                const data = await res.json();
                const reqs = data.requests || [];
                if (reqs.length > 0) {
                    box.style.display = 'block';
                    if (countBadge) countBadge.textContent = `${reqs.length} ta`;

                    let html = '';
                    reqs.forEach(r => {
                        const amt = Number(r.amount || 0);
                        const isPending = r.status === 'pending';
                        const isDone = r.status === 'completed';
                        const statusBadge = isDone 
                            ? '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 11px; padding: 2px 8px; border-radius: 6px;"><i class="fas fa-check-circle"></i> To\'landi</span>'
                            : (isPending 
                                ? '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-size: 11px; padding: 2px 8px; border-radius: 6px;"><i class="fas fa-clock"></i> Kutilmoqda</span>'
                                : '<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-size: 11px; padding: 2px 8px; border-radius: 6px;"><i class="fas fa-times-circle"></i> Rad etildi</span>');
                        
                        const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                        const cardMasked = r.card_number ? `${r.card_number.substring(0, 4)} **** **** ${r.card_number.slice(-4)}` : '';

                        html += `
                            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 8px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <span style="font-size: 14.5px; font-weight: 700; color: #fff;">${amt.toLocaleString('uz-UZ')} so'm</span>
                                    ${statusBadge}
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: var(--text-muted);">
                                    <span><i class="far fa-credit-card"></i> ${cardMasked}</span>
                                    <span>${dateStr}</span>
                                </div>
                            </div>
                        `;
                    });
                    listEl.innerHTML = html;
                } else {
                    box.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn("Could not load usta payouts:", e);
        }
    },

    loadDashboardData: async function() {
        try {
            const resp = await fetch('/api/mobile/dashboard');
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.ok) {
                    if (document.getElementById('m-kpi-ustalar')) {
                        document.getElementById('m-kpi-ustalar').textContent = `${data.ustalar_count || 0} ta`;
                    }
                    if (document.getElementById('m-kpi-qurilish')) {
                        document.getElementById('m-kpi-qurilish').textContent = `${data.qurilish_count || 0} ta`;
                    }
                }
            }
        } catch(e) {
            console.warn('Dashboard load error:', e);
        }
    },

    openCategory: function(catName) {
        this.switchView('clients');
        setTimeout(() => {
            const pill = document.querySelector(`.filter-pill[data-cat="${catName}"]`);
            if (pill) {
                this.setClientCategoryFilter(catName, pill);
            }
        }, 120);
    },

    renderHomeActions: function() {
        const container = document.getElementById('m-home-actions-grid');
        if (!container) return;

        let html = '';
        if (this.hasPermission('m_scanner')) {
            html += `
                <div class="action-btn" onclick="MobileApp.openScanner()">
                    <div class="action-icon-circle" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">
                        <i class="fas fa-qrcode"></i>
                    </div>
                    <span>Skaner</span>
                </div>
            `;
        }
        if (this.hasPermission('m_crm')) {
            html += `
                <div class="action-btn" onclick="MobileApp.switchView('clients')">
                    <div class="action-icon-circle" style="background: rgba(99, 102, 241, 0.15); color: #818cf8;">
                        <i class="fas fa-users"></i>
                    </div>
                    <span>Mijozlar</span>
                </div>
            `;
        }
        if (this.hasPermission('m_regos_cards')) {
            html += `
                <div class="action-btn" onclick="MobileApp.openAddCardModal()">
                    <div class="action-icon-circle" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">
                        <i class="fas fa-id-card"></i>
                    </div>
                    <span>Karta qo'shish</span>
                </div>
            `;
        }
        if (this.hasPermission('m_receipts')) {
            html += `
                <div class="action-btn" onclick="MobileApp.switchView('receipts')">
                    <div class="action-icon-circle" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">
                        <i class="fas fa-receipt"></i>
                    </div>
                    <span>Cheklar</span>
                </div>
            `;
        }
        if (this.hasPermission('m_erp')) {
            html += `
                <div class="action-btn" onclick="MobileApp.switchView('inventory')">
                    <div class="action-icon-circle" style="background: rgba(236, 72, 153, 0.15); color: #f472b6;">
                        <i class="fas fa-boxes"></i>
                    </div>
                    <span>Ombor</span>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    // --- MIJOZLAR (CRM) MANTIQI ---
    loadClients: async function() {
        const listEl = document.getElementById('m-clients-list');
        if (!listEl) return;

        listEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top: 10px; font-size: 13px;">Mijozlar yuklanmoqda...</div></div>';

        try {
            const resp = await fetch('/api/clients');
            if (!resp.ok) throw new Error("Mijozlarni yuklab bo'lmadi");
            const clients = await resp.json();
            this.clientsCache = clients || [];
            this.renderClientsList(this.clientsCache);

            const uCount = this.clientsCache.filter(c => {
                const cat = (c.category || (c.company ? 'qurilish' : 'ustalar')).toLowerCase();
                return cat !== 'qurilish';
            }).length;
            const qCount = this.clientsCache.filter(c => {
                const cat = (c.category || (c.company ? 'qurilish' : 'ustalar')).toLowerCase();
                return cat === 'qurilish';
            }).length;
            if (document.getElementById('m-kpi-ustalar')) {
                document.getElementById('m-kpi-ustalar').textContent = `${uCount} ta`;
            }
            if (document.getElementById('m-kpi-qurilish')) {
                document.getElementById('m-kpi-qurilish').textContent = `${qCount} ta`;
            }
        } catch (err) {
            listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--danger); font-size: 13px;">${err.message}</div>`;
        }
    },

    renderClientsList: function(clients) {
        const listEl = document.getElementById('m-clients-list');
        if (!listEl) return;

        if (!clients || clients.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 40px 16px; color: var(--text-muted);">
                    <i class="fas fa-users-slash" style="font-size: 32px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
                    <span>Hech qanday mijoz topilmadi</span>
                </div>
            `;
            return;
        }

        let html = '';
        clients.forEach(c => {
            const initial = (c.name || 'M').trim().charAt(0).toUpperCase();
            const cat = (c.category || (c.company ? 'qurilish' : 'ustalar')).toLowerCase();
            const isQurilish = cat === 'qurilish';
            const barcodeVal = c.barcode || c.phone2 || '';
            const bonusVal = Number(c.bonus || c.value || 0);

            html += `
                <div class="client-card" onclick="MobileApp.openClientDetail('${c.id}')">
                    <div class="client-card-header">
                        <div class="client-avatar-name">
                            <div class="client-avatar">${initial}</div>
                            <div class="client-title-row">
                                <div class="client-name">${c.name || 'Noma\'lum mijoz'}</div>
                                <div class="client-badges">
                                    <span class="${isQurilish ? 'badge-qurilish' : 'badge-ustalar'}">
                                        <i class="fas ${isQurilish ? 'fa-building' : 'fa-hammer'}"></i> ${isQurilish ? 'Qurilish' : 'Ustalar'}
                                    </span>
                                    ${barcodeVal ? `<span class="badge-barcode"><i class="fas fa-barcode"></i> ${barcodeVal}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        ${c.phone ? `
                            <a href="tel:${c.phone}" onclick="event.stopPropagation()" style="width: 36px; height: 36px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 14px;">
                                <i class="fas fa-phone-alt"></i>
                            </a>
                        ` : ''}
                    </div>
                    <div class="client-card-meta">
                        <span><i class="fas fa-phone-alt" style="font-size: 10px; margin-right: 4px;"></i> ${c.phone || '-'}</span>
                        <span>Bonus: <strong class="client-bonus-text">${bonusVal.toLocaleString('uz-UZ')} so'm</strong></span>
                    </div>
                </div>
            `;
        });

        listEl.innerHTML = html;
    },

    filterClients: function() {
        const query = (document.getElementById('m-clients-search')?.value || '').trim().toLowerCase();
        const activePill = document.querySelector('.filter-pill.active')?.getAttribute('data-cat') || 'all';

        let filtered = this.clientsCache.filter(c => {
            const cat = (c.category || (c.company ? 'qurilish' : 'ustalar')).toLowerCase();
            if (activePill !== 'all' && cat !== activePill) return false;

            if (query) {
                const name = (c.name || '').toLowerCase();
                const phone = (c.phone || '').replace(/\D/g, '');
                const barcode = (c.barcode || c.phone2 || '').toLowerCase();
                const cleanQ = query.replace(/\D/g, '');
                return name.includes(query) || barcode.includes(query) || (cleanQ && phone.includes(cleanQ));
            }
            return true;
        });

        this.renderClientsList(filtered);
    },

    setClientCategoryFilter: function(cat, btn) {
        document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
        if (btn) btn.classList.add('active');
        this.filterClients();
    },

    // --- MIJOZ TAFSILOTLARI VA XARID CHEKLARI ---
    openClientDetail: async function(clientId) {
        const client = this.clientsCache.find(c => c.id === clientId) || { id: clientId };
        
        const sheet = document.getElementById('m-client-sheet');
        if (!sheet) return;

        const initial = (client.name || 'M').trim().charAt(0).toUpperCase();
        const cat = (client.category || (client.company ? 'qurilish' : 'ustalar')).toLowerCase();
        const isQurilish = cat === 'qurilish';
        const barcodeVal = client.barcode || client.phone2 || '';
        const bonusVal = Number(client.bonus || client.value || 0);

        document.getElementById('m-sheet-client-name').textContent = client.name || 'Mijoz';
        document.getElementById('m-sheet-client-avatar').textContent = initial;
        document.getElementById('m-sheet-client-phone').textContent = client.phone || '-';
        document.getElementById('m-sheet-client-phone-link').href = client.phone ? `tel:${client.phone}` : 'javascript:void(0)';
        document.getElementById('m-sheet-client-barcode').textContent = barcodeVal || '-';
        
        const catBadge = document.getElementById('m-sheet-client-cat');
        if (catBadge) {
            catBadge.className = isQurilish ? 'badge-qurilish' : 'badge-ustalar';
            catBadge.innerHTML = `<i class="fas ${isQurilish ? 'fa-building' : 'fa-hammer'}"></i> ${isQurilish ? 'Qurilish obyekti' : 'Ustalar'}`;
        }

        document.getElementById('m-sheet-bonus-val').textContent = `${bonusVal.toLocaleString('uz-UZ')} so'm`;
        this._activeDetailClient = client;

        // Admin tomonidan bonusni o'zgartirish ruxsati tekshiruvi (m_bonus)
        const canEditBonus = this.hasPermission('m_bonus');
        const bonusActionsContainer = document.getElementById('m-bonus-actions-container');
        if (bonusActionsContainer) {
            bonusActionsContainer.style.setProperty('display', canEditBonus ? 'grid' : 'none', 'important');
        }
        const noPermMsg = document.getElementById('m-bonus-no-permission-msg');
        if (noPermMsg) {
            noPermMsg.style.setProperty('display', canEditBonus ? 'none' : 'block', 'important');
        }
        const bonusBox = document.getElementById('m-bonus-action-box');
        if (bonusBox) {
            bonusBox.style.setProperty('display', 'none', 'important');
        }

        // Open sheet
        sheet.classList.add('active');

        // Load receipts via the dedicated customer receipts endpoint!
        this.loadClientReceiptsInSheet(client);
    },

    closeClientDetail: function() {
        const sheet = document.getElementById('m-client-sheet');
        if (sheet) sheet.classList.remove('active');
        this._activeDetailClient = null;
    },

    loadClientReceiptsInSheet: async function(client) {
        const receiptsListEl = document.getElementById('m-sheet-receipts-list');
        const countEl = document.getElementById('m-sheet-receipts-count');
        const totalPurchasesEl = document.getElementById('m-sheet-total-purchases');

        if (receiptsListEl) {
            receiptsListEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Xarid cheklari olinmoqda...</div>';
        }

        try {
            const params = new URLSearchParams();
            if (client.phone) params.append('phone', client.phone);
            if (client.phone2) params.append('phone2', client.phone2);
            if (client.barcode) params.append('barcode', client.barcode);

            const resp = await fetch(`/api/clients/${encodeURIComponent(client.id)}/receipts?${params.toString()}`);
            const data = await resp.json();

            if (data && data.bonus !== undefined && data.bonus !== null) {
                const newBonus = Number(data.bonus);
                client.bonus = newBonus;
                client.value = newBonus;
                const bonusEl = document.getElementById('m-sheet-bonus-val');
                if (bonusEl) {
                    bonusEl.textContent = `${newBonus.toLocaleString('uz-UZ')} so'm`;
                }
                const idx = this.clientsCache.findIndex(c => c.id === client.id);
                if (idx !== -1) {
                    this.clientsCache[idx].bonus = newBonus;
                    this.clientsCache[idx].value = newBonus;
                }
            }

            const receipts = (data && data.ok && Array.isArray(data.receipts)) ? data.receipts : [];
            const totalSpend = receipts.reduce((acc, r) => acc + (parseFloat(r.total_amount) || 0), 0);

            if (countEl) countEl.textContent = `${receipts.length} ta`;
            if (totalPurchasesEl) totalPurchasesEl.textContent = `${totalSpend.toLocaleString('uz-UZ')} so'm`;

            if (!receiptsListEl) return;

            if (receipts.length === 0) {
                receiptsListEl.innerHTML = `
                    <div style="text-align: center; padding: 24px 10px; color: var(--text-muted); font-size: 13px; background: rgba(255,255,255,0.02); border-radius: 12px;">
                        <i class="fas fa-receipt" style="font-size: 26px; opacity: 0.3; margin-bottom: 8px; display: block;"></i>
                        <span>Biriktirilgan cheklar topilmadi</span>
                    </div>
                `;
                return;
            }

            let html = '';
            receipts.forEach(rec => {
                let items = rec.items || [];
                if (typeof items === 'string') {
                    try { items = JSON.parse(items); } catch(e) { items = []; }
                }
                let products = (items && typeof items === 'object' && !Array.isArray(items)) ? (items.products || []) : (Array.isArray(items) ? items : []);

                const d = new Date(rec.created_at);
                const dateStr = isNaN(d.getTime()) ? rec.created_at : d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const total = parseFloat(rec.total_amount) || 0;
                const recCode = rec.code || 'CH-' + String(rec.id).substring(0, 8);
                const payType = rec.payment_type || 'Naqd';
                const compName = rec.company_id === 'giperbrendstroy' ? 'Giper Brend Stroy' : (rec.company_id === 'protechctiy' ? 'Protech City' : (rec.company_id || ''));

                let prodsHtml = '';
                products.forEach(p => {
                    const qty = p.quantity || p.qty || 1;
                    const price = parseFloat(p.price) || 0;
                    const lineTotal = p.total || (price * qty);
                    prodsHtml += `
                        <div style="display: flex; justify-content: space-between; font-size: 11.5px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.03);">
                            <span style="color: var(--text-main); font-weight: 500; max-width: 65%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name || 'Tovar'}</span>
                            <span style="color: var(--text-muted);">${qty} x ${price.toLocaleString('uz-UZ')} = <strong style="color: var(--text-main);">${lineTotal.toLocaleString('uz-UZ')}</strong></span>
                        </div>
                    `;
                });

                html += `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span style="font-weight: 700; color: var(--accent); font-family: monospace; font-size: 13px;">
                                <i class="fas fa-receipt"></i> ${recCode}
                            </span>
                            <span style="font-weight: 800; color: #10b981; font-size: 14px;">${total.toLocaleString('uz-UZ')} so'm</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">
                            <span><i class="far fa-clock"></i> ${dateStr}</span>
                            <span>${compName ? `<span class="badge" style="background: rgba(255,255,255,0.06); font-size: 10px; padding: 2px 6px;">${compName}</span>` : ''} ${payType}</span>
                        </div>
                        ${products.length > 0 ? `
                            <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 6px 8px; margin-top: 6px;">
                                ${prodsHtml}
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            receiptsListEl.innerHTML = html;

        } catch (err) {
            receiptsListEl.innerHTML = `<div style="text-align: center; padding: 16px; color: var(--danger); font-size: 13px;">Cheklarni yuklashda xatolik: ${err.message}</div>`;
        }
    },

    // --- BONUS BOSHQARUVI ---
    toggleBonusForm: function(type) {
        if (type && !this.hasPermission('m_bonus')) {
            alert("Kechirasiz, sizda bonus balansini o'zgartirish ruxsati mavjud emas! Iltimos, administratorga murojaat qiling.");
            return;
        }
        const box = document.getElementById('m-bonus-action-box');
        if (!box) return;
        if (!type) {
            box.style.display = 'none';
            return;
        }
        box.style.display = 'block';
        document.getElementById('m-bonus-type').value = type;
        const title = type === 'add' ? 'Bonus Qo\'shish (+)' : (type === 'subtract' ? 'Bonus Ayirish (-)' : 'Yangi Balans O\'rnatish (=)');
        document.getElementById('m-bonus-form-title').textContent = title;
        document.getElementById('m-bonus-amount').focus();
    },

    saveBonusAdjustment: async function(e) {
        if (e) e.preventDefault();
        if (!this.hasPermission('m_bonus')) {
            alert("Kechirasiz, sizda bonus balansini o'zgartirish ruxsati mavjud emas!");
            return;
        }
        if (!this._activeDetailClient) return;

        const type = document.getElementById('m-bonus-type').value;
        const amount = parseFloat(document.getElementById('m-bonus-amount').value);
        const note = (document.getElementById('m-bonus-note').value || '').trim();

        if (isNaN(amount) || amount <= 0) {
            alert("Iltimos, to'g'ri summa kiriting!");
            return;
        }

        const client = this._activeDetailClient;
        let currentBonus = Number(client.bonus || client.value || 0);
        let newBonus = currentBonus;

        if (type === 'add') {
            newBonus += amount;
        } else if (type === 'subtract') {
            newBonus = Math.max(0, currentBonus - amount);
        } else {
            newBonus = amount;
        }

        const btn = document.getElementById('m-btn-save-bonus');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saqlanmoqda...';
        }

        try {
            const payload = {
                ...client,
                bonus: newBonus,
                value: newBonus,
                notes: note || client.notes || ''
            };

            const resp = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error("Bonusni saqlab bo'lmadi");

            client.bonus = newBonus;
            client.value = newBonus;
            document.getElementById('m-sheet-bonus-val').textContent = `${newBonus.toLocaleString('uz-UZ')} so'm`;
            this.toggleBonusForm(null);
            document.getElementById('m-bonus-amount').value = '';
            document.getElementById('m-bonus-note').value = '';

            // Update clients list cache
            const idx = this.clientsCache.findIndex(c => c.id === client.id);
            if (idx !== -1) {
                this.clientsCache[idx].bonus = newBonus;
                this.clientsCache[idx].value = newBonus;
                this.renderClientsList(this.clientsCache);
            }

            alert("Bonus muvaffaqiyatli yangilandi!");

        } catch(err) {
            alert("Xatolik: " + err.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Saqlash';
            }
        }
    },

    syncActiveClientBonus: async function(btn) {
        if (!this._activeDetailClient) return;
        const icon = btn ? (btn.querySelector('i') || btn) : null;
        if (icon) icon.classList.add('fa-spin');
        if (btn) btn.disabled = true;

        try {
            const resp = await fetch(`/api/clients/${encodeURIComponent(this._activeDetailClient.id)}/sync-bonus`, {
                method: 'POST'
            });
            const data = await resp.json();
            if (data && data.ok && data.bonus !== undefined) {
                const newBonus = Number(data.bonus);
                this._activeDetailClient.bonus = newBonus;
                this._activeDetailClient.value = newBonus;
                const bonusEl = document.getElementById('m-sheet-bonus-val');
                if (bonusEl) bonusEl.textContent = `${newBonus.toLocaleString('uz-UZ')} so'm`;

                const idx = this.clientsCache.findIndex(c => c.id === this._activeDetailClient.id);
                if (idx !== -1) {
                    this.clientsCache[idx].bonus = newBonus;
                    this.clientsCache[idx].value = newBonus;
                    this.renderClientsList(this.clientsCache);
                }
            }
        } catch (e) {
            console.warn("Mobile bonus sync error:", e);
        } finally {
            if (icon) icon.classList.remove('fa-spin');
            if (btn) btn.disabled = false;
        }
    },

    // --- KAMERA SKANERI (BARCODE / QR) ---
    openScanner: function() {
        const modal = document.getElementById('m-scanner-modal');
        if (!modal) return;
        modal.classList.add('active');

        const scanResultEl = document.getElementById('m-scanner-result');
        if (scanResultEl) scanResultEl.innerHTML = 'Kamera yoqilmoqda...';

        setTimeout(() => {
            this.startCameraScanner();
        }, 150);
    },

    closeScanner: function() {
        if (this.html5QrScanner) {
            try {
                this.html5QrScanner.stop().then(() => {
                    this.html5QrScanner.clear();
                }).catch(() => {});
            } catch(e) {}
            this.html5QrScanner = null;
        }
        const modal = document.getElementById('m-scanner-modal');
        if (modal) modal.classList.remove('active');
    },

    startCameraScanner: function() {
        if (typeof Html5Qrcode === 'undefined') {
            document.getElementById('m-scanner-result').innerHTML = '<span style="color: var(--danger)">Skaner kutubxonasi yuklanmadi.</span>';
            return;
        }

        try {
            this.html5QrScanner = new Html5Qrcode("scanner-reader");
            const config = { fps: 15, qrbox: { width: 250, height: 160 } };

            this.html5QrScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText) => {
                    this.onBarcodeScanned(decodedText);
                },
                () => {}
            ).catch(err => {
                document.getElementById('m-scanner-result').innerHTML = `<span style="color: var(--warning)">Kameraga ruxsat berilmadi yoki mavjud emas: ${err}</span>`;
            });
        } catch(e) {
            console.error("Camera init error:", e);
        }
    },

    playScanSound: function() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 1400;
            gain.gain.value = 0.15;
            osc.start();
            setTimeout(() => osc.stop(), 120);
            if (navigator.vibrate) navigator.vibrate(80);
        } catch(e) {}
    },

    onBarcodeScanned: async function(barcode) {
        this.playScanSound();
        this.closeScanner();

        const cleanB = String(barcode).trim();
        // Look up barcode in backend
        try {
            const resp = await fetch(`/api/mobile/barcode-lookup?barcode=${encodeURIComponent(cleanB)}`);
            const res = await resp.json();

            if (res && res.ok && res.found) {
                if (res.type === 'client') {
                    const client = res.data;
                    // Add to cache if not present
                    if (!this.clientsCache.some(c => c.id === client.id)) {
                        this.clientsCache.unshift(client);
                    }
                    this.openClientDetail(client.id);
                } else if (res.type === 'product') {
                    this.showProductDetail(res.data);
                }
            } else {
                // Not found locally or in regos: prompt to add REGOS card
                if (confirm(`«${cleanB}» shtrix-kodi bo'yicha ma'lumot topilmadi. REGOS tizimidan qidirib mijoz sifatida qo'shilsinmi?`)) {
                    this.openAddCardModal(cleanB);
                }
            }
        } catch(e) {
            alert("Skanerlashda xatolik: " + e.message);
        }
    },

    manualBarcodeSubmit: function(e) {
        if (e) e.preventDefault();
        const input = document.getElementById('m-manual-barcode-input');
        const code = (input ? input.value : '').trim();
        if (!code) return;
        this.onBarcodeScanned(code);
    },

    // --- REGOS KARTA QIDIRISH & QO'SHISH ---
    openAddCardModal: function(presetQuery) {
        const modal = document.getElementById('m-add-card-modal');
        if (!modal) return;
        modal.classList.add('active');

        const input = document.getElementById('m-regos-search-input');
        if (input) {
            input.value = presetQuery || '';
            if (presetQuery) this.searchRegosCards();
            else setTimeout(() => input.focus(), 150);
        }
    },

    closeAddCardModal: function() {
        const modal = document.getElementById('m-add-card-modal');
        if (modal) modal.classList.remove('active');
    },

    searchRegosCards: async function() {
        const input = document.getElementById('m-regos-search-input');
        const query = (input ? input.value : '').trim();
        const resultsEl = document.getElementById('m-regos-search-results');
        const btn = document.getElementById('m-btn-regos-search');

        if (!query) {
            alert("Shtrix-kod yoki telefon raqamini kiriting!");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        if (resultsEl) {
            resultsEl.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> REGOS-dan qidirilmoqda...</div>';
        }

        try {
            const resp = await fetch(`/api/integration/regos/search-cards?query=${encodeURIComponent(query)}`);
            const data = await resp.json();
            const cards = (data && data.ok) ? (data.result || []) : [];

            if (cards.length === 0) {
                resultsEl.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">«${query}» bo'yicha REGOS-da karta topilmadi</div>`;
                return;
            }

            let html = '';
            cards.forEach(card => {
                const bonus = Number(card.bonus || 0).toLocaleString('uz-UZ');
                html += `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; margin-bottom: 8px;">
                        <div style="font-weight: 700; font-size: 14px; color: var(--text-main); margin-bottom: 4px;">${card.name}</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
                            <span><i class="fas fa-barcode"></i> ${card.barcode || '-'}</span> | 
                            <span><i class="fas fa-phone-alt"></i> ${card.phone || '-'}</span>
                            <div>Bonus: <strong style="color: #10b981;">${bonus} so'm</strong></div>
                        </div>
                        <button class="btn btn-primary btn-block" style="height: 38px; font-size: 13px;" onclick="MobileApp.saveRegosCardDirect('${card.regos_card_id}')">
                            <i class="fas fa-plus"></i> CRM Mijozlariga Qo'shish
                        </button>
                    </div>
                `;
            });
            resultsEl.innerHTML = html;
            this._regosCardsCache = cards;

        } catch (err) {
            resultsEl.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 16px;">${err.message}</div>`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search"></i>';
            }
        }
    },

    saveRegosCardDirect: async function(regosCardId) {
        const card = (this._regosCardsCache || []).find(c => String(c.regos_card_id) === String(regosCardId));
        if (!card) return;

        const payload = {
            id: `regos_card_${card.regos_card_id}`,
            name: card.name,
            phone: card.phone,
            phone2: card.barcode,
            barcode: card.barcode,
            bonus: card.bonus || 0,
            value: card.bonus || 0,
            category: card.default_category || 'ustalar',
            notes: `REGOS Guruh: ${card.group || ''}`
        };

        try {
            const resp = await fetch('/api/clients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) throw new Error("Mijozni saqlashda xatolik");

            this.closeAddCardModal();
            alert("Mijoz muvaffaqiyatli qo'shildi!");
            await this.loadClients();
            this.openClientDetail(payload.id);

        } catch(err) {
            alert("Xatolik: " + err.message);
        }
    },

    // --- OMBORXONA (ERP) ---
    loadInventory: async function() {
        const listEl = document.getElementById('m-inventory-list');
        if (!listEl) return;

        listEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top: 10px; font-size: 13px;">Ombor tovarlari yuklanmoqda...</div></div>';

        try {
            const resp = await fetch('/api/inventory');
            if (!resp.ok) throw new Error("Tovarlarni yuklab bo'lmadi");
            const items = await resp.json();
            this.inventoryCache = items || [];
            this.renderInventoryList(this.inventoryCache);
        } catch (err) {
            listEl.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--danger); font-size: 13px;">${err.message}</div>`;
        }
    },

    renderInventoryList: function(items) {
        const listEl = document.getElementById('m-inventory-list');
        if (!listEl) return;

        if (!items || items.length === 0) {
            listEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);">Tovarlar topilmadi</div>';
            return;
        }

        let html = '';
        items.slice(0, 100).forEach(item => {
            const price = Number(item.price || 0);
            const stock = Number(item.stock || item.quantity || 0);
            const isLow = stock <= 5;

            html += `
                <div class="client-card" onclick="MobileApp.showProductDetail(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div style="font-weight: 600; font-size: 14px; color: var(--text-main);">${item.name || 'Tovar'}</div>
                        <span class="badge" style="background: ${isLow ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}; color: ${isLow ? '#ef4444' : '#10b981'}; font-weight: 700; font-size: 11.5px; padding: 3px 8px; border-radius: 6px;">
                            ${stock} dona
                        </span>
                    </div>
                    <div class="client-card-meta">
                        <span style="font-family: monospace;">SKU: ${item.sku || '-'}</span>
                        <span style="font-weight: 700; color: var(--accent); font-size: 13.5px;">${price.toLocaleString('uz-UZ')} so'm</span>
                    </div>
                </div>
            `;
        });

        listEl.innerHTML = html;
    },

    filterInventory: function() {
        const q = (document.getElementById('m-inventory-search')?.value || '').trim().toLowerCase();
        let filtered = this.inventoryCache.filter(item => {
            const name = (item.name || '').toLowerCase();
            const sku = (item.sku || '').toLowerCase();
            return name.includes(q) || sku.includes(q);
        });
        this.renderInventoryList(filtered);
    },

    showProductDetail: function(product) {
        alert(`📦 Mahsulot: ${product.name}\nSKU: ${product.sku}\nNarxi: ${(Number(product.price)||0).toLocaleString('uz-UZ')} so'm\nQoldiq: ${product.stock || 0} dona`);
    },

    // --- CHEKLAR RO'YXATI ---
    loadRecentReceipts: async function() {
        const listEl = document.getElementById('m-all-receipts-list');
        if (!listEl) return;

        listEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

        try {
            const resp = await fetch('/api/receipts');
            const recs = await resp.json();
            if (!Array.isArray(recs) || recs.length === 0) {
                listEl.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-muted);">Cheklar mavjud emas</div>';
                return;
            }

            let html = '';
            recs.slice(0, 50).forEach(rec => {
                const total = parseFloat(rec.total_amount) || 0;
                const d = new Date(rec.created_at);
                const dateStr = isNaN(d.getTime()) ? rec.created_at : d.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                const payType = rec.payment_type || 'Naqd';
                const compName = rec.company_id === 'giperbrendstroy' ? 'Giper Brend Stroy' : (rec.company_id === 'protechctiy' ? 'Protech City' : (rec.company_id || ''));

                html += `
                    <div class="client-card">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 700; color: var(--accent); font-family: monospace;">${rec.code || 'CH-' + rec.id.slice(0,6)}</span>
                            <span style="font-weight: 800; color: #10b981; font-size: 14px;">${total.toLocaleString('uz-UZ')} so'm</span>
                        </div>
                        <div class="client-card-meta">
                            <span>${dateStr}</span>
                            <span>${compName ? `<span class="badge" style="background: rgba(255,255,255,0.06); margin-right: 4px;">${compName}</span>` : ''}${payType}</span>
                        </div>
                    </div>
                `;
            });
            listEl.innerHTML = html;

        } catch (err) {
            listEl.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 20px;">${err.message}</div>`;
        }
    },

    renderProfilePermissions: function() {
        const container = document.getElementById('m-profile-permissions-list');
        if (!container || !this.currentUser) return;

        const allModules = [
            { key: 'm_crm', label: 'Mijozlar bazasi (CRM)' },
            { key: 'm_regos_cards', label: 'REGOS Kartalari' },
            { key: 'm_receipts', label: 'Xarid Cheklari' },
            { key: 'm_bonus', label: 'Bonusni O\'zgartirish (+/-)' },
            { key: 'm_erp', label: 'Omborxona (ERP)' },
            { key: 'm_scanner', label: 'Kamera Skaneri' },
            { key: 'm_kassa', label: 'Kassa & Savdo' },
            { key: 'm_telephony', label: 'Telefoniya' },
            { key: 'm_chats', label: 'Muloqotlar' },
            { key: 'm_finance', label: 'Moliya' }
        ];

        let html = '';
        allModules.forEach(mod => {
            const has = this.hasPermission(mod.key);
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 6px;">
                    <span style="font-size: 13px; font-weight: 500;">${mod.label}</span>
                    <span style="color: ${has ? '#10b981' : 'var(--text-muted)'}; font-size: 13px; font-weight: 600;">
                        ${has ? '<i class="fas fa-check-circle"></i> Ruxsat berilgan' : '<i class="fas fa-times-circle"></i> Cheklangan'}
                    </span>
                </div>
            `;
        });
        container.innerHTML = html;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.MobileApp.init();
});
