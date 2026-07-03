// PRO-TECH ERP - Marketing Module
window.Marketing = {
    async init() {
        console.log("Marketing module initialized");
        await this.loadCampaigns();
    },

    async loadCampaigns() {
        try {
            const res = await fetch("/api/marketing/campaigns", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            const campaigns = await res.json();
            this.renderCampaigns(campaigns);
        } catch (e) {
            console.error("Failed to load campaigns", e);
        }
    },

    renderCampaigns(campaigns) {
        const tbody = document.getElementById("marketing-campaigns-list");
        if (!tbody) return;
        tbody.innerHTML = "";

        if (campaigns.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">Kampaniyalar mavjud emas</td></tr>`;
            return;
        }

        campaigns.forEach(c => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${c.name}</strong></td>
                <td><span style="text-transform: capitalize;">${c.platform}</span></td>
                <td>${formatMoney(c.budget)}</td>
                <td>${formatMoney(c.spent)}</td>
                <td><strong>${c.leads}</strong></td>
                <td><span style="color: ${c.roi >= 0 ? '#10b981' : '#ef4444'}">${c.roi}%</span></td>
                <td><strong>${c.roas}</strong></td>
                <td><span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981;">Active</span></td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="window.Marketing.deleteCampaign('${c.id}')"><i class="fas fa-trash"></i> O'chirish</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    async deleteCampaign(id) {
        if (!confirm("Ushbu kampaniyani o'chirmoqchimisiz?")) return;
        try {
            const res = await fetch(`/api/marketing/campaigns/${id}`, {
                method: "DELETE",
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            if (res.ok) {
                this.loadCampaigns();
                if (window.App && typeof window.App.loadCEODashboard === "function") {
                    window.App.loadCEODashboard();
                }
            }
        } catch (e) {
            console.error(e);
        }
    },

    openCampaignModal() {
        alert("Yangi reklama kampaniyasi ulash:");
    }
};

function formatMoney(amount) {
    return parseFloat(amount).toLocaleString() + " UZS";
}
