import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================================
// 1. 전역 변수 및 헬퍼 함수
// ============================================================================
let simTimer = null;
window.draggedUnitInfo = null;
window.draggedProcessIndex = null;
window.currentProcessData = window.currentProcessData || [];
window.latestP50Md = 0;
window.masterPresets = {};

const defaultPresets = {
    dev: { 
        label: "🔬 기본 신규 개발", 
        processHeaders: ["공정명", "타입구분", "투입(명)", "입력(MD/일)"], 
        processData: [
            { name: "자재 입고 및 검수", q: 1, m: 2.0, pType: 'md' }, 
            { name: "베이스 프레임 조립", q: 2, m: 3.0, pType: 'md' }, 
            { name: "상부 유닛 조립", q: 3, m: 5.0, pType: 'md' }, 
            { name: "전장 배선", q: 2, m: 4.0, pType: 'schedule_elec' }, 
            { name: "I/O 체크 및 제어", q: 1, m: 3.0, pType: 'schedule_ctrl' }
        ], 
        curve: 95, uncert: 10, diff: 1.0, rework: 5, buffer: 5, pSenior: 0, pMid: 4, pJunior: 0, 
        internal: 4, labor: 300000, plannedExpense: 0, hex: '#4f46e5', colorClass: 'bg-gradient-to-r from-indigo-500 to-purple-500' 
    }
};

window.escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
window.toNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const matched = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return matched ? Number(matched[0]) : fallback;
};
window.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
window.parseJsonLikeText = (rawText) => {
    const raw = String(rawText || '').trim();
    const candidates = [ raw, raw.replace(/^```json\s*/i, '').replace(/^```/i, '').replace(/```$/i, '').trim() ];
    const firstBrace = raw.indexOf('{'), lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        candidates.push(raw.slice(firstBrace, lastBrace + 1));
    }
    for (const candidate of candidates) { try { return JSON.parse(candidate); } catch (_) {} }
    throw new Error('AI 응답을 JSON으로 해석하지 못했습니다.');
};


// ============================================================================
// 2. 마스터 프리셋 관리
// ============================================================================
window.loadMasterPresets = async () => { 
    try { 
        const sRef = doc(db, "settings", "general");
        const sSnap = await getDoc(sRef); 
        if (!sSnap.exists() || !sSnap.data().presetsInitialized) { 
            await setDoc(sRef, { presetsInitialized: true }, { merge: true });
            for (let key in defaultPresets) { await setDoc(doc(db, "master_presets", key), defaultPresets[key]); } 
        } 
        const snap = await getDocs(collection(db, "master_presets")); 
        window.masterPresets = {}; 
        if(!snap.empty) { snap.forEach(d => { window.masterPresets[d.id] = d.data(); }); } 
        else { window.masterPresets = JSON.parse(JSON.stringify(defaultPresets)); } 
        if(window.refreshPresetDropdown) window.refreshPresetDropdown(); 
    } catch(e) { 
        window.masterPresets = JSON.parse(JSON.stringify(defaultPresets)); 
    } 
};

window.refreshPresetDropdown = () => { 
    const sel = document.getElementById('eq-type'); if(!sel) return; 
    const cur = sel.value; sel.innerHTML = ''; 
    for(let key in window.masterPresets) { 
        sel.innerHTML += '<option value="' + key + '">' + (window.masterPresets[key].label || key) + '</option>'; 
    } 
    if(window.masterPresets[cur]) sel.value = cur; else sel.selectedIndex = 0; 
};

window.setDefaultPreset = async () => { 
    const id = document.getElementById('eq-type')?.value; if(!id) return;
    try { await setDoc(doc(db, "settings", "general"), { defaultPreset: id }, { merge: true }); window.showToast("기본 프리셋 지정됨."); } catch(e) { window.showToast("실패", "error"); } 
};

window.deleteCurrentPreset = async () => { 
    const id = document.getElementById('eq-type')?.value; if(!id) return;
    if(Object.keys(window.masterPresets).length <= 1) return window.showToast("최소 1개는 유지해야 합니다.", "error");
    if(confirm("삭제하시겠습니까?")) { 
        await deleteDoc(doc(db, "master_presets", id)); delete window.masterPresets[id]; 
        window.refreshPresetDropdown(); window.handleTypeChange(); window.showToast("삭제됨."); 
    } 
};

window.saveCurrentAsPreset = async () => { 
    const id = prompt("ID (예: new_type_01):"); if(!id) return; 
    const label = prompt("이름 (예: 신규 검사기):"); if(!label) return;
    const pData = { 
        label: label, 
        processHeaders: ["공정명", "타입구분", "투입(명)", "입력(MD/일)"], 
        processData: window.currentProcessData.map(p => { 
            let pt = p.pType || (p.isAuto ? 'auto' : 'md'); 
            let newP = {name: p.name || "", q: Number(p.q) || 0, m: Number(p.m) || 0, pType: pt}; 
            if (pt === 'auto' && p.unitData) { newP.unitData = p.unitData.map(u => ({name: u.name || "", q: Number(u.q) || 0, m: Number(u.m) || 0})); } 
            return newP; 
        }), 
        curve: Number(document.getElementById('learning-curve')?.value) || 95, 
        uncert: Number(document.getElementById('mc-uncertainty')?.value) || 5, 
        diff: Number(document.getElementById('diff-multiplier')?.value) || 1.0, 
        rework: Number(document.getElementById('rework-rate')?.value) || 2, 
        buffer: Number(document.getElementById('buffer-rate')?.value) || 3, 
        pSenior: Number(document.getElementById('p-senior')?.value) || 0, 
        pMid: Number(document.getElementById('p-mid')?.value) || 0, 
        pJunior: Number(document.getElementById('p-junior')?.value) || 0, 
        internal: Number(document.getElementById('internal-personnel')?.value) || 0, 
        labor: Number(document.getElementById('labor-cost')?.value) || 300000, 
        plannedExpense: Number(document.getElementById('planned-expense')?.value) || 0, 
        hex: '#8b5cf6', colorClass: 'bg-gradient-to-r from-violet-500 to-purple-500' 
    }; 
    try { 
        await setDoc(doc(db, "master_presets", id), pData); window.masterPresets[id] = pData; window.refreshPresetDropdown();
        document.getElementById('eq-type').value = id; window.showToast(`등록되었습니다.`); 
    } catch(e) { window.showToast(`실패: ${e.message}`, "error"); } 
};


// ============================================================================
// 3. 공정/유닛 데이터 렌더링 및 조작
// ============================================================================
window.handleTypeChange = (isL = false) => {
    const eqEl = document.getElementById('eq-type'); if(!eqEl) return;
    const p = window.masterPresets[eqEl.value]; if(!p) return;
    if(!isL) {
        window.currentProcessData = JSON.parse(JSON.stringify(p.processData)).map(d => { 
            let pt=d.pType||(d.isAuto?'auto':'md'); 
            let nP={...d, o:pt==='auto'?0:Number((d.m*0.85).toFixed(1)), p:pt==='auto'?0:Number((d.m*1.3).toFixed(1)), pType:pt}; 
            if(pt==='auto'&&d.unitData){ nP.unitData=d.unitData.map(u=>({...u,o:Number((u.m*0.85).toFixed(1)),p:Number((u.m*1.3).toFixed(1))})); } 
            return nP; 
        });
        ['curve','uncert','diff','rework','buffer','pSenior','pMid','pJunior','internal','labor','plannedExpense'].forEach(k=>{ 
            let e = document.getElementById(k==='internal'?'internal-personnel':k==='labor'?'labor-cost':k==='curve'?'learning-curve':k.replace(/[A-Z]/g, m=>"-"+m.toLowerCase())); 
            if(e && p[k] !== undefined) e.value = p[k]; 
        });
    }
    window.handleMethodChange();
};

window.handleMethodChange = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    document.querySelectorAll('.mc-only').forEach(e => e.style.display = method === 'mc'?'block':'none');
    const pHead = document.getElementById('process-thead');
    if(pHead) {
        let h = `<tr><th class="px-4 py-3 text-left w-1/3">공정명</th><th class="px-2 text-center w-32">유형</th><th class="px-2 text-center w-16">수량</th>`;
        if(method==='mc') h+=`<th class="px-2 text-center w-20">단위MD</th><th class="px-4 text-right w-24">소계</th>`; 
        else h+=`<th class="px-2 text-center w-16">최빈</th><th class="px-2 text-center text-emerald-600 w-16">낙관</th><th class="px-2 text-center text-rose-600 w-16">비관</th>`;
        h+=`<th class="px-2 text-center w-24"><i class="fa-solid fa-gear"></i></th></tr>`; pHead.innerHTML=h;
    }
    if(window.renderUnitTables) window.renderUnitTables();
    if(window.renderProcessTable) window.renderProcessTable(); 
    window.debouncedRunSimulation();
};

window.debouncedRunSimulation = () => { 
    clearTimeout(simTimer); 
    simTimer = setTimeout(() => { window.runSimulation(); }, 300); 
};

window.addProcessRow = () => { window.currentProcessData.push({name:"신규 공정",q:1,m:1.0,pType:'md'}); window.renderProcessTable(); window.debouncedRunSimulation(); };
window.deleteProcessRow = (i) => { window.currentProcessData.splice(i,1); window.renderProcessTable(); window.renderUnitTables(); window.debouncedRunSimulation(); };
window.updateProcessData = (i, f, v) => { 
    window.currentProcessData[i][f] = v; 
    if(f==='pType' && v==='auto' && !window.currentProcessData[i].unitData) {
        window.currentProcessData[i].unitData = [{name:"신규",q:1,m:1.0,o:0.9,p:1.4}]; 
        window.renderProcessTable(); window.renderUnitTables(); 
    } 
    window.debouncedRunSimulation(); 
};
window.renderProcessTable = () => {
    const m = document.getElementById('sim-method')?.value||'mc', tb = document.getElementById('process-tbody');
    if(!tb) return; tb.innerHTML=''; 
    window.currentProcessData.forEach((p, i) => {
        let pt=p.pType||'md', tr=document.createElement('tr'); tr.className=pt==='auto'?"bg-indigo-50/30":"hover:bg-indigo-50/20 transition-colors";
        let sel=`<select onchange="window.updateProcessData(${i},'pType',this.value)" class="table-input w-full text-[11px] font-bold"><option value="auto" ${pt==='auto'?'selected':''}>⚙️ 유닛</option><option value="md" ${pt==='md'?'selected':''}>🛠️ 수동</option><option value="schedule_elec" ${pt==='schedule_elec'?'selected':''}>⚡ 전장(일정)</option><option value="schedule_ctrl" ${pt==='schedule_ctrl'?'selected':''}>💻 제어(일정)</option><option value="schedule_insp" ${pt==='schedule_insp'?'selected':''}>🔍 검사(일정)</option><option value="schedule_test" ${pt==='schedule_test'?'selected':''}>🚗 시운전</option></select>`;
        let act=`<div class="flex justify-center gap-2">${pt==='auto'?`<div class="text-slate-300 p-1"><i class="fa-solid fa-lock"></i></div>`:`<button onclick="window.deleteProcessRow(${i})" class="text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can"></i></button>`}</div>`;
        let h='';
        if(pt==='auto'){ 
            let um=0; (p.unitData||[]).forEach(u=>um+=(parseFloat(u.q)||0)*(parseFloat(u.m)||0)); let ed=(um/(parseFloat(p.q)||1)).toFixed(1); 
            h=`<td class="px-3 py-2"><input value="${p.name}" oninput="window.updateProcessData(${i},'name',this.value)" class="w-full text-xs font-bold text-indigo-700 bg-transparent outline-none"></td><td class="px-1 py-2">${sel}</td><td class="px-1 py-2"><input type="number" value="${p.q}" min="1" oninput="window.updateProcessData(${i},'q',Number(this.value))" class="table-input w-full text-right text-sm font-black text-indigo-700 calc-trigger"></td>`;
            if(m==='mc') h+=`<td class="px-2 py-2 text-right font-bold text-indigo-600"><span id="p-days-${i}">${ed}</span> 일</td><td class="px-4 py-2 text-right font-bold text-indigo-900"><span id="p-sub-${i}">${um.toFixed(1)}</span> MD</td>`;
            else h+=`<td colspan="3" class="px-4 py-2 text-center text-[11px] text-indigo-500">(자동)</td>`; h+=`<td class="px-2 text-center">${act}</td>`;
        } else { 
            let iL=pt.startsWith('schedule')?"일":"MD", sV=pt.startsWith('schedule')?"-":(parseFloat(p.q)*parseFloat(p.m)).toFixed(1);
            let qI=pt.startsWith('schedule')?`<div class="text-center text-slate-400">-</div>`:`<input type="number" value="${p.q}" min="0" oninput="window.updateProcessData(${i},'q',Number(this.value))" class="table-input w-full text-right text-sm font-semibold calc-trigger">`; 
            let sH="";
            if(m==='mc') sH=`<td class="px-4 py-1.5 text-right font-bold text-slate-700" id="p-sub-${i}">${sV}</td>`; 
            else sH=`<td class="px-1 py-1.5"><input type="number" value="${p.o}" step="0.1" oninput="window.updateProcessData(${i},'o',Number(this.value))" class="table-input w-full text-right text-sm font-bold text-emerald-700 calc-trigger"></td><td class="px-1 py-1.5"><input type="number" value="${p.p}" step="0.1" oninput="window.updateProcessData(${i},'p',Number(this.value))" class="table-input w-full text-right text-sm font-bold text-rose-700 calc-trigger"></td>`;
            h=`<td class="px-3 py-1.5"><input value="${p.name}" oninput="window.updateProcessData(${i},'name',this.value)" class="table-input w-full text-xs font-bold"></td><td class="px-1 py-1.5">${sel}</td><td class="px-1 py-1.5">${qI}</td><td class="px-1 py-1.5 relative"><input type="number" value="${p.m}" step="0.1" oninput="window.updateProcessData(${i},'m',Number(this.value))" class="table-input w-full text-right text-sm calc-trigger pr-6"><span class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">${iL}</span></td>${sH}<td class="px-2 text-center">${act}</td>`;
        }
        tr.innerHTML=h; tb.appendChild(tr);
    }); 
};


// ============================================================================
// 4. 핵심 시뮬레이션 계산 로직
// ============================================================================
window.runSimulation = () => {
    try {
        const method = document.getElementById('sim-method')?.value||'mc';
        const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value)||1);
        const curve = (parseFloat(document.getElementById('learning-curve')?.value)||95)/100;
        const iters = method==='mc' ? (parseInt(document.getElementById('mc-iterations')?.value)||5000) : 5000;
        const uncert = method==='mc' ? (parseFloat(document.getElementById('mc-uncertainty')?.value)||5)/100 : 0.05;
        const diff = parseFloat(document.getElementById('diff-multiplier')?.value)||1.0;
        const rBase = (parseFloat(document.getElementById('rework-rate')?.value)||0)/100;
        const bBase = (parseFloat(document.getElementById('buffer-rate')?.value)||0)/100;
        
        const sen = parseInt(document.getElementById('p-senior')?.value)||0, mid = parseInt(document.getElementById('p-mid')?.value)||0, jun = parseInt(document.getElementById('p-junior')?.value)||0;
        const rP = sen+mid+jun; const pers = rP<1?1:rP; const sMult = rP<1?1.0:(sen*0.8+mid*1.0+jun*1.2)/rP;
        
        if(document.getElementById('out-total-personnel')) document.getElementById('out-total-personnel').innerText=rP; 
        if(document.getElementById('out-avg-skill')) document.getElementById('out-avg-skill').innerText=sMult.toFixed(2);
        
        const inP = parseInt(document.getElementById('internal-personnel')?.value)||0;
        const lCost = parseFloat(document.getElementById('labor-cost')?.value)||300000; 
        const pExp = parseFloat(document.getElementById('planned-expense')?.value)||0; 
        const stD = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());
        const tgD = document.getElementById('target-date')?.value;
        
        let lR = Math.max(0.7, Math.pow(curve, Math.log2(qty))); 
        let bArr = new Float32Array(iters), rArr = new Float32Array(iters), tMd = 0, scDays = 0;
        
        window.currentProcessData.forEach((p,i) => {
            let pt = p.pType||'md';
            if(pt==='auto') { let um=0; (p.unitData||[]).forEach(u=>um+=(parseFloat(u.q)||0)*(parseFloat(u.m)||0)); tMd+=um; } 
            else if(pt==='md') tMd+=(parseFloat(p.q)||0)*(parseFloat(p.m)||0); 
            else if(pt.startsWith('schedule')) scDays+=parseFloat(p.m)||0;
        });

        for(let i=0; i<iters; i++) {
            let im=0; 
            window.currentProcessData.forEach(p => {
                let pt=p.pType||'md';
                if(pt==='auto') { (p.unitData||[]).forEach(u=>{ let m=parseFloat(u.m)||0, q=parseFloat(u.q)||0; if(m>0&&q>0) im+=q*Math.max(0, method==='mc'?window.getNormalRandom(m,(m*uncert)/3):window.getTriangularRandom(m*0.85,m,m*1.3)); }); }
                else if(pt==='md') { let m=parseFloat(p.m)||0,q=parseFloat(p.q)||0; if(m>0&&q>0) im+=q*Math.max(0, method==='mc'?window.getNormalRandom(m,(m*uncert)/3):window.getTriangularRandom(m*0.85,m,m*1.3)); }
            });
            bArr[i] = (im*qty)*diff*lR*(1+Math.max(0,window.getNormalRandom(rBase,(rBase*0.1)/3)))*(1+Math.max(0,window.getNormalRandom(bBase,(bBase*0.1)/3))); 
            rArr[i] = bArr[i]*sMult;
        }
        
        rArr.sort(); const p10=rArr[Math.floor(iters*0.1)]||0, p50=rArr[Math.floor(iters*0.5)]||0, p90=rArr[Math.floor(iters*0.9)]||0; window.latestP50Md = parseFloat(p50.toFixed(1));
        const d10=Math.ceil(p10/pers), d50=Math.ceil(p50/pers), d90=Math.ceil(p90/pers); 
        const dt10=window.calculateWorkDate(stD, d10), dt50=window.calculateWorkDate(stD, d50), dt90=window.calculateWorkDate(stD, d90);
        
        ['p50','p10','p90'].forEach((k,i)=>{ 
            const v=[p50,p10,p90][i], d=[d50,d10,d90][i], dt=[dt50,dt10,dt90][i]; 
            if(document.getElementById('out-' + k + '-md')) document.getElementById('out-' + k + '-md').innerText=v.toFixed(1); 
            if(document.getElementById('out-' + k + '-date')) document.getElementById('out-' + k + '-date').innerText=window.getLocalDateStr(dt); 
            if(document.getElementById('out-' + k + '-dur')) document.getElementById('out-' + k + '-dur').innerText=d; 
            if(document.getElementById('out-' + k + '-cost')) document.getElementById('out-' + k + '-cost').innerText=Math.round(v*lCost+pExp).toLocaleString(); 
        });

        if(document.getElementById('out-iters')) document.getElementById('out-iters').innerText = iters.toLocaleString();
        if(document.getElementById('out-ccpm-buffer')) document.getElementById('out-ccpm-buffer').innerText = Math.max(0, d90-d50);

        window.latestHistData={results:rArr, hex:window.masterPresets[document.getElementById('eq-type')?.value]?.hex||'#8b5cf6'};
        
        // 차트 및 간트 렌더링 호출
        if(window.renderChartJS) window.renderChartJS(); 
        if(window.renderGanttChart) window.renderGanttChart();
    } catch(e) { console.error("시뮬레이션 연산 에러:", e); }
};

window.renderChartJS = () => {
    const canvas = document.getElementById('chart-canvas'); if(!canvas) return; const ctx = canvas.getContext('2d'); if(window.theChart) window.theChart.destroy();
    if(window.currentTab === 'hist' && window.latestHistData) {
        const res = window.latestHistData.results; if(!res||res.length===0) return;
        const min = res[0], max = res[res.length-1], bins = new Array(30).fill(0), lbls = new Array(30).fill(''), bs = (max-min)/30||1;
        res.forEach(v => { let i=Math.floor((v-min)/bs); if(i>=30)i=29; if(i>=0)bins[i]++; }); 
        for(let i=0;i<30;i++) lbls[i]=(min+i*bs).toFixed(0);
        window.theChart = new Chart(ctx, { type: 'bar', data: { labels: lbls, datasets: [{ data: bins, backgroundColor: window.latestHistData.hex, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
};

window.renderGanttChart = () => {
    const ganttEl = document.getElementById('gantt-container'); if(!ganttEl) return;
    const startDateStr = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());
    let totalDays = 0;
    window.currentProcessData.forEach(p => {
        let pt = p.pType || 'md';
        if(pt === 'auto') { let pUnitMd = 0; (p.unitData || []).forEach(u => pUnitMd += (parseFloat(u.q)||0)*(parseFloat(u.m)||0)); totalDays += pUnitMd / (parseFloat(p.q)||1); } 
        else { totalDays += parseFloat(p.m) || 0; }
    });
    if(totalDays <= 0) totalDays = 1;
    let curDayOffset = 0;
    let html = '<div class="relative flex flex-col gap-3 pt-6 pb-2 min-w-[900px] z-10">';
    window.currentProcessData.forEach((item) => {
        let pt = item.pType || 'md'; let days = 0;
        if(pt === 'auto') { let pUnitMd = 0; (item.unitData || []).forEach(u => pUnitMd += (parseFloat(u.q)||0)*(parseFloat(u.m)||0)); days = pUnitMd / (parseFloat(item.q)||1); } 
        else { days = parseFloat(item.m) || 0; }
        if(days <= 0) return; 
        
        let startD = window.calculateWorkDate(startDateStr, Math.floor(curDayOffset));
        let endD = window.calculateWorkDate(startDateStr, Math.floor(curDayOffset + days - 0.0001));
        
        let leftPct = (curDayOffset / totalDays) * 100; let widthPct = (days / totalDays) * 100;
        let sStr = window.getLocalDateStr(startD).substring(5).replace('-','/'); let eStr = window.getLocalDateStr(endD).substring(5).replace('-','/');
        html += `<div class="flex items-center text-xs group z-10">
            <div class="w-56 font-bold truncate pr-4 text-right">${item.name}</div>
            <div class="flex-1 relative h-7 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                <div class="gantt-bar absolute top-0 h-full rounded-full bg-indigo-400 flex items-center justify-center px-2" style="left: ${leftPct}%; width: ${widthPct}%; min-width: 70px;">
                     <span class="text-white text-[10px] font-bold">${days.toFixed(1)}일</span>
                </div>
            </div>
            <div class="w-[100px] text-left text-slate-400 font-mono text-[11px] pl-4">${sStr} ~ ${eStr}</div>
        </div>`;
        curDayOffset += days;
    });
    html += '</div>'; ganttEl.innerHTML = html;
};


// ============================================================================
// 5. Excel 다운로드
// ============================================================================
window.exportToExcel = async function() {
    if (typeof ExcelJS === 'undefined') return window.showToast("ExcelJS 라이브러리가 로드되지 않았습니다.", "error");
    try {
        const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('시뮬레이션_보고서', {views: [{showGridLines: false}]});
        ws.columns = [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];
        let r=1; 
        ws.getCell(`A${r}`).value="■ 공정 데이터"; ws.getCell(`A${r}`).font={bold:true}; r++;
        ['공정명','타입','수량','기준MD','-'].forEach((t,i)=>{ ws.getCell(`${String.fromCharCode(65+i)}${r}`).value=t; }); r++;
        window.currentProcessData.forEach(p => { 
            ws.getCell(`A${r}`).value=p.name; ws.getCell(`B${r}`).value=p.pType; ws.getCell(`C${r}`).value=p.q; ws.getCell(`D${r}`).value=p.m; ws.getCell(`E${r}`).value="-"; r++; 
        });
        const b = await wb.xlsx.writeBuffer();
        saveAs(new Blob([b]), `AXMS_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
        window.showToast("엑셀 저장 성공");
    } catch(e) { window.showToast("엑셀 실패","error"); }
};


// ============================================================================
// 6. AI 심층 분석 및 벤치마킹 (Groq / OpenAI API)
// ============================================================================
const AI_PROVIDER_CONFIG = {
    groq: { label: 'Groq', defaultModel: 'llama-3.3-70b-versatile', endpoint: '[https://api.groq.com/openai/v1/chat/completions](https://api.groq.com/openai/v1/chat/completions)' },
    openai: { label: 'OpenAI', defaultModel: 'gpt-4o-mini', endpoint: '[https://api.openai.com/v1/chat/completions](https://api.openai.com/v1/chat/completions)' }
};

window.getAiApiSettings = () => {
    return { 
        provider: localStorage.getItem('axms_ai_provider') || 'groq', 
        model: localStorage.getItem('axms_ai_model') || 'llama-3.3-70b-versatile', 
        key: localStorage.getItem('axms_ai_key') || localStorage.getItem('axms_groq_key') || '' 
    };
};

window.toggleAiApiPanel = (forceValue = null) => { 
    const panel = document.getElementById('ai-api-panel-wrap'); if (!panel) return; 
    const shouldOpen = forceValue === null ? panel.classList.contains('hidden') : !!forceValue; 
    panel.classList.toggle('hidden', !shouldOpen); 
};

window.saveAiApiSettings = () => {
    const provider = document.getElementById('ai-api-provider')?.value || 'groq';
    const model = document.getElementById('ai-api-model')?.value || AI_PROVIDER_CONFIG[provider].defaultModel;
    const key = document.getElementById('ai-api-key')?.value.trim();
    if (!key) return window.showToast('API 키를 입력해주세요.', 'error');
    localStorage.setItem('axms_ai_provider', provider); localStorage.setItem('axms_ai_model', model); localStorage.setItem('axms_ai_key', key);
    window.showToast('AI API 설정이 저장되었습니다.'); window.toggleAiApiPanel(false);
};

window.fetchAiContent = async (promptText) => {
    const settings = window.getAiApiSettings();
    if (!settings.key) throw new Error('API 키가 설정되지 않았습니다.');
    const req = {
        url: AI_PROVIDER_CONFIG[settings.provider].endpoint,
        options: {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.key}` },
            body: JSON.stringify({ model: settings.model, messages: [ { role: 'system', content: '전문 PMO로서 핵심만 JSON으로 반환하세요.' }, { role: 'user', content: promptText } ], temperature: 0.7 })
        }
    };
    const res = await fetch(req.url, req.options);
    if (!res.ok) throw new Error('API 호출 실패');
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
};

window.generateGroqComparison = async () => {
    const checkboxes = document.querySelectorAll('.sim-proj-checkbox:checked');
    if (checkboxes.length === 0) return window.showToast('비교할 과거 프로젝트를 선택해주세요.', 'error');
    window.showToast("AI 분석을 시작합니다...");
    try {
        const prompt = `당신은 제조 자동화 설비 PMO 벤치마킹 전문가입니다. 반드시 다음 JSON 키값으로 반환하세요: summary, fitLevel, dataQuality, confidence, benchmarkGapMd, benchmarkGapPercent, recommendedForecastMd, mainFinding, caution, actions(배열), executiveComment.`;
        const response = await window.fetchAiContent(prompt);
        const parsed = window.parseJsonLikeText(response);
        console.log("AI 비교 분석 성공:", parsed);
        window.showToast("분석이 완료되었습니다. (콘솔에서 결과 확인)", "success");
        // HTML UI가 준비되면 이곳에서 render 함수를 호출하세요.
    } catch (e) {
        window.showToast(`AI 분석 실패: ${e.message}`, "error");
    }
};

window.generateGroqInsight = async () => {
    window.showToast("AI 심층 분석을 시작합니다...");
    try {
        const prompt = `당신은 제조 설비 프로젝트 PMO 분석 전문가입니다. 반드시 다음 JSON 키값으로 반환하세요: summary, riskLevel, riskScore, confidence, scheduleImpactDays, costImpactKrw, mainRisk, cause, actions(배열), executiveComment.`;
        const response = await window.fetchAiContent(prompt);
        const parsed = window.parseJsonLikeText(response);
        console.log("AI 심층 분석 성공:", parsed);
        window.showToast("심층 분석이 완료되었습니다. (콘솔에서 결과 확인)", "success");
        // HTML UI가 준비되면 이곳에서 render 함수를 호출하세요.
    } catch (e) {
        window.showToast(`AI 분석 실패: ${e.message}`, "error");
    }
};
