// ERP & CRM Tizimi - Hisobotlar Moduli
window.Reports = {
    activeTab: 'sales', // 'sales', 'employees', 'operators'
    chartInstance: null,
    stats: null,

    init: async function() {
        this.setDefaultDates();
        this.setupEventListeners();
        await this.render();
    },

    setDefaultDates: function() {
        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        document.getElementById('reports-date-start').value = startOfMonth.toISOString().split('T')[0];
        document.getElementById('reports-date-end').value = today.toISOString().split('T')[0];
    },

    setupEventListeners: function() {
        // Tab buttons
        const tabs = {
            sales: document.getElementById('rep-tab-sales'),
            employees: document.getElementById('rep-tab-employees'),
            operators: document.getElementById('rep-tab-operators')
        };

        for (const [key, btn] of Object.entries(tabs)) {
            if (btn) {
                btn.onclick = () => {
                    this.activeTab = key;
                    for (const [k, b] of Object.entries(tabs)) {
                        if (k === key) {
                            b.classList.add('btn-primary');
                            b.classList.remove('btn-secondary');
                        } else {
                            b.classList.add('btn-secondary');
                            b.classList.remove('btn-primary');
                        }
                    }
                    this.switchTabDisplay();
                };
            }
        }

        // Date submit
        const filterBtn = document.getElementById('reports-filter-submit');
        if (filterBtn) {
            filterBtn.onclick = () => this.render();
        }

        // Preset date buttons
        const presets = {
            today: document.getElementById('rep-preset-today'),
            week: document.getElementById('rep-preset-week'),
            month: document.getElementById('rep-preset-month'),
            prevMonth: document.getElementById('rep-preset-prev-month')
        };

        if (presets.today) {
            presets.today.onclick = () => {
                const todayStr = new Date().toISOString().split('T')[0];
                document.getElementById('reports-date-start').value = todayStr;
                document.getElementById('reports-date-end').value = todayStr;
                this.render();
            };
        }
        if (presets.week) {
            presets.week.onclick = () => {
                const today = new Date();
                const past = new Date();
                past.setDate(today.getDate() - 7);
                document.getElementById('reports-date-start').value = past.toISOString().split('T')[0];
                document.getElementById('reports-date-end').value = today.toISOString().split('T')[0];
                this.render();
            };
        }
        if (presets.month) {
            presets.month.onclick = () => {
                const today = new Date();
                const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                document.getElementById('reports-date-start').value = startOfMonth.toISOString().split('T')[0];
                document.getElementById('reports-date-end').value = today.toISOString().split('T')[0];
                this.render();
            };
        }
        if (presets.prevMonth) {
            presets.prevMonth.onclick = () => {
                const today = new Date();
                const startOfPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const endOfPrev = new Date(today.getFullYear(), today.getMonth(), 0);
                document.getElementById('reports-date-start').value = startOfPrev.toISOString().split('T')[0];
                document.getElementById('reports-date-end').value = endOfPrev.toISOString().split('T')[0];
                this.render();
            };
        }
    },

    switchTabDisplay: function() {
        const panels = ['sales-panel', 'employees-panel', 'operators-panel'];
        panels.forEach(p => {
            const el = document.getElementById(`rep-${p}`);
            if (el) {
                el.style.display = p.startsWith(this.activeTab) ? 'block' : 'none';
            }
        });
        
        if (this.activeTab === 'sales') {
            this.renderCharts();
        }
    },

    render: async function() {
        const container = document.getElementById('reports-content-container');
        if (!container) return;

        const dateStartStr = document.getElementById('reports-date-start').value;
        const dateEndStr = document.getElementById('reports-date-end').value;

        if (!dateStartStr || !dateEndStr) {
            alert("Iltimos, boshlanish va tugash sanalarini tanlang!");
            return;
        }

        container.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; padding: 64px; color: var(--text-muted);">
                <i class="fas fa-spinner fa-spin" style="font-size: 32px; margin-right: 12px;"></i>
                Hisobotlar tayyorlanmoqda, iltimos kuting...
            </div>
        `;

        const startTimestamp = Math.floor(new Date(dateStartStr + "T00:00:00+05:00").getTime() / 1000);
        const endTimestamp = Math.floor(new Date(dateEndStr + "T23:59:59+05:00").getTime() / 1000);

        let reportData = { total_sales: 0, total_profit: 0, employee_sales: {} };
        try {
            const reportRes = await fetch(`/api/integration/regos/sales-report?start_date=${startTimestamp}&end_date=${endTimestamp}`);
            if (reportRes.ok) {
                const data = await reportRes.json();
                if (data.status === 'success') {
                    reportData = data;
                }
            }
        } catch (err) {
            console.error('REGOS sales report fetch failed:', err);
        }

        let receipts = [];
        try {
            receipts = await DB.getReceipts();
        } catch (e) {
            console.error("Failed to load receipts for reports:", e);
        }

        let customers = [];
        try {
            customers = await DB.getCustomers();
        } catch (e) {
            console.error("Failed to load customers for reports:", e);
        }

        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const startMs = new Date(dateStartStr + "T00:00:00").getTime();
        const endMs = new Date(dateEndStr + "T23:59:59").getTime();

        const periodReceipts = receipts.filter(r => {
            const rTime = new Date(r.created_at).getTime();
            return rTime >= startMs && rTime <= endMs;
        });

        const regosSales = reportData.total_sales || 0;
        const regosProfit = reportData.total_profit || 0;
        const receiptsCount = periodReceipts.length;
        const avgReceipt = receiptsCount > 0 ? Math.round(periodReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0) / receiptsCount) : 0;
        
        const operatorSalesMap = {};
        periodReceipts.forEach(r => {
            let itemsObj = r.items;
            if (typeof itemsObj === 'string') {
                try { itemsObj = JSON.parse(itemsObj); } catch (e) { itemsObj = null; }
            }
            let cName = '';
            let cPhone = '';
            if (itemsObj && !Array.isArray(itemsObj) && typeof itemsObj === 'object') {
                cName = itemsObj.customer_name || '';
                cPhone = itemsObj.customer_phone || '';
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

            const operator = matchedCustomer ? (matchedCustomer.operator || 'Noma\'lum / Avtomat') : 'Noma\'lum / Avtomat';
            if (!operatorSalesMap[operator]) {
                operatorSalesMap[operator] = { name: operator, sales: 0, count: 0, profit: 0 };
            }
            const rSum = r.total_amount || 0;
            operatorSalesMap[operator].sales += rSum;
            operatorSalesMap[operator].count += 1;
        });

        const companyMargin = regosSales > 0 ? (regosProfit / regosSales) : 0.25;
        Object.values(operatorSalesMap).forEach(op => {
            op.profit = Math.round(op.sales * companyMargin);
        });

        this.stats = {
            dateLabels: this.getDateLabels(dateStartStr, dateEndStr),
            receipts: periodReceipts,
            employeeSales: reportData.employee_sales || {},
            operatorSales: operatorSalesMap,
            currency: currency
        };

        let html = `
            <div class="stats-grid" style="margin-top: 16px;">
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Jami Savdo (REGOS)</h3>
                        <div class="stat-value" style="color: var(--accent); font-family: 'JetBrains Mono';">${formatMoney(regosSales, currency)}</div>
                    </div>
                    <div class="stat-icon-box primary"><i class="fas fa-chart-line"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Sof Foyda</h3>
                        <div class="stat-value" style="color: var(--success); font-family: 'JetBrains Mono';">${formatMoney(regosProfit, currency)}</div>
                    </div>
                    <div class="stat-icon-box income"><i class="fas fa-dollar-sign"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>Cheklar Soni</h3>
                        <div class="stat-value" style="color: #60a5fa; font-family: 'JetBrains Mono';">${receiptsCount} ta</div>
                    </div>
                    <div class="stat-icon-box" style="background: rgba(96,165,250,0.1); color: #60a5fa;"><i class="fas fa-receipt"></i></div>
                </div>
                <div class="card stat-card" style="padding: 16px;">
                    <div class="stat-info">
                        <h3>O'rtacha Chek</h3>
                        <div class="stat-value" style="color: #fb923c; font-family: 'JetBrains Mono';">${formatMoney(avgReceipt, currency)}</div>
                    </div>
                    <div class="stat-icon-box" style="background: rgba(251,146,60,0.1); color: #fb923c;"><i class="fas fa-calculator"></i></div>
                </div>
            </div>

            <!-- Panel: Sales Trend -->
            <div id="rep-sales-panel" style="display: ${this.activeTab === 'sales' ? 'block' : 'none'}; margin-top: 24px;">
                <div class="card" style="padding: 20px;">
                    <h3 style="margin-top: 0; color: var(--text-main); font-size: 16px;"><i class="fas fa-chart-area" style="color: var(--accent); margin-right: 8px;"></i> Sotuvlar Grafigi (Kunlik)</h3>
                    <div class="chart-container" style="height: 320px; position: relative; margin-top: 16px;">
                        <canvas id="reports-sales-chart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Panel: Employees -->
            <div id="rep-employees-panel" style="display: ${this.activeTab === 'employees' ? 'block' : 'none'}; margin-top: 24px;">
                <div class="card" style="padding: 20px;">
                    <h3 style="margin-top: 0; color: var(--text-main); font-size: 16px;"><i class="fas fa-user-friends" style="color: #fb923c; margin-right: 8px;"></i> Xodimlar bo'yicha Savdo ko'rsatkichlari</h3>
                    <div class="table-responsive" style="margin-top: 16px;">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Xodim ismi</th>
                                    <th>Sotuv Summasi</th>
                                    <th>Yalpi Foyda</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        const empSalesList = Object.values(reportData.employee_sales);
        if (empSalesList.length === 0) {
            html += `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 24px;">Xodimlar bo'yicha ma'lumot topilmadi.</td></tr>`;
        } else {
            empSalesList.sort((a,b) => b.sales - a.sales).forEach(emp => {
                html += `
                    <tr>
                        <td><strong>${emp.name || emp.login}</strong></td>
                        <td style="font-family: 'JetBrains Mono'; font-weight: 600; color: var(--text-main);">${formatMoney(emp.sales, currency)}</td>
                        <td style="font-family: 'JetBrains Mono'; font-weight: 600; color: var(--success);">${formatMoney(emp.profit, currency)}</td>
                    </tr>
                `;
            });
        }

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Panel: Operators -->
            <div id="rep-operators-panel" style="display: ${this.activeTab === 'operators' ? 'block' : 'none'}; margin-top: 24px;">
                <div class="card" style="padding: 20px;">
                    <h3 style="margin-top: 0; color: var(--text-main); font-size: 16px;"><i class="fas fa-headset" style="color: #60a5fa; margin-right: 8px;"></i> amoCRM Operatorlari samaradorligi</h3>
                    <div class="table-responsive" style="margin-top: 16px;">
                        <table class="custom-table">
                            <thead>
                                <tr>
                                    <th>Operator ismi</th>
                                    <th style="text-align: center;">Cheklar soni</th>
                                    <th>Savdo Summasi</th>
                                    <th>O'rtacha Chek</th>
                                    <th>Taxminiy Foyda</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        const opSalesList = Object.values(operatorSalesMap);
        if (opSalesList.length === 0) {
            html += `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Operatorlar bo'yicha ma'lumot topilmadi.</td></tr>`;
        } else {
            opSalesList.sort((a,b) => b.sales - a.sales).forEach(op => {
                const opAvg = op.count > 0 ? Math.round(op.sales / op.count) : 0;
                html += `
                    <tr>
                        <td><strong>${op.name}</strong></td>
                        <td style="text-align: center; font-family: 'JetBrains Mono'; font-weight: 600; color: var(--text-main);">${op.count} ta</td>
                        <td style="font-family: 'JetBrains Mono'; font-weight: 600; color: var(--text-main);">${formatMoney(op.sales, currency)}</td>
                        <td style="font-family: 'JetBrains Mono'; color: var(--text-muted);">${formatMoney(opAvg, currency)}</td>
                        <td style="font-family: 'JetBrains Mono'; font-weight: 600; color: var(--success);">${formatMoney(op.profit, currency)}</td>
                    </tr>
                `;
            });
        }

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;
        this.renderCharts();
    },

    getDateLabels: function(startStr, endStr) {
        const labels = [];
        const start = new Date(startStr);
        const end = new Date(endStr);
        const temp = new Date(start);
        
        while (temp <= end) {
            labels.push(temp.toISOString().split('T')[0]);
            temp.setDate(temp.getDate() + 1);
        }
        return labels;
    },

    renderCharts: function() {
        if (this.activeTab !== 'sales' || !this.stats) return;

        const ctx = document.getElementById('reports-sales-chart')?.getContext('2d');
        if (!ctx) return;

        const labels = this.stats.dateLabels;
        const salesData = labels.map(label => {
            const startMs = new Date(label + "T00:00:00").getTime();
            const endMs = new Date(label + "T23:59:59").getTime();
            return this.stats.receipts
                .filter(r => {
                    const t = new Date(r.created_at).getTime();
                    return t >= startMs && t <= endMs;
                })
                .reduce((sum, r) => sum + (r.total_amount || 0), 0);
        });

        const isDark = document.body.classList.contains('dark-theme') || document.documentElement.classList.contains('dark-theme');
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Sotuvlar summasi (UZS)',
                    data: salesData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: textColor,
                            font: { family: 'Outfit', size: 12 }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Outfit' } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }
};
