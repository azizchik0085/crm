const DEFAULT_DATA = {
    settings: {
        currency: 'UZS',
        theme: 'dark', // 'dark' yoki 'light'
        companyName: 'Smart Solutions MChJ',
        supabaseUrl: 'https://zuklkmppdencjzegamfm.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1a2xrbXBwZGVuY2p6ZWdhbWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MzQ2NjAsImV4cCI6MjA5NzUxMDY2MH0.i18GcUTO8v9ilBYMlQMwvnz7RLkrR1q5fJB91do3ypk',
        sipServer: 'bell.uz',
        sipUser: '998787074240',
        sipPassword: 'gAxd6mQG',
        sipWssGateway: '',
        instagramUsername: 'giperbrendstroy',
        telephonyProvider: 'sarkor',
        aiProvider: 'local',
        geminiApiKey: '',
        openaiApiKey: '',
        groqApiKey: '',
        aiAutoReply: false,
        regosEndpoint: '',
        regosToken: ''
    },
    customers: [
        { id: 'c1', name: 'Alisher Navoiy', phone: '+998 90 123 45 67', phone2: '+998 90 999 88 77', source: 'telephony', operator: 'Laylo Toirova', status: 'won', value: 15000000 },
        { id: 'c2', name: 'Zuhra Umarova', phone: '+998 93 987 65 43', phone2: '', source: 'instagram', operator: 'Laylo Toirova', status: 'proposal', value: 8500000 },
        { id: 'c3', name: 'Bobur Karimov', phone: '+998 97 555 44 33', phone2: '+998 93 111 22 33', source: 'telegram', operator: 'Madina Yusupova', status: 'contacted', value: 25000000 },
        { id: 'c4', name: 'Malika Axmedova', phone: '+998 94 333 22 11', phone2: '', source: 'manual', operator: '', status: 'lead', value: 12000000 },
        { id: 'c5', name: 'Doston Ergashiev', phone: '+998 99 777 88 99', phone2: '', source: 'telephony', operator: 'Laylo Toirova', status: 'lost', value: 4500000 }
    ],
    inventory: [
        { id: 'i1', name: 'Noutbuk Lenovo ThinkPad L14', sku: 'LNV-TP-14', price: 9500000, stock: 12, category: 'Elektronika' },
        { id: 'i2', name: 'Monitor Dell 27"', sku: 'DEL-27-MON', price: 3200000, stock: 5, category: 'Elektronika' },
        { id: 'i3', name: 'Ofis Stuli (Ergonomik)', sku: 'OFF-CHR-01', price: 1200000, stock: 2, category: 'Mebel' }, // low stock warning
        { id: 'i4', name: 'Kabel Type-C to HDMI 2m', sku: 'CBL-CHD-02', price: 250000, stock: 45, category: 'Aksessuarlar' },
        { id: 'i5', name: 'Ofis Stoli (L-simon)', sku: 'OFF-TBL-02', price: 2800000, stock: 0, category: 'Mebel' } // out of stock
    ],
    employees: [
        { id: 'e1', name: 'Sardor Rahimov', role: 'Dasturchi', salary: 12000000, kpi: 95, status: 'active' },
        { id: 'e2', name: 'Laylo Toirova', role: 'Sotuv menejeri', salary: 6000000, kpi: 88, status: 'active' },
        { id: 'e3', name: 'Javohir Olimov', role: 'Dizayner', salary: 8000000, kpi: 74, status: 'active' },
        { id: 'e4', name: 'Madina Yusupova', role: 'HR Menejer', salary: 7000000, kpi: 90, status: 'active' }
    ],
    transactions: [
        { id: 't1', type: 'income', category: 'Sotuvlar', amount: 15000000, date: '2026-06-15', description: 'Navoiy Media loyihasi to\'lovi' },
        { id: 't2', type: 'expense', category: 'Ish haqi', amount: 33000000, date: '2026-06-05', description: 'Xodimlar uchun may oyi ish haqi' },
        { id: 't3', type: 'expense', category: 'Ofis ijarasi', amount: 6000000, date: '2026-06-01', description: 'Ofis ijarasi to\'lovi' },
        { id: 't4', type: 'income', category: 'Sotuvlar', amount: 8500000, date: '2026-06-18', description: 'Zuhra Umarova avans to\'lovi' },
        { id: 't5', type: 'expense', category: 'Reklama', amount: 2500000, date: '2026-06-10', description: 'Facebook va Telegram reklama kampaniyasi' },
        { id: 't6', type: 'income', category: 'Xizmat ko\'rsatish', amount: 4200000, date: '2026-06-19', description: 'Konsultatsiya va sozlash ishlari' }
    ],
    calls: []
};

const STORAGE_KEY = 'erp_crm_system_data';

const AppStorage = {
    // Ma'lumotlarni yuklash
    load: function() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            this.save(DEFAULT_DATA);
            return DEFAULT_DATA;
        }
        try {
            const data = JSON.parse(stored);
            // Agar foydalanuvchida eski localStorage kesh bo'lsa va unda Supabase ulanmagan bo'lsa, yangi defaultni yozamiz
            if (data && data.settings && !data.settings.supabaseUrl) {
                data.settings.supabaseUrl = DEFAULT_DATA.settings.supabaseUrl;
                data.settings.supabaseKey = DEFAULT_DATA.settings.supabaseKey;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
            // Agar foydalanuvchida eski localStorage kesh bo'lsa va unda SIP ulanmagan bo'lsa, yangi defaultni yozamiz
            if (data && data.settings && !data.settings.sipUser) {
                data.settings.sipServer = DEFAULT_DATA.settings.sipServer;
                data.settings.sipUser = DEFAULT_DATA.settings.sipUser;
                data.settings.sipPassword = DEFAULT_DATA.settings.sipPassword;
                data.settings.sipWssGateway = DEFAULT_DATA.settings.sipWssGateway;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
            // Agar foydalanuvchida instagramUsername ulanmagan yoki boshqa bo'lsa, giperbrendstroy qilamiz
            if (data && data.settings && (!data.settings.instagramUsername || data.settings.instagramUsername !== 'giperbrendstroy')) {
                data.settings.instagramUsername = 'giperbrendstroy';
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
            // Agar foydalanuvchida yangi AI kalitlari bo'lmasa, ularni yaratamiz
            if (data && data.settings && data.settings.aiProvider === undefined) {
                data.settings.aiProvider = 'local';
                data.settings.geminiApiKey = data.settings.geminiApiKey || '';
                data.settings.openaiApiKey = '';
                data.settings.groqApiKey = '';
                data.settings.aiAutoReply = data.settings.aiAutoReply || false;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
            // Agar foydalanuvchida telephonyProvider bo'lmasa, uni yaratamiz
            if (data && data.settings && data.settings.telephonyProvider === undefined) {
                data.settings.telephonyProvider = 'sarkor';
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
            // Agar foydalanuvchida REGOS sozlamalari bo'lmasa, ularni yaratamiz
            if (data && data.settings && data.settings.regosEndpoint === undefined) {
                data.settings.regosEndpoint = '';
                data.settings.regosToken = '';
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            }
            // Agar yangi modullar qo'shilsa va kalitlar bo'lmasa, default ma'lumotlar bilan birlashtiramiz
            return { ...DEFAULT_DATA, ...data };
        } catch (e) {
            console.error("Ma'lumotlarni o'qishda xatolik:", e);
            return DEFAULT_DATA;
        }
    },

    // Ma'lumotlarni saqlash
    save: function(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    // Maxsus kalit bo'yicha yangilash
    updateKey: function(key, val) {
        const data = this.load();
        data[key] = val;
        this.save(data);
        return data;
    },

    // Barcha ma'lumotlarni tozalash va tiklash
    reset: function() {
        this.save(DEFAULT_DATA);
        return DEFAULT_DATA;
    }
};
