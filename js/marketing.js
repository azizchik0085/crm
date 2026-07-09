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
                <td><span class="badge" style="background: ${c.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}; color: ${c.status === 'active' ? '#10b981' : '#f59e0b'};">${c.status === 'active' ? 'Faol' : 'To\'xtatilgan'}</span></td>
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
        document.getElementById("marketing-campaign-form").reset();
        showModal("marketing-campaign-modal");
    },

    async saveCampaign(event) {
        event.preventDefault();
        const payload = {
            name: document.getElementById("m-camp-name").value,
            platform: document.getElementById("m-camp-platform").value,
            budget: parseFloat(document.getElementById("m-camp-budget").value || 0),
            spent: parseFloat(document.getElementById("m-camp-spent").value || 0),
            leads: parseInt(document.getElementById("m-camp-leads").value || 0),
            status: "active",
            start_date: document.getElementById("m-camp-start").value || null,
            end_date: document.getElementById("m-camp-end").value || null
        };

        try {
            const res = await fetch("/api/marketing/campaigns", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                closeModal("marketing-campaign-modal");
                this.loadCampaigns();
                if (window.App && typeof window.App.loadCEODashboard === "function") {
                    window.App.loadCEODashboard();
                }
            } else {
                alert("Kampaniyani saqlashda xatolik yuz berdi");
            }
        } catch (e) {
            console.error(e);
        }
    },

    async openMetaSettings() {
        try {
            const res = await fetch("/api/settings", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            if (res.ok) {
                const settings = await res.json();
                document.getElementById("meta-api-access-token").value = settings.meta_access_token || "";
                document.getElementById("meta-ad-account-id").value = settings.meta_ad_account_id || "";
            }
        } catch (e) {
            console.error(e);
        }
        showModal("meta-marketing-settings-modal");
    },

    async saveMetaSettings(event) {
        event.preventDefault();
        const token = document.getElementById("meta-api-access-token").value.trim();
        const accountId = document.getElementById("meta-ad-account-id").value.trim();

        try {
            const getRes = await fetch("/api/settings", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            let settings = {};
            if (getRes.ok) {
                settings = await getRes.json();
            }

            settings.meta_access_token = token;
            settings.meta_ad_account_id = accountId;

            const res = await fetch("/api/settings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                closeModal("meta-marketing-settings-modal");
                alert("Meta API sozlamalari muvaffaqiyatli saqlandi!");
            } else {
                alert("Saqlashda xatolik yuz berdi");
            }
        } catch (e) {
            console.error(e);
        }
    },

    async syncCampaigns() {
        const btn = document.getElementById("btn-marketing-sync");
        if (!btn) return;

        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Sinxronizatsiya qilinmoqda...`;

        try {
            const res = await fetch("/api/marketing/sync", {
                method: "POST",
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            if (res.ok) {
                const data = await res.json();
                this.renderCampaigns(data);
                alert(`Meta Ads sinxronizatsiyasi muvaffaqiyatli yakunlandi! ${data.length} ta reklama kampaniyasi yuklandi.`);
                if (window.App && typeof window.App.loadCEODashboard === "function") {
                    window.App.loadCEODashboard();
                }
            } else {
                alert("Sinxronizatsiya qilishda xatolik yuz berdi. Iltimos API kalitlarini yoki tarmoq aloqasini tekshiring.");
            }
        } catch (e) {
            console.error(e);
            alert("Ulanish xatosi yuz berdi: " + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }
};

function formatMoney(amount) {
    return parseFloat(amount).toLocaleString() + " UZS";
}
