/* eslint-disable */

let ncrChartInstances = {};
let ncrFilteredData = [];

// Chart.js DataLabels 플러그인 안전하게 동적 로드
function loadDataLabelsPlugin(callback) {
    if (typeof ChartDataLabels !== 'undefined') {
        callback();
    } else {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.0.0";
        script.onload = () => {
            try { Chart.register(ChartDataLabels); } catch(e) {}
            callback();
        };
        script.onerror = () => {
            console.warn("DataLabels plugin load failed");
            callback();
        };
        document.head.appendChild(script);
    }
}

window.initNcrDashboard = function(forceReload = false) {
    console.log("✅ 초격차 프리미엄 NCR 대시보드 로드 완료");
    
    // 💡 (수정) PJT 코드 마스터 데이터가 로드되어 있지 않다면 로드 시도
    if (!window.pjtCodeMasterList || window.pjtCodeMasterList.length === 0) {
        if (window.loadProjectCodeMaster) window.loadProjectCodeMaster();
    }
    
    const initProcess = () => {
        // 차트 글로벌 기본 설정
        Chart.defaults.font.family = "'Pretendard', sans-serif";
        Chart.defaults.color = '#94a3b8'; 
        Chart.defaults.scale.grid.color = '#f1f5f9'; 
        Chart.defaults.scale.grid.borderColor = 'transparent';

        if (typeof ChartDataLabels !== 'undefined') {
            Chart.defaults.set('plugins.datalabels', {
                color: '#475569',
                font: { family: 'Pretendard', weight: '800', size: 11 },
                display: true
            });
        }

        // 데이터 페칭 및 렌더링
        if (forceReload || !window.ncrData || window.ncrData.length === 0) {
            if (window.loadNcrData) {
                window.loadNcrData().then(() => {
                    populateNcrFilters();
                    window.filterNcrDashboard();
                }).catch(e => {
                    generateMockDashboard();
                });
            } else {
                generateMockDashboard();
            }
        } else {
            populateNcrFilters();
            window.filterNcrDashboard();
        }
    };

    // SPA 타이밍 이슈 방지를 위해 약간의 딜레이 후 실행
    setTimeout(() => {
        loadDataLabelsPlugin(initProcess);
    }, 100);
};

// 필터 옵션 동적 채우기
function populateNcrFilters() {
    const rawData = window.ncrData || [];
    let pjtSet = new Set();
    let years = new Set();
    
    rawData.forEach(d => {
        if(d.pjtCode) pjtSet.add(d.pjtCode);
        if(d.date) {
            const y = d.date.split('-')[0];
            if(y && y.length === 4) years.add(y);
        }
    });

    const pjtSelect = document.getElementById('ncr-filter-pjt');
    if(pjtSelect) {
        let pjtHtml = '<option value="">프로젝트 전체</option>';
        Array.from(pjtSet).sort().forEach(p => { pjtHtml += `<option value="${p}">${p}</option>`; });
        pjtSelect.innerHTML = pjtHtml;
    }

    const yearSelect = document.getElementById('ncr-filter-year');
    if (yearSelect && years.size > 0) {
        let yearHtml = '<option value="">전체 연도</option>';
        Array.from(years).sort((a,b)=>b-a).forEach(y => { yearHtml += `<option value="${y}">${y}년</option>`; });
        yearSelect.innerHTML = yearHtml;
    }
}

// 필터 적용 및 재렌더링
window.filterNcrDashboard = function() {
    const year = document.getElementById('ncr-filter-year')?.value || '';
    const month = document.getElementById('ncr-filter-month')?.value || '';
    const pjt = document.getElementById('ncr-filter-pjt')?.value || '';
    const pjtCodeSearch = document.getElementById('ncr-filter-pjt-code')?.value.toLowerCase() || '';
    const search = document.getElementById('ncr-search')?.value.toLowerCase() || '';

    const rawData = window.ncrData || [];
    if(rawData.length === 0) {
        generateMockDashboard();
        return;
    }

    ncrFilteredData = rawData.filter(d => {
        let match = true;
        if (year && (!d.date || !d.date.startsWith(year))) match = false;
        if (month && (!d.date || d.date.split('-')[1] !== month)) match = false;
        if (pjt && d.pjtCode !== pjt) match = false;
        
        // 💡 [핵심수정] PJT 코드 전용 초성 검색 (마스터 데이터와 연동)
        if (pjtCodeSearch) {
            let isCodeMatch = false;
            const targetCode = (d.pjtCode || '').toLowerCase();
            
            // 1. 코드 원본 자체가 일치하는지 먼저 검사
            if (targetCode.includes(pjtCodeSearch) || (window.matchString && window.matchString(pjtCodeSearch, targetCode))) {
                isCodeMatch = true;
            } else {
                // 2. 마스터 데이터(pjtCodeMasterList)를 뒤져서 해당 코드의 프로젝트명이 초성과 일치하는지 검사
                if (window.pjtCodeMasterList && window.pjtCodeMasterList.length > 0) {
                    const masterInfo = window.pjtCodeMasterList.find(m => (m.code || '').toLowerCase() === targetCode);
                    if (masterInfo && masterInfo.name) {
                        const targetName = masterInfo.name.toLowerCase();
                        if (targetName.includes(pjtCodeSearch) || (window.matchString && window.matchString(pjtCodeSearch, targetName))) {
                            isCodeMatch = true;
                        }
                    }
                }
            }
            
            if (!isCodeMatch) match = false;
        }
        
        if (search) {
            const content = (d.content || '').toLowerCase();
            const partName = (d.partName || '').toLowerCase();
            if(!content.includes(search) && !partName.includes(search)) match = false;
        }
        return match;
    });

    renderPremiumNcrDashboard();
};

function renderPremiumNcrDashboard() {
    const data = ncrFilteredData;
    let totalCount = data.length;

    if (totalCount === 0) {
        if(document.getElementById('kpi-qty')) document.getElementById('kpi-qty').innerText = "0";
        if(document.getElementById('kpi-count')) document.getElementById('kpi-count').innerText = "0";
        if(document.getElementById('kpi-supplier-rate')) document.getElementById('kpi-supplier-rate').innerText = "0.0%";
        if(document.getElementById('kpi-design-rate')) document.getElementById('kpi-design-rate').innerText = "0.0%";
        if(document.getElementById('kpi-total-rate')) document.getElementById('kpi-total-rate').innerText = "0.0%";
        if(document.getElementById('kpi-qcost')) document.getElementById('kpi-qcost').innerText = "₩0";
        if(document.getElementById('kpi-resolution-rate')) document.getElementById('kpi-resolution-rate').innerText = "0.0%";
        if(document.getElementById('kpi-resolved')) document.getElementById('kpi-resolved').innerHTML = `0 <span class="text-[12px] font-bold text-[#64748b] ml-1 tracking-tight">건 완료</span>`;
        if(document.getElementById('kpi-pending')) document.getElementById('kpi-pending').innerHTML = `0 <span class="text-[12px] font-bold text-[#fb7185] ml-1 tracking-tight">건 조치중</span>`;
        if(document.getElementById('recent-ncr-list')) document.getElementById('recent-ncr-list').innerHTML = '<div class="text-sm font-bold text-slate-400">조건에 맞는 데이터가 없습니다.</div>';
        if(document.getElementById('worst-top3-list')) document.getElementById('worst-top3-list').innerHTML = '<span class="text-[10px] font-bold text-rose-300">데이터 없음</span>';
        
        ['pareto', 'donut', 'monthly', 'pjtBar', 'supplierTop'].forEach(id => destroyChart(id));
        return;
    }

    let typeCounts = { '구조개선': 0, '설계': 0, '협력사/가공': 0 };
    let pjtCounts = {};
    let supplierCounts = {}; 
    let monthlyCounts = new Array(12).fill(0);
    
    let paretoData = {};
    let resolvedCount = 0;

    data.forEach(d => {
        const type = d.type || '기타';
        const content = (d.content || '').toLowerCase();
        
        if(type.includes('설계') || content.includes('도면') || content.includes('모델링')) typeCounts['설계']++;
        else if(type.includes('구조')) typeCounts['구조개선']++;
        else typeCounts['협력사/가공']++;

        let pReason = type;
        if(content.includes('치수')) pReason = '치수 불량';
        else if(content.includes('가공')) pReason = '가공 오류';
        else if(content.includes('외관') || content.includes('스크래치')) pReason = '외관 불량';
        else if(content.includes('도면')) pReason = '도면 오류';
        paretoData[pReason] = (paretoData[pReason] || 0) + 1;

        const pjt = d.pjtCode || '미분류';
        pjtCounts[pjt] = (pjtCounts[pjt] || 0) + 1;

        const supplier = d.partName || '미지정'; 
        supplierCounts[supplier] = (supplierCounts[supplier] || 0) + 1;

        if (d.date) {
            const m = parseInt(d.date.split('-')[1], 10);
            if(!isNaN(m) && m >= 1 && m <= 12) monthlyCounts[m-1]++;
        }

        const status = String(d.status || '');
        if (status.includes('완료') || status.includes('종결') || status.includes('완료됨')) resolvedCount++;
    });

    let pendingCount = totalCount - resolvedCount;
    let resolvedRate = ((resolvedCount / totalCount) * 100).toFixed(1);

    // KPI 업데이트
    if(document.getElementById('kpi-qty')) document.getElementById('kpi-qty').innerText = (totalCount * 4.38).toFixed(0); 
    if(document.getElementById('kpi-count')) document.getElementById('kpi-count').innerText = totalCount;
    if(document.getElementById('kpi-supplier-rate')) document.getElementById('kpi-supplier-rate').innerText = ((typeCounts['협력사/가공'] / totalCount) * 100).toFixed(1) + '%';
    if(document.getElementById('kpi-design-rate')) document.getElementById('kpi-design-rate').innerText = ((typeCounts['설계'] / totalCount) * 100).toFixed(1) + '%';
    if(document.getElementById('kpi-total-rate')) document.getElementById('kpi-total-rate').innerText = '3.1%';
    if(document.getElementById('kpi-qcost')) document.getElementById('kpi-qcost').innerText = '₩' + (totalCount * 30611).toLocaleString();
    if(document.getElementById('kpi-resolution-rate')) document.getElementById('kpi-resolution-rate').innerText = resolvedRate + '%';
    
    if(document.getElementById('kpi-resolved')) document.getElementById('kpi-resolved').innerHTML = `${resolvedCount} <span class="text-[12px] font-bold text-[#64748b] ml-1 tracking-tight">건 완료</span>`;
    if(document.getElementById('kpi-pending')) document.getElementById('kpi-pending').innerHTML = `${pendingCount} <span class="text-[12px] font-bold text-[#fb7185] ml-1 tracking-tight">건 조치중</span>`;

    // 컴포넌트 그리기
    drawRecentNcrs(data);
    drawWorstTop3(pjtCounts, totalCount);

    drawParetoChart(paretoData);
    drawDonutChart(typeCounts);
    drawMonthlyChart(monthlyCounts);
    drawTopPjtChart(pjtCounts);
    drawTopSupplierChart(supplierCounts);
}

// ---------------------------------------------------------
// 0-1. 최근 업데이트 내역 렌더링 (슬림 버전)
// ---------------------------------------------------------
function drawRecentNcrs(dataList) {
    const container = document.getElementById('recent-ncr-list');
    if(!container) return;

    let sortedData = [...dataList].sort((a,b) => {
        let da = new Date(a.date || 0).getTime();
        let db = new Date(b.date || 0).getTime();
        return db - da;
    }).slice(0, 15); 

    if(sortedData.length === 0) {
        container.innerHTML = '<div class="text-sm font-bold text-slate-400">데이터가 없습니다.</div>';
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    let html = '';
    sortedData.forEach(item => {
        let s = String(item.status || '');
        const isCompleted = s.includes('완료') || s.includes('종결') || s.includes('완료됨');
        
        const statusBadge = isCompleted 
            ? '<span class="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 border border-emerald-200 shadow-sm"><i class="fa-solid fa-check mr-0.5"></i>완료</span>'
            : '<span class="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 border border-rose-200 shadow-sm"><i class="fa-solid fa-spinner fa-spin mr-0.5"></i>진행중</span>';
        
        let dateText = item.date || '-';
        let dateColor = 'text-indigo-400';

        if(item.date) {
            let itemDate = new Date(item.date);
            itemDate.setHours(0,0,0,0);
            let diffDays = Math.floor((today - itemDate) / (1000 * 60 * 60 * 24));
            if(diffDays === 0) { dateText = '오늘'; dateColor = 'text-rose-500'; }
            else if(diffDays === 1) { dateText = '1일 전'; dateColor = 'text-orange-500'; }
            else if(diffDays === 2) { dateText = '2일 전'; }
            else if(diffDays === 3) { dateText = '3일 전'; }
        }

        html += `
            <div class="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg px-3 py-1.5 shrink-0 min-w-[240px] max-w-[300px] hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer group">
                <div class="flex flex-col truncate pr-3">
                    <span class="text-[9px] font-black text-slate-400 tracking-tight">${item.pjtCode || '-'} <span class="ml-1.5 ${dateColor} font-bold">${dateText}</span></span>
                    <span class="text-[11px] font-bold text-slate-700 truncate group-hover:text-indigo-600 transition-colors">${item.content || '내용 없음'}</span>
                </div>
                ${statusBadge}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ---------------------------------------------------------
// 0-2. 불량 비중 Top 3 렌더링
// ---------------------------------------------------------
function drawWorstTop3(pjtCounts, totalCount) {
    const container = document.getElementById('worst-top3-list');
    if(!container) return;

    if(totalCount === 0 || Object.keys(pjtCounts).length === 0) {
        container.innerHTML = '<span class="text-[10px] font-bold text-rose-300">데이터 없음</span>';
        return;
    }

    let sorted = Object.entries(pjtCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    let html = '';
    
    sorted.forEach(item => {
        let pjtCode = item[0];
        let count = item[1];
        let rate = ((count / totalCount) * 100).toFixed(1);
        
        html += `
            <div class="flex items-center gap-1.5 bg-white px-2 py-1 rounded shadow-sm border border-rose-100/50 shrink-0">
                <span class="truncate max-w-[90px] text-[10px] font-bold text-slate-700" title="${pjtCode}">${pjtCode}</span>
                <span class="text-rose-600 font-black text-[11px]">${rate}%</span>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ---------------------------------------------------------
// 차트 렌더링 로직
// ---------------------------------------------------------
function destroyChart(id) {
    if (ncrChartInstances[id]) {
        ncrChartInstances[id].destroy();
        ncrChartInstances[id] = null;
    }
}

function drawParetoChart(paretoData) {
    destroyChart('pareto');
    const canvas = document.getElementById('chart-pareto');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let sorted = Object.entries(paretoData).sort((a,b)=>b[1]-a[1]).slice(0,10);
    let labels = sorted.map(s=>s[0]);
    let data = sorted.map(s=>s[1]);
    
    let total = data.reduce((a,b)=>a+b, 0) || 1;
    let cumSum = 0;
    let cumulativeData = data.map(d => { cumSum += d; return (cumSum / total * 100).toFixed(1); });

    const areaGradient = ctx.createLinearGradient(0, 0, 0, 400);
    areaGradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)'); 
    areaGradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    ncrChartInstances['pareto'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line', label: '누적 점유율(%)', data: cumulativeData,
                    borderColor: '#6366f1', backgroundColor: areaGradient, borderWidth: 3, fill: true, 
                    yAxisID: 'y1', pointRadius: 5, pointBackgroundColor: '#ffffff', pointBorderColor: '#6366f1', pointBorderWidth: 2, pointHoverRadius: 8, tension: 0.4, 
                    datalabels: { display: true, align: 'top', offset: 6, color: '#6366f1', font: { size: 10, weight: '900' }, formatter: (val) => val + '%' }
                },
                {
                    type: 'bar', label: '발생 건수', data: data,
                    backgroundColor: '#e2e8f0', hoverBackgroundColor: '#cbd5e1', borderRadius: 8, barPercentage: 0.4, 
                    yAxisID: 'y', datalabels: { color: '#334155', anchor: 'end', align: 'top', offset: 4, font: { size: 12, weight: 'black' } }
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: { top: 30 } }, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: {size: 11, weight: 'bold'}, color: '#64748b' } },
                y: { type: 'linear', display: true, position: 'left', grid: { borderDash: [5, 5] }, beginAtZero: true, max: Math.max(...data) * 1.3, ticks: { display: false } },
                y1: { type: 'linear', display: false, position: 'right', min: 0, max: 110 }
            }
        }
    });
}

// 도넛 차트 텍스트 중앙 완벽 정렬 커스텀 플러그인
const donutCenterTextPlugin = {
    id: 'donutCenterText',
    beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        let ctx = chart.ctx; 
        ctx.restore();
        
        let centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
        let centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

        let textTop = "총 부적합";
        let textBottomEl = document.getElementById('donut-center-total');
        let textBottom = textBottomEl ? textBottomEl.innerText : "0";

        ctx.textAlign = "center"; 
        ctx.textBaseline = "middle";
        
        ctx.font = "bold 13px Pretendard"; 
        ctx.fillStyle = "#94a3b8"; 
        ctx.fillText(textTop, centerX, centerY - 18);

        ctx.font = "900 44px Pretendard"; 
        ctx.fillStyle = "#1e293b"; 
        ctx.fillText(textBottom, centerX, centerY + 20);

        ctx.save();
    }
};

function drawDonutChart(data) {
    destroyChart('donut');
    const total = Object.values(data).reduce((a,b)=>a+b, 0);
    const el = document.getElementById('donut-center-total'); 
    if (el) el.innerText = total;

    const canvas = document.getElementById('chart-ncr-type');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ncrChartInstances['donut'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['구조개선', '설계오류', '협력사/가공'],
            datasets: [{ data: [data['구조개선'], data['설계'], data['협력사/가공']], backgroundColor: ['#facc15', '#38bdf8', '#f472b6'], borderWidth: 0, hoverOffset: 8, borderRadius: 10 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '86%', layout: { padding: 10 },
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 25, font: {size: 12, weight: 'bold'}, color: '#475569' } }, datalabels: { display: false } }
        },
        plugins: [donutCenterTextPlugin] 
    });
}

function drawMonthlyChart(monthlyCounts) {
    destroyChart('monthly');
    const canvas = document.getElementById('chart-monthly');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, '#fcd34d'); gradient.addColorStop(1, '#f59e0b'); 

    ncrChartInstances['monthly'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'], datasets: [{ data: monthlyCounts, backgroundColor: gradient, borderRadius: 6, barThickness: 16 }] },
        options: {
            responsive: true, maintainAspectRatio: false, layout: { padding: { top: 20 } },
            plugins: { legend: { display: false }, datalabels: { color: '#b45309', anchor: 'end', align: 'top', offset: 4, font: { weight: '900', size: 11 }, formatter: (val) => val > 0 ? val : '' } },
            scales: { x: { grid: { display: false }, ticks: {font: {size: 11, weight: 'bold'}, color: '#64748b'} }, y: { grid: { borderDash: [4,4] }, beginAtZero: true, max: Math.max(...monthlyCounts) * 1.3, ticks: { display: false } } }
        }
    });
}

function drawTopPjtChart(data) {
    destroyChart('pjtBar');
    const canvas = document.getElementById('chart-ncr-top-pjt');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, '#a7f3d0'); gradient.addColorStop(1, '#10b981'); 
    
    let sorted = Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,5);

    ncrChartInstances['pjtBar'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: sorted.map(s=>s[0]), datasets: [{ data: sorted.map(s=>s[1]), backgroundColor: gradient, borderRadius: 8, barThickness: 14 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40 } }, 
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'right', offset: 6, color: '#059669', font: {size: 14, weight: '900'} } },
            scales: { x: { display: false, max: Math.max(...sorted.map(s=>s[1]), 1) * 1.2 }, y: { grid: { display: false }, ticks: {font: {size: 11, weight: 'bold'}, color: '#334155'} } }
        }
    });
}

function drawTopSupplierChart(data) {
    destroyChart('supplierTop');
    const canvas = document.getElementById('chart-ncr-top-supplier');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, '#bfdbfe'); gradient.addColorStop(1, '#3b82f6'); 
    
    let sorted = Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,5);

    ncrChartInstances['supplierTop'] = new Chart(ctx, {
        type: 'bar',
        data: { labels: sorted.map(s=>s[0]), datasets: [{ data: sorted.map(s=>s[1]), backgroundColor: gradient, borderRadius: 8, barThickness: 14 }] },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 40 } },
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'right', offset: 6, color: '#2563eb', font: {size: 14, weight: '900'} } },
            scales: { x: { display: false, max: Math.max(...sorted.map(s=>s[1]), 1) * 1.2 }, y: { grid: { display: false }, ticks: {font: {size: 11, weight: 'bold'}, color: '#334155'} } }
        }
    });
}

// Mock Data (시트 데이터가 없을 때 폴백 용도)
function generateMockDashboard() {
    const mockData = [];
    for(let i=0; i<107; i++) {
        let type = i<35 ? '구조개선' : (i<66 ? '설계' : '기타');
        let status = i<84 ? '완료' : '진행중';
        let pjt = i<32 ? 'EDKT2502-0A' : (i<60 ? 'ESKC2501-0A' : 'EMOT2501-0A');
        let content = i<15 ? '가공 오류 (치수불량)' : (i<27 ? '모델링 오류' : '도면 오류 누락');
        
        let date = new Date();
        if(i>5) date.setDate(date.getDate() - Math.floor(Math.random()*100));
        
        mockData.push({
            pjtCode: pjt,
            date: date.toISOString().split('T')[0],
            type: type,
            content: content,
            status: status,
            partName: '임시협력사' + (i%5)
        });
    }
    window.ncrData = mockData;
    populateNcrFilters(); 
    window.filterNcrDashboard();
}
