import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

window.matchString = function(q, t) {
    if (!q) return true;
    if (!t) return false;
    q = q.toLowerCase().replace(/\s/g, '');
    t = t.toLowerCase().replace(/\s/g, '');
    if (t.includes(q)) return true;

    const getCho = (str) => {
        const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
        let res = "";
        for (let i = 0; i < str.length; i++) {
            let code = str.charCodeAt(i) - 44032;
            if (code > -1 && code < 11172) res += cho[Math.floor(code / 588)];
            else res += str.charAt(i);
        }
        return res;
    };

    let choT = getCho(t);
    let choQ = getCho(q);
    if (choT.includes(choQ)) return true;

    const enToKr = {'q':'ㅂ','w':'ㅈ','e':'ㄷ','r':'ㄱ','t':'ㅅ','y':'ㅛ','u':'ㅕ','i':'ㅑ','o':'ㅐ','p':'ㅔ','a':'ㅁ','s':'ㄴ','d':'ㅇ','f':'ㄹ','g':'ㅎ','h':'ㅗ','j':'ㅓ','k':'ㅏ','l':'ㅣ','z':'ㅋ','x':'ㅌ','c':'ㅊ','v':'ㅍ','b':'ㅠ','n':'ㅜ','m':'ㅡ'};
    let korQ = "";
    for(let i = 0; i < q.length; i++) korQ += enToKr[q[i]] || q[i];
    
    if (t.includes(korQ)) return true;
    if (choT.includes(getCho(korQ))) return true;

    return false;
};

window.formatWeekToKorean = function(weekStr) {
    if(!weekStr) return "주 선택";
    const { start } = window.getDatesFromWeek(weekStr);
    const thu = new Date(start);
    thu.setDate(thu.getDate() + 3);
    const year = thu.getFullYear();
    const month = thu.getMonth() + 1;
    
    const firstDayOfMonth = new Date(year, month - 1, 1);
    let offset = firstDayOfMonth.getDay() - 1;
    if(offset === -1) offset = 6;
    const weekNum = Math.ceil((thu.getDate() + offset) / 7);
    
    return `${year}년 ${month}월 ${weekNum}주차`;
};

window.getWeeksInMonthForPlan = function(year, month) {
    let weeks = new Set();
    let d = new Date(year, month - 1, 1);
    let lastDate = new Date(year, month, 0);
    while(d <= lastDate) {
        if(window.getWeekString) {
            weeks.add(window.getWeekString(d));
        }
        d.setDate(d.getDate() + 1);
    }
    return Array.from(weeks).sort();
};

let worklogsUnsubscribe = null;
let workplansUnsubscribe = null;

window.currentWorkLogs = [];
window.currentWorkPlans = []; 

window.whStatMode = 'week';
window.whViewMode = 'grid';
window.whMemberMode = 'all'; 
window.whPjtSearch = '';
window.whFilters = { text: '', loc: '', type: '', status: '' };
window.whSelectedCells = new Set();
window.isWhDragging = false;
window.whCharts = {};
window.whIsDirty = false; 
window.todayBadgeInitialized = false;
let myTodayLogUnsubscribe = null;

window.whDragDist = 0;
window.whDragStartX = 0;
window.whDragStartY = 0;

document.addEventListener('mousedown', e => {
    window.whDragDist = 0;
    window.whDragStartX = e.clientX;
    window.whDragStartY = e.clientY;
});

document.addEventListener('mousemove', e => {
    if (window.whDragStartX) {
        window.whDragDist = Math.abs(e.clientX - window.whDragStartX) + Math.abs(e.clientY - window.whDragStartY);
    }
});

const WH_TYPES = ['조립', '검수', '설치', 'Setup', '협업', '공통', '휴가', '휴가(오전)', '휴가(오후)', '기타'];
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

window.initTodayBadge = function() {
    if (!window.userProfile || !window.userProfile.name) return;
    const todayStr = window.getLocalDateStr(new Date());
    const q = query(collection(db, "work_logs"), where("date", "==", todayStr), where("authorName", "==", window.userProfile.name));
    
    if (myTodayLogUnsubscribe) myTodayLogUnsubscribe();
    myTodayLogUnsubscribe = onSnapshot(q, (snapshot) => {
        let totalHours = 0;
        snapshot.forEach(doc => {
            totalHours += parseFloat(doc.data().hours) || 0;
        });
        window.updateTodayBadgeUI(totalHours > 0);
    });
};

window.updateTodayBadgeUI = function(isCompleted) {
    const badge = document.getElementById('wh-today-badge');
    if (!badge) return;
    if (isCompleted) {
        badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> 오늘 작성완료`;
        badge.className = "cursor-pointer ml-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200 shadow-sm hover:bg-emerald-200 transition-colors flex items-center gap-1 hidden sm:flex";
        badge.classList.remove('animate-pulse');
    } else {
        badge.innerHTML = `<i class="fa-solid fa-pen"></i> 오늘 미작성`;
        badge.className = "cursor-pointer ml-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-500 border border-rose-200 shadow-sm hover:bg-rose-100 transition-colors flex items-center gap-1 animate-pulse hidden sm:flex";
    }
};

window.openTodayWhModal = function() {
    const todayStr = window.getLocalDateStr(new Date());
    const myName = window.userProfile ? window.userProfile.name : '';
    const todayWeekStr = window.getWeekString(new Date());
    const picker = document.getElementById('wh-week-picker');

    if (picker && picker.value !== todayWeekStr) {
        picker.value = todayWeekStr;
        window.updateWhWeekDisplay(picker.value);
        window.loadWorkhoursData();
        setTimeout(() => {
            window.openWhInputModal(todayStr, myName);
        }, 300);
    } else {
        window.openWhInputModal(todayStr, myName);
    }
};

window.setWhMemberMode = function(mode) {
    window.whMemberMode = mode;
    const btnsAll = document.querySelectorAll('#wh-btn-member-all');
    const btnsMe = document.querySelectorAll('#wh-btn-member-me');
    
    btnsAll.forEach(btn => {
        btn.className = mode === 'all' 
            ? 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all whitespace-nowrap' 
            : 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all bg-transparent whitespace-nowrap';
    });
    
    btnsMe.forEach(btn => {
        btn.className = mode === 'me' 
            ? 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all whitespace-nowrap' 
            : 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all bg-transparent whitespace-nowrap';
    });
    
    window.updateWhDashboard();
    window.renderWhView();
};

window.updateWhWeekDisplay = function(weekStr) {
    if(!weekStr) return;
    const displayEl = document.getElementById('wh-week-display');
    if (displayEl) displayEl.innerText = window.formatWeekToKorean(weekStr);
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
    fetchWorkPlansForContext(); 
    
    if (!window.todayBadgeInitialized && window.userProfile) {
        window.initTodayBadge();
        window.todayBadgeInitialized = true;
    }
};

window.changeWhWeek = function(offset) {
    const picker = document.getElementById('wh-week-picker');
    if (!picker) return;
    
    const parts = picker.value.split('-W');
    if (parts.length === 2) {
        const year = parseInt(parts[0]);
        const week = parseInt(parts[1]);
        const d = new Date(year, 0, (parseInt(week) + offset - 1) * 7 + 1);
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
    const { start, end } = window.getDatesFromWeek(picker.value);
    
    let startStr, endStr;
    
    if (window.whStatMode === 'year') {
        const y = start.getFullYear();
        startStr = `${y}-01-01`;
        endStr = `${y}-12-31`;
    } else if (window.whStatMode === 'month') {
        const y = start.getFullYear();
        const m = start.getMonth();
        startStr = window.getLocalDateStr(new Date(y, m, 1));
        endStr = window.getLocalDateStr(new Date(y, m + 1, 0));
    } else {
        const y = start.getFullYear();
        const m = start.getMonth();
        startStr = window.getLocalDateStr(new Date(y, m - 1, 1));
        endStr = window.getLocalDateStr(new Date(y, m + 2, 0));
    }

    const q = query(collection(db, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
    
    worklogsUnsubscribe = onSnapshot(q, (snapshot) => {
        window.currentWorkLogs = [];
        snapshot.forEach(doc => window.currentWorkLogs.push({ id: doc.id, ...doc.data() }));
        window.updateWhDashboard();
        window.renderWhView();
    });
}

function fetchWorkPlansForContext() {
    if (workplansUnsubscribe) workplansUnsubscribe();
    const picker = document.getElementById('wh-week-picker');
    if(!picker) return;
    
    const { start } = window.getDatesFromWeek(picker.value);
    const targetYear = start.getFullYear().toString();
    
    const q = query(collection(db, "work_plans"), where("year", "==", targetYear));
    
    workplansUnsubscribe = onSnapshot(q, (snapshot) => {
        window.currentWorkPlans = [];
        snapshot.forEach(doc => window.currentWorkPlans.push({ id: doc.id, ...doc.data() }));
        window.updateWhDashboard(); 
    });
}

window.setWhStatMode = function(mode) {
    window.whStatMode = mode;
    const btnW = document.getElementById('wh-btn-period-week');
    const btnM = document.getElementById('wh-btn-period-month');
    const btnY = document.getElementById('wh-btn-period-year');
    
    [btnW, btnM, btnY].forEach(btn => {
        if(btn) btn.className = 'px-4 py-1.5 text-xs font-bold text-slate-600 bg-transparent transition-all hover:bg-slate-100 rounded-full';
    });

    if(mode === 'week') {
        if(btnW) btnW.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all';
        document.getElementById('wh-dash-period-label').innerHTML = '주간 총 투입 <span class="text-[9px] font-normal">(승인완료)</span>';
        document.getElementById('wh-chart-trend-title').innerText = '일자별 투입 추이 (MD)';
    } else if (mode === 'month') {
        if(btnM) btnM.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all';
        document.getElementById('wh-dash-period-label').innerHTML = '월간 총 투입 <span class="text-[9px] font-normal">(승인완료)</span>';
        document.getElementById('wh-chart-trend-title').innerText = '주차별 투입 추이 (MD)';
    } else {
        if(btnY) btnY.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white shadow-sm rounded-full transition-all';
        document.getElementById('wh-dash-period-label').innerHTML = '연간 총 투입 <span class="text-[9px] font-normal">(승인완료)</span>';
        document.getElementById('wh-chart-trend-title').innerText = '월별 투입 추이 (MD)';
    }
    
    fetchWorkLogsForContext();
    fetchWorkPlansForContext();
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

function renderCustomPersonUI(personMap) {
    const container = document.getElementById('wh-ui-person');
    const titleEl = document.getElementById('wh-ui-person-title');
    if (!container) return;

    let sortedData = Object.entries(personMap).map(([name, hours]) => ({ name, md: hours / 8 })).sort((a, b) => b.md - a.md);
    if (titleEl) titleEl.innerText = `인원별 누적 투입 (전체 ${sortedData.length}명)`;

    if (sortedData.length === 0) {
        container.innerHTML = '<div class="text-[10px] text-slate-400 text-center py-4 font-bold">데이터 없음</div>';
        return;
    }

    const maxMd = Math.max(...sortedData.map(d => d.md), 0.1); 
    let html = '<div class="flex flex-col gap-3">';
    sortedData.forEach(d => {
        const pct = (d.md / maxMd) * 100;
        html += `
        <div class="flex flex-col gap-1">
            <div class="flex justify-between items-end text-[11px] font-bold text-slate-700">
                <span>${d.name}</span>
                <span class="text-indigo-600">${d.md.toFixed(1)} MD</span>
            </div>
            <div class="w-full h-2.5 bg-slate-100 rounded-sm overflow-hidden flex">
                <div class="h-full bg-indigo-400 rounded-sm transition-all duration-500" style="width: ${pct}%; background-image: repeating-linear-gradient(to right, transparent, transparent 4px, rgba(255,255,255,0.7) 4px, rgba(255,255,255,0.7) 6px);"></div>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderCustomTypeUI(typeMap, totalMDStr) {
    const container = document.getElementById('wh-ui-type');
    const titleEl = document.getElementById('wh-ui-type-title');
    if (!container) return;

    let sortedData = Object.entries(typeMap).map(([type, hours]) => ({ type, md: hours / 8 })).sort((a, b) => b.md - a.md);
    let totalMD = parseFloat(totalMDStr) || 1;

    if (titleEl) titleEl.innerText = `작업 구분별 비율 (${sortedData.length}개 항목)`;

    if (sortedData.length === 0) {
        container.innerHTML = '<div class="text-[10px] text-slate-400 text-center py-4 font-bold">데이터 없음</div>';
        return;
    }

    const colors = ['bg-indigo-500', 'bg-purple-500', 'bg-sky-500', 'bg-teal-500', 'bg-blue-500', 'bg-rose-500', 'bg-amber-500', 'bg-slate-500'];
    const textColors = ['text-indigo-600', 'text-purple-600', 'text-sky-600', 'text-teal-600', 'text-blue-600', 'text-rose-600', 'text-amber-600', 'text-slate-600'];

    let stackedBarHtml = '<div class="w-full h-3 rounded-full flex overflow-hidden mb-5 shadow-sm mt-2">';
    sortedData.forEach((d, i) => {
        const pct = (d.md / totalMD) * 100;
        const color = colors[i % colors.length];
        stackedBarHtml += `<div class="h-full ${color} transition-all duration-500" style="width: ${pct}%; border-right: 1px solid white;"></div>`;
    });
    stackedBarHtml += '</div>';

    let gridHtml = '<div class="grid grid-cols-2 gap-y-3 gap-x-2">';
    sortedData.forEach((d, i) => {
        const pct = ((d.md / totalMD) * 100).toFixed(0);
        const bgColor = colors[i % colors.length];
        const textColor = textColors[i % textColors.length];
        
        gridHtml += `
        <div class="flex items-start gap-1.5">
            <div class="w-2 h-2 rounded-full ${bgColor} mt-[3px] shrink-0"></div>
            <div class="flex flex-col">
                <span class="text-[10px] font-bold text-slate-600 leading-tight">${d.type}</span>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-xs font-black ${textColor}">${pct}%</span>
                    <span class="text-[9px] font-medium text-slate-400">(${d.md.toFixed(1)})</span>
                </div>
            </div>
        </div>`;
    });
    gridHtml += '</div>';

    container.innerHTML = stackedBarHtml + gridHtml;
}

window.whShowDashPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    const drop = document.getElementById('wh-dash-pjt-autocomplete');
    if (!drop) return;

    if(!val) { drop.classList.add('hidden'); return; }

    let searchPool = [];
    let seenCodes = new Set();

    (window.pjtCodeMasterList || []).forEach(p => {
        if (p.code && !seenCodes.has(p.code)) {
            seenCodes.add(p.code);
            searchPool.push(p);
        }
    });
    (window.currentWorkLogs || []).forEach(l => {
        if (l.projectCode && !seenCodes.has(l.projectCode)) {
            seenCodes.add(l.projectCode);
            searchPool.push({code: l.projectCode, name: l.projectName || ''});
        }
    });

    let matches = searchPool.filter(p => {
        let code = (p.code || '').toLowerCase();
        let name = (p.name || '').toLowerCase();
        return code.includes(val) || name.includes(val) || 
               (window.matchString && window.matchString(val, p.code)) || 
               (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        drop.innerHTML = matches.map(m => {
            let sName = m.name ? m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '';
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            return `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-xs font-bold text-slate-700 border-b border-slate-50 last:border-0 transition-colors flex items-center gap-2" onmousedown="window.whSelectDashPjt('${sCode}')"><span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-black tracking-wide shrink-0">[${sCode}]</span><span class="truncate flex-1">${sName}</span></li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.whSelectDashPjt = function(code) {
    const input = document.getElementById('wh-search-pjt');
    if(input) {
        input.value = code; 
        window.updateWhDashboard();
    }
    const drop = document.getElementById('wh-dash-pjt-autocomplete');
    if (drop) drop.classList.add('hidden');
};

window.updateWhDashboard = function() {
    window.whPjtSearch = document.getElementById('wh-search-pjt')?.value.toLowerCase() || '';
    
    const picker = document.getElementById('wh-week-picker');
    const { start, end } = window.getDatesFromWeek(picker.value);
    
    let targetStart = start;
    let targetEnd = end;

    if (window.whStatMode === 'year') {
        const y = start.getFullYear();
        targetStart = new Date(y, 0, 1);
        targetEnd = new Date(y, 11, 31);
    } else if (window.whStatMode === 'month') {
        const y = start.getFullYear();
        const m = start.getMonth();
        targetStart = new Date(y, m, 1);
        targetEnd = new Date(y, m + 1, 0);
    }

    const tStartStr = window.getLocalDateStr(targetStart);
    const tEndStr = window.getLocalDateStr(targetEnd);

    let baseData = window.currentWorkLogs.filter(l => l.isConfirmed && l.date >= tStartStr && l.date <= tEndStr);
    
    if (window.whMemberMode === 'me' && window.userProfile) {
        baseData = baseData.filter(l => l.authorName === window.userProfile.name);
    }
    
    if (window.whPjtSearch) {
        baseData = baseData.filter(l => {
            const pCode = (l.projectCode || '').toLowerCase();
            const pName = (l.projectName || '').toLowerCase();
            const search = window.whPjtSearch.trim();
            return pCode.includes(search) || pName.includes(search) || 
                   (window.matchString && window.matchString(search, pCode)) || 
                   (window.matchString && window.matchString(search, pName));
        });
    }

    let totalHours = 0;
    let personMap = {}, typeMap = {}, trendMap = {}, locMap = {}, pjtMap = {};
    let dailyWorkers = new Set(); 

    baseData.forEach(log => {
        let h = parseFloat(log.hours) || 0;
        totalHours += h;
        
        personMap[log.authorName] = (personMap[log.authorName] || 0) + h;
        typeMap[log.workType] = (typeMap[log.workType] || 0) + h;
        
        if (h > 0) {
            dailyWorkers.add(log.date + '_' + log.authorName);
        }
        
        let trendKey = '';
        if (window.whStatMode === 'week') {
            const d = new Date(log.date);
            const days = ['일','월','화','수','목','금','토'];
            trendKey = `${d.getDate()}일(${days[d.getDay()]})`;
        } else if (window.whStatMode === 'month') {
            const d = new Date(log.date);
            let wStr = window.getWeekString ? window.getWeekString(d).split('-')[1] : '';
            trendKey = wStr ? wStr.replace('W', '') + '주차' : log.date;
        } else {
            const d = new Date(log.date);
            trendKey = `${d.getMonth() + 1}월`;
        }
        trendMap[trendKey] = (trendMap[trendKey] || 0) + h;

        let loc = log.location || '사내';
        if (!locMap[loc]) locMap[loc] = new Set();
        locMap[loc].add(log.authorName);

        let pNameKey = log.projectCode ? `[${log.projectCode}] ${log.projectName||''}` : (log.projectName || '미분류');
        pjtMap[pNameKey] = (pjtMap[pNameKey] || 0) + h;
    });

    const totalMD = (totalHours / 8).toFixed(1);
    const actualHeadcount = dailyWorkers.size;

    document.getElementById('wh-dash-total-md').innerText = totalMD;

    let totalPlanMd = 0;
    let totalPlanHc = 0;
    
    let planData = window.currentWorkPlans.filter(p => p.status === 'confirmed');
    
    let targetPeriods = [];
    if (window.whStatMode === 'year') {
        const y = start.getFullYear().toString();
        targetPeriods = planData.map(p => p.period).filter(per => per.startsWith(y));
    } else if (window.whStatMode === 'month') {
        const y = start.getFullYear();
        const m = start.getMonth() + 1;
        const weeksInMonth = window.getWeeksInMonthForPlan(y, m);
        targetPeriods = weeksInMonth;
    } else {
        targetPeriods = [picker.value];
    }
    
    planData = planData.filter(p => targetPeriods.includes(p.period));

    if (window.whPjtSearch) {
        planData = planData.filter(p => {
            const pCode = (p.projectCode || '').toLowerCase();
            const pName = (p.projectName || '').toLowerCase();
            const search = window.whPjtSearch.trim();
            return pCode.includes(search) || pName.includes(search) || 
                   (window.matchString && window.matchString(search, pCode)) || 
                   (window.matchString && window.matchString(search, pName));
        });
    }

    planData.forEach(p => {
        if(p.daily) {
            for(let date in p.daily) {
                if (date >= tStartStr && date <= tEndStr) {
                    totalPlanHc += parseFloat(p.daily[date].hc) || 0;
                    totalPlanMd += parseFloat(p.daily[date].md) || 0;
                }
            }
        }
    });

    const planMdEl = document.getElementById('wh-dash-plan-md');
    const actualMdEl = document.getElementById('wh-dash-actual-md');
    const planHcEl = document.getElementById('wh-dash-plan-hc');
    const actualHcEl = document.getElementById('wh-dash-actual-hc');
    const planRateEl = document.getElementById('wh-dash-plan-rate');
    const planBarEl = document.getElementById('wh-dash-plan-bar');

    if(planMdEl) planMdEl.innerText = `${totalPlanMd.toFixed(1)}`;
    if(actualMdEl) actualMdEl.innerText = `${totalMD}`;
    if(planHcEl) planHcEl.innerText = `${totalPlanHc.toFixed(1)}`;
    if(actualHcEl) actualHcEl.innerText = `${actualHeadcount}`;
    
    if(planRateEl && planBarEl) {
        if(totalPlanMd > 0) {
            let rate = (parseFloat(totalMD) / totalPlanMd * 100).toFixed(0);
            planRateEl.innerText = `${rate}%`;
            planBarEl.style.width = `${Math.min(rate, 100)}%`;
            
            if (rate > 100) {
                planRateEl.classList.replace('text-indigo-600', 'text-rose-600');
                planBarEl.classList.replace('bg-indigo-500', 'bg-rose-500');
            } else {
                planRateEl.classList.replace('text-rose-600', 'text-indigo-600');
                planBarEl.classList.replace('bg-rose-500', 'bg-indigo-500');
            }
        } else {
            planRateEl.innerText = `0%`;
            planBarEl.style.width = `0%`;
            planRateEl.classList.replace('text-rose-600', 'text-indigo-600');
            planBarEl.classList.replace('bg-rose-500', 'bg-indigo-500');
        }
    }

    const breakdownEl = document.getElementById('wh-dash-pjt-breakdown');
    if (breakdownEl) {
        let breakdownHtml = '';
        let sortedPjts = Object.entries(pjtMap).sort((a,b)=>b[1]-a[1]);
        
        sortedPjts.forEach(p => {
            breakdownHtml += `
                <div class="flex justify-between items-center text-[11px] mb-1 group">
                    <span class="text-slate-500 font-bold truncate pr-2 group-hover:text-indigo-600 transition-colors" title="${p[0]}"><i class="fa-solid fa-folder-open text-indigo-300 mr-1 group-hover:text-indigo-500"></i>${p[0]}</span>
                    <span class="text-indigo-600 font-black shrink-0 bg-indigo-50 px-1.5 py-0.5 rounded shadow-sm">${(p[1]/8).toFixed(1)}</span>
                </div>
            `;
        });
        if(sortedPjts.length === 0) {
            breakdownHtml = '<div class="text-[10px] text-slate-400 text-center py-2 font-bold">집계된 데이터 없음</div>';
        }
        breakdownEl.innerHTML = breakdownHtml;
    }

    renderCustomPersonUI(personMap);
    renderCustomTypeUI(typeMap, totalMD);
    
    let cTitle = '일자별 투입 추이 (MD)';
    if(window.whStatMode === 'month') cTitle = '주차별 투입 추이 (MD)';
    if(window.whStatMode === 'year') cTitle = '월별 투입 추이 (MD)';
    document.getElementById('wh-chart-trend-title').innerText = cTitle;
    
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
    else {
        if(window.whStatMode === 'year') {
            sortedData.sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
        } else {
            sortedData.sort((a,b)=>a[0].localeCompare(b[0]));
        }
    }

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
            layout: { padding: { bottom: 10 } },
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
        if (window.whMemberMode === 'me' && log.authorName !== window.userProfile?.name) {
            return false;
        }
        if (window.whFilters.status) {
            const isConf = String(!!log.isConfirmed) === window.whFilters.status;
            if (!isConf) return false;
        }
        if (window.whFilters.loc && log.location !== window.whFilters.loc) return false;
        if (window.whFilters.type && log.workType !== window.whFilters.type) return false;
        
        if (window.whFilters.text) {
            const s = window.whFilters.text.trim();
            const fullStr = `${log.authorName} ${log.projectCode} ${log.projectName} ${log.content}`.toLowerCase();
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
    
    let targetMembers = window.teamMembers || [];
    if (window.whMemberMode === 'me') {
        targetMembers = targetMembers.filter(m => m.name === window.userProfile?.name);
        if (targetMembers.length === 0 && window.userProfile) {
            targetMembers = [{ name: window.userProfile.name }];
        }
    }

    targetMembers.forEach(member => {
        bodyHtml += `<tr class="hover:bg-slate-50/50 transition-colors group h-24">`;
        bodyHtml += `<td class="p-3 text-center font-bold text-slate-700 border-r border-b border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">${member.name}</td>`;
        
        for (let i = 0; i < 7; i++) {
            let dateStr = weekDates[i];
            let d = new Date(dateStr);
            let isHoliday = isWhHoliday(d);
            let bgClass = isHoliday ? 'bg-rose-50/30' : '';
            
            let rawLogs = window.currentWorkLogs.filter(l => l.date === dateStr && l.authorName === member.name); 
            
            bodyHtml += `<td class="p-1.5 border-r border-b border-slate-200 align-top ${bgClass} wh-cell relative min-w-[140px] cursor-pointer hover:bg-indigo-50/30 transition-colors" data-date="${dateStr}" data-author="${member.name}" onmousedown="window.whCellMouseDown(event, this)" onmouseenter="window.whCellMouseEnter(event, this)" onclick="if(window.whDragDist < 5) window.openWhInputModal('${dateStr}', '${member.name}');">`;
            
            rawLogs.forEach(log => {
                let isFilteredOut = !filteredLogs.includes(log);
                let opacityClass = isFilteredOut ? 'opacity-30 grayscale' : '';
                let confClass = log.isConfirmed ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300';
                let selClass = window.whSelectedCells.has(log.id) ? 'ring-2 ring-indigo-500 shadow-md transform scale-[1.02]' : '';
                
                bodyHtml += `<div class="p-1.5 rounded-lg border ${confClass} ${opacityClass} ${selClass} text-[10px] mb-1.5 transition-all duration-200" data-logid="${log.id}" onclick="event.stopPropagation(); if(window.whDragDist < 5) window.openWhInputModal('${dateStr}', '${member.name}');">
                    <div class="font-bold truncate text-[11px]" title="${log.projectName||''}"><span class="text-slate-400 font-medium mr-0.5">[${log.location||'사내'}]</span>${log.projectCode||'PJT미지정'}</div>
                    <div class="flex justify-between items-center mt-1 pt-1 border-t border-slate-100/50"><span class="font-medium text-slate-500">${log.workType}</span><span class="font-black text-indigo-600 bg-white/50 px-1.5 py-0.5 rounded shadow-sm">${log.hours}h</span></div>
                </div>`;
            });
            bodyHtml += `</td>`;
        }
        bodyHtml += `</tr>`;
    });
    
    if(targetMembers.length === 0) {
        bodyHtml = `<tr><td colspan="8" class="p-10 text-center text-slate-400 font-bold">등록된 팀원 또는 현황이 없습니다.</td></tr>`;
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
    for(let i=0; i<firstDay; i++) html += `<div class="bg-slate-50 min-h-[140px]"></div>`;

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
        const MAX_DISPLAY = 3;
        let displayLogs = logs.slice(0, MAX_DISPLAY);

        displayLogs.forEach(log => {
            let confClass = log.isConfirmed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 border-slate-200';
            logsHtml += `<div class="text-[10px] ${confClass} border px-1.5 py-1 rounded mb-1 truncate cursor-pointer hover:shadow-md transition-shadow shadow-sm" onclick="window.openWhInputModal('${dateStr}', '${log.authorName}')">
                <span class="font-black text-indigo-700 bg-indigo-50 px-1 rounded mr-1">${log.authorName}</span>${log.projectCode||'미지정'} <span class="font-bold text-slate-500">(${log.hours}h)</span>
            </div>`;
        });

        if (logs.length > MAX_DISPLAY) {
            logsHtml += `<div class="text-[10px] font-bold text-slate-400 text-center hover:text-indigo-500 cursor-pointer mt-1 bg-slate-50 py-1 rounded" onclick="window.openWhInputModal('${dateStr}', '')">+${logs.length - MAX_DISPLAY}개 더보기</div>`;
        }

        html += `<div class="bg-white p-2 min-h-[140px] hover:bg-slate-50 transition-colors relative group border-t-2 ${isToday ? 'border-t-indigo-500' : 'border-t-transparent'} flex flex-col cursor-pointer" onclick="window.openWhInputModal('${dateStr}', '')">
            <div class="text-xs font-black text-center mb-2 ${dateClass} shrink-0">${i}</div>
            <div class="flex-1 flex flex-col">${logsHtml}</div>
            <button class="absolute top-1 right-1 w-5 h-5 bg-white border border-slate-200 shadow-sm rounded flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-300 opacity-0 group-hover:opacity-100 transition-all z-10">
                <i class="fa-solid fa-plus text-[8px]"></i>
            </button>
        </div>`;
    }
    grid.innerHTML = html;
}

window.whCellMouseDown = function(e, cell) {
    if(e.button !== 0) return; 
    
    window.isWhDragging = true;
    if (!e.shiftKey && !e.ctrlKey) {
        window.whClearSelection();
    }
    
    const logs = cell.querySelectorAll('div[data-logid]');
    logs.forEach(logDiv => {
        const id = logDiv.dataset.logid;
        window.whSelectedCells.add(id);
        logDiv.classList.add('ring-2', 'ring-indigo-500', 'shadow-md', 'transform', 'scale-[1.02]');
    });
    
    updateWhFloatingBar();
    document.addEventListener('mouseup', window.whCellMouseUp);
};

window.whCellMouseEnter = function(e, cell) {
    if(window.isWhDragging) {
        const logs = cell.querySelectorAll('div[data-logid]');
        logs.forEach(logDiv => {
            const id = logDiv.dataset.logid;
            window.whSelectedCells.add(id);
            logDiv.classList.add('ring-2', 'ring-indigo-500', 'shadow-md', 'transform', 'scale-[1.02]');
        });
        updateWhFloatingBar();
    }
};

window.whCellMouseUp = function() {
    window.isWhDragging = false;
    document.removeEventListener('mouseup', window.whCellMouseUp);
};

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
    document.getElementById('wh-modal-subtitle').innerHTML = `<i class="fa-regular fa-calendar text-indigo-400 mr-1.5"></i> ${dateStr} <span class="mx-3 text-slate-300">|</span> <i class="fa-solid fa-user text-indigo-400 mr-1.5"></i> ${authorName}`;

    const tbody = document.getElementById('wh-input-tbody');
    tbody.innerHTML = '';
    window.whIsDirty = false;

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

window.attemptCloseWhModal = function() {
    if (window.whIsDirty) {
        if (!confirm("작성/수정 중인 내용이 있습니다. 저장하지 않고 창을 닫으시겠습니까?")) {
            return;
        }
    }
    window.closeWhInputModal();
};

window.closeWhInputModal = function() {
    document.getElementById('wh-input-modal').classList.add('hidden');
    document.getElementById('wh-input-modal').classList.remove('flex');
    document.removeEventListener('keydown', handleWhModalKeydown);
    
    document.querySelectorAll('.pjt-auto-drop').forEach(el => el.remove());
    window.whIsDirty = false;
};

function handleWhModalKeydown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        window.attemptCloseWhModal();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        window.saveWhInputData();
    }
}

window.whAddInputRow = function() {
    const tbody = document.getElementById('wh-input-tbody');
    const rowCount = tbody.querySelectorAll('tr').length + 1;
    appendWhInputRow(null, rowCount);
    window.whIsDirty = true;
};

window.whRemoveInputRow = function(btn) {
    window.whIsDirty = true;
    const tr = btn.closest('tr');
    tr.style.opacity = '0';
    tr.style.transform = 'translateX(-10px)';
    setTimeout(() => { tr.remove(); }, 200);
}

function appendWhInputRow(logData = null, index = 1) {
    const tbody = document.getElementById('wh-input-tbody');
    const tr = document.createElement('tr');
    tr.className = 'wh-input-row hover:bg-slate-50/50 transition-all duration-300 border-b border-slate-100 group';
    
    const uniqueId = 'wh-pjt-input-' + Date.now() + '-' + index;
    const pName = logData ? (logData.projectName || '') : '';
    const pCode = logData ? (logData.projectCode || pName || '') : ''; 
    const pId = logData ? (logData.projectId || '') : '';

    let typeOptions = WH_TYPES.map(t => `<option value="${t}" ${logData && logData.workType === t ? 'selected' : ''}>${t}</option>`).join('');
    let locOptions = WH_LOCS.map(l => `<option value="${l}" ${logData && logData.location === l ? 'selected' : ''}>${l}</option>`).join('');
    
    let isConf = logData && logData.isConfirmed ? 'checked' : '';
    let isAdmin = window.userProfile?.role === 'admin';
    let confDisabled = isAdmin ? '' : 'disabled';
    
    let idInput = logData ? `<input type="hidden" class="row-id" value="${logData.id}">` : `<input type="hidden" class="row-id" value="">`;
    let pNameHidden = `<input type="hidden" class="row-pjt-name-hidden" value="${pName}">`;

    tr.innerHTML = `
        <td class="p-3 text-center text-slate-400 font-extrabold text-xs">${index}${idInput}</td>
        <td class="p-3 relative">
            <div class="relative flex items-center">
                <i class="fa-solid fa-magnifying-glass absolute left-3 text-indigo-300 text-xs"></i>
                <input type="text" id="${uniqueId}" class="row-pjt-name w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold text-indigo-700 placeholder-slate-400 bg-slate-50 hover:bg-slate-100 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" value="${pCode}" placeholder="코드/명칭 검색 (초성 연동)" oninput="window.whIsDirty=true; window.whShowPjtAuto(this)" autocomplete="off">
            </div>
            <input type="hidden" class="row-pjt-id" value="${pId}">
            <input type="hidden" class="row-pjt-code" value="${pCode}">
            ${pNameHidden}
        </td>
        <td class="p-3">
            <select class="row-type w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer outline-none">${typeOptions}</select>
        </td>
        <td class="p-3">
            <select class="row-loc w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer outline-none">${locOptions}</select>
        </td>
        <td class="p-3">
            <input type="number" step="0.5" min="0" class="row-hours w-full border border-indigo-100 bg-indigo-50/60 rounded-xl px-3 py-2.5 text-sm font-black text-center text-indigo-600 placeholder-indigo-300 hover:bg-indigo-100/60 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none shadow-inner" value="${logData ? logData.hours : ''}" placeholder="0.0" oninput="window.whIsDirty=true;">
        </td>
        <td class="p-3">
            <input type="text" class="row-content w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 placeholder-slate-400 bg-slate-50 hover:bg-slate-100 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" value="${logData ? logData.content || '' : ''}" placeholder="상세 작업 내용 입력" oninput="window.whIsDirty=true;">
        </td>
        <td class="p-3 text-center">
            <label class="relative inline-flex items-center cursor-pointer justify-center mt-1">
                <input type="checkbox" class="row-conf sr-only peer" ${isConf} ${confDisabled} onchange="window.whIsDirty=true;">
                <div class="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 shadow-inner"></div>
            </label>
        </td>
        <td class="p-3 text-center">
            <button onclick="window.whRemoveInputRow(this)" class="text-slate-300 hover:text-rose-500 hover:bg-rose-50 w-8 h-8 rounded-xl flex items-center justify-center mx-auto transition-all"><i class="fa-solid fa-trash-can"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
}

window.whShowPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    
    let drop = document.getElementById('wh-pjt-autocomplete');
    if (!drop) {
        drop = document.createElement('ul');
        drop.id = 'wh-pjt-autocomplete';
        drop.className = 'fixed z-[99999] bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl max-h-56 overflow-y-auto text-sm custom-scrollbar py-2 hidden';
        document.body.appendChild(drop);
    }
    
    const tr = input.closest('tr');
    tr.querySelector('.row-pjt-id').value = '';
    tr.querySelector('.row-pjt-code').value = '';

    if(!val) { drop.classList.add('hidden'); return; }

    let searchPool = [];
    let seenCodes = new Set();

    (window.pjtCodeMasterList || []).forEach(p => {
        if (p.code && !seenCodes.has(p.code)) {
            seenCodes.add(p.code);
            searchPool.push(p);
        }
    });
    (window.currentProjectStatusList || []).forEach(p => {
        if (p.code && !seenCodes.has(p.code)) {
            seenCodes.add(p.code);
            searchPool.push(p);
        }
    });

    let matches = searchPool.filter(p => {
        let code = (p.code || '').toLowerCase();
        let name = (p.name || '').toLowerCase();
        return code.includes(val) || name.includes(val) || 
               (window.matchString && window.matchString(val, p.code)) || 
               (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.position = 'fixed';
        drop.style.left = `${rect.left}px`;
        drop.style.top = `${rect.bottom + 4}px`;
        drop.style.width = `${Math.max(rect.width, 300)}px`; 

        drop.innerHTML = matches.map(m => {
            let sName = m.name ? m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '';
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            return `<li class="px-5 py-3 hover:bg-indigo-50/80 cursor-pointer text-xs border-b border-slate-50 last:border-0 transition-all flex items-center gap-2" onmousedown="window.whSelectPjt('${input.id}', '${m.id}', '${sCode}', '${sName}')"><span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-black tracking-wide shrink-0">[${sCode}]</span><span class="text-slate-600 font-bold truncate flex-1">${m.name}</span></li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.whSelectPjt = function(inputId, pId, pCode, pName) {
    const input = document.getElementById(inputId);
    if(input) {
        input.value = pCode; 
        const tr = input.closest('tr');
        tr.querySelector('.row-pjt-id').value = pId;
        tr.querySelector('.row-pjt-code').value = pCode;
        tr.querySelector('.row-pjt-name-hidden').value = pName; 
    }
    
    window.whIsDirty = true;
    const drop = document.getElementById('wh-pjt-autocomplete');
    if (drop) drop.classList.add('hidden');
};

document.addEventListener('click', function(e) {
    const d = document.getElementById('wh-pjt-autocomplete');
    if (d && !d.classList.contains('hidden') && !e.target.closest('#wh-pjt-autocomplete') && !e.target.closest('.row-pjt-name')) {
        d.classList.add('hidden');
    }
});

// 💡 2. 평일 8시간 / 주말 6시간 제한 및 알림 처리
window.saveWhInputData = async function() {
    const dateStr = document.getElementById('wh-modal-date').value;
    const authorName = document.getElementById('wh-modal-author').value;
    const rows = document.querySelectorAll('.wh-input-row');
    
    let toSave = [];
    let totalHours = 0; // 💡 일일 총 입력 시간 저장 변수

    rows.forEach(tr => {
        const id = tr.querySelector('.row-id').value;
        const projectCodeInput = tr.querySelector('.row-pjt-name').value.trim(); 
        const projectId = tr.querySelector('.row-pjt-id').value;
        const projectCode = tr.querySelector('.row-pjt-code').value || projectCodeInput; 
        const projectName = tr.querySelector('.row-pjt-name-hidden').value || '';
        
        const workType = tr.querySelector('.row-type').value;
        const location = tr.querySelector('.row-loc').value;
        const hours = parseFloat(tr.querySelector('.row-hours').value) || 0;
        const content = tr.querySelector('.row-content').value.trim();
        const isConfirmed = tr.querySelector('.row-conf').checked;

        if (hours > 0 && (projectCodeInput || projectName || content)) {
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
            totalHours += hours; // 💡 시간 누적 합산
        }
    });

    // 💡 저장 전 시간 제한 검증
    if (dateStr) {
        const d = new Date(dateStr);
        const isWeekend = (d.getDay() === 0 || d.getDay() === 6); // 0:일요일, 6:토요일
        const maxLimit = isWeekend ? 6 : 8;

        if (totalHours > maxLimit) {
            const dayType = isWeekend ? "주말" : "평일";
            alert(`⚠️ 하루 최대 입력 가능 시간을 초과했습니다!\n\n- ${dayType} 최대 허용 시간: ${maxLimit}시간\n- 현재 총 입력 시간: ${totalHours}시간\n\n시간을 줄여서 다시 저장해주세요.`);
            return; // 🚨 여기서 중단 (DB 저장 안됨)
        }
    }

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
        window.whIsDirty = false; 
        window.showToast("투입공수가 저장되었습니다.");
        window.closeWhInputModal();
    } catch(e) {
        window.showToast("저장 실패", "error");
    }
};

window.exportWorkhoursExcel = async function(isDriveUpload = false, driveFolderId = null) {
    if (typeof window.ExcelJS === 'undefined') return window.showToast("ExcelJS 모듈이 필요합니다.", "error");
    
    try {
        if(!isDriveUpload) window.showToast("프리미엄 엑셀 리포트를 생성 중입니다...", "success");
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
        
        if (window.whMemberMode === 'me' && window.userProfile) {
            monthlyLogs = monthlyLogs.filter(l => l.authorName === window.userProfile.name);
        }

        let tMd = 0; let pMap = {}; let pjtMap = {};
        
        monthlyLogs.forEach(l => {
            let md = l.hours / 8;
            tMd += md;
            pMap[l.authorName] = (pMap[l.authorName] || 0) + md;
            let pName = l.projectCode || l.projectName || '미분류';
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
        if (window.whMemberMode === 'me' && window.userProfile) {
            sortedLogs = sortedLogs.filter(l => l.authorName === window.userProfile.name);
        }
        
        sortedLogs.forEach(l => {
            let row = ws2.addRow({
                date: l.date,
                name: l.authorName,
                pjt: l.projectCode ? `[${l.projectCode}] ${l.projectName||''}` : (l.projectName || '프로젝트 미지정'),
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
        const modeStr = window.whMemberMode === 'me' ? '_개인' : '';
        const fileName = `AXBIS_투입공수보고서_${yStr}년${mStr}월${modeStr}.xlsx`;

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

// ==========================================
// 💡 프로젝트별 투입 계획 관리 (팀장용) 로직 (주간 기반 캘린더 그리드)
// ==========================================

window.handleWhPlanWeekChange = function(val) {
    if (!val) return;
    const displayEl = document.getElementById('wh-plan-week-display');
    if (displayEl) displayEl.innerText = window.formatWeekToKorean(val);
    window.loadWhPlans();
};

window.openWhPlanModal = function() {
    if (!window.userProfile || window.userProfile.role !== 'admin') {
        return window.showToast("팀장(관리자) 권한이 필요합니다.", "error");
    }
    
    const picker = document.getElementById('wh-week-picker');
    const planWeekInput = document.getElementById('wh-plan-week');
    
    if (picker && picker.value && planWeekInput) {
        planWeekInput.value = picker.value;
        window.handleWhPlanWeekChange(picker.value);
    }

    document.getElementById('wh-plan-modal').classList.remove('hidden');
    document.getElementById('wh-plan-modal').classList.add('flex');
};

window.closeWhPlanModal = function() {
    document.getElementById('wh-plan-modal').classList.add('hidden');
    document.getElementById('wh-plan-modal').classList.remove('flex');
};

window.calcWhPlanRow = function(inputEl) {
    const tr = inputEl.closest('tr');
    let totalHc = 0;
    let totalMd = 0;
    
    tr.querySelectorAll('.p-day-hc').forEach(el => {
        totalHc += parseFloat(el.value) || 0;
    });
    tr.querySelectorAll('.p-day-md').forEach(el => {
        totalMd += parseFloat(el.value) || 0;
    });

    tr.querySelector('.plan-row-headcount').innerText = totalHc.toFixed(1);
    tr.querySelector('.plan-row-md').innerText = totalMd.toFixed(1);
};

window.loadWhPlans = function() {
    const currentPeriod = document.getElementById('wh-plan-week').value;
    if (!currentPeriod) return;

    const { start } = window.getDatesFromWeek(currentPeriod);
    const thead = document.getElementById('wh-plan-grid-header');
    
    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    let weekDates = [];
    
    let headerHtml = `<th class="p-3 w-[260px] text-center border-r border-slate-200 sticky left-0 bg-slate-800 z-30">프로젝트 검색</th>`;
    for (let i = 0; i < 7; i++) {
        let d = new Date(start);
        d.setDate(d.getDate() + i);
        let dStr = window.getLocalDateStr(d);
        weekDates.push(dStr);
        let isHoliday = window.isWhHoliday && window.isWhHoliday(d);
        let txtClass = isHoliday ? 'text-rose-400' : 'text-slate-200';
        if (d.getDay() === 0) txtClass = 'text-rose-400'; 
        if (d.getDay() === 6) txtClass = 'text-blue-400';
        
        headerHtml += `<th class="p-2 min-w-[100px] text-center border-r border-slate-600 ${txtClass}"><div class="text-xs font-bold">${dayNames[i]}</div><div class="text-[9px] font-normal opacity-70">${dStr.substring(5).replace('-','/')}</div></th>`;
    }
    headerHtml += `<th class="p-3 w-[140px] text-center border-r border-slate-600 text-amber-300">주간 합계</th>
                   <th class="p-3 w-20 text-center border-r border-slate-600">상태</th>
                   <th class="p-3 w-12 text-center text-rose-400"><i class="fa-solid fa-trash-can"></i></th>`;
    thead.innerHTML = headerHtml;

    const plansForPeriod = window.currentWorkPlans.filter(p => p.period === currentPeriod);
    const tbody = document.getElementById('wh-plan-tbody');
    tbody.innerHTML = '';

    if (plansForPeriod.length > 0) {
        plansForPeriod.forEach(plan => appendWhPlanRow(plan, weekDates));
    } else {
        appendWhPlanRow(null, weekDates); 
    }
};

// 💡 뷰어 모드 토글 로직
window.setWhPlanViewMode = function(mode) {
    window.whPlanViewMode = mode;
    const btnW = document.getElementById('btn-plan-week');
    const btnM = document.getElementById('btn-plan-month');
    const ctrlW = document.getElementById('wh-plan-week-control');
    const ctrlM = document.getElementById('wh-plan-month-control');
    const btnAdd = document.getElementById('wh-plan-add-btn');
    const legend = document.getElementById('wh-plan-legend');
    
    const tblCont = document.getElementById('wh-plan-table-container');
    const calCont = document.getElementById('wh-plan-calendar-container');

    if (mode === 'week') {
        btnW.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all';
        btnM.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all bg-transparent';
        ctrlW.classList.remove('hidden'); ctrlW.classList.add('flex');
        ctrlM.classList.add('hidden'); ctrlM.classList.remove('flex');
        
        if(btnAdd) btnAdd.classList.remove('hidden');
        if(legend) legend.classList.remove('hidden');
        
        if(tblCont) { tblCont.classList.remove('hidden'); tblCont.classList.add('flex'); }
        if(calCont) { calCont.classList.add('hidden'); calCont.classList.remove('flex'); }
        
        window.loadWhPlans();
    } else {
        btnM.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all';
        btnW.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all bg-transparent';
        ctrlM.classList.remove('hidden'); ctrlM.classList.add('flex');
        ctrlW.classList.add('hidden'); ctrlW.classList.remove('flex');
        
        if(btnAdd) btnAdd.classList.add('hidden');
        if(legend) legend.classList.add('hidden');
        
        if(tblCont) { tblCont.classList.add('hidden'); tblCont.classList.remove('flex'); }
        if(calCont) { calCont.classList.remove('hidden'); calCont.classList.add('flex'); }
        
        // 월 선택기가 비어있으면 현재 주차의 월로 자동 세팅
        const monthInput = document.getElementById('wh-plan-month');
        if (!monthInput.value) {
            const picker = document.getElementById('wh-week-picker');
            if (picker && picker.value) {
                const { start } = window.getDatesFromWeek(picker.value);
                monthInput.value = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`;
            } else {
                const now = new Date();
                monthInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
            }
        }
        window.loadMonthlyPlanViewer();
    }
};

window.handleWhPlanMonthChange = function(val) {
    if(!val) return;
    window.loadMonthlyPlanViewer();
};

// 💡 개선: 프로젝트별 고유 색상 적용된 월간 달력 뷰어
window.loadMonthlyPlanViewer = function() {
    const monthVal = document.getElementById('wh-plan-month').value;
    if(!monthVal) return;
    const [yearStr, monthStr] = monthVal.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const weeks = window.getWeeksInMonthForPlan(year, month);
    const plansForMonth = window.currentWorkPlans.filter(p => weeks.includes(p.period));

    const grid = document.getElementById('wh-plan-calendar-grid');
    if(!grid) return;

    const firstDay = new Date(year, month - 1, 1).getDay();
    const lastDate = new Date(year, month, 0).getDate();

    let html = '';
    for(let i=0; i<firstDay; i++) {
        html += `<div class="bg-slate-50 min-h-[120px]"></div>`;
    }

    // 💡 프로젝트별 배정할 예쁜 다색 팔레트 세팅
    const colorPalette = [
        { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-white text-blue-600' },
        { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-white text-emerald-600' },
        { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-white text-amber-600' },
        { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-white text-purple-600' },
        { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-white text-rose-600' },
        { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', badge: 'bg-white text-cyan-600' },
        { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700', badge: 'bg-white text-fuchsia-600' },
        { bg: 'bg-lime-50', border: 'border-lime-200', text: 'text-lime-700', badge: 'bg-white text-lime-600' }
    ];
    
    let projectColorMap = {};
    let colorIndex = 0;

    for(let i=1; i<=lastDate; i++) {
        let dateStr = `${year}-${String(month).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let d = new Date(year, month - 1, i);
        
        let isHoliday = window.isWhHoliday && window.isWhHoliday(d);
        let txtClass = isHoliday ? 'text-rose-500' : 'text-slate-700';
        if (d.getDay() === 0) txtClass = 'text-rose-500';
        if (d.getDay() === 6) txtClass = 'text-blue-500';

        let isToday = dateStr === window.getLocalDateStr(new Date());
        let dateClass = isToday ? 'bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto shadow-md' : txtClass;

        // 해당 날짜의 계획 데이터 추출
        let dayPlans = [];
        plansForMonth.forEach(plan => {
            if (plan.daily && plan.daily[dateStr]) {
                const hc = parseFloat(plan.daily[dateStr].hc) || 0;
                const md = parseFloat(plan.daily[dateStr].md) || 0;
                if (hc > 0 || md > 0) {
                    dayPlans.push({
                        code: plan.projectCode || '미분류',
                        name: plan.projectName || '',
                        hc: hc,
                        md: md,
                        status: plan.status
                    });
                }
            }
        });

        let plansHtml = '';
        dayPlans.forEach(p => {
            if (!projectColorMap[p.code]) {
                projectColorMap[p.code] = colorPalette[colorIndex % colorPalette.length];
                colorIndex++;
            }
            const style = projectColorMap[p.code];
            
            // 임시저장(draft)은 점선 및 흐릿한 회색 처리, 확정은 프로젝트 색상 부여
            let confClass = p.status === 'confirmed' ? `${style.bg} ${style.border} ${style.text}` : 'bg-slate-50 border-slate-200 text-slate-400 opacity-80 border-dashed';
            let badgeClass = p.status === 'confirmed' ? style.badge : 'bg-slate-100 text-slate-500';
            
            plansHtml += `
            <div class="text-[10px] font-bold border px-1.5 py-1 rounded mb-1 truncate shadow-sm flex justify-between items-center ${confClass}">
                <span class="truncate pr-1" title="${p.name}"><span class="font-black mr-1">[${p.code}]</span>${p.name}</span>
                <span class="shrink-0 ml-1 font-black ${badgeClass} px-1 rounded shadow-sm">${p.hc}인 / ${p.md}M</span>
            </div>`;
        });

        // 빈 칸을 포함한 달력의 셀 클릭 시 해당 주차로 이동하도록 처리
        html += `<div class="bg-white p-1.5 min-h-[120px] hover:bg-indigo-50/30 transition-colors relative group border-t-2 ${isToday ? 'border-t-indigo-500' : 'border-t-transparent'} flex flex-col cursor-pointer" onclick="window.switchToPlanWeek('${dateStr}')">
            <div class="text-xs font-black text-center mb-1.5 ${dateClass} shrink-0">${i}</div>
            <div class="flex-1 flex flex-col gap-0.5 overflow-hidden">${plansHtml}</div>
            <div class="absolute inset-0 bg-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-indigo-600 font-black text-xs backdrop-blur-[1px] z-10 rounded-lg">
                <i class="fa-solid fa-pen mr-1"></i> 주간 편집 열기
            </div>
        </div>`;
    }
    grid.innerHTML = html;
};

// 💡 새로운 달력 뷰에서 날짜를 클릭하면 해당 주차(week) 수정 뷰로 바로 이동하는 유틸 함수
window.switchToPlanWeek = function(dateStr) {
    if(!window.getWeekString) return;
    const targetWeek = window.getWeekString(new Date(dateStr));
    const weekInput = document.getElementById('wh-plan-week');
    if(weekInput) {
        weekInput.value = targetWeek;
        window.handleWhPlanWeekChange(targetWeek);
        window.setWhPlanViewMode('week'); 
        if(window.showToast) window.showToast(`${dateStr} 날짜가 포함된 주차로 이동했습니다.`, "success");
    }
};

window.addWhPlanRow = function() {
    const currentPeriod = document.getElementById('wh-plan-week').value;
    if (!currentPeriod) return;
    const { start } = window.getDatesFromWeek(currentPeriod);
    let weekDates = [];
    for (let i = 0; i < 7; i++) {
        let d = new Date(start);
        d.setDate(d.getDate() + i);
        weekDates.push(window.getLocalDateStr(d));
    }
    appendWhPlanRow(null, weekDates);
};

window.removeWhPlanRow = function(btn) {
    const tr = btn.closest('tr');
    tr.style.opacity = '0';
    setTimeout(() => { tr.remove(); }, 200);
};

function appendWhPlanRow(planData, weekDates) {
    const tbody = document.getElementById('wh-plan-tbody');
    const tr = document.createElement('tr');
    tr.className = 'wh-plan-row hover:bg-slate-50 transition-colors group border-b border-slate-100';
    
    const uniqueId = 'wh-plan-pjt-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const pCode = planData ? (planData.projectCode || '') : '';
    const pName = planData ? (planData.projectName || '') : '';
    
    let idInput = planData ? `<input type="hidden" class="plan-row-id" value="${planData.id}">` : `<input type="hidden" class="plan-row-id" value="">`;
    let statusHtml = planData && planData.status === 'confirmed' 
        ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold">확정</span>` 
        : `<span class="bg-slate-200 text-slate-500 px-2 py-1 rounded text-[10px] font-bold">임시</span>`;

    let cellsHtml = '';
    let totalHc = 0;
    let totalMd = 0;

    for(let i=0; i<7; i++) {
        let dateStr = weekDates[i];
        let dPlan = planData && planData.daily && planData.daily[dateStr] ? planData.daily[dateStr] : {hc:'', md:''};
        
        let hcVal = parseFloat(dPlan.hc) || 0;
        let mdVal = parseFloat(dPlan.md) || 0;
        totalHc += hcVal;
        totalMd += mdVal;

        let hcStr = hcVal > 0 ? hcVal : '';
        let mdStr = mdVal > 0 ? mdVal : '';

        cellsHtml += `
        <td class="p-1.5 border-r border-slate-100 bg-slate-50/20 group-hover:bg-indigo-50/30 transition-colors align-middle">
            <div class="flex flex-col gap-1 w-full max-w-[80px] mx-auto">
                <div class="flex items-center bg-white border border-slate-200 rounded px-1 shadow-inner focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-200 transition-all"><span class="text-[9px] text-slate-400 font-bold w-3 shrink-0">인</span><input type="number" min="0" step="0.5" class="w-full text-right text-[11px] font-black text-amber-600 outline-none p-1 p-day-hc bg-transparent" data-date="${dateStr}" data-prev-val="${hcStr}" value="${hcStr}" placeholder="-" oninput="window.calcWhPlanRow(this)"></div>
                <div class="flex items-center bg-white border border-slate-200 rounded px-1 shadow-inner focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-200 transition-all"><span class="text-[9px] text-slate-400 font-bold w-3 shrink-0">M</span><input type="number" min="0" step="0.5" class="w-full text-right text-[11px] font-black text-indigo-600 outline-none p-1 p-day-md" data-date="${dateStr}" value="${mdStr}" placeholder="-" oninput="window.calcWhPlanRow(this)"></div>
            </div>
        </td>`;
    }

    tr.innerHTML = `
        <td class="p-2 border-r border-slate-200 sticky left-0 bg-white group-hover:bg-slate-50 z-10 transition-colors shadow-[2px_0_4px_rgba(0,0,0,0.05)] align-middle">
            ${idInput}
            <div class="relative flex items-center">
                <i class="fa-solid fa-magnifying-glass absolute left-2.5 text-amber-300 text-xs"></i>
                <input type="text" id="${uniqueId}" class="plan-row-pjt w-full border border-slate-200 rounded-lg pl-7 pr-2 py-2 text-xs font-bold text-slate-700 placeholder-slate-400 bg-slate-50 focus:bg-white outline-amber-500 shadow-sm" value="${pCode}" placeholder="PJT코드/명칭" oninput="window.whShowPlanPjtAuto(this)" autocomplete="off">
            </div>
            <input type="hidden" class="plan-row-pjt-code" value="${pCode}">
            <input type="hidden" class="plan-row-pjt-name" value="${pName}">
        </td>
        ${cellsHtml}
        <td class="p-2 text-center border-r border-slate-200 align-middle bg-amber-50/20">
            <div class="text-[10px] font-bold text-slate-600"><span class="plan-row-headcount text-amber-600 text-xs">${totalHc.toFixed(1)}</span> 명</div>
            <div class="text-[10px] font-bold text-slate-600"><span class="plan-row-md text-indigo-600 text-xs">${totalMd.toFixed(1)}</span> MD</div>
        </td>
        <td class="p-2 text-center border-r border-slate-200 align-middle">
            ${statusHtml}
            <input type="hidden" class="plan-row-status" value="${planData ? planData.status : 'draft'}">
        </td>
        <td class="p-2 text-center align-middle">
            <button onclick="window.removeWhPlanRow(this)" class="text-slate-300 hover:text-rose-500 w-8 h-8 rounded-lg flex items-center justify-center mx-auto transition-all bg-white hover:bg-rose-50 border border-transparent hover:border-rose-100"><i class="fa-solid fa-trash-can"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
}

window.whShowPlanPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    let drop = document.getElementById('wh-plan-pjt-autocomplete');
    if (!drop) {
        drop = document.createElement('ul');
        drop.id = 'wh-plan-pjt-autocomplete';
        drop.className = 'fixed z-[99999] bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl max-h-56 overflow-y-auto text-sm custom-scrollbar py-2 hidden';
        document.body.appendChild(drop);
    }
    
    const tr = input.closest('tr');
    tr.querySelector('.plan-row-pjt-code').value = '';
    tr.querySelector('.plan-row-pjt-name').value = '';

    if(!val) { drop.classList.add('hidden'); return; }

    let searchPool = [];
    let seenCodes = new Set();
    (window.pjtCodeMasterList || []).forEach(p => {
        if (p.code && !seenCodes.has(p.code)) {
            seenCodes.add(p.code); searchPool.push(p);
        }
    });

    let matches = searchPool.filter(p => {
        let code = (p.code || '').toLowerCase();
        let name = (p.name || '').toLowerCase();
        return code.includes(val) || name.includes(val) || 
               (window.matchString && window.matchString(val, p.code)) || 
               (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.position = 'fixed';
        drop.style.left = `${rect.left}px`;
        drop.style.top = `${rect.bottom + 4}px`;
        drop.style.width = `${Math.max(rect.width, 300)}px`;

        drop.innerHTML = matches.map(m => {
            let sName = m.name ? m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '';
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            return `<li class="px-5 py-3 hover:bg-amber-50 cursor-pointer text-xs border-b border-slate-50 transition-all flex items-center gap-2" onmousedown="window.whSelectPlanPjt('${input.id}', '${sCode}', '${sName}')"><span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-black tracking-wide shrink-0">[${sCode}]</span><span class="text-slate-600 font-bold truncate flex-1">${m.name}</span></li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.whSelectPlanPjt = function(inputId, pCode, pName) {
    const input = document.getElementById(inputId);
    if(input) {
        input.value = pCode; 
        const tr = input.closest('tr');
        tr.querySelector('.plan-row-pjt-code').value = pCode;
        tr.querySelector('.plan-row-pjt-name').value = pName; 
    }
    const drop = document.getElementById('wh-plan-pjt-autocomplete');
    if (drop) drop.classList.add('hidden');
};

document.addEventListener('click', function(e) {
    const d = document.getElementById('wh-plan-pjt-autocomplete');
    if (d && !d.classList.contains('hidden') && !e.target.closest('#wh-plan-pjt-autocomplete') && !e.target.closest('.plan-row-pjt')) {
        d.classList.add('hidden');
    }
});

// 💡 계획 저장 함수 (오직 주간 단위로만 저장)
window.saveWhPlans = async function(targetStatus) {
    const currentPeriod = document.getElementById('wh-plan-week').value;
    const yearStr = currentPeriod.split('-')[0];
    const rows = document.querySelectorAll('.wh-plan-row');
    let toSave = [];

    rows.forEach(tr => {
        const id = tr.querySelector('.plan-row-id').value;
        const projectCodeInput = tr.querySelector('.plan-row-pjt').value.trim(); 
        const projectCode = tr.querySelector('.plan-row-pjt-code').value || projectCodeInput; 
        const projectName = tr.querySelector('.plan-row-pjt-name').value || '';
        
        let dailyData = {};
        let rowHasData = false;
        
        const hcInputs = tr.querySelectorAll('.p-day-hc');
        const mdInputs = tr.querySelectorAll('.p-day-md');
        
        for(let i=0; i<hcInputs.length; i++) {
            const dateStr = hcInputs[i].dataset.date;
            const hcVal = parseFloat(hcInputs[i].value) || 0;
            const mdVal = parseFloat(mdInputs[i].value) || 0;
            if (hcVal > 0 || mdVal > 0) {
                dailyData[dateStr] = { hc: hcVal, md: mdVal };
                rowHasData = true;
            }
        }

        if (projectCodeInput && rowHasData) {
            toSave.push({ 
                id, 
                period: currentPeriod, 
                year: yearStr,
                projectCode, 
                projectName, 
                daily: dailyData,
                status: targetStatus, 
                updatedAt: Date.now(),
                authorName: window.userProfile?.name || '관리자'
            });
        }
    });

    try {
        const batch = window.writeBatch ? window.writeBatch(db) : await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(m => m.writeBatch(db));
        
        const q = window.query(window.collection(db, "work_plans"), window.where("period", "==", currentPeriod));
        const existingSnap = await window.getDocs(q);
        existingSnap.forEach(docSnap => batch.delete(docSnap.ref));
        
        toSave.forEach(data => {
            const ref = window.doc(window.collection(db, "work_plans")); 
            data.createdAt = Date.now();
            delete data.id; 
            batch.set(ref, data);
        });

        await batch.commit();
        window.showToast(targetStatus === 'confirmed' ? "계획이 확정되어 대시보드에 반영됩니다." : "임시 저장되었습니다.", "success");
        
        window.fetchWorkPlansForContext(); 
        window.closeWhPlanModal();
    } catch(e) {
        console.error(e);
        window.showToast("저장 실패: " + e.message, "error");
    }
};
