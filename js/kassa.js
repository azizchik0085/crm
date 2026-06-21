// ERP & CRM Tizimi - Kassa & Dastavka (POS & Delivery) Moduli

window.Kassa = {
    receiptsList: [],
    employeesList: [],
    activeStatus: 'all', // 'all', 'pending', 'preparing', 'shipped', 'delivered', 'cancelled'

    init: async function() {
        this.setupEventListeners();
        await this.loadEmployees();
        await this.render();
    },

    setupEventListeners: function() {
        // Search filter
        const searchInput = document.getElementById('kassa-search');
        if (searchInput) {
            let debounceTimer;
            searchInput.oninput = () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.render();
                }, 300);
            };
        }

        // Tab button filters
        const tabButtons = document.querySelectorAll('.kassa-tab-btn');
        tabButtons.forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                tabButtons.forEach(b => {
                    b.classList.remove('btn-primary');
                    b.classList.add('btn-secondary');
                });
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
                
                this.activeStatus = btn.getAttribute('data-status');
                this.render();
            };
        });

        // Courier Modal Form Submit
        const courierForm = document.getElementById('kassa-courier-form');
        if (courierForm) {
            courierForm.onsubmit = (e) => {
                e.preventDefault();
                this.saveCourierDetails();
            };
        }

        // Dropdown selection to autofill phone if employee is chosen
        const courierSelect = document.getElementById('kassa-courier-name');
        if (courierSelect) {
            courierSelect.onchange = () => {
                const selectedVal = courierSelect.value;
                const emp = this.employeesList.find(e => e.name === selectedVal || e.id === selectedVal);
                if (emp && emp.phone) {
                    const phoneInput = document.getElementById('kassa-courier-phone');
                    if (phoneInput) phoneInput.value = emp.phone;
                }
            };
        }
    },

    loadEmployees: async function() {
        try {
            this.employeesList = await DB.getEmployees();
        } catch (e) {
            console.error("Failed to load employees for courier selection:", e);
            this.employeesList = [];
        }
    },

    loadReceipts: async function() {
        try {
            const data = await DB.getReceipts();
            this.receiptsList = Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Failed to load receipts in Kassa:", e);
            this.receiptsList = [];
        }
    },

    render: async function() {
        const container = document.getElementById('kassa-content');
        if (!container) return;

        // Show a loader
        container.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; padding: 48px; color: var(--text-muted);">
                <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-right: 12px;"></i>
                Cheklar yuklanmoqda...
            </div>
        `;

        await this.loadReceipts();

        const searchVal = document.getElementById('kassa-search')?.value.toLowerCase() || '';
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        // Helper to parse items field safely
        const parseItems = (receipt) => {
            let itemsObj = receipt.items;
            if (typeof itemsObj === 'string') {
                try {
                    itemsObj = JSON.parse(itemsObj);
                } catch (e) {
                    itemsObj = {};
                }
            }
            if (!itemsObj || Array.isArray(itemsObj) || typeof itemsObj !== 'object') {
                // If it is just products array or empty
                itemsObj = {
                    customer_name: "",
                    customer_phone: "",
                    products: Array.isArray(itemsObj) ? itemsObj : [],
                    delivery: { status: "pending" }
                };
            }
            if (!itemsObj.delivery) {
                itemsObj.delivery = { status: "pending" };
            }
            if (!itemsObj.delivery.status) {
                itemsObj.delivery.status = "pending";
            }
            return itemsObj;
        };

        // Filter and count stats
        let pendingCount = 0;
        let preparingCount = 0;
        let shippedCount = 0;

        const processedList = this.receiptsList.map(r => {
            const parsedItems = parseItems(r);
            const status = parsedItems.delivery.status;

            if (status === 'pending') pendingCount++;
            else if (status === 'preparing') preparingCount++;
            else if (status === 'shipped') shippedCount++;

            return {
                ...r,
                parsedItems,
                deliveryStatus: status
            };
        });

        // Update tab badges
        const pendingBadge = document.getElementById('kassa-count-pending');
        const preparingBadge = document.getElementById('kassa-count-preparing');
        const shippedBadge = document.getElementById('kassa-count-shipped');

        if (pendingBadge) {
            pendingBadge.textContent = pendingCount;
            pendingBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';
        }
        if (preparingBadge) {
            preparingBadge.textContent = preparingCount;
            preparingBadge.style.display = preparingCount > 0 ? 'inline-block' : 'none';
        }
        if (shippedBadge) {
            shippedBadge.textContent = shippedCount;
            shippedBadge.style.display = shippedCount > 0 ? 'inline-block' : 'none';
        }

        // Apply filters
        let filtered = processedList;
        if (this.activeStatus !== 'all') {
            filtered = filtered.filter(r => r.deliveryStatus === this.activeStatus);
        }

        if (searchVal) {
            filtered = filtered.filter(r => 
                (r.code && r.code.toLowerCase().includes(searchVal)) ||
                (r.cashier_name && r.cashier_name.toLowerCase().includes(searchVal)) ||
                (r.parsedItems.customer_name && r.parsedItems.customer_name.toLowerCase().includes(searchVal)) ||
                (r.parsedItems.customer_phone && r.parsedItems.customer_phone.includes(searchVal)) ||
                (r.parsedItems.delivery.courier_name && r.parsedItems.delivery.courier_name.toLowerCase().includes(searchVal))
            );
        }

        // Sort by date descending
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted); background: rgba(255,255,255,0.01); border: 1px dashed var(--border-color); border-radius: 16px;">
                    <i class="fas fa-shipping-fast" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
                    <p style="margin: 0; font-size: 14px;">Ushbu holat bo'yicha buyurtma cheklari topilmadi.</p>
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(r => {
            const dateObj = new Date(r.created_at);
            const formattedDate = isNaN(dateObj.getTime()) ? r.created_at : dateObj.toLocaleString('uz-UZ', { hour12: false });
            const dev = r.parsedItems.delivery;
            const prods = r.parsedItems.products || [];
            const preparedProds = dev.prepared_products || [];

            // Determine badge style
            let badgeClass = 'badge-secondary';
            let badgeText = 'Kutilyapti';
            if (r.deliveryStatus === 'pending') {
                badgeClass = 'badge-warning';
                badgeText = 'Kutilyapti';
            } else if (r.deliveryStatus === 'preparing') {
                badgeClass = 'badge-info';
                badgeText = 'Tayyorlanmoqda';
            } else if (r.deliveryStatus === 'shipped') {
                badgeClass = 'badge-primary';
                badgeText = 'Yo\'lda';
            } else if (r.deliveryStatus === 'delivered') {
                badgeClass = 'badge-success';
                badgeText = 'Yetkazildi';
            } else if (r.deliveryStatus === 'cancelled') {
                badgeClass = 'badge-danger';
                badgeText = 'Bekor qilindi';
            }

            // Products rendering
            let productsHtml = '';
            let progressHtml = '';
            
            if (r.deliveryStatus === 'preparing') {
                // Checklist UI for cashier to prepare products
                let checkedCount = 0;
                let checklistItemsHtml = '';
                
                prods.forEach((p, idx) => {
                    const isChecked = preparedProds.includes(idx);
                    if (isChecked) checkedCount++;
                    
                    checklistItemsHtml += `
                        <label style="display: flex; align-items: flex-start; gap: 10px; padding: 6px 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; user-select: none; font-size: 13px; color: ${isChecked ? 'var(--text-muted)' : 'var(--text-main)'};">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.Kassa.togglePreparedProduct('${r.id}', ${idx}, this.checked)" style="width: 16px; height: 16px; margin-top: 2px; accent-color: var(--accent); cursor: pointer;">
                            <span style="${isChecked ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                                <strong>${p.quantity}x</strong> ${p.name || 'Noma\'lum mahsulot'} <span style="font-family:'JetBrains Mono'; font-size:11px; opacity:0.7;">(${p.sku || '-'})</span>
                            </span>
                        </label>
                    `;
                });

                const totalItems = prods.length;
                const percent = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 100;
                const isFullyPrepared = checkedCount === totalItems && totalItems > 0;

                progressHtml = `
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
                            <span>Yig'ish jarayoni:</span>
                            <strong>${checkedCount}/${totalItems} (${percent}%)</strong>
                        </div>
                        <div style="height: 6px; width: 100%; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;">
                            <div style="height: 100%; width: ${percent}%; background: ${isFullyPrepared ? 'var(--success)' : 'var(--accent)'}; transition: width 0.3s;"></div>
                        </div>
                    </div>
                `;
                productsHtml = `<div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; margin-bottom: 12px; padding-right: 4px;">${checklistItemsHtml}</div>`;
            } else {
                // Static products list for other views
                let itemsList = '';
                prods.forEach(p => {
                    itemsList += `
                        <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.02);">
                            <span style="color: var(--text-muted);"><strong style="color: var(--text-main); font-family: 'JetBrains Mono';">${p.quantity}x</strong> ${p.name}</span>
                            <span style="font-family: 'JetBrains Mono'; font-weight: 500;">${formatMoney(p.total, currency)}</span>
                        </div>
                    `;
                });
                productsHtml = `<div style="margin-bottom: 12px; max-height: 120px; overflow-y: auto;">${itemsList}</div>`;
            }

            // Customer details row
            let customerHtml = '';
            if (r.parsedItems.customer_name || r.parsedItems.customer_phone) {
                customerHtml = `
                    <div style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 13px;">
                        <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                            <span style="color: var(--text-muted); width: 80px; flex-shrink: 0;"><i class="fas fa-user" style="width: 14px;"></i> Xaridor:</span>
                            <strong style="color: var(--text-main);">${r.parsedItems.customer_name || '-'}</strong>
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                            <span style="color: var(--text-muted); width: 80px; flex-shrink: 0;"><i class="fas fa-phone-alt" style="width: 14px;"></i> Telefon:</span>
                            <a href="#" onclick="event.preventDefault(); Telephony.dial('${r.parsedItems.customer_phone}')" style="color: var(--success); font-family: 'JetBrains Mono'; font-weight: 500;"><i class="fas fa-phone-alt" style="font-size:10px; margin-right:2px;"></i> ${r.parsedItems.customer_phone || '-'}</a>
                        </div>
                        ${dev.address ? `
                        <div style="display: flex; gap: 8px; align-items: flex-start;">
                            <span style="color: var(--text-muted); width: 80px; flex-shrink: 0;"><i class="fas fa-map-marker-alt" style="width: 14px;"></i> Manzil:</span>
                            <span style="color: var(--text-main); font-weight: 400; line-height: 1.3;">${dev.address}</span>
                        </div>` : ''}
                    </div>
                `;
            }

            // Courier details if status is shipped or delivered
            let courierHtml = '';
            if (r.deliveryStatus === 'shipped' || r.deliveryStatus === 'delivered') {
                courierHtml = `
                    <div style="background: rgba(99, 102, 241, 0.03); border: 1px solid rgba(99, 102, 241, 0.1); border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 13px;">
                        <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                            <span style="color: var(--text-muted); width: 80px; flex-shrink: 0;"><i class="fas fa-shipping-fast" style="width: 14px;"></i> Kuryer:</span>
                            <strong style="color: var(--text-main);">${dev.courier_name || 'Noma\'lum'}</strong>
                        </div>
                        <div style="display: flex; gap: 8px; margin-bottom: 4px;">
                            <span style="color: var(--text-muted); width: 80px; flex-shrink: 0;"><i class="fas fa-phone-alt" style="width: 14px;"></i> Telefon:</span>
                            <a href="#" onclick="event.preventDefault(); Telephony.dial('${dev.courier_phone}')" style="color: var(--success); font-family: 'JetBrains Mono';"><i class="fas fa-phone-alt" style="font-size:10px; margin-right:2px;"></i> ${dev.courier_phone || '-'}</a>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <span style="color: var(--text-muted); width: 80px; flex-shrink: 0;"><i class="fas fa-money-bill-wave" style="width: 14px;"></i> To'lov:</span>
                            <strong style="color: var(--accent); font-family: 'JetBrains Mono';">${formatMoney(dev.fee || 0, currency)}</strong>
                        </div>
                    </div>
                `;
            }

            // Action buttons based on status
            let actionsHtml = '';
            if (r.deliveryStatus === 'pending') {
                actionsHtml = `
                    <button class="btn btn-primary" onclick="window.Kassa.startPreparation('${r.id}')" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 600; height: 38px;">
                        <i class="fas fa-box-open"></i> Tayyorlashni boshlash
                    </button>
                `;
            } else if (r.deliveryStatus === 'preparing') {
                const totalItems = prods.length;
                const isFullyPrepared = preparedProds.length === totalItems && totalItems > 0;
                
                actionsHtml = `
                    <button class="btn ${isFullyPrepared ? 'btn-primary' : 'btn-secondary'}" onclick="window.Kassa.openCourierModal('${r.id}')" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; font-weight: 600; height: 38px;">
                        <i class="fas fa-truck"></i> Kuryerga topshirish
                    </button>
                `;
            } else if (r.deliveryStatus === 'shipped') {
                actionsHtml = `
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-primary" onclick="window.Kassa.completeDelivery('${r.id}', true)" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 600; height: 36px; background-color: var(--success); border-color: var(--success);">
                            <i class="fas fa-check-circle"></i> Yetkazildi
                        </button>
                        <button class="btn btn-secondary" onclick="window.Kassa.completeDelivery('${r.id}', false)" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; font-weight: 600; height: 36px;">
                            <i class="fas fa-times-circle" style="color: var(--danger);"></i> Bekor qilish
                        </button>
                    </div>
                `;
            }

            html += `
                <div class="card" style="padding: 16px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between; border-radius: 12px; background: rgba(255,255,255,0.015); box-shadow: 0 4px 20px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s;">
                    <div>
                        <!-- Header row -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 8px;">
                            <div>
                                <h3 style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: var(--text-main);">${r.code || 'CH-' + r.id.substring(0, 8)}</h3>
                                <span style="font-size: 11px; color: var(--text-muted); display: block;">Kassa: ${r.cashier_name || 'Noma\'lum'}</span>
                                <span style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono';">${formattedDate}</span>
                            </div>
                            <span class="badge ${badgeClass}" style="padding: 4px 8px; font-size: 11px; font-weight: 600;">${badgeText}</span>
                        </div>

                        <!-- Progress Bar for Packing -->
                        ${progressHtml}

                        <!-- Customer card details -->
                        ${customerHtml}

                        <!-- Courier card details -->
                        ${courierHtml}

                        <!-- Products list -->
                        <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; margin-bottom: 6px; letter-spacing: 0.5px;">Mahsulotlar:</div>
                        ${productsHtml}
                    </div>

                    <!-- Footer / Actions -->
                    <div style="border-top: 1px solid rgba(255,255,255,0.03); padding-top: 12px; margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px;">
                            <span style="color: var(--text-muted);">Jami:</span>
                            <strong style="color: var(--accent); font-family: 'JetBrains Mono'; font-size: 16px;">${formatMoney(r.total_amount || 0, currency)}</strong>
                        </div>
                        ${actionsHtml}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    startPreparation: async function(receiptId) {
        const receipt = this.receiptsList.find(r => r.id === receiptId);
        if (!receipt) return;

        let itemsObj = receipt.items;
        if (typeof itemsObj === 'string') {
            try {
                itemsObj = JSON.parse(itemsObj);
            } catch(e) {
                itemsObj = {};
            }
        }
        if (!itemsObj || Array.isArray(itemsObj) || typeof itemsObj !== 'object') {
            itemsObj = {
                customer_name: "",
                customer_phone: "",
                products: Array.isArray(itemsObj) ? itemsObj : []
            };
        }

        // Initialize delivery and status
        itemsObj.delivery = {
            status: "preparing",
            address: itemsObj.delivery?.address || "",
            courier_name: "",
            courier_phone: "",
            fee: 15000,
            prepared_products: []
        };

        const updatedReceipt = {
            ...receipt,
            items: itemsObj
        };

        try {
            await DB.saveReceipt(updatedReceipt);
            await this.render();
        } catch(e) {
            console.error("Failed to start preparation:", e);
            alert("Tayyorlashni boshlashda xatolik: " + e.message);
        }
    },

    togglePreparedProduct: async function(receiptId, productIndex, isChecked) {
        const receipt = this.receiptsList.find(r => r.id === receiptId);
        if (!receipt) return;

        let itemsObj = receipt.items;
        if (typeof itemsObj === 'string') {
            try {
                itemsObj = JSON.parse(itemsObj);
            } catch(e) {
                itemsObj = {};
            }
        }
        if (!itemsObj || typeof itemsObj !== 'object') return;
        if (!itemsObj.delivery) itemsObj.delivery = {};
        if (!itemsObj.delivery.prepared_products) itemsObj.delivery.prepared_products = [];

        const prepared = itemsObj.delivery.prepared_products;
        const indexInList = prepared.indexOf(productIndex);

        if (isChecked && indexInList === -1) {
            prepared.push(productIndex);
        } else if (!isChecked && indexInList > -1) {
            prepared.splice(indexInList, 1);
        }

        const updatedReceipt = {
            ...receipt,
            items: itemsObj
        };

        try {
            await DB.saveReceipt(updatedReceipt);
            await this.render();
        } catch(e) {
            console.error("Failed to toggle product checkbox:", e);
        }
    },

    openCourierModal: function(receiptId) {
        const receipt = this.receiptsList.find(r => r.id === receiptId);
        if (!receipt) return;

        let itemsObj = receipt.items;
        if (typeof itemsObj === 'string') {
            try {
                itemsObj = JSON.parse(itemsObj);
            } catch(e) {
                itemsObj = {};
            }
        }

        // Fill hidden ID
        const idInput = document.getElementById('kassa-courier-receipt-id');
        if (idInput) idInput.value = receiptId;

        // Fill Address if customer has one or default
        const addressInput = document.getElementById('kassa-delivery-address');
        if (addressInput) {
            addressInput.value = itemsObj?.delivery?.address || "";
        }

        // Fill phone and manual input
        const phoneInput = document.getElementById('kassa-courier-phone');
        if (phoneInput) phoneInput.value = itemsObj?.delivery?.courier_phone || "";

        const manualInput = document.getElementById('kassa-courier-name-manual');
        if (manualInput) manualInput.value = "";

        // Fill courier dropdown with employees
        const courierSelect = document.getElementById('kassa-courier-name');
        if (courierSelect) {
            courierSelect.innerHTML = '<option value="">Tanlang...</option>';
            
            // Filter employees that might be couriers
            const couriers = this.employeesList.filter(e => {
                const role = (e.role || '').toLowerCase();
                return role.includes('kuryer') || role.includes('haydovchi') || role.includes('dastavka') || role.includes('courier') || role.includes('driver');
            });

            // If no courier-specific roles, show all employees
            const listToUse = couriers.length > 0 ? couriers : this.employeesList;

            listToUse.forEach(e => {
                const selectedAttr = (itemsObj?.delivery?.courier_name === e.name) ? 'selected' : '';
                courierSelect.innerHTML += `<option value="${e.name}" ${selectedAttr}>${e.name} (${e.role || 'Xodim'})</option>`;
            });
        }

        // Open modal
        if (window.showModal) showModal('kassa-courier-modal');
        else alert("showModal is not defined. Modal cannot be opened.");
    },

    saveCourierDetails: async function() {
        const idInput = document.getElementById('kassa-courier-receipt-id');
        if (!idInput) return;
        const receiptId = idInput.value;

        const receipt = this.receiptsList.find(r => r.id === receiptId);
        if (!receipt) return;

        const courierSelect = document.getElementById('kassa-courier-name');
        const manualInput = document.getElementById('kassa-courier-name-manual');
        const phoneInput = document.getElementById('kassa-courier-phone');
        const addressInput = document.getElementById('kassa-delivery-address');
        const feeInput = document.getElementById('kassa-delivery-fee');

        let courierName = courierSelect ? courierSelect.value : '';
        if (manualInput && manualInput.value.trim()) {
            courierName = manualInput.value.trim();
        }

        if (!courierName) {
            alert("Iltimos, kuryer ismini tanlang yoki yozing!");
            return;
        }

        let itemsObj = receipt.items;
        if (typeof itemsObj === 'string') {
            try {
                itemsObj = JSON.parse(itemsObj);
            } catch(e) {
                itemsObj = {};
            }
        }
        if (!itemsObj || typeof itemsObj !== 'object') return;
        if (!itemsObj.delivery) itemsObj.delivery = {};

        itemsObj.delivery.status = "shipped"; // Set status to Shipped (Yo'lda)
        itemsObj.delivery.courier_name = courierName;
        itemsObj.delivery.courier_phone = phoneInput ? phoneInput.value.trim() : '';
        itemsObj.delivery.address = addressInput ? addressInput.value.trim() : '';
        itemsObj.delivery.fee = feeInput ? (parseInt(feeInput.value) || 0) : 15000;

        const updatedReceipt = {
            ...receipt,
            items: itemsObj
        };

        try {
            await DB.saveReceipt(updatedReceipt);
            if (window.closeModal) closeModal('kassa-courier-modal');
            await this.render();
        } catch(e) {
            console.error("Failed to save courier details:", e);
            alert("Xatolik: " + e.message);
        }
    },

    completeDelivery: async function(receiptId, success) {
        const statusLabel = success ? "delivered" : "cancelled";
        const statusText = success ? "Yetkazilgan" : "Bekor qilingan";
        
        if (!confirm(`Ushbu buyurtmani [${statusText}] deb belgilashni tasdiqlaysizmi?`)) return;

        const receipt = this.receiptsList.find(r => r.id === receiptId);
        if (!receipt) return;

        let itemsObj = receipt.items;
        if (typeof itemsObj === 'string') {
            try {
                itemsObj = JSON.parse(itemsObj);
            } catch(e) {
                itemsObj = {};
            }
        }
        if (!itemsObj || typeof itemsObj !== 'object') return;
        if (!itemsObj.delivery) itemsObj.delivery = {};

        itemsObj.delivery.status = statusLabel;

        const updatedReceipt = {
            ...receipt,
            items: itemsObj
        };

        try {
            await DB.saveReceipt(updatedReceipt);
            await this.render();

            // Also, update stats
            if (window.App && typeof window.App.updateDashboardStats === 'function') {
                window.App.updateDashboardStats();
            }
        } catch(e) {
            console.error("Failed to complete delivery status transition:", e);
            alert("Xatolik: " + e.message);
        }
    }
};
