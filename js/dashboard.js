import { db } from './firebase.js';
import { collection, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let homeReqSnapshotUnsubscribe = null, homeProjSnapshotUnsubscribe = null, homeMdLogSnapshotUnsubscribe = null;

window.openApp = function(viewId, title) {
    window.toggleSidebar(false);
    let permissionKey = viewId.replace('view-', '');
    if (permissionKey.startsWith('project-status')) permissionKey = 'project-status';
    
    if (permissionKey !== 'dashboard-proj' && permissionKey !== 'simulation' && window.userProfile && window.userProfile.permissions && !window.userProfile.permissions[permissionKey]) {
        window.showToast("접근 권한이 없습니다.", "error"); return;
    }

    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('nav-title').innerText = title;
    
    if(viewId.startsWith('view-project-status')) {
        window.currentProjPartTab = viewId.includes('opt') ? '광학' : '제조';
        document.getElementById('view-project-status').classList.remove('hidden');
        document.getElementById('pjt-dash-title-label').innerText = title;
        window.currentCategoryFilter = 'all'; const catSelect = document.getElementById('filter-category-select'); if(catSelect) catSelect.value = 'all';
        document.getElementById('btn-part-mfg').className = window.currentProjPartTab === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
        document.getElementById('btn-part-opt').className = window.currentProjPartTab === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
        if(window.toggleProjDashView) window.toggleProjDashView(window.currentProjDashView || 'list');
        if(window.loadProjectStatusData) window.loadProjectStatusData();
    } else if (viewId === 'view-weekly-log') {
        document.getElementById('view-weekly-log').classList.remove('hidden');
        const now = new Date();
        const weekNum = window.getWeekString ? window.getWeekString(now) : '';
        document.getElementById('weekly-log-filter-week').value = weekNum;
        if(window.loadWeeklyLogsData) window.loadWeeklyLogsData();
    } else if (viewId === 'view-simulation') {
        document.getElementById('view-simulation').classList.remove('hidden');
        document.getElementById('view-simulation').classList.add('flex');
    } else {
        document.getElementById('view-requests').classList.remove('hidden');
        window.currentAppId = permissionKey; 
        document.getElementById('req-list-title').innerText = title + " 목록";
        if(window.toggleRequestView) window.toggleRequestView('list');
        if(window.loadRequestsData) window.loadRequestsData(window.currentAppId);
    }
};

window.navigateHome = function() {
    window.toggleSidebar(false);
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById('view-dashboard-home').classList.remove('hidden');
    document.getElementById('nav-title').innerText = "통합 대시보드 홈";
    if(window.loadHomeDashboards) window.loadHomeDashboards();
};

window.toggleDashPeriod = function() {
    const unit = document.getElementById('dash-time-unit').value;
    if(unit === 'week') {
        document.getElementById('dash-month-select').classList.add('hidden'); document.getElementById('dash-week-select').classList.remove('hidden'); document.getElementById('dash-month-charts').classList.add('hidden'); document.getElementById('dash-week-charts').classList.remove('hidden'); document.getElementById('dash-week-charts').classList.add('grid');
    } else {
        document.getElementById('dash-week-select').classList.add('hidden'); document.getElementById('dash-month-select').classList.remove('hidden'); document.getElementById('dash-week-charts').classList.add('hidden'); document.getElementById('dash-week-charts').classList.remove('grid'); document.getElementById('dash-month-charts').classList.remove('hidden');
    }
    if(window.renderMonthlyDetail) window.renderMonthlyDetail();
};

window.loadHomeDashboards = function() {
    if(homeReqSnapshotUnsubscribe) homeReqSnapshotUnsubscribe();
    if(homeProjSnapshotUnsubscribe) homeProjSnapshotUnsubscribe();
    if(homeMdLogSnapshotUnsubscribe) homeMdLogSnapshotUnsubscribe();
    const now = new Date(); const yyyy = now.getFullYear().toString(); const yyyymm = `${yyyy}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if(!document.getElementById('dash-year-select').value) document.getElementById('dash-year-select').value = yyyy;
    if(!document.getElementById('dash-month-select').value) document.getElementById('dash-month-select').value = yyyymm;
    homeProjSnapshotUnsubscribe = onSnapshot(collection(db, "projects_status"), (snapshot) => { window.allDashProjects = []; snapshot.forEach(docSnap => window.allDashProjects.push({ id: docSnap.id, ...docSnap.data() })); if(window.processDashboardData) window.processDashboardData(); });
    homeMdLogSnapshotUnsubscribe = onSnapshot(collection(db, "project_md_logs"), (snapshot) => { window.allDashMdLogs = []; snapshot.forEach(docSnap => window.allDashMdLogs.push({ id: docSnap.id, ...docSnap.data() })); if(window.processDashboardData) window.processDashboardData(); });
};

window.processDashboardData = function() {
    const year = document.getElementById('dash-year-select').value; const teamSize = window.teamMembers ? window.teamMembers.length : 0;
    let stats = { estMd: 0, curMd: 0, completed: 0 }; let delayedCount = 0; let annualPlanData = Array(12).fill(0); let annualActData = Array(12).fill(0);
    window.allDashProjects.forEach(data => {
        let isInYear = false;
        if(data.status === 'pending' || data.status === 'progress' || data.status === 'inspecting') isInYear = true;
        if(data.d_shipEn && data.d_shipEn.startsWith(year)) isInYear = true;
        if(data.d_shipEst && data.d_shipEst.startsWith(year)) { isInYear = true; let mIdx = parseInt(data.d_shipEst.split('-')[1]) - 1; annualPlanData[mIdx] += parseFloat(data.estMd) || 0; }
        if(!isInYear) return;
        stats.estMd += parseFloat(data.estMd) || 0;
        let yearMd = 0;
        window.allDashMdLogs.forEach(log => { if(log.projectId === data.id && log.date && log.date.startsWith(year)) { let mdV = parseFloat(log.md) || 0; yearMd += mdV; let mIdx = parseInt(log.date.split('-')[1]) - 1; annualActData[mIdx] += mdV; } });
        stats.curMd += yearMd;
        if(data.status === 'completed') stats.completed++;
    });
    if(document.getElementById('dash-pd-estMd')) document.getElementById('dash-pd-estMd').innerText = stats.estMd.toFixed(1);
    if(document.getElementById('dash-pd-curMd')) document.getElementById('dash-pd-curMd').innerText = stats.curMd.toFixed(1);
    if(document.getElementById('dash-pd-completed')) document.getElementById('dash-pd-completed').innerText = stats.completed;
    if(window.renderMonthlyDetail) window.renderMonthlyDetail();
};
