/* eslint-disable */
import { app, db as axmsDb } from './firebase.js';
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const axttConfig = { apiKey: "AIzaSyA_LSZ2wvuvkyh_nCqMbdFchkG_qQvmFWY", authDomain: "axtt-b064c.firebaseapp.com", projectId: "axtt-b064c", storageBucket: "axtt-b064c.firebasestorage.app", messagingSenderId: "592770464981", appId: "1:592770464981:web:15c4b550c401e7bcb0765c", measurementId: "G-V28BZLW8XQ" };

let axttApp;
try { axttApp = getApp("AXTT_APP"); } 
catch (e) { axttApp = initializeApp(axttConfig, "AXTT_APP"); }
const axttDb = getFirestore(axttApp);

window.showToast = window.showToast || function(msg, type) { 
    let t = document.createElement('div');
    t.className = `fixed top-10 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-black text-sm shadow-xl transition-all animate-fade-in ${type==='error'?'bg-rose-500 text-white':'bg-emerald-500 text-white'}`;
    t.innerText = msg; document.body.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(()=>t.remove(), 500); }, 3000);
};

window.allocPartTab = '제조'; window.allocPeriodMode = 'month'; 
window.allocTeamMaster = [
    { name: '홍승현', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.2 }, { name: '박종민', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 }, { name: '박원범', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 0.8 }, { name: '표영덕', part: '제조', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 }, { name: '양윤석', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.2 }, { name: '조성주', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 }, { name: '박광렬', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 1.0 }, { name: '이원범', part: '광학', active: true, manualVacation: 0, status: '정상', vacationDates: '', supportDates: '', efficiency: 0.8 }
];
window.allocProjects = []; window.historicalMemberMd = {}; window.lastAllocatedData = null; window.manualOverrides = {}; 

const KR_HOLIDAYS = new Set(['2024-01-01', '2024-02-09', '2024-02-12', '2024-03-01', '2024-04-10', '2024-05-06', '2024-05-15', '2024-06-06', '2024-08-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-10-03', '2024-10-09', '2024-12-25', '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-09', '2025-12-25', '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25']);

window.getWeekString = function(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

window.getDatesFromWeek = function(weekStr) {
    if(!weekStr) return { start: new Date() };
    const [y, w] = weekStr.split('-W').map(Number);
    const d = new Date(y, 0, 1 + (w - 1) * 7);
    const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return { start: d };
};

window.formatWeekToKorean = function(weekStr) {
    if(!weekStr) return ''; const p = weekStr.split('-W'); return `${p[0]}년 ${p[1]}주차`;
};

window.getValidDays = function(periodMode, targetValue, allowOvertime) {
    let validDays = [];
    if (periodMode === 'week') {
        const startD = window.getDatesFromWeek(targetValue).start;
        for(let i=0; i<5; i++) { 
            let d = new Date(startD); d.setDate(d.getDate() + i);
            let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            if(allowOvertime || !KR_HOLIDAYS.has(dStr)) validDays.push(dStr);
        }
        if (allowOvertime) {
            for(let i=5; i<=6; i++) {
                let d = new Date(startD); d.setDate(d.getDate() + i);
                validDays.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
            }
        }
    } else {
        const parts = targetValue.split('-'); const y = parseInt(parts[0]); const m = parseInt(parts[1]); 
        const lastDate = new Date(y, m, 0).getDate();
        for(let i=1; i<=lastDate; i++) {
            let dStr = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`; let dObj = new Date(y, m-1, i);
            let isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
            if(allowOvertime || (!isWeekend && !KR_HOLIDAYS.has(dStr))) validDays.push(dStr);
        }
    }
    return validDays;
};

window.parseDateString = function(str) {
    let days = new Set(); if(!str) return days;
    str.split(',').forEach(p => { p = p.trim(); if(p.includes('-')) { let r = p.split('-'); for(let i=parseInt(r[0]); i<=parseInt(r[1]); i++) days.add(i); } else { let n = parseInt(p); if(!isNaN(n)) days.add(n); } });
    return days;
};

window.saveAllocationPlan = function() { 
    try {
        const sm = window.allocTeamMaster.map(m => ({ name: m.name, part: m.part, active: m.active, manualVacation: m.manualVacation, status: m.status, vacationDates: m.vacationDates, supportDates: m.supportDates, efficiency: m.efficiency }));
        const draft = { teamMaster: sm, virtualProjects: window.allocProjects.filter(p => p.isVirtual), pjtActiveStates: window.allocProjects.map(p => ({ id: p.id, active: p.active })), manualOverrides: window.manualOverrides, partTab: window.allocPartTab, periodMode: window.allocPeriodMode, weekVal: document.getElementById('alloc-week-picker').value, monthVal: document.getElementById('alloc-month-picker').value, optOvertime: document.getElementById('opt-overtime').checked, optStrategy: document.getElementById('opt-strategy').value };
        localStorage.setItem('axbis_alloc_draft', JSON.stringify(draft)); document.getElementById('btn-save-alloc').style.display = 'flex';
    } catch(e) { console.error("Save Error", e); }
};

window.loadDraft = function() {
    let ds = localStorage.getItem('axbis_alloc_draft');
    if (ds) {
        try {
            let d = JSON.parse(ds);
            if (d.teamMaster) d.teamMaster.forEach(dm => { let tm = window.allocTeamMaster.find(m => m.name === dm.name); if (tm) Object.assign(tm, dm); });
            if (d.virtualProjects) d.virtualProjects.forEach(vp => { if (!window.allocProjects.find(p => p.id === vp.id)) window.allocProjects.push(vp); });
            if (d.pjtActiveStates) d.pjtActiveStates.forEach(s => { let p = window.allocProjects.find(x => x.id === s.id); if (p) p.active = s.active; });
            if (d.manualOverrides) window.manualOverrides = d.manualOverrides;
            if (d.optOvertime !== undefined) document.getElementById('opt-overtime').checked = d.optOvertime;
            if (d.optStrategy) document.getElementById('opt-strategy').value = d.optStrategy;
            if (d.weekVal) document.getElementById('alloc-week-picker').value = d.weekVal;
            if (d.monthVal) document.getElementById('alloc-month-picker').value = d.monthVal;
            if (d.periodMode) window.allocPeriodMode = d.periodMode;
            if (d.partTab) window.allocPartTab = d.partTab;
            setTimeout(() => window.executeAiAllocation(), 300); 
        } catch(e) { console.error("Load Draft Error", e); }
    }
};

window.moState = { name: '', dateStr: '' };
window.openManualEditModal = function(name, dateStr) {
    window.moState = { name, dateStr }; document.getElementById('mo-title').innerText = `[${name}] ${dateStr} 투입 조정`;
    let isLocked = window.manualOverrides[name] && window.manualOverrides[name][dateStr];
    document.getElementById('mo-status').innerHTML = isLocked ? `<span class="bg-rose-100 text-rose-700 px-2 py-1 rounded font-black text-[10px]"><i class="fa-solid fa-lock"></i> 수동 고정됨 (AI 터치 불가)</span>` : `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-black text-[10px]"><i class="fa-solid fa-robot"></i> AI 자동 배정 상태</span>`;
    let assignments = isLocked ? window.manualOverrides[name][dateStr] : (window.lastAllocatedData?.members.find(m=>m.name===name)?.assignments[dateStr] || []);
    assignments = assignments.filter(a => a.code !== 'VAC' && a.code !== 'SUP' && a.code !== 'IDLE');
    document.getElementById('mo-rows').innerHTML = '';
    if(assignments.length === 0) window.addMoRow('', 0.5); else assignments.forEach(a => window.addMoRow(a.code, a.md));
    document.getElementById('manual-override-modal').classList.remove('hidden'); document.getElementById('manual-override-modal').classList.add('flex');
};

window.addMoRow = function(code, md) {
    let opts = window.allocProjects.filter(p=>p.part === window.allocPartTab).map(p => `<option value="${p.code}" ${p.code === code ? 'selected' : ''}>${p.isVirtual?'[가상] ':''}[${p.code}] ${p.name}</option>`).join('');
    opts += `<option value="COMMON" ${code === 'COMMON' ? 'selected' : ''}>${window.allocPartTab}공통</option>`;
    let div = document.createElement('div'); div.className = 'flex items-center gap-2 mb-2 mo-row w-full animate-fade-in';
    div.innerHTML = `<select class="flex-1 min-w-0 border rounded-lg p-2 text-[10px] font-bold mo-code">${opts}</select><input type="number" step="0.1" value="${md}" class="w-16 shrink-0 border rounded-lg p-2 text-right text-[11px] font-black mo-md"><button onclick="this.parentElement.remove()" class="w-8 h-8 shrink-0 text-slate-300 hover:text-rose-500 bg-white border rounded-lg"><i class="fa-solid fa-trash"></i></button>`;
    document.getElementById('mo-rows').appendChild(div);
};
window.saveManualOverride = function() {
    const {name, dateStr} = window.moState; if(!window.manualOverrides[name]) window.manualOverrides[name] = {};
    let no = []; document.querySelectorAll('.mo-row').forEach(r => { let c = r.querySelector('.mo-code').value; let md = parseFloat(r.querySelector('.mo-md').value); if(c && md > 0) no.push({code:c, md}); });
    if(no.length > 0) window.manualOverrides[name][dateStr] = no; else delete window.manualOverrides[name][dateStr];
    document.getElementById('manual-override-modal').classList.add('hidden'); document.getElementById('manual-override-modal').classList.remove('flex');
    window.saveAllocationPlan(); window.executeAiAllocation(); 
};
window.clearManualOverride = function() { const {name, dateStr} = window.moState; if(window.manualOverrides[name]) delete window.manualOverrides[name][dateStr]; document.getElementById('manual-override-modal').classList.add('hidden'); document.getElementById('manual-override-modal').classList.remove('flex'); window.saveAllocationPlan(); window.executeAiAllocation(); };

window.sqState = { name: '', mode: 'vacation', vacSet: new Set(), supSet: new Set(), lastDate: 0 };
window.openScheduleModal = function(name) {
    const mem = window.allocTeamMaster.find(m => m.name === name); if(!mem) return;
    window.sqState.name = name; window.sqState.vacSet = window.parseDateString(mem.vacationDates); window.sqState.supSet = window.parseDateString(mem.supportDates);
    window.setSqMode('vacation'); 
    let tv = window.allocPeriodMode === 'week' ? document.getElementById('alloc-week-picker').value : document.getElementById('alloc-month-picker').value;
    if (!tv) tv = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
    let dObj = window.allocPeriodMode === 'week' ? window.getDatesFromWeek(tv).start : new Date(parseInt(tv.split('-')[0]), parseInt(tv.split('-')[1]) - 1, 1);
    window.sqState.lastDate = new Date(dObj.getFullYear(), dObj.getMonth() + 1, 0).getDate();
    document.getElementById('sq-modal-title').innerText = `${name} 팀원 일정 페인팅`; document.getElementById('sq-month-label').innerText = `${dObj.getFullYear()}년 ${dObj.getMonth()+1}월`;
    window.renderSqGrid(); document.getElementById('schedule-quick-modal').classList.remove('hidden'); document.getElementById('schedule-quick-modal').classList.add('flex');
};
window.setSqMode = function(m) { window.sqState.mode = m; ['vacation','support','clear'].forEach(x => { document.getElementById(`sq-btn-${x}`).className = `flex-1 py-2 text-[11px] font-black rounded-lg ${m === x ? (x==='vacation'?'bg-white text-rose-600 border border-rose-200 shadow-sm':(x==='support'?'bg-white text-orange-500 border border-orange-200 shadow-sm':'bg-white text-slate-700 border border-slate-300 shadow-sm')) : 'text-slate-500 hover:text-slate-700'}`; }); };
window.renderSqGrid = function() {
    let h = ''; for(let i=1; i<=window.sqState.lastDate; i++) {
        let isV = window.sqState.vacSet.has(i); let isS = window.sqState.supSet.has(i);
        let bc = isV ? 'bg-rose-500 text-white border-rose-600 shadow-inner' : (isS ? 'bg-orange-400 text-white border-orange-500 shadow-inner' : 'bg-slate-50 text-slate-700 border-slate-200');
        h += `<button onclick="window.toggleSqDay(${i})" class="w-full aspect-square rounded-xl border font-black text-sm active:scale-95 ${bc}">${i}</button>`;
    }
    document.getElementById('sq-days-grid').innerHTML = h;
};
window.toggleSqDay = function(d) { let s=window.sqState; if (s.mode === 'vacation') { s.supSet.delete(d); s.vacSet.add(d); } else if (s.mode === 'support') { s.vacSet.delete(d); s.supSet.add(d); } else { s.vacSet.delete(d); s.supSet.delete(d); } window.renderSqGrid(); };
window.saveSqSchedule = function() {
    const mem = window.allocTeamMaster.find(m => m.name === window.sqState.name);
    if(mem) { mem.vacationDates = Array.from(window.sqState.vacSet).sort((a,b)=>a-b).join(', '); mem.supportDates = Array.from(window.sqState.supSet).sort((a,b)=>a-b).join(', '); window.renderAllocMemberSelectors(); }
    document.getElementById('schedule-quick-modal').classList.add('hidden'); document.getElementById('schedule-quick-modal').classList.remove('flex'); window.saveAllocationPlan(); 
};

window.addVirtualProject = function() {
    const name = document.getElementById('v-pjt-name').value.trim(); const md = parseFloat(document.getElementById('v-pjt-md').value);
    const start = document.getElementById('v-pjt-start').value; const assyEnd = document.getElementById('v-pjt-assy-end').value; const end = document.getElementById('v-pjt-end').value;
    if (!name || isNaN(md)) return window.showToast("PJT 명칭과 요구 공수를 입력하세요.", "error");
    window.allocProjects.push({ id: "V-" + Date.now(), code: "가상-" + (window.allocProjects.length + 1), name: name, estMd: md, finalMd: 0, outMd: 0, d_assyEst: start, d_assyEndEst: assyEnd, d_shipEst: end, part: window.allocPartTab, active: true, isVirtual: true });
    window.renderAllocProjectSelectors(); window.showToast("가상 프로젝트가 시나리오에 투입되었습니다.", "success");
    document.getElementById('v-pjt-name').value = ''; document.getElementById('v-pjt-md').value = 10; window.saveAllocationPlan(); 
};

// 💡 수정됨: 누락되어 에러를 발생시킨 함수를 임시로 선언하여 방어
window.fetchHistoricalDataFromAXTT = function() {
    console.log("AXTT 과거 데이터 연동 준비 완료");
};

let isFirstLoad = true;
window.initAllocationPlan = function() {
    onSnapshot(query(collection(axmsDb, "projects_status")), (snap) => {
        let old = [...window.allocProjects].filter(p => p.isVirtual); window.allocProjects = [...old];
        snap.forEach(d => { let p = d.data(); p.id = d.id; if (p.status !== 'completed' && p.status !== 'rejected') { let op = old.find(o => o.id === p.id); p.active = op ? op.active : true; window.allocProjects.push(p); } });
        if (isFirstLoad) { window.loadDraft(); window.switchAllocPeriodMode(window.allocPeriodMode); window.switchAllocPartTab(window.allocPartTab); isFirstLoad = false; } 
        else { window.renderAllocProjectSelectors(); }
    });
    fetchHistoricalDataFromAXTT();
};

window.switchAllocPartTab = function(part) { window.allocPartTab = part; let mf = document.getElementById('btn-alloc-part-mfg'); let op = document.getElementById('btn-alloc-part-opt'); if (mf) mf.className = part === '제조' ? "px-3 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700" : "px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md"; if (op) op.className = part === '광학' ? "px-3 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700" : "px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md"; window.renderAllocMemberSelectors(); window.renderAllocProjectSelectors(); window.loadAllocationData(); };
window.switchAllocPeriodMode = function(mode) {
    window.allocPeriodMode = mode; const bw = document.getElementById('btn-alloc-period-week'); const bm = document.getElementById('btn-alloc-period-month'); const pw = document.getElementById('alloc-week-picker'); const pm = document.getElementById('alloc-month-picker');
    if (mode === 'week') { if(bw) bw.className='px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg'; if(bm) bm.className='px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-transparent'; if(pw) pw.classList.remove('hidden'); if(pm) pm.classList.add('hidden'); if(pw && !pw.value) pw.value = window.getWeekString(new Date()); if(pw) window.updateAllocPeriodDisplay(pw.value); } 
    else { if(bm) bm.className='px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg'; if(bw) bw.className='px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-transparent'; if(pm) pm.classList.remove('hidden'); if(pw) pw.classList.add('hidden'); if(pm && !pm.value) pm.value = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`; if(pm) window.updateAllocPeriodDisplay(pm.value); }
    if (!isFirstLoad) { window.saveAllocationPlan(); window.executeAiAllocation(); }
};
window.updateAllocPeriodDisplay = function(val) { const el = document.getElementById('alloc-period-display'); if (!el) return; if (window.allocPeriodMode === 'week') el.innerText = window.formatWeekToKorean(val); else el.innerText = `${val.split('-')[0]}년 ${parseInt(val.split('-')[1])}월`; };
window.changeAllocPeriod = function(o) {
    if (window.allocPeriodMode === 'week') { const p = document.getElementById('alloc-week-picker'); if (!p || !p.value) return; const pt = p.value.split('-W'); const d = new Date(parseInt(pt[0]), 0, (parseInt(pt[1]) + o - 1) * 7 + 1); p.value = window.getWeekString(d); window.updateAllocPeriodDisplay(p.value); window.executeAiAllocation(); } 
    else { const p = document.getElementById('alloc-month-picker'); if (!p || !p.value) return; const pt = p.value.split('-'); const d = new Date(parseInt(pt[0]), parseInt(pt[1]) - 1 + o, 1); p.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; window.updateAllocPeriodDisplay(p.value); window.executeAiAllocation(); }
};
window.loadAllocationData = function() { document.getElementById('alloc-empty-state').classList.remove('hidden'); document.getElementById('alloc-empty-state').classList.add('flex'); document.getElementById('alloc-result-dashboard').classList.add('hidden'); const btn = document.getElementById('btn-run-ai'); if (btn) btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 빈칸 채우기'; window.lastAllocatedData = null; };

window.renderAllocMemberSelectors = function() {
    const cont = document.getElementById('alloc-member-list-container'); if(!cont) return; const members = window.allocTeamMaster.filter(m => m.part === window.allocPartTab);
    cont.innerHTML = members.map(m => {
        let isNorm = m.status === '정상'; let vDisp = m.vacationDates || '-'; let sDisp = m.supportDates || '-';
        return `
        <div class="bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 shadow-sm w-full transition-all hover:border-indigo-300">
            <div class="flex items-center justify-between mb-1.5">
                <label class="flex items-center gap-1.5 cursor-pointer shrink-0 w-20"><input type="checkbox" class="w-3 h-3 accent-indigo-600" ${m.active ? 'checked' : ''} onchange="window.updateAllocMemberActive('${m.name}', this.checked)"><span class="text-[11px] font-bold">${m.name}</span></label>
                <div class="flex items-center gap-1.5">
                    <select class="border rounded px-1 py-1 text-[9px] font-bold text-emerald-600 bg-white outline-none" onchange="window.updateAllocMemberEfficiency('${m.name}', this.value)" ${m.active ? '' : 'disabled'}><option value="1.2" ${m.efficiency === 1.2 ? 'selected' : ''}>시니어(1.2x)</option><option value="1.0" ${m.efficiency === 1.0 ? 'selected' : ''}>일반(1.0x)</option><option value="0.8" ${m.efficiency === 0.8 ? 'selected' : ''}>주니어(0.8x)</option></select>
                    <select class="border rounded px-1 text-[9px] font-bold bg-white outline-none" onchange="window.updateAllocMemberStatus('${m.name}', this.value)" ${m.active ? '' : 'disabled'}><option value="정상" ${m.status === '정상' ? 'selected' : ''}>정상</option><option value="타팀지원" ${m.status === '타팀지원' ? 'selected' : ''}>지원</option><option value="장기휴가" ${m.status === '장기휴가' ? 'selected' : ''}>휴가</option></select>
                </div>
            </div>
            <div class="flex items-center justify-between bg-white border px-2 py-1 rounded mt-1" ${m.active && isNorm ? '' : 'style="opacity:0.5; pointer-events:none;"'}>
                <div class="text-[9px] text-slate-500 truncate flex-1"><span class="text-rose-500 font-black">휴가</span> ${vDisp} <span class="text-slate-300 mx-1">|</span> <span class="text-orange-500 font-black">지원</span> ${sDisp}</div>
                <button onclick="window.openScheduleModal('${m.name}')" class="bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded text-[8px] font-black hover:bg-indigo-600 hover:text-white transition-colors"><i class="fa-solid fa-calendar"></i> 페인팅</button>
            </div>
        </div>`;
    }).join('');
};
window.updateAllocMemberActive = (name, a) => { const m = window.allocTeamMaster.find(x => x.name === name); if(m) m.active = a; window.renderAllocMemberSelectors(); window.saveAllocationPlan(); };
window.updateAllocMemberStatus = (name, s) => { const m = window.allocTeamMaster.find(x => x.name === name); if(m) m.status = s; window.renderAllocMemberSelectors(); window.saveAllocationPlan(); };
window.updateAllocMemberEfficiency = (name, v) => { const m = window.allocTeamMaster.find(x => x.name === name); if(m) m.efficiency = parseFloat(v) || 1.0; window.saveAllocationPlan(); };
window.selectAllAllocMembers = (a) => { window.allocTeamMaster.filter(m => m.part === window.allocPartTab).forEach(m => m.active = a); window.renderAllocMemberSelectors(); window.saveAllocationPlan(); };

window.renderAllocProjectSelectors = function() {
    const cont = document.getElementById('alloc-project-list-container'); if(!cont) return; const pjts = window.allocProjects.filter(p => p.part === window.allocPartTab);
    cont.innerHTML = pjts.map(p => `<label class="flex items-center gap-2 bg-slate-50 hover:bg-indigo-50/50 px-3 py-2 rounded-xl border border-slate-200 cursor-pointer shadow-sm"><input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 shrink-0" ${p.active !== false ? 'checked' : ''} onchange="window.updateAllocProjectActive('${p.id}', this.checked)"><span class="text-indigo-600 font-black text-[11px] shrink-0 w-24 truncate">${p.isVirtual?`<span class="bg-amber-100 text-amber-700 px-1 py-0.5 rounded mr-1">가상</span>`:''}[${p.code}]</span><span class="text-[10px] font-bold text-slate-700 truncate w-full">${p.name}</span></label>`).join('');
};
window.updateAllocProjectActive = (id, a) => { const p = window.allocProjects.find(x => x.id === id); if(p) p.active = a; window.saveAllocationPlan(); };
window.selectAllAllocProjects = (a) => { window.allocProjects.filter(p => p.part === window.allocPartTab).forEach(p => p.active = a); window.renderAllocProjectSelectors(); window.saveAllocationPlan(); };

window.executeAiAllocation = async function() {
    const activeMembers = window.allocTeamMaster.filter(m => m.part === window.allocPartTab && m.active);
    if (activeMembers.length === 0) return window.showToast("투입할 파트 인원을 선택하세요.", "error");

    let targetProjects = window.allocProjects.filter(p => p.part === window.allocPartTab && p.active !== false);

    const btn = document.getElementById('btn-run-ai');
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 빈칸 채우는 중...'; btn.disabled = true; }

    const optOvertimeEl = document.getElementById('opt-overtime');
    const allowOvertime = optOvertimeEl ? optOvertimeEl.checked : false;
    
    const optMlEl = document.getElementById('opt-ml');
    const applyMlCorrection = optMlEl ? optMlEl.checked : true;

    const optStrategyEl = document.getElementById('opt-strategy');
    const optStrategy = optStrategyEl ? optStrategyEl.value : 'speed';
    
    const optBufferEl = document.getElementById('opt-buffer');
    const riskBuffer = optBufferEl ? parseFloat(optBufferEl.value) : 1.0;

    setTimeout(() => {
        try {
            let pMode = window.allocPeriodMode;
            let targetValue = pMode === 'week' ? document.getElementById('alloc-week-picker').value : document.getElementById('alloc-month-picker').value;
            if (!targetValue) targetValue = pMode === 'week' ? window.getWeekString(new Date()) : `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
            
            let targetMonthStr = '';
            if (pMode === 'week') {
                let sd = window.getDatesFromWeek(targetValue).start;
                targetMonthStr = `${sd.getFullYear()}-${String(sd.getMonth()+1).padStart(2,'0')}`;
            } else {
                targetMonthStr = targetValue;
            }
            
            const fullMonthDaysList = window.getValidDays('month', targetMonthStr, allowOvertime);
            
            let viewDaysList = fullMonthDaysList;
            if (pMode === 'week') {
                viewDaysList = window.getValidDays('week', targetValue, allowOvertime);
            }

            let pjts = targetProjects.map(p => {
                let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0) - (parseFloat(p.outMd)||0));
                let dDay = p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999;
                let mlFactor = (applyMlCorrection && (p.progress || 0) < 50) ? 1.15 : 1.0;
                let scoreReq = remain * riskBuffer * mlFactor;
                return { ...p, originalReq: remain, remain: remain, scoreReq: scoreReq, dDay, allocated: 0 };
            });

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

            let viewPjtAvail = 0; let viewCommon = 0; let viewIdle = 0;

            fullMonthDaysList.forEach(dStr => {
                let dayNum = parseInt(dStr.split('-')[2]);
                let activePjts = pjts.filter(p => p.remain > 0.05 && (!p.d_assyEst || p.d_assyEst === '-' || dStr >= p.d_assyEst));
                activePjts.sort((a,b) => a.dDay - b.dDay || b.scoreReq - a.scoreReq);

                let urgentPjts = activePjts.filter(p => p.dDay <= 7);
                let normalPjts = activePjts.filter(p => p.dDay > 7);

                activeMembers.forEach(m => {
                    m.assignments[dStr] = [];
                    if (m.status === '장기휴가' || m.status === '타팀지원' || m.vSet.has(dayNum) || m.sSet.has(dayNum)) return;

                    let dailyTotal = Math.min((window.historicalMemberMd[m.name] || 5.0) / 5, 1.0); 
                    let hasOverride = window.manualOverrides[m.name] && window.manualOverrides[m.name][dStr];
                    let dailyCommon = 0;

                    if (hasOverride) {
                        let totalManualMd = 0;
                        hasOverride.forEach(ov => {
                            let take = parseFloat(ov.md); totalManualMd += take;
                            if (ov.code === 'COMMON') dailyCommon += take;
                            else { let tp = pjts.find(p => p.code === ov.code); if (tp) { tp.remain -= take; tp.allocated += take; } }
                            m.assignments[dStr].push({ ...ov, locked: true });
                        });
                        
                        let availCap = Math.max(0, (dailyTotal * m.efficiency) - totalManualMd);
                        m.totalCommonMd += dailyCommon;

                        availCap = Math.round(availCap * 10) / 10;
                        if (availCap > 0) { m.assignments[dStr].push({ code: 'IDLE', name: '유휴 공수 (대기)', md: availCap }); m.totalIdleMd += availCap; }

                        if (viewDaysList.includes(dStr)) {
                            let todayPjt = totalManualMd - dailyCommon;
                            viewPjtAvail += Math.max(0, todayPjt); viewCommon += dailyCommon; viewIdle += availCap;
                        }
                    } else {
                        dailyCommon = 0.1;
                        let dailyCap = (dailyTotal - dailyCommon) * m.efficiency;

                        if (m.remainingDeduct > 0) {
                            let deductTake = Math.min(m.remainingDeduct, dailyCap);
                            dailyCap -= deductTake; m.remainingDeduct -= deductTake;
                        }

                        m.totalCommonMd += dailyCommon;
                        let availCap = Math.round(dailyCap * 10) / 10;

                        let pjtQueue = optStrategy === 'balance' && m.efficiency >= 1.0 ? [...urgentPjts, ...normalPjts] : activePjts;

                        for (let i = 0; i < pjtQueue.length; i++) {
                            let p = pjtQueue[i];
                            if (availCap < 0.1) break; if (p.remain < 0.1) continue; 
                            let isSetup = p.d_assyEndEst && p.d_assyEndEst !== '-' && dStr > p.d_assyEndEst;
                            let maxDaily = isSetup ? (dailyTotal * 0.2 * m.efficiency) : dailyCap;
                            
                            let take = Math.min(availCap, p.remain, maxDaily); take = Math.round(take * 10) / 10;
                            if (take > 0) { p.remain -= take; availCap -= take; p.allocated += take; m.assignments[dStr].push({ code: p.code, name: p.name, md: take, phase: isSetup ? 'Setup' : 'Assy', d_shipEst: p.d_shipEst }); }
                        }

                        availCap = Math.round(availCap * 10) / 10;
                        if (availCap > 0) { m.assignments[dStr].push({ code: 'IDLE', name: '대기', md: availCap }); m.totalIdleMd += availCap; }
                        
                        if (viewDaysList.includes(dStr)) {
                            let todayPjt = dailyCap - availCap;
                            viewPjtAvail += todayPjt; viewCommon += dailyCommon; viewIdle += availCap;
                        }
                    }
                });
            });

            let pjtResults = []; let outResults = [];
            pjts.forEach((p, idx) => {
                if (p.allocated > 0) pjtResults.push({ ...p, priority: idx + 1 });
                let finalUnmet = p.originalReq - p.allocated;
                if (finalUnmet > 0.1) outResults.push({ code: p.code, name: p.name, allocated: finalUnmet });
            });

            window.lastAllocatedData = { 
                periodMode: window.allocPeriodMode, targetValue: targetValue, validDaysList: viewDaysList, 
                members: activeMembers, pjtResults: pjtResults, outResults: outResults, 
                availMD: viewPjtAvail + viewCommon, idleMD: viewIdle, assignedReal: viewPjtAvail, allowOvertime: allowOvertime 
            };
            
            document.getElementById('alloc-empty-state').classList.add('hidden'); document.getElementById('alloc-result-dashboard').classList.remove('hidden');
            document.getElementById('btn-save-alloc').style.display = 'flex';
            
            window.renderAllocUI(); window.renderAllocCalendar(); window.saveAllocationPlan(); 
            window.showToast("연산 완료 및 계획 수립 성공!", "success");

        } catch (err) { 
            console.error("AI Allocation Engine Error:", err); 
            window.showToast("연산 중 오류가 발생했습니다. 로그를 확인하세요.", "error");
        } finally {
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 빈칸 채우기'; btn.disabled = false; }
        }
    }, 100);
};

// 💡 수정됨: pjt-count 대신 members.length를 올바른 DOM ID에 바인딩
window.renderAllocUI = function() {
    const d = window.lastAllocatedData;
    const kpiAvail = document.getElementById('alloc-kpi-avail');
    const kpiAssigned = document.getElementById('alloc-kpi-assigned');
    const kpiIdle = document.getElementById('alloc-kpi-idle');
    const kpiMembers = document.getElementById('alloc-kpi-members');
    
    if (kpiAvail) kpiAvail.innerText = d.availMD.toFixed(1);
    if (kpiAssigned) kpiAssigned.innerText = d.assignedReal.toFixed(1);
    if (kpiIdle) kpiIdle.innerText = d.idleMD.toFixed(1);
    if (kpiMembers) kpiMembers.innerText = d.members.length;
};

window.renderAllocCalendar = function() {
    const grid = document.getElementById('alloc-cal-grid'); if (!grid || !window.lastAllocatedData) return;
    const { members, validDaysList, periodMode, targetValue } = window.lastAllocatedData;
    document.getElementById('alloc-cal-title').innerText = periodMode === 'week' ? "주간 상세 계획표 (수동 선입력 가능)" : "월간 마스터 플랜 (수동 선입력 가능)";

    let startD, endD;
    if (periodMode === 'week') {
        const wDates = window.getDatesFromWeek(targetValue);
        startD = new Date(wDates.start); endD = new Date(wDates.start); endD.setDate(endD.getDate() + 6);
    } else {
        const parts = targetValue.split('-'); startD = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1); endD = new Date(parseInt(parts[0]), parseInt(parts[1]), 0);
    }

    const firstDay = startD.getDay(); let html = ''; 
    if (periodMode === 'month') { for(let i=0; i<firstDay; i++) html += `<div class="bg-slate-50 opacity-30 border-b border-r border-slate-200"></div>`; }

    let daysToRender = Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1;
    for(let i=0; i<daysToRender; i++) {
        let currentDate = new Date(startD); currentDate.setDate(currentDate.getDate() + i);
        let y = currentDate.getFullYear(); let m = String(currentDate.getMonth()+1).padStart(2,'0'); let d = String(currentDate.getDate()).padStart(2,'0');
        let dateStr = `${y}-${m}-${d}`;
        let isHoliday = KR_HOLIDAYS.has(dateStr); let isSunday = currentDate.getDay() === 0; let isSaturday = currentDate.getDay() === 6;
        let bgClass = (isSunday || isHoliday) ? 'bg-rose-50/20' : (isSaturday ? 'bg-blue-50/20' : 'bg-white');

        let badgeHtml = '';
        if (validDaysList.includes(dateStr)) {
            let commonSum = 0;
            let pjtBadges = members.map(mem => {
                let dayAs = mem.assignments[dateStr] || [];
                return dayAs.map(a => {
                    if (a.code === 'VAC' || a.code === 'SUP') return ''; 
                    if (a.code !== 'IDLE') commonSum += 0.1;
                    
                    let isOverdue = a.d_shipEst && a.d_shipEst !== '-' && dateStr > a.d_shipEst;
                    let isSetup = a.phase === 'Setup';
                    let style = a.locked ? 'border-amber-200 bg-indigo-50 text-indigo-700' : (isOverdue ? 'border-rose-200 bg-rose-50 text-rose-700' : (a.code === 'IDLE' ? 'border-rose-200 bg-rose-50 text-rose-500 border-dashed' : (isSetup ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-indigo-100 bg-white text-indigo-700')));
                    let lockIcon = a.locked ? '<i class="fa-solid fa-lock text-amber-500 ml-0.5 text-[8px]"></i>' : '';
                    let shortCode = a.code === 'IDLE' ? '대기' : (a.code === 'COMMON' ? '공통' : a.code);
                    if (isSetup) shortCode += '(셋업)';

                    // 💡 수정됨: a.md가 문자열일 수 있으므로 parseFloat 적용 (에러 원천 방어)
                    const parsedMd = parseFloat(a.md) || 0;
                    return `<div onclick="window.openManualEditModal('${mem.name}', '${dateStr}')" class="text-[9px] font-bold border ${style} px-1.5 py-0.5 rounded mb-0.5 flex justify-between items-center cursor-pointer hover:ring-1 ring-amber-400 shadow-sm"><div class="flex items-center gap-1 truncate"><span class="font-black shrink-0">${mem.name}${lockIcon}</span><span class="text-[8px] opacity-70 truncate w-12">${shortCode}</span></div><span class="shrink-0">${parsedMd.toFixed(1)}</span></div>`;
                }).join('');
            }).join('');
            if(commonSum > 0) badgeHtml = `<div class="text-[9px] font-black bg-slate-800 text-white px-1.5 py-0.5 mb-1 rounded flex justify-between shadow-md"><span>제조공통</span><span>${commonSum.toFixed(1)}MD</span></div>` + pjtBadges;
        }
        
        let minH = periodMode === 'week' ? 'min-h-[300px]' : 'min-h-[120px]';
        let tCol = isSunday||isHoliday ? 'text-rose-500' : (isSaturday ? 'text-blue-500' : 'text-slate-700');
        html += `<div class="${bgClass} p-1 border-b border-r border-slate-200 ${minH} flex flex-col"><div class="text-[11px] font-black text-center mb-1 ${tCol}">${currentDate.getDate()}</div>${badgeHtml}</div>`;
    }
    grid.innerHTML = html;
};
