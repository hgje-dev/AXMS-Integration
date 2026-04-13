import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let worklogsUnsubscribe = null;
window.currentWorkLogs = [];
window.currentWhDate = new Date();
window.whPeriodMode = 'month'; // 'month' or 'year'
window.whViewMode = 'grid'; // 'grid' or 'calendar'
window.whPjtSearch = '';
window.whFilters = { text: '', loc: '', type: '', status: '' };
window.whSelectedCells = new Set();
window.isWhDragging = false;
window.whCharts = {}; // Chart.js instances

const WH_TYPES = ['조립', '검수', '설치', 'Setup', '협업', '공통', '기타'];
const WH_LOCS = ['사내', '국내', '해외'];

// 초기 로드
window.loadWorkhoursData = function() {
    const picker = document.getElementById('wh-month-picker');
    if (!picker) return;
    
    if (!picker.value) {
        let y = window.currentWhDate.getFullYear();
        let m = String(window.currentWhDate.getMonth() + 1).padStart(2, '0');
        picker.value = `${y}-${m}`;
    } else {
        const [y, m] = picker.value.split('-');
        window.currentWhDate = new Date(y, parseInt(m) - 1, 1);
    }

    fetchWorkLogs();
};

window.changeWhMonth = function(offset) {
    window.currentWhDate.setMonth(window.currentWhDate.getMonth() + offset);
    let y = window.currentWhDate.getFullYear();
    let m = String(window.currentWhDate.getMonth() + 1).padStart(2, '0');
    const picker = document.getElementById('wh-month-picker');
    if (picker) picker.value = `${y}-${m}`;
    fetchWorkLogs();
};

function fetchWorkLogs() {
    if (worklogsUnsubscribe) worklogsUnsubscribe();

    let startStr, endStr;
    const y = window.currentWhDate.getFullYear();
    const m = window.currentWhDate.getMonth();

    if (window.whPeriodMode === 'year') {
        startStr = `${y}-01-01`;
        endStr = `${y}-12-31`;
    } else {
        const start = new Date(y, m, 1);
        const end = new Date(y, m + 1, 0);
        startStr = window.getLocalDateStr(start);
        endStr = window.getLocalDateStr(end);
    }

    const q = query(collection(db, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
    
    worklogsUnsubscribe = onSnapshot(q, (snapshot) => {
        window.currentWorkLogs = [];
        snapshot.forEach(doc => window.currentWorkLogs.push({ id: doc.id, ...doc.data() }));
        window.updateWhDashboard();
        window.renderWhView();
    });
}

window.setWhPeriodMode = function(mode) {
    window.whPeriodMode = mode;
    document.getElementById('wh-btn-period-month').className = mode === 'month' ? 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all' : 'px-4 py-1.5 text-xs font-bold bg-white text-slate-600 border border-slate-200 shadow-sm rounded-full transition-all hover:bg-slate-100';
    document.getElementById('wh-btn-period-year').className = mode === 'year' ? 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all' : 'px-4 py-1.5 text-xs font-bold bg-white text-slate-600 border border-slate-200 shadow-sm rounded-full transition-all hover:bg-slate-100';
    fetchWorkLogs();
};

window.setWhViewMode = function(mode) {
    window.whViewMode = mode;
    document.getElementById('wh-btn-grid').className = mode === 'grid' ? 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5' : 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5';
    document.getElementById('wh-btn-calendar').className = mode === 'calendar' ? 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5' : 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5';
    
    document.getElementById('wh-view-grid').classList.toggle('hidden', mode !== 'grid');
    document.getElementById('wh-view-calendar').classList.toggle('hidden', mode !== 'calendar');
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

// 대시보드 업데이트
window.updateWhDashboard = function() {
    window.whPjtSearch = document.getElementById('wh-search-pjt')?.value.toLowerCase() || '';
    
    // 💡 관리자 승인이 완료된(isConfirmed: true) 데이터만 통계에 반영
    let baseData = window.currentWorkLogs.filter(l => l.isConfirmed);
    
    if (window.whPjtSearch) {
        baseData = baseData.filter(l => (l.projectName || '').toLowerCase().includes(window.whPjtSearch) || (l.projectCode || '').toLowerCase().includes(window.whPjtSearch));
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
        if (window.whPeriodMode === 'month') {
            const d = new Date(log.date);
            const weekNo = Math.ceil(d.getDate() / 7);
            trendKey = `${weekNo}주차`;
        } else {
            trendKey = `${log.date.substring(5,7)}월`;
        }
        trendMap[trendKey] = (trendMap[trendKey] || 0) + h;

        let loc = log.location || '사내';
        if (!locMap[loc]) locMap[loc] = new Set();
        locMap[loc].add(log.authorName);

        let pName = log.projectName || log.projectCode || '분류 안됨';
        pjtMap[pName] = (pjtMap[pName] || 0) + h;
        datesSet.add(log.date);
    });

    // 💡 시간(h)을 MD(Man-Day)로 환산 (1MD = 8h)
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
        pjtDaysEl.innerText = `총 소요일: ${diffDays}일`;
        pjtInfoContainer.classList.remove('hidden');
    } else {
        pjtInfoContainer.classList.add('hidden');
    }

    renderWhChart('wh-chart-person', 'bar', personMap, 'MD', true);
    renderWhChart('wh-chart-type', 'bar', typeMap, 'MD', true);
    
    document.getElementById('wh-chart-trend-title').innerText = window.whPeriodMode === 'month' ? '주차별 투입 추이 (MD)' : '월별 투입 추이 (MD)';
    renderWhChart('wh-chart-trend', window.whPeriodMode === 'month' ? 'bar' : 'line', trendMap, 'MD', false);

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
    
    if (window.whCharts[canvasId]) {
        window.whCharts[canvasId].destroy();
    }

    let sortedData = Object.entries(dataMap);
    if (isHorizontal) sortedData.sort((a,b)=>b[1]-a[1]);
    else sortedData.sort((a,b)=>a[0].localeCompare(b[0])); // 날짜순 정렬

    if (sortedData.length > 5 && isHorizontal) sortedData = sortedData.slice(0, 5);

    const labels = sortedData.map(d => d[0]);
    const data = sortedData.map(d => (d[1]/8).toFixed(1)); // MD 변환

    window.whCharts[canvasId] = new window.Chart(canvas.getContext('2d'), {
        type: type,
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
                borderRadius: 6,
                barThickness: isHorizontal ? 12 : 'flex'
            }]
        },
        options: {
            indexAxis: isHorizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw} ${unit}` } }
            },
            scales: {
                x: { display: !isHorizontal, beginAtZero: true, grid: { display: false } },
                y: { display: isHorizontal, beginAtZero: true, grid: { display: false }, ticks: { font: {size: 10, weight: 'bold'}, color: '#475569' } }
            }
        }
    });
}

// 현황판 / 달력 렌더링 분기
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
            const fullStr = `${log.authorName} ${log.projectName} ${log.content}`.toLowerCase();
            if (!fullStr.includes(s) && !window.matchString(s, fullStr)) return false;
        }
        return true;
    });
}

function renderWhGrid() {
    const thead = document.getElementById('wh-grid-thead');
    const tbody = document.getElementById('wh-grid-tbody');
    if (!thead || !tbody) return;

    const y = window.currentWhDate.getFullYear();
    const m = window.currentWhDate.getMonth();
    const lastDate = new Date(y, m + 1, 0).getDate();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    let headerHtml = `<tr><th class="p-3 w-24 text-center border-r border-slate-200 sticky left-0 bg-slate-100 z-30 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">작업자</th>`;
    
    for (let i = 1; i <= lastDate; i++) {
        let d = new Date(y, m, i);
        let isWeekend = d.getDay() === 0 || d.getDay() === 6; // TODO: 공휴일 연동 필요 시 추가
        let colorClass = isWeekend ? 'text-rose-500' : 'text-slate-700';
        let bgClass = isWeekend ? 'bg-rose-50' : '';
        headerHtml += `<th class="p-2 min-w-[140px] text-center border-r border-slate-200 ${bgClass}"><div class="text-sm font-black ${colorClass}">${i}</div><div class="text-[10px] font-bold text-slate-400">${dayNames[d.getDay()]}</div></th>`;
    }
    headerHtml += `</tr>`;
    thead.innerHTML = headerHtml;

    const filteredLogs = getFilteredLogs();
    
    let bodyHtml = '';
    (window.teamMembers || []).forEach(member => {
        bodyHtml += `<tr class="hover:bg-slate-50/50 transition-colors">`;
        bodyHtml += `<td class="p-3 text-center font-bold text-slate-700 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">${member.name}</td>`;
        
        for (let i = 1; i <= lastDate; i++) {
            let dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            let d = new Date(y, m, i);
            let isWeekend = d.getDay() === 0 || d.getDay() === 6;
            let bgClass = isWeekend ? 'bg-rose-50/30' : '';
            
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
        bodyHtml = `<tr><td colspan="32" class="p-10 text-center text-slate-400 font-bold">등록된 팀원이 없습니다. 팀원 관리에서 추가해주세요.</td></tr>`;
    }
    tbody.innerHTML = bodyHtml;
}

function renderWhCalendar() {
    const grid = document.getElementById('wh-calendar-grid');
    if (!grid) return;

    const y = window.currentWhDate.getFullYear();
    const m = window.currentWhDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();

    let html = '';
    for(let i=0; i<firstDay; i++) html += `<div class="bg-slate-50 min-h-[120px]"></div>`;

    const filteredLogs = getFilteredLogs();

    for(let i=1; i<=lastDate; i++) {
        let dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let logs = filteredLogs.filter(l => l.date === dateStr);
        let isToday = dateStr === window.getLocalDateStr(new Date());
        let dateClass = isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto shadow-md' : 'text-slate-700';

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

// ==========================================
// 마우스 드래그 다중 선택 로직
// ==========================================
window.whCellMouseDown = function(e, cell) {
    if(e.button !== 0) return; // 좌클릭만 허용
    if(e.target.tagName === 'I' || e.target.tagName === 'BUTTON') return; // 아이콘/버튼 클릭 무시

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

// 일괄 승인/취소 처리
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

// ==========================================
// 입력 모달 로직 (다중 Row)
// ==========================================
window.openWhInputModal = function(dateStr, authorName) {
    // 빈 셀 클릭 시 파라미터가 비어있을 수 있으므로 기본값 세팅
    if(!authorName && window.teamMembers && window.teamMembers.length > 0) {
        authorName = window.userProfile?.name || window.teamMembers[0].name;
    }
    
    document.getElementById('wh-modal-date').value = dateStr;
    document.getElementById('wh-modal-author').value = authorName;
    document.getElementById('wh-modal-subtitle').innerHTML = `<i class="fa-regular fa-calendar text-indigo-400 mr-1"></i> ${dateStr} <span class="mx-2 text-slate-300">|</span> <i class="fa-solid fa-user text-indigo-400 mr-1"></i> ${authorName}`;

    const tbody = document.getElementById('wh-input-tbody');
    tbody.innerHTML = '';

    // 해당 날짜/작업자의 기존 데이터 로드
    const logs = window.currentWorkLogs.filter(l => l.date === dateStr && l.authorName === authorName);
    
    if (logs.length > 0) {
        logs.forEach((log, index) => appendWhInputRow(log, index + 1));
    } else {
        appendWhInputRow(null, 1); // 기본 빈 행 1개
    }

    document.getElementById('wh-input-modal').classList.remove('hidden');
    document.getElementById('wh-input-modal').classList.add('flex');
    
    // 단축키 이벤트 리스너 추가
    document.addEventListener('keydown', handleWhModalKeydown);
};

window.closeWhInputModal = function() {
    document.getElementById('wh-input-modal').classList.add('hidden');
    document.getElementById('wh-input-modal').classList.remove('flex');
    document.removeEventListener('keydown', handleWhModalKeydown);
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
    tr.className = 'wh-input-row hover:bg-indigo-50/30 transition-colors border-b border-slate-100';
    
    let pjtOptions = '<option value="">선택 안함</option>';
    // 현재 진행중인(완료되지 않은) 프로젝트 목록
    const activeProjects = (window.currentProjectStatusList || []).filter(p => p.status !== 'completed' && p.status !== 'rejected');
    activeProjects.forEach(p => {
        let isSel = logData && logData.projectId === p.id ? 'selected' : '';
        pjtOptions += `<option value="${p.id}" data-code="${p.code||''}" data-name="${p.name||''}" ${isSel}>[${p.code||'-'}] ${p.name||''}</option>`;
    });

    let typeOptions = WH_TYPES.map(t => `<option value="${t}" ${logData && logData.workType === t ? 'selected' : ''}>${t}</option>`).join('');
    let locOptions = WH_LOCS.map(l => `<option value="${l}" ${logData && logData.location === l ? 'selected' : ''}>${l}</option>`).join('');
    
    let isConf = logData && logData.isConfirmed ? 'checked' : '';
    let isAdmin = window.userProfile?.role === 'admin';
    let confDisabled = isAdmin ? '' : 'disabled';
    
    let idInput = logData ? `<input type="hidden" class="row-id" value="${logData.id}">` : `<input type="hidden" class="row-id" value="">`;

    tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-bold text-xs bg-slate-50">${index}${idInput}</td>
        <td class="p-2"><select class="row-pjt w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-bold text-slate-700 cursor-pointer">${pjtOptions}</select></td>
        <td class="p-2"><select class="row-type w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-bold text-slate-700 cursor-pointer">${typeOptions}</select></td>
        <td class="p-2"><select class="row-loc w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-bold text-slate-700 cursor-pointer">${locOptions}</select></td>
        <td class="p-2"><input type="number" step="0.5" min="0" class="row-hours w-full border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-2 text-sm font-black text-center outline-indigo-500 text-indigo-700 shadow-inner" value="${logData ? logData.hours : ''}" placeholder="0.0"></td>
        <td class="p-2"><input type="text" class="row-content w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-indigo-500 bg-white shadow-sm font-medium" value="${logData ? logData.content || '' : ''}" placeholder="작업 상세 내용 (선택)"></td>
        <td class="p-2 text-center"><input type="checkbox" class="row-conf accent-emerald-500 w-5 h-5 rounded cursor-pointer shadow-sm" ${isConf} ${confDisabled}></td>
        <td class="p-2 text-center"><button onclick="this.closest('tr').remove()" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
    `;
    tbody.appendChild(tr);
}

// 일괄 덮어쓰기 방식으로 저장 (기존 해당 날짜/사람의 데이터 모두 지우고 현재 Row들로 재생성)
window.saveWhInputData = async function() {
    const dateStr = document.getElementById('wh-modal-date').value;
    const authorName = document.getElementById('wh-modal-author').value;
    const rows = document.querySelectorAll('.wh-input-row');
    
    let toSave = [];

    rows.forEach(tr => {
        const id = tr.querySelector('.row-id').value;
        const pjtSel = tr.querySelector('.row-pjt');
        const projectId = pjtSel.value;
        const projectCode = pjtSel.options[pjtSel.selectedIndex]?.dataset?.code || '';
        const projectName = pjtSel.options[pjtSel.selectedIndex]?.dataset?.name || '';
        const workType = tr.querySelector('.row-type').value;
        const location = tr.querySelector('.row-loc').value;
        const hours = parseFloat(tr.querySelector('.row-hours').value) || 0;
        const content = tr.querySelector('.row-content').value.trim();
        const isConfirmed = tr.querySelector('.row-conf').checked;

        // 유효성 검사: 시간이 0보다 크고, (프로젝트가 지정되어 있거나 내용이 있는 경우) 저장
        if (hours > 0 && (projectId || content)) {
            toSave.push({ 
                id, // 기존 ID가 있다면 유지 (없으면 새로 생성됨)
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
        
        // 1. 기존 데이터 쿼리 후 일괄 삭제
        const q = query(collection(db, "work_logs"), where("date", "==", dateStr), where("authorName", "==", authorName));
        const existingSnap = await getDocs(q);
        existingSnap.forEach(docSnap => batch.delete(docSnap.ref));
        
        // 2. 새 데이터 일괄 추가
        toSave.forEach(data => {
            // 기존 id가 있어도 새로 문서를 만드는 덮어쓰기 방식
            const ref = doc(collection(db, "work_logs")); 
            data.createdAt = Date.now();
            delete data.id; // 신규 생성 시 id 필드 제거
            batch.set(ref, data);
        });

        await batch.commit();
        window.showToast("투입공수가 저장되었습니다.");
        window.closeWhInputModal();
    } catch(e) {
        window.showToast("저장 실패", "error");
    }
};

// 엑셀 리포트 생성 (ExcelJS)
window.exportWorkhoursExcel = async function() {
    if (typeof window.ExcelJS === 'undefined') return window.showToast("ExcelJS 모듈이 필요합니다.", "error");
    
    try {
        window.showToast("엑셀 파일을 생성 중입니다...", "success");
        const wb = new window.ExcelJS.Workbook();
        const ws = wb.addWorksheet('투입공수_데이터');
        
        ws.columns = [
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

        let hr = ws.getRow(1);
        hr.font = { bold: true, color: {argb: 'FFFFFFFF'} };
        hr.fill = { type: 'pattern', pattern: 'solid', fgColor: {argb: 'FF4F46E5'} };
        hr.alignment = { vertical: 'middle', horizontal: 'center' };

        // 현재 화면의 필터와 상관없이, 선택된 월(또는 연도)의 전체 데이터를 날짜-이름 순 정렬
        let sortedLogs = window.currentWorkLogs.slice().sort((a,b) => a.date.localeCompare(b.date) || a.authorName.localeCompare(b.authorName));
        
        sortedLogs.forEach(l => {
            let row = ws.addRow({
                date: l.date,
                name: l.authorName,
                pjt: l.projectCode ? `[${l.projectCode}] ${l.projectName}` : (l.projectName || '프로젝트 미지정'),
                type: l.workType,
                loc: l.location || '사내',
                hrs: l.hours,
                md: (l.hours / 8).toFixed(2), // 1MD = 8h 환산
                content: l.content || '',
                conf: l.isConfirmed ? '승인완료' : '미승인'
            });
            
            row.eachCell(function(cell, colNumber) {
                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                cell.alignment = { vertical: 'middle' };
                if(colNumber !== 3 && colNumber !== 8) cell.alignment.horizontal = 'center'; // 프로젝트, 내용은 좌측 정렬
                
                // 승인 여부 색상 강조
                if(colNumber === 9) {
                    if(l.isConfirmed) cell.font = { color: { argb: 'FF059669' }, bold: true };
                    else cell.font = { color: { argb: 'FFE11D48' }, bold: true };
                }
            });
        });

        const buffer = await wb.xlsx.writeBuffer();
        const yStr = window.currentWhDate.getFullYear();
        const mStr = String(window.currentWhDate.getMonth()+1).padStart(2, '0');
        const fileName = window.whPeriodMode === 'year' ? `AXBIS_투입공수보고서_${yStr}년.xlsx` : `AXBIS_투입공수보고서_${yStr}년${mStr}월.xlsx`;
        
        window.saveAs(new Blob([buffer]), fileName);
    } catch(e) {
        window.showToast("엑셀 저장 중 오류가 발생했습니다.", "error");
    }
};
