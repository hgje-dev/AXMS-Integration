import { db } from './firebase.js';
import { collection, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let homeReqSnapshotUnsubscribe = null, homeProjSnapshotUnsubscribe = null, homeMdLogSnapshotUnsubscribe = null;
let chartInstances = {};

window.currentDashStats = {};
window.currentPeriodProjects = [];

const getSafeString = (val) => (val === null || val === undefined) ? '' : String(val);

window.loadHomeDashboards = function() {
    try {
        // 관리자 권한 확인 후 엑셀 다운로드 버튼 노출
        if (window.userProfile?.role === 'admin') {
            document.getElementById('btn-export-dash')?.classList.remove('hidden');
        }

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

        setTimeout(() => { if(!document.getElementById('period-value-month')?.value) window.changePeriodType(); }, 100);
    } catch(e) { console.error("대시보드 초기화 실패:", e); }
};

window.processDashboardData = function() {
    try {
        // 1. 기준 연도 동적 자동 생성
        let years = new Set(); const currentYear = new Date().getFullYear(); years.add(currentYear);
        (window.allDashProjects || []).forEach(p => { if(p.d_shipEst) years.add(parseInt(p.d_shipEst.substring(0,4))); if(p.d_shipEn) years.add(parseInt(p.d_shipEn.substring(0,4))); });
        (window.allDashMdLogs || []).forEach(l => { if(l.date) years.add(parseInt(l.date.substring(0,4))); });
        
        let yearArray = Array.from(years).filter(y => !isNaN(y) && y > 2000).sort((a,b) => a - b);
        const yearSelect = document.getElementById('dash-year-select');
        if (yearSelect) {
            const currentVal = yearSelect.value || currentYear.toString(); yearSelect.innerHTML = '';
            yearArray.forEach(y => { yearSelect.innerHTML += `<option value="${y}" ${y.toString() === currentVal ? 'selected' : ''}>${y}년</option>`; });
            if(yearSelect.value !== currentVal) yearSelect.value = currentVal;
        }

        const year = yearSelect?.value || currentYear.toString(); 
        let stats = { estMd: 0, curMd: 0, completed: 0, delayed: 0, pending: 0, progress: 0, inspecting: 0, rejected: 0 }; 
        let annualPlanData = Array(12).fill(0); let annualActData = Array(12).fill(0); let monthlyCompleted = Array(12).fill(0);
        let totalShipErrorDays = 0; let shipErrorCount = 0;

        (window.allDashProjects || []).forEach(data => {
            const shipEn = getSafeString(data.d_shipEn), shipEst = getSafeString(data.d_shipEst), status = getSafeString(data.status);
            let isInYear = (shipEn.startsWith(year) || shipEst.startsWith(year) || ['pending','progress','inspecting'].includes(status));
            if(!isInYear) return;
            stats[status] = (stats[status] || 0) + 1;
            if(shipEst.startsWith(year)) { let mIdx = parseInt(shipEst.split('-')[1]) - 1; if(mIdx >= 0 && mIdx < 12) annualPlanData[mIdx] += parseFloat(data.estMd) || 0; }
            if(status === 'completed' && (shipEn.startsWith(year) || shipEst.startsWith(year))) {
                stats.completed++; let targetDate = shipEn || shipEst;
                if(targetDate.startsWith(year)) { let mIdx = parseInt(targetDate.split('-')[1]) - 1; if(mIdx >= 0 && mIdx < 12) monthlyCompleted[mIdx]++; }
            }
            stats.estMd += parseFloat(data.estMd) || 0;
            if (status !== 'completed' && shipEst) { if ((new Date(shipEst) - new Date()) / (1000 * 60 * 60 * 24) <= 7) stats.delayed++; }
            if (shipEn && shipEst && status === 'completed') {
                const enD = new Date(shipEn), estD = new Date(shipEst);
                if (!isNaN(enD) && !isNaN(estD)) { totalShipErrorDays += (enD - estD) / (1000*60*60*24); shipErrorCount++; }
            }
        });

        (window.allDashMdLogs || []).forEach(log => { 
            const date = getSafeString(log.date); if(date.startsWith(year)) { let md = parseFloat(log.md) || 0; stats.curMd += md; let mIdx = parseInt(date.split('-')[1]) - 1; if(mIdx >= 0 && mIdx < 12) annualActData[mIdx] += md; } 
        });

        // 엑셀 추출용 글로벌 변수 저장
        window.currentDashStats = { year, ...stats, avgShipError: shipErrorCount > 0 ? Math.round(totalShipErrorDays / shipErrorCount) : 0 };

        if(document.getElementById('dash-team-count')) document.getElementById('dash-team-count').innerText = `${window.teamMembers?.length||0}명`;
        document.getElementById('dash-pd-completed').innerText = stats.completed;
        document.getElementById('dash-pd-delayed').innerText = stats.delayed;
        document.getElementById('dash-pd-estMd').innerText = stats.estMd.toFixed(1);
        document.getElementById('dash-pd-curMd').innerText = stats.curMd.toFixed(1);
        document.getElementById('dash-pd-variance').innerText = stats.estMd > 0 ? ((stats.curMd - stats.estMd) / stats.estMd * 100).toFixed(1) + '%' : '0%';
        document.getElementById('dash-pd-ship-error').innerText = window.currentDashStats.avgShipError;
        document.getElementById('dash-pd-workload').innerText = window.teamMembers?.length > 0 ? (stats.curMd / (window.teamMembers.length * 240) * 100).toFixed(1) + '%' : '0%';

        window.renderCharts(stats, monthlyCompleted, annualPlanData, annualActData);
        window.processPeriodData();
    } catch(e) { console.error("연간 데이터 연산 오류:", e); }
};

window.renderCharts = function(stats, monthlyCompleted, planData, actData) {
    const createChart = (id, type, data, options) => {
        const canvas = document.getElementById(id); if(!canvas) return;
        if(chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new Chart(canvas.getContext('2d'), { type, data, options });
    };

    // 🌟 파이 차트 고급화 (도넛 형태, 보더 라운딩 처리)
    createChart('projPieChart', 'doughnut', {
        labels: ['대기/보류', '제작중', '검수중', '완료', '불가'],
        datasets: [{ 
            data: [stats.pending||0, stats.progress||0, stats.inspecting||0, stats.completed||0, stats.rejected||0], 
            backgroundColor: ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#f43f5e'], 
            borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6 
        }]
    }, { cutout: '70%', maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } } });

    const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    createChart('projMonthlyChart', 'bar', { 
        labels: months, datasets: [{ label: '출하 완료', data: monthlyCompleted, backgroundColor: '#10b981', borderRadius: 6, maxBarThickness: 30 }] 
    }, { maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { dash: [4, 4] } } }, plugins: { legend: { display: false } } });

    // 🌟 라인 차트 고급화 (Gradient 배경 채우기, 라인 곡선)
    const ctx = document.getElementById('annualPlanVsActualChart')?.getContext('2d');
    let gradientPlan = ctx ? ctx.createLinearGradient(0, 0, 0, 300) : null;
    let gradientAct = ctx ? ctx.createLinearGradient(0, 0, 0, 300) : null;
    if(gradientPlan) { gradientPlan.addColorStop(0, 'rgba(203, 213, 225, 0.4)'); gradientPlan.addColorStop(1, 'rgba(203, 213, 225, 0)'); }
    if(gradientAct) { gradientAct.addColorStop(0, 'rgba(99, 102, 241, 0.4)'); gradientAct.addColorStop(1, 'rgba(99, 102, 241, 0)'); }

    createChart('annualPlanVsActualChart', 'line', { 
        labels: months, 
        datasets: [
            { label: '계획 MD', data: planData, borderColor: '#cbd5e1', backgroundColor: gradientPlan, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6 }, 
            { label: '실적 MD', data: actData, borderColor: '#6366f1', backgroundColor: gradientAct, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6 }
        ] 
    }, { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { dash: [4, 4] } } }, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } } });
};

window.changePeriodType = function() {
    const type = document.getElementById('period-type-select')?.value || 'month';
    const mInput = document.getElementById('period-value-month'), wInput = document.getElementById('period-value-week');
    if (type === 'month') { mInput.classList.remove('hidden'); wInput.classList.add('hidden'); if (!mInput.value) { const d = new Date(); mInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; } }
    else { mInput.classList.add('hidden'); wInput.classList.remove('hidden'); if (!wInput.value && window.getWeekString) wInput.value = window.getWeekString(new Date()); }
    window.processPeriodData();
};

window.processPeriodData = function() {
    const type = document.getElementById('period-type-select')?.value || 'month';
    const val = type === 'month' ? document.getElementById('period-value-month')?.value : document.getElementById('period-value-week')?.value;
    if (!val || !window.allDashProjects) return;

    let start = '', end = '';
    if (type === 'month') { const [y, m] = val.split('-'); start = `${val}-01`; end = `${val}-${new Date(y, m, 0).getDate()}`; }
    else { if(window.getDatesFromWeek) { const dates = window.getDatesFromWeek(val); start = window.getLocalDateStr(dates.start); end = window.getLocalDateStr(dates.end); } }

    let pending = 0, progress = 0, urgent = 0, periodMdTotal = 0, mgrCounts = {}; const list = [];
    (window.allDashProjects || []).forEach(p => {
        let relevant = (['pending','progress','inspecting'].includes(p.status) || (p.d_shipEn >= start && p.d_shipEn <= end) || (p.d_shipEst >= start && p.d_shipEst <= end));
        if (!relevant) return;
        let pMd = 0; (window.allDashMdLogs || []).forEach(l => { if (l.projectId === p.id && l.date >= start && l.date <= end) { pMd += parseFloat(l.md) || 0; periodMdTotal += parseFloat(l.md) || 0; } });
        if (p.status === 'pending') pending++; if (['progress','inspecting'].includes(p.status)) progress++;
        if (p.status !== 'completed' && p.d_shipEst) { if ((new Date(p.d_shipEst) - new Date()) / (1000*60*60*24) <= 7) urgent++; }
        if (p.manager && ['progress','inspecting'].includes(p.status)) mgrCounts[p.manager] = (mgrCounts[p.manager] || 0) + 1;
        list.push({ ...p, periodMd: pMd });
    });

    window.currentPeriodProjects = list;

    document.getElementById('pd-period-pending').innerText = pending; document.getElementById('pd-period-progress').innerText = progress; document.getElementById('pd-period-urgent').innerText = urgent;
    
    // 🌟 총 투입 공수 수치 업데이트
    if(document.getElementById('pd-period-total-md')) document.getElementById('pd-period-total-md').innerText = periodMdTotal.toFixed(1);

    const team = window.teamMembers?.length || 0;
    document.getElementById('pd-period-workload').innerText = team > 0 ? (periodMdTotal / (team * (type==='month'?20:5)) * 100).toFixed(1) + '%' : '0%';

    const tbody = document.getElementById('period-table-body');
    if(tbody) {
        tbody.innerHTML = list.sort((a,b) => b.periodMd - a.periodMd).map(p => {
            const statusMap = { 'pending':'대기/보류', 'progress':'진행중', 'inspecting':'검수중', 'completed':'완료', 'rejected':'불가' };
            return `<tr class="hover:bg-slate-50 border-b">
                <td class="p-2 text-center">${p.part||'-'}</td><td class="p-2 text-center font-bold text-indigo-700">${p.code||'-'}</td>
                <td class="p-2 font-bold truncate max-w-[160px]" title="${p.name||'-'}">${p.name||'-'}</td><td class="p-2 text-center text-rose-500">${p.d_shipEst||'-'}</td>
                <td class="p-2 text-center text-emerald-600 font-bold">${p.progress||0}%</td><td class="p-2 text-center text-slate-500">${statusMap[p.status]||p.status}</td>
                <td class="p-2 text-center">${p.estMd||0}</td><td class="p-2 text-center font-black text-indigo-600 bg-indigo-50/30">${p.periodMd.toFixed(1)}</td>
                <td class="p-2 text-center text-purple-600 font-bold">${p.finalMd||0}</td><td class="p-2 text-center font-bold">${(parseFloat(p.finalMd||0) - parseFloat(p.estMd||0)).toFixed(1)}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="10" class="text-center p-6 text-slate-400 font-bold">내역 없음</td></tr>';
        document.getElementById('period-table-count').innerText = `총 ${list.length}건`;
    }
    renderPeriodCharts(type, val, list, mgrCounts, periodMdTotal);
};

function renderPeriodCharts(type, val, projects, mgrCounts, periodMdTotal) {
    const createChart = (id, cType, data, options) => {
        const canvas = document.getElementById(id); if(!canvas) return;
        if(chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new Chart(canvas.getContext('2d'), { type: cType, data, options });
    };

    let labels = [], data = [];
    if (type === 'month') { labels = ['1주','2주','3주','4주','5주','6주']; data = [0,0,0,0,0,0]; projects.forEach(p => { if (p.status === 'completed' && p.d_shipEn?.startsWith(val)) { data[Math.min(5, Math.floor((parseInt(p.d_shipEn.split('-')[2])-1)/7))]++; } }); }
    else { labels = ['월','화','수','목','금']; data = [0,0,0,0,0]; projects.forEach(p => { if (p.status === 'completed' && p.d_shipEn) { const d = new Date(p.d_shipEn).getDay()-1; if(d>=0 && d<5) data[d]++; } }); }
    
    // 주차별 선그래프 곡선화
    createChart('periodChart1', 'line', { labels, datasets: [{ label: '완료 건수', data, borderColor: '#10b981', backgroundColor: '#10b981', tension: 0.4, borderWidth: 3, pointRadius: 4 }] }, { maintainAspectRatio: false, scales: { x:{grid:{display:false}}, y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } } }, plugins: { legend: { display: false } } });
    
    let est = 0; projects.forEach(p => est += parseFloat(p.estMd) || 0);
    createChart('periodChart2', 'bar', { labels: ['현재 기간'], datasets: [{ label: '계획 MD', data: [est], backgroundColor: '#cbd5e1', borderRadius: 6 }, { label: '실적 MD', data: [periodMdTotal], backgroundColor: '#6366f1', borderRadius: 6 }] }, { maintainAspectRatio: false, scales: { x:{grid:{display:false}}, y: { beginAtZero: true, border: { dash: [4, 4] } } }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } } });

    let mgrL = Object.keys(mgrCounts), mgrD = Object.values(mgrCounts);
    createChart('periodChart3', 'bar', { labels: mgrL.length?mgrL:['없음'], datasets: [{ label: '진행중 PJT', data: mgrD.length?mgrD:[0], backgroundColor: '#8b5cf6', borderRadius: 6 }] }, { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } }, y:{grid:{display:false}} }, plugins: { legend: { display: false } } });
}

// ==========================================
// 🌟 관리자 전용 대시보드 엑셀 추출 기능
// ==========================================
window.exportDashboardExcel = async function() {
    if (window.userProfile?.role !== 'admin') return window.showToast('보고서 다운로드는 관리자만 가능합니다.', 'error');
    if (typeof ExcelJS === 'undefined') return window.showToast("ExcelJS 모듈이 로드되지 않았습니다.", "error");

    try {
        window.showToast("엑셀 파일을 생성 중입니다...", "success");
        const wb = new ExcelJS.Workbook();
        
        // 시트 1: 연간 현황 요약
        const ws1 = wb.addWorksheet('연간_현황_요약', {views: [{showGridLines: false}]});
        ws1.columns = [{ width: 25 }, { width: 20 }];
        
        ws1.getCell('A1').value = `[${window.currentDashStats.year}년] 프로젝트 연간 현황 요약`;
        ws1.getCell('A1').font = { bold: true, size: 14 };
        ws1.getCell('A1').fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFE2E8F0'} };
        
        const summaryData = [
            ['지표', '수치'],
            ['완료(출하) 건수', window.currentDashStats.completed + '건'],
            ['대기/보류 건수', window.currentDashStats.pending + '건'],
            ['진행중/검수중 건수', (window.currentDashStats.progress + window.currentDashStats.inspecting) + '건'],
            ['지연 위험 건수', window.currentDashStats.delayed + '건'],
            ['총 예정 공수', window.currentDashStats.estMd.toFixed(1) + ' MD'],
            ['총 투입 공수', window.currentDashStats.curMd.toFixed(1) + ' MD'],
            ['목표대비 출하 평균 오차', window.currentDashStats.avgShipError + ' 일']
        ];
        
        summaryData.forEach((row, i) => {
            let r = ws1.addRow(row);
            if (i === 0) { r.font = {bold: true}; r.fill = {type: 'pattern', pattern:'solid', fgColor:{argb:'FFF1F5F9'}}; }
            r.eachCell(c => { c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; });
        });

        // 시트 2: 기간별 프로젝트 목록 상세
        const periodTypeStr = document.getElementById('period-type-select')?.value === 'month' ? document.getElementById('period-value-month')?.value : document.getElementById('period-value-week')?.value;
        const ws2 = wb.addWorksheet('조회기간_프로젝트상세', {views: [{showGridLines: false}]});
        ws2.columns = [{ width: 10 }, { width: 15 }, { width: 40 }, { width: 15 }, { width: 10 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 12 }, { width: 10 }];
        
        ws2.getCell('A1').value = `[${periodTypeStr}] 조회 기간 프로젝트 리스트`;
        ws2.getCell('A1').font = { bold: true, size: 14 };
        ws2.getCell('A1').fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFE0E7FF'} };

        const headers = ['파트', 'PJT 코드', '프로젝트명', '예정출하일', '진행률(%)', '현재상태', '예정MD', '기간내 투입MD', '최종MD', '편차'];
        let hr = ws2.addRow(headers);
        hr.font = {bold: true, color: {argb: 'FFFFFFFF'}}; hr.fill = {type: 'pattern', pattern:'solid', fgColor:{argb:'FF4F46E5'}};
        hr.eachCell(c => { c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; c.alignment = {horizontal: 'center'}; });

        const statusMap = { 'pending':'대기/보류', 'progress':'진행중', 'inspecting':'검수중', 'completed':'완료', 'rejected':'불가' };
        window.currentPeriodProjects.sort((a,b) => b.periodMd - a.periodMd).forEach(p => {
            let row = ws2.addRow([
                p.part || '-', p.code || '-', p.name || '-', p.d_shipEst || '-', 
                p.progress || 0, statusMap[p.status] || p.status, 
                p.estMd || 0, parseFloat(p.periodMd).toFixed(1), p.finalMd || 0, 
                (parseFloat(p.finalMd||0) - parseFloat(p.estMd||0)).toFixed(1)
            ]);
            row.eachCell(c => { c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; });
        });

        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `AXMS_대시보드_보고서_${new Date().toISOString().split('T')[0]}.xlsx`);
        
    } catch (e) {
        console.error(e);
        window.showToast("엑셀 파일 생성 중 오류가 발생했습니다.", "error");
    }
};
