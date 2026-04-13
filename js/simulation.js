/* eslint-disable */
import { db } from './firebase.js';
import { 
    collection, doc, setDoc, getDoc, getDocs, 
    addDoc, deleteDoc, query, where, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 1. 전역 변수 및 설정
// ==========================================
const SIMULATION_DRIVE_FOLDER_ID = "1qyW-Ym_16tpRUUE0NQuFmwxg3IadF70e";
const simulationWorker = new Worker('./js/Worker/simulationWorker.js'); 

window.currentProcessData = window.currentProcessData || [];
window.latestP50Md = 0;
window.masterPresets = {};

// 💡 날아갔던 기본 프리셋 데이터 복구! (DB가 비어있을 때 사용)
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
// 2. Web Worker 이벤트 리스너 (계산 결과 수신)
// ==========================================
simulationWorker.onmessage = function(e) {
    const { p10, p50, p90, d10, d50, d90, rArr } = e.data;
    
    window.latestP50Md = parseFloat(p50.toFixed(1));
    const lCost = parseFloat(document.getElementById('labor-cost')?.value) || 300000; 
    const pExp = parseFloat(document.getElementById('planned-expense')?.value) || 0; 
    const stD = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());

    const results = { p10, p50, p90 };
    const durations = { p10: d10, p50: d50, p90: d90 };

    ['p50', 'p10', 'p90'].forEach((k) => { 
        const val = results[k];
        const dur = durations[k];
        const dt = window.calculateWorkDate(stD, dur);
        
        if(document.getElementById(`out-${k}-md`)) document.getElementById(`out-${k}-md`).innerText = val.toFixed(1); 
        if(document.getElementById(`out-${k}-date`)) document.getElementById(`out-${k}-date`).innerText = window.getLocalDateStr(dt); 
    });

    window.latestHistData = { 
        results: rArr, 
        hex: window.masterPresets[document.getElementById('eq-type')?.value]?.hex || '#4f46e5' 
    };
    
    if(window.renderChartJS) window.renderChartJS(); 
    if(window.renderGanttChart) window.renderGanttChart();
};

// ==========================================
// 3. 시뮬레이션 실행 (Worker 호출)
// ==========================================
window.runSimulation = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value) || 1);
    const curve = (parseFloat(document.getElementById('learning-curve')?.value) || 95) / 100;
    const iters = 5000;
    const uncert = 0.05;
    const diff = parseFloat(document.getElementById('diff-multiplier')?.value) || 1.0;
    const rBase = 0.05; // 재작업률 5%
    const bBase = 0.05; // 버퍼 5%
    
    const sen = parseInt(document.getElementById('p-senior')?.value) || 0;
    const mid = parseInt(document.getElementById('p-mid')?.value) || 4; // 기본 중급 4명
    const jun = parseInt(document.getElementById('p-junior')?.value) || 0;
    const rP = sen + mid + jun; 
    const pers = rP < 1 ? 1 : rP; 
    const sMult = rP < 1 ? 1.0 : (sen * 0.8 + mid * 1.0 + jun * 1.2) / rP;

    if(document.getElementById('out-iters')) document.getElementById('out-iters').innerText = iters.toLocaleString();

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
// 4. AI 연동 (백엔드 API 서버 호출)
// ==========================================
window.generateGroqInsight = async () => {
    if (!window.latestP50Md) return window.showToast("먼저 시뮬레이션을 실행해주세요.", "error");

    window.showToast("AI 심층 분석을 요청 중입니다...", "success");
    const briefingBox = document.getElementById('ai-briefing-text');
    if(briefingBox) briefingBox.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>AI가 데이터를 분석하고 있습니다...</div>';

    try {
        const response = await fetch('/api/simulation/analyze', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectInfo: {
                    code: document.getElementById('project-code')?.value,
                    name: document.getElementById('project-name')?.value,
                    p50Md: window.latestP50Md,
                    processData: window.currentProcessData
                }
            })
        });

        if (!response.ok) throw new Error("AI 서버 응답 실패");
        const data = await response.json();
        
        if(briefingBox) {
            briefingBox.innerHTML = `
                <div class="space-y-3 animate-fade-in">
                    <div class="flex items-center gap-2 text-indigo-300 font-bold">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> AI 분석 요약
                    </div>
                    <p class="text-sm leading-relaxed">${data.summary || "분석 결과를 불러올 수 없습니다."}</p>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                        <div class="bg-white/5 p-2 rounded">
                            <span class="text-[10px] text-slate-400 block">예상 리스크</span>
                            <span class="text-xs font-bold text-rose-400">${data.mainRisk || "없음"}</span>
                        </div>
                        <div class="bg-white/5 p-2 rounded">
                            <span class="text-[10px] text-slate-400 block">권장 조치</span>
                            <span class="text-xs font-bold text-emerald-400">${data.action || "정상 진행"}</span>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        window.showToast("AI 분석 모듈이 준비되지 않았습니다.", "error");
        if(briefingBox) briefingBox.innerText = "AI 서버와 연결할 수 없습니다.";
    }
};

// ==========================================
// 5. 프로젝트 저장 (Firestore)
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
        updatedAt: serverTimestamp()
    };

    try {
        if (window.currentProjectId) {
            await setDoc(doc(db, "sim_projects", window.currentProjectId), payload, { merge: true });
        } else {
            const docRef = await addDoc(collection(db, "sim_projects"), { ...payload, createdAt: serverTimestamp() });
            window.currentProjectId = docRef.id;
        }
        if (!isSilent) window.showToast("클라우드에 저장되었습니다.");
    } catch (e) {
        window.showToast("저장 실패", "error");
    }
};

// ==========================================
// 6. 프리셋 및 테이블 동적 렌더링 복구 💡
// ==========================================
window.loadMasterPresets = async () => {
    try {
        const snap = await getDocs(collection(db, "sim_master_presets"));
        const sel = document.getElementById('eq-type');
        if (!sel) return;
        
        sel.innerHTML = '<option value="">프리셋 선택</option>';
        window.masterPresets = {};
        
        if (!snap.empty) {
            snap.forEach(d => {
                window.masterPresets[d.id] = d.data();
                sel.innerHTML += `<option value="${d.id}">${d.data().label}</option>`;
            });
        } else {
            // DB에 없으면 기본값(defaultPresets) 강제 로드!
            window.masterPresets = JSON.parse(JSON.stringify(defaultPresets));
            for (let key in window.masterPresets) {
                sel.innerHTML += `<option value="${key}">${window.masterPresets[key].label}</option>`;
            }
        }
        
        // 첫 번째 프리셋 자동 선택
        if(sel.options.length > 1) {
            sel.selectedIndex = 1;
            window.handleTypeChange();
        }
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
    
    // 테이블 헤더 (thead) 동적 생성 복구
    if(pHead) {
        let h = `<tr>
            <th class="px-4 py-3 text-left w-1/3">공정명</th>
            <th class="px-2 text-center w-24">유형</th>
            <th class="px-2 text-center w-16">수량</th>`;
        if(method === 'mc') h += `<th class="px-2 text-center w-24">기준MD</th>`;
        else h += `<th class="px-2 text-center w-16">최빈</th><th class="px-2 text-center text-emerald-600 w-16">낙관</th><th class="px-2 text-center text-rose-600 w-16">비관</th>`;
        h += `<th class="px-2 text-center w-16"><i class="fa-solid fa-gear"></i></th></tr>`;
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
            mdInputs = `<td class="p-2"><input type="number" value="${p.m}" step="0.1" oninput="window.updateProcessData(${i}, 'm', this.value)" class="w-full text-right bg-slate-50 border border-slate-200 focus:bg-white text-sm font-bold text-indigo-600 calc-trigger rounded px-2 py-1.5 outline-indigo-500"></td>`;
        } else {
            mdInputs = `<td class="p-1"><input type="number" value="${p.m}" step="0.1" oninput="window.updateProcessData(${i}, 'm', this.value)" class="w-full text-right bg-slate-50 border border-slate-200 focus:bg-white text-sm calc-trigger rounded px-1 py-1.5 outline-indigo-500"></td>
                        <td class="p-1"><input type="number" value="${p.o || (p.m*0.8).toFixed(1)}" step="0.1" oninput="window.updateProcessData(${i}, 'o', this.value)" class="w-full text-right bg-emerald-50 border border-emerald-200 focus:bg-white text-sm font-bold text-emerald-600 calc-trigger rounded px-1 py-1.5 outline-emerald-500"></td>
                        <td class="p-1"><input type="number" value="${p.p || (p.m*1.2).toFixed(1)}" step="0.1" oninput="window.updateProcessData(${i}, 'p', this.value)" class="w-full text-right bg-rose-50 border border-rose-200 focus:bg-white text-sm font-bold text-rose-600 calc-trigger rounded px-1 py-1.5 outline-rose-500"></td>`;
        }

        tr.innerHTML = `
            <td class="p-2"><input type="text" value="${p.name}" oninput="window.updateProcessData(${i}, 'name', this.value)" class="w-full bg-slate-50 border border-slate-200 focus:bg-white text-sm font-bold rounded px-3 py-1.5 outline-indigo-500"></td>
            <td class="p-2 text-center">
                <select onchange="window.updateProcessData(${i}, 'pType', this.value)" class="text-xs border border-slate-200 rounded bg-slate-50 p-1.5 cursor-pointer outline-indigo-500 font-bold text-slate-600">
                    <option value="md" ${p.pType === 'md' ? 'selected' : ''}>🛠 수동</option>
                    <option value="auto" ${p.pType === 'auto' ? 'selected' : ''}>⚙ 유닛</option>
                </select>
            </td>
            <td class="p-2"><input type="number" value="${p.q}" min="1" oninput="window.updateProcessData(${i}, 'q', this.value)" class="w-full text-right bg-slate-50 border border-slate-200 focus:bg-white text-sm calc-trigger rounded px-2 py-1.5 outline-indigo-500"></td>
            ${mdInputs}
            <td class="p-2 text-center"><button onclick="window.deleteProcessRow(${i})" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 w-8 h-8 rounded-lg transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
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
// 8. 시각화 (ChartJS & Gantt)
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
            scales: { y: { display: false }, x: { grid: { display: false } } }
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

    let html = '<div class="flex flex-col gap-3 py-4">';
    let offset = 0;
    window.currentProcessData.forEach(p => {
        const days = parseFloat(p.m) || 0;
        if (days <= 0) return;
        const width = (days / totalDays) * 100;
        const left = (offset / totalDays) * 100;
        
        html += `
            <div class="flex items-center text-[11px] group">
                <div class="w-40 truncate pr-4 text-right font-bold text-slate-600 group-hover:text-indigo-600 transition-colors">${p.name}</div>
                <div class="flex-1 bg-slate-100 rounded-full h-7 relative overflow-hidden border border-slate-200">
                    <div class="absolute h-full bg-indigo-500 shadow-md flex items-center justify-center text-white font-bold" 
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
// 9. 엑셀 다운로드 (ExcelJS)
// ==========================================
window.exportToExcel = async () => {
    if (typeof ExcelJS === 'undefined') return window.showToast("라이브러리 로딩 중입니다.", "warning");
    
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('공수시뮬레이션_결과');
    
    ws.columns = [
        { header: '공정명', key: 'name', width: 25 },
        { header: '유형', key: 'type', width: 10 },
        { header: '수량', key: 'q', width: 10 },
        { header: '기준MD', key: 'm', width: 10 }
    ];
    
    // 스타일 지정
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    ws.getRow(1).alignment = { horizontal: 'center' };

    window.currentProcessData.forEach(p => {
        const row = ws.addRow({ name: p.name, type: p.pType === 'md' ? '수동' : '유닛', q: p.q, m: p.m });
        row.eachCell(cell => { cell.alignment = { horizontal: 'center' }; });
        row.getCell(1).alignment = { horizontal: 'left' };
    });
    
    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `AXMS_Simulation_${new Date().toISOString().split('T')[0]}.xlsx`);
    window.showToast("엑셀 파일이 다운로드되었습니다.");
};

// 초기화 실행
window.loadMasterPresets();
