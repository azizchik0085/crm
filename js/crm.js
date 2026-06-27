// ERP & CRM Tizimi - CRM Moduli (Mijozlar, Sotuvlar va Qo'ng'iroqlar) - SUPABASE & TELEFONIYA BILAN

window.CRM = {
    activeTab: 'kanban', // 'kanban', 'list' yoki 'calls'
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
            if (window.App.currentView === 'crm' && !this.isDragging && this.activeTab !== 'calls') {
                this.render();
            }
        }, 5000);
    },

    setupEventListeners: function() {
        // Tablarni almashtirish
        const kanbanTabBtn = document.getElementById('crm-tab-kanban');
        const listTabBtn = document.getElementById('crm-tab-list');
        const callsTabBtn = document.getElementById('crm-tab-calls');
        
        if (kanbanTabBtn && listTabBtn && callsTabBtn) {
            kanbanTabBtn.onclick = () => {
                this.activeTab = 'kanban';
                this.updateTabButtons(kanbanTabBtn, listTabBtn, callsTabBtn);
                this.render();
            };

            listTabBtn.onclick = () => {
                this.activeTab = 'list';
                this.updateTabButtons(listTabBtn, kanbanTabBtn, callsTabBtn);
                this.render();
            };

            callsTabBtn.onclick = () => {
                this.activeTab = 'calls';
                this.updateTabButtons(callsTabBtn, kanbanTabBtn, listTabBtn);
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
    },

    updateTabButtons: function(activeBtn, secondaryBtn1, secondaryBtn2) {
        activeBtn.classList.add('btn-primary');
        activeBtn.classList.remove('btn-secondary');
        secondaryBtn1.classList.add('btn-secondary');
        secondaryBtn1.classList.remove('btn-primary');
        secondaryBtn2.classList.add('btn-secondary');
        secondaryBtn2.classList.remove('btn-primary');
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

        document.getElementById('crm-search').placeholder = "Mijoz ismi, telefon yoki operator bo'yicha qidirish...";

        // Supabase yoki keshdan mijozlarni olamiz
        const customers = await DB.getCustomers();
        const settings = AppStorage.load().settings || {};
        const amocrmMap = settings.amocrmOperatorsMap || {};
        
        // Xodimlar ro'yxatini olib, ID-larni ismlarga o'giramiz
        let employeeIdToName = {};
        const activeUserId = localStorage.getItem('activeUserId') || 'admin';
        let loggedInEmployeeName = '';
        
        try {
            const employeesList = await DB.getEmployees();
            employeesList.forEach(e => {
                employeeIdToName[e.id] = e.name;
                if (e.id === activeUserId) {
                    loggedInEmployeeName = e.name;
                }
            });
        } catch (e) {
            console.error("Failed to load employees for operator mapping:", e);
        }

        // Display/hide the filter dropdown based on whether user is admin
        const operatorFilterContainer = document.getElementById('crm-operator-filter-container');
        if (operatorFilterContainer) {
            if (activeUserId === 'admin') {
                operatorFilterContainer.style.setProperty('display', 'block', 'important');
            } else {
                operatorFilterContainer.style.setProperty('display', 'none', 'important');
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
        
        const selectedOperator = operatorFilterSelect ? operatorFilterSelect.value : '';
        
        // Qidiruv bo'yicha filtrlaymiz (Lotin va Kirill transkripsiyasi bilan)
        const searchValNorm = window.normalizeUzbek ? window.normalizeUzbek(searchVal) : searchVal.toLowerCase();
        const filteredCustomers = customers.filter(c => {
            // Operator bo'yicha filter
            if (activeUserId !== 'admin') {
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
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sinxronizatsiya...';
        }
        
        try {
            const response = await fetch('/api/integration/amocrm/sync', {
                method: 'POST'
            });
            const result = await response.json();
            if (response.ok) {
                alert(result.message || 'Sinxronizatsiya orqa fonda boshlandi!');
                // Re-enable and refresh after a short delay
                setTimeout(async () => {
                    try {
                        await this.render();
                    } catch (renderErr) {
                        console.error("CRM render error during sync:", renderErr);
                    } finally {
                        if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = originalHTML;
                        }
                    }
                }, 3000);
            } else {
                alert(result.detail || 'Sinxronizatsiya boshlashda xatolik yuz berdi.');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;
                }
            }
        } catch (e) {
            console.error("amoCRM sync error:", e);
            alert("Serverga ulanishda xatolik yuz berdi.");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
        }
    }
};
