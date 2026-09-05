window.openModal = window.openModal || window.showModal;
window.closeModal = window.closeModal || window.hideModal;

window.CRM = {
    activeTab: 'kanban', // 'kanban', 'list', 'calls' yoki 'products'
    pollingInterval: null,
    isDragging: false,
    activeCategoryGroup: null,

    getProductGroup: function(p) {
        if (!p) return 'boshqalar';
        const parts = (p.name || '').split('###');
        const displayName = (parts[0] || '').toLowerCase();
        const description = (parts[1] || '').toLowerCase();
        const category = (p.category || '').toLowerCase();
        
        const fullText = `${displayName} ${description} ${category}`;
        
        if (fullText.includes('konditsioner') || fullText.includes('kondisioner') || fullText.includes('konditsoner') || fullText.includes('кондиционер') || fullText.includes('кондит') || fullText.includes('breeze') || fullText.includes('bac-')) {
            return 'konditsioner';
        }
        if (fullText.includes('televizor') || fullText.includes('tv') || fullText.includes('smart tv') || fullText.includes('телевизор') || fullText.includes('led tv')) {
            return 'televizor';
        }
        if (fullText.includes('muzlatgich') || fullText.includes('muzlatkich') || fullText.includes('xolodilnik') || fullText.includes('холодильник') || fullText.includes('морозильник') || fullText.includes('ziffer') || fullText.includes('refrigerator')) {
            return 'muzlatgichlar';
        }
        if (fullText.includes('kirmoshina') || fullText.includes('kir yuvish') || fullText.includes('kiryuvish') || fullText.includes('стиральная машина') || fullText.includes('стиралка') || fullText.includes('washer') || fullText.includes('washing')) {
            return 'kirmoshinalar';
        }
        if (fullText.includes('gaz plita') || fullText.includes('gazpech') || fullText.includes('gaz pech') || fullText.includes('pech') || fullText.includes('плита') || fullText.includes('газовая плита') || fullText.includes('духовка') || fullText.includes('duxovka') || fullText.includes('stove') || fullText.includes('burner')) {
            return 'gaz plitalar';
        }
        if (fullText.includes('changyutgich') || fullText.includes('chang yutgich') || fullText.includes('пылесос') || fullText.includes('vacuum')) {
            return 'chang yutgich';
        }
        if (fullText.includes('mikrovalnovka') || fullText.includes('mikravalnovka') || fullText.includes('микроволновка') || fullText.includes('microwave') || fullText.includes('микроволновая') || fullText.includes('микроволновки') || fullText.includes('mikrotolqinli')) {
            return 'mikrovalnovkalar';
        }
        return 'boshqalar';
    },

    init: function() {
        this.render();
        this.setupEventListeners();

        // Har 5 soniyada yangi mijozlar/leadlarni yangilab turish (Drag paytida to'xtatiladi)
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        this.pollingInterval = setInterval(() => {
            if (window.App && window.App.currentView === 'crm' && !this.isDragging && this.activeTab !== 'calls' && this.activeTab !== 'products') {
                this.render();
            } else if (window.App && window.App.currentView === 'crm-customers') {
                this.renderCustomersView();
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
            if (window.App && window.App.currentView === 'crm-customers') {
                await this.renderCustomersView();
            }
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
        if (window.App && window.App.currentView === 'crm-customers') {
            await this.renderCustomersView();
        }
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    deleteCustomer: async function(id) {
        if (!confirm('Haqiqatan ham ushbu mijozni o\'chirmoqchimisiz?')) return;

        await DB.deleteCustomer(id);
        
        await this.render();
        if (window.App && window.App.currentView === 'crm-customers') {
            await this.renderCustomersView();
        }
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
            const settings = AppStorage.load().settings || {};
            const currency = settings.currency || "so'm";
            
            let customerReceipts = [];
            try {
                const params = new URLSearchParams();
                if (customer.phone) params.append('phone', customer.phone);
                if (customer.phone2) params.append('phone2', customer.phone2);
                const resp = await fetch(`/api/clients/${encodeURIComponent(customer.id)}/receipts?${params.toString()}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.ok && Array.isArray(data.receipts)) {
                        customerReceipts = data.receipts;
                    }
                }
            } catch (e_api) {
                console.warn("Lid xarid cheklarini API orqali yuklashda xatolik:", e_api);
            }

            if (!customerReceipts || customerReceipts.length === 0) {
                const receipts = await DB.getReceipts();
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
                customerReceipts = receipts.filter(rec => {
                    let items = rec.items || [];
                    if (typeof items === 'string') {
                        try { items = JSON.parse(items); } catch(e) { items = []; }
                    }
                    if (items && !Array.isArray(items) && typeof items === 'object') {
                        return matchesPhone(items.customer_phone);
                    }
                    return false;
                });
            }

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

    _regosSyncInterval: null,

    checkAndTrackRegosSync: async function() {
        try {
            const statusRes = await fetch('/api/integration/regos/sync-status');
            if (!statusRes.ok) return;
            const status = await statusRes.json();
            if (status && status.running) {
                this.startRegosSyncTracking();
            }
        } catch(e) {}
    },

    startRegosSyncTracking: function() {
        if (this._regosSyncInterval) return;

        const getElements = () => {
            const btns = [
                document.getElementById('cdm-btn-regos-sync'),
                document.getElementById('btn-customer-regos-sync')
            ].filter(Boolean);
            const banner = document.getElementById('cdm-sync-progress-banner');
            const statusMsg = document.getElementById('cdm-sync-status-msg');
            const progressText = document.getElementById('cdm-sync-progress-text');
            const progressBar = document.getElementById('cdm-sync-progress-bar');
            const spinIcon = document.getElementById('cdm-sync-spin-icon');
            return { btns, banner, statusMsg, progressText, progressBar, spinIcon };
        };

        const updateUI = (status) => {
            const { btns, banner, statusMsg, progressText, progressBar, spinIcon } = getElements();
            const total = parseInt(status.total) || 0;
            const processed = parseInt(status.processed) || 0;
            const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

            btns.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.85';
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${pct > 0 ? pct + '%' : 'Yangilanmoqda...'}`;
            });

            if (banner) {
                banner.style.display = 'block';
                banner.style.background = 'rgba(56, 189, 248, 0.08)';
                banner.style.borderColor = 'rgba(56, 189, 248, 0.3)';
            }
            if (spinIcon) {
                spinIcon.style.display = 'inline-block';
                spinIcon.className = 'fas fa-sync fa-spin';
            }
            if (statusMsg) {
                statusMsg.style.color = '#38bdf8';
                statusMsg.textContent = status.message || 'REGOS-dan yangi cheklar olinmoqda...';
            }
            if (progressText) {
                progressText.style.color = '#38bdf8';
                progressText.textContent = total > 0 ? `${processed}/${total} (${pct}%)` : (processed > 0 ? `${processed} ta` : 'Kutilmoqda...');
            }
            if (progressBar) {
                progressBar.style.width = `${Math.max(5, pct)}%`;
                progressBar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8)';
            }
        };

        this._regosSyncInterval = setInterval(async () => {
            try {
                const res = await fetch('/api/integration/regos/sync-status');
                if (!res.ok) return;
                const status = await res.json();

                if (status && status.running) {
                    updateUI(status);
                } else {
                    clearInterval(this._regosSyncInterval);
                    this._regosSyncInterval = null;

                    const { btns, banner, statusMsg, progressText, progressBar, spinIcon } = getElements();

                    btns.forEach(btn => {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                        btn.innerHTML = `<i class="fas fa-sync"></i> REGOS-dan yangilash`;
                    });

                    if (banner) {
                        banner.style.background = 'rgba(16, 185, 129, 0.12)';
                        banner.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                    }
                    if (statusMsg) {
                        statusMsg.style.color = '#10b981';
                        statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color: #10b981; margin-right: 4px;"></i> ${status.message || 'Cheklar muvaffaqiyatli yangilandi!'}`;
                    }
                    if (progressText) {
                        progressText.style.color = '#10b981';
                        progressText.textContent = '100%';
                    }
                    if (progressBar) {
                        progressBar.style.width = '100%';
                        progressBar.style.background = '#10b981';
                    }
                    if (spinIcon) {
                        spinIcon.className = 'fas fa-check-circle';
                        spinIcon.style.color = '#10b981';
                    }

                    setTimeout(() => {
                        if (banner && !this._regosSyncInterval) {
                            banner.style.display = 'none';
                            if (progressBar) progressBar.style.background = 'linear-gradient(90deg, #38bdf8, #818cf8)';
                        }
                    }, 4000);

                    // Joriy mijoz cheklarini qayta yuklash
                    if (this._currentDetailClientId) {
                        let clients = this._clientsCache || [];
                        let client = clients.find(c => c.id === this._currentDetailClientId);
                        if (!client) {
                            try {
                                clients = await DB.getClients();
                                this._clientsCache = clients;
                                client = clients.find(c => c.id === this._currentDetailClientId);
                            } catch(e) {}
                        }
                        if (client) {
                            await this.loadClientReceipts(client);
                        }
                    }

                    // CRM Lid modali ochilgan bo'lsa
                    const customerId = document.getElementById('edit-cust-id')?.value;
                    if (customerId) {
                        const customers = await DB.getCustomers();
                        const customer = customers.find(c => c.id === customerId);
                        if (customer) {
                            await this.loadCustomerPurchaseHistory(customer);
                        }
                    }
                }
            } catch(e) {
                console.error("Sync status poll error:", e);
            }
        }, 1200);
    },

    syncCustomerReceiptsFromRegos: async function() {
        const banner = document.getElementById('cdm-sync-progress-banner');
        if (banner) banner.style.display = 'block';

        const btns = [
            document.getElementById('cdm-btn-regos-sync'),
            document.getElementById('btn-customer-regos-sync')
        ].filter(Boolean);

        btns.forEach(btn => {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Boshlanmoqda...`;
        });

        try {
            const response = await fetch('/api/integration/regos/sync-receipts?days=360', {
                method: 'POST'
            });
            const data = await response.json();

            this.startRegosSyncTracking();

        } catch (err) {
            console.error("Regos-dan yangilashda xatolik:", err);
            this.checkAndTrackRegosSync();
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
        if (window.App && window.App.currentView === 'crm-customers') {
            await this.renderCustomersView();
        }
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    syncAmoCRMLeads: async function(clickedBtn) {
        const btn = clickedBtn || document.getElementById('btn-amocrm-sync') || document.getElementById('btn-amocrm-sync-custlist');
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
                            if (window.App && window.App.currentView === 'crm-customers') {
                                await this.renderCustomersView();
                            }
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
        // Group metadata in user's requested order
        const groupDefs = {
            konditsioner: { name: "Konditsionerlar", icon: "fa-snowflake", color: "#3b82f6", rgb: "59, 130, 246" },
            televizor: { name: "Televizorlar", icon: "fa-tv", color: "#8b5cf6", rgb: "139, 92, 246" },
            muzlatgichlar: { name: "Muzlatgichlar", icon: "fa-temperature-low", color: "#0ea5e9", rgb: "14, 165, 233" },
            kirmoshinalar: { name: "Kir yuvish mashinalari", icon: "fa-soap", color: "#10b981", rgb: "16, 185, 129" },
            "gaz plitalar": { name: "Gaz plitalari", icon: "fa-fire", color: "#f59e0b", rgb: "245, 158, 11" },
            "chang yutgich": { name: "Changyutgichlar", icon: "fa-broom", color: "#ec4899", rgb: "236, 72, 153" },
            mikrovalnovkalar: { name: "Mikroto'lqinli pechlar", icon: "fa-wave-square", color: "#f97316", rgb: "249, 115, 22" },
            boshqalar: { name: "Boshqa mahsulotlar", icon: "fa-box", color: "#64748b", rgb: "100, 116, 139" }
        };

        if (this.activeCategoryGroup === null) {
            // Category List View (BIG Cards)
            let html = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; width: 100%;">
                    <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-boxes" style="color: var(--accent);"></i> Mahsulot Toifalari
                    </h3>
                    <button class="btn btn-primary" onclick="CRM.openAddProductModal()" style="display: inline-flex; align-items: center; gap: 8px; height: 38px;">
                        <i class="fas fa-plus"></i> Kartochka Yaratish
                    </button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 24px; width: 100%;">
            `;

            const counts = this._categoryCounts || {
                konditsioner: 0,
                televizor: 0,
                muzlatgichlar: 0,
                kirmoshinalar: 0,
                "gaz plitalar": 0,
                "chang yutgich": 0,
                mikrovalnovkalar: 0,
                boshqalar: 0
            };

            Object.keys(groupDefs).forEach(key => {
                const def = groupDefs[key];
                const count = counts[key] || 0;
                
                html += `
                    <div class="category-folder-card card" onclick="CRM.selectCategoryGroup('${key}')" 
                         style="background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; padding: 28px 20px; text-align: center; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px; position: relative; overflow: hidden;"
                         onmouseover="this.style.transform='translateY(-6px)'; this.style.borderColor='${def.color}cc'; this.style.boxShadow='0 12px 30px rgba(${def.rgb}, 0.15)'; this.style.background='rgba(30, 41, 59, 0.65)';"
                         onmouseout="this.style.transform='none'; this.style.borderColor='rgba(255, 255, 255, 0.05)'; this.style.boxShadow='none'; this.style.background='rgba(30, 41, 59, 0.4)';">
                         
                         <!-- Glow background element -->
                         <div style="position: absolute; top: -30px; right: -30px; width: 80px; height: 80px; border-radius: 50%; background: ${def.color}; opacity: 0.06; filter: blur(25px);"></div>
                         
                         <!-- Large Icon -->
                         <div style="width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(${def.rgb}, 0.12); color: ${def.color}; font-size: 2.2rem; margin-bottom: 16px; border: 1px solid rgba(${def.rgb}, 0.1); transition: all 0.3s;"
                              class="folder-icon-wrapper">
                             <i class="fas ${def.icon}"></i>
                         </div>
                         
                         <!-- Title and count badge -->
                         <h4 style="margin: 0 0 8px 0; color: var(--text-main); font-size: 1.15rem; font-weight: 700; letter-spacing: 0.3px;">${def.name}</h4>
                         <span style="font-size: 0.8rem; color: ${count > 0 ? '#10b981' : 'var(--text-muted)'}; background: ${count > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${count > 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)'}; padding: 3px 12px; border-radius: 14px; font-weight: 600; font-family: 'Outfit', sans-serif;">
                             ${count} ta mahsulot
                         </span>
                    </div>
                `;
            });

            html += `</div>`;
            return html;
        }

        // Category Detail View (Nested list)
        const activeGroupDef = groupDefs[this.activeCategoryGroup];
        
        let html = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; width: 100%; flex-wrap: wrap; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <button class="btn btn-secondary" onclick="CRM.activeCategoryGroup = null; CRM.productsPage = 1; CRM.renderProductsView();" 
                            style="height: 38px; display: inline-flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); font-weight: 600; transition: all 0.2s;">
                        <i class="fas fa-chevron-left"></i> Toifalarga
                    </button>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: rgba(${activeGroupDef.rgb}, 0.15); color: ${activeGroupDef.color}; font-size: 1.1rem;">
                            <i class="fas ${activeGroupDef.icon}"></i>
                        </div>
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                            ${activeGroupDef.name}
                        </h3>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="CRM.openAddProductModal()" style="display: inline-flex; align-items: center; gap: 8px; height: 38px;">
                    <i class="fas fa-plus"></i> Kartochka Yaratish
                </button>
            </div>
        `;

        if (products.length === 0) {
            html += `
                <div style="text-align: center; color: var(--text-muted); padding: 48px; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border: 1px dashed rgba(255,255,255,0.05); border-radius: 16px; background: rgba(30, 41, 59, 0.2);">
                    <i class="fas fa-box-open fa-3x" style="color: var(--accent);"></i>
                    <p style="margin: 0; font-size: 1rem;">Ushbu guruhda mahsulotlar topilmadi</p>
                    <button class="btn btn-primary" onclick="CRM.openAddProductModal()" style="display: inline-flex; align-items: center; gap: 8px; height: 38px;">
                        <i class="fas fa-plus"></i> Mahsulot qo'shish
                    </button>
                </div>
            `;
            return html;
        }

        html += `<div class="products-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; width: 100%;">`;
        
        products.forEach(p => {
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
        const prodCatSelect = document.getElementById('prod-cat');
        if (prodCatSelect) {
            prodCatSelect.value = this.activeCategoryGroup || '';
        }
        const prodSkuInput = document.getElementById('prod-sku');
        if (prodSkuInput) {
            prodSkuInput.value = 'SKU-' + Math.floor(100000 + Math.random() * 900000);
        }
        showModal('product-modal');
    },

    openEditProductModal: async function(id) {
        try {
            const inventory = await DB.getManualInventory();
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
            let catValue = product.category || '';
            const standardKeys = ['konditsioner', 'televizor', 'muzlatgichlar', 'kirmoshinalar', 'gaz plitalar', 'chang yutgich', 'mikrovalnovkalar', 'boshqalar'];
            if (!standardKeys.includes(catValue.toLowerCase())) {
                catValue = this.getProductGroup(product);
            }
            document.getElementById('edit-prod-cat').value = catValue;
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

        const inventory = await DB.getManualInventory();
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
            this._manualInventoryCache = null;
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
            this._manualInventoryCache = null;
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
            const inventory = await DB.getManualInventory();
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
                            
                            <!-- amoCRM Integration Form -->
                            <div style="margin-top: 15px; padding: 14px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 10px;">
                                <h4 style="margin: 0 0 10px 0; color: #3b82f6; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
                                    <i class="fas fa-plug"></i> amoCRM-ga yuborish
                                </h4>
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                        <div style="flex: 1.2; min-width: 140px;">
                                            <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 3px;">Bitim (sdelka) nomi</label>
                                            <input type="text" id="amo-deal-name" placeholder="Masalan: TCL televizor" style="width: 100%; height: 32px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); border-radius: 6px; padding: 0 8px; font-size: 0.8rem;" value="${displayName} xaridi">
                                        </div>
                                        <div style="flex: 1; min-width: 140px;">
                                            <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 3px;">Telefon raqam</label>
                                            <input type="text" id="amo-deal-phone" placeholder="Masalan: +998901234567" style="width: 100%; height: 32px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); border-radius: 6px; padding: 0 8px; font-size: 0.8rem;" value="+998">
                                        </div>
                                    </div>
                                    <button type="button" onclick="CRM.pushDealToAmoCRM('${p.id.replace(/'/g, "\\'")}')" id="amo-push-btn" style="height: 34px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border: none; color: white; font-weight: 600; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; width: 100%; transition: all 0.2s;">
                                        <i class="fas fa-paper-plane"></i> amoCRM-ga jo'natish
                                    </button>
                                </div>
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

    pushDealToAmoCRM: async function(id) {
        const dealNameInput = document.getElementById('amo-deal-name');
        const phoneInput = document.getElementById('amo-deal-phone');
        const pushBtn = document.getElementById('amo-push-btn');
        
        if (!dealNameInput || !phoneInput) return;
        
        let dealName = dealNameInput.value.trim();
        const phone = phoneInput.value.trim();
        
        if (!phone || phone === '+998') {
            alert("Iltimos, telefon raqamini kiriting!");
            return;
        }
        
        // Find product details
        const inventory = await DB.getManualInventory();
        const p = inventory.find(item => item.id === id);
        if (!p) {
            alert("Mahsulot topilmadi!");
            return;
        }
        const parts = (p.name || '').split('###');
        const displayName = parts[0] || '';
        const description = parts[1] || '';
        const imageUrl = parts[2] || '';
        
        if (!dealName) {
            dealName = `${displayName} xaridi`;
        }
        
        try {
            if (pushBtn) {
                pushBtn.disabled = true;
                pushBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Yuborilmoqda...`;
            }
            
            const response = await fetch('/api/integration/amocrm/push-deal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    deal_name: dealName,
                    phone: phone,
                    product_name: displayName,
                    product_price: parseFloat(p.price) || 0,
                    product_sku: p.sku || '',
                    product_desc: description,
                    product_image: imageUrl
                })
            });
            
            const result = await response.json();
            if (response.ok && result.status === 'success') {
                alert("Muvaffaqiyatli: " + result.message);
                closeModal('product-details-modal');
            } else {
                alert("Xatolik: " + (result.detail || "amoCRM-ga yuborishda xatolik yuz berdi"));
            }
        } catch (e) {
            console.error("amoCRM Push error:", e);
            alert("Xatolik: Tarmoqda xatolik yuz berdi.");
        } finally {
            if (pushBtn) {
                pushBtn.disabled = false;
                pushBtn.innerHTML = `<i class="fas fa-paper-plane"></i> amoCRM-ga jo'natish`;
            }
        }
    },

    initProductsView: function() {
        this.activeCategoryGroup = null;
        this._manualInventoryCache = null;
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
                    this._manualInventoryCache = null;
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

            if (!this._manualInventoryCache) {
                this._manualInventoryCache = (await DB.getManualInventory()) || [];
            }
            const allInventory = this._manualInventoryCache;
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

            // Compute counts for categories dynamically based on filtered products
            const allCounts = {
                konditsioner: 0,
                televizor: 0,
                muzlatgichlar: 0,
                kirmoshinalar: 0,
                "gaz plitalar": 0,
                "chang yutgich": 0,
                mikrovalnovkalar: 0,
                boshqalar: 0
            };
            filteredProducts.forEach(p => {
                const group = this.getProductGroup(p);
                if (allCounts.hasOwnProperty(group)) {
                    allCounts[group]++;
                }
            });
            this._categoryCounts = allCounts;

            if (this.activeCategoryGroup !== null) {
                // Nested view: Show only products in the active category group
                const activeGroupProducts = filteredProducts.filter(p => this.getProductGroup(p) === this.activeCategoryGroup);

                if (!this.productsPage) this.productsPage = 1;
                if (!this.productsPageSize) this.productsPageSize = 24;

                const totalItems = activeGroupProducts.length;
                const totalPages = Math.ceil(totalItems / this.productsPageSize) || 1;
                if (this.productsPage > totalPages) this.productsPage = totalPages;
                if (this.productsPage < 1) this.productsPage = 1;
                
                const startIdx = (this.productsPage - 1) * this.productsPageSize;
                const endIdx = startIdx + this.productsPageSize;
                const pageItems = activeGroupProducts.slice(startIdx, endIdx);

                container.innerHTML = this.renderProducts(pageItems);
                this.renderProductsPagination(totalPages);
            } else {
                // Category list view: Show the 8 categories as folder cards
                container.innerHTML = this.renderProducts(filteredProducts);
                this.renderProductsPagination(0); // Hide pagination in category view
            }
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

        const matches = await DB.searchWarehouseInventory(val);
        this._warehouseSearchResults = matches;

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
            const p = (this._warehouseSearchResults || []).find(item => item.id === id);
            if (!p) return;

            document.getElementById('prod-name').value = p.name || '';
            document.getElementById('prod-sku').value = p.sku || '';
            let catValue = p.category || '';
            const standardKeys = ['konditsioner', 'televizor', 'muzlatgichlar', 'kirmoshinalar', 'gaz plitalar', 'chang yutgich', 'mikrovalnovkalar', 'boshqalar'];
            if (!standardKeys.includes(catValue.toLowerCase())) {
                catValue = this.getProductGroup(p);
            }
            document.getElementById('prod-cat').value = catValue;
            document.getElementById('prod-price').value = p.price || 0;
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
    },

    selectCategoryGroup: function(key) {
        this.activeCategoryGroup = key;
        this.productsPage = 1;
        this.renderProductsView();
        
        // Scroll to top smoothly
        const sec = document.getElementById('view-crm-products');
        if (sec) {
            sec.scrollIntoView({ behavior: 'smooth' });
        }
    },

    customerListPage: 1,
    customerListPageSize: 20,
    _clientsCache: null,
    _operatorsCache: null,

    initCustomersView: async function() {
        this.customerListPage = 1;
        this.customerListPageSize = 20;
        this.setupCustomersViewEventListeners();

        // 1. Dastlabki tezkor ko'rsatish (0ms)
        if (!this._clientsCache || this._clientsCache.length === 0) {
            this._clientsCache = AppStorage.load().clients || [];
        }
        this.renderCustomersTable();

        // 2. Serverdan yangilash
        await this.loadCustomersData();

        if (!this.customerPollingInterval) {
            this.customerPollingInterval = setInterval(() => {
                if (window.App && window.App.currentView === 'crm-customers') {
                    const clientModal = document.getElementById('client-modal');
                    const regosModal = document.getElementById('regos-card-search-modal');
                    const isModalOpen = (clientModal && clientModal.style.display === 'flex') || (regosModal && regosModal.style.display === 'flex');
                    const searchInput = document.getElementById('crm-clientlist-search') || document.getElementById('crm-custlist-search');
                    const isSearching = searchInput && (document.activeElement === searchInput || searchInput.value.trim().length > 0);

                    if (!isModalOpen && !isSearching) {
                        this.refreshCustomersDataBackground();
                    }
                }
            }, 10000);
        }
    },

    loadCustomersData: async function(forceRefresh = false) {
        try {
            const clients = await DB.getClients(forceRefresh);
            this._clientsCache = clients || [];
        } catch (e) {
            console.error("Mijozlarni yuklashda xatolik:", e);
            if (!this._clientsCache || this._clientsCache.length === 0) {
                this._clientsCache = AppStorage.load().clients || [];
            }
        }
        this.renderCustomersTable();
    },

    refreshCustomersDataBackground: async function() {
        try {
            const clients = await DB.getClients(true);
            if (Array.isArray(clients)) {
                this._clientsCache = clients;
                this.renderCustomersTable();
            }
        } catch(e) {}
    },

    setupCustomersViewEventListeners: function() {
        const searchInput = document.getElementById('crm-clientlist-search') || document.getElementById('crm-custlist-search');
        if (searchInput && !searchInput._bound) {
            searchInput._bound = true;
            let timeout = null;
            searchInput.oninput = () => {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.customerListPage = 1;
                    this.renderCustomersTable();
                }, 80);
            };
        }

        const typeFilter = document.getElementById('crm-clientlist-type-filter');
        if (typeFilter && !typeFilter._bound) {
            typeFilter._bound = true;
            typeFilter.onchange = () => {
                this.customerListPage = 1;
                this.renderCustomersTable();
            };
        }
    },

    onClientSearchInput: function() {
        this.customerListPage = 1;
        this.renderCustomersTable();
    },

    renderCustomersView: async function(forceRefresh = false) {
        if (forceRefresh || !this._clientsCache || this._clientsCache.length === 0) {
            await this.loadCustomersData(forceRefresh);
        } else {
            this.renderCustomersTable();
        }
    },

    renderCustomersTable: function() {
        const container = document.getElementById('crm-custlist-content');
        if (!container) return;

        const clients = this._clientsCache || [];

        // 1. KPI kartochkalarni yangilash (Ustalar va Qurilish obyektlari)
        const totalStat = document.getElementById('clientlist-stat-total') || document.getElementById('custlist-stat-total');
        const corpStat = document.getElementById('clientlist-stat-corporate') || document.getElementById('custlist-stat-new');
        const indivStat = document.getElementById('clientlist-stat-individual') || document.getElementById('custlist-stat-contacted');
        const monthStat = document.getElementById('clientlist-stat-month') || document.getElementById('custlist-stat-won');

        const now = new Date();
        const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const ustalarCount = clients.filter(c => (c.category === 'ustalar') || (!c.category && (!c.company || !c.company.trim()))).length;
        const qurilishCount = clients.filter(c => (c.category === 'qurilish') || (!c.category && c.company && c.company.trim())).length;
        const monthCount = clients.filter(c => c.created_at && c.created_at.startsWith(currentMonthStr)).length;

        if (totalStat) totalStat.textContent = clients.length;
        if (indivStat) indivStat.textContent = ustalarCount;
        if (corpStat) corpStat.textContent = qurilishCount;
        if (monthStat) monthStat.textContent = monthCount;

        // 2. Filtrlash (Ustalar va Qurilish obyekti)
        const searchInput = document.getElementById('crm-clientlist-search') || document.getElementById('crm-custlist-search');
        const searchVal = (searchInput ? searchInput.value : '').toLowerCase().trim();
        const typeFilter = document.getElementById('crm-clientlist-type-filter')?.value || '';

        const filtered = clients.filter(c => {
            const cat = c.category || (c.company && c.company.trim() ? 'qurilish' : 'ustalar');
            if (typeFilter && cat !== typeFilter) return false;
            if (searchVal) {
                const name = (c.name || '').toLowerCase();
                const phone = (c.phone || '').toLowerCase();
                const phone2 = (c.phone2 || '').toLowerCase();
                const barcode = (c.barcode || '').toLowerCase();
                const company = (c.company || '').toLowerCase();
                const address = (c.email || c.address || '').toLowerCase();
                const notes = (c.notes || '').toLowerCase();
                const catText = cat === 'qurilish' ? 'qurilish obyekti' : 'ustalar';
                if (!name.includes(searchVal) && !phone.includes(searchVal) && !phone2.includes(searchVal) && !barcode.includes(searchVal) && !company.includes(searchVal) && !address.includes(searchVal) && !notes.includes(searchVal) && !catText.includes(searchVal)) {
                    return false;
                }
            }
            return true;
        });

        // 3. Sahifalash (Pagination)
        const pageSize = this.customerListPageSize || 20;
        const totalPages = Math.ceil(filtered.length / pageSize) || 1;
        if (this.customerListPage > totalPages) this.customerListPage = totalPages;
        if (this.customerListPage < 1) this.customerListPage = 1;

        const startIdx = (this.customerListPage - 1) * pageSize;
        const pageItems = filtered.slice(startIdx, startIdx + pageSize);

        // 4. Jadval HTML
        let tableHtml = `
            <div class="card" style="margin-top: 16px;">
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th style="width: 45px; text-align: center;">#</th>
                                <th>Mijoz (F.I.Sh)</th>
                                <th>Toifasi</th>
                                <th>Shtrix-kod (Karta)</th>
                                <th>Asosiy telefon</th>
                                <th>Bonus balansi</th>
                                <th>Kompaniya / Obyekt</th>
                                <th>Qo'shimcha telefon</th>
                                <th>Manzil / Hudud</th>
                                <th>Izoh / Eslatma</th>
                                <th style="text-align: right; min-width: 130px;">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (pageItems.length === 0) {
            tableHtml += `
                <tr>
                    <td colspan="11" style="text-align: center; color: var(--text-muted); padding: 50px 20px;">
                        <div style="max-width: 420px; margin: 0 auto; text-align: center;">
                            <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(56, 189, 248, 0.1); color: #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px;">
                                <i class="fas fa-barcode"></i>
                            </div>
                            <h4 style="color: var(--text-main); margin-bottom: 8px; font-weight: 600;">Hozircha mijozlar mavjud emas</h4>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                                REGOS xaridor kartasini shtrix-kod orqali qidirib qo'shishingiz yoki yangi mijoz kiritishingiz mumkin.
                            </p>
                            <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                                <button class="btn btn-secondary btn-sm" onclick="CRM.openRegosCardSearchModal()" style="border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(56, 189, 248, 0.08); color: #38bdf8; padding: 8px 16px;">
                                    <i class="fas fa-barcode" style="margin-right: 6px;"></i> REGOS-dan Karta Qidirish
                                </button>
                                <button class="btn btn-primary btn-sm" onclick="CRM.openAddClientModal()" style="padding: 8px 16px;">
                                    <i class="fas fa-plus" style="margin-right: 6px;"></i> Yangi Mijoz Qo'shish
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            pageItems.forEach((c, idx) => {
                const rowNum = startIdx + idx + 1;
                const clientName = c.name || '-';
                const cat = c.category || (c.company && c.company.trim() ? 'qurilish' : 'ustalar');
                const categoryBadge = cat === 'qurilish' ? `
                    <span class="badge" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fas fa-building" style="font-size: 11px;"></i> Qurilish obyekti
                    </span>
                ` : `
                    <span class="badge" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b; padding: 4px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fas fa-hammer" style="font-size: 11px;"></i> Ustalar
                    </span>
                `;
                const companyName = c.company ? `<span style="font-weight: 500; color: var(--accent);"><i class="fas fa-building" style="margin-right: 5px; font-size: 11px;"></i>${c.company}</span>` : '<span style="color: var(--text-muted); font-style: italic;">-</span>';
                const mainPhone = c.phone || '-';
                const extraPhone = c.phone2 && c.phone2 !== c.barcode ? c.phone2 : '-';
                const address = c.email || c.address || '-';
                const notes = c.notes || '-';
                
                const barcodeBadge = c.barcode ? `
                    <span style="font-family: monospace; font-size: 12px; font-weight: 600; background: rgba(56, 189, 248, 0.12); color: #38bdf8; padding: 3px 8px; border-radius: 5px; display: inline-flex; align-items: center; gap: 5px;" title="Shtrix-kod: ${c.barcode}">
                        <i class="fas fa-barcode"></i> ${c.barcode}
                    </span>
                ` : `<span style="color: var(--text-muted);">-</span>`;

                const bonusVal = Number(c.bonus || c.value || 0);
                const bonusDisplay = bonusVal > 0 ? `
                    <span style="color: #10b981; font-weight: 600; font-size: 12.5px;">
                        ${bonusVal.toLocaleString('uz-UZ')} so'm
                    </span>
                ` : `<span style="color: var(--text-muted); font-size: 12px;">0 so'm</span>`;

                tableHtml += `
                    <tr style="cursor: pointer;" onclick="if (!event.target.closest('button, a, input, select')) CRM.openClientDetailsModal('${c.id}')" title="Mijoz tafsilotlarini ko'rish uchun bosing">
                        <td style="text-align: center; color: var(--text-muted); font-size: 12px;">${rowNum}</td>
                        <td>
                            <strong style="font-size: 13.5px; color: var(--text-main);">
                                <a href="javascript:void(0)" onclick="CRM.openClientDetailsModal('${c.id}')" style="color: var(--text-main); text-decoration:none; display: inline-flex; align-items: center; gap: 6px;" title="Mijoz profili va cheklarini ko'rish">
                                    <span>${clientName}</span>
                                    <i class="fas fa-external-link-alt" style="font-size: 10px; color: var(--text-muted); opacity: 0.6;"></i>
                                </a>
                            </strong>
                        </td>
                        <td>${categoryBadge}</td>
                        <td>${barcodeBadge}</td>
                        <td>
                            <a href="javascript:void(0)" onclick="Telephony.dial('${c.phone}')" style="color: var(--success); text-decoration: none; font-weight: 500; display:inline-flex; align-items:center; gap:6px;" title="Qo'ng'iroq qilish">
                                <i class="fas fa-phone-alt" style="font-size: 11px;"></i> ${mainPhone}
                            </a>
                        </td>
                        <td>
                            <a href="javascript:void(0)" onclick="CRM.openClientDetailsModal('${c.id}'); setTimeout(() => CRM.toggleBonusAction('add'), 200);" title="Bonusni boshqarish" style="text-decoration:none;">
                                ${bonusDisplay}
                            </a>
                        </td>
                        <td>${companyName}</td>
                        <td>
                            ${extraPhone !== '-' ? `
                                <a href="javascript:void(0)" onclick="Telephony.dial('${extraPhone}')" style="color: var(--text-muted); text-decoration: none; font-size: 12px; display:inline-flex; align-items:center; gap:6px;" title="2-raqamga qo'ng'iroq qilish">
                                    <i class="fas fa-phone-alt" style="color: var(--warning); font-size: 10px;"></i> ${extraPhone}
                                </a>
                            ` : `<span style="color: var(--text-muted);">-</span>`}
                        </td>
                        <td style="font-size: 12.5px; color: var(--text-muted); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${address}">
                            ${address !== '-' ? `<i class="fas fa-map-marker-alt" style="margin-right: 4px; color: var(--text-muted); font-size: 11px;"></i>${address}` : '-'}
                        </td>
                        <td style="font-size: 12.5px; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${notes}">
                            ${notes}
                        </td>
                        <td style="text-align: right;">
                            <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
                                <button class="btn btn-secondary btn-sm" onclick="CRM.openClientDetailsModal('${c.id}')" title="Batafsil ma'lumot, cheklar va bonuslar" style="padding: 6px 9px;">
                                    <i class="fas fa-eye" style="color: var(--accent)"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="Telephony.dial('${c.phone}')" title="Qo'ng'iroq qilish" style="padding: 6px 9px;">
                                    <i class="fas fa-phone-alt" style="color: var(--success)"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="CRM.openEditClientModal('${c.id}')" title="Tahrirlash" style="padding: 6px 9px;">
                                    <i class="fas fa-edit" style="color: var(--text-muted)"></i>
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="CRM.deleteClient('${c.id}')" title="O'chirish" style="padding: 6px 9px;">
                                    <i class="fas fa-trash-alt" style="color: var(--danger)"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        tableHtml += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.innerHTML = tableHtml;
        this.renderCustomerListPagination(filtered.length, totalPages);
    },

    renderCustomerListPagination: function(totalItems, totalPages) {
        const pagContainer = document.getElementById('crm-custlist-pagination');
        if (!pagContainer) return;

        if (totalItems === 0 || totalPages <= 1) {
            pagContainer.innerHTML = '';
            return;
        }

        const currentPage = this.customerListPage;
        const pageSize = this.customerListPageSize || 20;
        const startItem = (currentPage - 1) * pageSize + 1;
        const endItem = Math.min(currentPage * pageSize, totalItems);

        let html = `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 12px;">
                <div style="font-size: 13px; color: var(--text-muted);">
                    Jami <strong>${totalItems}</strong> ta mijozdan <strong>${startItem}</strong>–<strong>${endItem}</strong> ko'rsatilmoqda
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <button class="btn btn-secondary btn-sm" onclick="CRM.changeCustomerListPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} style="padding: 6px 12px;">
                        <i class="fas fa-chevron-left"></i> Oldingi
                    </button>
        `;

        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);
        if (startPage > 1) {
            html += `<button class="btn btn-secondary btn-sm" onclick="CRM.changeCustomerListPage(1)" style="min-width: 32px; padding: 6px 10px;">1</button>`;
            if (startPage > 2) html += `<span style="color: var(--text-muted); padding: 0 4px;">...</span>`;
        }

        for (let p = startPage; p <= endPage; p++) {
            if (p === currentPage) {
                html += `<button class="btn btn-primary btn-sm" style="min-width: 32px; padding: 6px 10px;">${p}</button>`;
            } else {
                html += `<button class="btn btn-secondary btn-sm" onclick="CRM.changeCustomerListPage(${p})" style="min-width: 32px; padding: 6px 10px;">${p}</button>`;
            }
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span style="color: var(--text-muted); padding: 0 4px;">...</span>`;
            html += `<button class="btn btn-secondary btn-sm" onclick="CRM.changeCustomerListPage(${totalPages})" style="min-width: 32px; padding: 6px 10px;">${totalPages}</button>`;
        }

        html += `
                    <button class="btn btn-secondary btn-sm" onclick="CRM.changeCustomerListPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} style="padding: 6px 12px;">
                        Keyingi <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        `;

        pagContainer.innerHTML = html;
    },

    changeCustomerListPage: function(page) {
        this.customerListPage = page;
        this.renderCustomersTable();
        const sec = document.getElementById('view-crm-customers');
        if (sec) {
            sec.scrollIntoView({ behavior: 'smooth' });
        }
    },

    openAddClientModal: function() {
        const form = document.getElementById('client-form');
        if (form) form.reset();
        const idInput = document.getElementById('client-id');
        if (idInput) idInput.value = '';
        const catInput = document.getElementById('client-category');
        if (catInput) catInput.value = 'ustalar';
        const title = document.getElementById('client-modal-title');
        if (title) title.innerHTML = '<i class="fas fa-user-plus" style="color: var(--accent); margin-right: 8px;"></i> Yangi Mijoz Qo\'shish';
        
        // Modal darhol (0ms) ochiladi
        showModal('client-modal');
        this.populateClientOperators();
        setTimeout(() => {
            const nameInput = document.getElementById('client-name');
            if (nameInput) nameInput.focus();
        }, 50);
    },

    _currentDetailClientId: null,

    openClientDetailsModal: async function(id) {
        let clients = this._clientsCache || [];
        let client = clients.find(c => c.id === id);
        if (!client) {
            try {
                clients = await DB.getClients();
                this._clientsCache = clients;
                client = clients.find(c => c.id === id);
            } catch(e) {}
        }

        if (!client) {
            alert("Mijoz ma'lumotlari topilmadi!");
            return;
        }

        this._currentDetailClientId = id;

        // Header ma'lumotlari
        const name = client.name || "Noma'lum Mijoz";
        const initial = name.trim().charAt(0).toUpperCase() || 'M';
        const avatarEl = document.getElementById('cdm-avatar');
        if (avatarEl) avatarEl.textContent = initial;

        const nameEl = document.getElementById('cdm-name');
        if (nameEl) nameEl.textContent = name;

        // Toifa badji
        const cat = (client.category || (client.company && client.company.trim() ? 'qurilish' : 'ustalar')).toLowerCase();
        const catBadgeEl = document.getElementById('cdm-category-badge');
        if (catBadgeEl) {
            if (cat === 'qurilish') {
                catBadgeEl.className = 'badge';
                catBadgeEl.style.cssText = 'background: rgba(139, 92, 246, 0.15); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.3); font-size: 12px; padding: 3px 8px; border-radius: 6px; font-weight: 600;';
                catBadgeEl.innerHTML = '<i class="fas fa-building" style="margin-right: 4px;"></i> Qurilish obyekti';
            } else {
                catBadgeEl.className = 'badge';
                catBadgeEl.style.cssText = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 12px; padding: 3px 8px; border-radius: 6px; font-weight: 600;';
                catBadgeEl.innerHTML = '<i class="fas fa-hammer" style="margin-right: 4px;"></i> Ustalar';
            }
        }

        // Shtrix-kod badji
        const barcodeVal = client.barcode || client.phone2 || '';
        const barcodeBadgeEl = document.getElementById('cdm-barcode-badge');
        if (barcodeBadgeEl) {
            if (barcodeVal) {
                barcodeBadgeEl.innerHTML = `<i class="fas fa-barcode"></i> ${barcodeVal}`;
                barcodeBadgeEl.style.display = 'inline-flex';
            } else {
                barcodeBadgeEl.style.display = 'none';
            }
        }

        // Sana
        const dateEl = document.getElementById('cdm-created-date');
        if (dateEl) {
            if (client.created_at) {
                const d = new Date(client.created_at);
                dateEl.innerHTML = `<i class="far fa-calendar-alt"></i> ${isNaN(d.getTime()) ? client.created_at : d.toLocaleDateString('uz-UZ')}`;
            } else {
                dateEl.innerHTML = '';
            }
        }

        // Tahrirlash tugmasi
        const editBtn = document.getElementById('cdm-btn-edit');
        if (editBtn) {
            editBtn.onclick = () => {
                closeModal('client-details-modal');
                CRM.openEditClientModal(id);
            };
        }

        // Bonus ko'rsatkich
        const bonus = Number(client.bonus || client.value || 0);
        const bonusDisp = document.getElementById('cdm-bonus-display');
        if (bonusDisp) {
            bonusDisp.textContent = `${bonus.toLocaleString('uz-UZ')} so'm`;
        }

        // Profil ma'lumotlari (Tab 2)
        const phone = client.phone || '-';
        const phone2 = (client.phone2 && client.phone2 !== client.barcode) ? client.phone2 : '-';
        const address = client.address || client.email || '-';
        const company = client.company || '-';
        const operator = client.operator || 'Tanlanmagan';
        const notes = client.notes || 'Izoh mavjud emas';

        if (document.getElementById('cdm-info-phone')) document.getElementById('cdm-info-phone').textContent = phone;
        if (document.getElementById('cdm-info-phone2')) document.getElementById('cdm-info-phone2').textContent = phone2;
        if (document.getElementById('cdm-info-barcode')) document.getElementById('cdm-info-barcode').textContent = barcodeVal || '-';
        if (document.getElementById('cdm-info-category')) {
            document.getElementById('cdm-info-category').textContent = cat === 'qurilish' ? 'Qurilish obyekti' : 'Ustalar';
        }
        if (document.getElementById('cdm-info-company')) document.getElementById('cdm-info-company').textContent = company;
        if (document.getElementById('cdm-info-operator')) document.getElementById('cdm-info-operator').textContent = operator;
        if (document.getElementById('cdm-info-address')) document.getElementById('cdm-info-address').textContent = address;
        if (document.getElementById('cdm-info-notes')) document.getElementById('cdm-info-notes').textContent = notes;

        // Dial buttons
        const callBtn1 = document.getElementById('cdm-call-btn1');
        if (callBtn1) {
            if (phone !== '-') {
                callBtn1.style.display = 'inline-flex';
                callBtn1.onclick = () => Telephony.dial(phone);
            } else {
                callBtn1.style.display = 'none';
            }
        }
        const callBtn2 = document.getElementById('cdm-call-btn2');
        if (callBtn2) {
            if (phone2 !== '-') {
                callBtn2.style.display = 'inline-flex';
                callBtn2.onclick = () => Telephony.dial(phone2);
            } else {
                callBtn2.style.display = 'none';
            }
        }

        // Reset bonus action form
        this.toggleBonusAction(null);

        // Boshlang'ich tab
        this.switchClientDetailTab('receipts');

        // Modalni darhol ochish
        showModal('client-details-modal');

        // Cheklar va bonus tarixini yuklash
        this.loadClientReceipts(client);
        this.renderClientBonusHistory(client);
        this.checkAndTrackRegosSync();
    },

    switchClientDetailTab: function(tabName) {
        const tabs = ['receipts', 'profile', 'bonushistory'];
        tabs.forEach(t => {
            const btn = document.getElementById(`cdm-tab-btn-${t}`);
            const content = document.getElementById(`cdm-tab-content-${t}`);
            if (btn) {
                if (t === tabName) {
                    btn.className = 'tab-btn active';
                    btn.style.borderBottom = '2px solid var(--accent)';
                    btn.style.color = 'var(--accent)';
                } else {
                    btn.className = 'tab-btn';
                    btn.style.borderBottom = '2px solid transparent';
                    btn.style.color = 'var(--text-muted)';
                }
            }
            if (content) {
                content.style.display = (t === tabName) ? 'block' : 'none';
            }
        });
    },

    toggleBonusAction: function(actionType) {
        const box = document.getElementById('cdm-bonus-action-box');
        if (!box) return;

        if (!actionType) {
            box.style.display = 'none';
            return;
        }

        const currentType = document.getElementById('cdm-bonus-action-type')?.value;
        if (box.style.display === 'block' && currentType === actionType) {
            box.style.display = 'none';
            return;
        }

        box.style.display = 'block';
        const typeInput = document.getElementById('cdm-bonus-action-type');
        if (typeInput) typeInput.value = actionType;

        const titleEl = document.getElementById('cdm-bonus-action-title');
        const labelEl = document.getElementById('cdm-bonus-amount-label');
        const saveBtn = document.getElementById('cdm-btn-save-bonus');
        const amountInput = document.getElementById('cdm-bonus-amount');
        const noteInput = document.getElementById('cdm-bonus-note');

        if (amountInput) amountInput.value = '';
        if (noteInput) noteInput.value = '';

        if (actionType === 'add') {
            if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus-circle" style="color: #10b981;"></i> Bonus Qo\'shish';
            if (labelEl) labelEl.innerHTML = 'Qo\'shiladigan summa (so\'m) <span style="color:var(--danger)">*</span>';
            if (saveBtn) {
                saveBtn.className = 'btn btn-sm';
                saveBtn.style.cssText = 'background: #10b981; color: #fff; padding: 6px 16px; font-weight: 600; border: none; cursor: pointer;';
                saveBtn.innerHTML = '<i class="fas fa-plus-circle" style="margin-right: 6px;"></i> Bonus qo\'shish';
            }
        } else if (actionType === 'deduct') {
            if (titleEl) titleEl.innerHTML = '<i class="fas fa-minus-circle" style="color: #ef4444;"></i> Bonus Yechish';
            if (labelEl) labelEl.innerHTML = 'Yechiladigan summa (so\'m) <span style="color:var(--danger)">*</span>';
            if (saveBtn) {
                saveBtn.className = 'btn btn-sm';
                saveBtn.style.cssText = 'background: #ef4444; color: #fff; padding: 6px 16px; font-weight: 600; border: none; cursor: pointer;';
                saveBtn.innerHTML = '<i class="fas fa-minus-circle" style="margin-right: 6px;"></i> Bonus yechish';
            }
        } else {
            if (titleEl) titleEl.innerHTML = '<i class="fas fa-sliders-h" style="color: var(--accent);"></i> Bonus Balansini To\'g\'rilash';
            if (labelEl) labelEl.innerHTML = 'Yangi bonus balansi (so\'m) <span style="color:var(--danger)">*</span>';
            if (saveBtn) {
                saveBtn.className = 'btn btn-primary btn-sm';
                saveBtn.style.cssText = 'padding: 6px 16px; font-weight: 600; cursor: pointer;';
                saveBtn.innerHTML = '<i class="fas fa-save" style="margin-right: 6px;"></i> Balansni saqlash';
            }
        }

        setTimeout(() => {
            if (amountInput) amountInput.focus();
        }, 50);
    },

    setBonusQuickAmount: function(amt) {
        const input = document.getElementById('cdm-bonus-amount');
        if (!input) return;
        const current = parseFloat(input.value) || 0;
        input.value = current + amt;
    },

    submitBonusAdjustment: async function(event) {
        if (event) event.preventDefault();
        const clientId = this._currentDetailClientId;
        if (!clientId) return;

        let clients = this._clientsCache || [];
        let client = clients.find(c => c.id === clientId);
        if (!client) return;

        const actionType = document.getElementById('cdm-bonus-action-type')?.value || 'add';
        const amount = parseFloat(document.getElementById('cdm-bonus-amount')?.value);
        const note = document.getElementById('cdm-bonus-note')?.value.trim() || '';

        if (isNaN(amount) || amount <= 0) {
            alert("Iltimos, musbat summa kiriting!");
            return;
        }

        const oldBonus = Number(client.bonus || client.value || 0);
        let newBonus = oldBonus;

        if (actionType === 'add') {
            newBonus = oldBonus + amount;
        } else if (actionType === 'deduct') {
            if (amount > oldBonus) {
                if (!confirm(`Yechilayotgan summa (${amount.toLocaleString('uz-UZ')} so'm) mijozning joriy balansidan (${oldBonus.toLocaleString('uz-UZ')} so'm) ko'p! Davom ettirilsinmi?`)) {
                    return;
                }
            }
            newBonus = Math.max(0, oldBonus - amount);
        } else if (actionType === 'set') {
            newBonus = amount;
        }

        const saveBtn = document.getElementById('cdm-btn-save-bonus');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saqlanmoqda...';
        }

        try {
            // Yangi bonus tarixi yozuvi
            const record = {
                id: 'bh_' + Date.now(),
                date: new Date().toISOString(),
                type: actionType,
                amount: amount,
                prev_bonus: oldBonus,
                new_bonus: newBonus,
                note: note || (actionType === 'add' ? "Bonus qo'shildi" : (actionType === 'deduct' ? "Bonus yechildi" : "Balans to'g'rilandi")),
                user: (window.currentUser && (window.currentUser.name || window.currentUser.username)) || 'Operator'
            };

            if (!Array.isArray(client.bonus_history)) {
                client.bonus_history = [];
            }
            client.bonus_history.unshift(record);

            client.bonus = newBonus;
            client.value = newBonus;

            // UI-ni darhol yangilash (0ms)
            const bonusDisp = document.getElementById('cdm-bonus-display');
            if (bonusDisp) bonusDisp.textContent = `${newBonus.toLocaleString('uz-UZ')} so'm`;

            this.renderClientBonusHistory(client);
            this.toggleBonusAction(null);
            this.renderCustomersTable();

            // Backend va Supabase-ga saqlash
            await DB.saveClient(client);

        } catch(err) {
            alert("Bonusni saqlashda xatolik: " + err.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-check" style="margin-right: 6px;"></i> Saqlash';
            }
        }
    },

    renderClientBonusHistory: function(client) {
        const container = document.getElementById('cdm-bonus-history-list');
        if (!container) return;

        const history = client.bonus_history || [];
        if (!Array.isArray(history) || history.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 13px;">
                    <i class="fas fa-coins" style="font-size: 28px; opacity: 0.3; display: block; margin-bottom: 8px;"></i>
                    Hozircha bonus operatsiyalari tarixi mavjud emas
                </div>
            `;
            return;
        }

        let html = '';
        history.forEach(item => {
            const dateObj = new Date(item.date);
            const dateStr = isNaN(dateObj.getTime()) ? item.date : dateObj.toLocaleString('uz-UZ', { hour12: false });
            const amt = Number(item.amount || 0).toLocaleString('uz-UZ');
            const prev = Number(item.prev_bonus || 0).toLocaleString('uz-UZ');
            const next = Number(item.new_bonus || 0).toLocaleString('uz-UZ');

            let badgeHtml = '';
            if (item.type === 'add') {
                badgeHtml = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-size: 12px;"><i class="fas fa-plus"></i> ${amt} so'm</span>`;
            } else if (item.type === 'deduct') {
                badgeHtml = `<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-size: 12px;"><i class="fas fa-minus"></i> ${amt} so'm</span>`;
            } else {
                badgeHtml = `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 700; padding: 3px 8px; border-radius: 6px; font-size: 12px;"><i class="fas fa-sliders-h"></i> = ${amt} so'm</span>`;
            }

            html += `
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            ${badgeHtml}
                            <span style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">${item.note || 'Bonus amali'}</span>
                        </div>
                        <div style="font-size: 11.5px; color: var(--text-muted); display: flex; gap: 12px;">
                            <span><i class="far fa-clock"></i> ${dateStr}</span>
                            <span>Balans: ${prev} &rarr; <strong style="color: var(--text-main);">${next} so'm</strong></span>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); text-align: right;">
                        <i class="fas fa-user-shield" style="margin-right: 3px;"></i> ${item.user || 'Admin'}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    loadClientReceipts: async function(client) {
        const listEl = document.getElementById('cdm-receipts-list');
        const countEl = document.getElementById('cdm-receipts-count');
        const badgeEl = document.getElementById('cdm-tab-receipts-badge');
        const totalPurchasesEl = document.getElementById('cdm-total-purchases');

        if (listEl) {
            listEl.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;"><i class="fas fa-spinner fa-spin"></i> Xarid cheklari yuklanmoqda...</div>';
        }

        try {
            const settings = AppStorage.load().settings || {};
            const currency = settings.currency || "so'm";

            let clientReceipts = [];
            try {
                const params = new URLSearchParams();
                if (client.phone) params.append('phone', client.phone);
                if (client.phone2) params.append('phone2', client.phone2);
                if (client.barcode) params.append('barcode', client.barcode);

                const resp = await fetch(`/api/clients/${encodeURIComponent(client.id)}/receipts?${params.toString()}`);
                if (resp.ok) {
                    const data = await resp.json();
                    if (data && data.ok && Array.isArray(data.receipts)) {
                        clientReceipts = data.receipts;
                    }
                }
            } catch (e_api) {
                console.warn("Mijoz cheklarini API orqali yuklashda xatolik:", e_api);
            }

            // Mahalliy bazadan qidirish (agar API dan bo'sh kelsa yoki oflayn bo'lsa)
            if (!clientReceipts || clientReceipts.length === 0) {
                const receipts = await DB.getReceipts();
                const cleanPhone = (p) => p ? String(p).replace(/\D/g, '') : '';
                const p1 = cleanPhone(client.phone);
                const p2 = cleanPhone(client.phone2);
                const bc = client.barcode ? String(client.barcode).trim() : '';

                const matches = (rec) => {
                    let items = rec.items || [];
                    if (typeof items === 'string') {
                        try { items = JSON.parse(items); } catch(e) { items = []; }
                    }

                    if (items && typeof items === 'object' && !Array.isArray(items)) {
                        const recPhone = cleanPhone(items.customer_phone);
                        if (recPhone) {
                            if (p1 && recPhone.length >= 9 && p1.length >= 9 && recPhone.slice(-9) === p1.slice(-9)) return true;
                            if (p2 && recPhone.length >= 9 && p2.length >= 9 && cleanPhone(p2).length >= 9 && recPhone.slice(-9) === cleanPhone(p2).slice(-9)) return true;
                            if (bc && bc.length >= 9 && recPhone.slice(-9) === cleanPhone(bc).slice(-9)) return true;
                        }
                        if (bc && items.card_barcode && String(items.card_barcode).trim() === bc) return true;
                        if (items.customer_id && (items.customer_id === client.id || items.customer_id === client.phone)) return true;
                    }

                    if (rec.customer_phone) {
                        const recPhone = cleanPhone(rec.customer_phone);
                        if (p1 && recPhone.length >= 9 && p1.length >= 9 && recPhone.slice(-9) === p1.slice(-9)) return true;
                        if (p2 && recPhone.length >= 9 && p2.length >= 9 && recPhone.slice(-9) === cleanPhone(p2).slice(-9)) return true;
                    }
                    if (bc && rec.card_barcode && String(rec.card_barcode).trim() === bc) return true;

                    return false;
                };

                clientReceipts = receipts.filter(matches);
            }

            clientReceipts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            const totalSpend = clientReceipts.reduce((acc, r) => acc + (parseFloat(r.total_amount) || 0), 0);

            if (countEl) countEl.textContent = `${clientReceipts.length} ta`;
            if (badgeEl) badgeEl.textContent = `${clientReceipts.length}`;
            if (totalPurchasesEl) totalPurchasesEl.textContent = `${totalSpend.toLocaleString('uz-UZ')} ${currency}`;

            if (!listEl) return;

            if (clientReceipts.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-size: 13.5px; background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 12px;">
                        <i class="fas fa-shopping-basket" style="font-size: 32px; opacity: 0.3; display: block; margin-bottom: 10px;"></i>
                        <span>Ushbu mijoz bo'yicha biriktirilgan cheklar topilmadi.</span>
                        <div style="margin-top: 8px; font-size: 12px;">
                            Agar mijoz REGOS orqali xarid qilgan bo'lsa, yuqoridagi <strong>«REGOS-dan yangilash»</strong> tugmasini bosing.
                        </div>
                    </div>
                `;
                return;
            }

            let html = '';
            clientReceipts.forEach((rec) => {
                let items = rec.items || [];
                if (typeof items === 'string') {
                    try { items = JSON.parse(items); } catch(e) { items = []; }
                }

                let products = [];
                let sellerName = '';
                if (items && !Array.isArray(items) && typeof items === 'object') {
                    products = items.products || [];
                    sellerName = items.seller_name || '';
                } else if (Array.isArray(items)) {
                    products = items;
                }

                const dateObj = new Date(rec.created_at);
                const dateStr = isNaN(dateObj.getTime()) ? rec.created_at : dateObj.toLocaleString('uz-UZ', { hour12: false });
                const recCode = rec.code || 'CH-' + String(rec.id).substring(0, 8);
                const payType = rec.payment_type || 'Naqd';
                const payBadgeClass = payType === 'Karta' 
                    ? 'badge-primary' 
                    : (payType === 'Elektron' ? 'badge-success' : 'badge-secondary');

                let compName = '';
                if (rec.company_id) {
                    compName = rec.company_id === 'giperbrendstroy' ? 'Giper Brend Stroy' : (rec.company_id === 'protechctiy' ? 'Protech City' : rec.company_id);
                }

                let productsRows = '';
                products.forEach(p => {
                    const pQty = p.quantity || p.qty || 1;
                    const pPrice = parseFloat(p.price) || 0;
                    const pTotal = p.total || (pPrice * pQty);
                    productsRows += `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                            <td style="padding: 6px 8px; color: var(--text-main); font-size: 12.5px;">
                                <strong>${p.name || 'Noma\'lum mahsulot'}</strong>
                                ${p.sku ? `<span style="font-size: 10.5px; color: var(--text-muted); font-family: monospace; display: block;">SKU: ${p.sku}</span>` : ''}
                            </td>
                            <td style="padding: 6px 8px; text-align: center; color: var(--text-muted); font-size: 12px; font-weight: 600;">${pQty}</td>
                            <td style="padding: 6px 8px; text-align: right; color: var(--text-muted); font-size: 12px;">${pPrice.toLocaleString('uz-UZ')} ${currency}</td>
                            <td style="padding: 6px 8px; text-align: right; color: var(--text-main); font-weight: 600; font-size: 12.5px;">${pTotal.toLocaleString('uz-UZ')} ${currency}</td>
                        </tr>
                    `;
                });

                html += `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; transition: var(--transition);">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-weight: 700; color: var(--accent); font-family: monospace; font-size: 13.5px;">
                                    <i class="fas fa-receipt" style="margin-right: 4px;"></i> ${recCode}
                                </span>
                                <span class="badge ${payBadgeClass}" style="font-size: 11px; padding: 2px 7px; border-radius: 5px; font-weight: 600;">
                                    ${payType}
                                </span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="color: var(--text-muted); font-size: 12px;">
                                    <i class="far fa-clock" style="margin-right: 4px;"></i> ${dateStr}
                                </span>
                                <span style="font-size: 15px; font-weight: 800; color: #10b981; font-family: monospace;">
                                    ${(parseFloat(rec.total_amount) || 0).toLocaleString('uz-UZ')} ${currency}
                                </span>
                            </div>
                        </div>

                        ${products.length > 0 ? `
                            <div style="background: rgba(0,0,0,0.15); border-radius: 8px; padding: 6px 10px; overflow-x: auto;">
                                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                    <thead>
                                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 11px; text-transform: uppercase;">
                                            <th style="text-align: left; padding: 4px 8px;">Mahsulot</th>
                                            <th style="text-align: center; padding: 4px 8px; width: 60px;">Miqdor</th>
                                            <th style="text-align: right; padding: 4px 8px; width: 90px;">Narx</th>
                                            <th style="text-align: right; padding: 4px 8px; width: 110px;">Jami</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${productsRows}
                                    </tbody>
                                </table>
                            </div>
                        ` : `
                            <div style="font-size: 12px; color: var(--text-muted); font-style: italic;">
                                Maxsulotlar ro'yxati biriktirilmagan
                            </div>
                        `}

                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; color: var(--text-muted); border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 6px;">
                            <span>
                                ${compName ? `<span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-muted); margin-right: 6px; font-size: 10px; text-transform: uppercase;"><i class="fas fa-store" style="font-size: 9px; margin-right: 3px;"></i>${compName}</span>` : ''}
                                ${rec.cashier_name ? `<i class="fas fa-user" style="margin-right: 3px;"></i> Kassir: ${rec.cashier_name}` : ''} ${sellerName ? `| Sotuvchi: ${sellerName}` : ''}
                            </span>
                            <span>Mahsulotlar: <strong>${products.length} ta pozitsiya</strong></span>
                        </div>
                    </div>
                `;
            });

            listEl.innerHTML = html;

        } catch (err) {
            console.error("Mijoz cheklarini yuklashda xatolik:", err);
            if (listEl) {
                listEl.innerHTML = '<div style="text-align: center; padding: 16px; color: var(--danger); font-size: 13px;">Cheklarni yuklashda xatolik yuz berdi</div>';
            }
        }
    },

    reloadCurrentClientReceipts: async function() {
        if (!this._currentDetailClientId) return;
        const icon = document.getElementById('cdm-receipts-refresh-icon');
        if (icon) icon.classList.add('fa-spin');
        
        let clients = this._clientsCache || [];
        let client = clients.find(c => c.id === this._currentDetailClientId);
        if (!client) {
            try {
                clients = await DB.getClients();
                this._clientsCache = clients;
                client = clients.find(c => c.id === this._currentDetailClientId);
            } catch(e) {}
        }
        if (client) {
            await this.loadClientReceipts(client);
        }
        if (icon) icon.classList.remove('fa-spin');
    },

    openEditClientModal: async function(id) {
        let clients = this._clientsCache || [];
        let client = clients.find(c => c.id === id);
        if (!client) {
            try {
                clients = await DB.getClients();
                this._clientsCache = clients;
                client = clients.find(c => c.id === id);
            } catch(e) {}
        }

        if (!client) {
            alert("Mijoz ma'lumotlari topilmadi!");
            return;
        }

        const idInput = document.getElementById('client-id');
        if (idInput) idInput.value = client.id;
        const nameInput = document.getElementById('client-name');
        if (nameInput) nameInput.value = client.name || '';
        const compInput = document.getElementById('client-company');
        if (compInput) compInput.value = client.company || '';
        const catInput = document.getElementById('client-category');
        if (catInput) catInput.value = client.category || (client.company && client.company.trim() ? 'qurilish' : 'ustalar');
        const phoneInput = document.getElementById('client-phone');
        if (phoneInput) phoneInput.value = client.phone || '';
        const barcodeInput = document.getElementById('client-barcode');
        if (barcodeInput) barcodeInput.value = client.barcode || client.phone2 || '';
        const bonusInput = document.getElementById('client-bonus');
        if (bonusInput) bonusInput.value = client.bonus || client.value || '';
        const phone2Input = document.getElementById('client-phone2');
        if (phone2Input) phone2Input.value = (client.phone2 && client.phone2 !== client.barcode) ? client.phone2 : '';
        const addrInput = document.getElementById('client-address');
        if (addrInput) addrInput.value = client.email || client.address || '';
        const notesInput = document.getElementById('client-notes');
        if (notesInput) notesInput.value = client.notes || '';

        const title = document.getElementById('client-modal-title');
        if (title) title.innerHTML = '<i class="fas fa-user-edit" style="color: var(--accent); margin-right: 8px;"></i> Mijoz Ma\'lumotlarini Tahrirlash';

        // Modal darhol ochiladi
        showModal('client-modal');
        this.populateClientOperators(client.operator);
    },

    _operatorsCache: null,
    populateClientOperators: async function(selectedOperator = '') {
        const select = document.getElementById('client-operator');
        if (!select) return;
        
        const renderOpts = (emps) => {
            select.innerHTML = '<option value="">Tanlanmagan</option>';
            emps.forEach(emp => {
                if (emp.name) {
                    const opt = document.createElement('option');
                    opt.value = emp.name;
                    opt.textContent = `${emp.name} (${emp.role || 'Xodim'})`;
                    if (emp.name === selectedOperator) opt.selected = true;
                    select.appendChild(opt);
                }
            });
        };

        if (this._operatorsCache && this._operatorsCache.length > 0) {
            renderOpts(this._operatorsCache);
            return;
        }

        try {
            const emps = await DB.getEmployees();
            if (Array.isArray(emps) && emps.length > 0) {
                this._operatorsCache = emps;
                renderOpts(emps);
            }
        } catch(e) {}
    },

    saveClientForm: async function(event) {
        if (event) event.preventDefault();
        const id = document.getElementById('client-id')?.value.trim();
        const name = document.getElementById('client-name')?.value.trim();
        const company = document.getElementById('client-company')?.value.trim() || '';
        const category = document.getElementById('client-category')?.value || (company ? 'qurilish' : 'ustalar');
        const phone = document.getElementById('client-phone')?.value.trim();
        const barcode = document.getElementById('client-barcode')?.value.trim() || '';
        const bonus = parseFloat(document.getElementById('client-bonus')?.value) || 0;
        const phone2 = document.getElementById('client-phone2')?.value.trim() || '';
        const address = document.getElementById('client-address')?.value.trim() || '';
        const notes = document.getElementById('client-notes')?.value.trim() || '';
        const operator = document.getElementById('client-operator')?.value || '';

        if (!name || !phone) {
            alert("Iltimos, mijoz ismi va asosiy telefon raqamini kiriting!");
            return;
        }

        const saveBtn = document.getElementById('btn-save-client');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saqlanmoqda...';
        }

        try {
            const clientData = {
                name,
                company,
                category,
                phone,
                phone2: phone2 || barcode,
                barcode: barcode || phone2,
                bonus,
                value: bonus,
                email: address,
                notes,
                operator,
                source: 'client_directory',
                status: 'client'
            };
            if (id) {
                clientData.id = id;
                const existing = (this._clientsCache || []).find(c => c.id === id);
                if (existing && existing.created_at) {
                    clientData.created_at = existing.created_at;
                }
            } else {
                clientData.id = 'client_' + Date.now();
                clientData.created_at = new Date().toISOString();
            }

            closeModal('client-modal');

            // Mahalliy keshni darhol yangilash (0ms kutish)
            if (!this._clientsCache) this._clientsCache = [];
            const exIdx = this._clientsCache.findIndex(c => c.id === clientData.id);
            if (exIdx > -1) {
                this._clientsCache[exIdx] = { ...this._clientsCache[exIdx], ...clientData };
            } else {
                this._clientsCache.unshift(clientData);
            }
            this.renderCustomersTable();

            await DB.saveClient(clientData);
            await this.loadCustomersData(true);
        } catch(e) {
            alert("Mijozni saqlashda xatolik yuz berdi: " + e.message);
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save" style="margin-right: 6px;"></i> Saqlash';
            }
        }
    },

    deleteClient: async function(id) {
        if (!confirm("Haqiqatan ham ushbu mijozni o'chirmoqchimisiz?")) return;
        try {
            if (this._clientsCache) {
                this._clientsCache = this._clientsCache.filter(c => c.id !== id);
                this.renderCustomersTable();
            }
            await DB.deleteClient(id);
            await this.loadCustomersData(true);
        } catch(e) {
            alert("Mijozni o'chirishda xatolik: " + e.message);
        }
    },

    // --- REGOS XARIDOR KARTASINI QIDIRISH VA QO'SHISH ---
    _regosSearchResultsCache: [],

    openRegosCardSearchModal: function() {
        const input = document.getElementById('regos-card-search-input');
        if (input) input.value = '';
        const container = document.getElementById('regos-search-results-container');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 40px 10px;">
                    <i class="fas fa-qrcode" style="font-size: 38px; color: rgba(255,255,255,0.1); margin-bottom: 12px; display: block;"></i>
                    <span style="font-size: 13.5px;">Shtrix-kodni skaner orqali o'qiting yoki yozib "Qidirish" tugmasini bosing</span>
                </div>
            `;
        }
        showModal('regos-card-search-modal');
        setTimeout(() => {
            if (input) input.focus();
        }, 50);
    },

    onRegosSearchKeydown: function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.searchRegosCards();
        }
    },

    searchRegosCards: async function() {
        const input = document.getElementById('regos-card-search-input');
        const query = input ? input.value.trim() : '';
        if (!query) {
            alert("Iltimos, shtrix-kod yoki telefon raqamini kiriting!");
            if (input) input.focus();
            return;
        }

        const btn = document.getElementById('btn-regos-search-submit');
        const container = document.getElementById('regos-search-results-container');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Qidirilmoqda...';
        }
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 35px 10px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 28px; color: #38bdf8; margin-bottom: 12px; display: block;"></i>
                    <span>REGOS tizimidan xaridor kartasi qidirilmoqda...</span>
                </div>
            `;
        }

        try {
            const res = await fetch(`/api/integration/regos/search-cards?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (!res.ok || !data.ok) {
                throw new Error(data.detail || "REGOS bilan bog'lanishda xatolik yuz berdi");
            }

            const cards = data.result || [];
            this._regosSearchResultsCache = cards;

            if (cards.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 35px 15px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">
                        <i class="fas fa-search-minus" style="font-size: 32px; color: var(--warning); margin-bottom: 10px; display: block;"></i>
                        <h4 style="color: var(--text-main); margin-bottom: 6px;">Hech qanday karta topilmadi</h4>
                        <p style="font-size: 13px; margin: 0;">«${query}» shtrix-kodi bo'yicha REGOS-da xaridor kartasi topilmadi.</p>
                    </div>
                `;
                return;
            }

            let html = `
                <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13px; color: var(--text-muted);">Topilgan kartalar: <strong style="color: var(--text-main);">${cards.length} ta</strong></span>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto; padding-right: 4px;">
            `;

            cards.forEach(card => {
                const bonusFormatted = Number(card.bonus || 0).toLocaleString('uz-UZ');
                const barcodeBadge = card.barcode ? `
                    <span style="font-family: monospace; font-size: 12.5px; font-weight: 600; background: rgba(56, 189, 248, 0.12); color: #38bdf8; padding: 3px 8px; border-radius: 5px; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fas fa-barcode"></i> ${card.barcode}
                    </span>
                ` : '<span style="color: var(--text-muted);">-</span>';

                const grpLower = ((card.group || '') + ' ' + (card.name || '')).toLowerCase();
                const isQurilish = grpLower.includes('qurilish') || grpLower.includes('obyekt') || grpLower.includes('stroy') || grpLower.includes('mchj') || grpLower.includes('ooo');
                const defaultCat = isQurilish ? 'qurilish' : 'ustalar';

                html += `
                    <div class="card" style="padding: 14px 16px; margin: 0; background: rgba(255,255,255,0.03); border: 1px solid ${card.is_already_added ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)'}; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                        <div style="flex-grow: 1; min-width: 220px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                                <strong style="font-size: 15px; color: var(--text-main);">${card.name}</strong>
                                ${barcodeBadge}
                            </div>
                            <div style="display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--text-muted);">
                                <span><i class="fas fa-phone-alt" style="color: var(--success); font-size: 11px; margin-right: 4px;"></i> ${card.phone || '-'}</span>
                                <span><i class="fas fa-coins" style="color: #f59e0b; font-size: 11px; margin-right: 4px;"></i> Bonus: <strong style="color: #10b981;">${bonusFormatted} so'm</strong></span>
                                ${card.group ? `<span><i class="fas fa-layer-group" style="font-size: 11px; margin-right: 4px;"></i> ${card.group}</span>` : ''}
                            </div>
                        </div>
                        <div id="regos-action-box-${card.regos_card_id}">
                            ${card.is_already_added ? `
                                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 7px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
                                    <i class="fas fa-check-circle"></i> Qo'shilgan
                                </span>
                            ` : `
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <select id="regos-cat-${card.regos_card_id}" class="form-control" style="height: 36px; padding: 4px 8px; font-size: 12px; width: 145px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: var(--text-main); border-radius: 6px;">
                                        <option value="ustalar" ${defaultCat === 'ustalar' ? 'selected' : ''}>Ustalar</option>
                                        <option value="qurilish" ${defaultCat === 'qurilish' ? 'selected' : ''}>Qurilish obyekti</option>
                                    </select>
                                    <button class="btn btn-primary btn-sm" id="btn-add-card-${card.regos_card_id}" onclick="CRM.addRegosCardToClients(${card.regos_card_id})" style="padding: 8px 16px; font-size: 13px; display: inline-flex; align-items: center; gap: 6px;">
                                        <i class="fas fa-plus"></i> Ro'yxatga Qo'shish
                                    </button>
                                </div>
                            `}
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
            container.innerHTML = html;
        } catch (err) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--danger); padding: 25px 15px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 28px; margin-bottom: 8px; display: block;"></i>
                    <p style="font-size: 13.5px; margin: 0;">${err.message}</p>
                </div>
            `;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-search" style="margin-right: 6px;"></i> Qidirish';
            }
        }
    },

    addRegosCardToClients: async function(regosCardId) {
        const cards = this._regosSearchResultsCache || [];
        const card = cards.find(c => c.regos_card_id === regosCardId);
        if (!card) {
            alert("Karta ma'lumotlari topilmadi!");
            return;
        }

        const cat = document.getElementById(`regos-cat-${regosCardId}`)?.value || 'ustalar';
        const addBtn = document.getElementById(`btn-add-card-${regosCardId}`);
        if (addBtn) {
            addBtn.disabled = true;
            addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Qo\'shilmoqda...';
        }

        try {
            const clientPayload = {
                id: card.id || `regos_card_${card.regos_card_id}`,
                name: card.name,
                category: cat,
                phone: card.phone || card.raw_phone || card.barcode,
                phone2: card.barcode || '',
                barcode: card.barcode || '',
                bonus: card.bonus || 0,
                debt: card.debt || 0,
                address: card.address || '',
                operator: 'REGOS',
                notes: card.group ? `REGOS Guruh: ${card.group}` : 'REGOS Xaridor kartasi',
                source: 'client_directory',
                status: 'client',
                created_at: new Date().toISOString()
            };

            // Mahalliy keshni darhol yangilash (0ms)
            if (!this._clientsCache) this._clientsCache = [];
            const exIdx = this._clientsCache.findIndex(c => c.id === clientPayload.id);
            if (exIdx > -1) {
                this._clientsCache[exIdx] = { ...this._clientsCache[exIdx], ...clientPayload };
            } else {
                this._clientsCache.unshift(clientPayload);
            }
            this.renderCustomersTable();

            await DB.saveClient(clientPayload);
            card.is_already_added = true;

            const actionBox = document.getElementById(`regos-action-box-${regosCardId}`);
            if (actionBox) {
                actionBox.innerHTML = `
                    <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 7px 14px; border-radius: 6px; font-size: 12.5px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fas fa-check-circle"></i> Qo'shildi
                    </span>
                `;
            }
        } catch (err) {
            alert("Mijozni ro'yxatga qo'shishda xatolik: " + err.message);
            if (addBtn) {
                addBtn.disabled = false;
                addBtn.innerHTML = '<i class="fas fa-plus"></i> Ro\'yxatga Qo\'shish';
            }
        }
    },

    exportClientsToCSV: async function() {
        try {
            const clients = await DB.getClients();
            if (!clients || clients.length === 0) {
                alert("Eksport qilish uchun mijozlar topilmadi.");
                return;
            }

            const headers = ["T/r", "Mijoz (F.I.Sh)", "Toifasi", "Shtrix-kod (Karta)", "Asosiy telefon", "Bonus balansi (so'm)", "Kompaniya / Obyekt", "Qo'shimcha telefon", "Manzil", "Izoh", "Qo'shilgan sana"];
            const rows = clients.map((c, index) => {
                let dateStr = '';
                if (c.created_at) {
                    try { dateStr = new Date(c.created_at).toISOString().slice(0, 10); }
                    catch(e) { dateStr = c.created_at; }
                }

                const catName = (c.category === 'qurilish' || (!c.category && c.company && c.company.trim())) ? 'Qurilish obyekti' : 'Ustalar';

                return [
                    index + 1,
                    `"${(c.name || '').replace(/"/g, '""')}"`,
                    `"${catName}"`,
                    `"${(c.barcode || c.phone2 || '').replace(/"/g, '""')}"`,
                    `"${(c.phone || '').replace(/"/g, '""')}"`,
                    c.bonus || c.value || 0,
                    `"${(c.company || '').replace(/"/g, '""')}"`,
                    `"${(c.phone2 && c.phone2 !== c.barcode ? c.phone2 : '').replace(/"/g, '""')}"`,
                    `"${(c.email || c.address || '').replace(/"/g, '""')}"`,
                    `"${(c.notes || '').replace(/"/g, '""')}"`,
                    `"${dateStr}"`
                ].join(';');
            });

            const csvContent = "\uFEFF" + headers.join(';') + "\r\n" + rows.join("\r\n");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `Mijozlar_royxati_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("CSV eksport qilishda xatolik:", e);
            alert("Eksport qilishda xatolik: " + e.message);
        }
    }
};
