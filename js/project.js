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

window.currentProjDashView = 'list';
window.currentProjPartTab = '제조';
window.currentStatusFilter = 'all';
window.currentCategoryFilter = 'all';
window.currentMonthFilter = '';
window.currentYearFilter = new Date().getFullYear().toString(); 
window.calendarCurrentDate = new Date();
window.hideCompletedFilter = true; 
window.ganttTodayOffset = 0;
window.ncrData = [];
window.currentLogMembers = []; 
window.currentSelectedMembers = [];


if (!window.getLocalDateStr) {
    window.getLocalDateStr = function(dateObj) {
        const tzOffset = dateObj.getTimezoneOffset() * 60000;
        return (new Date(dateObj.getTime() - tzOffset)).toISOString().split('T')[0];
    };
}
if (!window.getDateTimeStr) {
    window.getDateTimeStr = function(dateObj) {
        const tzOffset = dateObj.getTimezoneOffset() * 60000;
        return (new Date(dateObj.getTime() - tzOffset)).toISOString().replace('T', ' ').substring(0, 16);
    };
}

const safeShowError = (msg, err) => {
    console.error(msg, err);
    if(window.showToast) window.showToast(msg + (err ? ': ' + err.message : ''), "error");
    else alert(msg + (err ? '\n' + err.message : ''));
};

const safeShowSuccess = (msg) => {
    if(window.showToast) window.showToast(msg, "success");
    else alert(msg);
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
    try {
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
    } catch(e) { console.error("파일명 업데이트 에러:", e); }
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
    window.currentStatusFilter = 'all'; 
    window.currentCategoryFilter = 'all'; 
    window.currentYearFilter = new Date().getFullYear().toString(); 
    window.currentMonthFilter = ''; 
    window.hideCompletedFilter = true;
    
    if(document.getElementById('filter-category-select')) document.getElementById('filter-category-select').value = 'all';
    if(document.getElementById('filter-year-select')) document.getElementById('filter-year-select').value = window.currentYearFilter;
    if(document.getElementById('filter-month-select')) document.getElementById('filter-month-select').value = '';
    if(document.getElementById('hide-completed-cb')) document.getElementById('hide-completed-cb').checked = true;
    window.filterProjectStatus('all');
};

window.getFilteredProjects = function() {
    let list = window.currentProjectStatusList || [];
    
    if (window.currentCategoryFilter && window.currentCategoryFilter !== 'all') {
        list = list.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
    }
    if (window.currentStatusFilter && window.currentStatusFilter !== 'all') { 
        list = list.filter(item => { 
            if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; 
            return item.status === window.currentStatusFilter; 
        }); 
    }
    if (window.hideCompletedFilter) {
        list = list.filter(item => item.status !== 'completed');
    }
    if (window.currentYearFilter) {
        const y = window.currentYearFilter;
        const shortY = y.slice(-2);
        list = list.filter(item => {
            const cY = item.createdAt ? new Date(getSafeMillis(item.createdAt)).getFullYear().toString() : '';
            const code = getSafeString(item.code);
            const hasYearDate = ['d_shipEn', 'd_asmEst', 'd_asmEndEst', 'd_asmEn', 'd_shipEst', 'd_rcvEst', 'd_asmSt', 'd_insSt', 'd_insEn', 'd_setSt', 'd_setEn'].some(field => getSafeString(item[field]).startsWith(y));
            const codeHasYear = code.startsWith(shortY) || code.includes('-' + shortY + '-');
            return hasYearDate || cY === y || codeHasYear || (!hasYearDate && !cY && item.status !== 'completed'); 
        });
    }
    if (window.currentMonthFilter) {
        const m = window.currentMonthFilter;
        list = list.filter(item => {
            return getSafeString(item.d_shipEn).startsWith(m) || getSafeString(item.d_asmEst).startsWith(m) || getSafeString(item.d_asmEn).startsWith(m);
        });
    }
    
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

let isPjtDashInit = false;

window.loadProjectStatusData = function() {
    if (!isPjtDashInit) {
        setTimeout(() => {
            const ySelect = document.getElementById('filter-year-select');
            if (ySelect) ySelect.value = window.currentYearFilter;
            const hCb = document.getElementById('hide-completed-cb');
            if (hCb) hCb.checked = window.hideCompletedFilter;
        }, 50);
        isPjtDashInit = true;
    }

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
    
    if (displayList.length === 0 && window.currentProjectStatusList && window.currentProjectStatusList.length > 0) {
        if (window.currentYearFilter !== '' || window.hideCompletedFilter) {
            window.currentYearFilter = ''; window.hideCompletedFilter = false;
            const ySelect = document.getElementById('filter-year-select'); if (ySelect) ySelect.value = '';
            const hCb = document.getElementById('hide-completed-cb'); if (hCb) hCb.checked = false;
            displayList = window.getFilteredProjects();
            if(window.showToast) window.showToast("조건에 맞는 PJT가 없어 필터를 전체로 해제했습니다.", "warning");
        }
    }

    if(displayList.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="33" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">데이터가 없습니다.</td></tr>'; 
        return; 
    }
    
    const statusMap = { 'pending': '<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200 whitespace-nowrap">대기/보류</span>', 'progress': '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200 whitespace-nowrap">진행(제작)</span>', 'inspecting': '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200 whitespace-nowrap">진행(검수)</span>', 'completed': '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200 whitespace-nowrap">완료(출하)</span>', 'rejected': '<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200 whitespace-nowrap">보류/불가</span>' };
    
    let htmlStr = '';
    displayList.forEach(item => {
        try {
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
            if (totalNcrCnt === 0) ncrIconHtml = `<button onclick="event.stopPropagation(); window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-slate-300 hover:text-indigo-400 transition-colors p-1" title="부적합 내역 없음"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
            else if (unresolvedNcrCnt === 0) ncrIconHtml = `<button onclick="event.stopPropagation(); window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-emerald-500 hover:text-emerald-600 transition-colors p-1" title="모두 조치 완료"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
            else ncrIconHtml = `<button onclick="event.stopPropagation(); window.openNcrModal('${item.code}', '${safeNameJs}')" class="text-rose-500 relative transition-transform hover:scale-110 p-1" title="미결 부적합 ${unresolvedNcrCnt}건"><i class="fa-solid fa-file-circle-exclamation text-lg"></i><span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${unresolvedNcrCnt}</span></button>`;

            let crBtnHtml = '';
            if (item.status !== 'completed') {
                crBtnHtml = `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-not-allowed shadow-inner">완료대기</span>`;
            } else {
                if (item.crSent) crBtnHtml = `<span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded border border-blue-200 shadow-sm cursor-not-allowed">송부완료</span>`;
                else crBtnHtml = `<button onclick="event.stopPropagation(); window.openCrReqModal('${item.id}', '${safeNameJs}')" class="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white px-2 py-1 rounded border border-rose-200 transition-colors shadow-sm whitespace-nowrap">완료요청</button>`;
            }

            htmlStr += `<tr class="group hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 0px; min-width: 40px; max-width: 40px;" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 40px; min-width: 80px; max-width: 80px;">${getSafeString(item.category)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 120px; min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 170px; min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${iCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-bold text-indigo-700 bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 220px; min-width: 110px; max-width: 110px;">${getSafeString(item.code)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 truncate max-w-[220px] bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 330px; min-width: 220px;">${safeNameHtml}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center truncate max-w-[110px] bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 550px; min-width: 110px;">${getSafeString(item.company)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-black text-emerald-600 bg-white group-hover:bg-indigo-50/50 sticky z-20" style="left: 660px; min-width: 60px; max-width: 60px;">${parseFloat(item.progress) || 0}%</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center bg-white group-hover:bg-indigo-50/50 sticky z-20 shadow-[3px_0_5px_-1px_rgba(0,0,0,0.3)] border-r-slate-300" style="left: 720px; min-width: 80px; max-width: 80px;">${statusMap[item.status] || ''}</td>`;
            
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600">${getSafeString(item.manager)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPurchaseModal('${item.id}', '${safeNameJs}')" class="text-amber-500 relative"><i class="fa-solid fa-cart-shopping text-lg"></i>${purCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${purCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDesignModal('${item.id}', '${safeNameJs}')" class="text-teal-400 relative"><i class="fa-solid fa-pen-ruler text-lg"></i>${desCnt ? `<span class="absolute -top-1 -right-2 bg-teal-100 text-teal-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-teal-200">${desCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPjtScheduleModal('${item.id}', '${safeNameJs}')" class="text-fuchsia-400 relative"><i class="fa-regular fa-calendar-check text-lg"></i>${schCnt ? `<span class="absolute -top-1 -right-2 bg-fuchsia-100 text-fuchsia-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-fuchsia-200">${schCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}')" class="text-sky-400 relative"><i class="fa-solid fa-book text-lg"></i>${lCnt ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-sky-200">${lCnt}</span>` : ''}</button></td>`;
            
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">${ncrIconHtml}</td>`;

            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd||0}</td>`;
            htmlStr += `<td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal('${item.id}', '${safeNameJs}', ${cMd})" class="text-purple-600 underline">${cMd}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center font-bold">${fMd.toFixed(1)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers||''}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outPers||''}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outMd||''}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">${getSafeString(item.d_shipEst)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${getSafeString(item.d_asmEst)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${getSafeString(item.d_asmEndEst)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${getSafeString(item.d_asmSt)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${getSafeString(item.d_asmEn)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_insSt)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_insEn)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700 font-bold">${getSafeString(item.d_shipEn)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_setSt)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_setEn)}</td>`;
            
            let linksHtml = '';
            if(item.links && Array.isArray(item.links)) { 
                linksHtml = item.links.map(lnk => `<a href="${getSafeString(lnk?.url)}" target="_blank" title="${getSafeString(lnk?.name)}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-link text-[10px]"></i></a>`).join(''); 
            }
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><div class="flex items-center justify-center gap-1 flex-wrap"><button onclick="window.openLinkModal('${item.id}', '${safeNameJs}')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>${linksHtml}</div></td>`;
            
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center">${crBtnHtml}</td>`;
            htmlStr += `</tr>`;

        } catch(err) {
            console.error('리스트 렌더링 에러 (해당 항목을 건너뜀):', err);
        }
    });
    
    tbody.innerHTML = htmlStr;
};

window.generateMediaHtml = function(filesArray) {
    if (!filesArray || !Array.isArray(filesArray) || filesArray.length === 0) return '';
    
    let mediaHtml = ''; 
    let filesHtml = '';
    
    filesArray.forEach(f => {
        let isImg = false;
        
        if (f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp|heic|heif)$/i)) isImg = true;
        if (f.url && f.url.startsWith('data:image')) isImg = true;
        if (f.thumbBase64 && f.thumbBase64.startsWith('data:image')) isImg = true;
        if (f.name === '첨부사진.jpg' || f.name === '첨부사진') isImg = true;

        if (isImg) {
            let viewUrl = f.url;
            let thumbUrl = f.url;
            let fileIdMatch = f.url ? f.url.match(/\/d\/(.+?)\/view/) : null;
            
            if (fileIdMatch) {
                viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                thumbUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w600`;
            }

            if (f.thumbBase64 && f.thumbBase64.startsWith('data:image')) {
                thumbUrl = f.thumbBase64;
            } else if (f.url && f.url.startsWith('data:image')) {
                thumbUrl = f.url;
            }

            mediaHtml += `
            <div class="relative overflow-hidden rounded-lg border border-slate-200 shadow-sm cursor-pointer group w-32 h-32 bg-slate-100 flex items-center justify-center" onclick="window.openImageViewer('${viewUrl}')">
            `;
            
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

// 💡 [핵심 수정] 만료 에러 401 캐치 및 드라이브 스코프 호환 보장
window.getOrCreateDriveFolder = async function(folderName, parentFolderId) {
    if (!window.googleAccessToken) return null;
    
    // 💡 싱글 쿼테이션(') 완벽 제거 및 이스케이프
    const safeFolderName = getSafeString(folderName).replace(/[\/\\]/g, '_').replace(/'/g, "\\'") || '미분류 프로젝트';
    
    const tryCreateFolder = async (parentId) => {
        const query = `name='${safeFolderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        
        const findRes = await fetch(url, {
            headers: { 'Authorization': 'Bearer ' + window.googleAccessToken }
        });
        const folderData = await findRes.json();
        
        // 💡 만료/권한 에러 강력 캐치
        if (folderData.error) {
            if (folderData.error.code === 401) throw new Error("TOKEN_EXPIRED");
            throw new Error(folderData.error.message);
        }
        
        if (folderData.files && folderData.files.length > 0) {
            return folderData.files[0].id;
        } else {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + window.googleAccessToken, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ 
                    name: safeFolderName, 
                    mimeType: 'application/vnd.google-apps.folder', 
                    parents: [parentId] 
                })
            });
            const newFolderData = await createRes.json();
            if (newFolderData.error) {
                if (newFolderData.error.code === 401) throw new Error("TOKEN_EXPIRED");
                throw new Error(newFolderData.error.message);
            }
            return newFolderData.id;
        }
    };

    try {
        return await tryCreateFolder(parentFolderId);
    } catch(e) {
        if (e.message === "TOKEN_EXPIRED") throw new Error("구글 보안 토큰이 만료되었습니다. 창을 닫고 상단의 [구글 연동 필요] 버튼을 눌러 다시 로그인해주세요.");
        console.warn("⚠️ 지정된 공유 폴더 접근 권한이 없어 내 드라이브(root)에 생성을 시도합니다:", e);
        try {
            return await tryCreateFolder('root');
        } catch(e2) {
            if (e2.message === "TOKEN_EXPIRED") throw new Error("구글 보안 토큰이 만료되었습니다. 창을 닫고 다시 연동해주세요.");
            console.error("❌ 폴더 생성 최종 실패:", e2);
            return null;
        }
    }
};

async function handleDriveUploadWithProgress(file, projectName, subFolderName = null, fileIndex = 1, totalFiles = 1) {
    // 💡 1시간 만료 엄격하게 사전 차단 로직 (조용한 만료 방지)
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) {
        window.googleAccessToken = null;
        if(window.initGoogleAPI) window.initGoogleAPI();
        throw new Error("구글 보안 토큰이 만료되었습니다. 창을 닫고 상단의 [구글 연동 필요] 버튼을 눌러 다시 로그인해주세요.");
    }
    
    if (!file) throw new Error("업로드할 파일이 없습니다.");

    let targetFolderId = await window.getOrCreateDriveFolder(projectName, TARGET_DRIVE_FOLDER);
    if (!targetFolderId) throw new Error("폴더 접근 또는 생성 권한이 부족합니다. 구글 드라이브 연동 상태를 확인하세요.");

    if (subFolderName) {
        const subFolderId = await window.getOrCreateDriveFolder(subFolderName, targetFolderId);
        if (subFolderId) targetFolderId = subFolderId;
    }

    const progressModal = document.getElementById('upload-progress-modal');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const progressSize = document.getElementById('upload-progress-size');
    const progressFilename = document.getElementById('upload-progress-filename');
    
    if(progressModal) {
        progressModal.classList.remove('hidden');
        progressModal.classList.add('flex');
    }
    if(progressBar) progressBar.style.width = '0%';
    if(progressText) progressText.innerText = '0%';
    
    let fileCounterText = totalFiles > 1 ? `[${fileIndex}/${totalFiles}] ` : '';
    if(progressFilename) progressFilename.innerText = fileCounterText + file.name;
    
    const totalMb = (file.size / (1024 * 1024)).toFixed(2);
    if(progressSize) progressSize.innerText = `0.00 MB / ${totalMb} MB`;

    try {
        const metaRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + window.googleAccessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: file.name, parents: [targetFolderId] })
        });
        
        if (!metaRes.ok) {
            const errBody = await metaRes.json();
            throw new Error(errBody.error ? errBody.error.message : "구글 드라이브 파일 메타데이터 생성 실패");
        }
        
        const metaData = await metaRes.json();
        const fileId = metaData.id;

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + window.googleAccessToken);
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

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
                if (fileIndex === totalFiles) {
                    if(progressModal) {
                        progressModal.classList.add('hidden');
                        progressModal.classList.remove('flex');
                    }
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(`https://drive.google.com/file/d/${fileId}/view`);
                } else {
                    if(progressModal) {
                        progressModal.classList.add('hidden');
                        progressModal.classList.remove('flex');
                    }
                    reject(new Error("파일 내용 업로드 거절됨. (네트워크 상태 또는 드라이브 용량 문제)"));
                }
            };

            xhr.onerror = function() {
                if(progressModal) {
                    progressModal.classList.add('hidden');
                    progressModal.classList.remove('flex');
                }
                reject(new Error("인터넷 연결이 끊어졌거나 네트워크 오류가 발생했습니다."));
            };

            xhr.send(file);
        });
    } catch(err) {
        if(progressModal) { progressModal.classList.add('hidden'); progressModal.classList.remove('flex'); }
        throw err;
    }
}

window.openProjStatusWriteModal = function() {
    try {
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
        if(window.renderSelectedMembers) window.renderSelectedMembers();

        const btnHistory = document.getElementById('btn-view-history');
        if (btnHistory) btnHistory.classList.add('hidden'); 
        
        const modal = document.getElementById('proj-status-write-modal');
        if(!modal) { safeShowError('프로젝트 등록 모달창 요소를 찾을 수 없습니다.'); return; }
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
    } catch(e) {
        safeShowError('프로젝트 등록 모달을 여는 중 오류가 발생했습니다.', e);
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
    try {
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

        window.currentSelectedMembers = (item.members && typeof item.members === 'string') ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; 
        if(window.renderSelectedMembers) window.renderSelectedMembers();
        
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
        if(!modal) { safeShowError('프로젝트 수정 모달창 요소를 찾을 수 없습니다.'); return; }
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
    } catch(e) {
        safeShowError('데이터를 불러오는 중 오류가 발생했습니다.', e);
    }
};

window.saveProjStatus = async function(btn) {
    try {
        if(btn) { btn.disabled = true; btn.innerHTML = '저장중...'; }
        
        const idEl = document.getElementById('ps-id');
        const codeEl = document.getElementById('ps-code');
        const nameEl = document.getElementById('ps-name');
        
        if(!codeEl || !nameEl) {
            if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
            return safeShowError("입력 폼 요소를 찾을 수 없습니다.");
        }

        const id = idEl.value; 
        let code = codeEl.value.trim(); 
        let name = nameEl.value.trim();
        
        if(!code || !name) { 
            if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; } 
            return safeShowError("PJT 코드와 프로젝트명을 모두 입력하세요."); 
        }

        const currentMdEl = document.getElementById('ps-current-md');
        const outMdEl = document.getElementById('ps-out-md');
        const currentMd = currentMdEl ? (parseFloat(currentMdEl.value) || 0) : 0; 
        const outMd = outMdEl ? (parseFloat(outMdEl.value) || 0) : 0;
        
        const getVal = (eid) => { const el = document.getElementById(eid); return el ? el.value : ''; };

        const payload = { 
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
            payload[key] = getVal(elementId); 
        }

        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(key => {
            if (cleanPayload[key] === undefined) cleanPayload[key] = null;
        });

        if(id) { 
            const oldSnap = await getDoc(doc(db, "projects_status", id));
            if(oldSnap.exists()) {
                await addDoc(collection(db, "project_history"), { 
                    projectId: id, 
                    snapshot: oldSnap.data(), 
                    changedBy: (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'Unknown', 
                    changedAt: Date.now() 
                });
            }
            await setDoc(doc(db, "projects_status", id), cleanPayload, { merge: true }); 
            safeShowSuccess("성공적으로 수정되었습니다."); 
        } else { 
            cleanPayload.createdAt = Date.now(); 
            cleanPayload.currentMd = 0; 
            cleanPayload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system';
            cleanPayload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system';
            
            await addDoc(collection(db, "projects_status"), cleanPayload); 
            safeShowSuccess("성공적으로 등록되었습니다."); 
            
            if (window.googleAccessToken) {
                const folderName = cleanPayload.code ? cleanPayload.code : cleanPayload.name;
                window.getOrCreateDriveFolder(folderName, TARGET_DRIVE_FOLDER)
                    .then(fid => {
                        if(fid) console.log("드라이브 폴더 자동생성 완료:", folderName);
                    })
                    .catch(e => console.warn("드라이브 폴더 생성 실패", e));
            }
        } 
        
        if(window.closeProjStatusWriteModal) window.closeProjStatusWriteModal(); 
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    } catch(error) {
        safeShowError("저장 중 오류 발생", error);
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    }
};

window.deleteProjStatus = async function(id) { 
    if(!confirm("삭제하시겠습니까?")) return; 
    try { await deleteDoc(doc(db, "projects_status", id)); safeShowSuccess("삭제되었습니다."); } catch(e) { safeShowError("삭제 실패", e); } 
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
    window.currentSelectedMembers = window.currentSelectedMembers || [];
    if(!window.currentSelectedMembers.includes(name)) { 
        window.currentSelectedMembers.push(name); 
        if(window.renderSelectedMembers) window.renderSelectedMembers(); 
    } 
    const el = document.getElementById('ps-member-add');
    if(el) el.selectedIndex = 0; 
};

window.removeProjectMember = function(name) { 
    window.currentSelectedMembers = window.currentSelectedMembers || [];
    window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); 
    if(window.renderSelectedMembers) window.renderSelectedMembers(); 
};

window.renderSelectedMembers = function() { 
    const container = document.getElementById('ps-selected-members'); 
    const memInput = document.getElementById('ps-members');
    const membersList = window.currentSelectedMembers || [];
    if(memInput) memInput.value = membersList.join(', '); 
    if(container) {
        container.innerHTML = membersList.map(function(name) {
            return `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`;
        }).join(''); 
    }
};

window.openProjHistoryModal = function() {
    try {
        const el = document.getElementById('ps-id');
        if(!el) return;
        const projectId = el.value;
        if(!projectId) return;
        
        const modal = document.getElementById('proj-history-modal');
        if(modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            if(window.loadProjectHistory) window.loadProjectHistory(projectId);
        }
    } catch(e) {}
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
            safeShowSuccess("복원되었습니다."); 
            if(window.closeProjHistoryModal) window.closeProjHistoryModal(); 
            if(window.editProjStatus) window.editProjStatus(projectId);
        }
    } catch(e) { 
        safeShowError("복원 실패", e); 
    }
};

window.toggleProjDashView = function(view) {
    window.currentProjDashView = view;
    
    const listC = document.getElementById('proj-dash-list-container');
    const ganttC = document.getElementById('proj-dash-gantt-container');
    const calC = document.getElementById('proj-dash-calendar-container');
    
    if(listC) listC.classList.add('hidden'); 
    if(ganttC) { ganttC.classList.add('hidden'); ganttC.classList.remove('flex'); } 
    if(calC) { calC.classList.add('hidden'); calC.classList.remove('flex'); }
    
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
        if(window.renderProjectStatusList) window.renderProjectStatusList();
    } else if(view === 'gantt' && ganttC) { 
        ganttC.classList.remove('hidden'); 
        ganttC.classList.add('flex');
        if(window.renderProjGantt) window.renderProjGantt(); 
    } else if(view === 'calendar' && calC) { 
        calC.classList.remove('hidden'); 
        calC.classList.add('flex');
        if(window.renderProjCalendar) window.renderProjCalendar(); 
    }
};

// 💡 [핵심 수정] 뷰어 렌더링 - 완벽한 간트 차트 형식
window.scrollToGanttToday = function() {
    const container = document.getElementById('proj-dash-gantt-content');
    const todayLine = document.getElementById('gantt-today-line');
    if(container && todayLine) {
        // Scroll the horizontal container to the today line
        const lineOffset = todayLine.offsetLeft;
        const containerWidth = container.offsetWidth;
        container.scrollTo({ left: lineOffset - (containerWidth / 2) + 150, behavior: 'smooth' });
    }
};

window.renderProjGantt = function() {
    try {
        const container = document.getElementById('proj-dash-gantt-content');
        if(!container) return;
        const projects = window.getFilteredProjects();
        
        if(projects.length === 0) {
            container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold">조건에 맞는 프로젝트가 없습니다.</div>';
            return;
        }

        let minDate = new Date(); minDate.setDate(minDate.getDate() - 7);
        let maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 14);
        
        projects.forEach(p => {
            const s = new Date(p.d_asmSt || p.d_asmEst || p.d_shipEst || p.createdAt);
            const e = new Date(p.d_shipEn || p.d_shipEst || p.d_asmEst || p.createdAt);
            if (!isNaN(s.getTime()) && s < minDate) minDate = new Date(s);
            if (!isNaN(e.getTime()) && e > maxDate) maxDate = new Date(e);
        });
        
        minDate.setDate(minDate.getDate() - 7);
        maxDate.setDate(maxDate.getDate() + 7);
        
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
        if (totalDays <= 0) return;

        let headerHtml = '<div class="flex relative h-8 border-b border-slate-200 mb-2 ml-[300px]">';
        for(let i=0; i<=totalDays; i++) { 
            if (i % 7 === 0) { 
                let d = new Date(minDate); d.setDate(d.getDate() + i);
                let pct = (i / totalDays) * 100;
                headerHtml += `<div class="absolute text-[10px] text-slate-400 font-bold -translate-x-1/2 bottom-1" style="left:${pct}%">${d.getMonth()+1}/${d.getDate()}</div>`;
            }
        }
        headerHtml += '</div>';

        let todayPct = ((new Date() - minDate) / (1000 * 60 * 60 * 24)) / totalDays * 100;

        let html = `<div class="relative min-w-[1000px] p-4 bg-white rounded-lg">`;
        html += headerHtml;
        html += `<div class="relative">`;
        
        // 💡 오늘 날짜 기준선
        if(todayPct >= 0 && todayPct <= 100) {
            html += `<div id="gantt-today-line" class="absolute top-0 bottom-0 w-[2px] bg-rose-500/80 z-20 pointer-events-none" style="left: calc(300px + ${todayPct}% - 300px); margin-left: 300px;">
                        <div class="absolute -top-4 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm">오늘</div>
                     </div>`;
        }

        projects.forEach(p => {
            let startStr = p.d_asmSt || p.d_asmEst || p.d_shipEst;
            let endStr = p.d_shipEn || p.d_shipEst || p.d_asmEst;
            let title = `[${p.code||'-'}] ${p.name}`;
            
            let sDate = new Date(startStr);
            let eDate = new Date(endStr);
            
            let barHtml = '';
            if(!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                if (sDate > eDate) { let t = sDate; sDate = eDate; eDate = t; }
                let leftPct = ((sDate - minDate) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                let widthPct = ((eDate - sDate) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                
                if (leftPct < 0) { widthPct += leftPct; leftPct = 0; }
                if (leftPct + widthPct > 100) { widthPct = 100 - leftPct; }
                if (widthPct < 0.5) widthPct = 0.5;

                barHtml = `<div class="absolute h-5 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 shadow-sm" style="left:${leftPct}%; width:${widthPct}%;"></div>`;
            } else {
                barHtml = `<div class="text-[10px] text-slate-400 italic px-4 w-full text-center">일정 미지정</div>`;
            }
            
            html += `
            <div class="flex items-center text-xs group w-full mb-3 hover:bg-slate-50 p-1.5 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-indigo-100" onclick="window.editProjStatus('${p.id}')">
                <div class="w-[280px] font-bold truncate pr-4 text-slate-700 shrink-0" title="${title}">${title}</div>
                <div class="flex-1 relative h-8 flex items-center border-l border-slate-200 pl-4 bg-slate-50/50 rounded-r-lg">
                    ${barHtml}
                </div>
                <div class="w-16 text-right text-[11px] font-black text-emerald-600 shrink-0 pr-2">${p.progress||0}%</div>
            </div>`;
        });
        
        html += `</div></div>`;
        container.innerHTML = html;
        
        // 렌더링 직후 스크롤 이동
        setTimeout(window.scrollToGanttToday, 50);
        
    } catch(e) {
        console.error("Gantt Rendering Error:", e);
        const container = document.getElementById('proj-dash-gantt-content');
        if(container) container.innerHTML = `<div class="text-center p-10 text-rose-500 font-bold">간트 차트를 렌더링하는 중 오류가 발생했습니다.<br>${e.message}</div>`;
    }
};

// 💡 [핵심 수정] 뷰어 렌더링 - 캘린더 오류 방어
window.renderProjCalendar = function() {
    try {
        const container = document.getElementById('proj-dash-calendar-content');
        if(!container) return;
        
        const projects = window.getFilteredProjects();
        const now = window.calendarCurrentDate || new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        
        let html = `
        <div class="flex justify-between items-center mb-4">
            <button onclick="window.calendarCurrentDate.setMonth(window.calendarCurrentDate.getMonth()-1); window.renderProjCalendar()" class="p-2 text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-chevron-left"></i></button>
            <h3 class="text-sm font-black text-slate-800">${year}년 ${month}월 출하/조립 일정</h3>
            <button onclick="window.calendarCurrentDate.setMonth(window.calendarCurrentDate.getMonth()+1); window.renderProjCalendar()" class="p-2 text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        `;
        
        html += `<div class="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">`;
        const days = ['일','월','화','수','목','금','토'];
        days.forEach(d => html += `<div class="bg-slate-50 text-center py-2 text-[10px] font-bold ${d==='일'?'text-rose-500':(d==='토'?'text-blue-500':'text-slate-600')}">${d}</div>`);
        
        const firstDay = new Date(year, month - 1, 1).getDay();
        const lastDate = new Date(year, month, 0).getDate();
        
        for(let i=0; i<firstDay; i++) html += `<div class="bg-white min-h-[100px] p-1 opacity-50"></div>`;
        
        for(let d=1; d<=lastDate; d++) {
            let dStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            let isToday = dStr === window.getLocalDateStr(new Date());
            
            let dayPjts = projects.filter(p => p.d_shipEst === dStr || p.d_shipEn === dStr || p.d_asmSt === dStr || p.d_asmEst === dStr);
            
            let pjtHtml = dayPjts.map(p => {
                let isShip = (p.d_shipEst === dStr || p.d_shipEn === dStr);
                let badgeClass = isShip ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200';
                let icon = isShip ? 'fa-truck-fast' : 'fa-wrench';
                let titleSafe = `[${p.code||'-'}] ${p.name}`.replace(/"/g, '&quot;');
                return `<div class="text-[9px] font-bold border px-1 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm ${badgeClass}" onclick="window.editProjStatus('${p.id}')" title="${titleSafe}"><i class="fa-solid ${icon} mr-1"></i>${p.code||p.name}</div>`;
            }).join('');
            
            html += `<div class="bg-white min-h-[100px] p-1 border-t-2 ${isToday?'border-indigo-500':'border-transparent'} flex flex-col">
                <span class="text-[10px] font-bold text-slate-500 text-center mb-1 ${isToday?'bg-indigo-600 text-white rounded-full w-5 h-5 mx-auto leading-5 shadow-md':''}">${d}</span>
                <div class="flex-1 overflow-y-auto custom-scrollbar">${pjtHtml}</div>
            </div>`;
        }
        html += `</div>`;
        container.innerHTML = html;
    } catch(e) {
        console.error("Calendar Rendering Error:", e);
        const container = document.getElementById('proj-dash-calendar-content');
        if(container) container.innerHTML = `<div class="text-center p-10 text-rose-500 font-bold">달력을 렌더링하는 중 오류가 발생했습니다.<br>${e.message}</div>`;
    }
};

window.openPurchaseModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('purchase-modal');
        if(!modal) { safeShowError('구매 모달창 요소를 찾을 수 없습니다.'); return; }

        const reqIdEl = document.getElementById('pur-req-id'); if(reqIdEl) reqIdEl.value = projectId || '';
        const titleEl = document.getElementById('pur-project-title'); if(titleEl) titleEl.innerText = title || '';

        if(window.resetPurchaseForm) window.resetPurchaseForm();

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        if(window.initGoogleAPI) window.initGoogleAPI();

        if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe();
        currentPurchaseUnsubscribe = onSnapshot(query(collection(db, "project_purchases"), where("projectId", "==", projectId)), function(snap) {
            try {
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
                    let attachmentsHtml = window.generateMediaHtml(item.files);

                    return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                <div class="flex justify-between items-start">
                                    <div class="flex items-center gap-2"><span class="font-bold text-amber-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div>
                                    <div class="flex gap-2"><button onclick="window.deletePurchase('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div>
                                </div>
                                <div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>
                                ${attachmentsHtml}
                            </div>`;
                }).join('');
            } catch(e) {
                console.error("구매 목록 렌더링 에러:", e);
            }
        });
    } catch(e) {
        safeShowError('구매 모달창을 여는 중 에러가 발생했습니다.', e);
    }
};

window.closePurchaseModal = function() { const m = document.getElementById('purchase-modal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} if(currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); };
window.resetPurchaseForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-pur-id', ''); setVal('new-pur-text', ''); setVal('new-pur-file', ''); 
    const fname = document.getElementById('pur-file-name'); if(fname) fname.innerText = ''; 
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
    if(!content && fileInput.files.length === 0) return safeShowError("내용이나 파일을 첨부하세요.");
    
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let url = await handleDriveUploadWithProgress(fileInput.files[i], folderName, '구매', i+1, total);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }
        
        const payload = { 
            projectId: pId, 
            content: content, 
            files: filesData, 
            authorUid: (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system', 
            authorName: (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system', 
            createdAt: Date.now() 
        };
        
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(k => { if(cleanPayload[k] === undefined) cleanPayload[k] = null; });
        
        await addDoc(collection(db, "project_purchases"), cleanPayload);
        safeShowSuccess("구매 내역이 등록되었습니다."); 
        if(window.resetPurchaseForm) window.resetPurchaseForm(); 
    } catch(e) { 
        safeShowError("저장 실패", e); 
    } finally { 
        btn.innerHTML = '등록'; btn.disabled = false; 
    }
};

window.deletePurchase = async function(id) { 
    if(confirm("삭제하시겠습니까?")) { 
        try { 
            await deleteDoc(doc(db, "project_purchases", id)); 
            safeShowSuccess("삭제되었습니다."); 
        } catch(e) { 
            safeShowError("삭제 실패", e); 
        } 
    } 
};

window.openDesignModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('design-modal');
        if(!modal) { safeShowError('설계 모달창 요소를 찾을 수 없습니다.'); return; }

        const reqIdEl = document.getElementById('des-req-id'); if(reqIdEl) reqIdEl.value = projectId || '';
        const titleEl = document.getElementById('des-project-title'); if(titleEl) titleEl.innerText = title || '';

        if(window.resetDesignForm) window.resetDesignForm();

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        if(window.initGoogleAPI) window.initGoogleAPI();

        if (currentDesignUnsubscribe) currentDesignUnsubscribe();
        currentDesignUnsubscribe = onSnapshot(query(collection(db, "project_designs"), where("projectId", "==", projectId)), function(snap) {
            try {
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
                    let attachmentsHtml = window.generateMediaHtml(item.files);

                    return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                <div class="flex justify-between items-start">
                                    <div class="flex items-center gap-2"><span class="font-bold text-teal-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div>
                                    <div class="flex gap-2"><button onclick="window.deleteDesign('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div>
                                </div>
                                <div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>
                                ${attachmentsHtml}
                            </div>`;
                }).join('');
            } catch(e) {
                console.error("설계 목록 렌더링 에러:", e);
            }
        });
    } catch(e) {
        safeShowError('설계 모달창을 여는 중 에러가 발생했습니다.', e);
    }
};

window.closeDesignModal = function() { const m = document.getElementById('design-modal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} if (currentDesignUnsubscribe) currentDesignUnsubscribe(); };
window.resetDesignForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
    setVal('editing-des-id', ''); setVal('new-des-text', ''); setVal('new-des-file', ''); 
    const fname = document.getElementById('des-file-name'); if(fname) fname.innerText = ''; 
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
    if(!content && fileInput.files.length === 0) return safeShowError("내용이나 파일을 첨부하세요.");
    
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let url = await handleDriveUploadWithProgress(fileInput.files[i], folderName, '설계', i+1, total);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }
        
        const payload = { 
            projectId: pId, 
            content: content, 
            files: filesData, 
            authorUid: (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system', 
            authorName: (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system', 
            createdAt: Date.now() 
        };
        
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(k => { if(cleanPayload[k] === undefined) cleanPayload[k] = null; });

        await addDoc(collection(db, "project_designs"), cleanPayload);
        safeShowSuccess("설계 내역이 등록되었습니다."); 
        if(window.resetDesignForm) window.resetDesignForm(); 
    } catch(e) { 
        safeShowError("저장 실패", e); 
    } finally { 
        btn.innerHTML = '등록'; btn.disabled = false; 
    }
};

window.deleteDesign = async function(id) { 
    if(confirm("삭제하시겠습니까?")) { 
        try { 
            await deleteDoc(doc(db, "project_designs", id)); 
            safeShowSuccess("삭제되었습니다."); 
        } catch(e) { 
            safeShowError("삭제 실패", e); 
        } 
    } 
};

window.openPjtScheduleModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('pjt-schedule-modal');
        if(!modal) { safeShowError('일정표 모달창 요소를 찾을 수 없습니다.'); return; }

        const reqIdEl = document.getElementById('sch-req-id'); if(reqIdEl) reqIdEl.value = projectId || '';
        const titleEl = document.getElementById('sch-project-title'); if(titleEl) titleEl.innerText = title || '';

        if(window.resetPjtScheduleForm) window.resetPjtScheduleForm();

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        if(window.initGoogleAPI) window.initGoogleAPI();

        if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe();
        currentPjtScheduleUnsubscribe = onSnapshot(query(collection(db, "project_schedules"), where("projectId", "==", projectId)), function(snap) {
            try {
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
                    let attachmentsHtml = window.generateMediaHtml(item.files);

                    return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                                <div class="flex justify-between items-start">
                                    <div class="flex items-center gap-2"><span class="font-bold text-fuchsia-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div>
                                    <div class="flex gap-2"><button onclick="window.deletePjtSchedule('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div>
                                </div>
                                <div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>
                                ${attachmentsHtml}
                            </div>`;
                }).join('');
            } catch(e) {
                console.error("일정표 목록 렌더링 에러:", e);
            }
        });
    } catch(e) {
        safeShowError('일정표 모달창을 여는 중 에러가 발생했습니다.', e);
    }
};

window.closePjtScheduleModal = function() { const m = document.getElementById('pjt-schedule-modal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); };
window.resetPjtScheduleForm = function() { 
    const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) value = val; };
    setVal('editing-sch-id', ''); setVal('new-sch-text', ''); setVal('new-sch-file', ''); 
    const fname = document.getElementById('sch-file-name'); if(fname) fname.innerText = ''; 
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
    if(!content && fileInput.files.length === 0) return safeShowError("내용이나 파일을 첨부하세요.");
    
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let url = await handleDriveUploadWithProgress(fileInput.files[i], folderName, '일정', i+1, total);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }
        
        const payload = { 
            projectId: pId, 
            content: content, 
            files: filesData, 
            authorUid: (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system', 
            authorName: (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system', 
            createdAt: Date.now() 
        };
        
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(k => { if(cleanPayload[k] === undefined) cleanPayload[k] = null; });

        await addDoc(collection(db, "project_schedules"), cleanPayload);
        safeShowSuccess("PJT 일정 내역이 등록되었습니다."); 
        if(window.resetPjtScheduleForm) window.resetPjtScheduleForm(); 
    } catch(e) { 
        safeShowError("저장 실패", e); 
    } finally { 
        btn.innerHTML = '등록'; btn.disabled = false; 
    }
};

window.deletePjtSchedule = async function(id) { 
    if(confirm("삭제하시겠습니까?")) { 
        try { 
            await deleteDoc(doc(db, "project_schedules", id)); 
            safeShowSuccess("삭제되었습니다."); 
        } catch(e) { 
            safeShowError("삭제 실패", e); 
        } 
    } 
};

// 💡 1. 생산일지 팀원 추가 기능 구현 함수 (UI 복원)
window.addLogMember = function(name) {
    if(!name) return;
    window.currentLogMembers = window.currentLogMembers || [];
    if(!window.currentLogMembers.includes(name)) {
        window.currentLogMembers.push(name);
        if(window.renderLogMembers) window.renderLogMembers();
    }
    const el = document.getElementById('log-member-add') || document.getElementById('md-member-add');
    if(el) el.selectedIndex = 0;
};

window.removeLogMember = function(name) {
    window.currentLogMembers = window.currentLogMembers || [];
    window.currentLogMembers = window.currentLogMembers.filter(n => n !== name);
    if(window.renderLogMembers) window.renderLogMembers();
};

window.renderLogMembers = function() {
    const container = document.getElementById('log-selected-members');
    const memInput = document.getElementById('log-members');
    const membersList = window.currentLogMembers || [];
    
    if(memInput) memInput.value = membersList.join(', ');
    
    if(container) {
        container.innerHTML = membersList.map(function(name) {
            return `<span class="bg-sky-100 text-sky-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeLogMember('${name}')"></i></span>`;
        }).join('');
    }
};

window.openDailyLogModal = function(projectId) { 
    try {
        // 💡 매번 생산일지를 열 때마다 구글 연동이 풀리지 않았는지 재확인
        if(window.initGoogleAPI) window.initGoogleAPI(); 
        
        const modal = document.getElementById('daily-log-modal');
        if(!modal) { safeShowError('생산일지 모달창 요소를 찾을 수 없습니다.'); return; }
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        
        const reqEl = document.getElementById('log-req-id'); if(reqEl) reqEl.value = projectId || '';
        const titleEl = document.getElementById('log-project-title'); if(titleEl) titleEl.innerText = proj.name || '';
        const progEl = document.getElementById('log-project-progress'); if(progEl) progEl.value = proj.progress || 0;
        const rateEl = document.getElementById('log-project-purchase-rate'); if(rateEl) rateEl.value = proj.purchaseRate || 0;

        const members = window.teamMembers || [];
        const mHtml = '<option value="">팀원 추가</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        const logMemberSelect = document.getElementById('log-member-add');
        if(logMemberSelect) logMemberSelect.innerHTML = mHtml;

        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex');
        
        if(window.loadDailyLogs) window.loadDailyLogs(projectId); 
    } catch(e) { safeShowError('생산일지 창을 여는 중 에러 발생', e); }
};

window.loadDailyLogs = function(projectId) { 
    if (currentLogUnsubscribe) currentLogUnsubscribe(); 
    currentLogUnsubscribe = onSnapshot(collection(db, "daily_logs"), function(snapshot) { 
        try {
            window.currentDailyLogs = []; 
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                if(d.projectId === projectId || d.reqId === projectId) { d.id = docSnap.id; window.currentDailyLogs.push(d); } 
            }); 
            window.currentDailyLogs.sort((a, b) => { 
                let da = a.date || '', db = b.date || ''; 
                if(da !== db) return db.localeCompare(da); 
                return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); 
            }); 
            if(window.renderDailyLogs) window.renderDailyLogs(window.currentDailyLogs); 
        } catch(e) { console.error("생산일지 목록 에러:", e); }
    }); 
};

window.renderDailyLogs = function(logs) { 
    const list = document.getElementById('daily-log-list'); 
    if(!list) return;
    if (logs.length === 0) { list.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; return; } 
    try {
        list.innerHTML = logs.map(log => {
            let safeContent = getSafeString(log.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            
            let legacyFiles = [];
            if(log.imageUrl) legacyFiles.push({ name: '첨부사진.jpg', url: log.imageUrl, thumbBase64: log.imageUrl });
            let allFiles = log.files && log.files.length > 0 ? [...legacyFiles, ...log.files] : legacyFiles;
            let attachmentsHtml = window.generateMediaHtml(allFiles);
            
            let workersHtml = `<span class="font-bold text-slate-700">${getSafeString(log.authorName)}</span>`;
            if (log.members) {
                const membersArr = String(log.members).split(',').map(s=>s.trim()).filter(Boolean);
                if(membersArr.length > 0) workersHtml = membersArr.map(n => `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] shadow-sm border border-slate-200">${n}</span>`).join(' ');
            }

            let btnHtml = '';
            if (log.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) {
                btnHtml = `<button onclick="window.editDailyLog('${log.id}')" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-3"><span class="font-bold text-sky-600 text-xs flex items-center gap-1"><i class="fa-regular fa-calendar text-sky-400"></i> ${getSafeString(log.date)}</span><div class="flex flex-wrap gap-1">${workersHtml}</div></div>
                            <div class="flex gap-2">${btnHtml}</div>
                        </div>
                        <div class="text-slate-700 font-medium text-[13px] pl-1 mt-2 mb-1 break-words leading-relaxed">${safeContent}</div>
                        ${attachmentsHtml}
                    </div>`; 
        }).join('');
    } catch(e) { list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; }
};

window.saveDailyLogItem = async function() { 
    const pIdEl = document.getElementById('log-req-id'); if(!pIdEl) return;
    const projectId = pIdEl.value; 
    
    const logId = document.getElementById('editing-log-id') ? document.getElementById('editing-log-id').value : ''; 
    const date = document.getElementById('new-log-date') ? document.getElementById('new-log-date').value : ''; 
    const content = document.getElementById('new-log-text') ? document.getElementById('new-log-text').value.trim() : ''; 
    const fileInput = document.getElementById('new-log-image'); 
    const progressVal = document.getElementById('log-project-progress') ? (parseInt(document.getElementById('log-project-progress').value) || 0) : 0; 
    const purchaseRateVal = document.getElementById('log-project-purchase-rate') ? (parseInt(document.getElementById('log-project-purchase-rate').value) || 0) : 0; 
    const members = document.getElementById('log-members') ? document.getElementById('log-members').value : '';

    if(!date || (!content && (!fileInput || fileInput.files.length === 0))) return safeShowError("날짜와 내용을 입력하거나 사진을 첨부하세요."); 
    
    const btnSave = document.getElementById('btn-log-save');
    if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
    try { 
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {};
        const folderName = proj.code || proj.name || '미지정';
        let filesData = [];
        
        if (fileInput && fileInput.files.length > 0) {
            let total = fileInput.files.length;
            for(let i=0; i<total; i++) {
                let url = await handleDriveUploadWithProgress(fileInput.files[i], folderName, '생산일지', i+1, total);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }

        const payload = { 
            date: date, 
            content: content, 
            members: members, 
            files: filesData, 
            updatedAt: Date.now() 
        }; 
        
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(k => { if(cleanPayload[k] === undefined) cleanPayload[k] = null; });

        if (logId) {
            await setDoc(doc(db, "daily_logs", logId), cleanPayload, { merge: true });
            safeShowSuccess("일지가 수정되었습니다.");
        } else {
            cleanPayload.projectId = projectId; 
            cleanPayload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; 
            cleanPayload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system'; 
            cleanPayload.createdAt = Date.now();
            await addDoc(collection(db, "daily_logs"), cleanPayload);
            safeShowSuccess("일지가 등록되었습니다.");
            
            if(window.processMentions) await window.processMentions(content, projectId, "생산일지");
        }
        
        await setDoc(doc(db, "projects_status", projectId), { progress: progressVal, purchaseRate: purchaseRateVal }, { merge: true }); 
        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
    } catch(e) { safeShowError("저장 실패", e); } 
    finally { if(btnSave) { btnSave.innerHTML = '등록'; btnSave.disabled = false; } } 
};

window.editDailyLog = function(id) { 
    const log = (window.currentDailyLogs || []).find(l => l.id === id); 
    if(!log) return; 
    document.getElementById('editing-log-id').value = id; 
    document.getElementById('new-log-date').value = log.date || window.getLocalDateStr(new Date()); 
    document.getElementById('new-log-text').value = log.content || ''; 
    window.currentLogMembers = (log.members && typeof log.members === 'string') ? log.members.split(',').map(s=>s.trim()).filter(Boolean) : [];
    if(window.renderLogMembers) window.renderLogMembers();
    const btnSave = document.getElementById('btn-log-save'); if(btnSave) btnSave.innerText = '수정'; 
    const btnCancel = document.getElementById('btn-log-cancel'); if(btnCancel) btnCancel.classList.remove('hidden'); 
    const txt = document.getElementById('new-log-text'); if(txt) txt.focus(); 
};

window.deleteDailyLog = async function(id) { 
    if(!confirm("이 일지를 삭제하시겠습니까?")) return; 
    try { await deleteDoc(doc(db, "daily_logs", id)); safeShowSuccess("삭제되었습니다."); if(window.resetDailyLogForm) window.resetDailyLogForm(); } 
    catch(e) { safeShowError("삭제 실패", e); } 
};

window.resetDailyLogForm = function() { 
    if(document.getElementById('editing-log-id')) document.getElementById('editing-log-id').value = ''; 
    if(document.getElementById('new-log-date')) document.getElementById('new-log-date').value = window.getLocalDateStr(new Date()); 
    if(document.getElementById('new-log-text')) document.getElementById('new-log-text').value = ''; 
    if(document.getElementById('new-log-image')) document.getElementById('new-log-image').value = ''; 
    if(window.clearDailyLogFile) window.clearDailyLogFile();
    
    window.currentLogMembers = (window.userProfile && window.userProfile.name) ? [window.userProfile.name] : []; 
    if(window.renderLogMembers) window.renderLogMembers();
    
    const btnSave = document.getElementById('btn-log-save'); if(btnSave) btnSave.innerText = '등록'; 
    const btnCancel = document.getElementById('btn-log-cancel'); if(btnCancel) btnCancel.classList.add('hidden'); 
};

window.closeDailyLogModal = function() { 
    const m = document.getElementById('daily-log-modal'); 
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } 
    if (currentLogUnsubscribe) currentLogUnsubscribe(); 
};

window.clearDailyLogFile = function(e) {
    if(e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const input = document.getElementById('new-log-image'), wrap = document.getElementById('new-log-filename-wrap');
    if(input) input.value = ''; if(wrap) wrap.classList.add('hidden');
};

window.openMdLogModal = function(projectId, title, curMd) { 
    try {
        const modal = document.getElementById('md-log-modal');
        if(!modal) { safeShowError('MD로그 모달 요소를 찾을 수 없습니다.'); return; }
        modal.classList.remove('hidden'); modal.classList.add('flex'); 
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        const reqEl = document.getElementById('md-req-id'); if(reqEl) reqEl.value = projectId; 
        const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; 
        
        const members = window.teamMembers || [];
        const mHtml = '<option value="">팀원 추가</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        const logMemberSelect = document.getElementById('md-member-add') || document.getElementById('log-member-add');
        if(logMemberSelect) logMemberSelect.innerHTML = mHtml;

        if(window.resetMdLogForm) window.resetMdLogForm(); 
        
        if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); 
        currentMdLogUnsubscribe = onSnapshot(collection(db, "project_md_logs"), function(snapshot) { 
            window.currentMdLogs = []; let totalMd = 0; 
            snapshot.forEach(function(docSnap) { const d = docSnap.data(); if(d.projectId === projectId) { d.id = docSnap.id; window.currentMdLogs.push(d); totalMd += parseFloat(d.md) || 0; } }); 
            window.currentMdLogs.sort((a, b) => { let da = a.date||'', db = b.date||''; if(da!==db) return db.localeCompare(da); return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); });
            if(badge) badge.innerText = '총 ' + totalMd.toFixed(1) + ' MD'; 
            const list = document.getElementById('md-log-list'); if(!list) return;
            if (window.currentMdLogs.length === 0) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; return; } 
            list.innerHTML = window.currentMdLogs.map(log => {
                let safeDesc = getSafeString(log.desc).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let workersHtml = `<span class="font-bold text-slate-500">${getSafeString(log.authorName)}</span>`;
                if (log.members) {
                    const membersArr = String(log.members).split(',').map(s=>s.trim()).filter(Boolean);
                    if(membersArr.length > 0) workersHtml = membersArr.map(n => `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] shadow-sm whitespace-nowrap border border-slate-200">${n}</span>`).join(' ');
                }
                let btnHtml = (log.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : '-';
                return `<tr class="hover:bg-purple-50/30 transition-colors"><td class="p-3 text-center text-slate-500 font-bold">${getSafeString(log.date)}</td><td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td><td class="p-3 text-slate-700">${safeDesc || '-'}</td><td class="p-3 text-center flex flex-wrap justify-center gap-1 mt-2">${workersHtml}</td><td class="p-3 text-center"><div class="flex justify-center gap-2">${btnHtml}</div></td></tr>`;
            }).join('');
        }); 
    } catch(e) { safeShowError('MD로그 모달을 열 수 없습니다.', e); }
};

window.closeMdLogModal = function() { const m = document.getElementById('md-log-modal'); if(m){m.classList.add('hidden'); m.classList.remove('flex');} if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); };
window.resetMdLogForm = function() { 
    if(document.getElementById('editing-md-id')) document.getElementById('editing-md-id').value = ''; 
    if(document.getElementById('new-md-date')) document.getElementById('new-md-date').value = window.getLocalDateStr(new Date()); 
    if(document.getElementById('new-md-val')) document.getElementById('new-md-val').value = ''; 
    if(document.getElementById('new-md-desc')) document.getElementById('new-md-desc').value = ''; 
    window.currentLogMembers = (window.userProfile && window.userProfile.name) ? [window.userProfile.name] : []; 
    if(window.renderLogMembers) window.renderLogMembers(); 
    if(document.getElementById('btn-md-save')) document.getElementById('btn-md-save').innerText = '등록'; 
    if(document.getElementById('btn-md-cancel')) document.getElementById('btn-md-cancel').classList.add('hidden'); 
};

window.saveMdLogItem = async function() { 
    const projectId = document.getElementById('md-req-id').value, logId = document.getElementById('editing-md-id').value, date = document.getElementById('new-md-date').value, mdVal = document.getElementById('new-md-val').value, desc = document.getElementById('new-md-desc').value.trim(), members = document.getElementById('log-members') ? document.getElementById('log-members').value : '';
    if(!date || !mdVal) return safeShowError("날짜와 투입 MD를 입력하세요."); 
    const btnSave = document.getElementById('btn-md-save'); if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    try { 
        const payload = { date: date, md: parseFloat(mdVal), desc: desc, members: members, updatedAt: Date.now() }; 
        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(k => { if(cleanPayload[k] === undefined) cleanPayload[k] = null; });
        
        if (logId) { 
            await setDoc(doc(db, "project_md_logs", logId), cleanPayload, { merge: true }); 
            safeShowSuccess("MD 내역이 수정되었습니다."); 
        } else { 
            cleanPayload.projectId = projectId; 
            cleanPayload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; 
            cleanPayload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system'; 
            cleanPayload.createdAt = Date.now(); 
            await addDoc(collection(db, "project_md_logs"), cleanPayload); 
            safeShowSuccess("MD 내역이 등록되었습니다."); 
        } 
        if(window.updateProjectTotalMd) await window.updateProjectTotalMd(projectId); 
        if(window.resetMdLogForm) window.resetMdLogForm(); 
    } catch(e) { safeShowError("저장 중 오류 발생", e); } finally { if(btnSave) { btnSave.innerHTML = '등록'; btnSave.disabled = false; } } 
};
window.deleteMdLog = async function(id, projectId) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_md_logs", id)); if(window.updateProjectTotalMd) await window.updateProjectTotalMd(projectId); safeShowSuccess("삭제되었습니다."); if(window.resetMdLogForm) window.resetMdLogForm(); } catch(e) { safeShowError("삭제 실패", e); } };
window.editMdLog = function(id) { const log = (window.currentMdLogs || []).find(l => l.id === id); if(!log) return; document.getElementById('editing-md-id').value = id; document.getElementById('new-md-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = log.md || ''; document.getElementById('new-md-desc').value = log.desc || ''; window.currentLogMembers = (log.members && typeof log.members === 'string') ? log.members.split(',').map(s=>s.trim()).filter(Boolean) : []; if(window.renderLogMembers) window.renderLogMembers(); const btnSave = document.getElementById('btn-md-save'); if(btnSave) btnSave.innerText = '수정'; const btnCancel = document.getElementById('btn-md-cancel'); if(btnCancel) btnCancel.classList.remove('hidden'); };
window.updateProjectTotalMd = async function(projectId) { const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); let total = 0; snap.forEach(docSnap => total += parseFloat(docSnap.data().md) || 0); const projRef = doc(db, "projects_status", projectId); const projSnap = await getDoc(projRef); if(projSnap.exists()) { const outMd = parseFloat(projSnap.data().outMd) || 0; await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); } };

window.openIssueModal = function(projectId, title) { 
    const modal = document.getElementById('issue-modal'); if(!modal) { safeShowError("이슈 모달 요소 없음"); return; }
    modal.classList.remove('hidden'); modal.classList.add('flex'); 
    try {
        document.getElementById('issue-req-id').value = projectId; document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; 
        const btn = document.getElementById('btn-issue-save'); if(btn) btn.innerText = '등록'; 
        if (currentIssueUnsubscribe) currentIssueUnsubscribe(); 
        currentIssueUnsubscribe = onSnapshot(collection(db, "project_issues"), function(snapshot) { 
            window.currentIssues = []; snapshot.forEach(docSnap => { const d = docSnap.data(); if(d.projectId === projectId) { d.id = docSnap.id; window.currentIssues.push(d); } }); 
            window.currentIssues.sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            const list = document.getElementById('issue-list'); if(!list) return;
            if (window.currentIssues.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; return; } 
            list.innerHTML = window.currentIssues.map(iss => {
                let safeText = getSafeString(iss.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let btnHtml = (iss.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-4 rounded-xl border ${iss.isResolved ? 'border-slate-200 bg-slate-50' : 'border-rose-200 shadow-sm'} flex items-start gap-3 transition-all"><div class="mt-0.5"><input type="checkbox" ${iss.isResolved?'checked':''} onchange="window.toggleIssueStatus('${iss.id}', this.checked)" class="w-5 h-5 text-rose-500 rounded border-gray-300 cursor-pointer"></div><div class="flex-1 flex flex-col gap-1"><div class="flex justify-between items-center"><span class="font-bold text-sm ${iss.isResolved?'text-slate-400':'text-rose-600'}">${getSafeString(iss.authorName)}</span><div class="flex gap-2">${btnHtml}</div></div><div class="text-[13px] font-medium mt-1 leading-relaxed ${iss.isResolved?'text-slate-400 line-through':'text-slate-700'} break-words">${safeText}</div></div></div>`;
            }).join('');
        }); 
    } catch(e) { safeShowError('이슈 모달 에러', e); }
};
window.closeIssueModal = function() { const m = document.getElementById('issue-modal'); if(m){m.classList.add('hidden'); m.classList.remove('flex');} if (currentIssueUnsubscribe) currentIssueUnsubscribe(); };
window.saveIssueItem = async function() { 
    const projectId = document.getElementById('issue-req-id').value, editId = document.getElementById('editing-issue-id').value, content = document.getElementById('new-issue-text').value.trim(); 
    if(!content) return safeShowError("이슈 내용을 입력하세요."); 
    try { 
        if (editId) { await setDoc(doc(db, "project_issues", editId), { content: content, updatedAt: Date.now() }, { merge: true }); safeShowSuccess("이슈 수정됨"); } 
        else { await addDoc(collection(db, "project_issues"), { projectId: projectId, content: content, isResolved: false, authorUid: (window.currentUser&&window.currentUser.uid)?window.currentUser.uid:'system', authorName: (window.userProfile&&window.userProfile.name)?window.userProfile.name:'system', createdAt: Date.now() }); safeShowSuccess("이슈 등록됨"); } 
        document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; document.getElementById('btn-issue-save').innerText = '등록'; 
    } catch(e) { safeShowError("저장 오류", e); } 
};
window.toggleIssueStatus = async function(id, isResolved) { try { await setDoc(doc(db, "project_issues", id), { isResolved: isResolved }, { merge: true }); } catch(e) {} };
window.editIssue = function(id) { const iss = window.currentIssues.find(i => i.id === id); if(!iss) return; document.getElementById('editing-issue-id').value = id; document.getElementById('new-issue-text').value = iss.content || ''; document.getElementById('btn-issue-save').innerText = '수정'; document.getElementById('new-issue-text').focus(); };
window.deleteIssue = async function(id) { if(!confirm("이 이슈를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_issues", id)); safeShowSuccess("삭제됨"); } catch(e) { safeShowError("삭제 실패", e); } };

window.openCommentModal = function(projectId, title) { 
    const modal = document.getElementById('comment-modal'); if(!modal) { safeShowError("코멘트 모달 요소 없음"); return; }
    modal.classList.remove('hidden'); modal.classList.add('flex'); 
    try {
        document.getElementById('cmt-req-id').value = projectId; if(window.cancelCommentAction) window.cancelCommentAction(); 
        if (currentCommentUnsubscribe) currentCommentUnsubscribe(); 
        currentCommentUnsubscribe = onSnapshot(collection(db, "project_comments"), function(snapshot) { 
            window.currentComments = []; snapshot.forEach(docSnap => { const d = docSnap.data(); if(d.projectId === projectId) { d.id = docSnap.id; window.currentComments.push(d); } }); 
            const topLevel = window.currentComments.filter(c => !c.parentId || c.parentId === 'null' || c.parentId === '').sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            const replies = window.currentComments.filter(c => c.parentId && c.parentId !== 'null' && c.parentId !== '').sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            topLevel.forEach(c => c.replies = replies.filter(r => r.parentId === c.id)); 
            const list = document.getElementById('comment-list'); if(!list) return;
            if (topLevel.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; return; } 
            list.innerHTML = topLevel.map(c => {
                let safeContent = getSafeString(c.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let mainBtnHtml = (c.authorUid === (window.currentUser&&window.currentUser.uid) || (window.userProfile&&window.userProfile.role==='admin')) ? `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-bold text-slate-800 text-[15px]">${getSafeString(c.authorName)}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span></div><div class="flex gap-2"><button onclick="window.setReplyTo('${c.id}', '${getSafeString(c.authorName)}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1 rounded-lg font-bold shadow-sm">답글달기</button>${mainBtnHtml}</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 break-words">${safeContent}</div></div>`;
            }).join('');
        }); 
    } catch(e) { safeShowError('코멘트 로드 에러', e); }
};
window.closeCommentModal = function() { const m = document.getElementById('comment-modal'); if(m){m.classList.add('hidden'); m.classList.remove('flex');} if (currentCommentUnsubscribe) currentCommentUnsubscribe(); };
window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value, content = document.getElementById('new-cmt-text').value.trim(), parentId = document.getElementById('reply-to-id').value || null, editId = document.getElementById('editing-cmt-id').value; 
    if(!content) return safeShowError("코멘트를 입력하세요."); 
    const btnSave = document.getElementById('btn-cmt-save'); if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    try { 
        const payload = { content: content, updatedAt: Date.now() }; 
        if (editId) { await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); safeShowSuccess("수정됨"); } 
        else { payload.projectId = projectId; payload.parentId = parentId; payload.authorUid = (window.currentUser&&window.currentUser.uid)?window.currentUser.uid:'system'; payload.authorName = (window.userProfile&&window.userProfile.name)?window.userProfile.name:'system'; payload.createdAt = Date.now(); await addDoc(collection(db, "project_comments"), payload); safeShowSuccess("등록됨"); } 
        if(window.cancelCommentAction) window.cancelCommentAction(); 
    } catch(e) { safeShowError("저장 오류", e); } finally { if(btnSave) { btnSave.innerHTML = '작성'; btnSave.disabled = false; } } 
};
window.editComment = function(id) { const c = window.currentComments.find(x => x.id === id); if(!c) return; if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('editing-cmt-id').value = id; document.getElementById('new-cmt-text').value = c.content || ''; document.getElementById('btn-cmt-save').innerText = '수정'; document.getElementById('reply-indicator-name').innerHTML = '코멘트 수정 중'; document.getElementById('reply-indicator').classList.remove('hidden'); };
window.setReplyTo = function(cid, name) { if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('reply-to-id').value = cid; document.getElementById('reply-indicator-name').innerHTML = `${name} 님에게 답글 작성 중`; document.getElementById('reply-indicator').classList.remove('hidden'); };
window.cancelCommentAction = function() { document.getElementById('reply-to-id').value = ''; document.getElementById('editing-cmt-id').value = ''; document.getElementById('new-cmt-text').value = ''; document.getElementById('btn-cmt-save').innerText = '작성'; document.getElementById('reply-indicator').classList.add('hidden'); };
window.deleteComment = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_comments", id)); const q = query(collection(db, "project_comments"), where("parentId", "==", id)); const snapshot = await getDocs(q); if(!snapshot.empty) { const batch = writeBatch(db); snapshot.forEach(d => batch.delete(d.ref)); await batch.commit(); } safeShowSuccess("삭제됨"); if(window.cancelCommentAction) window.cancelCommentAction(); } catch(e) { safeShowError("삭제 실패", e); } };

window.openLinkModal = function(projectId, title) { 
    const modal = document.getElementById('link-modal'); if(!modal) return safeShowError("링크 모달 요소 없음");
    modal.classList.remove('hidden'); modal.classList.add('flex'); 
    try {
        document.getElementById('link-req-id').value = projectId; document.getElementById('link-project-title').innerText = title || ''; document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; 
        if(window.renderLinksList) window.renderLinksList(projectId); 
    } catch(e) { safeShowError('링크 모달 에러', e); }
};
window.closeLinkModal = function() { const m = document.getElementById('link-modal'); if(m){m.classList.add('hidden'); m.classList.remove('flex');} };
window.saveLinkItem = async function() { 
    const projectId = document.getElementById('link-req-id').value, name = document.getElementById('new-link-name').value.trim(), urlVal = document.getElementById('new-link-url').value.trim(); 
    if(!urlVal) return safeShowError("링크 URL을 입력하세요."); 
    const proj = window.currentProjectStatusList.find(p => p.id === projectId); let links = proj && proj.links ? proj.links.slice() : []; 
    let finalUrl = urlVal.startsWith('http') ? urlVal : 'https://' + urlVal; links.push({ name: name || '참고 링크', url: finalUrl }); 
    try { await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); safeShowSuccess("링크 추가됨"); document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; if(proj) proj.links = links; if(window.renderLinksList) window.renderLinksList(projectId); } catch(e) { safeShowError("추가 실패", e); } 
};
window.deleteLinkItem = async function(projectId, index) { if(!confirm("삭제하시겠습니까?")) return; const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj || !proj.links) return; let links = proj.links.slice(); links.splice(index, 1); try { await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); safeShowSuccess("링크 삭제됨"); if(proj) proj.links = links; if(window.renderLinksList) window.renderLinksList(projectId); } catch(e) { safeShowError("삭제 실패", e); } };

window.loadNcrData = async function() {
    try {
        if(window.showToast) window.showToast("부적합(RAWDATA) 데이터를 가져오는 중입니다...", "success");
        const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYwsWjs8ox503LLsRIeVRbbZ4R7eLgoq0C-ZdYIBIUACCwWyt5oYkAAtIpX9j1taqt1MQaEg1Jjom0/pub?gid=0&single=true&output=csv';
        const res = await fetch(csvUrl + (csvUrl.includes('?')?'&':'?') + 't=' + Date.now());
        if (!res.ok) throw new Error("시트 데이터 가져오기 실패");
        const csvText = await res.text();
        if (csvText.includes('<html') || csvText.includes('<body')) throw new Error("링크 형식 오류");

        const rows = []; let row = [], col = "", quote = false;
        for (let i = 0; i < csvText.length; i++) {
            let cc = csvText[i], nc = csvText[i+1];
            if (cc === '"' && quote && nc === '"') { col += cc; ++i; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { row.push(col); col = ""; continue; }
            if ((cc === '\r' || cc === '\n') && !quote) { if (row.length > 0 || col !== "") { row.push(col); rows.push(row); row = []; col = ""; } if (cc === '\r' && nc === '\n') i++; continue; }
            col += cc;
        }
        if (col !== "" || row.length > 0) { row.push(col); rows.push(row); }

        let dataStartIndex = 1;
        for (let i = 0; i < Math.min(5, rows.length); i++) { if (rows[i][0] && String(rows[i][0]).includes('NCR No')) { dataStartIndex = i + 1; break; } }
        window.ncrData = rows.slice(dataStartIndex).map(r => ({ ncrNo: r[0]?getSafeString(r[0]).trim():'', date: r[1]?getSafeString(r[1]).trim():'', pjtCode: r[2]?getSafeString(r[2]).trim():'', partName: r[3]?getSafeString(r[3]).trim():'', drawingNo: r[4]?getSafeString(r[4]).trim():'', type: r[12]?getSafeString(r[12]).trim():'', content: r[13]?getSafeString(r[13]).trim():'', status: r[15]?getSafeString(r[15]).trim():'' })).filter(n => n.pjtCode !== ''); 
        safeShowSuccess(`부적합(NCR) 데이터 ${window.ncrData.length}건 동기화 완료!`);
        if(window.renderProjectStatusList) window.renderProjectStatusList();
        const modal = document.getElementById('ncr-modal');
        if (modal && !modal.classList.contains('hidden')) { const titleEl = document.getElementById('ncr-project-title'); if (titleEl && titleEl.dataset.code) { if(window.renderNcrList) window.renderNcrList(titleEl.dataset.code); } }
    } catch(e) { safeShowError(`동기화 실패`, e); }
};

window.openNcrModal = function(pjtCode, pjtName) {
    try {
        const titleEl = document.getElementById('ncr-project-title');
        if (titleEl) { titleEl.innerText = `[${getSafeString(pjtCode)}] ${getSafeString(pjtName)}`; titleEl.dataset.code = getSafeString(pjtCode); }
        const modal = document.getElementById('ncr-modal');
        if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        if(window.renderNcrList) window.renderNcrList(pjtCode);
    } catch (e) { safeShowError('NCR 모달 에러', e); }
};
window.closeNcrModal = function() { const m = document.getElementById('ncr-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } };
window.renderNcrList = function(pjtCode) {
    const tbody = document.getElementById('ncr-list-tbody'); if (!tbody) return;
    const safeTargetCode = getSafeString(pjtCode).replace(/\s/g, '').toUpperCase();
    const list = (window.ncrData || []).filter(n => getSafeString(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeTargetCode);
    let total = list.length, completed = list.filter(n => getSafeString(n.status).includes('완료') || getSafeString(n.status).includes('종결')).length;
    const elTotal = document.getElementById('ncr-total-cnt'); if(elTotal) elTotal.innerText = total;
    const elPending = document.getElementById('ncr-pending-cnt'); if(elPending) elPending.innerText = total - completed;
    const elComp = document.getElementById('ncr-comp-cnt'); if(elComp) elComp.innerText = completed;
    if (total === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-slate-400 font-bold bg-white">등록된 부적합 내역이 없습니다.</td></tr>'; return; }
    tbody.innerHTML = list.map(n => {
        const isComp = getSafeString(n.status).includes('완료') || getSafeString(n.status).includes('종결');
        return `<tr class="hover:bg-slate-50 transition-colors bg-white border-b border-slate-100"><td class="p-3 text-center font-bold text-slate-500 whitespace-nowrap">${getSafeString(n.ncrNo) || '-'}</td><td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.date) || '-'}</td><td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.drawingNo) || '-'}</td><td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.partName) || '-'}</td><td class="p-3 text-center whitespace-nowrap"><span class="bg-slate-100 px-2 py-1 border border-slate-200 rounded font-bold">${getSafeString(n.type) || '-'}</span></td><td class="p-3 font-medium ${isComp ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-700'} break-all">${getSafeString(n.content).replace(/</g, '&lt;').replace(/>/g, '&gt;') || '-'}</td><td class="p-3 text-center whitespace-nowrap">${isComp ? `<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">완료</span>` : `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">진행중</span>`}</td></tr>`;
    }).join('');
};
