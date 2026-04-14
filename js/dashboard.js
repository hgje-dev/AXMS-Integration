/* eslint-disable */
import { db } from './firebase.js';
import { collection, query, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let homeProjSnapshotUnsubscribe = null;
let homeReqSnapshotUnsubscribe = null; // 리퀘스트 구독용 변수 추가
let chartInstances = {};

window.currentDashStats = {};
window.currentPeriodProjects = [];
window.allDashRequests = []; // 리퀘스트 데이터 저장용 배열 추가

const getSafeString = function(val) {
    if (val === null || val === undefined) {
        return '';
    }
    return String(val);
};

window.loadHomeDashboards = function() {
    try {
        const exportBtn = document.getElementById('btn-export-dash');
        if (exportBtn && window.userProfile && window.userProfile.role === 'admin') {
            exportBtn.classList.remove('hidden');
        }

        // 1. 프로젝트 현황 데이터 구독
        if (homeProjSnapshotUnsubscribe) homeProjSnapshotUnsubscribe();
        
        homeProjSnapshotUnsubscribe = onSnapshot(collection(db, "projects_status"), function(snapshot) { 
            window.allDashProjects = []; 
            snapshot.forEach(function(docSnap) {
                let data = docSnap.data();
                data.id = docSnap.id;
                window.allDashProjects.push(data);
            }); 
            if (window.processDashboardData) window.processDashboardData(); 
        });

        // 2. 리퀘스트 데이터 구독 (추가된 부분)
        if (homeReqSnapshotUnsubscribe) homeReqSnapshotUnsubscribe();
        
        homeReqSnapshotUnsubscribe = onSnapshot(collection(db, "requests"), function(snapshot) {
            window.allDashRequests = [];
            snapshot.forEach(function(docSnap) {
                let data = docSnap.data();
                data.id = docSnap.id;
                window.allDashRequests.push(data);
            });
            if (window.processRequestDashboardData) window.processRequestDashboardData();
        });

        // 이벤트 리스너 바인딩 (리퀘스트 타입 셀렉트)
        const reqTypeSelect = document.getElementById('req-dash-type-select');
        if (reqTypeSelect) {
            reqTypeSelect.removeEventListener('change', window.processRequestDashboardData);
            reqTypeSelect.addEventListener('change', window.processRequestDashboardData);
        }

        setTimeout(function() { 
            const periodMonthInput = document.getElementById('period-value-month');
            if (periodMonthInput && !periodMonthInput.value) {
                window.changePeriodType(); 
            }
        }, 100);

    } catch(e) { 
        console.error("대시보드 초기화 실패:", e); 
    }
};

window.processDashboardData = function() {
    try {
        let years = new Set(); 
        const currentYear = new Date().getFullYear(); 
        years.add(currentYear);
        
        if (window.allDashProjects) {
            window.allDashProjects.forEach(function(p) { 
                if (p.d_shipEst) years.add(parseInt(p.d_shipEst.substring(0, 4))); 
                if (p.d_shipEn) years.add(parseInt(p.d_shipEn.substring(0, 4))); 
            });
        }
        
        let yearArray = Array.from(years).filter(function(y) {
            return !isNaN(y) && y > 2000;
        }).sort(function(a, b) {
            return a - b;
        });

        const yearSelect = document.getElementById('dash-year-select');
        let selectedYearStr = currentYear.toString();

        if (yearSelect) {
            const currentVal = yearSelect.value || currentYear.toString(); 
            yearSelect.innerHTML = '';
            yearArray.forEach(function(y) { 
                let isSelected = (y.toString() === currentVal) ? 'selected' : '';
                yearSelect.innerHTML += '<option value="' + y + '" ' + isSelected + '>' + y + '년</option>'; 
            });
            if (yearSelect.value !== currentVal) {
                yearSelect.value = currentVal;
            }
            selectedYearStr = yearSelect.value;
        }

        const year = selectedYearStr; 
        let stats = { estMd: 0, finalMd: 0, outMd: 0, completed: 0, pending: 0, progress: 0, inspecting: 0, rejected: 0 }; 
        let annualPlanData = Array(12).fill(0); 
        let annualActData = Array(12).fill(0); 
        let monthlyCompleted = Array(12).fill(0);
        let totalShipErrorDays = 0; 
        let shipErrorCount = 0;

        if (window.allDashProjects) {
            window.allDashProjects.forEach(function(data) {
                const shipEn = getSafeString(data.d_shipEn);
                const shipEst = getSafeString(data.d_shipEst);
                const status = getSafeString(data.status);
                
                const fMd = parseFloat(data.finalMd) || 0;
                const eMd = parseFloat(data.estMd) || 0;
                const oMd = parseFloat(data.outMd) || 0;
                
                let isTargetThisYear = false;
                
                if (status === 'completed') {
                    if (shipEn.startsWith(year)) {
                        isTargetThisYear = true;
                    }
                } else {
                    if (shipEst.startsWith(year)) {
                        isTargetThisYear = true;
                    }
                }

                if (!isTargetThisYear) return;
                
                if (stats[status] !== undefined) {
                    stats[status]++;
                } else {
                    stats[status] = 1;
                }
                
                stats.estMd += eMd;
                stats.finalMd += fMd;
                stats.outMd += oMd;

                let targetMonthStr = (status === 'completed') ? shipEn : shipEst;
                if (targetMonthStr.startsWith(year)) {
                    let mIdx = parseInt(targetMonthStr.split('-')[1]) - 1;
                    if (mIdx >= 0 && mIdx < 12) {
                        annualPlanData[mIdx] += eMd;
                        annualActData[mIdx] += fMd; 
                        if (status === 'completed') {
                            monthlyCompleted[mIdx]++;
                        }
                    }
                }
                
                if (status === 'completed' && shipEn && shipEst) {
                    const enD = new Date(shipEn);
                    const estD = new Date(shipEst);
                    if (!isNaN(enD.getTime()) && !isNaN(estD.getTime())) { 
                        totalShipErrorDays += (enD.getTime() - estD.getTime()) / (1000 * 60 * 60 * 24); 
                        shipErrorCount++; 
                    }
                }
            });
        }

        let finalAvgShipError = 0;
        if (shipErrorCount > 0) {
            finalAvgShipError = Math.round(totalShipErrorDays / shipErrorCount);
        }

        window.currentDashStats = { 
            year: year,
            pending: stats.pending,
            progress: stats.progress,
            inspecting: stats.inspecting,
            completed: stats.completed,
            rejected: stats.rejected,
            estMd: stats.estMd,
            finalMd: stats.finalMd,
            outMd: stats.outMd,
            avgShipError: finalAvgShipError
        };

        const dashTeamCountEl = document.getElementById('dash-team-count');
        if (dashTeamCountEl) {
            let tCount = 0;
            if (window.teamMembers) tCount = window.teamMembers.length;
            dashTeamCountEl.innerText = tCount + '명';
        }
        
        const elCompleted = document.getElementById('dash-pd-completed');
        if (elCompleted) elCompleted.innerText = stats.completed;
        
        const elEstMd = document.getElementById('dash-pd-estMd');
        if (elEstMd) elEstMd.innerText = stats.estMd.toFixed(1);
        
        const elCurMd = document.getElementById('dash-pd-curMd');
        if (elCurMd) elCurMd.innerText = stats.finalMd.toFixed(1);

        const elOutMd = document.getElementById('dash-pd-outMd');
        if (elOutMd) elOutMd.innerText = stats.outMd.toFixed(1);
        
        const elVariance = document.getElementById('dash-pd-variance');
        if (elVariance) {
            if (stats.estMd > 0) {
                let varianceVal = ((stats.finalMd - stats.estMd) / stats.estMd * 100).toFixed(1);
                elVariance.innerText = varianceVal + '%';
            } else {
                elVariance.innerText = '0%';
            }
        }
        
        const elShipError = document.getElementById('dash-pd-ship-error');
        if (elShipError) elShipError.innerText = finalAvgShipError;
        
        const elWorkload = document.getElementById('dash-pd-workload');
        if (elWorkload) {
            if (window.teamMembers && window.teamMembers.length > 0) {
                let workLoadVal = (stats.finalMd / (window.teamMembers.length * 240) * 100).toFixed(1);
                elWorkload.innerText = workLoadVal + '%';
            } else {
                elWorkload.innerText = '0%';
            }
        }

        window.renderCharts(stats, monthlyCompleted, annualPlanData, annualActData);
        
        if (window.processPeriodData) {
            window.processPeriodData();
        }

    } catch(e) { 
        console.error("연간 데이터 연산 오류:", e); 
    }
};

// ============================================================
// 💡 리퀘스트 대시보드 처리 로직 추가
// ============================================================
window.processRequestDashboardData = function() {
    try {
        const typeSelect = document.getElementById('req-dash-type-select');
        const filterType = typeSelect ? typeSelect.value : 'all';

        let total = 0, pending = 0, progress = 0, completed = 0;
        let typeCounts = { collab: 0, purchase: 0, repair: 0 };

        (window.allDashRequests || []).forEach(req => {
            // 필터 적용
            if (filterType !== 'all' && req.type !== filterType) return;

            total++;
            
            // 상태 집계
            if (req.status === 'completed') completed++;
            else if (req.status === 'progress' || req.status === 'inspecting') progress++;
            else pending++; // draft, pending 등 모두 대기로 처리

            // 타입별 집계
            if (req.type === 'collab') typeCounts.collab++;
            else if (req.type === 'purchase') typeCounts.purchase++;
            else if (req.type === 'repair') typeCounts.repair++;
        });

        // DOM 업데이트
        if (document.getElementById('dash-req-total')) document.getElementById('dash-req-total').innerText = total;
        if (document.getElementById('dash-req-pending')) document.getElementById('dash-req-pending').innerText = pending;
        if (document.getElementById('dash-req-progress')) document.getElementById('dash-req-progress').innerText = progress;
        if (document.getElementById('dash-req-completed')) document.getElementById('dash-req-completed').innerText = completed;

        // 차트 렌더링
        window.renderRequestCharts(pending, progress, completed, typeCounts);

    } catch(e) {
        console.error("리퀘스트 대시보드 데이터 연산 오류:", e);
    }
};

window.renderRequestCharts = function(pending, progress, completed, typeCounts) {
    const createChart = function(id, type, data, options) {
        const canvas = document.getElementById(id); 
        if (!canvas) return;
        
        // 캔버스 보이기 및 준비중 텍스트 숨기기
        canvas.classList.remove('hidden');
        if(canvas.nextElementSibling) canvas.nextElementSibling.classList.add('hidden');

        if (chartInstances[id]) {
            chartInstances[id].destroy();
        }
        chartInstances[id] = new window.Chart(canvas.getContext('2d'), { type: type, data: data, options: options });
    };

    // 1. Status Overview 차트 (Doughnut)
    createChart('reqStatusChart', 'doughnut', {
        labels: ['대기/임시저장', '진행 중', '작업 완료'],
        datasets: [{
            data: [pending, progress, completed],
            backgroundColor: ['#f59e0b', '#3b82f6', '#10b981'], // amber, blue, emerald
            borderWidth: 2,
            borderColor: '#ffffff',
            borderRadius: 4,
            hoverOffset: 4
        }]
    }, {
        cutout: '65%',
        maintainAspectRatio: false,
        layout: { padding: 15 },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: {size: 11} } } }
    });

    // 2. Requests by Type 차트 (Bar)
    createChart('reqTypeChart', 'bar', {
        labels: ['협업/조립', '구매의뢰', '수리/점검'],
        datasets: [{
            label: '요청 건수',
            data: [typeCounts.collab, typeCounts.purchase, typeCounts.repair],
            backgroundColor: ['#6366f1', '#10b981', '#f43f5e'], // indigo, emerald, rose
            borderRadius: 6,
            maxBarThickness: 40
        }]
    }, {
        maintainAspectRatio: false,
        scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } }
        },
        plugins: { legend: { display: false } }
    });
};
// ============================================================

window.renderCharts = function(stats, monthlyCompleted, planData, actData) {
    const createChart = function(id, type, data, options) {
        const canvas = document.getElementById(id); 
        if (!canvas) return;
        if (chartInstances[id]) {
            chartInstances[id].destroy();
        }
        chartInstances[id] = new window.Chart(canvas.getContext('2d'), { type: type, data: data, options: options });
    };

    let pendingCnt = stats.pending || 0;
    let progressCnt = stats.progress || 0;
    let inspectingCnt = stats.inspecting || 0;
    let completedCnt = stats.completed || 0;
    let rejectedCnt = stats.rejected || 0;

    createChart('projPieChart', 'doughnut', {
        labels: ['대기/보류', '제작중', '검수중', '완료', '불가'],
        datasets: [{ 
            data: [pendingCnt, progressCnt, inspectingCnt, completedCnt, rejectedCnt], 
            backgroundColor: ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#f43f5e'], 
            borderWidth: 2, 
            borderColor: '#ffffff', 
            borderRadius: 4, 
            hoverOffset: 4 
        }]
    }, { 
        cutout: '65%', 
        maintainAspectRatio: false, 
        layout: { padding: 15 },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: {size: 11} } } } 
    });

    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    createChart('projMonthlyChart', 'bar', { 
        labels: months, 
        datasets: [{ label: '출하 완료', data: monthlyCompleted, backgroundColor: '#10b981', borderRadius: 6, maxBarThickness: 30 }] 
    }, { 
        maintainAspectRatio: false, 
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } } }, 
        plugins: { legend: { display: false } } 
    });

    const ctxElement = document.getElementById('annualPlanVsActualChart');
    const ctx = ctxElement ? ctxElement.getContext('2d') : null;
    let gradPlan = null; let gradAct = null;
    
    if (ctx) {
        gradPlan = ctx.createLinearGradient(0, 0, 0, 300);
        gradPlan.addColorStop(0, 'rgba(203, 213, 225, 0.4)'); gradPlan.addColorStop(1, 'rgba(203, 213, 225, 0)');
        gradAct = ctx.createLinearGradient(0, 0, 0, 300);
        gradAct.addColorStop(0, 'rgba(99, 102, 241, 0.4)'); gradAct.addColorStop(1, 'rgba(99, 102, 241, 0)');
    }

    createChart('annualPlanVsActualChart', 'line', { 
        labels: months, 
        datasets: [
            { label: '계획 MD', data: planData, borderColor: '#cbd5e1', backgroundColor: gradPlan, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2 }, 
            { label: '실적(최종) MD', data: actData, borderColor: '#6366f1', backgroundColor: gradAct, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderWidth: 2 }
        ] 
    }, { 
        maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, 
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { dash: [4, 4] } } }, 
        plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } } 
    });
};

window.changePeriodType = function() {
    const typeSelect = document.getElementById('period-type-select');
    let type = 'month';
    if (typeSelect) type = typeSelect.value;
    
    const mInput = document.getElementById('period-value-month');
    const wInput = document.getElementById('period-value-week');
    
    if (type === 'month') { 
        if (mInput) mInput.classList.remove('hidden'); 
        if (wInput) wInput.classList.add('hidden'); 
        if (mInput && !mInput.value) { 
            const d = new Date();
            let monthStr = String(d.getMonth() + 1);
            if (monthStr.length === 1) monthStr = '0' + monthStr;
            mInput.value = d.getFullYear() + '-' + monthStr; 
        } 
    } else { 
        if (mInput) mInput.classList.add('hidden'); 
        if (wInput) wInput.classList.remove('hidden'); 
        if (wInput && !wInput.value && window.getWeekString) {
            wInput.value = window.getWeekString(new Date()); 
        } 
    }
    if (window.processPeriodData) window.processPeriodData();
};

window.processPeriodData = function() {
    const typeSelect = document.getElementById('period-type-select');
    let type = 'month';
    if (typeSelect) type = typeSelect.value;
    
    let valInput = type === 'month' ? document.getElementById('period-value-month') : document.getElementById('period-value-week');
    let val = valInput ? valInput.value : '';
    
    if (!val || !window.allDashProjects) return;

    let start = ''; let end = '';
    
    if (type === 'month') { 
        const parts = val.split('-'); 
        if (parts.length === 2) {
            start = val + '-01'; 
            let lastDayObj = new Date(parts[0], parts[1], 0);
            end = val + '-' + lastDayObj.getDate().toString(); 
        }
    } else { 
        if (window.getDatesFromWeek) { 
            const dates = window.getDatesFromWeek(val); 
            start = window.getLocalDateStr(dates.start); 
            end = window.getLocalDateStr(dates.end); 
        } 
    }

    let pending = 0, progress = 0, urgent = 0, periodCompleted = 0, periodFinalMdTotal = 0, periodOutMdTotal = 0, mgrCounts = {}; 
    let list = [];
    
    window.allDashProjects.forEach(function(p) {
        const status = getSafeString(p.status);
        const shipEn = getSafeString(p.d_shipEn);
        const shipEst = getSafeString(p.d_shipEst);
        
        const fMd = parseFloat(p.finalMd) || 0;
        const oMd = parseFloat(p.outMd) || 0;
        
        let isTargetThisPeriod = false;

        if (status === 'completed') {
            if (shipEn >= start && shipEn <= end) {
                isTargetThisPeriod = true;
            }
        } else {
            if (shipEst >= start && shipEst <= end) {
                isTargetThisPeriod = true;
            }
        }

        if (!isTargetThisPeriod) return;

        periodFinalMdTotal += fMd;
        periodOutMdTotal += oMd;

        if (status === 'completed') periodCompleted++;
        if (status === 'pending') pending++;
        if (status === 'progress' || status === 'inspecting') progress++;

        if (status !== 'completed' && shipEst) {
            const urgentTime = new Date(shipEst).getTime() - new Date().getTime();
            if (urgentTime / (1000 * 60 * 60 * 24) <= 7) urgent++;
        }

        if (p.manager && (status === 'progress' || status === 'inspecting')) {
            mgrCounts[p.manager] = (mgrCounts[p.manager] !== undefined) ? mgrCounts[p.manager] + 1 : 1;
        }

        let projectDataCopy = Object.assign({}, p);
        projectDataCopy.periodFinalMd = fMd;
        list.push(projectDataCopy);
    });

    window.currentPeriodProjects = list;

    const labelPeriodMd = document.getElementById('label-period-md');
    const thPeriodMd = document.getElementById('th-period-md');
    if (labelPeriodMd && thPeriodMd) {
        if (type === 'month') { 
            labelPeriodMd.innerText = "월간 총 투입(최종) 공수"; thPeriodMd.innerText = "최종MD"; 
        } else { 
            labelPeriodMd.innerText = "주간 총 투입(최종) 공수"; thPeriodMd.innerText = "최종MD"; 
        }
    }

    const elPeriodCompleted = document.getElementById('pd-period-completed');
    if (elPeriodCompleted) elPeriodCompleted.innerText = periodCompleted;

    const elPeriodPending = document.getElementById('pd-period-pending');
    if (elPeriodPending) elPeriodPending.innerText = pending; 
    
    const elPeriodProgress = document.getElementById('pd-period-progress');
    if (elPeriodProgress) elPeriodProgress.innerText = progress; 
    
    const elPeriodUrgent = document.getElementById('pd-period-urgent');
    if (elPeriodUrgent) elPeriodUrgent.innerText = urgent;
    
    const elPeriodTotalMd = document.getElementById('pd-period-total-md');
    if (elPeriodTotalMd) elPeriodTotalMd.innerText = periodFinalMdTotal.toFixed(1);

    const elPeriodOutMd = document.getElementById('pd-period-out-md');
    if (elPeriodOutMd) elPeriodOutMd.innerText = periodOutMdTotal.toFixed(1);

    const elPeriodWorkload = document.getElementById('pd-period-workload');
    if (elPeriodWorkload) {
        let teamCount = window.teamMembers ? window.teamMembers.length : 0;
        if (teamCount > 0) {
            let workingDays = (type === 'month') ? 20 : 5;
            let pWorkload = (periodFinalMdTotal / (teamCount * workingDays)) * 100;
            elPeriodWorkload.innerText = pWorkload.toFixed(1) + '%';
        } else {
            elPeriodWorkload.innerText = '0%';
        }
    }

    const tbody = document.getElementById('period-table-body');
    if (tbody) {
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center p-6 text-slate-400 font-bold">내역 없음</td></tr>';
        } else {
            const sortedList = list.sort(function(a, b) { return b.periodFinalMd - a.periodFinalMd; });
            const statusMap = { 'pending':'대기/보류', 'progress':'진행중', 'inspecting':'검수중', 'completed':'완료', 'rejected':'불가' };
            
            let htmlStr = '';
            sortedList.forEach(function(p) {
                const safePart = p.part || '-';
                const safeCode = p.code || '-';
                const safeName = p.name || '-';
                const safeEst = p.d_shipEst || '-';
                const safeProg = p.progress || 0;
                let safeStatus = statusMap[p.status] || p.status;
                const safeEstMd = p.estMd || 0;
                const safeOutMd = p.outMd || 0;
                const safePeriodFinalMd = p.periodFinalMd.toFixed(1);
                const diffMd = (parseFloat(p.periodFinalMd || 0) - parseFloat(p.estMd || 0)).toFixed(1);
                
                htmlStr += '<tr class="hover:bg-slate-50 border-b border-slate-100">';
                htmlStr += '<td class="p-2 text-center">' + safePart + '</td>';
                htmlStr += '<td class="p-2 text-center font-bold text-indigo-700">' + safeCode + '</td>';
                htmlStr += '<td class="p-2 font-bold truncate max-w-[160px]" title="' + safeName + '">' + safeName + '</td>';
                htmlStr += '<td class="p-2 text-center text-rose-500 font-bold">' + safeEst + '</td>';
                htmlStr += '<td class="p-2 text-center text-emerald-600 font-bold">' + safeProg + '%</td>';
                htmlStr += '<td class="p-2 text-center text-slate-500">' + safeStatus + '</td>';
                htmlStr += '<td class="p-2 text-center">' + safeEstMd + '</td>';
                htmlStr += '<td class="p-2 text-center text-amber-500 font-bold">' + safeOutMd + '</td>';
                htmlStr += '<td class="p-2 text-center font-black text-indigo-600 bg-indigo-50/30">' + safePeriodFinalMd + '</td>';
                htmlStr += '<td class="p-2 text-center font-bold">' + diffMd + '</td>';
                htmlStr += '</tr>';
            });
            tbody.innerHTML = htmlStr;
        }
        
        const countLabel = document.getElementById('period-table-count');
        if (countLabel) countLabel.innerText = '총 ' + list.length + '건';
    }
    
    renderPeriodCharts(type, val, list, mgrCounts, periodFinalMdTotal);
};

function renderPeriodCharts(type, val, projects, mgrCounts, periodFinalMdTotal) {
    const createChart = function(id, cType, data, options) {
        const canvas = document.getElementById(id); 
        if (!canvas) return;
        if (chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new window.Chart(canvas.getContext('2d'), { type: cType, data: data, options: options });
    };

    let labels1 = []; let data1 = [];
    
    if (type === 'month') { 
        labels1 = ['1주', '2주', '3주', '4주', '5주', '6주']; 
        data1 = [0, 0, 0, 0, 0, 0]; 
        projects.forEach(function(p) { 
            if (p.status === 'completed' && p.d_shipEn && p.d_shipEn.startsWith(val)) { 
                const parts = p.d_shipEn.split('-');
                if(parts.length >= 3) {
                    const dateObj = new Date(p.d_shipEn);
                    const weekIdx = Math.floor((dateObj.getDate() - 1) / 7);
                    if (weekIdx >= 0 && weekIdx <= 5) data1[weekIdx]++;
                }
            } 
        }); 
    } else { 
        labels1 = ['월', '화', '수', '목', '금']; 
        data1 = [0, 0, 0, 0, 0]; 
        projects.forEach(function(p) { 
            if (p.status === 'completed' && p.d_shipEn) { 
                const dDate = new Date(p.d_shipEn);
                if (!isNaN(dDate.getTime())) {
                    const dayIdx = dDate.getDay() - 1; 
                    if (dayIdx >= 0 && dayIdx < 5) data1[dayIdx]++; 
                }
            } 
        }); 
    }
    
    createChart('periodChart1', 'line', { 
        labels: labels1, 
        datasets: [{ label: '완료 건수', data: data1, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.2)', fill: true, tension: 0.4, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#fff', pointBorderWidth: 2 }] 
    }, { maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } } }, plugins: { legend: { display: false } } });
    
    let estTotal = 0; 
    projects.forEach(function(p) { estTotal += parseFloat(p.estMd) || 0; });
    
    createChart('periodChart2', 'bar', { 
        labels: ['현재 기간'], 
        datasets: [
            { label: '계획 MD', data: [estTotal], backgroundColor: '#cbd5e1', borderRadius: 6, maxBarThickness: 60 }, 
            { label: '실적(최종) MD', data: [periodFinalMdTotal], backgroundColor: '#6366f1', borderRadius: 6, maxBarThickness: 60 }
        ] 
    }, { maintainAspectRatio: false, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { dash: [4, 4] } } }, plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } } });

    let mgrL = Object.keys(mgrCounts); let mgrD = Object.values(mgrCounts);
    let chartLabels = mgrL.length > 0 ? mgrL : ['없음'];
    let chartData = mgrL.length > 0 ? mgrD : [0];
    
    createChart('periodChart3', 'bar', { 
        labels: chartLabels, 
        datasets: [{ label: '진행중 PJT', data: chartData, backgroundColor: '#8b5cf6', borderRadius: 6 }] 
    }, { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } });
}

window.exportDashboardExcel = async function() {
    if (window.userProfile && window.userProfile.role !== 'admin') {
        if (window.showToast) window.showToast('보고서 다운로드는 관리자만 가능합니다.', 'error');
        return;
    }
    if (typeof window.ExcelJS === 'undefined') {
        if (window.showToast) window.showToast("ExcelJS 모듈이 로드되지 않았습니다. 인터넷 연결을 확인해주세요.", "error");
        return;
    }

    try {
        if (window.showToast) window.showToast("엑셀 현황 보고서를 생성 중입니다...", "success");
        const wb = new window.ExcelJS.Workbook();

        const ws1 = wb.addWorksheet('대시보드_요약', { views: [{ showGridLines: false }] });

        ws1.columns = [
            { width: 2 },   { width: 15 },  { width: 15 },  { width: 15 },  { width: 2 },
            { width: 15 },  { width: 15 },  { width: 15 },  { width: 2 },
            { width: 15 },  { width: 15 },  { width: 15 },
        ];

        ws1.mergeCells('B2:L3');
        const titleCell = ws1.getCell('B2');
        titleCell.value = `AXBIS 프로젝트 통합 대시보드 현황 보고서 (${window.currentDashStats.year}년)`;
        titleCell.font = { name: '맑은 고딕', size: 20, bold: true, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

        ws1.mergeCells('B4:D4');
        ws1.getCell('B4').value = `출력일시: ${new Date().toLocaleString()}`;
        ws1.getCell('B4').font = { size: 10, color: { argb: 'FF64748B' } };

        ws1.mergeCells('F4:H4');
        ws1.getCell('F4').value = `출력자: ${window.userProfile.name} (${window.userProfile.team})`;
        ws1.getCell('F4').font = { size: 10, color: { argb: 'FF64748B' } };

        const createKPICard = (startRow, startCol, endRow, endCol, title, value, subtext, bgColor, titleColor, valColor) => {
            ws1.mergeCells(`${startCol}${startRow}:${endCol}${startRow}`);
            ws1.mergeCells(`${startCol}${startRow+1}:${endCol}${endRow-1}`);
            ws1.mergeCells(`${startCol}${endRow}:${endCol}${endRow}`);

            for(let r=startRow; r<=endRow; r++) {
                for(let c=ws1.getColumn(startCol).number; c<=ws1.getColumn(endCol).number; c++) {
                    let cell = ws1.getCell(r, c);
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.border = {
                        top: {style: r===startRow?'medium':'none', color: {argb: titleColor}},
                        bottom: {style: r===endRow?'medium':'none', color: {argb: titleColor}},
                        left: {style: c===ws1.getColumn(startCol).number?'medium':'none', color: {argb: titleColor}},
                        right: {style: c===ws1.getColumn(endCol).number?'medium':'none', color: {argb: titleColor}}
                    };
                }
            }

            let tCell = ws1.getCell(`${startCol}${startRow}`);
            tCell.value = title;
            tCell.font = { bold: true, size: 11, color: { argb: titleColor } };
            tCell.alignment = { vertical: 'middle', horizontal: 'center', indent: 1 };

            let vCell = ws1.getCell(`${startCol}${startRow+1}`);
            vCell.value = value;
            vCell.font = { bold: true, size: 24, color: { argb: valColor } };
            vCell.alignment = { vertical: 'middle', horizontal: 'center' };

            let sCell = ws1.getCell(`${startCol}${endRow}`);
            sCell.value = subtext;
            sCell.font = { size: 9, color: { argb: 'FF64748B' } };
            sCell.alignment = { vertical: 'middle', horizontal: 'center' };
        };

        createKPICard(6, 'B', 9, 'D', '완료 (출하)', `${window.currentDashStats.completed} 건`, '해당 연도 출하 기준', 'FFF0FDF4', 'FF10B981', 'FF059669'); 
        createKPICard(6, 'F', 9, 'H', '진행 및 검수중', `${window.currentDashStats.progress + window.currentDashStats.inspecting} 건`, '제작 및 검수 진행중', 'FFEFF6FF', 'FF3B82F6', 'FF1D4ED8'); 
        createKPICard(6, 'J', 9, 'L', '목표대비 출하 평균 오차', `${window.currentDashStats.avgShipError} 일`, '출하완료 PJT 평균', 'FFF0F9FF', 'FF0EA5E9', 'FF0284C7'); 

        createKPICard(11, 'B', 14, 'D', '총 예정 공수', `${parseFloat(window.currentDashStats.estMd).toFixed(1)} MD`, '타겟 프로젝트 합산', 'FFEEF2FF', 'FF6366F1', 'FF4338CA'); 
        createKPICard(11, 'F', 14, 'H', '총 투입 공수 (최종)', `${parseFloat(window.currentDashStats.finalMd).toFixed(1)} MD`, '타겟 프로젝트 합산', 'FFF5F3FF', 'FF8B5CF6', 'FF6D28D9'); 
        let varianceVal = window.currentDashStats.estMd > 0 ? ((window.currentDashStats.finalMd - window.currentDashStats.estMd) / window.currentDashStats.estMd * 100).toFixed(1) : 0;
        createKPICard(11, 'J', 14, 'L', '계획대비 편차율', `${varianceVal}%`, '(최종 - 예정) / 예정', 'FFFFFBEB', 'FFF59E0B', 'FFD97706'); 


        const typeSelect = document.getElementById('period-type-select');
        let periodTypeStr = '';
        if (typeSelect && typeSelect.value === 'month') {
            let mEl = document.getElementById('period-value-month');
            if (mEl) periodTypeStr = mEl.value;
        } else {
            let wEl = document.getElementById('period-value-week');
            if (wEl) periodTypeStr = wEl.value;
        }

        const ws2 = wb.addWorksheet('조회기간_프로젝트상세', { views: [{ showGridLines: false }] });
        ws2.columns = [
            { width: 12 }, { width: 18 }, { width: 45 }, { width: 15 }, { width: 12 },
            { width: 15 }, { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 },
            { width: 12 }, { width: 12 }
        ];

        ws2.mergeCells('A1:L2');
        ws2.getCell('A1').value = `[${periodTypeStr}] 기간 내 프로젝트 리스트`;
        ws2.getCell('A1').font = { bold: true, size: 16, color: {argb: 'FF1E293B'} };
        ws2.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };

        const headers = ['파트', 'PJT 코드', '프로젝트명', '현재상태', '진행률', '예정출하일', '실제출하일', '예정MD', '실투입MD', '외주MD', '최종MD', '편차'];
        let hr = ws2.addRow(headers);
        hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        hr.height = 25;
        hr.eachCell(function(c) {
            c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            c.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        const sMap = { 'pending': '대기/보류', 'progress': '진행중', 'inspecting': '검수중', 'completed': '완료', 'rejected': '불가' };
        const sortedProjects = window.currentPeriodProjects.slice().sort(function(a, b) { return b.periodFinalMd - a.periodFinalMd; });

        sortedProjects.forEach(function(p) {
            let safeStatus = sMap[p.status] || p.status;
            let cMd = parseFloat(p.currentMd) || 0;
            let eMd = parseFloat(p.estMd) || 0;
            let oMd = parseFloat(p.outMd) || 0;
            let fMd = parseFloat(p.periodFinalMd) || 0;
            let variance = (fMd - eMd).toFixed(1);

            let row = ws2.addRow([
                p.part || '-', p.code || '-', p.name || '-', safeStatus, (parseFloat(p.progress) || 0) / 100, 
                p.d_shipEst || '-', p.d_shipEn || '-', eMd, cMd, oMd, fMd, parseFloat(variance) 
            ]);

            row.eachCell(function(c, colNumber) {
                c.border = { top: { style: 'thin', color:{argb:'FFE2E8F0'} }, left: { style: 'thin', color:{argb:'FFE2E8F0'} }, bottom: { style: 'thin', color:{argb:'FFE2E8F0'} }, right: { style: 'thin', color:{argb:'FFE2E8F0'} } };
                c.alignment = { vertical: 'middle', horizontal: (colNumber === 3) ? 'left' : 'center' };

                if (colNumber === 5) {
                    c.numFmt = '0%'; 
                } else if (colNumber >= 8) {
                    c.numFmt = '#,##0.0';
                    if (colNumber === 12) { 
                        let numVar = parseFloat(variance);
                        if (numVar > 0) c.font = { color: { argb: 'FFEF4444' }, bold: true }; 
                        else if (numVar < 0) c.font = { color: { argb: 'FF3B82F6' }, bold: true }; 
                    }
                }
            });
        });

        const ws3 = wb.addWorksheet('전체_Raw_Data');
        ws3.columns = [
            { header: 'ID', key: 'id', width: 20 }, { header: '카테고리', key: 'category', width: 12 },
            { header: '파트', key: 'part', width: 12 }, { header: '상태', key: 'status', width: 12 },
            { header: 'PJT코드', key: 'code', width: 18 }, { header: '프로젝트명', key: 'name', width: 40 },
            { header: '고객사', key: 'company', width: 20 }, { header: '담당자', key: 'manager', width: 15 },
            { header: '예정MD', key: 'estMd', width: 10 }, { header: '실투입MD', key: 'currentMd', width: 10 },
            { header: '외주MD', key: 'outMd', width: 10 }, { header: '최종MD', key: 'finalMd', width: 10 },
            { header: '총투입인원', key: 'totPers', width: 10 }, { header: '조립예정일', key: 'd_asmEst', width: 15 },
            { header: '출하예정일', key: 'd_shipEst', width: 15 }, { header: '출하실제일', key: 'd_shipEn', width: 15 },
        ];

        let rawHeader = ws3.getRow(1);
        rawHeader.font = { bold: true };
        rawHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

        (window.allDashProjects || []).forEach(p => {
            ws3.addRow({
                id: p.id, category: p.category, part: p.part, status: sMap[p.status] || p.status,
                code: p.code, name: p.name, company: p.company, manager: p.manager,
                estMd: parseFloat(p.estMd) || 0, currentMd: parseFloat(p.currentMd) || 0,
                outMd: parseFloat(p.outMd) || 0, finalMd: parseFloat(p.finalMd) || 0,
                totPers: parseInt(p.totPers) || 0, d_asmEst: p.d_asmEst, d_shipEst: p.d_shipEst, d_shipEn: p.d_shipEn
            });
        });

        const buffer = await wb.xlsx.writeBuffer();
        let todayStr = new Date().toISOString().split('T')[0];
        window.saveAs(new Blob([buffer]), 'AXBIS_PJT현황보고서_' + todayStr + '.xlsx');

    } catch (e) { 
        console.error(e); 
        if (window.showToast) window.showToast("엑셀 파일 생성 중 오류가 발생했습니다.", "error"); 
    }
};
