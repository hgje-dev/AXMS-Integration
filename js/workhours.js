import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let worklogsUnsubscribe = null;
window.currentWorkLogs = [];
window.whStatMode = 'week';
window.whViewMode = 'grid';
window.whPjtSearch = '';
window.whFilters = { text: '', loc: '', type: '', status: '' };
window.whSelectedCells = new Set();
window.isWhDragging = false;
window.whCharts = {};

const WH_TYPES = ['조립', '검수', '설치', 'Setup', '협업', '공통', '기타'];
const WH_LOCS = ['사내', '국내', '해외'];
const DRIVE_EXPORT_FOLDER = '1x8atDi95ybFH-YOYkfiaISw7BHdckQX4';

const KR_HOLIDAYS = new Set([
    '2024-01-01', '2024-02-09', '2024-02-12', '2024-03-01', '2024-04-10', '2024-05-06', '2024-05-15', '2024-06-06', '2024-08-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-10-03', '2024-10-09', '2024-12-25',
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-09', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25'
]);
function isWhHoliday(d) {
    if (d.getDay() === 0 || d.getDay() === 6) return true;
    return KR_HOLIDAYS.has(window.getLocalDateStr(d));
}

window.updateWhWeekDisplay = function(weekStr) {
    if(!weekStr) return;
    const { start } = window.getDatesFromWeek(weekStr);
    const thu = new Date(start);
    thu.setDate(thu.getDate() + 3); 
    const year = thu.getFullYear();
    const month = thu.getMonth() + 1;
    
    const firstDayOfMonth = new Date(year, month - 1, 1);
    let offset = firstDayOfMonth.getDay() - 1; 
    if(offset === -1) offset = 6; 
    const weekNum = Math.ceil((thu.getDate() + offset) / 7);
    
    const displayEl = document.getElementById('wh-week-display');
    if (displayEl) displayEl.innerText = `${year}년 ${month}월 ${weekNum}주`;
};

window.toggleWhDashboard = function() {
    const content = document.getElementById('wh-dashboard-content');
    const btn = document.getElementById('wh-dash-toggle-btn');
    if (!content || !btn) return;
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        btn.innerHTML = '대시보드 숨기기 <i class="fa-solid fa-chevron-up"></i>';
    } else {
        content.classList.add('hidden');
        btn.innerHTML = '대시보드 보이기 <i class="fa-solid fa-chevron-down"></i>';
    }
};

window.loadWorkhoursData = function() {
    const picker = document.getElementById('wh-week-picker');
    if (!picker) return;
    
    if (!picker.value) {
        if(window.getWeekString) picker.value = window.getWeekString(new Date());
        else picker.value = "2026-W15";
    }
    
    window.updateWhWeekDisplay(picker.value);
    fetchWorkLogsForContext();
};

window.changeWhWeek = function(offset) {
    const picker = document.getElementById('wh-week-picker');
    if (!picker) return;
    
    const parts = picker.value.split('-W');
    if (parts.length === 2) {
        const year = parseInt(parts[0]);
        const week = parseInt(parts[1]);
        const d = new Date(year, 0, (week + offset - 1) * 7 + 1);
        if (window.getWeekString) {
            picker.value = window.getWeekString(d);
            window.updateWhWeekDisplay(picker.value);
            window.loadWorkhoursData();
        }
    }
};

function fetchWorkLogsForContext() {
    if (worklogsUnsubscribe) worklogsUnsubscribe();

    const picker = document.getElementById('wh-week-picker');
    const { start } = window.getDatesFromWeek(picker.value);
    
    const y = start.getFullYear();
    const m = start.getMonth();
    
    const fetchStart = new Date(y, m - 1, 1);
    const fetchEnd = new Date(y, m + 2, 0);

    const startStr = window.getLocalDateStr(fetchStart);
    const endStr = window.getLocalDateStr(fetchEnd);

    const q = query(collection(db, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
    
    worklogsUnsubscribe = onSnapshot(q, (snapshot) => {
        window.currentWorkLogs = [];
        snapshot.forEach(doc => window.currentWorkLogs.push({ id: doc.id, ...doc.data() }));
        window.updateWhDashboard();
        window.renderWhView();
    });
}

window.setWhStatMode = function(mode) {
    window.whStatMode = mode;
    const btnW = document.getElementById('wh-btn-period-week');
    const btnM = document.getElementById('wh-btn-period-month');
    
    if(mode === 'week') {
        if(btnW) btnW.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all';
        if(btnM) btnM.className = 'px-4 py-1.5 text-xs font-bold text-slate-600 bg-transparent transition-all hover:bg-slate-100 rounded-full';
        document.getElementById('wh-dash-period-label').innerHTML = '주간 총 투입 <span class="text-[9px] font-normal">(승인완료)</span>';
        document.getElementById('wh-chart-trend-title').innerText = '일자별 투입 추이 (MD)';
    } else {
        if(btnM) btnM.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all';
        if(btnW) btnW.className = 'px-4 py-1.5 text-xs font-bold text-slate-600 bg-transparent transition-all hover:bg-slate-100 rounded-full';
        document.getElementById('wh-dash-period-label').innerHTML = '월간 총 투입 <span class="text-[9px] font-normal">(승인완료)</span>';
        document.getElementById('wh-chart-trend-title').innerText = '주차별 투입 추이 (MD)';
    }
    window.updateWhDashboard();
};

window.setWhViewMode = function(mode) {
    window.whViewMode = mode;
    const btnG = document.getElementById('wh-btn-grid');
    const btnC = document.getElementById('wh-btn-calendar');
    
    if(mode === 'grid') {
        if(btnG) btnG.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5';
        if(btnC) btnC.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent';
        document.getElementById('wh-view-grid').classList.remove('hidden');
        document.getElementById('wh-view-calendar').classList.add('hidden');
    } else {
        if(btnC) btnC.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5';
        if(btnG) btnG.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent';
        document.getElementById('wh-view-grid').classList.add('hidden');
        document.getElementById('wh-view-calendar').classList.remove('hidden');
    }
    window.renderWhView();
};

window.applyWhFilters = function() {
    window.whFilters.text = document.getElementById('wh-filter-text').value.toLowerCase();
    window.whFilters.loc = document.getElementById('wh-filter-loc').value;
    window.whFilters.type = document.getElementById('wh-filter-type').value;
    window.whFilters.status = document.getElementById('wh-filter-status').value;
    
    const hasFilter = window.whFilters.text || window.whFilters.loc || window.whFilters.type || window.whFilters.status;
    document.getElementById('wh-btn-reset-filter').classList.toggle('hidden', !hasFilter);
    window.renderWhView();
};

window.resetWhFilters = function() {
    document.getElementById('wh-filter-text').value = '';
    document.getElementById('wh-filter-loc').value = '';
    document.getElementById('wh-filter-type').value = '';
    document.getElementById('wh-filter-status').value = '';
    window.applyWhFilters();
};

window.updateWhDashboard = function() {
    window.whPjtSearch = document.getElementById('wh-search-pjt')?.value.toLowerCase() || '';
    
    const picker = document.getElementById('wh-week-picker');
    const { start, end } = window.getDatesFromWeek(picker.value);
    
    let targetStart = start;
    let targetEnd = end;

    if(window.whStatMode === 'month') {
        const y = start.getFullYear();
        const m = start.getMonth();
        targetStart = new Date(y, m, 1);
        targetEnd = new Date(y, m + 1, 0);
    }

    const tStartStr = window.getLocalDateStr(targetStart);
    const tEndStr = window.getLocalDateStr(targetEnd);

    let baseData = window.currentWorkLogs.filter(l => l.isConfirmed && l.date >= tStartStr && l.date <= tEndStr);
    
    if (window.whPjtSearch) {
        baseData = baseData.filter(l => {
            const pName = (l.projectName || '').toLowerCase();
            const pCode = (l.projectCode || '').toLowerCase();
            const search = window.whPjtSearch;
            return pName.includes(search) || pCode.includes(search) || (window.matchString && window.matchString(search, pName)) || (window.matchString && window.matchString(search, pCode));
        });
    }

    let totalHours = 0;
    let personMap = {}, typeMap = {}, trendMap = {}, locMap = {}, pjtMap = {};
    let datesSet = new Set();

    baseData.forEach(log => {
        let h = parseFloat(log.hours) || 0;
        totalHours += h;
        
        personMap[log.authorName] = (personMap[log.authorName] || 0) + h;
        typeMap[log.workType] = (typeMap[log.workType] || 0) + h;
        
        let trendKey = '';
        if (window.whStatMode === 'week') {
            const d = new Date(log.date);
            const days = ['일','월','화','수','목','금','토'];
            trendKey = `${d.getDate()}일(${days[d.getDay()]})`;
        } else {
            const d = new Date(log.date);
            trendKey = window.getWeekString ? window.getWeekString(d).split('-')[1] + '주차' : log.date;
        }
        trendMap[trendKey] = (trendMap[trendKey] || 0) + h;

        let loc = log.location || '사내';
        if (!locMap[loc]) locMap[loc] = new Set();
        locMap[loc].add(log.authorName);

        let pName = log.projectName || log.projectCode || '분류 안됨';
        pjtMap[pName] = (pjtMap[pName] || 0) + h;
        datesSet.add(log.date);
    });

    const totalMD = (totalHours / 8).toFixed(1);
    document.getElementById('wh-dash-total-md').innerText = totalMD;

    const pjtInfoContainer = document.getElementById('wh-dash-pjt-info');
    const pjtDateEl = document.getElementById('wh-dash-pjt-date');
    const pjtDaysEl = document.getElementById('wh-dash-pjt-days');

    if (window.whPjtSearch && datesSet.size > 0) {
        let sortedDates = Array.from(datesSet).sort();
        let sD = sortedDates[0], eD = sortedDates[sortedDates.length-1];
        let diffDays = Math.ceil((new Date(eD) - new Date(sD)) / (1000 * 60 * 60 * 24)) + 1;
        
        pjtDateEl.innerText = `${sD} ~ ${eD}`;
        pjtDaysEl.innerText = `총 작업일수: ${datesSet.size}일 (기간: ${diffDays}일)`;
        pjtInfoContainer.classList.remove('hidden');
    } else {
        pjtInfoContainer.classList.add('hidden');
    }

    renderWhChart('wh-chart-person', 'bar', personMap, 'MD', true);
    renderWhChart('wh-chart-type', 'bar', typeMap, 'MD', true);
    renderWhChart('wh-chart-trend', window.whStatMode === 'week' ? 'bar' : 'line', trendMap, 'MD', false);

    let extraHtml = '';
    for(let l in locMap) {
        extraHtml += `<div class="bg-slate-50 p-2 rounded-lg border border-slate-100 flex justify-between items-center"><span class="text-indigo-600 font-black"><i class="fa-solid fa-location-dot"></i> ${l}</span> <span class="font-bold text-slate-700 bg-white px-2 py-0.5 rounded shadow-sm">${locMap[l].size}명 투입</span></div>`;
    }
    extraHtml += `<div class="border-t border-slate-200 my-3"></div><div class="font-black text-slate-700 mb-2">🔥 최다 투입 PJT (Top 5)</div>`;
    let topPjts = Object.entries(pjtMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
    topPjts.forEach((p, i) => {
        extraHtml += `<div class="truncate mb-1.5 flex justify-between items-center"><span class="text-slate-500 font-bold truncate pr-2"><span class="text-slate-400 mr-1">${i+1}.</span>${p[0]}</span> <span class="font-black text-purple-600 shrink-0">${(p[1]/8).toFixed(1)}MD</span></div>`;
    });
    document.getElementById('wh-dash-extra').innerHTML = extraHtml || '<div class="text-center text-slate-400 py-4 font-bold">데이터 없음</div>';
};

function renderWhChart(canvasId, type, dataMap, unit, isHorizontal) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (window.whCharts[canvasId]) {
        window.whCharts[canvasId].destroy();
    }

    let sortedData = Object.entries(dataMap);
    if (isHorizontal) sortedData.sort((a,b)=>b[1]-a[1]);
    else sortedData.sort((a,b)=>a[0].localeCompare(b[0]));

    if (sortedData.length > 5 && isHorizontal) sortedData = sortedData.slice(0, 5);

    const labels = sortedData.map(d => d[0]);
    const data = sortedData.map(d => (d[1]/8).toFixed(1)); 

    let bgGradient = ctx.createLinearGradient(0, 0, isHorizontal ? 300 : 0, isHorizontal ? 0 : 300);
    bgGradient.addColorStop(0, 'rgba(99, 102, 241, 0.85)'); 
    bgGradient.addColorStop(1, 'rgba(168, 85, 247, 0.5)');  
    
    let datasetConfig = {
        data: data,
        backgroundColor: type === 'line' ? 'rgba(99, 102, 241, 0.1)' : bgGradient,
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: type === 'line' ? 3 : 0,
        borderRadius: isHorizontal ? 6 : 4,
        barThickness: isHorizontal ? 12 : 'flex',
    };

    if(type === 'line') {
        datasetConfig.fill = true;
        datasetConfig.tension = 0.4;
        datasetConfig.pointBackgroundColor = '#ffffff';
        datasetConfig.pointBorderColor = '#4f46e5';
        datasetConfig.pointBorderWidth = 2;
        datasetConfig.pointRadius = 4;
        datasetConfig.pointHoverRadius = 6;
    }

    window.whCharts[canvasId] = new window.Chart(ctx, {
        type: type,
        data: { labels: labels, datasets: [datasetConfig] },
        options: {
            indexAxis: isHorizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { bottom: 10 } 
            },
            plugins: { 
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw} ${unit}` } }
            },
            scales: {
                x: { display: !isHorizontal, beginAtZero: true, grid: { display: false }, border: { dash: [4,4] } },
                y: { display: isHorizontal, beginAtZero: true, grid: { display: false }, ticks: { font: {size: 10, weight: 'bold'}, color: '#475569' } }
            }
        }
    });
}

window.renderWhView = function() {
    if (window.whViewMode === 'grid') renderWhGrid();
    else renderWhCalendar();
};

function getFilteredLogs() {
    return window.currentWorkLogs.filter(log => {
        if (window.whFilters.status) {
            const isConf = String(!!log.isConfirmed) === window.whFilters.status;
            if (!isConf) return false;
        }
        if (window.whFilters.loc && log.location !== window.whFilters.loc) return false;
        if (window.whFilters.type && log.workType !== window.whFilters.type) return false;
        if (window.whFilters.text) {
            const s = window.whFilters.text;
            const fullStr = `${log.authorName} ${log.projectName} ${log.projectCode} ${log.content}`.toLowerCase();
            if (!fullStr.includes(s) && !window.matchString(s, fullStr)) return false;
        }
        return true;
    });
}

function renderWhGrid() {
    const thead = document.getElementById('wh-grid-thead');
    const tbody = document.getElementById('wh-grid-tbody');
    if (!thead || !tbody) return;

    const picker = document.getElementById('wh-week-picker');
    const { start } = window.getDatesFromWeek(picker.value);
    
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    let headerHtml = `<tr><th class="p-3 w-24 text-center border-r border-slate-200 sticky left-0 bg-slate-100 z-30 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">작업자</th>`;
    
    let weekDates = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(start);
        d.setDate(d.getDate() + i);
        let dStr = window.getLocalDateStr(d);
        weekDates.push(dStr);
        
        let isHoliday = isWhHoliday(d);
        let colorClass = isHoliday ? 'text-rose-500' : 'text-slate-700';
        let bgClass = isHoliday ? 'bg-rose-50' : '';
        
        let isToday = dStr === window.getLocalDateStr(new Date());
        let todayMark = isToday ? '<div class="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full shadow-sm"></div>' : '';

        headerHtml += `<th class="p-2 min-w-[140px] text-center border-r border-slate-200 relative ${bgClass}"><div class="text-sm font-black ${colorClass}">${d.getDate()}</div><div class="text-[10px] font-bold ${colorClass}">${dayNames[d.getDay()]}</div>${todayMark}</th>`;
    }
    headerHtml += `</tr>`;
    thead.innerHTML = headerHtml;

    const filteredLogs = getFilteredLogs();
    
    let bodyHtml = '';
    (window.teamMembers || []).forEach(member => {
        bodyHtml += `<tr class="hover:bg-slate-50/50 transition-colors group">`;
        bodyHtml += `<td class="p-3 text-center font-bold text-slate-700 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">${member.name}</td>`;
        
        for (let i = 0; i < 7; i++) {
            let dateStr = weekDates[i];
            let d = new Date(dateStr);
            let isHoliday = isWhHoliday(d);
            let bgClass = isHoliday ? 'bg-rose-50/30' : '';
            
            let rawLogs = window.currentWorkLogs.filter(l => l.date === dateStr && l.authorName === member.name); 
            
            bodyHtml += `<td class="p-1 border-r border-slate-100 align-top ${bgClass} wh-cell relative" data-date="${dateStr}" data-author="${member.name}" onmousedown="window.whCellMouseDown(event, this)" onmouseenter="window.whCellMouseEnter(event, this)">`;
            
            rawLogs.forEach(log => {
                let isFilteredOut = !filteredLogs.includes(log);
                let opacityClass = isFilteredOut ? 'opacity-30 grayscale' : '';
                let confClass = log.isConfirmed ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300';
                let selClass = window.whSelectedCells.has(log.id) ? 'ring-2 ring-indigo-500 shadow-md transform scale-[1.02]' : '';
                
                bodyHtml += `<div class="p-1.5 rounded-lg border ${confClass} ${opacityClass} ${selClass} text-[10px] mb-1.5 cursor-pointer transition-all duration-200" data-logid="${log.id}" onclick="window.openWhInputModal('${dateStr}', '${member.name}'); event.stopPropagation();">
                    <div class="font-bold truncate text-[11px]" title="${log.projectName||''}"><span class="text-slate-400 font-medium mr-0.5">[${log.location||'사내'}]</span>${log.projectName||'PJT미지정'}</div>
                    <div class="flex justify-between items-center mt-1 pt-1 border-t border-slate-100/50"><span class="font-medium text-slate-500">${log.workType}</span><span class="font-black text-indigo-600 bg-white/50 px-1.5 py-0.5 rounded shadow-sm">${log.hours}h</span></div>
                </div>`;
            });
            bodyHtml += `<div class="absolute inset-0 z-0 h-full w-full opacity-0 hover:opacity-100 cursor-pointer bg-indigo-50/50 flex items-center justify-center text-indigo-400 text-xl transition-opacity" onclick="window.openWhInputModal('${dateStr}', '${member.name}')" style="${rawLogs.length > 0 ? 'display:none;' : ''}"><i class="fa-solid fa-plus"></i></div></td>`;
        }
        bodyHtml += `</tr>`;
    });
    
    if(!window.teamMembers || window.teamMembers.length === 0) {
        bodyHtml = `<tr><td colspan="8" class="p-10 text-center text-slate-400 font-bold">등록된 팀원이 없습니다. 팀원 관리에서 추가해주세요.</td></tr>`;
    }
    tbody.innerHTML = bodyHtml;
}

function renderWhCalendar() {
    const grid = document.getElementById('wh-calendar-grid');
    const titleEl = document.getElementById('wh-calendar-title');
    if (!grid) return;

    const picker = document.getElementById('wh-week-picker');
    const { start } = window.getDatesFromWeek(picker.value);
    
    const y = start.getFullYear();
    const m = start.getMonth();
    
    if(titleEl) titleEl.innerText = `${y}년 ${m + 1}월`;

    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();

    let html = '';
    for(let i=0; i<firstDay; i++) html += `<div class="bg-slate-50 min-h-[120px]"></div>`;

    const filteredLogs = getFilteredLogs();

    for(let i=1; i<=lastDate; i++) {
        let dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let d = new Date(y, m, i);
        let logs = filteredLogs.filter(l => l.date === dateStr);
        let isToday = dateStr === window.getLocalDateStr(new Date());
        
        let isHoliday = isWhHoliday(d);
        let txtClass = isHoliday ? 'text-rose-500' : 'text-slate-700';
        let dateClass = isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto shadow-md' : txtClass;

        let logsHtml = '';
        logs.forEach(log => {
            let confClass = log.isConfirmed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 border-slate-200';
            logsHtml += `<div class="text-[10px] ${confClass} border px-1.5 py-1 rounded-md mb-1 truncate cursor-pointer hover:shadow-md transition-shadow" onclick="window.openWhInputModal('${dateStr}', '${log.authorName}')">
                <span class="font-black text-indigo-700 bg-indigo-50 px-1 rounded mr-1">${log.authorName}</span>${log.projectName||'미지정'} <span class="font-bold text-slate-500">(${log.hours}h)</span>
            </div>`;
        });

        html += `<div class="bg-white p-2 min-h-[120px] hover:bg-slate-50 transition-colors relative group border-t-2 ${isToday ? 'border-t-indigo-500' : 'border-t-transparent'}">
            <div class="text-xs font-black text-center mb-2 ${dateClass}">${i}</div>
            <div class="flex flex-col gap-px h-[80px] overflow-y-auto custom-scrollbar">${logsHtml}</div>
            <button onclick="window.openWhInputModal('${dateStr}', '')" class="absolute bottom-2 right-2 w-6 h-6 bg-white border border-slate-200 shadow-sm rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 opacity-0 group-hover:opacity-100 transition-all"><i class="fa-solid fa-plus text-[10px]"></i></button>
        </div>`;
    }
    grid.innerHTML = html;
}

window.whCellMouseDown = function(e, cell) {
    if(e.button !== 0) return; 
    if(e.target.tagName === 'I' || e.target.tagName === 'BUTTON' || e.target.closest('div[data-logid]')) return;

    window.isWhDragging = true;
    window.whClearSelection();
    toggleCellSelection(cell);
    
    document.addEventListener('mouseup', window.whCellMouseUp);
};

window.whCellMouseEnter = function(e, cell) {
    if(window.isWhDragging) toggleCellSelection(cell);
};

window.whCellMouseUp = function() {
    window.isWhDragging = false;
    document.removeEventListener('mouseup', window.whCellMouseUp);
    updateWhFloatingBar();
};

function toggleCellSelection(cell) {
    const logs = cell.querySelectorAll('div[data-logid]');
    logs.forEach(logDiv => {
        const id = logDiv.dataset.logid;
        if(window.whSelectedCells.has(id)) {
            window.whSelectedCells.delete(id);
            logDiv.classList.remove('ring-2', 'ring-indigo-500', 'shadow-md', 'transform', 'scale-[1.02]');
        } else {
            window.whSelectedCells.add(id);
            logDiv.classList.add('ring-2', 'ring-indigo-500', 'shadow-md', 'transform', 'scale-[1.02]');
        }
    });
    updateWhFloatingBar();
}

window.whClearSelection = function() {
    window.whSelectedCells.clear();
    document.querySelectorAll('div[data-logid].ring-2').forEach(el => el.classList.remove('ring-2', 'ring-indigo-500', 'shadow-md', 'transform', 'scale-[1.02]'));
    updateWhFloatingBar();
};

function updateWhFloatingBar() {
    const bar = document.getElementById('wh-floating-bar');
    const cnt = document.getElementById('wh-selected-count');
    if(window.whSelectedCells.size > 0) {
        cnt.innerText = window.whSelectedCells.size;
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
    }
}

window.whBulkConfirm = async function(isConfirm) {
    if(window.whSelectedCells.size === 0) return;
    if(!window.userProfile || window.userProfile.role !== 'admin') {
        return window.showToast("관리자 권한이 필요합니다.", "error");
    }

    try {
        const batch = writeBatch(db);
        window.whSelectedCells.forEach(id => {
            batch.update(doc(db, "work_logs", id), { isConfirmed: isConfirm, updatedAt: Date.now() });
        });
        await batch.commit();
        window.showToast(`선택된 항목이 일괄 ${isConfirm ? '승인' : '미승인'} 처리되었습니다.`);
        window.whClearSelection();
    } catch(e) {
        window.showToast("일괄 처리 실패", "error");
    }
};

window.openWhInputModal = function(dateStr, authorName) {
    if(!authorName && window.teamMembers && window.teamMembers.length > 0) {
        authorName = window.userProfile?.name || window.teamMembers[0].name;
    }
    
    document.getElementById('wh-modal-date').value = dateStr;
    document.getElementById('wh-modal-author').value = authorName;
    document.getElementById('wh-modal-subtitle').innerHTML = `<i class="fa-regular fa-calendar text-indigo-400 mr-1"></i> ${dateStr} <span class="mx-2 text-slate-300">|</span> <i class="fa-solid fa-user text-indigo-400 mr-1"></i> ${authorName}`;

    const tbody = document.getElementById('wh-input-tbody');
    tbody.innerHTML = '';

    const logs = window.currentWorkLogs.filter(l => l.date === dateStr && l.authorName === authorName);
    
    if (logs.length > 0) {
        logs.forEach((log, index) => appendWhInputRow(log, index + 1));
    } else {
        appendWhInputRow(null, 1);
    }

    document.getElementById('wh-input-modal').classList.remove('hidden');
    document.getElementById('wh-input-modal').classList.add('flex');
    document.addEventListener('keydown', handleWhModalKeydown);
};

window.closeWhInputModal = function() {
    document.getElementById('wh-input-modal').classList.add('hidden');
    document.getElementById('wh-input-modal').classList.remove('flex');
    document.removeEventListener('keydown', handleWhModalKeydown);
    const drop = document.getElementById('wh-pjt-autocomplete');
    if(drop) drop.classList.add('hidden');
};

function handleWhModalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        window.saveWhInputData();
    }
}

window.whAddInputRow = function() {
    const tbody = document.getElementById('wh-input-tbody');
    const rowCount = tbody.querySelectorAll('tr').length + 1;
    appendWhInputRow(null, rowCount);
};

function appendWhInputRow(logData = null, index = 1) {
    const tbody = document.getElementById('wh-input-tbody');
    const tr = document.createElement('tr');
    tr.className = 'wh-input-row hover:bg-indigo-50/30 transition-colors border-b border-slate-100 relative';
    
    const uniqueId = 'wh-pjt-input-' + Date.now() + '-' + index;
    const pName = logData ? (logData.projectName || '') : '';
    const pCode = logData ? (logData.projectCode || '') : '';
    const pId = logData ? (logData.projectId || '') : '';

    let typeOptions = WH_TYPES.map(t => `<option value="${t}" ${logData && logData.workType === t ? 'selected' : ''}>${t}</option>`).join('');
    let locOptions = WH_LOCS.map(l => `<option value="${l}" ${logData && logData.location === l ? 'selected' : ''}>${l}</option>`).join('');
    
    let isConf = logData && logData.isConfirmed ? 'checked' : '';
    let isAdmin = window.userProfile?.role === 'admin';
    let confDisabled = isAdmin ? '' : 'disabled';
    
    let idInput = logData ? `<input type="hidden" class="row-id" value="${logData.id}">` : `<input type="hidden" class="row-id" value="">`;

    tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold text-xs bg-slate-50">${index}${idInput}</td>
        <td class="p-2 relative">
            <input type="text" id="${uniqueId}" class="row-pjt-name w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-bold text-indigo-700 placeholder-slate-400" value="${pName}" placeholder="PJT 코드 검색 또는 직접 입력" oninput="window.whShowPjtAuto(this)">
            <input type="hidden" class="row-pjt-id" value="${pId}">
            <input type="hidden" class="row-pjt-code" value="${pCode}">
        </td>
        <td class="p-2"><select class="row-type w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-bold text-slate-700 cursor-pointer">${typeOptions}</select></td>
        <td class="p-2"><select class="row-loc w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-bold text-slate-700 cursor-pointer">${locOptions}</select></td>
        <td class="p-2"><input type="number" step="0.5" min="0" class="row-hours w-full border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-2 text-sm font-black text-center outline-indigo-500 text-indigo-700 shadow-inner" value="${logData ? logData.hours : ''}" placeholder="0.0"></td>
        <td class="p-2"><input type="text" class="row-content w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-medium" value="${logData ? logData.content || '' : ''}" placeholder="작업 상세 내용 (선택)"></td>
        <td class="p-2 text-center"><input type="checkbox" class="row-conf accent-emerald-500 w-5 h-5 rounded cursor-pointer shadow-sm" ${isConf} ${confDisabled}></td>
        <td class="p-2 text-center"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
    `;
    tbody.appendChild(tr);
}

// 💡 5. 초성 검색 완벽 대응 (PJT 코드 매칭만 실행)
window.whShowPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    const drop = document.getElementById('wh-pjt-autocomplete');
    
    const tr = input.closest('tr');
    tr.querySelector('.row-pjt-id').value = '';
    tr.querySelector('.row-pjt-code').value = '';

    if(!val) { drop.classList.add('hidden'); return; }

    let matches = (window.currentProjectStatusList || []).filter(p => {
        if(p.status === 'completed' || p.status === 'rejected') return false;
        let code = (p.code || '').toLowerCase();
        // 💡 프로젝트 명칭(name)을 제외하고, 코드(code) 기준으로만 검색(초성 포함) 수행
        return code.includes(val) || (window.matchString && window.matchString(val, p.code));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.left = `${rect.left + window.scrollX}px`;
        drop.style.top = `${rect.bottom + window.scrollY + 2}px`;
        drop.style.width = `${rect.width}px`;
        drop.innerHTML = matches.map(m => {
            let sName = m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
            return `<li class="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-xs font-bold text-slate-700 border-b border-slate-50 truncate transition-colors" onmousedown="window.whSelectPjt('${input.id}', '${m.id}', '${m.code||''}', '${sName}')"><span class="text-indigo-600">[${m.code||'-'}]</span> ${m.name}</li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.whSelectPjt = function(inputId, pId, pCode, pName) {
    const input = document.getElementById(inputId);
    if(input) {
        input.value = pName;
        const tr = input.closest('tr');
        tr.querySelector('.row-pjt-id').value = pId;
        tr.querySelector('.row-pjt-code').value = pCode;
    }
    document.getElementById('wh-pjt-autocomplete').classList.add('hidden');
};

document.addEventListener('click', function(e) {
    const d = document.getElementById('wh-pjt-autocomplete');
    if (d && !d.classList.contains('hidden') && !e.target.closest('#wh-pjt-autocomplete') && !e.target.classList.contains('row-pjt-name')) {
        d.classList.add('hidden');
    }
});

window.saveWhInputData = async function() {
    const dateStr = document.getElementById('wh-modal-date').value;
    const authorName = document.getElementById('wh-modal-author').value;
    const rows = document.querySelectorAll('.wh-input-row');
    
    let toSave = [];

    rows.forEach(tr => {
        const id = tr.querySelector('.row-id').value;
        const projectName = tr.querySelector('.row-pjt-name').value.trim();
        const projectId = tr.querySelector('.row-pjt-id').value;
        const projectCode = tr.querySelector('.row-pjt-code').value;
        
        const workType = tr.querySelector('.row-type').value;
        const location = tr.querySelector('.row-loc').value;
        const hours = parseFloat(tr.querySelector('.row-hours').value) || 0;
        const content = tr.querySelector('.row-content').value.trim();
        const isConfirmed = tr.querySelector('.row-conf').checked;

        if (hours > 0 && (projectName || content)) {
            toSave.push({ 
                id, 
                date: dateStr, 
                authorName, 
                projectId, 
                projectCode, 
                projectName, 
                workType, 
                location, 
                hours, 
                content, 
                isConfirmed, 
                updatedAt: Date.now() 
            });
        }
    });

    try {
        const batch = writeBatch(db);
        
        const q = query(collection(db, "work_logs"), where("date", "==", dateStr), where("authorName", "==", authorName));
        const existingSnap = await getDocs(q);
        existingSnap.forEach(docSnap => batch.delete(docSnap.ref));
        
        toSave.forEach(data => {
            const ref = doc(collection(db, "work_logs")); 
            data.createdAt = Date.now();
            delete data.id; 
            batch.set(ref, data);
        });

        await batch.commit();
        window.showToast("투입공수가 저장되었습니다.");
        window.closeWhInputModal();
    } catch(e) {
        window.showToast("저장 실패", "error");
    }
};

window.exportWorkhoursExcel = async function(isDriveUpload = false, driveFolderId = null) {
    if (typeof window.ExcelJS === 'undefined') return window.showToast("ExcelJS 모듈이 필요합니다.", "error");
    
    try {
        if(!isDriveUpload) window.showToast("엑셀 파일을 생성 중입니다...", "success");
        const wb = new window.ExcelJS.Workbook();
        
        const ws1 = wb.addWorksheet('월간_통계_요약', { views: [{ showGridLines: false }] });
        ws1.columns = [{width:2}, {width:15}, {width:15}, {width:15}, {width:15}, {width:15}];
        
        const pDate = document.getElementById('wh-week-picker').value; 
        const yStr = window.getDatesFromWeek(pDate).start.getFullYear();
        const mStr = String(window.getDatesFromWeek(pDate).start.getMonth() + 1).padStart(2, '0');
        const reportTitle = `${yStr}년 ${mStr}월 개인별 투입공수 통계`;

        ws1.mergeCells('B2:E3');
        const titleCell = ws1.getCell('B2');
        titleCell.value = reportTitle;
        titleCell.font = { name: '맑은 고딕', size: 18, bold: true, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
        
        ws1.getCell('B4').value = `출력일시: ${new Date().toLocaleString()}`;
        ws1.getCell('B4').font = { size: 10, color: { argb: 'FF64748B' } };

        let monthlyLogs = window.currentWorkLogs.filter(l => l.date.startsWith(`${yStr}-${mStr}`) && l.isConfirmed);
        let tMd = 0; let pMap = {}; let pjtMap = {};
        
        monthlyLogs.forEach(l => {
            let md = l.hours / 8;
            tMd += md;
            pMap[l.authorName] = (pMap[l.authorName] || 0) + md;
            let pName = l.projectName || l.projectCode || '미분류';
            pjtMap[pName] = (pjtMap[pName] || 0) + md;
        });

        ws1.getCell('B6').value = '총 투입 (MD)';
        ws1.getCell('C6').value = tMd.toFixed(1) + ' MD';
        ws1.getCell('B6').font = { bold: true }; ws1.getCell('C6').font = { bold: true, color: {argb:'FF4F46E5'} };

        ws1.getCell('B8').value = '[ 작업자별 누적 투입 공수 ]';
        ws1.getCell('B8').font = { bold: true, color: {argb:'FF334155'} };
        let r = 9;
        Object.entries(pMap).sort((a,b)=>b[1]-a[1]).forEach(p => {
            ws1.getCell(`B${r}`).value = p[0];
            ws1.getCell(`C${r}`).value = p[1].toFixed(1) + ' MD';
            ws1.getCell(`C${r}`).font = { bold: true, color: {argb:'FF059669'} };
            r++;
        });

        r += 1;
        ws1.getCell(`B${r}`).value = '[ 주요 프로젝트별 투입 (Top 10) ]';
        ws1.getCell(`B${r}`).font = { bold: true, color: {argb:'FF334155'} };
        r++;
        Object.entries(pjtMap).sort((a,b)=>b[1]-a[1]).slice(0, 10).forEach(p => {
            ws1.mergeCells(`B${r}:C${r}`);
            ws1.getCell(`B${r}`).value = p[0];
            ws1.getCell(`D${r}`).value = p[1].toFixed(1) + ' MD';
            ws1.getCell(`D${r}`).font = { bold: true, color: {argb:'FF9333EA'} };
            r++;
        });

        const ws2 = wb.addWorksheet('데이터_Raw');
        ws2.columns = [
            { header: '날짜', key: 'date', width: 12 },
            { header: '작업자', key: 'name', width: 12 },
            { header: '프로젝트', key: 'pjt', width: 35 },
            { header: '구분', key: 'type', width: 10 },
            { header: '장소', key: 'loc', width: 10 },
            { header: '투입시간(h)', key: 'hrs', width: 12 },
            { header: '환산공수(MD)', key: 'md', width: 12 },
            { header: '상세내용', key: 'content', width: 50 },
            { header: '승인여부', key: 'conf', width: 12 }
        ];

        let hr = ws2.getRow(1);
        hr.font = { bold: true, color: {argb: 'FFFFFFFF'} };
        hr.fill = { type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF4F46E5'} };
        hr.alignment = { vertical: 'middle', horizontal: 'center' };

        let sortedLogs = window.currentWorkLogs.slice().sort((a,b) => a.date.localeCompare(b.date) || a.authorName.localeCompare(b.authorName));
        
        sortedLogs.forEach(l => {
            let row = ws2.addRow({
                date: l.date,
                name: l.authorName,
                pjt: l.projectCode ? `[${l.projectCode}] ${l.projectName}` : (l.projectName || '프로젝트 미지정'),
                type: l.workType,
                loc: l.location || '사내',
                hrs: l.hours,
                md: (l.hours / 8).toFixed(2), 
                content: l.content || '',
                conf: l.isConfirmed ? '승인완료' : '미승인'
            });
            
            row.eachCell(function(cell, colNumber) {
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                cell.alignment = { vertical: 'middle' };
                if(colNumber !== 3 && colNumber !== 8) cell.alignment.horizontal = 'center';
                if(colNumber === 9) {
                    if(l.isConfirmed) cell.font = { color: { argb: 'FF059669' }, bold: true };
                    else cell.font = { color: { argb: 'FFE11D48' }, bold: true };
                }
            });
        });

        const buffer = await wb.xlsx.writeBuffer();
        const fileName = `AXBIS_투입공수보고서_${yStr}년${mStr}월.xlsx`;

        if (isDriveUpload && driveFolderId) {
            return { buffer: buffer, name: fileName }; 
        } else {
            window.saveAs(new Blob([buffer]), fileName); 
        }

    } catch(e) {
        window.showToast("엑셀 생성 중 오류가 발생했습니다.", "error");
        throw e;
    }
};

window.saveWorkhoursToDrive = async function() {
    if(!window.googleAccessToken) {
        if(window.initGoogleAPI) window.initGoogleAPI();
        if(window.authenticateGoogle && !window.googleAccessToken) window.authenticateGoogle();
        if(!window.googleAccessToken) return window.showToast("구글 인증이 필요합니다. [연동하기] 버튼을 눌러주세요.", "error");
    }

    try {
        window.showToast("구글 드라이브에 저장 중입니다...");
        
        const { buffer, name } = await window.exportWorkhoursExcel(true, DRIVE_EXPORT_FOLDER);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        const queryStr = `name='${name}' and '${DRIVE_EXPORT_FOLDER}' in parents and trashed=false`;
        const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}`, {
            headers: { 'Authorization': 'Bearer ' + window.googleAccessToken }
        });
        const folderData = await findRes.json();
        
        const metadata = { name: name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
        const form = new FormData();
        
        if (folderData.files && folderData.files.length > 0) {
            const fileId = folderData.files[0].id;
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + window.googleAccessToken },
                body: form
            });
            window.showToast(`[${name}] 드라이브에 성공적으로 업데이트 되었습니다.`, "success");
        } else {
            metadata.parents = [DRIVE_EXPORT_FOLDER];
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + window.googleAccessToken },
                body: form
            });
            window.showToast(`[${name}] 드라이브에 신규 저장 되었습니다.`, "success");
        }

    } catch (e) {
        console.error(e);
        window.showToast("드라이브 저장에 실패했습니다. (콘솔 확인)", "error");
    }
};
