/* eslint-disable */
import { app, db as axmsDb } from './firebase.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const axttConfig = {
    apiKey: "AIzaSyA_LSZ2wvuvkyh_nCqMbdFchkG_qQvmFWY",
    authDomain: "axtt-b064c.firebaseapp.com",
    projectId: "axtt-b064c",
    storageBucket: "axtt-b064c.firebasestorage.app",
    measurementId: "G-V28BZLW8XQ"
};

const axttApp = initializeApp(axttConfig, "AXTT_APP");
const axttDb = getFirestore(axttApp);

window.showToast = window.showToast || function(msg, type) { 
    let t = document.createElement('div');
    t.className = `fixed top-10 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-3 rounded-full font-black text-sm shadow-xl transition-all ${type==='error'?'bg-rose-500 text-white':'bg-emerald-500 text-white'}`;
    t.innerText = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(()=>t.remove(), 500); }, 3000);
};

let allocChartInstance = null;
window.allocPartTab = '제조'; 
window.allocPeriodMode = 'week'; // 초기 뷰는 '주간 상세 보기'

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
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25'
]);

function getValidDays(periodMode, targetValue, allowOvertime) {
    let validDays = [];
    const parts = targetValue.split('-'); 
    const y = parseInt(parts[0]); 
    const m = periodMode === 'week' ? parseInt(parts[1].substring(1)) : parseInt(parts[1]); 

    // 월간 기준으로 날짜 배열 생성
    const lastDate = new Date(y, m, 0).getDate();
    for(let i=1; i<=lastDate; i++) {
        let dStr = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let dObj = new Date(y, m-1, i);
        let isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
        if(allowOvertime || (!isWeekend && !KR_HOLIDAYS.has(dStr))) validDays.push(dStr);
    }
    return validDays;
}

window.parseDateString = function(str) {
    let days = new Set(); if(!str) return days;
    str.split(',').forEach(p => { p = p.trim(); if(p.includes('-')) { let r = p.split('-'); for(let i=parseInt(r[0]); i<=parseInt(r[1]); i++) days.add(i); } else { let n = parseInt(p); if(!isNaN(n)) days.add(n); } });
    return days;
};

// 💡 저장 기능 고도화
window.saveAllocationPlan = function() { 
    try {
        const safeTeamMaster = window.allocTeamMaster.map(m => ({ name: m.name, part: m.part, active: m.active, manualVacation: m.manualVacation, status: m.status, vacationDates: m.vacationDates, supportDates: m.supportDates, efficiency: m.efficiency }));
        const draft = { teamMaster: safeTeamMaster, virtualProjects: window.allocProjects.filter(p => p.isVirtual), manualOverrides: window.manualOverrides, partTab: window.allocPartTab, periodMode: window.allocPeriodMode, weekVal: document.getElementById('alloc-week-picker').value, monthVal: document.getElementById('alloc-month-picker').value, optOvertime: document.getElementById('opt-overtime').checked, optStrategy: document.getElementById('opt-strategy').value };
        localStorage.setItem('axbis_alloc_draft', JSON.stringify(draft));
        window.showToast("월간 계획 초안이 브라우저에 저장되었습니다."); 
    } catch(e) { window.showToast("저장 실패", "error"); }
};

// 💡 복원 기능 고도화 (Auto-Run 포함)
window.loadDraft = function() {
    let draftStr = localStorage.getItem('axbis_alloc_draft');
    if (draftStr) {
        try {
            let draft = JSON.parse(draftStr);
            if (draft.teamMaster) draft.teamMaster.forEach(dm => { let tm = window.allocTeamMaster.find(m => m.name === dm.name); if (tm) Object.assign(tm, dm); });
            if (draft.virtualProjects) draft.virtualProjects.forEach(vp => { if (!window.allocProjects.find(p => p.id === vp.id)) window.allocProjects.push(vp); });
            if (draft.manualOverrides) window.manualOverrides = draft.manualOverrides;
            if (draft.optOvertime !== undefined) document.getElementById('opt-overtime').checked = draft.optOvertime;
            if (draft.optStrategy) document.getElementById('opt-strategy').value = draft.optStrategy;
            if (draft.weekVal) document.getElementById('alloc-week-picker').value = draft.weekVal;
            if (draft.monthVal) document.getElementById('alloc-month-picker').value = draft.monthVal;
            window.allocPeriodMode = draft.periodMode || 'week';
            window.allocPartTab = draft.partTab || '제조';
            
            // 복원 즉시 AI 실행하여 캘린더 채우기
            setTimeout(() => window.executeAiAllocation(), 300);
        } catch(e) {}
    }
};

// 수동 락(Lock) 모달 제어
window.moState = { name: '', dateStr: '' };
window.openManualEditModal = function(name, dateStr) {
    window.moState = { name, dateStr };
    document.getElementById('mo-title').innerText = `[${name}] ${dateStr} 투입 조정`;
    let isLocked = window.manualOverrides[name] && window.manualOverrides[name][dateStr];
    document.getElementById('mo-status').innerHTML = isLocked ? `<span class="text-rose-600 text-[10px] font-black"><i class="fa-solid fa-lock"></i> 수동 고정됨</span>` : `<span class="text-indigo-600 text-[10px] font-black"><i class="fa-solid fa-robot"></i> AI 자동 배정</span>`;
    const container = document.getElementById('mo-rows'); container.innerHTML = '';
    let assignments = isLocked ? window.manualOverrides[name][dateStr] : (window.lastAllocatedData?.members.find(m=>m.name===name)?.assignments[dateStr] || []);
    assignments = assignments.filter(a => a.code !== 'VAC' && a.code !== 'SUP' && a.code !== 'IDLE');
    if(assignments.length === 0) window.addMoRow('', 0.5); else assignments.forEach(a => window.addMoRow(a.code, a.md));
    document.getElementById('manual-override-modal').classList.remove('hidden'); document.getElementById('manual-override-modal').classList.add('flex');
};
window.addMoRow = function(code, md) {
    const container = document.getElementById('mo-rows');
    let pjtOptions = window.allocProjects.filter(p=>p.part === window.allocPartTab).map(p => `<option value="${p.code}" ${p.code === code ? 'selected' : ''}>${p.isVirtual?'[가상] ':''}[${p.code}] ${p.name}</option>`).join('');
    pjtOptions += `<option value="COMMON" ${code === 'COMMON' ? 'selected' : ''}>${window.allocPartTab}공통</option>`;
    let div = document.createElement('div'); div.className = 'flex items-center gap-2 mb-2 mo-row w-full';
    div.innerHTML = `<select class="flex-1 min-w-0 border rounded-lg p-2 text-[10px] font-bold mo-code">${pjtOptions}</select><input type="number" step="0.1" value="${md}" class="w-16 border rounded-lg p-2 text-right text-[11px] font-black mo-md"><button onclick="this.parentElement.remove()" class="w-8 text-slate-300 hover:text-rose-500"><i class="fa-solid fa-trash"></i></button>`;
    container.appendChild(div);
};
window.saveManualOverride = function() {
    const {name, dateStr} = window.moState;
    if(!window.manualOverrides[name]) window.manualOverrides[name] = {};
    let newOverrides = []; document.querySelectorAll('.mo-row').forEach(row => { let code = row.querySelector('.mo-code').value; let md = parseFloat(row.querySelector('.mo-md').value); if(code && md > 0) newOverrides.push({code, md}); });
    if(newOverrides.length > 0) window.manualOverrides[name][dateStr] = newOverrides; else delete window.manualOverrides[name][dateStr];
    document.getElementById('manual-override-modal').classList.add('hidden'); window.saveAllocationPlan(); window.executeAiAllocation(); 
};
window.clearManualOverride = function() { const {name, dateStr} = window.moState; if(window.manualOverrides[name]) delete window.manualOverrides[name][dateStr]; document.getElementById('manual-override-modal').classList.add('hidden'); window.saveAllocationPlan(); window.executeAiAllocation(); };

// 💡 [핵심 마이크로 엔진] 수동 락을 보호하며 빈칸을 채우는 월간 배정 알고리즘
window.executeAiAllocation = async function() {
    const activeMembers = window.allocTeamMaster.filter(m => m.part === window.allocPartTab && m.active);
    if (activeMembers.length === 0) return window.showToast("인원을 선택하세요.", "error");

    let targetProjects = window.allocProjects.filter(p => p.part === window.allocPartTab && p.active !== false);
    const btn = document.getElementById('btn-run-ai');
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 마이크로 연산 중...'; btn.disabled = true; }

    const allowOvertime = document.getElementById('opt-overtime').checked;
    const optStrategy = document.getElementById('opt-strategy').value;
    const riskBuffer = parseFloat(document.getElementById('opt-buffer')?.value || 1.1);

    setTimeout(() => {
        try {
            let targetValue = window.allocPeriodMode === 'week' ? document.getElementById('alloc-week-picker').value : document.getElementById('alloc-month-picker').value;
            if (!targetValue) targetValue = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
            
            // 한 달 전체 날짜 생성
            const fullMonthDays = getValidDays('month', targetValue.split('-W')[0] + '-' + targetValue.split('-')[1], allowOvertime);
            
            let pjts = targetProjects.map(p => {
                let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0) - (parseFloat(p.outMd)||0));
                return { ...p, originalReq: remain, remain: remain, allocated: 0, dDay: p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999 };
            });

            activeMembers.forEach(m => {
                m.vSet = window.parseDateString(m.vacationDates);
                m.sSet = window.parseDateString(m.supportDates);
                m.assignments = {}; m.totalPjtMd = 0; m.totalIdleMd = 0; m.totalCommonMd = 0;
            });

            // 월간 마이크로 루프 가동
            fullMonthDays.forEach(dStr => {
                let dayNum = parseInt(dStr.split('-')[2]);
                let activePjts = pjts.filter(p => p.remain > 0.05 && (!p.d_assyEst || p.d_assyEst === '-' || dStr >= p.d_assyEst));
                activePjts.sort((a,b) => a.dDay - b.dDay);

                activeMembers.forEach(m => {
                    m.assignments[dStr] = [];
                    if (m.status === '장기휴가' || m.status === '타팀지원' || m.vSet.has(dayNum) || m.sSet.has(dayNum)) return;

                    let dailyTotal = Math.min((window.historicalMemberMd[m.name] || 5.0) / 5, 1.0);
                    let dailyCommon = 0.1;
                    m.totalCommonMd += dailyCommon;

                    // 1. 수동 락(Lock) 확인 및 보호
                    let hasOverride = window.manualOverrides[m.name] && window.manualOverrides[m.name][dStr];
                    let availCap = (dailyTotal - dailyCommon) * m.efficiency;

                    if (hasOverride) {
                        hasOverride.forEach(ov => {
                            let take = parseFloat(ov.md);
                            if (ov.code !== 'COMMON') { let tp = pjts.find(p => p.code === ov.code); if (tp) { tp.remain -= take; tp.allocated += take; } }
                            m.assignments[dStr].push({ ...ov, locked: true });
                            availCap -= take;
                        });
                    }

                    // 2. 남은 자리에 AI 배정
                    if (availCap > 0.1) {
                        for (let p of activePjts) {
                            if (availCap < 0.1) break;
                            if (p.remain < 0.1) continue;
                            
                            let isSetup = p.d_assyEndEst && p.d_assyEndEst !== '-' && dStr > p.d_assyEndEst;
                            let maxDaily = isSetup ? (dailyTotal * 0.2 * m.efficiency) : availCap;
                            
                            let take = Math.min(availCap, p.remain, maxDaily);
                            take = Math.round(take * 10) / 10;
                            if (take > 0) { p.remain -= take; availCap -= take; p.allocated += take; m.assignments[dStr].push({ code: p.code, name: p.name, md: take, phase: isSetup ? 'Setup' : 'Assy', d_shipEst: p.d_shipEst }); }
                        }
                    }

                    // 3. 최종 유휴 처리
                    availCap = Math.round(availCap * 10) / 10;
                    if (availCap > 0) { m.assignments[dStr].push({ code: 'IDLE', name: '대기', md: availCap }); m.totalIdleMd += availCap; }
                    m.totalPjtMd += (dailyTotal - dailyCommon - availCap);
                });
            });

            window.lastAllocatedData = { validDaysList: fullMonthDays, members: activeMembers, pjtResults: pjts, periodMode: window.allocPeriodMode, targetValue };
            window.renderAllocUI(); window.renderAllocGrid(); window.renderAllocCalendar();
            
            document.getElementById('alloc-empty-state').classList.add('hidden');
            document.getElementById('alloc-result-dashboard').classList.remove('hidden');
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 마이크로 재계산'; btn.disabled = false; }
            window.showToast("월간 마스터 계획 수립 완료!");
        } catch (err) { console.error(err); if(btn) btn.disabled = false; }
    }, 500);
};

// 💡 달력 렌더링: 이름 + 코드 + MD 표시 고도화
window.renderAllocCalendar = function() {
    const grid = document.getElementById('alloc-cal-grid'); if (!grid || !window.lastAllocatedData) return;
    const { members, validDaysList, targetValue, periodMode } = window.lastAllocatedData;
    
    // 월간 보기용 날짜 처리
    let dObj = periodMode === 'week' ? window.getDatesFromWeek(targetValue).start : new Date(parseInt(targetValue.split('-')[0]), parseInt(targetValue.split('-')[1]) - 1, 1);
    const y = dObj.getFullYear(); const m = dObj.getMonth();
    const firstDay = new Date(y, m, 1).getDay(); const lastDate = new Date(y, m + 1, 0).getDate();
    
    let html = ''; for(let i=0; i<firstDay; i++) html += `<div class="bg-slate-50 opacity-50 border-b"></div>`;

    for(let i=1; i<=lastDate; i++) {
        let dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let badgeHtml = ''; let bgClass = 'bg-white';
        
        if (validDaysList.includes(dateStr)) {
            let commonSum = 0;
            let pjtBadges = members.map(mem => {
                let dayAs = mem.assignments[dateStr] || [];
                return dayAs.map(a => {
                    commonSum += 0.1;
                    let isOverdue = a.d_shipEst && a.d_shipEst !== '-' && dateStr > a.d_shipEst;
                    let style = a.locked ? 'border-amber-200 bg-indigo-50 text-indigo-700' : (isOverdue ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-indigo-100 bg-white text-indigo-700');
                    if (a.code === 'IDLE') style = 'border-rose-200 bg-rose-50 text-rose-500 border-dashed';
                    
                    let lockIcon = a.locked ? '<i class="fa-solid fa-lock text-amber-500 ml-0.5"></i>' : '';
                    return `<div onclick="window.openManualEditModal('${mem.name}', '${dateStr}')" class="text-[9px] font-bold border ${style} px-1 py-0.5 rounded mb-0.5 flex justify-between items-center cursor-pointer hover:ring-1 ring-amber-400">
                        <span class="truncate w-full">${mem.name}${lockIcon} <span class="opacity-60">[${a.code}]</span></span>
                        <span class="shrink-0 ml-1">${a.md.toFixed(1)}</span>
                    </div>`;
                }).join('');
            }).join('');
            badgeHtml = `<div class="text-[9px] font-black bg-slate-800 text-white px-1.5 mb-1 rounded flex justify-between"><span>공통</span><span>${(members.length * 0.1).toFixed(1)}</span></div>` + pjtBadges;
        }
        html += `<div class="${bgClass} p-1 border-b border-r min-h-[120px] flex flex-col"><div class="text-[10px] font-black mb-1">${i}</div>${badgeHtml}</div>`;
    }
    grid.innerHTML = html;
};

// 나머지 UI 렌더링 함수들 (KPI, Grid 등) 동일 유지
window.renderAllocUI = function() {
    const d = window.lastAllocatedData;
    document.getElementById('alloc-kpi-avail').innerText = d.availMD.toFixed(1);
    document.getElementById('alloc-kpi-assigned').innerText = d.assignedReal.toFixed(1);
    document.getElementById('alloc-kpi-idle').innerText = d.idleMD.toFixed(1);
    document.getElementById('alloc-kpi-pjt-count').innerText = d.pjtResults.filter(p=>!p.isVirtual && p.allocated > 0).length;
};

window.initAllocationPlan();
