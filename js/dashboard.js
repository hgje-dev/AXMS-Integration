import { db } from './firebase.js';
import { collection, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let homeReqSnapshotUnsubscribe = null;
let homeProjSnapshotUnsubscribe = null;
let homeMdLogSnapshotUnsubscribe = null;
let chartInstances = {};

window.currentDashStats = {};
window.currentPeriodProjects = [];

const getSafeString = (val) => {
    return (val === null || val === undefined) ? '' : String(val);
};

window.loadHomeDashboards = function() {
    try {
        const exportBtn = document.getElementById('btn-export-dash');
        if (exportBtn && window.userProfile?.role === 'admin') {
            exportBtn.classList.remove('hidden');
        }

        if (homeReqSnapshotUnsubscribe) homeReqSnapshotUnsubscribe();
        if (homeProjSnapshotUnsubscribe) homeProjSnapshotUnsubscribe();
        if (homeMdLogSnapshotUnsubscribe) homeMdLogSnapshotUnsubscribe();
        
        homeProjSnapshotUnsubscribe = onSnapshot(collection(db, "projects_status"), (snapshot) => { 
            window.allDashProjects = []; 
            snapshot.forEach(docSnap => {
                window.allDashProjects.push({ id: docSnap.id, ...docSnap.data() });
            }); 
            if (window.processDashboardData) window.processDashboardData(); 
        });

        homeMdLogSnapshotUnsubscribe = onSnapshot(collection(db, "project_md_logs"), (snapshot) => { 
            window.allDashMdLogs = []; 
            snapshot.forEach(docSnap => {
                window.allDashMdLogs.push({ id: docSnap.id, ...docSnap.data() });
            }); 
            if (window.processDashboardData) window.processDashboardData(); 
        });

        setTimeout(() => { 
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
        
        (window.allDashProjects || []).forEach(p => { 
            if (p.d_shipEst) years.add(parseInt(p.d_shipEst.substring(0, 4))); 
            if (p.d_shipEn) years.add(parseInt(p.d_shipEn.substring(0, 4))); 
        });
        
        (window.allDashMdLogs || []).forEach(l => { 
            if (l.date) years.add(parseInt(l.date.substring(0, 4))); 
        });
        
        let yearArray = Array.from(years).filter(y => !isNaN(y) && y > 2000).sort((a, b) => a - b);
        const yearSelect = document.getElementById('dash-year-select');
        
        if (yearSelect) {
            const currentVal = yearSelect.value || currentYear.toString(); 
            yearSelect.innerHTML = '';
            yearArray.forEach(y => { 
                yearSelect.innerHTML += `<option value="${y}" ${y.toString() === currentVal ? 'selected' : ''}>${y}년</option>`; 
            });
            if (yearSelect.value !== currentVal) {
                yearSelect.value = currentVal;
            }
        }

        const year = yearSelect?.value || currentYear.toString(); 
        let stats = { estMd: 0, curMd: 0, completed: 0, delayed: 0, pending: 0, progress: 0, inspecting: 0, rejected: 0 }; 
        let annualPlanData = Array(12).fill(0); 
        let annualActData = Array(12).fill(0); 
        let monthlyCompleted = Array(12).fill(0);
        let totalShipErrorDays = 0; 
        let shipErrorCount = 0;

        (window.allDashProjects || []).forEach(data => {
            const shipEn = getSafeString(data.d_shipEn);
            const shipEst = getSafeString(data.d_shipEst);
            const status = getSafeString(data.status);
            
            let isInYear = (shipEn.startsWith(year) || shipEst.startsWith(year) || ['pending', 'progress', 'inspecting'].includes(status));
            if (!isInYear) return;
            
            stats[status] = (stats[status] || 0) + 1;
            
            if (shipEst.startsWith(year)) { 
                let mIdx = parseInt(shipEst.split('-')[1]) - 1; 
                if (mIdx >= 0 && mIdx < 12) {
                    annualPlanData[mIdx] += parseFloat(data.estMd) || 0; 
                }
            }
            
            if (status === 'completed' && (shipEn.startsWith(year) || shipEst.startsWith(year))) {
                stats.completed++; 
                let targetDate = shipEn || shipEst;
                if (targetDate.startsWith(year)) { 
                    let mIdx = parseInt(targetDate.split('-')[1]) - 1; 
                    if (mIdx >= 0 && mIdx < 12) {
                        monthlyCompleted[mIdx]++; 
                    }
                }
            }
            
            stats.estMd += parseFloat(data.estMd) || 0;
            
            if (status !== 'completed' && shipEst) { 
                const diffTime = new Date(shipEst).getTime() - new Date().getTime();
                if (diffTime / (1000 * 60 * 60 * 24) <= 7) {
                    stats.delayed++; 
                }
            }
            
            if (shipEn && shipEst && status === 'completed') {
                const enD = new Date(shipEn);
                const estD = new Date(shipEst);
                if (!isNaN(enD.getTime()) && !isNaN(estD.getTime())) { 
                    totalShipErrorDays += (enD.getTime() - estD.getTime()) / (1000 * 60 * 60 * 24); 
                    shipErrorCount++; 
                }
            }
        });

        (window.allDashMdLogs || []).forEach(log => { 
            const date = getSafeString(log.date); 
            if (date.startsWith(year)) { 
                let md = parseFloat(log.md) || 0; 
                stats.curMd += md; 
                let mIdx = parseInt(date.split('-')[1]) - 1; 
                if (mIdx >= 0 && mIdx < 12) {
                    annualActData[mIdx] += md; 
                }
            } 
        });

        window.currentDashStats = { 
            year: year, 
            ...stats, 
            avgShipError: shipErrorCount > 0 ? Math.round(totalShipErrorDays / shipErrorCount) : 0 
        };

        const dashTeamCountEl = document.getElementById('dash-team-count');
        if (dashTeamCountEl) dashTeamCountEl.innerText = `${window.teamMembers?.length || 0}명`;
        
        const elCompleted = document.getElementById('dash-pd-completed');
        if (elCompleted) elCompleted.innerText = stats.completed;
        
        const elDelayed = document.getElementById('dash-pd-delayed');
        if (elDelayed) elDelayed.innerText = stats.delayed;
        
        const elEstMd = document.getElementById('dash-pd-estMd');
        if (elEstMd) elEstMd.innerText = stats.estMd.toFixed(1);
        
        const elCurMd = document.getElementById('dash-pd-curMd');
        if (elCurMd) elCurMd.innerText = stats.curMd.toFixed(1);
        
        const elVariance = document.getElementById('dash-pd-variance');
        if (elVariance) {
            elVariance.innerText = stats.estMd > 0 ? ((stats.curMd - stats.estMd) / stats.estMd * 100).toFixed(1) + '%' : '0%';
        }
        
        const elShipError = document.getElementById('dash-pd-ship-error');
        if (elShipError) elShipError.innerText = window.currentDashStats.avgShipError;
        
        const elWorkload = document.getElementById('dash-pd-workload');
        if (elWorkload) {
            elWorkload.innerText = window.teamMembers?.length > 0 ? (stats.curMd / (window.teamMembers.length * 240) * 100).toFixed(1) + '%' : '0%';
        }

        window.renderCharts(stats, monthlyCompleted, annualPlanData, annualActData);
        window.processPeriodData();

    } catch(e) { 
        console.error("연간 데이터 연산 오류:", e); 
    }
};

window.renderCharts = function(stats, monthlyCompleted, planData, actData) {
    const createChart = (id, type, data, options) => {
        const canvas = document.getElementById(id); 
        if (!canvas) return;
        if (chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new Chart(canvas.getContext('2d'), { type: type, data: data, options: options });
    };

    // 🌟 파이 차트 수정: padding을 넉넉히 주어 잘림 방지
    createChart('projPieChart', 'doughnut', {
        labels: ['대기/보류', '제작중', '검수중', '완료', '불가'],
        datasets: [{ 
            data: [stats.pending || 0, stats.progress || 0, stats.inspecting || 0, stats.completed || 0, stats.rejected || 0], 
            backgroundColor: ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#f43f5e'], 
            borderWidth: 2, 
            borderColor: '#ffffff', 
            borderRadius: 4, 
            hoverOffset: 4 
        }]
    }, { 
        cutout: '65%', 
        maintainAspectRatio: false, 
        layout: {
            padding: 15 // 차트가 박스에 닿지 않도록 여백 추가
        },
        plugins: { 
            legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: {size: 11} } } 
        } 
    });

    const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    createChart('projMonthlyChart', 'bar', { 
        labels: months, 
        datasets: [{ 
            label: '출하 완료', 
            data: monthlyCompleted, 
            backgroundColor: '#10b981', 
            borderRadius: 6, 
            maxBarThickness: 30 
        }] 
    }, { 
        maintainAspectRatio: false, 
        scales: { 
            x: { grid: { display: false } }, 
            y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } } 
        }, 
        plugins: { legend: { display: false } } 
    });

    const ctxElement = document.getElementById('annualPlanVsActualChart');
    const ctx = ctxElement ? ctxElement.getContext('2d') : null;
    let gradPlan = null;
    let gradAct = null;
    
    if (ctx) {
        gradPlan = ctx.createLinearGradient(0, 0, 0, 300);
        gradPlan.addColorStop(0, 'rgba(203, 213, 225, 0.4)');
        gradPlan.addColorStop(1, 'rgba(203, 213, 225, 0)');
        
        gradAct = ctx.createLinearGradient(0, 0, 0, 300);
        gradAct.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
        gradAct.addColorStop(1, 'rgba(99, 102, 241, 0)');
    }

    createChart('annualPlanVsActualChart', 'line', { 
        labels: months, 
        datasets: [
            { 
                label: '계획 MD', 
                data: planData, 
                borderColor: '#cbd5e1', 
                backgroundColor: gradPlan, 
                fill: true, 
                tension: 0.4, 
                borderWidth: 3, 
                pointRadius: 4, 
                pointHoverRadius: 6, 
                pointBackgroundColor: '#fff', 
                pointBorderWidth: 2 
            }, 
            { 
                label: '실적 MD', 
                data: actData, 
                borderColor: '#6366f1', 
                backgroundColor: gradAct, 
                fill: true, 
                tension: 0.4, 
                borderWidth: 3, 
                pointRadius: 4, 
                pointHoverRadius: 6, 
                pointBackgroundColor: '#fff', 
                pointBorderWidth: 2 
            }
        ] 
    }, { 
        maintainAspectRatio: false, 
        interaction: { mode: 'index', intersect: false }, 
        scales: { 
            x: { grid: { display: false } }, 
            y: { beginAtZero: true, border: { dash: [4, 4] } } 
        }, 
        plugins: { 
            legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } 
        } 
    });
};

window.changePeriodType = function() {
    const typeSelect = document.getElementById('period-type-select');
    const type = typeSelect ? typeSelect.value : 'month';
    const mInput = document.getElementById('period-value-month');
    const wInput = document.getElementById('period-value-week');
    
    if (type === 'month') { 
        if (mInput) mInput.classList.remove('hidden'); 
        if (wInput) wInput.classList.add('hidden'); 
        if (mInput && !mInput.value) { 
            const d = new Date(); 
            mInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; 
        } 
    } else { 
        if (mInput) mInput.classList.add('hidden'); 
        if (wInput) wInput.classList.remove('hidden'); 
        if (wInput && !wInput.value && window.getWeekString) {
            wInput.value = window.getWeekString(new Date()); 
        } 
    }
    window.processPeriodData();
};

window.processPeriodData = function() {
    const typeSelect = document.getElementById('period-type-select');
    const type = typeSelect ? typeSelect.value : 'month';
    const valInput = type === 'month' ? document.getElementById('period-value-month') : document.getElementById('period-value-week');
    const val = valInput ? valInput.value : '';
    
    if (!val || !window.allDashProjects) return;

    let start = '';
    let end = '';
    
    if (type === 'month') { 
        const parts = val.split('-'); 
        if (parts.length === 2) {
            start = `${val}-01`; 
            end = `${val}-${new Date(parts[0], parts[1], 0).getDate()}`; 
        }
    } else { 
        if (window.getDatesFromWeek) { 
            const dates = window.getDatesFromWeek(val); 
            start = window.getLocalDateStr(dates.start); 
            end = window.getLocalDateStr(dates.end); 
        } 
    }

    let pending = 0, progress = 0, urgent = 0, periodMdTotal = 0, mgrCounts = {}; 
    const list = [];
    
    (window.allDashProjects || []).forEach(p => {
        let relevant = (['pending', 'progress', 'inspecting'].includes(p.status) || (p.d_shipEn >= start && p.d_shipEn <= end) || (p.d_shipEst >= start && p.d_shipEst <= end));
        if (!relevant) return;
        
        let pMd = 0; 
        (window.allDashMdLogs || []).forEach(l => { 
            if (l.projectId === p.id && l.date >= start && l.date <= end) { 
                pMd += parseFloat(l.md) || 0; 
                periodMdTotal += parseFloat(l.md) || 0; 
            } 
        });
        
        if (p.status === 'pending') pending++; 
        if (['progress', 'inspecting'].includes(p.status)) progress++;
        
        if (p.status !== 'completed' && p.d_shipEst) { 
            const urgentTime = new Date(p.d_shipEst).getTime() - new Date().getTime();
            if (urgentTime / (1000 * 60 * 60 * 24) <= 7) {
                urgent++; 
            }
        }
        
        if (p.manager && ['progress', 'inspecting'].includes(p.status)) {
            mgrCounts[p.manager] = (mgrCounts[p.manager] || 0) + 1;
        }
        
        list.push({ ...p, periodMd: pMd });
    });

    window.currentPeriodProjects = list;

    const labelPeriodMd = document.getElementById('label-period-md');
    const thPeriodMd = document.getElementById('th-period-md');
    if (labelPeriodMd && thPeriodMd) {
        if (type === 'month') { 
            labelPeriodMd.innerText = "월간 총 투입 공수"; 
            thPeriodMd.innerText = "해당월 투입MD"; 
        } else { 
            labelPeriodMd.innerText = "주간 총 투입 공수"; 
            thPeriodMd.innerText = "해당주 투입MD"; 
        }
    }

    const elPeriodPending = document.getElementById('pd-period-pending');
    if (elPeriodPending) elPeriodPending.innerText = pending; 
    
    const elPeriodProgress = document.getElementById('pd-period-progress');
    if (elPeriodProgress) elPeriodProgress.innerText = progress; 
    
    const elPeriodUrgent = document.getElementById('pd-period-urgent');
    if (elPeriodUrgent) elPeriodUrgent.innerText = urgent;
    
    const elPeriodTotalMd = document.getElementById('pd-period-total-md');
    if (elPeriodTotalMd) elPeriodTotalMd.innerText = periodMdTotal.toFixed(1);

    const teamCount = window.teamMembers?.length || 0;
    const elPeriodWorkload = document.getElementById('pd-period-workload');
    if (elPeriodWorkload) {
        elPeriodWorkload.innerText = teamCount > 0 ? (periodMdTotal / (teamCount * (type === 'month' ? 20 : 5)) * 100).toFixed(1) + '%' : '0%';
    }

    const tbody = document.getElementById('period-table-body');
    if (tbody) {
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center p-6 text-slate-400 font-bold">내역 없음</td></tr>';
        } else {
            const sortedList = list.sort((a, b) => b.periodMd - a.periodMd);
            const statusMap = { 'pending':'대기/보류', 'progress':'진행중', 'inspecting':'검수중', 'completed':'완료', 'rejected':'불가' };
            
            let htmlStr = '';
            sortedList.forEach(p => {
                const safePart = p.part || '-';
                const safeCode = p.code || '-';
                const safeName = p.name || '-';
                const safeEst = p.d_shipEst || '-';
                const safeProg = p.progress || 0;
                const safeStatus = statusMap[p.status] || p.status;
                const safeEstMd = p.estMd || 0;
                const safePeriodMd = p.periodMd.toFixed(1);
                const safeFinalMd = p.finalMd || 0;
                const diffMd = (parseFloat(p.finalMd || 0) - parseFloat(p.estMd || 0)).toFixed(1);
                
                htmlStr += `<tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="p-2 text-center">${safePart}</td>
                    <td class="p-2 text-center font-bold text-indigo-700">${safeCode}</td>
                    <td class="p-2 font-bold truncate max-w-[160px]" title="${safeName}">${safeName}</td>
                    <td class="p-2 text-center text-rose-500 font-bold">${safeEst}</td>
                    <td class="p-2 text-center text-emerald-600 font-bold">${safeProg}%</td>
                    <td class="p-2 text-center text-slate-500">${safeStatus}</td>
                    <td class="p-2 text-center">${safeEstMd}</td>
                    <td class="p-2 text-center font-black text-indigo-600 bg-indigo-50/30">${safePeriodMd}</td>
                    <td class="p-2 text-center text-purple-600 font-bold">${safeFinalMd}</td>
                    <td class="p-2 text-center font-bold">${diffMd}</td>
                </tr>`;
            });
            tbody.innerHTML = htmlStr;
        }
        
        const countLabel = document.getElementById('period-table-count');
        if (countLabel) countLabel.innerText = `총 ${list.length}건`;
    }
    
    renderPeriodCharts(type, val, list, mgrCounts, periodMdTotal);
};

function renderPeriodCharts(type, val, projects, mgrCounts, periodMdTotal) {
    const createChart = (id, cType, data, options) => {
        const canvas = document.getElementById(id); 
        if (!canvas) return;
        if (chartInstances[id]) chartInstances[id].destroy();
        chartInstances[id] = new Chart(canvas.getContext('2d'), { type: cType, data: data, options: options });
    };

    let labels1 = [];
    let data1 = [];
    
    if (type === 'month') { 
        labels1 = ['1주', '2주', '3주', '4주', '5주', '6주']; 
        data1 = [0, 0, 0, 0, 0, 0]; 
        projects.forEach(p => { 
            if (p.status === 'completed' && p.d_shipEn && p.d_shipEn.startsWith(val)) { 
                const parts = p.d_shipEn.split('-');
                if(parts.length >= 3) {
                    const dayNum = parseInt(parts[2]);
                    const weekIdx = Math.min(5, Math.floor((dayNum - 1) / 7));
                    data1[weekIdx]++;
                }
            } 
        }); 
    } else { 
        labels1 = ['월', '화', '수', '목', '금']; 
        data1 = [0, 0, 0, 0, 0]; 
        projects.forEach(p => { 
            if (p.status === 'completed' && p.d_shipEn) { 
                const dDate = new Date(p.d_shipEn);
                if (!isNaN(dDate.getTime())) {
                    const dayIdx = dDate.getDay() - 1; 
                    if (dayIdx >= 0 && dayIdx < 5) {
                        data1[dayIdx]++; 
                    }
                }
            } 
        }); 
    }
    
    createChart('periodChart1', 'line', { 
        labels: labels1, 
        datasets: [{ 
            label: '완료 건수', 
            data: data1, 
            borderColor: '#10b981', 
            backgroundColor: 'rgba(16, 185, 129, 0.2)', 
            fill: true, 
            tension: 0.4, 
            borderWidth: 3, 
            pointRadius: 4, 
            pointBackgroundColor: '#fff', 
            pointBorderWidth: 2 
        }] 
    }, { 
        maintainAspectRatio: false, 
        scales: { 
            x: { grid: { display: false } }, 
            y: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } } 
        }, 
        plugins: { legend: { display: false } } 
    });
    
    let estTotal = 0; 
    projects.forEach(p => {
        estTotal += parseFloat(p.estMd) || 0;
    });
    
    createChart('periodChart2', 'bar', { 
        labels: ['현재 기간'], 
        datasets: [
            { label: '계획 MD', data: [estTotal], backgroundColor: '#cbd5e1', borderRadius: 6, maxBarThickness: 60 }, 
            { label: '실적 MD', data: [periodMdTotal], backgroundColor: '#6366f1', borderRadius: 6, maxBarThickness: 60 }
        ] 
    }, { 
        maintainAspectRatio: false, 
        scales: { 
            x: { grid: { display: false } }, 
            y: { beginAtZero: true, border: { dash: [4, 4] } } 
        }, 
        plugins: { 
            legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } 
        } 
    });

    let mgrL = Object.keys(mgrCounts);
    let mgrD = Object.values(mgrCounts);
    
    createChart('periodChart3', 'bar', { 
        labels: mgrL.length > 0 ? mgrL : ['없음'], 
        datasets: [{ 
            label: '진행중 PJT', 
            data: mgrD.length > 0 ? mgrD : [0], 
            backgroundColor: '#8b5cf6', 
            borderRadius: 6 
        }] 
    }, { 
        indexAxis: 'y', 
        maintainAspectRatio: false, 
        scales: { 
            x: { beginAtZero: true, ticks: { stepSize: 1 }, border: { dash: [4, 4] } }, 
            y: { grid: { display: false } } 
        }, 
        plugins: { legend: { display: false } } 
    });
}

// ==========================================
// 🌟 엑셀 다운로드 (디자인 고급화)
// ==========================================
window.exportDashboardExcel = async function() {
    if (window.userProfile?.role !== 'admin') {
        return window.showToast('보고서 다운로드는 관리자만 가능합니다.', 'error');
    }
    if (typeof ExcelJS === 'undefined') {
        return window.showToast("ExcelJS 모듈이 로드되지 않았습니다. 인터넷 연결을 확인해주세요.", "error");
    }

    try {
        window.showToast("엑셀 보고서를 생성 중입니다...", "success");
        const wb = new ExcelJS.Workbook();
        
        // 🌟 1. 연간 시트 (디자인 개선)
        const ws1 = wb.addWorksheet('연간_현황_요약', { views: [{ showGridLines: false }] });
        ws1.columns = [{ width: 25 }, { width: 20 }];
        
        // 타이틀 병합 및 꾸미기
        ws1.mergeCells('A1:B1');
        const titleCell1 = ws1.getCell('A1');
        titleCell1.value = `📊 [${window.currentDashStats.year}년] 프로젝트 연간 현황 요약`;
        titleCell1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo-600
        titleCell1.alignment = { vertical: 'middle', horizontal: 'center' };
        ws1.getRow(1).height = 30;
        
        ws1.addRow([]); // 빈 줄
        
        const sumData = [
            ['지표', '수치'],
            ['완료(출하) 건수', window.currentDashStats.completed + '건'],
            ['대기/보류 건수', window.currentDashStats.pending + '건'],
            ['진행중/검수중 건수', (window.currentDashStats.progress + window.currentDashStats.inspecting) + '건'],
            ['지연 위험 건수', window.currentDashStats.delayed + '건'],
            ['총 예정 공수', parseFloat(window.currentDashStats.estMd).toFixed(1) + ' MD'],
            ['총 투입 공수', parseFloat(window.currentDashStats.curMd).toFixed(1) + ' MD'],
            ['목표대비 출하 평균 오차', window.currentDashStats.avgShipError + ' 일']
        ];
        
        sumData.forEach((row, i) => {
            let r = ws1.addRow(row);
            if (i === 0) { 
                r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; 
                r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } }; // Slate-500
                r.alignment = { horizontal: 'center' };
            } else {
                r.getCell(1).font = { bold: true, color: { argb: 'FF334155' } }; // Slate-700
                r.getCell(2).alignment = { horizontal: 'right' };
            }
            r.eachCell(c => { 
                c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; 
            });
        });

        // 🌟 2. 기간별 상세 시트 (디자인 개선)
        const typeSelect = document.getElementById('period-type-select');
        const periodTypeStr = (typeSelect && typeSelect.value === 'month') 
            ? document.getElementById('period-value-month')?.value 
            : document.getElementById('period-value-week')?.value;
            
        const ws2 = wb.addWorksheet('조회기간_프로젝트상세', { views: [{ showGridLines: false }] });
        ws2.columns = [
            { width: 12 }, { width: 18 }, { width: 45 }, { width: 15 }, { width: 12 }, 
            { width: 15 }, { width: 12 }, { width: 15 }, { width: 12 }, { width: 12 }
        ];
        
        // 타이틀 병합
        ws2.mergeCells('A1:J1');
        const titleCell2 = ws2.getCell('A1');
        titleCell2.value = `📅 [${periodTypeStr}] 기간 내 프로젝트 리스트`;
        titleCell2.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } }; // Sky-500
        titleCell2.alignment = { vertical: 'middle', horizontal: 'center' };
        ws2.getRow(1).height = 30;

        ws2.addRow([]); // 빈 줄

        const headers = ['파트', 'PJT 코드', '프로젝트명', '예정출하일', '진행률(%)', '현재상태', '예정MD', '기간내 투입MD', '최종MD', '편차'];
        let hr = ws2.addRow(headers);
        hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }; 
        hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } }; // Slate-600
        hr.eachCell(c => { 
            c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; 
            c.alignment = { horizontal: 'center', vertical: 'middle' }; 
        });
        ws2.getRow(3).height = 25;

        const sMap = { 'pending': '대기/보류', 'progress': '진행중', 'inspecting': '검수중', 'completed': '완료', 'rejected': '불가' };
        const sortedProjects = [...window.currentPeriodProjects].sort((a, b) => b.periodMd - a.periodMd);
        
        sortedProjects.forEach((p, index) => {
            let variance = (parseFloat(p.finalMd || 0) - parseFloat(p.estMd || 0)).toFixed(1);
            let row = ws2.addRow([
                p.part || '-', 
                p.code || '-', 
                p.name || '-', 
                p.d_shipEst || '-', 
                p.progress || 0, 
                sMap[p.status] || p.status, 
                parseFloat(p.estMd || 0), 
                parseFloat(p.periodMd.toFixed(1)), 
                parseFloat(p.finalMd || 0), 
                parseFloat(variance)
            ]);
            
            // 데이터 셀 스타일 적용
            row.eachCell((c, colNumber) => { 
                c.border = { top: { style: 'thin', color: {argb: 'FFCBD5E1'} }, left: { style: 'thin', color: {argb: 'FFCBD5E1'} }, bottom: { style: 'thin', color: {argb: 'FFCBD5E1'} }, right: { style: 'thin', color: {argb: 'FFCBD5E1'} } }; 
                c.alignment = { vertical: 'middle' };
                if ([1, 2, 4, 5, 6].includes(colNumber)) c.alignment.horizontal = 'center'; // 문자열, 날짜, 퍼센트 중앙정렬
                if ([7, 8, 9, 10].includes(colNumber)) {
                    c.alignment.horizontal = 'right'; // 숫자는 우측정렬
                    c.numFmt = '#,##0.0'; 
                }
            });
            // 지그재그 배경색
            if (index % 2 === 1) {
                row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
            }
        });

        const buffer = await wb.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `AXMS_월말보고서_${new Date().toISOString().split('T')[0]}.xlsx`);
        
    } catch (e) { 
        console.error(e); 
        window.showToast("엑셀 파일 생성 중 오류가 발생했습니다.", "error"); 
    }
};
