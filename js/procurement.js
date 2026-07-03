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

    openOrderModal() {
        alert("Yangi xarid so'rovi yuborish: Tez kunlarda faollashadi.");
    }
};

function formatMoney(amount) {
    return parseFloat(amount).toLocaleString() + " UZS";
}
