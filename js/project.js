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
window.ncrData = [];

window.resizeAndConvertToBase64 = function(file, callback) {
    if (!file || !file.type.match(/image.*/)) { callback(null); return; }
    const reader = new FileReader();
    reader.onload = function(readerEvent) {
        const image = new Image();
        image.onload = function() {
            const canvas = document.createElement('canvas'); const maxSize = 1200;
            let width = image.width, height = image.height;
            if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; } 
            else if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(image, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8));
        };
        image.onerror = function() { callback(null); }; image.src = readerEvent.target.result;
    };
    reader.onerror = function() { callback(null); }; reader.readAsDataURL(file);
};

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
        onSnapshot(collection(db, "project_comments"), (snap) => { window.projectCommentCounts = {}; snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectCommentCounts[pid] = (window.projectCommentCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_issues"), (snap) => { window.projectIssueCounts = {}; snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid && !d.isResolved) window.projectIssueCounts[pid] = (window.projectIssueCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "daily_logs"), (snap) => { window.projectLogCounts = {}; snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectLogCounts[pid] = (window.projectLogCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_purchases"), (snap) => { window.projectPurchaseCounts = {}; snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectPurchaseCounts[pid] = (window.projectPurchaseCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_designs"), (snap) => { window.projectDesignCounts = {}; snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectDesignCounts[pid] = (window.projectDesignCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_schedules"), (snap) => { window.projectScheduleCounts = {}; snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectScheduleCounts[pid] = (window.projectScheduleCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        window.loadNcrData();
    } catch(e) {}
};

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; window.resetAllFilters();
    let btnMfg = document.getElementById('btn-part-mfg'), btnOpt = document.getElementById('btn-part-opt');
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
    if(window.currentStatusFilter && window.currentStatusFilter !== 'all') list = list.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; }); 
    if(window.hideCompletedFilter) list = list.filter(item => item.status !== 'completed');
    if(window.currentYearFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentYearFilter) || (item.d_asmEst || '').startsWith(window.currentYearFilter) || (item.d_asmEn || '').startsWith(window.currentYearFilter));
    if(window.currentMonthFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentMonthFilter) || (item.d_asmEst || '').startsWith(window.currentMonthFilter) || (item.d_asmEn || '').startsWith(window.currentMonthFilter));
    const priority = { 'pending': 1, 'progress': 2, 'inspecting': 2, 'rejected': 3, 'completed': 4 };
    list.sort((a,b) => (priority[a.status] || 99) - (priority[b.status] || 99) || getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
    return list;
};

window.searchProjectBoard = function(keyword) { try { const k = getSafeString(keyword).toLowerCase(); document.querySelectorAll('#proj-dash-tbody tr').forEach(tr => { const text = tr.innerText.toLowerCase(); tr.style.display = (text.includes(k) || window.matchString(k, text)) ? '' : 'none'; }); } catch(e) {} };

window.updateMiniDashboard = function() {
    try {
        let pending = 0, progress = 0, completedThisMonth = 0; let upcomingCodes7 = [], upcomingCodes14 = [];
        const now = new Date(), currentMonthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const completedLabel = document.getElementById('mini-dash-completed-label');
        if (completedLabel) completedLabel.innerHTML = '<i class="fa-solid fa-truck-fast text-emerald-400"></i> 출하 완료 (' + (now.getMonth() + 1) + '월)';

        (window.currentProjectStatusList || []).forEach(function(item) {
            const status = getSafeString(item.status), shipEn = getSafeString(item.d_shipEn), shipEst = getSafeString(item.d_shipEst), code = getSafeString(item.code) || '미지정';
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
            else elUpcoming7.innerHTML = upcomingCodes7.map(u => { let dText = u.dDay === 0 ? 'D-Day' : (u.dDay < 0 ? '지연' : 'D-' + u.dDay); let bgClass = u.dDay <= 3 ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'; return `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 ${bgClass}">${u.code} <span class="opacity-80 text-[8px]">[${dText}]</span></span>`; }).join('');
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
        window.currentProjectStatusList = []; let lastUpdated = 0; const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
        snapshot.forEach(docSnap => { 
            const data = docSnap.data(); let dataPart = getSafeString(data.part).trim() || '제조'; 
            if((targetPart === '광학' && dataPart === '광학') || (targetPart !== '광학' && dataPart !== '광학')) { data.id = docSnap.id; window.currentProjectStatusList.push(data); }
            if(getSafeMillis(data.updatedAt) > lastUpdated) lastUpdated = getSafeMillis(data.updatedAt);
        });
        if (lastUpdated > 0) { 
            const lDate = new Date(lastUpdated); const el = document.getElementById('pjt-last-update');
            if(el) el.innerText = lDate.getFullYear().toString().slice(2) + '-' + String(lDate.getMonth()+1).padStart(2,'0') + '-' + String(lDate.getDate()).padStart(2,'0') + ' ' + String(lDate.getHours()).padStart(2,'0') + ':' + String(lDate.getMinutes()).padStart(2,'0'); 
        }
        window.updateMiniDashboard();
        if(window.currentProjDashView === 'gantt') window.renderProjGantt(); else if(window.currentProjDashView === 'calendar') window.renderProjCalendar(); else window.renderProjectStatusList();
    });
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    let displayList = window.getFilteredProjects();
    
    if(displayList.length === 0) { tbody.innerHTML = '<tr><td colspan="32" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">프로젝트가 없습니다.</td></tr>'; return; }
    
    const statusMap = { 'pending': '<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">대기/보류</span>', 'progress': '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200">진행중(제작)</span>', 'inspecting': '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200">진행중(검수)</span>', 'completed': '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200">완료(출하)</span>', 'rejected': '<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200">보류/불가</span>' };
    
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

        const safeItemCode = String(item.code || '').replace(/\s/g, '').toUpperCase();
        const pjtNcrData = (window.ncrData || []).filter(n => String(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeItemCode);
        const unresolvedNcrCnt = pjtNcrData.filter(n => { let s = String(n.status || ''); return !(s.includes('완료') || s.includes('종결') || s.includes('완료됨')); }).length;

        let trHtml = `<tr class="group hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 0px; min-width: 40px; max-width: 40px;" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 40px; min-width: 80px; max-width: 80px;">${getSafeString(item.category)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 120px; min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 170px; min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${iCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-bold text-indigo-700 bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 220px; min-width: 110px; max-width: 110px;">${getSafeString(item.code)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 truncate max-w-[220px] bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 330px; min-width: 220px;">${safeNameHtml}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center truncate max-w-[110px] bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 550px; min-width: 110px;">${getSafeString(item.company)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-black text-emerald-600 bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 660px; min-width: 60px; max-width: 60px;">${parseFloat(item.progress) || 0}%</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20 shadow-[3px_0_5px_-1px_rgba(0,0,0,0.3)] border-r-slate-300" style="left: 720px; min-width: 80px; max-width: 80px;">${statusMap[item.status] || ''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600">${getSafeString(item.manager)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPurchaseModal('${item.id}', '${safeNameJs}')" class="text-amber-500 relative"><i class="fa-solid fa-cart-shopping text-lg"></i>${purCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${purCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDesignModal('${item.id}', '${safeNameJs}')" class="text-teal-400 relative"><i class="fa-solid fa-pen-ruler text-lg"></i>${desCnt ? `<span class="absolute -top-1 -right-2 bg-teal-100 text-teal-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-teal-200">${desCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPjtScheduleModal('${item.id}', '${safeNameJs}')" class="text-fuchsia-400 relative"><i class="fa-regular fa-calendar-check text-lg"></i>${schCnt ? `<span class="absolute -top-1 -right-2 bg-fuchsia-100 text-fuchsia-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-fuchsia-200">${schCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}', '${safeNameJs}', ${parseFloat(item.progress)||0})" class="text-sky-400 relative"><i class="fa-solid fa-book text-lg"></i>${lCnt ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-sky-200">${lCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-rose-500 relative transition-transform hover:scale-110"><i class="fa-solid fa-file-circle-exclamation text-lg"></i>${unresolvedNcrCnt > 0 ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${unresolvedNcrCnt}</span>` : ''}</button></td>`;
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
        if(item.links && Array.isArray(item.links)) { linksHtml = item.links.map(lnk => `<a href="${getSafeString(lnk?.url)}" target="_blank" title="${getSafeString(lnk?.name)}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-link text-[10px]"></i></a>`).join(''); }
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><div class="flex items-center justify-center gap-1 flex-wrap"><button onclick="window.openLinkModal('${item.id}', '${safeNameJs}')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>${linksHtml}</div></td></tr>`;
        htmlStr += trHtml;
    });
    tbody.innerHTML = htmlStr;
};

// ... 구글 드라이브 파일 업로드 등 공통 기능
async function handleDriveUploadWithProgress(fileInput, projectName) {
    if(!window.googleAccessToken) {
        if(window.initGoogleAPI) window.initGoogleAPI();
        if(window.authenticateGoogle && !window.googleAccessToken) window.authenticateGoogle();
        if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다. [연동하기] 버튼을 눌러주세요.");
    }
    const file = fileInput.files[0]; if (!file) throw new Error("파일이 없습니다.");
    const safeProjectName = projectName ? projectName.replace(/[\/\\]/g, '_') : '미분류 프로젝트';
    const findFolderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(safeProjectName)}' and mimeType='application/vnd.google-apps.folder' and '${TARGET_DRIVE_FOLDER}' in parents and trashed=false`, { headers: { 'Authorization': 'Bearer ' + window.googleAccessToken } });
    const folderData = await findFolderRes.json();
    let targetFolderId = '';
    if (folderData.files && folderData.files.length > 0) targetFolderId = folderData.files[0].id;
    else {
        const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', { method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: safeProjectName, mimeType: 'application/vnd.google-apps.folder', parents: [TARGET_DRIVE_FOLDER] }) });
        const newFolderData = await createFolderRes.json(); targetFolderId = newFolderData.id;
    }
    return new Promise((resolve, reject) => {
        const metadata = { name: file.name, parents: [targetFolderId] };
        const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); form.append('file', file);
        const xhr = new XMLHttpRequest(); xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', true); xhr.setRequestHeader('Authorization', 'Bearer ' + window.googleAccessToken);
        xhr.onload = function() { if (xhr.status >= 200 && xhr.status < 300) { const data = JSON.parse(xhr.responseText); resolve(`https://drive.google.com/file/d/${data.id}/view`); } else { reject(new Error("파일 업로드 실패: " + xhr.responseText)); } };
        xhr.onerror = function() { reject(new Error("네트워크 오류 발생")); }; xhr.send(form);
    });
}

// =======================
// 코멘트/이슈 관련 (PJT 현황판)
// =======================

// 💡 1, 2번 오류: PJT 현황판에서도 코멘트/이슈를 달면 당사자 및 담당자에게 자동 알림 
window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value; 
    const content = document.getElementById('new-cmt-text').value.trim(); 
    const parentId = document.getElementById('reply-to-id').value || null; 
    const editId = document.getElementById('editing-cmt-id').value; 
    const fileInput = document.getElementById('new-cmt-image'); 
    
    if(!content && (!fileInput || fileInput.files.length === 0)) return window.showToast("코멘트 내용이나 사진을 첨부하세요.", "error"); 
    const btnSave = document.getElementById('btn-cmt-save');
    if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
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
                
                // 🔥 PJT 현황판 담당자 자동 알림
                let notified = [];
                if(window.processMentions) notified = await window.processMentions(content, projectId, "코멘트");
                
                const proj = window.currentProjectStatusList.find(p => p.id === projectId);
                if (proj && proj.manager && proj.manager !== window.userProfile.name && (!notified || !notified.includes(proj.manager))) {
                    if(window.notifyUser) await window.notifyUser(proj.manager, content, projectId, "PJT 코멘트");
                }
            } 
            if(window.cancelCommentAction) window.cancelCommentAction(); 
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
        } finally { 
            if(btnSave) { btnSave.innerHTML = '작성'; btnSave.disabled = false; }
        } 
    }; 
    if(fileInput && fileInput.files.length > 0) { 
        if(window.resizeAndConvertToBase64) window.resizeAndConvertToBase64(fileInput.files[0], function(base64) { saveData(base64); }); 
        else saveData(null);
    } else { saveData(null); } 
};

window.openCommentModal = function(projectId, title) { const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); if(!proj) return; document.getElementById('cmt-req-id').value = projectId; if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('comment-modal').classList.remove('hidden'); document.getElementById('comment-modal').classList.add('flex'); window.loadComments(projectId); };
window.loadComments = function(projectId) { if (currentCommentUnsubscribe) currentCommentUnsubscribe(); currentCommentUnsubscribe = onSnapshot(collection(db, "project_comments"), function(snapshot) { window.currentComments = []; snapshot.forEach(function(docSnap) { const d = docSnap.data(); if(d.projectId === projectId || d.reqId === projectId) { d.id = docSnap.id; window.currentComments.push(d); } }); const topLevel = window.currentComments.filter(function(c) { return !c.parentId || c.parentId === 'null' || c.parentId === ''; }).sort(function(a,b) { return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); }); const replies = window.currentComments.filter(function(c) { return c.parentId && c.parentId !== 'null' && c.parentId !== ''; }).sort(function(a,b) { return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); }); topLevel.forEach(function(c) { c.replies = replies.filter(function(r) { return r.parentId === c.id; }); }); window.renderComments(topLevel); }); };
window.renderComments = function(topLevelComments) { const list = document.getElementById('comment-list'); if(!list) return; if (topLevelComments.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; return; } let listHtml = ''; topLevelComments.forEach(function(c) { let safeContent = String(c.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); if(window.formatMentions) safeContent = window.formatMentions(safeContent); const cImgHtml = c.imageUrl ? `<div class="mt-3 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[300px]"><img src="${c.imageUrl}" class="w-full h-auto cursor-pointer" onclick="window.open('${c.imageUrl}')"></div>` : ''; let repliesHtml = ''; if(c.replies && c.replies.length > 0) { repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; c.replies.forEach(function(r) { let safeReplyContent = String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); if(window.formatMentions) safeReplyContent = window.formatMentions(safeReplyContent); const rImgHtml = r.imageUrl ? `<div class="mt-2 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[200px]"><img src="${r.imageUrl}" class="w-full h-auto cursor-pointer" onclick="window.open('${r.imageUrl}')"></div>` : ''; let replyBtnHtml = ''; if (r.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') { replyBtnHtml = `<button onclick="window.editComment('${r.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${r.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>`; } repliesHtml += `<div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-sm">${r.authorName}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(r.createdAt)))}</span></div><div class="flex gap-2">${replyBtnHtml}</div></div><div class="text-slate-700 text-[13px] font-medium pl-6 break-words">${safeReplyContent}</div>${rImgHtml}</div>`; }); repliesHtml += '</div>'; } let mainBtnHtml = ''; if (c.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') { mainBtnHtml = `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>`; } listHtml += `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-black text-slate-800 text-[15px]">${c.authorName}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span></div><div class="flex gap-2"><button onclick="window.setReplyTo('${c.id}', '${c.authorName}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-3 py-1 rounded-lg font-bold transition-colors shadow-sm">답글달기</button>${mainBtnHtml}</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 mb-2 break-words leading-relaxed">${safeContent}</div>${cImgHtml}${repliesHtml}</div>`; }); list.innerHTML = listHtml; };
window.editComment = function(id) { const comment = window.currentComments.find(function(c) { return c.id === id; }); if(!comment) return; if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('editing-cmt-id').value = id; document.getElementById('new-cmt-text').value = comment.content || ''; document.getElementById('btn-cmt-save').innerText = '수정'; document.getElementById('reply-indicator-name').innerHTML = '<i class="fa-solid fa-pen mr-1"></i> 코멘트 내용 수정 중'; document.getElementById('reply-indicator').classList.remove('hidden'); document.getElementById('new-cmt-text').focus(); };
window.setReplyTo = function(commentId, authorName) { if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('reply-to-id').value = commentId; document.getElementById('reply-indicator-name').innerHTML = '<i class="fa-solid fa-reply rotate-180 scale-y-[-1] mr-1"></i> <b class="text-indigo-800">' + authorName + '</b> 님에게 답글 작성 중'; document.getElementById('reply-indicator').classList.remove('hidden'); document.getElementById('new-cmt-text').focus(); };
window.cancelCommentAction = function() { document.getElementById('reply-to-id').value = ''; document.getElementById('editing-cmt-id').value = ''; document.getElementById('new-cmt-text').value = ''; const fileInput = document.getElementById('new-cmt-image'); if (fileInput) fileInput.value = ''; document.getElementById('btn-cmt-save').innerText = '작성'; document.getElementById('reply-indicator').classList.add('hidden'); };
window.closeCommentModal = function() { document.getElementById('comment-modal').classList.add('hidden'); document.getElementById('comment-modal').classList.remove('flex'); if (currentCommentUnsubscribe) { currentCommentUnsubscribe(); currentCommentUnsubscribe = null; } };
window.deleteComment = async function(id) { if(!confirm("이 코멘트를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_comments", id)); const q = query(collection(db, "project_comments"), where("parentId", "==", id)); const snapshot = await getDocs(q); if(!snapshot.empty) { const batch = writeBatch(db); snapshot.forEach(function(d) { batch.delete(d.ref); }); await batch.commit(); } window.showToast("삭제되었습니다."); if(window.cancelCommentAction) window.cancelCommentAction(); } catch(e) { window.showToast("삭제 실패", "error"); } };

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
            
            // 🔥 PJT 현황판 담당자 자동 알림
            let notified = [];
            if(window.processMentions) notified = await window.processMentions(content, projectId, "이슈");
            const proj = window.currentProjectStatusList.find(p => p.id === projectId);
            if (proj && proj.manager && proj.manager !== window.userProfile.name && (!notified || !notified.includes(proj.manager))) {
                if(window.notifyUser) await window.notifyUser(proj.manager, content, projectId, "PJT 이슈");
            }
        } 
        document.getElementById('editing-issue-id').value = ''; 
        document.getElementById('new-issue-text').value = ''; 
        document.getElementById('btn-issue-save').innerText = '등록'; 
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); } 
};
window.openIssueModal = function(projectId, title) { const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); if(!proj) return; document.getElementById('issue-req-id').value = projectId; document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; document.getElementById('btn-issue-save').innerText = '등록'; document.getElementById('issue-modal').classList.remove('hidden'); document.getElementById('issue-modal').classList.add('flex'); window.loadIssues(projectId); };
window.loadIssues = function(projectId) { if (currentIssueUnsubscribe) currentIssueUnsubscribe(); currentIssueUnsubscribe = onSnapshot(collection(db, "project_issues"), function(snapshot) { window.currentIssues = []; let unresolvedCount = 0; snapshot.forEach(function(docSnap) { const d = docSnap.data(); if(d.projectId === projectId || d.reqId === projectId) { d.id = docSnap.id; window.currentIssues.push(d); if(!d.isResolved) unresolvedCount++; } }); window.currentIssues.sort(function(a,b) { return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); }); window.renderIssues(window.currentIssues); }); };
window.renderIssues = function(issues) { const list = document.getElementById('issue-list'); if(!list) return; if (issues.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; return; } let listHtml = ''; issues.forEach(function(iss) { let safeText = String(iss.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); if(window.formatMentions) safeText = window.formatMentions(safeText); let btnHtml = ''; if (iss.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') { btnHtml = `<button onclick="window.editIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>`; } let resolvedClass = iss.isResolved ? 'border-slate-200 bg-slate-50' : 'border-rose-200 shadow-sm'; let titleClass = iss.isResolved ? 'text-slate-400' : 'text-rose-600'; let contentClass = iss.isResolved ? 'text-slate-400 line-through' : 'text-slate-700'; let checkHtml = iss.isResolved ? 'checked' : ''; listHtml += `<div class="bg-white p-4 rounded-xl border ${resolvedClass} flex items-start gap-3 transition-all"><div class="mt-0.5"><input type="checkbox" ${checkHtml} onchange="window.toggleIssueStatus('${iss.id}', this.checked)" class="w-5 h-5 text-rose-500 rounded border-gray-300 cursor-pointer accent-rose-500 shadow-sm"></div><div class="flex-1 flex flex-col gap-1"><div class="flex justify-between items-center"><span class="font-bold text-sm ${titleClass}">${iss.authorName}</span><div class="flex gap-2">${btnHtml}</div></div><div class="text-[13px] font-medium mt-1 leading-relaxed ${contentClass} break-words">${safeText}</div></div></div>`; }); list.innerHTML = listHtml; };
window.toggleIssueStatus = async function(id, isResolved) { try { await setDoc(doc(db, "project_issues", id), { isResolved: isResolved }, { merge: true }); } catch(e) { window.showToast("상태 변경 오류", "error"); } };
window.editIssue = function(id) { const iss = window.currentIssues.find(function(i) { return i.id === id; }); if(!iss) return; document.getElementById('editing-issue-id').value = id; document.getElementById('new-issue-text').value = iss.content || ''; document.getElementById('btn-issue-save').innerText = '수정'; document.getElementById('new-issue-text').focus(); };
window.deleteIssue = async function(id) { if(!confirm("이 이슈를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_issues", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.closeIssueModal = function() { document.getElementById('issue-modal').classList.add('hidden'); document.getElementById('issue-modal').classList.remove('flex'); if (currentIssueUnsubscribe) { currentIssueUnsubscribe(); currentIssueUnsubscribe = null; } };

window.openMdLogModal = function(projectId, title, curMd) { const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); if(!proj) return; document.getElementById('md-req-id').value = projectId; const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; window.resetMdLogForm(); document.getElementById('md-log-modal').classList.remove('hidden'); document.getElementById('md-log-modal').classList.add('flex'); window.loadMdLogs(projectId); };
window.loadMdLogs = function(projectId) { if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); currentMdLogUnsubscribe = onSnapshot(collection(db, "project_md_logs"), function(snapshot) { window.currentMdLogs = []; let totalMd = 0; snapshot.forEach(function(docSnap) { const d = docSnap.data(); if(d.projectId === projectId || d.reqId === projectId) { d.id = docSnap.id; window.currentMdLogs.push(d); totalMd += parseFloat(d.md) || 0; } }); window.currentMdLogs.sort(function(a, b) { const dateA = a.date || ''; const dateB = b.date || ''; if (dateA !== dateB) return dateB.localeCompare(dateA); return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); }); const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = '총 ' + totalMd.toFixed(1) + ' MD'; window.renderMdLogs(window.currentMdLogs); }); };
window.renderMdLogs = function(logs) { const list = document.getElementById('md-log-list'); if(!list) return; if (logs.length === 0) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; return; } let htmlStr = ''; logs.forEach(function(log) { let safeDesc = String(log.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); if(window.formatMentions) safeDesc = window.formatMentions(safeDesc); let btnHtml = '-'; if (log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') { btnHtml = `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`; } htmlStr += `<tr class="hover:bg-purple-50/30 transition-colors"><td class="p-3 text-center text-slate-500 font-bold">${log.date}</td><td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td><td class="p-3 text-slate-700">${safeDesc || '-'}</td><td class="p-3 text-center text-slate-600 font-bold">${log.authorName}</td><td class="p-3 text-center"><div class="flex justify-center gap-2">${btnHtml}</div></td></tr>`; }); list.innerHTML = htmlStr; };
window.saveMdLogItem = async function() { const projectId = document.getElementById('md-req-id').value; const logId = document.getElementById('editing-md-id').value; const date = document.getElementById('new-md-date').value; const mdVal = document.getElementById('new-md-val').value; const desc = document.getElementById('new-md-desc').value.trim(); if(!date || !mdVal) return window.showToast("날짜와 투입 MD를 입력하세요.", "error"); try { if (logId) { await setDoc(doc(db, "project_md_logs", logId), { date: date, md: parseFloat(mdVal), desc: desc, updatedAt: Date.now() }, { merge: true }); window.showToast("MD 내역이 수정되었습니다."); } else { await addDoc(collection(db, "project_md_logs"), { projectId: projectId, date: date, md: parseFloat(mdVal), desc: desc, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); window.showToast("MD 내역이 등록되었습니다."); } await window.updateProjectTotalMd(projectId); if(window.processMentions) await window.processMentions(desc, projectId, "투입MD기록"); window.resetMdLogForm(); } catch(e) { window.showToast("저장 중 오류 발생", "error"); } };
window.editMdLog = function(id) { const log = window.currentMdLogs.find(function(l) { return l.id === id; }); if(!log) return; document.getElementById('editing-md-id').value = id; document.getElementById('new-md-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = log.md || ''; document.getElementById('new-md-desc').value = log.desc || ''; document.getElementById('btn-md-save').innerText = '수정'; document.getElementById('btn-md-cancel').classList.remove('hidden'); };
window.deleteMdLog = async function(id, projectId) { if(!confirm("이 MD 내역을 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_md_logs", id)); await window.updateProjectTotalMd(projectId); window.showToast("삭제되었습니다."); window.resetMdLogForm(); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.updateProjectTotalMd = async function(projectId) { const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); let total = 0; snap.forEach(function(docSnap) { total += parseFloat(docSnap.data().md) || 0; }); const projRef = doc(db, "projects_status", projectId); const projSnap = await getDoc(projRef); if(projSnap.exists()) { const outMd = parseFloat(projSnap.data().outMd) || 0; await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); } };
window.closeMdLogModal = function() { document.getElementById('md-log-modal').classList.add('hidden'); document.getElementById('md-log-modal').classList.remove('flex'); if (currentMdLogUnsubscribe) { currentMdLogUnsubscribe(); currentMdLogUnsubscribe = null; } };
window.resetMdLogForm = function() { document.getElementById('editing-md-id').value = ''; document.getElementById('new-md-date').value = window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = ''; document.getElementById('new-md-desc').value = ''; document.getElementById('btn-md-save').innerText = '등록'; document.getElementById('btn-md-cancel').classList.add('hidden'); };

window.openLinkModal = function(projectId, title) { const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); if(!proj) return; document.getElementById('link-req-id').value = projectId; const titleEl = document.getElementById('link-project-title'); if(titleEl) titleEl.innerText = title || proj.name || ''; document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; document.getElementById('link-modal').classList.remove('hidden'); document.getElementById('link-modal').classList.add('flex'); window.renderLinksList(projectId); };
window.renderLinksList = function(projectId) { try { const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); const list = document.getElementById('link-list'); if(!list) return; if(!proj || !proj.links || proj.links.length === 0) { list.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold text-xs bg-white rounded-xl border border-slate-200 border-dashed">등록된 문서/링크가 없습니다.</li>'; return; } let htmlStr = ''; proj.links.forEach(function(lnk, idx) { htmlStr += `<li class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"><div class="flex flex-col truncate"><span class="font-extrabold text-slate-700 text-sm mb-1">${getSafeString(lnk.name)}</span><a href="${getSafeString(lnk.url)}" target="_blank" class="text-[11px] font-bold text-teal-600 hover:text-teal-800 hover:underline truncate flex items-center gap-1"><i class="fa-solid fa-link"></i> ${getSafeString(lnk.url)}</a></div><button onclick="window.deleteLinkItem('${projectId}', ${idx})" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all p-2.5"><i class="fa-solid fa-trash-can"></i></button></li>`; }); list.innerHTML = htmlStr; } catch(e) {} };
window.closeLinkModal = function() { document.getElementById('link-modal').classList.add('hidden'); document.getElementById('link-modal').classList.remove('flex'); };
window.saveLinkItem = async function() { const projectId = document.getElementById('link-req-id').value; const name = document.getElementById('new-link-name').value.trim() || '참고 링크'; let url = document.getElementById('new-link-url').value.trim(); if(!url) return window.showToast("링크 URL을 입력하세요.", "error"); const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); let links = proj && proj.links ? proj.links.slice() : []; if(!url.startsWith('http')) url = 'https://' + url; links.push({ name: name, url: url }); try { await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); window.showToast("링크가 추가되었습니다."); document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; if(proj) proj.links = links; window.renderLinksList(projectId); } catch(e) { window.showToast("추가 실패", "error"); } };
window.deleteLinkItem = async function(projectId, index) { if(!confirm("이 링크를 삭제하시겠습니까?")) return; const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); if(!proj || !proj.links) return; let links = proj.links.slice(); links.splice(index, 1); try { await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); window.showToast("링크가 삭제되었습니다."); if(proj) proj.links = links; window.renderLinksList(projectId); } catch(e) { window.showToast("삭제 실패", "error"); } };

window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
    const val = inputEl.value.trim().toLowerCase(); let dropdown = document.getElementById('pjt-autocomplete-dropdown');
    if(!dropdown) { dropdown = document.createElement('ul'); dropdown.id = 'pjt-autocomplete-dropdown'; dropdown.className = 'absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-full custom-scrollbar py-1'; document.body.appendChild(dropdown); }
    if(val.length < 1) { dropdown.classList.add('hidden'); return; }
    let matches = [];
    for (let i = 0; i < window.pjtCodeMasterList.length; i++) { let p = window.pjtCodeMasterList[i]; if (isNameSearch) { if (p.name.toLowerCase().includes(val) || window.matchString(val, p.name)) matches.push(p); } else { if (p.code.toLowerCase().includes(val)) matches.push(p); } }
    if(matches.length > 0) {
        const rect = inputEl.getBoundingClientRect(); dropdown.style.left = (rect.left + window.scrollX) + 'px'; dropdown.style.top = (rect.bottom + window.scrollY + 5) + 'px'; dropdown.style.width = rect.width + 'px'; dropdown.classList.remove('hidden');
        let dropHtml = '';
        matches.forEach(function(m) { let safeCompany = m.company || '업체미상'; let safeName = m.name.replace(/'/g, "&#39;").replace(/"/g, "&quot;"); dropHtml += `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors" onmousedown="window.selectAutocomplete('${m.code}', '${safeName}', '${m.company}', '${inputEl.id}', '${targetId1}', '${targetId2}')"><span class="text-indigo-600">[${m.code}]</span> ${m.name} <span class="text-[10px] text-slate-400">(${safeCompany})</span></li>`; }); dropdown.innerHTML = dropHtml;
    } else dropdown.classList.add('hidden');
};
window.selectAutocomplete = function(code, name, company, sourceId, targetId1, targetId2) { const sourceEl = document.getElementById(sourceId); const t1 = document.getElementById(targetId1); const t2 = document.getElementById(targetId2); if (sourceId === 'ps-code') { if (sourceEl) sourceEl.value = code; if (t1) t1.value = name; if (t2) t2.value = company; } else { if (sourceEl) sourceEl.value = name; if (t1) t1.value = code; if (t2) t2.value = company; } const drop = document.getElementById('pjt-autocomplete-dropdown'); if (drop) drop.classList.add('hidden'); };

document.addEventListener('click', function(e) {
    const n = document.getElementById('notification-dropdown'); if (n && !n.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) n.classList.add('hidden');
    const m = document.getElementById('mention-dropdown'); if (m && !m.classList.contains('hidden') && !e.target.closest('#mention-dropdown')) m.classList.add('hidden');
    const d = document.getElementById('pjt-autocomplete-dropdown'); if (d && !d.classList.contains('hidden') && !e.target.closest('#pjt-autocomplete-dropdown') && !e.target.closest('input[oninput*="showAutocomplete"]')) d.classList.add('hidden');
});

// 💡 3. 4번 오류 해결: 구글 권한 버튼 오류 방지 및 가장 안정적인 CSV 파싱
window.loadNcrData = async function() {
    try {
        const sheetId = '1ZYwSKvT4QXjFxgftunwdRHWzX4KXoelhZSVjauAJg8s';
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

        const res = await fetch(url);
        if (!res.ok) throw new Error("시트 읽기 실패");

        const csvText = await res.text();
        if (csvText.includes('<html')) throw new Error("시트가 비공개 상태입니다. 관리자에게 공유 권한을 요청하세요.");

        const rows = [];
        let row = [], col = "", quote = false;
        
        for (let i = 0; i < csvText.length; i++) {
            let cc = csvText[i], nc = csvText[i+1];
            if (cc === '"' && quote && nc === '"') { col += cc; ++i; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { row.push(col); col = ""; continue; }
            if (cc === '\r' && nc === '\n' && !quote) { row.push(col); rows.push(row); row = []; col = ""; ++i; continue; }
            if (cc === '\n' && !quote) { row.push(col); rows.push(row); row = []; col = ""; continue; }
            if (cc === '\r' && !quote) { row.push(col); rows.push(row); row = []; col = ""; continue; }
            col += cc;
        }
        if (col || row.length > 0) { row.push(col); rows.push(row); }

        if (rows.length < 2) return;

        const headers = rows[0];
        const getIdx = (keywords) => headers.findIndex(h => {
            if (!h) return false;
            const norm = String(h).toLowerCase().replace(/[\s\(\)\[\]_]/g, '');
            return keywords.some(k => norm.includes(k.toLowerCase().replace(/[\s\(\)\[\]_]/g, '')));
        });

        const cPjt = getIdx(['project', 'pjt', '프로젝트']);
        const cNcr = getIdx(['ncrno', 'ncr']);
        const cDate = getIdx(['발생일', 'date']);
        const cDraw = getIdx(['도면번호', '도면', 'drawing']);
        const cPart = getIdx(['파트네임', 'partname', 'part']);
        const cType = getIdx(['유형', 'type']);
        const cDesc = getIdx(['내용', '부적합내용', 'content', 'desc']);
        const cStat = getIdx(['진행', '현황', '상태', 'status']);

        window.ncrData = rows.slice(1).map(r => {
            return {
                pjtCode: cPjt !== -1 && r[cPjt] ? r[cPjt].trim() : '',
                ncrNo: cNcr !== -1 && r[cNcr] ? r[cNcr].trim() : '',
                date: cDate !== -1 && r[cDate] ? r[cDate].trim() : '',
                drawingNo: cDraw !== -1 && r[cDraw] ? r[cDraw].trim() : '',
                partName: cPart !== -1 && r[cPart] ? r[cPart].trim() : '',
                type: cType !== -1 && r[cType] ? r[cType].trim() : '',
                content: cDesc !== -1 && r[cDesc] ? r[cDesc].trim() : '',
                status: cStat !== -1 && r[cStat] ? r[cStat].trim() : ''
            };
        }).filter(n => n.pjtCode);

        window.renderProjectStatusList();

        const modal = document.getElementById('ncr-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const pjtCode = document.getElementById('ncr-project-title').dataset.code;
            if (pjtCode) window.renderNcrList(pjtCode);
        }

        if(window.showToast) window.showToast("부적합(NCR) 데이터 동기화 완료!", "success");
        
        // 성공 시 에러 문구 표시 제거
        const authBtn = document.getElementById('btn-pjt-google-auth');
        if (authBtn && !window.googleAccessToken) {
            authBtn.innerHTML = '<i class="fa-brands fa-google"></i> 구글 연동 필요';
            authBtn.className = 'text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg shadow-sm hover:bg-amber-100 transition-colors whitespace-nowrap ml-2';
        } else if (authBtn && window.googleAccessToken) {
            authBtn.classList.add('hidden');
        }

    } catch(e) {
        console.error("NCR 로드 에러:", e);
        if(window.showToast) window.showToast("NCR 동기화 실패: " + e.message, "error");
        
        // 오류가 발생하더라도 구글 인증 버튼을 덮어쓰지 않음
        const authBtn = document.getElementById('btn-pjt-google-auth');
        if (authBtn && !window.googleAccessToken) {
            authBtn.innerHTML = '<i class="fa-brands fa-google"></i> 구글 연동 필요';
            authBtn.className = 'text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-lg shadow-sm hover:bg-amber-100 transition-colors whitespace-nowrap ml-2';
            authBtn.classList.remove('hidden');
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
    
    const safeTargetCode = String(pjtCode).replace(/\s/g, '').toUpperCase();
    const list = (window.ncrData || []).filter(n => String(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeTargetCode);
    
    let total = list.length, completed = list.filter(n => {
        let s = String(n.status || '');
        return s.includes('완료') || s.includes('종결');
    }).length;
    
    document.getElementById('ncr-total-cnt').innerText = total;
    document.getElementById('ncr-pending-cnt').innerText = total - completed;
    document.getElementById('ncr-comp-cnt').innerText = completed;
    
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-slate-400 font-bold bg-white">등록된 부적합 내역이 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = list.map(n => {
        let s = String(n.status || '');
        const isComp = s.includes('완료') || s.includes('종결');
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

// 💡 일지 관련 파일 업로드 보완
window.updateDailyLogFileName = function() {
    const input = document.getElementById('new-log-image');
    const wrap = document.getElementById('new-log-filename-wrap');
    const nameEl = document.getElementById('new-log-filename');
    if(input && input.files.length > 0) {
        if(nameEl) nameEl.innerText = input.files[0].name;
        if(wrap) wrap.classList.remove('hidden');
    }
};

window.clearDailyLogFile = function(e) {
    if(e) e.stopPropagation();
    const input = document.getElementById('new-log-image');
    const wrap = document.getElementById('new-log-filename-wrap');
    if(input) input.value = '';
    if(wrap) wrap.classList.add('hidden');
};
