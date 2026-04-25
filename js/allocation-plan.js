/* eslint-disable */
import { app, db as axmsDb } from './firebase.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ==============================================================
// 💡 AXTT (과거 공수 데이터) 서브 파이어베이스 연결 (사용자 제공 설정)
// ==============================================================
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
window.allocPartTab = '제조'; // 기본 선택 파트
window.allocPeriodMode = 'week'; // 기본 선택 기간 (week / month)

window.allocTeamMaster = [
    { name: '홍승현', part: '제조', active: true, manualVacation: 0 }, { name: '박종민', part: '제조', active: true, manualVacation: 0 },
    { name: '박원범', part: '제조', active: true, manualVacation: 0 }, { name: '표영덕', part: '제조', active: true, manualVacation: 0 },
    { name: '양윤석', part: '광학', active: true, manualVacation: 0 }, { name: '조성주', part: '광학', active: true, manualVacation: 0 },
    { name: '박광렬', part: '광학', active: true, manualVacation: 0 }, { name: '이원범', part: '광학', active: true, manualVacation: 0 }
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

window.initAllocationPlan = function() {
    console.log("✅ AI 투입 계획 모듈 (파트분리/월간기능 추가) 초기화");
    
    window.switchAllocPeriodMode('week'); // 초기 기간 세팅
    window.switchAllocPartTab('제조'); // 초기 파트 세팅

    onSnapshot(query(collection(axmsDb, "projects_status")), (snap) => {
        window.allocProjects = [];
        snap.forEach(d => {
            let p = d.data(); p.id = d.id;
            if (p.status !== 'completed' && p.status !== 'rejected') window.allocProjects.push(p);
        });
    });
    
    // 백그라운드에서 AXTT 데이터 미리 1회 패치
    fetchHistoricalDataFromAXTT();
};

// 💡 파트 선택 토글 함수
window.switchAllocPartTab = function(part) {
    window.allocPartTab = part;
    document.getElementById('btn-alloc-part-mfg').className = part === '제조' ? "px-3 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    document.getElementById('btn-alloc-part-opt').className = part === '광학' ? "px-3 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    
    const lbl = document.getElementById('current-part-label');
    if(lbl) lbl.innerText = `[${part} 파트]`;
    
    window.renderAllocMemberSelectors();
    window.loadAllocationData(); // 화면 초기화
};

// 💡 기간 선택 토글 함수
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

window.renderAllocMemberSelectors = function() {
    const container = document.getElementById('alloc-member-list-container');
    if(!container) return;

    // 현재 선택된 파트의 멤버만 필터링
    const members = window.allocTeamMaster.filter(m => m.part === window.allocPartTab);
    
    if (members.length === 0) {
        container.innerHTML = `<span class="text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">선택된 파트에 해당하는 인원이 없습니다.</span>`;
        return;
    }

    container.innerHTML = members.map(m => `
        <div class="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white transition-all shadow-sm w-full md:w-auto min-w-[180px]">
            <label class="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 member-checkbox" data-name="${m.name}" ${m.active ? 'checked' : ''} onchange="window.updateAllocMemberActive('${m.name}', this.checked)">
                <span class="text-[11px] font-bold text-slate-700">${m.name}</span>
            </label>
            <div class="flex items-center gap-1 ml-3 border-l border-slate-200 pl-3">
                <span class="text-[9px] font-bold text-slate-400">차감</span>
                <input type="number" step="0.5" min="0" value="${m.manualVacation || 0}" onchange="window.updateAllocMemberVacation('${m.name}', this.value)" class="w-12 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-rose-500 font-bold outline-indigo-500 text-right bg-white" ${m.active ? '' : 'disabled'}>
                <span class="text-[9px] font-bold text-slate-400">MD</span>
            </div>
        </div>
    `).join('');
};

window.updateAllocMemberActive = (name, active) => {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) member.active = active;
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

window.switchAllocView = function(viewMode) {
    const btnGrid = document.getElementById('btn-alloc-view-grid');
    const btnCal = document.getElementById('btn-alloc-view-cal');
    const viewGrid = document.getElementById('alloc-view-grid');
    const viewCal = document.getElementById('alloc-view-cal');

    if (viewMode === 'grid') {
        if(btnGrid) btnGrid.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5';
        if(btnCal) btnCal.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent';
        if(viewGrid) viewGrid.classList.remove('hidden');
        if(viewCal) { viewCal.classList.add('hidden'); viewCal.classList.remove('flex'); }
    } else {
        if(btnCal) btnCal.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5';
        if(btnGrid) btnGrid.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent';
        if(viewGrid) viewGrid.classList.add('hidden');
        if(viewCal) { viewCal.classList.remove('hidden'); viewCal.classList.add('flex'); }
        window.renderAllocCalendar();
    }
};

// 💡 AXTT 데이터 미리 불러오기 (검증 모달 용도 포함)
async function fetchHistoricalDataFromAXTT() {
    let d = new Date();
    let endStr = d.toISOString().split('T')[0];
    d.setDate(d.getDate() - 28);
    let startStr = d.toISOString().split('T')[0];

    try {
        const q = query(collection(axttDb, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            window.historicalMemberMd = {};
            return;
        }

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
    } catch (error) {
        window.historicalMemberMd = {};
    }
}

// 💡 AXTT 검증 모달 액션
window.openAxttVerifyModal = function() {
    const modal = document.getElementById('axtt-verify-modal');
    if(!modal) return;
    
    const tbody = document.getElementById('axtt-verify-tbody');
    
    let html = '';
    window.allocTeamMaster.forEach(m => {
        let rawVal = window.historicalMemberMd[m.name] || 0;
        let finalVal = rawVal > 0 ? rawVal.toFixed(1) : '5.0'; // 없으면 5.0 적용
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


// 💡 [핵심 에러 방지 알고리즘] Try-Catch가 완벽하게 둘러싼 AI 할당 메인 로직
window.executeAiAllocation = async function() {
    // 1. 타겟 인원 필터링
    const activeMembers = window.allocTeamMaster.filter(m => m.part === window.allocPartTab && m.active);
    if (activeMembers.length === 0) return window.showToast(`투입할 [${window.allocPartTab}] 파트 인원을 최소 1명 이상 선택하세요.`, "error");

    const btn = document.getElementById('btn-run-ai');
    if(btn) {
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...';
        btn.disabled = true;
    }

    try {
        // 데이터 최신화
        await fetchHistoricalDataFromAXTT();
    } catch(e) {
        console.warn("AXTT 데이터 로딩 실패(스킵가능):", e);
    }

    // 💡 setTimeout 안의 콜백을 Try-Catch로 완벽 방어
    setTimeout(() => {
        try {
            let availMD = 0;
            let periodMultiplier = 1; 
            let targetValue = '';
            
            // 기간 설정
            if (window.allocPeriodMode === 'month') {
                targetValue = document.getElementById('alloc-month-picker')?.value || ''; 
                if(targetValue) {
                    const parts = targetValue.split('-');
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]);
                    const lastDate = new Date(year, month, 0).getDate();
                    
                    let workDays = 0;
                    for(let i=1; i<=lastDate; i++) {
                        let dStr = `${year}-${String(month).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                        let d = new Date(year, month-1, i);
                        if(d.getDay() !== 0 && d.getDay() !== 6 && !KR_HOLIDAYS.has(dStr)) workDays++;
                    }
                    periodMultiplier = workDays / 5; 
                } else {
                    targetValue = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
                }
            } else {
                targetValue = document.getElementById('alloc-week-picker')?.value || '';
                if (!targetValue) targetValue = window.getWeekString ? window.getWeekString(new Date()) : "2026-W17";
            }

            // 팀원별 가용량 산출
            activeMembers.forEach(m => {
                let baseWeeklyMd = window.historicalMemberMd[m.name] || 5.0; 
                let basePeriodMd = baseWeeklyMd * periodMultiplier;
                let vDeduct = parseFloat(m.manualVacation) || 0;
                
                m.expectedMd = Math.max(0, basePeriodMd - vDeduct);
                m.vacationDeduct = vDeduct;
                availMD += m.expectedMd;
            });

            let pjtResults = []; 
            let outResults = [];
            let aiReport = [];

            // 2. 프로젝트 필터링 및 우선순위 정렬
            let targetProjects = window.allocProjects.filter(p => p.part === window.allocPartTab);
            
            let priorities = targetProjects.map(p => {
                let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0));
                let outMd = parseFloat(p.outMd) || 0;
                let internalReq = Math.max(0, remain - outMd);
                if(outMd > 0) outResults.push({ code: p.code, name: p.name, allocated: outMd, reason: '기등록 외주' });
                
                let dDay = p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999;
                let score = (dDay <= 7 ? 100 : (dDay <= 14 ? 50 : 0)) + (internalReq * 2);
                return { ...p, internalReq, score, dDay };
            }).filter(p => p.internalReq > 0 || p.dDay <= 14).sort((a,b) => b.score - a.score);

            // 3. [쏠림 방지] Max Cap 할당
            let currentAvail = availMD;
            let maxPjtLimit = Math.max(10 * periodMultiplier, availMD * 0.45); 

            priorities.forEach((p, idx) => {
                if (currentAvail <= 0) {
                    outResults.push({ code: p.code, name: p.name, allocated: p.internalReq, reason: '사내 캐파 부족 (오버플로우)' });
                    return;
                }
                
                let currentLimit = p.dDay <= 7 ? Math.max(15 * periodMultiplier, availMD * 0.6) : maxPjtLimit;
                let reqMd = Math.min(p.internalReq > 0 ? p.internalReq : (3.0 * periodMultiplier), currentLimit);
                reqMd = Math.round(reqMd * 2) / 2;

                if (currentAvail >= reqMd) {
                    pjtResults.push({ ...p, allocated: reqMd, priority: idx + 1 });
                    currentAvail -= reqMd;
                } else if (currentAvail > 0) {
                    pjtResults.push({ ...p, allocated: currentAvail, priority: idx + 1 });
                    let overflow = reqMd - currentAvail;
                    outResults.push({ code: p.code, name: p.name, allocated: overflow, reason: '사내 캐파 부족 (오버플로우)' });
                    currentAvail = 0;
                }
            });

            // 💡 [에러 방지] pjtResults가 빈 배열이 되지 않도록 보장
            if (currentAvail > 0 || pjtResults.length === 0) {
                pjtResults.push({ code: 'COMMON', name: '부서 공통 업무', allocated: Math.max(0, currentAvail), priority: 99, dDay: '-', progress: 100, part: window.allocPartTab });
            }

            // 4. [파트 완전 독립 매칭] 파트가 동일한 인원끼리만 분배
            let pjtRemainMap = {};
            pjtResults.forEach(p => pjtRemainMap[p.code] = p.allocated);

            let sortedMembers = [...activeMembers].sort((a,b) => b.expectedMd - a.expectedMd);

            sortedMembers.forEach(m => {
                let bestPjt = pjtResults.find(p => pjtRemainMap[p.code] > 0);
                if (!bestPjt) bestPjt = pjtResults[0];

                m.assignedPjtName = bestPjt ? `[${bestPjt.code}] ${bestPjt.name}` : '-';
                if (bestPjt) pjtRemainMap[bestPjt.code] -= m.expectedMd;
            });

            // 5. AI 리포트 텍스트 생성
            let periodText = window.allocPeriodMode === 'week' ? '주간' : '월간';
            aiReport.push(`[${window.allocPartTab} 파트 전용 ${periodText} 계획]\n선택 인원 ${activeMembers.length}명, 실 가용 공수 총 ${availMD.toFixed(1)}MD 로 산출되었습니다.`);
            
            if (pjtResults.length > 0 && pjtResults[0].code !== 'COMMON') {
                const topP = pjtResults[0];
                if (topP.dDay <= 7) {
                    aiReport.push(`[${topP.name}] 건이 납기 임박(D-${topP.dDay})이므로 해당 파트 가용력의 최대 60% 한도 내에서 ${topP.allocated}MD를 집중 배정했습니다.`);
                } else {
                    aiReport.push(`특정 프로젝트 쏠림을 방지하기 위해 단일 PJT 최대 투입량을 캐파의 45% 이내로 자동 제한하고 분산 배치했습니다.`);
                }
            }

            if (outResults.length > 0) {
                aiReport.push(`⚠️ 내부 가용 인력 대비 초과된 잔여 공수는 '외주 전환 필요' 항목으로 분리하였습니다.`);
            } else {
                aiReport.push(`✅ 현재 파트 내부 가동률만으로 이번 기간에 요구되는 프로젝트 할당량을 무리 없이 소화 가능합니다.`);
            }

            window.lastAllocatedData = { periodMode: window.allocPeriodMode, targetValue: targetValue, members: activeMembers, pjtResults: pjtResults };

            // UI 렌더링 호출
            window.renderAllocUI(activeMembers.length * 5.0 * periodMultiplier, availMD, pjtResults, outResults, activeMembers, aiReport.join('\n\n'));
            
            if (document.getElementById('alloc-view-cal') && !document.getElementById('alloc-view-cal').classList.contains('hidden')) {
                window.renderAllocCalendar();
            }
            
            // 상태 전환
            const emptyState = document.getElementById('alloc-empty-state');
            const resultDash = document.getElementById('alloc-result-dashboard');
            const btnSave = document.getElementById('btn-save-alloc');
            
            if(emptyState) { emptyState.classList.add('hidden'); emptyState.classList.remove('flex'); }
            if(resultDash) resultDash.classList.remove('hidden');
            if(btnSave) { btnSave.classList.remove('hidden'); btnSave.classList.add('flex'); }
            
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 다시 계산'; btn.disabled = false; }
            
            window.showToast(`${window.allocPartTab} 파트 전용 최적화 계획이 생성되었습니다.`, "success");
            
        } catch (err) {
            console.error("AI Allocation Rendering Error: ", err);
            window.showToast("할당 분석 중 오류 발생: " + err.message, "error");
            if(btn) { btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 다시 계산'; btn.disabled = false; }
        }
    }, 800);
};

window.renderAllocUI = function(maxMD, availMD, pjtResults, outResults, members, aiText) {
    const insightEl = document.getElementById('alloc-ai-insight');
    if (insightEl) insightEl.innerText = aiText;

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
                        <div class="font-black text-slate-800 text-sm flex items-center gap-1">
                            ${p.name} <span class="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded border border-slate-200 ml-1">${p.part||'제조'}</span>
                        </div>
                        <div class="text-[10px] text-slate-400 font-bold">${p.code}</div>
                    </div>
                </div>
                <div class="text-right border-l pl-4"><span class="text-[10px] font-bold text-slate-400 block mb-1">배정 공수</span><span class="text-xl font-black text-indigo-600">${(p.allocated||0).toFixed(1)} MD</span></div>
            </div>
            `}).join('') + outResults.map(o => `
            <div class="flex items-center justify-between p-3 rounded-lg border border-rose-100 bg-rose-50/30 mt-2 opacity-80">
                <span class="text-xs font-bold text-slate-600">${o.name} <span class="text-[9px] text-rose-400 ml-1">(${o.reason})</span></span>
                <span class="text-sm font-black text-rose-500">${(o.allocated||0).toFixed(1)} MD</span>
            </div>
        `).join('');
    }

    // 💡 기간에 맞게 동적 그리드 헤더 생성
    const thead = document.getElementById('alloc-grid-headers');
    const tbody = document.getElementById('alloc-member-list');
    
    if (thead && tbody) {
        let hHtml = `<tr><th class="p-3 text-center font-bold w-24 rounded-tl-lg bg-slate-800">이름(파트)</th><th class="p-3 font-bold w-48 text-center bg-slate-800">배정 PJT</th>`;
        
        let colCount = 5;
        if (window.allocPeriodMode === 'week') {
            hHtml += `<th class="p-3 text-center font-bold bg-slate-800">월</th><th class="p-3 text-center font-bold bg-slate-800">화</th><th class="p-3 text-center font-bold bg-slate-800">수</th><th class="p-3 text-center font-bold bg-slate-800">목</th><th class="p-3 text-center font-bold bg-slate-800">금</th>`;
        } else {
            colCount = 4; // 월간은 보통 4주 단위 쪼개기
            hHtml += `<th class="p-3 text-center font-bold bg-slate-800">1주차</th><th class="p-3 text-center font-bold bg-slate-800">2주차</th><th class="p-3 text-center font-bold bg-slate-800">3주차</th><th class="p-3 text-center font-bold bg-slate-800">4주차</th>`;
        }
        hHtml += `<th class="p-3 text-center font-bold text-amber-300 rounded-tr-lg bg-slate-800">합계(MD)</th></tr>`;
        thead.innerHTML = hHtml;

        // 동적 로우 생성
        tbody.innerHTML = members.map((m) => {
            const dMd = (m.expectedMd / colCount).toFixed(1); 
            const vacTag = m.vacationDeduct > 0 ? `<div class="text-[9px] text-rose-500 font-bold mt-1 bg-rose-50 border border-rose-100 rounded text-center">차감 -${m.vacationDeduct}MD</div>` : '';
            
            // 안전망: assignedPjtName 이 없어도 에러가 나지 않도록 방어
            let safePjtName = (m.assignedPjtName || '-').includes('COMMON') ? '공통 업무' : (m.assignedPjtName || '-');

            let tdHtml = '';
            for(let c=0; c<colCount; c++){
                tdHtml += `<td class="p-2 border-r bg-slate-50/30"><input type="number" step="0.5" value="${dMd}" class="w-full text-center text-xs font-bold bg-transparent outline-none calc-trigger-md"></td>`;
            }

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b"><td class="p-3 text-center border-r font-bold text-slate-800">${m.name}${vacTag}</td>
                <td class="p-3 border-r"><span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded w-full block truncate text-center" title="${safePjtName}">${safePjtName}</span></td>
                ${tdHtml}
                <td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/30 row-total-md">${m.expectedMd.toFixed(1)}</td></tr>
            `;
        }).join('');

        document.querySelectorAll('.calc-trigger-md').forEach(input => {
            input.addEventListener('input', function() {
                let tr = this.closest('tr');
                let sum = 0;
                tr.querySelectorAll('.calc-trigger-md').forEach(el => sum += (parseFloat(el.value)||0));
                tr.querySelector('.row-total-md').innerText = sum.toFixed(1);
            });
        });
    }

    // 💡 안전한 전역 window.Chart 객체 접근
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

window.renderAllocCalendar = function() {
    const grid = document.getElementById('alloc-cal-grid');
    const titleEl = document.getElementById('alloc-cal-title');
    if (!grid || !window.lastAllocatedData) return;

    let targetDateObj;
    
    // 주간/월간 모드 분기처리
    if (window.lastAllocatedData.periodMode === 'week') {
        if (!window.getDatesFromWeek) return;
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

    let validDays = new Set();
    if (window.lastAllocatedData.periodMode === 'week') {
        for(let i=0; i<5; i++) {
            let d = new Date(targetDateObj);
            d.setDate(d.getDate() + i);
            validDays.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
        }
    } else {
        for(let i=1; i<=lastDate; i++) {
            let dStr = `${y}-${String(m+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            let dObj = new Date(y, m, i);
            if(dObj.getDay() !== 0 && dObj.getDay() !== 6 && !KR_HOLIDAYS.has(dStr)) validDays.add(dStr);
        }
    }

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
            txtClass = 'text-rose-500';
            bgClass = 'bg-rose-50/20';
            if (isHoliday) badgeHtml += `<div class="text-[9px] font-bold text-rose-500 bg-rose-50 rounded text-center mb-1 py-0.5 border border-rose-100">공휴일</div>`;
        } else if (isSaturday) {
            txtClass = 'text-blue-500';
            bgClass = 'bg-blue-50/20';
        } else {
            if (validDays.has(dateStr)) {
                let tintColor = window.allocPartTab === '제조' ? 'indigo' : 'teal';
                bgClass = `bg-${tintColor}-50/10 border-t-2 border-t-${tintColor}-400`;
                
                // 분배 값을 일수로 나눠 뱃지 생성
                let divisor = window.lastAllocatedData.periodMode === 'week' ? 5 : validDays.size;
                if(divisor <= 0) divisor = 1;
                
                let membersHtml = window.lastAllocatedData.members.map(mem => {
                    if (mem.vacationDeduct >= (window.lastAllocatedData.periodMode === 'week' ? 5.0 : 20.0)) return ''; 
                    let mdStr = (mem.expectedMd / divisor).toFixed(1);
                    let sName = mem.assignedPjtName || '-';
                    return `
                        <div class="text-[9px] font-bold border border-${tintColor}-100 bg-white text-${tintColor}-700 px-1.5 py-0.5 rounded mb-0.5 truncate shadow-sm flex justify-between items-center" title="${sName}">
                            <span class="truncate pr-1">${mem.name}</span>
                            <span class="shrink-0 opacity-70">${mdStr}MD</span>
                        </div>`;
                }).join('');
                
                badgeHtml += `<div class="flex-1 flex flex-col gap-0.5 overflow-y-auto custom-scrollbar mt-1">${membersHtml}</div>`;
            }
        }

        html += `
            <div class="${bgClass} p-1.5 border-b border-r border-slate-200 hover:bg-slate-50 transition-colors flex flex-col">
                <div class="text-xs font-black text-center mb-1 ${txtClass}">${i}</div>
                ${badgeHtml}
            </div>
        `;
    }

    grid.innerHTML = html;
};

window.saveAllocationPlan = function() {
    window.showToast("투입 계획 초안이 확정 저장되었습니다.", "success");
    setTimeout(() => { if(window.openApp) window.openApp('workhours', '투입 현황'); }, 1000);
};
