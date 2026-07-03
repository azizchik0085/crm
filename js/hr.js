// PRO-TECH ERP - HR (Attendance & Leaves) Module
window.HR = window.HR || {};

// Save original init from js/erp.js
const originalHRInit = window.HR.init;

window.HR.init = async function() {
    if (typeof originalHRInit === 'function') {
        await originalHRInit.call(this);
    }
    await this.loadAttendance();
};

window.HR.loadAttendance = async function() {
    try {
        const res = await fetch("/api/hr/attendance");
        const data = await res.json();
        console.log("Loaded attendance data:", data);
    } catch (e) {
        console.error("Failed to load attendance", e);
    }
};
