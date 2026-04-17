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

window.resizeAndConvertToBase64 = function(file, callback, targetMaxSize) {
    if (!file || !file.type.match(/image.*/)) { callback(null); return; }
    const reader = new FileReader();
    reader.onload = function(readerEvent) {
        const image = new Image();
        image.onload = function() {
            const canvas = document.createElement('canvas');
            const maxSize = targetMaxSize || 1200;
            let width = image.width, height = image.height;
            if (width > height && width > maxSize) { height *= maxSize / width; width = maxSize; } 
            else if (height > maxSize) { width *= maxSize / height; height = maxSize; }
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(image, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.8));
        };
        image.onerror = function() { callback(null); };
        image.src = readerEvent.target.result;
    };
    reader.onerror = function() { callback(null); };
    reader.readAsDataURL(file);
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

const getSafeString = (val) => { return (val === null || val === undefined) ? '' : String(val); };

window.updateMultiFileNames = function(inputEl, displayElId) {
    const displayEl = document.getElementById(displayElId);
    if (!displayEl) return;
    const wrap = document.getElementById(displayElId + '-wrap');
    if (inputEl.files.length === 0) {
        displayEl.innerHTML = '';
        if(wrap) wrap.classList.add('hidden');
    } else if (inputEl.files.length === 1) {
        displayEl.innerHTML = inputEl.files[0].name;
        if(wrap) wrap.classList.remove('hidden');
    } else {
        displayEl.innerHTML = `${inputEl.files[0].name} 외 ${inputEl.files.length - 1}개 파일 첨부됨`;
        if(wrap) wrap.classList.remove('hidden');
    }
};

window.loadCounts = function() {
    try {
        onSnapshot(collection(db, "project_comments"), (snap) => { window.projectCommentCounts = {}; snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectCommentCounts[pid] = (window.projectCommentCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_issues"), (snap) => { window.projectIssueCounts = {}; snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid && !d.isResolved) window.projectIssueCounts[pid] = (window.projectIssueCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "daily_logs"), (snap) => { window.projectLogCounts = {}; snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectLogCounts[pid] = (window.projectLogCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_purchases"), (snap) => { window.projectPurchaseCounts = {}; snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectPurchaseCounts[pid] = (window.projectPurchaseCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_designs"), (snap) => { window.projectDesignCounts = {}; snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectDesignCounts[pid] = (window.projectDesignCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_schedules"), (snap) => { window.projectScheduleCounts = {}; snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectScheduleCounts[pid] = (window.projectScheduleCounts[pid]||0)+1; }); window.renderProjectStatusList(); });
        window.loadNcrData();
    } catch(e) { console.warn("카운트 로드 실패:", e); }
};

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; window.resetAllFilters();
    let btnMfg = document.getElementById('btn-part-mfg'), btnOpt = document.getElementById('btn-part-opt');
    if (btnMfg) btnMfg.className = part === '제조' ? "px-3 py-1 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    if (btnOpt) btnOpt.className = part === '광학' ? "px-3 py-1 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
    window.loadProjectStatusData();
};

window.filterByStatusOnly = function(status) {
    window.currentCategoryFilter = 'all'; window.currentYearFilter = ''; window.currentMonthFilter = ''; window.hideCompletedFilter = false;
    if(document.getElementById('filter-category-select')) document.getElementById('filter-category-select').value = 'all';
    if(document.getElementById('filter-year-select')) document.getElementById('filter-year-select').value = '';
    if(document.getElementById('filter-month-select')) document.getElementById('filter-month-select').value = '';
    if(document.getElementById('hide-completed-cb')) document.getElementById('hide-completed-cb').checked = false;
    window.filterProjectStatus(status);
};

window.filterByCompletedThisMonth = function() {
    window.currentCategoryFilter = 'all'; window.currentYearFilter = ''; window.hideCompletedFilter = false;
    const now = new Date(); const currentMonthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    window.currentMonthFilter = currentMonthStr;
    if(document.getElementById('filter-category-select')) document.getElementById('filter-category-select').value = 'all';
    if(document.getElementById('filter-year-select')) document.getElementById('filter-year-select').value = '';
    if(document.getElementById('filter-month-select')) document.getElementById('filter-month-select').value = currentMonthStr;
    if(document.getElementById('hide-completed-cb')) document.getElementById('hide-completed-cb').checked = false;
    window.filterProjectStatus('completed');
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
window.toggleHideCompleted = function(checked) { window.hideCompletedFilter = checked; window.filterProjectStatus(window.currentStatusFilter); };

window.resetAllFilters = function() {
    window.currentStatusFilter = 'all'; window.currentCategoryFilter = 'all'; window.currentYearFilter = ''; window.currentMonthFilter = ''; window.hideCompletedFilter = false;
    if(document.getElementById('filter-category-select')) document.getElementById('filter-category-select').value = 'all';
    if(document.getElementById('filter-year-select')) document.getElementById('filter-year-select').value = '';
    if(document.getElementById('filter-month-select')) document.getElementById('filter-month-select').value = '';
    if(document.getElementById('hide-completed-cb')) document.getElementById('hide-completed-cb').checked = false;
    window.filterProjectStatus('all');
};

window.getFilteredProjects = function() {
    let list = window.currentProjectStatusList || [];
    if (window.currentCategoryFilter && window.currentCategoryFilter !== 'all') list = list.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
    if (window.currentStatusFilter && window.currentStatusFilter !== 'all') { 
        list = list.filter(item => { 
            if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; 
            return item.status === window.currentStatusFilter; 
        }); 
    }
    if (window.hideCompletedFilter) list = list.filter(item => item.status !== 'completed');
    if (window.currentYearFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentYearFilter) || (item.d_asmEst || '').startsWith(window.currentYearFilter) || (item.d_asmEn || '').startsWith(window.currentYearFilter));
    if (window.currentMonthFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentMonthFilter) || (item.d_asmEst || '').startsWith(window.currentMonthFilter) || (item.d_asmEn || '').startsWith(window.currentMonthFilter));
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
        let lastUpdated = 0; 
        const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
        
        snapshot.forEach(docSnap => { 
            const data = docSnap.data(); 
            let dataPart = getSafeString(data.part).trim() || '제조'; 
            if((targetPart === '광학' && dataPart === '광학') || (targetPart !== '광학' && dataPart !== '광학')) {
                data.id = docSnap.id; 
                window.currentProjectStatusList.push(data); 
            }
            if(getSafeMillis(data.updatedAt) > lastUpdated) lastUpdated = getSafeMillis(data.updatedAt);
        });
        
        if (lastUpdated > 0) { 
            const lDate = new Date(lastUpdated); 
            const el = document.getElementById('pjt-last-update');
            if(el) el.innerText = lDate.getFullYear().toString().slice(2) + '-' + String(lDate.getMonth()+1).padStart(2,'0') + '-' + String(lDate.getDate()).padStart(2,'0') + ' ' + String(lDate.getHours()).padStart(2,'0') + ':' + String(lDate.getMinutes()).padStart(2,'0'); 
        }
        
        window.updateMiniDashboard();
        if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
        else if(window.currentProjDashView === 'calendar') window.renderProjCalendar();
        else window.renderProjectStatusList();
    });
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); 
    if(!tbody) return;
    
    let displayList = window.getFilteredProjects();
    if(displayList.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="33" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">프로젝트가 없습니다.</td></tr>'; 
        return; 
    }
    
    const statusMap = { 
        'pending': '<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200 whitespace-nowrap">대기/보류</span>', 
        'progress': '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200 whitespace-nowrap">진행(제작)</span>', 
        'inspecting': '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200 whitespace-nowrap">진행(검수)</span>', 
        'completed': '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200 whitespace-nowrap">완료(출하)</span>', 
        'rejected': '<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200 whitespace-nowrap">보류/불가</span>' 
    };
    
    let htmlStr = '';
    displayList.forEach(item => {
        const cMd = parseFloat(item.currentMd) || 0, oMd = parseFloat(item.outMd) || 0, fMd = parseFloat(item.finalMd) || (cMd + oMd);
        const safeNameHtml = getSafeString(item.name).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeNameJs = getSafeString(item.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        
        const cCnt = (window.projectCommentCounts && window.projectCommentCounts[item.id]) || 0;
        const iCnt = (window.projectIssueCounts && window.projectIssueCounts[item.id]) || 0;
        const lCnt = (window.projectLogCounts && window.projectLogCounts[item.id]) || 0;
        const purCnt = (window.projectPurchaseCounts && window.projectPurchaseCounts[item.id]) || 0;
        const desCnt = (window.projectDesignCounts && window.projectDesignCounts[item.id]) || 0;
        const schCnt = (window.projectScheduleCounts && window.projectScheduleCounts[item.id]) || 0;

        const safeItemCode = getSafeString(item.code).replace(/\s/g, '').toUpperCase();
        const pjtNcrData = (window.ncrData || []).filter(n => getSafeString(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeItemCode);
        
        const totalNcrCnt = pjtNcrData.length;
        const unresolvedNcrCnt = pjtNcrData.filter(n => {
            let s = getSafeString(n.status);
            return !(s.includes('완료') || s.includes('종결') || s.includes('완료됨'));
        }).length;

        let ncrIconHtml = '';
        if (totalNcrCnt === 0) ncrIconHtml = `<button onclick="window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-slate-300 hover:text-indigo-400 transition-colors p-1" title="부적합 내역 없음"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
        else if (unresolvedNcrCnt === 0) ncrIconHtml = `<button onclick="window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-emerald-500 hover:text-emerald-600 transition-colors p-1" title="모두 조치 완료"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
        else ncrIconHtml = `<button onclick="window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-rose-500 relative transition-transform hover:scale-110 p-1" title="미결 부적합 ${unresolvedNcrCnt}건"><i class="fa-solid fa-file-circle-exclamation text-lg"></i><span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${unresolvedNcrCnt}</span></button>`;

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
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}')" class="text-sky-400 relative"><i class="fa-solid fa-book text-lg"></i>${lCnt ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-sky-200">${lCnt}</span>` : ''}</button></td>`;
        
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">${ncrIconHtml}</td>`;

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
        
        let crBtnHtml = '';
        if (item.status === 'completed') {
            crBtnHtml = `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200">송부완료</span>`;
        } else {
            crBtnHtml = `<button onclick="event.stopPropagation(); window.openCrReqModal('${item.id}', '${safeNameJs}')" class="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white px-2 py-1 rounded border border-rose-200 transition-colors shadow-sm whitespace-nowrap">완료요청</button>`;
        }
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${crBtnHtml}</td>`;
        trHtml += `</tr>`;
        htmlStr += trHtml;
    });
    tbody.innerHTML = htmlStr;
};

// 💡 엑스박스 완벽 방지, 썸네일 고화질 매핑 HTML 렌더러
window.generateMediaHtml = function(filesArray) {
    if (!filesArray || filesArray.length === 0) return '';
    let mediaHtml = ''; let filesHtml = '';
    
    filesArray.forEach(f => {
        let isImg = false;
        if (f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp|heic|heif)$/i)) isImg = true;
        if (f.url && f.url.startsWith('data:image')) isImg = true;
        if (f.thumbBase64 && f.thumbBase64.startsWith('data:image')) isImg = true;
        if (f.name === '첨부사진.jpg' || f.name === '첨부사진') isImg = true;

        if (isImg) {
            let viewUrl = f.url, thumbUrl = f.url;
            let fileIdMatch = f.url ? f.url.match(/\/d\/(.+?)\/view/) : null;
            if (fileIdMatch) {
                viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                thumbUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w600`;
            }
            if (f.thumbBase64 && f.thumbBase64.startsWith('data:image')) thumbUrl = f.thumbBase64;

            mediaHtml += `<div class="relative overflow-hidden rounded-lg border border-slate-200 shadow-sm cursor-pointer group w-32 h-32 bg-slate-100 flex items-center justify-center" onclick="window.openImageViewer('${viewUrl}')">`;
            if (thumbUrl && (thumbUrl.startsWith('data:') || thumbUrl.includes('drive.google.com/thumbnail'))) {
                mediaHtml += `<img src="${thumbUrl}" alt="${f.name || '이미지'}" class="w-full h-full object-cover group-hover:scale-110 transition-transform" onerror="this.outerHTML='<div class=\\'flex flex-col items-center justify-center text-slate-400 w-full h-full\\'><i class=\\'fa-regular fa-image text-3xl mb-1\\'></i><span class=\\'text-[10px] font-bold\\'>사진보기</span></div>';">`;
            } else {
                mediaHtml += `<div class="flex flex-col items-center justify-center text-slate-400 group-hover:text-indigo-500 transition-colors w-full h-full"><i class="fa-regular fa-image text-3xl mb-1"></i><span class="text-[10px] font-bold">사진보기</span></div>`;
            }
            mediaHtml += `<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"><i class="fa-solid fa-magnifying-glass-plus text-xl"></i></div></div>`;
        } else {
            filesHtml += `<a href="${f.url}" target="_blank" class="text-xs text-sky-500 font-bold underline flex items-center gap-1 w-fit"><i class="fa-solid fa-file-arrow-down"></i> ${f.name}</a>`;
        }
    });

    let result = '';
    if (mediaHtml) result += `<div class="flex flex-wrap gap-2 mt-3">${mediaHtml}</div>`;
    if (filesHtml) result += `<div class="flex flex-col gap-1 mt-2">${filesHtml}</div>`;
    return result;
};


window.openCrReqModal = function(id, title) {
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerHTML = val; };

    setVal('cr-req-pjt-id', id);
    setHtml('cr-req-project-title', title);
    setVal('cr-req-good', '');
    setVal('cr-req-bad', '');
    setVal('cr-req-spec-file', '');
    setHtml('cr-req-spec-names', '');
    setVal('cr-req-design-file', '');
    setHtml('cr-req-design-names', '');
    
    const modal = document.getElementById('cr-req-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeCrReqModal = function() {
    const modal = document.getElementById('cr-req-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.submitCrReq = async function() {
    const pIdEl = document.getElementById('cr-req-pjt-id');
    const goodTxtEl = document.getElementById('cr-req-good');
    const badTxtEl = document.getElementById('cr-req-bad');
    const btn = document.getElementById('btn-cr-req-save');

    if(!pIdEl || !goodTxtEl || !badTxtEl || !btn) return;

    const pId = pIdEl.value;
    const goodTxt = goodTxtEl.value.trim();
    const badTxt = badTxtEl.value.trim();

    if(!goodTxt && !badTxt) return window.showToast("Good Point 또는 Bad Point를 작성해주세요.", "warning");
    if(!confirm("완료요청을 송부하시겠습니까?\n프로젝트 상태가 '완료'로 변경되며 품질/구매팀에 전달됩니다.")) return;

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 처리중...';
    btn.disabled = true;

    try {
        const batch = writeBatch(db);
        const pjtRef = doc(db, "projects_status", pId);
        const pjtSnap = await getDoc(pjtRef);
        const pjtData = pjtSnap.exists() ? pjtSnap.data() : {};
        
        let specFiles = [], designFiles = [];
        const specInput = document.getElementById('cr-req-spec-file');
        const designInput = document.getElementById('cr-req-design-file');
        
        if (specInput && specInput.files.length > 0) {
            let total = specInput.files.length;
            for(let i=0; i < total; i++) {
                let url = await handleDriveUploadWithProgress(specInput.files[i], pjtData.code || pjtData.name, '완료보고', i+1, total);
                specFiles.push({ name: specInput.files[i].name, url: url });
            }
        }
        if (designInput && designInput.files.length > 0) {
            let total = designInput.files.length;
            for(let i=0; i < total; i++) {
                let url = await handleDriveUploadWithProgress(designInput.files[i], pjtData.code || pjtData.name, '완료보고', i+1, total);
                designFiles.push({ name: designInput.files[i].name, url: url });
            }
        }

        batch.update(pjtRef, { status: 'completed', d_shipEn: window.getLocalDateStr(new Date()), updatedAt: Date.now() });

        const crRef = doc(collection(db, "project_completion_reports"));
        const crLessons = [];
        if(goodTxt) crLessons.push({ type: 'Good', category: '제작', item: '제조팀 코멘트', highlight: goodTxt, lowlight: '' });
        if(badTxt) crLessons.push({ type: 'Bad', category: '제작', item: '제조팀 코멘트', highlight: '', lowlight: badTxt });

        batch.set(crRef, {
            projectId: pId, lessons: crLessons, comments: "제조팀 완료 요청으로 자동 생성됨",
            internalSch: { start: '', end: '', status: '미진행' }, customerSch: { start: '', end: '', status: '미진행' },
            specFiles: specFiles, designFiles: designFiles, authorUid: window.currentUser?.uid || 'system',
            authorName: window.userProfile?.name || '시스템', createdAt: Date.now(), updatedAt: Date.now()
        });

        const costRef = doc(collection(db, "product_costs"));
        batch.set(costRef, { projectId: pId, status: '분석 대기', createdAt: Date.now() });
        
        await batch.commit();

        if (window.notifyUser) {
            const title = pjtData.name || '알수없는 프로젝트';
            const msg = `[${title}] 제조 완료 및 품질 완료보고 요청이 접수되었습니다.\n\nGood Point:\n${goodTxt}\n\nBad Point:\n${badTxt}`;
            const targetTeams = ['품질경영팀', '전략구매팀'];
            if (window.allSystemUsers) {
                const targets = window.allSystemUsers.filter(u => targetTeams.includes(u.team));
                for(let u of targets) await window.notifyUser(u.name, msg, pId, "완료요청");
            }
        }
        window.showToast("완료요청 송부 완료", "success");
        window.closeCrReqModal();
    } catch(e) { window.showToast("송부 중 오류가 발생했습니다.", "error");
    } finally { btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 완료요청 송부'; btn.disabled = false; }
};

// 💡 프로젝트 입력 폼 안정성 강화 (수정/등록 클릭 시 무반응 에러 방지)
window.openProjStatusWriteModal = function() {
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    
    setVal('ps-id', '');
    setVal('ps-code', '');
    setVal('ps-name', '');
    setVal('ps-company', '');
    setVal('ps-part', window.currentProjPartTab || '제조');
    setVal('ps-category', '');
    setVal('ps-status', 'pending');
    setVal('ps-progress-pct', '0');
    
    const members = window.teamMembers || [];
    const mHtml = '<option value="">선택</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
    
    const managerSelect = document.getElementById('ps-manager'); 
    if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); 
    if(memberSelect) memberSelect.innerHTML = mHtml;

    const dateFields = ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en', 'ps-d-asm-end-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-set-st', 'ps-d-set-en'];
    dateFields.forEach(id => setVal(id, ''));
    
    window.currentSelectedMembers = [];
    window.renderSelectedMembers();

    const btnHistory = document.getElementById('btn-view-history');
    if (btnHistory) btnHistory.classList.add('hidden'); 
    
    const modal = document.getElementById('proj-status-write-modal');
    if(modal) { 
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
    }
};

window.closeProjStatusWriteModal = function() {
    const modal = document.getElementById('proj-status-write-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.editProjStatus = function(id) {
    const item = (window.currentProjectStatusList || []).find(p => p.id === id); 
    if(!item) return;
    
    const members = window.teamMembers || [];
    const mHtml = '<option value="">선택</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    
    setVal('ps-id', item.id);
    setVal('ps-code', item.code || '');
    setVal('ps-name', item.name || '');
    setVal('ps-company', item.company || '');
    setVal('ps-part', item.part || '제조');
    setVal('ps-category', item.category || '');
    setVal('ps-status', item.status || 'pending');
    setVal('ps-progress-pct', item.progress !== undefined ? item.progress : 0);
    
    const managerSelect = document.getElementById('ps-manager'); 
    if(managerSelect) {
        managerSelect.innerHTML = mHtml;
        managerSelect.value = item.manager || '';
    }
    const memberSelect = document.getElementById('ps-member-add'); 
    if(memberSelect) memberSelect.innerHTML = mHtml;

    window.currentSelectedMembers = item.members ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; 
    window.renderSelectedMembers();
    
    setVal('ps-est-md', item.estMd !== undefined ? item.estMd : '');
    setVal('ps-current-md', item.currentMd !== undefined ? item.currentMd : '');
    
    const cMd = parseFloat(item.currentMd) || 0; 
    const oMd = parseFloat(item.outMd) || 0; 
    setVal('ps-final-md', (cMd + oMd).toFixed(1));
    
    setVal('ps-tot-pers', item.totPers !== undefined ? item.totPers : '');
    setVal('ps-out-pers', item.outPers !== undefined ? item.outPers : '');
    setVal('ps-out-md', item.outMd !== undefined ? item.outMd : '');
    
    const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
    for (const [key, elementId] of Object.entries(dateMappings)) { 
        setVal(elementId, item[key] || '');
    }
    
    const btnHistory = document.getElementById('btn-view-history');
    if (btnHistory) btnHistory.classList.remove('hidden'); 
    
    const modal = document.getElementById('proj-status-write-modal');
    if(modal) { 
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
    }
};

window.saveProjStatus = async function(btn) {
    try {
        if(btn) { btn.disabled = true; btn.innerHTML = '저장중...'; }
        
        const idEl = document.getElementById('ps-id');
        const codeEl = document.getElementById('ps-code');
        const nameEl = document.getElementById('ps-name');
        
        if(!codeEl || !nameEl) return;

        const id = idEl.value; 
        const code = codeEl.value; 
        const name = nameEl.value;
        
        if(!code || !name) { 
            if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; } 
            return window.showToast("코드와 이름을 입력하세요.", "error"); 
        }

        const currentMdEl = document.getElementById('ps-current-md');
        const outMdEl = document.getElementById('ps-out-md');
        const currentMd = currentMdEl ? (parseFloat(currentMdEl.value) || 0) : 0; 
        const outMd = outMdEl ? (parseFloat(outMdEl.value) || 0) : 0;
        
        const getVal = (eid) => { const el = document.getElementById(eid); return el ? el.value : ''; };

        const data = { 
            code: code, name: name, 
            company: getVal('ps-company'), part: getVal('ps-part') || '제조', category: getVal('ps-category'), 
            status: getVal('ps-status') || 'pending', progress: parseInt(getVal('ps-progress-pct')) || 0, 
            manager: getVal('ps-manager'), members: getVal('ps-members'), 
            estMd: parseFloat(getVal('ps-est-md')) || 0, outMd: outMd, finalMd: currentMd + outMd, 
            totPers: parseInt(getVal('ps-tot-pers'))||0, outPers: parseInt(getVal('ps-out-pers'))||0, 
            updatedAt: Date.now() 
        };
        
        const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
        for (const [key, elementId] of Object.entries(dateMappings)) { 
            data[key] = getVal(elementId); 
        }

        if(id) { 
            const oldSnap = await getDoc(doc(db, "projects_status", id));
            if(oldSnap.exists()) {
                await addDoc(collection(db, "project_history"), { projectId: id, snapshot: oldSnap.data(), changedBy: window.userProfile.name, changedAt: Date.now() });
            }
            await setDoc(doc(db, "projects_status", id), data, { merge: true }); 
            window.showToast("수정되었습니다."); 
        } else { 
            data.createdAt = Date.now(); data.currentMd = 0; 
            await addDoc(collection(db, "projects_status"), data); 
            window.showToast("등록되었습니다."); 
            if (window.googleAccessToken) {
                const folderName = data.code ? data.code : data.name;
                window.getOrCreateDriveFolder(folderName, TARGET_DRIVE_FOLDER).catch(e => console.warn("자동 폴더 생성 실패", e));
            }
        } 
        
        window.closeProjStatusWriteModal(); 
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    } catch(error) {
        window.showToast("오류 발생: " + error.message, "error");
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    }
};

window.deleteProjStatus = async function(id) { 
    if(!confirm("삭제하시겠습니까?")) return; 
    try { await deleteDoc(doc(db, "projects_status", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } 
};

window.calcFinalMd = function() { 
    const curMdEl = document.getElementById('ps-current-md');
    const outMdEl = document.getElementById('ps-out-md');
    const finalMdEl = document.getElementById('ps-final-md');
    if(curMdEl && outMdEl && finalMdEl) {
        const curMd = parseFloat(curMdEl.value) || 0; 
        const outMd = parseFloat(outMdEl.value) || 0; 
        finalMdEl.value = (curMd + outMd).toFixed(1); 
    }
};

window.addProjectMember = function(name) { 
    if(!name) return; 
    if(!window.currentSelectedMembers.includes(name)) { 
        window.currentSelectedMembers.push(name); 
        window.renderSelectedMembers(); 
    } 
    const el = document.getElementById('ps-member-add');
    if(el) el.value = ''; 
};

window.removeProjectMember = function(name) { 
    window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); 
    window.renderSelectedMembers(); 
};

window.renderSelectedMembers = function() { 
    const container = document.getElementById('ps-selected-members'); 
    const memInput = document.getElementById('ps-members');
    if(memInput) memInput.value = window.currentSelectedMembers.join(', '); 
    if(container) {
        container.innerHTML = window.currentSelectedMembers.map(function(name) {
            return `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`;
        }).join(''); 
    }
};

window.openProjHistoryModal = function() {
    const el = document.getElementById('ps-id');
    if(!el) return;
    const projectId = el.value;
    if(!projectId) return;
    
    const modal = document.getElementById('proj-history-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        window.loadProjectHistory(projectId);
    }
};

window.closeProjHistoryModal = function() {
    const modal = document.getElementById('proj-history-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.loadProjectHistory = async function(projectId) {
    const listEl = document.getElementById('proj-history-list');
    if(!listEl) return;
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
            historyHtml += `<li class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                                <div>
                                    <div class="font-black text-sm text-slate-700">${dateStr}</div>
                                    <div class="text-[11px] text-slate-500 mt-1">변경자: <span class="font-bold text-indigo-600">${h.changedBy}</span></div>
                                </div>
                                <button onclick="window.restoreProjectHistory('${h.id}', '${projectId}')" class="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm"><i class="fa-solid fa-rotate-left"></i> 이 시점으로 복원</button>
                            </li>`;
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
    if(activeBtn) {
        activeBtn.className = "px-2 py-1 text-[11px] font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-colors whitespace-nowrap";
    }
    
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
        
        const today = new Date(); 
        today.setHours(0,0,0,0);
        
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

        let html = `<div class="relative min-w-max h-full min-h-[500px]" style="width: ${totalDays * dayWidth + 300}px">`;
        
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); 
            d.setDate(d.getDate() + i);
            let dStr = window.getLocalDateStr(d);
            if(dStr === todayStr) todayOffset = i * dayWidth; 
        }
        
        window.ganttTodayOffset = todayOffset;

        if(todayOffset >= 0) {
            html += `<div class="absolute top-0 w-[2px] bg-rose-500 z-[100] pointer-events-none shadow-sm" style="left: ${300 + todayOffset + (dayWidth/2)}px; height:100%; bottom:0;"><div class="absolute top-10 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-md font-bold whitespace-nowrap border border-white">오늘</div></div>`;
        }

        html += `<div class="flex border-b border-slate-200 sticky top-0 bg-white z-50 shadow-sm"><div class="w-[300px] flex-shrink-0 p-3 font-bold text-xs text-slate-700 bg-slate-50 border-r border-slate-200 flex items-center sticky left-0 z-50"><div class="w-[100px] text-indigo-600">PJT 코드</div><div class="w-[200px]">프로젝트명</div></div>`;
        
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); 
            d.setDate(d.getDate() + i);
            let dStr = window.getLocalDateStr(d);
            let bgClass = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50' : 'bg-white'; 
            let textClass = d.getDay() === 0 ? 'text-rose-500' : (d.getDay() === 6 ? 'text-blue-500' : 'text-slate-500');
            if (dStr === todayStr) { bgClass = 'bg-rose-50'; textClass = 'text-rose-600 font-black'; }
            
            let dateText = (d.getDate() === 1 || i === 0) ? `<div class="text-[8px] font-black bg-slate-200 text-slate-600">${d.getMonth()+1}월</div>` : `<div class="text-[8px] font-bold bg-slate-100 text-transparent select-none">-</div>`;
            html += `<div class="w-[${dayWidth}px] flex-shrink-0 text-center border-r border-slate-100 ${bgClass} flex flex-col justify-center relative">${dateText}<div class="text-[10px] font-bold ${textClass} py-1">${d.getDate()}</div></div>`;
        }
        
        html += `</div><div class="relative w-full h-full min-h-full" style="min-height: 400px;">`;

        displayList.forEach(function(p) {
            const safeNameHtml = String(p.name||'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); 
            const safeCodeStr = p.code || '-';
            
            html += `<div class="flex border-b border-slate-100 relative group cursor-pointer hover:bg-slate-50 transition-colors" onclick="window.editProjStatus('${p.id}')">`;
            
            html += `<div class="w-[300px] flex-shrink-0 p-2 text-[11px] font-bold text-slate-700 border-r border-slate-200 bg-white group-hover:bg-slate-50 z-40 sticky left-0 flex items-center transition-colors" title="${safeNameHtml}"><div class="w-[100px] text-indigo-600 truncate font-black pr-1">${safeCodeStr}</div><div class="w-[200px] truncate">${safeNameHtml}</div></div>`;
            
            html += `<div class="flex relative" style="width: ${totalDays * dayWidth}px">`;
            
            for(let i=0; i<totalDays; i++) { 
                let d = new Date(minDate); 
                d.setDate(d.getDate() + i); 
                let bgStr = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50/50' : '';
                html += `<div class="w-[${dayWidth}px] flex-shrink-0 border-r border-slate-50 ${bgStr} h-12"></div>`; 
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
                return `<div class="absolute ${yOffset} h-[14px] rounded-sm ${colorClass} text-[8px] flex items-center justify-center font-bold shadow-sm overflow-hidden whitespace-nowrap opacity-90 hover:opacity-100 hover:scale-y-110 transition-all cursor-pointer z-10" style="left: ${leftOffset}px; width: ${width}px;" title="${label}: ${start} ~ ${end||start}"></div>`;
            };
            
            const drawPoint = function(dateStr, colorClass, label, yOffset) {
                if(!dateStr) return ''; 
                let d = new Date(dateStr); 
                if(isNaN(d.getTime())) return '';
                let leftOffset = Math.floor((d - minDate) / (1000 * 60 * 60 * 24)) * dayWidth;
                return `<div class="absolute ${yOffset} w-3 h-3 rounded-sm transform rotate-45 shadow-sm border-2 z-20 ${colorClass}" style="left: ${leftOffset + dayWidth/2 - 6}px;" title="${label}: ${dateStr}"></div>`;
            }
            
            html += drawBar(p.d_asmEst, p.d_asmEndEst, 'bg-white border-2 border-indigo-400 border-dashed text-indigo-700', '조립(예정)', 'top-1');
            html += drawBar(p.d_asmSt, p.d_asmEn, 'bg-indigo-600 text-white', '조립(실제)', 'top-1/2 -translate-y-1/2'); 
            html += drawBar(p.d_insSt, p.d_insEn, 'bg-teal-500 text-white', '검수', 'top-1/2 -translate-y-1/2'); 
            html += drawBar(p.d_setSt, p.d_setEn, 'bg-slate-600 text-white', 'Setup', 'top-1/2 -translate-y-1/2');
            html += drawPoint(p.d_shipEst, 'bg-white border-rose-400', '출하(예정)', 'top-1');
            html += drawPoint(p.d_shipEn, 'bg-rose-500 border-white', '출하(실제)', 'top-1/2 -translate-y-1/2');
            
            html += `</div></div>`;
        });
        
        html += `</div></div>`; 
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
        
        let html = `<div class="flex justify-between items-center mb-4">
                        <div class="flex items-center gap-4">
                            <button onclick="window.changeCalendarMonth(-1)" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><i class="fa-solid fa-chevron-left"></i></button>
                            <h3 class="text-lg font-black text-indigo-800 w-32 text-center">${year}년 ${month + 1}월</h3>
                            <button onclick="window.changeCalendarMonth(1)" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><i class="fa-solid fa-chevron-right"></i></button>
                            <button onclick="window.calendarCurrentDate = new Date(); window.renderProjCalendar();" class="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold hover:bg-indigo-100 transition-colors border border-indigo-200">이번 달</button>
                        </div>
                        <div class="flex gap-2 text-[10px] font-bold">
                            <span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200">조립진행</span>
                            <span class="bg-rose-100 text-rose-700 px-2 py-1 rounded border border-rose-200">출하예정</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 mb-2">
                        <div class="text-rose-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="text-blue-500">토</div>
                    </div>
                    <div class="grid grid-cols-7 gap-1 auto-rows-fr">`;
        
        for(let i=0; i<firstDay; i++) { 
            html += `<div class="min-h-[100px] bg-slate-50 rounded-lg border border-slate-100"></div>`; 
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
                    dayEvents += `<div class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm hover:scale-[1.02] transition-transform" onclick="window.editProjStatus('${p.id}')" title="${safeNameHtml}">${safeCodeStr} 조립</div>`;
                }
                
                if(p.d_shipEn === currentDateStr || (!p.d_shipEn && p.d_shipEst === currentDateStr)) { 
                    dayEvents += `<div class="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm hover:scale-[1.02] transition-transform" onclick="window.editProjStatus('${p.id}')" title="${safeNameHtml}">${safeCodeStr} 출하</div>`; 
                }
            });
            
            const isToday = (isCurrentMonth && date === today.getDate());
            const badge = isToday ? `<span class="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto shadow-md">${date}</span>` : date;
            const borderClass = isToday ? 'border-indigo-400 bg-indigo-50/10' : 'border-slate-200';
            
            html += `<div class="min-h-[100px] bg-white rounded-lg border ${borderClass} p-1 hover:bg-slate-50 transition-colors"><div class="text-xs font-bold text-slate-700 mb-1 text-center">${badge}</div><div class="flex flex-col gap-0.5 overflow-hidden">${dayEvents}</div></div>`;
        }
        
        html += `</div>`; 
        container.innerHTML = html;
    } catch(e) {}
};

window.loadNcrData = async function() {
    try {
        if(window.showToast) window.showToast("부적합(RAWDATA) 데이터를 가져오는 중입니다...", "success");
        
        const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYwsWjs8ox503LLsRIeVRbbZ4R7eLgoq0C-ZdYIBIUACCwWyt5oYkAAtIpX9j1taqt1MQaEg1Jjom0/pub?gid=0&single=true&output=csv';
        const separator = csvUrl.includes('?') ? '&' : '?';
        const res = await fetch(csvUrl + separator + 't=' + Date.now());
        
        if (!res.ok) throw new Error("시트 데이터를 가져오지 못했습니다.");

        const csvText = await res.text();
        if (csvText.includes('<html') || csvText.includes('<body')) {
            throw new Error("링크 형식이 잘못되었습니다. (웹에 게시에서 .csv 링크인지 확인해주세요)");
        }

        const rows = [];
        let row = [], col = "", quote = false;
        
        for (let i = 0; i < csvText.length; i++) {
            let cc = csvText[i], nc = csvText[i+1];
            if (cc === '"' && quote && nc === '"') { col += cc; ++i; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { row.push(col); col = ""; continue; }
            if ((cc === '\r' || cc === '\n') && !quote) {
                if (row.length > 0 || col !== "") {
                    row.push(col); rows.push(row); row = []; col = "";
                }
                if (cc === '\r' && nc === '\n') i++;
                continue;
            }
            col += cc;
        }
        if (col !== "" || row.length > 0) { row.push(col); rows.push(row); }

        let dataStartIndex = 1;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            if (rows[i][0] && String(rows[i][0]).includes('NCR No')) {
                dataStartIndex = i + 1;
                break;
            }
        }

        window.ncrData = rows.slice(dataStartIndex).map(r => {
            return {
                ncrNo: r[0] ? getSafeString(r[0]).trim() : '',      
                date: r[1] ? getSafeString(r[1]).trim() : '',       
                pjtCode: r[2] ? getSafeString(r[2]).trim() : '',    
                partName: r[3] ? getSafeString(r[3]).trim() : '',   
                drawingNo: r[4] ? getSafeString(r[4]).trim() : '',  
                type: r[12] ? getSafeString(r[12]).trim() : '',     
                content: r[13] ? getSafeString(r[13]).trim() : '',  
                status: r[15] ? getSafeString(r[15]).trim() : ''    
            };
        }).filter(n => n.pjtCode !== ''); 

        if (window.ncrData.length === 0) {
            if(window.showToast) window.showToast("RAWDATA 시트에서 데이터를 찾을 수 없습니다.", "warning");
        } else {
            if(window.showToast) window.showToast(`부적합(NCR) 데이터 ${window.ncrData.length}건 동기화 완료!`, "success");
        }

        window.renderProjectStatusList();

        const modal = document.getElementById('ncr-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const titleEl = document.getElementById('ncr-project-title');
            if (titleEl && titleEl.dataset.code) {
                window.renderNcrList(titleEl.dataset.code);
            }
        }

    } catch(e) {
        console.error("NCR 로드 에러:", e);
        if(window.showToast) window.showToast(`동기화 실패: ${e.message}`, "error");
    }
};

window.openNcrModal = function(pjtCode, pjtName) {
    const titleEl = document.getElementById('ncr-project-title');
    if (titleEl) {
        titleEl.innerText = `[${getSafeString(pjtCode)}] ${getSafeString(pjtName)}`;
        titleEl.dataset.code = getSafeString(pjtCode);
    }
    document.getElementById('ncr-modal').classList.remove('hidden');
    document.getElementById('ncr-modal').classList.add('flex');
    window.renderNcrList(pjtCode);
};

window.closeNcrModal = function() {
    document.getElementById('ncr-modal').classList.add('hidden');
    document.getElementById('ncr-modal').classList.remove('flex');
};

window.renderNcrList = function(pjtCode) {
    const tbody = document.getElementById('ncr-list-tbody');
    if (!tbody) return;
    
    const safeTargetCode = getSafeString(pjtCode).replace(/\s/g, '').toUpperCase();
    const list = (window.ncrData || []).filter(n => getSafeString(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeTargetCode);
    
    let total = list.length;
    let completed = list.filter(n => {
        let s = getSafeString(n.status);
        return s.includes('완료') || s.includes('종결');
    }).length;
    
    const elTotal = document.getElementById('ncr-total-cnt');
    if(elTotal) elTotal.innerText = total;
    
    const elPending = document.getElementById('ncr-pending-cnt');
    if(elPending) elPending.innerText = total - completed;
    
    const elComp = document.getElementById('ncr-comp-cnt');
    if(elComp) elComp.innerText = completed;
    
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-slate-400 font-bold bg-white">등록된 부적합 내역이 없습니다.</td></tr>';
        return;
    }
    
    tbody.innerHTML = list.map(n => {
        let s = getSafeString(n.status);
        const isComp = s.includes('완료') || s.includes('종결');
        const textClass = isComp ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700';
        const badge = isComp ? `<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">완료</span>` : `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">진행중</span>`;
        
        return `<tr class="hover:bg-slate-50 transition-colors bg-white border-b border-slate-100">
                    <td class="p-3 text-center font-bold text-slate-500 whitespace-nowrap">${getSafeString(n.ncrNo) || '-'}</td>
                    <td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.date) || '-'}</td>
                    <td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.drawingNo) || '-'}</td>
                    <td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.partName) || '-'}</td>
                    <td class="p-3 text-center whitespace-nowrap"><span class="bg-slate-100 px-2 py-1 border border-slate-200 rounded font-bold">${getSafeString(n.type) || '-'}</span></td>
                    <td class="p-3 font-medium ${textClass} break-all">${getSafeString(n.content).replace(/</g, '&lt;').replace(/>/g, '&gt;') || '-'}</td>
                    <td class="p-3 text-center whitespace-nowrap">${badge}</td>
                </tr>`;
    }).join('');
};
