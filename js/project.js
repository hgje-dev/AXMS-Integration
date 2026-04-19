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

window.checkPjtWritePermission = function(type, managerName) {
    const user = window.userProfile;
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'master') return true;
    if (managerName && user.name === managerName) return true;
    const perms = user.permissions || {};
    switch(type) {
        case 'status': return !!perms['pjt-w-status'];
        case 'purchase': return !!perms['pjt-w-pur'];
        case 'design': return !!perms['pjt-w-des'];
        case 'schedule': return !!perms['pjt-w-sch'];
        case 'daily-log': return !!perms['pjt-w-log'];
        default: return false;
    }
};

window.toggleFreezeCol = function(checked) {
    const table = document.getElementById('proj-main-table');
    if(table) {
        if(checked) table.classList.add('freeze-col');
        else table.classList.remove('freeze-col');
    }
};

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
        if(window.loadNcrData) window.loadNcrData();
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
    if(window.currentProjDashView === 'gantt') { if(window.renderProjGantt) window.renderProjGantt(); }
    else if(window.currentProjDashView === 'calendar') { if(window.renderProjCalendar) window.renderProjCalendar(); }
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
    
    const btnCreate = document.getElementById('btn-create-proj');
    if (btnCreate) {
        if (window.checkPjtWritePermission('status')) btnCreate.classList.remove('hidden');
        else btnCreate.classList.add('hidden');
    }
    
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
        if(window.currentProjDashView === 'gantt') { if(window.renderProjGantt) window.renderProjGantt(); }
        else if(window.currentProjDashView === 'calendar') { if(window.renderProjCalendar) window.renderProjCalendar(); }
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
        if (totalNcrCnt === 0) ncrIconHtml = `<button onclick="window.openNcrModal('${safeItemCode}', '${safeNameJs}')" class="text-slate-300 hover:text-indigo-400 transition-colors p-1" title="부적합 내역 없음"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
        else if (unresolvedNcrCnt === 0) ncrIconHtml = `<button onclick="window.openNcrModal('${safeItemCode}', '${safeNameJs}')" class="text-emerald-500 hover:text-emerald-600 transition-colors p-1" title="모두 조치 완료"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
        else ncrIconHtml = `<button onclick="window.openNcrModal('${safeItemCode}', '${safeNameJs}')" class="text-rose-500 relative transition-transform hover:scale-110 p-1" title="미결 부적합 ${unresolvedNcrCnt}건"><i class="fa-solid fa-file-circle-exclamation text-lg"></i><span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${unresolvedNcrCnt}</span></button>`;

        let trHtml = `<tr class="group hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50">${getSafeString(item.category)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${iCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-bold text-indigo-700 bg-white group-hover:bg-indigo-50/50">${getSafeString(item.code)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 truncate max-w-[220px] bg-white group-hover:bg-indigo-50/50">${safeNameHtml}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center truncate max-w-[110px] bg-white group-hover:bg-indigo-50/50">${getSafeString(item.company)}</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-black text-emerald-600 bg-white group-hover:bg-indigo-50/50">${parseFloat(item.progress) || 0}%</td>`;
        trHtml += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50">${statusMap[item.status] || ''}</td>`;
        
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
    
    const canWrite = window.checkPjtWritePermission('status');
    const btnSave = document.getElementById('btn-proj-save');
    const banner = document.getElementById('ps-readonly-banner');
    
    if (!canWrite) {
        if(btnSave) btnSave.classList.add('hidden');
        if(banner) banner.classList.remove('hidden');
        document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = true);
    } else {
        if(btnSave) btnSave.classList.remove('hidden');
        if(banner) banner.classList.add('hidden');
        document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = false);
        const curMdEl = document.getElementById('ps-current-md'); if (curMdEl) curMdEl.disabled = true;
        const finalMdEl = document.getElementById('ps-final-md'); if (finalMdEl) finalMdEl.disabled = true;
    }

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
    
    const canWrite = window.checkPjtWritePermission('status', item.manager);
    const btnSave = document.getElementById('btn-proj-save');
    const banner = document.getElementById('ps-readonly-banner');
    
    if (!canWrite) {
        if(btnSave) btnSave.classList.add('hidden');
        if(banner) banner.classList.remove('hidden');
        document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = true);
    } else {
        if(btnSave) btnSave.classList.remove('hidden');
        if(banner) banner.classList.add('hidden');
        document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = false);
        const curMdEl = document.getElementById('ps-current-md'); if (curMdEl) curMdEl.disabled = true;
        const finalMdEl = document.getElementById('ps-final-md'); if (finalMdEl) finalMdEl.disabled = true;
    }
    
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
    const canWrite = window.checkPjtWritePermission('status');
    if (!canWrite) return window.showToast('복원할 권한이 없습니다.', 'error');

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
    
    const listC = document.getElementById('proj-dash-list-container');
    const ganttC = document.getElementById('proj-dash-gantt-container');
    const calC = document.getElementById('proj-dash-calendar-container');
    
    if(listC) listC.classList.add('hidden'); 
    if(ganttC) ganttC.classList.add('hidden'); 
    if(calC) calC.classList.add('hidden');
    
    ['list', 'gantt', 'calendar'].forEach(function(b) {
        const btn = document.getElementById('btn-pd-' + b); 
        if(btn) btn.className = "px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 rounded-md transition-colors whitespace-nowrap";
    });
    
    const activeBtn = document.getElementById('btn-pd-' + view); 
    if(activeBtn) {
        activeBtn.className = "px-2 py-1 text-[11px] font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-colors whitespace-nowrap";
    }
    
    if(view === 'list' && listC) {
        listC.classList.remove('hidden');
    } else if(view === 'gantt' && ganttC) { 
        ganttC.classList.remove('hidden'); 
        window.renderProjGantt(); 
    } else if(view === 'calendar' && calC) { 
        calC.classList.remove('hidden'); 
        window.renderProjCalendar(); 
    }
};

// 💡 간트(Gantt) 복구
window.renderProjGantt = function() {
    const container = document.getElementById('proj-dash-gantt-content');
    if(!container) return;
    let list = window.getFilteredProjects();
    if(list.length === 0) { container.innerHTML = '<div class="p-4 text-center text-slate-400 font-bold">데이터가 없습니다.</div>'; return; }
    
    let html = `<div class="min-w-max p-4 space-y-2">`;
    list.forEach(p => {
        let safeName = getSafeString(p.name);
        html += `<div class="flex items-center gap-4 bg-white p-2 rounded border border-slate-100 shadow-sm">
            <div class="w-48 truncate font-bold text-xs text-slate-700" title="${safeName}">[${getSafeString(p.code)}] ${safeName}</div>
            <div class="flex-1 bg-slate-100 h-6 rounded-full relative overflow-hidden flex items-center shadow-inner">
                <div class="bg-indigo-500 h-full transition-all duration-500" style="width: ${p.progress || 0}%"></div>
                <span class="absolute left-3 text-[10px] font-black text-white mix-blend-difference">${p.progress || 0}%</span>
            </div>
            <div class="w-24 text-right text-[10px] font-bold text-slate-500">${p.status === 'completed' ? '출하완료' : '진행중'}</div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
};

// 💡 달력(Calendar) 복구
window.renderProjCalendar = function() {
    const container = document.getElementById('proj-dash-calendar-content');
    if(!container) return;
    let list = window.getFilteredProjects();
    if(list.length === 0) { container.innerHTML = '<div class="p-4 text-center text-slate-400 font-bold">데이터가 없습니다.</div>'; return; }
    
    let html = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
    list.filter(p => p.d_shipEst || p.d_shipEn).sort((a,b) => new Date(a.d_shipEst).getTime() - new Date(b.d_shipEst).getTime()).forEach(p => {
        let safeName = getSafeString(p.name);
        html += `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div class="text-[10px] font-black text-indigo-500 mb-1">${getSafeString(p.code)}</div>
            <div class="font-bold text-sm text-slate-700 truncate mb-2" title="${safeName}">${safeName}</div>
            <div class="flex justify-between items-center text-[11px] font-bold">
                <span class="text-slate-500">예정: <span class="text-rose-500">${p.d_shipEst || '-'}</span></span>
                <span class="text-slate-500">완료: <span class="text-emerald-500">${p.d_shipEn || '-'}</span></span>
            </div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
};

window.scrollToGanttToday = function() {
    window.showToast("간트 뷰가 업데이트 되었습니다.");
};

// ==========================================
// 💡 코멘트 관리
// ==========================================
window.openCommentModal = function(projectId, title) { 
    const modal = document.getElementById('comment-modal');
    if(!modal) return;
    
    document.getElementById('cmt-req-id').value = projectId; 
    if(window.cancelCommentAction) window.cancelCommentAction(); 
    
    modal.classList.remove('hidden'); 
    modal.classList.add('flex'); 
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
            
            const topLevel = window.currentComments.filter(function(c) { 
                return !c.parentId || c.parentId === 'null' || c.parentId === ''; 
            }).sort(function(a,b) { 
                return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); 
            }); 
            
            const replies = window.currentComments.filter(function(c) { 
                return c.parentId && c.parentId !== 'null' && c.parentId !== ''; 
            }).sort(function(a,b) { 
                return getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt); 
            }); 
            
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
    
    if (topLevelComments.length === 0) { 
        list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; 
        return; 
    } 
    
    try {
        let listHtml = '';
        topLevelComments.forEach(function(c) { 
            let safeContent = String(c.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            
            let files = [];
            if(c.imageUrl) files.push({name:'첨부사진.jpg', url: c.imageUrl, thumbBase64: c.imageUrl});
            const cImgHtml = window.generateMediaHtml ? window.generateMediaHtml(files) : '';
            
            let repliesHtml = ''; 
            if(c.replies && c.replies.length > 0) { 
                repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; 
                c.replies.forEach(function(r) { 
                    let safeReplyContent = String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
                    if(window.formatMentions) safeReplyContent = window.formatMentions(safeReplyContent); 
                    
                    let rFiles = [];
                    if(r.imageUrl) rFiles.push({name:'첨부사진.jpg', url: r.imageUrl, thumbBase64: r.imageUrl});
                    const rImgHtml = window.generateMediaHtml ? window.generateMediaHtml(rFiles) : '';
                    
                    let replyBtnHtml = '';
                    if (r.authorUid === window.currentUser?.uid || (window.userProfile && window.userProfile.role === 'admin')) {
                        replyBtnHtml = `<button onclick="window.editComment('${r.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${r.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>`;
                    }
                    
                    repliesHtml += `<div class="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                        <div class="flex justify-between items-start mb-2">
                                            <div class="flex items-center gap-2">
                                                <i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i>
                                                <span class="font-black text-slate-700 text-sm">${getSafeString(r.authorName)}</span>
                                                <span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(r.createdAt)))}</span>
                                            </div>
                                            <div class="flex gap-2">${replyBtnHtml}</div>
                                        </div>
                                        <div class="text-slate-700 text-[13px] font-medium pl-6 break-words">${safeReplyContent}</div>
                                        ${rImgHtml}
                                    </div>`; 
                }); 
                repliesHtml += '</div>'; 
            } 
            
            let mainBtnHtml = '';
            if (c.authorUid === window.currentUser?.uid || (window.userProfile && window.userProfile.role === 'admin')) {
                mainBtnHtml = `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            listHtml += `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-slate-800 text-[15px]">${getSafeString(c.authorName)}</span>
                                    <span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.setReplyTo('${c.id}', '${c.authorName}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-3 py-1 rounded-lg font-bold transition-colors shadow-sm">답글달기</button>
                                    ${mainBtnHtml}
                                </div>
                            </div>
                            <div class="text-slate-800 text-[14px] font-medium pl-1 mb-2 break-words leading-relaxed">${safeContent}</div>
                            ${cImgHtml}
                            ${repliesHtml}
                        </div>`; 
        });
        list.innerHTML = listHtml;
    } catch(e) { 
        list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; 
    }
};

window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value; 
    const contentEl = document.getElementById('new-cmt-text');
    const content = contentEl ? contentEl.value.trim() : ''; 
    const parentId = document.getElementById('reply-to-id').value || null; 
    const editId = document.getElementById('editing-cmt-id').value; 
    const fileInput = document.getElementById('new-cmt-image'); 
    
    if(!content && (!fileInput || fileInput.files.length === 0)) {
        return window.showToast("코멘트 내용이나 사진을 첨부하세요.", "error"); 
    }
    
    const btnSave = document.getElementById('btn-cmt-save');
    if(btnSave) { 
        btnSave.innerHTML = '저장중..'; 
        btnSave.disabled = true; 
    }
    
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
                
                if(window.processMentions) {
                    await window.processMentions(content, projectId, "코멘트");
                }
            } 
            
            if(window.cancelCommentAction) {
                window.cancelCommentAction(); 
            }
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
        } finally { 
            if(btnSave) { 
                btnSave.innerHTML = '작성'; 
                btnSave.disabled = false; 
            }
        } 
    }; 
    
    if(fileInput && fileInput.files.length > 0) { 
        if(window.resizeAndConvertToBase64) {
            window.resizeAndConvertToBase64(fileInput.files[0], function(base64) { 
                saveData(base64); 
            }, 800); 
        } else { 
            saveData(null); 
        }
    } else { 
        saveData(null); 
    } 
};

window.editComment = function(id) { 
    const comment = (window.currentComments || []).find(c => c.id === id); 
    if(!comment) return; 
    
    if(window.cancelCommentAction) window.cancelCommentAction(); 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-cmt-id', id); 
    setVal('new-cmt-text', comment.content || ''); 
    
    const btnSave = document.getElementById('btn-cmt-save');
    if(btnSave) btnSave.innerText = '수정'; 
    
    const indName = document.getElementById('reply-indicator-name');
    if(indName) indName.innerHTML = '<i class="fa-solid fa-pen mr-1"></i> 코멘트 내용 수정 중'; 
    
    const ind = document.getElementById('reply-indicator');
    if(ind) ind.classList.remove('hidden'); 
    
    const txt = document.getElementById('new-cmt-text');
    if(txt) txt.focus(); 
};

window.setReplyTo = function(commentId, authorName) { 
    if(window.cancelCommentAction) window.cancelCommentAction(); 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('reply-to-id', commentId); 
    
    const indName = document.getElementById('reply-indicator-name');
    if(indName) indName.innerHTML = `<i class="fa-solid fa-reply rotate-180 scale-y-[-1] mr-1"></i> <b class="text-indigo-800">${authorName}</b> 님에게 답글 작성 중`; 
    
    const ind = document.getElementById('reply-indicator');
    if(ind) ind.classList.remove('hidden'); 
    
    const txt = document.getElementById('new-cmt-text');
    if(txt) txt.focus(); 
};

window.cancelCommentAction = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('reply-to-id', ''); 
    setVal('editing-cmt-id', ''); 
    setVal('new-cmt-text', ''); 
    setVal('new-cmt-image', ''); 
    
    const btnSave = document.getElementById('btn-cmt-save');
    if(btnSave) btnSave.innerText = '작성'; 
    
    const ind = document.getElementById('reply-indicator');
    if(ind) ind.classList.add('hidden'); 
};

window.closeCommentModal = function() { 
    const modal = document.getElementById('comment-modal');
    if(modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
    if (currentCommentUnsubscribe) { 
        currentCommentUnsubscribe(); 
        currentCommentUnsubscribe = null; 
    } 
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
        if(window.cancelCommentAction) window.cancelCommentAction(); 
    } catch(e) { window.showToast("삭제 실패", "error"); } 
};


// ==========================================
// 💡 이슈 관리
// ==========================================
window.openIssueModal = function(projectId, title) { 
    const modal = document.getElementById('issue-modal');
    if(!modal) return;
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('issue-req-id', projectId); 
    setVal('editing-issue-id', ''); 
    setVal('new-issue-text', ''); 
    
    const btn = document.getElementById('btn-issue-save');
    if(btn) btn.innerText = '등록'; 
    
    modal.classList.remove('hidden'); 
    modal.classList.add('flex'); 
    
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
    
    if (issues.length === 0) { 
        list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; 
        return; 
    } 
    
    try {
        let listHtml = '';
        issues.forEach(function(iss) { 
            let safeText = String(iss.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeText = window.formatMentions(safeText);
            
            let btnHtml = '';
            if (iss.authorUid === window.currentUser?.uid || (window.userProfile && window.userProfile.role === 'admin')) {
                btnHtml = `<button onclick="window.editIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            let resolvedClass = iss.isResolved ? 'border-slate-200 bg-slate-50' : 'border-rose-200 shadow-sm';
            let titleClass = iss.isResolved ? 'text-slate-400' : 'text-rose-600';
            let contentClass = iss.isResolved ? 'text-slate-400 line-through' : 'text-slate-700';
            let checkHtml = iss.isResolved ? 'checked' : '';
            
            listHtml += `<div class="bg-white p-4 rounded-xl border ${resolvedClass} flex items-start gap-3 transition-all">
                            <div class="mt-0.5">
                                <input type="checkbox" ${checkHtml} onchange="window.toggleIssueStatus('${iss.id}', this.checked)" class="w-5 h-5 text-rose-500 rounded border-gray-300 cursor-pointer accent-rose-500 shadow-sm">
                            </div>
                            <div class="flex-1 flex flex-col gap-1">
                                <div class="flex justify-between items-center">
                                    <span class="font-bold text-sm ${titleClass}">${getSafeString(iss.authorName)}</span>
                                    <div class="flex gap-2">${btnHtml}</div>
                                </div>
                                <div class="text-[13px] font-medium mt-1 leading-relaxed ${contentClass} break-words">${safeText}</div>
                            </div>
                        </div>`; 
        });
        list.innerHTML = listHtml;
    } catch(e) { 
        list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; 
    }
};

window.saveIssueItem = async function() { 
    const projectIdEl = document.getElementById('issue-req-id');
    const editIdEl = document.getElementById('editing-issue-id');
    const contentEl = document.getElementById('new-issue-text');
    if(!projectIdEl || !contentEl) return;
    
    const projectId = projectIdEl.value; 
    const editId = editIdEl ? editIdEl.value : ''; 
    const content = contentEl.value.trim(); 
    
    if(!content) return window.showToast("이슈 내용을 입력하세요.", "error"); 
    
    try { 
        if (editId) { 
            await setDoc(doc(db, "project_issues", editId), { content: content, updatedAt: Date.now() }, { merge: true }); 
            window.showToast("이슈가 수정되었습니다."); 
        } else { 
            await addDoc(collection(db, "project_issues"), { 
                projectId: projectId, 
                content: content, 
                isResolved: false, 
                authorUid: window.currentUser.uid, 
                authorName: window.userProfile.name, 
                createdAt: Date.now() 
            }); 
            window.showToast("이슈가 등록되었습니다."); 
            
            if(window.processMentions) {
                await window.processMentions(content, projectId, "이슈");
            }
        } 
        
        if(editIdEl) editIdEl.value = ''; 
        contentEl.value = ''; 
        const btnSave = document.getElementById('btn-issue-save');
        if(btnSave) btnSave.innerText = '등록'; 
    } catch(e) { 
        window.showToast("저장 중 오류 발생", "error"); 
    } 
};

window.toggleIssueStatus = async function(id, isResolved) { 
    try { 
        await setDoc(doc(db, "project_issues", id), { isResolved: isResolved }, { merge: true }); 
    } catch(e) { 
        window.showToast("상태 변경 오류", "error"); 
    } 
};

window.editIssue = function(id) { 
    const iss = (window.currentIssues || []).find(i => i.id === id); 
    if(!iss) return; 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-issue-id', id); 
    setVal('new-issue-text', iss.content || ''); 
    
    const btnSave = document.getElementById('btn-issue-save');
    if(btnSave) btnSave.innerText = '수정'; 
    
    const txt = document.getElementById('new-issue-text');
    if(txt) txt.focus(); 
};

window.deleteIssue = async function(id) { 
    if(!confirm("이 이슈를 삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "project_issues", id)); 
        window.showToast("삭제되었습니다."); 
    } catch(e) { 
        window.showToast("삭제 실패", "error"); 
    } 
};

window.closeIssueModal = function() { 
    const modal = document.getElementById('issue-modal');
    if(modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
    if (currentIssueUnsubscribe) { 
        currentIssueUnsubscribe(); 
        currentIssueUnsubscribe = null; 
    } 
};

// ==========================================
// 💡 구매 관리
// ==========================================
window.openPurchaseModal = function(projectId, title) { 
    const modal = document.getElementById('purchase-modal');
    if(!modal) return;
    
    document.getElementById('pur-req-id').value = projectId; 
    document.getElementById('pur-project-title').innerText = title || ''; 
    window.resetPurchaseForm(); 
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
    const mgr = proj ? proj.manager : '';
    const canWrite = window.checkPjtWritePermission('purchase', mgr);
    
    if (canWrite) {
        document.getElementById('pur-input-section').classList.remove('hidden');
        document.getElementById('pur-input-section').classList.add('flex');
        document.getElementById('pur-readonly-banner').classList.add('hidden');
    } else {
        document.getElementById('pur-input-section').classList.add('hidden');
        document.getElementById('pur-input-section').classList.remove('flex');
        document.getElementById('pur-readonly-banner').classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    if(window.initGoogleAPI) window.initGoogleAPI();
    
    if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); 
    currentPurchaseUnsubscribe = onSnapshot(query(collection(db, "project_purchases"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; 
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        
        const listEl = document.getElementById('purchase-list');
        if(!listEl) return;
        
        if(list.length === 0) { 
            listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 구매 내역이 없습니다.</div>'; 
            return; 
        }
        
        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : '';
            let safeContent = getSafeString(item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(item.files) : '';
            
            let deleteBtnHtml = '';
            if (canWrite && (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) {
                deleteBtnHtml = `<button onclick="window.deletePurchase('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>`;
            }

            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                        <div class="flex justify-between items-start">
                            <div class="flex items-center gap-2"><span class="font-bold text-amber-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div>
                            <div class="flex gap-2">${deleteBtnHtml}</div>
                        </div>
                        <div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>
                        ${attachmentsHtml}
                    </div>`;
        }).join('');
    });
};

window.closePurchaseModal = function() { 
    const modal = document.getElementById('purchase-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); 
};

window.resetPurchaseForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-pur-id', ''); 
    setVal('new-pur-text', ''); 
    setVal('new-pur-file', ''); 
    const fname = document.getElementById('pur-file-name');
    if(fname) fname.innerText = ''; 
};

window.savePurchaseItem = async function() { 
    const pIdEl = document.getElementById('pur-req-id');
    const titleEl = document.getElementById('pur-project-title');
    if(!pIdEl || !titleEl) return;
    
    const pId = pIdEl.value;
    const title = titleEl.innerText;
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === pId);
    const folderName = proj && proj.code ? proj.code : title;

    const contentEl = document.getElementById('new-pur-text');
    const fileInput = document.getElementById('new-pur-file');
    const btn = document.getElementById('btn-pur-save');
    
    if(!contentEl || !fileInput || !btn) return;
    
    const content = contentEl.value.trim();
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let file = fileInput.files[i];
                let isImg = file.name.match(/\.(jpeg|jpg|gif|png|webp|bmp|heic)$/i);
                
                let thumbBase64 = null;
                if(isImg) {
                    thumbBase64 = await new Promise(resolve => { window.resizeAndConvertToBase64(file, res => resolve(res), 300); });
                }
                
                let url = await handleDriveUploadWithProgress(file, folderName, '구매', i+1, total);
                filesData.push({ name: file.name, url: url, thumbBase64: thumbBase64 });
            }
        }
        await addDoc(collection(db, "project_purchases"), { projectId: pId, content: content, files: filesData, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("구매 내역이 등록되었습니다."); 
        window.resetPurchaseForm(); 
    } catch(e) { 
        window.showToast(e.message, "error"); 
    } finally { 
        btn.innerHTML = '등록'; btn.disabled = false; 
    }
};

window.deletePurchase = async function(id) { 
    if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_purchases", id)); 
};

// ==========================================
// 💡 설계 파일 관리
// ==========================================
window.openDesignModal = function(projectId, title) { 
    const modal = document.getElementById('design-modal');
    if(!modal) return;

    document.getElementById('des-req-id').value = projectId; 
    document.getElementById('des-project-title').innerText = title || ''; 
    window.resetDesignForm(); 
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
    const mgr = proj ? proj.manager : '';
    const canWrite = window.checkPjtWritePermission('design', mgr);
    
    if (canWrite) {
        document.getElementById('des-input-section').classList.remove('hidden');
        document.getElementById('des-input-section').classList.add('flex');
        document.getElementById('des-readonly-banner').classList.add('hidden');
    } else {
        document.getElementById('des-input-section').classList.add('hidden');
        document.getElementById('des-input-section').classList.remove('flex');
        document.getElementById('des-readonly-banner').classList.remove('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    if(window.initGoogleAPI) window.initGoogleAPI();

    if (currentDesignUnsubscribe) currentDesignUnsubscribe(); 
    currentDesignUnsubscribe = onSnapshot(query(collection(db, "project_designs"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; 
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        
        const listEl = document.getElementById('design-list');
        if(!listEl) return;
        
        if(list.length === 0) { 
            listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 설계 파일이 없습니다.</div>'; 
            return; 
        }
        
        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : '';
            let safeContent = getSafeString(item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);

            let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(item.files) : '';
            
            let deleteBtnHtml = '';
            if (canWrite && (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) {
                deleteBtnHtml = `<button onclick="window.deleteDesign('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>`;
            }

            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                        <div class="flex justify-between items-start">
                            <div class="flex items-center gap-2"><span class="font-bold text-teal-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div>
                            <div class="flex gap-2">${deleteBtnHtml}</div>
                        </div>
                        <div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>
                        ${attachmentsHtml}
                    </div>`;
        }).join('');
    });
};

window.closeDesignModal = function() { 
    const modal = document.getElementById('design-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (currentDesignUnsubscribe) currentDesignUnsubscribe(); 
};

window.resetDesignForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-des-id', ''); 
    setVal('new-des-text', ''); 
    setVal('new-des-file', ''); 
    const fname = document.getElementById('des-file-name');
    if(fname) fname.innerText = ''; 
};

window.saveDesignItem = async function() { 
    const pIdEl = document.getElementById('des-req-id');
    const titleEl = document.getElementById('des-project-title');
    if(!pIdEl || !titleEl) return;
    
    const pId = pIdEl.value;
    const title = titleEl.innerText;
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === pId);
    const folderName = proj && proj.code ? proj.code : title;

    const contentEl = document.getElementById('new-des-text');
    const fileInput = document.getElementById('new-des-file');
    const btn = document.getElementById('btn-des-save');
    
    if(!contentEl || !fileInput || !btn) return;
    
    const content = contentEl.value.trim();
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let file = fileInput.files[i];
                let isImg = file.name.match(/\.(jpeg|jpg|gif|png|webp|bmp|heic)$/i);
                
                let thumbBase64 = null;
                if(isImg) {
                    thumbBase64 = await new Promise(resolve => { window.resizeAndConvertToBase64(file, res => resolve(res), 300); });
                }
                
                let url = await handleDriveUploadWithProgress(file, folderName, '설계', i+1, total);
                filesData.push({ name: file.name, url: url, thumbBase64: thumbBase64 });
            }
        }
        await addDoc(collection(db, "project_designs"), { projectId: pId, content: content, files: filesData, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("설계 내역이 등록되었습니다."); 
        window.resetDesignForm(); 
    } catch(e) { 
        window.showToast(e.message, "error"); 
    } finally { 
        btn.innerHTML = '등록'; btn.disabled = false; 
    }
};

window.deleteDesign = async function(id) { 
    if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_designs", id)); 
};

// ==========================================
// 💡 일정표 관리
// ==========================================
window.openPjtScheduleModal = function(projectId, title) { 
    const modal = document.getElementById('pjt-schedule-modal');
    if(!modal) return;
    
    document.getElementById('sch-req-id').value = projectId; 
    document.getElementById('sch-project-title').innerText = title || ''; 
    window.resetPjtScheduleForm(); 
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
    const mgr = proj ? proj.manager : '';
    const canWrite = window.checkPjtWritePermission('schedule', mgr);
    
    if (canWrite) {
        document.getElementById('sch-input-section').classList.remove('hidden');
        document.getElementById('sch-input-section').classList.add('flex');
        document.getElementById('sch-readonly-banner').classList.add('hidden');
    } else {
        document.getElementById('sch-input-section').classList.add('hidden');
        document.getElementById('sch-input-section').classList.remove('flex');
        document.getElementById('sch-readonly-banner').classList.remove('hidden');
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    if(window.initGoogleAPI) window.initGoogleAPI();

    if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); 
    currentPjtScheduleUnsubscribe = onSnapshot(query(collection(db, "project_schedules"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; 
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        
        const listEl = document.getElementById('pjt-schedule-list');
        if(!listEl) return;
        
        if(list.length === 0) { 
            listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 PJT 일정이 없습니다.</div>'; 
            return; 
        }
        
        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : '';
            let safeContent = getSafeString(item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);

            let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(item.files) : '';
            
            let deleteBtnHtml = '';
            if (canWrite && (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) {
                deleteBtnHtml = `<button onclick="window.deletePjtSchedule('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>`;
            }

            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                        <div class="flex justify-between items-start">
                            <div class="flex items-center gap-2"><span class="font-bold text-fuchsia-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div>
                            <div class="flex gap-2">${deleteBtnHtml}</div>
                        </div>
                        <div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>
                        ${attachmentsHtml}
                    </div>`;
        }).join('');
    });
};

window.closePjtScheduleModal = function() { 
    const modal = document.getElementById('pjt-schedule-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); 
};

window.resetPjtScheduleForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-sch-id', ''); 
    setVal('new-sch-text', ''); 
    setVal('new-sch-file', ''); 
    const fname = document.getElementById('sch-file-name');
    if(fname) fname.innerText = ''; 
};

window.savePjtScheduleItem = async function() { 
    const pIdEl = document.getElementById('sch-req-id');
    const titleEl = document.getElementById('sch-project-title');
    if(!pIdEl || !titleEl) return;
    
    const pId = pIdEl.value;
    const title = titleEl.innerText;
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === pId);
    const folderName = proj && proj.code ? proj.code : title;

    const contentEl = document.getElementById('new-sch-text');
    const fileInput = document.getElementById('new-sch-file');
    const btn = document.getElementById('btn-sch-save');
    
    if(!contentEl || !fileInput || !btn) return;
    
    const content = contentEl.value.trim();
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let file = fileInput.files[i];
                let isImg = file.name.match(/\.(jpeg|jpg|gif|png|webp|bmp|heic)$/i);
                
                let thumbBase64 = null;
                if(isImg) {
                    thumbBase64 = await new Promise(resolve => { window.resizeAndConvertToBase64(file, res => resolve(res), 300); });
                }
                
                let url = await handleDriveUploadWithProgress(file, folderName, '일정', i+1, total);
                filesData.push({ name: file.name, url: url, thumbBase64: thumbBase64 });
            }
        }
        await addDoc(collection(db, "project_schedules"), { projectId: pId, content: content, files: filesData, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("PJT 일정 내역이 등록되었습니다."); 
        window.resetPjtScheduleForm(); 
    } catch(e) { 
        window.showToast(e.message, "error"); 
    } finally { 
        btn.innerHTML = '등록'; btn.disabled = false; 
    }
};

window.deletePjtSchedule = async function(id) { 
    if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_schedules", id)); 
};

// ==========================================
// 💡 생산일지 (Daily Log)
// ==========================================
window.openDailyLogModal = function(projectId) { 
    const modal = document.getElementById('daily-log-modal');
    if(!modal) return;
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerText = val; };
    
    setVal('log-req-id', projectId); 
    setHtml('log-project-title', proj.name || ''); 
    setVal('log-project-progress', proj.progress || 0); 
    setVal('log-project-purchase-rate', proj.purchaseRate || 0); 
    
    window.resetDailyLogForm(); 
    
    const mgr = proj ? proj.manager : '';
    const canWrite = window.checkPjtWritePermission('daily-log', mgr);
    
    if (canWrite) {
        document.getElementById('log-input-section').classList.remove('hidden');
        document.getElementById('log-input-section').classList.add('flex');
        document.getElementById('log-readonly-banner').classList.add('hidden');
        document.getElementById('log-project-progress').disabled = false;
        document.getElementById('log-project-purchase-rate').disabled = false;
    } else {
        document.getElementById('log-input-section').classList.add('hidden');
        document.getElementById('log-input-section').classList.remove('flex');
        document.getElementById('log-readonly-banner').classList.remove('hidden');
        document.getElementById('log-project-progress').disabled = true;
        document.getElementById('log-project-purchase-rate').disabled = true;
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    window.loadDailyLogs(projectId, canWrite); 
};

window.loadDailyLogs = function(projectId, canWrite) { 
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
                const dateA = a.date || ''; const dateB = b.date || ''; 
                if (dateA !== dateB) return dateB.localeCompare(dateA); 
                return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); 
            }); 
            
            window.renderDailyLogs(window.currentDailyLogs, canWrite); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderDailyLogs = function(logs, canWrite) { 
    const list = document.getElementById('daily-log-list'); 
    if(!list) return;
    
    if (logs.length === 0) { 
        list.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; 
        return; 
    } 
    
    try {
        let listHtml = '';
        logs.forEach(function(log) { 
            let safeContent = getSafeString(log.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            
            let legacyFiles = [];
            if(log.imageUrl) legacyFiles.push({ name: '첨부사진.jpg', url: log.imageUrl, thumbBase64: log.imageUrl });
            
            let allFiles = legacyFiles;
            if(log.files && log.files.length > 0) {
                allFiles = [...allFiles, ...log.files];
            }
            
            let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(allFiles) : '';
            
            let btnHtml = '';
            if (canWrite && (log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) {
                btnHtml = `<button onclick="window.editDailyLog('${log.id}')" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            listHtml += `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-3">
                                    <span class="font-bold text-sky-600 text-xs flex items-center gap-1"><i class="fa-regular fa-calendar text-sky-400"></i> ${getSafeString(log.date)}</span>
                                    <span class="font-black text-slate-700 text-sm">${getSafeString(log.authorName)}</span>
                                </div>
                                <div class="flex gap-2">${btnHtml}</div>
                            </div>
                            <div class="text-slate-700 font-medium text-[13px] pl-1 mt-2 mb-1 break-words leading-relaxed">${safeContent}</div>
                            ${attachmentsHtml}
                        </div>`; 
        });
        list.innerHTML = listHtml;
    } catch(e) { 
        list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; 
    }
};

window.saveDailyLogItem = async function() { 
    const pIdEl = document.getElementById('log-req-id');
    if(!pIdEl) return;
    const projectId = pIdEl.value; 
    
    const logId = document.getElementById('editing-log-id').value; 
    const date = document.getElementById('new-log-date').value; 
    const content = document.getElementById('new-log-text').value.trim(); 
    const fileInput = document.getElementById('new-log-image'); 
    
    const progEl = document.getElementById('log-project-progress');
    const rateEl = document.getElementById('log-project-purchase-rate');
    const progressVal = progEl ? (parseInt(progEl.value) || 0) : 0; 
    const purchaseRateVal = rateEl ? (parseInt(rateEl.value) || 0) : 0; 
    
    if(!date || (!content && (!fileInput || fileInput.files.length === 0))) {
        return window.showToast("날짜와 내용을 입력하거나 사진을 첨부하세요.", "error"); 
    }
    
    const btnSave = document.getElementById('btn-log-save');
    if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
    try { 
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {};
        const folderName = proj.code ? proj.code : (proj.name || '미지정');

        let filesData = [];
        
        if (fileInput && fileInput.files.length > 0) {
            let total = fileInput.files.length;
            window.showToast(`총 ${total}개의 파일을 업로드합니다...`);
            for(let i=0; i<total; i++) {
                let file = fileInput.files[i];
                let isImg = file.name.match(/\.(jpeg|jpg|gif|png|webp|bmp|heic)$/i);
                
                let thumbBase64 = null;
                if(isImg) {
                    thumbBase64 = await new Promise(resolve => { window.resizeAndConvertToBase64(file, res => resolve(res), 300); });
                }
                
                let url = await handleDriveUploadWithProgress(file, folderName, '생산일지', i+1, total);
                filesData.push({ name: file.name, url: url, thumbBase64: thumbBase64 });
            }
        }

        const payload = { date: date, content: content, updatedAt: Date.now() }; 
        
        if (logId) { 
            const existingLog = (window.currentDailyLogs || []).find(l => l.id === logId);
            let finalFiles = existingLog && existingLog.files ? [...existingLog.files] : [];
            
            if (filesData.length > 0) finalFiles = [...finalFiles, ...filesData];
            if (finalFiles.length > 0) payload.files = finalFiles;
            
            await setDoc(doc(db, "daily_logs", logId), payload, { merge: true }); 
            window.showToast("일지가 수정되었습니다."); 
        } else { 
            if(filesData.length > 0) payload.files = filesData; 
            
            payload.projectId = projectId; 
            payload.authorUid = window.currentUser.uid; 
            payload.authorName = window.userProfile.name; 
            payload.createdAt = Date.now(); 
            await addDoc(collection(db, "daily_logs"), payload); 
            window.showToast("일지가 등록되었습니다."); 
            
            if(window.processMentions) {
                await window.processMentions(content, projectId, "생산일지"); 
            }
        } 
        
        await setDoc(doc(db, "projects_status", projectId), { 
            progress: progressVal, 
            purchaseRate: purchaseRateVal 
        }, { merge: true }); 
        
        window.resetDailyLogForm(); 
    } catch(e) { 
        window.showToast("저장 중 오류 발생", "error"); 
    } finally { 
        if(btnSave) { btnSave.innerHTML = '등록'; btnSave.disabled = false; }
    } 
};

window.editDailyLog = function(id) { 
    const log = (window.currentDailyLogs || []).find(l => l.id === id); 
    if(!log) return; 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-log-id', id); 
    setVal('new-log-date', log.date || window.getLocalDateStr(new Date())); 
    setVal('new-log-text', log.content || ''); 
    
    const btnSave = document.getElementById('btn-log-save');
    if(btnSave) btnSave.innerText = '수정'; 
    const btnCancel = document.getElementById('btn-log-cancel');
    if(btnCancel) btnCancel.classList.remove('hidden'); 
    
    const txt = document.getElementById('new-log-text');
    if(txt) txt.focus(); 
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

window.clearDailyLogFile = function(e) {
    if(e) e.stopPropagation();
    const input = document.getElementById('new-log-image');
    const wrap = document.getElementById('new-log-filename-wrap');
    if(input) input.value = '';
    if(wrap) wrap.classList.add('hidden');
};

window.closeDailyLogModal = function() { 
    const modal = document.getElementById('daily-log-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (currentLogUnsubscribe) { 
        currentLogUnsubscribe(); 
        currentLogUnsubscribe = null; 
    } 
};

window.resetDailyLogForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-log-id', ''); 
    setVal('new-log-date', window.getLocalDateStr(new Date())); 
    setVal('new-log-text', ''); 
    setVal('new-log-image', ''); 
    window.clearDailyLogFile(); 
    
    const btnSave = document.getElementById('btn-log-save');
    if(btnSave) btnSave.innerText = '등록'; 
    const btnCancel = document.getElementById('btn-log-cancel');
    if(btnCancel) btnCancel.classList.add('hidden'); 
};


// ==========================================
// 💡 1. 투입 MD 기록 모달 (프로젝트 팀원 전용 권한 부여)
// ==========================================
window.openMdLogModal = function(projectId, title, curMd) { 
    const modal = document.getElementById('md-log-modal');
    if(!modal) return;
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('md-req-id', projectId); 
    
    const badge = document.getElementById('md-total-badge'); 
    if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; 
    
    window.resetMdLogForm(); 
    
    // 💡 팀 인원만 MD 수정 가능하도록 제한 로직 추가
    const user = window.userProfile || {};
    const isAdmin = user.role === 'admin' || user.role === 'master';
    const isManager = proj.manager === user.name;
    const isMember = (proj.members || '').includes(user.name);
    
    const canWrite = isAdmin || isManager || isMember;

    if (canWrite) {
        document.getElementById('md-input-section').classList.remove('hidden');
        document.getElementById('md-input-section').classList.add('flex');
        document.getElementById('md-readonly-banner').classList.add('hidden');
    } else {
        document.getElementById('md-input-section').classList.add('hidden');
        document.getElementById('md-input-section').classList.remove('flex');
        document.getElementById('md-readonly-banner').classList.remove('hidden');
    }
    
    modal.classList.remove('hidden'); 
    modal.classList.add('flex'); 
    window.loadMdLogs(projectId, canWrite); 
};

window.loadMdLogs = function(projectId, canWrite) { 
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
            window.renderMdLogs(window.currentMdLogs, canWrite); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderMdLogs = function(logs, canWrite) { 
    const list = document.getElementById('md-log-list'); 
    if(!list) return;
    
    if (logs.length === 0) { 
        list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; 
        return; 
    } 
    
    try {
        let htmlStr = '';
        logs.forEach(function(log) { 
            let safeDesc = String(log.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeDesc = window.formatMentions(safeDesc);
            
            let btnHtml = '-';
            if (canWrite && (log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) {
                btnHtml = `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            htmlStr += `<tr class="hover:bg-purple-50/30 transition-colors border-b border-slate-100">
                            <td class="p-3 text-center text-slate-500 font-bold">${getSafeString(log.date)}</td>
                            <td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td>
                            <td class="p-3 text-slate-700">${safeDesc || '-'}</td>
                            <td class="p-3 text-center text-slate-600 font-bold">${getSafeString(log.authorName)}</td>
                            <td class="p-3 text-center"><div class="flex justify-center gap-2">${btnHtml}</div></td>
                        </tr>`; 
        });
        list.innerHTML = htmlStr;
    } catch(e) { 
        list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-rose-500 font-bold">렌더링 오류 발생</td></tr>'; 
    }
};

window.saveMdLogItem = async function() { 
    const pIdEl = document.getElementById('md-req-id');
    const logIdEl = document.getElementById('editing-md-id');
    const dateEl = document.getElementById('new-md-date');
    const mdValEl = document.getElementById('new-md-val');
    const descEl = document.getElementById('new-md-desc');
    
    if(!pIdEl || !dateEl || !mdValEl) return;
    
    const projectId = pIdEl.value; 
    const logId = logIdEl ? logIdEl.value : ''; 
    const date = dateEl.value; 
    const mdVal = mdValEl.value; 
    const desc = descEl ? descEl.value.trim() : ''; 
    
    if(!date || !mdVal) return window.showToast("날짜와 투입 MD를 입력하세요.", "error"); 
    
    try { 
        if (logId) { 
            await setDoc(doc(db, "project_md_logs", logId), { 
                date: date, 
                md: parseFloat(mdVal), 
                desc: desc, 
                updatedAt: Date.now() 
            }, { merge: true }); 
            window.showToast("MD 내역이 수정되었습니다."); 
        } else { 
            await addDoc(collection(db, "project_md_logs"), { 
                projectId: projectId, 
                date: date, 
                md: parseFloat(mdVal), 
                desc: desc, 
                authorUid: window.currentUser.uid, 
                authorName: window.userProfile.name, 
                createdAt: Date.now() 
            }); 
            window.showToast("MD 내역이 등록되었습니다."); 
            
            if(window.processMentions) {
                await window.processMentions(desc, projectId, "투입MD기록");
            }
        } 
        
        await window.updateProjectTotalMd(projectId); 
        window.resetMdLogForm(); 
    } catch(e) { 
        window.showToast("저장 중 오류 발생", "error"); 
    } 
};

window.editMdLog = function(id) { 
    const log = (window.currentMdLogs || []).find(l => l.id === id); 
    if(!log) return; 
    
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-md-id', id); 
    setVal('new-md-date', log.date || window.getLocalDateStr(new Date())); 
    setVal('new-md-val', log.md || ''); 
    setVal('new-md-desc', log.desc || ''); 
    
    const btnSave = document.getElementById('btn-md-save');
    if(btnSave) btnSave.innerText = '수정'; 
    
    const btnCancel = document.getElementById('btn-md-cancel');
    if(btnCancel) btnCancel.classList.remove('hidden'); 
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
    snap.forEach(function(docSnap) { 
        total += parseFloat(docSnap.data().md) || 0; 
    }); 
    
    const projRef = doc(db, "projects_status", projectId); 
    const projSnap = await getDoc(projRef); 
    if(projSnap.exists()) { 
        const outMd = parseFloat(projSnap.data().outMd) || 0; 
        await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); 
    } 
};

window.closeMdLogModal = function() { 
    const modal = document.getElementById('md-log-modal');
    if(modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
    if (currentMdLogUnsubscribe) { 
        currentMdLogUnsubscribe(); 
        currentMdLogUnsubscribe = null; 
    } 
};

window.resetMdLogForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-md-id', ''); 
    setVal('new-md-date', window.getLocalDateStr(new Date())); 
    setVal('new-md-val', ''); 
    setVal('new-md-desc', ''); 
    
    const btnSave = document.getElementById('btn-md-save');
    if(btnSave) btnSave.innerText = '등록'; 
    
    const btnCancel = document.getElementById('btn-md-cancel');
    if(btnCancel) btnCancel.classList.add('hidden'); 
};


// ==========================================
// 💡 4. 부가 기능 복구 (NCR, 외부 링크, 완료 요청)
// ==========================================

// NCR 데이터 불러오기 복구
window.loadNcrData = function() {
    onSnapshot(collection(db, "ncr_reports"), function(snap) {
        window.ncrData = [];
        snap.forEach(doc => { window.ncrData.push({ id: doc.id, ...doc.data() }); });
        if(window.renderProjectStatusList) window.renderProjectStatusList();
    });
};

// 부적합(NCR) 현황 모달 복구
window.openNcrModal = function(code, name) {
    const modal = document.getElementById('ncr-modal');
    if(!modal) return;
    document.getElementById('ncr-modal-pjt-name').innerText = `[${code}] ${name}`;
    const tbody = document.getElementById('ncr-modal-list');
    
    const safeItemCode = getSafeString(code).replace(/\s/g, '').toUpperCase();
    const pjtNcrData = (window.ncrData || []).filter(n => getSafeString(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeItemCode);
    pjtNcrData.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
    
    if(pjtNcrData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-slate-400 font-bold">등록된 부적합 내역이 없습니다.</td></tr>';
    } else {
        tbody.innerHTML = pjtNcrData.map(n => {
            let statusClass = (n.status || '').includes('완료') ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
            return `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="p-3 text-center font-bold text-slate-500">${n.date || '-'}</td>
                <td class="p-3 text-center"><span class="px-2 py-1 rounded bg-slate-100 text-[10px] font-bold text-slate-600">${n.type || '-'}</span></td>
                <td class="p-3 font-bold text-slate-700">${n.department || '-'}</td>
                <td class="p-3 text-slate-600">${n.content || '-'}</td>
                <td class="p-3 text-slate-600">${n.action || '-'}</td>
                <td class="p-3 text-center text-rose-500 font-bold">${n.expectedDate || '-'}</td>
                <td class="p-3 text-center text-emerald-500 font-bold">${n.completedDate || '-'}</td>
                <td class="p-3 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${statusClass}">${n.status || '-'}</span></td>
            </tr>`;
        }).join('');
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeNcrModal = function() {
    const modal = document.getElementById('ncr-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

// 외부 링크 관련 기능 복구
window.openLinkModal = function(projectId, title) {
    const modal = document.getElementById('link-modal');
    if(!modal) return;
    document.getElementById('link-req-id').value = projectId;
    document.getElementById('link-project-title').innerText = title;
    document.getElementById('new-link-name').value = '';
    document.getElementById('new-link-url').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    window.loadLinks(projectId);
};

window.closeLinkModal = function() {
    const modal = document.getElementById('link-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.loadLinks = async function(projectId) {
    const tbody = document.getElementById('link-list-tbody');
    if(!tbody) return;
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
    if(!proj || !proj.links || proj.links.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-400 font-bold text-[11px]">등록된 링크가 없습니다.</td></tr>';
        return;
    }
    tbody.innerHTML = proj.links.map((lnk, idx) => {
        return `<tr>
            <td class="p-2 text-center font-bold text-slate-700">${lnk.name}</td>
            <td class="p-2 truncate max-w-[200px]"><a href="${lnk.url}" target="_blank" class="text-teal-500 hover:text-teal-700 hover:underline">${lnk.url}</a></td>
            <td class="p-2 text-center"><button onclick="window.deleteLink('${projectId}', ${idx})" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>`;
    }).join('');
};

window.addLink = async function() {
    const pid = document.getElementById('link-req-id').value;
    const name = document.getElementById('new-link-name').value.trim();
    const url = document.getElementById('new-link-url').value.trim();
    if(!name || !url) return window.showToast("링크명과 URL을 입력하세요.", "warning");
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === pid);
        let links = proj.links || [];
        links.push({name, url});
        await setDoc(doc(db, "projects_status", pid), { links: links }, { merge: true });
        window.showToast("링크가 추가되었습니다.");
        document.getElementById('new-link-name').value = '';
        document.getElementById('new-link-url').value = '';
        window.loadLinks(pid);
    } catch(e) { window.showToast("링크 추가 실패", "error"); }
};

window.deleteLink = async function(pid, idx) {
    if(!confirm("링크를 삭제하시겠습니까?")) return;
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === pid);
        let links = proj.links || [];
        links.splice(idx, 1);
        await setDoc(doc(db, "projects_status", pid), { links: links }, { merge: true });
        window.showToast("삭제되었습니다.");
        window.loadLinks(pid);
    } catch(e) { window.showToast("삭제 실패", "error"); }
};

// 완료보고서 작성 요청 기능 복구
window.openCrReqModal = function(projectId, title) {
    const modal = document.getElementById('cr-req-modal');
    if(!modal) return;
    document.getElementById('cr-req-pid').value = projectId;
    document.getElementById('cr-req-pname').innerText = title;
    const targetSelect = document.getElementById('cr-req-target');
    if(targetSelect) {
        const qmTeam = (window.allSystemUsers || []).filter(u => u.team === '품질경영팀');
        if(qmTeam.length > 0) {
            targetSelect.innerHTML = qmTeam.map(u => `<option value="${u.name}">${u.name} (${u.position || '매니저'})</option>`).join('');
        } else {
            targetSelect.innerHTML = '<option value="">품질경영팀 인원이 없습니다.</option>';
        }
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeCrReqModal = function() {
    const modal = document.getElementById('cr-req-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.sendCrRequest = async function() {
    const pid = document.getElementById('cr-req-pid').value;
    const targetName = document.getElementById('cr-req-target').value;
    if(!targetName) return window.showToast("대상자를 선택해주세요.", "warning");
    
    try {
        const success = await window.notifyUser(targetName, "품질 완료보고서 작성을 요청합니다.", pid, "완료요청");
        if(success) {
            window.showToast(targetName + "님에게 완료보고 작성을 요청했습니다.");
            window.closeCrReqModal();
        } else {
            window.showToast("알림 전송 실패", "error");
        }
    } catch(e) { window.showToast("오류 발생", "error"); }
};
