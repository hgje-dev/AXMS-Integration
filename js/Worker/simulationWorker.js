// Web Worker for Monte Carlo & PERT Simulation
// ⚠️ 주의: 이곳은 백그라운드 스레드이므로 window, document 요소에 접근할 수 없습니다.

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
        if(pt === 'auto') {
            let um = 0;
            (p.unitData || []).forEach(u => um += (parseFloat(u.q)||0)*(parseFloat(u.m)||0));
            tMd += um;
        } else if(pt === 'md') {
            tMd += (parseFloat(p.q)||0)*(parseFloat(p.m)||0);
        }
    });

    for(let i = 0; i < iters; i++) {
        let im = 0; 
        processData.forEach(p => {
            let pt = p.pType || 'md';
            if(pt === 'auto') {
                (p.unitData || []).forEach(u => {
                    let m = parseFloat(u.m) || 0, q = parseFloat(u.q) || 0;
                    if(m > 0 && q > 0) im += q * Math.max(0, method === 'mc' ? getNormalRandom(m, (m*uncert)/3) : getTriangularRandom(m*0.85, m, m*1.3));
                });
            } else if(pt === 'md') {
                let m = parseFloat(p.m) || 0, q = parseFloat(p.q) || 0;
                if(m > 0 && q > 0) im += q * Math.max(0, method === 'mc' ? getNormalRandom(m, (m*uncert)/3) : getTriangularRandom(m*0.85, m, m*1.3));
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
    
    // 계산 완료 후 메인 스레드로 결과 전송
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
