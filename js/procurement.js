// PRO-TECH ERP - Procurement Module (Xaridlar)
window.Procurement = {
    async init() {
        console.log("Procurement module initialized");
        await this.loadPurchaseOrders();
    },

    async loadPurchaseOrders() {
        try {
            const res = await fetch("/api/purchase-orders", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            const orders = await res.json();
            this.renderOrders(orders);
        } catch (e) {
            console.error("Failed to load purchase orders", e);
        }
    },

    renderOrders(orders) {
        const tbody = document.getElementById("procurement-orders-list");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Buyurtmalar mavjud emas</td></tr>`;
            return;
        }

        orders.forEach(o => {
            let statusBadge = "";
            if (o.status === "received") statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">Qabul qilingan</span>`;
            else if (o.status === "approved") statusBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6;">Tasdiqlangan</span>`;
            else if (o.status === "draft") statusBadge = `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b;">Qoralama</span>`;
            else statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b;">Kutilmoqda</span>`;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>#${o.id.substring(0, 8)}</strong></td>
                <td>${o.supplier_name}</td>
                <td><strong>${formatMoney(o.total_amount)}</strong></td>
                <td>${new Date(o.created_at).toLocaleDateString()}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    ${o.status === "draft" ? `<button class="btn btn-secondary btn-sm" onclick="window.Procurement.approveOrder('${o.id}')"><i class="fas fa-check"></i> Tasdiqlash</button>` : ""}
                    ${o.status === "approved" ? `<button class="btn btn-primary btn-sm" onclick="window.Procurement.receiveGoods('${o.id}')"><i class="fas fa-warehouse"></i> Tovar olish</button>` : ""}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async approveOrder(id) {
        if (!confirm("Ushbu xarid buyurtmasini tasdiqlaysizmi?")) return;
        try {
            const res = await fetch(`/api/purchase-orders/${id}/approve`, {
                method: "POST",
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin",
                    "x-user-id": localStorage.getItem("username") || "admin"
                }
            });
            if (res.ok) {
                alert("Buyurtma muvaffaqiyatli tasdiqlandi!");
                this.loadPurchaseOrders();
                if (window.App && typeof window.App.loadCEODashboard === "function") {
                    window.App.loadCEODashboard();
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    async receiveGoods(id) {
        if (!confirm("Tovar omborga qabul qilindimi? Bu ombor zaxirasini oshiradi va xarajat deb hisoblanadi.")) return;
        try {
            const res = await fetch(`/api/purchase-orders/${id}/receive`, {
                method: "POST",
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            if (res.ok) {
                alert("Tovar omborga muvaffaqiyatli qabul qilindi!");
                this.loadPurchaseOrders();
                if (window.App && typeof window.App.loadCEODashboard === "function") {
                    window.App.loadCEODashboard();
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    openSupplierModal() {
        alert("Yetkazib beruvchilar boshqaruvi: Yetkazib beruvchilar jadvali orqali boshqariladi.");
    },

    inventory: [],
    customers: [],

    async openOrderModal() {
        // Reset form
        const form = document.getElementById("procurement-order-form");
        if (form) form.reset();

        document.getElementById("p-order-items-tbody").innerHTML = "";
        document.getElementById("p-order-total-span").textContent = "0 UZS";

        // Set tomorrow as default delivery date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById("p-order-delivery-date").value = tomorrow.toISOString().split('T')[0];

        const companyId = localStorage.getItem("company_id") || "admin";

        // 1. Fetch and populate customers
        const customerSelect = document.getElementById("p-order-customer-select");
        if (customerSelect) {
            customerSelect.innerHTML = '<option value="">-- Yangi/Qo\'lda kiritish --</option>';
            try {
                const res = await fetch("/api/customers", {
                    headers: { "x-company-id": companyId }
                });
                this.customers = await res.json();
                this.customers.forEach(c => {
                    const opt = document.createElement("option");
                    opt.value = c.id;
                    opt.textContent = c.name + (c.phone ? " (" + c.phone + ")" : "");
                    customerSelect.appendChild(opt);
                });
            } catch (e) {
                console.error("Failed to load customers for order", e);
            }

            // Customer selection change handler
            customerSelect.onchange = (e) => {
                const selectedId = e.target.value;
                const custNameInput = document.getElementById("p-order-cust-name");
                const custPhoneInput = document.getElementById("p-order-cust-phone");
                
                if (selectedId) {
                    const customer = this.customers.find(c => String(c.id) === String(selectedId));
                    if (customer) {
                        custNameInput.value = customer.name || "";
                        custPhoneInput.value = customer.phone || "";
                    }
                } else {
                    custNameInput.value = "";
                    custPhoneInput.value = "";
                }
            };
        }

        // 2. Fetch and populate warehouses (REGOS)
        const stockSelect = document.getElementById("p-order-stock-select");
        if (stockSelect) {
            stockSelect.innerHTML = '<option value="">Omborni tanlang...</option>';
            try {
                const res = await fetch("/api/integration/regos/warehouses", {
                    headers: { "x-company-id": companyId }
                });
                const stocks = await res.json();
                stocks.forEach(s => {
                    const opt = document.createElement("option");
                    opt.value = s.id;
                    opt.textContent = s.name;
                    stockSelect.appendChild(opt);
                });
                if (stocks.length > 0) {
                    stockSelect.value = stocks[0].id;
                }
            } catch (e) {
                console.error("Failed to load REGOS warehouses", e);
                stockSelect.innerHTML = `
                    <option value="regos_1" selected>Asosiy ombor (Chilonzor)</option>
                    <option value="regos_2">Yunusobod filiali</option>
                    <option value="regos_3">Sergeli ombori</option>
                    <option value="regos_4">Qo'yliq filiali</option>
                `;
            }
        }

        // 3. Fetch inventory products (Regos products start with i_regos_)
        try {
            const res = await fetch("/api/inventory", {
                headers: { "x-company-id": companyId }
            });
            const allInv = await res.json();
            this.inventory = (allInv || []).filter(item => String(item.id).startsWith("i_regos_"));
            if (this.inventory.length === 0) {
                this.inventory = allInv || [];
            }
        } catch (e) {
            console.error("Failed to load inventory for order", e);
        }

        // Add first empty item row automatically
        this.addOrderItemRow();

        // 4. Setup form submit listener
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                await this.submitRegosOrder();
            };
        }

        window.showModal("procurement-order-modal");
    },

    addOrderItemRow() {
        const tbody = document.getElementById("p-order-items-tbody");
        if (!tbody) return;

        const rowId = "row_" + Math.random().toString(36).substr(2, 9);
        const tr = document.createElement("tr");
        tr.id = rowId;

        // Generate product options
        let productOptions = '<option value="">-- Mahsulotni tanlang --</option>';
        this.inventory.forEach(item => {
            productOptions += `<option value="${item.id}" data-price="${item.price || 0}">${item.name} (${item.sku || "RE-" + item.id}) - ${parseFloat(item.price || 0).toLocaleString()} UZS</option>`;
        });

        tr.innerHTML = `
            <td style="padding: 6px;">
                <select class="form-control item-select" required style="width:100%; font-size:12px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); color: #f8fafc;">
                    ${productOptions}
                </select>
            </td>
            <td style="padding: 6px; text-align: center;">
                <input type="number" class="form-control item-qty" required min="1" value="1" style="width:100%; text-align:center; font-size:12px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); color: #f8fafc; padding: 4px;">
            </td>
            <td style="padding: 6px; text-align: right;">
                <input type="number" class="form-control item-price" required min="0" value="0" style="width:100%; text-align:right; font-size:12px; background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.1); color: #f8fafc; padding: 4px;">
            </td>
            <td style="padding: 6px; text-align: right; font-weight: 600; color: #cbd5e1; vertical-align: middle;" class="item-subtotal">0 UZS</td>
            <td style="padding: 6px; text-align: center; vertical-align: middle;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('${rowId}').remove(); window.Procurement.updateOrderTotals();" style="padding: 4px 8px; font-size: 11px; background:rgba(239,68,68,0.15); color:#f87171; border-color:rgba(239,68,68,0.2);">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;

        tbody.appendChild(tr);

        const select = tr.querySelector(".item-select");
        const qtyInput = tr.querySelector(".item-qty");
        const priceInput = tr.querySelector(".item-price");

        select.onchange = (e) => {
            const selectedOpt = select.options[select.selectedIndex];
            if (selectedOpt && selectedOpt.value) {
                const defaultPrice = parseFloat(selectedOpt.getAttribute("data-price") || 0);
                priceInput.value = defaultPrice;
            } else {
                priceInput.value = 0;
            }
            this.updateOrderTotals();
        };

        qtyInput.oninput = () => this.updateOrderTotals();
        priceInput.oninput = () => this.updateOrderTotals();
    },

    updateOrderTotals() {
        const tbody = document.getElementById("p-order-items-tbody");
        if (!tbody) return;

        let grandTotal = 0;
        const rows = tbody.querySelectorAll("tr");
        
        rows.forEach(row => {
            const qty = parseFloat(row.querySelector(".item-qty").value || 0);
            const price = parseFloat(row.querySelector(".item-price").value || 0);
            const subtotal = qty * price;
            grandTotal += subtotal;

            row.querySelector(".item-subtotal").textContent = subtotal.toLocaleString() + " UZS";
        });

        document.getElementById("p-order-total-span").textContent = grandTotal.toLocaleString() + " UZS";
    },

    async submitRegosOrder() {
        const tbody = document.getElementById("p-order-items-tbody");
        const rows = tbody ? tbody.querySelectorAll("tr") : [];
        
        if (rows.length === 0) {
            alert("Xatolik: Buyurtma qilish uchun kamida bitta mahsulot qo'shing!");
            return;
        }

        const items = [];
        let valid = true;

        rows.forEach(row => {
            const select = row.querySelector(".item-select");
            const qty = parseFloat(row.querySelector(".item-qty").value || 0);
            const price = parseFloat(row.querySelector(".item-price").value || 0);

            if (!select.value) {
                alert("Iltimos, tanlanmagan mahsulot qatorini to'ldiring yoki o'chiring!");
                valid = false;
                return;
            }

            items.push({
                product_id: select.value,
                quantity: qty,
                price: price
            });
        });

        if (!valid) return;

        const payload = {
            customer_name: document.getElementById("p-order-cust-name").value.trim(),
            customer_phone: document.getElementById("p-order-cust-phone").value.trim(),
            delivery_address: document.getElementById("p-order-address").value.trim(),
            delivery_date: document.getElementById("p-order-delivery-date").value,
            stock_id: document.getElementById("p-order-stock-select").value,
            description: document.getElementById("p-order-notes").value.trim(),
            items: items
        };

        const submitBtn = document.querySelector("#procurement-order-form button[type='submit']");
        const originalBtnHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REGOS-ga yuborilmoqda...';

        try {
            const res = await fetch("/api/integration/regos/create-order", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Muvaffaqiyatli! Buyurtma REGOS POS-ga yuborildi. REGOS Buyurtma ID: #${data.regos_order_id}`);
                window.closeModal("procurement-order-modal");
            } else {
                const err = await res.json();
                alert("Xatolik yuz berdi: " + (err.detail || JSON.stringify(err)));
            }
        } catch (e) {
            console.error("Failed to submit order to REGOS", e);
            alert("REGOS-ga buyurtma yuborishda ulanish xatoligi yuz berdi.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    }
};

function formatMoney(amount) {
    return parseFloat(amount).toLocaleString() + " UZS";
}
