// PRO-TECH ERP - HR (Attendance & Leaves) Module
window.HR = {
    async init() {
        console.log("HR module initialized");
        await this.loadAttendance();
    },

    async loadAttendance() {
        try {
            const res = await fetch("/api/hr/attendance", {
                headers: {
                    "x-company-id": localStorage.getItem("company_id") || "admin"
                }
            });
            const data = await res.json();
            console.log("Loaded attendance data:", data);
        } catch (e) {
            console.error("Failed to load attendance", e);
        }
    }
};
