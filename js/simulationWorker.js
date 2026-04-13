// Web Worker for Monte Carlo & PERT Simulation
self.onmessage = function(e) {
    const data = e.data;
    const { method, qty, curve, iters, uncert, diff, rBase, bBase, pers, sMult, processData } = data;

    // 정규분포 및 삼각분포 난수 생성 함수
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

    for(let i=0; i<iters; i++) {
        let im=0; 
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
    
    rArr.sort(); 
    const p10 = rArr[Math.floor(iters * 0.1)] || 0;
    const p50 = rArr[Math.floor(iters * 0.5)] || 0;
    const p90 = rArr[Math.floor(iters * 0.9)] || 0; 
    
    // 계산 완료 후 메인 스레드로 결과 전송
    self.postMessage({
        p10, p50, p90,
        d10: Math.ceil(p10 / pers),
        d50: Math.ceil(p50 / pers),
        d90: Math.ceil(p90 / pers),
        rArr: Array.from(rArr) // 차트 렌더링용 데이터
    });
};
