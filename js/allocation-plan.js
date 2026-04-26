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

window.showToast = window.showToast || function(msg, type) { 
    console.log(`[${type?.toUpperCase()}] ${msg}`);
    let t = document.createElement('div');
    t.className = `fixed top-10 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-black text-sm shadow-xl transition-all animate-fade-in ${type==='error'?'bg-rose-500 text-white':'bg-emerald-500 text-white'}`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(()=>t.remove(), 500); }, 3000);
};

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
window.manualOverrides = {}; 

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
            let sat = new Date(dates.start); sat.setDate(sat.getDate() + 5); let sun = new Date(dates.start); sun.setDate(sun.getDate() + 6);
            validDays.push(`${sat.getFullYear()}-${String(sat.getMonth()+1).padStart(2,'0')}-${String(sat.getDate()).padStart(2,'0')}`);
            validDays.push(`${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,'0')}-${String(sun.getDate()).padStart(2,'0')}`);
        }
    } else {
        const parts = targetValue.split('-'); const y = parseInt(parts[0]); const m = parseInt(parts[1]); const lastDate = new Date(y, m, 0).getDate();
        for(let i=1; i<=lastDate; i++) {
            let dStr = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`; let dObj = new Date(y, m-1, i);
            let isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
            if(allowOvertime || (!isWeekend && !KR_HOLIDAYS.has(dStr))) validDays.push(dStr);
        }
    }
    return validDays;
}

window.parseDateString = function(str) {
    let days = new Set(); if(!str) return days;
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

// 💡 1. [핵심] JSON 변환 무결성 보장을 위한 커스텀 세이브 로직
window.saveAllocationPlan = function() { 
    try {
        // 객체 복사 과정에서 Set이나 DOM 노드 등 직렬화 불가 객체 원천 차단
        const safeTeamMaster = window.allocTeamMaster.map(m => ({
            name: m.name,
            part: m.part,
            active: m.active,
            manualVacation: m.manualVacation,
            status: m.status,
            vacationDates: m.vacationDates,
            supportDates: m.supportDates,
            efficiency: m.efficiency
        }));

        const draft = {
            teamMaster: safeTeamMaster,
            virtualProjects: window.allocProjects.filter(p => p.isVirtual),
            pjtActiveStates: window.allocProjects.map(p => ({ id: p.id, active: p.active })), // 프로젝트 체크 여부 저장
            manualOverrides: window.manualOverrides,
            partTab: window.allocPartTab,
            periodMode: window.allocPeriodMode,
            weekVal: document.getElementById('alloc-week-picker').value,
            monthVal: document.getElementById('alloc-month-picker').value,
            optOvertime: document.getElementById('opt-overtime').checked,
            optMl: document.getElementById('opt-ml').checked,
            optStrategy: document.getElementById('opt-strategy').value,
            optBuffer: document.getElementById('opt-buffer').value
        };
        
        localStorage.setItem('axbis_alloc_draft', JSON.stringify(draft));
        window.showToast("현재의 시뮬레이션 설정 및 수동 할당(Lock) 내역이 안전하게 보관되었습니다.", "success"); 
    } catch(e) {
        console.error("Save Error:", e);
        window.showToast("저장 중 오류가 발생했습니다.", "error");
    }
};

window.moState = { name: '', dateStr: '' };

window.openManualEditModal = function(name, dateStr) {
    window.moState = { name, dateStr };
    document.getElementById('mo-title').innerText = `[${name}] ${dateStr} 투입 할당 조정`;

    let isLocked = window.manualOverrides[name] && window.manualOverrides[name][dateStr];
    document.getElementById('mo-status').innerHTML = isLocked
        ? `<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded font-black text-[10px]"><i class="fa-solid fa-lock"></i> 수동 고정됨 (AI 터치 불가)</span>`
        : `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-black text-[10px]"><i class="fa-solid fa-robot"></i> AI 자동 배정 상태</span>`;

    let assignments = isLocked ? window.manualOverrides[name][dateStr] : 
        (window.lastAllocatedData?.members.find(m=>m.name===name)?.assignments[dateStr] || []);

    assignments = assignments.filter(a => a.code !== 'VAC' && a.code !== 'SUP' && a.code !== 'IDLE');

    const container = document.getElementById('mo-rows');
    container.innerHTML = '';
    
    if(assignments.length === 0) window.addMoRow('', 0.5); 
    else assignments.forEach(a => window.addMoRow(a.code, a.md));

    document.getElementById('manual-override-modal').classList.remove('hidden');
    document.getElementById('manual-override-modal').classList.add('flex');
};

window.addMoRow = function(code, md) {
    const container = document.getElementById('mo-rows');
    let pjtOptions = window.allocProjects.filter(p=>p.part === window.allocPartTab).map(p =>
        `<option value="${p.code}" ${p.code === code ? 'selected' : ''}>${p.isVirtual?'[가상] ':''}[${p.code}] ${p.name}</option>`
    ).join('');
    pjtOptions += `<option value="COMMON" ${code === 'COMMON' ? 'selected' : ''}>${window.allocPartTab}공통</option>`;

    let div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 mo-row animate-fade-in w-full';
    div.innerHTML = `
        <select class="flex-1 min-w-0 border border-slate-300 rounded-lg p-2 text-[10px] font-bold text-slate-700 outline-none mo-code cursor-pointer focus:border-indigo-500">${pjtOptions}</select>
        <input type="number" step="0.1" min="0" max="1.5" value="${md}" class="w-16 shrink-0 border border-slate-300 rounded-lg p-2 text-right text-[11px] font-black text-indigo-700 outline-none mo-md focus:border-indigo-500">
        <button onclick="this.parentElement.remove()" class="w-8 h-8 shrink-0 flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
};

window.saveManualOverride = function() {
    const {name, dateStr} = window.moState;
    if(!window.manualOverrides[name]) window.manualOverrides[name] = {};

    let newOverrides = [];
    document.querySelectorAll('.mo-row').forEach(row => {
        let code = row.querySelector('.mo-code').value;
        let md = parseFloat(row.querySelector('.mo-md').value);
        if(code && md > 0) newOverrides.push({code, md});
    });

    if(newOverrides.length > 0) {
        window.manualOverrides[name][dateStr] = newOverrides;
        window.showToast(`${dateStr} 배정이 수동으로 고정(Lock) 되었습니다.`, "success");
    } else {
        delete window.manualOverrides[name][dateStr]; 
    }

    document.getElementById('manual-override-modal').classList.add('hidden');
    document.getElementById('manual-override-modal').classList.remove('flex');
    
    // 💡 [추가] 수동 개입 시 즉시 저장(Auto-Save) 후 AI 재실행
    window.saveAllocationPlan();
    window.executeAiAllocation(); 
};

window.clearManualOverride = function() {
    const {name, dateStr} = window.moState;
    if(window.manualOverrides[name]) delete window.manualOverrides[name][dateStr];
    document.getElementById('manual-override-modal').classList.add('hidden');
    document.getElementById('manual-override-modal').classList.remove('flex');
    window.showToast("수동 고정이 해제되어 AI 통제로 전환됩니다.", "success");
    
    window.saveAllocationPlan(); // 변경사항 즉시 저장
    window.executeAiAllocation();
};

window.sqState = { name: '', mode: 'vacation', vacSet: new Set(), supSet: new Set(), targetY: 0, targetM: 0, lastDate: 0 };
window.openScheduleModal = function(name) {
    const member = window.allocTeamMaster.find(m => m.name === name); if(!member) return;
    window.sqState.name = name;
    window.sqState.vacSet = window.parseDateString(member.vacationDates);
    window.sqState.supSet = window.parseDateString(member.supportDates);
    window.setSqMode('vacation'); 

    let targetValue = window.allocPeriodMode === 'week' ? document.getElementById('alloc-week-picker').value : document.getElementById('alloc-month-picker').value;
    if (!targetValue) targetValue = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    let dObj = window.allocPeriodMode === 'week' ? window.getDatesFromWeek(targetValue).start : new Date(parseInt(targetValue.split('-')[0]), parseInt(targetValue.split('-')[1]) - 1, 1);
    
    window.sqState.targetY = dObj.getFullYear(); window.sqState.targetM = dObj.getMonth() + 1;
    window.sqState.lastDate = new Date(window.sqState.targetY, window.sqState.targetM, 0).getDate();
    document.getElementById('sq-modal-title').innerText = `${name} 팀원 일정 페인팅`;
    document.getElementById('sq-month-label').innerText = `${window.sqState.targetY}년 ${window.sqState.targetM}월 (클릭하여 칠하기)`;
    window.renderSqGrid();
    document.getElementById('schedule-quick-modal').classList.remove('hidden'); document.getElementById('schedule-quick-modal').classList.add('flex');
};
window.setSqMode = function(mode) {
    window.sqState.mode = mode;
    document.getElementById('sq-btn-vacation').className = `flex-1 py-2 text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'vacation' ? 'bg-white text-rose-600 shadow-sm border border-rose-200' : 'text-slate-500 hover:text-rose-500'}`;
    document.getElementById('sq-btn-support').className = `flex-1 py-2 text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'support' ? 'bg-white text-orange-500 shadow-sm border border-orange-200' : 'text-slate-500 hover:text-orange-500'}`;
    document.getElementById('sq-btn-clear').className = `flex-1 py-2 text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'clear' ? 'bg-white text-slate-700 shadow-sm border border-slate-300' : 'text-slate-500 hover:text-slate-700'}`;
};
window.renderSqGrid = function() {
    const grid = document.getElementById('sq-days-grid'); let html = '';
    for(let i=1; i<=window.sqState.lastDate; i++) {
        let isVac = window.sqState.vacSet.has(i); let isSup = window.sqState.supSet.has(i);
        let bgClass = isVac ? 'bg-rose-500 text-white border-rose-600 shadow-inner' : (isSup ? 'bg-orange-400 text-white border-orange-500 shadow-inner' : 'bg-slate-50 text-slate-700 border-slate-200');
        html += `<button onclick="window.toggleSqDay(${i})" class="w-full aspect-square rounded-xl border font-black text-sm transition-transform active:scale-95 ${bgClass}">${i}</button>`;
    }
    grid.innerHTML = html;
};
window.toggleSqDay = function(day) {
    if (window.sqState.mode === 'vacation') { window.sqState.supSet.delete(day); window.sqState.vacSet.add(day); } 
    else if (window.sqState.mode === 'support') { window.sqState.vacSet.delete(day); window.sqState.supSet.add(day); } 
    else { window.sqState.vacSet.delete(day); window.sqState.supSet.delete(day); }
    window.renderSqGrid();
};
window.saveSqSchedule = function() {
    const member = window.allocTeamMaster.find(m => m.name === window.sqState.name);
    if(member) {
        member.vacationDates = Array.from(window.sqState.vacSet).sort((a,b)=>a-b).join(', ');
        member.supportDates = Array.from(window.sqState.supSet).sort((a,b)=>a-b).join(', ');
        window.renderAllocMemberSelectors();
    }
    document.getElementById('schedule-quick-modal').classList.add('hidden'); document.getElementById('schedule-quick-modal').classList.remove('flex');
    window.saveAllocationPlan(); // 자동 저장
};

window.addVirtualProject = function() {
    const name = document.getElementById('v-pjt-name').value.trim(); const md = parseFloat(document.getElementById('v-pjt-md').value);
    const start = document.getElementById('v-pjt-start').value; const assyEnd = document.getElementById('v-pjt-assy-end').value; const end = document.getElementById('v-pjt-end').value;
    if (!name || isNaN(md)) return window.showToast("PJT 명칭과 요구 공수를 입력하세요.", "error");

    window.allocProjects.push({ id: "V-" + Date.now(), code: "가상-" + (window.allocProjects.length + 1), name: name, estMd: md, finalMd: 0, outMd: 0, d_assyEst: start, d_assyEndEst: assyEnd, d_shipEst: end, part: window.allocPartTab, active: true, isVirtual: true });
    window.renderAllocProjectSelectors(); window.showToast("가상 프로젝트가 시나리오에 투입되었습니다.", "success");
    document.getElementById('v-pjt-name').value = ''; document.getElementById('v-pjt-md').value = 10;
    window.saveAllocationPlan(); // 자동 저장
};

// 💡 2. 로컬 스토리지 데이터 자동 복원 및 화면 로딩
window.loadDraft = function() {
    let draftStr = localStorage.getItem('axbis_alloc_draft');
    if (draftStr) {
        try {
            let draft = JSON.parse(draftStr);
            if (draft.teamMaster) {
                draft.teamMaster.forEach(dm => {
                    let tm = window.allocTeamMaster.find(m => m.name === dm.name);
                    if (tm) Object.assign(tm, dm);
                });
            }
            if (draft.virtualProjects) {
                draft.virtualProjects.forEach(vp => {
                    if (!window.allocProjects.find(p => p.id === vp.id)) window.allocProjects.push(vp);
                });
            }
            
            // 💡 프로젝트 활성/비활성 상태(체크박스) 복원
            if (draft.pjtActiveStates) {
                draft.pjtActiveStates.forEach(state => {
                    let p = window.allocProjects.find(x => x.id === state.id);
                    if (p) p.active = state.active;
                });
            }

            if(draft.manualOverrides) window.manualOverrides = draft.manualOverrides;
            
            if(draft.optOvertime !== undefined) document.getElementById('opt-overtime').checked = draft.optOvertime;
            if(draft.optMl !== undefined) document.getElementById('opt-ml').checked = draft.optMl;
            if(draft.optStrategy) document.getElementById('opt-strategy').value = draft.optStrategy;
            if(draft.optBuffer) document.getElementById('opt-buffer').value = draft.optBuffer;
            if(draft.weekVal) document.getElementById('alloc-week-picker').value = draft.weekVal;
            if(draft.monthVal) document.getElementById('alloc-month-picker').value = draft.monthVal;

            if(draft.periodMode) window.allocPeriodMode = draft.periodMode;
            if(draft.partTab) window.allocPartTab = draft.partTab;
            
            console.log("💾 로컬 저장 데이터 복원 완료");
            
            // 데이터 복원 후 AI 자동 실행 (Auto-Run)
            setTimeout(() => {
                if (window.allocProjects.length > 0) window.executeAiAllocation();
            }, 600);
        } catch(e) { console.error("Draft load error", e); }
    }
};

let isFirstLoad = true;
window.initAllocationPlan = function() {
    console.log("✅ AI 투입 계획 (수동개입 + 자동저장 버그 완전 픽스) 초기화");
    onSnapshot(query(collection(axmsDb, "projects_status")), (snap) => {
        let oldProjects = [...window.allocProjects].filter(p => p.isVirtual); 
        window.allocProjects = [...oldProjects];
        snap.forEach(d => {
            let p = d.data(); p.id = d.id;
            if (p.status !== 'completed' && p.status !== 'rejected') {
                let old = oldProjects.find(op => op.id === p.id); p.active = old ? old.active : true; window.allocProjects.push(p);
            }
        });
        
        if (isFirstLoad) {
            window.loadDraft();
            window.switchAllocPeriodMode(window.allocPeriodMode);
            window.switchAllocPartTab(window.allocPartTab);
            isFirstLoad = false;
        } else {
            window.renderAllocProjectSelectors(); 
        }
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
    const btnW = document.getElementById('btn-alloc-period-week'); const btnM = document.getElementById('btn-alloc-period-month');
    const pickW = document.getElementById('alloc-week-picker'); const pickM = document.getElementById('alloc-month-picker');
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
        const parts = picker.value.split('-W'); const d = new Date(parseInt(parts[0]), 0, (parseInt(parts[1]) + offset - 1) * 7 + 1);
        if (window.getWeekString) { picker.value = window.getWeekString(d); window.updateAllocPeriodDisplay(picker.value); window.loadAllocationData(); }
    } else {
        const picker = document.getElementById('alloc-month-picker'); if (!picker || !picker.value) return;
        const parts = picker.value.split('-'); const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + offset, 1);
        picker.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        window.updateAllocPeriodDisplay(picker.value); window.loadAllocationData();
    }
};
window.loadAllocationData = function() {
    const emptyState = document.getElementById('alloc-empty-state'); const resultDash = document.getElementById('alloc-result-dashboard');
    if(emptyState) { emptyState.classList.remove('hidden'); emptyState.classList.add('flex'); }
    if(resultDash) resultDash.classList.add('hidden');
    // 💡 [수정] 저장은 수동 모달 등에서 자동 처리되므로 숨기지 않고 유지하거나, 명시적 버튼만 제어
    document.getElementById('btn-save-alloc').style.display = 'none';
    const btnRun = document.getElementById('btn-run-ai');
    if (btnRun) btnRun.innerHTML = '<i class="fa-solid fa-microchip"></i> 일자별 AI 할당 실행';
    window.lastAllocatedData = null; 
};

window.renderAllocMemberSelectors = function() {
    const container = document.getElementById('alloc-member-list-container'); if(!container) return;
    const members = window.allocTeamMaster.filter(m => m.part === window.allocPartTab);
    container.innerHTML = members.map(m => {
        let isNormal = m.status === '정상';
        let vacDisplay = m.vacationDates ? m.vacationDates : '-';
        let supDisplay = m.supportDates ? m.supportDates : '-';
        return `
        <div class="flex flex-col bg-slate-50 px-3 py-2.5 rounded-2xl border border-slate-200 shadow-sm w-full md:w-[350px] transition-all hover:border-indigo-300">
            <div class="flex items-center justify-between mb-1.5">
                <label class="flex items-center gap-1.5 cursor-pointer shrink-0 w-24">
                    <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 member-checkbox" data-name="${m.name}" ${m.active ? 'checked' : ''} onchange="window.updateAllocMemberActive('${m.name}', this.checked)">
                    <span class="text-[12px] font-bold text-slate-800">${m.name}</span>
                </label>
                <div class="flex items-center gap-1.5">
                    <select class="border border-slate-200 rounded px-1 py-1 text-[9px] font-bold text-emerald-600 bg-white outline-none cursor-pointer" onchange="window.updateAllocMemberEfficiency('${m.name}', this.value)" ${m.active ? '' : 'disabled'}>
                        <option value="1.2" ${m.efficiency === 1.2 ? 'selected' : ''}>시니어(1.2x)</option>
                        <option value="1.0" ${m.efficiency === 1.0 ? 'selected' : ''}>일반(1.0x)</option>
                        <option value="0.8" ${m.efficiency === 0.8 ? 'selected' : ''}>주니어(0.8x)</option>
                    </select>
                    <select class="border border-slate-200 rounded px-1.5 py-1 text-[9px] font-bold text-slate-600 bg-white outline-none cursor-pointer" onchange="window.updateAllocMemberStatus('${m.name}', this.value)" ${m.active ? '' : 'disabled'}>
                        <option value="정상" ${m.status === '정상' ? 'selected' : ''}>정상</option>
                        <option value="타팀지원" ${m.status === '타팀지원' ? 'selected' : ''}>타팀지원(전체)</option>
                        <option value="장기휴가" ${m.status === '장기휴가' ? 'selected' : ''}>장기휴가(전체)</option>
                    </select>
                    <div class="flex items-center gap-1 border-l border-slate-200 pl-1.5">
                        <span class="text-[9px] font-bold text-slate-400">차감</span>
                        <input type="number" step="0.5" min="0" max="5.0" value="${m.manualVacation || 0}" onchange="window.updateAllocMemberVacation('${m.name}', this.value)" class="w-10 border border-slate-200 rounded px-1 py-1 text-[10px] text-rose-500 font-bold outline-none text-right bg-white" ${m.active && isNormal ? '' : 'disabled'}>
                    </div>
                </div>
            </div>
            <div class="flex items-center justify-between bg-white border border-slate-200 px-2 py-1.5 rounded-lg mt-1" ${m.active && isNormal ? '' : 'style="opacity:0.5; pointer-events:none;"'}>
                <div class="text-[9px] text-slate-500 truncate flex-1 flex gap-2">
                    <span class="truncate" title="${vacDisplay}"><span class="text-rose-500 font-black">휴가</span> ${vacDisplay}</span>
                    <span class="text-slate-300">|</span>
                    <span class="truncate" title="${supDisplay}"><span class="text-orange-500 font-black">지원</span> ${supDisplay}</span>
                </div>
                <button onclick="window.openScheduleModal('${m.name}')" class="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded shadow-sm hover:bg-indigo-600 hover:text-white transition-colors text-[9px] font-black shrink-0 flex items-center gap-1"><i class="fa-regular fa-calendar-check"></i> 달력으로 칠하기</button>
            </div>
        </div>`;
    }).join('');
};
window.updateAllocMemberActive = (name, active) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.active = active; window.renderAllocMemberSelectors(); };
window.updateAllocMemberStatus = (name, status) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.status = status; window.renderAllocMemberSelectors(); };
window.updateAllocMemberVacation = (name, val) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.manualVacation = parseFloat(val) || 0; };
window.updateAllocMemberEfficiency = (name, val) => { const member = window.allocTeamMaster.find(m => m.name === name); if(member) member.efficiency = parseFloat(val) || 1.0; };
window.selectAllAllocMembers = (active) => { window.allocTeamMaster.filter(m => m.part === window.allocPartTab).forEach(m => m.active = active); window.renderAllocMemberSelectors(); };

window.renderAllocProjectSelectors = function() {
    const cont = document.getElementById('alloc-project-list-container'); if(!cont) return;
    const projects = window.allocProjects.filter(p => p.part === window.allocPartTab);
    cont.innerHTML = projects.map(p => `
        <label class="flex items-center gap-2 bg-slate-50 hover:bg-indigo-50/50 px-3 py-2 rounded-lg border border-slate-200 cursor-pointer transition-all shadow-sm">
            <input type="checkbox" class="w-4 h-4 accent-indigo-600 shrink-0" ${p.active !== false ? 'checked' : ''} onchange="window.updateAllocProjectActive('${p.id}', this.checked)">
            <span class="text-indigo-600 font-black text-xs shrink-0 w-24 truncate">${p.isVirtual?`<span class="bg-amber-100 text-amber-700 px-1 py-0.5 rounded text-[8px] mr-1">가상</span>`:''}[${p.code}]</span>
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

// AI 실행 로직
window.executeAiAllocation = async function() {
    const activeMembers = window.allocTeamMaster.filter(m => m.part === window.allocPartTab && m.active);
    if (activeMembers.length === 0) return window.showToast(`투입할 파트 인원을 선택하세요.`, "error");

    let targetProjects = window.allocProjects.filter(p => p.part === window.allocPartTab && p.active !== false);

    const btn = document.getElementById('btn-run-ai');
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 마이크로 스케줄링 중...'; btn.disabled = true; }

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

            let pjts = targetProjects.map(p => {
                let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0) - (parseFloat(p.outMd)||0));
                let mlFactor = (applyMlCorrection && (p.progress || 0) < 50) ? 1.15 : 1.0;
                let internalReq = remain * riskBuffer * mlFactor; 
                let dDay = p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999;
                return { ...p, originalReq: remain, remain: remain, scoreReq: internalReq, dDay, allocated: 0, mlApplied: mlFactor > 1.0 };
            });

            let pjtAvailMD = 0; let totalCommonMD = 0;
            activeMembers.forEach(m => {
                m.efficiency = m.efficiency || 1.0;
                m.vSet = window.parseDateString(m.vacationDates);
                m.sSet = window.parseDateString(m.supportDates);
                m.assignments = {}; 
                m.totalPjtMd = 0;
                m.totalIdleMd = 0;
                m.totalCommonMd = 0;
                m.remainingDeduct = parseFloat(m.manualVacation) || 0;
            });

            validDaysList.forEach(dStr => {
                let dayNum = parseInt(dStr.split('-')[2]);
                let activePjts = pjts.filter(p => p.remain > 0.05 && (!p.d_assyEst || p.d_assyEst === '-' || dStr >= p.d_assyEst));
                activePjts.sort((a,b) => a.dDay - b.dDay || b.scoreReq - a.scoreReq);

                let urgentPjts = activePjts.filter(p => p.dDay <= 7);
                let normalPjts = activePjts.filter(p => p.dDay > 7);

                activeMembers.forEach(m => {
                    m.assignments[dStr] = [];
                    let isVac = m.vSet.has(dayNum);
                    let isSup = m.sSet.has(dayNum);

                    if (m.status === '장기휴가' || m.status === '타팀지원' || isVac || isSup) return;

                    let dailyTotal = Math.min((window.historicalMemberMd[m.name] || 5.0) / 5, 1.0);
                    
                    let hasOverride = window.manualOverrides[m.name] && window.manualOverrides[m.name][dStr];
                    let manualCommon = 0;

                    if (hasOverride) {
                        let overrides = window.manualOverrides[m.name][dStr];
                        let totalManualMd = 0;
                        overrides.forEach(ov => {
                            let take = parseFloat(ov.md);
                            totalManualMd += take;
                            if (ov.code === 'COMMON') manualCommon += take;
                            else {
                                let targetP = pjts.find(p => p.code === ov.code);
                                if (targetP) { targetP.remain -= take; targetP.allocated += take; }
                            }
                            m.assignments[dStr].push({ ...ov, locked: true });
                        });

                        let availCap = Math.max(0, (dailyTotal * m.efficiency) - totalManualMd);
                        m.totalCommonMd += manualCommon;

                        availCap = Math.round(availCap * 10) / 10;
                        if (availCap > 0) {
                            m.assignments[dStr].push({ code: 'IDLE', name: '유휴 공수 (대기)', md: availCap });
                            m.totalIdleMd += availCap;
                        }

                        let pjtAssignedToday = Math.round(totalManualMd * 10) / 10 - manualCommon; 
                        m.totalPjtMd += Math.max(0, pjtAssignedToday);
                        pjtAvailMD += Math.max(0, pjtAssignedToday);

                    } else {
                        let dailyCommon = Math.min(0.1, dailyTotal);
                        let dailyCap = (dailyTotal - dailyCommon) * m.efficiency;

                        if (m.remainingDeduct > 0) {
                            let deductTake = Math.min(m.remainingDeduct, dailyCap);
                            dailyCap -= deductTake; m.remainingDeduct -= deductTake;
                        }

                        m.totalCommonMd += dailyCommon;
                        let availCap = Math.round(dailyCap * 10) / 10;

                        let pjtQueue = activePjts;
                        if (optStrategy === 'balance') pjtQueue = m.efficiency >= 1.0 ? [...urgentPjts, ...normalPjts] : [...normalPjts, ...urgentPjts];

                        for (let i = 0; i < pjtQueue.length; i++) {
                            let p = pjtQueue[i];
                            if (availCap < 0.1) break; 
                            if (p.remain < 0.1) continue; 

                            let isSetup = p.d_assyEndEst && p.d_assyEndEst !== '-' && dStr > p.d_assyEndEst;
                            let maxDaily = isSetup ? (dailyTotal * 0.2 * m.efficiency) : dailyCap;
                            
                            let take = Math.min(availCap, p.remain, maxDaily);
                            take = Math.round(take * 10) / 10;

                            if (take > 0) {
                                p.remain -= take; availCap -= take; p.allocated += take;
                                m.assignments[dStr].push({ code: p.code, name: p.name, md: take, phase: isSetup ? 'Setup' : 'Assy', d_shipEst: p.d_shipEst });
                            }
                        }

                        availCap = Math.round(availCap * 10) / 10;
                        if (availCap > 0) {
                            m.assignments[dStr].push({ code: 'IDLE', name: '유휴 공수 (대기)', md: availCap });
                            m.totalIdleMd += availCap;
                        }
                        
                        let pjtAssignedToday = Math.round((dailyCap - availCap) * 10) / 10;
                        m.totalPjtMd += pjtAssignedToday; pjtAvailMD += pjtAssignedToday; 
                    }
                });
            });

            let pjtResults = []; let outResults = [];
            totalCommonMD = activeMembers.reduce((sum, m) => sum + m.totalCommonMd, 0);
            let totalIdleMD = activeMembers.reduce((sum, m) => sum + m.totalIdleMd, 0);

            pjts.forEach((p, idx) => {
                if (p.allocated > 0) pjtResults.push({ ...p, priority: idx + 1 });
                let finalUnmet = p.originalReq - p.allocated;
                if (finalUnmet > 0.1) outResults.push({ code: p.code, name: p.name, allocated: finalUnmet, reason: '사내 캐파 절대 부족' });
            });

            if (totalIdleMD > 0) pjtResults.push({ code: 'IDLE', name: `유휴 공수 (대기)`, allocated: totalIdleMD, priority: 98, part: window.allocPartTab });
            if (totalCommonMD > 0) pjtResults.push({ code: 'COMMON', name: `${window.allocPartTab}공통`, allocated: totalCommonMD, priority: 99, part: window.allocPartTab });

            let aiReport = []; let periodText = window.allocPeriodMode === 'week' ? '주간' : '월간';
            aiReport.push(`[${window.allocPartTab} 파트 ${periodText} 마이크로 배분 리포트]\n선택 인원 ${activeMembers.length}명의 일자별 조각(테트리스) 배정 및 <b>'수동 개입(Lock)'</b> 처리를 완료했습니다.`);
            
            if (Object.keys(window.manualOverrides).length > 0) {
                aiReport.push(`⚡ [수동+자동 하이브리드 엔진] 팀장님이 직접 달력에서 자물쇠(🔒)로 고정하신 일정은 AI가 건드리지 않고 존중하며, 남은 빈 시간들만 우회하여 최적의 경로로 테트리스를 맞췄습니다.`);
            }
            if (applyMlCorrection) aiReport.push(`🧠 [ML 오차 보정] 진행률이 낮은 초기 프로젝트들에 15% 할증을 주어 우선적으로 공수를 선점하게 방어했습니다.`);
            
            if (totalIdleMD > 0) aiReport.push(`🚨 [유휴/대기 공수] 셋업 구간 진입 및 모든 할당을 마치고도 총 ${totalIdleMD.toFixed(1)}MD 의 '유휴 대기 시간'이 남습니다. 캘린더의 붉은색 대기 구간에 신규/가상 PJT를 투입하세요.`);
            else if (outResults.length > 0) aiReport.push(`⚠️ 가동률 100% 극대화에도 불구하고 캐파가 부족하여 초과된 잔여 공수(${outResults.reduce((a,b)=>a+b.allocated,0).toFixed(1)}MD)가 발생했습니다. 납기 조율이 시급합니다.`);
            else aiReport.push(`✅ 현재 파트 내부의 산출력만으로 요구되는 모든 프로젝트 할당량을 완벽 방어했습니다.`);

            window.lastAllocatedData = { periodMode: window.allocPeriodMode, targetValue: targetValue, validDaysList: validDaysList, members: activeMembers, pjtResults: pjtResults, outResults: outResults, availMD: pjtAvailMD + totalCommonMD, riskBuffer: riskBuffer, allowOvertime: allowOvertime, idleMD: totalIdleMD, assignedReal: pjtAvailMD };
            
            window.renderAllocUI(0, pjtAvailMD + totalCommonMD, pjtResults, outResults, activeMembers, aiReport.join('\n\n'));
            window.renderAllocGrid(); window.renderAllocCalendar();
            
            document.getElementById('alloc-empty-state').classList.add('hidden'); document.getElementById('alloc-result-dashboard').classList.remove('hidden');
            
            // 💡 [저장 버튼 표시] AI 실행 시 저장 버튼이 나타남
            document.getElementById('btn-save-alloc').style.display = 'flex';
            
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 마이크로 재계산'; btn.disabled = false; }
            window.showToast(`초정밀 마이크로 시뮬레이션 완료!`, "success");
        } catch (err) { console.error(err); if(btn) btn.disabled = false; }
    }, 800);
};

window.renderAllocUI = function(maxMD, availMD, pjtResults, outResults, members, aiText) {
    document.getElementById('alloc-ai-insight').innerText = aiText; document.getElementById('alloc-kpi-members').innerText = members.length;
    document.getElementById('alloc-kpi-avail').innerText = availMD.toFixed(1);
    document.getElementById('alloc-kpi-assigned').innerText = (window.lastAllocatedData.assignedReal || 0).toFixed(1);
    document.getElementById('alloc-kpi-idle').innerText = (window.lastAllocatedData.idleMD || 0).toFixed(1);
    
    const pjtCont = document.getElementById('alloc-pjt-list');
    if(pjtCont) {
        pjtCont.innerHTML = pjtResults.map(p => {
            let badgeColor = p.priority === 1 ? 'bg-rose-500' : 'bg-indigo-500'; let extraStyle = '';
            if (p.code === 'COMMON') badgeColor = 'bg-slate-400'; else if (p.code === 'IDLE') { badgeColor = 'bg-rose-600'; extraStyle = 'border-rose-200 bg-rose-50'; }
            let originalTag = p.originalReq && p.originalReq < p.allocated ? `<div class="text-[9px] text-amber-500 font-bold mt-0.5">(원본 ${p.originalReq.toFixed(1)}MD)</div>` : '';
            let mlBadge = p.mlApplied ? `<span class="text-[8px] bg-indigo-100 text-indigo-600 px-1 py-0.5 rounded border border-indigo-200 ml-1">ML보정</span>` : '';
            return `<div class="flex items-center justify-between p-4 rounded-xl border border-slate-200 ${extraStyle} hover:shadow-md transition-all">
                <div class="flex items-center gap-4"><div class="w-8 h-8 rounded-full ${badgeColor} text-white flex items-center justify-center font-black shadow-sm shrink-0">${p.priority===99||p.priority===98?'-':p.priority}</div>
                <div><div class="font-black ${p.code==='IDLE'?'text-rose-700':'text-slate-800'} text-sm">${p.name} ${mlBadge}</div><div class="text-[10px] text-slate-400 font-bold">${p.code}</div></div></div>
                <div class="text-right border-l pl-4 shrink-0 min-w-[80px]"><span class="text-[10px] font-bold text-slate-400 block mb-1">최종 배정</span><span class="text-xl font-black ${p.code==='IDLE'?'text-rose-600':'text-indigo-600'}">${(p.allocated||0).toFixed(1)} MD</span>${originalTag}</div></div>`}).join('') + outResults.map(o => `
            <div class="flex items-center justify-between p-3 rounded-lg border border-rose-100 bg-rose-50/30 mt-2 opacity-80"><span class="text-xs font-bold text-slate-600">${o.name} <span class="text-[9px] text-rose-400 ml-1">(${o.reason})</span></span><span class="text-sm font-black text-rose-500">${(o.allocated||0).toFixed(1)} MD</span></div>`).join('');
    }
    const ctx = document.getElementById('alloc-chart')?.getContext('2d');
    if (ctx && window.Chart) {
        if(allocChartInstance) allocChartInstance.destroy(); window.Chart.defaults.font.family = "'Pretendard', sans-serif";
        let chartLabels = []; let chartData = []; let chartColors = []; const baseColors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#64748b']; let colorIdx = 0;
        pjtResults.forEach(p => { chartLabels.push(p.name); chartData.push(p.allocated); if (p.code === 'COMMON') chartColors.push('#94a3b8'); else if (p.code === 'IDLE') chartColors.push('#f43f5e'); else { chartColors.push(baseColors[colorIdx % baseColors.length]); colorIdx++; } });
        allocChartInstance = new window.Chart(ctx, { type: 'doughnut', data: { labels: chartLabels, datasets: [{ data: chartData, backgroundColor: chartColors, borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } } });
    }
};

window.renderAllocGrid = function() {
    if (!window.lastAllocatedData) return;
    const { members, periodMode, validDaysList } = window.lastAllocatedData;
    const thead = document.getElementById('alloc-grid-headers'); const tbody = document.getElementById('alloc-grid-body');
    let weekHeaders = '';
    if (periodMode === 'week') { const dayNames = ['월', '화', '수', '목', '금', '토', '일']; for(let i=0; i<(window.lastAllocatedData.allowOvertime ? 7 : 5); i++) weekHeaders += `<th class="p-3 text-center font-bold bg-slate-800">${dayNames[i]}</th>`; }
    let colCount = periodMode === 'week' ? (window.lastAllocatedData.allowOvertime ? 7 : 5) : 4; 
    let hHtml = `<tr><th class="p-3 text-center font-bold w-24 rounded-tl-lg bg-slate-800">이름(숙련도)</th><th class="p-3 font-bold w-48 text-center bg-slate-800">주요 배정 상태</th>`;
    if (periodMode === 'week') hHtml += weekHeaders; else hHtml += `<th class="p-3 text-center font-bold bg-slate-800">1주차</th><th class="p-3 text-center font-bold bg-slate-800">2주차</th><th class="p-3 text-center font-bold bg-slate-800">3주차</th><th class="p-3 text-center font-bold bg-slate-800">4주차</th>`;
    hHtml += `<th class="p-3 text-center font-bold text-amber-300 rounded-tr-lg bg-slate-800">산출합계(MD)</th></tr>`; thead.innerHTML = hHtml;

    tbody.innerHTML = members.map((m) => {
        let selectHtml = `<div class="w-full text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1.5 rounded shadow-sm text-center"><i class="fa-solid fa-bolt"></i> AI 일자별 마이크로 배정중</div>`;
        if (m.status === '타팀지원' || m.status === '장기휴가') selectHtml = `<div class="w-full text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1.5 rounded shadow-sm text-center truncate">${m.status === '타팀지원' ? '타팀 지원 (파견)' : '장기 휴가'}</div>`;

        let tdHtml = ''; let initRowTotal = 0;
        for(let c=0; c<colCount; c++){
            if (m.status === '타팀지원' || m.status === '장기휴가') tdHtml += `<td class="p-2 border-r bg-slate-100/50"><input value="0.0" class="w-full text-center text-xs font-bold text-slate-400 bg-transparent outline-none" disabled></td>`;
            else {
                let dStr = periodMode === 'week' ? validDaysList[c] : `week-${c}`;
                if (!dStr) { tdHtml += `<td class="p-2 border-r bg-slate-100"><input value="-" class="w-full text-center text-xs font-bold text-slate-300 bg-transparent outline-none" disabled></td>`; continue; }
                
                let dayNum = parseInt(dStr.split('-')[2] || '0');
                if (periodMode === 'week' && m.vSet.has(dayNum)) tdHtml += `<td class="p-2 border-r bg-rose-50/50"><input value="휴가" class="w-full text-center text-xs font-bold text-rose-400 bg-transparent outline-none" disabled></td>`;
                else if (periodMode === 'week' && m.sSet.has(dayNum)) tdHtml += `<td class="p-2 border-r bg-orange-50/50"><input value="지원" class="w-full text-center text-xs font-bold text-orange-400 bg-transparent outline-none" disabled></td>`;
                else {
                    let pjtSum = 0; let hasIdle = false; let hasOverdue = false; let hasLock = false;

                    if (m.assignments[dStr]) {
                        m.assignments[dStr].forEach(a => {
                            if (a.locked) hasLock = true;
                            if (a.code === 'IDLE') hasIdle = true;
                            else if (a.code !== 'VAC' && a.code !== 'SUP') {
                                pjtSum += a.md;
                                if (a.d_shipEst && a.d_shipEst !== '-' && dStr > a.d_shipEst) hasOverdue = true;
                            }
                        });
                    }

                    pjtSum = Math.round(pjtSum * 10) / 10;
                    let dMd = pjtSum.toFixed(1);
                    let lockIcon = hasLock ? `<i class="fa-solid fa-lock text-amber-500 absolute right-1 bottom-1 text-[8px]"></i>` : '';

                    if (hasOverdue) {
                        tdHtml += `<td class="p-2 border-r bg-rose-50/30 relative"><input type="number" step="0.1" value="${dMd}" class="w-full text-center text-xs font-bold text-rose-600 bg-transparent outline-none calc-trigger-md" title="납기 초과 경고" disabled>${lockIcon}</td>`; 
                        initRowTotal += pjtSum; 
                    } else if (pjtSum === 0 && hasIdle) {
                        tdHtml += `<td class="p-2 border-r bg-rose-50/10 relative"><input type="number" step="0.1" value="0.0" class="w-full text-center text-xs font-bold text-rose-500 bg-transparent outline-none calc-trigger-md" title="유휴 대기" disabled>${lockIcon}</td>`; 
                    } else {
                        let txtColor = m.efficiency > 1.0 ? 'text-indigo-700' : (m.efficiency < 1.0 ? 'text-slate-500' : 'text-slate-800');
                        tdHtml += `<td class="p-2 border-r bg-slate-50/30 relative"><input type="number" step="0.1" value="${dMd}" class="w-full text-center text-xs font-bold ${txtColor} bg-transparent outline-none calc-trigger-md" disabled>${lockIcon}</td>`; 
                        initRowTotal += pjtSum; 
                    }
                }
            }
        }
        return `<tr class="hover:bg-slate-50 transition-colors border-b"><td class="p-3 text-center border-r font-bold text-slate-800">${m.name}<span class="text-[9px] text-slate-400 ml-1">x${m.efficiency}</span></td><td class="p-2 border-r">${selectHtml}</td>${tdHtml}<td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/30 row-total-md">${(initRowTotal + m.totalCommonMd).toFixed(1)}</td></tr>`;
    }).join('');
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

        if (isSunday || isHoliday) { bgClass = window.lastAllocatedData.allowOvertime ? 'bg-rose-50/10' : 'bg-rose-50/30'; if (isHoliday) badgeHtml += `<div class="text-[9px] font-bold text-rose-500 bg-rose-50 rounded text-center mb-1 border border-rose-100">공휴일</div>`; }
        else if (isSaturday) bgClass = window.lastAllocatedData.allowOvertime ? 'bg-blue-50/10' : 'bg-blue-50/30';

        if (validDaysList.includes(dateStr)) {
            let tintColor = window.allocPartTab === '제조' ? 'indigo' : 'teal'; bgClass += ` border-t-2 border-t-${tintColor}-400`; 
            
            let dailyCommonSum = 0;
            let pjtBadges = members.map(mem => {
                let dayAssignments = mem.assignments[dateStr];
                if (!dayAssignments || dayAssignments.length === 0) return '';

                let memHtml = ''; let hasRealWork = false;

                dayAssignments.forEach(a => {
                    if (a.code === 'VAC') memHtml += `<div class="text-[9px] border border-rose-200 bg-rose-50 text-rose-600 px-1 py-0.5 rounded mb-0.5 truncate flex justify-between items-center shadow-sm"><div class="flex items-center gap-1 truncate w-full"><span class="font-black shrink-0">${mem.name}</span><span class="text-[8px] opacity-75 truncate max-w-[50px] leading-tight">휴가</span></div></div>`;
                    else if (a.code === 'SUP') memHtml += `<div class="text-[9px] border border-orange-200 bg-orange-50 text-orange-600 px-1 py-0.5 rounded mb-0.5 truncate flex justify-between items-center shadow-sm"><div class="flex items-center gap-1 truncate w-full"><span class="font-black shrink-0">${mem.name}</span><span class="text-[8px] opacity-75 truncate max-w-[50px] leading-tight">지원</span></div></div>`;
                    else {
                        if (a.code !== 'IDLE') hasRealWork = true;
                        
                        let isSetupPhase = a.phase === 'Setup';
                        let isOverdueWork = a.d_shipEst && a.d_shipEst !== '-' && dateStr > a.d_shipEst;
                        
                        let badgeStyle = isOverdueWork ? `border-rose-300 bg-rose-50 text-rose-700` : (a.code === 'IDLE' ? `border-rose-200 bg-rose-50 text-rose-500 border-dashed` : (isSetupPhase ? `border-teal-200 bg-teal-50 text-teal-700` : `border-${tintColor}-100 bg-white text-${tintColor}-700`));
                        let star = mem.efficiency > 1.0 ? '⭐' : ''; 
                        let lockIcon = a.locked ? '<i class="fa-solid fa-lock text-amber-500 ml-0.5"></i>' : '';
                        
                        let shortCode = a.code === 'IDLE' ? '대기' : (a.code === 'COMMON' ? '공통' : a.code);
                        if (isSetupPhase) shortCode += '(셋업)';

                        memHtml += `<div onclick="window.openManualEditModal('${mem.name}', '${dateStr}')" class="text-[9px] font-bold border ${badgeStyle} px-1 py-0.5 rounded mb-0.5 flex justify-between items-center shadow-sm cursor-pointer hover:border-amber-400 hover:ring-1 hover:ring-amber-200 transition-all" title="${a.name} (클릭하여 수동 조정)">
                                    <div class="flex items-center gap-1 truncate w-full">
                                        <span class="font-black shrink-0">${mem.name}${star}${lockIcon}</span>
                                        <span class="text-[8px] opacity-75 truncate max-w-[50px] leading-tight">${shortCode}</span>
                                    </div>
                                    <span class="shrink-0 ml-1">${a.md.toFixed(1)}</span>
                                </div>`;
                    }
                });

                if (hasRealWork || dayAssignments.find(a=>a.code === 'IDLE')) dailyCommonSum += 0.1; 
                return memHtml;
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
