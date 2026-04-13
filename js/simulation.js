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
// 💡 경로 수정 완료: 대문자 W가 포함된 폴더명 적용
const simulationWorker = new Worker('./js/Worker/simulationWorker.js'); 

window.currentProcessData = window.currentProcessData || [];
window.latestP50Md = 0;
window.masterPresets = {};
window.projectLogs = [];

// ==========================================
// 2. Web Worker 이벤트 리스너 (계산 결과 수신)
// ==========================================
simulationWorker.onmessage = function(e) {
    const { p10, p50, p90, d10, d50, d90, rArr } = e.data;
    
    // UI에 결과 반영을 위한 전역 변수 업데이트
    window.latestP50Md = parseFloat(p50.toFixed(1));
    const lCost = parseFloat(document.getElementById('labor-cost')?.value) || 300000; 
    const pExp = parseFloat(document.getElementById('planned-expense')?.value) || 0; 
    const stD = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());

    // 시뮬레이션 결과 카드 업데이트
    const results = { p10, p50, p90 };
    const durations = { p10: d10, p50: d50, p90: d90 };

    ['p50', 'p10', 'p90'].forEach((k) => { 
        const val = results[k];
        const dur = durations[k];
        const dt = window.calculateWorkDate(stD, dur);
        
        if(document.getElementById(`out-${k}-md`)) document.getElementById(`out-${k}-md`).innerText = val.toFixed(1); 
        if(document.getElementById(`out-${k}-date`)) document.getElementById(`out-${k}-date`).innerText = window.getLocalDateStr(dt); 
        if(document.getElementById(`out-${k}-dur`)) document.getElementById(`out-${k}-dur`).innerText = dur; 
        if(document.getElementById(`out-${k}-cost`)) document.getElementById(`out-${k}-cost`).innerText = Math.round(val * lCost + pExp).toLocaleString(); 
    });

    if(document.getElementById('out-ccpm-buffer')) document.getElementById('out-ccpm-buffer').innerText = Math.max(0, d90 - d50);

    // 차트 및 간트차트 렌더링
    window.latestHistData = { 
        results: rArr, 
        hex: window.masterPresets[document.getElementById('eq-type')?.value]?.hex || '#4f46e5' 
    };
    
    if(window.renderChartJS) window.renderChartJS(); 
    if(window.renderGanttChart) window.renderGanttChart();
    
    window.showToast("시뮬레이션 연산 완료", "success");
};

// ==========================================
// 3. 시뮬레이션 실행 (Worker 호출)
// ==========================================
window.runSimulation = () => {
    const method = document.getElementById('sim-method')?.value || 'mc';
    const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value) || 1);
    const curve = (parseFloat(document.getElementById('learning-curve')?.value) || 95) / 100;
    const iters = method === 'mc' ? (parseInt(document.getElementById('mc-iterations')?.value) || 5000) : 5000;
    const uncert = method === 'mc' ? (parseFloat(document.getElementById('mc-uncertainty')?.value) || 5) / 100 : 0.05;
    const diff = parseFloat(document.getElementById('diff-multiplier')?.value) || 1.0;
    const rBase = (parseFloat(document.getElementById('rework-rate')?.value) || 0) / 100;
    const bBase = (parseFloat(document.getElementById('buffer-rate')?.value) || 0) / 100;
    
    const sen = parseInt(document.getElementById('p-senior')?.value) || 0;
    const mid = parseInt(document.getElementById('p-mid')?.value) || 0;
    const jun = parseInt(document.getElementById('p-junior')?.value) || 0;
    const rP = sen + mid + jun; 
    const pers = rP < 1 ? 1 : rP; 
    const sMult = rP < 1 ? 1.0 : (sen * 0.8 + mid * 1.0 + jun * 1.2) / rP;

    if(document.getElementById('out-total-personnel')) document.getElementById('out-total-personnel').innerText = rP; 
    if(document.getElementById('out-avg-skill')) document.getElementById('out-avg-skill').innerText = sMult.toFixed(2);
    if(document.getElementById('out-iters')) document.getElementById('out-iters').innerText = iters.toLocaleString();

    // 워커에 연산 위임
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
// 4. AI 연동 (보안 강화 - 백엔드 API 서버 호출)
// ==========================================
window.generateGroqInsight = async () => {
    if (!window.latestP50Md) return window.showToast("먼저 시뮬레이션을 실행해주세요.", "error");

    window.showToast("AI 심층 분석을 요청 중입니다...", "success");
    const briefingBox = document.getElementById('ai-briefing-text');
    if(briefingBox) briefingBox.innerHTML = '<div class="text-center p-4"><i class="fa-solid fa-spinner fa-spin mr-2"></i>AI가 데이터를 분석하고 있습니다...</div>';

    try {
        // 백엔드 API 호출로 변경
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
        window.showToast("AI 분석 실패 (백엔드 연결 확인 필요)", "error");
        if(briefingBox) briefingBox.innerText = "분석 중 오류가 발생했습니다.";
    }
};

// ==========================================
// 5. 프로젝트 저장/불러오기 (Firestore)
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
        authorUid: window.currentUser.uid,
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
// 6. 마스터 프리셋 및 자동 저장 트리거
// ==========================================
window.loadMasterPresets = async () => {
    try {
        const snap = await getDocs(collection(db, "sim_master_presets"));
        const sel = document.getElementById('eq-type');
        if (!sel) return;
        
        sel.innerHTML = '<option value="">프리셋 선택</option>';
        window.masterPresets = {};
        
        snap.forEach(d => {
            window.masterPresets[d.id] = d.data();
            sel.innerHTML += `<option value="${d.id}">${d.data().label}</option>`;
        });
    } catch (e) { console.error("Presets Load Error", e); }
};

window.handleTypeChange = () => {
    const id = document.getElementById('eq-type')?.value;
    if (!id || !window.masterPresets[id]) return;
    
    const preset = window.masterPresets[id];
    window.currentProcessData = JSON.parse(JSON.stringify(preset.processData));
    
    // 기본 설정값 반영
    if (preset.curve) document.getElementById('learning-curve').value = preset.curve;
    if (preset.labor) document.getElementById('labor-cost').value = preset.labor;
    
    window.renderProcessTable();
    window.debouncedRunSimulation();
};

window.handleMethodChange = () => {
    window.debouncedRunSimulation();
};

window.setupAutoSaveTriggers = () => {
    const triggers = document.querySelectorAll('.calc-trigger');
    triggers.forEach(el => {
        el.removeEventListener('input', window.debouncedRunSimulation);
        el.addEventListener('input', window.debouncedRunSimulation);
    });
};

// ==========================================
// 7. UI 렌더링 로직 (Gantt, Chart, Table)
// ==========================================
window.renderProcessTable = () => {
    const tb = document.getElementById('process-tbody');
    if (!tb) return;
    tb.innerHTML = '';

    window.currentProcessData.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition-colors";
        tr.innerHTML = `
            <td class="p-2"><input type="text" value="${p.name}" oninput="window.updateProcessData(${i}, 'name', this.value)" class="w-full border-none bg-transparent text-sm font-bold"></td>
            <td class="p-2 text-center">
                <select onchange="window.updateProcessData(${i}, 'pType', this.value)" class="text-xs border rounded p-1">
                    <option value="md" ${p.pType === 'md' ? 'selected' : ''}>🛠 수동</option>
                    <option value="auto" ${p.pType === 'auto' ? 'selected' : ''}>⚙ 유닛</option>
                </select>
            </td>
            <td class="p-2"><input type="number" value="${p.q}" oninput="window.updateProcessData(${i}, 'q', this.value)" class="w-full text-right border-none bg-transparent text-sm"></td>
            <td class="p-2"><input type="number" value="${p.m}" oninput="window.updateProcessData(${i}, 'm', this.value)" class="w-full text-right border-none bg-transparent text-sm font-bold text-indigo-600"></td>
            <td class="p-2 text-center"><button onclick="window.deleteProcessRow(${i})" class="text-slate-300 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td>
        `;
        tb.appendChild(tr);
    });
};

window.updateProcessData = (i, field, val) => {
    window.currentProcessData[i][field] = field === 'name' ? val : parseFloat(val);
    window.debouncedRunSimulation();
};

window.addProcessRow = () => {
    window.currentProcessData.push({ name: "신규 공정", q: 1, m: 1.0, pType: 'md' });
    window.renderProcessTable();
};

window.deleteProcessRow = (i) => {
    window.currentProcessData.splice(i, 1);
    window.renderProcessTable();
    window.debouncedRunSimulation();
};

window.renderChartJS = () => {
    const canvas = document.getElementById('chart-canvas');
    if (!canvas || !window.latestHistData) return;
    const ctx = canvas.getContext('2d');
    if (window.theChart) window.theChart.destroy();

    const res = window.latestHistData.results;
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
            <div class="flex items-center text-[11px]">
                <div class="w-40 truncate pr-4 text-right font-bold text-slate-600">${p.name}</div>
                <div class="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden border">
                    <div class="absolute h-full bg-indigo-500/80 flex items-center justify-center text-white font-bold" 
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
// 8. 엑셀 다운로드 (ExcelJS)
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
    
    window.currentProcessData.forEach(p => {
        ws.addRow({ name: p.name, type: p.pType, q: p.q, m: p.m });
    });
    
    const buffer = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `AXMS_Simulation_${new Date().getTime()}.xlsx`);
    window.showToast("엑셀 파일이 다운로드되었습니다.");
};

// 초기화 실행
window.loadMasterPresets();
