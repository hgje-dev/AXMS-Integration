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

// ==========================================
// 💡 공통 유틸리티
// ==========================================

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

// 데이터가 null일 때 에러 방지 필터
const getSafeString = (val) => { 
    return (val === null || val === undefined) ? '' : String(val); 
};

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
// 💡 리스트 필터링 로직
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
            
            // 연도 일치하거나 빈 날짜의 경우 유지
            return hasYearDate || cY === y || codeHasYear || (!hasYearDate && !cY && item.status !== 'completed'); 
        });
    }
    
    if (window.currentMonthFilter) {
        const m = window.currentMonthFilter;
        list = list.filter(item => {
            return getSafeString(item.d_shipEn).startsWith(m) || 
                   getSafeString(item.d_asmEst).startsWith(m) || 
                   getSafeString(item.d_asmEn).startsWith(m);
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
// 💡 리스트 렌더링 (스마트 폴백 로직 포함)
// ==========================================
window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); 
    if(!tbody) return;
    
    let displayList = window.getFilteredProjects();
    
    // 💡 [스마트 폴백 로직]
    // 데이터는 있는데 필터(연도 등) 때문에 0개가 되었다면 자동으로 필터를 풀어줍니다.
    if (displayList.length === 0 && window.currentProjectStatusList && window.currentProjectStatusList.length > 0) {
        if (window.currentYearFilter !== '' || window.hideCompletedFilter) {
            window.currentYearFilter = '';
            window.hideCompletedFilter = false;
            
            const ySelect = document.getElementById('filter-year-select');
            if (ySelect) ySelect.value = '';
            const hCb = document.getElementById('hide-completed-cb');
            if (hCb) hCb.checked = false;
            
            displayList = window.getFilteredProjects(); // 다시 한 번 필터링 실행
            if(window.showToast) window.showToast("현재 조건에 맞는 PJT가 없어 필터를 전체로 해제했습니다.", "warning");
        }
    }

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
            if (item.status !== 'completed') {
                crBtnHtml = `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-not-allowed shadow-inner">완료대기</span>`;
            } else {
                if (item.crSent) {
                    crBtnHtml = `<span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded border border-blue-200 shadow-sm cursor-not-allowed">송부완료</span>`;
                } else {
                    crBtnHtml = `<button onclick="event.stopPropagation(); window.openCrReqModal('${item.id}', '${safeNameJs}')" class="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white px-2 py-1 rounded border border-rose-200 transition-colors shadow-sm whitespace-nowrap">완료요청</button>`;
                }
            }
            trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${crBtnHtml}</td>`;
            trHtml += `</tr>`;
            htmlStr += trHtml;

        } catch(err) {
            console.error('리스트 렌더링 에러 (해당 항목을 건너뜀):', err);
        }
    });
    
    tbody.innerHTML = htmlStr;
};

// 💡 엑스박스 완벽 방지, 썸네일 고화질 매핑 HTML 렌더러
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
};

async function handleDriveUploadWithProgress(file, projectName, subFolderName = null, fileIndex = 1, totalFiles = 1) {
    if(!window.googleAccessToken) {
        if(window.initGoogleAPI) window.initGoogleAPI();
        if(window.authenticateGoogle && !window.googleAccessToken) window.authenticateGoogle();
        if(!window.googleAccessToken) throw new Error("구글 계정 연동이 필요합니다. 상단의 [구글 연동 필요] 버튼을 눌러주세요.");
    }
    
    if (!file) throw new Error("파일이 존재하지 않습니다.");

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

    // 💡 1단계: 메타데이터 빈 파일 생성
    const metaRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + window.googleAccessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: file.name, parents: [targetFolderId] })
    });
    
    if (!metaRes.ok) {
        if(progressModal) { progressModal.classList.add('hidden'); progressModal.classList.remove('flex'); }
        throw new Error("드라이브 파일 생성에 실패했습니다.");
    }
    
    const metaData = await metaRes.json();
    const fileId = metaData.id;

    // 💡 2단계: 생성된 파일에 바이너리 덮어쓰기 (PATCH)
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
                reject(new Error("파일 업로드 거부됨: " + xhr.statusText));
            }
        };

        xhr.onerror = function() {
            if(progressModal) {
                progressModal.classList.add('hidden');
                progressModal.classList.remove('flex');
            }
            reject(new Error("네트워크 연결 오류 발생"));
        };

        xhr.send(file);
    });
}

// ==========================================
// 💡 PJT 완료보고 송부 및 임시저장
// ==========================================
window.openCrReqModal = function(id, title) {
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === id);
        const temp = proj && proj.crTempData ? proj.crTempData : {};

        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerHTML = val; };

        setVal('cr-req-pjt-id', id);
        setHtml('cr-req-project-title', title);
        setVal('cr-req-good', temp.good || '');
        setVal('cr-req-bad', temp.bad || '');
        setVal('cr-req-spec-file', '');
        setHtml('cr-req-spec-names', '');
        setVal('cr-req-design-file', '');
        setHtml('cr-req-design-names', '');
        
        const modal = document.getElementById('cr-req-modal');
        if(modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    } catch(e) {
        if(window.showToast) window.showToast('모달을 여는 중 오류가 발생했습니다.', 'error');
    }
};

window.closeCrReqModal = function() {
    const modal = document.getElementById('cr-req-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.tempSaveCrReq = async function() {
    const pIdEl = document.getElementById('cr-req-pjt-id');
    const goodTxtEl = document.getElementById('cr-req-good');
    const badTxtEl = document.getElementById('cr-req-bad');
    
    if(!pIdEl || !goodTxtEl || !badTxtEl) return;

    const pId = pIdEl.value;
    const goodTxt = goodTxtEl.value;
    const badTxt = badTxtEl.value;

    if(!pId) return window.showToast("프로젝트 ID를 찾을 수 없습니다.", "error");

    const btn = document.getElementById('btn-cr-req-temp');
    if(btn) { btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중...'; btn.disabled = true; }

    try {
        await setDoc(doc(db, "projects_status", pId), { 
            crTempData: { good: goodTxt, bad: badTxt },
            updatedAt: Date.now()
        }, { merge: true });
        
        window.showToast("임시저장 되었습니다.", "success");
        window.closeCrReqModal();
    } catch(e) {
        window.showToast("임시저장 중 오류가 발생했습니다.", "error");
    } finally {
        if(btn) { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 임시저장'; btn.disabled = false; }
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
    if(!confirm("완료요청을 송부하시겠습니까?\n송부 완료 후에는 수정이 어렵습니다.")) return;

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

        batch.update(pjtRef, { 
            status: 'completed', 
            crSent: true,
            crTempData: null,
            d_shipEn: window.getLocalDateStr(new Date()), 
            updatedAt: Date.now() 
        });

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

// ==========================================
// 💡 프로젝트 정보 입력 폼 모달
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
        if(window.showToast) window.showToast('모달을 여는 중 오류가 발생했습니다.', 'error');
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
        if(window.showToast) window.showToast('데이터를 불러오는 중 오류가 발생했습니다.', 'error');
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
        
        // 💡 [수정된 부분] 오작동 방지를 위해 자동 스왑(위치 변경) 로직 완전히 삭제
        let code = codeEl.value.trim(); 
        let name = nameEl.value.trim();
        
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
    if(!window.currentSelectedMembers) window.currentSelectedMembers = [];
    if(!window.currentSelectedMembers.includes(name)) { 
        window.currentSelectedMembers.push(name); 
        if(window.renderSelectedMembers) window.renderSelectedMembers(); 
    } 
    const el = document.getElementById('ps-member-add');
    if(el) el.value = ''; 
};

window.removeProjectMember = function(name) { 
    if(!window.currentSelectedMembers) window.currentSelectedMembers = [];
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
            if(window.closeProjHistoryModal) window.closeProjHistoryModal(); 
            if(window.editProjStatus) window.editProjStatus(projectId);
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
        if(window.renderProjGantt) window.renderProjGantt(); 
    } else if(view === 'calendar' && calC) { 
        calC.classList.remove('hidden'); 
        if(window.renderProjCalendar) window.renderProjCalendar(); 
    }
};

// ==========================================
// 💡 구매 관리 모달
// ==========================================
window.openPurchaseModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('purchase-modal');
        if(!modal) return;
        
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerText = val; };
        
        setVal('pur-req-id', projectId); 
        setHtml('pur-project-title', title || ''); 
        
        if(window.resetPurchaseForm) window.resetPurchaseForm(); 
        
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
        });
    } catch(e) {
        console.error('Purchase Modal Error:', e);
        alert('구매 모달창을 여는 중 에러가 발생했습니다: ' + e.message);
    }
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
        if(window.resetPurchaseForm) window.resetPurchaseForm(); 
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
// 💡 설계 파일 관리 모달
// ==========================================
window.openDesignModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('design-modal');
        if(!modal) return;

        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerText = val; };

        setVal('des-req-id', projectId); 
        setHtml('des-project-title', title || ''); 
        
        if(window.resetDesignForm) window.resetDesignForm(); 
        
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
        });
    } catch(e) {
        console.error('Design Modal Error:', e);
        alert('설계 모달창을 여는 중 에러가 발생했습니다: ' + e.message);
    }
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
        if(window.resetDesignForm) window.resetDesignForm(); 
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
// 💡 일정표 관리 모달
// ==========================================
window.openPjtScheduleModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('pjt-schedule-modal');
        if(!modal) return;
        
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerText = val; };

        setVal('sch-req-id', projectId); 
        setHtml('sch-project-title', title || ''); 
        
        if(window.resetPjtScheduleForm) window.resetPjtScheduleForm(); 
        
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
        });
    } catch(e) {
        console.error('Schedule Modal Error:', e);
        alert('일정표 모달창을 여는 중 에러가 발생했습니다: ' + e.message);
    }
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
        if(window.resetPjtScheduleForm) window.resetPjtScheduleForm(); 
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
    try {
        const modal = document.getElementById('daily-log-modal');
        if(!modal) return;
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        const setHtml = (eid, val) => { const el = document.getElementById(eid); if(el) el.innerText = val; };
        
        setVal('log-req-id', projectId); 
        setHtml('log-project-title', proj.name || ''); 
        setVal('log-project-progress', proj.progress || 0); 
        setVal('log-project-purchase-rate', proj.purchaseRate || 0); 
        
        const members = window.teamMembers || [];
        const mHtml = '<option value="">팀원 추가</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        const logMemberSelect = document.getElementById('log-member-add');
        if(logMemberSelect) logMemberSelect.innerHTML = mHtml;

        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
        
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
        
        if(window.loadDailyLogs) window.loadDailyLogs(projectId); 
    } catch(e) {
        console.error("openDailyLogModal Error:", e);
        alert("생산일지 모달 에러: " + e.message);
    }
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
                const dateA = a.date || ''; const dateB = b.date || ''; 
                if (dateA !== dateB) return dateB.localeCompare(dateA); 
                return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); 
            }); 
            
            if(window.renderDailyLogs) window.renderDailyLogs(window.currentDailyLogs); 
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
            let safeContent = getSafeString(log.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeContent = window.formatMentions(safeContent);
            
            let legacyFiles = [];
            if(log.imageUrl) legacyFiles.push({ name: '첨부사진.jpg', url: log.imageUrl, thumbBase64: log.imageUrl });
            
            let allFiles = legacyFiles;
            if(log.files && log.files.length > 0) {
                allFiles = [...allFiles, ...log.files];
            }
            
            let attachmentsHtml = window.generateMediaHtml(allFiles);
            
            let workersHtml = `<span class="font-bold text-slate-700">${getSafeString(log.authorName)}</span>`;
            if (log.members) {
                const membersArr = String(log.members).split(',').map(s=>s.trim()).filter(Boolean);
                if(membersArr.length > 0) {
                    workersHtml = membersArr.map(n => `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] shadow-sm whitespace-nowrap border border-slate-200">${n}</span>`).join(' ');
                }
            }

            let btnHtml = '';
            if (log.authorUid === window.currentUser?.uid || (window.userProfile && window.userProfile.role === 'admin')) {
                btnHtml = `<button onclick="window.editDailyLog('${log.id}')" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            
            listHtml += `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow">
                            <div class="flex justify-between items-center">
                                <div class="flex items-center gap-3">
                                    <span class="font-bold text-sky-600 text-xs flex items-center gap-1"><i class="fa-regular fa-calendar text-sky-400"></i> ${getSafeString(log.date)}</span>
                                    <div class="flex flex-wrap gap-1">${workersHtml}</div>
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
    
    const logIdEl = document.getElementById('editing-log-id');
    const logId = logIdEl ? logIdEl.value : ''; 
    
    const dateEl = document.getElementById('new-log-date');
    const date = dateEl ? dateEl.value : ''; 
    
    const contentEl = document.getElementById('new-log-text');
    const content = contentEl ? contentEl.value.trim() : ''; 
    
    const fileInput = document.getElementById('new-log-image'); 
    
    const progEl = document.getElementById('log-project-progress');
    const rateEl = document.getElementById('log-project-purchase-rate');
    const progressVal = progEl ? (parseInt(progEl.value) || 0) : 0; 
    const purchaseRateVal = rateEl ? (parseInt(rateEl.value) || 0) : 0; 
    
    const membersEl = document.getElementById('log-members');
    const members = membersEl ? membersEl.value : ''; 

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

        const payload = { 
            date: date, 
            content: content, 
            members: members,
            updatedAt: Date.now() 
        }; 
        
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
        
        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
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
    
    window.currentLogMembers = (log.members && typeof log.members === 'string') ? log.members.split(',').map(s=>s.trim()).filter(Boolean) : [];
    if(window.renderLogMembers) window.renderLogMembers();

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
        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
    } catch(e) { 
        window.showToast("삭제 실패", "error"); 
    } 
};

window.clearDailyLogFile = function(e) {
    if(e && typeof e.stopPropagation === 'function') e.stopPropagation();
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
    if(window.clearDailyLogFile) window.clearDailyLogFile(); 
    
    let defaultUser = '';
    if(window.userProfile && window.userProfile.name) {
        defaultUser = window.userProfile.name;
    }
    window.currentLogMembers = defaultUser ? [defaultUser] : []; 
    if(window.renderLogMembers) window.renderLogMembers();

    const btnSave = document.getElementById('btn-log-save');
    if(btnSave) btnSave.innerText = '등록'; 
    
    const btnCancel = document.getElementById('btn-log-cancel');
    if(btnCancel) btnCancel.classList.add('hidden'); 
};
