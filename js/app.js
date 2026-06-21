// ERP & CRM Tizimi - Asosiy Dastur Koordinatori (Router, Dashboard va Sozlamalar) - SUPABASE & TELEFONIYA INTEGRATSIYASI BILAN

// Global Yordamchi Funksiyalar
window.formatMoney = function(amount, currency = 'UZS') {
    if (currency === 'UZS') {
        return new Intl.NumberFormat('uz-UZ', { style: 'decimal' }).format(amount) + " so'm";
    } else {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
};

window.showModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
    }
};

window.App = {
    currentView: 'dashboard',
    chartInstance: null,

    init: function() {
        this.applySettings();
        this.setupNavigation();
        this.setupSettingsForm();
        this.syncSettingsToBackend();
        this.initAIAssistantWidget();
        this.setupAuth();
    },

    syncSettingsToBackend: function() {
        const data = AppStorage.load();
        if (data.settings.telegramToken || data.settings.instagramToken || data.settings.geminiApiKey || data.settings.openaiApiKey || data.settings.groqApiKey || data.settings.regosEndpoint || data.settings.regosToken) {
            fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ai_provider: data.settings.aiProvider || 'local',
                    telephony_provider: data.settings.telephonyProvider || 'sarkor',
                    telegram_token: data.settings.telegramToken || '',
                    instagram_token: data.settings.instagramToken || '',
                    gemini_api_key: data.settings.geminiApiKey || '',
                    openai_api_key: data.settings.openaiApiKey || '',
                    groq_api_key: data.settings.groqApiKey || '',
                    ai_auto_reply: !!data.settings.aiAutoReply,
                    regos_endpoint: data.settings.regosEndpoint || '',
                    regos_token: data.settings.regosToken || ''
                })
            }).catch(err => console.error("Initial settings sync failed:", err));
        }
    },

    applySettings: function() {
        const data = AppStorage.load();
        
        // Mavzuni qo'llash
        if (data.settings.theme === 'light') {
            document.body.classList.add('light-theme');
            const icons = document.querySelectorAll('.theme-toggle-btn i');
            icons.forEach(icon => {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            });
        } else {
            document.body.classList.remove('light-theme');
            const icons = document.querySelectorAll('.theme-toggle-btn i');
            icons.forEach(icon => {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            });
        }

        // Kompaniya nomini yangilash
        const companyLabel = document.getElementById('company-name-label');
        if (companyLabel) companyLabel.textContent = data.settings.companyName;

        // Sozlamalar formasi qiymatlarini to'ldirish
        const compNameInput = document.getElementById('settings-company-name');
        if (compNameInput) compNameInput.value = data.settings.companyName;
        
        const currSelect = document.getElementById('settings-currency');
        if (currSelect) currSelect.value = data.settings.currency;

        // Supabase formalarini to'ldirish
        const sbUrlInput = document.getElementById('settings-sb-url');
        if (sbUrlInput) sbUrlInput.value = data.settings.supabaseUrl || '';

        const sbKeyInput = document.getElementById('settings-sb-key');
        if (sbKeyInput) sbKeyInput.value = data.settings.supabaseKey || '';

        // SIP formalarini to'ldirish
        const telProviderSelect = document.getElementById('settings-telephony-provider');
        if (telProviderSelect) telProviderSelect.value = data.settings.telephonyProvider || 'sarkor';

        const sipServerInput = document.getElementById('settings-sip-server');
        if (sipServerInput) sipServerInput.value = data.settings.sipServer || '';

        const sipUserInput = document.getElementById('settings-sip-user');
        if (sipUserInput) sipUserInput.value = data.settings.sipUser || '';

        const sipPasswordInput = document.getElementById('settings-sip-password');
        if (sipPasswordInput) sipPasswordInput.value = data.settings.sipPassword || '';

        const sipWssInput = document.getElementById('settings-sip-wss');
        if (sipWssInput) sipWssInput.value = data.settings.sipWssGateway || '';

        this.onTelephonyProviderChange();

        const tgTokenInput = document.getElementById('settings-telegram-token');
        if (tgTokenInput) tgTokenInput.value = data.settings.telegramToken || '';

        const igTokenInput = document.getElementById('settings-instagram-token');
        if (igTokenInput) igTokenInput.value = data.settings.instagramToken || '';

        const igUsernameInput = document.getElementById('settings-instagram-username');
        if (igUsernameInput) igUsernameInput.value = data.settings.instagramUsername || '';

        const aiProviderSelect = document.getElementById('settings-ai-provider');
        if (aiProviderSelect) aiProviderSelect.value = data.settings.aiProvider || 'local';

        const geminiKeyInput = document.getElementById('settings-gemini-key');
        if (geminiKeyInput) geminiKeyInput.value = data.settings.geminiApiKey || '';

        const openaiKeyInput = document.getElementById('settings-openai-key');
        if (openaiKeyInput) openaiKeyInput.value = data.settings.openaiApiKey || '';

        const groqKeyInput = document.getElementById('settings-groq-key');
        if (groqKeyInput) groqKeyInput.value = data.settings.groqApiKey || '';

        const aiAutoReplyInput = document.getElementById('settings-ai-auto-reply');
        if (aiAutoReplyInput) aiAutoReplyInput.checked = !!data.settings.aiAutoReply;

        const regosEndpointInput = document.getElementById('settings-regos-endpoint');
        if (regosEndpointInput) regosEndpointInput.value = data.settings.regosEndpoint || '';

        const regosTokenInput = document.getElementById('settings-regos-token');
        if (regosTokenInput) regosTokenInput.value = data.settings.regosToken || '';

        this.onAIProviderChange();
    },

    setupAuth: async function() {
        const activeUserId = localStorage.getItem('activeUserId');
        const loginScreen = document.getElementById('login-screen');
        const appContainer = document.querySelector('.app-container');
        
        if (!activeUserId) {
            if (loginScreen) loginScreen.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
            return;
        }
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        
        await this.updateProfileCard(activeUserId);
        this.applyPermissions();
        this.renderView(this.currentView || 'dashboard');
    },

    updateProfileCard: async function(activeUserId) {
        const nameLabel = document.getElementById('active-user-name');
        const roleLabel = document.getElementById('active-user-role');
        const avatarLabel = document.getElementById('active-user-avatar');
        
        if (activeUserId === 'admin') {
            if (nameLabel) nameLabel.textContent = 'Administrator';
            if (roleLabel) roleLabel.textContent = 'Direktor';
            if (avatarLabel) avatarLabel.textContent = 'A';
            return;
        }
        
        try {
            const employees = await DB.getEmployees();
            const currentEmp = employees.find(e => e.id === activeUserId);
            if (currentEmp) {
                if (nameLabel) nameLabel.textContent = currentEmp.name;
                if (roleLabel) roleLabel.textContent = currentEmp.role || 'Xodim';
                if (avatarLabel) {
                    const firstChar = (currentEmp.name || 'X').charAt(0).toUpperCase();
                    avatarLabel.textContent = firstChar;
                }
            } else {
                this.logout();
            }
        } catch(err) {
            console.error("Failed to load active employee for profile card:", err);
        }
    },

    handleLoginSubmit: async function(event) {
        event.preventDefault();
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorMsg = document.getElementById('login-error-msg');
        
        if (!usernameInput || !passwordInput) return;
        
        const login = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        
        if (errorMsg) errorMsg.style.display = 'none';
        
        if (login === 'admin' && password === 'admin') {
            localStorage.setItem('activeUserId', 'admin');
            usernameInput.value = '';
            passwordInput.value = '';
            await this.setupAuth();
            return;
        }
        
        try {
            const employees = await DB.getEmployees();
            const foundEmp = employees.find(e => e.login === login && e.password === password);
            if (foundEmp) {
                localStorage.setItem('activeUserId', foundEmp.id);
                usernameInput.value = '';
                passwordInput.value = '';
                await this.setupAuth();
            } else {
                if (errorMsg) {
                    errorMsg.textContent = "Noto'g'ri login yoki parol kiritildi!";
                    errorMsg.style.display = 'block';
                }
            }
        } catch (err) {
            console.error("Login verification failed:", err);
            if (errorMsg) {
                errorMsg.textContent = "Tizimga ulanishda xatolik yuz berdi.";
                errorMsg.style.display = 'block';
            }
        }
    },

    logout: function() {
        localStorage.removeItem('activeUserId');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorMsg = document.getElementById('login-error-msg');
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (errorMsg) errorMsg.style.display = 'none';
        this.setupAuth();
    },

    applyPermissions: async function() {
        const activeUserId = localStorage.getItem('activeUserId') || 'admin';
        
        let activeRole = 'admin';
        let activeUserName = 'Administrator';
        
        try {
            if (activeUserId !== 'admin') {
                const employees = await DB.getEmployees();
                const currentEmp = employees.find(e => e.id === activeUserId);
                if (currentEmp) {
                    activeRole = (currentEmp.role || '').toLowerCase();
                    activeUserName = currentEmp.name;
                }
            }
        } catch (err) {
            console.error("Failed to load active employee role:", err);
        }
        
        let allowedViews = ['dashboard'];
        
        const isSupervisor = activeRole.includes('direktor') || activeRole.includes('admin') || activeRole.includes('dasturchi') || activeRole.includes('boshliq') || activeUserId === 'admin';
        const isSales = activeRole.includes('sotuv') || activeRole.includes('operator') || activeRole.includes('call') || activeRole.includes('aloqa');
        const isWarehouse = activeRole.includes('ombor') || activeRole.includes('logist') || activeRole.includes('tovar');
        const isAccountant = activeRole.includes('buxgalter') || activeRole.includes('kassir') || activeRole.includes('moliya') || activeRole.includes('auditor');
        const isHR = activeRole.includes('hr') || activeRole.includes('kadr') || activeRole.includes('recruiter');
        
        if (isSupervisor) {
            allowedViews = ['dashboard', 'crm', 'telephony', 'erp', 'finance', 'chats', 'hr', 'settings', 'receipts', 'seniklar'];
        } else if (isSales) {
            allowedViews = ['dashboard', 'crm', 'telephony', 'chats', 'erp', 'receipts', 'seniklar'];
        } else if (isWarehouse) {
            allowedViews = ['dashboard', 'erp', 'receipts', 'seniklar'];
        } else if (isAccountant) {
            allowedViews = ['dashboard', 'finance', 'erp', 'receipts', 'seniklar'];
        } else if (isHR) {
            allowedViews = ['dashboard', 'hr'];
        } else {
            allowedViews = ['dashboard', 'chats'];
        }
        
        document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
            const link = item.tagName === 'A' ? item : item.querySelector('a');
            const targetView = item.getAttribute('data-view') || (link ? link.getAttribute('data-view') : null);
            if (targetView) {
                if (allowedViews.includes(targetView)) {
                    item.style.setProperty('display', '', 'important');
                } else {
                    item.style.setProperty('display', 'none', 'important');
                }
            }
        });
        
        if (!allowedViews.includes(this.currentView)) {
            this.renderView(allowedViews[0]);
        }
        
        const addProductBtn = document.getElementById('erp-add-product-btn');
        const addEmployeeBtn = document.getElementById('hr-add-employee-btn');
        const syncRegosBtn = document.getElementById('erp-sync-regos-btn');
        
        const canAddProduct = isSupervisor || isWarehouse;
        if (addProductBtn) addProductBtn.style.setProperty('display', canAddProduct ? '' : 'none', 'important');
        if (syncRegosBtn) syncRegosBtn.style.setProperty('display', canAddProduct ? '' : 'none', 'important');
        
        const canAddEmployee = isSupervisor || isHR;
        if (addEmployeeBtn) addEmployeeBtn.style.setProperty('display', canAddEmployee ? '' : 'none', 'important');
        
        const crmAddCustomerBtn = document.querySelector('#view-crm .header-actions button');
        const canAddCustomer = isSupervisor || isSales;
        if (crmAddCustomerBtn) crmAddCustomerBtn.style.setProperty('display', canAddCustomer ? '' : 'none', 'important');
        
        const financeHeaderBtn = document.querySelector('#view-finance .header-actions button');
        const canAddTransaction = isSupervisor || isAccountant;
        if (financeHeaderBtn) financeHeaderBtn.style.setProperty('display', canAddTransaction ? '' : 'none', 'important');
        
        if (this.currentView === 'erp' && window.ERP && typeof window.ERP.render === 'function') {
            window.ERP.render();
        } else if (this.currentView === 'hr' && window.HR && typeof window.HR.render === 'function') {
            window.HR.render();
        } else if (this.currentView === 'receipts' && window.Receipts && typeof window.Receipts.render === 'function') {
            window.Receipts.render();
        }
    },

    setupNavigation: function() {
        const links = document.querySelectorAll('.nav-item a, .bottom-nav-item');
        links.forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                const view = link.getAttribute('data-view');
                if (view) {
                    this.renderView(view);
                }
            };
        });

        // Mavzuni o'zgartirish tugmasi
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            themeBtn.onclick = () => {
                const data = AppStorage.load();
                data.settings.theme = data.settings.theme === 'dark' ? 'light' : 'dark';
                AppStorage.save(data);
                this.applySettings();
                
                // Grafikni qayta chizish (agar dashboardda bo'lsa, mavzu ranglariga moslashadi)
                if (this.currentView === 'dashboard') {
                    this.renderDashboard();
                }
            };
        }
    },

    setupSettingsForm: function() {
        const form = document.getElementById('settings-form');
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const name = document.getElementById('settings-company-name').value;
                const currency = document.getElementById('settings-currency').value;
                
                const sbUrl = document.getElementById('settings-sb-url').value.trim();
                const sbKey = document.getElementById('settings-sb-key').value.trim();

                const sipServer = document.getElementById('settings-sip-server').value.trim();
                const sipUser = document.getElementById('settings-sip-user').value.trim();
                const sipPassword = document.getElementById('settings-sip-password').value.trim();
                const sipWss = document.getElementById('settings-sip-wss').value.trim();
                const telegramToken = document.getElementById('settings-telegram-token').value.trim();
                const instagramToken = document.getElementById('settings-instagram-token').value.trim();
                const instagramUsername = document.getElementById('settings-instagram-username').value.trim();
                const aiProvider = document.getElementById('settings-ai-provider').value;
                const telephonyProvider = document.getElementById('settings-telephony-provider').value;
                const geminiApiKey = document.getElementById('settings-gemini-key')?.value.trim() || '';
                const openaiApiKey = document.getElementById('settings-openai-key')?.value.trim() || '';
                const groqApiKey = document.getElementById('settings-groq-key')?.value.trim() || '';
                const aiAutoReply = !!document.getElementById('settings-ai-auto-reply')?.checked;
                const regosEndpoint = document.getElementById('settings-regos-endpoint')?.value.trim() || '';
                const regosToken = document.getElementById('settings-regos-token')?.value.trim() || '';
                
                const data = AppStorage.load();
                
                // Sozlamalar o'zgarganligini aniqlash
                const sbChanged = data.settings.supabaseUrl !== sbUrl || data.settings.supabaseKey !== sbKey;
                const sipChanged = data.settings.sipServer !== sipServer || 
                                   data.settings.sipUser !== sipUser || 
                                   data.settings.sipPassword !== sipPassword || 
                                   data.settings.sipWssGateway !== sipWss ||
                                   data.settings.telephonyProvider !== telephonyProvider;

                data.settings.companyName = name;
                data.settings.currency = currency;
                data.settings.supabaseUrl = sbUrl;
                data.settings.supabaseKey = sbKey;
                
                data.settings.sipServer = sipServer;
                data.settings.sipUser = sipUser;
                data.settings.sipPassword = sipPassword;
                data.settings.sipWssGateway = sipWss;
                data.settings.telegramToken = telegramToken;
                data.settings.instagramToken = instagramToken;
                data.settings.instagramUsername = instagramUsername;
                data.settings.aiProvider = aiProvider;
                data.settings.telephonyProvider = telephonyProvider;
                data.settings.geminiApiKey = geminiApiKey;
                data.settings.openaiApiKey = openaiApiKey;
                data.settings.groqApiKey = groqApiKey;
                data.settings.aiAutoReply = aiAutoReply;
                data.settings.regosEndpoint = regosEndpoint;
                data.settings.regosToken = regosToken;
                
                AppStorage.save(data);

                // Sync tokens with backend
                try {
                    await fetch('/api/settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ai_provider: aiProvider,
                            telephony_provider: telephonyProvider,
                            telegram_token: telegramToken,
                            instagram_token: instagramToken,
                            gemini_api_key: geminiApiKey,
                            openai_api_key: openaiApiKey,
                            groq_api_key: groqApiKey,
                            ai_auto_reply: aiAutoReply,
                            regos_endpoint: regosEndpoint,
                            regos_token: regosToken
                        })
                    });
                } catch(err) {
                    console.error("Backend settings sync failed:", err);
                }
                
                this.applySettings();

                // Supabase-ni qayta ishga tushirish
                if (sbChanged) {
                    DB.init();
                    if (DB.isConfigured()) {
                        alert("Supabase ulanishi saqlandi. Ma'lumotlarni bulutga sinxronizatsiya qilish boshlandi...");
                        await DB.syncLocalToCloud();
                    }
                }

                // SIP ulanishini qayta ishga tushirish
                if (sipChanged) {
                    if (window.Telephony && typeof window.Telephony.init === 'function') {
                        window.Telephony.init();
                    }
                }
                
                alert('Sozlamalar muvaffaqiyatli saqlandi!');
                this.renderView(this.currentView);
            };
        }

        const resetBtn = document.getElementById('settings-reset-data');
        if (resetBtn) {
            resetBtn.onclick = () => {
                if (confirm('Barcha kiritilgan ma\'lumotlar o\'chib ketadi va boshlang\'ich demo holatiga qaytariladi. Rozimisiz?')) {
                    AppStorage.reset();
                    DB.init();
                    if (window.Telephony && typeof window.Telephony.init === 'function') {
                        window.Telephony.init();
                    }
                    this.applySettings();
                    this.renderView(this.currentView);
                }
            };
        }
    },

    onAIProviderChange: function() {
        const provider = document.getElementById('settings-ai-provider')?.value || 'local';
        document.querySelectorAll('.ai-provider-key-group').forEach(group => {
            group.style.display = 'none';
        });
        if (provider === 'gemini') {
            const g = document.getElementById('group-gemini-key');
            if (g) g.style.display = 'block';
        } else if (provider === 'openai') {
            const o = document.getElementById('group-openai-key');
            if (o) o.style.display = 'block';
        } else if (provider === 'groq') {
            const gr = document.getElementById('group-groq-key');
            if (gr) gr.style.display = 'block';
        }
    },

    onTelephonyProviderChange: function() {
        const provider = document.getElementById('settings-telephony-provider')?.value || 'sarkor';
        const guideline = document.getElementById('sipuni-webhook-guideline');
        if (guideline) {
            guideline.style.display = provider === 'sipuni' ? 'block' : 'none';
        }
    },

    renderView: function(viewName) {
        this.currentView = viewName;
        
        // Hamma sahifalarni yashirish
        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active-view');
        });

        // Kerakli sahifani ko'rsatish
        const activeSec = document.getElementById(`view-${viewName}`);
        if (activeSec) {
            activeSec.classList.add('active-view');
        }

        // Navigatsiya menyusidagi faollikni yangilash
        document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
            const link = item.tagName === 'A' ? item : item.querySelector('a');
            const targetView = item.getAttribute('data-view') || (link ? link.getAttribute('data-view') : null);
            
            if (targetView === viewName) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Sahifaga mos modullarni yuklash
        if (viewName === 'dashboard') {
            this.renderDashboard();
        } else if (viewName === 'crm') {
            window.CRM.init();
        } else if (viewName === 'telephony') {
            window.Telephony.renderCallLogsTab();
        } else if (viewName === 'chats') {
            if (window.Chats) window.Chats.init();
        } else if (viewName === 'erp') {
            window.ERP.init();
        } else if (viewName === 'hr') {
            if (window.HR) window.HR.init();
        } else if (viewName === 'finance') {
            window.Finance.init();
        } else if (viewName === 'receipts') {
            if (window.Receipts) window.Receipts.init();
        } else if (viewName === 'seniklar') {
            if (window.Seniklar) window.Seniklar.init();
        }
    },

    updateDashboardStats: function() {
        if (this.currentView === 'dashboard') {
            this.renderDashboard();
        }
    },

    renderDashboard: async function() {
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        // Ma'lumotlarni olish
        const transactions = await DB.getTransactions();
        const customers = await DB.getCustomers();
        const inventory = await DB.getInventory();
        const calls = await DB.getCalls();
        const receipts = await DB.getReceipts();
        const employees = await DB.getEmployees();

        // Hisob-kitoblar
        const totalIncome = transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpense = transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const activeClients = customers.filter(c => c.status !== 'lost').length;
        const inventoryAlerts = inventory.filter(p => p.stock <= 3).length;

        // Calculate today's sales and profit
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();

        let todaySales = 0;
        const employeeSalesMap = {};

        // Initialize with synced employees only (those whose role is сотувчилар or contains sotuv/сотув)
        employees.forEach(e => {
            const roleLower = (e.role || "").toLowerCase();
            if (roleLower.includes("sotuv") || roleLower.includes("сотув")) {
                employeeSalesMap[e.name] = 0;
            }
        });

        receipts.forEach(r => {
            const rDate = new Date(r.created_at);
            const isToday = rDate.getFullYear() === year && rDate.getMonth() === month && rDate.getDate() === day;
            if (isToday) {
                const total = parseFloat(r.total_amount) || 0;
                todaySales += total;

                // Match with employee/seller name
                let itemsObj = r.items;
                if (typeof itemsObj === 'string') {
                    try { itemsObj = JSON.parse(itemsObj); } catch (e) { itemsObj = null; }
                }
                const sellerName = (itemsObj && itemsObj.seller_name) || '';
                if (sellerName) {
                    const matchedEmp = employees.find(e => e.name.trim().toLowerCase() === sellerName.trim().toLowerCase());
                    const displayName = matchedEmp ? matchedEmp.name : sellerName;
                    employeeSalesMap[displayName] = (employeeSalesMap[displayName] || 0) + total;
                }
            }
        });

        const todayProfit = todaySales * 0.25; // 25% profit margin

        // Dashboard DOM elementlarini yangilash
        document.getElementById('dash-income').textContent = '+' + formatMoney(totalIncome, currency);
        document.getElementById('dash-expense').textContent = '-' + formatMoney(totalExpense, currency);
        document.getElementById('dash-clients').textContent = activeClients + ' faol';
        document.getElementById('dash-alerts').textContent = inventoryAlerts + ' ta mahsulot';

        const todaySalesEl = document.getElementById('dash-today-sales');
        const todayProfitEl = document.getElementById('dash-today-profit');
        if (todaySalesEl) todaySalesEl.textContent = formatMoney(todaySales, currency);
        if (todayProfitEl) todayProfitEl.textContent = formatMoney(todayProfit, currency);

        // Oxirgi tranzaksiyalar jadvalini yuklash (5 ta)
        const recentTxContainer = document.getElementById('dash-recent-transactions');
        if (recentTxContainer) {
            const recent = [...transactions]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 5);

            let txHtml = '';
            if (recent.length === 0) {
                txHtml = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Tranzaksiyalar mavjud emas.</td></tr>';
            } else {
                recent.forEach(t => {
                    const isIncome = t.type === 'income';
                    const amountText = (isIncome ? '+' : '-') + formatMoney(t.amount, currency);
                    const amountColor = isIncome ? 'var(--success)' : 'var(--danger)';
                    txHtml += `
                        <tr>
                            <td><strong>${t.category}</strong><br><span style="font-size:11px; color:var(--text-muted);">${t.date}</span></td>
                            <td style="font-size: 13px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.description || '-'}</td>
                            <td style="text-align: right; color: ${amountColor}; font-weight: 600; font-family: 'JetBrains Mono';">${amountText}</td>
                        </tr>
                    `;
                });
            }
            recentTxContainer.innerHTML = txHtml;
        }

        // Oxirgi faol leadlarni chiqarish (3 ta)
        const recentLeadsContainer = document.getElementById('dash-recent-leads');
        if (recentLeadsContainer) {
            const leads = customers
                .filter(c => c.status === 'lead' || c.status === 'contacted')
                .slice(0, 4);

            let leadsHtml = '';
            if (leads.length === 0) {
                leadsHtml = '<div style="color:var(--text-muted); text-align:center; padding:12px 0;">Yangi nomzodlar yo\'q.</div>';
            } else {
                leads.forEach(l => {
                    leadsHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border-color)">
                            <div>
                                <strong style="font-size:14px;">${l.name}</strong>
                                <span style="display:block; font-size:11px; color:var(--text-muted);">${l.phone}${l.operator ? ` • Operator: ${l.operator}` : ''}</span>
                            </div>
                            <span class="badge ${l.status === 'lead' ? 'badge-info' : 'badge-warning'}">
                                ${l.status === 'lead' ? 'Yangi' : 'Muloqotda'}
                            </span>
                        </div>
                    `;
                });
            }
            
            // Oxirgi qo'ng'iroqlardan 3 tasini qo'shamiz (Agar bo'lsa)
            if (calls && calls.length > 0) {
                leadsHtml += '<h3 style="margin-top:20px; border-top:1px solid var(--border-color); padding-top:16px; margin-bottom: 12px;">Oxirgi Qo\'ng\'iroqlar</h3>';
                const recentCalls = [...calls]
                    .sort((a, b) => b.id.localeCompare(a.id))
                    .slice(0, 3);
                
                recentCalls.forEach(c => {
                    const client = customers.find(cust => cust.id === c.customer_id);
                    const name = client ? client.name : c.phone;
                    const isIncoming = c.direction === 'incoming';
                    const icon = isIncoming 
                        ? '<i class="fas fa-arrow-down-left" style="color:var(--info); font-size:11px;"></i>' 
                        : '<i class="fas fa-arrow-up-right" style="color:var(--accent); font-size:11px;"></i>';
                    
                    const statusText = c.status === 'answered' ? 'Suhbatlashildi' : 'Javobsiz';
                    const statusColor = c.status === 'answered' ? 'var(--success)' : 'var(--warning)';

                    leadsHtml += `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-color)">
                            <div>
                                <strong style="font-size:13px; display:flex; align-items:center; gap:6px;">${icon} ${name}</strong>
                                <span style="font-size:11px; color:var(--text-muted); font-family:\'JetBrains Mono\'">${c.phone}</span>
                            </div>
                            <span style="font-size:11px; font-weight:600; color:${statusColor}">${statusText}</span>
                        </div>
                    `;
                });
            }
            recentLeadsContainer.innerHTML = leadsHtml;
        }

        // Grafik chizish
        this.renderCharts(transactions);
        this.renderSalesCharts(todaySales, todayProfit, employeeSalesMap);
    },

    renderCharts: function(transactions) {
        const ctx = document.getElementById('cashflowChart')?.getContext('2d');
        if (!ctx) return;

        // Grafik mavzusi ranglari
        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#64748B' : '#9CA3AF';
        const gridColor = isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255, 255, 255, 0.05)';

        // Tranzaksiyalarni oylik/sana bo'yicha guruhlaymiz (oxirgi 7 ta faollik kuni)
        const dates = [...new Set(transactions.map(t => t.date))].sort().slice(-7);
        
        const incomes = dates.map(d => {
            return transactions
                .filter(t => t.date === d && t.type === 'income')
                .reduce((sum, t) => sum + t.amount, 0);
        });

        const expenses = dates.map(d => {
            return transactions
                .filter(t => t.date === d && t.type === 'expense')
                .reduce((sum, t) => sum + t.amount, 0);
        });

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        // Chart.js bilan liniyali grafik yaratamiz
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Kirimlar',
                        data: incomes,
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3
                    },
                    {
                        label: 'Chiqimlar',
                        data: expenses,
                        borderColor: '#EF4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: textColor,
                            font: { family: 'Outfit', size: 12 }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { family: 'Outfit' }
                        }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { family: 'Outfit' },
                            callback: function(value) {
                                if (value >= 1000000) {
                                    return (value / 1000000).toFixed(1) + 'M';
                                } else if (value >= 1000) {
                                    return (value / 1000).toFixed(0) + 'K';
                                }
                                return value;
                            }
                        }
                    }
                }
            }
        });
    },

    renderSalesCharts: function(todaySales, todayProfit, employeeSalesMap) {
        const isLightTheme = document.body.classList.contains('light-theme');
        const textColor = isLightTheme ? '#64748B' : '#9CA3AF';
        const gridColor = isLightTheme ? 'rgba(0,0,0,0.04)' : 'rgba(255, 255, 255, 0.05)';

        // 1. Today's Sales vs Profit Bar Chart
        const ctxSalesProfit = document.getElementById('todaySalesProfitChart')?.getContext('2d');
        if (ctxSalesProfit) {
            if (this.salesProfitChartInstance) {
                this.salesProfitChartInstance.destroy();
            }
            this.salesProfitChartInstance = new Chart(ctxSalesProfit, {
                type: 'bar',
                data: {
                    labels: ['Bugungi Savdo', 'Bugungi Foyda'],
                    datasets: [{
                        label: 'Summa',
                        data: [todaySales, todayProfit],
                        backgroundColor: [
                            'rgba(16, 185, 129, 0.75)', // Green
                            'rgba(6, 182, 212, 0.75)'   // Cyan
                        ],
                        borderColor: [
                            '#10B981',
                            '#06B6D4'
                        ],
                        borderWidth: 1.5,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor, font: { family: 'Outfit' } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: {
                                color: textColor,
                                font: { family: 'Outfit' },
                                callback: function(value) {
                                    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
                                    if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
                                    return value;
                                }
                            }
                        }
                    }
                }
            });
        }

        // 2. Sales by Employee Doughnut Chart
        const ctxEmpSales = document.getElementById('employeeSalesChart')?.getContext('2d');
        if (ctxEmpSales) {
            if (this.empSalesChartInstance) {
                this.empSalesChartInstance.destroy();
            }

            const labels = Object.keys(employeeSalesMap);
            const data = Object.values(employeeSalesMap);

            const bgColors = [
                'rgba(59, 130, 246, 0.7)',
                'rgba(139, 92, 246, 0.7)',
                'rgba(236, 72, 153, 0.7)',
                'rgba(245, 158, 11, 0.7)',
                'rgba(16, 185, 129, 0.7)',
                'rgba(6, 182, 212, 0.7)'
            ];
            const borderColors = [
                '#3B82F6',
                '#8B5CF6',
                '#EC4899',
                '#F59E0B',
                '#10B981',
                '#06B6D4'
            ];

            const selectedBg = labels.map((_, i) => bgColors[i % bgColors.length]);
            const selectedBorder = labels.map((_, i) => borderColors[i % borderColors.length]);

            const hasSales = data.some(val => val > 0);

            this.empSalesChartInstance = new Chart(ctxEmpSales, {
                type: hasSales ? 'doughnut' : 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: selectedBg,
                        borderColor: selectedBorder,
                        borderWidth: 1.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                color: textColor,
                                font: { family: 'Outfit', size: 11 }
                            }
                        }
                    },
                    scales: hasSales ? {} : {
                        x: { grid: { display: false }, ticks: { color: textColor } },
                        y: { grid: { color: gridColor }, ticks: { color: textColor } }
                    }
                }
            });
        }
    },

    toggleAdvancedSettings: function() {
        const advDiv = document.getElementById('advanced-api-settings');
        if (advDiv) {
            if (advDiv.style.display === 'none') {
                advDiv.style.display = 'block';
            } else {
                advDiv.style.display = 'none';
            }
        }
    },

    initAIAssistantWidget: function() {
        const widget = document.getElementById('ai-assistant-widget');
        const toggleBtn = document.getElementById('ai-widget-toggle');
        const closeBtn = document.getElementById('ai-widget-close');
        const form = document.getElementById('ai-widget-form');
        const input = document.getElementById('ai-widget-input');
        const messagesContainer = document.getElementById('ai-widget-messages');

        if (!widget || !toggleBtn || !closeBtn || !form) return;

        // Toggle open/close
        toggleBtn.onclick = () => {
            if (widget.classList.contains('ai-widget-closed')) {
                widget.classList.remove('ai-widget-closed');
                widget.classList.add('ai-widget-open');
                input.focus();
            } else {
                widget.classList.remove('ai-widget-open');
                widget.classList.add('ai-widget-closed');
            }
        };

        closeBtn.onclick = () => {
            widget.classList.remove('ai-widget-open');
            widget.classList.add('ai-widget-closed');
        };

        // Form submit
        form.onsubmit = async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;

            // Render user message
            this.appendAIMessage('user', text);
            input.value = '';

            // Render typing indicator
            const typingIndicator = this.appendAIMessage('typing', '<i class="fas fa-spinner fa-spin"></i> AI o\'ylamoqda...');
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            try {
                const response = await fetch('/api/ai/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: text })
                });
                
                // Remove typing indicator
                if (typingIndicator) typingIndicator.remove();

                if (!response.ok) {
                    throw new Error("API error");
                }

                const resData = await response.json();
                this.appendAIMessage('assistant', resData.response);
            } catch (err) {
                if (typingIndicator) typingIndicator.remove();
                this.appendAIMessage('assistant', 'Kechirasiz, sun\'iy intellektdan javob olishda xatolik yuz berdi. Sozlamalarda Gemini API Key to\'g\'riligini tekshiring.');
            }
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        };
    },

    appendAIMessage: function(sender, text) {
        const container = document.getElementById('ai-widget-messages');
        if (!container) return null;

        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-message ${sender}`;
        
        if (sender === 'typing') {
            msgDiv.innerHTML = text;
        } else {
            // Very simple markdown formatting helper (bullet lists, newlines, bold text)
            let formatted = this.escapeHTML(text)
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>')
                .replace(/^(?:-\s|\*\s)(.*?)(?:<br>|$)/gm, '<li>$1</li>');
            
            if (formatted.includes('<li>')) {
                formatted = formatted.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
            }
            msgDiv.innerHTML = formatted;
        }
        
        container.appendChild(msgDiv);
        return msgDiv;
    },

    escapeHTML: function(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

// Dastur yuklanganda avtomatik ishga tushirish
document.addEventListener('DOMContentLoaded', () => {
    window.App.init();
});
