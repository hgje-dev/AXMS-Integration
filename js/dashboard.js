import { db } from './firebase.js';
import { collection, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let homeReqSnapshotUnsubscribe = null, homeProjSnapshotUnsubscribe = null, homeMdLogSnapshotUnsubscribe = null;
let chartInstances = {};

// 🌟 무적 방어: 데이터 강제 변환
const getSafeString = (val) => {
    if (val === null || val === undefined) return '';
    return String(val);
};

// 🚨🚨 제가 통째로 날려먹었던 화면 이동 함수 완벽 복구!! 🚨🚨
window.openApp = function(viewId, title) {
    if(window.toggleSidebar) window.toggleSidebar(false);
    let permissionKey = viewId.replace('view-', '');
    if (permissionKey.startsWith('project-status')) permissionKey = 'project-status';
    
    if (permissionKey !== 'dashboard-proj' && permissionKey !== 'simulation' && window.userProfile && window.userProfile.permissions && !window.userProfile.permissions[permissionKey]) {
        if(window.showToast) window.showToast("접근 권한이 없습니다.", "error"); return;
    }

    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = title;
    
    const viewEl = document.getElementById(viewId);
    if(viewEl) {
        viewEl.classList.remove('hidden');
        if(viewId === 'view-simulation') viewEl.classList.add('flex');
    }

    if(viewId.startsWith('view-project-status')) {
        window.currentProjPartTab = viewId.includes('opt') ? '광학' : '제조';
        if(document.getElementById('pjt-dash-title-label')) document.getElementById('pjt-dash-title-label').innerText = title;
        window.currentCategoryFilter = 'all'; 
        if(document.getElementById('filter-category-select')) document.getElementById('filter-category-select').value = 'all';
        
        const btnMfg = document.getElementById('btn-part-mfg');
        const btnOpt = document.getElementById('btn-part-opt');
        if(btnMfg) btnMfg.className = window.currentProjPartTab === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
        if(btnOpt) btnOpt.className = window.currentProjPartTab === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
        
        if(window.toggleProjDashView) window.toggleProjDashView(window.currentProjDashView || 'list');
        if(window.loadProjectStatusData) window.loadProjectStatusData();
    } else if (viewId === 'view-weekly-log') {
        const now = new Date();
        const weekNum = window.getWeekString ? window.getWeekString(now) : '';
        if(document.getElementById('weekly-log-filter-week')) document.getElementById('weekly-log-filter-week').value = weekNum;
        if(window.loadWeeklyLogsData) window.loadWeeklyLogsData();
    } else if (viewId !== 'view-simulation') {
        window.currentAppId = permissionKey; 
        if(document.getElementById('req-list-title')) document.getElementById('req-list-title').innerText = title + " 목록";
        if(window.toggleRequestView) window.toggleRequestView('list');
        if(window.loadRequestsData) window.loadRequestsData(window.currentAppId);
    }
};

// 🚨 홈화면 이동 함수도 복구 완료!! 🚨
window.navigateHome = function() {
    if(window.toggleSidebar) window.toggleSidebar(false);
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const dashHome = document.getElementById('view-dashboard-home');
    if(dashHome) dashHome.classList.remove('hidden');
    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = "통합 대시보드 홈";
    if(window.loadHomeDashboards) window.loadHomeDashboards();
};

window.initDashboardYears = function() {
    try {
        const select = document.getElementById('dash-year-select');
        if(!select) return;
        select.innerHTML = '';
        const currentYear = new Date().getFullYear();
        const startYear = 2026;
        const maxYear = Math.max(currentYear, startYear) + 10;
        for(let y = startYear; y <= maxYear; y++) {
            select.innerHTML += `<option value="${y}" ${y === startYear ? 'selected' : ''}>${y}년</option>`;
        }
    } catch(e) {}
};

window.loadHomeDashboards = function() {
    try {
        const yearSelect = document.getElementById('dash-year-select');
        if(yearSelect && yearSelect.options.length === 0) window.initDashboardYears();

        if(homeReqSnapshotUnsubscribe) homeReqSnapshotUnsubscribe();
        if(homeProjSnapshotUnsubscribe) homeProjSnapshotUnsubscribe();
        if(homeMdLogSnapshotUnsubscribe) homeMdLogSnapshotUnsubscribe();
        
        homeProjSnapshotUnsubscribe = onSnapshot(collection(db, "projects_status"), (snapshot) => { 
            window.allDashProjects = []; 
            snapshot.forEach(docSnap => window.allDashProjects.push({ id: docSnap.id, ...docSnap.data() })); 
            if(window.processDashboardData) window.processDashboardData(); 
        }, (error) => { console.error("대시보드 프로젝트 로드 실패:", error); });

        homeMdLogSnapshotUnsubscribe = onSnapshot(collection(db, "project_md_logs"), (snapshot) => { 
            window.allDashMdLogs = []; 
            snapshot.forEach(docSnap => window.allDashMdLogs.push({ id: docSnap.id, ...docSnap.data() })); 
            if(window.processDashboardData) window.processDashboardData(); 
        }, (error) => { console.error("대시보드 로그 로드 실패:", error); });
    } catch(e) { console.error("대시보드 초기화 실패:", e); }
};

window.processDashboardData = function() {
    try {
        const year = document.getElementById('dash-year-select')?.value || '2026'; 
        let stats = { estMd: 0, curMd: 0, completed: 0, delayed: 0, pending: 0, progress: 0, inspecting: 0 }; 
        let annualPlanData = Array(12).fill(0); 
        let annualActData = Array(12).fill(0);
        let monthlyCompleted = Array(12).fill(0);

        (window.allDashProjects || []).forEach(data => {
            const shipEn = getSafeString(data.d_shipEn);
            const shipEst = getSafeString(data.d_shipEst);
            const status = getSafeString(data.status);

            let isInYear = false;
            if(shipEn && shipEn.startsWith(year)) isInYear = true;
            if(shipEst && shipEst.startsWith(year)) isInYear = true;
            if(status === 'pending' || status === 'progress' || status === 'inspecting') isInYear = true;
            
            if(!isInYear) return;

            stats[status] = (stats[status] || 0) + 1;
            
            if(shipEst && shipEst.startsWith(year)) { 
                let mIdx = parseInt(shipEst.split('-')[1]) - 1; 
                if(mIdx >= 0 && mIdx < 12) annualPlanData[mIdx] += parseFloat(data.estMd) || 0; 
            }

            if(status === 'completed' && (shipEn.startsWith(year) || shipEst.startsWith(year))) {
                stats.completed++;
                const targetDate = shipEn || shipEst;
                if(targetDate) {
                    let mIdx = parseInt(targetDate.split('-')[1]) - 1;
                    if(mIdx >= 0 && mIdx < 12) monthlyCompleted[mIdx]++;
                }
            }

            stats.estMd += parseFloat(data.estMd) || 0;
            
            if (status !== 'completed' && shipEst) {
                const diffDays = (new Date(shipEst) - new Date()) / (1000 * 60 * 60 * 24);
                if (diffDays <= 3) stats.delayed++;
            }
        });

        (window.allDashMdLogs || []).forEach(log => { 
            const logDate = getSafeString(log.date);
            if(logDate && logDate.startsWith(year)) { 
                let mdV = parseFloat(log.md) || 0; 
                stats.curMd += mdV; 
                let mIdx = parseInt(logDate.split('-')[1]) - 1; 
                if(mIdx >= 0 && mIdx < 12) annualActData[mIdx] += mdV; 
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
    } catch(e) { console.error("대시보드 데이터 연산 중 오류:", e); }
};

window.renderCharts = function(stats, monthlyCompleted, planData, actData) {
    try {
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
    } catch(e) { console.error("차트 렌더링 에러:", e); }
};
