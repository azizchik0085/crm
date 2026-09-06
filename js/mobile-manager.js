// Webzone CRM & ERP - Mobil Ilova Boshqaruvi va Xodimlar Ruxsatnomalari Moduli

window.MobileManager = {
    activeTab: 'roles', // 'roles' or 'employees'
    allModules: [],
    rolesList: [],
    employeesList: [],
    isLoading: false,

    init: async function() {
        await this.loadData();
    },

    loadData: async function() {
        this.isLoading = true;
        const rolesContainer = document.getElementById('mobile-roles-matrix-container');
        const empsContainer = document.getElementById('mobile-emps-matrix-container');
        
        if (rolesContainer) {
            rolesContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top: 10px;">Yuklanmoqda...</div></div>';
        }

        try {
            const resp = await fetch('/api/mobile/permissions');
            const data = await resp.json();

            if (data && data.ok) {
                this.allModules = data.all_modules || [];
                this.rolesList = data.roles || [];
                this.employeesList = data.employees || [];
            } else {
                throw new Error(data.detail || "Ma'lumotlarni yuklab bo'lmadi");
            }

            this.renderRolesMatrix();
            this.renderEmployeesMatrix();
            this.updateStats();

        } catch (err) {
            console.error("MobileManager load error:", err);
            if (rolesContainer) {
                rolesContainer.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 30px;"><i class="fas fa-exclamation-triangle fa-2x"></i><div style="margin-top: 8px;">Xatolik: ${err.message}</div></div>`;
            }
        } finally {
            this.isLoading = false;
        }
    },

    setTab: function(tabName) {
        this.activeTab = tabName;
        const btnRoles = document.getElementById('m-tab-btn-roles');
        const btnEmps = document.getElementById('m-tab-btn-emps');
        const viewRoles = document.getElementById('m-tab-content-roles');
        const viewEmps = document.getElementById('m-tab-content-emps');

        if (tabName === 'roles') {
            if (btnRoles) btnRoles.className = 'btn btn-primary';
            if (btnEmps) btnEmps.className = 'btn btn-secondary';
            if (viewRoles) viewRoles.style.display = 'block';
            if (viewEmps) viewEmps.style.display = 'none';
        } else {
            if (btnRoles) btnRoles.className = 'btn btn-secondary';
            if (btnEmps) btnEmps.className = 'btn btn-primary';
            if (viewRoles) viewRoles.style.display = 'none';
            if (viewEmps) viewEmps.style.display = 'block';
        }
    },

    updateStats: function() {
        const totalRolesEl = document.getElementById('m-stat-total-roles');
        const totalEmpsEl = document.getElementById('m-stat-total-emps');
        const totalModsEl = document.getElementById('m-stat-total-mods');

        if (totalRolesEl) totalRolesEl.textContent = `${this.rolesList.length} ta`;
        if (totalEmpsEl) totalEmpsEl.textContent = `${this.employeesList.length} ta`;
        if (totalModsEl) totalModsEl.textContent = `${this.allModules.length} ta`;
    },

    // --- 1. ROLLAR KESIMIDA RENDER ---
    renderRolesMatrix: function() {
        const container = document.getElementById('mobile-roles-matrix-container');
        if (!container) return;

        if (this.rolesList.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px;">Lavozimlar mavjud emas</div>';
            return;
        }

        let html = '';
        this.rolesList.forEach((role, idx) => {
            const roleName = typeof role === 'string' ? role : role.name;
            const mobilePerms = (typeof role === 'object' && Array.isArray(role.mobile_permissions)) ? role.mobile_permissions : [];
            const activeCount = mobilePerms.length;

            html += `
                <div class="card" style="margin-bottom: 16px; border: 1px solid var(--border-color); background: rgba(255,255,255,0.015); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.15);">
                    <!-- Role Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, rgba(56,189,248,0.2), rgba(99,102,241,0.2)); border: 1px solid rgba(56,189,248,0.4); display: flex; align-items: center; justify-content: center; color: #38bdf8; font-size: 16px; font-weight: 800;">
                                <i class="fas fa-user-shield"></i>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main);">${roleName}</h3>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                                    Faol mobil funksiyalar: <span id="role-badge-count-${idx}" style="color: #38bdf8; font-weight: 700;">${activeCount} / ${this.allModules.length} ta</span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; gap: 8px; align-items: center;">
                            <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11.5px; height: 32px; padding: 0 10px;" onclick="MobileManager.enableAllRole('${roleName.replace(/'/g, "\\'")}', ${idx})">
                                <i class="fas fa-check-double" style="color: #10b981;"></i> Barchasini yoqish
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11.5px; height: 32px; padding: 0 10px;" onclick="MobileManager.disableAllRole('${roleName.replace(/'/g, "\\'")}', ${idx})">
                                <i class="fas fa-ban" style="color: #ef4444;"></i> Barchasini o'chirish
                            </button>
                        </div>
                    </div>

                    <!-- Role Permissions Grid -->
                    <div style="padding: 16px 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">
                        ${this.allModules.map(mod => {
                            const isChecked = mobilePerms.includes(mod.key);
                            const switchId = `sw-role-${idx}-${mod.key}`;
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(0,0,0,0.2); border: 1px solid ${isChecked ? 'rgba(56,189,248,0.3)' : 'var(--border-color)'}; border-radius: 10px; transition: all 0.2s;">
                                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; padding-right: 8px;">
                                        <i class="fas ${mod.icon}" style="color: ${isChecked ? '#38bdf8' : 'var(--text-muted)'}; font-size: 15px; width: 20px; text-align: center;"></i>
                                        <div>
                                            <div style="font-size: 13px; font-weight: 600; color: ${isChecked ? 'var(--text-main)' : 'var(--text-muted)'};">${mod.label}</div>
                                            <div style="font-size: 11px; color: var(--text-muted); line-height: 1.2; margin-top: 1px;">${mod.desc}</div>
                                        </div>
                                    </div>
                                    <label class="custom-toggle" style="cursor: pointer; position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0;">
                                        <input type="checkbox" id="${switchId}" ${isChecked ? 'checked' : ''} onchange="MobileManager.toggleRolePermission('${roleName.replace(/'/g, "\\'")}', '${mod.key}', this.checked, ${idx})" style="opacity: 0; width: 0; height: 0;">
                                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isChecked ? '#10b981' : 'rgba(255,255,255,0.1)'}; transition: .2s; border-radius: 24px; border: 1px solid var(--border-color);">
                                            <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${isChecked ? '22px' : '3px'}; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%;"></span>
                                        </span>
                                    </label>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // --- 2. XODIMLAR KESIMIDA RENDER ---
    renderEmployeesMatrix: function() {
        const container = document.getElementById('mobile-emps-matrix-container');
        if (!container) return;

        if (this.employeesList.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px;">Xodimlar mavjud emas</div>';
            return;
        }

        let html = '';
        this.employeesList.forEach((emp, idx) => {
            const empName = emp.name || emp.id;
            const empRole = (emp.role || 'Xodim').split(';')[0];
            const mobilePerms = Array.isArray(emp.mobile_permissions) ? emp.mobile_permissions : [];
            const hasCustom = !!emp.has_custom;
            const activeCount = mobilePerms.length;

            html += `
                <div class="card" style="margin-bottom: 16px; border: 1px solid ${hasCustom ? 'rgba(56,189,248,0.35)' : 'var(--border-color)'}; background: rgba(255,255,255,0.015); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.15);">
                    <!-- Emp Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--border-color); flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #38bdf8); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 15px; font-weight: 800;">
                                ${(empName.trim().charAt(0) || 'X').toUpperCase()}
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <h3 style="margin: 0; font-size: 15.5px; font-weight: 700; color: var(--text-main);">${empName}</h3>
                                    <span class="badge" style="background: rgba(255,255,255,0.08); font-size: 11px; padding: 2px 8px;">${empRole}</span>
                                    ${hasCustom ? '<span class="badge" style="background: rgba(56,189,248,0.15); color: #38bdf8; font-size: 10.5px; padding: 2px 7px;"><i class="fas fa-sliders-h"></i> Shaxsiy ruxsatlar</span>' : '<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted); font-size: 10.5px; padding: 2px 7px;">Rol asosida</span>'}
                                </div>
                                <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                                    Login: <code style="color: #a5b4fc;">${emp.login || '-'}</code> | Faol funksiyalar: <span id="emp-badge-count-${idx}" style="color: #10b981; font-weight: 700;">${activeCount} / ${this.allModules.length} ta</span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${hasCustom ? `
                                <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11.5px; height: 32px; padding: 0 10px;" onclick="MobileManager.resetEmployeeToRole('${emp.id}', '${empRole.replace(/'/g, "\\'")}', ${idx})">
                                    <i class="fas fa-rotate-left"></i> Rol standartiga qaytarish
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11.5px; height: 32px; padding: 0 10px;" onclick="MobileManager.enableAllEmployee('${emp.id}', ${idx})">
                                <i class="fas fa-check-double" style="color: #10b981;"></i> Barchasini yoqish
                            </button>
                            <button type="button" class="btn btn-secondary btn-sm" style="font-size: 11.5px; height: 32px; padding: 0 10px;" onclick="MobileManager.disableAllEmployee('${emp.id}', ${idx})">
                                <i class="fas fa-ban" style="color: #ef4444;"></i> Barchasini o'chirish
                            </button>
                        </div>
                    </div>

                    <!-- Emp Permissions Grid -->
                    <div style="padding: 16px 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px;">
                        ${this.allModules.map(mod => {
                            const isChecked = mobilePerms.includes(mod.key);
                            const switchId = `sw-emp-${idx}-${mod.key}`;
                            return `
                                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(0,0,0,0.2); border: 1px solid ${isChecked ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}; border-radius: 10px; transition: all 0.2s;">
                                    <div style="display: flex; align-items: center; gap: 10px; flex: 1; padding-right: 8px;">
                                        <i class="fas ${mod.icon}" style="color: ${isChecked ? '#10b981' : 'var(--text-muted)'}; font-size: 15px; width: 20px; text-align: center;"></i>
                                        <div>
                                            <div style="font-size: 13px; font-weight: 600; color: ${isChecked ? 'var(--text-main)' : 'var(--text-muted)'};">${mod.label}</div>
                                            <div style="font-size: 11px; color: var(--text-muted); line-height: 1.2; margin-top: 1px;">${mod.desc}</div>
                                        </div>
                                    </div>
                                    <label class="custom-toggle" style="cursor: pointer; position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0;">
                                        <input type="checkbox" id="${switchId}" ${isChecked ? 'checked' : ''} onchange="MobileManager.toggleEmployeePermission('${emp.id}', '${mod.key}', this.checked, ${idx})" style="opacity: 0; width: 0; height: 0;">
                                        <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${isChecked ? '#10b981' : 'rgba(255,255,255,0.1)'}; transition: .2s; border-radius: 24px; border: 1px solid var(--border-color);">
                                            <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${isChecked ? '22px' : '3px'}; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%;"></span>
                                        </span>
                                    </label>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    // --- 3. AMALLAR: TOGGLE VA SAQLASH ---
    toggleRolePermission: async function(roleName, moduleKey, isChecked, roleIdx) {
        const role = this.rolesList[roleIdx];
        if (!role) return;

        role.mobile_permissions = Array.isArray(role.mobile_permissions) ? role.mobile_permissions : [];
        if (isChecked) {
            if (!role.mobile_permissions.includes(moduleKey)) role.mobile_permissions.push(moduleKey);
        } else {
            role.mobile_permissions = role.mobile_permissions.filter(k => k !== moduleKey);
        }

        // Update local badge
        const badge = document.getElementById(`role-badge-count-${roleIdx}`);
        if (badge) badge.textContent = `${role.mobile_permissions.length} / ${this.allModules.length} ta`;

        // Update AppStorage & sync
        try {
            const data = (window.AppStorage && AppStorage.load) ? AppStorage.load() : { settings: {} };
            data.settings.roles = this.rolesList;
            if (window.AppStorage && AppStorage.save) AppStorage.save(data);

            const resp = await fetch('/api/mobile/role-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role_name: roleName,
                    mobile_permissions: role.mobile_permissions
                })
            });

            if (!resp.ok) throw new Error("Saqlashda xatolik");
            this.showToast(`«${roleName}» uchun ${isChecked ? 'yoqildi' : 'o\'chirildi'}`);

        } catch (err) {
            console.error("Save role perms error:", err);
            this.showToast("Xatolik: " + err.message, "danger");
        }
    },

    enableAllRole: async function(roleName, roleIdx) {
        const role = this.rolesList[roleIdx];
        if (!role) return;
        role.mobile_permissions = this.allModules.map(m => m.key);
        await this.saveRoleFull(roleName, role.mobile_permissions);
        this.renderRolesMatrix();
    },

    disableAllRole: async function(roleName, roleIdx) {
        const role = this.rolesList[roleIdx];
        if (!role) return;
        role.mobile_permissions = [];
        await this.saveRoleFull(roleName, []);
        this.renderRolesMatrix();
    },

    saveRoleFull: async function(roleName, perms) {
        try {
            const data = (window.AppStorage && AppStorage.load) ? AppStorage.load() : { settings: {} };
            data.settings.roles = this.rolesList;
            if (window.AppStorage && AppStorage.save) AppStorage.save(data);

            await fetch('/api/mobile/role-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role_name: roleName,
                    mobile_permissions: perms
                })
            });
            this.showToast(`«${roleName}» yangilandi`);
        } catch(e) {
            this.showToast("Xatolik: " + e.message, "danger");
        }
    },

    toggleEmployeePermission: async function(empId, moduleKey, isChecked, empIdx) {
        const emp = this.employeesList[empIdx];
        if (!emp) return;

        emp.mobile_permissions = Array.isArray(emp.mobile_permissions) ? emp.mobile_permissions : [];
        if (isChecked) {
            if (!emp.mobile_permissions.includes(moduleKey)) emp.mobile_permissions.push(moduleKey);
        } else {
            emp.mobile_permissions = emp.mobile_permissions.filter(k => k !== moduleKey);
        }
        emp.has_custom = true;

        const badge = document.getElementById(`emp-badge-count-${empIdx}`);
        if (badge) badge.textContent = `${emp.mobile_permissions.length} / ${this.allModules.length} ta`;

        try {
            const resp = await fetch('/api/mobile/employee-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: empId,
                    mobile_permissions: emp.mobile_permissions
                })
            });
            if (!resp.ok) throw new Error("Xodim ruxsatlarini saqlab bo'lmadi");
            this.showToast(`«${emp.name}» uchun saqlandi`);
        } catch(e) {
            this.showToast("Xatolik: " + e.message, "danger");
        }
    },

    resetEmployeeToRole: async function(empId, roleName, empIdx) {
        if (!confirm(`«${roleName}» lavozimining standart mobil ruxsatlariga qaytarilsinmi?`)) return;

        try {
            const resp = await fetch('/api/mobile/employee-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: empId,
                    reset_to_role: true
                })
            });
            if (!resp.ok) throw new Error("Qaytarib bo'lmadi");
            this.showToast("Standart rolga qaytarildi");
            await this.loadData();
        } catch(e) {
            this.showToast("Xatolik: " + e.message, "danger");
        }
    },

    enableAllEmployee: async function(empId, empIdx) {
        const emp = this.employeesList[empIdx];
        if (!emp) return;
        emp.mobile_permissions = this.allModules.map(m => m.key);
        emp.has_custom = true;
        await this.saveEmpFull(empId, emp.mobile_permissions);
        this.renderEmployeesMatrix();
    },

    disableAllEmployee: async function(empId, empIdx) {
        const emp = this.employeesList[empIdx];
        if (!emp) return;
        emp.mobile_permissions = [];
        emp.has_custom = true;
        await this.saveEmpFull(empId, []);
        this.renderEmployeesMatrix();
    },

    saveEmpFull: async function(empId, perms) {
        try {
            await fetch('/api/mobile/employee-permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employee_id: empId,
                    mobile_permissions: perms
                })
            });
            this.showToast("Xodim ruxsatlari saqlandi");
        } catch(e) {
            this.showToast("Xatolik: " + e.message, "danger");
        }
    },

    copyMobileLink: function() {
        const url = window.location.origin + '/mobile.html';
        navigator.clipboard.writeText(url).then(() => {
            this.showToast("Mobil ilova havolasi nusxalandi: " + url);
        }).catch(() => {
            prompt("Mobil ilova havolasi:", url);
        });
    },

    showToast: function(message, type = 'success') {
        const existing = document.getElementById('mobile-manager-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'mobile-manager-toast';
        toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: ${type === 'danger' ? '#ef4444' : '#10b981'};
            color: #fff;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 13.5px;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            z-index: 999999;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: fadeIn 0.2s ease-in-out;
        `;
        toast.innerHTML = `<i class="fas ${type === 'danger' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> <span>${message}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast && toast.parentNode) toast.remove();
        }, 2800);
    }
};