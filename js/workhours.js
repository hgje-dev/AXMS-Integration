// 💡 주차 텍스트를 "YYYY년 M월 W주차" 형식으로 변환하는 유틸리티
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

// 💡 특정 월에 속한 모든 주차(Week) 문자열 배열 반환 유틸리티
function getWeeksInMonthForPlan(year, month) {
    let weeks = new Set();
    let d = new Date(year, month - 1, 1);
    let lastDate = new Date(year, month, 0);
    while(d <= lastDate) {
        if(window.getWeekString) {
            weeks.add(window.getWeekString(d));
        }
        d.setDate(d.getDate() + 1);
    }
    return Array.from(weeks);
}

// 💡 투입 계획 데이터 Fetch (주간은 단일, 월간은 합산 쿼리)
function fetchWorkPlansForContext() {
    if (workplansUnsubscribe) workplansUnsubscribe();
    const picker = document.getElementById('wh-week-picker');
    if(!picker) return;

    let weeksToQuery = [];

    if (window.whStatMode === 'month') {
        // 월간 모드일 경우 해당 월에 포함된 모든 주(Week)를 가져와서 합산
        const { start } = window.getDatesFromWeek(picker.value);
        const thu = new Date(start);
        thu.setDate(thu.getDate() + 3); // 해당 주의 목요일이 포함된 달이 기준
        const year = thu.getFullYear();
        const month = thu.getMonth() + 1;
        weeksToQuery = getWeeksInMonthForPlan(year, month);
    } else {
        // 주간 모드일 경우 선택된 1개 주만 가져옴
        weeksToQuery = [picker.value];
    }

    if (weeksToQuery.length === 0) return;

    // Firestore의 'in' 쿼리는 최대 10개까지 허용 (한 달은 최대 6주이므로 안전함)
    const q = query(collection(db, "work_plans"), where("period", "in", weeksToQuery));
    
    workplansUnsubscribe = onSnapshot(q, (snapshot) => {
        window.currentWorkPlans = [];
        snapshot.forEach(doc => window.currentWorkPlans.push({ id: doc.id, ...doc.data() }));
        window.updateWhDashboard(); // 대시보드 갱신
    });
}

// ==========================================
// 💡 프로젝트별 투입 계획 관리 (팀장용) 로직
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
    
    // 메인 화면의 주차를 계획 모달의 주차로 동기화
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

window.loadWhPlans = function() {
    const currentPeriod = document.getElementById('wh-plan-week').value;
    if (!currentPeriod) return;

    // 모달창에서는 현재 선택된 '단일 주차'의 계획만 보여줌
    const plansForPeriod = window.currentWorkPlans.filter(p => p.period === currentPeriod);
    const tbody = document.getElementById('wh-plan-tbody');
    tbody.innerHTML = '';

    if (plansForPeriod.length > 0) {
        plansForPeriod.forEach(plan => appendWhPlanRow(plan));
    } else {
        appendWhPlanRow(null); // 빈 행 1개 추가
    }
};

window.addWhPlanRow = function() {
    appendWhPlanRow(null);
};

window.removeWhPlanRow = function(btn) {
    const tr = btn.closest('tr');
    tr.style.opacity = '0';
    setTimeout(() => { tr.remove(); }, 200);
};

function appendWhPlanRow(planData = null) {
    const tbody = document.getElementById('wh-plan-tbody');
    const tr = document.createElement('tr');
    tr.className = 'wh-plan-row hover:bg-slate-50 transition-colors';
    
    const uniqueId = 'wh-plan-pjt-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const pCode = planData ? (planData.projectCode || '') : '';
    const pName = planData ? (planData.projectName || '') : '';
    
    let idInput = planData ? `<input type="hidden" class="plan-row-id" value="${planData.id}">` : `<input type="hidden" class="plan-row-id" value="">`;
    let statusHtml = planData && planData.status === 'confirmed' 
        ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold">계획 확정</span>` 
        : `<span class="bg-slate-200 text-slate-500 px-2 py-1 rounded text-[10px] font-bold">임시 저장</span>`;

    tr.innerHTML = `
        <td class="p-3 relative">
            ${idInput}
            <div class="relative flex items-center">
                <i class="fa-solid fa-magnifying-glass absolute left-3 text-amber-300 text-xs"></i>
                <input type="text" id="${uniqueId}" class="plan-row-pjt w-full border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-bold text-slate-700 placeholder-slate-400 bg-slate-50 focus:bg-white outline-amber-500" value="${pCode}" placeholder="코드/명칭 검색" oninput="window.whShowPlanPjtAuto(this)" autocomplete="off">
            </div>
            <input type="hidden" class="plan-row-pjt-code" value="${pCode}">
            <input type="hidden" class="plan-row-pjt-name" value="${pName}">
        </td>
        <td class="p-3">
            <input type="number" min="0" step="0.5" class="plan-row-headcount w-full border border-amber-100 bg-amber-50/50 rounded-xl px-3 py-2.5 text-sm font-black text-center text-amber-600 outline-amber-500" value="${planData ? planData.headcount : ''}" placeholder="0.0">
        </td>
        <td class="p-3">
            <input type="number" min="0" step="0.5" class="plan-row-md w-full border border-indigo-100 bg-indigo-50/50 rounded-xl px-3 py-2.5 text-sm font-black text-center text-indigo-600 outline-indigo-500" value="${planData ? planData.plannedMd : ''}" placeholder="0.0">
        </td>
        <td class="p-3">
            <input type="text" class="plan-row-memo w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 outline-amber-500" value="${planData ? planData.memo || '' : ''}" placeholder="메모">
        </td>
        <td class="p-3 text-center">
            ${statusHtml}
            <input type="hidden" class="plan-row-status" value="${planData ? planData.status : 'draft'}">
        </td>
        <td class="p-3 text-center">
            <button onclick="window.removeWhPlanRow(this)" class="text-slate-300 hover:text-rose-500 w-8 h-8 rounded-xl flex items-center justify-center mx-auto transition-all"><i class="fa-solid fa-trash-can"></i></button>
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
    const rows = document.querySelectorAll('.wh-plan-row');
    let toSave = [];

    rows.forEach(tr => {
        const id = tr.querySelector('.plan-row-id').value;
        const projectCodeInput = tr.querySelector('.plan-row-pjt').value.trim(); 
        const projectCode = tr.querySelector('.plan-row-pjt-code').value || projectCodeInput; 
        const projectName = tr.querySelector('.plan-row-pjt-name').value || '';
        
        const headcount = parseFloat(tr.querySelector('.plan-row-headcount').value) || 0;
        const plannedMd = parseFloat(tr.querySelector('.plan-row-md').value) || 0;
        const memo = tr.querySelector('.plan-row-memo').value.trim();

        if (projectCodeInput && (headcount > 0 || plannedMd > 0)) {
            toSave.push({ 
                id, 
                period: currentPeriod, // '2026-W16' 형식
                projectCode, 
                projectName, 
                headcount, 
                plannedMd, 
                memo, 
                status: targetStatus, 
                updatedAt: Date.now(),
                authorName: window.userProfile?.name || '관리자'
            });
        }
    });

    try {
        const batch = writeBatch(db);
        
        // 해당 "주"의 기존 계획 삭제 후 덮어쓰기
        const q = query(collection(db, "work_plans"), where("period", "==", currentPeriod));
        const existingSnap = await getDocs(q);
        existingSnap.forEach(docSnap => batch.delete(docSnap.ref));
        
        toSave.forEach(data => {
            const ref = doc(collection(db, "work_plans")); 
            data.createdAt = Date.now();
            delete data.id; 
            batch.set(ref, data);
        });

        await batch.commit();
        window.showToast(targetStatus === 'confirmed' ? "계획이 확정되어 대시보드에 반영됩니다." : "임시 저장되었습니다.");
        
        // 다시 로드하여 메인 대시보드 UI 갱신
        fetchWorkPlansForContext(); 
        window.closeWhPlanModal();
    } catch(e) {
        window.showToast("저장 실패", "error");
    }
};
