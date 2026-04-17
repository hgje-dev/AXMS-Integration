import { db } from './firebase.js';
import { collection, doc, setDoc, query, onSnapshot, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let integPjtUnsubscribe = null;
let integCrUnsubscribe = null;
let integPcUnsubscribe = null;

window.integProjects = [];
window.integCrReports = [];
window.integPcReports = [];
window.integMergedData = [];

window.currentIntegFilter = 'all'; 
window.integChartInstances = {};
window.currentDashboardData = null;

const LABOR_RATE = 217440; // 1공수 당 인건비 (하드코딩 기준값)

// 💡 날짜 차이 계산 (기간 소요일)
function getDaysDiff(startStr, endStr) {
    if(!startStr || !endStr) return { days: 0, text: '-' };
    const start = new Date(startStr);
    const end = new Date(endStr);
    if(isNaN(start.getTime()) || isNaN(end.getTime())) return { days: 0, text: '-' };
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 시작일 포함
    return { days: diffDays, text: diffDays };
}

// 💡 구매팀 도넛 차트 가운데에 텍스트를 고정하기 위한 커스텀 플러그인
const donutCenterTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
        if (chart.config.type !== 'doughnut' || !chart.config.options.plugins.centerText) return;
        let ctx = chart.ctx; 
        ctx.restore();
        
        let centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
        let centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;

        let textTop = "총 예산";
        let textBottom = chart.config.options.plugins.centerText.text || "0";

        ctx.textAlign = "center"; 
        ctx.textBaseline = "middle";
        
        ctx.font = "bold 12px Pretendard"; 
        ctx.fillStyle = "#94a3b8"; 
        ctx.fillText(textTop, centerX, centerY - 14);

        ctx.font = "900 22px Pretendard"; 
        ctx.fillStyle = "#1e293b"; 
        ctx.fillText(textBottom, centerX, centerY + 12);

        ctx.save();
    }
};

window.initCompletionReport = function() {
    console.log("✅ 통합 완료보고(PJT 결산) 페이지 로드 완료");
    
    // 차트 플러그인 등 초기 세팅
    Chart.defaults.font.family = "'Pretendard', sans-serif";
    
    window.fetchIntegrationData();
};

window.fetchIntegrationData = function() {
    // 1. Projects Status (완료된 설비 프로젝트 위주)
    if (integPjtUnsubscribe) integPjtUnsubscribe();
    integPjtUnsubscribe = onSnapshot(collection(db, "projects_status"), (snap) => {
        window.integProjects = [];
        snap.forEach(d => window.integProjects.push({ id: d.id, ...d.data() }));
        mergeIntegrationData();
    });

    // 2. Project Completion Reports (품질팀 데이터 & 제조팀 1차 데이터)
    if (integCrUnsubscribe) integCrUnsubscribe();
    integCrUnsubscribe = onSnapshot(collection(db, "project_completion_reports"), (snap) => {
        window.integCrReports = [];
        snap.forEach(d => window.integCrReports.push({ id: d.id, ...d.data() }));
        mergeIntegrationData();
    });

    // 3. Product Costs (구매팀 데이터)
    if (integPcUnsubscribe) integPcUnsubscribe();
    integPcUnsubscribe = onSnapshot(collection(db, "product_costs"), (snap) => {
        window.integPcReports = [];
        snap.forEach(d => window.integPcReports.push({ id: d.id, ...d.data() }));
        mergeIntegrationData();
    });
};

function mergeIntegrationData() {
    if (window.integProjects.length === 0) return;

    window.integMergedData = [];
    
    // 💡 요구사항: "제조PJT 에서 설비에 대한 송부완료된 프로젝트만 보여주면돼!"
    // 추가 요구사항: 숨김 처리(isHiddenFromIntegration)된 프로젝트는 렌더링에서 제외 (Soft Delete)
    let completedPjts = window.integProjects.filter(p => p.status === 'completed' && p.category === '설비' && !p.isHiddenFromIntegration);

    completedPjts.forEach(pjt => {
        let crReport = window.integCrReports.find(cr => cr.projectId === pjt.id) || {};
        let pcReport = window.integPcReports.find(pc => pc.projectId === pjt.id) || {};

        let mStatus = '완료'; // projects_status가 completed이므로 무조건 완료
        let qStatus = crReport.qualityStatus || '대기중'; 
        let pStatus = pcReport.status || '대기중';       

        if(qStatus === '분석 완료') qStatus = '완료';
        if(pStatus === '분석 완료') pStatus = '완료';

        let finalStatus = (mStatus === '완료' && qStatus === '완료' && pStatus === '완료') ? '통합완료' : '작성대기';

        window.integMergedData.push({
            projectId: pjt.id,
            pjtCode: pjt.code || '-',
            pjtName: pjt.name || '알수없음',
            shipDate: pjt.d_shipEn || pjt.d_shipEst || '-',
            
            estMd: parseFloat(pjt.estMd) || 0,
            finalMd: parseFloat(pjt.finalMd) || 0,
            
            // 제조일정 관련 데이터 복사 (표 렌더링을 위해)
            d_asmEst: pjt.d_asmEst || '',
            d_asmEndEst: pjt.d_asmEndEst || '',
            d_asmSt: pjt.d_asmSt || '',
            d_asmEn: pjt.d_asmEn || '',
            
            // 품질 데이터 추출
            qStatus: qStatus,
            crData: crReport,
            
            // 구매 데이터 추출
            pStatus: pStatus,
            pcData: pcReport,

            finalStatus: finalStatus,
            updatedAt: pjt.updatedAt || 0
        });
    });

    // 최신순 정렬
    window.integMergedData.sort((a,b) => b.updatedAt - a.updatedAt);
    
    window.filterIntegrationList();
}

window.setIntegrationFilter = function(filter) {
    window.currentIntegFilter = filter;
    window.filterIntegrationList();
};

window.filterIntegrationList = function(resetStr) {
    if (resetStr === 'all') {
        window.currentIntegFilter = 'all';
        const searchInput = document.getElementById('cr-main-search');
        if(searchInput) searchInput.value = '';
    }

    const searchKeyword = document.getElementById('cr-main-search')?.value.toLowerCase().trim() || '';

    let total = 0, pending = 0, completed = 0, totalSaving = 0;
    
    let filtered = window.integMergedData.filter(d => {
        // 통계 계산
        total++;
        if (d.finalStatus === '통합완료') {
            completed++;
            // 총 예산 절감액 합산 (구매팀 actualTotal < targetCost 일때)
            const target = parseFloat(d.pcData.targetCost) || 0;
            const actual = parseFloat(d.pcData.actualTotal) || 0;
            if (target > 0 && target > actual) {
                totalSaving += (target - actual);
            }
        } else {
            pending++;
        }

        // 탭 필터 적용
        if (window.currentIntegFilter === 'pending' && d.finalStatus !== '작성대기') return false;
        if (window.currentIntegFilter === 'completed' && d.finalStatus !== '통합완료') return false;

        // 검색어 필터
        if (searchKeyword) {
            const str = `${d.pjtCode} ${d.pjtName}`.toLowerCase();
            if (!str.includes(searchKeyword) && !(window.matchString && window.matchString(searchKeyword, str))) return false;
        }
        
        return true;
    });

    // 미니 대시보드 업데이트
    if(document.getElementById('integ-dash-total')) document.getElementById('integ-dash-total').innerText = total;
    if(document.getElementById('integ-dash-pending')) document.getElementById('integ-dash-pending').innerText = pending;
    if(document.getElementById('integ-dash-completed')) document.getElementById('integ-dash-completed').innerText = completed;
    if(document.getElementById('integ-dash-saving')) document.getElementById('integ-dash-saving').innerText = totalSaving.toLocaleString();

    renderIntegTop3(window.integMergedData.filter(d => d.finalStatus === '통합완료'));
    renderIntegTable(filtered);
};

function renderIntegTop3(completedList) {
    const container = document.getElementById('integ-top3-container');
    if(!container) return;

    let top3 = completedList.slice(0, 3);
    
    if (top3.length === 0) {
        container.innerHTML = '<div class="glass-card p-6 text-center text-slate-400 text-xs font-bold col-span-3">아직 3개 부서 통합이 완료된 프로젝트가 없습니다.</div>';
        return;
    }

    container.innerHTML = top3.map(d => {
        let mDiff = d.estMd - d.finalMd;
        let mClass = mDiff >= 0 ? 'text-emerald-500' : 'text-rose-500';
        let mText = mDiff >= 0 ? `${mDiff.toFixed(1)}MD 절감` : `${Math.abs(mDiff).toFixed(1)}MD 초과`;

        const target = parseFloat(d.pcData.targetCost) || 0;
        const actual = parseFloat(d.pcData.actualTotal) || 0;
        let cDiff = target - actual;
        let cClass = cDiff >= 0 ? 'text-blue-500' : 'text-rose-500';
        let cText = cDiff >= 0 ? `₩ ${(cDiff/10000).toFixed(0)}만 절감` : `₩ ${(Math.abs(cDiff)/10000).toFixed(0)}만 초과`;

        return `
            <div class="glass-card p-5 cursor-pointer hover:border-indigo-300 transition-all duration-300" onclick="window.openIntegrationDashboard('${d.projectId}')">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-[10px] font-black text-white bg-indigo-500 px-2 py-0.5 rounded shadow-sm">${d.pjtCode}</span>
                    <span class="text-[10px] text-slate-400 font-bold">${d.shipDate}</span>
                </div>
                <h4 class="text-sm font-black text-slate-800 truncate mb-3">${d.pjtName}</h4>
                <div class="flex justify-between items-center text-[11px] font-bold bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div class="flex flex-col">
                        <span class="text-slate-400">공수 성과</span>
                        <span class="${mClass}">${mText}</span>
                    </div>
                    <div class="h-6 w-px bg-slate-200"></div>
                    <div class="flex flex-col text-right">
                        <span class="text-slate-400">원가 성과</span>
                        <span class="${cClass}">${cText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderIntegTable(list) {
    const tbody = document.getElementById('integ-tbody');
    if (!tbody) return;

    if(list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center p-8 text-slate-400 font-bold">조건에 맞는 데이터가 없습니다.</td></tr>';
        return;
    }

    const badgeMap = {
        '완료': '<span class="text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold"><i class="fa-solid fa-check"></i> 완료</span>',
        '대기중': '<span class="text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold">대기중</span>',
        '작성중': '<span class="text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-bold">작성중</span>',
        '분석중': '<span class="text-blue-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-bold">분석중</span>'
    };

    tbody.innerHTML = list.map(d => {
        let finalBadge = d.finalStatus === '통합완료' 
            ? '<span class="bg-indigo-600 text-white px-2.5 py-1 rounded-md text-[10px] font-black shadow-sm">통합완료</span>'
            : '<span class="bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-md text-[10px] font-bold">작성대기</span>';

        let btnClass = d.finalStatus === '통합완료' 
            ? 'bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-600 hover:text-white' 
            : 'bg-white text-slate-400 border border-slate-200 hover:border-indigo-300 hover:text-indigo-500';
            
        let btnText = d.finalStatus === '통합완료' ? '<i class="fa-solid fa-chart-line"></i> 최종보고서 보기' : '<i class="fa-regular fa-file-lines"></i> 진행상황 보기';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onclick="window.openIntegrationDashboard('${d.projectId}')">
                <td class="p-3 text-center text-slate-500 font-bold">${d.shipDate}</td>
                <td class="p-3 text-center font-black text-indigo-700">${d.pjtCode}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[300px]">${d.pjtName}</td>
                <td class="p-3 text-center">${badgeMap['완료']}</td>
                <td class="p-3 text-center">${badgeMap[d.qStatus] || badgeMap['대기중']}</td>
                <td class="p-3 text-center">${badgeMap[d.pStatus] || badgeMap['대기중']}</td>
                <td class="p-3 text-center">${finalBadge}</td>
                <td class="p-3 text-center" onclick="event.stopPropagation()">
                    <button onclick="window.openIntegrationDashboard('${d.projectId}')" class="${btnClass} px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm whitespace-nowrap">
                        ${btnText}
                    </button>
                </td>
                <td class="p-3 text-center" onclick="event.stopPropagation()">
                    <button onclick="window.hideIntegrationProject('${d.projectId}')" class="text-slate-300 hover:text-rose-500 transition-colors p-1.5 rounded-lg hover:bg-rose-50" title="목록에서 제외(숨기기)">
                        <i class="fa-solid fa-eye-slash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 💡 리스트에서 항목 숨기기 기능 (Soft Delete)
window.hideIntegrationProject = async function(projectId) {
    if (!confirm("이 프로젝트를 통합 완료보고 목록에서 제외(숨기기)하시겠습니까?\n(실제 데이터는 삭제되지 않으며 취합 리스트에서만 사라집니다.)")) return;
    
    try {
        await setDoc(doc(db, "projects_status", projectId), { isHiddenFromIntegration: true }, { merge: true });
        window.showToast("목록에서 제외(숨김) 처리되었습니다.", "success");
    } catch(e) {
        window.showToast("처리 실패: " + e.message, "error");
    }
};


// ========================================================
// 💡 대시보드 모달 제어 및 부서별 렌더링
// ==========================================
window.openIntegrationDashboard = function(projectId) {
    const data = window.integMergedData.find(d => d.projectId === projectId);
    if(!data) return window.showToast("데이터를 찾을 수 없습니다.", "error");

    document.getElementById('modal-integ-title').innerText = `[${data.pjtCode}] ${data.pjtName}`;
    window.currentDashboardData = data; 

    renderExecutiveSummary(data);
    
    // 탭 초기화 (제조팀 먼저 렌더링)
    window.switchIntegTab('mfg');
    renderTabContents(data);

    document.getElementById('integration-dashboard-modal').classList.remove('hidden');
    document.getElementById('integration-dashboard-modal').classList.add('flex');
};

window.closeIntegrationDashboard = function() {
    document.getElementById('integration-dashboard-modal').classList.add('hidden');
    document.getElementById('integration-dashboard-modal').classList.remove('flex');
};

function renderExecutiveSummary(data) {
    // 1. 제조 M/H
    let mDiff = data.estMd - data.finalMd;
    document.getElementById('sum-md-actual').innerText = data.finalMd.toFixed(1);
    const mBadge = document.getElementById('sum-md-badge');
    if (mDiff >= 0) {
        mBadge.className = "ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200";
        mBadge.innerText = `${mDiff.toFixed(1)}MD 절감 달성`;
    } else {
        mBadge.className = "ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-50 text-rose-600 border-rose-200";
        mBadge.innerText = `${Math.abs(mDiff).toFixed(1)}MD 초과`;
    }

    // 2. 품질 성과 (가상 수치. 실제 NCR 연동시 보강)
    let ncrCount = 0;
    if (window.ncrData) {
        ncrCount = window.ncrData.filter(n => String(n.pjtCode).replace(/\s/g,'').toUpperCase() === data.pjtCode.replace(/\s/g,'').toUpperCase()).length;
    }
    let qRate = ncrCount > 0 ? (ncrCount * 0.12).toFixed(2) : '0.00';
    document.getElementById('sum-q-rate').innerText = qRate;
    const qBadge = document.getElementById('sum-q-badge');
    if (qRate < 1.0) {
        qBadge.className = "ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-600 border-emerald-200";
        qBadge.innerText = `결함 발생 ${ncrCount}건 (양호)`;
    } else {
        qBadge.className = "ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-200";
        qBadge.innerText = `결함 발생 ${ncrCount}건 (주의)`;
    }

    // 3. 원가 성과
    const targetCost = parseFloat(data.pcData.targetCost) || 0;
    const actualCost = parseFloat(data.pcData.actualTotal) || 0;
    let cDiff = targetCost - actualCost;
    
    document.getElementById('sum-c-saving').innerText = cDiff > 0 ? (cDiff / 10000).toLocaleString() + '만' : '0';
    const cBadge = document.getElementById('sum-c-mc');
    let mcRate = targetCost > 0 ? (actualCost / targetCost * 100).toFixed(1) : 0;
    cBadge.innerText = `MC율 ${mcRate}%`;
    if (mcRate > 100) {
        cBadge.className = "ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-rose-50 text-rose-600 border-rose-200";
    } else {
        cBadge.className = "ml-auto text-[10px] font-bold px-2 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-200";
    }
}

// -------------------------------------------
// 💡 부서별 탭 전환 및 차트 개별 렌더링
// -------------------------------------------
window.switchIntegTab = function(tabName) {
    // Hide all
    ['mfg', 'qual', 'pur'].forEach(name => {
        document.getElementById('tab-' + name)?.classList.remove('active');
        document.getElementById('content-' + name)?.classList.add('hidden');
    });
    
    // Show active
    document.getElementById('tab-' + tabName)?.classList.add('active');
    document.getElementById('content-' + tabName)?.classList.remove('hidden');

    // 💡 탭을 전환할 때 해당 탭 안의 차트를 그려서 0x0 렌더링 버그 방지 및 애니메이션 효과 극대화
    if(window.currentDashboardData) {
        setTimeout(() => {
            if(tabName === 'mfg') renderMfgCharts(window.currentDashboardData);
            if(tabName === 'qual') renderQualCharts(window.currentDashboardData);
            if(tabName === 'pur') renderPurCharts(window.currentDashboardData);
        }, 50); 
    }
};

function destroyIntegChart(id) {
    if (window.integChartInstances[id]) {
        window.integChartInstances[id].destroy();
        window.integChartInstances[id] = null;
    }
}

// 💡 제조팀 신규 차트 세팅
function renderMfgCharts(data) {
    
    // 1. 일정 비교 분석 차트 (가로형 바)
    destroyIntegChart('mfgSchedule');
    const ctxSch = document.getElementById('mfg-chart-schedule')?.getContext('2d');
    if (ctxSch) {
        let planDiff = getDaysDiff(data.d_asmEst, data.d_asmEndEst);
        let actDiff = getDaysDiff(data.d_asmSt, data.d_asmEn);
        
        window.integChartInstances['mfgSchedule'] = new Chart(ctxSch, {
            type: 'bar',
            data: {
                labels: ['계획 소요일', '실제 소요일'],
                datasets: [{
                    data: [planDiff.days, actDiff.days],
                    backgroundColor: ['#cbd5e1', '#6366f1'],
                    borderRadius: 6,
                    barPercentage: 0.5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 1500, easing: 'easeOutExpo', x: { from: 0 } },
                plugins: { 
                    legend: { display: false },
                    datalabels: { anchor: 'end', align: 'right', color: '#475569', font: {weight: '900', size: 12}, formatter: (val) => val + ' 일' }
                },
                scales: { 
                    x: { display: false, max: Math.max(planDiff.days, actDiff.days, 10) * 1.3 }, 
                    y: { grid: { display: false }, ticks: { font: {weight: 'bold', size: 12}, color: '#334155' } } 
                }
            }
        });
    }

    // 2. 공수 및 비용 비교 차트 (세로형 바)
    destroyIntegChart('mfgCost');
    const ctxCost = document.getElementById('mfg-chart-cost')?.getContext('2d');
    if (ctxCost) {
        let eMd = data.estMd || 0;
        let aMd = data.finalMd || 0;
        let eCost = eMd * LABOR_RATE;
        let aCost = aMd * LABOR_RATE;
        let cDiff = eCost - aCost; 

        // 뱃지 업데이트
        let diffBadge = document.getElementById('mfg-cost-diff-badge');
        if (diffBadge) {
            if(cDiff >= 0) {
                diffBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 border border-emerald-200';
                diffBadge.innerHTML = `<i class="fa-solid fa-arrow-down"></i> ₩ ${Math.abs(cDiff).toLocaleString()} 절감`;
            } else {
                diffBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-600 border border-rose-200';
                diffBadge.innerHTML = `<i class="fa-solid fa-arrow-up"></i> ₩ ${Math.abs(cDiff).toLocaleString()} 초과`;
            }
        }

        window.integChartInstances['mfgCost'] = new Chart(ctxCost, {
            type: 'bar',
            data: {
                labels: ['예상 공수 비용', '최종 공수 비용'],
                datasets: [{
                    data: [eCost, aCost],
                    backgroundColor: ['#94a3b8', '#38bdf8'],
                    borderRadius: 6,
                    barPercentage: 0.5
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 1500, easing: 'easeOutBounce', y: { from: 500 } },
                plugins: { 
                    legend: { display: false },
                    datalabels: { anchor: 'end', align: 'top', color: '#334155', font: {weight: '900', size: 11}, formatter: (val) => '₩ ' + (val/10000).toFixed(0) + '만' }
                },
                scales: { 
                    x: { grid: { display: false }, ticks: { font: {weight: 'bold', size: 12}, color: '#475569' } }, 
                    y: { display: false, max: Math.max(eCost, aCost, 1000000) * 1.3 } 
                }
            }
        });
    }

    // 3. 전설비 비교 차트용 Select 박스 세팅
    const prevSelect = document.getElementById('mfg-prev-pjt-select');
    if (prevSelect) {
        let optionsHtml = '<option value="">전설비 선택 안함</option>';
        window.integMergedData.forEach(p => {
            if (p.projectId !== data.projectId && p.finalStatus === '통합완료') {
                optionsHtml += `<option value="${p.projectId}">[${p.pjtCode}] ${p.pjtName}</option>`;
            }
        });
        prevSelect.innerHTML = optionsHtml;
        
        // Auto-select the most recent completed project if exists
        let prevPjt = window.integMergedData.find(p => p.projectId !== data.projectId && p.finalStatus === '통합완료');
        if (prevPjt) {
            prevSelect.value = prevPjt.projectId;
        }
        window.updatePrevPjtChart();
    }
}

// 전설비 비교 차트 업데이트 함수
window.updatePrevPjtChart = function() {
    destroyIntegChart('mfgPrevComp');
    const ctxPrev = document.getElementById('mfg-chart-prev-comp')?.getContext('2d');
    if (!ctxPrev) return;

    const currData = window.currentDashboardData;
    const prevId = document.getElementById('mfg-prev-pjt-select')?.value;
    const prevData = window.integMergedData.find(p => p.projectId === prevId);

    let currDays = getDaysDiff(currData.d_asmSt, currData.d_asmEn).days;
    let currMd = currData.finalMd || 0;

    let prevDays = 0;
    let prevMd = 0;
    let prevLabel = '전설비 (미선택)';

    if (prevData) {
        prevDays = getDaysDiff(prevData.d_asmSt, prevData.d_asmEn).days;
        prevMd = prevData.finalMd || 0;
        prevLabel = `전설비 (${prevData.pjtCode})`;
    }

    window.integChartInstances['mfgPrevComp'] = new Chart(ctxPrev, {
        type: 'bar',
        data: {
            labels: ['제작 소요일 (일)', '투입 공수 (MD)'],
            datasets: [
                {
                    label: `현설비 (${currData.pjtCode})`,
                    data: [currDays, currMd],
                    backgroundColor: '#6366f1',
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.4
                },
                {
                    label: prevLabel,
                    data: [prevDays, prevMd],
                    backgroundColor: '#cbd5e1',
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.4
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 1500, easing: 'easeOutExpo', y: { from: 300 } },
            plugins: { 
                legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, font: {size: 11, weight:'bold'} } },
                datalabels: { anchor: 'end', align: 'top', color: '#475569', font: {weight: 'bold', size: 11} }
            },
            scales: { 
                x: { grid: { display: false }, ticks: { font: {weight: 'bold', size: 12}, color: '#334155' } }, 
                y: { beginAtZero: true, grid: { borderDash: [4,4] }, max: Math.max(currDays, currMd, prevDays, prevMd, 10) * 1.3 } 
            }
        }
    });
};

// 품질팀 차트
function renderQualCharts(data) {
    destroyIntegChart('qualNcr');
    const ctxNcr = document.getElementById('integ-chart-qual-ncr')?.getContext('2d');
    if (ctxNcr) {
        window.integChartInstances['qualNcr'] = new Chart(ctxNcr, {
            type: 'pie',
            data: {
                labels: ['구조개선', '설계오류', '협력사/가공불량', '기타'],
                datasets: [{
                    data: [35, 25, 30, 10], // 임시 데이터
                    backgroundColor: ['#facc15', '#38bdf8', '#f472b6', '#94a3b8'],
                    borderWidth: 2, borderColor: '#ffffff', hoverOffset: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { animateScale: true, animateRotate: true, duration: 1500, easing: 'easeOutQuart' },
                plugins: { 
                    legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8, font: {size: 10} } },
                    datalabels: { color: '#ffffff', font: {weight: 'bold', size: 10}, formatter: (val) => val + '%' }
                }
            }
        });
    }

    destroyIntegChart('qualProcess');
    const ctxQualProc = document.getElementById('integ-chart-qual-process')?.getContext('2d');
    if (ctxQualProc) {
        window.integChartInstances['qualProcess'] = new Chart(ctxQualProc, {
            type: 'bar',
            data: {
                labels: ['가공', '조립', '전장', '셋업'],
                datasets: [{
                    label: '불량 건수',
                    data: [12, 5, 2, 1], // 임시 데이터
                    backgroundColor: '#8b5cf6',
                    borderRadius: 6,
                    barPercentage: 0.5
                }]
            },
            options: {
                indexAxis: 'y', // 가로 바 차트
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 1500, easing: 'easeOutExpo', x: { from: 500 } },
                plugins: { 
                    legend: { display: false },
                    datalabels: { anchor: 'end', align: 'right', color: '#6366f1', font: {weight: '900', size: 12} }
                },
                scales: { 
                    x: { display: false, max: 15 }, // 여백 주기 위해 최대값 여유
                    y: { grid: { display: false }, ticks: { font: {weight: 'bold', size: 11}, color: '#475569' } } 
                }
            }
        });
    }
}

// 💡 구매팀 차트 (안 튀어나오게 수정 완료 및 플러그인 연동)
function renderPurCharts(data) {
    destroyIntegChart('cost');
    const ctxCost = document.getElementById('integ-chart-cost')?.getContext('2d');
    if (ctxCost) {
        const targetCost = parseFloat(data.pcData.targetCost) || 0;
        const actNew = parseFloat(data.pcData.actualMaterial) || 0;
        const actInv = parseFloat(data.pcData.actualProc) || 0;
        const actFail = parseFloat(data.pcData.actualEtc) || 0;
        
        let actualTotal = actNew + actInv + actFail;
        let rem = targetCost - actualTotal;
        if(rem < 0) rem = 0;

        let totalBudgetText = (targetCost / 10000).toFixed(0) + '만';

        window.integChartInstances['cost'] = new Chart(ctxCost, {
            type: 'doughnut',
            data: {
                labels: ['신규구매', '재고사용', '실패비용', '잔여(절감)'],
                datasets: [{
                    data: [actNew, actInv, actFail, rem],
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#f43f5e', '#10b981'],
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 6, 
                    cutout: '75%',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { animateScale: true, animateRotate: true, duration: 1500, easing: 'easeOutQuart' },
                plugins: { 
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: {size: 10} } },
                    datalabels: { display: false },
                    centerText: { text: totalBudgetText } // 커스텀 플러그인 데이터
                }
            },
            plugins: [donutCenterTextPlugin] // 💡 커스텀 플러그인 장착
        });
    }

    destroyIntegChart('purSaving');
    const ctxPurSaving = document.getElementById('integ-chart-pur-saving')?.getContext('2d');
    if (ctxPurSaving) {
        // pcPerformances에서 업체별 절감액 합산하여 표시
        let compMap = {};
        if (data.pcData.pcPerformances) {
            data.pcData.pcPerformances.forEach(p => {
                if(p.company && p.amount) compMap[p.company] = (compMap[p.company]||0) + (p.amount / 1000000); // 백만원 단위
            });
        }
        
        let labels = Object.keys(compMap);
        let sData = Object.values(compMap);
        
        if(labels.length === 0) {
            labels = ['업체A', '업체B', '업체C'];
            sData = [30, 65, 15]; // 임시
        }

        // 그라데이션 적용
        const gradient = ctxPurSaving.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, '#34d399'); 
        gradient.addColorStop(1, '#059669');

        window.integChartInstances['purSaving'] = new Chart(ctxPurSaving, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '원가 절감액', data: sData, backgroundColor: gradient, borderRadius: 6, barPercentage: 0.4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                animation: { duration: 1500, easing: 'easeOutExpo', y: { from: 300 } },
                plugins: { 
                    legend: { display: false }, 
                    datalabels: { anchor: 'end', align: 'top', color: '#059669', font: {weight: 'bold', size: 11} } 
                },
                scales: { 
                    x: { grid: {display: false}, ticks: { font: {weight: 'bold', size: 11}, color: '#64748b' } }, 
                    y: { beginAtZero: true, grid: { borderDash: [4,4] }, max: Math.max(...sData, 10) * 1.3 } 
                }
            }
        });
    }
}

// -------------------------------------------
// 하단 컨텐츠 (Good/Bad 및 실적 테이블) 렌더링
// -------------------------------------------
function renderTabContents(data) {
    // 1. 제조팀 (crData.lessons에 저장됨)
    // 💡 차트로 대체되었기 때문에 여기서는 Good/Bad만 렌더링. 비용/일정 로직은 renderMfgCharts()에서 처리함
    const mfgLessons = data.crData.lessons || [];
    renderGoodBadBlock('mfg-goodbad-container', mfgLessons, '제작');

    // 2. 품질팀 (crData.qualityLessons & qualityPerformances)
    const qualLessons = data.crData.qualityLessons || [];
    renderGoodBadBlock('qual-goodbad-container', qualLessons, '품질');
    
    const qTbody = document.getElementById('qual-perf-tbody');
    if(qTbody) {
        const qPerf = data.crData.qualityPerformances || [];
        if(qPerf.length === 0) {
            qTbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">데이터 없음</td></tr>';
        } else {
            qTbody.innerHTML = qPerf.map(p => `
                <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td class="p-2 text-center font-bold text-slate-500">${p.category}</td>
                    <td class="p-2 font-bold text-slate-700">${p.item}</td>
                    <td class="p-2 text-slate-600 break-all">${p.content}</td>
                    <td class="p-2 text-center font-bold">${p.oldVal}</td>
                    <td class="p-2 text-center font-bold text-emerald-600">${p.newVal}</td>
                    <td class="p-2 text-center font-black text-indigo-600">${p.rateVal}%</td>
                </tr>
            `).join('');
        }
    }

    // 3. 구매팀 (pcData.pcLessons & pcPerformances)
    const purLessons = data.pcData.pcLessons || [];
    renderGoodBadBlock('pur-goodbad-container', purLessons, '원가');

    const pTbody = document.getElementById('pur-perf-tbody');
    if(pTbody) {
        const pPerf = data.pcData.pcPerformances || [];
        if(pPerf.length === 0) {
            pTbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">데이터 없음</td></tr>';
        } else {
            pTbody.innerHTML = pPerf.map(p => `
                <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td class="p-2 text-center font-bold text-slate-500">${p.category}</td>
                    <td class="p-2 font-bold text-slate-700">${p.item}</td>
                    <td class="p-2 text-center text-slate-500">${p.company}</td>
                    <td class="p-2 text-slate-600 break-all">${p.content}</td>
                    <td class="p-2 text-right font-bold text-rose-500">${(parseFloat(p.amount)||0).toLocaleString()}</td>
                    <td class="p-2 text-center font-black text-indigo-600">${p.cr}%</td>
                </tr>
            `).join('');
        }
    }
}

function renderGoodBadBlock(containerId, lessons, defaultCat) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!lessons || lessons.length === 0) {
        container.innerHTML = `<div class="col-span-2 text-center p-6 text-slate-400 font-bold border border-dashed rounded-xl">작성된 총평이 없습니다.</div>`;
        return;
    }

    let goodHtml = '';
    let badHtml = '';

    lessons.forEach(l => {
        // 제조팀의 경우 type이 Good/Bad로 명확히 나뉨. 품질/구매는 highlight/lowlight가 공존
        if (l.type === 'Good' || l.highlight) {
            goodHtml += `<li class="mb-2 last:mb-0"><span class="font-bold text-slate-700 block mb-0.5">[${l.item || defaultCat}]</span> <span class="text-slate-600">${l.highlight.replace(/\n/g, '<br>')}</span></li>`;
        }
        if (l.type === 'Bad' || l.lowlight) {
            badHtml += `<li class="mb-2 last:mb-0"><span class="font-bold text-slate-700 block mb-0.5">[${l.item || defaultCat}]</span> <span class="text-slate-600">${l.lowlight.replace(/\n/g, '<br>')}</span></li>`;
        }
    });

    let html = '';
    if(goodHtml) {
        html += `
            <div class="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-5 shadow-sm">
                <h5 class="text-sm font-black text-emerald-700 mb-3 flex items-center gap-2"><i class="fa-regular fa-thumbs-up"></i> Good Point</h5>
                <ul class="text-xs leading-relaxed">${goodHtml}</ul>
            </div>
        `;
    }
    if(badHtml) {
        html += `
            <div class="bg-[#fff1f2] border border-[#fecdd3] rounded-xl p-5 shadow-sm">
                <h5 class="text-sm font-black text-rose-700 mb-3 flex items-center gap-2"><i class="fa-regular fa-thumbs-down"></i> Bad Point</h5>
                <ul class="text-xs leading-relaxed">${badHtml}</ul>
            </div>
        `;
    }

    if(!html) html = `<div class="col-span-2 text-center p-6 text-slate-400 font-bold border border-dashed rounded-xl">내용 없음</div>`;
    container.innerHTML = html;
}

// -------------------------------------------
// 💡 엑셀 다운로드 (ExcelJS)
// -------------------------------------------
window.exportIntegrationExcel = async function() {
    const data = window.currentDashboardData;
    if (!data) return;

    if (typeof window.ExcelJS === 'undefined') {
        return window.showToast("ExcelJS 모듈이 로드되지 않았습니다.", "error");
    }

    try {
        window.showToast("통합 완료보고서 엑셀을 생성 중입니다...", "success");
        const wb = new window.ExcelJS.Workbook();
        const ws = wb.addWorksheet('통합_완료보고서', { views: [{ showGridLines: false }] });

        ws.columns = [
            { width: 5 }, { width: 20 }, { width: 30 }, { width: 20 }, { width: 30 }, { width: 5 }
        ];

        const setBg = (cell, color) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }; };
        const setFont = (cell, opts) => { cell.font = { name: '맑은 고딕', ...opts }; };
        const setBorder = (cell) => { cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} }; };

        ws.mergeCells('B2:E3');
        const titleCell = ws.getCell('B2');
        titleCell.value = `[통합 완료보고서] ${data.pjtName}`;
        setFont(titleCell, { size: 18, bold: true, color: { argb: 'FF1E293B' } });
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        let currRow = 5;

        // 1. KPI Summary
        ws.mergeCells(`B${currRow}:E${currRow}`);
        ws.getCell(`B${currRow}`).value = '■ Executive Summary';
        setFont(ws.getCell(`B${currRow}`), { bold: true, size: 14 });
        currRow++;

        let rKpiHead = ws.addRow(['', '제조/일정 성과 (M/H)', '품질 성과 (결함률)', '원가 예산 절감 성과 (원)', '']);
        rKpiHead.eachCell((c,n) => { if(n>=2 && n<=4) { setBg(c, 'FF334155'); setFont(c, {color:{argb:'FFFFFFFF'}, bold:true}); c.alignment={horizontal:'center'}; setBorder(c); } });
        
        let mDiff = data.estMd - data.finalMd;
        let cDiff = (parseFloat(data.pcData.targetCost)||0) - (parseFloat(data.pcData.actualTotal)||0);
        let rKpiVal = ws.addRow(['', `${data.finalMd.toFixed(1)} MD\n(${mDiff>=0?'절감':'초과'})`, '품질결함 확인요망', `₩ ${cDiff > 0 ? cDiff.toLocaleString() : 0}\n(${cDiff>=0?'절감':'초과'})`, '']);
        rKpiVal.eachCell((c,n) => { if(n>=2 && n<=4) { setBorder(c); c.alignment={horizontal:'center', vertical:'middle', wrapText:true}; } });
        currRow += 3;

        // 2. 팀별 상세 - 헬퍼 함수
        const addSection = (title, lessons, perfs, teamType) => {
            ws.mergeCells(`B${currRow}:E${currRow}`);
            ws.getCell(`B${currRow}`).value = `■ ${title}`;
            setFont(ws.getCell(`B${currRow}`), { bold: true, size: 14 });
            currRow++;

            // Good / Bad
            ws.mergeCells(`B${currRow}:E${currRow}`);
            ws.getCell(`B${currRow}`).value = '1) 프로젝트 총평 (Good & Bad)';
            setFont(ws.getCell(`B${currRow}`), { bold: true, size: 11 });
            currRow++;

            if(lessons && lessons.length > 0) {
                lessons.forEach(l => {
                    let hl = l.highlight || (l.type === 'Good' ? l.highlight : '');
                    let ll = l.lowlight || (l.type === 'Bad' ? l.lowlight : '');
                    
                    if(hl) {
                        ws.mergeCells(`B${currRow}:E${currRow}`);
                        ws.getCell(`B${currRow}`).value = `[Good] ${l.item || l.category || ''}\n${hl}`;
                        ws.getCell(`B${currRow}`).alignment = { wrapText: true, vertical: 'top' };
                        ws.getCell(`B${currRow}`).font = { color: {argb:'FF059669'} };
                        currRow++;
                    }
                    if(ll) {
                        ws.mergeCells(`B${currRow}:E${currRow}`);
                        ws.getCell(`B${currRow}`).value = `[Bad] ${l.item || l.category || ''}\n${ll}`;
                        ws.getCell(`B${currRow}`).alignment = { wrapText: true, vertical: 'top' };
                        ws.getCell(`B${currRow}`).font = { color: {argb:'FFE11D48'} };
                        currRow++;
                    }
                });
            } else {
                ws.mergeCells(`B${currRow}:E${currRow}`);
                ws.getCell(`B${currRow}`).value = '내용 없음';
                currRow++;
            }
            currRow++;

            // 실적 (품질/구매만)
            if(perfs && perfs.length > 0) {
                ws.mergeCells(`B${currRow}:E${currRow}`);
                ws.getCell(`B${currRow}`).value = '2) 세부 실적';
                setFont(ws.getCell(`B${currRow}`), { bold: true, size: 11 });
                currRow++;

                let hRow;
                if(teamType === 'qual') hRow = ws.addRow(['', '구분', '항목/내용', '개선율(%)', '']);
                else hRow = ws.addRow(['', '업체명', '진행내용', '절감액(원)', '']);
                
                hRow.eachCell((c,n) => { if(n>=2 && n<=4) { setBg(c, 'FFF1F5F9'); setFont(c, {bold:true}); setBorder(c); c.alignment={horizontal:'center'}; } });

                perfs.forEach(p => {
                    let vRow;
                    if(teamType === 'qual') vRow = ws.addRow(['', p.category, `[${p.item}] ${p.content}`, `${p.rateVal}%`, '']);
                    else vRow = ws.addRow(['', p.company, `[${p.item}] ${p.content}`, p.amount, '']);
                    
                    vRow.eachCell((c,n) => { if(n>=2 && n<=4) { setBorder(c); c.alignment={vertical:'middle', wrapText:true}; } });
                });
                currRow += perfs.length + 1;
            }
            currRow++;
        };

        addSection('제조팀 상세보고', data.crData.lessons, null, 'mfg');
        addSection('품질팀 상세보고', data.crData.qualityLessons, data.crData.qualityPerformances, 'qual');
        addSection('구매팀 상세보고', data.pcData.pcLessons, data.pcData.pcPerformances, 'pur');

        const buffer = await wb.xlsx.writeBuffer();
        window.saveAs(new Blob([buffer]), `통합완료보고서_${data.pjtCode}.xlsx`);

    } catch(e) {
        console.error(e);
        window.showToast("엑셀 저장 실패", "error");
    }
};
