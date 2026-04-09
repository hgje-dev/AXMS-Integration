import { db } from './firebase.js';
import { collection, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let homeReqSnapshotUnsubscribe = null, homeProjSnapshotUnsubscribe = null, homeMdLogSnapshotUnsubscribe = null;
let chartInstances = {}; // 차트 중복 렌더링 방지용

// 🌟 기준 연도 동적 생성 (2026년 기준 10년치)
window.initDashboardYears = function() {
    const select = document.getElementById('dash-year-select');
    if(!select) return;
    select.innerHTML = '';
    const currentYear = new Date().getFullYear();
    const startYear = 2026;
    const maxYear = Math.max(currentYear, startYear) + 10;
    for(let y = startYear; y <= maxYear; y++) {
        select.innerHTML += `<option value="${y}" ${y === startYear ? 'selected' : ''}>${y}년</option>`;
    }
};

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

window.loadHomeDashboards = function() {
    const yearSelect = document.getElementById('dash-year-select');
    if(yearSelect && yearSelect.options.length === 0) window.initDashboardYears();

    if(homeReqSnapshotUnsubscribe) homeReqSnapshotUnsubscribe();
    if(homeProjSnapshotUnsubscribe) homeProjSnapshotUnsubscribe();
    if(homeMdLogSnapshotUnsubscribe) homeMdLogSnapshotUnsubscribe();
    
    homeProjSnapshotUnsubscribe = onSnapshot(collection(db, "projects_status"), (snapshot) => { 
        window.allDashProjects = []; 
        snapshot.forEach(docSnap => window.allDashProjects.push({ id: docSnap.id, ...docSnap.data() })); 
        if(window.processDashboardData) window.processDashboardData(); 
    });
    homeMdLogSnapshotUnsubscribe = onSnapshot(collection(db, "project_md_logs"), (snapshot) => { 
        window.allDashMdLogs = []; 
        snapshot.forEach(docSnap => window.allDashMdLogs.push({ id: docSnap.id, ...docSnap.data() })); 
        if(window.processDashboardData) window.processDashboardData(); 
    });
};

window.processDashboardData = function() {
    const year = document.getElementById('dash-year-select').value || '2026'; 
    let stats = { estMd: 0, curMd: 0, completed: 0, delayed: 0, pending: 0, progress: 0, inspecting: 0 }; 
    let annualPlanData = Array(12).fill(0); 
    let annualActData = Array(12).fill(0);
    let monthlyCompleted = Array(12).fill(0);

    window.allDashProjects.forEach(data => {
        let isInYear = false;
        if(data.d_shipEn && data.d_shipEn.startsWith(year)) isInYear = true;
        if(data.d_shipEst && data.d_shipEst.startsWith(year)) isInYear = true;
        if(data.status === 'pending' || data.status === 'progress' || data.status === 'inspecting') isInYear = true;
        if(!isInYear) return;

        stats[data.status] = (stats[data.status] || 0) + 1;
        
        if(data.d_shipEst && data.d_shipEst.startsWith(year)) { 
            let mIdx = parseInt(data.d_shipEst.split('-')[1]) - 1; 
            annualPlanData[mIdx] += parseFloat(data.estMd) || 0; 
        }

        if(data.status === 'completed' && (data.d_shipEn || data.d_shipEst)?.startsWith(year)) {
            stats.completed++;
            let mIdx = parseInt((data.d_shipEn || data.d_shipEst).split('-')[1]) - 1;
            monthlyCompleted[mIdx]++;
        }

        stats.estMd += parseFloat(data.estMd) || 0;
        
        if (data.status !== 'completed' && data.d_shipEst) {
            const diffDays = (new Date(data.d_shipEst) - new Date()) / (1000 * 60 * 60 * 24);
            if (diffDays <= 3) stats.delayed++;
        }
    });

    window.allDashMdLogs.forEach(log => { 
        if(log.date && log.date.startsWith(year)) { 
            let mdV = parseFloat(log.md) || 0; 
            stats.curMd += mdV; 
            let mIdx = parseInt(log.date.split('-')[1]) - 1; 
            annualActData[mIdx] += mdV; 
        } 
    });

    if(document.getElementById('dash-pd-estMd')) document.getElementById('dash-pd-estMd').innerText = stats.estMd.toFixed(1);
    if(document.getElementById('dash-pd-curMd')) document.getElementById('dash-pd-curMd').innerText = stats.curMd.toFixed(1);
    if(document.getElementById('dash-pd-completed')) document.getElementById('dash-pd-completed').innerText = stats.completed;
    if(document.getElementById('dash-pd-delayed')) document.getElementById('dash-pd-delayed').innerText = stats.delayed;
    
    if(stats.estMd > 0) {
        const variance = ((stats.curMd - stats.estMd) / stats.estMd * 100).toFixed(1);
        if(document.getElementById('dash-pd-variance')) document.getElementById('dash-pd-variance').innerText = variance + '%';
    }

    window.renderCharts(stats, monthlyCompleted, annualPlanData, annualActData);
};

// 🌟 차트 렌더링 함수 복구
window.renderCharts = function(stats, monthlyCompleted, planData, actData) {
    const createChart = (id, type, data, options) => {
        const canvas = document.getElementById(id);
        if(!canvas) return;
        if(chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new Chart(canvas.getContext('2d'), { type, data, options });
    };

    createChart('projPieChart', 'doughnut', {
        labels: ['대기/보류', '진행중', '검수중', '완료'],
        datasets: [{ data: [stats.pending||0, stats.progress||0, stats.inspecting||0, stats.completed||0], backgroundColor: ['#cbd5e1', '#3b82f6', '#f59e0b', '#10b981'] }]
    }, { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } });

    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    createChart('projMonthlyChart', 'bar', {
        labels: months,
        datasets: [{ label: '출하 완료(건)', data: monthlyCompleted, backgroundColor: '#10b981', borderRadius: 4 }]
    }, { maintainAspectRatio: false });

    createChart('annualPlanVsActualChart', 'line', {
        labels: months,
        datasets: [
            { label: '계획 MD', data: planData, borderColor: '#6366f1', backgroundColor: '#6366f1', tension: 0.3 },
            { label: '투입 MD', data: actData, borderColor: '#a855f7', backgroundColor: '#a855f7', tension: 0.3 }
        ]
    }, { maintainAspectRatio: false });
};
