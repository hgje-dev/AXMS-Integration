/* eslint-disable */
import { db } from './firebase.js';
import { 
    collection, doc, setDoc, getDoc, getDocs, 
    addDoc, deleteDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SIMULATION_DRIVE_FOLDER_ID = "1qyW-Ym_16tpRUUE0NQuFmwxg3IadF70e";
const simulationWorker = new Worker('./js/Worker/simulationWorker.js'); 

window.currentProcessData = window.currentProcessData || [];
window.latestP50Md = 0;
window.masterPresets = {};

// 💡 1. 화면 처음 그릴 때 쓸 기본 프리셋 강제 주입
const defaultPresets = {
    dev: { 
        label: "🔬 기본 신규 개발 모델", 
        processData: [
            { name: "자재 입고 및 검수", q: 1, m: 2.0, pType: 'md' }, 
            { name: "베이스 프레임 조립", q: 2, m: 3.0, pType: 'md' }, 
            { name: "상부 유닛 조립", q: 3, m: 5.0, pType: 'md' }, 
            { name: "전장 배선", q: 2, m: 4.0, pType: 'md' }, 
            { name: "I/O 체크 및 제어", q: 1, m: 3.0, pType: 'md' }
        ], 
        curve: 95, labor: 300000, hex: '#4f46e5' 
    }
};

// ==========================================
// 2. Web Worker 리스너
// ==========================================
simulationWorker.onmessage = function(e) {
    const { p10, p50, p90, d10, d50, d90, rArr } = e.data;
    
    window.latestP50Md = parseFloat(p50.toFixed(1));
    const lCost = parseFloat(document.getElementById('labor-cost')?.value) || 300000; 
    const pExp = parseFloat(document.getElementById('planned-expense')?.value) || 0; 
    
    // 날짜가 비어있으면 오늘 날짜 삽입
    let stD = document.getElementById('start-date')?.value;
    if(!stD) {
        stD = window.getLocalDateStr(new Date());
        const sdEl = document.getElementById('start-date');
        if(sdEl) sdEl.value = stD;
    }

    const results = { p10, p50, p90 };
    const durations = { p10: d10, p50: d50, p90: d90 };

    // 안전하게 UI 업데이트 (옵셔널 체이닝 적용)
    ['p50', 'p10', 'p90'].forEach((k) => { 
        const val = results[k];
        const dur = durations[k];
        const dt = window.calculateWorkDate(stD, dur);
        
        const mdEl = document.getElementById(`out-${k}-md`);
        if(mdEl) mdEl.innerText = val.toFixed(1); 
        
        const dateEl = document.getElementById(`out-${k}-date`);
        if(dateEl) dateEl.innerText = window.getLocalDateStr(dt); 
        
        const durEl = document.getElementById(`out-${k}-dur`);
        if(durEl) durEl.innerText = dur; 
    });

    window.latestHistData = { 
        results: rArr, 
        hex: window.masterPresets[document.getElementById('eq-type')?.value]?.hex || '#4f46e5' 
    };
    
    if(window.renderChartJS) window.renderChartJS(); 
    if(window.renderGanttChart) window.renderGanttChart();
};

// ==========================================
// 3. 시뮬레이션 실행
// ==========================================
window.runSimulation = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value) || 1);
    const curve = (parseFloat(document.getElementById('learning-curve')?.value) || 95) / 100;
    const iters = 5000;
    const uncert = 0.05;
    const diff = parseFloat(document.getElementById('diff-multiplier')?.value) || 1.0;
    const rBase = (parseFloat(document.getElementById('rework-rate')?.value) || 2) / 100;
    const bBase = (parseFloat(document.getElementById('buffer-rate')?.value) || 3) / 100;
    
    const sen = parseInt(document.getElementById('p-senior')?.value) || 0;
    const mid = parseInt(document.getElementById('p-mid')?.value) || 4; 
    const jun = parseInt(document.getElementById('p-junior')?.value) || 0;
    const rP = sen + mid + jun; 
    const pers = rP < 1 ? 1 : rP; 
    const sMult = rP < 1 ? 1.0 : (sen * 0.8 + mid * 1.0 + jun * 1.2) / rP;

    const itersEl = document.getElementById('out-iters');
    if(itersEl) itersEl.innerText = iters.toLocaleString();

    const tPersEl = document.getElementById('out-total-personnel');
    if(tPersEl) tPersEl.innerText = rP;

    const avgEl = document.getElementById('out-avg-skill');
    if(avgEl) avgEl.innerText = sMult.toFixed(2);

    simulationWorker.postMessage({
        method, qty, curve, iters, uncert, diff, rBase, bBase, pers, sMult,
        processData: window.currentProcessData
    });
};

window.debouncedRunSimulation = () => {
    if (window.simTimer) clearTimeout(window.simTimer);
    window.simTimer = setTimeout(window.runSimulation, 300);
};

// ==========================================
// 4. 프리셋 데이터 연동 및 렌더링
// ==========================================
window.loadMasterPresets = async () => {
    try {
        const snap = await getDocs(collection(db, "sim_master_presets"));
        window.masterPresets = {};
        
        if (!snap.empty) {
            snap.forEach(d => { window.masterPresets[d.id] = d.data(); });
        } else {
            window.masterPresets = JSON.parse(JSON.stringify(defaultPresets));
        }
        
        // 💡 화면 이동 시 드롭다운 껍데기가 비워지므로 다시 채움
        const sel = document.getElementById('eq-type');
        if (sel) {
            sel.innerHTML = '<option value="">프리셋 선택</option>';
            for (let key in window.masterPresets) {
                sel.innerHTML += `<option value="${key}">${window.masterPresets[key].label}</option>`;
            }
            if(sel.options.length > 1) sel.selectedIndex = 1;
        }
        
        window.handleTypeChange();
    } catch (e) { console.error("Presets Load Error", e); }
};

window.handleTypeChange = () => {
    const sel = document.getElementById('eq-type');
    if (!sel) return;

    // 💡 라우터 이동으로 인해 드롭다운이 비워져 있다면 다시 채움
    if (sel.options.length <= 1 && Object.keys(window.masterPresets).length > 0) {
        sel.innerHTML = '<option value="">프리셋 선택</option>';
        for (let key in window.masterPresets) {
            sel.innerHTML += `<option value="${key}">${window.masterPresets[key].label}</option>`;
        }
        if(sel.options.length > 1) sel.selectedIndex = 1;
    }

    const id = sel.value;
    if (!id || !window.masterPresets[id]) return;
    
    const preset = window.masterPresets[id];
    window.currentProcessData = JSON.parse(JSON.stringify(preset.processData));
    
    const cEl = document.getElementById('learning-curve');
    if (cEl && preset.curve) cEl.value = preset.curve;
    
    const lEl = document.getElementById('labor-cost');
    if (lEl && preset.labor) lEl.value = preset.labor;
    
    window.handleMethodChange();
};

window.handleMethodChange = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const pHead = document.getElementById('process-thead');
    
    if(pHead) {
        let h = `<tr>
            <th class="px-4 py-3 text-left w-1/3 text-[11px] font-bold text-slate-500">공정명</th>
            <th class="px-2 text-center w-24 text-[11px] font-bold text-slate-500">유형</th>
            <th class="px-2 text-center w-16 text-[11px] font-bold text-slate-500">수량</th>`;
        if(method === 'mc') h += `<th class="px-2 text-center w-24 text-[11px] font-bold text-indigo-600">기준MD</th>`;
        else h += `<th class="px-2 text-center w-16 text-[11px] font-bold text-slate-500">최빈</th><th class="px-2 text-center text-emerald-600 w-16 text-[11px] font-bold">낙관</th><th class="px-2 text-center text-rose-600 w-16 text-[11px] font-bold">비관</th>`;
        h += `<th class="px-2 text-center w-16 text-slate-400"><i class="fa-solid fa-gear"></i></th></tr>`;
        pHead.innerHTML = h;
    }

    window.renderProcessTable();
    window.debouncedRunSimulation();
};

window.setupAutoSaveTriggers = () => {
    const triggers = document.querySelectorAll('.calc-trigger');
    triggers.forEach(el => {
        el.removeEventListener('input', window.debouncedRunSimulation);
        el.addEventListener('input', window.debouncedRunSimulation);
    });
};

window.renderProcessTable = () => {
    const m = document.getElementById('sim-method')?.value || 'mc';
    const tb = document.getElementById('process-tbody');
    if (!tb) return;
    tb.innerHTML = '';

    window.currentProcessData.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        
        let mdInputs = "";
        if (m === 'mc') {
            mdInputs = `<td class="p-1.5"><input type="number" value="${p.m}" step="0.1" oninput="window.updateProcessData(${i}, 'm', this.value)" class="w-full text-right bg-slate-50 border border-slate-200 focus:bg-white text-sm font-bold text-indigo-600 calc-trigger rounded px-2 py-1.5 outline-indigo-500"></td>`;
        } else {
            mdInputs = `<td class="p-1"><input type="number" value="${p.m}" step="0.1" oninput="window.updateProcessData(${i}, 'm', this.value)" class="w-full text-right bg-slate-50 border border-slate-200 focus:bg-white text-sm calc-trigger rounded px-1 py-1.5 outline-indigo-500"></td>
                        <td class="p-1"><input type="number" value="${p.o || (p.m*0.8).toFixed(1)}" step="0.1" oninput="window.updateProcessData(${i}, 'o', this.value)" class="w-full text-right bg-emerald-50 border border-emerald-200 focus:bg-white text-sm font-bold text-emerald-600 calc-trigger rounded px-1 py-1.5 outline-emerald-500"></td>
                        <td class="p-1"><input type="number" value="${p.p || (p.m*1.2).toFixed(1)}" step="0.1" oninput="window.updateProcessData(${i}, 'p', this.value)" class="w-full text-right bg-rose-50 border border-rose-200 focus:bg-white text-sm font-bold text-rose-600 calc-trigger rounded px-1 py-1.5 outline-rose-500"></td>`;
        }

        tr.innerHTML = `
            <td class="p-1.5"><input type="text" value="${p.name}" oninput="window.updateProcessData(${i}, 'name', this.value)" class="w-full bg-slate-50 border border-slate-200 focus:bg-white text-xs font-bold rounded px-3 py-2 outline-indigo-500 text-slate-700"></td>
            <td class="p-1.5 text-center">
                <select onchange="window.updateProcessData(${i}, 'pType', this.value)" class="text-xs border border-slate-200 rounded bg-slate-50 p-2 cursor-pointer outline-indigo-500 font-bold text-slate-600 w-full">
                    <option value="md" ${p.pType === 'md' ? 'selected' : ''}>🛠 수동</option>
                    <option value="auto" ${p.pType === 'auto' ? 'selected' : ''}>⚙ 유닛</option>
                </select>
            </td>
            <td class="p-1.5"><input type="number" value="${p.q}" min="1" oninput="window.updateProcessData(${i}, 'q', this.value)" class="w-full text-right bg-slate-50 border border-slate-200 focus:bg-white text-sm font-black text-slate-700 calc-trigger rounded px-2 py-1.5 outline-indigo-500"></td>
            ${mdInputs}
            <td class="p-1.5 text-center"><button onclick="window.deleteProcessRow(${i})" class="text-slate-300 hover:text-rose-500 w-8 h-8 rounded-lg transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
        `;
        tb.appendChild(tr);
    });
    window.setupAutoSaveTriggers();
};

window.updateProcessData = (i, field, val) => {
    window.currentProcessData[i][field] = field === 'name' ? val : parseFloat(val);
    window.debouncedRunSimulation();
};

window.addProcessRow = () => {
    window.currentProcessData.push({ name: "신규 공정", q: 1, m: 1.0, pType: 'md' });
    window.renderProcessTable();
    window.debouncedRunSimulation();
};

window.deleteProcessRow = (i) => {
    window.currentProcessData.splice(i, 1);
    window.renderProcessTable();
    window.debouncedRunSimulation();
};

// ==========================================
// 7. 시각화 (ChartJS & Gantt)
// ==========================================
window.renderChartJS = () => {
    const canvas = document.getElementById('chart-canvas');
    if (!canvas || !window.latestHistData) return;
    const ctx = canvas.getContext('2d');
    if (window.theChart) window.theChart.destroy();

    const res = window.latestHistData.results;
    if(!res || res.length === 0) return;
    
    const min = res[0], max = res[res.length-1];
    const bins = new Array(30).fill(0);
    const bs = (max - min) / 30 || 1;
    
    res.forEach(v => {
        let idx = Math.floor((v - min) / bs);
        if (idx >= 30) idx = 29;
        bins[idx]++;
    });

    window.theChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: bins.map((_, i) => (min + i * bs).toFixed(0)),
            datasets: [{
                data: bins,
                backgroundColor: window.latestHistData.hex,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: '#94a3b8', font: {size: 9} } } }
        }
    });
};

window.renderGanttChart = () => {
    const container = document.getElementById('gantt-container');
    if (!container) return;
    const startStr = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());
    
    let totalDays = 0;
    window.currentProcessData.forEach(p => { totalDays += parseFloat(p.m) || 0; });
    if (totalDays <= 0) totalDays = 1;

    let html = '<div class="flex flex-col gap-3 py-2">';
    let offset = 0;
    window.currentProcessData.forEach(p => {
        const days = parseFloat(p.m) || 0;
        if (days <= 0) return;
        const width = (days / totalDays) * 100;
        const left = (offset / totalDays) * 100;
        
        html += `
            <div class="flex items-center text-[11px] group">
                <div class="w-40 truncate pr-4 text-right font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">${p.name}</div>
                <div class="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden border border-slate-200">
                    <div class="absolute h-full bg-indigo-500 shadow-md flex items-center justify-center text-white font-bold text-[9px]" 
                         style="left: ${left}%; width: ${width}%;">
                        ${days.toFixed(1)}d
                    </div>
                </div>
            </div>
        `;
        offset += days;
    });
    html += '</div>';
    container.innerHTML = html;
};

// ==========================================
// 8. AI 연동
// ==========================================
window.generateGroqInsight = async () => {
    if (!window.latestP50Md) return window.showToast("먼저 시뮬레이션을 실행해주세요.", "error");
    window.showToast("AI 심층 분석을 요청 중입니다...", "success");
    const bBox = document.getElementById('ai-briefing-text');
    if(bBox) bBox.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>AI가 분석 중입니다...</div>';

    try {
        const response = await fetch('/api/simulation/analyze', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectInfo: { p50Md: window.latestP50Md, processData: window.currentProcessData } })
        });
        if (!response.ok) throw new Error("AI 서버 에러");
        const data = await response.json();
        
        if(bBox) {
            bBox.innerHTML = `
                <div class="space-y-3 animate-fade-in">
                    <p class="text-sm leading-relaxed">${data.summary || "분석 완료"}</p>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div class="bg-slate-800 p-2 rounded"><span class="text-[10px] text-slate-400 block">리스크</span><span class="text-xs font-bold text-rose-400">${data.mainRisk||"없음"}</span></div>
                        <div class="bg-slate-800 p-2 rounded"><span class="text-[10px] text-slate-400 block">조치</span><span class="text-xs font-bold text-emerald-400">${data.action||"정상"}</span></div>
                    </div>
                </div>`;
        }
    } catch (e) {
        window.showToast("AI 분석 모듈을 사용할 수 없습니다.", "error");
        if(bBox) bBox.innerText = "서버 연결 안됨";
    }
};

// ==========================================
// 9. 다운로드
// ==========================================
window.exportToExcel = async () => {
    if (typeof ExcelJS === 'undefined') return window.showToast("엑셀 라이브러리 로딩 중", "warning");
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('시뮬레이션');
    ws.columns = [ { header: '공정명', key: 'name', width: 25 }, { header: '수량', key: 'q', width: 10 }, { header: 'MD', key: 'm', width: 10 } ];
    ws.getRow(1).font = { bold: true };
    window.currentProcessData.forEach(p => ws.addRow({ name: p.name, q: p.q, m: p.m }));
    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Simulation.xlsx`);
};

// 초기화 강제 실행 (타임아웃으로 DOM 준비 대기)
setTimeout(window.loadMasterPresets, 300);
