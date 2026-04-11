import { db } from './firebase.js';
import { collection, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let homeReqSnapshotUnsubscribe = null, homeProjSnapshotUnsubscribe = null, homeMdLogSnapshotUnsubscribe = null;
let chartInstances = {};

const getSafeString = (val) => {
    if (val === null || val === undefined) return '';
    return String(val);
};

window.loadHomeDashboards = function() {
    try {
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

        // 기간별 대시보드 기본값 세팅 트리거 (첫 로드 시)
        setTimeout(() => {
            if(!document.getElementById('period-value-month')?.value) {
                window.changePeriodType();
            }
        }, 100);

    } catch(e) { console.error("대시보드 초기화 실패:", e); }
};

window.processDashboardData = function() {
    try {
        // ==========================================
        // 1. 기준 연도 동적 자동 생성 로직
        // ==========================================
        let years = new Set();
        const currentYear = new Date().getFullYear();
        years.add(currentYear); // 현재 년도는 무조건 포함

        (window.allDashProjects || []).forEach(p => {
            if(p.d_shipEst) years.add(parseInt(p.d_shipEst.substring(0,4)));
            if(p.d_shipEn) years.add(parseInt(p.d_shipEn.substring(0,4)));
        });
        (window.allDashMdLogs || []).forEach(l => {
            if(l.date) years.add(parseInt(l.date.substring(0,4)));
        });
        
        // 유효한 연도만 필터링 후 오름차순 정렬
        let yearArray = Array.from(years).filter(y => !isNaN(y) && y > 2000).sort((a,b) => a - b);
        const yearSelect = document.getElementById('dash-year-select');
        
        if (yearSelect) {
            const currentVal = yearSelect.value || currentYear.toString();
            yearSelect.innerHTML = '';
            yearArray.forEach(y => {
                yearSelect.innerHTML += `<option value="${y}" ${y.toString() === currentVal ? 'selected' : ''}>${y}년</option>`;
            });
            // 옵션이 재생성되면서 선택값이 풀렸을 경우를 대비해 다시 지정
            if(yearSelect.value !== currentVal) yearSelect.value = currentVal;
        }

        // ==========================================
        // 2. 연간 대시보드 데이터 연산
        // ==========================================
        const year = yearSelect?.value || currentYear.toString(); 
        let stats = { estMd: 0, curMd: 0, completed: 0, delayed: 0, pending: 0, progress: 0, inspecting: 0, rejected: 0 }; 
        let annualPlanData = Array(12).fill(0); 
        let annualActData = Array(12).fill(0);
        let monthlyCompleted = Array(12).fill(0);

        let totalShipErrorDays = 0;
        let shipErrorCount = 0;

        (window.allDashProjects || []).forEach(data => {
            const shipEn = getSafeString(data.d_shipEn);
            const shipEst = getSafeString(data.d_shipEst);
            const status = getSafeString(data.status);

            let isInYear = false;
            if(shipEn && shipEn.startsWith(year)) isInYear = true;
            if(shipEst && shipEst.startsWith(year)) isInYear = true;
            if(status === 'pending' || status === 'progress' || status === 'inspecting' || status === 'rejected') isInYear = true;
            
            if(!isInYear) return;

            stats[status] = (stats[status] || 0) + 1;
            
            if(shipEst && shipEst.startsWith(year)) { 
                let mIdx = parseInt(shipEst.split('-')[1]) - 1; 
                if(mIdx >= 0 && mIdx < 12) annualPlanData[mIdx] += parseFloat(data.estMd) || 0; 
            }

            if(status === 'completed' && (shipEn.startsWith(year) || shipEst.startsWith(year))) {
                stats.completed++;
                const targetDate = shipEn || shipEst;
                if(targetDate && targetDate.startsWith(year)) {
                    let mIdx = parseInt(targetDate.split('-')[1]) - 1;
                    if(mIdx >= 0 && mIdx < 12) monthlyCompleted[mIdx]++;
                }
            }

            stats.estMd += parseFloat(data.estMd) || 0;
            
            if (status !== 'completed' && shipEst) {
                const diffDays = (new Date(shipEst) - new Date()) / (1000 * 60 * 60 * 24);
                if (diffDays <= 7) stats.delayed++;
            }

            if (shipEn && shipEst && status === 'completed') {
                const enDate = new Date(shipEn);
                const estDate = new Date(shipEst);
                if (!isNaN(enDate) && !isNaN(estDate)) {
                    const diff = (enDate - estDate) / (1000 * 60 * 60 * 24);
                    totalShipErrorDays += diff;
                    shipErrorCount++;
                }
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

        // UI 데이터 바인딩
        const teamCount = window.teamMembers ? window.teamMembers.length : 0;
        if(document.getElementById('dash-team-count')) document.getElementById('dash-team-count').innerText = `${teamCount}명`;

        if(document.getElementById('dash-pd-completed')) document.getElementById('dash-pd-completed').innerText = stats.completed;
        if(document.getElementById('dash-pd-delayed')) document.getElementById('dash-pd-delayed').innerText = stats.delayed;
        if(document.getElementById('dash-pd-estMd')) document.getElementById('dash-pd-estMd').innerText = stats.estMd.toFixed(1);
        if(document.getElementById('dash-pd-curMd')) document.getElementById('dash-pd-curMd').innerText = stats.curMd.toFixed(1);
        
        let varianceStr = '0%';
        if(stats.estMd > 0) {
            const variance = ((stats.curMd - stats.estMd) / stats.estMd * 100).toFixed(1);
            varianceStr = variance > 0 ? `+${variance}%` : `${variance}%`;
        }
        if(document.getElementById('dash-pd-variance')) document.getElementById('dash-pd-variance').innerText = varianceStr;

        let avgShipError = 0;
        if (shipErrorCount > 0) avgShipError = Math.round(totalShipErrorDays / shipErrorCount);
        if(document.getElementById('dash-pd-ship-error')) document.getElementById('dash-pd-ship-error').innerText = avgShipError > 0 ? `+${avgShipError}` : avgShipError;

        let workload = 0;
        if (teamCount > 0) {
            const totalAvailableMD = teamCount * 240; 
            workload = (stats.curMd / totalAvailableMD) * 100;
        }
        if(document.getElementById('dash-pd-workload')) document.getElementById('dash-pd-workload').innerText = workload.toFixed(1) + '%';

        window.renderCharts(stats, monthlyCompleted, annualPlanData, annualActData);

        // 연간 처리 후 기간별 데이터도 갱신
        if(window.processPeriodData) window.processPeriodData();

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
            labels: ['대기/보류', '제작중', '검수중', '완료', '불가'],
            datasets: [{ 
                data: [stats.pending||0, stats.progress||0, stats.inspecting||0, stats.completed||0, stats.rejected||0], 
                backgroundColor: ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#f43f5e'],
                borderWidth: 0, hoverOffset: 4
            }]
        }, { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: {size: 11} } } } });

        const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
        createChart('projMonthlyChart', 'bar', {
            labels: months,
            datasets: [{ label: '출하 완료(건)', data: monthlyCompleted, backgroundColor: '#10b981', borderRadius: 4, maxBarThickness: 40 }]
        }, { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } });

        createChart('annualPlanVsActualChart', 'line', {
            labels: months,
            datasets: [
                { label: '계획 MD', data: planData, borderColor: '#cbd5e1', backgroundColor: '#cbd5e1', tension: 0.3, pointBackgroundColor: '#cbd5e1' },
                { label: '실적 MD', data: actData, borderColor: '#6366f1', backgroundColor: '#6366f1', tension: 0.3, pointBackgroundColor: '#6366f1' }
            ]
        }, { maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'top', align: 'center', labels: { usePointStyle: true, boxWidth: 8 } } } });
    } catch(e) { console.error("차트 렌더링 에러:", e); }
};

// ==========================================
// 3. 기간별 (월간/주간) 대시보드 로직
// ==========================================

window.changePeriodType = function() {
    const type = document.getElementById('period-type-select')?.value || 'month';
    const mInput = document.getElementById('period-value-month');
    const wInput = document.getElementById('period-value-week');
    
    if (type === 'month') {
        mInput.classList.remove('hidden'); 
        wInput.classList.add('hidden');
        if (!mInput.value) {
            const d = new Date();
            mInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        }
        if(document.getElementById('th-period-md')) document.getElementById('th-period-md').innerText = '해당월 투입MD';
    } else {
        mInput.classList.add('hidden'); 
        wInput.classList.remove('hidden');
        if (!wInput.value && window.getWeekString) {
            wInput.value = window.getWeekString(new Date());
        }
        if(document.getElementById('th-period-md')) document.getElementById('th-period-md').innerText = '해당주 투입MD';
    }
    window.processPeriodData();
};

window.processPeriodData = function() {
    if (!window.allDashProjects) return;

    const type = document.getElementById('period-type-select')?.value || 'month';
    const val = type === 'month' ? document.getElementById('period-value-month')?.value : document.getElementById('period-value-week')?.value;
    if (!val) return;

    let startDateStr = '', endDateStr = '';
    if (type === 'month') {
        startDateStr = `${val}-01`;
        const [y, m] = val.split('-');
        const lastDay = new Date(y, m, 0).getDate();
        endDateStr = `${val}-${lastDay}`;
    } else {
        if(window.getDatesFromWeek) {
            const dates = window.getDatesFromWeek(val);
            startDateStr = window.getLocalDateStr(dates.start);
            endDateStr = window.getLocalDateStr(dates.end);
        }
    }

    let pending = 0, progress = 0, urgent = 0;
    let periodMdTotal = 0;
    let managerCounts = {};
    const filteredProjects = [];

    (window.allDashProjects || []).forEach(p => {
        let isRelevant = false;
        // 상태가 진행 중이거나, 기간 안에 일정이 걸쳐있는 경우 대상에 포함
        if (p.status === 'pending' || p.status === 'progress' || p.status === 'inspecting') isRelevant = true;
        if (p.d_shipEn && p.d_shipEn >= startDateStr && p.d_shipEn <= endDateStr) isRelevant = true;
        if (p.d_shipEst && p.d_shipEst >= startDateStr && p.d_shipEst <= endDateStr) isRelevant = true;
        
        if (!isRelevant) return;

        let pPeriodMd = 0;
        (window.allDashMdLogs || []).forEach(l => {
            if (l.projectId === p.id && l.date >= startDateStr && l.date <= endDateStr) {
                pPeriodMd += parseFloat(l.md) || 0;
                periodMdTotal += parseFloat(l.md) || 0;
            }
        });

        if (p.status === 'pending') pending++;
        if (p.status === 'progress' || p.status === 'inspecting') progress++;

        const todayStr = window.getLocalDateStr(new Date());
        if (p.status !== 'completed' && p.status !== 'rejected' && p.d_shipEst) {
            const diffDays = (new Date(p.d_shipEst) - new Date(todayStr)) / (1000*60*60*24);
            if (diffDays >= 0 && diffDays <= 7) urgent++;
        }

        if (p.manager && (p.status === 'progress' || p.status === 'inspecting')) {
            managerCounts[p.manager] = (managerCounts[p.manager] || 0) + 1;
        }

        filteredProjects.push({ ...p, periodMd: pPeriodMd });
    });

    if(document.getElementById('pd-period-pending')) document.getElementById('pd-period-pending').innerText = pending;
    if(document.getElementById('pd-period-progress')) document.getElementById('pd-period-progress').innerText = progress;
    if(document.getElementById('pd-period-urgent')) document.getElementById('pd-period-urgent').innerText = urgent;
    
    const teamCount = window.teamMembers ? window.teamMembers.length : 0;
    let workDays = type === 'month' ? 20 : 5; // 한달 20일 / 한주 5일 기준
    let workload = 0;
    if (teamCount > 0) workload = (periodMdTotal / (teamCount * workDays)) * 100;
    if(document.getElementById('pd-period-workload')) document.getElementById('pd-period-workload').innerText = workload.toFixed(1) + '%';

    const tbody = document.getElementById('period-table-body');
    if(tbody) {
        if (filteredProjects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center p-6 text-slate-400 font-bold">해당 기간에 진행된 내역이 없습니다.</td></tr>`;
            document.getElementById('period-table-count').innerText = `총 0건`;
        } else {
            const statusMap = { 'pending':'대기/보류', 'progress':'진행중', 'inspecting':'검수중', 'completed':'완료', 'rejected':'불가' };
            tbody.innerHTML = filteredProjects.sort((a,b) => b.periodMd - a.periodMd).map(p => {
                let variance = parseFloat(p.finalMd||0) - parseFloat(p.estMd||0);
                let varStr = variance > 0 ? `<span class="text-rose-500 font-bold">+${variance.toFixed(1)}</span>` : `<span class="text-slate-500">${variance.toFixed(1)}</span>`;
                return `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="p-2 text-center">${p.part||'-'}</td>
                    <td class="p-2 text-center font-bold text-indigo-700">${p.code||'-'}</td>
                    <td class="p-2 truncate max-w-[150px] font-bold" title="${p.name}">${p.name||'-'}</td>
                    <td class="p-2 text-center text-rose-500 font-bold">${p.d_shipEst||'-'}</td>
                    <td class="p-2 text-center text-emerald-600 font-bold">${p.progress||0}%</td>
                    <td class="p-2 text-center text-xs font-bold text-slate-600">${statusMap[p.status]||p.status}</td>
                    <td class="p-2 text-center">${p.estMd||0}</td>
                    <td class="p-2 text-center font-black text-indigo-600 bg-indigo-50/30">${p.periodMd.toFixed(1)}</td>
                    <td class="p-2 text-center text-purple-600 font-bold">${p.finalMd||0}</td>
                    <td class="p-2 text-center">${varStr}</td>
                </tr>`;
            }).join('');
            document.getElementById('period-table-count').innerText = `총 ${filteredProjects.length}건`;
        }
    }

    renderPeriodCharts(type, val, filteredProjects, managerCounts, periodMdTotal);
};

function renderPeriodCharts(type, val, projects, managerCounts, periodMdTotal) {
    const createChart = (id, cType, data, options) => {
        const canvas = document.getElementById(id);
        if(!canvas) return;
        if(chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new Chart(canvas.getContext('2d'), { type: cType, data, options });
    };

    let labels1 = [], data1 = [];
    if (type === 'month') {
        labels1 = ['1주차','2주차','3주차','4주차','5주차', '6주차'];
        data1 = [0,0,0,0,0,0];
        projects.forEach(p => {
            if (p.status === 'completed' && p.d_shipEn && p.d_shipEn.startsWith(val)) {
                let d = parseInt(p.d_shipEn.split('-')[2]);
                let w = Math.floor((d-1)/7);
                if (w > 5) w = 5;
                data1[w]++;
            }
        });
        if(document.getElementById('chart-title-1')) document.getElementById('chart-title-1').innerText = '주차별 완료(출하) 추이';
    } else {
        labels1 = ['월','화','수','목','금'];
        data1 = [0,0,0,0,0];
        projects.forEach(p => {
            if (p.status === 'completed' && p.d_shipEn) {
                // 주간 조회시 해당 요일(1~5) 찾아서 넣기
                const shipD = new Date(p.d_shipEn);
                const dayIdx = shipD.getDay() - 1; 
                if(dayIdx >= 0 && dayIdx < 5) data1[dayIdx]++;
            }
        });
        if(document.getElementById('chart-title-1')) document.getElementById('chart-title-1').innerText = '요일별 완료(출하) 추이';
    }

    createChart('periodChart1', 'line', {
        labels: labels1,
        datasets: [{ label: '완료 건수', data: data1, borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.1, pointRadius: 4 }]
    }, { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } });

    let estTotal = 0;
    projects.forEach(p => { estTotal += parseFloat(p.estMd) || 0; });
    createChart('periodChart2', 'bar', {
        labels: ['이번 ' + (type === 'month' ? '달' : '주')],
        datasets: [
            { label: '계획 MD', data: [estTotal], backgroundColor: '#cbd5e1', borderRadius: 4 },
            { label: '실적 MD', data: [periodMdTotal], backgroundColor: '#6366f1', borderRadius: 4 }
        ]
    }, { maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } } });

    let mgrLabels = Object.keys(managerCounts);
    let mgrData = Object.values(managerCounts);
    createChart('periodChart3', 'bar', {
        labels: mgrLabels.length > 0 ? mgrLabels : ['데이터 없음'],
        datasets: [{ label: '진행 PJT 수', data: mgrData.length > 0 ? mgrData : [0], backgroundColor: '#8b5cf6', borderRadius: 4, barThickness: 20 }]
    }, { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } });
}
