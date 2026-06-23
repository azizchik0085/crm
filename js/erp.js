// ERP & CRM Tizimi - ERP Moduli (Omborxona) va HR Moduli (Xodimlar) - SUPABASE ULANISHI BILAN

window.ERP = {
    inventoryPage: 1,
    inventoryPageSize: 100,

    init: function() {
        this.setupEventListeners();
        this.render();
    },

    setupEventListeners: function() {
        // Qidiruv
        const searchInput = document.getElementById('erp-search');
        if (searchInput) {
            searchInput.oninput = () => {
                this.inventoryPage = 1;
                this.render();
            };
        }

        // Formalar yuborilishi
        const invForm = document.getElementById('add-product-form');
        if (invForm) {
            invForm.onsubmit = (e) => {
                e.preventDefault();
                this.addProduct();
            };
        }
    },

    render: async function() {
        const searchVal = document.getElementById('erp-search')?.value.toLowerCase() || '';
        const container = document.getElementById('erp-content');
        if (!container) return;

        await this.renderInventory(container, searchVal);
    },

    renderInventory: async function(container, searchVal) {
        // Supabase yoki keshdan ombor ma'lumotlarini yuklash
        const inventory = await DB.getInventory();
        
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const searchValNorm = window.normalizeUzbek ? window.normalizeUzbek(searchVal) : searchVal.toLowerCase();
        const filtered = inventory.filter(p => {
            const nameNorm = window.normalizeUzbek ? window.normalizeUzbek(p.name) : p.name.toLowerCase();
            const skuNorm = window.normalizeUzbek ? window.normalizeUzbek(p.sku) : p.sku.toLowerCase();
            const catNorm = p.category ? (window.normalizeUzbek ? window.normalizeUzbek(p.category) : p.category.toLowerCase()) : '';
            return nameNorm.includes(searchValNorm) || 
                   skuNorm.includes(searchValNorm) || 
                   catNorm.includes(searchValNorm);
        });

        // Ombor statistikasi
        const totalProducts = inventory.length;
        const totalStockValuation = inventory.reduce((sum, p) => sum + (p.price * p.stock), 0);
        const lowStockCount = inventory.filter(p => p.stock > 0 && p.stock <= 3).length;
        const outOfStockCount = inventory.filter(p => p.stock === 0).length;

        // Pagination calculations
        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / this.inventoryPageSize) || 1;
        if (this.inventoryPage > totalPages) this.inventoryPage = totalPages;
        if (this.inventoryPage < 1) this.inventoryPage = 1;
        
        const startIdx = (this.inventoryPage - 1) * this.inventoryPageSize;
        const endIdx = startIdx + this.inventoryPageSize;
        const pageItems = filtered.slice(startIdx, endIdx);

        // Fetch active employee role to check permissions
        const activeUserId = localStorage.getItem('activeUserId') || 'admin';
        let activeRole = 'admin';
        try {
            if (activeUserId !== 'admin') {
                const employees = await DB.getEmployees();
                const currentEmp = employees.find(e => e.id === activeUserId);
                if (currentEmp) activeRole = (currentEmp.role || '').toLowerCase();
            }
        } catch (e) {
            console.error(e);
        }
        
        const isSupervisor = activeRole.includes('direktor') || activeRole.includes('admin') || activeRole.includes('dasturchi') || activeRole.includes('boshliq') || activeUserId === 'admin';
        const isWarehouse = activeRole.includes('ombor') || activeRole.includes('logist') || activeRole.includes('tovar');
        const isAccountant = activeRole.includes('buxgalter') || activeRole.includes('kassir') || activeRole.includes('moliya') || activeRole.includes('auditor');
        const canWriteInventory = isSupervisor || isWarehouse;
        const canSeeValuation = isSupervisor || isWarehouse || isAccountant;

        let html = `
            <div class="stats-grid" style="margin-top: 16px;">
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Jami Mahsulot turlari</h3>
                        <div class="stat-value">${totalProducts} ta</div>
                    </div>
                    <div class="stat-icon-box info"><i class="fas fa-boxes"></i></div>
                </div>
                ${canSeeValuation ? `
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Ombor Qiymati</h3>
                        <div class="stat-value" style="color: var(--success);">${formatMoney(totalStockValuation, currency)}</div>
                    </div>
                    <div class="stat-icon-box income"><i class="fas fa-coins"></i></div>
                </div>
                ` : ''}
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Kam Qolgan</h3>
                        <div class="stat-value" style="color: var(--warning);">${lowStockCount} ta</div>
                    </div>
                    <div class="stat-icon-box warning"><i class="fas fa-exclamation-triangle"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Tugagan</h3>
                        <div class="stat-value" style="color: var(--danger);">${outOfStockCount} ta</div>
                    </div>
                    <div class="stat-icon-box danger"><i class="fas fa-times-circle"></i></div>
                </div>
            </div>

            <div class="card">
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Mahsulot nomi</th>
                                <th>SKU</th>
                                <th>Kategoriya</th>
                                <th>Narxi</th>
                                <th>Qoldiq</th>
                                <th>Holat</th>
                                ${canWriteInventory ? '<th style="text-align: right;">Amallar</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (pageItems.length === 0) {
            html += `<tr><td colspan="${canWriteInventory ? 7 : 6}" style="text-align: center; color: var(--text-muted); padding: 32px;">Mahsulotlar topilmadi.</td></tr>`;
        } else {
            pageItems.forEach(p => {
                let stockBadge = '<span class="badge badge-success">Mavjud</span>';
                let stockColor = 'var(--text-main)';
                
                if (p.stock === 0) {
                    stockBadge = '<span class="badge badge-danger">Tugagan</span>';
                    stockColor = 'var(--danger)';
                } else if (p.stock <= 3) {
                    stockBadge = '<span class="badge badge-warning">Kam qolgan</span>';
                    stockColor = 'var(--warning)';
                }

                html += `
                    <tr>
                        <td><strong>${p.name}</strong></td>
                        <td><code style="font-family:'JetBrains Mono';">${p.sku}</code></td>
                        <td>${p.category}</td>
                        <td>${formatMoney(p.price, currency)}</td>
                        <td><strong style="color: ${stockColor}">${p.stock} ta</strong></td>
                        <td>${stockBadge}</td>
                        ${canWriteInventory ? `
                        <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                            <button class="btn btn-secondary btn-sm" onclick="ERP.adjustStock('${p.id}', 1)"><i class="fas fa-plus"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="ERP.adjustStock('${p.id}', -1)" ${p.stock <= 0 ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="ERP.deleteProduct('${p.id}')"><i class="fas fa-trash-alt" style="color: var(--danger)"></i></button>
                        </td>
                        ` : ''}
                    </tr>
                `;
            });
        }

        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Generate pagination bar HTML
        if (totalPages > 1) {
            html += `
                <div class="pagination-container" style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding: 0 8px; flex-wrap: wrap; gap: 12px;">
                    <div class="pagination-info" style="color: var(--text-muted); font-size: 14px;">
                        Jami ${totalItems} tadan ${startIdx + 1}-${Math.min(endIdx, totalItems)} ko'rsatilyapti
                    </div>
                    <div class="pagination-buttons" style="display: flex; align-items: center; gap: 4px;">
                        <button class="btn btn-secondary btn-sm" onclick="ERP.setPage(${this.inventoryPage - 1})" ${this.inventoryPage === 1 ? 'disabled' : ''} style="padding: 6px 10px;"><i class="fas fa-chevron-left"></i></button>
            `;
            
            const maxPageButtons = 5;
            let startPage = Math.max(1, this.inventoryPage - 2);
            let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
            
            if (endPage - startPage < maxPageButtons - 1) {
                startPage = Math.max(1, endPage - maxPageButtons + 1);
            }
            
            if (startPage > 1) {
                html += `<button class="btn btn-secondary btn-sm" onclick="ERP.setPage(1)" style="padding: 6px 10px;">1</button>`;
                if (startPage > 2) {
                    html += `<span style="color: var(--text-muted); margin: 0 4px;">...</span>`;
                }
            }
            
            for (let i = startPage; i <= endPage; i++) {
                const isActive = i === this.inventoryPage;
                html += `
                    <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="ERP.setPage(${i})" style="padding: 6px 10px; min-width: 32px;">${i}</button>
                `;
            }
            
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    html += `<span style="color: var(--text-muted); margin: 0 4px;">...</span>`;
                }
                html += `<button class="btn btn-secondary btn-sm" onclick="ERP.setPage(${totalPages})" style="padding: 6px 10px;">${totalPages}</button>`;
            }
            
            html += `
                        <button class="btn btn-secondary btn-sm" onclick="ERP.setPage(${this.inventoryPage + 1})" ${this.inventoryPage === totalPages ? 'disabled' : ''} style="padding: 6px 10px;"><i class="fas fa-chevron-right"></i></button>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    addProduct: async function() {
        const name = document.getElementById('prod-name').value;
        const sku = document.getElementById('prod-sku').value;
        const category = document.getElementById('prod-cat').value;
        const price = parseFloat(document.getElementById('prod-price').value) || 0;
        const stock = parseInt(document.getElementById('prod-stock').value) || 0;

        if (!name || !sku || !category) {
            alert('Iltimos, barcha maydonlarni to\'ldiring!');
            return;
        }

        // SKU takrorlanishini tekshirish
        const inventory = await DB.getInventory();
        if (inventory.some(p => p.sku.toUpperCase() === sku.toUpperCase())) {
            alert('Bu SKU kodli mahsulot allaqachon mavjud!');
            return;
        }

        const newProduct = {
            id: 'i_' + Date.now(),
            name,
            sku: sku.toUpperCase(),
            category,
            price,
            stock
        };

        await DB.saveProduct(newProduct);

        // Formani tozalash va modalni yopish
        document.getElementById('add-product-form').reset();
        closeModal('product-modal');

        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    adjustStock: async function(id, amount) {
        const inventory = await DB.getInventory();
        const product = inventory.find(p => p.id === id);
        
        if (product) {
            const newStock = product.stock + amount;
            if (newStock < 0) return;

            product.stock = newStock;
            
            await DB.saveProduct(product);
            
            // Agar omborga mahsulot sotib olinsa, moliya xarajatiga yozamiz
            if (amount > 0) {
                await DB.saveTransaction({
                    id: 't_' + Date.now(),
                    type: 'expense',
                    category: 'Omborni to\'ldirish',
                    amount: product.price * 0.7 * amount, // Ulgurji narxi 70% deb hisoblandi
                    date: new Date().toISOString().split('T')[0],
                    description: `${product.name} ombor qoldig'i +${amount} ta to'ldirildi`
                });
            }

            await this.render();
            if (window.App && typeof window.App.updateDashboardStats === 'function') {
                window.App.updateDashboardStats();
            }
        }
    },

    deleteProduct: async function(id) {
        if (!confirm('Ushbu mahsulotni o\'chirib tashlamoqchimisiz?')) return;

        await DB.deleteProduct(id);

        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    setPage: function(pageNum) {
        this.inventoryPage = pageNum;
        this.render();
    },

    syncWithRegos: async function() {
        const settings = AppStorage.load().settings;
        if (!settings.regosEndpoint || !settings.regosToken) {
            alert("REGOS API sozlanmagan. Iltimos, sozlamalar sahifasida Endpoint va Access Tokenni kiriting.");
            return;
        }

        const btn = document.getElementById('erp-sync-regos-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> Sinxronizatsiya qilinmoqda...';
        }

        try {
            const response = await fetch('/api/integration/regos/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const resData = await response.json();
            if (response.ok && resData.status === 'success') {
                alert(`Sinxronizatsiya muvaffaqiyatli yakunlandi! Jami ${resData.count} ta mahsulot yangilandi.`);
            } else {
                alert(`Xatolik yuz berdi: ${resData.detail || resData.message || "Tizim xatosi"}`);
            }
        } catch (err) {
            console.error(err);
            alert("Tarmoq xatoligi yoki backend bilan bog'lana olmadi.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync"></i> REGOS bilan sinxronizatsiya';
            }
            await this.render();
            if (window.App && typeof window.App.updateDashboardStats === 'function') {
                window.App.updateDashboardStats();
            }
        }
    }
};

window.HR = {
    init: function() {
        this.setupEventListeners();
        this.updateRoleSelects();
        this.render();
    },

    parseRoleAndPlan: function(roleStr) {
        if (!roleStr) return { role: '', plan: 0 };
        const parts = roleStr.split(';');
        const roleName = parts[0].trim();
        let plan = 0;
        for (let i = 1; i < parts.length; i++) {
            const p = parts[i].trim();
            if (p.startsWith('plan=')) {
                plan = parseFloat(p.substring(5)) || 0;
            }
        }
        return { role: roleName, plan: plan };
    },

    serializeRoleAndPlan: function(roleName, plan) {
        const cleanRole = (roleName || '').replace(/;/g, ' ').trim();
        return `${cleanRole};plan=${plan || 0}`;
    },

    syncWithRegos: async function() {
        const btn = document.getElementById('hr-sync-btn');
        if (!btn) return;

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...`;

        try {
            const response = await fetch('/api/integration/regos/sync-employees', {
                method: 'POST'
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Xodimlar sinxronizatsiyasida xatolik yuz berdi.");
            }
            alert(data.message || "Xodimlar ro'yxati yangilandi.");
            this.render();
        } catch (e) {
            console.error("REGOS sync employees failed:", e);
            alert("Xatolik: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    setupEventListeners: function() {
        const searchInput = document.getElementById('hr-search');
        if (searchInput) {
            searchInput.oninput = () => {
                this.render();
            };
        }

        const hrForm = document.getElementById('add-employee-form');
        if (hrForm) {
            hrForm.onsubmit = (e) => {
                e.preventDefault();
                this.addEmployee();
            };
        }

        const editForm = document.getElementById('edit-employee-form');
        if (editForm) {
            editForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveEditedEmployee();
            };
        }

        const roleForm = document.getElementById('add-role-form');
        if (roleForm) {
            roleForm.onsubmit = (e) => {
                e.preventDefault();
                this.addRole();
            };
        }
    },

    render: async function() {
        const searchVal = document.getElementById('hr-search')?.value.toLowerCase() || '';
        const container = document.getElementById('hr-content');
        if (!container) return;

        // Supabase yoki keshdan xodimlarni yuklash
        const employees = await DB.getEmployees();
        
        // Fetch REGOS report for real-time sales & profit (current month cumulative)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);
        const endTimestamp = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime() / 1000);

        let reportData = null;
        try {
            const response = await fetch(`/api/integration/regos/sales-report?start_date=${startTimestamp}&end_date=${endTimestamp}`);
            if (response.ok) {
                reportData = await response.json();
            }
        } catch (e) {
            console.error("Failed to fetch REGOS sales report in HR:", e);
        }
        const employeeSalesMap = (reportData && reportData.employee_sales) || {};

        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const filtered = employees.filter(e => {
            const parsed = this.parseRoleAndPlan(e.role);
            return e.name.toLowerCase().includes(searchVal) || 
                   parsed.role.toLowerCase().includes(searchVal);
        });

        // Fetch active employee role to check permissions
        const activeUserId = localStorage.getItem('activeUserId') || 'admin';
        let activeRole = 'admin';
        try {
            if (activeUserId !== 'admin') {
                const employeesList = await DB.getEmployees();
                const currentEmp = employeesList.find(e => e.id === activeUserId);
                if (currentEmp) activeRole = (currentEmp.role || '').toLowerCase();
            }
        } catch (e) {
            console.error(e);
        }
        
        const isSupervisor = activeRole.includes('direktor') || activeRole.includes('admin') || activeRole.includes('dasturchi') || activeRole.includes('boshliq') || activeUserId === 'admin';
        const isHR = activeRole.includes('hr') || activeRole.includes('kadr') || activeRole.includes('recruiter');
        const canWriteHR = isSupervisor || isHR;

        let html = `
            <div class="hr-grid" style="margin-top: 24px;">
        `;

        if (filtered.length === 0) {
            html += `<div class="card" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 32px;">Xodimlar topilmadi.</div>`;
        } else {
            filtered.forEach(e => {
                // Name initials
                const initials = e.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                
                // Parse role name and plan
                const parsed = this.parseRoleAndPlan(e.role);
                const roleName = parsed.role;
                const plan = parsed.plan;

                // Match with REGOS daily sales & profit
                let empSales = 0;
                let empProfit = 0;
                let foundData = null;
                const salesList = Object.values(employeeSalesMap);
                
                if (e.login) {
                    foundData = salesList.find(s => (s.login || '').trim().toLowerCase() === e.login.trim().toLowerCase());
                }
                if (!foundData) {
                    foundData = salesList.find(s => (s.name || '').trim().toLowerCase() === e.name.trim().toLowerCase());
                }
                if (foundData) {
                    empSales = foundData.sales || 0;
                    empProfit = foundData.profit || 0;
                }

                // Plan achievement progress (KPI bar)
                const progress = plan > 0 ? Math.min(100, Math.round((empSales / plan) * 100)) : 0;
                
                // KPI bar color
                let kpiColor = 'var(--accent-gradient)';
                if (progress < 50) kpiColor = 'linear-gradient(135deg, #EF4444 0%, #F59E0B 100%)';
                else if (progress >= 100) kpiColor = 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)';

                // KPI Bonus and total salary calculations based on surplus sales profit
                const kpiPercent = e.kpi || 0;
                let kpiBonus = 0;
                if (plan > 0 && empSales >= plan) {
                    const surplusSales = empSales - plan;
                    const profitMargin = empSales > 0 ? (empProfit / empSales) : 0;
                    const surplusProfit = surplusSales * profitMargin;
                    kpiBonus = Math.round(surplusProfit * (kpiPercent / 100));
                }
                const totalSalary = (e.salary || 0) + kpiBonus;

                let progressBadge = '';
                if (plan > 0) {
                    if (empSales >= plan) {
                        progressBadge = `<span class="badge badge-success" style="font-size: 10px; font-weight: 600;">Reja bajarildi</span>`;
                    } else {
                        progressBadge = `<span class="badge badge-warning" style="font-size: 10px; font-weight: 600;">${progress}% bajarildi</span>`;
                    }
                } else {
                    progressBadge = `<span class="badge badge-secondary" style="font-size: 10px; font-weight: 600;">Reja yo'q</span>`;
                }

                html += `
                    <div class="card employee-card">
                        <div class="employee-header">
                            <div class="employee-avatar">${initials}</div>
                            <div class="employee-title">
                                <h4>${e.name}</h4>
                                <p>${roleName}</p>
                            </div>
                        </div>
                        
                        <div class="kpi-container">
                            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500; align-items: center; margin-bottom: 4px;">
                                <span style="color: var(--text-muted);">Oylik plan bajarilishi</span>
                                ${progressBadge}
                            </div>
                            <div class="kpi-bar-bg">
                                <div class="kpi-bar-fill" style="width: ${progress}%; background: ${kpiColor}"></div>
                            </div>
                        </div>

                        <div class="employee-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color);">
                            <div>
                                <span style="display:block; font-size:11px; color: var(--text-muted)">Maosh</span>
                                <strong style="color: var(--text-main)">${formatMoney(e.salary, currency)}</strong>
                            </div>
                            <div style="text-align: right;">
                                <span style="display:block; font-size:11px; color: var(--text-muted)">Oylik reja</span>
                                <strong style="color: var(--text-main)">${formatMoney(plan, currency)}</strong>
                            </div>
                            
                            <div>
                                <span style="display:block; font-size:11px; color: var(--text-muted)">Oylik savdo:</span>
                                <strong style="color: var(--text-main); font-family: 'JetBrains Mono';">${formatMoney(empSales, currency)}</strong>
                            </div>
                            <div style="text-align: right;">
                                <span style="display:block; font-size:11px; color: var(--text-muted)">Oylik sof foyda:</span>
                                <strong style="color: var(--success); font-family: 'JetBrains Mono';">${formatMoney(empProfit, currency)}</strong>
                            </div>

                            <div style="grid-column: span 2; border-top: 1px dashed var(--border-color); padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size:12px; color: var(--text-muted)">KPI Bonus (${kpiPercent}%):</span>
                                <strong style="color: ${kpiBonus > 0 ? 'var(--success)' : 'var(--text-muted)'}; font-family: 'JetBrains Mono'; font-size: 14px;">${formatMoney(kpiBonus, currency)}</strong>
                            </div>
                            
                            <div style="grid-column: span 2; border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size:13px; font-weight: bold; color: var(--text-main)">Jami hisoblangan:</span>
                                <strong style="color: var(--accent); font-family: 'JetBrains Mono'; font-size: 16px;">${formatMoney(totalSalary, currency)}</strong>
                            </div>
                        </div>

                        ${canWriteHR ? `
                        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
                            <button class="btn btn-secondary btn-sm" onclick="HR.openEditModal('${e.id}')"><i class="fas fa-cog"></i> Sozlash</button>
                            <button class="btn btn-secondary btn-sm" onclick="HR.deleteEmployee('${e.id}')"><i class="fas fa-trash-alt" style="color: var(--danger)"></i> O'chirish</button>
                        </div>
                        ` : ''}
                    </div>
                `;
            });
        }

        html += `
            </div>
        `;

        container.innerHTML = html;
    },

    addEmployee: async function() {
        const name = document.getElementById('emp-name').value;
        const roleVal = document.getElementById('emp-role').value;
        const salary = parseFloat(document.getElementById('emp-salary').value) || 0;
        const plan = parseFloat(document.getElementById('emp-sales-plan').value) || 0;
        const kpi = parseInt(document.getElementById('emp-kpi').value) || 0;
        const loginVal = document.getElementById('emp-login').value.trim();
        const passwordVal = document.getElementById('emp-password').value.trim();

        if (!name || !roleVal || salary <= 0) {
            alert('Iltimos, ism, lavozim va maoshni to\'liq kiriting!');
            return;
        }

        const serializedRole = this.serializeRoleAndPlan(roleVal, plan);

        const newEmployee = {
            id: 'e_' + Date.now(),
            name,
            role: serializedRole,
            salary,
            kpi: Math.min(100, Math.max(0, kpi)),
            status: 'active',
            login: loginVal || null,
            password: passwordVal || null
        };

        try {
            await DB.saveEmployee(newEmployee);

            // Formani tozalash va modal yopish
            document.getElementById('add-employee-form').reset();
            closeModal('employee-modal');

            await this.render();
        } catch (err) {
            console.error("Xodimni saqlashda xatolik:", err);
            const errStr = err.message || "";
            if (errStr.includes("column") || errStr.includes("login") || errStr.includes("password") || errStr.includes("400") || errStr.toLowerCase().includes("bad request") || errStr.includes("does not exist")) {
                alert("Xatolik: Supabase bazasida 'login' va 'password' ustunlari topilmadi!\n\nIltimos, Supabase Dashboard SQL Editor oynasida quyidagi SQL so'rovni ishga tushiring:\n\nALTER TABLE public.employees ADD COLUMN IF NOT EXISTS login TEXT UNIQUE;\nALTER TABLE public.employees ADD COLUMN IF NOT EXISTS password TEXT;");
            } else {
                alert("Xodimni saqlashda xatolik yuz berdi: " + errStr);
            }
        }
    },

    openEditModal: async function(id) {
        try {
            const employees = await DB.getEmployees();
            const e = employees.find(emp => emp.id === id);
            if (!e) {
                alert('Xodim topilmadi!');
                return;
            }

            const parsed = this.parseRoleAndPlan(e.role);

            document.getElementById('edit-emp-id').value = e.id;
            document.getElementById('edit-emp-name').value = e.name;
            
            // Populate select first
            this.updateRoleSelects();
            
            // Check legacy custom role
            const editEmpRoleSelect = document.getElementById('edit-emp-role');
            if (editEmpRoleSelect && parsed.role) {
                let hasRoleOption = false;
                for (let i = 0; i < editEmpRoleSelect.options.length; i++) {
                    if (editEmpRoleSelect.options[i].value === parsed.role) {
                        hasRoleOption = true;
                        break;
                    }
                }
                if (!hasRoleOption) {
                    const opt = document.createElement('option');
                    opt.value = parsed.role;
                    opt.innerHTML = parsed.role + " (Eski/Maxsus)";
                    editEmpRoleSelect.appendChild(opt);
                }
            }

            document.getElementById('edit-emp-role').value = parsed.role;
            document.getElementById('edit-emp-salary').value = e.salary;
            document.getElementById('edit-emp-sales-plan').value = parsed.plan;
            document.getElementById('edit-emp-kpi').value = e.kpi;
            document.getElementById('edit-emp-login').value = e.login || '';
            document.getElementById('edit-emp-password').value = e.password || '';

            showModal('edit-employee-modal');
        } catch (err) {
            console.error("Xodim tahrirlash oynasini ochishda xatolik:", err);
            alert("Xatolik yuz berdi: " + err.message);
        }
    },

    saveEditedEmployee: async function() {
        const id = document.getElementById('edit-emp-id').value;
        const name = document.getElementById('edit-emp-name').value;
        const roleVal = document.getElementById('edit-emp-role').value;
        const salary = parseFloat(document.getElementById('edit-emp-salary').value) || 0;
        const plan = parseFloat(document.getElementById('edit-emp-sales-plan').value) || 0;
        const kpi = parseInt(document.getElementById('edit-emp-kpi').value) || 0;
        const loginVal = document.getElementById('edit-emp-login').value.trim();
        const passwordVal = document.getElementById('edit-emp-password').value.trim();

        if (!name || !roleVal || salary <= 0) {
            alert('Iltimos, ism, lavozim va maoshni to\'liq kiriting!');
            return;
        }

        const serializedRole = this.serializeRoleAndPlan(roleVal, plan);

        const updatedEmployee = {
            id,
            name,
            role: serializedRole,
            salary,
            kpi: Math.min(100, Math.max(0, kpi)),
            status: 'active',
            login: loginVal || null,
            password: passwordVal || null
        };

        try {
            await DB.saveEmployee(updatedEmployee);
            document.getElementById('edit-employee-form').reset();
            closeModal('edit-employee-modal');
            await this.render();
        } catch (err) {
            console.error("Xodimni saqlashda xatolik:", err);
            alert("Xodimni saqlashda xatolik yuz berdi: " + err.message);
        }
    },

    deleteEmployee: async function(id) {
        if (!confirm('Xodimni o\'chirishni tasdiqlaysizmi?')) return;

        try {
            await DB.deleteEmployee(id);

            // If currently logged in user is deleted, force logout
            const activeUserId = localStorage.getItem('activeUserId');
            if (activeUserId === id && window.App && typeof window.App.logout === 'function') {
                window.App.logout();
                return;
            }

            await this.render();
        } catch (err) {
            console.error("Xodimni o'chirishda xatolik:", err);
            alert("Xodimni o'chirishda xatolik yuz berdi: " + err.message);
        }
    },

    updateRoleSelects: function() {
        const data = AppStorage.load();
        const roles = data.settings.roles || ["Sotuvchi", "Omborchi", "Operator", "Kassir", "Direktor"];
        
        const empRoleSelect = document.getElementById('emp-role');
        const editEmpRoleSelect = document.getElementById('edit-emp-role');
        
        let optionsHtml = '';
        roles.forEach(role => {
            optionsHtml += `<option value="${role}">${role}</option>`;
        });
        
        if (empRoleSelect) {
            empRoleSelect.innerHTML = optionsHtml;
        }
        if (editEmpRoleSelect) {
            editEmpRoleSelect.innerHTML = optionsHtml;
        }
    },

    openRolesModal: function() {
        this.renderRolesList();
        showModal('hr-roles-modal');
    },

    renderRolesList: function() {
        const data = AppStorage.load();
        const roles = data.settings.roles || ["Sotuvchi", "Omborchi", "Operator", "Kassir", "Direktor"];
        const container = document.getElementById('roles-list-container');
        if (!container) return;
        
        let html = '';
        if (roles.length === 0) {
            html = `<div style="text-align: center; color: var(--text-muted); padding: 8px; font-size: 13px;">Lavozimlar mavjud emas.</div>`;
        } else {
            roles.forEach(role => {
                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 6px;">
                        <span style="font-size: 14px; font-weight: 500; color: var(--text-main);">${role}</span>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="HR.deleteRole('${role.replace(/'/g, "\\'")}')" style="padding: 4px 8px; min-width: auto; height: auto;">
                            <i class="fas fa-trash-alt" style="color: var(--danger); font-size: 12px;"></i>
                        </button>
                    </div>
                `;
            });
        }
        container.innerHTML = html;
    },

    addRole: function() {
        const input = document.getElementById('new-role-name');
        if (!input) return;
        
        const roleName = input.value.trim();
        if (!roleName) return;
        
        const data = AppStorage.load();
        data.settings.roles = data.settings.roles || ["Sotuvchi", "Omborchi", "Operator", "Kassir", "Direktor"];
        
        if (data.settings.roles.some(r => r.toLowerCase() === roleName.toLowerCase())) {
            alert("Ushbu lavozim allaqachon mavjud!");
            return;
        }
        
        data.settings.roles.push(roleName);
        AppStorage.save(data);
        
        input.value = '';
        this.renderRolesList();
        this.updateRoleSelects();
        
        if (window.App && typeof window.App.syncSettingsToBackend === 'function') {
            window.App.syncSettingsToBackend();
        }
    },

    deleteRole: async function(roleName) {
        if (!confirm(`"${roleName}" lavozimini o'chirib tashlamoqchimisiz?`)) return;
        
        const employees = await DB.getEmployees();
        const isUsed = employees.some(e => {
            const parsed = this.parseRoleAndPlan(e.role);
            return parsed.role.toLowerCase() === roleName.toLowerCase();
        });
        
        if (isUsed) {
            alert("Ushbu lavozimni o'chirib bo'lmaydi, chunki bu lavozimda ishlayotgan xodimlar mavjud!");
            return;
        }
        
        const data = AppStorage.load();
        data.settings.roles = (data.settings.roles || ["Sotuvchi", "Omborchi", "Operator", "Kassir", "Direktor"]).filter(r => r !== roleName);
        AppStorage.save(data);
        
        this.renderRolesList();
        this.updateRoleSelects();
        
        if (window.App && typeof window.App.syncSettingsToBackend === 'function') {
            window.App.syncSettingsToBackend();
        }
    }
};
