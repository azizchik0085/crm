// ERP & CRM Tizimi - Moliya Moduli - SUPABASE ULANISHI BILAN

window.Finance = {
    activeFilter: 'all', // 'all', 'income', 'expense'

    init: function() {
        this.render();
        this.setupEventListeners();
    },

    setupEventListeners: function() {
        // Filtrlarni ulash
        const filterButtons = {
            all: document.getElementById('fin-filter-all'),
            income: document.getElementById('fin-filter-income'),
            expense: document.getElementById('fin-filter-expense')
        };

        for (const [key, btn] of Object.entries(filterButtons)) {
            if (btn) {
                btn.onclick = () => {
                    this.activeFilter = key;
                    
                    // Ranglarni almashtirish
                    for (const [k, b] of Object.entries(filterButtons)) {
                        if (k === key) {
                            b.classList.add('btn-primary');
                            b.classList.remove('btn-secondary');
                        } else {
                            b.classList.add('btn-secondary');
                            b.classList.remove('btn-primary');
                        }
                    }
                    
                    this.render();
                };
            }
        }

        // Qidiruv
        const searchInput = document.getElementById('finance-search');
        if (searchInput) {
            searchInput.oninput = () => this.render();
        }

        // Yangi tranzaksiya yuborilishi
        const form = document.getElementById('add-transaction-form');
        if (form) {
            form.onsubmit = (e) => {
                e.preventDefault();
                this.addTransaction();
            };
        }
    },

    render: async function() {
        const searchVal = document.getElementById('finance-search')?.value.toLowerCase() || '';

        // Supabase yoki keshdan tranzaksiyalarni olish
        const transactions = await DB.getTransactions();
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        // Filtrlangan tranzaksiyalar
        let filtered = transactions;

        if (this.activeFilter === 'income') {
            filtered = filtered.filter(t => t.type === 'income');
        } else if (this.activeFilter === 'expense') {
            filtered = filtered.filter(t => t.type === 'expense');
        }

        if (searchVal) {
            filtered = filtered.filter(t => 
                t.description.toLowerCase().includes(searchVal) || 
                t.category.toLowerCase().includes(searchVal)
            );
        }

        // Tranzaksiyalarni sanasi bo'yicha teskari saralaymiz (eng yangilari tepada)
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Hisob-kitoblar
        const totalIncome = transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalExpense = transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const netBalance = totalIncome - totalExpense;

        const container = document.getElementById('finance-content');
        if (!container) return;

        let html = `
            <div class="stats-grid" style="margin-top: 16px;">
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Jami Kirim</h3>
                        <div class="stat-value" style="color: var(--success);">+${formatMoney(totalIncome, currency)}</div>
                    </div>
                    <div class="stat-icon-box income"><i class="fas fa-arrow-down"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Jami Chiqim</h3>
                        <div class="stat-value" style="color: var(--danger);">-${formatMoney(totalExpense, currency)}</div>
                    </div>
                    <div class="stat-icon-box danger"><i class="fas fa-arrow-up"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Sof Foyda (Balans)</h3>
                        <div class="stat-value" style="color: ${netBalance >= 0 ? 'var(--success)' : 'var(--danger)'}">
                            ${netBalance >= 0 ? '+' : ''}${formatMoney(netBalance, currency)}
                        </div>
                    </div>
                    <div class="stat-icon-box ${netBalance >= 0 ? 'income' : 'danger'}">
                        <i class="fas fa-wallet"></i>
                    </div>
                </div>
            </div>

            <div class="card" style="margin-top: 24px;">
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Turi</th>
                                <th>Kategoriya</th>
                                <th>Tavsif</th>
                                <th>Sana</th>
                                <th>Summa</th>
                                <th style="text-align: right;">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (filtered.length === 0) {
            html += `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">Tranzaksiyalar topilmadi.</td></tr>`;
        } else {
            filtered.forEach(t => {
                const isIncome = t.type === 'income';
                const typeIcon = isIncome 
                    ? '<i class="fas fa-arrow-down" style="color: var(--success); margin-right: 8px;"></i> Kirim' 
                    : '<i class="fas fa-arrow-up" style="color: var(--danger); margin-right: 8px;"></i> Chiqim';

                html += `
                    <tr>
                        <td><strong>${typeIcon}</strong></td>
                        <td><span class="badge ${isIncome ? 'badge-success' : 'badge-danger'}">${t.category}</span></td>
                        <td>${t.description || '-'}</td>
                        <td><span style="font-family: 'JetBrains Mono'; font-size: 13px;">${t.date}</span></td>
                        <td>
                            <strong style="color: ${isIncome ? 'var(--success)' : 'var(--danger)'}; font-family: 'JetBrains Mono';">
                                ${isIncome ? '+' : '-'}${formatMoney(t.amount, currency)}
                            </strong>
                        </td>
                        <td style="text-align: right;">
                            <button class="btn btn-secondary btn-sm" onclick="Finance.deleteTransaction('${t.id}')"><i class="fas fa-trash-alt" style="color: var(--danger)"></i> O'chirish</button>
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

        container.innerHTML = html;
    },

    addTransaction: async function() {
        const type = document.getElementById('tx-type').value;
        const category = document.getElementById('tx-cat').value;
        const amount = parseFloat(document.getElementById('tx-amount').value) || 0;
        const date = document.getElementById('tx-date').value;
        const description = document.getElementById('tx-desc').value;

        if (amount <= 0 || !date || !category) {
            alert('Iltimos, barcha maydonlarni to\'ldiring va summani to\'g\'ri kiriting!');
            return;
        }

        const newTx = {
            id: 't_' + Date.now(),
            type,
            category,
            amount,
            date,
            description
        };

        await DB.saveTransaction(newTx);

        // Formani tozalash va modalni yopish
        document.getElementById('add-transaction-form').reset();
        closeModal('transaction-modal');

        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    },

    deleteTransaction: async function(id) {
        if (!confirm('Ushbu moliyaviy tranzaksiyani o\'chirmoqchimisiz?')) return;

        await DB.deleteTransaction(id);

        await this.render();
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
    }
};
