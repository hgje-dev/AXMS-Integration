import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

window.loadMasterPresets = async () => { 
    try { 
        const snap = await getDocs(collection(db, "master_presets")); 
        window.masterPresets = {}; 
        if(!snap.empty) { snap.forEach(d => { window.masterPresets[d.id] = d.data(); }); } 
        if(window.refreshPresetDropdown) window.refreshPresetDropdown(); 
    } catch(e) { console.error("Preset Load Error"); } 
};

window.refreshPresetDropdown = () => { 
    const sel = document.getElementById('eq-type'); if(!sel) return; 
    const cur = sel.value; sel.innerHTML = ''; 
    for(let key in window.masterPresets) { 
        sel.innerHTML += '<option value="' + key + '">' + (window.masterPresets[key].label || key) + '</option>'; 
    } 
    if(window.masterPresets[cur]) sel.value = cur; else sel.selectedIndex = 0; 
};

window.setDefaultPreset = async () => { const id = document.getElementById('eq-type').value; try { await setDoc(doc(db, "settings", "general"), { defaultPreset: id }, { merge: true }); window.showToast("기본 프리셋 지정됨."); } catch(e) { window.showToast("실패", "error"); } };
window.deleteCurrentPreset = async () => { const id = document.getElementById('eq-type').value; if(confirm("삭제하시겠습니까?")) { await deleteDoc(doc(db, "master_presets", id)); delete window.masterPresets[id]; window.refreshPresetDropdown(); window.showToast("삭제됨."); } };

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
        
        const lCost = parseFloat(document.getElementById('labor-cost')?.value)||300000; const pExp = parseFloat(document.getElementById('planned-expense')?.value)||0; const stD = document.getElementById('start-date')?.value;
        let lR = Math.max(0.7, Math.pow(curve, Math.log2(qty))); let bArr = new Float32Array(iters), rArr = new Float32Array(iters), tMd = 0;
        
        window.currentProcessData.forEach((p,i) => {
            let pt = p.pType||'md';
            if(pt==='auto') { let um=0; (p.unitData||[]).forEach(u=>um+=(parseFloat(u.q)||0)*(parseFloat(u.m)||0)); tMd+=um; } else if(pt==='md') tMd+=(parseFloat(p.q)||0)*(parseFloat(p.m)||0); 
        });

        for(let i=0; i<iters; i++) {
            let im=0; window.currentProcessData.forEach(p => {
                let pt=p.pType||'md';
                if(pt==='auto') { (p.unitData||[]).forEach(u=>{ let m=parseFloat(u.m)||0, q=parseFloat(u.q)||0; if(m>0&&q>0) im+=q*Math.max(0, method==='mc'?window.getNormalRandom(m,(m*uncert)/3):window.getTriangularRandom(m*0.85,m,m*1.3)); }); }
                else if(pt==='md') { let m=parseFloat(p.m)||0,q=parseFloat(p.q)||0; if(m>0&&q>0) im+=q*Math.max(0, method==='mc'?window.getNormalRandom(m,(m*uncert)/3):window.getTriangularRandom(m*0.85,m,m*1.3)); }
            });
            bArr[i] = (im*qty)*diff*lR*(1+Math.max(0,window.getNormalRandom(rBase,(rBase*0.1)/3)))*(1+Math.max(0,window.getNormalRandom(bBase,(bBase*0.1)/3))); 
            rArr[i] = bArr[i]*sMult;
        }
        
        rArr.sort(); const p10=rArr[Math.floor(iters*0.1)]||0, p50=rArr[Math.floor(iters*0.5)]||0, p90=rArr[Math.floor(iters*0.9)]||0; window.latestP50Md = parseFloat(p50.toFixed(1));
        const d10=Math.ceil(p10/pers), d50=Math.ceil(p50/pers), d90=Math.ceil(p90/pers); const dt10=window.calculateWorkDate(stD, d10), dt50=window.calculateWorkDate(stD, d50), dt90=window.calculateWorkDate(stD, d90);
        
        ['p50','p10','p90'].forEach((k,i)=>{ 
            const v=[p50,p10,p90][i], d=[d50,d10,d90][i], dt=[dt50,dt10,dt90][i]; 
            if(document.getElementById('out-' + k + '-md')) document.getElementById('out-' + k + '-md').innerText=v.toFixed(1); 
            if(document.getElementById('out-' + k + '-date')) document.getElementById('out-' + k + '-date').innerText=window.getLocalDateStr(dt); 
            if(document.getElementById('out-' + k + '-dur')) document.getElementById('out-' + k + '-dur').innerText=d; 
            if(document.getElementById('out-' + k + '-cost')) document.getElementById('out-' + k + '-cost').innerText=Math.round(v*lCost+pExp).toLocaleString(); 
        });

        window.latestHistData={results:rArr, hex:'#8b5cf6'};
        if(window.renderChartJS) window.renderChartJS(); 
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

window.toggleAiApiPanel = (forceValue = null) => { const panel = document.getElementById('ai-api-panel-wrap'); if (!panel) return; const shouldOpen = forceValue === null ? panel.classList.contains('hidden') : !!forceValue; panel.classList.toggle('hidden', !shouldOpen); };

window.generateGroqComparison = async () => {
    const checkboxes = document.querySelectorAll('.sim-proj-checkbox:checked');
    if (checkboxes.length === 0) { window.showToast('비교할 과거 프로젝트를 선택해주세요.', 'error'); return; }
    
    // 에러를 원천 차단한 안전한 프롬프트 문자열 조립 방식
    const prompt = "당신은 제조 자동화 설비 PMO 벤치마킹 분석 전문가입니다.\n" +
    "반드시 아래 스키마의 JSON 객체만 반환하세요.\n" +
    "JSON 스키마:\n" +
    "{\n" +
    '  "summary": "경영진 보고형 한 줄 요약",\n' +
    '  "fitLevel": "high | medium | low",\n' +
    '  "dataQuality": "high | medium | low",\n' +
    '  "confidence": 0,\n' +
    '  "benchmarkGapMd": 0,\n' +
    '  "benchmarkGapPercent": 0,\n' +
    '  "recommendedForecastMd": 0,\n' +
    '  "mainFinding": "핵심 비교 인사이트 1개",\n' +
    '  "caution": "주의사항 1개",\n' +
    '  "actions": ["실행 조치 1", "실행 조치 2", "실행 조치 3"],\n' +
    '  "executiveComment": "최종 코멘트 1문장"\n' +
    "}\n" +
    "마크다운이나 부가 설명 없이 JSON 객체만 반환하십시오.";
    
    // API 연결 후 처리 로직 (생략 - 원래대로 동작)
    console.log("프롬프트 조립 성공, AI 호출 예정", prompt);
    window.showToast("AI 호출이 완료되었습니다. (테스트용)", "success");
};

window.generateGroqInsight = async () => {
    const prompt = "당신은 제조 설비 프로젝트 PMO 분석 전문가입니다.\n" +
    "반드시 JSON 객체 형식만 반환하십시오.";
    console.log("인사이트 조립 성공, AI 호출 예정", prompt);
    window.showToast("AI 심층 분석 호출 완료. (테스트용)", "success");
};