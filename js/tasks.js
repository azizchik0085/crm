// PRO-TECH ERP - Tasks & Projects Module (Vazifalar)
window.Tasks = {
    async init() {
        console.log("Tasks module initialized");
        await this.loadTasks();
    },

    async loadTasks() {
        try {
            const res = await fetch("/api/tasks", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            const tasks = await res.json();
            this.renderKanban(tasks);
        } catch (e) {
            console.error("Failed to load tasks", e);
        }
    },

    renderKanban(tasks) {
        const columns = {
            todo: document.getElementById("tasks-todo-list"),
            in_progress: document.getElementById("tasks-progress-list"),
            review: document.getElementById("tasks-review-list"),
            done: document.getElementById("tasks-done-list")
        };

        // Clear columns
        Object.keys(columns).forEach(key => {
            if (columns[key]) columns[key].innerHTML = "";
        });

        tasks.forEach(t => {
            const card = document.createElement("div");
            card.className = "card";
            card.style.margin = "0 0 10px 0";
            card.style.background = "#1e293b";
            card.style.border = "1px solid #334155";
            card.style.padding = "12px";
            card.style.borderRadius = "8px";
            card.style.textAlign = "left";

            let priorityColor = "#64748b";
            if (t.priority === "high") priorityColor = "#f59e0b";
            else if (t.priority === "critical") priorityColor = "#ef4444";

            card.innerHTML = `
                <h5 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600; color: #f8fafc;">${t.title}</h5>
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.description || "Tavsif yo'q"}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 10px; color: ${priorityColor}; font-weight: bold; text-transform: uppercase;">${t.priority}</span>
                    <span style="font-size: 11px; color: #a5b4fc;"><i class="fas fa-user"></i> ${t.assigned_to_name}</span>
                </div>
            `;
            
            const col = columns[t.status];
            if (col) col.appendChild(card);
        });
    },

    openProjectModal() {
        alert("Yangi loyiha yaratish:");
    },

    openTaskModal() {
        alert("Yangi vazifa biriktirish:");
    }
};
