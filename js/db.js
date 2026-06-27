// ERP & CRM Tizimi - Mahalliy Python Backend API Integratsiyasi

// Intercept all fetch calls to add the active company ID header
(function() {
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        let newOptions = options || {};
        let headers = {};
        
        if (newOptions.headers) {
            if (typeof newOptions.headers.set === 'function') {
                newOptions.headers.set('X-Company-ID', localStorage.getItem('activeCompanyId') || '');
                newOptions.headers.set('x-company-id', localStorage.getItem('activeCompanyId') || '');
            } else {
                headers = { ...newOptions.headers };
                const companyId = localStorage.getItem('activeCompanyId');
                if (companyId) {
                    headers['X-Company-ID'] = companyId;
                    headers['x-company-id'] = companyId;
                }
                newOptions.headers = headers;
            }
        } else {
            const companyId = localStorage.getItem('activeCompanyId');
            if (companyId) {
                headers['X-Company-ID'] = companyId;
                headers['x-company-id'] = companyId;
                newOptions.headers = headers;
            }
        }
        
        let companyIdForUrl = localStorage.getItem('activeCompanyId');
        if (!companyIdForUrl) {
            const urlParams = new URLSearchParams(window.location.search);
            companyIdForUrl = urlParams.get('company_id');
        }
        
        if (companyIdForUrl && typeof url === 'string' && (url.startsWith('/api/') || url.includes('/api/'))) {
            const separator = url.includes('?') ? '&' : '?';
            if (!url.includes('company_id=')) {
                url = url + separator + 'company_id=' + encodeURIComponent(companyIdForUrl);
            }
        }
        return originalFetch(url, newOptions);
    };
})();

window.DB = {
    client: { localApi: true }, // Supabase JS SDK o'rniga local API ishlatilishini bildiradi

    isConfigured: function() {
        // Tizim local Python backend serveri orqali ishlaydi, shuning uchun har doim sozlangan
        return true;
    },

    init: function() {
        console.log("Mahalliy Python Backend REST API ulanishi faol.");
    },

    syncLocalToCloud: async function() {
        try {
            const localData = AppStorage.load();
            
            // Sync customers
            const dbCusts = await this.getCustomers();
            if (dbCusts.length === 0 && localData.customers.length > 0) {
                for (const c of localData.customers) {
                    await this.saveCustomer(c);
                }
            }

            // Sync inventory
            const dbInv = await this.getInventory();
            if (dbInv.length === 0 && localData.inventory.length > 0) {
                for (const p of localData.inventory) {
                    await this.saveProduct(p);
                }
            }

            // Sync employees
            const dbEmp = await this.getEmployees();
            if (dbEmp.length === 0 && localData.employees.length > 0) {
                for (const e of localData.employees) {
                    await this.saveEmployee(e);
                }
            }

            // Sync transactions
            const dbTx = await this.getTransactions();
            if (dbTx.length === 0 && localData.transactions.length > 0) {
                for (const t of localData.transactions) {
                    await this.saveTransaction(t);
                }
            }
            console.log("Lokal demo ma'lumotlar Python Backend orqali bazaga sinxronlandi.");
        } catch (e) {
            console.error("Lokal ma'lumotlarni backendga sinxronlashda xatolik:", e);
        }
    },

    // --- MIJOZLAR (CRM) OPERATSIYALARI ---
    getCustomers: async function() {
        try {
            const response = await fetch('/api/customers');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const data = await response.json();
            AppStorage.updateKey('customers', data);
            return data;
        } catch (e) {
            console.warn("Backend-dan mijozlarni yuklab bo'lmadi, keshdan o'qiladi:", e);
            return AppStorage.load().customers;
        }
    },

    saveCustomer: async function(customer) {
        try {
            const response = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customer)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-ga mijozni saqlashda xatolik:", e);
        }
        const data = AppStorage.load();
        const index = data.customers.findIndex(c => c.id === customer.id);
        if (index > -1) data.customers[index] = customer;
        else data.customers.push(customer);
        AppStorage.save(data);
    },

    deleteCustomer: async function(id) {
        try {
            const response = await fetch(`/api/customers/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-dan mijozni o'chirishda xatolik:", e);
        }
        const data = AppStorage.load();
        data.customers = data.customers.filter(c => c.id !== id);
        AppStorage.save(data);
    },

    // --- OMBORXONA (INVENTORY) OPERATSIYALARI ---
    getInventory: async function() {
        try {
            const response = await fetch('/api/inventory');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const data = await response.json();
            AppStorage.updateKey('inventory', data);
            return data;
        } catch (e) {
            console.warn("Backend-dan omborni yuklab bo'lmadi, keshdan o'qiladi:", e);
            return AppStorage.load().inventory;
        }
    },

    saveProduct: async function(product) {
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-ga mahsulotni saqlashda xatolik:", e);
        }
        const data = AppStorage.load();
        const index = data.inventory.findIndex(p => p.id === product.id);
        if (index > -1) data.inventory[index] = product;
        else data.inventory.push(product);
        AppStorage.save(data);
    },

    deleteProduct: async function(id) {
        try {
            const response = await fetch(`/api/inventory/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-dan mahsulotni o'chirishda xatolik:", e);
        }
        const data = AppStorage.load();
        data.inventory = data.inventory.filter(p => p.id !== id);
        AppStorage.save(data);
    },

    // --- XODIMLAR (HR) OPERATSIYALARI ---
    getEmployees: async function() {
        try {
            const response = await fetch('/api/employees');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const data = await response.json();
            AppStorage.updateKey('employees', data);
            return data;
        } catch (e) {
            console.warn("Backend-dan xodimlarni yuklab bo'lmadi, keshdan o'qiladi:", e);
            return AppStorage.load().employees;
        }
    },
    getWarehouses: async function() {
        try {
            const response = await fetch('/api/integration/regos/warehouses');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return await response.json();
        } catch (e) {
            console.warn("Failed to fetch warehouses, returning fallback:", e);
            return [
                {"id": "regos_1", "name": "Asosiy ombor (Chilonzor)"},
                {"id": "regos_2", "name": "Yunusobod filiali"},
                {"id": "regos_3", "name": "Sergeli ombori"},
                {"id": "regos_4", "name": "Qo'yliq filiali"}
            ];
        }
    },

    saveEmployee: async function(employee) {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(employee)
        });
        if (!response.ok) {
            let errorDetail = "";
            try {
                const errJson = await response.json();
                errorDetail = errJson.detail || errJson.message || "";
            } catch(p) {}
            throw new Error(errorDetail || ("HTTP error " + response.status));
        }
        const data = AppStorage.load();
        const index = data.employees.findIndex(e => e.id === employee.id);
        if (index > -1) data.employees[index] = employee;
        else data.employees.push(employee);
        AppStorage.save(data);
    },

    deleteEmployee: async function(id) {
        try {
            const response = await fetch(`/api/employees/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-dan xodimni o'chirishda xatolik:", e);
        }
        const data = AppStorage.load();
        data.employees = data.employees.filter(e => e.id !== id);
        AppStorage.save(data);
    },

    // --- MOLIYA (TRANSACTIONS) OPERATSIYALARI ---
    getTransactions: async function() {
        try {
            const response = await fetch('/api/transactions');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const data = await response.json();
            AppStorage.updateKey('transactions', data);
            return data;
        } catch (e) {
            console.warn("Backend-dan tranzaksiyalarni yuklab bo'lmadi, keshdan o'qiladi:", e);
            return AppStorage.load().transactions;
        }
    },

    saveTransaction: async function(tx) {
        try {
            const response = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-ga tranzaksiyani saqlashda xatolik:", e);
        }
        const data = AppStorage.load();
        const index = data.transactions.findIndex(t => t.id === tx.id);
        if (index > -1) data.transactions[index] = tx;
        else data.transactions.push(tx);
        AppStorage.save(data);
    },

    deleteTransaction: async function(id) {
        try {
            const response = await fetch(`/api/transactions/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-dan tranzaksiyani o'chirishda xatolik:", e);
        }
        const data = AppStorage.load();
        data.transactions = data.transactions.filter(t => t.id !== id);
        AppStorage.save(data);
    },

    // --- TELEFONIYA (CALLS) OPERATSIYALARI ---
    getCalls: async function() {
        try {
            const response = await fetch('/api/calls');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const data = await response.json();
            AppStorage.updateKey('calls', data);
            return data;
        } catch (e) {
            console.warn("Backend-dan qo'ng'iroqlarni yuklab bo'lmadi, keshdan o'qiladi:", e);
            return AppStorage.load().calls || [];
        }
    },

    saveCallLog: async function(call) {
        try {
            const response = await fetch('/api/calls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(call)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-ga qo'ng'iroqni saqlashda xatolik:", e);
        }
        const data = AppStorage.load();
        data.calls = data.calls || [];
        const index = data.calls.findIndex(c => c.id === call.id);
        if (index > -1) data.calls[index] = call;
        else data.calls.push(call);
        AppStorage.save(data);
    },

    // --- CHATS & MESSAGES OPERATSIYALARI ---
    getChats: async function() {
        try {
            const response = await fetch('/api/chats');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return await response.json();
        } catch (e) {
            console.error("Backend-dan chatlarni olishda xatolik:", e);
            return [];
        }
    },

    getMessages: async function(customerId) {
        try {
            const response = await fetch(`/api/messages/${customerId}`);
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return await response.json();
        } catch (e) {
            console.error("Backend-dan xabarlarni olishda xatolik:", e);
            return [];
        }
    },

    sendMessage: async function(message) {
        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(message)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
            return await response.json();
        } catch (e) {
            console.error("Backend-ga xabarni yuborishda xatolik:", e);
            throw e;
        }
    },

    // --- CHEKLAR (RECEIPTS) OPERATSIYALARI ---
    getReceipts: async function(search) {
        try {
            const url = search ? `/api/receipts?search=${encodeURIComponent(search)}` : '/api/receipts';
            const response = await fetch(url);
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const data = await response.json();
            if (data && data.error === "migration_required") {
                return data;
            }
            if (!search) {
                AppStorage.updateKey('receipts', data);
            }
            return data;
        } catch (e) {
            console.warn("Backend-dan cheklarni yuklab bo'lmadi, keshdan o'qiladi:", e);
            return AppStorage.load().receipts || [];
        }
    },

    saveReceipt: async function(receipt) {
        try {
            const response = await fetch('/api/receipts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(receipt)
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-ga chekni saqlashda xatolik:", e);
        }
        const data = AppStorage.load();
        data.receipts = data.receipts || [];
        const index = data.receipts.findIndex(r => r.id === receipt.id);
        if (index > -1) data.receipts[index] = receipt;
        else data.receipts.push(receipt);
        AppStorage.save(data);
    },

    deleteReceipt: async function(id) {
        try {
            const response = await fetch(`/api/receipts/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error("HTTP error " + response.status);
        } catch (e) {
            console.error("Backend-dan chekni o'chirishda xatolik:", e);
        }
        const data = AppStorage.load();
        data.receipts = (data.receipts || []).filter(r => r.id !== id);
        AppStorage.save(data);
    }
};

DB.init();
