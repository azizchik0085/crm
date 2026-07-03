// PRO-TECH ERP - Tasks & Projects Module (Vazifalar va Loyihalar)
window.Tasks = {
    projects: [],
    employees: [],

    async init() {
        console.log("Tasks module initialized");
        await this.loadTasks();
        this.setupFormListeners();
    },

    setupFormListeners() {
        const projectForm = document.getElementById("add-project-form");
        if (projectForm) {
            projectForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                await this.createProject();
            });
        }

        const taskForm = document.getElementById("add-task-form");
        if (taskForm) {
            taskForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                await this.createTask();
            });
        }
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
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 10px; color: ${priorityColor}; font-weight: bold; text-transform: uppercase;">${t.priority}</span>
                    <span style="font-size: 11px; color: #a5b4fc;"><i class="fas fa-user"></i> ${t.assigned_to_name || "Biriktirilmagan"}</span>
                </div>
                <div style="font-size: 10px; color: #64748b;">
                    <i class="fas fa-folder"></i> ${t.project_name || "Loyiha tashqarisi"}
                </div>
            `;
            
            const col = columns[t.status];
            if (col) col.appendChild(card);
        });
    },

    openProjectModal() {
        const form = document.getElementById("add-project-form");
        if (form) form.reset();
        window.showModal("project-modal");
    },

    async openTaskModal() {
        const form = document.getElementById("add-task-form");
        if (form) form.reset();

        const companyId = localStorage.getItem("company_id") || "admin";

        // Load projects list
        const projectSelect = document.getElementById("task-project-id");
        if (projectSelect) {
            projectSelect.innerHTML = '<option value="">Loyihani tanlang...</option>';
            try {
                const res = await fetch("/api/projects", {
                    headers: { "x-company-id": companyId }
                });
                this.projects = await res.json();
                this.projects.forEach(p => {
                    const opt = document.createElement("option");
                    opt.value = p.id;
                    opt.textContent = p.name;
                    projectSelect.appendChild(opt);
                });
            } catch (e) {
                console.error("Failed to load projects list", e);
            }
        }

        // Load employees list
        const employeeSelect = document.getElementById("task-assigned-to");
        if (employeeSelect) {
            employeeSelect.innerHTML = '<option value="">Biriktirilmagan</option>';
            try {
                const res = await fetch("/api/employees", {
                    headers: { "x-company-id": companyId }
                });
                this.employees = await res.json();
                this.employees.forEach(emp => {
                    const opt = document.createElement("option");
                    opt.value = emp.id;
                    opt.textContent = emp.name + " (" + emp.role + ")";
                    employeeSelect.appendChild(opt);
                });
            } catch (e) {
                console.error("Failed to load employees list", e);
            }
        }

        window.showModal("task-modal");
    },

    async createProject() {
        const name = document.getElementById("proj-name").value;
        const description = document.getElementById("proj-desc").value;
        const status = document.getElementById("proj-status").value;

        const payload = { name, description, status };

        try {
            const res = await fetch("/api/projects", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                window.closeModal("project-modal");
                alert("Loyiha muvaffaqiyatli yaratildi!");
            } else {
                const err = await res.json();
                alert("Xatolik: " + JSON.stringify(err.detail));
            }
        } catch (e) {
            console.error("Failed to create project", e);
            alert("Loyiha yaratishda xatolik yuz berdi");
        }
    },

    async createTask() {
        const projectId = document.getElementById("task-project-id").value;
        const title = document.getElementById("task-title").value;
        const description = document.getElementById("task-desc").value;
        const assignedTo = document.getElementById("task-assigned-to").value || null;
        const priority = document.getElementById("task-priority").value;
        const status = document.getElementById("task-status").value;
        const deadline = document.getElementById("task-deadline").value || null;

        const payload = {
            project_id: projectId,
            title,
            description,
            assigned_to: assignedTo,
            priority,
            status,
            deadline
        };

        try {
            const res = await fetch("/api/tasks", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                window.closeModal("task-modal");
                await this.loadTasks();
                alert("Vazifa muvaffaqiyatli yaratildi!");
            } else {
                const err = await res.json();
                alert("Xatolik: " + JSON.stringify(err.detail));
            }
        } catch (e) {
            console.error("Failed to create task", e);
            alert("Vazifa yaratishda xatolik yuz berdi");
        }
    }
};
