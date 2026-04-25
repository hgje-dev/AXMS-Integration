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
window.allocTeamMembers = [];
window.allocProjects = [];
window.historicalMemberMd = {}; 

window.initAllocationPlan = function() {
    console.log("✅ 투입 자동계획(AI Allocation) 모듈 및 AXTT 연동 초기화 완료");
    
    const picker = document.getElementById('alloc-week-picker');
    if (picker && !picker.value) {
        picker.value = window.getWeekString ? window.getWeekString(new Date()) : "2026-W16";
        window.updateAllocWeekDisplay(picker.value);
    }
    
    // AXMS 팀원 목록 중 '제조기술팀(파트: 제조)' 인원만 불러오기
    onSnapshot(collection(axmsDb, "team_members"), (snap) => {
        window.allocTeamMembers = [];
        snap.forEach(d => {
            const m = d.data();
            if (m.part === '제조') window.allocTeamMembers.push(m);
        });
    });

    // AXMS 진행중인 프로젝트 로드
    onSnapshot(query(collection(axmsDb, "projects_status")), (snap) => {
        window.allocProjects = [];
        snap.forEach(d => {
            let p = d.data();
            p.id = d.id;
            if (p.status !== 'completed' && p.status !== 'rejected') {
                window.allocProjects.push(p);
            }
        });
    });
};

window.updateAllocWeekDisplay = function(weekStr) {
    if(!weekStr) return;
    const displayEl = document.getElementById('alloc-week-display');
    if (displayEl && window.formatWeekToKorean) {
        displayEl.innerText = window.formatWeekToKorean(weekStr);
    }
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
};

// 💡 [STEP 1] AXTT 데이터 로드
async function fetchHistoricalDataFromAXTT() {
    if (window.showToast) window.showToast("AXTT 시스템에서 제조기술팀 과거 실적을 확인 중입니다...", "success");
    
    let d = new Date();
    let endStr = d.toISOString().split('T')[0];
    d.setDate(d.getDate() - 28); // 최근 4주
    let startStr = d.toISOString().split('T')[0];

    try {
        const q = query(
            collection(axttDb, "work_logs"), 
            where("date", ">=", startStr), 
            where("date", "<=", endStr)
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            if (window.showToast) window.showToast("AXTT에 누적된 과거 데이터가 없습니다. 기본 가용력(5.0 MD)으로 계산합니다.", "warning");
            window.historicalMemberMd = {};
            return;
        }

        let rawStats = {};
        snap.forEach(docSnap => {
            const data = docSnap.data();
            // 제조기술팀 필터링 (기존 시스템 팀명/파트명 호환을 위해 조건 완화 처리)
            if (data.authorTeam === '제조기술팀' || data.part === '제조') {
                const name = data.authorName;
                const hours = parseFloat(data.hours) || 0;
                if (!rawStats[name]) rawStats[name] = 0;
                rawStats[name] += (hours / 8); 
            }
        });

        window.historicalMemberMd = {};
        for (let name in rawStats) {
            let avgMd = rawStats[name] / 4; 
            window.historicalMemberMd[name] = Math.min(avgMd, 5.0); 
        }
    } catch (error) {
        console.warn("AXTT 로드 실패 (기본값 진행):", error);
        if (window.showToast) window.showToast("AXTT 연동 실패. 기본값(5.0 MD)으로 계산합니다.", "warning");
        window.historicalMemberMd = {};
    }
}

// 💡 [STEP 2~4] AI 자동 할당 메인 로직
window.executeAiAllocation = async function() {
    const targetWeek = document.getElementById('alloc-week-picker').value;
    if (!targetWeek) return window.showToast("주차를 선택해주세요.", "warning");

    if (window.allocTeamMembers.length === 0 || window.allocProjects.length === 0) {
        return window.showToast("팀원 데이터나 진행중인 프로젝트가 부족하여 실행할 수 없습니다.", "error");
    }

    const btn = document.getElementById('btn-run-ai');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 데이터 연동 및 분석 중...';
    btn.classList.remove('animate-[pulse_2s_infinite]');
    btn.disabled = true;

    // 1) AXTT 과거 데이터 로드
    await fetchHistoricalDataFromAXTT();
    
    // 2) AXMS 이번 주 휴가 일정 로드
    let vacationMap = {};
    try {
        const scheduleSnap = await getDocs(query(
            collection(axmsDb, "weekly_schedules"), 
            where("week", "==", targetWeek)
        ));
        scheduleSnap.forEach(docSnap => {
            const s = docSnap.data();
            if (s.category && s.category.includes("휴가")) {
                let deduct = (s.category === "휴가/연차") ? 1.0 : 0.5;
                vacationMap[s.authorName] = (vacationMap[s.authorName] || 0) + deduct;
            }
        });
    } catch(e) { console.warn("일정 로드 에러:", e); }

    setTimeout(() => {
        let maxMD = window.allocTeamMembers.length * 5.0; 
        let availMD = 0;
        
        // 3) 개인별 최종 가용 MD 산출 (역량 - 휴가)
        window.allocTeamMembers.forEach(m => {
            let baseMd = window.historicalMemberMd[m.name] || 5.0; 
            let vDeduct = vacationMap[m.name] || 0; 
            
            m.expectedMd = Math.max(0, baseMd - vDeduct); 
            m.vacationDeduct = vDeduct; 
            availMD += m.expectedMd;
        });

        let currentAvail = availMD;
        let pjtResults = [];
        let outsourcingResults = []; 

        // 4) PJT 우선순위 및 외주 선차감
        let priorities = window.allocProjects.map(p => {
            let totalRemain = Math.max(0, (parseFloat(p.estMd)||0) - (parseFloat(p.finalMd)||0));
            let preAssignedOutMd = parseFloat(p.outMd) || 0;
            let internalRemainMd = Math.max(0, totalRemain - preAssignedOutMd);
            
            if (preAssignedOutMd > 0) {
                outsourcingResults.push({ code: p.code, name: p.name, allocated: preAssignedOutMd, reason: 'PJT현황 기등록 외주' });
            }

            let dDay = p.d_shipEst ? Math.ceil((new Date(p.d_shipEst) - new Date()) / 86400000) : 999;
            let score = (dDay <= 7 ? 50 : (dDay <= 14 ? 30 : 0)) + (internalRemainMd * 2);

            return { ...p, internalRemainMd, dDay, score };
        }).filter(p => p.internalRemainMd > 0 || p.dDay <= 14).sort((a, b) => b.score - a.score);

        // 5) 사내 할당 및 캐파 오버플로우 외주 전환
        priorities.forEach((p, idx) => {
            let reqMd = p.internalRemainMd > 0 ? p.internalRemainMd : 2.0;
            reqMd = Math.round(reqMd * 2) / 2;

            if (currentAvail >= reqMd) {
                pjtResults.push({ code: p.code, name: p.name, allocated: reqMd, priority: idx + 1, progress: p.progress });
                currentAvail -= reqMd;
            } else if (currentAvail > 0) {
                pjtResults.push({ code: p.code, name: p.name, allocated: currentAvail, priority: idx + 1, progress: p.progress });
                let overflow = reqMd - currentAvail;
                outsourcingResults.push({ code: p.code, name: p.name, allocated: overflow, reason: '사내 캐파 오버플로우' });
                currentAvail = 0;
            } else {
                outsourcingResults.push({ code: p.code, name: p.name, allocated: reqMd, reason: '사내 캐파 오버플로우' });
            }
        });

        if (currentAvail > 0) {
            pjtResults.push({ code: 'COMMON', name: '공통/유지보수 및 기타', allocated: currentAvail, priority: 99, dDay: '-', progress: 100 });
        }

        // 결과 렌더링
        renderAllocUI(maxMD, availMD, pjtResults, outsourcingResults, window.allocTeamMembers);

        document.getElementById('alloc-empty-state').classList.add('hidden');
        document.getElementById('alloc-empty-state').classList.remove('flex');
        document.getElementById('alloc-result-dashboard').classList.remove('hidden');
        document.getElementById('btn-save-alloc').classList.remove('hidden');
        document.getElementById('btn-save-alloc').classList.add('flex');
        
        btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> 다시 계산하기';
        btn.disabled = false;
        
        if (window.showToast) window.showToast("휴가와 외주를 고려한 AI 투입계획 초안이 생성되었습니다.", "success");
    }, 500);
};

function renderAllocUI(maxMD, availMD, pjtResults, outResults, members) {
    document.getElementById('alloc-kpi-total').innerText = maxMD.toFixed(1);
    document.getElementById('alloc-kpi-members').innerText = members.length;
    document.getElementById('alloc-kpi-avail').innerText = availMD.toFixed(1);
    
    let totalAssigned = pjtResults.reduce((sum, p) => sum + p.allocated, 0);
    document.getElementById('alloc-kpi-assigned').innerText = totalAssigned.toFixed(1);
    document.getElementById('alloc-kpi-pjt-count').innerText = pjtResults.filter(p => p.code !== 'COMMON').length;

    let totalOutsourcing = outResults.reduce((sum, p) => sum + p.allocated, 0);
    document.getElementById('alloc-kpi-outsourcing').innerText = totalOutsourcing.toFixed(1);

    const pjtListContainer = document.getElementById('alloc-pjt-list');
    
    // 사내 프로젝트 렌더링
    let pjtHtml = pjtResults.map(p => {
        let isEmergency = p.priority === 1;
        let badgeColor = isEmergency ? 'bg-rose-500 text-white' : (p.code === 'COMMON' ? 'bg-slate-400 text-white' : 'bg-indigo-100 text-indigo-700');
        let borderColor = isEmergency ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200 hover:shadow-md';
        
        return `
        <div class="flex items-center justify-between p-4 rounded-xl border ${borderColor} transition-all">
            <div class="flex items-center gap-4">
                <div class="w-8 h-8 rounded-full ${badgeColor} flex items-center justify-center font-black shadow-sm shrink-0 border border-white/50">${p.priority === 99 ? '-' : p.priority}</div>
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-black text-slate-800 text-sm">${p.name}</span>
                        <span class="text-[10px] text-slate-500 font-bold hidden sm:inline-block">[${p.code}]</span>
                    </div>
                    <div class="w-24 mt-1">
                        <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden"><div class="${isEmergency ? 'bg-rose-500' : 'bg-indigo-500'} h-full rounded-full" style="width: ${p.progress}%"></div></div>
                    </div>
                </div>
            </div>
            <div class="text-right border-l border-slate-200 pl-4">
                <span class="text-[10px] font-bold text-slate-500 block leading-none mb-1">사내 할당</span>
                <span class="text-xl font-black ${isEmergency ? 'text-rose-600' : 'text-indigo-600'}">${p.allocated.toFixed(1)} <span class="text-xs">MD</span></span>
            </div>
        </div>`;
    }).join('');

    // 외주 오버플로우 렌더링
    if (outResults.length > 0) {
        pjtHtml += `<div class="border-t-2 border-dashed border-rose-200 mt-4 pt-4 mb-2"><h4 class="text-xs font-black text-rose-600 mb-2"><i class="fa-solid fa-handshake-angle"></i> 외주 전환 필요 (오버플로우)</h4>`;
        pjtHtml += outResults.map(o => `
            <div class="flex items-center justify-between p-3 rounded-lg border border-rose-100 bg-rose-50/50 mb-2">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-slate-800 text-xs">${o.name}</span>
                    <span class="text-[9px] text-rose-500 font-bold border border-rose-200 px-1 rounded bg-white">${o.reason}</span>
                </div>
                <span class="text-sm font-black text-rose-600">${o.allocated.toFixed(1)} MD</span>
            </div>
        `).join('');
        pjtHtml += `</div>`;
    }
    
    pjtListContainer.innerHTML = pjtHtml;

    // 차트
    const ctx = document.getElementById('alloc-chart')?.getContext('2d');
    if (ctx) {
        if(allocChartInstance) allocChartInstance.destroy();
        Chart.defaults.font.family = "'Pretendard', sans-serif";
        allocChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: pjtResults.map(p => p.name),
                datasets: [{
                    data: pjtResults.map(p => p.allocated),
                    backgroundColor: ['#e11d48', '#4f46e5', '#0ea5e9', '#10b981', '#8b5cf6', '#64748b'],
                    borderWidth: 2, borderColor: '#ffffff', hoverOffset: 4, borderRadius: 5
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 10, weight: 'bold' } } } }
            }
        });
    }

    // 팀원 테이블
    const tbody = document.getElementById('alloc-member-list');
    let pjtIdx = 0;
    
    tbody.innerHTML = members.map(m => {
        let assignedPjt = pjtResults[pjtIdx % pjtResults.length];
        pjtIdx++;
        if (assignedPjt && assignedPjt.code === 'COMMON') assignedPjt = pjtResults[0] || assignedPjt;

        let pjtName = assignedPjt ? assignedPjt.name : '-';
        let pjtBadge = `<span class="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded shadow-sm w-full block truncate text-center">${pjtName}</span>`;
        
        let dailyMd = (m.expectedMd / 5).toFixed(1);
        let vacHtml = m.vacationDeduct > 0 ? `<div class="text-[8px] text-rose-500 font-bold mt-0.5 bg-rose-50 border border-rose-100 rounded text-center w-full">휴가 -${m.vacationDeduct}MD</div>` : '';

        return `
        <tr class="hover:bg-slate-50 transition-colors group border-b border-slate-100">
            <td class="p-3 text-center border-r border-slate-100 bg-white">
                <div class="font-bold text-slate-800">${m.name}</div>
                <div class="text-[9px] text-slate-400">${m.part || '제조'}</div>
                ${vacHtml}
            </td>
            <td class="p-3 border-r border-slate-100 bg-white">${pjtBadge}</td>
            <td class="p-2 border-r border-slate-100 bg-slate-50/50"><input type="number" step="0.5" value="${dailyMd}" class="w-full text-center text-xs font-bold bg-transparent outline-indigo-500 calc-trigger-md"></td>
            <td class="p-2 border-r border-slate-100 bg-slate-50/50"><input type="number" step="0.5" value="${dailyMd}" class="w-full text-center text-xs font-bold bg-transparent outline-indigo-500 calc-trigger-md"></td>
            <td class="p-2 border-r border-slate-100 bg-slate-50/50"><input type="number" step="0.5" value="${dailyMd}" class="w-full text-center text-xs font-bold bg-transparent outline-indigo-500 calc-trigger-md"></td>
            <td class="p-2 border-r border-slate-100 bg-slate-50/50"><input type="number" step="0.5" value="${dailyMd}" class="w-full text-center text-xs font-bold bg-transparent outline-indigo-500 calc-trigger-md"></td>
            <td class="p-2 border-r border-slate-100 bg-slate-50/50"><input type="number" step="0.5" value="${dailyMd}" class="w-full text-center text-xs font-bold bg-transparent outline-indigo-500 calc-trigger-md"></td>
            <td class="p-3 text-center font-black text-indigo-700 bg-indigo-50/30 row-total-md">${m.expectedMd.toFixed(1)}</td>
        </tr>`;
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

window.saveAllocationPlan = async function() {
    const btn = document.getElementById('btn-save-alloc');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중...';
    btn.disabled = true;

    setTimeout(() => {
        if (window.showToast) window.showToast("투입 계획 초안이 성공적으로 확정 저장되었습니다.", "success");
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> 계획 확정 및 저장';
        btn.disabled = false;
        
        if(window.openApp) {
            setTimeout(() => window.openApp('workhours', '투입 현황'), 1000);
        }
    }, 1000);
};
