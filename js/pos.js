// Smart POS Terminal - Dedicated Cashier Client Script

const POS = {
    posProducts: [],
    posCustomers: [],
    posCart: [],
    posSubtotal: 0,
    posTotal: 0,
    currentUser: null,

    init: async function() {
        // 1. Authenticate user from localStorage
        const activeUserId = localStorage.getItem('activeUserId');
        const activeCompanyId = localStorage.getItem('activeCompanyId');
        const activeUserRole = localStorage.getItem('activeUserRole');
        const activeUserName = localStorage.getItem('activeUserName');
        
        if (!activeUserId) {
            window.location.href = 'index.html';
            return;
        }

        this.currentUser = {
            id: activeUserId,
            company_id: activeCompanyId,
            role: activeUserRole,
            name: activeUserName
        };

        // Display Cashier details
        document.getElementById('pos-cashier-name').textContent = this.currentUser.name || 'Kassa xodimi';
        document.getElementById('pos-cashier-role').textContent = this.currentUser.role === 'admin' ? 'Super Admin' : (this.currentUser.role || 'Kassir');
        
        // 2. Initialize Database & load company settings
        try {
            await DB.init();
            
            // Load company settings from backend
            const settingsRes = await fetch('/api/settings');
            if (settingsRes.ok) {
                const backendSettings = await settingsRes.json();
                document.getElementById('pos-company-name').textContent = backendSettings.company_name || 'Smart Solutions MChJ';
            } else {
                document.getElementById('pos-company-name').textContent = 'Kassa terminali';
            }
            
            // 3. Load initial lists
            await this.loadData();
            
        } catch (e) {
            console.error("POS initialization failed:", e);
            alert("Tizimga ulanishda xatolik yuz berdi: " + e.message);
        }
    },

    loadData: async function() {
        const grid = document.getElementById('pos-products-grid');
        grid.innerHTML = '<div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; padding: 48px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i> &nbsp; Mahsulotlar yuklanmoqda...</div>';
        
        try {
            // Load products
            this.posProducts = await DB.getInventory();
            
            // Load customers
            const customersRes = await fetch('/api/customers');
            if (customersRes.ok) {
                this.posCustomers = await customersRes.json();
            } else {
                this.posCustomers = [];
            }
            
            // Render customers select dropdown
            const custSelect = document.getElementById('pos-customer-select');
            custSelect.innerHTML = '<option value="">Tanlanmagan (Umumiy mijoz)</option>';
            this.posCustomers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.name || 'Noma\'lum'} (${c.phone || ''})`;
                custSelect.appendChild(opt);
            });
            
            // Populate category filter select
            const catSelect = document.getElementById('pos-category-select');
            catSelect.innerHTML = '<option value="all">Barcha toifalar</option>';
            const categories = [...new Set(this.posProducts.map(p => p.category || 'Barchasi'))];
            categories.forEach(cat => {
                if (cat && cat !== 'all') {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    catSelect.appendChild(opt);
                }
            });
            
            // Reset cart
            this.posCart = [];
            this.filterProducts();
            this.renderCart();
            
        } catch (e) {
            console.error("Load POS data failed:", e);
            grid.innerHTML = `<div style="grid-column: 1 / -1; color: var(--danger); text-align: center; padding: 24px;"><i class="fas fa-exclamation-triangle fa-2x"></i><br>Ma'lumotlarni yuklashda xatolik yuz berdi: ${e.message}</div>`;
        }
    },

    filterProducts: function() {
        const query = document.getElementById('pos-search-input').value.toLowerCase().trim();
        const category = document.getElementById('pos-category-select').value;
        
        let filtered = this.posProducts || [];
        if (category !== 'all') {
            filtered = filtered.filter(p => p.category === category);
        }
        if (query) {
            filtered = filtered.filter(p => 
                (p.name && p.name.toLowerCase().includes(query)) || 
                (p.sku && p.sku.toLowerCase().includes(query))
            );
        }
        
        this.renderProductsList(filtered);
    },

    renderProductsList: function(products) {
        const grid = document.getElementById('pos-products-grid');
        if (!grid) return;
        
        if (products.length === 0) {
            grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 48px;"><i class="fas fa-box-open fa-3x" style="margin-bottom:12px;"></i><br>Mahsulotlar topilmadi</div>';
            return;
        }
        
        grid.innerHTML = '';
        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'background: #1e293b; border: 1px solid #334155; padding: 12px; border-radius: 10px; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s; user-select: none;';
            card.onmouseover = () => { card.style.borderColor = 'var(--accent)'; card.style.transform = 'translateY(-2px)'; };
            card.onmouseout = () => { card.style.borderColor = '#334155'; card.style.transform = 'translateY(0)'; };
            card.onclick = () => this.addToCart(p.id);
            
            const isOutOfStock = p.stock <= 0;
            const stockBadge = isOutOfStock 
                ? '<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">Tugagan</span>'
                : `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">Qoldiq: ${p.stock} ta</span>`;
                
            card.innerHTML = `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                        <span style="font-size: 0.7rem; color: #64748b; font-weight: 700; text-transform: uppercase;">${p.category || 'Barchasi'}</span>
                        ${stockBadge}
                    </div>
                    <h4 style="margin: 0 0 4px 0; color: #f8fafc; font-size: 0.9rem; line-height: 1.2; font-weight: 600; text-align: left;">${p.name}</h4>
                    <p style="margin: 0; font-size: 0.75rem; color: #64748b; font-family: 'JetBrains Mono'; text-align: left;">SKU: ${p.sku || '-'}</p>
                </div>
                <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #10b981; font-weight: 700; font-size: 0.95rem;">${parseFloat(p.price).toLocaleString()} UZS</span>
                    <span style="color: var(--accent); background: rgba(99, 102, 241, 0.1); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--accent);"><i class="fas fa-plus" style="font-size: 0.75rem;"></i></span>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    addToCart: function(prodId) {
        const prod = this.posProducts.find(p => p.id === prodId);
        if (!prod) return;
        
        const existing = this.posCart.find(item => item.id === prodId);
        if (existing) {
            if (existing.qty >= prod.stock) {
                alert(`Omborda faqat ${prod.stock} ta mahsulot bor!`);
                return;
            }
            existing.qty++;
        } else {
            if (prod.stock <= 0) {
                alert("Bu mahsulot omborda tugagan!");
                return;
            }
            this.posCart.push({
                id: prod.id,
                name: prod.name,
                price: parseFloat(prod.price) || 0,
                sku: prod.sku,
                qty: 1,
                maxStock: prod.stock
            });
        }
        
        this.renderCart();
    },

    removeFromCart: function(prodId) {
        this.posCart = this.posCart.filter(item => item.id !== prodId);
        this.renderCart();
    },

    changeQty: function(prodId, delta) {
        const item = this.posCart.find(i => i.id === prodId);
        if (!item) return;
        
        const newQty = item.qty + delta;
        if (newQty <= 0) {
            this.removeFromCart(prodId);
        } else if (newQty > item.maxStock) {
            alert(`Omborda faqat ${item.maxStock} ta mahsulot bor!`);
        } else {
            item.qty = newQty;
            this.renderCart();
        }
    },

    renderCart: function() {
        const list = document.getElementById('pos-cart-list');
        if (!list) return;
        
        if (this.posCart.length === 0) {
            list.innerHTML = `
                <div style="margin: auto; color: #64748b; text-align: center; font-size: 0.85rem; padding: 24px;">
                    <i class="fas fa-cart-arrow-down" style="font-size: 2.5rem; margin-bottom: 8px; color: #334155;"></i><br>Savatcha bo'sh
                </div>
            `;
            this.updateTotals();
            return;
        }
        
        list.innerHTML = '';
        this.posCart.forEach(item => {
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #1e293b; border: 1px solid #334155; padding: 10px; border-radius: 8px; gap: 8px;';
            div.innerHTML = `
                <div style="flex: 1; min-width: 0; text-align: left;">
                    <h5 style="margin: 0 0 2px 0; color: #f8fafc; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;">${item.name}</h5>
                    <span style="font-size: 0.75rem; color: #10b981; font-weight: 700;">${item.price.toLocaleString()} UZS</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; background: #0f172a; border-radius: 6px; padding: 2px;">
                    <button class="btn btn-sm btn-secondary" onclick="POS.changeQty('${item.id}', -1)" style="padding: 2px 8px; font-size: 0.8rem; background: transparent; border: none; color: #94a3b8; cursor: pointer;"><i class="fas fa-minus"></i></button>
                    <span style="color: #f8fafc; font-weight: 700; font-size: 0.85rem; width: 24px; text-align: center;">${item.qty}</span>
                    <button class="btn btn-sm btn-secondary" onclick="POS.changeQty('${item.id}', 1)" style="padding: 2px 8px; font-size: 0.8rem; background: transparent; border: none; color: #94a3b8; cursor: pointer;"><i class="fas fa-plus"></i></button>
                </div>
                <div style="text-align: right; min-width: 80px;">
                    <div style="color: #f8fafc; font-weight: 700; font-size: 0.85rem;">${(item.price * item.qty).toLocaleString()} UZS</div>
                </div>
                <button onclick="POS.removeFromCart('${item.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 0.9rem; padding: 4px;"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(div);
        });
        
        this.updateTotals();
    },

    updateTotals: function() {
        let subtotal = 0;
        this.posCart.forEach(item => {
            subtotal += item.price * item.qty;
        });
        
        const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
        const total = Math.max(0, subtotal - discount);
        
        this.posSubtotal = subtotal;
        this.posTotal = total;
        
        document.getElementById('pos-subtotal').textContent = subtotal.toLocaleString() + ' UZS';
        document.getElementById('pos-total').textContent = total.toLocaleString() + ' UZS';
    },

    updatePaymentUI: function() {
        const payType = document.querySelector('input[name="pos-payment-type"]:checked').value;
        const custSelect = document.getElementById('pos-customer-select');
        
        if (payType === 'Qarz') {
            custSelect.style.borderColor = '#ef4444';
            custSelect.style.boxShadow = '0 0 0 1px #ef4444';
        } else {
            custSelect.style.borderColor = '#334155';
            custSelect.style.boxShadow = 'none';
        }
    },

    openNewCustomerForm: function(e) {
        if (e) e.preventDefault();
        document.getElementById('pos-new-customer-form').style.display = 'block';
    },

    closeNewCustomerForm: function(e) {
        if (e) e.preventDefault();
        document.getElementById('pos-new-customer-form').style.display = 'none';
        document.getElementById('pos-new-cust-name').value = '';
        document.getElementById('pos-new-cust-phone').value = '';
    },

    saveNewCustomer: async function(e) {
        if (e) e.preventDefault();
        const name = document.getElementById('pos-new-cust-name').value.trim();
        const phone = document.getElementById('pos-new-cust-phone').value.trim();
        
        if (!name || !phone) {
            alert("Iltimos, xaridor ismi va telefon raqamini to'liq kiriting!");
            return;
        }
        
        const payload = {
            id: 'cust-' + Date.now(),
            name: name,
            phone: phone,
            status: 'customer',
            value: 0,
            source: 'POS Terminal'
        };
        
        try {
            const response = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) throw new Error("Mijozni saqlashda xatolik");
            
            // Reload customers
            const customersRes = await fetch('/api/customers');
            if (customersRes.ok) {
                this.posCustomers = await customersRes.json();
            }
            
            // Re-render select dropdown and select new customer
            const custSelect = document.getElementById('pos-customer-select');
            custSelect.innerHTML = '<option value="">Tanlanmagan (Umumiy mijoz)</option>';
            this.posCustomers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.name || 'Noma\'lum'} (${c.phone || ''})`;
                custSelect.appendChild(opt);
            });
            
            custSelect.value = payload.id;
            this.updatePaymentUI();
            this.closeNewCustomerForm();
            alert("Yangi xaridor muvaffaqiyatli saqlandi.");
            
        } catch (err) {
            console.error(err);
            alert("Mijozni saqlashda xatolik yuz berdi: " + err.message);
        }
    },

    completeSale: async function() {
        if (this.posCart.length === 0) {
            alert("Savatcha bo'sh! Iltimos, sotish uchun kamida bitta mahsulot tanlang.");
            return;
        }
        
        const payType = document.querySelector('input[name="pos-payment-type"]:checked').value;
        const customerSelect = document.getElementById('pos-customer-select');
        const customerId = customerSelect.value;
        
        if (payType === 'Qarz' && !customerId) {
            alert("Diqqat! Mahsulotni qarzga (nasiyaga) sotish uchun mijozni tanlashingiz yoki yangi mijoz qo'shishingiz shart!");
            return;
        }
        
        if (!confirm("Sotuvni yakunlashni tasdiqlaysizmi?")) return;
        
        try {
            // 1. Decrement inventory stock levels
            for (const item of this.posCart) {
                const prod = this.posProducts.find(p => p.id === item.id);
                if (prod) {
                    const updatedProduct = {
                        ...prod,
                        stock: Math.max(0, prod.stock - item.qty)
                    };
                    await DB.saveProduct(updatedProduct);
                }
            }
            
            // 2. Prepare receipt payload
            const receiptId = 'pos-' + Date.now();
            const code = 'POS-' + Math.floor(100000 + Math.random() * 900000);
            const cashierName = this.currentUser.name || 'Kassa xodimi';
            const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
            const customerName = customerId ? customerSelect.options[customerSelect.selectedIndex].text.split(' (')[0] : '';
            const customerPhone = customerId ? this.posCustomers.find(c => c.id === customerId)?.phone || '' : '';
            
            const receiptPayload = {
                id: receiptId,
                code: code,
                cashier_name: cashierName,
                total_amount: this.posTotal,
                discount: discount,
                payment_type: payType,
                items: {
                    products: this.posCart.map(item => ({
                        sku: item.sku || '',
                        name: item.name,
                        price: item.price,
                        total: item.price * item.qty,
                        quantity: item.qty
                    })),
                    customer_id: customerId || null,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    debt_amount: payType === 'Qarz' ? this.posTotal : 0
                },
                created_at: new Date().toISOString()
            };
            
            // 3. Save receipt
            const response = await fetch('/api/receipts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(receiptPayload)
            });
            
            if (!response.ok) throw new Error("Sotuv chekini saqlashda xatolik yuz berdi");
            
            // 4. Update customer value
            if (customerId) {
                const customer = this.posCustomers.find(c => c.id === customerId);
                if (customer) {
                    customer.value = (parseFloat(customer.value) || 0) + this.posTotal;
                    customer.status = 'customer';
                    await fetch('/api/customers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(customer)
                    });
                }
            }
            
            alert("Sotuv muvaffaqiyatli yakunlandi! Chek kodi: " + code);
            
            // 5. Reload data to show updated stock levels
            await this.loadData();
            
        } catch (e) {
            console.error("POS transaction failed:", e);
            alert("Xatolik yuz berdi: " + e.message);
        }
    },

    openXReport: async function() {
        const modal = document.getElementById('x-report-modal');
        const body = document.getElementById('x-report-body');
        modal.style.display = 'flex';
        body.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Hisobot tayyorlanmoqda...</div>';
        
        try {
            const res = await fetch('/api/receipts');
            if (!res.ok) throw new Error("Cheklarni yuklashda xatolik yuz berdi");
            const receipts = await res.json();
            
            const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
            const cashierName = this.currentUser.name || 'Kassa xodimi';
            
            // Filter today's receipts for this cashier
            const todayReceipts = receipts.filter(r => {
                const isToday = r.created_at && r.created_at.startsWith(todayStr);
                const isMyReceipt = r.cashier_name === cashierName;
                return isToday && isMyReceipt;
            });
            
            let totalSales = todayReceipts.length;
            let grossAmount = 0;
            let totalDiscount = 0;
            let netAmount = 0;
            
            let cashTotal = 0;
            let cardTotal = 0;
            let electronicTotal = 0;
            let debtTotal = 0;
            
            todayReceipts.forEach(r => {
                const total = parseFloat(r.total_amount) || 0;
                const disc = parseFloat(r.discount) || 0;
                
                netAmount += total;
                totalDiscount += disc;
                grossAmount += (total + disc);
                
                const payType = r.payment_type || 'Naqd';
                if (payType === 'Naqd') cashTotal += total;
                else if (payType === 'Karta') cardTotal += total;
                else if (payType === 'Elektron') electronicTotal += total;
                else if (payType === 'Qarz') debtTotal += total;
            });
            
            const companyName = document.getElementById('pos-company-name').textContent;
            const nowTime = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            body.innerHTML = `
                <div style="text-align: center; font-weight: bold; border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px;">
                    <span style="font-size: 1.05rem;">${companyName}</span><br>
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">Smena hisoboti (X-HISOBOT)</span>
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted);">
                    <span>Sana: ${new Date().toLocaleDateString('uz-UZ')}</span>
                    <span>Vaqt: ${nowTime}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px;">
                    <span>Kassir: ${cashierName}</span>
                </div>
                
                <div style="border-bottom: 1px dashed #334155; padding-bottom: 8px; margin-bottom: 8px; display: flex; flex-direction: column; gap: 6px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Cheklar soni:</span>
                        <span style="font-weight: 600;">${totalSales} ta</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Umumiy Savdo (Gross):</span>
                        <span style="font-weight: 600;">${grossAmount.toLocaleString()} UZS</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; color: #ef4444;">
                        <span>Berilgan Chegirmalar:</span>
                        <span style="font-weight: 600;">-${totalDiscount.toLocaleString()} UZS</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 1rem; font-weight: 700; color: #10b981; border-top: 1px dashed #334155; padding-top: 6px; margin-top: 4px;">
                        <span>Sof tushum (Net):</span>
                        <span>${netAmount.toLocaleString()} UZS</span>
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-weight: bold; font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px;">To'lov turlari bo'yicha:</div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Naqd pul:</span>
                        <span style="font-weight: 600; color: #10b981;">${cashTotal.toLocaleString()} UZS</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Plastik karta:</span>
                        <span style="font-weight: 600; color: #3b82f6;">${cardTotal.toLocaleString()} UZS</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Click / Payme:</span>
                        <span style="font-weight: 600; color: #a855f7;">${electronicTotal.toLocaleString()} UZS</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 1px dotted #334155; padding-top: 4px;">
                        <span>Nasiya (Qarzlar):</span>
                        <span style="font-weight: 600; color: #ef4444;">${debtTotal.toLocaleString()} UZS</span>
                    </div>
                </div>
            `;
            
        } catch (e) {
            console.error("Load X-Report failed:", e);
            body.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 24px;"><i class="fas fa-exclamation-triangle fa-2x"></i><br>Hisobotni yuklashda xatolik: ${e.message}</div>`;
        }
    }
};

// Global hooks for HTML bindings
function filterPOSProducts() { POS.filterProducts(); }
function openNewCustomerForm(e) { POS.openNewCustomerForm(e); }
function closeNewCustomerForm(e) { POS.closeNewCustomerForm(e); }
function saveNewPOSCustomer(e) { POS.saveNewCustomer(e); }
function updatePOSTotals() { POS.updateTotals(); }
function updatePOSPaymentUI() { POS.updatePaymentUI(); }
function completePOSSale() { POS.completeSale(); }
function openXReport() { POS.openXReport(); }
function closeXReportModal() { document.getElementById('x-report-modal').style.display = 'none'; }
function printXReport() {
    const reportHtml = document.getElementById('x-report-body').innerHTML;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>X-Hisobot</title>
            <style>
                body {
                    font-family: 'Courier New', Courier, monospace;
                    padding: 20px;
                    color: #000;
                    background: #fff;
                    font-size: 14px;
                }
                .text-center { text-align: center; }
                .divider { border-top: 1px dashed #000; margin: 10px 0; }
                .flex-justify { display: flex; justify-content: space-between; }
                .bold { font-weight: bold; }
            </style>
        </head>
        <body>
            <h2 class="text-center" style="margin: 0 0 5px 0;">X-HISOBOT</h2>
            <h3 class="text-center" style="margin: 0 0 10px 0;">KASSA TERMINALI</h3>
            <div class="divider"></div>
            \${reportHtml}
            <div class="divider"></div>
            <p class="text-center" style="font-size: 11px; margin-top: 20px;">Smena yopilmagan (X-Hisobot)<br>Dastur: Smart POS</p>
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() { window.close(); }, 500);
                }
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
function logout() {
    localStorage.removeItem('activeUserId');
    localStorage.removeItem('activeCompanyId');
    localStorage.removeItem('activeUserRole');
    localStorage.removeItem('activeUserName');
    localStorage.removeItem('activeView');
    document.cookie = "company_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = 'index.html';
}

// Auto Init on Load
window.onload = () => {
    POS.init();
};
