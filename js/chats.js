// ERP & CRM Tizimi - Telegram va Instagram Live Chat Tizimi
window.Chats = {
    selectedCustomerId: null,
    selectedPlatform: null,
    pollingInterval: null,
    chatsData: [],

    init: function() {
        console.log("Chats modulini ishga tushirish...");
        this.selectedCustomerId = null;
        this.selectedPlatform = null;
        this.chatsData = [];

        this.setupEventListeners();
        this.loadChats();

        // Har 3 soniyada xabarlar va ro'yxatni yangilab turish
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        this.pollingInterval = setInterval(() => {
            this.loadChats(true); // jimjit yangilash (loading ko'rsatmasdan)
        }, 3000);
    },

    setupEventListeners: function() {
        const searchInput = document.getElementById('chats-search-input');
        if (searchInput) {
            searchInput.oninput = () => {
                this.renderChatsList();
            };
        }

        const sendForm = document.getElementById('chat-send-form');
        if (sendForm) {
            sendForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleSendMessage();
            };
        }

        const simulateForm = document.getElementById('simulate-message-form');
        if (simulateForm) {
            simulateForm.onsubmit = async (e) => {
                e.preventDefault();
                await this.handleSimulateMessage();
            };
        }

        const aiSuggestBtn = document.getElementById('chat-ai-suggest-btn');
        if (aiSuggestBtn) {
            aiSuggestBtn.onclick = async () => {
                await this.handleAISuggest();
            };
        }
    },

    loadChats: async function(isSilent = false) {
        try {
            const chats = await DB.getChats();
            this.chatsData = chats;
            this.renderChatsList();
            
            if (this.selectedCustomerId) {
                await this.loadActiveChatMessages(isSilent);
            }
        } catch (e) {
            console.error("Chatlarni yuklashda xatolik:", e);
        }
    },

    renderChatsList: function() {
        const listContainer = document.getElementById('chats-list-content');
        if (!listContainer) return;

        const searchQueryNorm = window.normalizeUzbek ? window.normalizeUzbek(searchQuery) : searchQuery.toLowerCase();
        const filteredChats = this.chatsData.filter(chat => {
            const nameNorm = window.normalizeUzbek ? window.normalizeUzbek(chat.customer_name) : chat.customer_name.toLowerCase();
            const msgNorm = window.normalizeUzbek ? window.normalizeUzbek(chat.last_message_text || '') : (chat.last_message_text || '').toLowerCase();
            return nameNorm.includes(searchQueryNorm) || msgNorm.includes(searchQueryNorm);
        });

        if (filteredChats.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 32px 16px; font-size: 13px;">
                    Muloqotlar topilmadi.
                </div>
            `;
            return;
        }

        let html = '';
        filteredChats.forEach(chat => {
            const isActive = chat.customer_id === this.selectedCustomerId ? 'active' : '';
            const initials = chat.customer_name ? chat.customer_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'M';
            
            // Format message time
            let timeText = '';
            if (chat.last_message_time) {
                try {
                    const date = new Date(chat.last_message_time);
                    timeText = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
                } catch(e) {}
            }

            const platformClass = chat.platform === 'telegram' ? 'telegram' : 'instagram';

            html += `
                <div class="chat-item ${isActive}" onclick="window.Chats.selectChat('${chat.customer_id}', '${chat.platform}', '${chat.customer_name.replace(/'/g, "\\'")}')">
                    <div class="chat-item-avatar">
                        ${initials}
                        <div class="chat-item-platform-badge ${platformClass}">
                            <i class="fab ${chat.platform === 'telegram' ? 'fa-telegram-plane' : 'fa-instagram'}"></i>
                        </div>
                    </div>
                    <div class="chat-item-details">
                        <div class="chat-item-name">${chat.customer_name}</div>
                        <div class="chat-item-lastmsg">
                            ${chat.last_message_sender === 'agent' ? '<span style="color: var(--accent);">Siz:</span> ' : ''}${chat.last_message_text || ''}
                        </div>
                    </div>
                    ${timeText ? `<div class="chat-item-time">${timeText}</div>` : ''}
                </div>
            `;
        });

        listContainer.innerHTML = html;
    },

    selectChat: function(customerId, platform, customerName) {
        this.selectedCustomerId = customerId;
        this.selectedPlatform = platform;

        // UI holatini o'zgartirish
        const noSelectView = document.getElementById('chat-no-select-view');
        const activeView = document.getElementById('chat-active-view');
        
        if (noSelectView) noSelectView.style.display = 'none';
        if (activeView) activeView.style.display = 'flex';

        // Header ma'lumotlarini to'ldirish
        const headerName = document.getElementById('active-chat-name');
        if (headerName) headerName.textContent = customerName;

        const headerAvatar = document.getElementById('active-chat-avatar');
        if (headerAvatar) {
            headerAvatar.textContent = customerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        }

        const badgeSpan = document.getElementById('active-chat-platform-badge');
        if (badgeSpan) {
            badgeSpan.innerHTML = platform === 'telegram' 
                ? `<i class="fab fa-telegram" style="color: #0088cc; font-size: 16px;"></i>`
                : `<i class="fab fa-instagram" style="color: #E1306C; font-size: 16px;"></i>`;
        }

        const platformText = document.getElementById('active-chat-platform-text');
        if (platformText) {
            platformText.textContent = platform === 'telegram' ? 'Telegram Bot' : 'Instagram Direct';
        }

        const headerActions = document.getElementById('chat-header-actions');
        if (headerActions) {
            if (platform === 'instagram') {
                const username = customerId.replace("c_ig_", "");
                headerActions.innerHTML = `
                    <a href="https://instagram.com/${username}" target="_blank" class="btn btn-secondary btn-sm" style="background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%); color: white; border: none; font-size: 12px; font-weight: 500; height: 32px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none;">
                        <i class="fab fa-instagram"></i> Directda ochish
                    </a>
                `;
            } else if (platform === 'telegram') {
                const chat_id = customerId.replace("c_tg_", "");
                headerActions.innerHTML = `
                    <a href="tg://user?id=${chat_id}" class="btn btn-secondary btn-sm" style="background: #0088cc; color: white; border: none; font-size: 12px; font-weight: 500; height: 32px; padding: 0 12px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none;">
                        <i class="fab fa-telegram-plane"></i> Telegramda yozish
                    </a>
                `;
            } else {
                headerActions.innerHTML = '';
            }
        }

        // Active chat elementlariga active klass qo'shish
        this.renderChatsList();

        // Xabarlarni yuklash
        this.loadActiveChatMessages(false);
    },

    loadActiveChatMessages: async function(isSilent = false) {
        if (!this.selectedCustomerId) return;

        const messagesContainer = document.getElementById('chat-messages-container');
        if (!messagesContainer) return;

        try {
            const messages = await DB.getMessages(this.selectedCustomerId);
            
            // Xabarlarni ekranga chizish
            let html = '';
            
            if (messages.length === 0) {
                html = `
                    <div style="text-align: center; color: var(--text-muted); padding: 48px 16px;">
                        Muloqotlar tarixi bo'sh. Birinchi bo'lib xabar yuboring!
                    </div>
                `;
            } else {
                messages.forEach(msg => {
                    const isOutgoing = msg.sender === 'agent';
                    const bubbleClass = isOutgoing ? 'outgoing' : 'incoming';
                    
                    let timeText = '';
                    if (msg.created_at) {
                        try {
                            const date = new Date(msg.created_at);
                            timeText = date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
                        } catch(e) {}
                    }

                    html += `
                        <div class="message-bubble ${bubbleClass}">
                            <div class="message-text">${this.escapeHTML(msg.text)}</div>
                            <div class="message-time">${timeText}</div>
                        </div>
                    `;
                });
            }

            const isScrollAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
            const previousChildCount = messagesContainer.children.length;

            messagesContainer.innerHTML = html;

            // Xabarlar oynasini eng pastga tushirish (scroll to bottom)
            if (!isSilent || isScrollAtBottom || previousChildCount !== messagesContainer.children.length) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }

        } catch (e) {
            console.error("Xabarlarni yuklashda xatolik:", e);
        }
    },

    handleSendMessage: async function() {
        const inputField = document.getElementById('chat-input-field');
        if (!inputField || !this.selectedCustomerId || !this.selectedPlatform) return;

        const text = inputField.value.trim();
        if (!text) return;

        // Yuborish tugmasi va inputni bloklash
        inputField.disabled = true;

        try {
            const payload = {
                customer_id: this.selectedCustomerId,
                sender: 'agent',
                platform: this.selectedPlatform,
                text: text
            };

            await DB.sendMessage(payload);
            inputField.value = '';
            
            // Xabarlarni darhol yangilash
            await this.loadActiveChatMessages(false);
            // Ro'yxatni yangilash
            await this.loadChats(true);
        } catch(e) {
            alert("Xabar yuborishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.");
        } finally {
            inputField.disabled = false;
            inputField.focus();
        }
    },

    showSimulatorModal: function() {
        window.showModal('chats-simulator-modal');
    },

    onSimulatorPlatformChange: function() {
        const platform = document.getElementById('sim-platform').value;
        const senderIdInput = document.getElementById('sim-sender-id');
        const nameInput = document.getElementById('sim-name');
        
        if (platform === 'telegram') {
            senderIdInput.value = '888777';
            nameInput.value = 'Telegram Test User';
        } else {
            senderIdInput.value = '555444';
            nameInput.value = 'Instagram Test User';
        }
    },

    handleSimulateMessage: async function() {
        const platform = document.getElementById('sim-platform').value;
        const senderId = document.getElementById('sim-sender-id').value.trim();
        const name = document.getElementById('sim-name').value.trim();
        const text = document.getElementById('sim-text').value.trim();

        if (!senderId || !name || !text) return;

        try {
            let url = '';
            let payload = {};

            if (platform === 'telegram') {
                url = '/api/test/simulate-telegram';
                payload = {
                    chat_id: senderId,
                    name: name,
                    text: text
                };
            } else {
                url = '/api/test/simulate-instagram';
                payload = {
                    sender_id: senderId,
                    name: name,
                    text: text
                };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error("HTTP error " + response.status);

            window.closeModal('chats-simulator-modal');
            document.getElementById('sim-text').value = '';
            
            // Reload chats immediately and select the simulated chat
            await this.loadChats(false);
            const simulatedCustId = platform === 'telegram' ? `c_tg_${senderId}` : `c_ig_${senderId}`;
            this.selectChat(simulatedCustId, platform, name);

            // Trigger CRM board reload if it exists
            if (window.CRM && typeof window.CRM.loadCRMData === 'function') {
                window.CRM.loadCRMData();
            }

        } catch(e) {
            console.error("Simulation error:", e);
            alert("Simulyatsiya qilishda xatolik yuz berdi.");
        }
    },

    handleAISuggest: async function() {
        if (!this.selectedCustomerId) {
            alert("Iltimos, avval mijozni tanlang!");
            return;
        }

        const aiSuggestBtn = document.getElementById('chat-ai-suggest-btn');
        const inputField = document.getElementById('chat-input-field');
        if (!aiSuggestBtn || !inputField) return;

        // Visual feedback (disable button and show loading)
        const originalHTML = aiSuggestBtn.innerHTML;
        aiSuggestBtn.disabled = true;
        aiSuggestBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>O'ylamoqda...</span>`;

        try {
            const response = await fetch('/api/ai/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: this.selectedCustomerId })
            });

            if (!response.ok) throw new Error("API error");

            const resData = await response.json();
            if (resData.suggestion) {
                inputField.value = resData.suggestion;
                inputField.focus();
            } else {
                alert("Kechirasiz, sun'iy intellektdan taklif olib bo'lmadi.");
            }
        } catch (e) {
            console.error("AI suggest failed:", e);
            alert("Taklif olishda xatolik yuz berdi. Sozlamalarda Gemini API Key to'g'riligini tekshiring.");
        } finally {
            aiSuggestBtn.disabled = false;
            aiSuggestBtn.innerHTML = originalHTML;
        }
    },

    escapeHTML: function(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};
