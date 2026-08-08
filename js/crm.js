// ERP & CRM Tizimi - CRM Moduli (Mijozlar, Sotuvlar va Qo'ng'iroqlar) - SUPABASE & TELEFONIYA BILAN

window.CRM = {
    activeTab: 'kanban', // 'kanban', 'list', 'calls' yoki 'products'
    pollingInterval: null,
    isDragging: false,

    init: function() {
        this.render();
        this.setupEventListeners();

        // Har 5 soniyada yangi mijozlar/leadlarni yangilab turish (Drag paytida to'xtatiladi)
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        this.pollingInterval = setInterval(() => {
            if (window.App.currentView === 'crm' && !this.isDragging && this.activeTab !== 'calls' && this.activeTab !== 'products') {
                this.render();
            }
        }, 5000);
    },

    setupEventListeners: function() {
        // Tablarni almashtirish
        const kanbanTabBtn = document.getElementById('crm-tab-kanban');
        const listTabBtn = document.getElementById('crm-tab-list');
        const callsTabBtn = document.getElementById('crm-tab-calls');
        const productsTabBtn = document.getElementById('crm-tab-products');
        
        if (kanbanTabBtn) {
            kanbanTabBtn.onclick = () => {
                this.activeTab = 'kanban';
                this.updateTabButtons('crm-tab-kanban');
                this.render();
            };
        }
        if (listTabBtn) {
            listTabBtn.onclick = () => {
                this.activeTab = 'list';
                this.updateTabButtons('crm-tab-list');
                this.render();
            };
        }
        if (callsTabBtn) {
            callsTabBtn.onclick = () => {
                this.activeTab = 'calls';
                this.updateTabButtons('crm-tab-calls');
                this.render();
            };
        }
        if (productsTabBtn) {
            productsTabBtn.onclick = () => {
                this.activeTab = 'products';
                this.updateTabButtons('crm-tab-products');
                this.render();
            };
        }

        // Qidiruv tizimi
        const searchInput = document.getElementById('crm-search');
        if (searchInput) {
            searchInput.oninput = () => this.render();
        }

        // Operator bo'yicha filter
        const operatorFilter = document.getElementById('crm-operator-filter');
        if (operatorFilter) {
            operatorFilter.onchange = () => this.render();
        }

        // Kategoriya bo'yicha filter
        const categoryFilter = document.getElementById('crm-category-filter');
        if (categoryFilter) {
            categoryFilter.onchange = () => this.render();
        }

        // Yangi mijoz qo'shish formasi yuborilishi
        const form = document.getElementById('add-customer-form');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                this.addCustomer();
            };
        }

        // Tahrirlash formasi yuborilishi
        const editForm = document.getElementById('edit-customer-form');
        if (editForm) {
            editForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveEditedCustomer();
            };
        }

        // Tahrirlash mahsulot formasi yuborilishi
        const editProductForm = document.getElementById('edit-product-form');
        if (editProductForm) {
            editProductForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveEditedProduct();
            };
        }
    },

    updateTabButtons: function(activeBtnOrId) {
        const activeId = typeof activeBtnOrId === 'string' ? activeBtnOrId : activeBtnOrId.id;
        const tabIds = ['crm-tab-kanban', 'crm-tab-list', 'crm-tab-calls', 'crm-tab-products'];
        tabIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                if (id === activeId) {
                    btn.classList.add('btn-primary');
                    btn.classList.remove('btn-secondary');
                } else {
                    btn.classList.add('btn-secondary');
                    btn.classList.remove('btn-primary');
                }
            }
        });
    },

    render: async function() {
        const searchVal = document.getElementById('crm-search')?.value.toLowerCase() || '';
        const container = document.getElementById('crm-content');
        if (!container) return;

        if (this.activeTab === 'calls') {
            // Qo'ng'iroqlar bo'limida qidiruv panelini yashiramiz/o'zgartiramiz
            document.getElementById('crm-search').placeholder = "Qo'ng'iroq raqami bo'yicha qidirish...";
            container.innerHTML = '<div id="calls-logs-content"></div>';
            window.Telephony.renderCallLogsTab();
            return;
        }

        if (this.activeTab === 'products') {
            document.getElementById('crm-search').placeholder = "Mahsulot nomi yoki SKU bo'yicha qidirish...";
        } else {
            document.getElementById('crm-search').placeholder = "Mijoz ismi, telefon yoki operator bo'yicha qidirish...";
        }

        // Supabase yoki keshdan mijozlarni olamiz
        const customers = await DB.getCustomers();
        const settings = AppStorage.load().settings || {};
        const amocrmMap = settings.amocrmOperatorsMap || {};
        const inventory = await DB.getInventory();
        
        // Xodimlar ro'yxatini olib, ID-larni ismlarga o'giramiz
        let employeeIdToName = {};
        const activeUserId = localStorage.getItem('activeUserId') || 'admin';
        const activeUserRole = localStorage.getItem('activeUserRole') || 'admin';
        const isAdmin = activeUserId === 'admin' || activeUserRole === 'admin' || activeUserRole === 'superadmin';
        let loggedInEmployeeName = '';
        
        try {
            const employeesList = await DB.getEmployees();
            employeesList.forEach(e => {
                employeeIdToName[e.id] = e.name;
                if (String(e.id) === String(activeUserId)) {
                    loggedInEmployeeName = e.name;
                }
            });
        } catch (e) {
            console.error("Failed to load employees for operator mapping:", e);
        }

        // Display/hide the filter dropdown based on whether user is admin and active tab
        const operatorFilterContainer = document.getElementById('crm-operator-filter-container');
        const categoryFilterContainer = document.getElementById('crm-category-filter-container');
        
        if (this.activeTab === 'products') {
            if (operatorFilterContainer) operatorFilterContainer.style.setProperty('display', 'none', 'important');
            if (categoryFilterContainer) categoryFilterContainer.style.setProperty('display', 'block', 'important');
        } else {
            if (categoryFilterContainer) categoryFilterContainer.style.setProperty('display', 'none', 'important');
            if (operatorFilterContainer) {
                if (isAdmin) {
                    operatorFilterContainer.style.setProperty('display', 'block', 'important');
                } else {
                    operatorFilterContainer.style.setProperty('display', 'none', 'important');
                }
            }
        }

        // Har bir mijoz uchun operatorni biriktirish/tarjima qilish
        customers.forEach(c => {
            c.displayOperator = c.operator || '';
            if (c.operator && amocrmMap[c.operator]) {
                const mappedEmpId = amocrmMap[c.operator];
                if (employeeIdToName[mappedEmpId]) {
                    c.displayOperator = employeeIdToName[mappedEmpId];
                }
            }
        });
        
        // Operatorlar ro'yxatini shakllantirish va dropdownni to'ldirish
        const operators = [...new Set(customers.map(c => c.displayOperator).filter(Boolean))].sort();
        const operatorFilterSelect = document.getElementById('crm-operator-filter');
        if (operatorFilterSelect) {
            const currentSelected = operatorFilterSelect.value;
            operatorFilterSelect.innerHTML = '<option value="">Barcha operatorlar</option>';
            operators.forEach(op => {
                const opt = document.createElement('option');
                opt.value = op;
                opt.textContent = op;
                if (op === currentSelected) {
                    opt.selected = true;
                }
                operatorFilterSelect.appendChild(opt);
            });
        }

        // Kategoriya bo'yicha filterlarni yuklash
        const categories = [...new Set(inventory.map(p => p.category).filter(Boolean))].sort();
        const categoryFilterSelect = document.getElementById('crm-category-filter');
        if (categoryFilterSelect) {
            const currentSelected = categoryFilterSelect.value;
            categoryFilterSelect.innerHTML = '<option value="">Barcha toifalar</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                if (cat === currentSelected) {
                    opt.selected = true;
                }
                categoryFilterSelect.appendChild(opt);
            });
        }
        
        const selectedOperator = operatorFilterSelect ? operatorFilterSelect.value : '';
        const selectedCategory = categoryFilterSelect ? categoryFilterSelect.value : '';
        
        // Qidiruv bo'yicha filtrlaymiz (Lotin va Kirill transkripsiyasi bilan)
        const searchValNorm = window.normalizeUzbek ? window.normalizeUzbek(searchVal) : searchVal.toLowerCase();
        
        if (this.activeTab === 'products') {
            const manualInventory = inventory.filter(p => p && p.id && (p.id.startsWith('p_') || (p.id.startsWith('i_') && !p.id.startsWith('i_regos_'))));
            const filteredProducts = manualInventory.filter(p => {
                if (selectedCategory && p.category !== selectedCategory) {
                    return false;
                }
                const nameNorm = window.normalizeUzbek ? window.normalizeUzbek(p.name) : p.name.toLowerCase();
                const skuNorm = p.sku ? (window.normalizeUzbek ? window.normalizeUzbek(p.sku) : p.sku.toLowerCase()) : '';
                const catNorm = p.category ? (window.normalizeUzbek ? window.normalizeUzbek(p.category) : p.category.toLowerCase()) : '';
                return nameNorm.includes(searchValNorm) || 
                       skuNorm.includes(searchValNorm) || 
                       catNorm.includes(searchValNorm);
            });
            container.innerHTML = this.renderProducts(filteredProducts);
            return;
        }

        const filteredCustomers = customers.filter(c => {
            // Operator bo'yicha filter
            if (!isAdmin) {
                // Xodim faqat o'ziga biriktirilgan sdelkalarni ko'radi
                if (loggedInEmployeeName && c.displayOperator !== loggedInEmployeeName) {
                    return false;
                }
            } else {
                // Admin tanlangan operator bo'yicha filtrlaydi
                if (selectedOperator && c.displayOperator !== selectedOperator) {
                    return false;
                }
            }
            
            const nameNorm = window.normalizeUzbek ? window.normalizeUzbek(c.name) : c.name.toLowerCase();
            const operatorNorm = c.displayOperator ? (window.normalizeUzbek ? window.normalizeUzbek(c.displayOperator) : c.displayOperator.toLowerCase()) : '';
            return nameNorm.includes(searchValNorm) || 
                   (c.phone && c.phone.includes(searchVal)) ||
                   (c.phone2 && c.phone2.includes(searchVal)) ||
                   operatorNorm.includes(searchValNorm);
        });

        if (this.activeTab === 'kanban') {
            container.innerHTML = this.renderKanban(filteredCustomers);
            this.setupDragAndDrop();
        } else if (this.activeTab === 'list') {
            container.innerHTML = this.renderList(filteredCustomers);
        }
    },

    renderKanban: function(customers) {
        const columns = {
            lead: { title: 'Yangi (Leads)', icon: 'fa-user-plus', color: 'var(--info)', items: [] },
            contacted: { title: 'Muzokarada', icon: 'fa-comments', color: 'var(--warning)', items: [] },
            proposal: { title: 'Taklif yuborilgan', icon: 'fa-file-invoice-dollar', color: 'var(--accent)', items: [] },
            won: { title: 'Muvaffaqiyatli', icon: 'fa-check-double', color: 'var(--success)', items: [] }
        };

        // Mijozlarni ustunlarga bo'lamiz
        customers.forEach(c => {
            if (columns[c.status]) {
                columns[c.status].items.push(c);
            }
        });

        const currency = AppStorage.load().settings.currency;

        let html = `<div class="kanban-board">`;
        for (const [key, col] of Object.entries(columns)) {
            html += `
                <div class="kanban-column" data-status="${key}">
                    <div class="kanban-header">
                        <h3><i class="fas ${col.icon}" style="color: ${col.color}"></i> ${col.title}</h3>
                        <span class="kanban-count">${col.items.length}</span>
                    </div>
                    <div class="kanban-cards" data-status="${key}">
            `;

            if (col.items.length === 0) {
                html += `<div class="kanban-empty-hint" style="text-align:center; padding: 24px; color: var(--text-muted); font-size: 13px; border: 1px dashed var(--border-color); border-radius: 12px;">Mijoz yo'q</div>`;
            } else {
                col.items.forEach(c => {
                    let sourceBadge = '';
                    if (c.source === 'telegram') {
                        sourceBadge = `<span class="badge clickable-badge" style="background:#0088cc; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; font-weight: 500;" onclick="event.stopPropagation(); CRM.openChat('${c.id}', '${c.source}', '${c.name.replace(/'/g, "\\'")}')" title="Xabarlarni ochish"><i class="fab fa-telegram"></i> Telegram</span>`;
                    } else if (c.source === 'instagram') {
                        sourceBadge = `<span class="badge clickable-badge" style="background:#E1306C; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; font-weight: 500;" onclick="event.stopPropagation(); CRM.openChat('${c.id}', '${c.source}', '${c.name.replace(/'/g, "\\'")}')" title="Xabarlarni ochish"><i class="fab fa-instagram"></i> Instagram</span>`;
                    } else if (c.source === 'telephony') {
                        sourceBadge = `<span class="badge" style="background:#10B981; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; font-weight: 500;"><i class="fas fa-phone-alt"></i> Telefon</span>`;
                    } else {
                        sourceBadge = `<span class="badge" style="background:#6B7280; color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; font-weight: 500;"><i class="fas fa-user"></i> Qo'lda</span>`;
                    }

                    let operatorHtml = c.displayOperator 
                        ? `<span style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:4px;" title="Mas'ul operator"><i class="fas fa-user-tie" style="color:var(--accent);"></i> ${c.displayOperator}</span>` 
                        : `<span style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:4px; opacity:0.6;"><i class="fas fa-user-tie"></i> Biriktirilmagan</span>`;

                    html += `
                        <div class="kanban-card" draggable="true" data-id="${c.id}" onclick="CRM.openCustomerDetails('${c.id}', event)">
                            <h4 style="margin-bottom: 6px;">${c.name}</h4>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:8px; flex-wrap: wrap;">
                                ${sourceBadge}
                                ${operatorHtml}
                            </div>
                            <div class="kanban-card-footer" style="flex-direction:column; align-items:flex-start; gap:6px;">
                                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                    <span style="color: var(--text-muted); font-size:12px; cursor: pointer; font-weight: 500;" onclick="event.stopPropagation(); Telephony.dial('${c.phone}')" title="Asosiy raqamga qo'ng'iroq qilish"><i class="fas fa-phone-alt" style="color: var(--success); margin-right: 4px;"></i> ${c.phone}</span>
                                    <span style="color: var(--success); font-weight:600;">${formatMoney(c.value, currency)}</span>
                                </div>
                                ${c.phone2 ? `
                                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                                    <span style="color: var(--text-muted); font-size:12px; cursor: pointer; font-weight: 500;" onclick="event.stopPropagation(); Telephony.dial('${c.phone2}')" title="Qo'shimcha raqamga qo'ng'iroq qilish"><i class="fas fa-phone-alt" style="color: var(--warning); margin-right: 4px;"></i> ${c.phone2}</span>
                                </div>` : ''}
                            </div>
                            <div class="kanban-actions" style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 8px;" onclick="event.stopPropagation()">
                                <select class="form-control" style="width: auto; padding: 2px 6px; font-size: 11px; height: auto;" onchange="CRM.changeStatus('${c.id}', this.value)">
                                    <option value="lead" ${c.status === 'lead' ? 'selected' : ''}>Yangi</option>
                                    <option value="contacted" ${c.status === 'contacted' ? 'selected' : ''}>Muzokarada</option>
                                    <option value="proposal" ${c.status === 'proposal' ? 'selected' : ''}>Taklif</option>
                                    <option value="won" ${c.status === 'won' ? 'selected' : ''}>Yutildi</option>
                                    <option value="lost" ${c.status === 'lost' ? 'selected' : ''}>Yo'qotildi</option>
                                </select>
                                <div style="display:flex; gap: 4px;">
                                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px;" onclick="event.stopPropagation(); Telephony.dial('${c.phone}')" title="Qo'ng'iroq"><i class="fas fa-phone-alt" style="color: var(--success)"></i></button>
                                    <button class="btn btn-secondary btn-sm" style="padding: 2px 8px;" onclick="event.stopPropagation(); CRM.deleteCustomer('${c.id}')"><i class="fas fa-trash-alt" style="color: var(--danger)"></i></button>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;
        }
        html += `</div>`;
        return html;
    },

    renderList: function(customers) {
        const currency = AppStorage.load().settings.currency;
        
        let html = `
            <div class="card" style="margin-top: 24px;">
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Mijoz ismi</th>
                                <th>Telefon raqamlari</th>
                                <th>Lid Manbasi</th>
                                <th>Mas'ul Operator</th>
                                <th>Bitim qiymati</th>
                                <th>Status</th>
                                <th style="text-align: right;">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (customers.length === 0) {
            html += `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">Mijozlar topilmadi.</td></tr>`;
        } else {
            customers.forEach(c => {
                let badgeClass = 'badge-info';
                let statusName = 'Yangi';
                
                if (c.status === 'contacted') { badgeClass = 'badge-warning'; statusName = 'Muzokarada'; }
                else if (c.status === 'proposal') { badgeClass = 'badge-primary'; statusName = 'Taklif'; }
                else if (c.status === 'won') { badgeClass = 'badge-success'; statusName = 'Yutildi'; }
                else if (c.status === 'lost') { badgeClass = 'badge-danger'; statusName = 'Boy berildi'; }

                let sourceBadge = '';
                if (c.source === 'telegram') {
                    sourceBadge = `<span class="badge clickable-badge" style="background:#0088cc; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;" onclick="event.stopPropagation(); CRM.openChat('${c.id}', '${c.source}', '${c.name.replace(/'/g, "\\'")}')" title="Xabarlarni ochish"><i class="fab fa-telegram"></i> Telegram</span>`;
                } else if (c.source === 'instagram') {
                    sourceBadge = `<span class="badge clickable-badge" style="background:#E1306C; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;" onclick="event.stopPropagation(); CRM.openChat('${c.id}', '${c.source}', '${c.name.replace(/'/g, "\\'")}')" title="Xabarlarni ochish"><i class="fab fa-instagram"></i> Instagram</span>`;
                } else if (c.source === 'telephony') {
                    sourceBadge = `<span class="badge" style="background:#10B981; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;"><i class="fas fa-phone-alt"></i> Telefon</span>`;
                } else {
                    sourceBadge = `<span class="badge" style="background:#6B7280; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;"><i class="fas fa-user"></i> Qo'lda</span>`;
                }

                let phonesHtml = `
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <a href="javascript:void(0)" onclick="Telephony.dial('${c.phone}')" style="color: var(--text-main); text-decoration: none; font-weight: 500;" title="Asosiy raqamga qo'ng'iroq qilish">
                            <i class="fas fa-phone-alt" style="color: var(--success); margin-right: 6px;"></i> ${c.phone}
                        </a>
                `;
                if (c.phone2) {
                    phonesHtml += `
                        <a href="javascript:void(0)" onclick="Telephony.dial('${c.phone2}')" style="color: var(--text-muted); text-decoration: none; font-size: 12px; font-weight: 500;" title="Qo'shimcha raqamga qo'ng'iroq qilish">
                            <i class="fas fa-phone-alt" style="color: var(--warning); margin-right: 6px;"></i> ${c.phone2}
                        </a>
                    `;
                }
                phonesHtml += `</div>`;

                html += `
                    <tr>
                        <td><strong><a href="javascript:void(0)" onclick="CRM.openCustomerDetails('${c.id}', event)" style="color: var(--accent); font-weight:600; text-decoration:none;">${c.name}</a></strong></td>
                        <td>${phonesHtml}</td>
                        <td>${sourceBadge}</td>
                        <td>${c.displayOperator ? `<span style="font-weight:500;"><i class="fas fa-user-tie" style="color: var(--accent); margin-right: 4px;"></i> ${c.displayOperator}</span>` : '<span style="color:var(--text-muted); font-style:italic;">-</span>'}</td>
                        <td><span style="color: var(--success); font-weight: 500;">${formatMoney(c.value, currency)}</span></td>
                        <td><span class="badge ${badgeClass}">${statusName}</span></td>
                        <td style="text-align: right; display:flex; justify-content: flex-end; gap:8px;">
                            <button class="btn btn-secondary btn-sm" onclick="Telephony.dial('${c.phone}')"><i class="fas fa-phone-alt" style="color: var(--success)"></i></button>
                            <button class="btn btn-secondary btn-sm" onclick="CRM.deleteCustomer('${c.id}')"><i class="fas fa-trash-alt" style="color: var(--danger)"></i></button>
                        </td>
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
        return html;
    },

    setupDragAndDrop: function() {
        const cards = document.querySelectorAll('.kanban-card');
        const columns = document.querySelectorAll('.kanban-cards');

        cards.forEach(card => {
            card.addEventListener('dragstart', () => {
                card.classList.add('dragging');
                this.isDragging = true;
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                this.isDragging = false;
            });
        });

        columns.forEach(col => {
            col.addEventListener('dragover', e => {
                e.preventDefault();
                const draggingCard = document.querySelector('.dragging');
                if (draggingCard) {
                    col.appendChild(draggingCard);
                }
            });

            col.addEventListener('drop', async () => {
                const draggingCard = document.querySelector('.dragging');
                if (draggingCard) {
                    const id = draggingCard.getAttribute('data-id');
                    const newStatus = col.getAttribute('data-status');
                    await this.changeStatus(id, newStatus);
                }
            });
        });
    },

    changeStatus: async function(id, newStatus) {
        const customers = await DB.getCustomers();
        const customer = customers.find(c => c.id === id);
        
        if (customer && customer.status !== newStatus) {
            const oldStatus = customer.status;
            customer.status = newStatus;
            
            await DB.saveCustomer(customer);
            
            // Agar yutilgan bosqichga o'tsa va avval yutilmagan bo'lsa, avtomatik ravishda moliya kirimiga qo'shamiz (Bitim qiymatini)
            if (newStatus === 'won' && oldStatus !== 'won') {
                const transaction = {
                    id: 't_' + Date.now(),
                    type: 'income',
                    category: 'Sotuvlar',
                    amount: customer.value,
                    date: new Date().toISOString().split('T')[0],
                    description: `${customer.name} loyihasi muvaffaqiyatli yakunlandi`
                };
                await DB.saveTransaction(transaction);
            }

            await this.render();
            // Dashboard yangilanishi uchun
            if (window.App && typeof window.App.updateDashboardStats === 'function') {
                window.App.updateDashboardStats();
            }
        }
    },

    openAddCustomerModal: function() {
        // Reset form
        const form = document.getElementById('add-customer-form');
        if (form) form.reset();
        
        // Populate operators list
        this.populateOperatorsDropdown('cust-operator', '');
        
        window.showModal('crm-modal');
    },

    populateOperatorsDropdown: async function(selectElementId, currentValue) {
        const selectEl = document.getElementById(selectElementId);
        if (!selectEl) return;

        // Reset to default
        selectEl.innerHTML = '<option value="">Tanlanmagan</option>';

        try {
            const employees = await DB.getEmployees();
            employees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.name;
                option.textContent = `${emp.name} (${emp.role})`;
                if (emp.name === currentValue) {
                    option.selected = true;
                }
                selectEl.appendChild(option);
            });
        } catch (e) {
            console.error("Operators list populate failed:", e);
        }
    },

    addCustomer: async function() {
        const name = document.getElementById('cust-name').value.trim();
        const phone = document.getElementById('cust-phone').value.trim();
        const phone2 = document.getElementById('cust-phone2')?.value.trim() || '';
        const source = document.getElementById('cust-source')?.value || 'manual';
        const operator = document.getElementById('cust-operator')?.value || '';
        const value = parseFloat(document.getElementById('cust-value').value) || 0;
        const status = document.getElementById('cust-status').value;

        if (!name || !phone) {
            alert('Iltimos, ism va telefon raqamini kiriting!');
            return;
        }

        const newCustomer = {
            id: 'c_' + Date.now(),
            name,
            phone,
            phone2,
            source,
            operator,
            value,
            status
        };

        await DB.saveCustomer(newCustomer);
        
        // Agar bitim boshidanoq yutilgan deb yaratilsa, moliya kirimiga yoziladi
        if (status === 'won' && value > 0) {
            await DB.saveTransaction({
                id: 't_' + Date.now(),
                type: 'income',
                category: 'Sotuvlar',
                amount: value,
                date: new Date().toISOString().split('T')[0],
                description: `${name} loyihasi (avtomatik yozildi)`
            });
        }
        
        // Formani tozalash va yopish
        document.getElementById('add-customer-form').reset();
        closeModal('crm-modal');
        
        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    deleteCustomer: async function(id) {
        if (!confirm('Haqiqatan ham ushbu mijozni o\'chirmoqchimisiz?')) return;

        await DB.deleteCustomer(id);
        
        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    openCustomerDetails: async function(id, event) {
        if (event) event.stopPropagation();

        const customers = await DB.getCustomers();
        const customer = customers.find(c => c.id === id);

        if (!customer) {
            alert("Mijoz topilmadi!");
            return;
        }

        document.getElementById('edit-cust-id').value = customer.id;
        document.getElementById('edit-cust-name').value = customer.name;
        document.getElementById('edit-cust-phone').value = customer.phone;
        if (document.getElementById('edit-cust-phone2')) {
            document.getElementById('edit-cust-phone2').value = customer.phone2 || '';
        }
        if (document.getElementById('edit-cust-source')) {
            document.getElementById('edit-cust-source').value = customer.source || 'manual';
        }
        document.getElementById('edit-cust-value').value = customer.value || 0;
        document.getElementById('edit-cust-status').value = customer.status || 'lead';

        // Operator dropdown-ni to'ldirish
        await this.populateOperatorsDropdown('edit-cust-operator', customer.operator || '');

        // Platforma ma'lumotlarini tekshirish
        const platformDiv = document.getElementById('customer-platform-info');
        if (platformDiv) {
            if (id && typeof id.startsWith === 'function' && id.startsWith('c_tg_')) {
                const tgId = id.replace('c_tg_', '');
                platformDiv.innerHTML = `
                    <p style="margin-bottom:6px;">
                        <a href="tg://user?id=${tgId}" class="platform-info-link" style="display:inline-flex; align-items:center; gap:6px; color:#38bdf8; text-decoration:none; font-weight:600; cursor:pointer; transition:color 0.2s;">
                            <i class="fab fa-telegram" style="color:#0088cc;"></i> 
                            <span>Telegram Foydalanuvchisi</span>
                        </a>
                    </p>
                    <p>Telegram ID: <span style="font-family:'JetBrains Mono';">${tgId}</span></p>
                `;
                platformDiv.style.display = 'block';
            } else if (id && typeof id.startsWith === 'function' && id.startsWith('c_ig_')) {
                const igId = id.replace('c_ig_', '');
                platformDiv.innerHTML = `
                    <p style="margin-bottom:6px;">
                        <a href="https://instagram.com/${igId}" target="_blank" class="platform-info-link" style="display:inline-flex; align-items:center; gap:6px; color:#f472b6; text-decoration:none; font-weight:600; cursor:pointer; transition:color 0.2s;">
                            <i class="fab fa-instagram" style="color:#E1306C;"></i> 
                            <span>Instagram Foydalanuvchisi</span>
                        </a>
                    </p>
                    <p>Direct ID: <span style="font-family:'JetBrains Mono';">${igId}</span></p>
                `;
                platformDiv.style.display = 'block';
            } else {
                platformDiv.style.display = 'none';
            }
        }

        // Xaridlar tarixini yuklash va chiqarish
        await this.loadCustomerPurchaseHistory(customer);

        window.showModal('customer-details-modal');
    },

    loadCustomerPurchaseHistory: async function(customer) {
        const purchaseListEl = document.getElementById('customer-purchase-list');
        if (!purchaseListEl) return;
        
        purchaseListEl.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Yuklanmoqda...</div>';
        
        try {
            const receipts = await DB.getReceipts();
            const settings = AppStorage.load().settings || {};
            const currency = settings.currency || "so'm";
            
            // Telefon raqamlarni tozalash va solishtirish funksiyasi
            const cleanPhone = (p) => p ? p.replace(/\D/g, '') : '';
            const p1 = cleanPhone(customer.phone);
            const p2 = cleanPhone(customer.phone2);
            
            const matchesPhone = (recPhone) => {
                const cleanRec = cleanPhone(recPhone);
                if (!cleanRec) return false;
                if (p1 && cleanRec.length >= 9 && p1.length >= 9 && cleanRec.slice(-9) === p1.slice(-9)) return true;
                if (p2 && cleanRec.length >= 9 && p2.length >= 9 && cleanRec.slice(-9) === p2.slice(-9)) return true;
                return cleanRec === p1 || cleanRec === p2;
            };

            // Mijozning cheklarini topamiz
            const customerReceipts = receipts.filter(rec => {
                let items = rec.items || [];
                if (typeof items === 'string') {
                    try { items = JSON.parse(items); } catch(e) { items = []; }
                }
                if (items && !Array.isArray(items) && typeof items === 'object') {
                    return matchesPhone(items.customer_phone);
                }
                return false;
            });

            if (customerReceipts.length === 0) {
                purchaseListEl.innerHTML = '<div style="text-align: center; padding: 16px; color: var(--text-muted); font-size: 13px; font-style: italic;">Xaridlar tarixi mavjud emas</div>';
            } else {
                // Yangi xaridlarni birinchi ko'rsatish uchun saralaymiz
                customerReceipts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                let listHtml = '';
                customerReceipts.forEach(rec => {
                    let items = rec.items || [];
                    if (typeof items === 'string') {
                        try { items = JSON.parse(items); } catch(e) { items = []; }
                    }
                    
                    let products = [];
                    if (items && !Array.isArray(items) && typeof items === 'object') {
                        products = items.products || [];
                    } else if (Array.isArray(items)) {
                        products = items;
                    }

                    const dateObj = new Date(rec.created_at);
                    const dateStr = isNaN(dateObj.getTime()) ? rec.created_at : dateObj.toLocaleString('uz-UZ', { hour12: false });
                    const recCode = rec.code || 'CH-' + String(rec.id).substring(0, 8);
                    
                    const payBadgeClass = rec.payment_type === 'Karta' 
                        ? 'badge-primary' 
                        : (rec.payment_type === 'Elektron' ? 'badge-success' : 'badge-secondary');

                    let productsHtml = '';
                    products.forEach(prod => {
                        const prodTotal = prod.total || (parseFloat(prod.price) * parseFloat(prod.qty || 1)) || 0;
                        productsHtml += `
                            <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: 12px; margin-bottom: 2px;">
                                <span>${prod.name || 'Noma\'lum maxsulot'} x ${prod.qty || 1}</span>
                                <span style="color: var(--text-main); font-weight: 500;">${formatMoney(prodTotal, currency)}</span>
                            </div>
                        `;
                    });

                    listHtml += `
                        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; font-size: 13px; display: flex; flex-direction: column; gap: 6px; transition: var(--transition);">
                            <div style="display: flex; justify-content: space-between; font-weight: 600;">
                                <span style="color: var(--accent);">${recCode}</span>
                                <span style="color: var(--text-muted); font-size: 11px; font-weight: normal;">${dateStr}</span>
                            </div>
                            <div style="border-top: 1px dashed var(--border-color); padding-top: 6px; padding-bottom: 4px; display: flex; flex-direction: column; gap: 2px;">
                                ${productsHtml || '<div style="color:var(--text-muted); font-size: 12px; font-style:italic;">Maxsulotlar ko\'rsatilmagan</div>'}
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 6px; font-size: 12px;">
                                <span style="color: var(--text-muted);">To'lov: <span class="badge ${payBadgeClass}" style="font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight:500;">${rec.payment_type || 'Naqd'}</span></span>
                                <span style="color: var(--success); font-weight: 700;">Jami: ${formatMoney(rec.total_amount || 0, currency)}</span>
                            </div>
                        </div>
                    `;
                });
                purchaseListEl.innerHTML = listHtml;
            }
        } catch (err) {
            console.error("Xaridlar tarixini yuklashda xatolik:", err);
            purchaseListEl.innerHTML = '<div style="text-align: center; padding: 12px; color: var(--danger); font-size: 13px;">Yuklashda xatolik yuz berdi</div>';
        }
    },

    syncCustomerReceiptsFromRegos: async function() {
        const btn = document.getElementById('btn-customer-regos-sync');
        if (!btn) return;
        
        const originalHTML = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Yangilanmoqda...`;

        try {
            // Regos-dan oxirgi 30 kunlik cheklarni yangilash uchun so'rov yuboramiz
            const response = await fetch('/api/integration/regos/sync-receipts?days=30', {
                method: 'POST'
            });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || "Sinxronizatsiya boshlashda xatolik yuz berdi.");
            }

            // Polling boshlaymiz
            const interval = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/integration/regos/sync-status');
                    if (!statusRes.ok) return;
                    const status = await statusRes.json();
                    
                    if (status.running) {
                        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${status.processed}/${status.total || '...'}`;
                    } else {
                        clearInterval(interval);
                        btn.disabled = false;
                        btn.innerHTML = originalHTML;
                        
                        // Xaridlar tarixini qayta yuklaymiz
                        const customerId = document.getElementById('edit-cust-id').value;
                        if (customerId) {
                            // Modal ichidagi ro'yxatni yangilash
                            const customers = await DB.getCustomers();
                            const customer = customers.find(c => c.id === customerId);
                            if (customer) {
                                await this.loadCustomerPurchaseHistory(customer);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Regos status poll error:", e);
                }
            }, 1500);

        } catch (err) {
            console.error("Regos-dan yangilashda xatolik:", err);
            alert("Xatolik: " + err.message);
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    },

    openChat: function(customerId, source, customerName) {
        if (source === 'telegram' || source === 'instagram') {
            window.App.renderView('chats');
            if (window.Chats) {
                window.Chats.selectChat(customerId, source, customerName);
            }
        }
    },

    saveEditedCustomer: async function() {
        const id = document.getElementById('edit-cust-id').value;
        const name = document.getElementById('edit-cust-name').value.trim();
        const phone = document.getElementById('edit-cust-phone').value.trim();
        const phone2 = document.getElementById('edit-cust-phone2')?.value.trim() || '';
        const source = document.getElementById('edit-cust-source')?.value || 'manual';
        const operator = document.getElementById('edit-cust-operator')?.value || '';
        const value = parseFloat(document.getElementById('edit-cust-value').value) || 0;
        const status = document.getElementById('edit-cust-status').value;

        if (!name || !phone) {
            alert('Iltimos, ism va telefon raqamini kiriting!');
            return;
        }

        const updatedCustomer = {
            id,
            name,
            phone,
            phone2,
            source,
            operator,
            value,
            status
        };

        await DB.saveCustomer(updatedCustomer);
        window.closeModal('customer-details-modal');
        
        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    syncAmoCRMLeads: async function(clickedBtn) {
        const btn = clickedBtn || document.getElementById('btn-amocrm-sync');
        let originalHTML = '<i class="fas fa-sync"></i> amoCRM Sinx';
        if (btn) {
            originalHTML = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Boshlanmoqda...';
        }
        
        try {
            const response = await fetch('/api/integration/amocrm/sync', {
                method: 'POST'
            });
            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.detail || 'Sinxronizatsiya boshlashda xatolik yuz berdi.');
            }
            
            // Sinxronizatsiya statusini kuzatib boramiz (polling)
            const interval = setInterval(async () => {
                try {
                    const statusRes = await fetch('/api/integration/amocrm/sync-status');
                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        if (btn) {
                            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${statusData.message || 'Sinxronizatsiya...'}`;
                        }
                        
                        if (!statusData.running) {
                            clearInterval(interval);
                            if (btn) {
                                btn.disabled = false;
                                btn.innerHTML = originalHTML;
                            }
                            alert(statusData.message || 'Sinxronizatsiya yakunlandi!');
                            await this.render();
                        }
                    }
                } catch (pollErr) {
                    console.error("Error polling sync status:", pollErr);
                }
            }, 2000);
            
        } catch (e) {
            console.error("amoCRM sync error:", e);
            alert("Xatolik: " + e.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    },

    renderProducts: function(products) {
        if (products.length === 0) {
            return `
                <div style="text-align: center; color: var(--text-muted); padding: 48px; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;">
                    <i class="fas fa-box-open fa-3x" style="color: var(--accent);"></i>
                    <p style="margin: 0;">Mahsulotlar topilmadi</p>
                    <button class="btn btn-primary" onclick="CRM.openAddProductModal()" style="display: inline-flex; align-items: center; gap: 8px; height: 38px;">
                        <i class="fas fa-plus"></i> Kartochka Yaratish
                    </button>
                </div>
            `;
        }

        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; width: 100%;">
                <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--text-main);">
                    Mahsulotlar Ro'yxati (${products.length} ta)
                </h3>
                <button class="btn btn-primary" onclick="CRM.openAddProductModal()" style="display: inline-flex; align-items: center; gap: 8px; height: 38px;">
                    <i class="fas fa-plus"></i> Kartochka Yaratish
                </button>
            </div>
            <div class="products-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; width: 100%;">
        `;

        products.forEach(p => {
            const isOutOfStock = p.stock <= 0;
            const stockBadgeColor = isOutOfStock ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)';
            const stockBadgeText = isOutOfStock ? '#ef4444' : '#10b981';
            const stockBorder = isOutOfStock ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
            const stockLabel = isOutOfStock ? 'Tugagan' : `Qoldiq: ${p.stock} ta`;
            
            const colors = [
                ['#3b82f6', '#1d4ed8'],
                ['#10b981', '#047857'],
                ['#f59e0b', '#b45309'],
                ['#8b5cf6', '#6d28d9'],
                ['#ec4899', '#be185d'],
                ['#06b6d4', '#0891b2']
            ];
            const hash = p.id ? p.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
            const grad = colors[hash % colors.length];

            const parts = (p.name || '').split('###');
            const displayName = parts[0] || '';
            const description = parts[1] || '';
            const imageUrl = parts[2] || '';

            let imageContent = `<i class="fas fa-box" style="font-size: 3rem; color: rgba(255,255,255,0.85);"></i>`;
            if (imageUrl) {
                imageContent = `<img src="${imageUrl}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.outerHTML='<i class=\"fas fa-box\" style=\"font-size: 3rem; color: rgba(255,255,255,0.85);\"></i>';">`;
            }

            html += `
                <div class="product-card card" onclick="CRM.openProductDetailsModal('${p.id}')" style="background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; overflow: hidden; cursor: pointer; transition: all 0.2s ease-in-out; display: flex; flex-direction: column; height: 100%; position: relative; padding: 0;">
                    <div style="background: linear-gradient(135deg, ${grad[0]}, ${grad[1]}); height: 120px; display: flex; align-items: center; justify-content: center; position: relative; width: 100%;">
                        ${imageContent}
                    </div>
                    <div style="padding: 16px; display: flex; flex-direction: column; flex-grow: 1; justify-content: space-between;">
                        <div>
                            <span style="font-size: 0.75rem; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: inline-block;">
                                ${p.category || 'Barchasi'}
                            </span>
                            <h4 style="margin: 0 0 4px 0; color: var(--text-main); font-size: 1.05rem; line-height: 1.3; font-weight: 600; text-align: left;">
                                ${displayName}
                            </h4>
                            <p style="margin: 0 0 12px 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-align: left; height: 34px;">
                                ${description || 'Tasnif kiritilmagan'}
                            </p>
                            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                                <span style="font-size: 0.75rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace;">
                                    SKU: ${p.sku || '-'}
                                </span>
                            </div>
                        </div>
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Narxi</div>
                                <div style="color: #10b981; font-weight: 700; font-size: 1.1rem; font-family: 'JetBrains Mono', monospace;">
                                    ${parseFloat(p.price).toLocaleString()} <span style="font-size: 0.75rem;">so'm</span>
                                </div>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button class="btn btn-secondary" onclick="event.stopPropagation(); CRM.openEditProductModal('${p.id}')" style="padding: 6px 10px; min-width: auto; border-radius: 6px; height: 32px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                                    <i class="fas fa-edit" style="font-size: 0.8rem; color: var(--text-main);"></i>
                                </button>
                                <button class="btn btn-danger" onclick="event.stopPropagation(); CRM.deleteProduct('${p.id}')" style="padding: 6px 10px; min-width: auto; border-radius: 6px; height: 32px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444;">
                                    <i class="fas fa-trash-alt" style="font-size: 0.8rem;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        return html;
    },

    openAddProductModal: function() {
        showModal('product-modal');
    },

    openEditProductModal: async function(id) {
        try {
            const inventory = await DB.getInventory();
            const product = inventory.find(p => p.id === id);
            if (!product) {
                alert("Mahsulot topilmadi!");
                return;
            }

            const parts = (product.name || '').split('###');
            const nameOnly = parts[0] || '';
            const description = parts[1] || '';
            const image = parts[2] || '';

            document.getElementById('edit-prod-id').value = product.id;
            document.getElementById('edit-prod-name').value = nameOnly;
            document.getElementById('edit-prod-sku').value = product.sku || '';
            document.getElementById('edit-prod-cat').value = product.category || '';
            document.getElementById('edit-prod-price').value = product.price || 0;
            if (document.getElementById('edit-prod-desc')) {
                document.getElementById('edit-prod-desc').value = description;
            }
            if (document.getElementById('edit-prod-image')) {
                document.getElementById('edit-prod-image').value = image;
            }

            showModal('edit-product-modal');
        } catch (e) {
            console.error("Mahsulotni tahrirlash oynasini ochishda xatolik:", e);
            alert("Xatolik: " + e.message);
        }
    },

    saveEditedProduct: async function() {
        const id = document.getElementById('edit-prod-id').value;
        const name = document.getElementById('edit-prod-name').value;
        const sku = document.getElementById('edit-prod-sku').value;
        const category = document.getElementById('edit-prod-cat').value;
        const price = parseFloat(document.getElementById('edit-prod-price').value) || 0;

        const inventory = await DB.getInventory();
        const product = inventory.find(p => p.id === id);
        const stock = product ? product.stock : 0;

        const description = document.getElementById('edit-prod-desc')?.value.trim() || '';
        const image = document.getElementById('edit-prod-image')?.value.trim() || '';

        if (!name || !sku || !category) {
            alert('Iltimos, barcha majburiy maydonlarni to\'ldiring!');
            return;
        }

        try {
            const serializedName = `${name}###${description}###${image}`;
            const updatedProduct = {
                id,
                name: serializedName,
                sku: sku.toUpperCase(),
                category,
                price,
                stock
            };

            await DB.saveProduct(updatedProduct);
            closeModal('edit-product-modal');
            if (window.App && window.App.currentView === 'crm-products') {
                await this.renderProductsView();
            } else {
                await this.render();
            }
            if (window.App && typeof window.App.updateDashboardStats === 'function') {
                window.App.updateDashboardStats();
            }
        } catch (e) {
            console.error("Mahsulotni saqlashda xatolik:", e);
            alert("Xatolik: " + e.message);
        }
    },

    deleteProduct: async function(id) {
        if (!confirm("Haqiqatan ham ushbu mahsulotni o'chirmoqchisiz?")) {
            return;
        }

        try {
            await DB.deleteProduct(id);
            if (window.App && window.App.currentView === 'crm-products') {
                await this.renderProductsView();
            } else {
                await this.render();
            }
            if (window.App && typeof window.App.updateDashboardStats === 'function') {
                window.App.updateDashboardStats();
            }
        } catch (e) {
            console.error("Mahsulotni o'chirishda xatolik:", e);
            alert("Xatolik: " + e.message);
        }
    },

    openProductDetailsModal: async function(id) {
        try {
            const inventory = await DB.getInventory();
            const p = inventory.find(item => item.id === id);
            if (!p) {
                alert("Mahsulot topilmadi!");
                return;
            }

            const body = document.getElementById('product-details-body');
            if (body) {
                const colors = [
                    ['#3b82f6', '#1d4ed8'],
                    ['#10b981', '#047857'],
                    ['#f59e0b', '#b45309'],
                    ['#8b5cf6', '#6d28d9'],
                    ['#ec4899', '#be185d'],
                    ['#06b6d4', '#0891b2']
                ];
                const hash = p.id ? p.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
                const grad = colors[hash % colors.length];

                const parts = (p.name || '').split('###');
                const displayName = parts[0] || '';
                const description = parts[1] || '';
                const imageUrl = parts[2] || '';

                let imageContent = `<i class="fas fa-box" style="font-size: 5rem; color: rgba(255,255,255,0.85);"></i>`;
                if (imageUrl) {
                    imageContent = `<img src="${imageUrl}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.outerHTML='<i class=\"fas fa-box\" style=\"font-size: 5rem; color: rgba(255,255,255,0.85);\"></i>';">`;
                }

                body.innerHTML = `
                    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px; background: linear-gradient(135deg, ${grad[0]}, ${grad[1]}); height: 200px; border-radius: 12px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden;">
                            ${imageContent}
                        </div>
                        <div style="flex: 1.5; display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <span style="font-size: 0.8rem; color: var(--accent); font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                                    ${p.category || 'Barchasi'}
                                </span>
                                <h2 style="margin: 4px 0 12px 0; font-size: 1.6rem; font-weight: 700; color: var(--text-main); line-height: 1.2;">
                                    ${displayName}
                                </h2>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;">
                                        <span style="color: var(--text-muted);">SKU kod:</span>
                                        <strong style="font-family: 'JetBrains Mono', monospace; color: var(--text-main);">${p.sku || '-'}</strong>
                                    </div>
                                </div>
                                <div style="margin-top: 16px;">
                                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; margin-bottom: 4px;">Mahsulot Tasnifi:</div>
                                    <div style="color: var(--text-main); font-size: 0.9rem; line-height: 1.4; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); text-align: left;">
                                        ${description || 'Tasnif kiritilmagan'}
                                    </div>
                                </div>
                            </div>
                            <div style="margin-top: 20px; padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.15); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.9rem; color: var(--text-muted);">Sotish narxi:</span>
                                <span style="color: #10b981; font-weight: 700; font-size: 1.4rem; font-family: 'JetBrains Mono', monospace;">
                                    ${parseFloat(p.price).toLocaleString()} so'm
                                </span>
                            </div>
                        </div>
                    </div>
                `;
            }
            showModal('product-details-modal');
        } catch (e) {
            console.error("Mahsulot tafsilotlarini ko'rsatishda xatolik:", e);
            alert("Xatolik: " + e.message);
        }
    },

    initProductsView: function() {
        try {
            this.setupEventListeners();
        } catch (e) {
            console.warn("setupEventListeners failed:", e);
        }
        this.productsPage = 1;
        this.productsPageSize = 24;
        this.renderProductsView();
        try {
            this.setupProductsViewEventListeners();
        } catch (e) {
            console.warn("setupProductsViewEventListeners failed:", e);
        }
    },

    setupProductsViewEventListeners: function() {
        const searchInput = document.getElementById('crm-products-search');
        if (searchInput) {
            searchInput.oninput = () => {
                this.productsPage = 1;
                this.renderProductsView();
            };
        }

        const categoryFilter = document.getElementById('crm-products-category-filter');
        if (categoryFilter) {
            categoryFilter.onchange = () => {
                this.productsPage = 1;
                this.renderProductsView();
            };
        }

        const addProductForm = document.getElementById('add-product-form');
        if (addProductForm) {
            addProductForm.onsubmit = async (e) => {
                e.preventDefault();
                if (window.ERP && typeof window.ERP.addProduct === 'function') {
                    await window.ERP.addProduct();
                    await this.renderProductsView();
                }
            };
        }
    },

    renderProductsView: async function() {
        try {
            const searchVal = document.getElementById('crm-products-search')?.value.toLowerCase() || '';
            const container = document.getElementById('crm-products-content');
            if (!container) return;

            const allInventory = (await DB.getInventory()) || [];
            if (!Array.isArray(allInventory)) {
                console.error("Inventory is not an array:", allInventory);
                container.innerHTML = `<div class="alert alert-danger">Xatolik: Maxsulotlar ro'yxatini yuklab bo'lmadi (format xato).</div>`;
                return;
            }
            const inventory = allInventory.filter(p => p && p.id && (p.id.startsWith('p_') || (p.id.startsWith('i_') && !p.id.startsWith('i_regos_'))));
            
            // Kategoriya bo'yicha filterlarni yuklash
            const categories = [...new Set(inventory.map(p => p.category).filter(Boolean))].sort();
            const categoryFilterSelect = document.getElementById('crm-products-category-filter');
            
            if (categoryFilterSelect) {
                const currentSelected = categoryFilterSelect.value;
                categoryFilterSelect.innerHTML = '<option value="">Barcha toifalar</option>';
                categories.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    if (cat === currentSelected) {
                        opt.selected = true;
                    }
                    categoryFilterSelect.appendChild(opt);
                });
            }

            const selectedCategory = categoryFilterSelect ? categoryFilterSelect.value : '';
            const searchValNorm = window.normalizeUzbek ? window.normalizeUzbek(searchVal) : searchVal.toLowerCase();

            const filteredProducts = inventory.filter(p => {
                if (selectedCategory && p.category !== selectedCategory) {
                    return false;
                }
                const nameNorm = p.name ? (window.normalizeUzbek ? window.normalizeUzbek(p.name) : p.name.toLowerCase()) : '';
                const skuNorm = p.sku ? (window.normalizeUzbek ? window.normalizeUzbek(p.sku) : p.sku.toLowerCase()) : '';
                const catNorm = p.category ? (window.normalizeUzbek ? window.normalizeUzbek(p.category) : p.category.toLowerCase()) : '';
                return nameNorm.includes(searchValNorm) || 
                       skuNorm.includes(searchValNorm) || 
                       catNorm.includes(searchValNorm);
            });

            // Pagination calculations
            if (!this.productsPage) this.productsPage = 1;
            if (!this.productsPageSize) this.productsPageSize = 24;

            const totalItems = filteredProducts.length;
            const totalPages = Math.ceil(totalItems / this.productsPageSize) || 1;
            if (this.productsPage > totalPages) this.productsPage = totalPages;
            if (this.productsPage < 1) this.productsPage = 1;
            
            const startIdx = (this.productsPage - 1) * this.productsPageSize;
            const endIdx = startIdx + this.productsPageSize;
            const pageItems = filteredProducts.slice(startIdx, endIdx);

            container.innerHTML = this.renderProducts(pageItems);
            this.renderProductsPagination(totalPages);
        } catch (err) {
            console.error("renderProductsView xatosi:", err);
            const container = document.getElementById('crm-products-content');
            if (container) {
                container.innerHTML = `<div class="alert alert-danger" style="padding: 16px; margin: 16px; border-radius: 8px;">Yuklashda xatolik yuz berdi: ${err.message}</div>`;
            }
        }
    },

    renderProductsPagination: function(totalPages) {
        const pagContainer = document.getElementById('crm-products-pagination');
        if (!pagContainer) return;

        if (totalPages <= 1) {
            pagContainer.innerHTML = '';
            return;
        }

        let html = '';
        
        // Oldingi sahifa tugmasi
        html += `<button class="btn btn-secondary btn-sm" ${this.productsPage === 1 ? 'disabled' : ''} onclick="CRM.changeProductsPage(${this.productsPage - 1})"><i class="fas fa-chevron-left"></i> Oldingi</button>`;
        
        // Sahifalar raqami
        let startPage = Math.max(1, this.productsPage - 2);
        let endPage = Math.min(totalPages, this.productsPage + 2);
        
        if (startPage > 1) {
            html += `<button class="btn btn-secondary btn-sm" onclick="CRM.changeProductsPage(1)">1</button>`;
            if (startPage > 2) {
                html += `<span style="color: var(--text-muted); align-self: center;">...</span>`;
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn ${i === this.productsPage ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="CRM.changeProductsPage(${i})">${i}</button>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<span style="color: var(--text-muted); align-self: center;">...</span>`;
            }
            html += `<button class="btn btn-secondary btn-sm" onclick="CRM.changeProductsPage(${totalPages})">${totalPages}</button>`;
        }
        
        // Keyingi sahifa tugmasi
        html += `<button class="btn btn-secondary btn-sm" ${this.productsPage === totalPages ? 'disabled' : ''} onclick="CRM.changeProductsPage(${this.productsPage + 1})">Keyingi <i class="fas fa-chevron-right"></i></button>`;
        
        pagContainer.innerHTML = html;
    },

    openAddFromWarehouseModal: function() {
        const list = document.getElementById('warehouse-products-list');
        if (list) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Qidirish uchun mahsulot nomini yoki SKU kodini kiriting...</div>`;
        }
        const searchInput = document.getElementById('warehouse-search-input');
        if (searchInput) searchInput.value = '';
        showModal('add-from-warehouse-modal');
    },

    searchWarehouseProducts: async function() {
        const searchInput = document.getElementById('warehouse-search-input');
        const list = document.getElementById('warehouse-products-list');
        if (!searchInput || !list) return;

        const val = searchInput.value.trim().toLowerCase();
        if (val.length < 2) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Kamida 2 ta belgi kiriting...</div>`;
            return;
        }

        list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;"><i class="fas fa-spinner fa-spin"></i> Qidirilmoqda...</div>`;

        const allInventory = await DB.getInventory();
        const warehouseProducts = allInventory.filter(p => p && p.id && p.id.startsWith('i_regos_'));

        const valNorm = window.normalizeUzbek ? window.normalizeUzbek(val) : val;

        const matches = warehouseProducts.filter(p => {
            const nameNorm = p.name ? (window.normalizeUzbek ? window.normalizeUzbek(p.name) : p.name.toLowerCase()) : '';
            const skuNorm = p.sku ? (window.normalizeUzbek ? window.normalizeUzbek(p.sku) : p.sku.toLowerCase()) : '';
            return nameNorm.includes(valNorm) || skuNorm.includes(valNorm);
        }).slice(0, 50);

        if (matches.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 32px;">Mahsulot topilmadi.</div>`;
            return;
        }

        let html = '';
        matches.forEach(p => {
            html += `
                <div onclick="CRM.selectWarehouseProduct('${p.id}')" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <div style="text-align: left;">
                        <div style="color: var(--text-main); font-weight: 600;">${p.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">SKU: ${p.sku || '-'} | Kategoriya: ${p.category || '-'}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: #10b981; font-weight: 700; font-family: 'JetBrains Mono', monospace;">${parseFloat(p.price).toLocaleString()} so'm</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">Qoldiq: ${p.stock} ta</div>
                    </div>
                </div>
            `;
        });
        list.innerHTML = html;
    },

    selectWarehouseProduct: async function(id) {
        try {
            const allInventory = await DB.getInventory();
            const p = allInventory.find(item => item.id === id);
            if (!p) return;

            document.getElementById('prod-name').value = p.name || '';
            document.getElementById('prod-sku').value = p.sku || '';
            document.getElementById('prod-cat').value = p.category || '';
            document.getElementById('prod-price').value = p.price || 0;
            document.getElementById('prod-stock').value = p.stock || 0;
            document.getElementById('prod-desc').value = '';
            document.getElementById('prod-image').value = '';

            closeModal('add-from-warehouse-modal');
            showModal('product-modal');
        } catch (e) {
            console.error("Ombor mahsulotini tanlashda xatolik:", e);
        }
    },

    changeProductsPage: function(page) {
        this.productsPage = page;
        this.renderProductsView();
        
        // Scroll to top of the view container smoothly
        const sec = document.getElementById('view-crm-products');
        if (sec) {
            sec.scrollIntoView({ behavior: 'smooth' });
        }
    }
};
