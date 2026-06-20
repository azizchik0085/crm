// ERP & CRM Tizimi - Cheklar (Receipts) Moduli

window.Receipts = {
    receiptsList: [],

    init: function() {
        this.setupEventListeners();
        this.render();
    },

    setupEventListeners: function() {
        const searchInput = document.getElementById('receipts-search');
        if (searchInput) {
            searchInput.oninput = () => this.render();
        }
    },

    render: async function() {
        const searchVal = document.getElementById('receipts-search')?.value.toLowerCase() || '';
        const container = document.getElementById('receipts-content');
        if (!container) return;

        // Show a loader
        container.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; padding: 48px; color: var(--text-muted);">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-right: 12px;"></i>
                Yuklanmoqda...
            </div>
        `;

        try {
            this.receiptsList = await DB.getReceipts();
        } catch (e) {
            console.error("Failed to load receipts:", e);
            this.receiptsList = [];
        }

        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        let filtered = this.receiptsList;
        if (searchVal) {
            filtered = filtered.filter(r => 
                (r.code && r.code.toLowerCase().includes(searchVal)) ||
                (r.cashier_name && r.cashier_name.toLowerCase().includes(searchVal)) ||
                (r.id && r.id.toLowerCase().includes(searchVal))
            );
        }

        // Sort by created_at descending
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        let html = `
            <div class="card" style="margin-top: 16px;">
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Chek kodi</th>
                                <th>Kassa xodimi</th>
                                <th>To'lov turi</th>
                                <th>Sana</th>
                                <th>Chegirma</th>
                                <th>Jami summa</th>
                                <th style="text-align: right;">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (filtered.length === 0) {
            html += `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 32px;">Cheklar topilmadi.</td></tr>`;
        } else {
            filtered.forEach(r => {
                const dateObj = new Date(r.created_at);
                const formattedDate = isNaN(dateObj.getTime()) 
                    ? r.created_at 
                    : dateObj.toLocaleString('uz-UZ', { hour12: false });

                const badgeClass = r.payment_type === 'Karta' 
                    ? 'badge-primary' 
                    : (r.payment_type === 'Elektron' ? 'badge-success' : 'badge-secondary');

                html += `
                    <tr>
                        <td><strong>${r.code || 'CH-' + r.id.substring(0, 8)}</strong></td>
                        <td>${r.cashier_name || 'Noma\'lum'}</td>
                        <td><span class="badge ${badgeClass}">${r.payment_type || 'Naqd'}</span></td>
                        <td><span style="font-family: 'JetBrains Mono'; font-size: 13px;">${formattedDate}</span></td>
                        <td><span style="color: var(--danger); font-family: 'JetBrains Mono';">${formatMoney(r.discount || 0, currency)}</span></td>
                        <td><strong style="color: var(--accent); font-family: 'JetBrains Mono';">${formatMoney(r.total_amount || 0, currency)}</strong></td>
                        <td style="text-align: right;">
                            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                                <button class="btn btn-secondary btn-sm" onclick="Receipts.openDetails('${r.id}')">
                                    <i class="fas fa-eye" style="margin-right: 4px;"></i> Batafsil
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="Receipts.deleteReceipt('${r.id}')">
                                    <i class="fas fa-trash-alt" style="color: var(--danger)"></i>
                                </button>
                            </div>
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

    openDetails: function(id) {
        const receipt = this.receiptsList.find(r => r.id === id);
        if (!receipt) return;

        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const codeEl = document.getElementById('rec-detail-code');
        const cashierEl = document.getElementById('rec-detail-cashier');
        const dateEl = document.getElementById('rec-detail-date');
        const paytypeEl = document.getElementById('rec-detail-paytype');
        const itemsEl = document.getElementById('rec-detail-items');
        const discountEl = document.getElementById('rec-detail-discount');
        const totalEl = document.getElementById('rec-detail-total');

        if (codeEl) codeEl.textContent = receipt.code || 'CH-' + receipt.id.substring(0, 8);
        if (cashierEl) cashierEl.textContent = receipt.cashier_name || 'Noma\'lum';
        
        const dateObj = new Date(receipt.created_at);
        if (dateEl) dateEl.textContent = isNaN(dateObj.getTime()) ? receipt.created_at : dateObj.toLocaleString('uz-UZ', { hour12: false });
        
        if (paytypeEl) {
            paytypeEl.textContent = receipt.payment_type || 'Naqd';
            paytypeEl.className = 'badge ' + (receipt.payment_type === 'Karta' 
                ? 'badge-primary' 
                : (receipt.payment_type === 'Elektron' ? 'badge-success' : 'badge-secondary'));
        }

        if (discountEl) discountEl.textContent = formatMoney(receipt.discount || 0, currency);
        if (totalEl) totalEl.textContent = formatMoney(receipt.total_amount || 0, currency);

        if (itemsEl) {
            itemsEl.innerHTML = '';
            const items = receipt.items || [];
            if (items.length === 0) {
                itemsEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Mahsulotlar topilmadi.</td></tr>`;
            } else {
                items.forEach(item => {
                    itemsEl.innerHTML += `
                        <tr>
                            <td><strong>${item.name || 'Noma\'lum mahsulot'}</strong></td>
                            <td><span style="font-family: 'JetBrains Mono'; font-size: 12px; color: var(--text-muted);">${item.sku || '-'}</span></td>
                            <td style="text-align: center;">${item.quantity || 1}</td>
                            <td style="text-align: right; font-family: 'JetBrains Mono';">${formatMoney(item.price || 0, currency)}</td>
                            <td style="text-align: right; font-family: 'JetBrains Mono';"><strong>${formatMoney(item.total || 0, currency)}</strong></td>
                        </tr>
                    `;
                });
            }
        }

        showModal('receipt-details-modal');
    },

    deleteReceipt: async function(id) {
        if (!confirm("Haqiqatan ham ushbu chekni o'chirmoqchimisiz?")) return;
        
        await DB.deleteReceipt(id);
        
        // Update stats
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
        
        this.render();
    }
};
