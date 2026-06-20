// ERP & CRM Tizimi - Sarkor Telecom IP-Telefoniya boshqaruv moduli (JsSIP va Simulyator)

window.Telephony = {
    ua: null,
    session: null,
    callStartTime: null,
    callTimerInterval: null,
    currentCallLogs: [],

    activeCallId: null,
    currentPage: 1,

    init: function() {
        this.setupJsSIP();
        this.renderCallLogsTab();
        
        // Supabase-dan faol qo'ng'iroqlarni har 2 soniyada tekshirib turish
        setInterval(() => this.pollActiveCalls(), 2000);
    },

    // --- JsSIP (SARKOR TELECOM SIP ULANISHI) ---
    setupJsSIP: function() {
        const settings = AppStorage.load().settings;
        const providerName = settings.telephonyProvider === 'sipuni' ? 'Sipuni' : 'Sarkor Telecom';
        
        // Agar barcha SIP sozlamalari mavjud bo'lsa, JsSIP-ni ulaymiz
        if (settings.sipServer && settings.sipUser && settings.sipPassword && settings.sipWssGateway) {
            console.log(`${providerName} SIP ulanishi boshlanmoqda...`);
            try {
                const socket = new JsSIP.WebSocketInterface(settings.sipWssGateway);
                const configuration = {
                    sockets  : [ socket ],
                    uri      : `sip:${settings.sipUser}@${settings.sipServer}`,
                    password : settings.sipPassword
                };

                this.ua = new JsSIP.UA(configuration);
                this.ua.start();

                // JsSIP hodisalari (Events)
                this.ua.on('registered', () => {
                    console.log(`${providerName} SIP tarmog'ida muvaffaqiyatli ro'yxatdan o'tdi.`);
                    this.updateSIPStatusUI(true);
                });

                this.ua.on('unregistered', () => {
                    this.updateSIPStatusUI(false);
                });

                this.ua.on('registrationFailed', (e) => {
                    console.error("SIP Ro'yxatdan o'tishda xatolik:", e.cause);
                    this.updateSIPStatusUI(false);
                });

                // Kiruvchi qo'ng'iroq kelganda
                this.ua.on('newRTCSession', (data) => {
                    const session = data.session;
                    if (session.direction === 'incoming') {
                        this.handleIncomingCall(session.remote_identity.uri.user, session);
                    }
                });
            } catch (e) {
                console.error("JsSIP ishga tushirishda xatolik:", e);
                this.updateSIPStatusUI(false);
            }
        } else {
            console.log("SIP sozlamalari to'liq emas. Telefoniya simulyator rejimida ishlaydi.");
            this.updateSIPStatusUI(false, "Simulyator Faol");
        }
    },

    updateSIPStatusUI: function(isConnected, text = "") {
        const settings = AppStorage.load().settings;
        const providerName = settings.telephonyProvider === 'sipuni' ? 'Sipuni' : 'Sarkor Telecom';
        const statusLabel = document.getElementById('sip-status-label');
        if (statusLabel) {
            if (isConnected) {
                statusLabel.innerHTML = `<span class="badge badge-success"><i class="fas fa-phone-alt"></i> ${providerName} ulandi</span>`;
            } else if (text) {
                statusLabel.innerHTML = `<span class="badge badge-info"><i class="fas fa-laptop-code"></i> ${text}</span>`;
            } else {
                statusLabel.innerHTML = '<span class="badge badge-danger"><i class="fas fa-phone-slash"></i> SIP Ulanmagan</span>';
            }
        }
    },

    // --- QO'NG'IROQ QILISH (DIAL / OUTGOING) ---
    dial: function(phone) {
        if (!phone) return;
        console.log("Qo'ng'iroq qilinmoqda: ", phone);
        
        // Agar haqiqiy SIP ulangan bo'lsa
        if (this.ua && this.ua.isRegistered()) {
            try {
                const options = {
                    mediaConstraints: { audio: true, video: false }
                };
                const session = this.ua.call(`sip:${phone}@${AppStorage.load().settings.sipServer}`, options);
                this.setupSessionListeners(session, phone, 'outgoing');
            } catch (e) {
                console.error("SIP orqali qo'ng'iroq qilishda xatolik:", e);
                alert("Qo'ng'iroq qilishda xatolik yuz berdi.");
            }
        } else {
            // Agar brauzer SIP ulanmagan bo'lsa, kompyuter dialerini (MicroSIP/Zoiper) ochamiz (Sarkor orqali qo'ng'iroq ketadi)
            const cleanPhone = phone.replace(/\s+/g, '');
            window.location.href = `tel:${cleanPhone}`;

            // Shuningdek, CRM oynasida suhbat dialogi va sinov taymerini ham ochamiz
            this.showCallModal(phone, 'outgoing');
            this.simulateOutgoingCall(phone);
        }
    },

    // --- SEANSLAR ESHITUVCHISI (JsSIP SEASSIONS) ---
    setupSessionListeners: function(session, phone, direction) {
        this.session = session;
        this.showCallModal(phone, direction);

        session.on('connecting', () => {
            this.updateCallStatusUI("Ulanmoqda...");
        });

        session.on('progress', () => {
            this.updateCallStatusUI("Qo'ng'iroq ketmoqda (gudok)...");
        });

        session.on('accepted', () => {
            this.startCallTimer();
            this.updateCallStatusUI("Suhbat ketmoqda...");
        });

        session.on('failed', (e) => {
            this.endCallTimer();
            this.updateCallStatusUI(`Muvaffaqiyatsiz: ${e.cause}`);
            this.saveCallHistory(phone, direction, 0, 'failed');
            setTimeout(() => closeModal('call-modal'), 2000);
        });

        session.on('ended', () => {
            const duration = this.endCallTimer();
            this.updateCallStatusUI("Suhbat yakunlandi.");
            this.saveCallHistory(phone, direction, duration, 'answered');
            setTimeout(() => closeModal('call-modal'), 1500);
        });
    },

    // --- KIRUVCHI QO'NG'IROQNI QABUL QILISH ---
    handleIncomingCall: async function(phone, session = null) {
        this.session = session;
        
        // Raqam bo'yicha mijozni qidiramiz
        const customers = await DB.getCustomers();
        const client = customers.find(c => c.phone.replace(/\s+/g, '') === phone.replace(/\s+/g, ''));
        
        const clientName = client ? client.name : "Noma'lum Raqam";
        let clientInfo = "Tizimda yo'q";
        if (client) {
            const details = [];
            if (client.source) {
                const sourceMap = {
                    telegram: 'Telegram',
                    instagram: 'Instagram',
                    telephony: 'Telefon',
                    manual: 'Qo\'lda kiritilgan'
                };
                details.push(sourceMap[client.source] || client.source);
            }
            if (client.operator) {
                details.push(`Mas'ul: ${client.operator}`);
            }
            clientInfo = details.length > 0 ? details.join(' • ') : "Mijoz";
        }

        // Bildirishnoma oynasini ko'rsatish
        this.showIncomingPopup(phone, clientName, clientInfo, client ? client.id : null);
    },

    showIncomingPopup: function(phone, name, infoText, customerId) {
        // Eski popup bo'lsa o'chiramiz
        const oldPopup = document.getElementById('incoming-call-popup');
        if (oldPopup) oldPopup.remove();

        const popup = document.createElement('div');
        popup.id = 'incoming-call-popup';
        popup.className = 'card';
        popup.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 320px;
            z-index: 999;
            box-shadow: var(--shadow-lg);
            border: 2px solid var(--accent);
            animation: slideInRight 0.3s ease;
            background-color: var(--bg-card);
        `;

        let actionBtn = '';
        if (!customerId) {
            actionBtn = `<button class="btn btn-secondary btn-sm" style="width:100%; margin-top:8px; font-size:11px;" onclick="Telephony.quickAddCustomer('${phone}')"><i class="fas fa-user-plus"></i> Mijoz sifatida qo'shish</button>`;
        }

        const settings = AppStorage.load().settings;
        const providerName = settings.telephonyProvider === 'sipuni' ? 'Sipuni' : 'Sarkor Telecom';
        popup.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:50%; background:var(--success-light); color:var(--success); display:flex; align-items:center; justify-content:center; font-size:18px; animation: pulse 1.5s infinite;">
                    <i class="fas fa-phone-alt"></i>
                </div>
                <div>
                    <h4 style="margin:0; font-size:15px; color:var(--text-main);">Kiruvchi qo'ng'iroq</h4>
                    <span style="font-size:11px; color:var(--success); font-weight:600;">${providerName}</span>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-size:18px; font-weight:700;">${name}</div>
                <div style="font-size:13px; color:var(--text-muted);">${phone}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Mijoz: ${infoText}</div>
                ${actionBtn}
            </div>
            <div style="display:flex; gap:10px;">
                <button class="btn btn-primary" style="flex:1; background:var(--success); box-shadow:none; padding:8px;" onclick="Telephony.answerIncoming('${phone}', '${customerId}')"><i class="fas fa-phone"></i> Qabul qilish</button>
                <button class="btn btn-secondary" style="flex:1; color:var(--danger); border-color:var(--danger-light); padding:8px;" onclick="Telephony.rejectIncoming('${phone}')"><i class="fas fa-phone-slash"></i> Rad etish</button>
            </div>
        `;

        document.body.appendChild(popup);
    },

    answerIncoming: function(phone, customerId) {
        const popup = document.getElementById('incoming-call-popup');
        if (popup) popup.remove();

        if (this.session) {
            this.session.answer();
            this.setupSessionListeners(this.session, phone, 'incoming');
        } else {
            // Simulyator uchun
            this.showCallModal(phone, 'incoming');
            this.startCallTimer();
            this.updateCallStatusUI("Suhbat ketmoqda...");
            this.sessionSimulatorType = { phone, direction: 'incoming', customerId };
        }
    },

    rejectIncoming: function(phone) {
        const popup = document.getElementById('incoming-call-popup');
        if (popup) popup.remove();

        if (this.session) {
            this.session.terminate();
        } else {
            // Simulyator
            this.saveCallHistory(phone, 'incoming', 0, 'missed');
        }
    },

    quickAddCustomer: function(phone) {
        closeModal('crm-modal');
        showModal('crm-modal');
        document.getElementById('cust-phone').value = phone;
        const popup = document.getElementById('incoming-call-popup');
        if (popup) popup.remove();
    },

    // --- QO'NG'IROQ OYNASI INTERFEYSI (CALL DIALER UI) ---
    showCallModal: async function(phone, direction) {
        // Ekranda qo'ng'iroq dialogini ochamiz
        showModal('call-modal');
        document.getElementById('call-phone').textContent = phone;
        
        // Raqamdan mijozni aniqlaymiz
        const customers = await DB.getCustomers();
        const client = customers.find(c => c.phone.replace(/\s+/g, '') === phone.replace(/\s+/g, ''));
        document.getElementById('call-name').textContent = client ? client.name : "Noma'lum Mijoz";
        
        let clientInfo = "Tizimda yo'q";
        if (client) {
            const details = [];
            if (client.source) {
                const sourceMap = {
                    telegram: 'Telegram',
                    instagram: 'Instagram',
                    telephony: 'Telefon',
                    manual: 'Qo\'lda'
                };
                details.push(sourceMap[client.source] || client.source);
            }
            if (client.operator) {
                details.push(`Mas'ul: ${client.operator}`);
            }
            clientInfo = details.length > 0 ? details.join(' • ') : "Mijoz";
        }
        document.getElementById('call-company').textContent = clientInfo;
        
        document.getElementById('call-direction-icon').className = direction === 'incoming' 
            ? 'fas fa-arrow-down-left' 
            : 'fas fa-arrow-up-right';
        document.getElementById('call-direction-text').textContent = direction === 'incoming' 
            ? 'Kiruvchi qo\'ng\'iroq' 
            : 'Chiquvchi qo\'ng\'iroq';

        this.updateCallStatusUI("Ulanmoqda...");
        document.getElementById('call-timer').textContent = "00:00";
    },

    updateCallStatusUI: function(status) {
        const statusEl = document.getElementById('call-status');
        if (statusEl) statusEl.textContent = status;
    },

    hangup: function() {
        if (this.session) {
            this.session.terminate();
        } else if (this.callStartTime) {
            // Simulyatorda yakunlash
            const duration = this.endCallTimer();
            this.updateCallStatusUI("Suhbat yakunlandi.");
            
            const info = this.sessionSimulatorType;
            if (info) {
                this.saveCallHistory(info.phone, info.direction, duration, 'answered');
            }
            setTimeout(() => closeModal('call-modal'), 1000);
        }
    },

    // --- TAYMER VA TARIXNI SAQLASH ---
    startCallTimer: function() {
        this.callStartTime = new Date();
        document.getElementById('call-timer').style.color = 'var(--success)';
        
        this.callTimerInterval = setInterval(() => {
            const diff = Math.floor((new Date() - this.callStartTime) / 1000);
            const mins = String(Math.floor(diff / 60)).padStart(2, '0');
            const secs = String(diff % 60).padStart(2, '0');
            document.getElementById('call-timer').textContent = `${mins}:${secs}`;
        }, 1000);
    },

    endCallTimer: function() {
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        
        let duration = 0;
        if (this.callStartTime) {
            duration = Math.floor((new Date() - this.callStartTime) / 1000);
            this.callStartTime = null;
        }
        return duration;
    },

    saveCallHistory: async function(phone, direction, duration, status) {
        // Mijoz id-sini topamiz
        const customers = await DB.getCustomers();
        const client = customers.find(c => c.phone.replace(/\s+/g, '') === phone.replace(/\s+/g, ''));
        
        const callLog = {
            id: 'call_' + Date.now(),
            customer_id: client ? client.id : null,
            phone,
            direction,
            duration,
            status
        };

        await DB.saveCallLog(callLog);
        
        // Ro'yxatni yangilaymiz
        this.renderCallLogsTab();
        if (window.App && window.App.currentView === 'dashboard') {
            window.App.renderDashboard();
        }
    },

    // --- QO'NG'IROQLAR JURNALINI CHIZISH ---
    renderCallLogsTab: async function() {
        const container = document.getElementById('calls-logs-content');
        if (!container) return;

        const calls = await DB.getCalls();
        const customers = await DB.getCustomers();

        // Teskari tartib (eng oxirgilari tepada)
        const sortedCalls = [...calls].sort((a, b) => b.id.localeCompare(a.id));

        // Sahifalash sozlamalari
        const PAGE_SIZE = 10;
        const totalPages = Math.ceil(sortedCalls.length / PAGE_SIZE) || 1;
        
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const startIdx = (this.currentPage - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        const pageCalls = sortedCalls.slice(startIdx, endIdx);

        let html = `
            <div class="card" style="margin-top: 24px;">
                <div class="table-responsive">
                    <table class="custom-table">
                        <thead>
                            <tr>
                                <th>Yo'nalish</th>
                                <th>Telefon raqami / Mijoz</th>
                                <th>Lid Manbasi</th>
                                <th>Mas'ul Operator</th>
                                <th>Vaqt</th>
                                <th>Davomiyligi</th>
                                <th>Holat</th>
                                <th style="text-align: right;">Amallar</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        if (pageCalls.length === 0) {
            html += `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">Qo'ng'iroqlar tarixi bo'sh.</td></tr>`;
        } else {
            pageCalls.forEach(c => {
                const isIncoming = c.direction === 'incoming';
                const dirIcon = isIncoming 
                    ? '<i class="fas fa-arrow-down-left" style="color:var(--info); margin-right: 8px;"></i> Kiruvchi' 
                    : '<i class="fas fa-arrow-up-right" style="color:var(--accent); margin-right: 8px;"></i> Chiquvchi';

                const client = customers.find(cust => cust.id === c.customer_id);
                const displayName = client ? `<strong>${client.name}</strong>` : `Noma'lum raqam`;
                
                let sourceBadge = '-';
                if (client) {
                    if (client.source === 'telegram') {
                        sourceBadge = `<span class="badge" style="background:#0088cc; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;"><i class="fab fa-telegram"></i> Telegram</span>`;
                    } else if (client.source === 'instagram') {
                        sourceBadge = `<span class="badge" style="background:#E1306C; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;"><i class="fab fa-instagram"></i> Instagram</span>`;
                    } else if (client.source === 'telephony') {
                        sourceBadge = `<span class="badge" style="background:#10B981; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;"><i class="fas fa-phone-alt"></i> Telefon</span>`;
                    } else {
                        sourceBadge = `<span class="badge" style="background:#6B7280; color:#fff; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:500;"><i class="fas fa-user"></i> Qo'lda</span>`;
                    }
                }
                
                const operatorName = client ? (client.operator || '-') : '-';
                
                // Format duration (seconds -> MM:SS)
                const min = Math.floor(c.duration / 60);
                const sec = c.duration % 60;
                const durationText = c.status === 'answered' ? `${min}:${String(sec).padStart(2, '0')}` : '-';

                // Date formatting
                let dateText = '-';
                if (c.id) {
                    const timestamp = parseInt(c.id.split('_')[1]);
                    if (!isNaN(timestamp)) {
                        dateText = new Date(timestamp).toLocaleString('uz-UZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                    }
                }

                let statusBadge = '<span class="badge badge-success">Suhbatlashildi</span>';
                if (c.status === 'missed') {
                    statusBadge = '<span class="badge badge-warning">Javobsiz</span>';
                } else if (c.status === 'failed') {
                    statusBadge = '<span class="badge badge-danger">Ulanmadi</span>';
                }

                html += `
                    <tr>
                        <td>${dirIcon}</td>
                        <td>
                            ${displayName}<br>
                            <span style="font-size:12px; color:var(--text-muted); font-family: 'JetBrains Mono';">${c.phone}</span>
                        </td>
                        <td>${sourceBadge}</td>
                        <td>${operatorName}</td>
                        <td><span style="font-family:'JetBrains Mono'; font-size:13px;">${dateText}</span></td>
                        <td><span style="font-family:'JetBrains Mono';">${durationText}</span></td>
                        <td>${statusBadge}</td>
                        <td style="text-align: right;">
                            ${c.recording_url ? `<button class="btn btn-secondary btn-sm" onclick="window.open('${c.recording_url}', '_blank')" style="margin-right: 6px;"><i class="fas fa-music" style="color: var(--accent)"></i> Tinglash</button>` : ''}
                            <button class="btn btn-secondary btn-sm" onclick="Telephony.dial('${c.phone}')"><i class="fas fa-phone-alt" style="color: var(--success)"></i> Qayta qo'ng'iroq</button>
                        </td>
                    </tr>
                `;
            });
        }

        html += `
                        </tbody>
                    </table>
                </div>
        `;

        // Agar jami qo'ng'iroqlar soni sahifa hajmidan ko'p bo'lsa pagination boshqaruvini chiqaramiz
        if (sortedCalls.length > PAGE_SIZE) {
            html += `
                <div class="pagination-container" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-top: 1px solid var(--border-color); background-color: rgba(255, 255, 255, 0.02);">
                    <div style="font-size: 13px; color: var(--text-muted);">
                        Jami: <strong>${sortedCalls.length}</strong> ta qo'ng'iroq (Sahifa ${this.currentPage}/${totalPages})
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-secondary btn-sm" style="padding: 6px 12px;" onclick="window.Telephony.changePage(-1)" ${this.currentPage === 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-left"></i> Oldingi
                        </button>
                        <span style="font-size: 14px; font-weight: 600; padding: 0 8px; color: var(--text-main);">${this.currentPage}</span>
                        <button class="btn btn-secondary btn-sm" style="padding: 6px 12px;" onclick="window.Telephony.changePage(1)" ${this.currentPage === totalPages ? 'disabled' : ''}>
                            Keyingi <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        html += `</div>`; // .card yopilishi

        container.innerHTML = html;
    },

    changePage: function(direction) {
        this.currentPage += direction;
        this.renderCallLogsTab();
    },

    // --- LOKAL SIMULYATSIYA MANTIG'I (TEST REJIM) ---
    setupSimulator: function() {
        const settings = AppStorage.load().settings;
        const providerName = settings.telephonyProvider === 'sipuni' ? 'Sipuni' : 'Sarkor Telecom';
        
        // Agar simulyator paneli bo'lmasa uni yaratamiz
        let simBox = document.getElementById('telephony-simulator-panel');
        if (simBox) return;

        simBox = document.createElement('div');
        simBox.id = 'telephony-simulator-panel';
        simBox.className = 'card';
        simBox.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 24px;
            width: 280px;
            z-index: 150;
            border: 1px dashed var(--border-color);
            background-color: var(--bg-card);
            padding: 12px;
        `;

        simBox.innerHTML = `
            <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <span>${providerName} Simulyatori</span>
                <i class="fas fa-circle" id="sip-simulator-status" style="color:var(--info); font-size:8px;"></i>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button class="btn btn-secondary btn-sm" style="font-size:11px; padding:6px 10px;" onclick="Telephony.triggerSimulatedCall('+998 90 123 45 67')">
                    <i class="fas fa-phone" style="color:var(--success)"></i> Alisher Navoiy (Kiruvchi)
                </button>
                <button class="btn btn-secondary btn-sm" style="font-size:11px; padding:6px 10px;" onclick="Telephony.triggerSimulatedCall('+998 99 999 88 77')">
                    <i class="fas fa-phone" style="color:var(--warning)"></i> Notanish raqam (Kiruvchi)
                </button>
            </div>
        `;

        // Mobil telefonda simulyatorni yashiramiz (UI toza bo'lishi uchun)
        if (window.innerWidth >= 1024) {
            document.body.appendChild(simBox);
        }
    },

    triggerSimulatedCall: function(phone) {
        this.handleIncomingCall(phone);
    },

    simulateOutgoingCall: function(phone) {
        this.sessionSimulatorType = { phone, direction: 'outgoing' };
        
        // 2 soniyadan keyin javob berishini simulyatsiya qilamiz
        setTimeout(() => {
            if (this.sessionSimulatorType && this.sessionSimulatorType.phone === phone) {
                this.updateCallStatusUI("Suhbat ketmoqda...");
                this.startCallTimer();
            }
        }, 2000);
    },

    // --- NUMPAD DIALER PAD FUNKSIONALI ---
    dialerPress: function(digit) {
        const input = document.getElementById('dialer-input');
        if (input) {
            input.value += digit;
        }
    },

    dialerBackspace: function() {
        const input = document.getElementById('dialer-input');
        if (input && input.value.length > 0) {
            input.value = input.value.slice(0, -1);
        }
    },

    dialerCall: function() {
        const input = document.getElementById('dialer-input');
        if (input) {
            const phone = input.value.trim();
            if (phone.length < 3) {
                alert("Iltimos, telefon raqamini to'liq kiriting!");
                return;
            }
            this.dial(phone);
        }
    },

    // --- FAOL QO'NG'IROQLAR MONITORINGI (POLLING) ---
    pollActiveCalls: async function() {
        if (!DB.client) return; // DB client sozlanganligini tekshirish
        
        try {
            // Oxirgi 1 daqiqa ichidagi ringing yoki answered holatdagi faol qo'ng'iroqlarni tekshiramiz (davomiyligi 0 bo'lgan faol qo'ng'iroqlar)
            const response = await fetch('/api/calls?status=ringing,answered&duration=0');
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const activeCalls = await response.json();
            
            if (activeCalls && activeCalls.length > 0) {
                const call = activeCalls[0];
                
                // Qo'ng'iroq vaqti juda eski bo'lsa (masalan 1 daqiqadan ko'p) e'tibor bermaymiz
                const callTime = new Date(call.created_at || parseInt(call.id.split('_')[1]));
                if (new Date() - callTime > 60000) {
                    this.clearCallUIIfNeeded();
                    return;
                }

                if (this.activeCallId !== call.id) {
                    this.activeCallId = call.id;
                    
                    if (call.status === 'ringing' && call.direction === 'incoming') {
                        // Kiruvchi qo'ng'iroq bildirishnomasini ko'rsatish
                        const customers = await DB.getCustomers();
                        const client = customers.find(c => c.phone.replace(/\s+/g, '') === call.phone.replace(/\s+/g, ''));
                        this.showIncomingPopup(call.phone, client ? client.name : "Noma'lum Raqam", client ? (client.company || '-') : 'Tizimda yo\'q', client ? client.id : null);
                    }
                }

                // Agar suhbat javob berilgan holatga o'tsa va modal hali ochilmagan bo'lsa
                if (call.status === 'answered') {
                    const popup = document.getElementById('incoming-call-popup');
                    if (popup) popup.remove(); // popup-ni o'chiramiz

                    const modal = document.getElementById('call-modal');
                    if (modal && modal.style.display !== 'flex') {
                        await this.showCallModal(call.phone, call.direction);
                        this.startCallTimer();
                        this.updateCallStatusUI("Suhbat ketmoqda...");
                    }
                }
            } else {
                // Hech qanday faol qo'ng'iroq yo'q bo'lsa UI elementlarini tozalaymiz
                this.clearCallUIIfNeeded();
            }
        } catch (e) {
            // console.error("Faol qo'ng'iroqlarni polling qilishda xatolik:", e);
        }
    },

    clearCallUIIfNeeded: function() {
        const modal = document.getElementById('call-modal');
        const isModalOpen = modal && modal.style.display === 'flex';
        
        if (this.activeCallId || isModalOpen) {
            this.activeCallId = null;
            
            // Popuplarni yopish
            const popup = document.getElementById('incoming-call-popup');
            if (popup) {
                popup.remove();
                // Agar ringing holatidagi qo'ng'iroq yopilsa (masalan, javobsiz qolsa), CRM ni yangilaymiz (yangi lead tushgan bo'lishi mumkin)
                if (window.App && window.App.currentView === 'crm' && window.CRM) {
                    window.CRM.render();
                }
            }
            
            if (isModalOpen) {
                this.endCallTimer();
                this.updateCallStatusUI("Suhbat yakunlandi.");
                setTimeout(() => {
                    closeModal('call-modal');
                    this.renderCallLogsTab();
                    if (window.App && window.App.currentView === 'dashboard') {
                        window.App.renderDashboard();
                    } else if (window.App && window.App.currentView === 'crm' && window.CRM) {
                        window.CRM.render();
                    }
                }, 1500);
            }
        }
    }
};

// Dastur yuklanganda telefoniya ishga tushadi
document.addEventListener('DOMContentLoaded', () => {
    window.Telephony.init();
});
