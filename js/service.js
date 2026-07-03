// PRO-TECH ERP - Service Center Module
window.Service = {
    async init() {
        console.log("Service module initialized");
        await this.loadOrders();
    },

    async loadOrders() {
        try {
            const res = await fetch("/api/service/orders", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            const orders = await res.json();
            this.renderOrders(orders);
        } catch (e) {
            console.error("Failed to load service orders", e);
        }
    },

    renderOrders(orders) {
        const tbody = document.getElementById("service-orders-list");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Buyurtmalar mavjud emas</td></tr>`;
            return;
        }

        orders.forEach(o => {
            let statusColor = "#64748b";
            if (o.status === "in_progress") statusColor = "#3b82f6";
            else if (o.status === "ready") statusColor = "#10b981";

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${o.customer_name}</strong></td>
                <td>${o.product_name}</td>
                <td><code>${o.serial_number || "-"}</code></td>
                <td>${o.issue}</td>
                <td>${o.assigned_to_name}</td>
                <td><strong>${formatMoney(o.cost)}</strong></td>
                <td><span class="badge" style="background: rgba(255,255,255,0.05); color: ${statusColor};">${o.status.toUpperCase()}</span></td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="window.Service.updateStatus('${o.id}')"><i class="fas fa-edit"></i> Status</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateStatus(id) {
        alert("Buyurtma holatini yangilash va ehtiyot qismlar biriktirish:");
    },

    openOrderModal() {
        alert("Yangi servis buyurtmasini qabul qilish:");
    }
};

function formatMoney(amount) {
    return parseFloat(amount).toLocaleString() + " UZS";
}
