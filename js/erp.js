// ERP & CRM Tizimi - ERP Moduli (Omborxona va HR) - SUPABASE ULANISHI BILAN

window.ERP = {
    activeSubSection: 'inventory', // 'inventory' yoki 'hr'
    inventoryPage: 1,
    inventoryPageSize: 100,

    init: function() {
        this.render();
        this.setupEventListeners();
    },

    setupEventListeners: function() {
        const invSubTabBtn = document.getElementById('erp-subtab-inventory');
        const hrSubTabBtn = document.getElementById('erp-subtab-hr');

        if (invSubTabBtn && hrSubTabBtn) {
            invSubTabBtn.onclick = () => {
                this.activeSubSection = 'inventory';
                this.inventoryPage = 1;
                invSubTabBtn.classList.add('btn-primary');
                invSubTabBtn.classList.remove('btn-secondary');
                hrSubTabBtn.classList.add('btn-secondary');
                hrSubTabBtn.classList.remove('btn-primary');
                this.render();
            };

            hrSubTabBtn.onclick = () => {
                this.activeSubSection = 'hr';
                this.inventoryPage = 1;
                hrSubTabBtn.classList.add('btn-primary');
                hrSubTabBtn.classList.remove('btn-secondary');
                invSubTabBtn.classList.add('btn-secondary');
                invSubTabBtn.classList.remove('btn-primary');
                this.render();
            };
        }

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

        const hrForm = document.getElementById('add-employee-form');
        if (hrForm) {
            hrForm.onsubmit = (e) => {
                e.preventDefault();
                this.addEmployee();
            };
        }
    },

    render: async function() {
        const searchVal = document.getElementById('erp-search')?.value.toLowerCase() || '';
        const container = document.getElementById('erp-content');
        if (!container) return;

        if (this.activeSubSection === 'inventory') {
            document.getElementById('erp-add-product-btn').style.display = 'inline-flex';
            const regosBtn = document.getElementById('erp-sync-regos-btn');
            if (regosBtn) regosBtn.style.display = 'inline-flex';
            document.getElementById('erp-add-employee-btn').style.display = 'none';
            await this.renderInventory(container, searchVal);
        } else {
            document.getElementById('erp-add-product-btn').style.display = 'none';
            const regosBtn = document.getElementById('erp-sync-regos-btn');
            if (regosBtn) regosBtn.style.display = 'none';
            document.getElementById('erp-add-employee-btn').style.display = 'inline-flex';
            await this.renderHR(container, searchVal);
        }
    },

    renderInventory: async function(container, searchVal) {
        // Supabase yoki keshdan ombor ma'lumotlarini yuklash
        const inventory = await DB.getInventory();
        
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const filtered = inventory.filter(p => 
            p.name.toLowerCase().includes(searchVal) || 
            p.sku.toLowerCase().includes(searchVal) || 
            p.category.toLowerCase().includes(searchVal)
        );

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
        const canWriteInventory = isSupervisor || isWarehouse;

        let html = `
            <div class="stats-grid" style="margin-top: 16px;">
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Jami Mahsulot turlari</h3>
                        <div class="stat-value">${totalProducts} ta</div>
                    </div>
                    <div class="stat-icon-box info"><i class="fas fa-boxes"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Ombor Qiymati</h3>
                        <div class="stat-value" style="color: var(--success);">${formatMoney(totalStockValuation, currency)}</div>
                    </div>
                    <div class="stat-icon-box income"><i class="fas fa-coins"></i></div>
                </div>
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

    renderHR: async function(container, searchVal) {
        // Supabase yoki keshdan xodimlarni yuklash
        const employees = await DB.getEmployees();
        
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const filtered = employees.filter(e => 
            e.name.toLowerCase().includes(searchVal) || 
            e.role.toLowerCase().includes(searchVal)
        );

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
                
                // KPI bar rangini hisoblash
                let kpiColor = 'var(--accent-gradient)';
                if (e.kpi < 50) kpiColor = 'linear-gradient(135deg, #EF4444 0%, #F59E0B 100%)';
                else if (e.kpi >= 90) kpiColor = 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)';

                html += `
                    <div class="card employee-card">
                        <div class="employee-header">
                            <div class="employee-avatar">${initials}</div>
                            <div class="employee-title">
                                <h4>${e.name}</h4>
                                <p>${e.role}</p>
                            </div>
                        </div>
                        
                        <div class="kpi-container">
                            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 500;">
                                <span style="color: var(--text-muted);">Samaradorlik (KPI)</span>
                                <span style="color: var(--text-main); font-family: 'JetBrains Mono';">${e.kpi}%</span>
                            </div>
                            <div class="kpi-bar-bg">
                                <div class="kpi-bar-fill" style="width: ${e.kpi}%; background: ${kpiColor}"></div>
                            </div>
                        </div>

                        <div class="employee-stats">
                            <div>
                                <span style="display:block; font-size:11px; color: var(--text-muted)">Maosh</span>
                                <strong style="color: var(--text-main)">${formatMoney(e.salary, currency)}</strong>
                            </div>
                            <div style="text-align: right;">
                                <span style="display:block; font-size:11px; color: var(--text-muted)">Holati</span>
                                <span class="badge badge-success">Faol</span>
                            </div>
                        </div>

                        ${canWriteHR ? `
                        <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
                            <button class="btn btn-secondary btn-sm" onclick="ERP.updateKPI('${e.id}')"><i class="fas fa-chart-line"></i> KPI</button>
                            <button class="btn btn-secondary btn-sm" onclick="ERP.deleteEmployee('${e.id}')"><i class="fas fa-trash-alt" style="color: var(--danger)"></i> O'chirish</button>
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

    addEmployee: async function() {
        const name = document.getElementById('emp-name').value;
        const role = document.getElementById('emp-role').value;
        const salary = parseFloat(document.getElementById('emp-salary').value) || 0;
        const kpi = parseInt(document.getElementById('emp-kpi').value) || 100;
        const loginVal = document.getElementById('emp-login').value.trim();
        const passwordVal = document.getElementById('emp-password').value.trim();

        if (!name || !role || salary <= 0) {
            alert('Iltimos, ism, lavozim va maoshni to\'liq kiriting!');
            return;
        }

        const newEmployee = {
            id: 'e_' + Date.now(),
            name,
            role,
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

    updateKPI: async function(id) {
        const newKpiStr = prompt('Yangi KPI qiymatini kiriting (0 - 100):');
        if (newKpiStr === null) return;

        const newKpi = parseInt(newKpiStr);
        if (isNaN(newKpi) || newKpi < 0 || newKpi > 100) {
            alert('Noto\'g\'ri KPI kiritildi. Qiymat 0 va 100 orasida bo\'lishi shart.');
            return;
        }

        try {
            const employees = await DB.getEmployees();
            const employee = employees.find(e => e.id === id);
            if (employee) {
                employee.kpi = newKpi;
                await DB.saveEmployee(employee);
                await this.render();
            }
        } catch (err) {
            console.error("KPI yangilashda xatolik:", err);
            alert("KPI qiymatini saqlashda xatolik yuz berdi: " + err.message);
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
