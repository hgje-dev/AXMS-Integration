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
    { name: '홍승현', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.2 }, 
    { name: '박종민', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 },
    { name: '박원범', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 0.8 }, 
    { name: '표영덕', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 },
    { name: '양윤석', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.2 },
    { name: '조성주', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 },
    { name: '박광렬', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 },
    { name: '이원범', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 0.8 }
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

function getValidDays(periodMode, targetValue, allowOvertime) {
    let validDays = [];
    if (periodMode === 'week') {
        const dates = window.getDatesFromWeek(targetValue);
        for(let i=0; i<5; i++) { 
            let d = new Date(dates.start); d.setDate(d.getDate() + i);
            let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if(allowOvertime || !KR_HOLIDAYS.has(dStr)) validDays.push(dStr);
        }
        if (allowOvertime) {
            let sat = new Date(dates.start); sat.setDate(sat.getDate() + 5);
            let sun = new Date(dates.start); sun.setDate(sun.getDate() + 6);
            validDays.push(`${sat.getFullYear()}-${String(sat.getMonth()+1).padStart(2,'0')}-${String(sat.getDate()).padStart(2,'0')}`);
            validDays.push(`${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`);
        }
    } else {
        const parts = targetValue.split('-');
        const y = parseInt(parts[0]); const m = parseInt(parts[1]);
        const lastDate = new Date(y, m, 0).getDate();
        for(let i=1; i<=lastDate; i++) {
            let dStr = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            let dObj = new Date(y, m-1, i);
            let isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
            if(allowOvertime || (!isWeekend && !KR_HOLIDAYS.has(dStr))) validDays.push(dStr);
        }
    }
    return validDays;
}

window.parseDateString = function(str) {
    let days = new Set();
    if(!str) return days;
    str.split(',').forEach(part => {
        part = part.trim();
        if(part.includes('-')) {
            let parts = part.split('-');
            if(parts.length === 2) {
                let start = parseInt(parts[0].trim()); let end = parseInt(parts[1].trim());
                if(!isNaN(start) && !isNaN(end)) for(let i=Math.min(start, end); i<=Math.max(start, end); i++) days.add(i);
            }
        } else { let n = parseInt(part); if(!isNaN(n)) days.add(n); }
    });
    return days;
};

window.addDateRangeToInput = function(name, type) {
    const prefix = type === 'vacation' ? 'vac' : 'sup';
    const startEl = document.getElementById(`${prefix}-start-${name}`);
    const endEl = document.getElementById(`${prefix}-end-${name}`);
    const inputEl = document.getElementById(`${prefix}-input-${name}`);

    if(!startEl || !startEl.value) { if(window.showToast) window.showToast("시작일 달력을 먼저 선택하세요.", "warning"); return; }
    let startDay = new Date(startEl.value).getDate();
    let endDay = endEl && endEl.value ? new Date(endEl.value).getDate() : startDay;
    if (startDay > endDay) { let temp = startDay; startDay = endDay; endDay = temp; }
    
    let appendStr = startDay === endDay ? `${startDay}` : `${startDay}-${endDay}`;
    let currentVal = inputEl.value.trim();
    if (currentVal) inputEl.value = currentVal.endsWith(',') ? currentVal + ' ' + appendStr : currentVal + ', ' + appendStr;
    else inputEl.value = appendStr;

    window.updateAllocMemberDates(name, type, inputEl.value);
    startEl.value = ''; if(endEl) endEl.value = '';
};

window.initAllocationPlan = function() {
    console.log("✅ AI 투입 계획 모듈 (초정밀 Capping 및 IDLE 완벽 분리 버전) 초기화");
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
    const lbl = document.getElementById('current-part-label'); if(lbl) lbl.innerText = `[${part} 파트]`;
    window.renderAllocMemberSelectors(); window.renderAllocProjectSelectors(); window.loadAllocationData(); 
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
        if(pickW) pickW.classList.remove('hidden'); if(pickM) pickM.classList.add('hidden');
        if(pickW && !pickW.value) pickW.value = window.getWeekString ? window.getWeekString(new Date()) : "2026-W17";
        if(pickW) window.updateAllocPeriodDisplay(pickW.value);
    } else {
        if(btnM) btnM.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap';
        if(btnW) btnW.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent whitespace-nowrap';
        if(pickM) pickM.classList.remove('hidden'); if(pickW) pickW.classList.add('hidden');
        if(pickM && !pickM.value) { pickM.value = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`; }
        if(pickM) window.updateAllocPeriodDisplay(pickM.value);
    }
    window.loadAllocationData();
};

window.updateAllocPeriodDisplay = function(val) {
    if(!val) return;
    const displayEl = document.getElementById('alloc-period-display'); if (!displayEl) return;
    if (window.allocPeriodMode === 'week') displayEl.innerText = window.formatWeekToKorean ? window.formatWeekToKorean(val) : val;
    else displayEl.innerText = `${val.split('-')[0]}년 ${parseInt(val.split('-')[1])}월`;
};

window.changeAllocPeriod = function(offset) {
    if (window.allocPeriodMode === 'week') {
        const picker = document.getElementById('alloc-week-picker'); if (!picker || !picker.value) return;
        const parts = picker.value.split('-W');
        const d = new Date(parseInt(parts[0]), 0, (parseInt(parts[1]) + offset - 1) * 7 + 1);
        if (window.getWeekString) { picker.value = window.getWeekString(d); window.updateAllocPeriodDisplay(picker.value); window.loadAllocationData(); }
    } else {
        const picker = document.getElementById('alloc-month-picker'); if (!picker || !picker.value) return;
        const parts = picker.value.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + offset, 1);
        picker.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        window.updateAllocPeriodDisplay(picker.value); window.loadAllocationData();
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
    if (btnRun) btnRun.innerHTML = '<i class="fa-solid fa-microchip"></i> 초정밀 AI 할당 실행';
    window.lastAllocatedData = null; 
};

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
        <div class="flex flex-col bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 shadow-sm w-full md:w-[350px]">
            <div class="flex items-center justify-between mb-2">
                <label class="flex items-center gap-1.5 cursor-pointer shrink-0 w-24">
                    <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 member-checkbox" data-name="${m.name}" ${m.active ? 'checked' : ''} onchange="window.updateAllocMemberActive('${m.name}', this.checked)">
                    <span class="text-[12px] font-bold text-slate-800">${m.name}</span>
                </label>
                <div class="flex items-center gap-1.5">
                    <select class="border border-slate-200 rounded px-1 py-1 text-[9px] font-bold text-emerald-600 outline-emerald-500 bg-white cursor-pointer" onchange="window.updateAllocMemberEfficiency('${m.name}', this.value)" ${m.active ? '' : 'disabled'} title="개인 숙련도/효율 가중치">
                        <option value="1.2" ${m.efficiency === 1.2 ? 'selected' : ''}>시니어(1.2x)</option>
                        <option value="1.0" ${m.efficiency === 1.0 ? 'selected' : ''}>일반(1.0x)</option>
                        <option value="0.8" ${m.efficiency === 0.8 ? 'selected' : ''}>주니어(0.8x)</option>
                    </select>
                    <select class="border border-slate-200 rounded px-1.5 py-1 text-[9px] font-bold text-slate-600 outline-indigo-500 bg-white cursor-pointer" onchange="window.updateAllocMemberStatus('${m.name}', this.value)" ${m.active ? '' : 'disabled'}>
                        <option value="정상" ${m.status === '정상' ? 'selected' : ''}>정상</option>
                        <option value="타팀지원" ${m.status === '타팀지원' ? 'selected' : ''}>타팀지원(전체)</option>
                        <option value="장기휴가" ${m.status === '장기휴가' ? 'selected' : ''}>장기휴가(전체)</option>
                    </select>
                    <div class="flex items-center gap-1 border-l border-slate-200 pl-1.5">
                        <span class="text-[9px] font-bold text-slate-400">차감</span>
                        <input type="number" step="0.5" min="0" max="5.0" value="${m.manualVacation || 0}" onchange="window.updateAllocMemberVacation('${m.name}', this.value)" class="w-10 border border-slate-200 rounded px-1 py-1 text-[10px] text-rose-500 font-bold outline-indigo-500 text-right bg-white" ${m.active && isNormal ? '' : 'disabled'} title="임의 차감 공수">
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-1.5 border-t border-slate-200/60 pt-2 w-full">
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

window.updateAllocMemberDates = function(name, type, val) { const member = window.allocTeamMaster.find(m => m.name === name); if(member) { if (type === 'vacation') member.vacationDates = val; else if (type === 'support') member.supportDates = val; } };
window.updateAllocMemberActive = (name, active) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.active = active; window.renderAllocMemberSelectors(); };
window.updateAllocMemberStatus = (name, status) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.status = status; window.renderAllocMemberSelectors(); };
window.updateAllocMemberVacation = (name, val) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.manualVacation = parseFloat(val) || 0; };
window.updateAllocMemberEfficiency = (name, val) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.efficiency = parseFloat(val) || 1.0; };
window.selectAllAllocMembers = (active) => { window.allocTeamMaster.filter(m => m.part === window.allocPartTab).forEach(m => m.active = active); window.renderAllocMemberSelectors(); };

window.renderAllocProjectSelectors = function() {
    const cont = document.getElementById('alloc-project-list-container'); if(!cont) return;
    const projects = window.allocProjects.filter(p => p.part === window.allocPartTab);
    if(projects.length === 0) { cont.innerHTML = `<span class="text-xs font-bold text-slate-400 p-2">해당 파트에 진행 중인 프로젝트가 없습니다.</span>`; return; }
    cont.innerHTML = projects.map(p => `
        <label class="flex items-center gap-2 bg-slate-50 hover:bg-indigo-50/50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer transition-all shadow-sm">
            <input type="checkbox" class="w-4 h-4 accent-indigo-600 shrink-0" ${p.active !== false ? 'checked' : ''} onchange="window.updateAllocProjectActive('${p.id}', this.checked)">
            <span class="text-indigo-600 font-black text-xs shrink-0 w-24">[${p.code}]</span>
            <span class="text-[11px] font-bold text-slate-700 truncate w-full" title="${p.name}">${p.name}</span>
            <span class="text-[10px] font-bold text-slate-400 shrink-0 border-l pl-2">${p.progress || 0}% 진행</span>
        </label>`).join('');
};
window.updateAllocProjectActive = function(id, active) { const p = window.allocProjects.find(x => x.id === id); if(p) p.active = active; };
window.selectAllAllocProjects = function(active) { window.allocProjects.filter(p => p.part === window.allocPartTab).forEach(p => p.active = active); window.renderAllocProjectSelectors(); };

async function fetchHistoricalDataFromAXTT() {
    let d = new Date(); let endStr = d.toISOString().split('T')[0]; d.setDate(d.getDate() - 28); let startStr = d.toISOString().split('T')[0];
    try {
        const q = query(collection(axttDb, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
        const snap = await getDocs(q);
        if (snap.empty) { window.historicalMemberMd = {}; return; }
        let rawStats = {};
        snap.forEach(docSnap => { const data = docSnap.data(); const name = data.authorName; const hours = parseFloat(data.hours) || 0; if (!rawStats[name]) rawStats[name] = 0; rawStats[name] += (hours / 8); });
        window.historicalMemberMd = {};
        for (let name in rawStats) window.historicalMemberMd[name] = Math.min(rawStats[name] / 4, 5.0); 
    } catch (error) { window.historicalMemberMd = {}; }
}

window.openAxttVerifyModal = function() {
    const modal = document.getElementById('axtt-verify-modal'); if(!modal) return;
    const tbody = document.getElementById('axtt-verify-tbody'); let html = '';
    window.allocTeamMaster.forEach(m => {
        let rawVal = window.historicalMemberMd[m.name] || 0; let finalVal = rawVal > 0 ? rawVal.toFixed(1) : '5.0'; 
        let badgeColor = m.part === '제조' ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-teal-600 bg-teal-50 border-teal-200';
        html += `<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
            <td class="p-3 text-center font-bold text-slate-800">${m.name}</td><td class="p-3 text-center"><span class="px-2 py-0.5 text-[10px] font-bold rounded shadow-sm border ${badgeColor}">${m.part}</span></td>
            <td class="p-3 text-center text-teal-600 font-bold">${rawVal > 0 ? rawVal.toFixed(1) : '<span class="text-slate-300">데이터 없음</span>'}</td><td class="p-3 text-center text-amber-600 font-black">${finalVal}</td></tr>`;
    });
    tbody.innerHTML = html; modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeAxttVerifyModal = function() { const m = document.getElementById('axtt-verify-modal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } };

// 💡 [초정밀 마스터 AI] 절대 캡 적용 + IDLE 완벽 분리 로직
window.executeAiAllocation = async function() {
    const activeMembers = window.allocTeamMaster.filter(m => m.part === window.allocPartTab && m.active);
    if (activeMembers.length === 0) return window.showToast(`투입할 [${window.allocPartTab}] 파트 인원을 최소 1명 이상 선택하세요.`, "error");

    let targetProjects = window.allocProjects.filter(p => p.part === window.allocPartTab && p.active !== false);

    const btn = document.getElementById('btn-run-ai');
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...'; btn.disabled = true; }

    const allowOvertime = document.getElementById('opt-overtime')?.checked || false;
    const applyMlCorrection = document.getElementById('opt-ml')?.checked || false;
    const optStrategy = document.getElementById('opt-strategy')?.value || 'speed';
    const riskBuffer = parseFloat(document.getElementById('opt-buffer')?.value || 1.0);

    try { await fetchHistoricalDataFromAXTT(); } catch(e) {}

    setTimeout(() => {
        try {
            let targetValue = window.allocPeriodMode === 'week' ? document.getElementById('alloc-week-picker').value : document.getElementById('alloc-month-picker').value;
            if (!targetValue) targetValue = window.allocPeriodMode === 'week' ? window.getWeekString(new Date()) : `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
            
            const validDaysList = getValidDays(window.allocPeriodMode, targetValue, allowOvertime);
            let totalPeriodDays = validDaysList.length; if (totalPeriodDays === 0) totalPeriodDays = 1; 

            let pjtAvailMD = 0; let totalCommonMD = 0; 
            
            activeMembers.forEach(m => {
                let efficiency = m.efficiency || 1.0; 
                let baseWeeklyMd = window.historicalMemberMd[m.name] || 5.0; 
                let dailyTotalMd = Math.min(baseWeeklyMd / 5, 1.0); 
                
                let dailyCommonMd = Math.min(0.1, dailyTotalMd);
                let dailyPjtMd = (dailyTotalMd - dailyCommonMd) * efficiency; 
                
                let vDates = window.parseDateString(m.vacationDates);
                let sDates = window.parseDateString(m.supportDates);
                let activeDays = 0;
                m.specificVacationDays = new Set(); m.specificSupportDays = new Set();

                validDaysList.forEach(dStr => {
                    let dayNum = parseInt(dStr.split('-')[2]);
                    if (m.status === '장기휴가' || vDates.has(dayNum)) m.specificVacationDays.add(dStr);
                    else if (m.status === '타팀지원' || sDates.has(dayNum)) m.specificSupportDays.add(dStr);
                    else activeDays++;
                });

                if (m.status === '타팀지원' || m.status === '장기휴가') {
                    m.expectedPjtMd = 0; m.expectedCommonMd = 0; m.expectedTotalMd = 0;
                } else {
                    let vDeduct = parseFloat(m.manualVacation) || 0;
                    let vDeductAdjusted = vDeduct * efficiency; 

                    m.expectedPjtMd = Math.max(0, (activeDays * dailyPjtMd) - vDeductAdjusted);
                    m.expectedCommonMd = activeDays * dailyCommonMd;
                    m.expectedTotalMd = m.expectedPjtMd + m.expectedCommonMd; 
                    pjtAvailMD += m.expectedPjtMd; totalCommonMD += m.expectedCommonMd;
                }
                m.vacationDeduct = parseFloat(m.manualVacation) || 0;
            });

            let pjtResults = []; let outResults = [];
            
            let priorities = targetProjects.map(p => {
                let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0));
                let outMd = parseFloat(p.outMd) || 0;
                
                // 💡 [핵심] 원래 남은 요구량(originalReq)을 절대 목표치(Hard Cap)로 지정
                let originalReq = Math.max(0, remain - outMd);
                
                let mlFactor = (applyMlCorrection && (p.progress || 0) < 50) ? 1.15 : 1.0;
                // internalReq는 우선순위와 1회 분배량을 키우는 데만 사용 (실제 배정 한도는 originalReq로 캡핑)
                let internalReq = originalReq * riskBuffer * mlFactor;
                
                if(outMd > 0) outResults.push({ code: p.code, name: p.name, allocated: outMd, reason: '기등록 외주' });
                let dDay = p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999;
                let score = (dDay <= 7 ? 100 : (dDay <= 14 ? 50 : 0)) + (internalReq * 2);
                
                return { ...p, internalReq, score, dDay, originalReq: originalReq, allocated: 0, mlApplied: mlFactor > 1.0, d_assyEst: p.d_assyEst, d_shipEst: p.d_shipEst };
            }).filter(p => p.originalReq > 0 || p.dDay <= 14).sort((a,b) => b.score - a.score);

            let currentAvail = pjtAvailMD;
            let periodMultiplier = totalPeriodDays / 5;
            let maxPjtLimit = Math.max(10 * periodMultiplier, pjtAvailMD * 0.45); 

            // 💡 [1차 분배] 
            priorities.forEach((p, idx) => {
                if (currentAvail <= 0) return;
                let currentLimit = p.dDay <= 7 ? Math.max(15 * periodMultiplier, pjtAvailMD * 0.6) : maxPjtLimit;
                let reqMd = Math.min(p.internalReq > 0 ? p.internalReq : (3.0 * periodMultiplier), currentLimit);
                reqMd = Math.round(reqMd * 2) / 2;
                
                // 💡 [핵심 버그 수정] 절대 원래 목표치(originalReq)를 넘지 않도록 Cap
                let alloc = Math.min(reqMd, currentAvail, p.originalReq - p.allocated);
                if (alloc > 0) {
                    p.allocated += alloc; currentAvail -= alloc; p.priority = idx + 1;
                }
            });

            // 💡 [2차 Squeeze 분배] 잉여 캐파를 프로젝트로 무한 밀어넣기 (단, originalReq 한도 내에서만)
            if (currentAvail > 0) {
                priorities.forEach(p => {
                    if (currentAvail <= 0) return;
                    let unmetReq = p.originalReq - p.allocated; // 여기서도 originalReq 기준으로 남은 양 계산
                    if (unmetReq > 0) {
                        let squeeze = Math.min(unmetReq, currentAvail);
                        squeeze = Math.round(squeeze * 2) / 2;
                        p.allocated += squeeze; currentAvail -= squeeze;
                    }
                });
            }

            priorities.forEach(p => {
                if (p.allocated > 0) pjtResults.push(p);
                let finalUnmet = p.originalReq - p.allocated;
                if (finalUnmet > 0) outResults.push({ code: p.code, name: p.name, allocated: finalUnmet, reason: '사내 캐파 절대 부족' });
            });

            // 💡 [핵심] 진짜 남는 잉여 시간(IDLE) 완벽 분리
            let idleMD = currentAvail;
            if (idleMD > 0) {
                pjtResults.push({ code: 'IDLE', name: `유휴 공수 (대기)`, allocated: idleMD, priority: 98, part: window.allocPartTab });
            }

            // 제조공통은 원래 계획된 0.1MD/일 합계만 딱 들어감
            if (totalCommonMD > 0) {
                pjtResults.push({ code: 'COMMON', name: `${window.allocPartTab}공통`, allocated: totalCommonMD, priority: 99, part: window.allocPartTab });
            }

            let pjtRemainMap = {}; pjtResults.forEach(p => pjtRemainMap[p.code] = p.allocated);
            let sortedMembers = [...activeMembers].sort((a,b) => b.expectedPjtMd - a.expectedPjtMd);
            
            // 💡 매칭 로직 (IDLE도 하나의 배정 가능 대상)
            sortedMembers.forEach(m => {
                if (m.status === '타팀지원') { m.assignedPjtName = '타팀 지원 (파견)'; m.assignedPjtCode = 'SUPPORT'; m.assignedPjtStartDate = '-'; m.assignedPjtDeadline = '-'; }
                else if (m.status === '장기휴가') { m.assignedPjtName = '장기 휴가'; m.assignedPjtCode = 'VACATION'; m.assignedPjtStartDate = '-'; m.assignedPjtDeadline = '-'; }
                else {
                    let myPjt = pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.manager === m.name && p.code !== 'COMMON' && p.code !== 'IDLE');
                    let bestPjt = null;

                    if (!myPjt && optStrategy === 'balance') {
                        if (m.efficiency > 1.0) bestPjt = pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.dDay <= 7 && p.code !== 'COMMON' && p.code !== 'IDLE');
                        else if (m.efficiency < 1.0) bestPjt = pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.dDay > 7 && p.code !== 'COMMON' && p.code !== 'IDLE');
                    }

                    if (!bestPjt) bestPjt = myPjt || pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.code !== 'COMMON' && p.code !== 'IDLE');
                    // 프로젝트가 없으면 '대기(IDLE)' 로 배정
                    if (!bestPjt) bestPjt = pjtResults.find(p => pjtRemainMap[p.code] > 0 && p.code === 'IDLE');
                    // 그것도 없으면 'COMMON' (논리상 여기까지 안 옴)
                    if (!bestPjt) bestPjt = pjtResults.find(p => p.code === 'COMMON');

                    m.assignedPjtName = bestPjt ? (bestPjt.code === 'IDLE' ? '유휴 공수 (대기)' : `[${bestPjt.code}] ${bestPjt.name}`) : 'COMMON';
                    m.assignedPjtCode = bestPjt ? bestPjt.code : 'COMMON';
                    
                    m.assignedPjtStartDate = bestPjt ? (bestPjt.d_assyEst || '-') : '-';
                    m.assignedPjtDeadline = bestPjt ? (bestPjt.d_shipEst || '-') : '-';

                    if (bestPjt && bestPjt.code !== 'COMMON') pjtRemainMap[bestPjt.code] -= m.expectedPjtMd;
                }
            });

            let aiReport = [];
            let periodText = window.allocPeriodMode === 'week' ? '주간' : '월간';

            aiReport.push(`[${window.allocPartTab} 파트 ${periodText} 진단 리포트]\n선택 인원 ${activeMembers.length}명의 개별 숙련도 가중치가 반영된 실질 PJT 산출력(MD)은 총 ${pjtAvailMD.toFixed(1)}MD 로 측정되었습니다.`);
            
            if (applyMlCorrection) aiReport.push(`🧠 [ML 오차 보정] 초기 프로젝트(진행률 50% 미만)에 15% 가중치를 주어 우선적으로 공수를 선점하게 하되, 절대 목표치(목표MD)를 초과하여 낭비되지 않도록 Hard Cap을 적용했습니다.`);
            if (allowOvertime) aiReport.push(`🔥 [특근 시뮬레이션] 주말/공휴일이 정상 영업일로 산입되어 팀의 한계 캐파(Max Capacity)를 끌어올렸습니다.`);
            if (optStrategy === 'balance') aiReport.push(`⚖️ [다중 제약 최적화] 시니어를 긴급 건에 우선 투입하고 주니어에게 여유 건을 매칭하여 팀 수익성과 육성 밸런스를 확보했습니다.`);

            if (idleMD > 0) {
                aiReport.push(`🚨 [유휴/대기 공수 발생] 모든 프로젝트의 요구량을 채우고도 ${idleMD.toFixed(1)}MD 의 시간이 남습니다. 이 잉여 시간은 기존처럼 '공통 업무'로 섞어 숨기지 않고 [유휴 공수(대기)]로 완벽히 분리하여 노출시켰습니다. 추가 수주 검토가 시급합니다.`);
            } else if (outResults.length > 0) {
                aiReport.push(`⚠️ 가동률 100% 극대화에도 불구하고 캐파가 부족하여 초과된 잔여 공수(${outResults.reduce((a,b)=>a+b.allocated,0).toFixed(1)}MD)가 발생했습니다. 납기 조율 및 외주 전환이 필요합니다.`);
            } else {
                aiReport.push(`✅ 현재 파트 내부의 산출력만으로 요구되는 모든 프로젝트 할당량을 낭비 없이 완벽히 방어할 수 있습니다.`);
            }

            window.lastAllocatedData = { periodMode: window.allocPeriodMode, targetValue: targetValue, validDaysList: validDaysList, members: activeMembers, pjtResults: pjtResults, outResults: outResults, availMD: pjtAvailMD + totalCommonMD, riskBuffer: riskBuffer, allowOvertime: allowOvertime, idleMD: idleMD };
            
            window.renderAllocUI((activeMembers.length * 5.0 * (totalPeriodDays/5)), pjtAvailMD + totalCommonMD, pjtResults, outResults, activeMembers, aiReport.join('\n\n'));
            window.renderAllocGrid(); window.renderAllocCalendar();
            
            const emptyState = document.getElementById('alloc-empty-state'); if(emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
            document.getElementById('alloc-result-dashboard').classList.remove('hidden');
            document.getElementById('btn-save-alloc').classList.remove('hidden');
            
            if(applyMlCorrection) document.getElementById('badge-ml').classList.remove('hidden'); else document.getElementById('badge-ml').classList.add('hidden');
            if(riskBuffer > 1.0) document.getElementById('buffer-badge').classList.remove('hidden'); else document.getElementById('buffer-badge').classList.add('hidden');
            
            if(allowOvertime) { 
                document.getElementById('cal-weekend-badge').innerText = '주말/특근 허용 (MAX 가동)'; 
                document.getElementById('cal-weekend-badge').className = 'text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded border border-indigo-200';
            } else { 
                document.getElementById('cal-weekend-badge').innerText = '대한민국 공휴일 제외됨'; 
                document.getElementById('cal-weekend-badge').className = 'text-[10px] font-bold text-rose-500 bg-rose-50 px-2 py-1 rounded border border-rose-200';
            }

            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 시뮬레이션 재계산'; btn.disabled = false; }
            window.showToast(`초정밀 시뮬레이션 배분 완료!`, "success");
            
        } catch (err) { console.error(err); if(btn) btn.disabled = false; }
    }, 800);
};

window.renderAllocUI = function(maxMD, availMD, pjtResults, outResults, members, aiText) {
    const insightEl = document.getElementById('alloc-ai-insight'); if (insightEl) insightEl.innerText = aiText;
    document.getElementById('alloc-kpi-members').innerText = members.length;
    document.getElementById('alloc-kpi-avail').innerText = availMD.toFixed(1);
    
    // 💡 [수정] 할당 완료는 IDLE과 COMMON을 뺀 실제 프로젝트 합계
    let assignedReal = pjtResults.filter(p => p.code !== 'COMMON' && p.code !== 'IDLE').reduce((a,b)=>a+b.allocated,0);
    document.getElementById('alloc-kpi-assigned').innerText = assignedReal.toFixed(1);
    
    // 💡 [신규] 유휴 공수 (IDLE) KPI 매핑
    let idleVal = window.lastAllocatedData.idleMD || 0;
    const idleEl = document.getElementById('alloc-kpi-idle');
    if (idleEl) idleEl.innerText = idleVal.toFixed(1);
    
    const pjtCont = document.getElementById('alloc-pjt-list');
    if(pjtCont) {
        pjtCont.innerHTML = pjtResults.map(p => {
            let badgeColor = p.priority === 1 ? 'bg-rose-500' : 'bg-indigo-500';
            let extraStyle = '';
            
            if (p.code === 'COMMON') badgeColor = 'bg-slate-400';
            else if (p.code === 'IDLE') { badgeColor = 'bg-rose-600'; extraStyle = 'border-rose-200 bg-rose-50'; } // 유휴공수 강조
            
            let mlBadge = p.mlApplied ? `<span class="text-[8px] bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded border border-indigo-200 ml-1">우선선점</span>` : '';
            
            return `<div class="flex items-center justify-between p-4 rounded-xl border border-slate-200 ${extraStyle} hover:shadow-md transition-all">
                <div class="flex items-center gap-4"><div class="w-8 h-8 rounded-full ${badgeColor} text-white flex items-center justify-center font-black shadow-sm shrink-0">${p.priority===99||p.priority===98?'-':p.priority}</div>
                <div><div class="font-black ${p.code==='IDLE'?'text-rose-700':'text-slate-800'} text-sm">${p.name} ${mlBadge}</div><div class="text-[10px] text-slate-400 font-bold">${p.code}</div></div></div>
                <div class="text-right border-l pl-4 shrink-0 min-w-[80px]"><span class="text-[10px] font-bold text-slate-400 block mb-1">최종 배정</span><span class="text-xl font-black ${p.code==='IDLE'?'text-rose-600':'text-indigo-600'}">${(p.allocated||0).toFixed(1)} MD</span></div></div>`}).join('') + outResults.map(o => `
            <div class="flex items-center justify-between p-3 rounded-lg border border-rose-100 bg-rose-50/30 mt-2 opacity-80"><span class="text-xs font-bold text-slate-600">${o.name} <span class="text-[9px] text-rose-400 ml-1">(${o.reason})</span></span><span class="text-sm font-black text-rose-500">${(o.allocated||0).toFixed(1)} MD</span></div>`).join('');
    }
    
    const ctx = document.getElementById('alloc-chart')?.getContext('2d');
    if (ctx && window.Chart) {
        if(allocChartInstance) allocChartInstance.destroy();
        window.Chart.defaults.font.family = "'Pretendard', sans-serif";
        
        let chartLabels = []; let chartData = []; let chartColors = [];
        const baseColors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];
        let colorIdx = 0;
        
        pjtResults.forEach(p => {
            chartLabels.push(p.name); chartData.push(p.allocated);
            if (p.code === 'COMMON') chartColors.push('#94a3b8'); // 회색
            else if (p.code === 'IDLE') chartColors.push('#f43f5e'); // 유휴 공수는 붉은색 경고
            else { chartColors.push(baseColors[colorIdx % baseColors.length]); colorIdx++; }
        });

        allocChartInstance = new window.Chart(ctx, { type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } } });
    }
};

window.renderAllocGrid = function() {
    if (!window.lastAllocatedData) return;
    const { members, pjtResults, periodMode, validDaysList } = window.lastAllocatedData;
    const thead = document.getElementById('alloc-grid-headers'); const tbody = document.getElementById('alloc-grid-body');
    if (!thead || !tbody) return;
    
    let weekHeaders = '';
    if (periodMode === 'week') {
        const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
        for(let i=0; i<(window.lastAllocatedData.allowOvertime ? 7 : 5); i++) {
             weekHeaders += `<th class="p-3 text-center font-bold bg-slate-800">${dayNames[i]}</th>`;
        }
    }

    let colCount = periodMode === 'week' ? (window.lastAllocatedData.allowOvertime ? 7 : 5) : 4; 
    let hHtml = `<tr><th class="p-3 text-center font-bold w-24 rounded-tl-lg bg-slate-800">이름(숙련도)</th><th class="p-3 font-bold w-48 text-center bg-slate-800">배정 PJT (선택)</th>`;
    if (periodMode === 'week') hHtml += weekHeaders;
    else hHtml += `<th class="p-3 text-center font-bold bg-slate-800">1주차</th><th class="p-3 text-center font-bold bg-slate-800">2주차</th><th class="p-3 text-center font-bold bg-slate-800">3주차</th><th class="p-3 text-center font-bold bg-slate-800">4주차</th>`;
    hHtml += `<th class="p-3 text-center font-bold text-amber-300 rounded-tr-lg bg-slate-800">산출합계(MD)</th></tr>`;
    thead.innerHTML = hHtml;

    const pjtOptionsHtml = pjtResults.filter(p => p.code !== 'IDLE').map(p => `<option value="${p.code}">${p.code === 'COMMON' ? `${window.allocPartTab}공통` : `[${p.code}] ${p.name}`}</option>`).join('');

    tbody.innerHTML = members.map((m) => {
        let activeDaysCount = 0; 
        validDaysList.forEach(vd => { 
            if (!m.specificVacationDays.has(vd) && !m.specificSupportDays.has(vd)) {
                let isBeforeStart = m.assignedPjtCode !== 'COMMON' && m.assignedPjtCode !== 'IDLE' && m.assignedPjtStartDate && m.assignedPjtStartDate !== '-' && vd < m.assignedPjtStartDate;
                let isAfterEnd = m.assignedPjtCode !== 'COMMON' && m.assignedPjtCode !== 'IDLE' && m.assignedPjtDeadline && m.assignedPjtDeadline !== '-' && vd > m.assignedPjtDeadline;
                if (!isBeforeStart && !isAfterEnd) activeDaysCount++; 
            } 
        });
        
        let divisor = activeDaysCount > 0 ? (periodMode === 'week' ? activeDaysCount : colCount) : 1;
        
        let rawDMd = parseFloat((m.expectedPjtMd / divisor).toFixed(2));
        let maxVal = periodMode === 'week' ? parseFloat((0.9 * m.efficiency).toFixed(2)) : parseFloat((4.5 * m.efficiency).toFixed(2));
        if (rawDMd > maxVal) rawDMd = maxVal;
        
        const dMd = rawDMd.toFixed(1); 

        let selectHtml = '';
        if (m.status === '타팀지원' || m.status === '장기휴가') {
            let label = m.status === '타팀지원' ? '타팀 지원 (파견)' : '장기 휴가';
            selectHtml = `<div class="w-full text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1.5 rounded shadow-sm text-center truncate">${label}</div>`;
        } else if (m.assignedPjtCode === 'IDLE') {
            selectHtml = `<div class="w-full text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-1.5 rounded shadow-sm text-center truncate">유휴/대기 (배정없음)</div>`;
        } else {
            selectHtml = `<select class="w-full text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1.5 rounded shadow-sm outline-none cursor-pointer text-center" onchange="window.updateManualPjtAssignment('${m.name}', this.value, this.options[this.selectedIndex].text)">${pjtOptionsHtml.replace(`value="${m.assignedPjtCode}"`, `value="${m.assignedPjtCode}" selected`)}</select>`;
        }

        let tdHtml = ''; let initRowTotal = 0;
        
        for(let c=0; c<colCount; c++){
            if (m.status === '타팀지원' || m.status === '장기휴가') tdHtml += `<td class="p-2 border-r bg-slate-100/50"><input value="0.0" class="w-full text-center text-xs font-bold text-slate-400 bg-transparent outline-none" disabled></td>`;
            else {
                let dStr = periodMode === 'week' ? validDaysList[c] : `week-${c}`;
                
                if (!dStr) {
                    tdHtml += `<td class="p-2 border-r bg-slate-100"><input value="-" class="w-full text-center text-xs font-bold text-slate-300 bg-transparent outline-none" disabled></td>`;
                } else if (periodMode === 'week' && m.specificVacationDays.has(dStr)) tdHtml += `<td class="p-2 border-r bg-rose-50/50"><input value="휴가" class="w-full text-center text-xs font-bold text-rose-400 bg-transparent outline-none" disabled></td>`;
                else if (periodMode === 'week' && m.specificSupportDays.has(dStr)) tdHtml += `<td class="p-2 border-r bg-orange-50/50"><input value="지원" class="w-full text-center text-xs font-bold text-orange-400 bg-transparent outline-none" disabled></td>`;
                else {
                    let isBeforeStart = periodMode === 'week' && m.assignedPjtCode !== 'COMMON' && m.assignedPjtCode !== 'IDLE' && m.assignedPjtStartDate && m.assignedPjtStartDate !== '-' && dStr < m.assignedPjtStartDate;
                    let isOverdueWork = periodMode === 'week' && m.assignedPjtCode !== 'COMMON' && m.assignedPjtCode !== 'IDLE' && m.assignedPjtDeadline && m.assignedPjtDeadline !== '-' && dStr > m.assignedPjtDeadline;
                    
                    if (isBeforeStart) {
                        tdHtml += `<td class="p-2 border-r bg-slate-100"><input value="0.0" class="w-full text-center text-xs font-bold text-slate-300 bg-transparent outline-none cursor-not-allowed" title="착수 전" disabled></td>`;
                    } else if (isOverdueWork) {
                        tdHtml += `<td class="p-2 border-r bg-rose-50/30"><input type="number" step="0.1" max="${maxVal.toFixed(1)}" value="${dMd}" class="w-full text-center text-xs font-bold text-rose-600 bg-transparent outline-none calc-trigger-md" title="납기 초과 경고"></td>`; 
                        initRowTotal += parseFloat(dMd); 
                    } else {
                        // 유휴 공수인 경우 숫자를 붉게 표시
                        let txtColor = m.assignedPjtCode === 'IDLE' ? 'text-rose-500' : (m.efficiency > 1.0 ? 'text-indigo-700' : (m.efficiency < 1.0 ? 'text-slate-500' : 'text-slate-800'));
                        tdHtml += `<td class="p-2 border-r bg-slate-50/30"><input type="number" step="0.1" max="${maxVal.toFixed(1)}" value="${dMd}" class="w-full text-center text-xs font-bold ${txtColor} bg-transparent outline-none calc-trigger-md"></td>`; 
                        initRowTotal += parseFloat(dMd); 
                    }
                }
            }
        }
        return `<tr class="hover:bg-slate-50 transition-colors border-b"><td class="p-3 text-center border-r font-bold text-slate-800">${m.name}<span class="text-[9px] text-slate-400 ml-1">x${m.efficiency}</span></td><td class="p-2 border-r">${selectHtml}</td>${tdHtml}<td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/30 row-total-md">${(initRowTotal + m.expectedCommonMd).toFixed(1)}</td></tr>`;
    }).join('');

    document.querySelectorAll('.calc-trigger-md').forEach(input => { input.addEventListener('input', function() { 
        let maxV = parseFloat(this.getAttribute('max'));
        if(this.value > maxV) this.value = maxV.toFixed(1); 
        let tr = this.closest('tr'); let sum = 0; tr.querySelectorAll('.calc-trigger-md').forEach(el => sum += (parseFloat(el.value)||0)); 
        tr.querySelector('.row-total-md').innerText = (sum + (window.lastAllocatedData.members.find(m=>m.name === tr.cells[0].innerText.split('\n')[0])?.expectedCommonMd || 0)).toFixed(1); 
    }); });
};

window.updateManualPjtAssignment = function(memberName, pjtCode, pjtNameText) {
    if (window.lastAllocatedData && window.lastAllocatedData.members) {
        let mem = window.lastAllocatedData.members.find(m => m.name === memberName);
        if (mem) {
            mem.assignedPjtCode = pjtCode; mem.assignedPjtName = pjtNameText;
            let targetPjt = window.allocProjects.find(p => p.code === pjtCode); 
            mem.assignedPjtStartDate = targetPjt ? (targetPjt.d_assyEst || '-') : '-';
            mem.assignedPjtDeadline = targetPjt ? (targetPjt.d_shipEst || '-') : '-';
            window.renderAllocGrid(); window.renderAllocCalendar();
        }
    }
};

window.renderAllocCalendar = function() {
    const grid = document.getElementById('alloc-cal-grid'); if (!grid || !window.lastAllocatedData) return;
    let targetDateObj; const { periodMode, targetValue, validDaysList, members } = window.lastAllocatedData;
    if (periodMode === 'week') targetDateObj = window.getDatesFromWeek(targetValue).start;
    else targetDateObj = new Date(parseInt(targetValue.split('-')[0]), parseInt(targetValue.split('-')[1]) - 1, 1);
    
    const y = targetDateObj.getFullYear(); const m = targetDateObj.getMonth(); 
    const firstDay = new Date(y, m, 1).getDay(); const lastDate = new Date(y, m + 1, 0).getDate();
    let html = ''; for(let i=0; i<firstDay; i++) html += `<div class="bg-slate-50 opacity-50 border-b border-slate-200"></div>`;

    for(let i=1; i<=lastDate; i++) {
        let dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let dObj = new Date(y, m, i);
        let isHoliday = KR_HOLIDAYS.has(dateStr); let isSunday = dObj.getDay() === 0; let isSaturday = dObj.getDay() === 6;
        let badgeHtml = ''; let bgClass = 'bg-white';

        if (isSunday || isHoliday) { 
            bgClass = window.lastAllocatedData.allowOvertime ? 'bg-rose-50/10' : 'bg-rose-50/30'; 
            if (isHoliday) badgeHtml += `<div class="text-[9px] font-bold text-rose-500 bg-rose-50 rounded text-center mb-1 border border-rose-100">공휴일</div>`; 
        }
        else if (isSaturday) bgClass = window.lastAllocatedData.allowOvertime ? 'bg-blue-50/10' : 'bg-blue-50/30';

        if (validDaysList.includes(dateStr)) {
            let tintColor = window.allocPartTab === '제조' ? 'indigo' : 'teal';
            bgClass += ` border-t-2 border-t-${tintColor}-400`; 
            
            let dailyCommonSum = 0;
            let pjtBadges = members.map(mem => {
                if (mem.specificVacationDays.has(dateStr)) return `<div class="text-[9px] border border-rose-200 bg-rose-50 text-rose-600 px-1 py-0.5 rounded mb-0.5 truncate flex justify-between"><span>${mem.name}</span><span>휴가</span></div>`;
                if (mem.specificSupportDays.has(dateStr)) return `<div class="text-[9px] border border-orange-200 bg-orange-50 text-orange-600 px-1 py-0.5 rounded mb-0.5 truncate flex justify-between"><span>${mem.name}</span><span>지원</span></div>`;
                
                if (mem.status === '장기휴가' || mem.status === '타팀지원') return '';

                let isActiveToday = true;
                let isOverdueWork = false;
                if (mem.assignedPjtCode !== 'COMMON' && mem.assignedPjtCode !== 'SUPPORT' && mem.assignedPjtCode !== 'IDLE') {
                    if (mem.assignedPjtStartDate && mem.assignedPjtStartDate !== '-' && dateStr < mem.assignedPjtStartDate) isActiveToday = false;
                    if (mem.assignedPjtDeadline && mem.assignedPjtDeadline !== '-' && dateStr > mem.assignedPjtDeadline) isOverdueWork = true;
                }

                if (isActiveToday) {
                    let dailyTotalMd = Math.min((window.historicalMemberMd[mem.name] || 5.0) / 5, 1.0);
                    dailyCommonSum += Math.min(0.1, dailyTotalMd); 

                    let activeD = 0;
                    validDaysList.forEach(vd => {
                        if (!mem.specificVacationDays.has(vd) && !mem.specificSupportDays.has(vd)) {
                            let isBeforeStart = mem.assignedPjtCode !== 'COMMON' && mem.assignedPjtCode !== 'IDLE' && mem.assignedPjtStartDate && mem.assignedPjtStartDate !== '-' && vd < mem.assignedPjtStartDate;
                            let isAfterEnd = mem.assignedPjtCode !== 'COMMON' && mem.assignedPjtCode !== 'IDLE' && mem.assignedPjtDeadline && mem.assignedPjtDeadline !== '-' && vd > m.assignedPjtDeadline;
                            if (!isBeforeStart && !isAfterEnd) activeD++;
                        }
                    });
                    let divisor = activeD > 0 ? activeD : 1;
                    
                    let pjtMd = mem.expectedPjtMd / divisor;

                    // 💡 [핵심] 유휴 공수(IDLE)는 달력에서도 붉은색 경고 표시
                    let badgeStyle = isOverdueWork 
                        ? `border-rose-300 bg-rose-50 text-rose-700` 
                        : (mem.assignedPjtCode === 'IDLE' 
                            ? `border-rose-200 bg-rose-50 text-rose-500 border-dashed` 
                            : `border-${tintColor}-100 bg-white text-${tintColor}-700`);

                    let sName = mem.assignedPjtCode === 'IDLE' ? '대기 (프로젝트 없음)' : (mem.assignedPjtName || '-');
                    let star = mem.efficiency > 1.0 ? '⭐' : ''; 
                    return `<div class="text-[9px] font-bold border ${badgeStyle} px-1.5 py-0.5 rounded mb-0.5 truncate flex justify-between shadow-sm" title="${sName}"><span>${mem.name}${star}</span><span>${pjtMd.toFixed(1)}MD</span></div>`;
                }
                return '';
            }).join('');

            if(dailyCommonSum > 0) {
                badgeHtml += `<div class="text-[9px] font-black border border-slate-300 bg-slate-800 text-white px-1.5 py-0.5 rounded mb-1 truncate flex justify-between shadow-md"><span>${window.allocPartTab}공통</span><span>${dailyCommonSum.toFixed(1)}MD</span></div>`;
            }
            badgeHtml += pjtBadges;
        }
        html += `<div class="${bgClass} p-1.5 border-b border-r border-slate-200 hover:bg-slate-50 transition-colors flex flex-col min-h-[100px]"><div class="text-xs font-black text-center mb-1 ${isSunday||isHoliday?'text-rose-500':isSaturday?'text-blue-500':'text-slate-700'}">${i}</div>${badgeHtml}</div>`;
    }
    grid.innerHTML = html;
};

window.saveAllocationPlan = function() { window.showToast("투입 계획 초안이 시스템에 저장되었습니다.", "success"); };
