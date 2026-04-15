// js/workhours.js 하단 부분: "프로젝트별 투입 계획 관리 (팀장용) 로직" 영역을 찾아 전체 교체

// ==========================================
// 💡 프로젝트별 투입 계획 관리 (팀장용) 로직
// ==========================================

window.whPlanViewMode = 'week'; // 초기 모드 상태

// 모달 열기 로직 개선
window.openWhPlanModal = function() {
    if (!window.userProfile || window.userProfile.role !== 'admin') {
        return window.showToast("팀장(관리자) 권한이 필요합니다.", "error");
    }
    
    const picker = document.getElementById('wh-week-picker');
    const planWeekInput = document.getElementById('wh-plan-week');
    
    if (picker && picker.value && planWeekInput) {
        planWeekInput.value = picker.value;
        const displayEl = document.getElementById('wh-plan-week-display');
        if (displayEl) displayEl.innerText = window.formatWeekToKorean(picker.value);
    }

    document.getElementById('wh-plan-modal').classList.remove('hidden');
    document.getElementById('wh-plan-modal').classList.add('flex');
    
    // 모달 열 때 항상 '주간 계획' 모드로 초기화
    window.setWhPlanViewMode('week');
};

window.closeWhPlanModal = function() {
    document.getElementById('wh-plan-modal').classList.add('hidden');
    document.getElementById('wh-plan-modal').classList.remove('flex');
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
    const footer = document.getElementById('wh-plan-footer-actions');
    const helpTxt = document.getElementById('wh-plan-help-text');

    if (mode === 'week') {
        btnW.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all';
        btnM.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all bg-transparent';
        ctrlW.classList.remove('hidden'); ctrlW.classList.add('flex');
        ctrlM.classList.add('hidden'); ctrlM.classList.remove('flex');
        
        if(btnAdd) btnAdd.classList.remove('hidden');
        if(legend) legend.classList.remove('hidden');
        if(footer) footer.classList.remove('hidden');
        if(helpTxt) helpTxt.classList.remove('hidden');
        
        window.loadWhPlans();
    } else {
        btnM.className = 'px-4 py-1.5 text-xs font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all';
        btnW.className = 'px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all bg-transparent';
        ctrlM.classList.remove('hidden'); ctrlM.classList.add('flex');
        ctrlW.classList.add('hidden'); ctrlW.classList.remove('flex');
        
        if(btnAdd) btnAdd.classList.add('hidden');
        if(legend) legend.classList.add('hidden');
        if(footer) footer.classList.add('hidden');
        if(helpTxt) helpTxt.classList.add('hidden');
        
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

window.handleWhPlanWeekChange = function(val) {
    if (!val) return;
    const displayEl = document.getElementById('wh-plan-week-display');
    if (displayEl) displayEl.innerText = window.formatWeekToKorean(val);
    window.loadWhPlans();
};

window.handleWhPlanMonthChange = function(val) {
    if(!val) return;
    window.loadMonthlyPlanViewer();
};

// 💡 개선 1: 인원(hc) 입력 시 MD 자동 동기화 로직 추가
window.calcWhPlanRow = function(inputEl) {
    const tr = inputEl.closest('tr');
    
    // 인원(명) 입력칸 변경 시
    if (inputEl.classList.contains('p-day-hc')) {
        const mdInput = inputEl.parentElement.nextElementSibling.querySelector('.p-day-md');
        // MD칸이 비어있거나, 자동 생성된 값이거나, 기존 인원수와 값이 같을 때만 동기화
        if (mdInput && (!mdInput.value || mdInput.dataset.autoSynced === 'true' || mdInput.value === inputEl.dataset.prevVal)) {
            mdInput.value = inputEl.value; // 인원 값을 그대로 복사 (1명 = 1MD)
            mdInput.dataset.autoSynced = 'true';
        }
        inputEl.dataset.prevVal = inputEl.value; // 이전 인원 값 기억
    } 
    // 공수(MD) 수동 입력 시 자동 동기화 해제
    else if (inputEl.classList.contains('p-day-md')) {
        inputEl.dataset.autoSynced = 'false'; 
    }

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

// 💡 개선 2: 월간 조회 뷰어 (Monthly Viewer) 렌더링 로직
window.loadMonthlyPlanViewer = function() {
    const monthVal = document.getElementById('wh-plan-month').value;
    if(!monthVal) return;
    const [yearStr, monthStr] = monthVal.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const weeks = window.getWeeksInMonthForPlan(year, month);
    
    const thead = document.getElementById('wh-plan-grid-header');
    let headerHtml = `<th class="p-3 w-[260px] text-center border-r border-slate-200 sticky left-0 bg-slate-800 z-30">진행 프로젝트 (확정건만)</th>`;
    
    weeks.forEach(w => {
        headerHtml += `<th class="p-3 text-center border-r border-slate-600 font-bold">${window.formatWeekToKorean(w).split(' ')[2]}</th>`;
    });
    headerHtml += `<th class="p-3 text-center text-amber-300 font-black">월간 총 투입 (MD)</th>`;
    thead.innerHTML = headerHtml;

    const tbody = document.getElementById('wh-plan-tbody');
    tbody.innerHTML = '';

    // 월간 데이터 취합 (상태가 'confirmed' 인 데이터만)
    const plansForMonth = window.currentWorkPlans.filter(p => weeks.includes(p.period) && p.status === 'confirmed');
    
    if (plansForMonth.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${weeks.length + 2}" class="p-8 text-center text-slate-400 font-bold">해당 월에 확정된 투입 계획이 없습니다.</td></tr>`;
        return;
    }

    // 프로젝트별(pjtCode 기준)로 데이터 병합
    let pjtAgg = {};
    plansForMonth.forEach(plan => {
        let code = plan.projectCode || '미분류';
        if (!pjtAgg[code]) {
            pjtAgg[code] = { name: plan.projectName, weeks: {}, total: 0 };
            weeks.forEach(w => pjtAgg[code].weeks[w] = 0);
        }
        
        let weeklyTotal = 0;
        if (plan.daily) {
            for(let d in plan.daily) {
                weeklyTotal += parseFloat(plan.daily[d].md) || 0;
            }
        }
        pjtAgg[code].weeks[plan.period] += weeklyTotal;
        pjtAgg[code].total += weeklyTotal;
    });

    let bodyHtml = '';
    Object.keys(pjtAgg).sort().forEach(code => {
        const data = pjtAgg[code];
        let pName = data.name || '';
        
        bodyHtml += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="p-3 border-r border-slate-200 sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
                <div class="font-black text-indigo-700 text-xs">[${code}]</div>
                <div class="font-bold text-slate-600 text-xs truncate max-w-[240px] mt-0.5" title="${pName}">${pName}</div>
            </td>`;
        
        weeks.forEach(w => {
            let val = data.weeks[w];
            let text = val > 0 ? val.toFixed(1) : '-';
            let color = val > 0 ? 'text-indigo-600 font-black' : 'text-slate-300';
            bodyHtml += `<td class="p-3 text-center border-r border-slate-100 ${color} text-sm">${text}</td>`;
        });
        
        bodyHtml += `<td class="p-3 text-center text-amber-600 font-black text-sm bg-amber-50/30">${data.total.toFixed(1)}</td>
        </tr>`;
    });

    tbody.innerHTML = bodyHtml;
};

// 특정 월에 속한 주차(week) 문자열 배열 반환 유틸리티 (필수)
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

        // data-prev-val 데이터 속성을 추가하여 이전 인원 값을 저장 (동기화 조건에 활용)
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
        window.showToast(targetStatus === 'confirmed' ? "계획이 확정되어 대시보드에 반영됩니다." : "임시 저장되었습니다.");
        
        window.fetchWorkPlansForContext(); 
        window.closeWhPlanModal();
    } catch(e) {
        console.error(e);
        window.showToast("저장 실패", "error");
    }
};
