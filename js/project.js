/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let projectStatusSnapshotUnsubscribe = null;
let currentMdLogUnsubscribe = null;
let currentLogUnsubscribe = null;
let currentCommentUnsubscribe = null;
let currentIssueUnsubscribe = null;

let currentPurchaseUnsubscribe = null;
let currentDesignUnsubscribe = null;
let currentPjtScheduleUnsubscribe = null;

const TARGET_DRIVE_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ";

window.currentStatusFilter = 'all';
window.currentCategoryFilter = 'all';
window.currentMonthFilter = '';
window.calendarCurrentDate = new Date();
window.hideCompletedFilter = false; 
window.ganttTodayOffset = 0;
window.ncrData = []; // 💡 부적합 데이터 저장용 배열

const getSafeMillis = (val) => { 
    try { 
        if (!val) return 0; 
        if (typeof val.toMillis === 'function') return val.toMillis(); 
        if (typeof val === 'number') return val; 
        if (typeof val === 'string') return new Date(val).getTime() || 0; 
        return 0; 
    } catch(e) { return 0; } 
};

const getSafeString = (val) => (val === null || val === undefined) ? '' : String(val);

window.loadCounts = function() {
    try {
        onSnapshot(collection(db, "project_comments"), (snap) => { 
            window.projectCommentCounts = {}; 
            snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectCommentCounts[pid] = (window.projectCommentCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        onSnapshot(collection(db, "project_issues"), (snap) => { 
            window.projectIssueCounts = {}; 
            snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid && !d.isResolved) window.projectIssueCounts[pid] = (window.projectIssueCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        onSnapshot(collection(db, "daily_logs"), (snap) => { 
            window.projectLogCounts = {}; 
            snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectLogCounts[pid] = (window.projectLogCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        onSnapshot(collection(db, "project_purchases"), (snap) => { 
            window.projectPurchaseCounts = {}; 
            snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectPurchaseCounts[pid] = (window.projectPurchaseCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        onSnapshot(collection(db, "project_designs"), (snap) => { 
            window.projectDesignCounts = {}; 
            snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectDesignCounts[pid] = (window.projectDesignCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        onSnapshot(collection(db, "project_schedules"), (snap) => { 
            window.projectScheduleCounts = {}; 
            snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectScheduleCounts[pid] = (window.projectScheduleCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        
        // 💡 앱 시작 시 NCR 데이터 로드 실행
        window.loadNcrData();
    } catch(e) { console.warn("카운트 로드 실패:", e); }
};

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; 
    window.resetAllFilters();
    let btnMfg = document.getElementById('btn-part-mfg');
    let btnOpt = document.getElementById('btn-part-opt');
    if (btnMfg) btnMfg.className = part === '제조' ? "px-3 py-1 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    if (btnOpt) btnOpt.className = part === '광학' ? "px-3 py-1 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    window.loadProjectStatusData();
};

window.filterProjectStatus = function(status) {
    window.currentStatusFilter = status;
    if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
    else if(window.currentProjDashView === 'calendar') window.renderProjCalendar(); 
    else window.renderProjectStatusList();
};

window.filterByCategory = function(category) { window.currentCategoryFilter = category; window.filterProjectStatus(window.currentStatusFilter); };
window.filterByYear = function(yearStr) { window.currentYearFilter = yearStr; window.updateMiniDashboard(); window.filterProjectStatus(window.currentStatusFilter); };
window.filterByMonth = function(monthStr) { window.currentMonthFilter = monthStr; window.updateMiniDashboard(); window.filterProjectStatus(window.currentStatusFilter); };
window.filterByStatusOnly = function(status) {
    window.currentCategoryFilter = 'all'; window.currentYearFilter = ''; window.currentMonthFilter = ''; window.hideCompletedFilter = false;
    const cSelect = document.getElementById('filter-category-select'); if(cSelect) cSelect.value = 'all';
    const ySelect = document.getElementById('filter-year-select'); if(ySelect) ySelect.value = '';
    const mSelect = document.getElementById('filter-month-select'); if(mSelect) mSelect.value = '';
    const hCb = document.getElementById('hide-completed-cb'); if(hCb) hCb.checked = false;
    window.filterProjectStatus(status);
};
window.resetAllFilters = function() {
    window.currentStatusFilter = 'all'; window.currentCategoryFilter = 'all'; window.currentYearFilter = ''; window.currentMonthFilter = ''; window.hideCompletedFilter = false;
    if(document.getElementById('filter-category-select')) document.getElementById('filter-category-select').value = 'all';
    if(document.getElementById('filter-year-select')) document.getElementById('filter-year-select').value = '';
    if(document.getElementById('filter-month-select')) document.getElementById('filter-month-select').value = '';
    if(document.getElementById('hide-completed-cb')) document.getElementById('hide-completed-cb').checked = false;
    window.filterProjectStatus('all');
};

window.toggleHideCompleted = function(checked) { window.hideCompletedFilter = checked; window.filterProjectStatus(window.currentStatusFilter); };

window.getFilteredProjects = function() {
    let list = window.currentProjectStatusList || [];
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') list = list.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
    if(window.currentStatusFilter && window.currentStatusFilter !== 'all') { 
        list = list.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; }); 
    }
    if(window.hideCompletedFilter) list = list.filter(item => item.status !== 'completed');
    if(window.currentYearFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentYearFilter) || (item.d_asmEst || '').startsWith(window.currentYearFilter) || (item.d_asmEn || '').startsWith(window.currentYearFilter));
    if(window.currentMonthFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentMonthFilter) || (item.d_asmEst || '').startsWith(window.currentMonthFilter) || (item.d_asmEn || '').startsWith(window.currentMonthFilter));
    const priority = { 'pending': 1, 'progress': 2, 'inspecting': 2, 'rejected': 3, 'completed': 4 };
    list.sort((a,b) => (priority[a.status] || 99) - (priority[b.status] || 99) || getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
    return list;
};

window.searchProjectBoard = function(keyword) { 
    try { 
        const k = getSafeString(keyword).toLowerCase(); 
        document.querySelectorAll('#proj-dash-tbody tr').forEach(tr => { 
            const text = tr.innerText.toLowerCase(); 
            tr.style.display = (text.includes(k) || window.matchString(k, text)) ? '' : 'none'; 
        }); 
    } catch(e) {} 
};

window.updateMiniDashboard = function() {
    try {
        let pending = 0, progress = 0, completedThisMonth = 0; 
        let upcomingCodes7 = [], upcomingCodes14 = [];
        const now = new Date(); 
        const currentMonthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const completedLabel = document.getElementById('mini-dash-completed-label');
        if (completedLabel) completedLabel.innerHTML = '<i class="fa-solid fa-truck-fast text-emerald-400"></i> 출하 완료 (' + (now.getMonth() + 1) + '월)';

        (window.currentProjectStatusList || []).forEach(function(item) {
            const status = getSafeString(item.status); 
            const shipEn = getSafeString(item.d_shipEn); 
            const shipEst = getSafeString(item.d_shipEst); 
            const code = getSafeString(item.code) || '미지정';
            
            if (status === 'pending' || status === 'rejected') pending++;
            else if (status === 'progress' || status === 'inspecting') progress++;
            else if (status === 'completed' && shipEn.startsWith(currentMonthStr)) completedThisMonth++;

            if (status !== 'completed' && status !== 'rejected' && shipEst) {
                const shipDate = new Date(shipEst);
                if(!isNaN(shipDate.getTime())) {
                    const diffDays = Math.ceil((shipDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays <= 7) upcomingCodes7.push({ code: code, dDay: diffDays });
                    else if (diffDays < 0) upcomingCodes7.push({ code: code, dDay: diffDays });
                    else if (diffDays > 7 && diffDays <= 14) upcomingCodes14.push({ code: code, dDay: diffDays });
                }
            }
        });

        if(document.getElementById('mini-dash-pending')) document.getElementById('mini-dash-pending').innerText = pending;
        if(document.getElementById('mini-dash-progress')) document.getElementById('mini-dash-progress').innerText = progress;
        if(document.getElementById('mini-dash-completed')) document.getElementById('mini-dash-completed').innerText = completedThisMonth;

        const elUpcoming7 = document.getElementById('mini-dash-upcoming');
        if(elUpcoming7) { 
            if (upcomingCodes7.length === 0) elUpcoming7.innerHTML = '<span class="text-[10px] text-rose-400 font-bold w-full text-center mt-1">임박한 프로젝트 없음</span>';
            else elUpcoming7.innerHTML = upcomingCodes7.map(u => {
                let dText = u.dDay === 0 ? 'D-Day' : (u.dDay < 0 ? '지연' : 'D-' + u.dDay); 
                let bgClass = u.dDay <= 3 ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'; 
                return `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 ${bgClass}">${u.code} <span class="opacity-80 text-[8px]">[${dText}]</span></span>`;
            }).join('');
        }
        
        const elUpcoming14 = document.getElementById('mini-dash-upcoming-14');
        if(elUpcoming14) { 
            if (upcomingCodes14.length === 0) elUpcoming14.innerHTML = '<span class="text-[10px] text-orange-400 font-bold w-full text-center mt-1">임박한 프로젝트 없음</span>';
            else elUpcoming14.innerHTML = upcomingCodes14.map(u => `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 bg-white text-orange-600 border-orange-200">${u.code} <span class="opacity-80 text-[8px]">[D-${u.dDay}]</span></span>`).join('');
        }
    } catch(e) {}
};

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    projectStatusSnapshotUnsubscribe = onSnapshot(query(collection(db, "projects_status")), function(snapshot) {
        window.currentProjectStatusList = []; 
        let lastUpdated = 0; const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
        snapshot.forEach(docSnap => { 
            const data = docSnap.data(); 
            let dataPart = getSafeString(data.part).trim() || '제조'; 
            if((targetPart === '광학' && dataPart === '광학') || (targetPart !== '광학' && dataPart !== '광학')) {
                data.id = docSnap.id; window.currentProjectStatusList.push(data); 
            }
            if(getSafeMillis(data.updatedAt) > lastUpdated) lastUpdated = getSafeMillis(data.updatedAt);
        });
        if (lastUpdated > 0) { 
            const lDate = new Date(lastUpdated); const el = document.getElementById('pjt-last-update');
            if(el) el.innerText = lDate.getFullYear().toString().slice(2) + '-' + String(lDate.getMonth()+1).padStart(2,'0') + '-' + String(lDate.getDate()).padStart(2,'0') + ' ' + String(lDate.getHours()).padStart(2,'0') + ':' + String(lDate.getMinutes()).padStart(2,'0'); 
        }
        window.updateMiniDashboard();
        
        if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
        else if(window.currentProjDashView === 'calendar') window.renderProjCalendar();
        else window.renderProjectStatusList();
    });
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    let displayList = window.getFilteredProjects();
    
    // 💡 열 개수가 32개로 늘어났으므로 빈 화면일 때 colspan 32 적용
    if(displayList.length === 0) { tbody.innerHTML = '<tr><td colspan="32" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">프로젝트가 없습니다.</td></tr>'; return; }
    
    const statusMap = { 
        'pending': '<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">대기/보류</span>', 
        'progress': '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200">진행중(제작)</span>', 
        'inspecting': '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200">진행중(검수)</span>', 
        'completed': '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200">완료(출하)</span>', 
        'rejected': '<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200">보류/불가</span>' 
    };
    
    let htmlStr = '';
    displayList.forEach(item => {
        const cMd = parseFloat(item.currentMd) || 0; const oMd = parseFloat(item.outMd) || 0; const fMd = parseFloat(item.finalMd) || (cMd + oMd);
        const safeNameHtml = getSafeString(item.name).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeNameJs = getSafeString(item.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        
        const cCnt = (window.projectCommentCounts && window.projectCommentCounts[item.id]) || 0;
        const iCnt = (window.projectIssueCounts && window.projectIssueCounts[item.id]) || 0;
        const lCnt = (window.projectLogCounts && window.projectLogCounts[item.id]) || 0;
        const purCnt = (window.projectPurchaseCounts && window.projectPurchaseCounts[item.id]) || 0;
        const desCnt = (window.projectDesignCounts && window.projectDesignCounts[item.id]) || 0;
        const schCnt = (window.projectScheduleCounts && window.projectScheduleCounts[item.id]) || 0;

        // 💡 띄어쓰기 및 대소문자 무시한 NCR 미결 항목 계산
        const safeItemCode = String(item.code || '').replace(/\s/g, '').toUpperCase();
        const pjtNcrData = (window.ncrData || []).filter(n => String(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeItemCode);
        const unresolvedNcrCnt = pjtNcrData.filter(n => !(n.status.includes('완료') || n.status.includes('종결') || n.status.includes('완료됨'))).length;

        let trHtml = `<tr class="group hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">`;
        
        // 스크롤 고정 영역 (왼쪽)
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 0px; min-width: 40px; max-width: 40px;" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 40px; min-width: 80px; max-width: 80px;">${getSafeString(item.category)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 120px; min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 170px; min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${iCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-bold text-indigo-700 bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 220px; min-width: 110px; max-width: 110px;">${getSafeString(item.code)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 truncate max-w-[220px] bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 330px; min-width: 220px;">${safeNameHtml}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center truncate max-w-[110px] bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 550px; min-width: 110px;">${getSafeString(item.company)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-black text-emerald-600 bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 660px; min-width: 60px; max-width: 60px;">${parseFloat(item.progress) || 0}%</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20 shadow-[3px_0_5px_-1px_rgba(0,0,0,0.1)] border-r-slate-300" style="left: 720px; min-width: 80px; max-width: 80px;">${statusMap[item.status] || ''}</td>`;
        
        // 스크롤 영역 (일반 td)
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600">${getSafeString(item.manager)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPurchaseModal('${item.id}', '${safeNameJs}')" class="text-amber-500 relative"><i class="fa-solid fa-cart-shopping text-lg"></i>${purCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${purCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDesignModal('${item.id}', '${safeNameJs}')" class="text-teal-400 relative"><i class="fa-solid fa-pen-ruler text-lg"></i>${desCnt ? `<span class="absolute -top-1 -right-2 bg-teal-100 text-teal-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-teal-200">${desCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPjtScheduleModal('${item.id}', '${safeNameJs}')" class="text-fuchsia-400 relative"><i class="fa-regular fa-calendar-check text-lg"></i>${schCnt ? `<span class="absolute -top-1 -right-2 bg-fuchsia-100 text-fuchsia-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-fuchsia-200">${schCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}', '${safeNameJs}', ${parseFloat(item.progress)||0})" class="text-sky-400 relative"><i class="fa-solid fa-book text-lg"></i>${lCnt ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-sky-200">${lCnt}</span>` : ''}</button></td>`;
        
        // 💡 부적합 렌더링
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">
            <button onclick="window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-rose-500 relative transition-transform hover:scale-110">
                <i class="fa-solid fa-file-circle-exclamation text-lg"></i>
                ${unresolvedNcrCnt > 0 ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${unresolvedNcrCnt}</span>` : ''}
            </button>
        </td>`;

        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd||0}</td>`;
        trHtml += `<td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal('${item.id}', '${safeNameJs}', ${cMd})" class="text-purple-600 underline">${cMd}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-bold">${fMd.toFixed(1)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outPers||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outMd||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">${getSafeString(item.d_shipEst)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${getSafeString(item.d_asmEst)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${getSafeString(item.d_asmEndEst)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${getSafeString(item.d_asmSt)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${getSafeString(item.d_asmEn)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_insSt)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_insEn)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700 font-bold">${getSafeString(item.d_shipEn)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_setSt)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_setEn)}</td>`;
        
        let linksHtml = '';
        if(item.links && Array.isArray(item.links)) { 
            linksHtml = item.links.map(lnk => `<a href="${getSafeString(lnk?.url)}" target="_blank" title="${getSafeString(lnk?.name)}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-link text-[10px]"></i></a>`).join(''); 
        }
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><div class="flex items-center justify-center gap-1 flex-wrap"><button onclick="window.openLinkModal('${item.id}', '${safeNameJs}')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>${linksHtml}</div></td>`;
        
        trHtml += `</tr>`;
        htmlStr += trHtml;
    });
    tbody.innerHTML = htmlStr;
};

async function handleDriveUploadWithProgress(fileInput, projectName) {
    if(!window.googleAccessToken) {
        if(window.initGoogleAPI) window.initGoogleAPI();
        if(window.authenticateGoogle && !window.googleAccessToken) window.authenticateGoogle();
        if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다. [연동하기] 버튼을 눌러주세요.");
    }
    
    const file = fileInput.files[0];
    if (!file) throw new Error("파일이 없습니다.");

    const safeProjectName = projectName ? projectName.replace(/[\/\\]/g, '_') : '미분류 프로젝트';
    const findFolderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(safeProjectName)}' and mimeType='application/vnd.google-apps.folder' and '${TARGET_DRIVE_FOLDER}' in parents and trashed=false`, {
        headers: { 'Authorization': 'Bearer ' + window.googleAccessToken }
    });
    const folderData = await findFolderRes.json();
    
    let targetFolderId = '';
    if (folderData.files && folderData.files.length > 0) {
        targetFolderId = folderData.files[0].id;
    } else {
        const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: safeProjectName, mimeType: 'application/vnd.google-apps.folder', parents: [TARGET_DRIVE_FOLDER] })
        });
        const newFolderData = await createFolderRes.json();
        targetFolderId = newFolderData.id;
    }

    const progressModal = document.getElementById('upload-progress-modal');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const progressSize = document.getElementById('upload-progress-size');
    const progressFilename = document.getElementById('upload-progress-filename');
    
    if(progressModal) progressModal.classList.replace('hidden', 'flex');
    if(progressBar) progressBar.style.width = '0%';
    if(progressText) progressText.innerText = '0%';
    if(progressFilename) progressFilename.innerText = file.name;
    const totalMb = (file.size / (1024 * 1024)).toFixed(2);
    if(progressSize) progressSize.innerText = `0.00 MB / ${totalMb} MB`;

    return new Promise((resolve, reject) => {
        const metadata = { name: file.name, parents: [targetFolderId] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + window.googleAccessToken);

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const loadedMb = (e.loaded / (1024 * 1024)).toFixed(2);
                if(progressBar) progressBar.style.width = percent + '%';
                if(progressText) progressText.innerText = percent + '%';
                if(progressSize) progressSize.innerText = `${loadedMb} MB / ${totalMb} MB`;
            }
        };

        xhr.onload = function() {
            if(progressModal) progressModal.classList.replace('flex', 'hidden');
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                resolve(`https://drive.google.com/file/d/${data.id}/view`);
            } else {
                reject(new Error("파일 업로드 실패: " + xhr.responseText));
            }
        };

        xhr.onerror = function() {
            if(progressModal) progressModal.classList.replace('flex', 'hidden');
            reject(new Error("네트워크 오류 발생"));
        };

        xhr.send(form);
    });
}

window.openPurchaseModal = function(projectId, title) { 
    document.getElementById('pur-req-id').value = projectId; document.getElementById('pur-project-title').innerText = title; 
    window.resetPurchaseForm(); document.getElementById('purchase-modal').classList.replace('hidden', 'flex'); 
    if(window.initGoogleAPI) window.initGoogleAPI();
    
    if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); 
    currentPurchaseUnsubscribe = onSnapshot(query(collection(db, "project_purchases"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        const listEl = document.getElementById('purchase-list');
        if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 구매 내역이 없습니다.</div>'; return; }
        
        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? (window.getDateTimeStr ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : new Date(getSafeMillis(item.createdAt)).toLocaleString()) : '';
            let safeContent = String(item.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between items-start"><div class="flex items-center gap-2"><span class="font-bold text-amber-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div><div class="flex gap-2"><button onclick="window.deletePurchase('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div></div><div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-sky-500 font-bold underline mt-1 w-fit"><i class="fa-solid fa-paperclip"></i> 첨부 일정표 확인하기</a>` : ''}</div>`;
        }).join('');
    });
};
window.closePurchaseModal = function() { document.getElementById('purchase-modal').classList.replace('flex', 'hidden'); if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); };
window.resetPurchaseForm = function() { document.getElementById('editing-pur-id').value = ''; document.getElementById('new-pur-text').value = ''; document.getElementById('new-pur-file').value = ''; document.getElementById('pur-file-name').innerText = ''; };
window.savePurchaseItem = async function() { 
    const pId = document.getElementById('pur-req-id').value, title = document.getElementById('pur-project-title').innerText, content = document.getElementById('new-pur-text').value.trim(), fileInput = document.getElementById('new-pur-file'), btn = document.getElementById('btn-pur-save');
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let fileUrl = null; if(fileInput.files.length > 0) fileUrl = await handleDriveUploadWithProgress(fileInput, title);
        await addDoc(collection(db, "project_purchases"), { projectId: pId, content: content, fileUrl: fileUrl, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("구매 내역이 등록되었습니다."); window.resetPurchaseForm(); 
    } catch(e) { window.showToast(e.message, "error"); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deletePurchase = async function(id) { if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_purchases", id)); };

window.openDesignModal = function(projectId, title) { 
    document.getElementById('des-req-id').value = projectId; document.getElementById('des-project-title').innerText = title; 
    window.resetDesignForm(); document.getElementById('design-modal').classList.replace('hidden', 'flex'); 
    if(window.initGoogleAPI) window.initGoogleAPI();

    if (currentDesignUnsubscribe) currentDesignUnsubscribe(); 
    currentDesignUnsubscribe = onSnapshot(query(collection(db, "project_designs"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        const listEl = document.getElementById('design-list');
        if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 설계 파일이 없습니다.</div>'; return; }
        
        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? (window.getDateTimeStr ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : new Date(getSafeMillis(item.createdAt)).toLocaleString()) : '';
            let safeContent = String(item.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between items-start"><div class="flex items-center gap-2"><span class="font-bold text-teal-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div><div class="flex gap-2"><button onclick="window.deleteDesign('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div></div><div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-sky-500 font-bold underline mt-1 w-fit"><i class="fa-solid fa-file-arrow-down"></i> 설계 파일 확인하기</a>` : ''}</div>`;
        }).join('');
    });
};
window.closeDesignModal = function() { document.getElementById('design-modal').classList.replace('flex', 'hidden'); if (currentDesignUnsubscribe) currentDesignUnsubscribe(); };
window.resetDesignForm = function() { document.getElementById('editing-des-id').value = ''; document.getElementById('new-des-text').value = ''; document.getElementById('new-des-file').value = ''; document.getElementById('des-file-name').innerText = ''; };
window.saveDesignItem = async function() { 
    const pId = document.getElementById('des-req-id').value, title = document.getElementById('des-project-title').innerText, content = document.getElementById('new-des-text').value.trim(), fileInput = document.getElementById('new-des-file'), btn = document.getElementById('btn-des-save');
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let fileUrl = null; if(fileInput.files.length > 0) fileUrl = await handleDriveUploadWithProgress(fileInput, title);
        await addDoc(collection(db, "project_designs"), { projectId: pId, content: content, fileUrl: fileUrl, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("설계 내역이 등록되었습니다."); window.resetDesignForm(); 
    } catch(e) { window.showToast(e.message, "error"); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deleteDesign = async function(id) { if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_designs", id)); };

window.openPjtScheduleModal = function(projectId, title) { 
    document.getElementById('sch-req-id').value = projectId; document.getElementById('sch-project-title').innerText = title; 
    window.resetPjtScheduleForm(); document.getElementById('pjt-schedule-modal').classList.replace('hidden', 'flex'); 
    if(window.initGoogleAPI) window.initGoogleAPI();

    if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); 
    currentPjtScheduleUnsubscribe = onSnapshot(query(collection(db, "project_schedules"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        const listEl = document.getElementById('pjt-schedule-list');
        if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 PJT 일정이 없습니다.</div>'; return; }
        
        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? (window.getDateTimeStr ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : new Date(getSafeMillis(item.createdAt)).toLocaleString()) : '';
            let safeContent = String(item.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between items-start"><div class="flex items-center gap-2"><span class="font-bold text-fuchsia-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div><div class="flex gap-2"><button onclick="window.deletePjtSchedule('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div></div><div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-sky-500 font-bold underline mt-1 w-fit"><i class="fa-solid fa-calendar-days"></i> PJT 일정표 확인하기</a>` : ''}</div>`;
        }).join('');
    });
};
window.closePjtScheduleModal = function() { document.getElementById('pjt-schedule-modal').classList.replace('flex', 'hidden'); if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); };
window.resetPjtScheduleForm = function() { document.getElementById('editing-sch-id').value = ''; document.getElementById('new-sch-text').value = ''; document.getElementById('new-sch-file').value = ''; document.getElementById('sch-file-name').innerText = ''; };
window.savePjtScheduleItem = async function() { 
    const pId = document.getElementById('sch-req-id').value, title = document.getElementById('sch-project-title').innerText, content = document.getElementById('new-sch-text').value.trim(), fileInput = document.getElementById('new-sch-file'), btn = document.getElementById('btn-sch-save');
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let fileUrl = null; if(fileInput.files.length > 0) fileUrl = await handleDriveUploadWithProgress(fileInput, title);
        await addDoc(collection(db, "project_schedules"), { projectId: pId, content: content, fileUrl: fileUrl, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("PJT 일정 내역이 등록되었습니다."); window.resetPjtScheduleForm(); 
    } catch(e) { window.showToast(e.message, "error"); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deletePjtSchedule = async function(id) { if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_schedules", id)); };

window.openProjStatusWriteModal = function() {
    document.getElementById('ps-id').value = ''; 
    document.getElementById('ps-code').value = ''; 
    document.getElementById('ps-name').value = ''; 
    document.getElementById('ps-company').value = ''; 
    document.getElementById('ps-part').value = window.currentProjPartTab || '제조'; 
    document.getElementById('ps-category').value = ''; 
    document.getElementById('ps-status').value = 'pending'; 
    document.getElementById('ps-progress-pct').value = '0';
    
    const mHtml = '<option value="">선택</option>' + window.teamMembers.map(t => '<option value="' + t.name + '">' + t.name + ' (' + t.part + ')</option>').join('');
    const managerSelect = document.getElementById('ps-manager'); 
    if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); 
    if(memberSelect) memberSelect.innerHTML = mHtml;

    const dateFields = ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en', 'ps-d-asm-end-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-set-st', 'ps-d-set-en'];
    dateFields.forEach(function(id) { 
        const el = document.getElementById(id); 
        if(el) el.value = ''; 
    });
    
    const btnHistory = document.getElementById('btn-view-history');
    if (btnHistory) btnHistory.classList.add('hidden'); 
    
    const modal = document.getElementById('proj-status-write-modal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};

window.closeProjStatusWriteModal = function() { 
    const modal = document.getElementById('proj-status-write-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.editProjStatus = function(id) {
    const item = window.currentProjectStatusList.find(function(p) { return p.id === id; }); 
    if(!item) return;
    
    const mHtml = '<option value="">선택</option>' + window.teamMembers.map(t => '<option value="' + t.name + '">' + t.name + ' (' + t.part + ')</option>').join('');
    const managerSelect = document.getElementById('ps-manager'); 
    if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); 
    if(memberSelect) memberSelect.innerHTML = mHtml;

    document.getElementById('ps-id').value = item.id; 
    document.getElementById('ps-code').value = item.code || ''; 
    document.getElementById('ps-name').value = item.name || ''; 
    document.getElementById('ps-company').value = item.company || ''; 
    document.getElementById('ps-part').value = item.part || '제조'; 
    document.getElementById('ps-category').value = item.category || ''; 
    document.getElementById('ps-status').value = item.status || 'pending'; 
    document.getElementById('ps-progress-pct').value = item.progress !== undefined ? item.progress : 0; 
    document.getElementById('ps-manager').value = item.manager || '';
    
    window.currentSelectedMembers = item.members ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; 
    window.renderSelectedMembers();
    
    document.getElementById('ps-est-md').value = item.estMd !== undefined ? item.estMd : ''; 
    document.getElementById('ps-current-md').value = item.currentMd !== undefined ? item.currentMd : '';
    
    const cMd = parseFloat(item.currentMd) || 0; 
    const oMd = parseFloat(item.outMd) || 0; 
    document.getElementById('ps-final-md').value = (cMd + oMd).toFixed(1);
    
    document.getElementById('ps-tot-pers').value = item.totPers !== undefined ? item.totPers : ''; 
    document.getElementById('ps-out-pers').value = item.outPers !== undefined ? item.outPers : ''; 
    document.getElementById('ps-out-md').value = item.outMd !== undefined ? item.outMd : '';
    
    const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
    for (const [key, elementId] of Object.entries(dateMappings)) { 
        const el = document.getElementById(elementId); 
        if (el) el.value = item[key] || ''; 
    }
    
    const btnHistory = document.getElementById('btn-view-history');
    if (btnHistory) btnHistory.classList.remove('hidden'); 
    
    const modal = document.getElementById('proj-status-write-modal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};

window.saveProjStatus = async function(btn) {
    try {
        if(btn) { btn.disabled = true; btn.innerHTML = '저장중...'; }
        const id = document.getElementById('ps-id')?.value; 
        const code = document.getElementById('ps-code')?.value; 
        const name = document.getElementById('ps-name')?.value;
        
        if(!code || !name) { 
            if(btn){btn.disabled=false;btn.innerHTML='저장하기';} 
            return window.showToast("코드와 이름을 입력하세요.", "error"); 
        }

        const currentMd = parseFloat(document.getElementById('ps-current-md')?.value) || 0; 
        const outMd = parseFloat(document.getElementById('ps-out-md')?.value) || 0;
        
        const data = { 
            code: code, 
            name: name, 
            company: document.getElementById('ps-company')?.value || '', 
            part: document.getElementById('ps-part')?.value || '제조', 
            category: document.getElementById('ps-category')?.value || '', 
            status: document.getElementById('ps-status')?.value || 'pending', 
            progress: parseInt(document.getElementById('ps-progress-pct')?.value) || 0, 
            manager: document.getElementById('ps-manager')?.value || '', 
            members: document.getElementById('ps-members')?.value || '', 
            estMd: parseFloat(document.getElementById('ps-est-md')?.value) || 0, 
            outMd: outMd, 
            finalMd: currentMd + outMd, 
            totPers: parseInt(document.getElementById('ps-tot-pers')?.value)||0, 
            outPers: parseInt(document.getElementById('ps-out-pers')?.value)||0, 
            updatedAt: Date.now() 
        };
        
        const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
        for (const [key, elementId] of Object.entries(dateMappings)) { 
            const el = document.getElementById(elementId); 
            if (el) data[key] = el.value || ''; 
        }

        if(id) { 
            const oldSnap = await getDoc(doc(db, "projects_status", id));
            if(oldSnap.exists()) {
                await addDoc(collection(db, "project_history"), { projectId: id, snapshot: oldSnap.data(), changedBy: window.userProfile.name, changedAt: Date.now() });
            }
            await setDoc(doc(db, "projects_status", id), data, { merge: true }); 
            window.showToast("수정되었습니다."); 
        } else { 
            data.createdAt = Date.now(); 
            data.currentMd = 0; 
            await addDoc(collection(db, "projects_status"), data); 
            window.showToast("등록되었습니다."); 
        } 
        window.closeProjStatusWriteModal(); 
        if(btn){btn.disabled=false;btn.innerHTML='저장하기';}
    } catch(error) {
        window.showToast("오류 발생: " + error.message, "error");
        if(btn){btn.disabled=false;btn.innerHTML='저장하기';}
    }
};

window.deleteProjStatus = async function(id) { 
    if(!confirm("삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "projects_status", id)); 
        window.showToast("삭제되었습니다."); 
    } catch(e) { 
        window.showToast("삭제 실패", "error"); 
    } 
};

window.calcFinalMd = function() { 
    const curMd = parseFloat(document.getElementById('ps-current-md').value) || 0; 
    const outMd = parseFloat(document.getElementById('ps-out-md').value) || 0; 
    document.getElementById('ps-final-md').value = (curMd + outMd).toFixed(1); 
};

window.addProjectMember = function(name) { 
    if(!name) return; 
    if(!window.currentSelectedMembers.includes(name)) { 
        window.currentSelectedMembers.push(name); 
        window.renderSelectedMembers(); 
    } 
    document.getElementById('ps-member-add').value = ''; 
};

window.removeProjectMember = function(name) { 
    window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); 
    window.renderSelectedMembers(); 
};

window.renderSelectedMembers = function() { 
    const container = document.getElementById('ps-selected-members'); 
    document.getElementById('ps-members').value = window.currentSelectedMembers.join(', '); 
    container.innerHTML = window.currentSelectedMembers.map(function(name) {
        return '<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">' + name + ' <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember(\'' + name + '\')"></i></span>';
    }).join(''); 
};

window.openProjHistoryModal = function() {
    const projectId = document.getElementById('ps-id').value;
    if(!projectId) return;
    document.getElementById('proj-history-modal').classList.remove('hidden');
    document.getElementById('proj-history-modal').classList.add('flex');
    window.loadProjectHistory(projectId);
};

window.closeProjHistoryModal = function() {
    document.getElementById('proj-history-modal').classList.add('hidden');
    document.getElementById('proj-history-modal').classList.remove('flex');
};

window.loadProjectHistory = async function(projectId) {
    const listEl = document.getElementById('proj-history-list');
    listEl.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin"></i> 이력을 불러오는 중...</div>';
    try {
        const q = query(collection(db, "project_history"), where("projectId", "==", projectId));
        const snap = await getDocs(q);
        let hList = []; 
        snap.forEach(function(doc) {
            let data = doc.data();
            data.id = doc.id;
            hList.push(data);
        }); 
        hList.sort(function(a,b) { return b.changedAt - a.changedAt; });
        if(hList.length === 0) { 
            listEl.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">저장된 변경 이력이 없습니다.</div>'; 
            return; 
        }
        let historyHtml = '';
        hList.forEach(function(h) {
            const dateStr = window.getDateTimeStr(new Date(h.changedAt));
            historyHtml += '<li class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">';
            historyHtml += '<div><div class="font-black text-sm text-slate-700">' + dateStr + '</div><div class="text-[11px] text-slate-500 mt-1">변경자: <span class="font-bold text-indigo-600">' + h.changedBy + '</span></div></div>';
            historyHtml += '<button onclick="window.restoreProjectHistory(\'' + h.id + '\', \'' + projectId + '\')" class="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm"><i class="fa-solid fa-rotate-left"></i> 이 시점으로 복원</button>';
            historyHtml += '</li>';
        });
        listEl.innerHTML = historyHtml;
    } catch(e) { 
        listEl.innerHTML = '<div class="text-center p-6 text-rose-500 font-bold">이력을 불러오는데 실패했습니다.</div>'; 
    }
};

window.restoreProjectHistory = async function(histId, projectId) {
    if(!confirm("이 시점의 데이터로 프로젝트를 복원하시겠습니까?\n(현재 상태는 덮어씌워집니다)")) return;
    try {
        const hSnap = await getDoc(doc(db, "project_history", histId));
        if(hSnap.exists()) {
            const oldData = hSnap.data().snapshot; 
            oldData.updatedAt = Date.now();
            await setDoc(doc(db, "projects_status", projectId), oldData);
            window.showToast("복원되었습니다."); 
            window.closeProjHistoryModal(); 
            window.editProjStatus(projectId);
        }
    } catch(e) { 
        window.showToast("복원 실패", "error"); 
    }
};

window.toggleProjDashView = function(view) {
    window.currentProjDashView = view;
    document.getElementById('proj-dash-list-container').classList.add('hidden'); 
    document.getElementById('proj-dash-gantt-container').classList.add('hidden'); 
    document.getElementById('proj-dash-calendar-container').classList.add('hidden');
    
    ['list', 'gantt', 'calendar'].forEach(function(b) {
        const btn = document.getElementById('btn-pd-' + b); 
        if(btn) btn.className = "px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 rounded-md transition-colors whitespace-nowrap";
    });
    
    const activeBtn = document.getElementById('btn-pd-' + view); 
    if(activeBtn) activeBtn.className = "px-2 py-1 text-[11px] font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-colors whitespace-nowrap";
    
    if(view === 'list') {
        document.getElementById('proj-dash-list-container').classList.remove('hidden');
    } else if(view === 'gantt') { 
        document.getElementById('proj-dash-gantt-container').classList.remove('hidden'); 
        window.renderProjGantt(); 
    } else if(view === 'calendar') { 
        document.getElementById('proj-dash-calendar-container').classList.remove('hidden'); 
        window.renderProjCalendar(); 
    }
};

window.scrollToGanttToday = function() {
    const scrollContainer = document.getElementById('proj-dash-gantt-content');
    if(scrollContainer && window.ganttTodayOffset >= 0) {
        scrollContainer.scrollTo({
            left: window.ganttTodayOffset + 300 - (scrollContainer.clientWidth / 2),
            behavior: 'smooth'
        });
    }
};

window.renderProjGantt = function() {
    const container = document.getElementById('proj-dash-gantt-content');
    try {
        let displayList = window.getFilteredProjects();
        if(displayList.length === 0) { 
            container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold bg-white w-full h-full flex items-center justify-center rounded-xl">표시할 일정 데이터가 없습니다.</div>'; 
            return; 
        }

        let minDate = new Date(); 
        let maxDate = new Date(); 
        let hasDates = false;
        
        displayList.forEach(function(p) {
            const dates = [p.d_asmSt, p.d_asmEn, p.d_insSt, p.d_insEn, p.d_shipEn, p.d_setSt, p.d_setEn, p.d_asmEst, p.d_shipEst, p.d_asmEndEst].filter(d => d).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
            dates.forEach(function(d) { 
                if(!hasDates) { minDate = new Date(d); maxDate = new Date(d); hasDates = true; } 
                if(d < minDate) minDate = new Date(d); 
                if(d > maxDate) maxDate = new Date(d); 
            });
        });
        
        const today = new Date(); today.setHours(0,0,0,0);
        if(today < minDate) minDate = new Date(today);
        if(today > maxDate) maxDate = new Date(today);

        if(!hasDates) { 
            container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold bg-white w-full h-full flex items-center justify-center rounded-xl">표시할 일정 데이터가 없습니다.</div>'; 
            return; 
        }
        
        minDate.setDate(minDate.getDate() - 5); 
        maxDate.setDate(maxDate.getDate() + 10);
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)); 
        const dayWidth = 24; 
        
        const todayStr = window.getLocalDateStr(new Date()); 
        let todayOffset = -1;

        let html = '<div class="relative min-w-max h-full min-h-[500px]" style="width: ' + (totalDays * dayWidth + 300) + 'px">';
        
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); 
            d.setDate(d.getDate() + i);
            let dStr = window.getLocalDateStr(d);
            if(dStr === todayStr) todayOffset = i * dayWidth; 
        }
        
        window.ganttTodayOffset = todayOffset;

        if(todayOffset >= 0) {
            html += '<div class="absolute top-0 w-[2px] bg-rose-500 z-[100] pointer-events-none shadow-sm" style="left: ' + (300 + todayOffset + (dayWidth/2)) + 'px; height:100%; bottom:0;"><div class="absolute top-10 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-md font-bold whitespace-nowrap border border-white">오늘</div></div>';
        }

        html += '<div class="flex border-b border-slate-200 sticky top-0 bg-white z-50 shadow-sm"><div class="w-[300px] flex-shrink-0 p-3 font-bold text-xs text-slate-700 bg-slate-50 border-r border-slate-200 flex items-center sticky left-0 z-50"><div class="w-[100px] text-indigo-600">PJT 코드</div><div class="w-[200px]">프로젝트명</div></div>';
        
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); d.setDate(d.getDate() + i);
            let dStr = window.getLocalDateStr(d);
            let bgClass = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50' : 'bg-white'; 
            let textClass = d.getDay() === 0 ? 'text-rose-500' : (d.getDay() === 6 ? 'text-blue-500' : 'text-slate-500');
            if (dStr === todayStr) { bgClass = 'bg-rose-50'; textClass = 'text-rose-600 font-black'; }
            
            let dateText = (d.getDate() === 1 || i === 0) ? '<div class="text-[8px] font-black bg-slate-200 text-slate-600">' + (d.getMonth()+1) + '월</div>' : '<div class="text-[8px] font-bold bg-slate-100 text-transparent select-none">-</div>';
            html += '<div class="w-[' + dayWidth + 'px] flex-shrink-0 text-center border-r border-slate-100 ' + bgClass + ' flex flex-col justify-center relative">' + dateText + '<div class="text-[10px] font-bold ' + textClass + ' py-1">' + d.getDate() + '</div></div>';
        }
        
        html += '</div><div class="relative w-full h-full min-h-full" style="min-height: 400px;">';

        displayList.forEach(function(p) {
            const safeNameHtml = String(p.name||'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
            const safeCodeStr = p.code || '-';
            
            html += '<div class="flex border-b border-slate-100 relative group cursor-pointer hover:bg-slate-50 transition-colors" onclick="window.editProjStatus(\'' + p.id + '\')">';
            
            html += '<div class="w-[300px] flex-shrink-0 p-2 text-[11px] font-bold text-slate-700 border-r border-slate-200 bg-white group-hover:bg-slate-50 z-40 sticky left-0 flex items-center transition-colors" title="' + safeNameHtml + '"><div class="w-[100px] text-indigo-600 truncate font-black pr-1">' + safeCodeStr + '</div><div class="w-[200px] truncate">' + safeNameHtml + '</div></div>';
            
            html += '<div class="flex relative" style="width: ' + (totalDays * dayWidth) + 'px">';
            
            for(let i=0; i<totalDays; i++) { 
                let d = new Date(minDate); d.setDate(d.getDate() + i); 
                let bgStr = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50/50' : '';
                html += '<div class="w-[' + dayWidth + 'px] flex-shrink-0 border-r border-slate-50 ' + bgStr + ' h-12"></div>'; 
            }
            
            const drawBar = function(start, end, colorClass, label, yOffset) {
                if(!start) return ''; 
                let sD = new Date(start); 
                let eD = end ? new Date(end) : new Date(start);
                if(isNaN(sD.getTime()) || isNaN(eD.getTime())) return '';
                if(sD < minDate) sD = new Date(minDate); 
                if(eD > maxDate) eD = new Date(maxDate); 
                if(sD > eD) eD = new Date(sD);
                
                let leftOffset = Math.floor((sD - minDate) / (1000 * 60 * 60 * 24)) * dayWidth; 
                let width = Math.ceil((eD - sD) / (1000 * 60 * 60 * 24) + 1) * dayWidth;
                return '<div class="absolute ' + yOffset + ' h-[14px] rounded-sm ' + colorClass + ' text-[8px] flex items-center justify-center font-bold shadow-sm overflow-hidden whitespace-nowrap opacity-90 hover:opacity-100 hover:scale-y-110 transition-all cursor-pointer z-10" style="left: ' + leftOffset + 'px; width: ' + width + 'px;" title="' + label + ': ' + start + ' ~ ' + (end||start) + '"></div>';
            };
            
            const drawPoint = function(dateStr, colorClass, label, yOffset) {
                if(!dateStr) return ''; 
                let d = new Date(dateStr); 
                if(isNaN(d.getTime())) return '';
                let leftOffset = Math.floor((d - minDate) / (1000 * 60 * 60 * 24)) * dayWidth;
                return '<div class="absolute ' + yOffset + ' w-3 h-3 rounded-sm transform rotate-45 shadow-sm border-2 z-20 ' + colorClass + '" style="left: ' + (leftOffset + dayWidth/2 - 6) + 'px;" title="' + label + ': ' + dateStr + '"></div>';
            }
            
            html += drawBar(p.d_asmEst, p.d_asmEndEst, 'bg-white border-2 border-indigo-400 border-dashed text-indigo-700', '조립(예정)', 'top-1');
            html += drawBar(p.d_asmSt, p.d_asmEn, 'bg-indigo-600 text-white', '조립(실제)', 'top-1/2 -translate-y-1/2'); 
            html += drawBar(p.d_insSt, p.d_insEn, 'bg-teal-500 text-white', '검수', 'top-1/2 -translate-y-1/2'); 
            html += drawBar(p.d_setSt, p.d_setEn, 'bg-slate-600 text-white', 'Setup', 'top-1/2 -translate-y-1/2');
            html += drawPoint(p.d_shipEst, 'bg-white border-rose-400', '출하(예정)', 'top-1');
            html += drawPoint(p.d_shipEn, 'bg-rose-500 border-white', '출하(실제)', 'top-1/2 -translate-y-1/2');
            html += '</div></div>';
        });
        
        html += '</div></div>'; 
        container.innerHTML = html;
        
        setTimeout(function() { 
            const scrollContainer = document.getElementById('proj-dash-gantt-content'); 
            if(scrollContainer && todayOffset >= 0) {
                scrollContainer.scrollLeft = todayOffset + 300 - (scrollContainer.clientWidth / 2);
            }
        }, 100);
    } catch(e) { 
        console.error("간트차트 오류:", e); 
    }
};

window.changeCalendarMonth = function(offset) { 
    window.calendarCurrentDate.setMonth(window.calendarCurrentDate.getMonth() + offset); 
    window.renderProjCalendar(); 
};

window.renderProjCalendar = function() {
    const container = document.getElementById('proj-dash-calendar-content');
    try {
        let displayList = window.getFilteredProjects();
        const year = window.calendarCurrentDate.getFullYear(); 
        const month = window.calendarCurrentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay(); 
        const lastDate = new Date(year, month + 1, 0).getDate();
        const today = new Date(); 
        const isCurrentMonth = (today.getFullYear() === year && today.getMonth() === month);
        
        let html = '<div class="flex justify-between items-center mb-4"><div class="flex items-center gap-4"><button onclick="window.changeCalendarMonth(-1)" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><i class="fa-solid fa-chevron-left"></i></button><h3 class="text-lg font-black text-indigo-800 w-32 text-center">' + year + '년 ' + (month + 1) + '월</h3><button onclick="window.changeCalendarMonth(1)" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><i class="fa-solid fa-chevron-right"></i></button><button onclick="window.calendarCurrentDate = new Date(); window.renderProjCalendar();" class="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold hover:bg-indigo-100 transition-colors border border-indigo-200">이번 달</button></div><div class="flex gap-2 text-[10px] font-bold"><span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200">조립진행</span><span class="bg-rose-100 text-rose-700 px-2 py-1 rounded border border-rose-200">출하예정</span></div></div><div class="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 mb-2"><div class="text-rose-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="text-blue-500">토</div></div><div class="grid grid-cols-7 gap-1 auto-rows-fr">';
        
        for(let i=0; i<firstDay; i++) { 
            html += '<div class="min-h-[100px] bg-slate-50 rounded-lg border border-slate-100"></div>'; 
        }
        
        for(let date=1; date<=lastDate; date++) {
            const currentDateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(date).padStart(2,'0'); 
            let dayEvents = '';
            
            displayList.forEach(function(p) {
                const safeNameHtml = getSafeString(p.name).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
                const safeCodeStr = getSafeString(p.code) || '-';
                let isAsm = false; 
                
                if(p.d_asmSt && p.d_asmEn) { 
                    if(currentDateStr >= p.d_asmSt && currentDateStr <= p.d_asmEn) isAsm = true; 
                } else if(p.d_asmEst && p.d_asmEndEst) { 
                    if(currentDateStr >= p.d_asmEst && currentDateStr <= p.d_asmEndEst) isAsm = true; 
                }
                
                if(isAsm) {
                    dayEvents += '<div class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm hover:scale-[1.02] transition-transform" onclick="window.editProjStatus(\'' + p.id + '\')" title="' + safeNameHtml + '">' + safeCodeStr + ' 조립</div>';
                }
                
                if(p.d_shipEn === currentDateStr || (!p.d_shipEn && p.d_shipEst === currentDateStr)) { 
                    dayEvents += '<div class="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm hover:scale-[1.02] transition-transform" onclick="window.editProjStatus(\'' + p.id + '\')" title="' + safeNameHtml + '">' + safeCodeStr + ' 출하</div>'; 
                }
            });
            
            const isToday = (isCurrentMonth && date === today.getDate());
            const badge = isToday ? '<span class="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto shadow-md">' + date + '</span>' : date;
            const borderClass = isToday ? 'border-indigo-400 bg-indigo-50/10' : 'border-slate-200';
            
            html += '<div class="min-h-[100px] bg-white rounded-lg border ' + borderClass + ' p-1 hover:bg-slate-50 transition-colors"><div class="text-xs font-bold text-slate-700 mb-1 text-center">' + badge + '</div><div class="flex flex-col gap-0.5 overflow-hidden">' + dayEvents + '</div></div>';
        }
        
        html += '</div>'; 
        container.innerHTML = html;
    } catch(e) {}
};

window.openDailyLogModal = function(projectId) { 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj) return; 
    document.getElementById('log-req-id').value = projectId; 
    document.getElementById('log-project-title').innerText = proj.name || ''; 
    document.getElementById('log-project-progress').value = proj.progress || 0; 
    document.getElementById('log-project-purchase-rate').value = proj.purchaseRate || 0; 
    window.resetDailyLogForm(); 
    document.getElementById('daily-log-modal').classList.remove('hidden'); 
    document.getElementById('daily-log-modal').classList.add('flex'); 
    window.loadDailyLogs(projectId); 
};

window.loadDailyLogs = function(projectId) { 
    if (currentLogUnsubscribe) currentLogUnsubscribe(); 
    currentLogUnsubscribe = onSnapshot(collection(db, "daily_logs"), function(snapshot) { 
        try {
            window.currentDailyLogs = []; 
            snapshot.forEach(function(doc) { 
                const d = doc.data(); 
                if(d.projectId === projectId || d.reqId === projectId) {
                    d.id = doc.id;
                    window.currentDailyLogs.push(d); 
                }
            }); 
            window.currentDailyLogs.sort(function(a, b) { 
                const dateA = a.date || ''; 
                const dateB = b.date || ''; 
                if (dateA !== dateB) return dateB.localeCompare(dateA); 
                return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); 
            }); 
            window.renderDailyLogs(window.currentDailyLogs); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderDailyLogs = function(logs) { 
    const list = document.getElementById('daily-log-list'); 
    if(!list) return;
    if (logs.length === 0) { 
        list.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; 
        return; 
    } 
    try {
        let listHtml = '';
        logs.forEach(function(log) { 
            let safeContent = String(log.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            const imgHtml = log.imageUrl ? '<div class="mt-3 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[300px]"><img src="' + log.imageUrl + '" class="w-full h-auto cursor-pointer" onclick="window.open(\'' + log.imageUrl + '\')"></div>' : ''; 
            
            let btnHtml = '';
            if (log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') {
                btnHtml = '<button onclick="window.editDailyLog(\'' + log.id + '\')" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog(\'' + log.id + '\')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>';
            }
            
            listHtml += '<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow"><div class="flex justify-between items-center"><div class="flex items-center gap-3"><span class="font-bold text-sky-600 text-xs flex items-center gap-1"><i class="fa-regular fa-calendar text-sky-400"></i> ' + log.date + '</span><span class="font-black text-slate-700 text-sm">' + log.authorName + '</span></div><div class="flex gap-2">' + btnHtml + '</div></div><div class="text-slate-700 font-medium text-[13px] pl-1 mt-2 break-words leading-relaxed">' + safeContent + '</div>' + imgHtml + '</div>'; 
        });
        list.innerHTML = listHtml;
    } catch(e) { 
        list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; 
    }
};

window.saveDailyLogItem = async function() { 
    const projectId = document.getElementById('log-req-id').value; 
    const logId = document.getElementById('editing-log-id').value; 
    const date = document.getElementById('new-log-date').value; 
    const content = document.getElementById('new-log-text').value.trim(); 
    const fileInput = document.getElementById('new-log-image'); 
    const progressVal = parseInt(document.getElementById('log-project-progress').value) || 0; 
    const purchaseRateVal = parseInt(document.getElementById('log-project-purchase-rate').value) || 0; 
    
    if(!date || (!content && fileInput.files.length === 0)) return window.showToast("날짜와 내용을 입력하거나 사진을 첨부하세요.", "error"); 
    
    document.getElementById('btn-log-save').innerHTML = '저장중..'; 
    document.getElementById('btn-log-save').disabled = true; 
    
    const saveData = async function(base64Img) { 
        try { 
            const payload = { date: date, content: content, updatedAt: Date.now() }; 
            if(base64Img) payload.imageUrl = base64Img; 
            
            if (logId) { 
                await setDoc(doc(db, "daily_logs", logId), payload, { merge: true }); 
                window.showToast("일지가 수정되었습니다."); 
            } else { 
                payload.projectId = projectId; 
                payload.authorUid = window.currentUser.uid; 
                payload.authorName = window.userProfile.name; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "daily_logs"), payload); 
                window.showToast("일지가 등록되었습니다."); 
            } 
            
            await setDoc(doc(db, "projects_status", projectId), { progress: progressVal, purchaseRate: purchaseRateVal }, { merge: true }); 
            if(window.processMentions) await window.processMentions(content, projectId, "생산일지"); 
            window.resetDailyLogForm(); 
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
        } finally { 
            document.getElementById('btn-log-save').innerHTML = '등록'; 
            document.getElementById('btn-log-save').disabled = false; 
        } 
    }; 
    
    if(fileInput.files.length > 0) { 
        window.resizeAndConvertToBase64(fileInput.files[0], function(base64) { saveData(base64); }); 
    } else { 
        saveData(null); 
    } 
};

window.editDailyLog = function(id) { 
    const log = window.currentDailyLogs.find(function(l) { return l.id === id; }); 
    if(!log) return; 
    document.getElementById('editing-log-id').value = id; 
    document.getElementById('new-log-date').value = log.date || window.getLocalDateStr(new Date()); 
    document.getElementById('new-log-text').value = log.content || ''; 
    document.getElementById('btn-log-save').innerText = '수정'; 
    document.getElementById('btn-log-cancel').classList.remove('hidden'); 
    document.getElementById('new-log-text').focus(); 
};

window.deleteDailyLog = async function(id) { 
    if(!confirm("이 일지를 삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "daily_logs", id)); 
        window.showToast("삭제되었습니다."); 
        window.resetDailyLogForm(); 
    } catch(e) { 
        window.showToast("삭제 실패", "error"); 
    } 
};

window.closeDailyLogModal = function() { 
    document.getElementById('daily-log-modal').classList.add('hidden'); 
    document.getElementById('daily-log-modal').classList.remove('flex'); 
    if (currentLogUnsubscribe) { currentLogUnsubscribe(); currentLogUnsubscribe = null; } 
};

window.resetDailyLogForm = function() { 
    document.getElementById('editing-log-id').value = ''; 
    document.getElementById('new-log-date').value = window.getLocalDateStr(new Date()); 
    document.getElementById('new-log-text').value = ''; 
    document.getElementById('new-log-image').value = ''; 
    document.getElementById('btn-log-save').innerText = '등록'; 
    document.getElementById('btn-log-cancel').classList.add('hidden'); 
};

window.openCommentModal = function(projectId, title) { 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj) return; 
    document.getElementById('cmt-req-id').value = projectId; 
    window.cancelCommentAction(); 
    document.getElementById('comment-modal').classList.remove('hidden'); 
    document.getElementById('comment-modal').classList.add('flex'); 
    window.loadComments(projectId); 
};

window.loadComments = function(projectId) { 
    if (currentCommentUnsubscribe) currentCommentUnsubscribe(); 
    currentCommentUnsubscribe = onSnapshot(collection(db, "project_comments"), function(snapshot) { 
        try {
            window.currentComments = []; 
            snapshot.forEach(function(docSnap) { 
                const d = docSnap.data(); 
                if(d.projectId === projectId || d.reqId === projectId) {
                    d.id = docSnap.id;
                    window.currentComments.push(d); 
                }
            }); 
            const topLevel = window.currentComments.filter(function(c) { return !c.parentId || c.parentId === 'null' || c.parentId === ''; }).sort(function(a,b) { return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); }); 
            const replies = window.currentComments.filter(function(c) { return c.parentId && c.parentId !== 'null' && c.parentId !== ''; }).sort(function(a,b) { return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); }); 
            
            topLevel.forEach(function(c) { 
                c.replies = replies.filter(function(r) { return r.parentId === c.id; }); 
            }); 
            window.renderComments(topLevel); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderComments = function(topLevelComments) { 
    const list = document.getElementById('comment-list'); 
    if(!list) return;
    if (topLevelComments.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; return; } 
    try {
        let listHtml = '';
        topLevelComments.forEach(function(c) { 
            let safeContent = String(c.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            const cImgHtml = c.imageUrl ? '<div class="mt-3 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[300px]"><img src="' + c.imageUrl + '" class="w-full h-auto cursor-pointer" onclick="window.open(\'' + c.imageUrl + '\')"></div>' : ''; 
            let repliesHtml = ''; 
            if(c.replies && c.replies.length > 0) { 
                repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; 
                c.replies.forEach(function(r) { 
                    let safeReplyContent = String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
                    if(window.formatMentions) safeReplyContent = window.formatMentions(safeReplyContent); 
                    const rImgHtml = r.imageUrl ? '<div class="mt-2 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[200px]"><img src="' + r.imageUrl + '" class="w-full h-auto cursor-pointer" onclick="window.open(\'' + r.imageUrl + '\')"></div>' : ''; 
                    
                    let replyBtnHtml = '';
                    if (r.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') {
                        replyBtnHtml = '<button onclick="window.editComment(\'' + r.id + '\')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment(\'' + r.id + '\')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>';
                    }
                    
                    repliesHtml += '<div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-sm">' + r.authorName + '</span><span class="text-xs font-medium text-slate-400">' + window.getDateTimeStr(new Date(getSafeMillis(r.createdAt))) + '</span></div><div class="flex gap-2">' + replyBtnHtml + '</div></div><div class="text-slate-700 text-[13px] font-medium pl-6 break-words">' + safeReplyContent + '</div>' + rImgHtml + '</div>'; 
                }); 
                repliesHtml += '</div>'; 
            } 
            
            let mainBtnHtml = '';
            if (c.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') {
                mainBtnHtml = '<button onclick="window.editComment(\'' + c.id + '\')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment(\'' + c.id + '\')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>';
            }
            
            listHtml += '<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-black text-slate-800 text-[15px]">' + c.authorName + '</span><span class="text-xs font-medium text-slate-400">' + window.getDateTimeStr(new Date(getSafeMillis(c.createdAt))) + '</span></div><div class="flex gap-2"><button onclick="window.setReplyTo(\'' + c.id + '\', \'' + c.authorName + '\')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-3 py-1 rounded-lg font-bold transition-colors shadow-sm">답글달기</button>' + mainBtnHtml + '</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 mb-2 break-words leading-relaxed">' + safeContent + '</div>' + cImgHtml + repliesHtml + '</div>'; 
        });
        list.innerHTML = listHtml;
    } catch(e) { list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; }
};

window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value; 
    const content = document.getElementById('new-cmt-text').value.trim(); 
    const parentId = document.getElementById('reply-to-id').value || null; 
    const editId = document.getElementById('editing-cmt-id').value; 
    const fileInput = document.getElementById('new-cmt-image'); 
    
    if(!content && fileInput.files.length === 0) return window.showToast("코멘트 내용이나 사진을 첨부하세요.", "error"); 
    
    document.getElementById('btn-cmt-save').innerHTML = '저장중..'; 
    document.getElementById('btn-cmt-save').disabled = true; 
    
    const saveData = async function(base64Img) { 
        try { 
            const payload = { content: content, updatedAt: Date.now() }; 
            if(base64Img) payload.imageUrl = base64Img; 
            
            if (editId) { 
                await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); 
                window.showToast("코멘트가 수정되었습니다."); 
            } else { 
                payload.projectId = projectId; 
                payload.parentId = parentId; 
                payload.authorUid = window.currentUser.uid; 
                payload.authorName = window.userProfile.name; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); 
                window.showToast("코멘트가 등록되었습니다."); 
            } 
            if(window.processMentions) await window.processMentions(content, projectId, "코멘트");
            window.cancelCommentAction(); 
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
        } finally { 
            document.getElementById('btn-cmt-save').innerHTML = '작성'; 
            document.getElementById('btn-cmt-save').disabled = false; 
        } 
    }; 
    if(fileInput.files.length > 0) { 
        window.resizeAndConvertToBase64(fileInput.files[0], function(base64) { saveData(base64); }); 
    } else { 
        saveData(null); 
    } 
};

window.editComment = function(id) { 
    const comment = window.currentComments.find(function(c) { return c.id === id; }); 
    if(!comment) return; 
    window.cancelCommentAction(); 
    document.getElementById('editing-cmt-id').value = id; 
    document.getElementById('new-cmt-text').value = comment.content || ''; 
    document.getElementById('btn-cmt-save').innerText = '수정'; 
    document.getElementById('reply-indicator-name').innerHTML = '<i class="fa-solid fa-pen mr-1"></i> 코멘트 내용 수정 중'; 
    document.getElementById('reply-indicator').classList.remove('hidden'); 
    document.getElementById('new-cmt-text').focus(); 
};

window.setReplyTo = function(commentId, authorName) { 
    window.cancelCommentAction(); 
    document.getElementById('reply-to-id').value = commentId; 
    document.getElementById('reply-indicator-name').innerHTML = '<i class="fa-solid fa-reply rotate-180 scale-y-[-1] mr-1"></i> <b class="text-indigo-800">' + authorName + '</b> 님에게 답글 작성 중'; 
    document.getElementById('reply-indicator').classList.remove('hidden'); 
    document.getElementById('new-cmt-text').focus(); 
};

window.cancelCommentAction = function() { 
    document.getElementById('reply-to-id').value = ''; 
    document.getElementById('editing-cmt-id').value = ''; 
    document.getElementById('new-cmt-text').value = ''; 
    document.getElementById('new-cmt-image').value = ''; 
    document.getElementById('btn-cmt-save').innerText = '작성'; 
    document.getElementById('reply-indicator').classList.add('hidden'); 
};

window.closeCommentModal = function() { 
    document.getElementById('comment-modal').classList.add('hidden'); 
    document.getElementById('comment-modal').classList.remove('flex'); 
    if (currentCommentUnsubscribe) { currentCommentUnsubscribe(); currentCommentUnsubscribe = null; } 
};

window.deleteComment = async function(id) { 
    if(!confirm("이 코멘트를 삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "project_comments", id)); 
        const q = query(collection(db, "project_comments"), where("parentId", "==", id)); 
        const snapshot = await getDocs(q); 
        if(!snapshot.empty) { 
            const batch = writeBatch(db); 
            snapshot.forEach(function(d) { batch.delete(d.ref); }); 
            await batch.commit(); 
        } 
        window.showToast("삭제되었습니다."); 
        window.cancelCommentAction(); 
    } catch(e) { window.showToast("삭제 실패", "error"); } 
};

window.openIssueModal = function(projectId, title) { 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj) return; 
    document.getElementById('issue-req-id').value = projectId; 
    document.getElementById('editing-issue-id').value = ''; 
    document.getElementById('new-issue-text').value = ''; 
    document.getElementById('btn-issue-save').innerText = '등록'; 
    document.getElementById('issue-modal').classList.remove('hidden'); 
    document.getElementById('issue-modal').classList.add('flex'); 
    window.loadIssues(projectId); 
};

window.loadIssues = function(projectId) { 
    if (currentIssueUnsubscribe) currentIssueUnsubscribe(); 
    currentIssueUnsubscribe = onSnapshot(collection(db, "project_issues"), function(snapshot) { 
        try {
            window.currentIssues = []; 
            let unresolvedCount = 0; 
            snapshot.forEach(function(docSnap) { 
                const d = docSnap.data(); 
                if(d.projectId === projectId || d.reqId === projectId) {
                    d.id = docSnap.id;
                    window.currentIssues.push(d); 
                    if(!d.isResolved) unresolvedCount++;
                }
            }); 
            window.currentIssues.sort(function(a,b) { return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); }); 
            window.renderIssues(window.currentIssues); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderIssues = function(issues) { 
    const list = document.getElementById('issue-list'); 
    if(!list) return;
    if (issues.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; return; } 
    try {
        let listHtml = '';
        issues.forEach(function(iss) { 
            let safeText = String(iss.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeText = window.formatMentions(safeText);
            
            let btnHtml = '';
            if (iss.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') {
                btnHtml = '<button onclick="window.editIssue(\'' + iss.id + '\')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue(\'' + iss.id + '\')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>';
            }
            
            let resolvedClass = iss.isResolved ? 'border-slate-200 bg-slate-50' : 'border-rose-200 shadow-sm';
            let titleClass = iss.isResolved ? 'text-slate-400' : 'text-rose-600';
            let contentClass = iss.isResolved ? 'text-slate-400 line-through' : 'text-slate-700';
            let checkHtml = iss.isResolved ? 'checked' : '';
            
            listHtml += '<div class="bg-white p-4 rounded-xl border ' + resolvedClass + ' flex items-start gap-3 transition-all"><div class="mt-0.5"><input type="checkbox" ' + checkHtml + ' onchange="window.toggleIssueStatus(\'' + iss.id + '\', this.checked)" class="w-5 h-5 text-rose-500 rounded border-gray-300 cursor-pointer accent-rose-500 shadow-sm"></div><div class="flex-1 flex flex-col gap-1"><div class="flex justify-between items-center"><span class="font-bold text-sm ' + titleClass + '">' + iss.authorName + '</span><div class="flex gap-2">' + btnHtml + '</div></div><div class="text-[13px] font-medium mt-1 leading-relaxed ' + contentClass + ' break-words">' + safeText + '</div></div></div>'; 
        });
        list.innerHTML = listHtml;
    } catch(e) { list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; }
};

window.saveIssueItem = async function() { 
    const projectId = document.getElementById('issue-req-id').value; 
    const editId = document.getElementById('editing-issue-id').value; 
    const content = document.getElementById('new-issue-text').value.trim(); 
    
    if(!content) return window.showToast("이슈 내용을 입력하세요.", "error"); 
    try { 
        if (editId) { 
            await setDoc(doc(db, "project_issues", editId), { content: content, updatedAt: Date.now() }, { merge: true }); 
            window.showToast("이슈가 수정되었습니다."); 
        } else { 
            await addDoc(collection(db, "project_issues"), { projectId: projectId, content: content, isResolved: false, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); 
            window.showToast("이슈가 등록되었습니다."); 
        } 
        if(window.processMentions) await window.processMentions(content, projectId, "이슈");
        document.getElementById('editing-issue-id').value = ''; 
        document.getElementById('new-issue-text').value = ''; 
        document.getElementById('btn-issue-save').innerText = '등록'; 
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); } 
};

window.toggleIssueStatus = async function(id, isResolved) { 
    try { 
        await setDoc(doc(db, "project_issues", id), { isResolved: isResolved }, { merge: true }); 
    } catch(e) { window.showToast("상태 변경 오류", "error"); } 
};

window.editIssue = function(id) { 
    const iss = window.currentIssues.find(function(i) { return i.id === id; }); 
    if(!iss) return; 
    document.getElementById('editing-issue-id').value = id; 
    document.getElementById('new-issue-text').value = iss.content || ''; 
    document.getElementById('btn-issue-save').innerText = '수정'; 
    document.getElementById('new-issue-text').focus(); 
};

window.deleteIssue = async function(id) { 
    if(!confirm("이 이슈를 삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "project_issues", id)); 
        window.showToast("삭제되었습니다."); 
    } catch(e) { window.showToast("삭제 실패", "error"); } 
};

window.closeIssueModal = function() { 
    document.getElementById('issue-modal').classList.add('hidden'); 
    document.getElementById('issue-modal').classList.remove('flex'); 
    if (currentIssueUnsubscribe) { currentIssueUnsubscribe(); currentIssueUnsubscribe = null; } 
};

window.openMdLogModal = function(projectId, title, curMd) { 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj) return; 
    document.getElementById('md-req-id').value = projectId; 
    const badge = document.getElementById('md-total-badge'); 
    if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; 
    window.resetMdLogForm(); 
    document.getElementById('md-log-modal').classList.remove('hidden'); 
    document.getElementById('md-log-modal').classList.add('flex'); 
    window.loadMdLogs(projectId); 
};

window.loadMdLogs = function(projectId) { 
    if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); 
    currentMdLogUnsubscribe = onSnapshot(collection(db, "project_md_logs"), function(snapshot) { 
        try {
            window.currentMdLogs = []; 
            let totalMd = 0; 
            snapshot.forEach(function(docSnap) { 
                const d = docSnap.data(); 
                if(d.projectId === projectId || d.reqId === projectId) {
                    d.id = docSnap.id;
                    window.currentMdLogs.push(d); 
                    totalMd += parseFloat(d.md) || 0; 
                }
            }); 
            window.currentMdLogs.sort(function(a, b) { 
                const dateA = a.date || ''; 
                const dateB = b.date || ''; 
                if (dateA !== dateB) return dateB.localeCompare(dateA); 
                return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); 
            }); 
            const badge = document.getElementById('md-total-badge'); 
            if(badge) badge.innerText = '총 ' + totalMd.toFixed(1) + ' MD'; 
            window.renderMdLogs(window.currentMdLogs); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderMdLogs = function(logs) { 
    const list = document.getElementById('md-log-list'); 
    if(!list) return;
    if (logs.length === 0) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; return; } 
    try {
        let htmlStr = '';
        logs.forEach(function(log) { 
            let safeDesc = String(log.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeDesc = window.formatMentions(safeDesc);
            
            let btnHtml = '-';
            if (log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') {
                btnHtml = '<button onclick="window.editMdLog(\'' + log.id + '\')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog(\'' + log.id + '\', \'' + log.projectId + '\')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>';
            }
            
            htmlStr += '<tr class="hover:bg-purple-50/30 transition-colors"><td class="p-3 text-center text-slate-500 font-bold">' + log.date + '</td><td class="p-3 text-center text-purple-700 font-black">' + parseFloat(log.md).toFixed(1) + '</td><td class="p-3 text-slate-700">' + (safeDesc || '-') + '</td><td class="p-3 text-center text-slate-600 font-bold">' + log.authorName + '</td><td class="p-3 text-center"><div class="flex justify-center gap-2">' + btnHtml + '</div></td></tr>'; 
        });
        list.innerHTML = htmlStr;
    } catch(e) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-rose-500 font-bold">렌더링 오류 발생</td></tr>'; }
};

window.saveMdLogItem = async function() { 
    const projectId = document.getElementById('md-req-id').value; 
    const logId = document.getElementById('editing-md-id').value; 
    const date = document.getElementById('new-md-date').value; 
    const mdVal = document.getElementById('new-md-val').value; 
    const desc = document.getElementById('new-md-desc').value.trim(); 
    
    if(!date || !mdVal) return window.showToast("날짜와 투입 MD를 입력하세요.", "error"); 
    
    try { 
        if (logId) { 
            await setDoc(doc(db, "project_md_logs", logId), { date: date, md: parseFloat(mdVal), desc: desc, updatedAt: Date.now() }, { merge: true }); 
            window.showToast("MD 내역이 수정되었습니다."); 
        } else { 
            await addDoc(collection(db, "project_md_logs"), { projectId: projectId, date: date, md: parseFloat(mdVal), desc: desc, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); 
            window.showToast("MD 내역이 등록되었습니다."); 
        } 
        await window.updateProjectTotalMd(projectId); 
        if(window.processMentions) await window.processMentions(desc, projectId, "투입MD기록"); 
        window.resetMdLogForm(); 
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); } 
};

window.editMdLog = function(id) { 
    const log = window.currentMdLogs.find(function(l) { return l.id === id; }); 
    if(!log) return; 
    document.getElementById('editing-md-id').value = id; 
    document.getElementById('new-md-date').value = log.date || window.getLocalDateStr(new Date()); 
    document.getElementById('new-md-val').value = log.md || ''; 
    document.getElementById('new-md-desc').value = log.desc || ''; 
    document.getElementById('btn-md-save').innerText = '수정'; 
    document.getElementById('btn-md-cancel').classList.remove('hidden'); 
};

window.deleteMdLog = async function(id, projectId) { 
    if(!confirm("이 MD 내역을 삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "project_md_logs", id)); 
        await window.updateProjectTotalMd(projectId); 
        window.showToast("삭제되었습니다."); 
        window.resetMdLogForm(); 
    } catch(e) { window.showToast("삭제 실패", "error"); } 
};

window.updateProjectTotalMd = async function(projectId) { 
    const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); 
    let total = 0; 
    snap.forEach(function(docSnap) { total += parseFloat(docSnap.data().md) || 0; }); 
    const projRef = doc(db, "projects_status", projectId); 
    const projSnap = await getDoc(projRef); 
    if(projSnap.exists()) { 
        const outMd = parseFloat(projSnap.data().outMd) || 0; 
        await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); 
    } 
};

window.closeMdLogModal = function() { 
    document.getElementById('md-log-modal').classList.add('hidden'); 
    document.getElementById('md-log-modal').classList.remove('flex'); 
    if (currentMdLogUnsubscribe) { currentMdLogUnsubscribe(); currentMdLogUnsubscribe = null; } 
};

window.resetMdLogForm = function() { 
    document.getElementById('editing-md-id').value = ''; 
    document.getElementById('new-md-date').value = window.getLocalDateStr(new Date()); 
    document.getElementById('new-md-val').value = ''; 
    document.getElementById('new-md-desc').value = ''; 
    document.getElementById('btn-md-save').innerText = '등록'; 
    document.getElementById('btn-md-cancel').classList.add('hidden'); 
};

window.openLinkModal = function(projectId, title) { 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj) return; 
    document.getElementById('link-req-id').value = projectId; 
    const titleEl = document.getElementById('link-project-title'); 
    if(titleEl) titleEl.innerText = title || proj.name || ''; 
    document.getElementById('new-link-name').value = ''; 
    document.getElementById('new-link-url').value = ''; 
    document.getElementById('link-modal').classList.remove('hidden'); 
    document.getElementById('link-modal').classList.add('flex'); 
    window.renderLinksList(projectId); 
};

window.renderLinksList = function(projectId) { 
    try {
        const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
        const list = document.getElementById('link-list'); 
        if(!list) return;
        if(!proj || !proj.links || proj.links.length === 0) { 
            list.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold text-xs bg-white rounded-xl border border-slate-200 border-dashed">등록된 문서/링크가 없습니다.</li>'; 
            return; 
        } 
        
        let htmlStr = '';
        proj.links.forEach(function(lnk, idx) {
            htmlStr += '<li class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"><div class="flex flex-col truncate"><span class="font-extrabold text-slate-700 text-sm mb-1">' + getSafeString(lnk.name) + '</span><a href="' + getSafeString(lnk.url) + '" target="_blank" class="text-[11px] font-bold text-teal-600 hover:text-teal-800 hover:underline truncate flex items-center gap-1"><i class="fa-solid fa-link"></i> ' + getSafeString(lnk.url) + '</a></div><button onclick="window.deleteLinkItem(\'' + projectId + '\', ' + idx + ')" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all p-2.5"><i class="fa-solid fa-trash-can"></i></button></li>';
        });
        list.innerHTML = htmlStr;
    } catch(e) { console.error(e); }
};

window.closeLinkModal = function() { 
    document.getElementById('link-modal').classList.add('hidden'); 
    document.getElementById('link-modal').classList.remove('flex'); 
};

window.saveLinkItem = async function() { 
    const projectId = document.getElementById('link-req-id').value; 
    const name = document.getElementById('new-link-name').value.trim() || '참고 링크'; 
    let url = document.getElementById('new-link-url').value.trim(); 
    
    if(!url) return window.showToast("링크 URL을 입력하세요.", "error"); 
    
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    let links = proj && proj.links ? proj.links.slice() : []; 
    
    if(!url.startsWith('http')) url = 'https://' + url;
    links.push({ name: name, url: url }); 
    
    try { 
        await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); 
        window.showToast("링크가 추가되었습니다."); 
        document.getElementById('new-link-name').value = ''; 
        document.getElementById('new-link-url').value = ''; 
        if(proj) proj.links = links;
        window.renderLinksList(projectId); 
    } catch(e) { window.showToast("추가 실패", "error"); } 
};

window.deleteLinkItem = async function(projectId, index) { 
    if(!confirm("이 링크를 삭제하시겠습니까?")) return; 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj || !proj.links) return; 
    
    let links = proj.links.slice(); 
    links.splice(index, 1); 
    
    try { 
        await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); 
        window.showToast("링크가 삭제되었습니다."); 
        if(proj) proj.links = links; 
        window.renderLinksList(projectId); 
    } catch(e) { window.showToast("삭제 실패", "error"); } 
};

window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
    const val = inputEl.value.trim().toLowerCase();
    let dropdown = document.getElementById('pjt-autocomplete-dropdown');
    
    if(!dropdown) {
        dropdown = document.createElement('ul');
        dropdown.id = 'pjt-autocomplete-dropdown';
        dropdown.className = 'absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-full custom-scrollbar py-1';
        document.body.appendChild(dropdown);
    }

    if(val.length < 1) { 
        dropdown.classList.add('hidden'); 
        return; 
    }

    let matches = [];
    for (let i = 0; i < window.pjtCodeMasterList.length; i++) {
        let p = window.pjtCodeMasterList[i];
        if (isNameSearch) {
            if (p.name.toLowerCase().includes(val) || window.matchString(val, p.name)) {
                matches.push(p);
            }
        } else {
            if (p.code.toLowerCase().includes(val)) {
                matches.push(p);
            }
        }
    }

    if(matches.length > 0) {
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        dropdown.style.width = rect.width + 'px';
        dropdown.classList.remove('hidden');

        let dropHtml = '';
        matches.forEach(function(m) {
            let safeCompany = m.company || '업체미상';
            let safeName = m.name.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            
            dropHtml += '<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors" ';
            dropHtml += 'onmousedown="window.selectAutocomplete(\'' + m.code + '\', \'' + safeName + '\', \'' + m.company + '\', \'' + inputEl.id + '\', \'' + targetId1 + '\', \'' + targetId2 + '\')">';
            dropHtml += '<span class="text-indigo-600">[' + m.code + ']</span> ' + m.name + ' <span class="text-[10px] text-slate-400">(' + safeCompany + ')</span>';
            dropHtml += '</li>';
        });
        dropdown.innerHTML = dropHtml;
    } else {
        dropdown.classList.add('hidden');
    }
};

window.selectAutocomplete = function(code, name, company, sourceId, targetId1, targetId2) {
    const sourceEl = document.getElementById(sourceId);
    const t1 = document.getElementById(targetId1);
    const t2 = document.getElementById(targetId2);

    if (sourceId.includes('code')) {
        if (sourceEl) sourceEl.value = code;
        if (t1) t1.value = name;
        if (t2) t2.value = company;
    } else {
        if (sourceEl) sourceEl.value = name;
        if (t1) t1.value = code;
        if (t2) t2.value = company;
    }

    const drop = document.getElementById('pjt-autocomplete-dropdown');
    if (drop) {
        drop.classList.add('hidden');
    }
};

document.addEventListener('click', function(e) {
    const n = document.getElementById('notification-dropdown');
    if (n && !n.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) {
        n.classList.add('hidden');
    }
    const m = document.getElementById('mention-dropdown');
    if (m && !m.classList.contains('hidden') && !e.target.closest('#mention-dropdown')) {
        m.classList.add('hidden');
    }
    const d = document.getElementById('pjt-autocomplete-dropdown');
    if (d && !d.classList.contains('hidden') && !e.target.closest('#pjt-autocomplete-dropdown') && !e.target.closest('input[oninput*="showAutocomplete"]')) {
        d.classList.add('hidden');
    }
});

// ==========================================
// 💡 부적합(NCR) 구글 시트 연동 (토큰 인증 + gviz API 하이브리드)
// ==========================================
window.loadNcrData = async function() {
    try {
        // 💡 앱에 로그인된 구글 토큰을 가져옵니다.
        const token = window.googleAccessToken || localStorage.getItem('axmsGoogleToken');

        const sheetId = '1ZYwSKvT4QXjFxgftunwdRHWzX4KXoelhZSVjauAJg8s';
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=RawData`;

        // 💡 회사 보안 시트일 경우를 대비해 토큰을 헤더에 실어서 보냅니다.
        const fetchOptions = token ? { headers: { 'Authorization': 'Bearer ' + token } } : {};
        const res = await fetch(url, fetchOptions);

        if (!res.ok) {
            // 토큰이 만료되었거나 접근 권한이 없는 경우
            if (res.status === 401 || res.status === 403) {
                throw new Error("AUTH_ERROR");
            }
            throw new Error("HTTP " + res.status);
        }

        // 응답 텍스트에서 JSON 데이터 부분만 추출
        const text = await res.text();
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("데이터 파싱 실패");
        
        const jsonString = text.substring(start, end + 1);
        const data = JSON.parse(jsonString);

        if (!data || !data.table || !data.table.cols || !data.table.rows) return;

        // 헤더(열 이름) 추출
        const cols = data.table.cols.map(c => c ? c.label : '');
        const rows = data.table.rows;

        // 띄어쓰기, 대소문자를 무시하고 정확히 열 위치를 찾는 함수
        const getIdx = (keywords) => {
            return cols.findIndex(h => {
                if (!h) return false;
                const normalized = String(h).toLowerCase().replace(/[\s\(\)\[\]_]/g, '');
                return keywords.some(k => normalized.includes(k.toLowerCase().replace(/[\s\(\)\[\]_]/g, '')));
            });
        };

        const cPjt = getIdx(['project', 'pjt', '프로젝트']);
        const cNcr = getIdx(['ncrno', 'ncr']);
        const cDate = getIdx(['발생일', 'date']);
        const cDraw = getIdx(['도면번호', '도면', 'drawing']);
        const cPart = getIdx(['파트네임', 'partname', 'part']);
        const cType = getIdx(['유형', 'type']);
        const cDesc = getIdx(['내용', '부적합내용', 'content', 'desc']);
        const cStat = getIdx(['진행', '현황', '상태', 'status']);

        window.ncrData = rows.map(row => {
            // 셀 값을 안전하게 가져오는 헬퍼
            const getCellVal = (idx) => {
                if (idx === -1 || !row.c[idx]) return '';
                return row.c[idx].f ? String(row.c[idx].f) : (row.c[idx].v !== null ? String(row.c[idx].v) : '');
            };

            return {
                pjtCode: getCellVal(cPjt).trim(),
                ncrNo: getCellVal(cNcr),
                date: getCellVal(cDate),
                drawingNo: getCellVal(cDraw),
                partName: getCellVal(cPart),
                type: getCellVal(cType),
                content: getCellVal(cDesc),
                status: getCellVal(cStat)
            };
        }).filter(n => n.pjtCode); 

        window.renderProjectStatusList();

        const modal = document.getElementById('ncr-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const pjtCode = document.getElementById('ncr-project-title').dataset.code;
            if (pjtCode) window.renderNcrList(pjtCode);
        }

    } catch(e) {
        console.error("NCR 로드 에러:", e);
        if (e.message === "AUTH_ERROR") {
            if(window.showToast) window.showToast("구글 권한이 만료되었습니다. [요청서] 탭에서 구글 계정을 다시 연동해주세요.", "warning");
        } else {
            if(window.showToast) window.showToast("시트 접근 오류: 회사 보안 정책으로 막혔거나 시트 이름이 다릅니다.", "error");
        }
    }
};

window.openNcrModal = function(pjtCode, pjtName) {
    const titleEl = document.getElementById('ncr-project-title');
    if (titleEl) {
        titleEl.innerText = `[${pjtCode}] ${pjtName}`;
        titleEl.dataset.code = pjtCode;
    }
    document.getElementById('ncr-modal').classList.replace('hidden', 'flex');
    window.renderNcrList(pjtCode);
};

window.closeNcrModal = function() {
    document.getElementById('ncr-modal').classList.replace('flex', 'hidden');
};

window.renderNcrList = function(pjtCode) {
    const tbody = document.getElementById('ncr-list-tbody');
    if (!tbody) return;
    
    // 시트의 코드와 현황판의 코드 비교 시, 띄어쓰기 및 대소문자를 무시하도록 강화
    const safeTargetCode = String(pjtCode).replace(/\s/g, '').toUpperCase();
    const list = (window.ncrData || []).filter(n => String(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeTargetCode);
    
    let total = list.length, completed = list.filter(n => n.status.includes('완료') || n.status.includes('종결')).length;
    
    document.getElementById('ncr-total-cnt').innerText = total;
    document.getElementById('ncr-pending-cnt').innerText = total - completed;
    document.getElementById('ncr-comp-cnt').innerText = completed;
    
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-slate-400 font-bold bg-white">등록된 부적합 내역이 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = list.map(n => {
        const isComp = n.status.includes('완료') || n.status.includes('종결');
        const textClass = isComp ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700';
        const badge = isComp ? `<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">완료</span>` : `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">진행중</span>`;
        
        return `<tr class="hover:bg-slate-50 transition-colors bg-white border-b border-slate-100">
            <td class="p-3 text-center font-bold text-slate-500 whitespace-nowrap">${n.ncrNo || '-'}</td>
            <td class="p-3 text-center text-slate-500 whitespace-nowrap">${n.date || '-'}</td>
            <td class="p-3 text-center text-slate-500 whitespace-nowrap">${n.drawingNo || '-'}</td>
            <td class="p-3 text-center text-slate-500 whitespace-nowrap">${n.partName || '-'}</td>
            <td class="p-3 text-center whitespace-nowrap"><span class="bg-slate-100 px-2 py-1 border border-slate-200 rounded font-bold">${n.type || '-'}</span></td>
            <td class="p-3 font-medium ${textClass} break-all">${n.content || '-'}</td>
            <td class="p-3 text-center whitespace-nowrap">${badge}</td>
        </tr>`;
    }).join('');
};
