/* eslint-disable */
import { db } from './firebase.js';
import { 
    collection, doc, setDoc, getDoc, getDocs, 
    addDoc, deleteDoc, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 1. 전역 변수 및 초기화 (Inline Worker 적용으로 CORS 에러 원천 차단)
// ==========================================
const SIMULATION_DRIVE_FOLDER_ID = "1qyW-Ym_16tpRUUE0NQuFmwxg3IadF70e";

// 💡 별도의 파일 없이 백그라운드 연산을 수행하기 위한 Blob Worker 로직
const workerScript = `
self.onmessage = function(e) {
    const { method, qty, curve, iters, uncert, diff, rBase, bBase, pers, sMult, processData } = e.data;

    const getNormalRandom = (mean, stdDev) => {
        let u1 = Math.random(); if (u1 === 0) u1 = 0.0001;
        return (Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * Math.random())) * stdDev + mean;
    };
    
    const getTriangularRandom = (min, mode, max) => {
        let u = Math.random(); let F = (mode - min) / (max - min);
        if (u <= F) return min + Math.sqrt(u * (max - min) * (mode - min));
        else return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    };

    let lR = Math.max(0.7, Math.pow(curve, Math.log2(qty))); 
    let bArr = new Float32Array(iters), rArr = new Float32Array(iters);
    let tMd = 0;

    // tMd(기본 투입 시간) 사전 계산
    processData.forEach(p => {
        let pt = p.pType || 'md';
        let pq = parseFloat(p.q) || 1; // 공정 수량 계수
        if(pt === 'auto') {
            let um = 0;
            (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0));
            tMd += um * pq; 
        } else if(pt === 'md') {
            tMd += (parseFloat(p.q)||0)*(parseFloat(p.m)||0);
        }
    });

    for(let i = 0; i < iters; i++) {
        let im = 0; 
        processData.forEach(p => {
            let pt = p.pType || 'md';
            let pq = parseFloat(p.q) || 1;
            if(pt === 'auto') {
                (p.unitData || []).forEach(u => {
                    let m = parseFloat(u.m) || 0, q = parseFloat(u.q) || 0;
                    if(m > 0 && q > 0) {
                        let randVal = method === 'mc' ? getNormalRandom(m, (m*uncert)/3) : getTriangularRandom(m*0.85, m, m*1.3);
                        im += (q * randVal) * pq; // 몬테카를로 난수 값에 유닛수량과 공정수량 동시 반영
                    }
                });
            } else if(pt === 'md') {
                let m = parseFloat(p.m) || 0, q = parseFloat(p.q) || 0;
                if(m > 0 && q > 0) {
                    let randVal = method === 'mc' ? getNormalRandom(m, (m*uncert)/3) : getTriangularRandom(m*0.85, m, m*1.3);
                    im += q * randVal;
                }
            }
        });
        
        bArr[i] = (im * qty) * diff * lR * (1 + Math.max(0, getNormalRandom(rBase, (rBase*0.1)/3))) * (1 + Math.max(0, getNormalRandom(bBase, (bBase*0.1)/3))); 
        rArr[i] = bArr[i] * sMult;
    }
    
    const sortedRArr = new Float32Array(rArr);
    sortedRArr.sort(); 
    const p10 = sortedRArr[Math.floor(iters * 0.1)] || 0;
    const p50 = sortedRArr[Math.floor(iters * 0.5)] || 0;
    const p90 = sortedRArr[Math.floor(iters * 0.9)] || 0; 
    
    self.postMessage({
        p10, p50, p90,
        d10: Math.ceil(p10 / pers),
        d50: Math.ceil(p50 / pers),
        d90: Math.ceil(p90 / pers),
        rArr: Array.from(sortedRArr),
        bArr: Array.from(bArr),
        tMd
    });
};
`;

const blob = new Blob([workerScript], { type: 'application/javascript' });
const simulationWorker = new Worker(URL.createObjectURL(blob));

window.currentProcessData = window.currentProcessData || [];
window.latestP50Md = 0;
window.latestReqP90 = 0;
window.masterPresets = {};
window.currentTab = 'hist'; 
window.currentProjectId = null;
window.isProjectDirty = false; 
window.latestAiResult = null; 
window.completedProjects = [];
window.selectedSimilarProjects = [];
window.dashMatchedData = []; 
window.dashSelectedCodes = []; 

window.isLockedMode = false;
window.currentProjectLockPassword = null;

const defaultPresets = {
    dev: { 
        label: "🔬 기본 신규 개발", 
        processData: [
            { name: "개발 설계 및 리뷰", q: 2, m: 5.0, pType: 'md' }, 
            { name: "자재 발주 및 대기", q: 1, m: 2.0, pType: 'md' }, 
            { name: "신규 부품 조립 (유닛 합산)", q: 3, m: 0.3, pType: 'auto', unitData: [{name: "신규", q:1, m:1.0, o:0.9, p:1.4}] }, 
            { name: "전장 배선 작업", q: 2, m: 5.0, pType: 'schedule_elec' }, 
            { name: "제어 프로그램 디버깅", q: 1, m: 7.0, pType: 'schedule_ctrl' },
            { name: "최종 비전 검사 및 출하", q: 1, m: 3.0, pType: 'schedule_insp' }
        ], 
        curve: 98, diff: 1.0, buffer: 5, pSenior: 1, pMid: 2, pJunior: 0, 
        internal: 3, labor: 300000, plannedExpense: 0, hex: '#8b5cf6', colorClass: 'bg-gradient-to-r from-indigo-500 to-purple-500' 
    }
};

window.addEventListener('beforeunload', (e) => {
    if (window.isProjectDirty) {
        e.preventDefault();
        e.returnValue = '저장하지 않은 변경사항이 있습니다. 이 페이지를 벗어나시겠습니까?';
    }
});

// 💡 [버그 픽스] 라우터에서 호출하는 초기화 함수 
window.initSimulation = function() {
    console.log("✅ 시뮬레이션 Pro 초기화 완료");
    // 💡 프리셋 로딩이 완전히 끝난 후(then) UI를 그리도록 동기화
    window.loadMasterPresets().then(() => {
        window.updateLockUI();
        window.setupAutoSaveTriggers();
        if(window.currentProcessData.length > 0) window.debouncedRunSimulation();
    });
};

// 💡 [버그 픽스] 누락되었던 날짜 계산 로직 복구
window.calculateWorkDate = function(startDateStr, addDays) {
    if (!startDateStr) return new Date();
    let date = new Date(startDateStr);
    let daysAdded = 0;
    let totalDays = Math.ceil(addDays);
    const applyHolidays = document.getElementById('apply-holidays')?.checked !== false; 

    while (daysAdded < totalDays) {
        date.setDate(date.getDate() + 1);
        if (applyHolidays) {
            if (date.getDay() !== 0 && date.getDay() !== 6) daysAdded++;
        } else {
            daysAdded++;
        }
    }
    return date;
};

window.getWorkingDays = function(startDate, endDate) {
    let start = new Date(startDate);
    let end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
    let days = 0;
    let current = new Date(start);
    while (current <= end) {
        if (typeof window.isWorkDay === 'function') {
            if(window.isWorkDay(current)) days++;
        } else {
            if(current.getDay() !== 0 && current.getDay() !== 6) days++; 
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
};

window.updateLockUI = () => {
    const btnSave = document.getElementById('btn-save-project');
    const btnUnlock = document.getElementById('btn-unlock-project');
    const btnAdd = document.getElementById('btn-add-process');
    const lockIndicator = document.getElementById('lock-indicator');
    
    if(window.isLockedMode) {
        if(btnSave) btnSave.classList.add('hidden');
        if(btnUnlock) btnUnlock.classList.remove('hidden');
        if(btnAdd) btnAdd.classList.add('hidden');
        if(lockIndicator) lockIndicator.classList.remove('hidden');
    } else {
        if(btnSave) btnSave.classList.remove('hidden');
        if(btnUnlock) btnUnlock.classList.add('hidden');
        if(btnAdd) btnAdd.classList.remove('hidden');
        if(lockIndicator) lockIndicator.classList.add('hidden');
    }
    
    window.renderProcessTable();
    window.renderUnitTables();
};

window.unlockCurrentProject = () => {
    if (!window.currentProjectLockPassword) {
        window.isLockedMode = false;
        window.updateLockUI();
        return;
    }
    const pwd = prompt("🔒 이 프로젝트의 잠금 해제 비밀번호를 입력하세요:");
    if (pwd === window.currentProjectLockPassword) {
        window.isLockedMode = false;
        window.showToast("잠금이 해제되었습니다. 이제 자유롭게 수정할 수 있습니다.", "success");
        window.updateLockUI();
    } else if (pwd !== null) {
        window.showToast("비밀번호가 일치하지 않습니다.", "error");
    }
};

// ==========================================
// 2. Web Worker 결과 수신 (UI 업데이트)
// ==========================================
simulationWorker.onmessage = function(e) {
    const { p10, p50, p90, d10, d50, d90, rArr, bArr, tMd } = e.data;
    
    window.latestP50Md = parseFloat(p50.toFixed(1));
    const method = document.getElementById('sim-method')?.value || 'mc';
    const lCost = parseFloat(document.getElementById('labor-cost')?.value) || 300000; 
    const pExp = parseFloat(document.getElementById('planned-expense')?.value) || 0; 
    const stD = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());

    ['p50', 'p10', 'p90'].forEach((k) => { 
        const val = {p50, p10, p90}[k];
        const dur = {p50: d50, p10: d10, p90: d90}[k];
        const dt = window.calculateWorkDate(stD, dur);
        
        if(document.getElementById(`out-${k}-md`)) document.getElementById(`out-${k}-md`).innerText = val.toFixed(1); 
        if(document.getElementById(`out-${k}-date`)) document.getElementById(`out-${k}-date`).innerText = window.getLocalDateStr(dt); 
        if(document.getElementById(`out-${k}-dur`)) document.getElementById(`out-${k}-dur`).innerText = dur; 
        if(document.getElementById(`out-${k}-cost`)) document.getElementById(`out-${k}-cost`).innerText = Math.round(val * lCost + pExp).toLocaleString(); 
    });

    if(document.getElementById('out-p50-calc-md')) document.getElementById('out-p50-calc-md').innerText = p50.toFixed(1); 
    if(document.getElementById('out-calc-labor')) document.getElementById('out-calc-labor').innerText = lCost.toLocaleString(); 
    if(pExp > 0){ 
        if(document.getElementById('out-expense-display')) document.getElementById('out-expense-display').classList.remove('hidden');
        if(document.getElementById('out-calc-expense')) document.getElementById('out-calc-expense').innerText = pExp.toLocaleString(); 
    } else { 
        if(document.getElementById('out-expense-display')) document.getElementById('out-expense-display').classList.add('hidden');
    }
    
    if(document.getElementById('out-ccpm-buffer')) document.getElementById('out-ccpm-buffer').innerText = Math.max(0, d90 - d50);

    const tgD = document.getElementById('target-date')?.value;
    const tEl = document.getElementById('target-date-result');
    const inP = parseInt(document.getElementById('internal-personnel')?.value) || 0;
    
    const sen = parseInt(document.getElementById('p-senior')?.value) || 0;
    const mid = parseInt(document.getElementById('p-mid')?.value) || 0;
    const jun = parseInt(document.getElementById('p-junior')?.value) || 0;
    const rP = sen + mid + jun;
    const pers = rP < 1 ? 1 : rP;
    const sMult = rP < 1 ? 1.0 : (sen*0.8 + mid*1.0 + jun*1.2) / rP;
    const iters = bArr.length;

    if(tgD && stD) {
        let wD = window.getWorkingDays(stD, tgD);
        if(wD > 0) {
            if(tEl) tEl.classList.remove('hidden');
            if(document.getElementById('out-target-days')) document.getElementById('out-target-days').innerText = wD;
            
            let r50 = Math.ceil(p50 / wD), r90 = Math.ceil(p90 / wD); 
            window.latestReqP90 = r90; 
            
            if(document.getElementById('out-req-p50')) document.getElementById('out-req-p50').innerText = r50; 
            if(document.getElementById('out-req-p90')) document.getElementById('out-req-p90').innerText = r90;
            if(document.getElementById('out-int-p50')) document.getElementById('out-int-p50').innerText = Math.min(r50, inP); 
            if(document.getElementById('out-ext-p50')) document.getElementById('out-ext-p50').innerText = Math.max(0, r50 - inP);
            if(document.getElementById('out-int-p90')) document.getElementById('out-int-p90').innerText = Math.min(r90, inP); 
            if(document.getElementById('out-ext-p90')) document.getElementById('out-ext-p90').innerText = Math.max(0, r90 - inP);
            
            let sC = 0;
            for(let i=0; i<iters; i++){ if(Math.ceil((bArr[i] * sMult) / pers) <= wD) sC++; }
            let tP = ((sC / iters) * 100).toFixed(1);
            
            if(document.getElementById('out-target-prob')) document.getElementById('out-target-prob').innerText = tP + '%';
            const pb = document.getElementById('out-target-prob-bar'); 
            if(pb){ 
                pb.style.width = tP + '%';
                pb.className = `h-full rounded-full transition-all duration-700 ease-out ${tP >= 80 ? 'bg-emerald-500' : (tP >= 40 ? 'bg-amber-400' : 'bg-rose-500')}`;
            }
        } else {
            if(tEl) tEl.classList.add('hidden');
        }
    } else {
        if(tEl) tEl.classList.add('hidden');
    }

    let s = [];
    const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value)||1);
    const uncert = method === 'mc' ? (parseFloat(document.getElementById('mc-uncertainty')?.value)||5)/100 : 0.05;
    const diff = parseFloat(document.getElementById('diff-multiplier')?.value)||1.0;
    const rBase = (parseFloat(document.getElementById('rework-rate')?.value)||0)/100;
    const bBase = (parseFloat(document.getElementById('buffer-rate')?.value)||0)/100;
    const curve = (parseFloat(document.getElementById('learning-curve')?.value)||95)/100;
    const lR = Math.max(0.7, Math.pow(curve, Math.log2(qty))); 
    const bM = diff * lR * sMult * (1 + rBase) * (1 + bBase);
    
    window.currentProcessData.forEach(p => { 
        let pt = p.pType || 'md'; 
        if(pt === 'auto'){ 
            (p.unitData || []).forEach(u => { 
                let m = parseFloat(u.m)||0, q = parseFloat(u.q)||0; 
                if(q>0 && m>0){ 
                    let o = tMd - (q*m), lo = method==='mc' ? m*(1-uncert) : parseFloat(u.o)||0, hi = method==='mc' ? m*(1+uncert) : parseFloat(u.p)||0; 
                    s.push({name: `[유닛] ${u.name}`, low: ((o + q*lo)*qty)*bM, high: ((o + q*hi)*qty)*bM}); 
                } 
            }); 
        } else if(pt === 'md'){ 
            let m = parseFloat(p.m)||0, q = parseFloat(p.q)||0; 
            if(q>0 && m>0){ 
                let o = tMd - (q*m), lo = method==='mc' ? m*(1-uncert) : parseFloat(p.o)||0, hi = method==='mc' ? m*(1+uncert) : parseFloat(p.p)||0; 
                s.push({name: `[공정] ${p.name}`, low: ((o + q*lo)*qty)*bM, high: ((o + q*hi)*qty)*bM});
            } 
        } 
    });

    const hs = tMd * qty * diff * sMult * lR;
    const rl = Math.max(0, rBase*(1-uncert)), rh = rBase*(1+uncert);
    const bl = Math.max(0, bBase*(1-uncert)), bh = bBase*(1+uncert);
    s.push({name: "재작업 리스크", low: hs*(1+rl)*(1+bBase), high: hs*(1+rh)*(1+bBase)}); 
    s.push({name: "예비 버퍼", low: hs*(1+rBase)*(1+bl), high: hs*(1+rBase)*(1+bh)});
    
    s.forEach(x => x.spread = x.high - x.low); 
    s.sort((a,b) => a.spread - b.spread); 

    window.latestTorData = { swings: s, base: tMd * qty * bM }; 
    window.latestHistData = { results: rArr, hex: window.masterPresets[document.getElementById('eq-type')?.value]?.hex || '#8b5cf6' };
    
    if(window.renderChartJS) window.renderChartJS(); 
    if(window.renderGanttChart) window.renderGanttChart();
};

window.runSimulation = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value) || 1);
    const curve = (parseFloat(document.getElementById('learning-curve')?.value) || 95) / 100;
    const iters = method === 'mc' ? (parseInt(document.getElementById('mc-iterations')?.value) || 5000) : 5000;
    const uncert = method === 'mc' ? (parseFloat(document.getElementById('mc-uncertainty')?.value) || 5) / 100 : 0.05;
    const diff = parseFloat(document.getElementById('diff-multiplier')?.value) || 1.0;
    const rBase = (parseFloat(document.getElementById('rework-rate')?.value) || 2) / 100;
    const bBase = (parseFloat(document.getElementById('buffer-rate')?.value) || 5) / 100;
    
    const sen = parseInt(document.getElementById('p-senior')?.value) || 0;
    const mid = parseInt(document.getElementById('p-mid')?.value) || 0; 
    const jun = parseInt(document.getElementById('p-junior')?.value) || 0;
    const rP = sen + mid + jun; 
    const pers = rP < 1 ? 1 : rP; 
    const sMult = rP < 1 ? 1.0 : (sen * 0.8 + mid * 1.0 + jun * 1.2) / rP;

    if(document.getElementById('out-total-personnel')) document.getElementById('out-total-personnel').innerText = rP; 
    if(document.getElementById('out-avg-skill')) document.getElementById('out-avg-skill').innerText = sMult.toFixed(2);
    if(document.getElementById('out-iters')) document.getElementById('out-iters').innerText = iters.toLocaleString();

    simulationWorker.postMessage({
        method, qty, curve, iters, uncert, diff, rBase, bBase, pers, sMult,
        processData: window.currentProcessData
    });
};

// 💡 플래그 전용 함수 추가
window.markDirty = () => { 
    if(!window.isLockedMode) window.isProjectDirty = true; 
};

window.debouncedRunSimulation = () => {
    if (window.simTimer) clearTimeout(window.simTimer);
    window.simTimer = setTimeout(window.runSimulation, 300);
};

// ==========================================
// 3. UI 초기화 및 관리
// ==========================================
window.createNewProject = () => {
    if (window.isProjectDirty && !confirm("저장하지 않은 변경사항이 있습니다. 무시하고 새 프로젝트를 생성하시겠습니까?")) return;
    
    window.currentProjectId = null;
    window.isLockedMode = false;
    window.currentProjectLockPassword = null;
    window.updateLockUI();
    
    document.getElementById('project-code').value = '';
    document.getElementById('project-name').value = '';
    document.getElementById('manager-name').value = '';
    document.getElementById('equip-qty').value = '1';
    document.getElementById('learning-curve').value = '95';
    document.getElementById('diff-multiplier').value = '1.0';
    document.getElementById('buffer-rate').value = '5';
    
    document.getElementById('start-date').value = window.getLocalDateStr(new Date());
    document.getElementById('target-date').value = '';
    document.getElementById('shipping-date').value = '';
    
    const typeSel = document.getElementById('eq-type');
    if (typeSel && typeSel.options.length > 0) typeSel.selectedIndex = 0;
    
    window.currentProcessData = [];
    window.isProjectDirty = false;
    window.latestAiResult = null;
    
    window.renderProcessTable();
    window.renderUnitTables();
    
    const bBox = document.getElementById('ai-briefing-text');
    if(bBox) bBox.innerHTML = '<div class="text-center p-4 text-slate-500">AI 분석을 실행해주세요.</div>';
    
    const cBox = document.getElementById('ai-compare-result');
    if(cBox) { cBox.innerHTML = ''; cBox.classList.add('hidden'); }
    
    const sList = document.getElementById('similar-projects-list');
    if(sList) sList.innerHTML = '<div class="text-slate-400 text-xs p-2">비교할 프로젝트가 선택되지 않았습니다.</div>';
    window.selectedSimilarProjects = [];

    window.handleTypeChange(); 
    window.showToast("새 프로젝트 환경이 준비되었습니다.", "success");
};

window.cloneProject = () => {
    if(!window.currentProjectId && window.currentProcessData.length === 0) return window.showToast("복제할 데이터가 없습니다.", "warning");
    
    window.currentProjectId = null; 
    window.isLockedMode = false;
    window.currentProjectLockPassword = null;
    window.updateLockUI();
    
    const nameEl = document.getElementById('project-name');
    if(nameEl && !nameEl.value.includes('복제본')) nameEl.value += ' (복제본)';
    window.isProjectDirty = true;
    window.showToast("복제 모드로 전환되었습니다. '저장'을 누르면 새 프로젝트로 등록됩니다.", "success");
};
window.loadMasterPresets = async () => {
    const sel = document.getElementById('eq-type');
    if (!sel) return;

    try {
        const snap = await getDocs(collection(db, "sim_master_presets"));
        sel.innerHTML = '<option value="">프리셋 선택 안함</option>';
        window.masterPresets = {};
        
        if (!snap.empty) {
            snap.forEach(d => {
                window.masterPresets[d.id] = d.data();
                sel.innerHTML += `<option value="${d.id}">${d.data().label}</option>`;
            });
        } else {
            throw new Error("Empty presets");
        }
    } catch (e) { 
        console.warn("Firestore Presets Load Fallback:", e);
        sel.innerHTML = '<option value="">프리셋 선택 안함</option>';
        window.masterPresets = JSON.parse(JSON.stringify(defaultPresets));
        for (let key in window.masterPresets) {
            sel.innerHTML += `<option value="${key}">${window.masterPresets[key].label}</option>`;
        }
    }

    const defaultPresetId = localStorage.getItem('axms_sim_default_preset');
    if (defaultPresetId && window.masterPresets[defaultPresetId]) {
        sel.value = defaultPresetId;
    }

    window.handleTypeChange();
};

window.handleTypeChange = () => {
    const id = document.getElementById('eq-type')?.value;
    if (!id || !window.masterPresets[id]) {
        window.currentProcessData = [];
        window.renderProcessTable();
        window.renderUnitTables();
        window.debouncedRunSimulation();
        return;
    }
    
    const preset = window.masterPresets[id];
    window.currentProcessData = JSON.parse(JSON.stringify(preset.processData));
    
    if (preset.curve) document.getElementById('learning-curve').value = preset.curve;
    if (preset.diff) document.getElementById('diff-multiplier').value = preset.diff;
    if (preset.buffer) document.getElementById('buffer-rate').value = preset.buffer;
    
    window.handleMethodChange();
};

window.handleMethodChange = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const pHead = document.getElementById('process-thead');
    
    if(pHead) {
        let h = `<tr>
            <th class="px-4 py-3 text-left w-1/3 text-slate-500 font-bold text-xs">공정명</th>
            <th class="px-2 text-center w-32 text-slate-500 font-bold text-xs">유형</th>
            <th class="px-2 text-center w-16 text-slate-500 font-bold text-xs">수량</th>`;
        if(method === 'mc') h += `<th class="px-2 text-center w-20 text-slate-500 font-bold text-xs">단위MD</th><th class="px-4 text-right w-24 text-slate-500 font-bold text-xs">소계</th>`;
        else h += `<th class="px-2 text-center w-16 text-slate-500 font-bold text-xs">최빈</th><th class="px-2 text-center text-emerald-600 w-16 text-xs">낙관</th><th class="px-2 text-center text-rose-600 w-16 text-xs">비관</th>`;
        h += `<th class="px-2 text-center w-24 text-slate-400"><i class="fa-solid fa-gear"></i></th></tr>`;
        pHead.innerHTML = h;
    }

    window.renderProcessTable();
    window.renderUnitTables();
    window.debouncedRunSimulation();
};

window.setupAutoSaveTriggers = () => {
    document.querySelectorAll('.calc-trigger, .auto-save-trigger').forEach(el => {
        el.removeEventListener('input', window.debouncedRunSimulation); 
        el.addEventListener('input', window.debouncedRunSimulation);
        el.removeEventListener('change', window.markDirty); 
        el.addEventListener('change', window.markDirty);
    });
};

window.dragProcessStart = (e, index) => {
    if(window.isLockedMode) { e.preventDefault(); return; }
    window.draggedProcessIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    setTimeout(() => e.target.classList.add('opacity-50'), 0);
};
window.dragProcessEnd = (e) => {
    e.target.classList.remove('opacity-50');
    window.draggedProcessIndex = null;
};
window.dragProcessDrop = (e, dropIndex) => {
    if(window.isLockedMode) return;
    e.preventDefault();
    e.currentTarget.classList.remove('bg-indigo-100');
    const dragIndex = window.draggedProcessIndex;
    if (dragIndex === null || dragIndex === undefined || dragIndex === dropIndex) return;
    
    const movedItem = window.currentProcessData.splice(dragIndex, 1)[0];
    window.currentProcessData.splice(dropIndex, 0, movedItem);
    
    window.draggedProcessIndex = null;
    window.isProjectDirty = true;
    window.renderProcessTable();
    window.renderUnitTables();
    window.debouncedRunSimulation();
};

window.dragUnitStart = (e, pIdx, uIdx) => {
    if(window.isLockedMode) { e.preventDefault(); return; }
    window.draggedUnitInfo = { pIdx, uIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', uIdx);
    setTimeout(() => e.target.classList.add('opacity-50'), 0);
};
window.dragUnitEnd = (e) => {
    e.target.classList.remove('opacity-50');
    window.draggedUnitInfo = null;
};
window.dragUnitDrop = (e, dropPIdx, dropUIdx) => {
    if(window.isLockedMode) return;
    e.preventDefault();
    e.currentTarget.classList.remove('bg-blue-100');
    if (!window.draggedUnitInfo) return;
    const { pIdx: dragPIdx, uIdx: dragUIdx } = window.draggedUnitInfo;
    
    if (dragPIdx !== dropPIdx || dragUIdx === dropUIdx) return; 
    
    const movedItem = window.currentProcessData[dragPIdx].unitData.splice(dragUIdx, 1)[0];
    window.currentProcessData[dropPIdx].unitData.splice(dropUIdx, 0, movedItem);
    
    window.draggedUnitInfo = null;
    window.isProjectDirty = true;
    window.renderUnitTables();
    window.renderProcessTable();
    window.debouncedRunSimulation();
};

window.renderProcessTable = () => {
    const m = document.getElementById('sim-method')?.value || 'mc';
    const tb = document.getElementById('process-tbody');
    if (!tb) return;
    tb.innerHTML = '';
    
    let disabled = window.isLockedMode ? 'disabled' : '';

    window.currentProcessData.forEach((p, i) => {
        let pt = p.pType || 'md';
        const tr = document.createElement('tr');
        tr.className = pt === 'auto' ? "bg-indigo-50/30 hover:bg-indigo-50/50 transition-colors" : "hover:bg-slate-50 transition-colors";
        
        if(!window.isLockedMode) {
            tr.setAttribute('draggable', 'true');
            tr.setAttribute('ondragstart', `window.dragProcessStart(event, ${i})`);
            tr.setAttribute('ondragend', `window.dragProcessEnd(event)`);
            tr.setAttribute('ondragover', `event.preventDefault(); this.classList.add('bg-indigo-100')`);
            tr.setAttribute('ondragleave', `this.classList.remove('bg-indigo-100')`);
            tr.setAttribute('ondrop', `window.dragProcessDrop(event, ${i})`);
        }
        
        let sel = `
        <select onchange="window.updateProcessData(${i},'pType',this.value)" ${disabled} class="w-full text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-1 outline-indigo-500 cursor-pointer">
            <option value="auto" ${pt==='auto'?'selected':''}>⚙️ 유닛</option>
            <option value="md" ${pt==='md'?'selected':''}>🛠️ 수동</option>
            <option value="schedule_elec" ${pt==='schedule_elec'?'selected':''}>⚡ 전장(일정)</option>
            <option value="schedule_ctrl" ${pt==='schedule_ctrl'?'selected':''}>💻 제어(일정)</option>
            <option value="schedule_insp" ${pt==='schedule_insp'?'selected':''}>🔍 검사(일정)</option>
            <option value="schedule_test" ${pt==='schedule_test'?'selected':''}>🚗 시운전</option>
        </select>`;
        
        let act = window.isLockedMode ? 
            `<div class="flex justify-center"><div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>` : 
            `<div class="flex items-center justify-center gap-2">
                <div class="cursor-grab text-slate-400 p-1 hover:text-indigo-500 transition-colors"><i class="fa-solid fa-grip-vertical"></i></div>`;
            
        if(!window.isLockedMode) {
            if(pt === 'auto') act += `<div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>`;
            else act += `<button onclick="window.deleteProcessRow(${i})" class="text-slate-400 hover:text-rose-500 p-1 transition-colors"><i class="fa-solid fa-trash-can"></i></button></div>`;
        }

        let h = '';
        if(pt === 'auto') {
            let um = 0;
            (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0));
            let ed = (parseFloat(p.q)||1) > 0 ? (um / (parseFloat(p.q)||1)).toFixed(1) : 0;
            h = `
                 <td class="px-3 py-1.5"><input value="${p.name}" onchange="window.updateProcessData(${i},'name',this.value)" ${disabled} class="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500"></td>
                 <td class="px-1 py-1.5">${sel}</td>
                 <td class="px-1 py-1.5"><input type="number" value="${p.q}" min="1" onchange="window.updateProcessData(${i},'q',Number(this.value))" ${disabled} class="w-full text-right text-sm font-black text-indigo-700 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>`;
            if(m === 'mc') h += `<td class="px-2 py-1.5 text-right font-bold text-indigo-600"><span id="p-days-${i}">${ed}</span> 일</td><td class="px-4 py-1.5 text-right font-bold text-indigo-900"><span id="p-sub-${i}">${um.toFixed(1)}</span> MD</td>`;
            else h += `<td colspan="3" class="px-4 py-1.5 text-center text-[11px] text-indigo-500">(자동계산)</td>`;
            h += `<td class="px-2 text-center">${act}</td>`;
        } else {
            let iL = pt.startsWith('schedule') ? "일" : "MD";
            let sV = pt.startsWith('schedule') ? "-" : (parseFloat(p.q||0)*parseFloat(p.m||0)).toFixed(1);
            let qI = pt.startsWith('schedule') ? `<div class="text-center text-slate-400">-</div>` : `<input type="number" value="${p.q}" min="0" onchange="window.updateProcessData(${i},'q',Number(this.value))" ${disabled} class="w-full text-right text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger">`;
            
            let sH = "";
            if(m === 'mc') sH = `<td class="px-4 py-1.5 text-right font-bold text-slate-700" id="p-sub-${i}">${sV}</td>`;
            else sH = `
                 <td class="px-1 py-1.5"><input type="number" value="${p.o}" step="0.1" onchange="window.updateProcessData(${i},'o',Number(this.value))" ${disabled} class="w-full text-right text-sm font-bold text-emerald-700 bg-white border border-slate-300 rounded px-2 py-1 outline-emerald-500 calc-trigger"></td>
                 <td class="px-1 py-1.5"><input type="number" value="${p.p}" step="0.1" onchange="window.updateProcessData(${i},'p',Number(this.value))" ${disabled} class="w-full text-right text-sm font-bold text-rose-700 bg-white border border-slate-300 rounded px-2 py-1 outline-rose-500 calc-trigger"></td>`;
            
            h = `
                 <td class="px-3 py-1.5"><input value="${p.name}" onchange="window.updateProcessData(${i},'name',this.value)" ${disabled} class="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500"></td>
                 <td class="px-1 py-1.5">${sel}</td>
                 <td class="px-1 py-1.5">${qI}</td>
                 <td class="px-1 py-1.5 relative">
                    <input type="number" value="${p.m}" step="0.1" onchange="window.updateProcessData(${i},'m',Number(this.value))" ${disabled} class="w-full text-right text-sm text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger pr-6">
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">${iL}</span>
                 </td>
                 ${sH}<td class="px-2 text-center">${act}</td>`;
        }
        tr.innerHTML = h; 
        tb.appendChild(tr);
    });
    window.setupAutoSaveTriggers();
};

window.renderUnitTables = () => {
    const cont = document.getElementById('dynamic-unit-sections');
    if(!cont) return; 
    let h = ''; 
    const m = document.getElementById('sim-method')?.value || 'mc';
    let disabled = window.isLockedMode ? 'disabled' : '';

    window.currentProcessData.forEach((p, pi) => {
        if(p.pType !== 'auto') return; 
        if(!p.unitData || p.unitData.length === 0) p.unitData = [{name:"신규", q:1, m:1, o:0.9, p:1.4}];
        
        let pM = 0, tb = '';
        p.unitData.forEach((u, ui) => {
            pM += (parseFloat(u.q)||0)*(parseFloat(u.m)||0); 
            
            let act = window.isLockedMode ? 
                `<div class="flex justify-center"><div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>` : 
                `<div class="flex items-center justify-center gap-2"><div class="cursor-grab text-slate-400 p-1 hover:text-indigo-500 transition-colors"><i class="fa-solid fa-grip-vertical"></i></div><button onclick="window.deleteUnitRow(${pi},${ui})" class="text-slate-400 hover:text-rose-500 p-1 transition-colors"><i class="fa-solid fa-trash-can"></i></button></div>`;

            let rH = `
                <td class="px-3 py-1.5"><input value="${u.name}" onchange="window.updateUnitData(${pi},${ui},'name',this.value)" ${disabled} class="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500"></td>
                <td class="px-1 py-1.5"><input type="number" value="${u.q}" onchange="window.updateUnitData(${pi},${ui},'q',Number(this.value))" ${disabled} class="w-full text-right text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>`;
            if(m === 'mc') {
                rH += `<td class="px-1 py-1.5"><input type="number" value="${u.m}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'m',Number(this.value))" ${disabled} class="w-full text-right text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>
                       <td class="px-4 py-1.5 text-right font-bold text-blue-900 bg-blue-50/30" id="u-sub-${pi}-${ui}">${(parseFloat(u.q)*parseFloat(u.m)).toFixed(1)}</td>`;
            } else {
                rH += `<td class="px-1 py-1.5"><input type="number" value="${u.m}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'m',Number(this.value))" ${disabled} class="w-full text-right text-sm text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>
                       <td class="px-1 py-1.5 bg-emerald-50/30"><input type="number" value="${u.o}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'o',Number(this.value))" ${disabled} class="w-full text-right text-sm text-emerald-700 bg-white border border-slate-300 rounded px-2 py-1 outline-emerald-500 calc-trigger"></td>
                       <td class="px-1 py-1.5 bg-rose-50/30"><input type="number" value="${u.p}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'p',Number(this.value))" ${disabled} class="w-full text-right text-sm text-rose-700 bg-white border border-slate-300 rounded px-2 py-1 outline-rose-500 calc-trigger"></td>`;
            }
            rH += `<td class="px-2 text-center">${act}</td>`;
            
            let trEvents = !window.isLockedMode ? `draggable="true" ondragstart="window.dragUnitStart(event, ${pi}, ${ui})" ondragend="window.dragUnitEnd(event)" ondragover="event.preventDefault(); this.classList.add('bg-blue-100')" ondragleave="this.classList.remove('bg-blue-100')" ondrop="window.dragUnitDrop(event, ${pi}, ${ui})"` : '';
            tb += `<tr class="hover:bg-blue-50/30 transition-colors" ${trEvents}>${rH}</tr>`;
        });

        let uh = `<tr><th class="px-5 py-3 text-left text-blue-500">유닛명</th><th class="px-2 text-center text-blue-500 w-24">수량</th>`;
        if(m === 'mc') uh += `<th class="px-2 text-center text-blue-500 w-24">단위MD</th><th class="px-4 text-right text-blue-500 w-24">소계</th>`; 
        else uh += `<th class="px-2 text-center text-slate-500 w-16">최빈</th><th class="px-2 text-center text-emerald-600 bg-emerald-50/50 w-16">낙관</th><th class="px-2 text-center text-rose-600 bg-rose-50/50 w-16">비관</th>`;
        uh += `<th class="px-3 text-center text-slate-400 w-16"><i class="fa-solid fa-gear"></i></th></tr>`;
        
        let addBtn = window.isLockedMode ? '' : `<button onclick="window.addUnitRow(${pi})" class="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-xs font-bold transition-colors hover:bg-blue-100">+ 추가</button>`;
        
        h += `<section class="bg-white rounded-3xl border border-blue-200 border-l-8 border-l-blue-500 mb-6 overflow-hidden"><div class="px-8 py-5 border-b border-slate-100 flex justify-between items-center"><h2 class="text-sm font-bold flex items-center gap-2 text-slate-800"><i class="fa-solid fa-cubes text-blue-500"></i> 유닛 - ${p.name}</h2>${addBtn}</div><div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 border-b">${uh}</thead><tbody class="divide-y">${tb}</tbody></table></div><div class="bg-blue-50/30 p-4 text-right border-t"><span class="text-[11px] font-bold text-slate-500">유닛 합계</span><span class="ml-3 text-lg font-black text-blue-700" id="u-sum-${pi}">${pM.toFixed(1)} <span class="text-sm">MD</span></span></div></section>`;
    });
    cont.innerHTML = h;
    window.setupAutoSaveTriggers();
};

window.updateProcessData = (i, f, v) => { 
    if(window.isLockedMode) return;
    window.currentProcessData[i][f] = f==='name'||f==='pType' ? v : parseFloat(v); 
    if(f === 'pType' && v === 'auto' && !window.currentProcessData[i].unitData) {
        window.currentProcessData[i].unitData = [{name:"신규", q:1, m:1.0, o:0.9, p:1.4}]; 
    }
    window.isProjectDirty = true; 
    
    if(f === 'pType') {
        window.renderProcessTable(); window.renderUnitTables(); 
    } else if(f !== 'name') {
        let p = window.currentProcessData[i];
        let subEl = document.getElementById(`p-sub-${i}`);
        if(subEl) subEl.innerText = (parseFloat(p.q||0)*parseFloat(p.m||0)).toFixed(1);
    }
    window.debouncedRunSimulation(); 
};
window.addProcessRow = () => { if(window.isLockedMode) return; window.currentProcessData.push({name:"신규 공정", q:1, m:1.0, pType:'md'}); window.isProjectDirty = true; window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteProcessRow = (i) => { if(window.isLockedMode) return; window.currentProcessData.splice(i,1); window.isProjectDirty = true; window.renderProcessTable(); window.renderUnitTables(); window.debouncedRunSimulation(); };

window.updateUnitData = (pI, uI, f, v) => { 
    if(window.isLockedMode) return;
    window.currentProcessData[pI].unitData[uI][f] = f==='name' ? v : parseFloat(v); 
    window.isProjectDirty = true; 
    
    if(f !== 'name') {
        let u = window.currentProcessData[pI].unitData[uI];
        let m = document.getElementById('sim-method')?.value || 'mc';
        if(m === 'mc') {
            let subEl = document.getElementById(`u-sub-${pI}-${uI}`);
            if(subEl) subEl.innerText = (parseFloat(u.q||0)*parseFloat(u.m||0)).toFixed(1);
        }
        
        let pM = 0;
        window.currentProcessData[pI].unitData.forEach(ud => pM += (parseFloat(ud.q)||0)*(parseFloat(ud.m)||0));
        let sumEl = document.getElementById(`u-sum-${pI}`);
        if(sumEl) sumEl.innerText = pM.toFixed(1);
        
        let pDaysEl = document.getElementById(`p-days-${pI}`);
        let pq = parseFloat(window.currentProcessData[pI].q) || 1;
        if(pDaysEl) pDaysEl.innerText = pq > 0 ? (pM / pq).toFixed(1) : 0;
        let pSubEl = document.getElementById(`p-sub-${pI}`);
        if(pSubEl) pSubEl.innerText = pM.toFixed(1);
    }
    window.debouncedRunSimulation(); 
};
window.addUnitRow = (pI) => { if(window.isLockedMode) return; window.currentProcessData[pI].unitData.push({name:"신규 유닛", q:1, m:1.0, o:0.9, p:1.4}); window.isProjectDirty = true; window.renderUnitTables(); window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteUnitRow = (pI, uI) => { if(window.isLockedMode) return; if(window.currentProcessData[pI].unitData.length <= 1) return; window.currentProcessData[pI].unitData.splice(uI,1); window.isProjectDirty = true; window.renderUnitTables(); window.renderProcessTable(); window.debouncedRunSimulation(); };

window.applyP90Personnel = () => {
    if(window.isLockedMode) return window.showToast('이 프로젝트는 잠겨있어 수정할 수 없습니다.', 'warning');
    if(window.latestReqP90 && window.latestReqP90 > 0) {
        document.getElementById('p-senior').value = 0;
        document.getElementById('p-mid').value = window.latestReqP90;
        document.getElementById('p-junior').value = 0;
        window.isProjectDirty = true;
        window.showToast(`P90 기준 안전 인원(${window.latestReqP90}명)이 중급 숙련도로 자동 세팅되었습니다.`);
        window.debouncedRunSimulation();
    } else {
        window.showToast('목표 완료일이 설정되지 않았거나 계산이 필요하지 않습니다.', 'error');
    }
};

window.switchTab = (tab) => {
    window.currentTab = tab;
    document.getElementById('tab-hist').className = tab === 'hist' ? "flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200 transition-all uppercase tracking-wider" : "flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all border border-transparent uppercase tracking-wider";
    document.getElementById('tab-tor').className = tab === 'tor' ? "flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200 transition-all uppercase tracking-wider" : "flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all border border-transparent uppercase tracking-wider";
    window.renderChartJS();
};

window.renderChartJS = () => {
    const canvas = document.getElementById('chart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.theChart) window.theChart.destroy();
    
    Chart.defaults.font.family = "'Pretendard', sans-serif";

    if (window.currentTab === 'hist' && window.latestHistData) {
        const res = window.latestHistData.results;
        if(!res || res.length === 0) return;
        
        const min = res[0], max = res[res.length-1];
        const bins = new Array(30).fill(0), lbls = new Array(30).fill('');
        const bs = (max - min) / 30 || 1;
        
        res.forEach(v => { let idx = Math.floor((v - min) / bs); if(idx >= 30) idx = 29; bins[idx]++; });
        for(let i=0; i<30; i++) lbls[i] = (min + i * bs).toFixed(0);

        window.theChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: lbls, datasets: [{ data: bins, backgroundColor: window.latestHistData.hex, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: {size: 9} } } } }
        });
    } else if (window.currentTab === 'tor' && window.latestTorData) {
        const {swings, base} = window.latestTorData;
        const lbls = swings.map(s => s.name);
        const dH = swings.map(s => [base, s.high]);
        const dL = swings.map(s => [s.low, base]);

        window.theChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: lbls,
                datasets: [
                    { label: '지연 리스크', data: dH, backgroundColor: '#f43f5e', borderRadius: 3 },
                    { label: '단축 기회', data: dL, backgroundColor: '#10b981', borderRadius: 3 }
                ]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end' } }, scales: { x: { min: Math.min(...swings.map(s=>s.low))*0.95 }, y: { grid: { display: false } } } }
        });
    }
};

window.renderGanttChart = () => {
    const container = document.getElementById('gantt-container');
    if (!container) return;
    const startStr = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());
    
    let totalDays = 0;
    window.currentProcessData.forEach(p => {
        let pt = p.pType || 'md';
        if(pt === 'auto') { let um = 0; (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0)); totalDays += um / (parseFloat(p.q)||1); } 
        else { totalDays += parseFloat(p.m) || 0; }
    });
    if (totalDays <= 0) totalDays = 1;

    let html = '<div class="relative flex flex-col gap-3 py-2">';
    let offset = 0;
    window.currentProcessData.forEach(p => {
        let pt = p.pType || 'md'; let days = 0;
        if(pt === 'auto') { let um = 0; (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0)); days = um / (parseFloat(p.q)||1); } 
        else { days = parseFloat(p.m) || 0; }
        if (days <= 0) return;
        
        let startD = window.calculateWorkDate(startStr, Math.floor(offset));
        let endD = window.calculateWorkDate(startStr, Math.floor(offset + days - 0.0001));
        const widthPct = (days / totalDays) * 100;
        const leftPct = (offset / totalDays) * 100;
        
        let sStr = window.getLocalDateStr(startD).substring(5).replace('-','/'); 
        let eStr = window.getLocalDateStr(endD).substring(5).replace('-','/');
        
        let curColorCls = pt === 'auto' ? 'bg-amber-400' : (pt.startsWith('schedule') ? 'bg-emerald-400' : 'bg-amber-500');
        let iconHtml = pt === 'auto' ? '<i class="fa-solid fa-gears text-slate-400 mr-1"></i>' : (pt.startsWith('schedule') ? '<i class="fa-regular fa-calendar text-emerald-500 mr-1"></i>' : '<i class="fa-solid fa-wrench text-amber-600 mr-1"></i>');

        html += `
            <div class="flex items-center text-xs group z-10 w-full mb-3">
                <div class="w-48 font-bold truncate pr-4 text-right text-slate-700">${iconHtml} ${p.name}</div>
                <div class="flex-1 relative h-7 bg-slate-100 rounded-full border border-slate-200 mx-4 shadow-inner">
                    <div class="absolute top-0 h-full rounded-full ${curColorCls} flex items-center justify-center px-2 shadow-sm gantt-bar" 
                         style="left: ${leftPct}%; width: ${widthPct}%; min-width: 80px;">
                        <span class="text-white text-[10px] font-bold truncate">${days.toFixed(1)}일 (${p.q}명)</span>
                    </div>
                </div>
                <div class="w-24 text-right text-slate-400 font-mono text-[11px] font-semibold tracking-tighter shrink-0">${sStr} ~ ${eStr}</div>
            </div>
        `;
        offset += days;
    });
    html += '</div>';
    container.innerHTML = html;
};

// ==========================================
// 💡 직접 호출 AI 연동 로직 (프론트엔드 통신)
// ==========================================
window.toggleAiApiPanel = (force) => {
    const panel = document.getElementById('ai-api-panel-wrap');
    if(!panel) return;
    if(typeof force === 'boolean') {
        if(force) panel.classList.remove('hidden'); else panel.classList.add('hidden');
    } else {
        panel.classList.toggle('hidden');
    }
    if(!panel.classList.contains('hidden')) {
        document.getElementById('ai-api-key').value = localStorage.getItem('axms_sim_api_key') || '';
    }
};

window.saveAiApiSettings = () => {
    const key = document.getElementById('ai-api-key').value.trim();
    localStorage.setItem('axms_sim_api_key', key);
    window.showToast("AI API 키가 로컬에 안전하게 저장되었습니다.");
    window.toggleAiApiPanel(false);
};

window.generateGroqInsight = async () => {
    if (!window.latestP50Md) return window.showToast("먼저 시뮬레이션을 실행해주세요.", "error");
    
    const apiKey = localStorage.getItem('axms_sim_api_key');
    if (!apiKey) {
        window.toggleAiApiPanel(true);
        return window.showToast("Groq API 키를 먼저 입력해주세요.", "warning");
    }

    window.showToast("AI 심층 분석을 요청 중입니다...", "success");
    const bBox = document.getElementById('ai-briefing-text');
    if(bBox) bBox.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin mr-2 text-indigo-400"></i>AI가 프로젝트 데이터를 분석하고 있습니다...</div>';

    try {
        const processStr = window.currentProcessData.map(p => `${p.name}(${p.m}MD)`).join(', ');
        const promptStr = `당신은 제조 설비 프로젝트 PMO(Project Management Office) 분석 전문가입니다.
        현재 시뮬레이션 중인 프로젝트 데이터는 다음과 같습니다.
        - P50 예상 공수: ${window.latestP50Md}MD
        - 총 투입 인원: ${document.getElementById('out-total-personnel')?.innerText}명
        - 세부 공정: ${processStr}

        이 데이터를 바탕으로 매우 전문적이고 통찰력 있는 리스크 분석 결과를 도출하세요.
        반드시 다음 JSON 형식으로만 응답해야 합니다:
        {
            "summary": "현재 시뮬레이션 상태에 대한 종합 요약 (2~3문장)",
            "riskScore": 15, 
            "coreRisks": [
                { "phase": "위험이 예상되는 공정명", "risk": "구체적인 리스크 요인", "mitigation": "실질적인 완화 조치" }
            ],
            "efficiency": "인원 및 공수 배분의 효율성 평가",
            "conclusion": "최종 PMO 권고사항"
        }`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: promptStr }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error("AI 서버 에러");
        
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        window.latestAiResult = result; 
        
        if(bBox) {
            bBox.innerHTML = `
                <div class="space-y-4 animate-fade-in">
                    <div class="flex justify-between items-start">
                        <p class="text-sm leading-relaxed font-medium flex-1 pr-4">${result.summary}</p>
                        <div class="shrink-0 text-center bg-slate-900 p-2 rounded-xl border border-slate-700 w-20">
                            <span class="text-[10px] text-slate-400 block mb-1">리스크 지수</span>
                            <span class="text-2xl font-black ${result.riskScore > 50 ? 'text-rose-500' : 'text-emerald-400'}">${result.riskScore}</span>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <h4 class="text-xs font-bold text-indigo-300 border-b border-slate-700 pb-1">⚠️ 핵심 리스크 및 조치계획</h4>
                        ${result.coreRisks.map(r => `
                            <div class="bg-slate-950/50 p-3 rounded-xl border border-slate-700/50">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-bold">${r.phase}</span>
                                    <span class="text-xs font-bold text-slate-200">${r.risk}</span>
                                </div>
                                <div class="text-[11px] text-emerald-400 font-medium pl-1"><i class="fa-solid fa-arrow-turn-up rotate-90 mr-1 opacity-70"></i>${r.mitigation}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div class="bg-slate-800 p-3 rounded-xl border border-slate-600">
                            <span class="text-[10px] text-slate-400 block mb-1">효율성 평가</span>
                            <span class="text-[11px] font-medium text-slate-200 leading-relaxed">${result.efficiency}</span>
                        </div>
                        <div class="bg-slate-800 p-3 rounded-xl border border-slate-600">
                            <span class="text-[10px] text-slate-400 block mb-1">PMO 최종 권고</span>
                            <span class="text-[11px] font-medium text-slate-200 leading-relaxed">${result.conclusion}</span>
                        </div>
                    </div>
                </div>`;
        }
    } catch (e) {
        window.showToast("AI 분석 모듈 연결 실패 (API Key 확인 요망)", "error");
        if(bBox) bBox.innerText = "분석 실패: " + e.message;
    }
};

window.openSimilarProjectModal = async () => {
    const modal = document.getElementById('similar-project-modal');
    const tbody = document.getElementById('similar-project-tbody');
    if(!modal || !tbody) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6"><i class="fa-solid fa-spinner fa-spin text-xl text-slate-400"></i> 데이터 불러오는 중...</td></tr>';

    try {
        const snap = await getDocs(query(collection(db, "projects_status"), where("status", "==", "completed")));
        window.completedProjects = [];
        snap.forEach(d => window.completedProjects.push({id: d.id, ...d.data()}));

        if(window.completedProjects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 font-bold text-slate-500">완료(출하)된 프로젝트 데이터가 없습니다.</td></tr>';
            return;
        }

        window.completedProjects.sort((a,b) => b.updatedAt - a.updatedAt);
        
        tbody.innerHTML = window.completedProjects.map(p => `
            <tr class="hover:bg-slate-50 border-b border-slate-100 cursor-pointer" onclick="const cb = this.querySelector('input'); cb.checked = !cb.checked; window.updateSelectedSimilarProjects();">
                <td class="p-3 text-center" onclick="event.stopPropagation()"><input type="checkbox" value="${p.id}" class="sim-proj-cb accent-indigo-600 w-4 h-4 rounded cursor-pointer" onchange="window.updateSelectedSimilarProjects()"></td>
                <td class="p-3 font-bold text-indigo-700 text-center w-32">[${p.code || '-'}]</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[250px]">${p.name}</td>
                <td class="p-3 text-center font-black text-emerald-600 w-28">${(parseFloat(p.finalMd)||0).toFixed(1)} MD</td>
            </tr>
        `).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-rose-500 font-bold">데이터를 불러오지 못했습니다.</td></tr>';
    }
};

window.closeSimilarProjectModal = () => {
    const modal = document.getElementById('similar-project-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.updateSelectedSimilarProjects = () => {
    const cbs = document.querySelectorAll('.sim-proj-cb:checked');
    if(cbs.length > 3) {
        window.showToast("최대 3개까지만 선택 가능합니다.", "warning");
        event.target.checked = false; 
    }
};

window.applySimilarProjects = () => {
    const cbs = document.querySelectorAll('.sim-proj-cb:checked');
    if(cbs.length === 0) return window.showToast("비교할 프로젝트를 최소 1개 선택해주세요.", "warning");

    window.selectedSimilarProjects = Array.from(cbs).map(cb => window.completedProjects.find(p => p.id === cb.value));
    
    const listContainer = document.getElementById('similar-projects-list');
    if(listContainer) {
        listContainer.innerHTML = window.selectedSimilarProjects.map(p => `
            <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-between items-center">
                <div class="truncate pr-2">
                    <span class="text-[10px] font-bold text-indigo-600">[${p.code}]</span>
                    <span class="text-xs font-bold text-slate-700 ml-1">${p.name}</span>
                </div>
                <span class="text-xs font-black text-emerald-600 shrink-0 ml-2 border-l pl-2">${(parseFloat(p.finalMd)||0).toFixed(1)} MD</span>
            </div>
        `).join('');
    }
    window.closeSimilarProjectModal();
};

window.generateAiComparison = async () => {
    if(!window.selectedSimilarProjects || window.selectedSimilarProjects.length === 0) return window.showToast("비교할 과거 프로젝트를 먼저 선택하세요.", "warning");
    
    const apiKey = localStorage.getItem('axms_sim_api_key');
    if (!apiKey) {
        window.toggleAiApiPanel(true);
        return window.showToast("Groq API 키를 먼저 입력해주세요.", "warning");
    }

    window.showToast("AI가 과거 데이터와 비교 분석을 수행 중입니다...", "success");
    const cBox = document.getElementById('ai-compare-result');
    if(cBox) { cBox.classList.remove('hidden'); cBox.innerHTML = '<div class="text-center p-6"><i class="fa-solid fa-spinner fa-spin mr-2 text-indigo-400"></i>과거 데이터 기반 정밀 비교 분석 중...</div>'; }

    try {
        const pastDataStr = window.selectedSimilarProjects.map(p => `[${p.name}] 실제투입공수: ${(parseFloat(p.finalMd)||0).toFixed(1)}MD, 실제투입인원: ${p.totPers||0}명, 실제출하일: ${p.d_shipEn||'미상'}, 예정출하일: ${p.d_shipEst||'미상'}`).join('\n');
        
        const promptStr = `당신은 제조 설비 데이터 분석가입니다.
        현재 시뮬레이션 중인 프로젝트의 예상 데이터는 다음과 같습니다.
        - 예상 공수: ${window.latestP50Md}MD
        - 예상 투입 인원: ${document.getElementById('out-total-personnel')?.innerText || 0}명
        - 목표 조립 완료일: ${document.getElementById('target-date')?.value || '미정'}
        
        비교 대상인 과거 완료된 유사 프로젝트들의 실적 데이터는 다음과 같습니다:
        ${pastDataStr}

        현재 프로젝트의 예상 데이터가 과거 실적에 비추어 볼 때 적절한지 분석하세요.
        반드시 다음 JSON 형식으로만 응답해야 합니다:
        {
            "verdict": "적정 / 과소평가 / 과대평가 중 택1",
            "md_analysis": "총 공수(MD) 관점의 비교 분석 (2문장 내외)",
            "personnel_analysis": "투입 인원 관점의 비교 분석 (2문장 내외)",
            "schedule_analysis": "일정(납기) 관점의 비교 분석 (2문장 내외)",
            "coreRisks": [
                { "risk": "가장 핵심적인 리스크 요인", "mitigation": "실질적 조치 계획" }
            ],
            "recommendation": "오차를 줄이기 위한 실질적 조언"
        }`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: promptStr }], temperature: 0.5, response_format: { type: "json_object" } })
        });

        if (!response.ok) throw new Error("AI 서버 에러");
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        let verdictColor = result.verdict.includes('적정') ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-rose-400 bg-rose-400/10 border-rose-400/30';

        let coreRisksHtml = '';
        if(result.coreRisks && result.coreRisks.length > 0) {
            coreRisksHtml = `
                <div class="mt-4 space-y-2">
                    <h4 class="text-sm font-black text-rose-400 border-b border-slate-700 pb-1 flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation"></i> 핵심 리스크 및 조치계획</h4>
                    ${result.coreRisks.map(r => `
                        <div class="bg-rose-950/30 p-3 rounded-xl border border-rose-900/50">
                            <div class="text-sm font-bold text-rose-300 mb-1">${r.risk}</div>
                            <div class="text-xs font-medium text-emerald-400 pl-2 border-l-2 border-emerald-500/50">${r.mitigation}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if(cBox) {
            cBox.innerHTML = `
                <div class="animate-fade-in">
                    <div class="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                        <h4 class="text-sm font-bold text-indigo-300"><i class="fa-solid fa-scale-balanced mr-1"></i> 과거 실적 대비 타당성 검증</h4>
                        <span class="px-3 py-1 rounded-full border text-xs font-black ${verdictColor}">${result.verdict}</span>
                    </div>
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <span class="text-[10px] font-bold text-indigo-400 block mb-1">총 공수 (MD) 비교</span>
                                <p class="text-[11px] font-medium text-slate-300 leading-relaxed">${result.md_analysis}</p>
                            </div>
                            <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <span class="text-[10px] font-bold text-teal-400 block mb-1">투입 인원 분석</span>
                                <p class="text-[11px] font-medium text-slate-300 leading-relaxed">${result.personnel_analysis}</p>
                            </div>
                            <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <span class="text-[10px] font-bold text-amber-400 block mb-1">일정(납기) 분석</span>
                                <p class="text-[11px] font-medium text-slate-300 leading-relaxed">${result.schedule_analysis}</p>
                            </div>
                        </div>
                        ${coreRisksHtml}
                        <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-600 mt-2">
                            <span class="text-[10px] font-bold text-emerald-400 block mb-1"><i class="fa-solid fa-lightbulb mr-1"></i>최종 개선 제언</span>
                            <p class="text-[11px] font-medium text-slate-200 leading-relaxed">${result.recommendation}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        window.showToast("비교 분석 실패", "error");
        if(cBox) cBox.innerText = "분석 중 오류 발생";
    }
};

window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
    if(window.isLockedMode) return;
    const val = inputEl.value.trim().toLowerCase(); 
    let dropdown = document.getElementById('pjt-autocomplete-dropdown');
    
    if(!dropdown) { 
        dropdown = document.createElement('ul'); 
        dropdown.id = 'pjt-autocomplete-dropdown'; 
        dropdown.className = 'absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-full custom-scrollbar py-1 mt-1'; 
        inputEl.parentNode.appendChild(dropdown); 
    }
    
    if(val.length < 1) { 
        dropdown.classList.add('hidden'); 
        return; 
    }
    
    let matches = [];
    for (let i = 0; i < (window.pjtCodeMasterList || []).length; i++) {
        let p = window.pjtCodeMasterList[i];
        if (isNameSearch) { 
            if (p.name.toLowerCase().includes(val) || window.matchString(val, p.name)) matches.push(p); 
        } else { 
            if (p.code.toLowerCase().includes(val) || window.matchString(val, p.code)) matches.push(p); 
        }
    }
    
    if(matches.length > 0) {
        dropdown.classList.remove('hidden');
        let dropHtml = '';
        matches.forEach(function(m) {
            let safeName = m.name.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            dropHtml += `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors" onmousedown="window.selectAutocomplete('${m.code}', '${safeName}', '${inputEl.id}', '${targetId1}')"><span class="text-indigo-600">[${m.code}]</span> ${m.name}</li>`;
        }); 
        dropdown.innerHTML = dropHtml;
    } else { 
        dropdown.classList.add('hidden'); 
    }
};

window.selectAutocomplete = function(code, name, sourceId, targetId1) { 
    if(window.isLockedMode) return;
    const sourceEl = document.getElementById(sourceId); 
    const t1 = document.getElementById(targetId1); 
    
    if (sourceId === 'project-code') { 
        if (sourceEl) sourceEl.value = code; 
        if (t1) t1.value = name; 
    } else { 
        if (sourceEl) sourceEl.value = name; 
        if (t1) t1.value = code; 
    } 
    const drop = document.getElementById('pjt-autocomplete-dropdown'); 
    if (drop) drop.classList.add('hidden'); 
};

document.addEventListener('click', function(e) {
    const d = document.getElementById('pjt-autocomplete-dropdown'); 
    if (d && !d.classList.contains('hidden') && !e.target.closest('#pjt-autocomplete-dropdown') && !e.target.closest('input[oninput*="showAutocomplete"]')) {
        d.classList.add('hidden');
    }
});
window.loadMasterPresets = async () => {
    const sel = document.getElementById('eq-type');
    if (!sel) return;

    try {
        const snap = await getDocs(collection(db, "sim_master_presets"));
        sel.innerHTML = '<option value="">프리셋 선택 안함</option>';
        window.masterPresets = {};
        
        if (!snap.empty) {
            snap.forEach(d => {
                window.masterPresets[d.id] = d.data();
                sel.innerHTML += `<option value="${d.id}">${d.data().label}</option>`;
            });
        } else {
            throw new Error("Empty presets");
        }
    } catch (e) { 
        console.warn("Firestore Presets Load Fallback:", e);
        sel.innerHTML = '<option value="">프리셋 선택 안함</option>';
        window.masterPresets = JSON.parse(JSON.stringify(defaultPresets));
        for (let key in window.masterPresets) {
            sel.innerHTML += `<option value="${key}">${window.masterPresets[key].label}</option>`;
        }
    }

    const defaultPresetId = localStorage.getItem('axms_sim_default_preset');
    if (defaultPresetId && window.masterPresets[defaultPresetId]) {
        sel.value = defaultPresetId;
    }

    window.handleTypeChange();
};

window.handleTypeChange = () => {
    const id = document.getElementById('eq-type')?.value;
    if (!id || !window.masterPresets[id]) {
        window.currentProcessData = [];
        window.renderProcessTable();
        window.renderUnitTables();
        window.debouncedRunSimulation();
        return;
    }
    
    const preset = window.masterPresets[id];
    window.currentProcessData = JSON.parse(JSON.stringify(preset.processData));
    
    if (preset.curve) document.getElementById('learning-curve').value = preset.curve;
    if (preset.diff) document.getElementById('diff-multiplier').value = preset.diff;
    if (preset.buffer) document.getElementById('buffer-rate').value = preset.buffer;
    
    window.handleMethodChange();
};

window.handleMethodChange = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const pHead = document.getElementById('process-thead');
    
    if(pHead) {
        let h = `<tr>
            <th class="px-4 py-3 text-left w-1/3 text-slate-500 font-bold text-xs">공정명</th>
            <th class="px-2 text-center w-32 text-slate-500 font-bold text-xs">유형</th>
            <th class="px-2 text-center w-16 text-slate-500 font-bold text-xs">수량</th>`;
        if(method === 'mc') h += `<th class="px-2 text-center w-20 text-slate-500 font-bold text-xs">단위MD</th><th class="px-4 text-right w-24 text-slate-500 font-bold text-xs">소계</th>`;
        else h += `<th class="px-2 text-center w-16 text-slate-500 font-bold text-xs">최빈</th><th class="px-2 text-center text-emerald-600 w-16 text-xs">낙관</th><th class="px-2 text-center text-rose-600 w-16 text-xs">비관</th>`;
        h += `<th class="px-2 text-center w-24 text-slate-400"><i class="fa-solid fa-gear"></i></th></tr>`;
        pHead.innerHTML = h;
    }

    window.renderProcessTable();
    window.renderUnitTables();
    window.debouncedRunSimulation();
};

window.setupAutoSaveTriggers = () => {
    const triggers = document.querySelectorAll('.calc-trigger');
    triggers.forEach(el => {
        el.removeEventListener('input', window.debouncedRunSimulation);
        el.addEventListener('input', window.debouncedRunSimulation);
    });
};

window.dragProcessStart = (e, index) => {
    if(window.isLockedMode) { e.preventDefault(); return; }
    window.draggedProcessIndex = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
    setTimeout(() => e.target.classList.add('opacity-50'), 0);
};
window.dragProcessEnd = (e) => {
    e.target.classList.remove('opacity-50');
    window.draggedProcessIndex = null;
};
window.dragProcessDrop = (e, dropIndex) => {
    if(window.isLockedMode) return;
    e.preventDefault();
    e.currentTarget.classList.remove('bg-indigo-100');
    const dragIndex = window.draggedProcessIndex;
    if (dragIndex === null || dragIndex === undefined || dragIndex === dropIndex) return;
    
    const movedItem = window.currentProcessData.splice(dragIndex, 1)[0];
    window.currentProcessData.splice(dropIndex, 0, movedItem);
    
    window.draggedProcessIndex = null;
    window.isProjectDirty = true;
    window.renderProcessTable();
    window.renderUnitTables();
    window.debouncedRunSimulation();
};

window.dragUnitStart = (e, pIdx, uIdx) => {
    if(window.isLockedMode) { e.preventDefault(); return; }
    window.draggedUnitInfo = { pIdx, uIdx };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', uIdx);
    setTimeout(() => e.target.classList.add('opacity-50'), 0);
};
window.dragUnitEnd = (e) => {
    e.target.classList.remove('opacity-50');
    window.draggedUnitInfo = null;
};
window.dragUnitDrop = (e, dropPIdx, dropUIdx) => {
    if(window.isLockedMode) return;
    e.preventDefault();
    e.currentTarget.classList.remove('bg-blue-100');
    if (!window.draggedUnitInfo) return;
    const { pIdx: dragPIdx, uIdx: dragUIdx } = window.draggedUnitInfo;
    
    if (dragPIdx !== dropPIdx || dragUIdx === dropUIdx) return; 
    
    const movedItem = window.currentProcessData[dragPIdx].unitData.splice(dragUIdx, 1)[0];
    window.currentProcessData[dropPIdx].unitData.splice(dropUIdx, 0, movedItem);
    
    window.draggedUnitInfo = null;
    window.isProjectDirty = true;
    window.renderUnitTables();
    window.renderProcessTable();
    window.debouncedRunSimulation();
};

window.renderProcessTable = () => {
    const m = document.getElementById('sim-method')?.value || 'mc';
    const tb = document.getElementById('process-tbody');
    if (!tb) return;
    tb.innerHTML = '';
    
    let disabled = window.isLockedMode ? 'disabled' : '';

    window.currentProcessData.forEach((p, i) => {
        let pt = p.pType || 'md';
        const tr = document.createElement('tr');
        tr.className = pt === 'auto' ? "bg-indigo-50/30 hover:bg-indigo-50/50 transition-colors" : "hover:bg-slate-50 transition-colors";
        
        if(!window.isLockedMode) {
            tr.setAttribute('draggable', 'true');
            tr.setAttribute('ondragstart', `window.dragProcessStart(event, ${i})`);
            tr.setAttribute('ondragend', `window.dragProcessEnd(event)`);
            tr.setAttribute('ondragover', `event.preventDefault(); this.classList.add('bg-indigo-100')`);
            tr.setAttribute('ondragleave', `this.classList.remove('bg-indigo-100')`);
            tr.setAttribute('ondrop', `window.dragProcessDrop(event, ${i})`);
        }
        
        let sel = `
        <select onchange="window.updateProcessData(${i},'pType',this.value)" ${disabled} class="w-full text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-1 outline-indigo-500 cursor-pointer">
            <option value="auto" ${pt==='auto'?'selected':''}>⚙️ 유닛</option>
            <option value="md" ${pt==='md'?'selected':''}>🛠️ 수동</option>
            <option value="schedule_elec" ${pt==='schedule_elec'?'selected':''}>⚡ 전장(일정)</option>
            <option value="schedule_ctrl" ${pt==='schedule_ctrl'?'selected':''}>💻 제어(일정)</option>
            <option value="schedule_insp" ${pt==='schedule_insp'?'selected':''}>🔍 검사(일정)</option>
            <option value="schedule_test" ${pt==='schedule_test'?'selected':''}>🚗 시운전</option>
        </select>`;
        
        let act = window.isLockedMode ? 
            `<div class="flex justify-center"><div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>` : 
            `<div class="flex items-center justify-center gap-2">
                <div class="cursor-grab text-slate-400 p-1 hover:text-indigo-500 transition-colors"><i class="fa-solid fa-grip-vertical"></i></div>`;
            
        if(!window.isLockedMode) {
            if(pt === 'auto') act += `<div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>`;
            else act += `<button onclick="window.deleteProcessRow(${i})" class="text-slate-400 hover:text-rose-500 p-1 transition-colors"><i class="fa-solid fa-trash-can"></i></button></div>`;
        }

        let h = '';
        if(pt === 'auto') {
            let um = 0;
            (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0));
            let ed = (parseFloat(p.q)||1) > 0 ? (um / (parseFloat(p.q)||1)).toFixed(1) : 0;
            h = `
                 <td class="px-3 py-1.5"><input value="${p.name}" onchange="window.updateProcessData(${i},'name',this.value)" ${disabled} class="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500"></td>
                 <td class="px-1 py-1.5">${sel}</td>
                 <td class="px-1 py-1.5"><input type="number" value="${p.q}" min="1" onchange="window.updateProcessData(${i},'q',Number(this.value))" ${disabled} class="w-full text-right text-sm font-black text-indigo-700 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>`;
            if(m === 'mc') h += `<td class="px-2 py-1.5 text-right font-bold text-indigo-600"><span id="p-days-${i}">${ed}</span> 일</td><td class="px-4 py-1.5 text-right font-bold text-indigo-900"><span id="p-sub-${i}">${um.toFixed(1)}</span> MD</td>`;
            else h += `<td colspan="3" class="px-4 py-1.5 text-center text-[11px] text-indigo-500">(자동계산)</td>`;
            h += `<td class="px-2 text-center">${act}</td>`;
        } else {
            let iL = pt.startsWith('schedule') ? "일" : "MD";
            let sV = pt.startsWith('schedule') ? "-" : (parseFloat(p.q||0)*parseFloat(p.m||0)).toFixed(1);
            let qI = pt.startsWith('schedule') ? `<div class="text-center text-slate-400">-</div>` : `<input type="number" value="${p.q}" min="0" onchange="window.updateProcessData(${i},'q',Number(this.value))" ${disabled} class="w-full text-right text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger">`;
            
            let sH = "";
            if(m === 'mc') sH = `<td class="px-4 py-1.5 text-right font-bold text-slate-700" id="p-sub-${i}">${sV}</td>`;
            else sH = `
                 <td class="px-1 py-1.5"><input type="number" value="${p.o}" step="0.1" onchange="window.updateProcessData(${i},'o',Number(this.value))" ${disabled} class="w-full text-right text-sm font-bold text-emerald-700 bg-white border border-slate-300 rounded px-2 py-1 outline-emerald-500 calc-trigger"></td>
                 <td class="px-1 py-1.5"><input type="number" value="${p.p}" step="0.1" onchange="window.updateProcessData(${i},'p',Number(this.value))" ${disabled} class="w-full text-right text-sm font-bold text-rose-700 bg-white border border-slate-300 rounded px-2 py-1 outline-rose-500 calc-trigger"></td>`;
            
            h = `
                 <td class="px-3 py-1.5"><input value="${p.name}" onchange="window.updateProcessData(${i},'name',this.value)" ${disabled} class="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500"></td>
                 <td class="px-1 py-1.5">${sel}</td>
                 <td class="px-1 py-1.5">${qI}</td>
                 <td class="px-1 py-1.5 relative">
                    <input type="number" value="${p.m}" step="0.1" onchange="window.updateProcessData(${i},'m',Number(this.value))" ${disabled} class="w-full text-right text-sm text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger pr-6">
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">${iL}</span>
                 </td>
                 ${sH}<td class="px-2 text-center">${act}</td>`;
        }
        tr.innerHTML = h; 
        tb.appendChild(tr);
    });
    window.setupAutoSaveTriggers();
};

window.renderUnitTables = () => {
    const cont = document.getElementById('dynamic-unit-sections');
    if(!cont) return; 
    let h = ''; 
    const m = document.getElementById('sim-method')?.value || 'mc';
    let disabled = window.isLockedMode ? 'disabled' : '';

    window.currentProcessData.forEach((p, pi) => {
        if(p.pType !== 'auto') return; 
        if(!p.unitData || p.unitData.length === 0) p.unitData = [{name:"신규", q:1, m:1, o:0.9, p:1.4}];
        
        let pM = 0, tb = '';
        p.unitData.forEach((u, ui) => {
            pM += (parseFloat(u.q)||0)*(parseFloat(u.m)||0); 
            
            let act = window.isLockedMode ? 
                `<div class="flex justify-center"><div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>` : 
                `<div class="flex items-center justify-center gap-2"><div class="cursor-grab text-slate-400 p-1 hover:text-indigo-500 transition-colors"><i class="fa-solid fa-grip-vertical"></i></div><button onclick="window.deleteUnitRow(${pi},${ui})" class="text-slate-400 hover:text-rose-500 p-1 transition-colors"><i class="fa-solid fa-trash-can"></i></button></div>`;

            let rH = `
                <td class="px-3 py-1.5"><input value="${u.name}" onchange="window.updateUnitData(${pi},${ui},'name',this.value)" ${disabled} class="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500"></td>
                <td class="px-1 py-1.5"><input type="number" value="${u.q}" onchange="window.updateUnitData(${pi},${ui},'q',Number(this.value))" ${disabled} class="w-full text-right text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>`;
            if(m === 'mc') {
                rH += `<td class="px-1 py-1.5"><input type="number" value="${u.m}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'m',Number(this.value))" ${disabled} class="w-full text-right text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>
                       <td class="px-4 py-1.5 text-right font-bold text-blue-900 bg-blue-50/30" id="u-sub-${pi}-${ui}">${(parseFloat(u.q)*parseFloat(u.m)).toFixed(1)}</td>`;
            } else {
                rH += `<td class="px-1 py-1.5"><input type="number" value="${u.m}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'m',Number(this.value))" ${disabled} class="w-full text-right text-sm text-slate-800 bg-white border border-slate-300 rounded px-2 py-1 outline-indigo-500 calc-trigger"></td>
                       <td class="px-1 py-1.5 bg-emerald-50/30"><input type="number" value="${u.o}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'o',Number(this.value))" ${disabled} class="w-full text-right text-sm text-emerald-700 bg-white border border-slate-300 rounded px-2 py-1 outline-emerald-500 calc-trigger"></td>
                       <td class="px-1 py-1.5 bg-rose-50/30"><input type="number" value="${u.p}" step="0.1" onchange="window.updateUnitData(${pi},${ui},'p',Number(this.value))" ${disabled} class="w-full text-right text-sm text-rose-700 bg-white border border-slate-300 rounded px-2 py-1 outline-rose-500 calc-trigger"></td>`;
            }
            rH += `<td class="px-2 text-center">${act}</td>`;
            
            let trEvents = !window.isLockedMode ? `draggable="true" ondragstart="window.dragUnitStart(event, ${pi}, ${ui})" ondragend="window.dragUnitEnd(event)" ondragover="event.preventDefault(); this.classList.add('bg-blue-100')" ondragleave="this.classList.remove('bg-blue-100')" ondrop="window.dragUnitDrop(event, ${pi}, ${ui})"` : '';
            tb += `<tr class="hover:bg-blue-50/30 transition-colors" ${trEvents}>${rH}</tr>`;
        });

        let uh = `<tr><th class="px-5 py-3 text-left text-blue-500">유닛명</th><th class="px-2 text-center text-blue-500 w-24">수량</th>`;
        if(m === 'mc') uh += `<th class="px-2 text-center text-blue-500 w-24">단위MD</th><th class="px-4 text-right text-blue-500 w-24">소계</th>`; 
        else uh += `<th class="px-2 text-center text-slate-500 w-16">최빈</th><th class="px-2 text-center text-emerald-600 bg-emerald-50/50 w-16">낙관</th><th class="px-2 text-center text-rose-600 bg-rose-50/50 w-16">비관</th>`;
        uh += `<th class="px-3 text-center text-slate-400 w-16"><i class="fa-solid fa-gear"></i></th></tr>`;
        
        let addBtn = window.isLockedMode ? '' : `<button onclick="window.addUnitRow(${pi})" class="bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-xs font-bold transition-colors hover:bg-blue-100">+ 추가</button>`;
        
        h += `<section class="bg-white rounded-3xl border border-blue-200 border-l-8 border-l-blue-500 mb-6 overflow-hidden"><div class="px-8 py-5 border-b border-slate-100 flex justify-between items-center"><h2 class="text-sm font-bold flex items-center gap-2 text-slate-800"><i class="fa-solid fa-cubes text-blue-500"></i> 유닛 - ${p.name}</h2>${addBtn}</div><div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 border-b">${uh}</thead><tbody class="divide-y">${tb}</tbody></table></div><div class="bg-blue-50/30 p-4 text-right border-t"><span class="text-[11px] font-bold text-slate-500">유닛 합계</span><span class="ml-3 text-lg font-black text-blue-700" id="u-sum-${pi}">${pM.toFixed(1)} <span class="text-sm">MD</span></span></div></section>`;
    });
    cont.innerHTML = h;
    window.setupAutoSaveTriggers();
};

window.updateProcessData = (i, f, v) => { 
    if(window.isLockedMode) return;
    window.currentProcessData[i][f] = f==='name'||f==='pType' ? v : parseFloat(v); 
    if(f === 'pType' && v === 'auto' && !window.currentProcessData[i].unitData) {
        window.currentProcessData[i].unitData = [{name:"신규", q:1, m:1.0, o:0.9, p:1.4}]; 
    }
    window.isProjectDirty = true; 
    
    if(f === 'pType') {
        window.renderProcessTable(); window.renderUnitTables(); 
    } else if(f !== 'name') {
        let p = window.currentProcessData[i];
        let subEl = document.getElementById(`p-sub-${i}`);
        if(subEl) subEl.innerText = (parseFloat(p.q||0)*parseFloat(p.m||0)).toFixed(1);
    }
    window.debouncedRunSimulation(); 
};
window.addProcessRow = () => { if(window.isLockedMode) return; window.currentProcessData.push({name:"신규 공정", q:1, m:1.0, pType:'md'}); window.isProjectDirty = true; window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteProcessRow = (i) => { if(window.isLockedMode) return; window.currentProcessData.splice(i,1); window.isProjectDirty = true; window.renderProcessTable(); window.renderUnitTables(); window.debouncedRunSimulation(); };

window.updateUnitData = (pI, uI, f, v) => { 
    if(window.isLockedMode) return;
    window.currentProcessData[pI].unitData[uI][f] = f==='name' ? v : parseFloat(v); 
    window.isProjectDirty = true; 
    
    if(f !== 'name') {
        let u = window.currentProcessData[pI].unitData[uI];
        let m = document.getElementById('sim-method')?.value || 'mc';
        if(m === 'mc') {
            let subEl = document.getElementById(`u-sub-${pI}-${uI}`);
            if(subEl) subEl.innerText = (parseFloat(u.q||0)*parseFloat(u.m||0)).toFixed(1);
        }
        
        let pM = 0;
        window.currentProcessData[pI].unitData.forEach(ud => pM += (parseFloat(ud.q)||0)*(parseFloat(ud.m)||0));
        let sumEl = document.getElementById(`u-sum-${pI}`);
        if(sumEl) sumEl.innerText = pM.toFixed(1);
        
        let pDaysEl = document.getElementById(`p-days-${pI}`);
        let pq = parseFloat(window.currentProcessData[pI].q) || 1;
        if(pDaysEl) pDaysEl.innerText = pq > 0 ? (pM / pq).toFixed(1) : 0;
        let pSubEl = document.getElementById(`p-sub-${pI}`);
        if(pSubEl) pSubEl.innerText = pM.toFixed(1);
    }
    window.debouncedRunSimulation(); 
};
window.addUnitRow = (pI) => { if(window.isLockedMode) return; window.currentProcessData[pI].unitData.push({name:"신규 유닛", q:1, m:1.0, o:0.9, p:1.4}); window.isProjectDirty = true; window.renderUnitTables(); window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteUnitRow = (pI, uI) => { if(window.isLockedMode) return; if(window.currentProcessData[pI].unitData.length <= 1) return; window.currentProcessData[pI].unitData.splice(uI,1); window.isProjectDirty = true; window.renderUnitTables(); window.renderProcessTable(); window.debouncedRunSimulation(); };

window.applyP90Personnel = () => {
    if(window.isLockedMode) return window.showToast('이 프로젝트는 잠겨있어 수정할 수 없습니다.', 'warning');
    if(window.latestReqP90 && window.latestReqP90 > 0) {
        document.getElementById('p-senior').value = 0;
        document.getElementById('p-mid').value = window.latestReqP90;
        document.getElementById('p-junior').value = 0;
        window.isProjectDirty = true;
        window.showToast(`P90 기준 안전 인원(${window.latestReqP90}명)이 중급 숙련도로 자동 세팅되었습니다.`);
        window.debouncedRunSimulation();
    } else {
        window.showToast('목표 완료일이 설정되지 않았거나 계산이 필요하지 않습니다.', 'error');
    }
};

window.switchTab = (tab) => {
    window.currentTab = tab;
    document.getElementById('tab-hist').className = tab === 'hist' ? "flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200 transition-all uppercase tracking-wider" : "flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all border border-transparent uppercase tracking-wider";
    document.getElementById('tab-tor').className = tab === 'tor' ? "flex-1 py-2.5 text-xs font-extrabold rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200 transition-all uppercase tracking-wider" : "flex-1 py-2.5 text-xs font-bold rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all border border-transparent uppercase tracking-wider";
    window.renderChartJS();
};

// ==========================================
// 💡 대시보드 모달 (분석 결과 뷰어) 로직
// ==========================================
window.openDashboardModal = async () => {
    const modal = document.getElementById('dashboard-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    if (window.renderSimulationDashboard) window.renderSimulationDashboard();
};

window.closeDashboardModal = () => {
    const modal = document.getElementById('dashboard-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.renderSimulationDashboard = async () => {
    const tbody = document.getElementById('accuracy-tbody');
    if (!tbody) return;
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-500 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>데이터를 불러오는 중입니다...</td></tr>';
        
        // PJT 현황판에서 '완료(출하)'된 프로젝트 데이터 가져오기
        const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const snap = await getDocs(query(collection(db, "projects_status"), where("status", "==", "completed")));
        
        let html = '';
        snap.forEach(doc => {
            const d = doc.data();
            const eMd = parseFloat(d.estMd)||0;
            const fMd = parseFloat(d.finalMd)||0;
            const err = eMd > 0 ? (((fMd - eMd) / eMd) * 100).toFixed(1) : 0;
            
            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="p-3 text-center font-bold text-slate-500">${d.code||'-'}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[200px]" title="${d.name}">${d.name}</td>
                <td class="p-3 text-center text-sky-600 font-bold">${eMd}</td>
                <td class="p-3 text-center text-indigo-600 font-black">${fMd}</td>
                <td class="p-3 text-center font-bold ${err > 0 ? 'text-rose-500' : 'text-emerald-500'}">${err}%</td>
                <td class="p-3 text-center text-slate-500">${d.d_shipEst||'-'}</td>
                <td class="p-3 text-center text-indigo-600 font-bold">${d.d_shipEn||'-'}</td>
            </tr>`;
        });
        
        if (html === '') {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-400 font-bold">비교할 완료(출하) 데이터가 없습니다.</td></tr>';
        } else {
            tbody.innerHTML = html;
        }
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-rose-500 font-bold">데이터 로드 중 오류가 발생했습니다.</td></tr>';
    }
};

// ==========================================
// 5. 차트 (ChartJS) 및 간트 (Gantt)
// ==========================================
window.renderChartJS = () => {
    const canvas = document.getElementById('chart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (window.theChart) window.theChart.destroy();
    
    Chart.defaults.font.family = "'Pretendard', sans-serif";

    if (window.currentTab === 'hist' && window.latestHistData) {
        const res = window.latestHistData.results;
        if(!res || res.length === 0) return;
        
        const min = res[0], max = res[res.length-1];
        const bins = new Array(30).fill(0), lbls = new Array(30).fill('');
        const bs = (max - min) / 30 || 1;
        
        res.forEach(v => { let idx = Math.floor((v - min) / bs); if(idx >= 30) idx = 29; bins[idx]++; });
        for(let i=0; i<30; i++) lbls[i] = (min + i * bs).toFixed(0);

        window.theChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: lbls, datasets: [{ data: bins, backgroundColor: window.latestHistData.hex, borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: {size: 9} } } } }
        });
    } else if (window.currentTab === 'tor' && window.latestTorData) {
        const {swings, base} = window.latestTorData;
        const lbls = swings.map(s => s.name);
        const dH = swings.map(s => [base, s.high]);
        const dL = swings.map(s => [s.low, base]);

        window.theChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: lbls,
                datasets: [
                    { label: '지연 리스크', data: dH, backgroundColor: '#f43f5e', borderRadius: 3 },
                    { label: '단축 기회', data: dL, backgroundColor: '#10b981', borderRadius: 3 }
                ]
            },
            options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end' } }, scales: { x: { min: Math.min(...swings.map(s=>s.low))*0.95 }, y: { grid: { display: false } } } }
        });
    }
};

window.renderGanttChart = () => {
    const container = document.getElementById('gantt-container');
    if (!container) return;
    const startStr = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());
    
    let totalDays = 0;
    window.currentProcessData.forEach(p => {
        let pt = p.pType || 'md';
        if(pt === 'auto') { let um = 0; (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0)); totalDays += um / (parseFloat(p.q)||1); } 
        else { totalDays += parseFloat(p.m) || 0; }
    });
    if (totalDays <= 0) totalDays = 1;

    let html = '<div class="relative flex flex-col gap-3 py-2">';
    let offset = 0;
    window.currentProcessData.forEach(p => {
        let pt = p.pType || 'md'; let days = 0;
        if(pt === 'auto') { let um = 0; (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0)); days = um / (parseFloat(p.q)||1); } 
        else { days = parseFloat(p.m) || 0; }
        if (days <= 0) return;
        
        let startD = window.calculateWorkDate(startStr, Math.floor(offset));
        let endD = window.calculateWorkDate(startStr, Math.floor(offset + days - 0.0001));
        const widthPct = (days / totalDays) * 100;
        const leftPct = (offset / totalDays) * 100;
        
        let sStr = window.getLocalDateStr(startD).substring(5).replace('-','/'); 
        let eStr = window.getLocalDateStr(endD).substring(5).replace('-','/');
        
        let curColorCls = pt === 'auto' ? 'bg-amber-400' : (pt.startsWith('schedule') ? 'bg-emerald-400' : 'bg-amber-500');
        let iconHtml = pt === 'auto' ? '<i class="fa-solid fa-gears text-slate-400 mr-1"></i>' : (pt.startsWith('schedule') ? '<i class="fa-regular fa-calendar text-emerald-500 mr-1"></i>' : '<i class="fa-solid fa-wrench text-amber-600 mr-1"></i>');

        html += `
            <div class="flex items-center text-xs group z-10 w-full mb-3">
                <div class="w-48 font-bold truncate pr-4 text-right text-slate-700">${iconHtml} ${p.name}</div>
                <div class="flex-1 relative h-7 bg-slate-100 rounded-full border border-slate-200 mx-4 shadow-inner">
                    <div class="absolute top-0 h-full rounded-full ${curColorCls} flex items-center justify-center px-2 shadow-sm gantt-bar" 
                         style="left: ${leftPct}%; width: ${widthPct}%; min-width: 80px;">
                        <span class="text-white text-[10px] font-bold truncate">${days.toFixed(1)}일 (${p.q}명)</span>
                    </div>
                </div>
                <div class="w-24 text-right text-slate-400 font-mono text-[11px] font-semibold tracking-tighter shrink-0">${sStr} ~ ${eStr}</div>
            </div>
        `;
        offset += days;
    });
    html += '</div>';
    container.innerHTML = html;
};

// ==========================================
// 6. 💡 직접 호출 AI 연동 로직 (프론트엔드 통신)
// ==========================================
window.toggleAiApiPanel = (force) => {
    const panel = document.getElementById('ai-api-panel-wrap');
    if(!panel) return;
    if(typeof force === 'boolean') {
        if(force) panel.classList.remove('hidden'); else panel.classList.add('hidden');
    } else {
        panel.classList.toggle('hidden');
    }
    if(!panel.classList.contains('hidden')) {
        document.getElementById('ai-api-key').value = localStorage.getItem('axms_sim_api_key') || '';
    }
};

window.saveAiApiSettings = () => {
    const key = document.getElementById('ai-api-key').value.trim();
    localStorage.setItem('axms_sim_api_key', key);
    window.showToast("AI API 키가 로컬에 안전하게 저장되었습니다.");
    window.toggleAiApiPanel(false);
};

window.generateGroqInsight = async () => {
    if (!window.latestP50Md) return window.showToast("먼저 시뮬레이션을 실행해주세요.", "error");
    
    const apiKey = localStorage.getItem('axms_sim_api_key');
    if (!apiKey) {
        window.toggleAiApiPanel(true);
        return window.showToast("Groq API 키를 먼저 입력해주세요.", "warning");
    }

    window.showToast("AI 심층 분석을 요청 중입니다...", "success");
    const bBox = document.getElementById('ai-briefing-text');
    if(bBox) bBox.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin mr-2 text-indigo-400"></i>AI가 프로젝트 데이터를 분석하고 있습니다...</div>';

    try {
        const processStr = window.currentProcessData.map(p => `${p.name}(${p.m}MD)`).join(', ');
        const promptStr = `당신은 제조 설비 프로젝트 PMO(Project Management Office) 분석 전문가입니다.
        현재 시뮬레이션 중인 프로젝트 데이터는 다음과 같습니다.
        - P50 예상 공수: ${window.latestP50Md}MD
        - 총 투입 인원: ${document.getElementById('out-total-personnel')?.innerText}명
        - 세부 공정: ${processStr}

        이 데이터를 바탕으로 매우 전문적이고 통찰력 있는 리스크 분석 결과를 도출하세요.
        반드시 다음 JSON 형식으로만 응답해야 합니다:
        {
            "summary": "현재 시뮬레이션 상태에 대한 종합 요약 (2~3문장)",
            "riskScore": 15, 
            "coreRisks": [
                { "phase": "위험이 예상되는 공정명", "risk": "구체적인 리스크 요인", "mitigation": "실질적인 완화 조치" }
            ],
            "efficiency": "인원 및 공수 배분의 효율성 평가",
            "conclusion": "최종 PMO 권고사항"
        }`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: promptStr }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error("AI 서버 에러");
        
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);
        window.latestAiResult = result; 
        
        if(bBox) {
            bBox.innerHTML = `
                <div class="space-y-4 animate-fade-in">
                    <div class="flex justify-between items-start">
                        <p class="text-sm leading-relaxed font-medium flex-1 pr-4">${result.summary}</p>
                        <div class="shrink-0 text-center bg-slate-900 p-2 rounded-xl border border-slate-700 w-20">
                            <span class="text-[10px] text-slate-400 block mb-1">리스크 지수</span>
                            <span class="text-2xl font-black ${result.riskScore > 50 ? 'text-rose-500' : 'text-emerald-400'}">${result.riskScore}</span>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <h4 class="text-xs font-bold text-indigo-300 border-b border-slate-700 pb-1">⚠️ 핵심 리스크 및 조치계획</h4>
                        ${result.coreRisks.map(r => `
                            <div class="bg-slate-950/50 p-3 rounded-xl border border-slate-700/50">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded font-bold">${r.phase}</span>
                                    <span class="text-xs font-bold text-slate-200">${r.risk}</span>
                                </div>
                                <div class="text-[11px] text-emerald-400 font-medium pl-1"><i class="fa-solid fa-arrow-turn-up rotate-90 mr-1 opacity-70"></i>${r.mitigation}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                        <div class="bg-slate-800 p-3 rounded-xl border border-slate-600">
                            <span class="text-[10px] text-slate-400 block mb-1">효율성 평가</span>
                            <span class="text-[11px] font-medium text-slate-200 leading-relaxed">${result.efficiency}</span>
                        </div>
                        <div class="bg-slate-800 p-3 rounded-xl border border-slate-600">
                            <span class="text-[10px] text-slate-400 block mb-1">PMO 최종 권고</span>
                            <span class="text-[11px] font-medium text-slate-200 leading-relaxed">${result.conclusion}</span>
                        </div>
                    </div>
                </div>`;
        }
    } catch (e) {
        window.showToast("AI 분석 모듈 연결 실패 (API Key 확인 요망)", "error");
        if(bBox) bBox.innerText = "분석 실패: " + e.message;
    }
};

window.openSimilarProjectModal = async () => {
    const modal = document.getElementById('similar-project-modal');
    const tbody = document.getElementById('similar-project-tbody');
    if(!modal || !tbody) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6"><i class="fa-solid fa-spinner fa-spin text-xl text-slate-400"></i> 데이터 불러오는 중...</td></tr>';

    try {
        const snap = await getDocs(query(collection(db, "projects_status"), where("status", "==", "completed")));
        window.completedProjects = [];
        snap.forEach(d => window.completedProjects.push({id: d.id, ...d.data()}));

        if(window.completedProjects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 font-bold text-slate-500">완료(출하)된 프로젝트 데이터가 없습니다.</td></tr>';
            return;
        }

        window.completedProjects.sort((a,b) => b.updatedAt - a.updatedAt);
        
        tbody.innerHTML = window.completedProjects.map(p => `
            <tr class="hover:bg-slate-50 border-b border-slate-100 cursor-pointer" onclick="const cb = this.querySelector('input'); cb.checked = !cb.checked; window.updateSelectedSimilarProjects();">
                <td class="p-3 text-center" onclick="event.stopPropagation()"><input type="checkbox" value="${p.id}" class="sim-proj-cb accent-indigo-600 w-4 h-4 rounded cursor-pointer" onchange="window.updateSelectedSimilarProjects()"></td>
                <td class="p-3 font-bold text-indigo-700 text-center w-32">[${p.code || '-'}]</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[250px]">${p.name}</td>
                <td class="p-3 text-center font-black text-emerald-600 w-28">${(parseFloat(p.finalMd)||0).toFixed(1)} MD</td>
            </tr>
        `).join('');
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-rose-500 font-bold">데이터를 불러오지 못했습니다.</td></tr>';
    }
};

window.closeSimilarProjectModal = () => {
    const modal = document.getElementById('similar-project-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.updateSelectedSimilarProjects = () => {
    const cbs = document.querySelectorAll('.sim-proj-cb:checked');
    if(cbs.length > 3) {
        window.showToast("최대 3개까지만 선택 가능합니다.", "warning");
        event.target.checked = false; 
    }
};

window.applySimilarProjects = () => {
    const cbs = document.querySelectorAll('.sim-proj-cb:checked');
    if(cbs.length === 0) return window.showToast("비교할 프로젝트를 최소 1개 선택해주세요.", "warning");

    window.selectedSimilarProjects = Array.from(cbs).map(cb => window.completedProjects.find(p => p.id === cb.value));
    
    const listContainer = document.getElementById('similar-projects-list');
    if(listContainer) {
        listContainer.innerHTML = window.selectedSimilarProjects.map(p => `
            <div class="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-between items-center">
                <div class="truncate pr-2">
                    <span class="text-[10px] font-bold text-indigo-600">[${p.code}]</span>
                    <span class="text-xs font-bold text-slate-700 ml-1">${p.name}</span>
                </div>
                <span class="text-xs font-black text-emerald-600 shrink-0 ml-2 border-l pl-2">${(parseFloat(p.finalMd)||0).toFixed(1)} MD</span>
            </div>
        `).join('');
    }
    window.closeSimilarProjectModal();
};

window.generateAiComparison = async () => {
    if(!window.selectedSimilarProjects || window.selectedSimilarProjects.length === 0) return window.showToast("비교할 과거 프로젝트를 먼저 선택하세요.", "warning");
    
    const apiKey = localStorage.getItem('axms_sim_api_key');
    if (!apiKey) {
        window.toggleAiApiPanel(true);
        return window.showToast("Groq API 키를 먼저 입력해주세요.", "warning");
    }

    window.showToast("AI가 과거 데이터와 비교 분석을 수행 중입니다...", "success");
    const cBox = document.getElementById('ai-compare-result');
    if(cBox) { cBox.classList.remove('hidden'); cBox.innerHTML = '<div class="text-center p-6"><i class="fa-solid fa-spinner fa-spin mr-2 text-indigo-400"></i>과거 데이터 기반 정밀 비교 분석 중...</div>'; }

    try {
        const pastDataStr = window.selectedSimilarProjects.map(p => `[${p.name}] 실제투입공수: ${(parseFloat(p.finalMd)||0).toFixed(1)}MD, 실제투입인원: ${p.totPers||0}명, 실제출하일: ${p.d_shipEn||'미상'}, 예정출하일: ${p.d_shipEst||'미상'}`).join('\n');
        
        const promptStr = `당신은 제조 설비 데이터 분석가입니다.
        현재 시뮬레이션 중인 프로젝트의 예상 데이터는 다음과 같습니다.
        - 예상 공수: ${window.latestP50Md}MD
        - 예상 투입 인원: ${document.getElementById('out-total-personnel')?.innerText || 0}명
        - 목표 조립 완료일: ${document.getElementById('target-date')?.value || '미정'}
        
        비교 대상인 과거 완료된 유사 프로젝트들의 실적 데이터는 다음과 같습니다:
        ${pastDataStr}

        현재 프로젝트의 예상 데이터가 과거 실적에 비추어 볼 때 적절한지 분석하세요.
        반드시 다음 JSON 형식으로만 응답해야 합니다:
        {
            "verdict": "적정 / 과소평가 / 과대평가 중 택1",
            "md_analysis": "총 공수(MD) 관점의 비교 분석 (2문장 내외)",
            "personnel_analysis": "투입 인원 관점의 비교 분석 (2문장 내외)",
            "schedule_analysis": "일정(납기) 관점의 비교 분석 (2문장 내외)",
            "coreRisks": [
                { "risk": "가장 핵심적인 리스크 요인", "mitigation": "실질적 조치 계획" }
            ],
            "recommendation": "오차를 줄이기 위한 실질적 조언"
        }`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: promptStr }], temperature: 0.5, response_format: { type: "json_object" } })
        });

        if (!response.ok) throw new Error("AI 서버 에러");
        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        let verdictColor = result.verdict.includes('적정') ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' : 'text-rose-400 bg-rose-400/10 border-rose-400/30';

        let coreRisksHtml = '';
        if(result.coreRisks && result.coreRisks.length > 0) {
            coreRisksHtml = `
                <div class="mt-4 space-y-2">
                    <h4 class="text-sm font-black text-rose-400 border-b border-slate-700 pb-1 flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation"></i> 핵심 리스크 및 조치계획</h4>
                    ${result.coreRisks.map(r => `
                        <div class="bg-rose-950/30 p-3 rounded-xl border border-rose-900/50">
                            <div class="text-sm font-bold text-rose-300 mb-1">${r.risk}</div>
                            <div class="text-xs font-medium text-emerald-400 pl-2 border-l-2 border-emerald-500/50">${r.mitigation}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if(cBox) {
            cBox.innerHTML = `
                <div class="animate-fade-in">
                    <div class="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                        <h4 class="text-sm font-bold text-indigo-300"><i class="fa-solid fa-scale-balanced mr-1"></i> 과거 실적 대비 타당성 검증</h4>
                        <span class="px-3 py-1 rounded-full border text-xs font-black ${verdictColor}">${result.verdict}</span>
                    </div>
                    <div class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <span class="text-[10px] font-bold text-indigo-400 block mb-1">총 공수 (MD) 비교</span>
                                <p class="text-[11px] font-medium text-slate-300 leading-relaxed">${result.md_analysis}</p>
                            </div>
                            <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <span class="text-[10px] font-bold text-teal-400 block mb-1">투입 인원 분석</span>
                                <p class="text-[11px] font-medium text-slate-300 leading-relaxed">${result.personnel_analysis}</p>
                            </div>
                            <div class="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
                                <span class="text-[10px] font-bold text-amber-400 block mb-1">일정(납기) 분석</span>
                                <p class="text-[11px] font-medium text-slate-300 leading-relaxed">${result.schedule_analysis}</p>
                            </div>
                        </div>
                        ${coreRisksHtml}
                        <div class="bg-slate-800/80 p-4 rounded-xl border border-slate-600 mt-2">
                            <span class="text-[10px] font-bold text-emerald-400 block mb-1"><i class="fa-solid fa-lightbulb mr-1"></i>최종 개선 제언</span>
                            <p class="text-[11px] font-medium text-slate-200 leading-relaxed">${result.recommendation}</p>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        window.showToast("비교 분석 실패", "error");
        if(cBox) cBox.innerText = "분석 중 오류 발생";
    }
};

window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
    if(window.isLockedMode) return;
    const val = inputEl.value.trim().toLowerCase(); 
    let dropdown = document.getElementById('pjt-autocomplete-dropdown');
    
    if(!dropdown) { 
        dropdown = document.createElement('ul'); 
        dropdown.id = 'pjt-autocomplete-dropdown'; 
        dropdown.className = 'absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-full custom-scrollbar py-1 mt-1'; 
        inputEl.parentNode.appendChild(dropdown); 
    }
    
    if(val.length < 1) { 
        dropdown.classList.add('hidden'); 
        return; 
    }
    
    let matches = [];
    for (let i = 0; i < (window.pjtCodeMasterList || []).length; i++) {
        let p = window.pjtCodeMasterList[i];
        if (isNameSearch) { 
            if (p.name.toLowerCase().includes(val) || window.matchString(val, p.name)) matches.push(p); 
        } else { 
            if (p.code.toLowerCase().includes(val) || window.matchString(val, p.code)) matches.push(p); 
        }
    }
    
    if(matches.length > 0) {
        dropdown.classList.remove('hidden');
        let dropHtml = '';
        matches.forEach(function(m) {
            let safeName = m.name.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            dropHtml += `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors" onmousedown="window.selectAutocomplete('${m.code}', '${safeName}', '${inputEl.id}', '${targetId1}')"><span class="text-indigo-600">[${m.code}]</span> ${m.name}</li>`;
        }); 
        dropdown.innerHTML = dropHtml;
    } else { 
        dropdown.classList.add('hidden'); 
    }
};

window.selectAutocomplete = function(code, name, sourceId, targetId1) { 
    if(window.isLockedMode) return;
    const sourceEl = document.getElementById(sourceId); 
    const t1 = document.getElementById(targetId1); 
    
    if (sourceId === 'project-code') { 
        if (sourceEl) sourceEl.value = code; 
        if (t1) t1.value = name; 
    } else { 
        if (sourceEl) sourceEl.value = name; 
        if (t1) t1.value = code; 
    } 
    const drop = document.getElementById('pjt-autocomplete-dropdown'); 
    if (drop) drop.classList.add('hidden'); 
};

document.addEventListener('click', function(e) {
    const d = document.getElementById('pjt-autocomplete-dropdown'); 
    if (d && !d.classList.contains('hidden') && !e.target.closest('#pjt-autocomplete-dropdown') && !e.target.closest('input[oninput*="showAutocomplete"]')) {
        d.classList.add('hidden');
    }
});


// ============================================================================
// 📊 [엑셀 양식 구역] 엑셀 다운로드 관련 코드 
// ============================================================================
window.exportToExcel = async () => {
    if (typeof ExcelJS === 'undefined') return window.showToast("라이브러리 로딩 중입니다.", "warning");
    window.showToast("공수 보고서 엑셀 파일을 생성 중입니다...");

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('시뮬레이션_보고서', { views: [{ showGridLines: false }] });

    ws.columns = [
        { width: 35 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 15 }, { width: 15 }
    ];

    const setBg = (cell, color) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; };
    const setFont = (cell, opts) => { cell.font = { name: '맑은 고딕', ...opts }; };
    const setBorder = (cell) => { cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; };

    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = '📊 제조 설비 공수 시뮬레이터 종합 보고서';
    setFont(titleCell, { size: 16, bold: true, color: { argb: 'FF0F172A' } });
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `출력 일시: ${new Date().toLocaleString()}`;
    setFont(ws.getCell('A2'), { color: { argb: 'FF64748B' } });
    ws.addRow([]); 

    const pCode = document.getElementById('project-code')?.value || '-';
    const pName = document.getElementById('project-name')?.value || '무제';
    const mgr = document.getElementById('manager-name')?.value || '미정';
    const p50 = document.getElementById('out-p50-md')?.innerText || '0';
    const p10 = document.getElementById('out-p10-md')?.innerText || '0';
    const p90 = document.getElementById('out-p90-md')?.innerText || '0';
    const d50 = document.getElementById('out-p50-date')?.innerText || '-';
    const d10 = document.getElementById('out-p10-date')?.innerText || '-';
    const d90 = document.getElementById('out-p90-date')?.innerText || '-';
    const cost50 = document.getElementById('out-p50-cost')?.innerText || '0';
    const cost10 = document.getElementById('out-p10-cost')?.innerText || '0';
    const cost90 = document.getElementById('out-p90-cost')?.innerText || '0';
    const tPers = document.getElementById('out-total-personnel')?.innerText || '0';
    const sMult = document.getElementById('out-avg-skill')?.innerText || '1.00';
    const pSen = document.getElementById('p-senior')?.value || '0';
    const pMid = document.getElementById('p-mid')?.value || '0';
    const pJun = document.getElementById('p-junior')?.value || '0';
    const lCost = document.getElementById('labor-cost')?.value || '300000';
    const pExp = document.getElementById('planned-expense')?.value || '0';
    const tgD = document.getElementById('target-date')?.value || '-';
    const spD = document.getElementById('shipping-date')?.value || '-';

    ws.addRow(['■ 1. 프로젝트 정보 및 설정']).font = { bold: true, size: 12 };
    let r5 = ws.addRow(['프로젝트 코드', pCode, '프로젝트 명', pName]);
    let r6 = ws.addRow(['담당자', mgr, '투입 인원 및 숙련도', `총 ${tPers}명 (고급 ${pSen}명, 중급 ${pMid}명, 초급 ${pJun}명) / 평균 보정치: ${sMult}배`]);
    let r7 = ws.addRow(['1MD 기준 인건비', `${Number(lCost).toLocaleString()} 원`, '예상 기타 경비', `${Number(pExp).toLocaleString()} 원`]);
    [r5, r6, r7].forEach(r => {
        setBg(r.getCell(1), 'FFF1F5F9'); setFont(r.getCell(1), { bold: true });
        setBg(r.getCell(3), 'FFF1F5F9'); setFont(r.getCell(3), { bold: true });
        r.eachCell(c => setBorder(c));
    });
    ws.mergeCells('D6:F6'); 
    ws.addRow([]);

    ws.addRow(['■ 2. 분석 요약 결과']).font = { bold: true, size: 12 };
    let r10 = ws.addRow(['목표 조립 완료일', tgD, '출하 예정일', spD]);
    setBg(r10.getCell(1), 'FFF1F5F9'); setFont(r10.getCell(1), { bold: true });
    setBg(r10.getCell(3), 'FFF1F5F9'); setFont(r10.getCell(3), { bold: true });
    r10.eachCell(c => setBorder(c));

    const h1 = ws.addRow(['구분', '산출 공수(MD)', '조립 완료 예정일', '예상 총 비용(인건비+경비)']);
    h1.eachCell(c => { setBg(c, 'FF334155'); setFont(c, { bold: true, color: { argb: 'FFFFFFFF' } }); setBorder(c); c.alignment = {horizontal:'center'}; });

    let r12 = ws.addRow(['P10 (낙관적 10%)', p10, d10, cost10 + ' 원']);
    let r13 = ws.addRow(['P50 (가장 유력)', p50, d50, cost50 + ' 원']);
    let r14 = ws.addRow(['P90 (보수적 90%)', p90, d90, cost90 + ' 원']);
    [r12, r13, r14].forEach(r => { r.eachCell(c => { setBorder(c); c.alignment = {horizontal:'center'}; }); });
    setFont(r13, { bold: true, color: { argb: 'FF4F46E5' } }); 
    ws.addRow([]);

    ws.addRow(['■ 3. 필요 인원 분석 (목표 조립 완료일 기준)']).font = { bold: true, size: 12 };
    let r17 = ws.addRow(['가용 일수', `${document.getElementById('out-target-days')?.innerText||0} 일`, '달성 확률', document.getElementById('out-target-prob')?.innerText||'0%']);
    let r18 = ws.addRow(['[P50] 필요 인원', `${document.getElementById('out-req-p50')?.innerText||0} 명`, '[P90] 필요 인원', `${document.getElementById('out-req-p90')?.innerText||0} 명`]);
    [r17, r18].forEach(r => {
        setBg(r.getCell(1), 'FFF1F5F9'); setFont(r.getCell(1), { bold: true });
        setBg(r.getCell(3), 'FFF1F5F9'); setFont(r.getCell(3), { bold: true });
        r.eachCell(c => { setBorder(c); c.alignment = {horizontal:'center'}; });
    });
    ws.addRow([]);

    ws.addRow(['■ 4. AI 리스크 분석 결과']).font = { bold: true, size: 12 };
    if (window.latestAiResult) {
        ws.addRow(['분석 요약', window.latestAiResult.summary || '-']);
        if(window.latestAiResult.coreRisks && window.latestAiResult.coreRisks.length > 0) {
            ws.addRow(['핵심 리스크 및 조치']);
            window.latestAiResult.coreRisks.forEach(r => {
                ws.addRow(['', `[${r.phase || '공통'}] ${r.risk} -> ${r.mitigation}`]);
            });
        }
        ws.addRow(['효율성 평가', window.latestAiResult.efficiency || '-']);
        ws.addRow(['최종 권고', window.latestAiResult.conclusion || '-']);
    } else {
        ws.addRow(['AI 분석 결과 없음 (분석 미실행)']);
    }
    ws.addRow([]);

    ws.addRow(['■ 5. 세부 공정별 데이터']).font = { bold: true, size: 12 };
    const h2 = ws.addRow(['공정명', '수량', 'MD', '최빈', '낙관', '비관']);
    h2.eachCell(c => { setBg(c, 'FF334155'); setFont(c, { bold: true, color: { argb: 'FFFFFFFF' } }); setBorder(c); c.alignment = {horizontal:'center'}; });

    window.currentProcessData.forEach(p => {
        let row = ws.addRow([p.name, p.q, p.m, p.m, p.o || '-', p.p || '-']);
        row.eachCell(c => setBorder(c));
        row.getCell(1).alignment = { horizontal: 'left' };
        for(let i=2; i<=6; i++) row.getCell(i).alignment = { horizontal: 'center' };
    });
    ws.addRow([]);

    ws.addRow(['■ 6. 전체 공정 타임라인 (Gantt Chart)']).font = { bold: true, size: 12 };

    let startStr = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());
    let processGanttData = [];
    let offset = 0;

    window.currentProcessData.forEach(p => {
        let pt = p.pType || 'md';
        let days = 0;
        if(pt === 'auto') {
            let um = 0; (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0));
            days = um / (parseFloat(p.q)||1);
        } else { days = parseFloat(p.m) || 0; }

        if(days <= 0) return;

        let sD = window.calculateWorkDate(startStr, Math.floor(offset));
        let eD = window.calculateWorkDate(startStr, Math.floor(offset + days - 0.0001));

        processGanttData.push({
            name: p.name,
            type: pt === 'md' ? '제조(수동)' : (pt === 'auto' ? '제조(유닛)' : '일정'),
            start: sD, end: eD, days: days,
            color: pt === 'auto' ? 'FFF59E0B' : (pt.startsWith('schedule') ? 'FF10B981' : 'FF6366F1')
        });
        offset += days;
    });

    if(processGanttData.length > 0) {
        let minDate = new Date(startStr);
        let maxDate = new Date(processGanttData[processGanttData.length-1].end);

        let dateHeaders = ['공정명', '타입', '시작일', '종료일', '기간(일)'];
        let dateCols = [];
        let curr = new Date(minDate);
        while(curr <= maxDate) {
            dateCols.push(new Date(curr));
            dateHeaders.push(`${curr.getMonth()+1}/${curr.getDate()}`);
            curr.setDate(curr.getDate() + 1);
        }

        const h3 = ws.addRow(dateHeaders);
        h3.eachCell((c, cNum) => {
            setBg(c, 'FF334155'); setFont(c, { bold: true, color: { argb: 'FFFFFFFF' } }); setBorder(c); c.alignment = {horizontal:'center'};
            if(cNum > 5) ws.getColumn(cNum).width = 4; 
        });

        processGanttData.forEach(p => {
            let rowData = [p.name, p.type, window.getLocalDateStr(p.start), window.getLocalDateStr(p.end), p.days.toFixed(1)];
            dateCols.forEach(() => rowData.push(''));
            let row = ws.addRow(rowData);

            row.eachCell((c, cNum) => {
                setBorder(c);
                if(cNum === 1) c.alignment = { horizontal: 'left' };
                else if(cNum <= 5) c.alignment = { horizontal: 'center' };
            });

            dateCols.forEach((d, idx) => {
                let cell = row.getCell(idx + 6);
                let dTime = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                let sTime = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate()).getTime();
                let eTime = new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate()).getTime();

                if (dTime >= sTime && dTime <= eTime) {
                    setBg(cell, p.color);
                }
            });
        });
    }

    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `공수보고서_${pCode||pName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    window.showToast("엑셀 파일이 성공적으로 다운로드되었습니다.");
};
// ==========================================
// 💡 프로젝트 불러오기 & 저장 (모달 로직)
// ==========================================
window.openProjectModal = async () => {
    const modal = document.getElementById('project-list-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    
    const container = document.getElementById('project-list-container');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center p-6"><i class="fa-solid fa-spinner fa-spin text-slate-400 text-xl"></i></div>';
    
    try {
        const snap = await getDocs(query(collection(db, "sim_projects")));
        let projects = [];
        snap.forEach(d => projects.push({ id: d.id, ...d.data() }));
        
        // 정렬 시 updatedAt 또는 createdAt 기준으로 정렬 처리
        projects.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

        if (projects.length === 0) {
            container.innerHTML = '<div class="text-center p-6 text-slate-500 font-bold">저장된 프로젝트가 없습니다.</div>';
            return;
        }
        
        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
        projects.forEach(d => {
            // 과거 데이터(projectCode)와 신규 데이터(code)를 모두 호환하도록 매핑
            const pCode = d.projectCode || d.code || '코드없음';
            const pName = d.projectName || d.name || '제목 없음';
            const pManager = d.managerName || d.manager || '미정';
            const pDate = new Date(d.updatedAt || d.createdAt || Date.now()).toLocaleDateString();
            const processCount = d.processData ? d.processData.length : 0;
            const isLocked = !!d.isLocked;

            html += `
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md cursor-pointer transition-all border-l-4 border-l-indigo-500" onclick="window.loadProject('${d.id}')">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">${pCode}</span>
                    <span class="text-[10px] text-slate-400">${pDate}</span>
                </div>
                <div class="flex justify-between items-start">
                    <h3 class="text-sm font-black text-slate-800 mb-1 truncate pr-2">${pName}</h3>
                    <div class="flex gap-2 shrink-0">
                        <button onclick="window.toggleLockSimulationProject(event, '${d.id}', ${isLocked})" class="${isLocked ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'} transition-colors p-1" title="${isLocked ? '잠금 해제' : '잠금'}">
                            <i class="fa-solid ${isLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                        </button>
                        <button onclick="window.deleteSimulationProject(event, '${d.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-1" title="삭제"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
                <p class="text-xs text-slate-500">담당자: ${pManager} | ${processCount}개 공정</p>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="text-center p-6 text-rose-500 font-bold">데이터를 불러오지 못했습니다.</div>';
    }
};

window.closeProjectModal = () => {
    const modal = document.getElementById('project-list-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

// 시뮬레이션 프로젝트 삭제 기능 복구
window.deleteSimulationProject = async (e, id) => {
    e.stopPropagation();
    if (!confirm("이 시뮬레이션 프로젝트를 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "sim_projects", id));
        window.showToast("삭제되었습니다.", "success");
        window.openProjectModal(); // 목록 새로고침
    } catch(err) {
        window.showToast("삭제 실패", "error");
    }
};

// 시뮬레이션 프로젝트 잠금/해제 기능 복구
window.toggleLockSimulationProject = async (e, id, currentLock) => {
    e.stopPropagation();
    let newPwd = null;
    let isLocked = false;
    
    if (!currentLock) {
        newPwd = prompt("이 프로젝트를 다른 사람이 수정하지 못하도록 잠급니다.\n사용할 비밀번호를 입력하세요:");
        if (!newPwd) return;
        isLocked = true;
    } else {
        const inputPwd = prompt("잠금을 해제하기 위한 비밀번호를 입력하세요:");
        if (inputPwd === null) return;
        
        const docSnap = await getDoc(doc(db, "sim_projects", id));
        if (docSnap.exists() && docSnap.data().lockPassword !== inputPwd) {
            return window.showToast("비밀번호가 일치하지 않습니다.", "error");
        }
        isLocked = false;
        newPwd = null;
    }
    
    try {
        await setDoc(doc(db, "sim_projects", id), { isLocked: isLocked, lockPassword: newPwd }, { merge: true });
        window.showToast(isLocked ? "프로젝트가 잠겼습니다." : "잠금이 해제되었습니다.", "success");
        window.openProjectModal(); // 목록 새로고침
    } catch(err) {
        window.showToast("처리 실패", "error");
    }
};

window.loadProject = async (id) => {
    try {
        const docSnap = await getDoc(doc(db, "sim_projects", id));
        if (docSnap.exists()) {
            const d = docSnap.data();
            window.currentProjectId = id;
            document.getElementById('project-code').value = d.code || '';
            document.getElementById('project-name').value = d.name || '';
            document.getElementById('manager-name').value = d.manager || '';
            document.getElementById('equip-qty').value = d.qty || 1;
            document.getElementById('learning-curve').value = d.curve || 95;
            document.getElementById('diff-multiplier').value = d.diff || 1.0;
            document.getElementById('buffer-rate').value = d.buffer || 5;
            
            document.getElementById('start-date').value = d.startDate || window.getLocalDateStr(new Date());
            document.getElementById('target-date').value = d.targetDate || '';
            document.getElementById('shipping-date').value = d.shippingDate || '';
            
            window.currentProcessData = d.processData || [];
            
            window.renderProcessTable();
            window.renderUnitTables();
            window.debouncedRunSimulation();
            
            window.closeProjectModal();
            window.showToast("프로젝트를 성공적으로 불러왔습니다.", "success");
        }
    } catch (e) {
        window.showToast("프로젝트 불러오기 실패", "error");
    }
};

window.saveToFirestore = async (isHistory = false) => {
    const code = document.getElementById('project-code').value.trim();
    const name = document.getElementById('project-name').value.trim();
    
    if(!name) return window.showToast("프로젝트 명을 입력해주세요.", "warning");
    
    const payload = {
        code: code,
        name: name,
        manager: document.getElementById('manager-name').value.trim(),
        qty: parseFloat(document.getElementById('equip-qty').value) || 1,
        curve: parseFloat(document.getElementById('learning-curve').value) || 95,
        diff: parseFloat(document.getElementById('diff-multiplier').value) || 1.0,
        buffer: parseFloat(document.getElementById('buffer-rate').value) || 5,
        startDate: document.getElementById('start-date').value,
        targetDate: document.getElementById('target-date').value,
        shippingDate: document.getElementById('shipping-date').value,
        processData: window.currentProcessData,
        updatedAt: Date.now()
    };

    try {
        if (window.currentProjectId && !isHistory) {
            await setDoc(doc(db, "sim_projects", window.currentProjectId), payload, { merge: true });
            window.showToast("프로젝트가 성공적으로 저장되었습니다.", "success");
        } else {
            payload.createdAt = Date.now();
            const docRef = await addDoc(collection(db, "sim_projects"), payload);
            if (!isHistory) window.currentProjectId = docRef.id;
            window.showToast("새 프로젝트가 성공적으로 등록되었습니다.", "success");
        }
        window.isProjectDirty = false;
    } catch (e) {
        window.showToast("저장에 실패했습니다.", "error");
    }
};

// ==========================================
// 💡 예측 vs 실적 대시보드 모달 렌더링 (차트 포함)
// ==========================================
window.renderSimulationDashboard = async () => {
    const tbody = document.getElementById('accuracy-tbody');
    if (!tbody) return;
    
    try {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-500 font-bold"><i class="fa-solid fa-spinner fa-spin mr-2"></i>데이터를 불러오는 중입니다...</td></tr>';
        
        // PJT 현황판에서 '완료(출하)'된 프로젝트 데이터 가져오기
        const snap = await getDocs(query(collection(db, "projects_status"), where("status", "==", "completed")));
        
        let html = '';
        let labels = [];
        let mdData = [];
        let dateData = [];

        snap.forEach(docSnap => {
            const d = docSnap.data();
            const eMd = parseFloat(d.estMd) || 0;
            const fMd = parseFloat(d.finalMd) || 0;
            const errMd = fMd - eMd;
            const errRate = eMd > 0 ? ((errMd / eMd) * 100).toFixed(1) : 0;
            
            // 날짜 오차 계산 (일수)
            let dateDiff = 0;
            if(d.d_shipEst && d.d_shipEn) {
                const estD = new Date(d.d_shipEst);
                const actD = new Date(d.d_shipEn);
                dateDiff = Math.ceil((actD - estD) / (1000 * 60 * 60 * 24));
            }

            labels.push(d.code || '미지정');
            mdData.push(errMd);
            dateData.push(dateDiff);

            html += `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="p-3 text-center font-bold text-slate-500">${d.code||'-'}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[200px]" title="${d.name}">${d.name}</td>
                <td class="p-3 text-center text-sky-600 font-bold">${eMd}</td>
                <td class="p-3 text-center text-indigo-600 font-black">${fMd}</td>
                <td class="p-3 text-center font-bold ${errRate > 0 ? 'text-rose-500' : 'text-emerald-500'}">${errRate}%</td>
                <td class="p-3 text-center text-slate-500">${d.d_shipEst||'-'}</td>
                <td class="p-3 text-center text-indigo-600 font-bold">${d.d_shipEn||'-'}</td>
            </tr>`;
        });
        
        if (html === '') {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-400 font-bold">비교할 완료(출하) 데이터가 없습니다.</td></tr>';
        } else {
            tbody.innerHTML = html;
        }

        // --- 차트 그리기 로직 추가 ---
        if(window.simDashChartMd) window.simDashChartMd.destroy();
        if(window.simDashChartDate) window.simDashChartDate.destroy();

        const ctxMd = document.getElementById('accuracy-chart-md')?.getContext('2d');
        if (ctxMd) {
            window.simDashChartMd = new Chart(ctxMd, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'MD 오차 (실적 - 예측)',
                        data: mdData,
                        backgroundColor: mdData.map(v => v > 0 ? '#ef4444' : '#10b981'),
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        const ctxDate = document.getElementById('accuracy-chart-date')?.getContext('2d');
        if (ctxDate) {
            window.simDashChartDate = new Chart(ctxDate, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '일정 지연 일수 (실적 - 예측)',
                        data: dateData,
                        backgroundColor: dateData.map(v => v > 0 ? '#ef4444' : '#10b981'),
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-rose-500 font-bold">데이터 로드 중 오류가 발생했습니다.</td></tr>';
    }
};
