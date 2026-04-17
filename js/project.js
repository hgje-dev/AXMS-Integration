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

// 💡 초기 기본값 설정
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

// ==========================================
// 💡 안전망(Safe Guard) 및 공통 유틸리티
// ==========================================

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
    if(window.showToast) window.showToast(msg, "error");
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

// ==========================================
// 💡 알림 카운트 및 초기화
// ==========================================
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

// ==========================================
// 💡 필터링 및 대시보드 업데이트
// ==========================================
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

// ==========================================
// 💡 리스트 화면 렌더링
// ==========================================
window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); 
    if(!tbody) return;
    
    let displayList = window.getFilteredProjects();
    
    // 스마트 폴백 로직: 필터 때문에 결과가 0명이면 필터 자동 해제
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
                crBtnHtml = `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-not-allowed">완료대기</span>`;
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

// ==========================================
// 💡 이미지 렌더러 (엑스박스 방지)
// ==========================================
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
                // 구글 드라이브 파일일 경우 고품질 썸네일과 원본 뷰어 매핑
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

// ==========================================
// 💡 구글 드라이브 파일 업로드 (2-Step 안정화 방식)
// ==========================================
window.getOrCreateDriveFolder = async function(folderName, parentFolderId) {
    if (!window.googleAccessToken) return null;
    const safeFolderName = getSafeString(folderName).replace(/[\/\\]/g, '_') || '미분류 프로젝트';
    const query = `name='${safeFolderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
    
    try {
        const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': 'Bearer ' + window.googleAccessToken }
        });
        const folderData = await findRes.json();
        
        if (folderData.files && folderData.files.length > 0) {
            return folderData.files[0].id;
        } else {
            const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 
                    'Authorization': 'Bearer ' + window.googleAccessToken, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ name: safeFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
            });
            const newFolderData = await createRes.json();
            return newFolderData.id;
        }
    } catch(e) {
        console.error("폴더 생성 에러:", e);
        return null;
    }
};

async function handleDriveUploadWithProgress(file, projectName, subFolderName = null, fileIndex = 1, totalFiles = 1) {
    if(!window.googleAccessToken) {
        throw new Error("구글 계정 연동이 필요합니다. 상단의 [구글 연동 필요] 버튼을 눌러주세요.");
    }
    if (!file) throw new Error("업로드할 파일이 없습니다.");

    let targetFolderId = await window.getOrCreateDriveFolder(projectName, TARGET_DRIVE_FOLDER);
    if (!targetFolderId) throw new Error("메인 폴더를 생성/조회할 수 없습니다.");

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
        // 1단계: 메타데이터 빈 파일 생성
        const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + window.googleAccessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: file.name, parents: [targetFolderId] })
        });
        
        if (!metaRes.ok) throw new Error("구글 드라이브 파일 생성에 실패했습니다. (권한 또는 용량 확인)");
        
        const metaData = await metaRes.json();
        const fileId = metaData.id;

        // 2단계: 생성된 파일에 바이너리 덮어쓰기 (PATCH)
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, true);
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
                    reject(new Error("파일 내용 업로드 거절됨. (네트워크 불안정 또는 용량 초과)"));
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

// ==========================================
// 💡 프로젝트 정보 입력 폼 모달 (등록/수정)
// ==========================================
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
        if(modal) { 
            modal.classList.remove('hidden'); 
            modal.classList.add('flex'); 
        }
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
        if(modal) { 
            modal.classList.remove('hidden'); 
            modal.classList.add('flex'); 
        }
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
        
        if(!codeEl || !nameEl) throw new Error("입력 폼 요소를 찾을 수 없습니다.");

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

        // 💡 Firestore 에러 방지: 모든 undefined 값을 null로 변환
        Object.keys(data).forEach(key => {
            if (data[key] === undefined) data[key] = null;
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
            await setDoc(doc(db, "projects_status", id), data, { merge: true }); 
            safeShowSuccess("성공적으로 수정되었습니다."); 
        } else { 
            data.createdAt = Date.now(); 
            data.currentMd = 0; 
            data.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system';
            data.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system';
            
            await addDoc(collection(db, "projects_status"), data); 
            safeShowSuccess("성공적으로 등록되었습니다."); 
            
            if (window.googleAccessToken) {
                const folderName = data.code ? data.code : data.name;
                window.getOrCreateDriveFolder(folderName, TARGET_DRIVE_FOLDER).catch(e => console.warn("자동 폴더 생성 실패", e));
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
        if(window.renderProjGantt) window.renderProjGantt(); 
    } else if(view === 'calendar' && calC) { 
        calC.classList.remove('hidden'); 
        if(window.renderProjCalendar) window.renderProjCalendar(); 
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
    if(window.renderProjCalendar) window.renderProjCalendar(); 
};

window.renderProjCalendar = function() {
    const container = document.getElementById('proj-dash-calendar-content');
    if(!container) return;
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

// ==========================================
// 💡 코멘트 관리 모달
// ==========================================
window.openCommentModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('comment-modal');
        if(!modal) return safeShowError('코멘트 모달 요소를 찾을 수 없습니다.');
        
        const reqEl = document.getElementById('cmt-req-id');
        if(reqEl) reqEl.value = projectId; 
        
        if(window.cancelCommentAction) window.cancelCommentAction(); 
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
        if(window.loadComments) window.loadComments(projectId); 
    } catch(e) {
        safeShowError('코멘트 창을 열 수 없습니다.', e);
    }
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
            
            if(window.renderComments) window.renderComments(topLevel); 
        } catch(e) { console.error("코멘트 로드 에러:", e); }
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
            const cImgHtml = window.generateMediaHtml(files);
            
            let repliesHtml = ''; 
            if(c.replies && c.replies.length > 0) { 
                repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; 
                c.replies.forEach(function(r) { 
                    let safeReplyContent = String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
                    if(window.formatMentions) safeReplyContent = window.formatMentions(safeReplyContent); 
                    
                    let rFiles = [];
                    if(r.imageUrl) rFiles.push({name:'첨부사진.jpg', url: r.imageUrl, thumbBase64: r.imageUrl});
                    const rImgHtml = window.generateMediaHtml(rFiles);
                    
                    let replyBtnHtml = '';
                    if (r.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) {
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
            if (c.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) {
                mainBtnHtml = `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            listHtml += `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <div class="flex justify-between items-start mb-3">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-slate-800 text-[15px]">${getSafeString(c.authorName)}</span>
                                    <span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="window.setReplyTo('${c.id}', '${getSafeString(c.authorName)}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-3 py-1 rounded-lg font-bold transition-colors shadow-sm">답글달기</button>
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
    const pIdEl = document.getElementById('cmt-req-id');
    const contentEl = document.getElementById('new-cmt-text');
    if(!pIdEl || !contentEl) return;
    
    const projectId = pIdEl.value; 
    const content = contentEl.value.trim(); 
    
    const pIdRe = document.getElementById('reply-to-id');
    const parentId = pIdRe ? pIdRe.value || null : null; 
    
    const eIdEl = document.getElementById('editing-cmt-id');
    const editId = eIdEl ? eIdEl.value : ''; 
    
    const fileInput = document.getElementById('new-cmt-image'); 
    
    if(!content && (!fileInput || fileInput.files.length === 0)) {
        return safeShowError("코멘트 내용이나 사진을 첨부하세요."); 
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
            
            Object.keys(payload).forEach(k => { if(payload[k] === undefined) payload[k] = null; });
            
            if (editId) { 
                await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); 
                safeShowSuccess("코멘트가 수정되었습니다."); 
            } else { 
                payload.projectId = projectId; 
                payload.parentId = parentId; 
                payload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; 
                payload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system'; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); 
                safeShowSuccess("코멘트가 등록되었습니다."); 
                
                if(window.processMentions) {
                    await window.processMentions(content, projectId, "코멘트");
                }
            } 
            
            if(window.cancelCommentAction) {
                window.cancelCommentAction(); 
            }
        } catch(e) { 
            safeShowError("저장 중 오류 발생", e); 
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
        safeShowSuccess("삭제되었습니다."); 
        if(window.cancelCommentAction) window.cancelCommentAction(); 
    } catch(e) { safeShowError("삭제 실패", e); } 
};


// ==========================================
// 💡 이슈 관리 모달
// ==========================================
window.openIssueModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('issue-modal');
        if(!modal) return safeShowError("이슈 모달 요소를 찾을 수 없습니다.");
        
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        setVal('issue-req-id', projectId); 
        setVal('editing-issue-id', ''); 
        setVal('new-issue-text', ''); 
        
        const btn = document.getElementById('btn-issue-save');
        if(btn) btn.innerText = '등록'; 
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
        
        if(window.loadIssues) window.loadIssues(projectId); 
    } catch(e) {
        safeShowError('이슈 모달창을 열 수 없습니다.', e);
    }
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
            if(window.renderIssues) window.renderIssues(window.currentIssues); 
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
            if (iss.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) {
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
    
    if(!content) return safeShowError("이슈 내용을 입력하세요."); 
    
    try { 
        const payload = { content: content, updatedAt: Date.now() };
        Object.keys(payload).forEach(k => { if(payload[k] === undefined) payload[k] = null; });

        if (editId) { 
            await setDoc(doc(db, "project_issues", editId), payload, { merge: true }); 
            safeShowSuccess("이슈가 수정되었습니다."); 
        } else { 
            payload.projectId = projectId;
            payload.isResolved = false;
            payload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system';
            payload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system';
            payload.createdAt = Date.now();
            await addDoc(collection(db, "project_issues"), payload); 
            safeShowSuccess("이슈가 등록되었습니다."); 
            
            if(window.processMentions) {
                await window.processMentions(content, projectId, "이슈");
            }
        } 
        
        if(editIdEl) editIdEl.value = ''; 
        contentEl.value = ''; 
        const btnSave = document.getElementById('btn-issue-save');
        if(btnSave) btnSave.innerText = '등록'; 
    } catch(e) { 
        safeShowError("저장 중 오류 발생", e); 
    } 
};

window.toggleIssueStatus = async function(id, isResolved) { 
    try { 
        await setDoc(doc(db, "project_issues", id), { isResolved: isResolved }, { merge: true }); 
    } catch(e) { 
        safeShowError("상태 변경 오류", e); 
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
        safeShowSuccess("삭제되었습니다."); 
    } catch(e) { 
        safeShowError("삭제 실패", e); 
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
// 💡 생산일지(MD) 및 팀원 다중 선택 로직
// ==========================================
window.addLogMember = function(name) { 
    if(!name) return; 
    window.currentLogMembers = window.currentLogMembers || [];
    if(!window.currentLogMembers.includes(name)) { 
        window.currentLogMembers.push(name); 
        if(window.renderLogMembers) window.renderLogMembers(); 
    } 
    const el = document.getElementById('log-member-add');
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

window.openMdLogModal = function(projectId, title, curMd) { 
    try {
        const modal = document.getElementById('md-log-modal');
        if(!modal) return safeShowError("투입MD 모달 HTML 요소를 찾을 수 없습니다.");
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        setVal('md-req-id', projectId); 
        
        const badge = document.getElementById('md-total-badge'); 
        if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; 
        
        if(window.resetMdLogForm) window.resetMdLogForm(); 
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
        
        if(window.loadMdLogs) window.loadMdLogs(projectId); 
    } catch(e) {
        safeShowError('MD로그 모달을 열 수 없습니다.', e);
    }
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
            if(window.renderMdLogs) window.renderMdLogs(window.currentMdLogs); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderMdLogs = function(logs) { 
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
            
            let workersHtml = `<span class="font-bold text-slate-500">${getSafeString(log.authorName)}</span>`;
            if (log.members) {
                const membersArr = String(log.members).split(',').map(s=>s.trim()).filter(Boolean);
                if(membersArr.length > 0) {
                    workersHtml = membersArr.map(n => `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] shadow-sm whitespace-nowrap border border-slate-200">${n}</span>`).join(' ');
                }
            }

            let btnHtml = '-';
            if (log.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) {
                btnHtml = `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            htmlStr += `<tr class="hover:bg-purple-50/30 transition-colors">
                            <td class="p-3 text-center text-slate-500 font-bold">${getSafeString(log.date)}</td>
                            <td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td>
                            <td class="p-3 text-slate-700">${safeDesc || '-'}</td>
                            <td class="p-3 text-center flex flex-wrap justify-center gap-1 mt-2">${workersHtml}</td>
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

    if(!date || !mdVal) return safeShowError("날짜와 투입 MD를 입력하세요."); 
    
    const btnSave = document.getElementById('btn-md-save');
    if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
    try { 
        const payload = { 
            date: date, 
            md: parseFloat(mdVal), 
            desc: desc, 
            updatedAt: Date.now() 
        }; 

        Object.keys(payload).forEach(k => { if(payload[k] === undefined) payload[k] = null; });
        
        if (logId) { 
            await setDoc(doc(db, "project_md_logs", logId), payload, { merge: true }); 
            safeShowSuccess("MD 내역이 수정되었습니다."); 
        } else { 
            payload.projectId = projectId; 
            payload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; 
            payload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system'; 
            payload.createdAt = Date.now(); 
            await addDoc(collection(db, "project_md_logs"), payload); 
            safeShowSuccess("MD 내역이 등록되었습니다."); 
            
            if(window.processMentions) {
                await window.processMentions(desc, projectId, "투입MD기록");
            }
        } 
        
        if(window.updateProjectTotalMd) await window.updateProjectTotalMd(projectId); 
        if(window.resetMdLogForm) window.resetMdLogForm(); 
    } catch(e) { 
        safeShowError("저장 중 오류 발생", e); 
    } finally {
        if(btnSave) { btnSave.innerHTML = '등록'; btnSave.disabled = false; }
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
        if(window.updateProjectTotalMd) await window.updateProjectTotalMd(projectId); 
        safeShowSuccess("삭제되었습니다."); 
        if(window.resetMdLogForm) window.resetMdLogForm(); 
    } catch(e) { safeShowError("삭제 실패", e); } 
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
// 💡 링크 모달
// ==========================================
window.openLinkModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('link-modal');
        if(!modal) return safeShowError("링크 모달 요소를 찾을 수 없습니다.");
        
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        setVal('link-req-id', projectId); 
        
        const titleEl = document.getElementById('link-project-title'); 
        if(titleEl) titleEl.innerText = title || ''; 
        
        setVal('new-link-name', ''); 
        setVal('new-link-url', ''); 
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
        
        if(window.renderLinksList) window.renderLinksList(projectId); 
    } catch(e) {
        safeShowError('링크 모달을 여는 중 에러가 발생했습니다.', e);
    }
};

window.renderLinksList = function(projectId) { 
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId); 
        const list = document.getElementById('link-list'); 
        if(!list) return;
        
        if(!proj || !proj.links || proj.links.length === 0) { 
            list.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold text-xs bg-white rounded-xl border border-slate-200 border-dashed">등록된 문서/링크가 없습니다.</li>'; 
            return; 
        } 
        
        let htmlStr = ''; 
        proj.links.forEach(function(lnk, idx) { 
            htmlStr += `<li class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                            <div class="flex flex-col truncate">
                                <span class="font-extrabold text-slate-700 text-sm mb-1">${getSafeString(lnk.name)}</span>
                                <a href="${getSafeString(lnk.url)}" target="_blank" class="text-[11px] font-bold text-teal-600 hover:text-teal-800 hover:underline truncate flex items-center gap-1"><i class="fa-solid fa-link"></i> ${getSafeString(lnk.url)}</a>
                            </div>
                            <button onclick="window.deleteLinkItem('${projectId}', ${idx})" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all p-2.5"><i class="fa-solid fa-trash-can"></i></button>
                        </li>`; 
        }); 
        list.innerHTML = htmlStr;
    } catch(e) {}
};

window.closeLinkModal = function() { 
    const modal = document.getElementById('link-modal');
    if(modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
};

window.saveLinkItem = async function() { 
    const pIdEl = document.getElementById('link-req-id');
    const nameEl = document.getElementById('new-link-name');
    const urlEl = document.getElementById('new-link-url');
    
    if(!pIdEl || !urlEl) return;
    
    const projectId = pIdEl.value; 
    const name = nameEl ? nameEl.value.trim() : '참고 링크'; 
    let url = urlEl.value.trim(); 
    
    if(!url) return safeShowError("링크 URL을 입력하세요."); 
    
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId); 
    let links = proj && proj.links ? proj.links.slice() : []; 
    
    if(!url.startsWith('http')) url = 'https://' + url; 
    links.push({ name: name || '참고 링크', url: url }); 
    
    try { 
        await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); 
        safeShowSuccess("링크가 추가되었습니다."); 
        if(nameEl) nameEl.value = ''; 
        urlEl.value = ''; 
        if(proj) proj.links = links; 
        if(window.renderLinksList) window.renderLinksList(projectId); 
    } catch(e) { 
        safeShowError("추가 실패", e); 
    } 
};

window.deleteLinkItem = async function(projectId, index) { 
    if(!confirm("이 링크를 삭제하시겠습니까?")) return; 
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId); 
    if(!proj || !proj.links) return; 
    
    let links = proj.links.slice(); 
    links.splice(index, 1); 
    
    try { 
        await setDoc(doc(db, "projects_status", projectId), { links: links }, { merge: true }); 
        safeShowSuccess("링크가 삭제되었습니다."); 
        if(proj) proj.links = links; 
        if(window.renderLinksList) window.renderLinksList(projectId); 
    } catch(e) { 
        safeShowError("삭제 실패", e); 
    } 
};

// ==========================================
// 💡 NCR 부적합 및 데이터 통신
// ==========================================
window.loadNcrData = async function() {
    try {
        if(window.showToast) window.showToast("부적합(RAWDATA) 데이터를 가져오는 중입니다...", "success");
        const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSYwsWjs8ox503LLsRIeVRbbZ4R7eLgoq0C-ZdYIBIUACCwWyt5oYkAAtIpX9j1taqt1MQaEg1Jjom0/pub?gid=0&single=true&output=csv';
        const separator = csvUrl.includes('?') ? '&' : '?';
        const res = await fetch(csvUrl + separator + 't=' + Date.now());
        
        if (!res.ok) throw new Error("시트 데이터를 가져오지 못했습니다.");
        const csvText = await res.text();
        if (csvText.includes('<html') || csvText.includes('<body')) throw new Error("링크 형식이 잘못되었습니다.");

        const rows = []; let row = [], col = "", quote = false;
        for (let i = 0; i < csvText.length; i++) {
            let cc = csvText[i], nc = csvText[i+1];
            if (cc === '"' && quote && nc === '"') { col += cc; ++i; continue; }
            if (cc === '"') { quote = !quote; continue; }
            if (cc === ',' && !quote) { row.push(col); col = ""; continue; }
            if ((cc === '\r' || cc === '\n') && !quote) {
                if (row.length > 0 || col !== "") { row.push(col); rows.push(row); row = []; col = ""; }
                if (cc === '\r' && nc === '\n') i++;
                continue;
            }
            col += cc;
        }
        if (col !== "" || row.length > 0) { row.push(col); rows.push(row); }

        let dataStartIndex = 1;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            if (rows[i][0] && String(rows[i][0]).includes('NCR No')) { dataStartIndex = i + 1; break; }
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
        
        if(window.renderProjectStatusList) window.renderProjectStatusList();
        
        const modal = document.getElementById('ncr-modal');
        if (modal && !modal.classList.contains('hidden')) {
            const titleEl = document.getElementById('ncr-project-title');
            if (titleEl && titleEl.dataset.code) {
                if(window.renderNcrList) window.renderNcrList(titleEl.dataset.code);
            }
        }
    } catch(e) {
        console.error("NCR 로드 에러:", e);
        if(window.showToast) window.showToast(`동기화 실패: ${e.message}`, "error");
    }
};

window.openNcrModal = function(pjtCode, pjtName) {
    try {
        const titleEl = document.getElementById('ncr-project-title');
        if (titleEl) {
            titleEl.innerText = `[${getSafeString(pjtCode)}] ${getSafeString(pjtName)}`;
            titleEl.dataset.code = getSafeString(pjtCode);
        }
        const modal = document.getElementById('ncr-modal');
        if(modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
        if(window.renderNcrList) window.renderNcrList(pjtCode);
    } catch (e) {
        safeShowError('NCR 모달을 여는 중 에러가 발생했습니다.', e);
    }
};

window.closeNcrModal = function() {
    const modal = document.getElementById('ncr-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
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
    
    const elTotal = document.getElementById('ncr-total-cnt'); if(elTotal) elTotal.innerText = total;
    const elPending = document.getElementById('ncr-pending-cnt'); if(elPending) elPending.innerText = total - completed;
    const elComp = document.getElementById('ncr-comp-cnt'); if(elComp) elComp.innerText = completed;
    
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
