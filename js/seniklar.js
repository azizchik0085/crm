// ERP & CRM Tizimi - Seniklar (Price Tags Printing) Moduli

window.Seniklar = {
    products: [],
    selected: {}, // productId -> { checked: boolean, qty: number }
    
    init: async function() {
        // Set default store name from settings
        const settings = AppStorage.load().settings;
        const storeInput = document.getElementById('seniklar-store-name');
        if (storeInput && !storeInput.value) {
            storeInput.value = settings.companyName || 'Smart Store';
        }

        // Fetch products
        const listContainer = document.getElementById('seniklar-product-list');
        if (listContainer) {
            listContainer.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; padding: 24px; color: var(--text-muted);">
                    <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Yuklanmoqda...
                </div>
            `;
        }

        try {
            this.products = await DB.getInventory();
        } catch (e) {
            console.error("Failed to load inventory for price tags:", e);
            this.products = [];
        }

        // Initialize selection states
        this.products.forEach(p => {
            if (!(p.id in this.selected)) {
                this.selected[p.id] = { checked: false, qty: 1 };
            }
        });

        this.setupEventListeners();
        this.renderProductList();
        this.updatePreview();
    },

    setupEventListeners: function() {
        const searchInput = document.getElementById('seniklar-search');
        if (searchInput) {
            searchInput.oninput = () => {
                this.renderProductList();
            };
        }

        const selectAllCheckbox = document.getElementById('seniklar-select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.onchange = (e) => {
                const checked = e.target.checked;
                const searchVal = searchInput ? searchInput.value.toLowerCase() : '';
                
                // Only select/deselect filtered items
                const filtered = this.products.filter(p => 
                    p.name.toLowerCase().includes(searchVal) || 
                    p.sku.toLowerCase().includes(searchVal) || 
                    (p.category && p.category.toLowerCase().includes(searchVal))
                );

                filtered.forEach(p => {
                    this.selected[p.id].checked = checked;
                });

                this.renderProductList();
                this.updatePreview();
            };
        }
    },

    renderProductList: function() {
        const listContainer = document.getElementById('seniklar-product-list');
        if (!listContainer) return;

        const searchVal = document.getElementById('seniklar-search')?.value.toLowerCase() || '';
        const settings = AppStorage.load().settings;
        const currency = settings.currency;

        const filtered = this.products.filter(p => 
            p.name.toLowerCase().includes(searchVal) || 
            p.sku.toLowerCase().includes(searchVal) || 
            (p.category && p.category.toLowerCase().includes(searchVal))
        );

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
                    Mahsulotlar topilmadi
                </div>
            `;
            return;
        }

        let html = '';
        filtered.forEach(p => {
            const state = this.selected[p.id] || { checked: false, qty: 1 };
            const isChecked = state.checked;
            
            html += `
                <div class="seniklar-product-item ${isChecked ? 'active' : ''}" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border-color); gap: 12px; transition: background 0.2s;">
                    <div style="display: flex; align-items: center; gap: 10px; flex-grow: 1; min-width: 0;">
                        <input type="checkbox" class="product-select-chk" data-id="${p.id}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0;">
                        <div style="display: flex; flex-direction: column; min-width: 0;">
                            <span style="font-size: 13px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.name}">${p.name}</span>
                            <span style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono';">${p.sku} | ${formatMoney(p.price, currency)}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        <span style="font-size: 11px; color: var(--text-muted);">Soni:</span>
                        <input type="number" class="product-qty-input form-control" data-id="${p.id}" min="1" max="1000" value="${state.qty}" ${!isChecked ? 'disabled' : ''} style="width: 54px; height: 28px; padding: 2px 6px; text-align: center; font-size: 12px; font-family: 'JetBrains Mono'; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-main);">
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;

        // Bind event listeners to newly generated elements
        listContainer.querySelectorAll('.product-select-chk').forEach(chk => {
            chk.onchange = (e) => {
                const id = e.target.getAttribute('data-id');
                const checked = e.target.checked;
                this.selected[id].checked = checked;
                
                // Toggle active class and disabled state of quantity input
                const itemRow = e.target.closest('.seniklar-product-item');
                const qtyInput = itemRow.querySelector('.product-qty-input');
                if (checked) {
                    itemRow.classList.add('active');
                    qtyInput.removeAttribute('disabled');
                } else {
                    itemRow.classList.remove('active');
                    qtyInput.setAttribute('disabled', 'true');
                }
                
                this.updateSelectedCount();
                this.updatePreview();
            };
        });

        listContainer.querySelectorAll('.product-qty-input').forEach(input => {
            input.oninput = (e) => {
                const id = e.target.getAttribute('data-id');
                let val = parseInt(e.target.value) || 1;
                if (val < 1) val = 1;
                this.selected[id].qty = val;
                this.updatePreview();
            };
        });

        this.updateSelectedCount();
    },

    updateSelectedCount: function() {
        const count = Object.values(this.selected).filter(s => s.checked).length;
        const countSpan = document.getElementById('seniklar-selected-count');
        if (countSpan) {
            countSpan.textContent = `${count} ta tanlandi`;
        }

        // Update main select-all checkbox state
        const selectAllCheckbox = document.getElementById('seniklar-select-all');
        if (selectAllCheckbox) {
            const allChecked = this.products.length > 0 && Object.values(this.selected).every(s => s.checked);
            selectAllCheckbox.checked = allChecked;
        }
    },

    updatePreview: function() {
        const previewContainer = document.getElementById('seniklar-print-container');
        if (!previewContainer) return;

        const templateSize = document.getElementById('seniklar-template-size')?.value || 'a4-3x8';
        const storeName = document.getElementById('seniklar-store-name')?.value || 'Smart Store';
        const showBarcode = document.getElementById('seniklar-show-barcode')?.checked;
        const showDate = document.getElementById('seniklar-show-date')?.checked;

        // Update template size class on container
        previewContainer.className = `seniklar-print-container ${templateSize}`;

        const settings = AppStorage.load().settings;
        const currency = settings.currency;
        const today = new Date().toLocaleDateString('uz-UZ');

        let html = '';
        let hasItems = false;

        this.products.forEach(p => {
            const state = this.selected[p.id];
            if (state && state.checked && state.qty > 0) {
                hasItems = true;
                const formattedPrice = Math.round(p.price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
                const now = new Date();
                const todayDate = now.toLocaleDateString('uz-UZ');
                const todayTime = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false });

                // Generate specified quantity of cards
                for (let i = 0; i < state.qty; i++) {
                    html += `
                        <div class="senik-card">
                            <div class="senik-header">${storeName}</div>
                            <div class="senik-body">
                                <div class="senik-title" title="${p.name}">${p.name}</div>
                                <div class="senik-price-section">
                                    <span class="senik-price-val">${formattedPrice} So'm</span>
                                </div>
                                ${showBarcode ? `
                                    <div class="senik-barcode-area">
                                        <div class="senik-barcode-lines"></div>
                                        <div class="senik-sku">${p.sku}</div>
                                    </div>
                                ` : `
                                    <div class="senik-sku-only">${p.sku}</div>
                                `}
                            </div>
                            ${showDate ? `
                                <div class="senik-footer">
                                    <div class="senik-date">${todayDate} ${todayTime}</div>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
            }
        });

        if (!hasItems) {
            previewContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted); font-size: 14px; width: 100%;">
                    <i class="fas fa-tags" style="font-size: 28px; margin-bottom: 12px; display: block; opacity: 0.5;"></i>
                    Preview oynasida ko'rish uchun chap tomondan mahsulotlarni tanlang va chop etish miqdorini belgilang.
                </div>
            `;
        } else {
            previewContainer.innerHTML = html;
        }
    },

    print: function() {
        const checkedCount = Object.values(this.selected).filter(s => s.checked).length;
        if (checkedCount === 0) {
            alert("Iltimos, chop etish uchun kamida bitta mahsulotni tanlang!");
            return;
        }
        window.print();
    }
};
