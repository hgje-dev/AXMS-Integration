/* eslint-disable */
import { db } from './firebase.js';
import { 
    collection, doc, setDoc, getDoc, getDocs, 
    addDoc, deleteDoc, query, where, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 1. 전역 변수 및 초기화
// ==========================================
const SIMULATION_DRIVE_FOLDER_ID = "1qyW-Ym_16tpRUUE0NQuFmwxg3IadF70e";
const simulationWorker = new Worker('./js/Worker/simulationWorker.js'); 

window.currentProcessData = window.currentProcessData || [];
window.latestP50Md = 0;
window.latestReqP90 = 0;
window.masterPresets = {};
window.currentTab = 'hist'; 
window.currentProjectId = null;
window.isProjectDirty = false; // 💡 수정사항 추적 변수
window.latestAiResult = null; // 엑셀 출력을 위한 AI 결과 캐싱

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

// 💡 프로젝트 이탈 시 경고
window.addEventListener('beforeunload', (e) => {
    if (window.isProjectDirty) {
        e.preventDefault();
        e.returnValue = '저장하지 않은 변경사항이 있습니다. 이 페이지를 벗어나시겠습니까?';
    }
});

// 💡 영업일 계산 유틸리티 함수 (목표일 분석용)
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

    // 1) 기본 결과 카드 업데이트
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

    // 2) 💡 목표일 달성 확률 및 필요 인원 분석 (완벽 복구)
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

    // 3) 리스크 민감도 데이터 세팅
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

// ==========================================
// 3. 시뮬레이션 실행 트리거
// ==========================================
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

window.debouncedRunSimulation = () => {
    window.isProjectDirty = true;
    if (window.simTimer) clearTimeout(window.simTimer);
    window.simTimer = setTimeout(window.runSimulation, 300);
};

// ==========================================
// 4. 프리셋 데이터 연동 및 렌더링
// ==========================================
window.loadMasterPresets = async () => {
    try {
        const snap = await getDocs(collection(db, "sim_master_presets"));
        const sel = document.getElementById('eq-type');
        if (!sel) return;
        
        sel.innerHTML = '';
        window.masterPresets = {};
        
        if (!snap.empty) {
            snap.forEach(d => {
                window.masterPresets[d.id] = d.data();
                sel.innerHTML += `<option value="${d.id}">${d.data().label}</option>`;
            });
        } else {
            window.masterPresets = JSON.parse(JSON.stringify(defaultPresets));
            for (let key in window.masterPresets) {
                sel.innerHTML += `<option value="${key}">${window.masterPresets[key].label}</option>`;
            }
        }
        window.handleTypeChange();
    } catch (e) { console.error("Presets Load Error", e); }
};

window.handleTypeChange = () => {
    const id = document.getElementById('eq-type')?.value;
    if (!id || !window.masterPresets[id]) return;
    
    const preset = window.masterPresets[id];
    window.currentProcessData = JSON.parse(JSON.stringify(preset.processData));
    
    if (preset.curve) document.getElementById('learning-curve').value = preset.curve;
    if (preset.labor) document.getElementById('labor-cost').value = preset.labor;
    
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

// 💡 5. 드래그 앤 드롭 함수 구현
window.dragProcessStart = (e, index) => {
    window.draggedProcessIndex = index;
    e.dataTransfer.effectAllowed = 'move';
};
window.dragProcessDrop = (e, dropIndex) => {
    e.preventDefault();
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
    window.draggedUnitInfo = { pIdx, uIdx };
    e.dataTransfer.effectAllowed = 'move';
};
window.dragUnitDrop = (e, dropPIdx, dropUIdx) => {
    e.preventDefault();
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

    window.currentProcessData.forEach((p, i) => {
        let pt = p.pType || 'md';
        const tr = document.createElement('tr');
        tr.className = pt === 'auto' ? "bg-indigo-50/30 hover:bg-indigo-50/50 transition-colors" : "hover:bg-slate-50 transition-colors";
        
        let sel = `<select onchange="window.updateProcessData(${i},'pType',this.value)" class="table-input w-full text-[11px] font-bold">
            <option value="auto" ${pt==='auto'?'selected':''}>⚙️ 유닛</option>
            <option value="md" ${pt==='md'?'selected':''}>🛠️ 수동</option>
            <option value="schedule_elec" ${pt==='schedule_elec'?'selected':''}>⚡ 전장(일정)</option>
            <option value="schedule_ctrl" ${pt==='schedule_ctrl'?'selected':''}>💻 제어(일정)</option>
            <option value="schedule_insp" ${pt==='schedule_insp'?'selected':''}>🔍 검사(일정)</option>
            <option value="schedule_test" ${pt==='schedule_test'?'selected':''}>🚗 시운전</option>
        </select>`;
        
        // 💡 드래그 앤 드롭 이벤트 부여
        let act = `<div class="flex justify-center gap-2">
            <div class="cursor-grab text-slate-400 p-1" 
                 onmousedown="this.closest('tr').setAttribute('draggable',true)" 
                 onmouseup="this.closest('tr').removeAttribute('draggable')" 
                 onmouseleave="this.closest('tr').removeAttribute('draggable')" 
                 ondragstart="window.dragProcessStart(event, ${i})" 
                 ondragover="event.preventDefault()" 
                 ondrop="window.dragProcessDrop(event, ${i})">
                <i class="fa-solid fa-grip-vertical"></i>
            </div>`;
            
        if(pt === 'auto') act += `<div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div></div>`;
        else act += `<button onclick="window.deleteProcessRow(${i})" class="text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can"></i></button></div>`;

        let h = '';
        if(pt === 'auto') {
            let um = 0;
            (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0));
            let ed = (um / (parseFloat(p.q)||1)).toFixed(1);
            
            h = `<td class="px-3 py-2"><input value="${p.name}" oninput="window.updateProcessData(${i},'name',this.value)" class="w-full text-xs font-bold text-indigo-700 bg-transparent outline-none"></td>
                 <td class="px-1 py-2">${sel}</td>
                 <td class="px-1 py-2"><input type="number" value="${p.q}" min="1" oninput="window.updateProcessData(${i},'q',Number(this.value))" class="table-input w-full text-right text-sm font-black text-indigo-700 calc-trigger"></td>`;
            
            if(m === 'mc') h += `<td class="px-2 py-2 text-right font-bold text-indigo-600"><span id="p-days-${i}">${ed}</span> 일</td><td class="px-4 py-2 text-right font-bold text-indigo-900"><span id="p-sub-${i}">${um.toFixed(1)}</span> MD</td>`;
            else h += `<td colspan="3" class="px-4 py-2 text-center text-[11px] text-indigo-500">(자동계산)</td>`;
            h += `<td class="px-2 text-center">${act}</td>`;
        } else {
            let iL = pt.startsWith('schedule') ? "일" : "MD";
            let sV = pt.startsWith('schedule') ? "-" : (parseFloat(p.q)*parseFloat(p.m)).toFixed(1);
            let qI = pt.startsWith('schedule') ? `<div class="text-center text-slate-400">-</div>` : `<input type="number" value="${p.q}" min="0" oninput="window.updateProcessData(${i},'q',Number(this.value))" class="table-input w-full text-right text-sm font-semibold calc-trigger">`;
            
            let sH = "";
            if(m === 'mc') sH = `<td class="px-4 py-1.5 text-right font-bold text-slate-700" id="p-sub-${i}">${sV}</td>`;
            else sH = `<td class="px-1 py-1.5"><input type="number" value="${p.o}" step="0.1" oninput="window.updateProcessData(${i},'o',Number(this.value))" class="table-input w-full text-right text-sm font-bold text-emerald-700 calc-trigger"></td><td class="px-1 py-1.5"><input type="number" value="${p.p}" step="0.1" oninput="window.updateProcessData(${i},'p',Number(this.value))" class="table-input w-full text-right text-sm font-bold text-rose-700 calc-trigger"></td>`;
            
            h = `<td class="px-3 py-1.5"><input value="${p.name}" oninput="window.updateProcessData(${i},'name',this.value)" class="table-input w-full text-xs font-bold"></td>
                 <td class="px-1 py-1.5">${sel}</td>
                 <td class="px-1 py-1.5">${qI}</td>
                 <td class="px-1 py-1.5 relative"><input type="number" value="${p.m}" step="0.1" oninput="window.updateProcessData(${i},'m',Number(this.value))" class="table-input w-full text-right text-sm calc-trigger pr-6"><span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">${iL}</span></td>
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

    window.currentProcessData.forEach((p, pi) => {
        if(p.pType !== 'auto') return; 
        if(!p.unitData || p.unitData.length === 0) p.unitData = [{name:"신규", q:1, m:1, o:0.9, p:1.4}];
        
        let pM = 0, tb = '';
        p.unitData.forEach((u, ui) => {
            pM += (parseFloat(u.q)||0)*(parseFloat(u.m)||0); 
            
            let rH = `<td class="px-3 py-1.5"><input value="${u.name}" oninput="window.updateUnitData(${pi},${ui},'name',this.value)" class="table-input w-full text-xs font-bold"></td>
                      <td class="px-1 py-1.5"><input type="number" value="${u.q}" oninput="window.updateUnitData(${pi},${ui},'q',Number(this.value))" class="table-input w-full text-right text-sm font-semibold calc-trigger"></td>`;
            if(m === 'mc') {
                rH += `<td class="px-1 py-1.5"><input type="number" value="${u.m}" step="0.1" oninput="window.updateUnitData(${pi},${ui},'m',Number(this.value))" class="table-input w-full text-right text-sm font-semibold calc-trigger"></td>
                       <td class="px-4 py-1.5 text-right font-bold text-blue-900 bg-blue-50/30">${(parseFloat(u.q)*parseFloat(u.m)).toFixed(1)}</td>`;
            } else {
                rH += `<td class="px-1 py-1.5"><input type="number" value="${u.m}" step="0.1" oninput="window.updateUnitData(${pi},${ui},'m',Number(this.value))" class="table-input w-full text-right text-sm calc-trigger"></td>
                       <td class="px-1 py-1.5 bg-emerald-50/30"><input type="number" value="${u.o}" step="0.1" oninput="window.updateUnitData(${pi},${ui},'o',Number(this.value))" class="table-input w-full text-right text-sm text-emerald-700 calc-trigger"></td>
                       <td class="px-1 py-1.5 bg-rose-50/30"><input type="number" value="${u.p}" step="0.1" oninput="window.updateUnitData(${pi},${ui},'p',Number(this.value))" class="table-input w-full text-right text-sm text-rose-700 calc-trigger"></td>`;
            }
            
            // 💡 유닛 테이블 드래그 앤 드롭
            rH += `<td class="px-2 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <div class="cursor-grab text-slate-400 p-1" 
                             onmousedown="this.closest('tr').setAttribute('draggable',true)" 
                             onmouseup="this.closest('tr').removeAttribute('draggable')" 
                             onmouseleave="this.closest('tr').removeAttribute('draggable')" 
                             ondragstart="window.dragUnitStart(event, ${pi}, ${ui})" 
                             ondragover="event.preventDefault()" 
                             ondrop="window.dragUnitDrop(event, ${pi}, ${ui})">
                            <i class="fa-solid fa-grip-vertical"></i>
                        </div>
                        <button onclick="window.deleteUnitRow(${pi},${ui})" class="text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                   </td>`;
            tb += `<tr class="hover:bg-blue-50/30 transition-colors">${rH}</tr>`;
        });

        let uh = `<tr><th class="px-5 py-3 text-left text-blue-500">유닛명</th><th class="px-2 text-center text-blue-500 w-24">수량</th>`;
        if(m === 'mc') uh += `<th class="px-2 text-center text-blue-500 w-24">단위MD</th><th class="px-4 text-right text-blue-500 w-24">소계</th>`; 
        else uh += `<th class="px-2 text-center text-slate-500 w-16">최빈</th><th class="px-2 text-center text-emerald-600 bg-emerald-50/50 w-16">낙관</th><th class="px-2 text-center text-rose-600 bg-rose-50/50 w-16">비관</th>`;
        uh += `<th class="px-3 text-center text-slate-400 w-16"><i class="fa-solid fa-gear"></i></th></tr>`;
        
        h += `<section class="bg-white rounded-3xl border border-blue-200 border-l-8 border-l-blue-500 mb-6 overflow-hidden">
                <div class="px-8 py-5 border-b border-slate-100 flex justify-between">
                    <h2 class="text-sm font-bold flex items-center gap-2 text-slate-800"><i class="fa-solid fa-cubes text-blue-500"></i> 유닛 - ${p.name}</h2>
                    <button onclick="window.addUnitRow(${pi})" class="bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-xs font-bold">+ 추가</button>
                </div>
                <div class="overflow-x-auto"><table class="w-full text-xs"><thead class="bg-slate-50 border-b">${uh}</thead><tbody class="divide-y">${tb}</tbody></table></div>
                <div class="bg-blue-50/30 p-4 text-right border-t"><span class="text-[11px] font-bold text-slate-500">유닛 합계</span><span class="ml-3 text-lg font-black text-blue-700">${pM.toFixed(1)} <span class="text-sm">MD</span></span></div>
              </section>`;
    });
    cont.innerHTML = h;
    window.setupAutoSaveTriggers();
};

window.updateProcessData = (i, f, v) => { 
    window.currentProcessData[i][f] = f==='name'||f==='pType' ? v : parseFloat(v);
    if(f === 'pType' && v === 'auto' && !window.currentProcessData[i].unitData) {
        window.currentProcessData[i].unitData = [{name:"신규", q:1, m:1.0, o:0.9, p:1.4}]; 
    }
    window.isProjectDirty = true;
    window.renderProcessTable(); window.renderUnitTables(); 
    window.debouncedRunSimulation(); 
};
window.addProcessRow = () => { window.currentProcessData.push({name:"신규 공정", q:1, m:1.0, pType:'md'}); window.isProjectDirty = true; window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteProcessRow = (i) => { window.currentProcessData.splice(i,1); window.isProjectDirty = true; window.renderProcessTable(); window.renderUnitTables(); window.debouncedRunSimulation(); };

window.updateUnitData = (pI, uI, f, v) => { window.currentProcessData[pI].unitData[uI][f] = v; window.isProjectDirty = true; window.debouncedRunSimulation(); window.renderUnitTables(); window.renderProcessTable(); };
window.addUnitRow = (pI) => { window.currentProcessData[pI].unitData.push({name:"신규 유닛", q:1, m:1.0, o:0.9, p:1.4}); window.isProjectDirty = true; window.renderUnitTables(); window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteUnitRow = (pI, uI) => { if(window.currentProcessData[pI].unitData.length <= 1) return; window.currentProcessData[pI].unitData.splice(uI,1); window.isProjectDirty = true; window.renderUnitTables(); window.renderProcessTable(); window.debouncedRunSimulation(); };

window.applyP90Personnel = () => {
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
    if(bBox) bBox.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>AI가 데이터를 분석하고 있습니다...</div>';

    try {
        const promptStr = `당신은 제조 설비 프로젝트 PMO(Project Management Office) 분석 전문가입니다. 주어진 프로젝트 데이터(P50: ${window.latestP50Md}MD)를 분석하여 잠재적 리스크와 조치사항을 도출하세요. 
        반드시 다음 JSON 형식으로만 응답해야 합니다: 
        { "summary": "전체 분석 요약 한 줄", "mainRisk": "발생 가능한 핵심 리스크", "action": "권장 조치사항" }`;

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
        window.latestAiResult = result; // 엑셀 출력을 위한 저장
        
        if(bBox) {
            bBox.innerHTML = `
                <div class="space-y-3 animate-fade-in">
                    <p class="text-sm leading-relaxed">${result.summary || "분석이 완료되었습니다."}</p>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div class="bg-slate-950/50 p-3 rounded-xl border border-slate-700">
                            <span class="text-[10px] text-slate-400 block mb-1">예상 리스크</span>
                            <span class="text-xs font-bold text-rose-400">${result.mainRisk||"없음"}</span>
                        </div>
                        <div class="bg-slate-950/50 p-3 rounded-xl border border-slate-700">
                            <span class="text-[10px] text-slate-400 block mb-1">권장 조치</span>
                            <span class="text-xs font-bold text-emerald-400">${result.action||"정상 진행"}</span>
                        </div>
                    </div>
                </div>`;
        }
    } catch (e) {
        window.showToast("AI 분석 모듈 연결 실패 (API Key 확인 요망)", "error");
        if(bBox) bBox.innerText = "분석 실패: " + e.message;
    }
};

window.generateAiComparison = async () => {
    window.showToast("유사 프로젝트 AI 비교 분석은 백엔드 기능 준비중입니다.", "warning");
};

// ==========================================
// 7. 데이터 저장 및 엑셀 출력 💡(요청하신 포맷 적용)
// ==========================================
window.saveToFirestore = async function(isSilent = false) {
    const pCode = document.getElementById('project-code')?.value;
    const pName = document.getElementById('project-name')?.value;
    if (!pName) return window.showToast("프로젝트 이름을 입력하세요.", "error");

    const payload = {
        projectCode: pCode,
        projectName: pName,
        managerName: document.getElementById('manager-name')?.value,
        qty: parseInt(document.getElementById('equip-qty')?.value) || 1,
        curve: parseInt(document.getElementById('learning-curve')?.value) || 95,
        processData: window.currentProcessData,
        p50Md: window.latestP50Md,
        authorUid: window.currentUser?.uid || 'guest',
        authorName: window.userProfile?.name || '알수없음', 
        updatedAt: Date.now()
    };

    try {
        let pid = window.currentProjectId;
        if (pid) {
            const oldSnap = await getDoc(doc(db, "sim_projects", pid));
            if(oldSnap.exists()) {
                await addDoc(collection(db, "sim_project_history"), { projectId: pid, snapshot: oldSnap.data(), changedBy: window.userProfile?.name || 'guest', changedAt: Date.now() });
            }
            await setDoc(doc(db, "sim_projects", pid), payload, { merge: true });
        } else {
            payload.createdAt = Date.now();
            const docRef = await addDoc(collection(db, "sim_projects"), payload);
            window.currentProjectId = docRef.id;
        }
        
        window.isProjectDirty = false; // 💡 저장 완료 시 플래그 초기화
        
        if (!isSilent) window.showToast("클라우드에 저장되었습니다.");
    } catch (e) {
        window.showToast("저장 실패", "error");
    }
};

window.cloneProject = () => {
    if(!window.currentProjectId) return window.showToast("저장되거나 불러온 프로젝트가 없습니다.", "warning");
    window.currentProjectId = null;
    document.getElementById('project-name').value += ' (복제본)';
    window.isProjectDirty = true;
    window.showToast("복제되었습니다. '저장'을 누르면 새 프로젝트로 등록됩니다.", "success");
};

window.exportToExcel = async () => {
    if (typeof ExcelJS === 'undefined') return window.showToast("라이브러리 로딩 중입니다.", "warning");
    window.showToast("공수 보고서 엑셀 파일을 생성 중입니다...");
    
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('시뮬레이션_보고서');
    
    ws.columns = [
        { width: 35 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }
    ];
    
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
    const lCost = document.getElementById('labor-cost')?.value || '300000';
    const pExp = document.getElementById('planned-expense')?.value || '0';

    // 1. 헤더 영역
    ws.addRow(['📊 제조 설비 공수 시뮬레이터 종합 보고서']).font = { size: 14, bold: true };
    ws.addRow([`출력 일시: ${new Date().toLocaleString()}`]).font = { color: { argb: 'FF64748B' } };
    ws.addRow([]);
    
    // 2. 프로젝트 정보
    ws.addRow(['■ 1. 프로젝트 정보 및 설정']).font = { bold: true };
    ws.addRow(['프로젝트 코드', pCode, '프로젝트 명', pName]);
    ws.addRow(['담당자', mgr, '투입 인원 및 숙련도', `총 ${tPers}명`]);
    ws.addRow(['1MD 기준 인건비', `${Number(lCost).toLocaleString()} 원`, '예상 기타 경비', `${Number(pExp).toLocaleString()} 원`]);
    ws.addRow([]);

    // 3. 분석 요약 결과
    ws.addRow(['■ 2. 분석 요약 결과']).font = { bold: true };
    ws.addRow(['목표 조립 완료일', document.getElementById('target-date')?.value || '-', '출하 예정일', document.getElementById('shipping-date')?.value || '-']);
    const h1 = ws.addRow(['구분', '산출 공수(MD)', '조립 완료 예정일', '예상 총 비용']);
    h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    h1.font = { bold: true };
    ws.addRow(['P10 (낙관적 10%)', p10, d10, cost10]);
    ws.addRow(['P50 (가장 유력)', p50, d50, cost50]).font = { bold: true, color: { argb: 'FF4F46E5' } };
    ws.addRow(['P90 (보수적 90%)', p90, d90, cost90]);
    ws.addRow([]);

    // 4. 인원 분석 (목표일 기준)
    ws.addRow(['■ 3. 필요 인원 분석 (목표 조립 완료일 기준)']).font = { bold: true };
    ws.addRow(['가용 일수', `${document.getElementById('out-target-days')?.innerText||0} 일`, '달성 확률', document.getElementById('out-target-prob')?.innerText||'0%']);
    ws.addRow(['[P50] 필요 인원', `${document.getElementById('out-req-p50')?.innerText||0} 명`, '[P90] 필요 인원', `${document.getElementById('out-req-p90')?.innerText||0} 명`]);
    ws.addRow([]);

    // 5. AI 분석
    ws.addRow(['■ 4. AI 리스크 분석 결과']).font = { bold: true };
    if (window.latestAiResult) {
        ws.addRow(['분석 요약', window.latestAiResult.summary || '-']);
        ws.addRow(['주요 리스크', window.latestAiResult.mainRisk || '-']);
        ws.addRow(['권장 조치', window.latestAiResult.action || '-']);
    } else {
        ws.addRow(['AI 분석 결과 없음 (분석 미실행)']);
    }
    ws.addRow([]);

    // 6. 세부 공정 데이터
    ws.addRow(['■ 5. 세부 공정별 데이터']).font = { bold: true };
    const h2 = ws.addRow(['공정명', '타입', '수량', '기준MD/최빈']);
    h2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    
    window.currentProcessData.forEach(p => {
        let pTypeStr = p.pType === 'md' ? '수동' : (p.pType === 'auto' ? '유닛' : '일정');
        ws.addRow([p.name, pTypeStr, p.q, p.m]);
    });
    
    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `공수보고서_${pCode||pName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    window.showToast("엑셀 파일이 다운로드되었습니다.");
};

// ... (나머지 팝업 관리 로직은 이전 코드와 동일)
window.openProjectModal = async () => {
    const container = document.getElementById('project-list-container');
    const modal = document.getElementById('project-list-modal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    if(!container) return;

    container.innerHTML = '<div class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-400"></i></div>';
    
    try {
        const snap = await getDocs(query(collection(db, "sim_projects"), orderBy("updatedAt", "desc")));
        if(snap.empty) {
            container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold">저장된 프로젝트가 없습니다.</div>';
            return;
        }
        
        let html = '<div class="grid gap-3">';
        snap.forEach(doc => {
            const d = doc.data();
            const dateStr = window.getDateTimeStr(new Date(d.updatedAt || d.createdAt));
            const isL = d.isLocked || false;
            const isA = window.currentProjectId === doc.id;
            
            let aH = '';
            const canManage = (window.userProfile?.role === 'admin' || window.currentUser?.uid === d.authorUid);

            if (canManage) {
                if (isL) {
                    aH += `<button onclick="event.stopPropagation(); window.toggleProjectLock('${doc.id}', false)" class="text-amber-500 hover:text-amber-600 p-2 transition-colors" title="잠금 해제"><i class="fa-solid fa-lock"></i></button>
                           <button onclick="event.stopPropagation(); window.showToast('잠금을 먼저 해제하세요.', 'error');" class="text-slate-200 cursor-not-allowed p-2" title="잠김 상태에선 삭제 불가"><i class="fa-solid fa-trash-can"></i></button>`;
                } else {
                    aH += `<button onclick="event.stopPropagation(); window.toggleProjectLock('${doc.id}', true)" class="text-slate-300 hover:text-amber-500 p-2 transition-colors" title="잠금 설정"><i class="fa-solid fa-lock-open"></i></button>
                           <button onclick="event.stopPropagation(); window.deleteProject('${doc.id}')" class="text-slate-300 hover:text-rose-500 p-2 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
                }
            } else {
                 if (isL) {
                     aH += `<button onclick="event.stopPropagation(); window.showToast('권한이 없습니다.', 'error');" class="text-amber-500/50 cursor-not-allowed p-2"><i class="fa-solid fa-lock"></i></button>`;
                 }
            }

            const lockBadge = isL ? `<span class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold ml-2 shadow-sm border border-amber-100"><i class="fa-solid fa-lock text-[8px] mr-1"></i> 잠금됨</span>` : '';
            const activeBadge = isA ? `<span class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold ml-2 shadow-sm border border-indigo-100">현재 열림</span>` : '';

            html += `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:border-amber-300 transition-colors cursor-pointer" onclick="window.loadProject('${doc.id}')">
                <div>
                    <div class="flex items-center mb-1">
                        <span class="text-xs font-bold text-amber-600">[${d.projectCode || '코드없음'}]</span>
                        ${activeBadge}
                        ${lockBadge}
                    </div>
                    <div class="text-sm font-black text-slate-800">${d.projectName}</div>
                    <div class="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                        <span><i class="fa-regular fa-user mr-1"></i>작성자: <span class="font-bold text-slate-600">${d.authorName || '알수없음'}</span></span>
                        <span>|</span>
                        <span>담당자: ${d.managerName || '미지정'}</span>
                        <span>|</span>
                        <span><i class="fa-regular fa-clock mr-1"></i>${dateStr}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    ${aH}
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="text-center p-10 text-rose-500">데이터를 불러오지 못했습니다.</div>';
    }
};

window.closeProjectModal = () => {
    const m = document.getElementById('project-list-modal');
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
};

window.toggleProjectLock = async (id, loc) => {
    try {
        if (loc) {
            const pwd = prompt('프로젝트를 보호하기 위한 비밀번호를 설정하세요:');
            if (pwd === null) return; 
            if (pwd.trim() === '') { window.showToast('비밀번호를 입력해야 합니다.', 'error'); return; }
            
            await setDoc(doc(db, 'sim_projects', id), { isLocked: true, lockPassword: pwd.trim() }, { merge: true });
            window.showToast('프로젝트가 잠금 처리되었습니다.', 'success');
            window.openProjectModal(); 
        } else {
            const dS = await getDoc(doc(db, 'sim_projects', id));
            if (!dS.exists()) return; 
            const d = dS.data();
            
            if (window.userProfile?.role !== 'admin' && window.currentUser?.uid !== d.authorUid) { 
                window.showToast('권한이 없습니다.', 'error'); return;
            }
            
            const pwd = prompt('잠금 해제 비밀번호를 입력하세요:');
            if (pwd === null) return; 
            if (pwd.trim() !== d.lockPassword) { 
                window.showToast('비밀번호가 일치하지 않습니다.', 'error'); return;
            }
            
            await setDoc(doc(db, 'sim_projects', id), { isLocked: false, lockPassword: null }, { merge: true });
            window.showToast('잠금이 해제되었습니다.', 'success');
            window.openProjectModal(); 
        }
    } catch(e) {
        window.showToast("상태 변경 실패", "error");
    }
};

window.loadProject = async (id) => {
    if (window.isProjectDirty && !confirm("저장하지 않은 변경사항이 있습니다. 그래도 불러오시겠습니까?")) return;

    try {
        const docSnap = await getDoc(doc(db, "sim_projects", id));
        if(docSnap.exists()) {
            const d = docSnap.data();
            
            if (d.isLocked && window.userProfile?.role !== 'admin' && window.currentUser?.uid !== d.authorUid) {
                const pwd = prompt('🔒 이 프로젝트는 잠겨있습니다. 비밀번호를 입력하세요:');
                if (pwd === null) return;
                if (pwd.trim() !== d.lockPassword) {
                    window.showToast("비밀번호가 일치하지 않습니다.", "error");
                    return;
                }
            }

            window.currentProjectId = id;
            document.getElementById('project-code').value = d.projectCode || '';
            document.getElementById('project-name').value = d.projectName || '';
            document.getElementById('manager-name').value = d.managerName || '';
            document.getElementById('equip-qty').value = d.qty || 1;
            document.getElementById('learning-curve').value = d.curve || 95;
            window.currentProcessData = d.processData || [];
            window.renderProcessTable();
            window.renderUnitTables();
            window.debouncedRunSimulation();
            window.isProjectDirty = false;
            window.closeProjectModal();
            window.showToast("프로젝트를 불러왔습니다.");
        }
    } catch(e) { window.showToast("불러오기 실패", "error"); }
};

window.deleteProject = async (id) => {
    if(!confirm("이 프로젝트를 영구 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "sim_projects", id));
        window.showToast("삭제되었습니다.");
        window.openProjectModal();
    } catch(e) { window.showToast("삭제 실패", "error"); }
};

window.openHistoryModal = async () => {
    if(!window.currentProjectId) return window.showToast("먼저 프로젝트를 불러오거나 저장하세요.", "warning");
    
    const modal = document.getElementById('history-modal');
    const container = document.getElementById('history-list-container');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    if(!container) return;

    container.innerHTML = '<div class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-400"></i></div>';
    
    try {
        const snap = await getDocs(query(collection(db, "sim_project_history"), where("projectId", "==", window.currentProjectId)));
        let hList = [];
        snap.forEach(d => hList.push({id: d.id, ...d.data()}));
        hList.sort((a,b) => b.changedAt - a.changedAt);
        
        if(hList.length === 0) {
            container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold">이력 데이터가 없습니다.</div>';
            return;
        }
        
        let html = '<div class="space-y-3">';
        hList.forEach(h => {
            const dateStr = window.getDateTimeStr(new Date(h.changedAt));
            html += `
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                <div>
                    <div class="font-bold text-sm text-slate-700">${dateStr}</div>
                    <div class="text-[10px] text-slate-500 mt-1">변경자: ${h.changedBy}</div>
                </div>
                <button onclick="window.restoreHistory('${h.id}')" class="bg-sky-50 text-sky-600 hover:bg-sky-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">이 시점으로 복원</button>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="text-center p-10 text-rose-500">데이터를 불러오지 못했습니다.</div>';
    }
};

window.closeHistoryModal = () => {
    const m = document.getElementById('history-modal');
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
};

window.restoreHistory = async (histId) => {
    if(!confirm("이 시점으로 복구하시겠습니까? 현재 내역은 덮어씌워집니다.")) return;
    try {
        const snap = await getDoc(doc(db, "sim_project_history", histId));
        if(snap.exists()) {
            const oldData = snap.data().snapshot;
            oldData.updatedAt = Date.now();
            await setDoc(doc(db, "sim_projects", window.currentProjectId), oldData);
            window.loadProject(window.currentProjectId);
            window.closeHistoryModal();
            window.showToast("이력이 복원되었습니다.");
        }
    } catch(e) { window.showToast("복구 실패", "error"); }
};

window.openDashboardModal = async () => {
    const modal = document.getElementById('dashboard-modal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    
    const tbody = document.getElementById('accuracy-tbody');
    if(!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-2xl text-slate-400"></i></td></tr>';
    
    try {
        const snap = await getDocs(query(collection(db, "projects_status"), where("status", "==", "completed")));
        let list = [];
        snap.forEach(d => list.push(d.data()));
        
        if(list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center p-10 text-slate-500 font-bold">완료된 프로젝트 실적 데이터가 없습니다.</td></tr>';
            return;
        }
        
        let html = '';
        let labels = [], errMds = [], errDates = [];

        list.forEach(p => {
            const estMd = parseFloat(p.estMd) || 0;
            const actMd = parseFloat(p.finalMd) || 0;
            const mdErr = estMd > 0 ? ((actMd - estMd)/estMd * 100).toFixed(1) : 0;
            
            const estDate = p.d_shipEst || '-';
            const actDate = p.d_shipEn || '-';
            
            let dateErr = 0;
            if(estDate !== '-' && actDate !== '-') {
                dateErr = Math.round((new Date(actDate) - new Date(estDate))/(1000*60*60*24));
            }

            labels.push(p.name.substring(0, 10));
            errMds.push(parseFloat(mdErr));
            errDates.push(dateErr);

            html += `<tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 text-center font-bold text-emerald-600">${p.code || '-'}</td>
                <td class="p-3 truncate max-w-[150px] font-bold text-slate-700" title="${p.name}">${p.name}</td>
                <td class="p-3 text-center text-slate-500">${estMd.toFixed(1)}</td>
                <td class="p-3 text-center font-black text-emerald-600">${actMd.toFixed(1)}</td>
                <td class="p-3 text-center font-bold ${parseFloat(mdErr) > 0 ? 'text-rose-500' : 'text-blue-500'}">${mdErr}%</td>
                <td class="p-3 text-center text-slate-500">${estDate}</td>
                <td class="p-3 text-center font-black text-emerald-600">${actDate}</td>
            </tr>`;
        });
        
        tbody.innerHTML = html;

        const ctx1 = document.getElementById('accuracy-chart-md')?.getContext('2d');
        const ctx2 = document.getElementById('accuracy-chart-date')?.getContext('2d');
        
        if(window.accChart1) window.accChart1.destroy();
        if(window.accChart2) window.accChart2.destroy();
        
        if(ctx1) {
            window.accChart1 = new Chart(ctx1, {
                type: 'bar',
                data: { labels: labels, datasets: [{ label: 'MD 오차율 (%)', data: errMds, backgroundColor: errMds.map(v => v>0 ? '#f43f5e' : '#3b82f6') }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
            });
        }
        if(ctx2) {
            window.accChart2 = new Chart(ctx2, {
                type: 'bar',
                data: { labels: labels, datasets: [{ label: '일정 지연 (일)', data: errDates, backgroundColor: errDates.map(v => v>0 ? '#f43f5e' : '#10b981') }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: {legend:{display:false}} }
            });
        }
        
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-10 text-rose-500 font-bold">분석 데이터를 불러오지 못했습니다.</td></tr>';
    }
};

window.closeDashboardModal = () => {
    const m = document.getElementById('dashboard-modal');
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
};

// 초성 검색 자동완성 
window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
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

// 초기화 실행
window.loadMasterPresets();
