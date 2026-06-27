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

    init: async function() {
        await this.loadSettingsFromBackend();
        this.applySettings();
        this.setupNavigation();
        this.setupSettingsForm();
        this.syncSettingsToBackend();
        this.initAIAssistantWidget();
        this.setupAuth();
    },

    loadSettingsFromBackend: async function() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const backendSettings = await response.json();
                if (backendSettings) {
                    const data = AppStorage.load();
                    
                    data.settings.aiProvider = backendSettings.ai_provider || data.settings.aiProvider;
                    data.settings.telephonyProvider = backendSettings.telephony_provider || data.settings.telephonyProvider;
                    data.settings.telegramToken = backendSettings.telegram_token || data.settings.telegramToken;
                    data.settings.instagramToken = backendSettings.instagram_token || data.settings.instagramToken;
                    data.settings.geminiApiKey = backendSettings.gemini_api_key || data.settings.geminiApiKey;
                    data.settings.openaiApiKey = backendSettings.openai_api_key || data.settings.openaiApiKey;
                    data.settings.groqApiKey = backendSettings.groq_api_key || data.settings.groqApiKey;
                    data.settings.aiAutoReply = !!backendSettings.ai_auto_reply;
                    data.settings.regosEndpoint = backendSettings.regos_endpoint || data.settings.regosEndpoint;
                    data.settings.regosToken = backendSettings.regos_token || data.settings.regosToken;
                    data.settings.amocrmSubdomain = backendSettings.amocrm_subdomain || data.settings.amocrmSubdomain;
                    data.settings.amocrmToken = backendSettings.amocrm_token || data.settings.amocrmToken;
                    
                    // Subscription settings
                    data.settings.maxEmployees = backendSettings.max_employees !== undefined ? backendSettings.max_employees : (data.settings.maxEmployees || 100);
                    data.settings.enableCrm = backendSettings.enable_crm !== undefined ? backendSettings.enable_crm : (data.settings.enableCrm !== false);
                    data.settings.enableWarehouse = backendSettings.enable_warehouse !== undefined ? backendSettings.enable_warehouse : (data.settings.enableWarehouse !== false);
                    data.settings.enableKassa = backendSettings.enable_kassa !== undefined ? backendSettings.enable_kassa : (data.settings.enableKassa !== false);
                    
                    data.settings.amocrmOperatorsMap = backendSettings.amocrm_operators_map || {};
                    
                    if (backendSettings.roles && backendSettings.roles.length > 0) {
                        data.settings.roles = backendSettings.roles;
                    }
                    
                    AppStorage.save(data);
                }
            }
        } catch (e) {
            console.error("Backend-dan sozlamalarni yuklashda xatolik:", e);
        }
    },

    syncSettingsToBackend: function() {
        const data = AppStorage.load();
        if (data.settings.telegramToken || data.settings.instagramToken || data.settings.geminiApiKey || data.settings.openaiApiKey || data.settings.groqApiKey || data.settings.regosEndpoint || data.settings.regosToken || data.settings.amocrmSubdomain || data.settings.amocrmToken || (data.settings.roles && data.settings.roles.length > 0)) {
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
                    regos_token: data.settings.regosToken || '',
                    amocrm_subdomain: data.settings.amocrmSubdomain || '',
                    amocrm_token: data.settings.amocrmToken || '',
                    roles: data.settings.roles || []
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

        const amocrmSubdomainInput = document.getElementById('settings-amocrm-subdomain');
        if (amocrmSubdomainInput) amocrmSubdomainInput.value = data.settings.amocrmSubdomain || '';

        const amocrmTokenInput = document.getElementById('settings-amocrm-token');
        if (amocrmTokenInput) amocrmTokenInput.value = data.settings.amocrmToken || '';

        // Webhook manzillarini joriy domen bo'yicha dinamik to'ldirish
        const companyId = localStorage.getItem('activeCompanyId') || '';
        const suffix = companyId ? `?company_id=${companyId}` : '';

        const sipuniWebhookInput = document.getElementById('settings-sipuni-webhook');
        if (sipuniWebhookInput) {
            sipuniWebhookInput.value = window.location.origin + '/api/integration/sipuni/webhook' + suffix;
        }

        const instagramWebhookInput = document.getElementById('settings-instagram-webhook');
        if (instagramWebhookInput) {
            instagramWebhookInput.value = window.location.origin + '/api/integration/instagram/webhook' + suffix;
        }

        const regosWebhookInput = document.getElementById('settings-regos-webhook');
        if (regosWebhookInput) {
            regosWebhookInput.value = window.location.origin + '/api/integration/regos/webhook' + suffix;
        }

        const amocrmWebhookInput = document.getElementById('settings-amocrm-webhook');
        if (amocrmWebhookInput) {
            amocrmWebhookInput.value = window.location.origin + '/api/integration/amocrm/webhook' + suffix;
        }

        this.renderAmoCRMOperatorsMapping();
        this.onAIProviderChange();
    },

    renderAmoCRMOperatorsMapping: async function() {
        const container = document.getElementById('amocrm-operators-mapping-container');
        const listContainer = document.getElementById('amocrm-operators-mapping-list');
        if (!container || !listContainer) return;
        
        try {
            const customers = await DB.getCustomers();
            const amocrmLeads = customers.filter(c => c.source === 'amocrm');
            if (amocrmLeads.length === 0) {
                container.style.display = 'none';
                return;
            }
            
            // Extract unique operator names from amoCRM leads
            const amocrmOps = [...new Set(amocrmLeads.map(c => c.operator).filter(Boolean))].sort();
            if (amocrmOps.length === 0) {
                container.style.display = 'none';
                return;
            }
            
            const employees = await DB.getEmployees();
            const data = AppStorage.load();
            const currentMap = data.settings.amocrmOperatorsMap || {};
            
            listContainer.innerHTML = '';
            amocrmOps.forEach(op => {
                const row = document.createElement('div');
                row.className = 'amocrm-op-row';
                row.setAttribute('data-amocrm-op', op);
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                row.style.gap = '10px';
                row.style.padding = '6px 0';
                row.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
                
                const label = document.createElement('span');
                label.style.fontSize = '12px';
                label.style.fontWeight = '500';
                label.style.color = 'var(--text-main)';
                label.textContent = op;
                
                const select = document.createElement('select');
                select.className = 'form-control amocrm-employee-select';
                select.style.width = '180px';
                select.style.height = '32px';
                select.style.padding = '2px 6px';
                select.style.fontSize = '12px';
                select.style.backgroundColor = 'rgba(255,255,255,0.03)';
                select.style.border = '1px solid rgba(255,255,255,0.1)';
                select.style.color = 'var(--text-main)';
                select.style.borderRadius = '6px';
                
                select.innerHTML = '<option value="">Biriktirilmagan (Unmapped)</option>';
                employees.forEach(emp => {
                    const opt = document.createElement('option');
                    opt.value = emp.id;
                    opt.textContent = emp.name;
                    if (currentMap[op] === emp.id) {
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });
                
                row.appendChild(label);
                row.appendChild(select);
                listContainer.appendChild(row);
            });
            
            container.style.display = 'block';
        } catch (e) {
            console.error("Failed to render amoCRM operators mapping:", e);
        }
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
        
        const activeUserRole = localStorage.getItem('activeUserRole');
        const isSuperAdminPortal = !!window.IS_SUPERADMIN_PORTAL;
        
        // Seanslar xavfsizligini ta'minlash: Portallar va rollar mosligini tekshirish
        if (isSuperAdminPortal) {
            if (activeUserRole !== 'superadmin') {
                this.logout();
                return;
            }
        } else {
            if (activeUserRole === 'superadmin') {
                this.logout();
                return;
            }
        }
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        
        const savedView = localStorage.getItem('activeView');
        
        if (activeUserRole === 'superadmin') {
            this.currentView = 'superadmin';
        } else {
            this.currentView = savedView || 'dashboard';
        }
        
        await this.updateProfileCard(activeUserId);
        this.applyPermissions();
        this.renderView(this.currentView);
    },
 
    updateProfileCard: async function(activeUserId) {
        const nameLabel = document.getElementById('active-user-name');
        const roleLabel = document.getElementById('active-user-role');
        const avatarLabel = document.getElementById('active-user-avatar');
        
        const activeUserName = localStorage.getItem('activeUserName');
        const activeUserRole = localStorage.getItem('activeUserRole');
        
        if (activeUserRole === 'superadmin' || activeUserId === 'admin') {
            if (nameLabel) nameLabel.textContent = 'Super Admin';
            if (roleLabel) roleLabel.textContent = 'Platform Admin';
            if (avatarLabel) avatarLabel.textContent = 'SA';
            return;
        }
        
        if (nameLabel && activeUserName) nameLabel.textContent = activeUserName;
        if (roleLabel) {
            let roleStr = activeUserRole || 'Xodim';
            if (roleStr.includes(';')) {
                roleStr = roleStr.split(';')[0].trim();
            }
            roleLabel.textContent = roleStr;
        }
        if (avatarLabel && activeUserName) {
            avatarLabel.textContent = activeUserName.charAt(0).toUpperCase();
        }
    },
 
    handleLoginSubmit: async function(event) {
        event.preventDefault();
        const companyInput = document.getElementById('login-company');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorMsg = document.getElementById('login-error-msg');
        
        if (!usernameInput || !passwordInput) return;
        
        const companyId = companyInput ? companyInput.value.trim() : '';
        const login = usernameInput.value.trim();
        const password = passwordInput.value.trim();
        const isSuperAdminPortal = !!window.IS_SUPERADMIN_PORTAL;
        
        if (errorMsg) errorMsg.style.display = 'none';
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    company_id: isSuperAdminPortal ? 'admin' : companyId,
                    login: login,
                    password: password,
                    is_superadmin_portal: isSuperAdminPortal
                })
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Noto'g'ri login, parol yoki kompaniya kodi!");
            }
            
            const data = await response.json();
            if (data.status === 'success') {
                localStorage.setItem('activeUserId', data.user.id);
                localStorage.setItem('activeCompanyId', data.user.company_id);
                localStorage.setItem('activeUserRole', data.user.role);
                localStorage.setItem('activeUserName', data.user.name);
                
                if (companyInput) companyInput.value = '';
                usernameInput.value = '';
                passwordInput.value = '';
                
                await this.setupAuth();
            } else {
                throw new Error("Tizimga kirishda xatolik yuz berdi.");
            }
        } catch (err) {
            console.error("Login verification failed:", err);
            if (errorMsg) {
                errorMsg.textContent = err.message || "Tizimga ulanishda xatolik yuz berdi.";
                errorMsg.style.display = 'block';
            }
        }
    },

    logout: function() {
        localStorage.removeItem('activeUserId');
        localStorage.removeItem('activeCompanyId');
        localStorage.removeItem('activeUserRole');
        localStorage.removeItem('activeUserName');
        localStorage.removeItem('activeView');
        
        const companyInput = document.getElementById('login-company');
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const errorMsg = document.getElementById('login-error-msg');
        
        if (companyInput) companyInput.value = '';
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (errorMsg) errorMsg.style.display = 'none';
        this.setupAuth();
    },

    applyPermissions: async function() {
        try {
            const activeUserRole = localStorage.getItem('activeUserRole');
            const activeUserId = localStorage.getItem('activeUserId') || 'admin';
            
            if (activeUserRole === 'superadmin') {
                const navSA = document.getElementById('nav-superadmin');
                if (navSA) navSA.style.setProperty('display', '', 'important');
                
                const navSettings = document.querySelector('.nav-item[data-view="settings"]');
                if (navSettings) navSettings.style.setProperty('display', '', 'important');
                
                // Hide all other sidebar navigation items
                document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
                    const link = item.tagName === 'A' ? item : item.querySelector('a');
                    const targetView = item.getAttribute('data-view') || (link ? link.getAttribute('data-view') : null);
                    if (targetView && targetView !== 'superadmin' && targetView !== 'settings') {
                        item.style.setProperty('display', 'none', 'important');
                    }
                });
                
                this.allowedViews = ['superadmin', 'settings'];
                if (this.currentView !== 'superadmin' && this.currentView !== 'settings') {
                    this.renderView('superadmin');
                }
                return;
            }
            
            // For normal users, hide the superadmin navigation link
            const navSA = document.getElementById('nav-superadmin');
            if (navSA) navSA.style.setProperty('display', 'none', 'important');
            
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
            
            // Extract role name safely
            let activeRoleName = activeRole || '';
            if (window.HR && typeof window.HR.parseRoleAndPlan === 'function') {
                try {
                    activeRoleName = window.HR.parseRoleAndPlan(activeRole).role || '';
                } catch (hrErr) {
                    console.error("HR parseRoleAndPlan failed:", hrErr);
                }
            } else {
                const parts = (activeRole || '').split(';');
                activeRoleName = parts[0] ? parts[0].trim() : '';
            }

            const data = AppStorage.load();
            const customRoles = data.settings.roles || [];
            
            // Find if this role exists in custom roles list safely
            const foundRole = customRoles.find(r => {
                const name = typeof r === 'string' ? r : (r ? r.name : '');
                return name && typeof name === 'string' && name.toLowerCase() === activeRoleName.toLowerCase();
            });
            
            let allowedViews = ['dashboard'];
            
            if (activeUserId === 'admin') {
                allowedViews = ['dashboard', 'crm', 'telephony', 'erp', 'finance', 'chats', 'hr', 'settings', 'receipts', 'seniklar', 'kassa'];
            } else if (foundRole && foundRole.permissions) {
                allowedViews = ['dashboard', ...foundRole.permissions];
            } else {
                // Fallback to legacy hardcoded permissions if not found in custom roles
                const isSupervisor = activeRoleName.includes('direktor') || activeRoleName.includes('admin') || activeRoleName.includes('dasturchi') || activeRoleName.includes('boshliq');
                const isSales = activeRoleName.includes('sotuv') || activeRoleName.includes('operator') || activeRoleName.includes('call') || activeRoleName.includes('aloqa');
                const isWarehouse = activeRoleName.includes('ombor') || activeRoleName.includes('logist') || activeRoleName.includes('tovar');
                const isAccountant = activeRoleName.includes('buxgalter') || activeRoleName.includes('kassir') || activeRoleName.includes('moliya') || activeRoleName.includes('auditor');
                const isHR = activeRoleName.includes('hr') || activeRoleName.includes('kadr') || activeRoleName.includes('recruiter');
                
                if (isSupervisor) {
                    allowedViews = ['dashboard', 'crm', 'telephony', 'erp', 'finance', 'chats', 'hr', 'settings', 'receipts', 'seniklar', 'kassa'];
                } else if (isSales) {
                    allowedViews = ['dashboard', 'crm', 'telephony', 'chats', 'erp', 'receipts', 'seniklar', 'kassa'];
                } else if (isWarehouse) {
                    allowedViews = ['dashboard', 'erp', 'receipts', 'seniklar', 'kassa'];
                } else if (isAccountant) {
                    allowedViews = ['dashboard', 'finance', 'erp', 'receipts', 'seniklar', 'kassa'];
                } else if (isHR) {
                    allowedViews = ['dashboard', 'hr'];
                } else {
                    allowedViews = ['dashboard', 'chats'];
                }
            }
            
            // Filter allowedViews based on company subscription modules
            const enableCrm = data.settings.enableCrm !== false;
            const enableWarehouse = data.settings.enableWarehouse !== false;
            const enableKassa = data.settings.enableKassa !== false;
            
            allowedViews = allowedViews.filter(view => {
                if (view === 'crm' && !enableCrm) return false;
                if (view === 'erp' && !enableWarehouse) return false;
                if (view === 'seniklar' && !enableWarehouse) return false;
                if (view === 'kassa' && !enableKassa) return false;
                return true;
            });
            
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
            
            this.allowedViews = allowedViews;
            if (!allowedViews.includes(this.currentView)) {
                this.renderView(allowedViews[0]);
            }
            
            const addProductBtn = document.getElementById('erp-add-product-btn');
            const addEmployeeBtn = document.getElementById('hr-add-employee-btn');
            const syncRegosBtn = document.getElementById('erp-sync-regos-btn');
            
            const canAddProduct = allowedViews.includes('erp');
            if (addProductBtn) addProductBtn.style.setProperty('display', canAddProduct ? '' : 'none', 'important');
            if (syncRegosBtn) syncRegosBtn.style.setProperty('display', canAddProduct ? '' : 'none', 'important');
            
            const canAddEmployee = allowedViews.includes('hr');
            if (addEmployeeBtn) addEmployeeBtn.style.setProperty('display', canAddEmployee ? '' : 'none', 'important');
            
            const crmAddCustomerBtn = document.getElementById('crm-add-customer-btn');
            const canAddCustomer = allowedViews.includes('crm');
            if (crmAddCustomerBtn) crmAddCustomerBtn.style.setProperty('display', canAddCustomer ? '' : 'none', 'important');
            
            const financeHeaderBtn = document.getElementById('finance-add-transaction-btn');
            const canAddTransaction = allowedViews.includes('finance');
            if (financeHeaderBtn) financeHeaderBtn.style.setProperty('display', canAddTransaction ? '' : 'none', 'important');
            
            // Toggle amoCRM Sync buttons based on permission
            const amocrmSyncBtn = document.getElementById('btn-amocrm-sync');
            if (amocrmSyncBtn) {
                amocrmSyncBtn.style.setProperty('display', canAddCustomer ? 'inline-flex' : 'none', 'important');
            }
            
            const amocrmSyncReceiptsBtn = document.getElementById('btn-amocrm-sync-receipts');
            const canViewReceipts = allowedViews.includes('receipts');
            if (amocrmSyncReceiptsBtn) {
                amocrmSyncReceiptsBtn.style.setProperty('display', canViewReceipts ? 'inline-flex' : 'none', 'important');
            }
            
            if (this.currentView === 'erp' && window.ERP && typeof window.ERP.render === 'function') {
                window.ERP.render();
            } else if (this.currentView === 'hr' && window.HR && typeof window.HR.render === 'function') {
                window.HR.render();
            } else if (this.currentView === 'receipts' && window.Receipts && typeof window.Receipts.render === 'function') {
                window.Receipts.render();
            } else if (this.currentView === 'kassa' && window.Kassa && typeof window.Kassa.render === 'function') {
                window.Kassa.render();
            }
        } catch (globalErr) {
            console.error("Critical error in applyPermissions, running fallback visibility:", globalErr);
            // Fallback: show the buttons if there is an error so they don't disappear!
            const amocrmSyncBtn = document.getElementById('btn-amocrm-sync');
            if (amocrmSyncBtn) amocrmSyncBtn.style.setProperty('display', 'inline-flex', 'important');
            const amocrmSyncReceiptsBtn = document.getElementById('btn-amocrm-sync-receipts');
            if (amocrmSyncReceiptsBtn) amocrmSyncReceiptsBtn.style.setProperty('display', 'inline-flex', 'important');
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
                 const data = AppStorage.load();
                 const name = document.getElementById('settings-company-name').value;
                 const currency = document.getElementById('settings-currency').value;
                 
                 const sbUrl = document.getElementById('settings-sb-url')?.value.trim() || data.settings.supabaseUrl || '';
                 const sbKey = document.getElementById('settings-sb-key')?.value.trim() || data.settings.supabaseKey || '';

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
                 const amocrmSubdomain = document.getElementById('settings-amocrm-subdomain')?.value.trim() || '';
                 const amocrmToken = document.getElementById('settings-amocrm-token')?.value.trim() || '';
                
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
                data.settings.amocrmSubdomain = amocrmSubdomain;
                data.settings.amocrmToken = amocrmToken;
                
                // Read amoCRM operators mapping from UI
                const amocrmOperatorsMap = {};
                document.querySelectorAll('.amocrm-op-row').forEach(row => {
                    const op = row.getAttribute('data-amocrm-op');
                    const empId = row.querySelector('.amocrm-employee-select').value;
                    if (empId) {
                        amocrmOperatorsMap[op] = empId;
                    }
                });
                
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
                data.settings.amocrmSubdomain = amocrmSubdomain;
                data.settings.amocrmToken = amocrmToken;
                data.settings.amocrmOperatorsMap = amocrmOperatorsMap;
                
                AppStorage.save(data);

                // Sync tokens and roles with backend
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
                            regos_token: regosToken,
                            amocrm_subdomain: amocrmSubdomain,
                            amocrm_token: amocrmToken,
                            supabase_url: sbUrl,
                            supabase_key: sbKey,
                            roles: data.settings.roles || [],
                            amocrm_operators_map: amocrmOperatorsMap
                        })
                    });
                } catch(err) {
                    console.error("Backend settings sync failed:", err);
                }
                
                this.applySettings();
                this.applyPermissions();

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
        if (this.allowedViews && !this.allowedViews.includes(viewName)) {
            viewName = this.allowedViews[0] || 'dashboard';
        }
        this.currentView = viewName;
        localStorage.setItem('activeView', viewName);
        
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
        } else if (viewName === 'kassa') {
            if (window.Kassa) window.Kassa.init();
        } else if (viewName === 'superadmin') {
            if (window.SuperAdmin) window.SuperAdmin.init();
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

        const activeUserId = localStorage.getItem('activeUserId') || 'admin';
        const employees = await DB.getEmployees();
        
        let activeUserName = 'Administrator';
        let isDirector = activeUserId === 'admin';
        
        if (!isDirector) {
            try {
                const currentEmp = employees.find(e => e.id === activeUserId);
                if (currentEmp) {
                    activeUserName = currentEmp.name;
                    const role = (currentEmp.role || '').toLowerCase();
                    const isSupervisor = role.includes('direktor') || role.includes('admin') || role.includes('dasturchi') || role.includes('boshliq');
                    isDirector = isSupervisor;
                }
            } catch (err) {
                console.error("Failed to load active employee for dashboard:", err);
            }
        }

        // Header titles update
        const titleEl = document.getElementById('main-header-title');
        const subtitleEl = document.querySelector('#view-dashboard .header-title p');
        if (isDirector) {
            if (titleEl) titleEl.textContent = "Boshqaruv Paneli";
            if (subtitleEl) subtitleEl.textContent = "Kompaniyangiz ko'rsatkichlarining qisqacha tahlili";
        } else {
            if (titleEl) titleEl.textContent = `Boshqaruv Paneli (${activeUserName})`;
            if (subtitleEl) subtitleEl.textContent = "Sizning shaxsiy ko'rsatkichlaringiz tahlili";
        }

        // Data fetching based on role
        const customers = await DB.getCustomers();
        const calls = await DB.getCalls();

        if (isDirector) {
            const transactions = await DB.getTransactions();
            const inventory = await DB.getInventory();

            let totalIncome = transactions
                .filter(t => t.type === 'income')
                .reduce((sum, t) => sum + t.amount, 0);

            let totalExpense = transactions
                .filter(t => t.type === 'expense')
                .reduce((sum, t) => sum + t.amount, 0);

            let activeClients = customers.filter(c => c.status !== 'lost').length;
            let inventoryAlerts = inventory.filter(p => p.stock <= 3).length;
            
            let todaySales = 0;
            let todayProfit = 0;
            const employeeSalesMap = {};

            try {
                const reportRes = await fetch('/api/integration/regos/sales-report');
                if (reportRes.ok) {
                    const reportData = await reportRes.json();
                    if (reportData.status === 'success') {
                        todaySales = reportData.total_sales;
                        todayProfit = reportData.total_profit;
                        for (const [login, emp] of Object.entries(reportData.employee_sales)) {
                            employeeSalesMap[emp.name] = emp.sales;
                        }
                    }
                }
            } catch (err) {
                console.error('REGOS sales report fetch failed:', err);
            }

            // Reset DOM displays
            const card1 = document.querySelector('.stats-grid > div:nth-child(1)');
            const card2 = document.querySelector('.stats-grid > div:nth-child(2)');
            const card3 = document.querySelector('.stats-grid > div:nth-child(3)');
            const card4 = document.querySelector('.stats-grid > div:nth-child(4)');
            
            if (card1) {
                card1.style.display = 'flex';
                card1.querySelector('h3').textContent = 'Jami Kirim';
            }
            if (card2) card2.style.display = 'flex';
            if (card3) {
                card3.style.display = 'flex';
                card3.querySelector('h3').textContent = 'Mijozlar';
            }
            if (card4) card4.style.display = 'flex';
            
            const cashflowCard = document.getElementById('cashflowChart')?.closest('.card');
            if (cashflowCard) cashflowCard.style.display = 'block';
            
            const todaySalesCard = document.getElementById('todaySalesProfitChart')?.closest('.card');
            if (todaySalesCard) todaySalesCard.style.display = 'block';
            
            const empSalesCard = document.getElementById('employeeSalesChart')?.closest('.card');
            if (empSalesCard) empSalesCard.style.display = 'block';
            
            const recentTxCard = document.getElementById('dash-recent-transactions')?.closest('.card');
            if (recentTxCard) recentTxCard.style.display = 'block';
            
            const firstGrid = document.querySelector('#view-dashboard .dashboard-grid:nth-of-type(1)');
            if (firstGrid) firstGrid.style.gridTemplateColumns = '';
            
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

            // Grafik chizish
            this.renderCharts(transactions);
            this.renderSalesCharts(todaySales, todayProfit, employeeSalesMap);

        } else {
            // Operator specific stats
            // "qancha savdo qildi" -> Won status leads total value
            const mySales = customers
                .filter(c => c.operator === activeUserName && c.status === 'won')
                .reduce((sum, c) => sum + (c.value || 0), 0);
            
            // "nechta mijoz bilan gaplashdi" -> Count of unique customers assigned to this operator in amoCRM (they talked to them)
            const myCustomersCount = customers.filter(c => c.operator === activeUserName).length;
            
            // Modify Stats Cards for Operator
            const card1 = document.querySelector('.stats-grid > div:nth-child(1)');
            const card2 = document.querySelector('.stats-grid > div:nth-child(2)');
            const card3 = document.querySelector('.stats-grid > div:nth-child(3)');
            const card4 = document.querySelector('.stats-grid > div:nth-child(4)');
            
            if (card1) {
                card1.style.display = 'flex';
                card1.querySelector('h3').textContent = 'Siz qilgan savdo (Jami)';
                document.getElementById('dash-income').textContent = formatMoney(mySales, currency);
            }
            if (card2) card2.style.display = 'none';
            if (card3) {
                card3.style.display = 'flex';
                card3.querySelector('h3').textContent = 'Siz gaplashgan mijozlar';
                document.getElementById('dash-clients').textContent = myCustomersCount + ' ta';
            }
            if (card4) card4.style.display = 'none';
            
            const cashflowCard = document.getElementById('cashflowChart')?.closest('.card');
            if (cashflowCard) cashflowCard.style.display = 'none';
            
            const todaySalesCard = document.getElementById('todaySalesProfitChart')?.closest('.card');
            if (todaySalesCard) todaySalesCard.style.display = 'none';
            
            const empSalesCard = document.getElementById('employeeSalesChart')?.closest('.card');
            if (empSalesCard) empSalesCard.style.display = 'none';
            
            const recentTxCard = document.getElementById('dash-recent-transactions')?.closest('.card');
            if (recentTxCard) recentTxCard.style.display = 'none';
            
            const firstGrid = document.querySelector('#view-dashboard .dashboard-grid:nth-of-type(1)');
            if (firstGrid) firstGrid.style.gridTemplateColumns = '1fr';
        }

        // Oxirgi faol leadlarni chiqarish (3 ta)
        const recentLeadsContainer = document.getElementById('dash-recent-leads');
        if (recentLeadsContainer) {
            let leads = customers.filter(c => c.status === 'lead' || c.status === 'contacted');
            if (!isDirector) {
                leads = leads.filter(c => c.operator === activeUserName);
            }
            leads = leads.slice(0, 4);

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
                
                let recentCalls = [...calls];
                if (!isDirector) {
                    const myCustomerIds = customers
                        .filter(cust => cust.operator === activeUserName)
                        .map(cust => cust.id);
                    recentCalls = recentCalls.filter(c => myCustomerIds.includes(c.customer_id));
                }
                
                recentCalls = recentCalls
                    .sort((a, b) => b.id.localeCompare(a.id))
                    .slice(0, 3);
                
                if (recentCalls.length === 0) {
                    leadsHtml += '<div style="color:var(--text-muted); text-align:center; padding:12px 0;">Qo\'ng\'iroqlar mavjud emas.</div>';
                } else {
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
            }
            recentLeadsContainer.innerHTML = leadsHtml;
        }

        // Grafik chizish
        if (isDirector) {
            this.renderCharts(transactions);
            this.renderSalesCharts(todaySales, todayProfit, employeeSalesMap);
        }
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

window.SuperAdmin = {
    init: async function() {
        await this.loadCompanies();
    },

    loadCompanies: async function() {
        const tbody = document.getElementById('superadmin-companies-list');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</td></tr>';

        try {
            const response = await fetch('/api/companies');
            if (!response.ok) throw new Error("Kompaniyalarni yuklashda xatolik yuz berdi.");
            
            const companies = await response.json();
            tbody.innerHTML = '';

            if (companies.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Kompaniyalar topilmadi.</td></tr>';
                return;
            }

            companies.forEach(company => {
                const tr = document.createElement('tr');
                const createdDate = company.created_at ? new Date(company.created_at).toLocaleString('uz-UZ') : 'Noma\'lum';
                
                const isActive = company.status === 'active';
                const statusBadge = isActive 
                    ? '<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-check-circle"></i> Faol</span>'
                    : '<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 4px 8px; border-radius: 4px; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-times-circle"></i> O\'chirilgan</span>';

                const viewBtn = `<button class="btn btn-secondary btn-sm" onclick="SuperAdmin.viewCompany('${company.id}')" style="margin-right: 8px; font-size: 12px; padding: 4px 8px; border-radius: 6px; cursor: pointer; border-color: rgba(255,255,255,0.15);"><i class="fas fa-eye"></i> Ko'rish</button>`;

                const toggleBtn = isActive
                    ? `<button class="btn btn-secondary btn-sm" onclick="SuperAdmin.toggleStatus('${company.id}', 'disabled')" style="border-color: var(--danger); color: var(--danger); font-size: 12px; padding: 4px 8px; border-radius: 6px; cursor: pointer;"><i class="fas fa-ban"></i> O'chirish</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="SuperAdmin.toggleStatus('${company.id}', 'active')" style="font-size: 12px; padding: 4px 8px; border-radius: 6px; cursor: pointer;"><i class="fas fa-check"></i> Faollashtirish</button>`;

                tr.innerHTML = `
                    <td style="font-weight: 700; font-family: 'JetBrains Mono';">${company.id}</td>
                    <td>${company.name}</td>
                    <td>${createdDate}</td>
                    <td>${statusBadge}</td>
                    <td style="text-align: right;">${viewBtn}${toggleBtn}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Yuklashda xatolik: ${err.message}</td></tr>`;
        }
    },

    toggleStatus: async function(companyId, newStatus) {
        if (!confirm(`Kompaniya holatini o'zgartirishni xohlaysizmi?`)) return;
        try {
            const response = await fetch('/api/companies/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    company_id: companyId,
                    status: newStatus
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Statusni o'zgartirishda xatolik yuz berdi.");
            }

            await this.loadCompanies();
        } catch (err) {
            alert("Xatolik: " + err.message);
        }
    },

    handleCreateCompany: async function(event) {
        event.preventDefault();
        
        const companyIdInput = document.getElementById('company-reg-id');
        const companyNameInput = document.getElementById('company-reg-name');
        const adminNameInput = document.getElementById('company-reg-admin-name');
        const adminLoginInput = document.getElementById('company-reg-admin-login');
        const adminPasswordInput = document.getElementById('company-reg-admin-password');
        const errorMsg = document.getElementById('company-reg-error-msg');

        if (errorMsg) errorMsg.style.display = 'none';

        const payload = {
            company_id: companyIdInput.value.trim(),
            company_name: companyNameInput.value.trim(),
            admin_name: adminNameInput.value.trim(),
            admin_login: adminLoginInput.value.trim(),
            admin_password: adminPasswordInput.value.trim()
        };

        try {
            const response = await fetch('/api/companies/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Kompaniya qo'shishda xatolik yuz berdi.");
            }

            // Reset form and close modal
            event.target.reset();
            closeModal('superadmin-company-modal');
            await this.loadCompanies();
        } catch (err) {
            console.error(err);
            if (errorMsg) {
                errorMsg.textContent = err.message;
                errorMsg.style.display = 'block';
            }
        }
    },

    activeCompanyPassword: '',
    isPasswordVisible: false,

    viewCompany: async function(companyId) {
        this.isPasswordVisible = false;
        const pwLabel = document.getElementById('v-admin-password');
        if (pwLabel) pwLabel.textContent = '••••••';
        const pwBtn = document.getElementById('toggle-admin-pw-btn');
        if (pwBtn) pwBtn.innerHTML = '<i class="fas fa-eye"></i>';

        try {
            const response = await fetch(`/api/companies/${companyId}/details`);
            if (!response.ok) throw new Error("Kompaniya tafsilotlarini yuklashda xatolik.");
            
            const data = await response.json();
            
            // 1. Fill basic info
            document.getElementById('view-company-modal-title').textContent = `${data.company.name} - Tafsilotlar`;
            document.getElementById('v-comp-id').textContent = data.company.id;
            document.getElementById('v-comp-name').textContent = data.company.name;
            document.getElementById('v-comp-created').textContent = data.company.created_at ? new Date(data.company.created_at).toLocaleString('uz-UZ') : 'Noma\'lum';
            
            const isActive = data.company.status === 'active';
            const statusEl = document.getElementById('v-comp-status');
            if (statusEl) {
                statusEl.innerHTML = isActive 
                    ? '<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;"><i class="fas fa-check-circle"></i> Faol</span>'
                    : '<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 11px;"><i class="fas fa-times-circle"></i> O\'chirilgan</span>';
            }
            
            // 2. Fill Admin info
            if (data.admin) {
                document.getElementById('v-admin-name').textContent = data.admin.name;
                document.getElementById('v-admin-login').textContent = data.admin.login;
                this.activeCompanyPassword = data.admin.password;
            } else {
                document.getElementById('v-admin-name').textContent = 'Noma\'lum';
                document.getElementById('v-admin-login').textContent = 'Noma\'lum';
                this.activeCompanyPassword = '';
            }
            
            // 3. Fill stats
            document.getElementById('s-cust-count').textContent = data.stats.customers;
            document.getElementById('s-prod-count').textContent = data.stats.products;
            document.getElementById('s-emp-count').textContent = data.stats.employees;
            document.getElementById('s-receipt-count').textContent = data.stats.receipts;
            document.getElementById('s-call-count').textContent = data.stats.calls;
            document.getElementById('s-trans-count').textContent = data.stats.transactions;
            
            const totalSalesFormatted = new Intl.NumberFormat('uz-UZ', { style: 'decimal' }).format(data.stats.total_sales) + " so'm";
            document.getElementById('s-total-sales').textContent = totalSalesFormatted;
            
            // 4. Fill settings
            document.getElementById('v-settings-tg').textContent = data.settings.telegram_token || '-';
            document.getElementById('v-settings-ig').textContent = data.settings.instagram_username || '-';
            document.getElementById('v-settings-ai-prov').textContent = data.settings.ai_provider || 'local';
            document.getElementById('v-settings-ai-auto').textContent = data.settings.ai_auto_reply ? 'Yoqilgan' : 'O\'chirilgan';
            document.getElementById('v-settings-regos-url').textContent = data.settings.regos_endpoint || '-';
            document.getElementById('v-settings-amo-sub').textContent = data.settings.amocrm_subdomain || '-';
            
            // 5. Fill limits form
            document.getElementById('edit-limits-comp-id').value = companyId;
            document.getElementById('edit-limits-max-employees').value = data.settings.max_employees || 100;
            document.getElementById('edit-limits-enable-crm').checked = data.settings.enable_crm !== false;
            document.getElementById('edit-limits-enable-warehouse').checked = data.settings.enable_warehouse !== false;
            document.getElementById('edit-limits-enable-kassa').checked = data.settings.enable_kassa !== false;
            document.getElementById('edit-limits-sb-url').value = data.settings.supabase_url || data.settings.supabaseUrl || '';
            document.getElementById('edit-limits-sb-key').value = data.settings.supabase_key || data.settings.supabaseKey || '';
            
            showModal('superadmin-view-company-modal');
        } catch (err) {
            alert("Xatolik: " + err.message);
        }
    },

    saveCompanySettings: async function(event) {
        event.preventDefault();
        const companyId = document.getElementById('edit-limits-comp-id').value;
        const maxEmployees = parseInt(document.getElementById('edit-limits-max-employees').value) || 100;
        const enableCrm = document.getElementById('edit-limits-enable-crm').checked;
        const enableWarehouse = document.getElementById('edit-limits-enable-warehouse').checked;
        const enableKassa = document.getElementById('edit-limits-enable-kassa').checked;
        const sbUrl = document.getElementById('edit-limits-sb-url').value.trim();
        const sbKey = document.getElementById('edit-limits-sb-key').value.trim();
        
        try {
            const response = await fetch(`/api/companies/${companyId}/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    max_employees: maxEmployees,
                    enable_crm: enableCrm,
                    enable_warehouse: enableWarehouse,
                    enable_kassa: enableKassa,
                    supabase_url: sbUrl,
                    supabase_key: sbKey
                })
            });
            
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Sozlamalarni saqlashda xatolik yuz berdi.");
            }
            
            alert("Kompaniya sozlamalari va cheklovlari muvaffaqiyatli saqlandi!");
            closeModal('superadmin-view-company-modal');
            await this.loadCompanies();
        } catch (err) {
            alert("Xatolik: " + err.message);
        }
    },

    togglePasswordVisibility: function() {
        const pwLabel = document.getElementById('v-admin-password');
        const pwBtn = document.getElementById('toggle-admin-pw-btn');
        if (!pwLabel) return;
        
        this.isPasswordVisible = !this.isPasswordVisible;
        if (this.isPasswordVisible) {
            pwLabel.textContent = this.activeCompanyPassword || 'Parol yo\'q';
            if (pwBtn) pwBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            pwLabel.textContent = '••••••';
            if (pwBtn) pwBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }
};
