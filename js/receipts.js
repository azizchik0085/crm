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
            let debounceTimer;
            searchInput.oninput = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.render();
                }, 300);
            };
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

        let dataRes;
        try {
            dataRes = await DB.getReceipts(searchVal);
        } catch (e) {
            console.error("Failed to load receipts:", e);
            dataRes = [];
        }

        if (dataRes && dataRes.error === "migration_required") {
            container.innerHTML = `
                <div class="card" style="padding: 24px; border: 1px solid rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02); margin-top: 16px;">
                    <div style="display: flex; gap: 16px; align-items: flex-start; text-align: left;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(239, 68, 68, 0.1); display: flex; align-items: center; justify-content: center; color: var(--danger); flex-shrink: 0;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 18px;"></i>
                        </div>
                        <div style="flex-grow: 1;">
                            <h3 style="color: var(--text-main); font-size: 16px; margin: 0 0 6px 0;">Supabase-da "receipts" (cheklar) jadvali topilmadi!</h3>
                            <p style="color: var(--text-muted); font-size: 14px; margin: 0 0 16px 0; line-height: 1.5;">
                                Cheklar tarixini saqlash va ko'rsatish uchun Supabase bazasida jadval yaratish kerak.
                                Iltimos, Supabase boshqaruv panelidagi <strong>SQL Editor</strong>-ga kirib, quyidagi SQL kodini nusxalab ishga tushiring (Run qiling):
                            </p>
                            <pre style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #a5b4fc; overflow-x: auto; max-width: 100%; border: 1px solid var(--border-color); margin: 0;">${dataRes.sql}</pre>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        this.receiptsList = Array.isArray(dataRes) ? dataRes : [];

        let customers = [];
        try {
            customers = await DB.getCustomers();
        } catch (e) {
            console.error("Failed to load customers for receipts render:", e);
        }

        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        let filtered = this.receiptsList;
        if (searchVal) {
            const searchValNorm = window.normalizeUzbek ? window.normalizeUzbek(searchVal) : searchVal.toLowerCase();
            filtered = filtered.filter(r => {
                const codeNorm = r.code ? (window.normalizeUzbek ? window.normalizeUzbek(r.code) : r.code.toLowerCase()) : '';
                const cashierNorm = r.cashier_name ? (window.normalizeUzbek ? window.normalizeUzbek(r.cashier_name) : r.cashier_name.toLowerCase()) : '';
                const idNorm = r.id ? (window.normalizeUzbek ? window.normalizeUzbek(r.id) : r.id.toLowerCase()) : '';
                
                let customerNorm = '';
                let sellerNorm = '';
                if (r.items) {
                    if (r.items.customer_name) {
                        customerNorm = window.normalizeUzbek ? window.normalizeUzbek(r.items.customer_name) : r.items.customer_name.toLowerCase();
                    }
                    if (r.items.seller_name) {
                        sellerNorm = window.normalizeUzbek ? window.normalizeUzbek(r.items.seller_name) : r.items.seller_name.toLowerCase();
                    }
                }
                
                return codeNorm.includes(searchValNorm) || 
                       cashierNorm.includes(searchValNorm) || 
                       idNorm.includes(searchValNorm) ||
                       customerNorm.includes(searchValNorm) ||
                       sellerNorm.includes(searchValNorm);
            });
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
                                <th>Sotuvchi</th>
                                <th>Mijoz</th>
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
            html += `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 32px;">Cheklar topilmadi.</td></tr>`;
        } else {
            filtered.forEach(r => {
                const dateObj = new Date(r.created_at);
                const formattedDate = isNaN(dateObj.getTime()) 
                    ? r.created_at 
                    : dateObj.toLocaleString('uz-UZ', { hour12: false });

                const badgeClass = r.payment_type === 'Karta' 
                    ? 'badge-primary' 
                    : (r.payment_type === 'Elektron' ? 'badge-success' : 'badge-secondary');

                let customerInfo = '-';
                let sellerName = '-';
                let sellerDisplay = '-';
                let itemsObj = r.items;
                if (typeof itemsObj === 'string') {
                    try {
                        itemsObj = JSON.parse(itemsObj);
                    } catch (e) {
                        itemsObj = null;
                    }
                }
                if (itemsObj && !Array.isArray(itemsObj) && typeof itemsObj === 'object') {
                    const cName = itemsObj.customer_name || '';
                    const cPhone = itemsObj.customer_phone || '';
                    if (cName || cPhone) {
                        customerInfo = `<strong>${cName || 'Mijoz'}</strong><br><span style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono';">${cPhone || ''}</span>`;
                    }
                    sellerName = itemsObj.seller_name || '';
                    if (sellerName && sellerName !== '-') {
                        sellerDisplay = `<strong>${sellerName}</strong>`;
                    } else {
                        sellerDisplay = '';
                    }

                    let matchedCustomer = null;
                    if (cPhone) {
                        const cleanRecPhone = cPhone.replace(/\D/g, '').slice(-9);
                        if (cleanRecPhone.length >= 7) {
                            matchedCustomer = customers.find(c => {
                                const phoneClean = c.phone ? c.phone.replace(/\D/g, '').slice(-9) : '';
                                const phone2Clean = c.phone2 ? c.phone2.replace(/\D/g, '').slice(-9) : '';
                                return (phoneClean && phoneClean === cleanRecPhone) || (phone2Clean && phone2Clean === cleanRecPhone);
                            });
                        }
                    }
                    
                    if (!matchedCustomer && cName) {
                        const cleanRecName = cName.trim().toLowerCase();
                        if (cleanRecName && cleanRecName !== 'mijoz' && cleanRecName !== 'noma\'lum') {
                            matchedCustomer = customers.find(c => {
                                const cNameClean = c.name ? c.name.trim().toLowerCase() : '';
                                return cNameClean && cNameClean === cleanRecName;
                            });
                        }
                    }

                    if (matchedCustomer && matchedCustomer.operator) {
                        if (sellerDisplay && sellerDisplay !== '-') {
                            sellerDisplay += `<br><span style="font-size: 11px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 4px;" title="amoCRM Operator"><i class="fas fa-user-tie" style="color:var(--accent);"></i> ${matchedCustomer.operator}</span>`;
                        } else {
                            sellerDisplay = `<span style="font-size: 13px; color: var(--text-main); display: inline-flex; align-items: center; gap: 4px;" title="amoCRM Operator"><i class="fas fa-user-tie" style="color:var(--accent);"></i> ${matchedCustomer.operator}</span>`;
                        }
                    }
                    if (!sellerDisplay) {
                        sellerDisplay = '-';
                    }
                } else {
                    sellerDisplay = sellerName || '-';
                }

                html += `
                    <tr>
                        <td><strong>${r.code || 'CH-' + r.id.substring(0, 8)}</strong></td>
                        <td>${r.cashier_name || 'Noma\'lum'}</td>
                        <td>${sellerDisplay}</td>
                        <td>${customerInfo}</td>
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

    openDetails: async function(id) {
        try {
            const receipt = this.receiptsList.find(r => String(r.id) === String(id));
            if (!receipt) {
                console.warn("Chek topilmadi, ID:", id);
                return;
            }

            const settings = AppStorage.load().settings;
            const currency = settings.currency;

            const codeEl = document.getElementById('rec-detail-code');
            const cashierEl = document.getElementById('rec-detail-cashier');
            const dateEl = document.getElementById('rec-detail-date');
            const paytypeEl = document.getElementById('rec-detail-paytype');
            const itemsEl = document.getElementById('rec-detail-items');
            const discountEl = document.getElementById('rec-detail-discount');
            const totalEl = document.getElementById('rec-detail-total');

            if (codeEl) codeEl.textContent = receipt.code || 'CH-' + String(receipt.id).substring(0, 8);
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

            // Parse items payload to extract products list and customer card details
            let items = receipt.items || [];
            if (typeof items === 'string') {
                try {
                    items = JSON.parse(items);
                } catch (e) {
                    items = [];
                }
            }

            let customerName = '';
            let customerPhone = '';
            let sellerName = '';
            let products = [];

            if (items && !Array.isArray(items) && typeof items === 'object') {
                customerName = items.customer_name || '';
                customerPhone = items.customer_phone || '';
                sellerName = items.seller_name || '';
                products = items.products || [];
            } else if (Array.isArray(items)) {
                products = items;
            }

            // Display customer card name and phone inside modal rows
            const customerRowEl = document.getElementById('rec-detail-customer-row');
            const phoneRowEl = document.getElementById('rec-detail-phone-row');
            const customerNameEl = document.getElementById('rec-detail-customer');
            const customerPhoneEl = document.getElementById('rec-detail-phone');
            const sellerRowEl = document.getElementById('rec-detail-seller-row');
            const sellerEl = document.getElementById('rec-detail-seller');
            const operatorRowEl = document.getElementById('rec-detail-operator-row');
            const operatorEl = document.getElementById('rec-detail-operator');

            let customers = [];
            try {
                customers = await DB.getCustomers();
            } catch (e) {
                console.error("Failed to load customers for receipt details:", e);
            }

            if (customerName) {
                if (customerNameEl) customerNameEl.textContent = customerName;
                if (customerRowEl) customerRowEl.style.display = 'flex';
            } else {
                if (customerRowEl) customerRowEl.style.display = 'none';
            }

            if (customerPhone) {
                if (customerPhoneEl) customerPhoneEl.textContent = customerPhone;
                if (phoneRowEl) phoneRowEl.style.display = 'flex';
            } else {
                if (phoneRowEl) phoneRowEl.style.display = 'none';
            }

            if (sellerName) {
                if (sellerEl) sellerEl.textContent = sellerName;
                if (sellerRowEl) sellerRowEl.style.display = 'flex';
            } else {
                if (sellerRowEl) sellerRowEl.style.display = 'none';
            }

            let operatorName = '';
            let matchedCustomer = null;
            if (customerPhone) {
                const cleanRecPhone = customerPhone.replace(/\D/g, '').slice(-9);
                if (cleanRecPhone.length >= 7) {
                    matchedCustomer = customers.find(c => {
                        const phoneClean = c.phone ? c.phone.replace(/\D/g, '').slice(-9) : '';
                        const phone2Clean = c.phone2 ? c.phone2.replace(/\D/g, '').slice(-9) : '';
                        return (phoneClean && phoneClean === cleanRecPhone) || (phone2Clean && phone2Clean === cleanRecPhone);
                    });
                }
            }
            
            if (!matchedCustomer && customerName) {
                const cleanRecName = customerName.trim().toLowerCase();
                if (cleanRecName && cleanRecName !== 'mijoz' && cleanRecName !== 'noma\'lum') {
                    matchedCustomer = customers.find(c => {
                        const cNameClean = c.name ? c.name.trim().toLowerCase() : '';
                        return cNameClean && cNameClean === cleanRecName;
                    });
                }
            }

            if (matchedCustomer && matchedCustomer.operator) {
                operatorName = matchedCustomer.operator;
            }

            if (operatorName) {
                if (operatorEl) operatorEl.textContent = operatorName;
                if (operatorRowEl) operatorRowEl.style.display = 'flex';
            } else {
                if (operatorRowEl) operatorRowEl.style.display = 'none';
            }

            if (itemsEl) {
                itemsEl.innerHTML = '';
                if (products.length === 0) {
                    itemsEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Mahsulotlar topilmadi.</td></tr>`;
                } else {
                    products.forEach(item => {
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

            if (window.showModal) {
                window.showModal('receipt-details-modal');
            } else if (typeof showModal === 'function') {
                showModal('receipt-details-modal');
            } else {
                console.error("showModal funksiyasi topilmadi!");
            }
        } catch (err) {
            console.error("Chek tafsilotlarini ochishda xatolik:", err);
            alert("Chek tafsilotlarini ko'rsatishda xatolik yuz berdi: " + err.message);
        }
    },

    deleteReceipt: async function(id) {
        if (!confirm("Haqiqatan ham ushbu chekni o'chirmoqchimisiz?")) return;
        
        await DB.deleteReceipt(id);
        
        // Update stats
        if (window.App && typeof window.App.updateDashboardStats === 'function') {
            window.App.updateDashboardStats();
        }
        
        this.render();
    },

    syncWithRegos: function() {
        if (window.showModal) {
            window.showModal('receipts-sync-modal');
        } else if (typeof showModal === 'function') {
            showModal('receipts-sync-modal');
        } else {
            console.error("showModal funksiyasi topilmadi!");
        }
    },

    toggleCustomDaysInput: function() {
        const customOption = document.querySelector('input[name="sync-days-option"][value="custom"]');
        const container = document.getElementById('sync-custom-days-container');
        if (container && customOption) {
            container.style.display = customOption.checked ? 'flex' : 'none';
        }
    },

    startSyncFromModal: async function() {
        const selectedOption = document.querySelector('input[name="sync-days-option"]:checked');
        if (!selectedOption) return;

        let days = 1;
        if (selectedOption.value === 'custom') {
            const input = document.getElementById('sync-custom-days-input');
            days = parseInt(input ? input.value : 7) || 7;
        } else {
            days = parseInt(selectedOption.value) || 1;
        }

        // Close the modal
        if (window.closeModal) {
            window.closeModal('receipts-sync-modal');
        } else if (typeof closeModal === 'function') {
            closeModal('receipts-sync-modal');
        }

        const btn = document.getElementById('receipts-sync-btn');
        if (!btn) return;

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sinxronizatsiya boshlanmoqda...`;

        try {
            const response = await fetch(`/api/integration/regos/sync-receipts?days=${days}`, {
                method: 'POST'
            });
            
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Sinxronizatsiya boshlashda xatolik yuz berdi.");
            }
            
            this.pollSyncStatus(btn, originalText);
        } catch (e) {
            console.error("REGOS sync receipts failed:", e);
            alert("Xatolik: " + e.message);
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    },

    pollSyncStatus: function(btn, originalText) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/integration/regos/sync-status');
                if (!res.ok) return;
                const status = await res.json();
                
                if (status.running) {
                    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${status.message || 'Sinxronizatsiya qilinmoqda...'}`;
                } else {
                    clearInterval(interval);
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                    alert(status.message || "Sinxronizatsiya yakunlandi.");
                    this.render();
                }
            } catch (e) {
                console.error("Error polling sync status:", e);
            }
        }, 1500);
    }
};
