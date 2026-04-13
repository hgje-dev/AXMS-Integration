import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// [수정] 1. 구글 드라이브 업로드 타겟 폴더 변경
const SIMULATION_DRIVE_FOLDER = "1qyW-Ym_16tpRUUE0NQuFmwxg3IadF70e";

// [수정] 2. Web Worker 초기화
const worker = new Worker('./js/workers/simulationWorker.js');

worker.onmessage = function(e) {
    const { p10, p50, p90, d10, d50, d90, rArr } = e.data;
    const lCost = parseFloat(document.getElementById('labor-cost')?.value) || 300000; 
    const pExp = parseFloat(document.getElementById('planned-expense')?.value) || 0; 
    const stD = document.getElementById('start-date')?.value || window.getLocalDateStr(new Date());

    window.latestP50Md = parseFloat(p50.toFixed(1));

    // 결과 UI 업데이트
    ['p50','p10','p90'].forEach((k, i) => { 
        const v = [p50, p10, p90][i], d = [d50, d10, d90][i]; 
        const dt = window.calculateWorkDate(stD, d);
        
        if(document.getElementById('out-' + k + '-md')) document.getElementById('out-' + k + '-md').innerText = v.toFixed(1); 
        if(document.getElementById('out-' + k + '-date')) document.getElementById('out-' + k + '-date').innerText = window.getLocalDateStr(dt); 
        if(document.getElementById('out-' + k + '-dur')) document.getElementById('out-' + k + '-dur').innerText = d; 
        if(document.getElementById('out-' + k + '-cost')) document.getElementById('out-' + k + '-cost').innerText = Math.round(v * lCost + pExp).toLocaleString(); 
    });

    window.latestHistData = { results: rArr, hex: window.masterPresets[document.getElementById('eq-type')?.value]?.hex || '#8b5cf6' };
    if(window.renderChartJS) window.renderChartJS(); 
    if(window.renderGanttChart) window.renderGanttChart();
    
    // 로딩 UI 해제
    window.showToast("시뮬레이션 연산 완료", "success");
};

// 메인 실행 함수
window.runSimulation = () => {
    window.showToast("시뮬레이션 연산 중...", "warning");

    const method = document.getElementById('sim-method')?.value || 'mc';
    const qty = Math.max(1, parseFloat(document.getElementById('equip-qty')?.value)||1);
    const curve = (parseFloat(document.getElementById('learning-curve')?.value)||95)/100;
    const iters = method === 'mc' ? (parseInt(document.getElementById('mc-iterations')?.value)||5000) : 5000;
    const uncert = method === 'mc' ? (parseFloat(document.getElementById('mc-uncertainty')?.value)||5)/100 : 0.05;
    const diff = parseFloat(document.getElementById('diff-multiplier')?.value)||1.0;
    const rBase = (parseFloat(document.getElementById('rework-rate')?.value)||0)/100;
    const bBase = (parseFloat(document.getElementById('buffer-rate')?.value)||0)/100;
    
    const sen = parseInt(document.getElementById('p-senior')?.value)||0;
    const mid = parseInt(document.getElementById('p-mid')?.value)||0;
    const jun = parseInt(document.getElementById('p-junior')?.value)||0;
    const rP = sen + mid + jun; 
    const pers = rP < 1 ? 1 : rP; 
    const sMult = rP < 1 ? 1.0 : (sen*0.8 + mid*1.0 + jun*1.2)/rP;
    
    // Web Worker로 데이터 전송하여 연산 위임
    worker.postMessage({
        method, qty, curve, iters, uncert, diff, rBase, bBase, pers, sMult,
        processData: window.currentProcessData
    });
};

// [수정] 3. AI 연동 구조 개편 (보안 강화 - 백엔드 API 호출)
window.generateGroqInsight = async () => {
    window.showToast("AI 심층 분석을 시작합니다...");
    try {
        const payloadData = {
            projectData: window.currentProcessData,
            p50: window.latestP50Md
        };

        // 직접 Groq API를 찌르지 않고, 사내 백엔드(또는 Firebase Cloud Functions)를 호출
        const res = await fetch('https://[백엔드서버주소]/api/ai/analyze-simulation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 필요시 인증 토큰 추가
                // 'Authorization': `Bearer ${await window.currentUser.getIdToken()}`
            },
            body: JSON.stringify({ promptData: payloadData })
        });

        if (!res.ok) throw new Error('서버 에러가 발생했습니다.');
        
        const data = await res.json();
        
        // AI 분석 결과를 UI에 렌더링
        document.getElementById('ai-briefing-text').innerHTML = `
            <div class="font-bold text-indigo-300">${data.summary}</div>
            <div class="mt-2 text-rose-300">리스크 레벨: ${data.riskLevel}</div>
            <div class="mt-2 text-slate-300">${data.executiveComment}</div>
        `;
        window.showToast("심층 분석이 완료되었습니다.", "success");
    } catch (e) {
        window.showToast(`AI 분석 실패: ${e.message}`, "error");
    }
};

// (나머지 로드/저장/UI 렌더링 로직은 기존 코드 유지)
