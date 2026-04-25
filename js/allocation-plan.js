/* eslint-disable */
import { app, db as axmsDb } from './firebase.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const axttConfig = {
    apiKey: "AIzaSyA_LSZ2wvuvkyh_nCqMbdFchkG_qQvmFWY",
    authDomain: "axtt-b064c.firebaseapp.com",
    projectId: "axtt-b064c",
    storageBucket: "axtt-b064c.firebasestorage.app",
    messagingSenderId: "592770464981",
    appId: "1:592770464981:web:15c4b550c401e7bcb0765c",
    measurementId: "G-V28BZLW8XQ"
};

const axttApp = initializeApp(axttConfig, "AXTT_APP");
const axttDb = getFirestore(axttApp);

let allocChartInstance = null;
window.allocPartTab = '제조'; 
window.allocPeriodMode = 'week'; 

window.allocTeamMaster = [
    { name: '홍승현', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '박종민', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '박원범', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '표영덕', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '양윤석', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '조성주', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '박광렬', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' },
    { name: '이원범', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '' }
];
window.allocProjects = [];
window.historicalMemberMd = {};
window.lastAllocatedData = null; 

const KR_HOLIDAYS = new Set([
    '2024-01-01', '2024-02-09', '2024-02-12', '2024-03-01', '2024-04-10', '2024-05-06', '2024-05-15', '2024-06-06', '2024-08-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-10-03', '2024-10-09', '2024-12-25',
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-09', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-09', '2027-10-11', '2027-12-25'
]);

function getValidDays(periodMode, targetValue) {
    let validDays = [];
    if (periodMode === 'week') {
        const dates = window.getDatesFromWeek(targetValue);
        for(let i=0; i<5; i++) {
            let d = new Date(dates.start); d.setDate(d.getDate() + i);
            validDays.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        }
    } else {
        const parts = targetValue.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const lastDate = new Date(y, m, 0).getDate();
        for(let i=1; i<=lastDate; i++) {
            let dStr = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            let dObj = new Date(y, m-1, i);
            if(dObj.getDay() !== 0 && dObj.getDay() !== 6 && !KR_HOLIDAYS.has(dStr)) {
                validDays.push(dStr);
            }
        }
    }
    return validDays;
}

// 💡 [핵심] 문자열을 분석해 콤마(,)와 범위(-)를 모두 날짜 배열로 변환하는 파서
window.parseDateString = function(str) {
    let days = new Set();
    if(!str) return days;
    str.split(',').forEach(part => {
        part = part.trim();
        if(part.includes('-')) {
            let parts = part.split('-');
            if(parts.length === 2) {
                let start = parseInt(parts[0].trim());
                let end = parseInt(parts[1].trim());
                if(!isNaN(start) && !isNaN(end)) {
                    for(let i=Math.min(start, end); i<=Math.max(start, end); i++) days.add(i);
                }
            }
        } else {
            let n = parseInt(part);
            if(!isNaN(n)) days.add(n);
        }
    });
    return days;
};

window.initAllocationPlan = function() {
    console.log("✅ AI 투입 계획 모듈 (기간 범위 UI 탑재 완료) 초기화");
    
    window.switchAllocPeriodMode('week'); 
    window.switchAllocPartTab('제조'); 

    onSnapshot(query(collection(axmsDb, "projects_status")), (snap) => {
        let oldProjects = [...window.allocProjects]; 
        window.allocProjects = [];
        snap.forEach(d => {
            let p = d.data(); p.id = d.id;
            if (p.status !== 'completed' && p.status !== 'rejected') {
                let old = oldProjects.find(op => op.id === p.id);
                p.active = old ? old.active : true; 
                window.allocProjects.push(p);
            }
        });
        window.renderAllocProjectSelectors(); 
    });
    
    fetchHistoricalDataFromAXTT();
};

window.switchAllocPartTab = function(part) {
    window.allocPartTab = part;
    document.getElementById('btn-alloc-part-mfg').className = part === '제조' ? "px-3 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    document.getElementById('btn-alloc-part-opt').className = part === '광학' ? "px-3 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    
    const lbl = document.getElementById('current-part-label');
    if(lbl) lbl.innerText = `[${part} 파트]`;
    
    window.renderAllocMemberSelectors();
    window.renderAllocProjectSelectors(); 
    window.loadAllocationData(); 
};

window.switchAllocPeriodMode = function(mode) {
    window.allocPeriodMode = mode;
    const btnW = document.getElementById('btn-alloc-period-week');
    const btnM = document.getElementById('btn-alloc-period-month');
    const pickW = document.getElementById('alloc-week-picker');
    const pickM = document.getElementById('alloc-month-picker');

    if (mode === 'week') {
        if(btnW) btnW.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap';
        if(btnM) btnM.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent whitespace-nowrap';
        if(pickW) pickW.classList.remove('hidden'); 
        if(pickM) pickM.classList.add('hidden');
        if(pickW && !pickW.value) pickW.value = window.getWeekString ? window.getWeekString(new Date()) : "2026-W17";
        if(pickW) window.updateAllocPeriodDisplay(pickW.value);
    } else {
        if(btnM) btnM.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap';
        if(btnW) btnW.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent whitespace-nowrap';
        if(pickM) pickM.classList.remove('hidden'); 
        if(pickW) pickW.classList.add('hidden');
        if(pickM && !pickM.value) {
            const now = new Date();
            pickM.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        }
        if(pickM) window.updateAllocPeriodDisplay(pickM.value);
    }
    window.loadAllocationData();
};

window.updateAllocPeriodDisplay = function(val) {
    if(!val) return;
    const displayEl = document.getElementById('alloc-period-display');
    if (!displayEl) return;
    if (window.allocPeriodMode === 'week') {
        displayEl.innerText = window.formatWeekToKorean ? window.formatWeekToKorean(val) : val;
    } else {
        const parts = val.split('-');
        displayEl.innerText = `${parts[0]}년 ${parseInt(parts[1])}월`;
    }
};

window.changeAllocPeriod = function(offset) {
    if (window.allocPeriodMode === 'week') {
        const picker = document.getElementById('alloc-week-picker');
        if (!picker || !picker.value) return;
        const parts = picker.value.split('-W');
        const d = new Date(parseInt(parts[0]), 0, (parseInt(parts[1]) + offset - 1) * 7 + 1);
        if (window.getWeekString) {
            picker.value = window.getWeekString(d);
            window.updateAllocPeriodDisplay(picker.value);
            window.loadAllocationData();
        }
    } else {
        const picker = document.getElementById('alloc-month-picker');
        if (!picker || !picker.value) return;
        const parts = picker.value.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + offset, 1);
        picker.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        window.updateAllocPeriodDisplay(picker.value);
        window.loadAllocationData();
    }
};

window.loadAllocationData = function() {
    const emptyState = document.getElementById('alloc-empty-state');
    const resultDash = document.getElementById('alloc-result-dashboard');
    if(emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
    if(resultDash) resultDash.classList.add('hidden');
    
    const btnSave = document.getElementById('btn-save-alloc');
    const btnRun = document.getElementById('btn-run-ai');
    if (btnSave) btnSave.classList.add('hidden');
    if (btnRun) btnRun.innerHTML = '<i class="fa-solid fa-microchip"></i> AI 자동 할당 실행';
    window.lastAllocatedData = null; 
};

// 💡 [핵심] 시작일/종료일 선택 시 범위를 입력창에 추가해주는 함수
window.addDateRangeToInput = function(name, type) {
    const startEl = document.getElementById(`${type}-start-${name}`);
    const endEl = document.getElementById(`${type}-end-${name}`);
    const inputEl = document.getElementById(`${type === 'vacation' ? 'vac' : 'sup'}-input-${name}`);

    if(!startEl.value) return window.showToast("시작일을 먼저 선택하세요.", "warning");

    let startDay = new Date(startEl.value).getDate();
    let endDay = endEl.value ? new Date(endEl.value).getDate() : startDay;

    if (startDay > endDay) {
        let temp = startDay; startDay = endDay; endDay = temp;
    }

    let appendStr = startDay === endDay ? `${startDay}` : `${startDay}-${endDay}`;

    let currentVal = inputEl.value.trim();
    if (currentVal) {
        if(currentVal.endsWith(',')) inputEl.value = currentVal + ' ' + appendStr;
        else inputEl.value = currentVal + ', ' + appendStr;
    } else {
        inputEl.value = appendStr;
    }

    window.updateAllocMemberDates(name, type, inputEl.value);

    // 날짜 선택기 초기화
    startEl.value = '';
    endEl.value = '';
};

// 💡 1. 향상된 UI 렌더링 (기간 범위 선택기 탑재)
window.renderAllocMemberSelectors = function() {
    const container = document.getElementById('alloc-member-list-container');
    if(!container) return;

    const members = window.allocTeamMaster.filter(m => m.part === window.allocPartTab);
    if (members.length === 0) {
        container.innerHTML = `<span class="text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">선택된 파트에 해당하는 인원이 없습니다.</span>`;
        return;
    }

    container.innerHTML = members.map(m => {
        let isNormal = m.status === '정상';
        return `
        <div class="flex flex-col bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 shadow-sm w-full md:w-[340px]">
            <div class="flex items-center justify-between mb-2">
                <label class="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 member-checkbox" data-name="${m.name}" ${m.active ? 'checked' : ''} onchange="window.updateAllocMemberActive('${m.name}', this.checked)">
                    <span class="text-[12px] font-bold text-slate-800">${m.name}</span>
                </label>
                <div class="flex items-center gap-2">
                    <select class="border border-slate-200 rounded px-1.5 py-1 text-[10px] font-bold text-slate-600 outline-indigo-500 bg-white cursor-pointer" onchange="window.updateAllocMemberStatus('${m.name}', this.value)" ${m.active ? '' : 'disabled'}>
                        <option value="정상" ${m.status === '정상' ? 'selected' : ''}>정상</option>
                        <option value="타팀지원" ${m.status === '타팀지원' ? 'selected' : ''}>타팀지원(전체)</option>
                        <option value="장기휴가" ${m.status === '장기휴가' ? 'selected' : ''}>장기휴가(전체)</option>
                    </select>
                    <div class="flex items-center gap-1 border-l border-slate-200 pl-2">
                        <span class="text-[9px] font-bold text-slate-400">MD차감</span>
                        <input type="number" step="0.5" min="0" max="5.0" value="${m.manualVacation || 0}" onchange="window.updateAllocMemberVacation('${m.name}', this.value)" class="w-12 border border-slate-200 rounded px-1.5 py-1 text-[10px] text-rose-500 font-bold outline-indigo-500 text-right bg-white" ${m.active && isNormal ? '' : 'disabled'}>
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-2 border-t border-slate-200/60 pt-2 w-full">
                 <div class="flex flex-col gap-1">
                      <div class="flex items-center justify-between">
                          <span class="text-[10px] font-bold text-rose-500 flex items-center gap-1"><i class="fa-solid fa-plane-departure text-[9px]"></i> 휴가일</span>
                          <input type="text" id="vac-input-${m.name}" value="${m.vacationDates || ''}" onchange="window.updateAllocMemberDates('${m.name}', 'vacation', this.value)" placeholder="직접입력 (예: 12, 15-18)" class="flex-1 ml-2 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] outline-indigo-500 text-slate-700 text-right" ${m.active && isNormal ? '' : 'disabled'}>
                      </div>
                      <div class="flex items-center gap-1">
                          <input type="date" id="vac-start-${m.name}" class="flex-1 border border-slate-200 rounded px-1 py-0.5 text-[9px] outline-indigo-500 text-slate-600 bg-white cursor-pointer" ${m.active && isNormal ? '' : 'disabled'}>
                          <span class="text-slate-400 text-[9px]">~</span>
                          <input type="date" id="vac-end-${m.name}" class="flex-1 border border-slate-200 rounded px-1 py-0.5 text-[9px] outline-indigo-500 text-slate-600 bg-white cursor-pointer" ${m.active && isNormal ? '' : 'disabled'}>
                          <button onclick="window.addDateRangeToInput('${m.name}', 'vacation')" class="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 px-2 py-0.5 rounded text-[9px] transition-colors font-bold whitespace-nowrap" ${m.active && isNormal ? '' : 'disabled'}>기간 추가</button>
                      </div>
                 </div>

                 <div class="flex flex-col gap-1 border-t border-slate-100 pt-1.5">
                      <div class="flex items-center justify-between">
                          <span class="text-[10px] font-bold text-orange-500 flex items-center gap-1"><i class="fa-solid fa-handshake-angle text-[9px]"></i> 지원일</span>
                          <input type="text" id="sup-input-${m.name}" value="${m.supportDates || ''}" onchange="window.updateAllocMemberDates('${m.name}', 'support', this.value)" placeholder="직접입력 (예: 20-25)" class="flex-1 ml-2 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] outline-indigo-500 text-slate-700 text-right" ${m.active && isNormal ? '' : 'disabled'}>
                      </div>
                      <div class="flex items-center gap-1">
                          <input type="date" id="sup-start-${m.name}" class="flex-1 border border-slate-200 rounded px-1 py-0.5 text-[9px] outline-indigo-500 text-slate-600 bg-white cursor-pointer" ${m.active && isNormal ? '' : 'disabled'}>
                          <span class="text-slate-400 text-[9px]">~</span>
                          <input type="date" id="sup-end-${m.name}" class="flex-1 border border-slate-200 rounded px-1 py-0.5 text-[9px] outline-indigo-500 text-slate-600 bg-white cursor-pointer" ${m.active && isNormal ? '' : 'disabled'}>
                          <button onclick="window.addDateRangeToInput('${m.name}', 'support')" class="bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-600 px-2 py-0.5 rounded text-[9px] transition-colors font-bold whitespace-nowrap" ${m.active && isNormal ? '' : 'disabled'}>기간 추가</button>
                      </div>
                 </div>
            </div>
        </div>
        `;
    }).join('');
};

window.updateAllocMemberDates = function(name, type, val) {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) {
        if (type === 'vacation') member.vacationDates = val;
        else if (type === 'support') member.supportDates = val;
    }
};

window.updateAllocMemberActive = (name, active) => {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) member.active = active;
    window.renderAllocMemberSelectors(); 
};
window.updateAllocMemberStatus = (name, status) => {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) member.status = status;
    window.renderAllocMemberSelectors();
};
window.updateAllocMemberVacation = (name, val) => {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) member.manualVacation = parseFloat(val) || 0;
};
window.selectAllAllocMembers = (active) => {
    window.allocTeamMaster.filter(m => m.part === window.allocPartTab).forEach(m => m.active = active);
    window.renderAllocMemberSelectors();
};

window.renderAllocProjectSelectors = function() {
    const cont = document.getElementById('alloc-project-list-container');
    if(!cont) return;
    const projects = window.allocProjects.filter(p => p.part === window.allocPartTab);
    if(projects.length === 0) {
        cont.innerHTML = `<span class="text-xs font-bold text-slate-400 p-2">해당 파트에 진행 중인 프로젝트가 없습니다.</span>`;
        return;
    }
    cont.innerHTML = projects.map(p => `
        <label class="flex items-center gap-2 bg-slate-50 hover:bg-indigo-50/50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer transition-all shadow-sm">
            <input type="checkbox" class="w-4 h-4 accent-indigo-600 shrink-0" ${p.active !== false ? 'checked' : ''} onchange="window.updateAllocProjectActive('${p.id}', this.checked)">
            <span class="text-indigo-600 font-black text-xs shrink-0 w-24">[${p.code}]</span>
            <span class="text-[11px] font-bold text-slate-700 truncate w-full" title="${p.name}">${p.name}</span>
            <span class="text-[10px] font-bold text-slate-400 shrink-0 border-l pl-2">${p.progress || 0}% 진행</span>
        </label>
    `).join('');
};

window.updateAllocProjectActive = function(id, active) {
    const p = window.allocProjects.find(x => x.id === id);
    if(p) p.active = active;
};
window.selectAllAllocProjects = function(active) {
    window.allocProjects.filter(p => p.part === window.allocPartTab).forEach(p => p.active = active);
    window.renderAllocProjectSelectors();
};

window.switchAllocView = function(viewMode) {
    window.renderAllocGrid();
    window.renderAllocCalendar();
};

async function fetchHistoricalDataFromAXTT() {
    let d = new Date();
    let endStr = d.toISOString().split('T')[0];
    d.setDate(d.getDate() - 28);
    let startStr = d.toISOString().split('T')[0];

    try {
        const q = query(collection(axttDb, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
        const snap = await getDocs(q);
        if (snap.empty) { window.historicalMemberMd = {}; return; }
        let rawStats = {};
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const name = data.authorName;
            const hours = parseFloat(data.hours) || 0;
            if (!rawStats[name]) rawStats[name] = 0;
            rawStats[name] += (hours / 8); 
        });
        window.historicalMemberMd = {};
        for (let name in rawStats) {
            window.historicalMemberMd[name] = Math.min(rawStats[name] / 4, 5.0); 
        }
    } catch (error) { window.historicalMemberMd = {}; }
}

window.openAxttVerifyModal = function() {
    const modal = document.getElementById('axtt-verify-modal');
    if(!modal) return;
    const tbody = document.getElementById('axtt-verify-tbody');
    let html = '';
    window.allocTeamMaster.forEach(m => {
        let rawVal = window.historicalMemberMd[m.name] || 0;
        let finalVal = rawVal > 0 ? rawVal.toFixed(1) : '5.0'; 
        let badgeColor = m.part === '제조' ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-teal-600 bg-teal-50 border-teal-200';
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="p-3 text-center font-bold text-slate-800">${m.name}</td>
            <td class="p-3 text-center"><span class="px-2 py-0.5 text-[10px] font-bold rounded shadow-sm border ${badgeColor}">${m.part}</span></td>
            <td class="p-3 text-center text-teal-600 font-bold">${rawVal > 0 ? rawVal.toFixed(1) : '<span class="text-slate-300">데이터 없음</span>'}</td>
            <td class="p-3 text-center text-amber-600 font-black">${finalVal}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeAxttVerifyModal = function() { const m = document.getElementById('axtt-verify-modal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } };

// AI 실행 로직 (파서 적용)
window.executeAiAllocation = async function() {
    const activeMembers = window.allocTeamMaster.filter(m => m.part === window.allocPartTab && m.active);
    if (activeMembers.length === 0) return window.showToast(`투입할 [${window.allocPartTab}] 파트 인원을 최소 1명 이상 선택하세요.`, "error");

    let targetProjects = window.allocProjects.filter(p => p.part === window.allocPartTab && p.active !== false);

    const btn = document.getElementById('btn-run-ai');
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...'; btn.disabled = true; }

    try { await fetchHistoricalDataFromAXTT(); } catch(e) {}

    setTimeout(() => {
        try {
            let targetValue = window.allocPeriodMode === 'week' ? document.getElementById('alloc-week-picker').value : document.getElementById('alloc-month-picker').value;
            if (!targetValue) {
                targetValue = window.allocPeriodMode === 'week' ? window.getWeekString(new Date()) : `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
            }

            const validDaysList = getValidDays(window.allocPeriodMode, targetValue);
            let totalPeriodDays = validDaysList.length;
            if (totalPeriodDays === 0) totalPeriodDays = 1; 

            let pjtAvailMD = 0; 
            let totalCommonMD = 0; 

            activeMembers.forEach(m => {
                let baseWeeklyMd = window.historicalMemberMd[m.name] || 5.0; 
                let dailyTotalMd = Math.min(baseWeeklyMd / 5, 1.0); 
                
                let dailyCommonMd = Math.min(0.2, dailyTotalMd);
                let dailyPjtMd = dailyTotalMd - dailyCommonMd;
                
                // 💡 [핵심] 입력된 문자열(12, 15-18)을 정확하게 파싱하여 Set 배열로 생성
                let vDates = window.parseDateString(m.vacationDates);
                let sDates = window.parseDateString(m.supportDates);

                let activeDays = 0;
                m.specificVacationDays = new Set();
                m.specificSupportDays = new Set();

                validDaysList.forEach(dStr => {
                    let dayNum = parseInt(dStr.split('-')[2]);
                    if (m.status === '장기휴가' || vDates.has(dayNum)) {
                        m.specificVacationDays.add(dStr);
                    } else if (m.status === '타팀지원' || sDates.has(dayNum)) {
                        m.specificSupportDays.add(dStr);
                    } else {
                        activeDays++;
                    }
                });

                if (m.status === '타팀지원' || m.status === '장기휴가') {
                    m.expectedPjtMd = 0; 
                    m.expectedCommonMd = 0;
                    m.expectedTotalMd = 0;
                } else {
                    let vDeduct = parseFloat(m.manualVacation) || 0;
                    m.expectedPjtMd = Math.max(0, (activeDays * dailyPjtMd) - vDeduct);
                    m.expectedCommonMd = activeDays * dailyCommonMd;
                    m.expectedTotalMd = m.expectedPjtMd + m.expectedCommonMd; 
                    
                    pjtAvailMD += m.expectedPjtMd;
                    totalCommonMD += m.expectedCommonMd;
                }
                m.vacationDeduct = parseFloat(m.manualVacation) || 0;
            });

            let pjtResults = []; let outResults = []; let aiReport = [];

            let priorities = targetProjects.map(p => {
                let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0));
                let outMd = parseFloat(p.outMd) || 0;
                let internalReq = Math.max(0, remain - outMd);
                if(outMd > 0) outResults.push({ code: p.code, name: p.name, allocated: outMd, reason: '기등록 외주' });
                
                let dDay = p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999;
                let score = (dDay <= 7 ? 100 : (dDay <= 14 ? 50 : 0)) + (internalReq * 2);
                return { ...p, internalReq, score, dDay };
            }).filter(p => p.internalReq > 0 || p.dDay <= 14).sort((a,b) => b.score - a.score);

            let currentAvail = pjtAvailMD;
            let periodMultiplier = totalPeriodDays / 5;
            let maxPjtLimit = Math.max(10 * periodMultiplier, pjtAvailMD * 0.45); 

            priorities.forEach((p, idx) => {
                if (currentAvail <= 0) { outResults.push({ code: p.code, name: p.name, allocated: p.internalReq, reason: '사내 캐파 부족' }); return; }
                let currentLimit = p.dDay <= 7 ? Math.max(15 * periodMultiplier, pjtAvailMD * 0.6) : maxPjtLimit;
                let reqMd = Math.min(p.internalReq > 0 ? p.internalReq : (3.0 * periodMultiplier), currentLimit);
                reqMd = Math.round(reqMd * 2) / 2;

                if (currentAvail >= reqMd) {
                    pjtResults.push({ ...p, allocated: reqMd, priority: idx + 1 });
                    currentAvail -= reqMd;
                } else if (currentAvail > 0) {
                    pjtResults.push({ ...p, allocated: currentAvail, priority: idx + 1 });
                    let overflow = reqMd - currentAvail;
                    outResults.push({ code: p.code, name: p.name, allocated: overflow, reason: '사내 캐파 부족' });
                    currentAvail = 0;
                }
            });

            let finalCommonAlloc = totalCommonMD + Math.max(0, currentAvail);
            if (finalCommonAlloc > 0 || pjtResults.length === 0) {
                pjtResults.push({ code: 'COMMON', name: `${window.allocPartTab}공통`, allocated: finalCommonAlloc, priority: 99, dDay: '-', progress: 100, part: window.allocPartTab });
            }

            let pjtRemainMap = {};
            pjtResults.forEach(p => pjtRemainMap[p.code] = p.allocated);

            let sortedMembers = [...activeMembers].sort((a,b) => b.expectedPjtMd - a.expectedPjtMd);

            sortedMembers.forEach(m => {
                if (m.status === '타팀지원') {
                    m.assignedPjtName = '타팀 지원 (파견)'; m.assignedPjtCode = 'SUPPORT'; m.assignedPjtDeadline = '-';
                } else if (m.status === '장기휴가') {
                    m.assignedPjtName = '장기 휴가'; m.assignedPjtCode = 'VACATION'; m.assignedPjtDeadline = '-';
                } else {
                    let myPjt = pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.manager === m.name && p.code !== 'COMMON');
                    let bestPjt = myPjt || pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.code !== 'COMMON');
                    if (!bestPjt) bestPjt = pjtResults.find(p => p.code === 'COMMON');

                    m.assignedPjtName = bestPjt ? `[${bestPjt.code}] ${bestPjt.name}` : 'COMMON';
                    m.assignedPjtCode = bestPjt ? bestPjt.code : 'COMMON';
                    m.assignedPjtDeadline = bestPjt ? (bestPjt.d_shipEst || '-') : '-';

                    if (bestPjt && bestPjt.code !== 'COMMON') pjtRemainMap[bestPjt.code] -= m.expectedPjtMd;
                }
            });

            let periodText = window.allocPeriodMode === 'week' ? '주간' : '월간';

            aiReport.push(`[${window.allocPartTab} 파트 전용 ${periodText} 계획]\n선택 인원 ${activeMembers.length}명, 1일 0.2MD(공통업무)를 자동 분리한 순수 PJT 가용 공수는 총 ${pjtAvailMD.toFixed(1)}MD 로 산출되었습니다.`);
            
            let dispatchCount = activeMembers.filter(m => m.status === '타팀지원' || m.specificSupportDays.size > 0).length;
            if (dispatchCount > 0) aiReport.push(`ℹ️ 입력하신 기간에 해당하는 타팀 지원(파견) 데이터가 가용 캐파에서 완벽하게 제외되었습니다.`);

            aiReport.push(`🎯 PJT 현황의 담당자(Manager)로 지정된 인원에게 해당 프로젝트를 0순위로 우선 배정하는 스마트 매칭이 적용되었습니다.`);

            if (outResults.length > 0) aiReport.push(`⚠️ 내부 가용 인력 대비 초과된 잔여 공수는 '외주 전환 필요' 항목으로 분리하였습니다.`);
            else aiReport.push(`✅ 현재 파트 내부 가동률만으로 이번 기간에 요구되는 프로젝트 할당량을 소화 가능합니다.`);

            window.lastAllocatedData = { periodMode: window.allocPeriodMode, targetValue: targetValue, validDaysList: validDaysList, members: activeMembers, pjtResults: pjtResults, outResults: outResults, availMD: pjtAvailMD + totalCommonMD };

            window.renderAllocUI((activeMembers.length * 5.0 * periodMultiplier), pjtAvailMD + totalCommonMD, pjtResults, outResults, activeMembers, aiReport.join('\n\n'));
            window.renderAllocGrid(); 
            window.renderAllocCalendar();
            
            const emptyState = document.getElementById('alloc-empty-state');
            const resultDash = document.getElementById('alloc-result-dashboard');
            const btnSave = document.getElementById('btn-save-alloc');
            
            if(emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
            if(resultDash) resultDash.classList.remove('hidden');
            if(btnSave) { btnSave.classList.remove('hidden'); btnSave.classList.add('flex'); }
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 다시 계산'; btn.disabled = false; }
            
            window.showToast(`${window.allocPartTab} 파트 최적화 계획이 완성되었습니다.`, "success");
            
        } catch (err) {
            console.error("AI Error: ", err);
            window.showToast("할당 분석 중 오류 발생", "error");
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 다시 계산'; btn.disabled = false; }
        }
    }, 800);
};

window.renderAllocUI = function(maxMD, availMD, pjtResults, outResults, members, aiText) {
    const insightEl = document.getElementById('alloc-ai-insight'); if (insightEl) insightEl.innerText = aiText;
    const kpiM = document.getElementById('alloc-kpi-members'); if(kpiM) kpiM.innerText = members.length;
    const kpiA = document.getElementById('alloc-kpi-avail'); if(kpiA) kpiA.innerText = availMD.toFixed(1);
    const kpiAs = document.getElementById('alloc-kpi-assigned'); if(kpiAs) kpiAs.innerText = pjtResults.reduce((a,b)=>a+b.allocated,0).toFixed(1);
    const kpiO = document.getElementById('alloc-kpi-outsourcing'); if(kpiO) kpiO.innerText = outResults.reduce((a,b)=>a+b.allocated,0).toFixed(1);

    const pjtCont = document.getElementById('alloc-pjt-list');
    if(pjtCont) {
        pjtCont.innerHTML = pjtResults.map(p => {
            let badgeColor = p.priority === 1 ? 'bg-rose-500' : 'bg-indigo-500';
            if (p.code === 'COMMON') badgeColor = 'bg-slate-400';
            return `
            <div class="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:shadow-md transition-all">
                <div class="flex items-center gap-4">
                    <div class="w-8 h-8 rounded-full ${badgeColor} text-white flex items-center justify-center font-black shadow-sm shrink-0">${p.priority===99?'-':p.priority}</div>
                    <div>
                        <div class="font-black text-slate-800 text-sm flex items-center gap-1">${p.name} <span class="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded border border-slate-200 ml-1">${p.part||'제조'}</span></div>
                        <div class="text-[10px] text-slate-400 font-bold">${p.code}</div>
                    </div>
                </div>
                <div class="text-right border-l pl-4"><span class="text-[10px] font-bold text-slate-400 block mb-1">배정 공수</span><span class="text-xl font-black text-indigo-600">${(p.allocated||0).toFixed(1)} MD</span></div>
            </div>`}).join('') + outResults.map(o => `
            <div class="flex items-center justify-between p-3 rounded-lg border border-rose-100 bg-rose-50/30 mt-2 opacity-80">
                <span class="text-xs font-bold text-slate-600">${o.name} <span class="text-[9px] text-rose-400 ml-1">(${o.reason})</span></span>
                <span class="text-sm font-black text-rose-500">${(o.allocated||0).toFixed(1)} MD</span>
            </div>
        `).join('');
    }

    const ctx = document.getElementById('alloc-chart')?.getContext('2d');
    if (ctx && window.Chart) {
        if(allocChartInstance) allocChartInstance.destroy();
        window.Chart.defaults.font.family = "'Pretendard', sans-serif";
        allocChartInstance = new window.Chart(ctx, {
            type: 'doughnut', data: { labels: pjtResults.map(p=>p.name), datasets: [{ data: pjtResults.map(p=>p.allocated), backgroundColor: ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'], borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
        });
    }
};

window.renderAllocGrid = function() {
    if (!window.lastAllocatedData) return;
    const { members, pjtResults, periodMode, validDaysList } = window.lastAllocatedData;
    
    const pjtOptionsHtml = pjtResults.map(p => {
        let label = p.code === 'COMMON' ? `${window.allocPartTab}공통` : `[${p.code}] ${p.name}`;
        return `<option value="${p.code}">${label}</option>`;
    }).join('');

    const thead = document.getElementById('alloc-grid-headers');
    const tbody = document.getElementById('alloc-grid-body');
    if (!thead || !tbody) return;

    let colCount = periodMode === 'week' ? 5 : 4; 
    let hHtml = `<tr><th class="p-3 text-center font-bold w-24 rounded-tl-lg bg-slate-800">이름(파트)</th><th class="p-3 font-bold w-48 text-center bg-slate-800">배정 PJT (선택)</th>`;
    if (periodMode === 'week') hHtml += `<th class="p-3 text-center font-bold bg-slate-800">월</th><th class="p-3 text-center font-bold bg-slate-800">화</th><th class="p-3 text-center font-bold bg-slate-800">수</th><th class="p-3 text-center font-bold bg-slate-800">목</th><th class="p-3 text-center font-bold bg-slate-800">금</th>`;
    else hHtml += `<th class="p-3 text-center font-bold bg-slate-800">1주차</th><th class="p-3 text-center font-bold bg-slate-800">2주차</th><th class="p-3 text-center font-bold bg-slate-800">3주차</th><th class="p-3 text-center font-bold bg-slate-800">4주차</th>`;
    hHtml += `<th class="p-3 text-center font-bold text-amber-300 rounded-tr-lg bg-slate-800">합계(MD)</th></tr>`;
    thead.innerHTML = hHtml;

    tbody.innerHTML = members.map((m) => {
        let activeDaysCount = 0;
        validDaysList.forEach(vd => {
            if (!m.specificVacationDays.has(vd) && !m.specificSupportDays.has(vd)) {
                if (!m.assignedPjtDeadline || m.assignedPjtDeadline === '-' || vd <= m.assignedPjtDeadline || m.assignedPjtCode === 'COMMON') {
                    activeDaysCount++;
                }
            }
        });

        let divisor = activeDaysCount > 0 ? (periodMode === 'week' ? activeDaysCount : colCount) : 1;
        
        let maxVal = periodMode === 'week' ? 0.8 : 4.0;
        let rawDMd = m.expectedPjtMd / divisor;
        if (rawDMd > maxVal) rawDMd = maxVal;
        const dMd = rawDMd.toFixed(1); 

        const vacTag = m.status === '타팀지원' ? `<div class="text-[9px] text-orange-600 font-bold mt-1 bg-orange-50 border border-orange-200 rounded text-center">타팀지원</div>` : 
                       m.status === '장기휴가' ? `<div class="text-[9px] text-rose-500 font-bold mt-1 bg-rose-50 border border-rose-200 rounded text-center">장기휴가</div>` :
                       m.vacationDeduct > 0 ? `<div class="text-[9px] text-rose-500 font-bold mt-1 bg-rose-50 border border-rose-100 rounded text-center">차감 -${m.vacationDeduct}MD</div>` : '';
        
        let selectHtml = '';
        if (m.status === '타팀지원' || m.status === '장기휴가') {
            let label = m.status === '타팀지원' ? '타팀 지원 (파견)' : '장기 휴가';
            selectHtml = `<div class="w-full text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1.5 rounded shadow-sm text-center truncate">${label}</div>`;
        } else {
            selectHtml = `<select class="w-full text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1.5 rounded shadow-sm outline-none cursor-pointer text-center truncate" onchange="window.updateManualPjtAssignment('${m.name}', this.value, this.options[this.selectedIndex].text)">`;
            selectHtml += pjtOptionsHtml.replace(`value="${m.assignedPjtCode}"`, `value="${m.assignedPjtCode}" selected`);
            selectHtml += `</select>`;
        }

        let tdHtml = '';
        let initRowTotal = 0;

        for(let c=0; c<colCount; c++){
            if (periodMode === 'week') {
                let dStr = validDaysList[c];
                if (m.specificVacationDays.has(dStr)) {
                    tdHtml += `<td class="p-2 border-r bg-rose-50/50"><input type="text" value="휴가" class="w-full text-center text-xs font-bold text-rose-400 bg-transparent outline-none cursor-not-allowed" disabled></td>`;
                } else if (m.specificSupportDays.has(dStr)) {
                    tdHtml += `<td class="p-2 border-r bg-orange-50/50"><input type="text" value="지원" class="w-full text-center text-xs font-bold text-orange-400 bg-transparent outline-none cursor-not-allowed" disabled></td>`;
                } else if (m.assignedPjtCode !== 'COMMON' && m.assignedPjtDeadline && m.assignedPjtDeadline !== '-' && dStr > m.assignedPjtDeadline) {
                    tdHtml += `<td class="p-2 border-r bg-slate-100"><input type="number" step="0.5" value="0.0" class="w-full text-center text-xs font-bold text-slate-300 bg-transparent outline-none cursor-not-allowed" title="납기 초과" disabled></td>`;
                } else {
                    tdHtml += `<td class="p-2 border-r bg-slate-50/30"><input type="number" step="0.5" min="0" max="${maxVal}" value="${dMd}" class="w-full text-center text-xs font-bold text-slate-800 bg-transparent outline-none calc-trigger-md" oninput="if(this.value>${maxVal})this.value=${maxVal};"></td>`;
                    initRowTotal += parseFloat(dMd);
                }
            } else {
                tdHtml += `<td class="p-2 border-r bg-slate-50/30"><input type="number" step="0.5" min="0" max="${maxVal}" value="${dMd}" class="w-full text-center text-xs font-bold text-slate-800 bg-transparent outline-none calc-trigger-md" oninput="if(this.value>${maxVal})this.value=${maxVal};"></td>`;
                initRowTotal += parseFloat(dMd);
            }
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b"><td class="p-3 text-center border-r font-bold text-slate-800">${m.name}${vacTag}</td>
            <td class="p-2 border-r">${selectHtml}</td>
            ${tdHtml}
            <td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/30 row-total-md">${initRowTotal.toFixed(1)}</td></tr>
        `;
    }).join('');

    document.querySelectorAll('.calc-trigger-md').forEach(input => {
        input.addEventListener('input', function() {
            let maxV = parseFloat(this.getAttribute('max'));
            if(this.value > maxV) this.value = maxV;
            
            let tr = this.closest('tr');
            let sum = 0;
            tr.querySelectorAll('.calc-trigger-md').forEach(el => sum += (parseFloat(el.value)||0));
            tr.querySelector('.row-total-md').innerText = sum.toFixed(1);
        });
    });
};

window.updateManualPjtAssignment = function(memberName, pjtCode, pjtNameText) {
    if (window.lastAllocatedData && window.lastAllocatedData.members) {
        let mem = window.lastAllocatedData.members.find(m => m.name === memberName);
        if (mem) {
            mem.assignedPjtCode = pjtCode;
            mem.assignedPjtName = pjtNameText;
            
            let targetPjt = window.allocProjects.find(p => p.code === pjtCode);
            mem.assignedPjtDeadline = targetPjt ? (targetPjt.d_shipEst || '-') : '-';
            
            window.renderAllocGrid();
            window.renderAllocCalendar();
            if (window.showToast) window.showToast(`[${pjtNameText}] 납기일에 맞춰 남은 공수가 재조정되었습니다.`, "success");
        }
    }
};

window.renderAllocCalendar = function() {
    const grid = document.getElementById('alloc-cal-grid');
    const titleEl = document.getElementById('alloc-cal-title');
    if (!grid || !window.lastAllocatedData) return;

    let targetDateObj;
    if (window.lastAllocatedData.periodMode === 'week') {
        const dates = window.getDatesFromWeek(window.lastAllocatedData.targetValue);
        targetDateObj = dates.start;
    } else {
        const parts = window.lastAllocatedData.targetValue.split('-');
        if(parts.length !== 2) return;
        targetDateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    }
    
    const y = targetDateObj.getFullYear();
    const m = targetDateObj.getMonth(); 
    
    let subTitle = window.lastAllocatedData.periodMode === 'week' ? '해당 주차 캘린더' : '해당 월 캘린더';
    if (titleEl) titleEl.innerText = `${y}년 ${m + 1}월 ${subTitle} (${window.allocPartTab})`;

    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();

    let html = '';
    for(let i=0; i<firstDay; i++) {
        html += `<div class="bg-slate-50 opacity-50 border-b border-slate-200"></div>`;
    }

    for(let i=1; i<=lastDate; i++) {
        let dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let dObj = new Date(y, m, i);
        let isHoliday = KR_HOLIDAYS.has(dateStr);
        let isSunday = dObj.getDay() === 0;
        let isSaturday = dObj.getDay() === 6;
        
        let txtClass = 'text-slate-700';
        let bgClass = 'bg-white';
        let badgeHtml = '';

        if (isSunday || isHoliday) {
            txtClass = 'text-rose-500'; bgClass = 'bg-rose-50/20';
            if (isHoliday) badgeHtml += `<div class="text-[9px] font-bold text-rose-500 bg-rose-50 rounded text-center mb-1 py-0.5 border border-rose-100">공휴일</div>`;
        } else if (isSaturday) {
            txtClass = 'text-blue-500'; bgClass = 'bg-blue-50/20';
        } else {
            if (window.lastAllocatedData.validDaysList.includes(dateStr)) {
                let tintColor = window.allocPartTab === '제조' ? 'indigo' : 'teal';
                bgClass = `bg-${tintColor}-50/10 border-t-2 border-t-${tintColor}-400`;
                
                let membersHtml = window.lastAllocatedData.members.map(mem => {
                    let sName = mem.assignedPjtName || '-';

                    if (mem.specificVacationDays.has(dateStr)) {
                        return `<div class="text-[9px] font-bold border border-rose-200 bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded mb-0.5 truncate shadow-sm flex justify-between items-center"><span class="truncate pr-1">${mem.name}</span><span class="shrink-0">휴가</span></div>`;
                    }
                    if (mem.specificSupportDays.has(dateStr)) {
                        return `<div class="text-[9px] font-bold border border-orange-200 bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded mb-0.5 truncate shadow-sm flex justify-between items-center"><span class="truncate pr-1">${mem.name}</span><span class="shrink-0">지원</span></div>`;
                    }

                    let activeD = 0;
                    window.lastAllocatedData.validDaysList.forEach(vd => {
                        if (!mem.specificVacationDays.has(vd) && !mem.specificSupportDays.has(vd)) {
                            if (!mem.assignedPjtDeadline || mem.assignedPjtDeadline === '-' || vd <= mem.assignedPjtDeadline || mem.assignedPjtCode === 'COMMON') activeD++;
                        }
                    });
                    
                    let divisor = activeD > 0 ? activeD : 1;
                    
                    let pjtMd = mem.expectedPjtMd / divisor;
                    if (pjtMd > 0.8) pjtMd = 0.8;
                    let commonMd = mem.expectedCommonMd / divisor;
                    if (commonMd > 0.2) commonMd = 0.2;

                    let badges = '';

                    if (mem.assignedPjtCode !== 'COMMON' && mem.assignedPjtCode !== 'SUPPORT') {
                        if (!mem.assignedPjtDeadline || mem.assignedPjtDeadline === '-' || dateStr <= mem.assignedPjtDeadline) {
                            badges += `
                                <div class="text-[9px] font-bold border border-${tintColor}-100 bg-white text-${tintColor}-700 px-1.5 py-0.5 rounded mb-0.5 truncate shadow-sm flex justify-between items-center" title="${sName}">
                                    <span class="truncate pr-1">${mem.name}</span>
                                    <span class="shrink-0 opacity-70">${pjtMd.toFixed(1)}MD</span>
                                </div>`;
                        }
                    } 
                    else if (mem.assignedPjtCode === 'COMMON') {
                         commonMd = (mem.expectedPjtMd + mem.expectedCommonMd) / divisor;
                         if(commonMd > 1.0) commonMd = 1.0;
                         pjtMd = 0; 
                    }

                    if (commonMd > 0) {
                         badges += `
                                <div class="text-[9px] font-bold border border-slate-200 bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded mb-0.5 truncate shadow-sm flex justify-between items-center" title="${window.allocPartTab}공통">
                                    <span class="truncate pr-1">${mem.name}</span>
                                    <span class="shrink-0 opacity-70">${commonMd.toFixed(1)}MD</span>
                                </div>`;
                    }

                    return badges;
                }).join('');
                
                badgeHtml += `<div class="flex-1 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar mt-1">${membersHtml}</div>`;
            }
        }

        html += `<div class="${bgClass} p-1.5 border-b border-r border-slate-200 hover:bg-slate-50 transition-colors flex flex-col"><div class="text-xs font-black text-center mb-1 ${txtClass}">${i}</div>${badgeHtml}</div>`;
    }

    grid.innerHTML = html;
};

window.saveAllocationPlan = function() {
    window.showToast("투입 계획 초안이 확정 저장되었습니다.", "success");
};
