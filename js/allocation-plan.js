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
window.allocTeamMaster = [
    { name: '홍승현', part: '제조', active: true, manualVacation: 0 }, { name: '박종민', part: '제조', active: true, manualVacation: 0 },
    { name: '박원범', part: '제조', active: true, manualVacation: 0 }, { name: '표영덕', part: '제조', active: true, manualVacation: 0 },
    { name: '양윤석', part: '광학', active: true, manualVacation: 0 }, { name: '조성주', part: '광학', active: true, manualVacation: 0 },
    { name: '박광렬', part: '광학', active: true, manualVacation: 0 }, { name: '이원범', part: '광학', active: true, manualVacation: 0 }
];
window.allocProjects = [];
window.historicalMemberMd = {};
window.lastAllocatedData = null; // 달력 렌더링용 임시 저장소

// 💡 대한민국 공휴일 데이터
const KR_HOLIDAYS = new Set([
    '2024-01-01', '2024-02-09', '2024-02-12', '2024-03-01', '2024-04-10', '2024-05-06', '2024-05-15', '2024-06-06', '2024-08-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-10-03', '2024-10-09', '2024-12-25',
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-09', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-09', '2027-10-11', '2027-12-25'
]);

window.initAllocationPlan = function() {
    console.log("✅ AI 투입 계획 모듈 (수동 휴가 및 캘린더 기능 포함) 초기화");
    
    const picker = document.getElementById('alloc-week-picker');
    if (picker && !picker.value) {
        picker.value = window.getWeekString ? window.getWeekString(new Date()) : "2026-W17";
        window.updateAllocWeekDisplay(picker.value);
    }
    
    window.renderAllocMemberSelectors();

    onSnapshot(query(collection(axmsDb, "projects_status")), (snap) => {
        window.allocProjects = [];
        snap.forEach(d => {
            let p = d.data(); p.id = d.id;
            if (p.status !== 'completed' && p.status !== 'rejected') window.allocProjects.push(p);
        });
    });
};

// 💡 1. 투입 자원 및 수동 휴가 입력 UI 렌더링
window.renderAllocMemberSelectors = function() {
    const mfgCont = document.getElementById('alloc-member-list-mfg');
    const optCont = document.getElementById('alloc-member-list-opt');
    if(!mfgCont || !optCont) return;

    const renderGroup = (part, cont) => {
        const members = window.allocTeamMaster.filter(m => m.part === part);
        cont.innerHTML = members.map(m => `
            <div class="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white transition-all shadow-sm w-full md:w-auto min-w-[180px]">
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" class="w-3.5 h-3.5 accent-indigo-600 member-checkbox" data-name="${m.name}" ${m.active ? 'checked' : ''} onchange="window.updateAllocMemberActive('${m.name}', this.checked)">
                    <span class="text-[11px] font-bold text-slate-700">${m.name}</span>
                </label>
                <div class="flex items-center gap-1 ml-3 border-l border-slate-200 pl-3">
                    <span class="text-[9px] font-bold text-slate-400">휴가차감</span>
                    <input type="number" step="0.5" min="0" max="5" value="${m.manualVacation || 0}" onchange="window.updateAllocMemberVacation('${m.name}', this.value)" class="w-12 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-rose-500 font-bold outline-indigo-500 text-right bg-white" ${m.active ? '' : 'disabled'}>
                    <span class="text-[9px] font-bold text-slate-400">MD</span>
                </div>
            </div>
        `).join('');
    };
    renderGroup('제조', mfgCont);
    renderGroup('광학', optCont);
};

window.updateAllocMemberActive = (name, active) => {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) member.active = active;
    window.renderAllocMemberSelectors(); // disabled 상태 토글을 위해 재렌더링
};

window.updateAllocMemberVacation = (name, val) => {
    const member = window.allocTeamMaster.find(m => m.name === name);
    if(member) member.manualVacation = parseFloat(val) || 0;
};

window.toggleAllocPart = (part, active) => {
    window.allocTeamMaster.filter(m => m.part === part).forEach(m => m.active = active);
    window.renderAllocMemberSelectors();
};

window.selectAllAllocMembers = (active) => {
    window.allocTeamMaster.forEach(m => m.active = active);
    window.renderAllocMemberSelectors();
};

// 💡 2. 뷰 전환 토글 (Grid vs Calendar)
window.switchAllocView = function(viewMode) {
    const btnGrid = document.getElementById('btn-alloc-view-grid');
    const btnCal = document.getElementById('btn-alloc-view-cal');
    const viewGrid = document.getElementById('alloc-view-grid');
    const viewCal = document.getElementById('alloc-view-cal');

    if (viewMode === 'grid') {
        btnGrid.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5';
        btnCal.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent';
        viewGrid.classList.remove('hidden');
        viewCal.classList.add('hidden');
        viewCal.classList.remove('flex');
    } else {
        btnCal.className = 'px-4 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-1.5';
        btnGrid.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-1.5 bg-transparent';
        viewGrid.classList.add('hidden');
        viewCal.classList.remove('hidden');
        viewCal.classList.add('flex');
        
        // 캘린더 렌더링 함수 호출
        window.renderAllocCalendar();
    }
};

window.updateAllocWeekDisplay = function(weekStr) {
    if(!weekStr) return;
    const displayEl = document.getElementById('alloc-week-display');
    if (displayEl && window.formatWeekToKorean) displayEl.innerText = window.formatWeekToKorean(weekStr);
};

window.changeAllocWeek = function(offset) {
    const picker = document.getElementById('alloc-week-picker');
    if (!picker) return;
    const parts = picker.value.split('-W');
    if (parts.length === 2) {
        const year = parseInt(parts[0]);
        const week = parseInt(parts[1]);
        const d = new Date(year, 0, (parseInt(week) + offset - 1) * 7 + 1);
        if (window.getWeekString) {
            picker.value = window.getWeekString(d);
            window.updateAllocWeekDisplay(picker.value);
            window.loadAllocationData();
        }
    }
};

window.loadAllocationData = function() {
    document.getElementById('alloc-empty-state').classList.remove('hidden');
    document.getElementById('alloc-empty-state').classList.add('flex');
    document.getElementById('alloc-result-dashboard').classList.add('hidden');
    
    const btnSave = document.getElementById('btn-save-alloc');
    const btnRun = document.getElementById('btn-run-ai');
    if (btnSave) btnSave.classList.add('hidden');
    if (btnRun) btnRun.innerHTML = '<i class="fa-solid fa-microchip"></i> AI 자동 할당 실행';
    window.lastAllocatedData = null; // 초기화
};

async function fetchHistoricalDataFromAXTT() {
    let d = new Date();
    let endStr = d.toISOString().split('T')[0];
    d.setDate(d.getDate() - 28);
    let startStr = d.toISOString().split('T')[0];

    try {
        const q = query(collection(axttDb, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr), where("authorTeam", "==", "제조기술팀"));
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

// 💡 3. 수동 휴가가 차감되는 AI 자동 할당 메인 로직
window.executeAiAllocation = async function() {
    const activeMembers = window.allocTeamMaster.filter(m => m.active);
    if (activeMembers.length === 0) return window.showToast("투입할 인원을 최소 1명 이상 선택하세요.", "error");

    const targetWeek = document.getElementById('alloc-week-picker').value;
    const btn = document.getElementById('btn-run-ai');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 데이터 분석 중...';
    btn.disabled = true;

    await fetchHistoricalDataFromAXTT();

    setTimeout(() => {
        let availMD = 0;
        
        // 💡 DB에서 가져오지 않고, 사용자가 직접 기입한 manualVacation 값을 차감
        activeMembers.forEach(m => {
            let baseMd = window.historicalMemberMd[m.name] || 5.0; // AXTT 데이터가 없으면 5.0
            let vDeduct = parseFloat(m.manualVacation) || 0;
            
            m.expectedMd = Math.max(0, baseMd - vDeduct);
            m.vacationDeduct = vDeduct;
            availMD += m.expectedMd;
        });

        // PJT 스코어링 및 외주 판별
        let pjtResults = []; let outResults = [];
        let priorities = window.allocProjects.map(p => {
            let remain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0));
            let outMd = parseFloat(p.outMd) || 0;
            let internalReq = Math.max(0, remain - outMd);
            if(outMd > 0) outResults.push({ code: p.code, name: p.name, allocated: outMd, reason: '기등록 외주' });
            return { ...p, internalReq, score: (p.d_shipEst ? 100 - Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 0) + (internalReq * 2) };
        }).sort((a,b) => b.score - a.score);

        let currentAvail = availMD;
        priorities.forEach(p => {
            if(currentAvail <= 0) { outResults.push({ ...p, allocated: p.internalReq, reason: '사내 캐파 부족' }); return; }
            let alloc = Math.min(p.internalReq, currentAvail);
            if(alloc > 0) { pjtResults.push({ ...p, allocated: alloc }); currentAvail -= alloc; }
        });

        // 결과 렌더링 호출
        window.renderAllocUI(activeMembers.length * 5.0, availMD, pjtResults, outResults, activeMembers);
        
        // 💡 생성된 할당 데이터를 캘린더 뷰를 위해 임시 저장
        window.lastAllocatedData = {
            week: targetWeek,
            members: activeMembers,
            pjtResults: pjtResults
        };
        
        // 만약 현재 뷰가 달력 뷰라면 달력도 갱신
        if (!document.getElementById('alloc-view-cal').classList.contains('hidden')) {
            window.renderAllocCalendar();
        }
        
        document.getElementById('alloc-empty-state').classList.add('hidden');
        document.getElementById('alloc-result-dashboard').classList.remove('hidden');
        document.getElementById('btn-save-alloc').classList.remove('hidden');
        document.getElementById('btn-save-alloc').classList.add('flex');
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 다시 계산';
        btn.disabled = false;
        window.showToast("수동 예외처리가 반영된 투입 계획이 생성되었습니다.");
    }, 500);
};

window.renderAllocUI = function(maxMD, availMD, pjtResults, outResults, members) {
    document.getElementById('alloc-kpi-members').innerText = members.length;
    document.getElementById('alloc-kpi-avail').innerText = availMD.toFixed(1);
    document.getElementById('alloc-kpi-assigned').innerText = pjtResults.reduce((a,b)=>a+b.allocated,0).toFixed(1);
    document.getElementById('alloc-kpi-outsourcing').innerText = outResults.reduce((a,b)=>a+b.allocated,0).toFixed(1);

    const pjtCont = document.getElementById('alloc-pjt-list');
    pjtCont.innerHTML = pjtResults.map(p => `
        <div class="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:shadow-md transition-all">
            <div class="flex items-center gap-4">
                <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black shadow-sm shrink-0 border border-white/50"><i class="fa-solid fa-check"></i></div>
                <div><div class="font-black text-slate-800 text-sm">${p.name}</div><div class="text-[10px] text-slate-400 font-bold">${p.code}</div></div>
            </div>
            <div class="text-right border-l pl-4"><span class="text-[10px] font-bold text-slate-400 block mb-1">배정 공수</span><span class="text-xl font-black text-indigo-600">${p.allocated.toFixed(1)} MD</span></div>
        </div>
    `).join('') + outResults.map(o => `
        <div class="flex items-center justify-between p-3 rounded-lg border border-rose-100 bg-rose-50/30 mt-2 opacity-80">
            <span class="text-xs font-bold text-slate-600">${o.name} <span class="text-[9px] text-rose-400 ml-1">(${o.reason})</span></span>
            <span class="text-sm font-black text-rose-500">${o.allocated.toFixed(1)} MD</span>
        </div>
    `).join('');

    const tbody = document.getElementById('alloc-member-list');
    let pjtIdx = 0;
    
    tbody.innerHTML = members.map((m, idx) => {
        const assignedPjt = pjtResults[pjtIdx % pjtResults.length]?.name || '-';
        const dMd = (m.expectedMd / 5).toFixed(1); // 5일로 분배
        const vacTag = m.vacationDeduct > 0 ? `<div class="text-[9px] text-rose-500 font-bold mt-1 bg-rose-50 border border-rose-100 rounded text-center">차감 -${m.vacationDeduct}MD</div>` : '';
        
        // 캘린더용으로 PJT 이름 임시 저장
        m.assignedPjtName = assignedPjt; 

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b"><td class="p-3 text-center border-r font-bold text-slate-800">${m.name}${vacTag}</td>
            <td class="p-3 border-r"><span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded w-full block truncate text-center">${assignedPjt}</span></td>
            ${Array(5).fill(`<td class="p-2 border-r bg-slate-50/30"><input type="number" step="0.5" value="${dMd}" class="w-full text-center text-xs font-bold bg-transparent outline-none calc-trigger-md"></td>`).join('')}
            <td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/30 row-total-md">${m.expectedMd.toFixed(1)}</td></tr>
        `;
    }).join('');

    const ctx = document.getElementById('alloc-chart')?.getContext('2d');
    if (ctx) {
        if(allocChartInstance) allocChartInstance.destroy();
        allocChartInstance = new Chart(ctx, {
            type: 'doughnut', data: { labels: pjtResults.map(p=>p.name), datasets: [{ data: pjtResults.map(p=>p.allocated), backgroundColor: ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
        });
    }
};

// 💡 4. 공휴일이 적용된 월간 할당 달력 렌더링
window.renderAllocCalendar = function() {
    const grid = document.getElementById('alloc-cal-grid');
    const titleEl = document.getElementById('alloc-cal-title');
    if (!grid || !window.lastAllocatedData) return;

    const targetWeek = window.lastAllocatedData.week;
    if (!window.getDatesFromWeek) return;
    
    const dates = window.getDatesFromWeek(targetWeek);
    const y = dates.start.getFullYear();
    const m = dates.start.getMonth(); // 0-based
    
    if (titleEl) titleEl.innerText = `${y}년 ${m + 1}월 투입 자동계획 캘린더`;

    const firstDay = new Date(y, m, 1).getDay();
    const lastDate = new Date(y, m + 1, 0).getDate();

    // 해당 주차(월~금)의 날짜 문자열 세트 만들기 (달력에 배정 뱃지를 띄우기 위해)
    let weekWorkDays = new Set();
    for(let i=0; i<5; i++) {
        let d = new Date(dates.start);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        weekWorkDays.add(dStr);
    }

    let html = `
        <div class="p-2 text-center text-xs font-black text-rose-500 bg-slate-50 border-b border-slate-200">일</div>
        <div class="p-2 text-center text-xs font-black text-slate-700 bg-slate-50 border-b border-slate-200">월</div>
        <div class="p-2 text-center text-xs font-black text-slate-700 bg-slate-50 border-b border-slate-200">화</div>
        <div class="p-2 text-center text-xs font-black text-slate-700 bg-slate-50 border-b border-slate-200">수</div>
        <div class="p-2 text-center text-xs font-black text-slate-700 bg-slate-50 border-b border-slate-200">목</div>
        <div class="p-2 text-center text-xs font-black text-slate-700 bg-slate-50 border-b border-slate-200">금</div>
        <div class="p-2 text-center text-xs font-black text-blue-500 bg-slate-50 border-b border-slate-200">토</div>
    `;

    for(let i=0; i<firstDay; i++) {
        html += `<div class="bg-slate-50 opacity-50 border-b border-slate-200"></div>`;
    }

    // 일별 렌더링
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
            // 이번 주 월~금 평일인 경우에만 AI 할당 뱃지를 띄움
            if (weekWorkDays.has(dateStr)) {
                bgClass = 'bg-indigo-50/10 border-t-2 border-t-indigo-300';
                
                // 팀원들의 배정 내역을 작은 뱃지로 생성
                let membersHtml = window.lastAllocatedData.members.map(mem => {
                    if (mem.vacationDeduct >= 5.0) return ''; // 전면 휴가자 제외
                    let mdStr = (mem.expectedMd / 5).toFixed(1);
                    return `
                        <div class="text-[9px] font-bold border border-indigo-100 bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded mb-0.5 truncate shadow-sm flex justify-between items-center" title="${mem.assignedPjtName}">
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
    window.showToast("투입 계획이 확정 저장되었습니다.", "success");
    setTimeout(() => window.openApp('workhours', '투입 현황'), 1000);
};
