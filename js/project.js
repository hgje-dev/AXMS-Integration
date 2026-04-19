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

// 대한민국 공휴일 데이터
const KR_HOLIDAYS = new Set([
    '2024-01-01', '2024-02-09', '2024-02-12', '2024-03-01', '2024-04-10', '2024-05-06', '2024-05-15', '2024-06-06', '2024-08-15', '2024-09-16', '2024-09-17', '2024-09-18', '2024-10-03', '2024-10-09', '2024-12-25',
    '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-03-01', '2025-03-03', '2025-05-05', '2025-05-06', '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-06', '2025-10-07', '2025-10-09', '2025-12-25',
    '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-08-15', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
    '2027-01-01', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-09', '2027-10-11', '2027-12-25'
]);

// 💡 전역 상태 초기화 (완료 숨김 기본값 true)
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
// 💡 동적 스크롤 락(틀고정) 모듈
// ==========================================
window.currentLockIndex = -1;

window.setTableLock = function(colIndex) {
    if (window.currentLockIndex === colIndex) {
        window.currentLockIndex = -1;
    } else {
        window.currentLockIndex = colIndex;
    }
    window.applyTableLock();
    if (window.showToast) {
        window.showToast(window.currentLockIndex === -1 ? "스크롤 고정이 해제되었습니다." : "선택한 열까지 스크롤이 고정되었습니다.", "success");
    }
};

window.applyTableLock = function() {
    const table = document.querySelector('#proj-dash-list-container table');
    if (!table) return;

    const theadThs = table.querySelectorAll('thead th');
    const tbodyTrs = table.querySelectorAll('tbody tr');
    let accumulatedWidth = 0;

    theadThs.forEach((th, index) => {
        th.onclick = () => window.setTableLock(index);
        th.style.cursor = 'pointer';
        th.title = '💡 클릭하여 여기까지 틀고정/해제';

        th.style.position = 'sticky';
        th.style.top = '0px'; 
        th.style.left = 'auto';
        th.style.zIndex = '40';
        th.classList.remove('shadow-[3px_0_5px_-1px_rgba(0,0,0,0.3)]');

        if (window.currentLockIndex !== -1 && index <= window.currentLockIndex) {
            th.style.left = accumulatedWidth + 'px';
            th.style.zIndex = '50';
            if (index === window.currentLockIndex) {
                th.classList.add('shadow-[3px_0_5px_-1px_rgba(0,0,0,0.3)]');
            }
            accumulatedWidth += th.getBoundingClientRect().width;
        }
    });

    tbodyTrs.forEach(tr => {
        let tds = tr.querySelectorAll('td');
        let currentWidth = 0;
        tds.forEach((td, index) => {
            td.style.position = 'static';
            td.style.left = 'auto';
            td.style.zIndex = 'auto';
            td.classList.remove('sticky', 'z-20', 'bg-white', 'group-hover:bg-indigo-50/50', 'shadow-[3px_0_5px_-1px_rgba(0,0,0,0.3)]');

            if (window.currentLockIndex !== -1 && index <= window.currentLockIndex) {
                td.style.position = 'sticky';
                td.style.left = currentWidth + 'px';
                td.style.zIndex = '20';
                td.classList.add('bg-white', 'group-hover:bg-indigo-50/50');
                if (index === window.currentLockIndex) {
                    td.classList.add('shadow-[3px_0_5px_-1px_rgba(0,0,0,0.3)]');
                }
                currentWidth += td.getBoundingClientRect().width;
            }
        });
    });
};

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
    if(window.showToast) window.showToast(msg + (err ? ': ' + err.message : ''), "error");
    else alert(msg + (err ? '\n' + err.message : ''));
};

const safeShowSuccess = (msg) => {
    if(window.showToast) window.showToast(msg, "success");
    else alert(msg);
};

// 💡 5단계 PJT 세부 작성(쓰기) 권한 체크
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
// 💡 카운트 데이터 및 기초 로드
// ==========================================
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

// 💡 완료 숨김 기본값으로 초기화
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

    if (window.initGoogleAPI) window.initGoogleAPI();

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
        if(window.currentProjDashView === 'gantt') { if(window.renderProjGantt) window.renderProjGantt(); }
        else if(window.currentProjDashView === 'calendar') { if(window.renderProjCalendar) window.renderProjCalendar(); }
        else window.renderProjectStatusList();
    });
};

// ==========================================
// 💡 리스트 렌더링
// ==========================================
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
            if (totalNcrCnt === 0) ncrIconHtml = `<button onclick="event.stopPropagation(); window.openNcrModal('${safeItemCode}', '${safeNameJs}')" class="text-slate-300 hover:text-indigo-400 transition-colors p-1" title="부적합 내역 없음"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
            else if (unresolvedNcrCnt === 0) ncrIconHtml = `<button onclick="event.stopPropagation(); window.openNcrModal('${safeItemCode}', '${safeNameJs}')" class="text-emerald-500 hover:text-emerald-600 transition-colors p-1" title="모두 조치 완료"><i class="fa-solid fa-file-circle-check text-lg"></i></button>`;
            else ncrIconHtml = `<button onclick="event.stopPropagation(); window.openNcrModal('${safeItemCode}', '${safeNameJs}')" class="text-rose-500 relative transition-transform hover:scale-110 p-1" title="미결 부적합 ${unresolvedNcrCnt}건"><i class="fa-solid fa-file-circle-exclamation text-lg"></i><span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${unresolvedNcrCnt}</span></button>`;

            let crBtnHtml = '';
            if (item.status !== 'completed') {
                crBtnHtml = `<span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200 cursor-not-allowed shadow-inner">완료대기</span>`;
            } else {
                if (item.crSent) crBtnHtml = `<span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded border border-blue-200 shadow-sm cursor-not-allowed">송부완료</span>`;
                else crBtnHtml = `<button onclick="event.stopPropagation(); window.openCrReqModal('${item.id}', '${safeNameJs}')" class="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-500 hover:text-white px-2 py-1 rounded border border-rose-200 transition-colors shadow-sm whitespace-nowrap">완료요청</button>`;
            }

            htmlStr += `<tr class="group hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">`;
            
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center" style="min-width: 40px; max-width: 40px;" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center" style="min-width: 80px; max-width: 80px;">${getSafeString(item.category)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center" style="min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center" style="min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${iCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-bold text-indigo-700" style="min-width: 110px; max-width: 110px;">${getSafeString(item.code)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 truncate max-w-[220px]" style="min-width: 220px;">${safeNameHtml}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center truncate max-w-[110px]" style="min-width: 110px;">${getSafeString(item.company)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-black text-emerald-600" style="min-width: 60px; max-width: 60px;">${parseFloat(item.progress) || 0}%</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center border-r-slate-300" style="min-width: 80px; max-width: 80px;">${statusMap[item.status] || ''}</td>`;
            
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

        } catch(err) { console.error('리스트 렌더링 에러:', err); }
    });
    
    tbody.innerHTML = htmlStr;

    setTimeout(() => { window.applyTableLock(); }, 50);
};

// ==========================================
// 💡 구글 드라이브 & 업로드 관련 로직
// ==========================================
window.getOrCreateDriveFolder = async function(folderName, parentFolderId) {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) { throw new Error("TOKEN_EXPIRED"); }
    
    const safeFolderName = getSafeString(folderName).replace(/['\/\\]/g, '_').trim() || '미분류 프로젝트';
    const queryStr = `name='${safeFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
    
    const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryStr)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { 'Authorization': 'Bearer ' + window.googleAccessToken } });
    if(!findRes.ok) throw new Error(`Google API Query Error: ${findRes.status}`);
    const folderData = await findRes.json();
    if(folderData.error) throw new Error(folderData.error.message);

    if (folderData.files && folderData.files.length > 0) {
        return folderData.files[0].id;
    } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: safeFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
        });
        const newData = await createRes.json();
        if(newData.error) throw new Error(newData.error.message);
        return newData.id;
    }
};

window.uploadFileWithProgress = async function(file, folderName, subFolderName = null, fileIndex = 1, totalFiles = 1) {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) { throw new Error("TOKEN_EXPIRED"); }

    let progressModal = document.getElementById('global-upload-progress-modal');
    if (!progressModal) {
        progressModal = document.createElement('div');
        progressModal.id = 'global-upload-progress-modal';
        progressModal.className = 'fixed inset-0 z-[99999] hidden items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 transition-opacity';
        progressModal.innerHTML = `<div class="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center text-center border border-white/20"><div class="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center text-2xl mb-4 shadow-inner"><i class="fa-solid fa-cloud-arrow-up animate-bounce"></i></div><h3 class="text-base font-black text-slate-800 mb-1">파일 업로드 중...</h3><p id="global-upload-filename" class="text-xs font-bold text-slate-500 mb-5 truncate w-full px-4"></p><div class="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden shadow-inner relative"><div id="global-upload-bar" class="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-200" style="width: 0%"></div></div><div class="flex justify-between w-full text-[10px] font-bold px-1"><span id="global-upload-size" class="text-slate-400">0 MB / 0 MB</span><span id="global-upload-pct" class="text-indigo-600 font-black text-xs">0%</span></div></div>`;
        document.body.appendChild(progressModal);
    }

    const progressBar = document.getElementById('global-upload-bar'), progressText = document.getElementById('global-upload-pct'), progressSize = document.getElementById('global-upload-size'), progressFilename = document.getElementById('global-upload-filename');
    progressModal.classList.remove('hidden'); progressModal.classList.add('flex');
    if (progressFilename) progressFilename.innerText = `[${fileIndex}/${totalFiles}] ${file.name}`;
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.innerText = '0%';
    if (progressSize) progressSize.innerText = '준비 중...';
    
    try {
        let targetFolderId = await window.getOrCreateDriveFolder(folderName, TARGET_DRIVE_FOLDER);
        if (subFolderName) targetFolderId = await window.getOrCreateDriveFolder(subFolderName, targetFolderId);

        return await new Promise((resolve, reject) => {
            const metadata = { name: file.name, parents: [targetFolderId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);
            
            const xhr = new XMLHttpRequest();
            xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + window.googleAccessToken);
            
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable && progressBar) {
                    const percent = Math.round((e.loaded / e.total) * 100);
                    const loadedMb = (e.loaded / (1024 * 1024)).toFixed(2);
                    const totalMb = (e.total / (1024 * 1024)).toFixed(2);
                    progressBar.style.width = percent + '%';
                    if(progressText) progressText.innerText = percent + '%';
                    if(progressSize) progressSize.innerText = `${loadedMb} MB / ${totalMb} MB`;
                }
            };
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) { 
                    if (fileIndex === totalFiles) { progressModal.classList.add('hidden'); progressModal.classList.remove('flex'); }
                    resolve(`https://drive.google.com/file/d/${JSON.parse(xhr.responseText).id}/view`); 
                } else { 
                    progressModal.classList.add('hidden'); progressModal.classList.remove('flex');
                    reject(new Error(`업로드 실패 (HTTP ${xhr.status})`)); 
                }
            };
            xhr.onerror = () => { progressModal.classList.add('hidden'); progressModal.classList.remove('flex'); reject(new Error("네트워크 오류")); };
            xhr.send(form);
        });
    } catch(e) { progressModal.classList.add('hidden'); progressModal.classList.remove('flex'); throw e; }
};

window.generateMediaHtml = function(filesArray) {
    if (!filesArray || !Array.isArray(filesArray) || filesArray.length === 0) return '';
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
            if (fileIdMatch) { viewUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`; thumbUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w600`; }
            if (f.thumbBase64 && f.thumbBase64.startsWith('data:image')) thumbUrl = f.thumbBase64;
            else if (f.url && f.url.startsWith('data:image')) thumbUrl = f.url;

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


// ==========================================
// 💡 각종 모달 (기본현황, 구매, 설계, 일정) 관리 로직
// ==========================================
window.openProjStatusWriteModal = function() {
    try {
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        
        setVal('ps-id', ''); setVal('ps-code', ''); setVal('ps-name', ''); setVal('ps-company', '');
        setVal('ps-part', window.currentProjPartTab || '제조'); setVal('ps-category', ''); setVal('ps-status', 'pending'); setVal('ps-progress-pct', '0');
        
        const members = window.teamMembers || [];
        const mHtml = '<option value="">선택</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        
        const managerSelect = document.getElementById('ps-manager'); if(managerSelect) managerSelect.innerHTML = mHtml;
        const memberSelect = document.getElementById('ps-member-add'); if(memberSelect) memberSelect.innerHTML = mHtml;

        const dateFields = ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en', 'ps-d-asm-end-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-set-st', 'ps-d-set-en'];
        dateFields.forEach(id => setVal(id, ''));
        
        window.currentSelectedMembers = [];
        if(window.renderSelectedMembers) window.renderSelectedMembers();

        const btnHistory = document.getElementById('btn-view-history'); if (btnHistory) btnHistory.classList.add('hidden'); 
        const canWrite = window.checkPjtWritePermission('status');
        const btnSave = document.getElementById('btn-proj-save'); const banner = document.getElementById('ps-readonly-banner');
        
        if (!canWrite) {
            if(btnSave) btnSave.classList.add('hidden'); if(banner) banner.classList.remove('hidden');
            document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = true);
        } else {
            if(btnSave) btnSave.classList.remove('hidden'); if(banner) banner.classList.add('hidden');
            document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = false);
            const curMdEl = document.getElementById('ps-current-md'); if (curMdEl) curMdEl.disabled = true;
            const finalMdEl = document.getElementById('ps-final-md'); if (finalMdEl) finalMdEl.disabled = true;
        }

        const modal = document.getElementById('proj-status-write-modal');
        if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    } catch(e) { safeShowError('모달을 여는 중 오류 발생', e); }
};

window.closeProjStatusWriteModal = function() { const modal = document.getElementById('proj-status-write-modal'); if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } };

window.editProjStatus = function(id) {
    try {
        const item = (window.currentProjectStatusList || []).find(p => p.id === id); 
        if(!item) return;
        
        const members = window.teamMembers || [];
        const mHtml = '<option value="">선택</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; };
        
        setVal('ps-id', item.id); setVal('ps-code', item.code || ''); setVal('ps-name', item.name || ''); setVal('ps-company', item.company || '');
        setVal('ps-part', item.part || '제조'); setVal('ps-category', item.category || ''); setVal('ps-status', item.status || 'pending'); setVal('ps-progress-pct', item.progress !== undefined ? item.progress : 0);
        
        const managerSelect = document.getElementById('ps-manager'); if(managerSelect) { managerSelect.innerHTML = mHtml; managerSelect.value = item.manager || ''; }
        const memberSelect = document.getElementById('ps-member-add'); if(memberSelect) memberSelect.innerHTML = mHtml;

        window.currentSelectedMembers = (item.members && typeof item.members === 'string') ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; 
        if(window.renderSelectedMembers) window.renderSelectedMembers();
        
        setVal('ps-est-md', item.estMd !== undefined ? item.estMd : '');
        setVal('ps-current-md', item.currentMd !== undefined ? item.currentMd : '');
        
        const cMd = parseFloat(item.currentMd) || 0; const oMd = parseFloat(item.outMd) || 0; 
        setVal('ps-final-md', (cMd + oMd).toFixed(1));
        
        setVal('ps-tot-pers', item.totPers !== undefined ? item.totPers : '');
        setVal('ps-out-pers', item.outPers !== undefined ? item.outPers : '');
        setVal('ps-out-md', item.outMd !== undefined ? item.outMd : '');
        
        const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
        for (const [key, elementId] of Object.entries(dateMappings)) { setVal(elementId, item[key] || ''); }
        
        const btnHistory = document.getElementById('btn-view-history'); if (btnHistory) btnHistory.classList.remove('hidden'); 
        
        const canWrite = window.checkPjtWritePermission('status', item.manager);
        const btnSave = document.getElementById('btn-proj-save'); const banner = document.getElementById('ps-readonly-banner');
        
        if (!canWrite) {
            if(btnSave) btnSave.classList.add('hidden'); if(banner) banner.classList.remove('hidden');
            document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = true);
        } else {
            if(btnSave) btnSave.classList.remove('hidden'); if(banner) banner.classList.add('hidden');
            document.querySelectorAll('#proj-status-write-modal input, #proj-status-write-modal select').forEach(el => el.disabled = false);
            const curMdEl = document.getElementById('ps-current-md'); if (curMdEl) curMdEl.disabled = true;
            const finalMdEl = document.getElementById('ps-final-md'); if (finalMdEl) finalMdEl.disabled = true;
        }
        
        const modal = document.getElementById('proj-status-write-modal');
        if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    } catch(e) { safeShowError('데이터 불러오기 에러', e); }
};

window.saveProjStatus = async function(btn) {
    try {
        if(btn) { btn.disabled = true; btn.innerHTML = '저장중...'; }
        
        const idEl = document.getElementById('ps-id'); const codeEl = document.getElementById('ps-code'); const nameEl = document.getElementById('ps-name');
        if(!codeEl || !nameEl) { if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; } return safeShowError("입력 폼 요소를 찾을 수 없습니다."); }

        const id = idEl.value; let code = codeEl.value.trim(); let name = nameEl.value.trim();
        if(!code || !name) { if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; } return safeShowError("PJT 코드와 프로젝트명을 모두 입력하세요."); }

        const currentMdEl = document.getElementById('ps-current-md'); const outMdEl = document.getElementById('ps-out-md');
        const currentMd = currentMdEl ? (parseFloat(currentMdEl.value) || 0) : 0; const outMd = outMdEl ? (parseFloat(outMdEl.value) || 0) : 0;
        const getVal = (eid) => { const el = document.getElementById(eid); return el ? el.value : ''; };

        const payload = { 
            code: code, name: name, company: getVal('ps-company'), part: getVal('ps-part') || '제조', category: getVal('ps-category'), 
            status: getVal('ps-status') || 'pending', progress: parseInt(getVal('ps-progress-pct')) || 0, manager: getVal('ps-manager'), members: getVal('ps-members'), 
            estMd: parseFloat(getVal('ps-est-md')) || 0, outMd: outMd, finalMd: currentMd + outMd, totPers: parseInt(getVal('ps-tot-pers'))||0, outPers: parseInt(getVal('ps-out-pers'))||0, 
            updatedAt: Date.now() 
        };
        
        const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
        for (const [key, elementId] of Object.entries(dateMappings)) { payload[key] = getVal(elementId); }

        const cleanPayload = JSON.parse(JSON.stringify(payload));
        Object.keys(cleanPayload).forEach(key => { if (cleanPayload[key] === undefined) cleanPayload[key] = null; });

        if(id) { 
            const oldSnap = await getDoc(doc(db, "projects_status", id));
            if(oldSnap.exists()) { await addDoc(collection(db, "project_history"), { projectId: id, snapshot: oldSnap.data(), changedBy: (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'Unknown', changedAt: Date.now() }); }
            await setDoc(doc(db, "projects_status", id), cleanPayload, { merge: true }); safeShowSuccess("성공적으로 수정되었습니다."); 
        } else { 
            cleanPayload.createdAt = Date.now(); cleanPayload.currentMd = 0; cleanPayload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; cleanPayload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system';
            await addDoc(collection(db, "projects_status"), cleanPayload); safeShowSuccess("성공적으로 등록되었습니다."); 
            try { const folderName = cleanPayload.code ? cleanPayload.code : cleanPayload.name; await window.getOrCreateDriveFolder(folderName, TARGET_DRIVE_FOLDER); } catch(e) { console.warn("폴더 생성 지연(무시가능):", e); }
        } 
        
        if(window.closeProjStatusWriteModal) window.closeProjStatusWriteModal(); 
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    } catch(error) { safeShowError("저장 중 오류 발생", error); if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; } }
};

window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); safeShowSuccess("삭제되었습니다."); } catch(e) { safeShowError("삭제 실패", e); } };
window.calcFinalMd = function() { const curMdEl = document.getElementById('ps-current-md'); const outMdEl = document.getElementById('ps-out-md'); const finalMdEl = document.getElementById('ps-final-md'); if(curMdEl && outMdEl && finalMdEl) { const curMd = parseFloat(curMdEl.value) || 0; const outMd = parseFloat(outMdEl.value) || 0; finalMdEl.value = (curMd + outMd).toFixed(1); } };

window.addProjectMember = function(name) { if(!name) return; window.currentSelectedMembers = window.currentSelectedMembers || []; if(!window.currentSelectedMembers.includes(name)) { window.currentSelectedMembers.push(name); if(window.renderSelectedMembers) window.renderSelectedMembers(); } const el = document.getElementById('ps-member-add'); if(el) el.selectedIndex = 0; };
window.removeProjectMember = function(name) { window.currentSelectedMembers = window.currentSelectedMembers || []; window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); if(window.renderSelectedMembers) window.renderSelectedMembers(); };
window.renderSelectedMembers = function() { 
    const container = document.getElementById('ps-selected-members'); const memInput = document.getElementById('ps-members'); const membersList = window.currentSelectedMembers || [];
    if(memInput) memInput.value = membersList.join(', '); 
    if(container) { container.innerHTML = membersList.map(function(name) { return `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`; }).join(''); }
};

window.openProjHistoryModal = function() { try { const el = document.getElementById('ps-id'); if(!el) return; const projectId = el.value; if(!projectId) return; const modal = document.getElementById('proj-history-modal'); if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); if(window.loadProjectHistory) window.loadProjectHistory(projectId); } } catch(e) {} };
window.closeProjHistoryModal = function() { const modal = document.getElementById('proj-history-modal'); if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } };

window.loadProjectHistory = async function(projectId) {
    const listEl = document.getElementById('proj-history-list'); if(!listEl) return;
    listEl.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin"></i> 이력을 불러오는 중...</div>';
    try {
        const q = query(collection(db, "project_history"), where("projectId", "==", projectId)); const snap = await getDocs(q); let hList = []; 
        snap.forEach(function(doc) { let data = doc.data(); data.id = doc.id; hList.push(data); }); 
        hList.sort(function(a,b) { return b.changedAt - a.changedAt; });
        if(hList.length === 0) { listEl.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">저장된 변경 이력이 없습니다.</div>'; return; }
        let historyHtml = '';
        hList.forEach(function(h) {
            const dateStr = window.getDateTimeStr(new Date(h.changedAt));
            historyHtml += `<li class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow"><div><div class="font-black text-sm text-slate-700">${dateStr}</div><div class="text-[11px] text-slate-500 mt-1">변경자: <span class="font-bold text-indigo-600">${h.changedBy}</span></div></div><button onclick="window.restoreProjectHistory('${h.id}', '${projectId}')" class="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm"><i class="fa-solid fa-rotate-left"></i> 이 시점으로 복원</button></li>`;
        });
        listEl.innerHTML = historyHtml;
    } catch(e) { listEl.innerHTML = '<div class="text-center p-6 text-rose-500 font-bold">이력을 불러오는데 실패했습니다.</div>'; }
};

window.restoreProjectHistory = async function(histId, projectId) {
    if(!confirm("이 시점의 데이터로 프로젝트를 복원하시겠습니까?\n(현재 상태는 덮어씌워집니다)")) return;
    try {
        const hSnap = await getDoc(doc(db, "project_history", histId));
        if(hSnap.exists()) {
            const oldData = hSnap.data().snapshot; oldData.updatedAt = Date.now();
            await setDoc(doc(db, "projects_status", projectId), oldData);
            safeShowSuccess("복원되었습니다."); if(window.closeProjHistoryModal) window.closeProjHistoryModal(); if(window.editProjStatus) window.editProjStatus(projectId);
        }
    } catch(e) { safeShowError("복원 실패", e); }
};

// ==========================================
// 💡 간트 & 캘린더 복구
// ==========================================
window.toggleProjDashView = function(view) {
    window.currentProjDashView = view;
    const listC = document.getElementById('proj-dash-list-container'); const ganttC = document.getElementById('proj-dash-gantt-container'); const calC = document.getElementById('proj-dash-calendar-container');
    
    if(listC) listC.classList.add('hidden'); 
    if(ganttC) { ganttC.classList.add('hidden'); ganttC.classList.remove('flex'); } 
    if(calC) { calC.classList.add('hidden'); calC.classList.remove('flex'); }
    
    ['list', 'gantt', 'calendar'].forEach(function(b) {
        const btn = document.getElementById('btn-pd-' + b); 
        if(btn) btn.className = "px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 rounded-md transition-colors whitespace-nowrap";
    });
    
    const activeBtn = document.getElementById('btn-pd-' + view); 
    if(activeBtn) activeBtn.className = "px-2 py-1 text-[11px] font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-colors whitespace-nowrap";
    
    if(view === 'list' && listC) { listC.classList.remove('hidden'); if(window.renderProjectStatusList) window.renderProjectStatusList(); } 
    else if(view === 'gantt' && ganttC) { ganttC.classList.remove('hidden'); ganttC.classList.add('flex'); if(window.renderProjGantt) window.renderProjGantt(); } 
    else if(view === 'calendar' && calC) { calC.classList.remove('hidden'); calC.classList.add('flex'); if(window.renderProjCalendar) window.renderProjCalendar(); }
};

window.scrollToGanttToday = function() {
    const container = document.getElementById('proj-dash-gantt-content');
    const todayLine = document.getElementById('gantt-today-line');
    if(container && todayLine) {
        const targetLeft = todayLine.getBoundingClientRect().left - container.getBoundingClientRect().left;
        container.scrollTo({ left: targetLeft - (container.clientWidth / 2), behavior: 'smooth' });
    }
};

window.renderProjGantt = function() {
    try {
        const container = document.getElementById('proj-dash-gantt-content'); if(!container) return;
        const projects = window.getFilteredProjects();
        if(projects.length === 0) { container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold">조건에 맞는 프로젝트가 없습니다.</div>'; return; }

        let minDate = new Date(); minDate.setDate(minDate.getDate() - 15);
        let maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 45);
        
        projects.forEach(p => {
            const s = new Date(p.d_asmSt || p.d_asmEst || p.createdAt);
            const e = new Date(p.d_shipEn || p.d_shipEst || p.createdAt);
            if (!isNaN(s.getTime()) && s < minDate) minDate = new Date(s);
            if (!isNaN(e.getTime()) && e > maxDate) maxDate = new Date(e);
        });

        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
        if (totalDays <= 0) return;

        let dateHeaders = ''; let bgLines = '';
        for(let i=0; i<=totalDays; i++) { 
            let d = new Date(minDate); d.setDate(d.getDate() + i);
            let pct = (i / totalDays) * 100;
            let isWknd = d.getDay() === 0 || d.getDay() === 6;
            let isHol = KR_HOLIDAYS.has(window.getLocalDateStr(d));
            let color = (isWknd || isHol) ? 'text-rose-500' : 'text-slate-500';
            let bgClass = (isWknd || isHol) ? 'bg-rose-50/50 border-r border-rose-200' : 'border-r border-slate-200';
            if (totalDays < 45 || i % 2 === 0 || d.getDate() === 1) { 
                let text = d.getDate() === 1 ? `${d.getMonth()+1}/${d.getDate()}` : `${d.getDate()}`;
                let fontW = d.getDate() === 1 ? 'font-black' : 'font-bold';
                dateHeaders += `<div class="absolute text-[10px] ${color} ${fontW} -translate-x-1/2 bottom-1" style="left:${pct}%">${text}</div>`;
            }
            bgLines += `<div class="absolute top-0 bottom-0 ${bgClass}" style="left:${pct}%; width:${100/totalDays}%;"></div>`;
        }

        let todayPct = ((new Date() - minDate) / (1000 * 60 * 60 * 24)) / totalDays * 100;
        let todayLineHtml = '';
        if(todayPct >= 0 && todayPct <= 100) {
            todayLineHtml = `<div id="gantt-today-line" class="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-30 pointer-events-none" style="left: ${todayPct}%;">
                                <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-t shadow-sm">오늘</div>
                             </div>`;
        }

        let rowsHtml = '';
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

                let gradient = 'from-indigo-400 to-indigo-600';
                if (p.status === 'completed') gradient = 'from-emerald-400 to-emerald-600';
                else if (p.status === 'inspecting') gradient = 'from-teal-400 to-teal-600';
                else if (p.status === 'pending' || p.status === 'rejected') gradient = 'from-slate-400 to-slate-500';

                barHtml = `<div class="absolute h-6 rounded-md bg-gradient-to-r ${gradient} shadow-md hover:brightness-110 hover:scale-y-110 transition-all cursor-pointer border border-white/20 flex items-center px-2 overflow-hidden z-20" style="left:${leftPct}%; width:${widthPct}%;">
                    <span class="text-white text-[10px] font-black truncate drop-shadow-md leading-none">${p.progress||0}%</span>
                </div>`;
            } else { barHtml = `<div class="text-[10px] text-slate-400 italic px-4 w-full text-center">일정 미지정</div>`; }
            
            rowsHtml += `
            <div class="flex items-center w-full h-12 border-b border-slate-200 hover:bg-indigo-50/40 transition-colors group" onclick="window.editProjStatus('${p.id}')">
                <div class="w-[320px] shrink-0 sticky left-0 bg-white group-hover:bg-indigo-50/80 border-r border-slate-200 px-4 h-full flex items-center z-40 shadow-[2px_0_5px_rgba(0,0,0,0.03)] cursor-pointer">
                    <div class="font-bold text-[11px] text-slate-700 truncate w-full" title="${title}">${title}</div>
                </div>
                <div class="flex-1 relative h-full flex items-center mx-0 pointer-events-none group-hover:pointer-events-auto">${barHtml}</div>
            </div>`;
        });

        container.innerHTML = `
        <div class="relative min-w-[800px] w-full bg-white flex flex-col">
            <div class="flex w-full h-10 border-b border-slate-300 bg-slate-100 sticky top-0 z-50 shadow-sm">
                <div class="w-[320px] shrink-0 sticky left-0 bg-slate-100 border-r border-slate-300 px-4 flex items-center justify-center font-black text-xs text-slate-600 shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-50">프로젝트명</div>
                <div class="flex-1 relative mx-0">${dateHeaders}</div>
            </div>
            <div class="flex flex-col relative w-full flex-1 min-h-[300px]">
                <div class="absolute inset-y-0 right-0 z-0 flex pointer-events-none" style="left: 320px;">${bgLines}${todayLineHtml}</div>
                <div class="relative z-10 flex flex-col w-full pb-4">${rowsHtml}</div>
            </div>
        </div>`;
        
        setTimeout(() => {
            const todayLine = document.getElementById('gantt-today-line');
            if(container && todayLine) {
                const targetLeft = todayLine.offsetLeft;
                container.scrollTo({ left: targetLeft - (container.clientWidth / 2) + 160, behavior: 'smooth' });
            }
        }, 100);
    } catch(e) { console.error("Gantt Rendering Error:", e); }
};

window.renderProjCalendar = function() {
    try {
        const container = document.getElementById('proj-dash-calendar-content');
        if(!container) return;
        const projects = window.getFilteredProjects();
        const now = window.calendarCurrentDate || new Date();
        const year = now.getFullYear(); const month = now.getMonth() + 1;
        
        let html = `<div class="flex justify-between items-center mb-4"><button onclick="window.calendarCurrentDate.setMonth(window.calendarCurrentDate.getMonth()-1); window.renderProjCalendar()" class="p-2 text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-chevron-left"></i></button><h3 class="text-sm font-black text-slate-800">${year}년 ${month}월 출하/조립 일정</h3><button onclick="window.calendarCurrentDate.setMonth(window.calendarCurrentDate.getMonth()+1); window.renderProjCalendar()" class="p-2 text-slate-400 hover:text-indigo-600"><i class="fa-solid fa-chevron-right"></i></button></div>`;
        html += `<div class="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">`;
        const days = ['일','월','화','수','목','금','토'];
        days.forEach(d => html += `<div class="bg-slate-50 text-center py-2 text-[10px] font-bold ${d==='일'?'text-rose-500':(d==='토'?'text-blue-500':'text-slate-600')}">${d}</div>`);
        
        const firstDay = new Date(year, month - 1, 1).getDay(); const lastDate = new Date(year, month, 0).getDate();
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
            html += `<div class="bg-white min-h-[100px] p-1 border-t-2 ${isToday?'border-indigo-500':'border-transparent'} flex flex-col"><span class="text-[10px] font-bold text-slate-500 text-center mb-1 ${isToday?'bg-indigo-600 text-white rounded-full w-5 h-5 mx-auto leading-5 shadow-md':''}">${d}</span><div class="flex-1 overflow-y-auto custom-scrollbar">${pjtHtml}</div></div>`;
        }
        html += `</div>`; container.innerHTML = html;
    } catch(e) { console.error("Calendar Rendering Error:", e); }
};

// ==========================================
// 💡 구매, 설계, 일정 모달창 복구
// ==========================================
window.openPurchaseModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('purchase-modal'); if(!modal) return;
        const reqIdEl = document.getElementById('pur-req-id'); if(reqIdEl) reqIdEl.value = projectId || '';
        const titleEl = document.getElementById('pur-project-title'); if(titleEl) titleEl.innerText = title || '';
        if(window.resetPurchaseForm) window.resetPurchaseForm();
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
        const mgr = proj ? proj.manager : '';
        const canWrite = window.checkPjtWritePermission('purchase', mgr);
        
        if (canWrite) {
            document.getElementById('pur-input-section').classList.remove('hidden'); document.getElementById('pur-input-section').classList.add('flex');
            document.getElementById('pur-readonly-banner').classList.add('hidden');
        } else {
            document.getElementById('pur-input-section').classList.add('hidden'); document.getElementById('pur-input-section').classList.remove('flex');
            document.getElementById('pur-readonly-banner').classList.remove('hidden');
        }

        modal.classList.remove('hidden'); modal.classList.add('flex');
        
        if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe();
        currentPurchaseUnsubscribe = onSnapshot(query(collection(db, "project_purchases"), where("projectId", "==", projectId)), function(snap) {
            let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
            const listEl = document.getElementById('purchase-list'); if(!listEl) return;
            if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 구매 내역이 없습니다.</div>'; return; }
            listEl.innerHTML = list.map(item => {
                let dateStr = item.createdAt ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : '';
                let safeContent = getSafeString(item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(item.files) : '';
                let deleteBtnHtml = (canWrite && (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) ? `<button onclick="window.deletePurchase('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between items-start"><div class="flex items-center gap-2"><span class="font-bold text-amber-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div><div class="flex gap-2">${deleteBtnHtml}</div></div><div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>${attachmentsHtml}</div>`;
            }).join('');
        });
    } catch(e) { safeShowError('모달 에러', e); }
};
window.closePurchaseModal = function() { const m = document.getElementById('purchase-modal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} if(currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); };
window.resetPurchaseForm = function() { const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; }; setVal('editing-pur-id', ''); setVal('new-pur-text', ''); setVal('new-pur-file', ''); const fname = document.getElementById('pur-file-name'); if(fname) fname.innerText = ''; };
window.savePurchaseItem = async function() { 
    const pIdEl = document.getElementById('pur-req-id'); const titleEl = document.getElementById('pur-project-title'); if(!pIdEl || !titleEl) return;
    const pId = pIdEl.value; const title = titleEl.innerText; const proj = (window.currentProjectStatusList || []).find(p => p.id === pId); const folderName = proj && proj.code ? proj.code : title;
    const contentEl = document.getElementById('new-pur-text'); const fileInput = document.getElementById('new-pur-file'); const btn = document.getElementById('btn-pur-save');
    if(!contentEl || !fileInput || !btn) return;
    const content = contentEl.value.trim(); if(!content && fileInput.files.length === 0) return safeShowError("내용/파일 첨부 필수.");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            for(let i=0; i<fileInput.files.length; i++) {
                let url = await window.uploadFileWithProgress(fileInput.files[i], folderName, '구매', i+1, fileInput.files.length);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }
        await addDoc(collection(db, "project_purchases"), { projectId: pId, content: content, files: filesData, authorUid: window.currentUser?.uid||'system', authorName: window.userProfile?.name||'system', createdAt: Date.now() });
        safeShowSuccess("등록 성공"); if(window.resetPurchaseForm) window.resetPurchaseForm(); 
    } catch(e) { safeShowError("저장 실패", e); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deletePurchase = async function(id) { if(confirm("삭제하시겠습니까?")) { try { await deleteDoc(doc(db, "project_purchases", id)); safeShowSuccess("삭제되었습니다."); } catch(e) { safeShowError("삭제 실패", e); } } };

window.openDesignModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('design-modal'); if(!modal) return;
        const reqIdEl = document.getElementById('des-req-id'); if(reqIdEl) reqIdEl.value = projectId || '';
        const titleEl = document.getElementById('des-project-title'); if(titleEl) titleEl.innerText = title || '';
        if(window.resetDesignForm) window.resetDesignForm();
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
        const mgr = proj ? proj.manager : '';
        const canWrite = window.checkPjtWritePermission('design', mgr);
        
        if (canWrite) {
            document.getElementById('des-input-section').classList.remove('hidden'); document.getElementById('des-input-section').classList.add('flex');
            document.getElementById('des-readonly-banner').classList.add('hidden');
        } else {
            document.getElementById('des-input-section').classList.add('hidden'); document.getElementById('des-input-section').classList.remove('flex');
            document.getElementById('des-readonly-banner').classList.remove('hidden');
        }

        modal.classList.remove('hidden'); modal.classList.add('flex');
        
        if (currentDesignUnsubscribe) currentDesignUnsubscribe();
        currentDesignUnsubscribe = onSnapshot(query(collection(db, "project_designs"), where("projectId", "==", projectId)), function(snap) {
            let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
            const listEl = document.getElementById('design-list'); if(!listEl) return;
            if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 설계 파일이 없습니다.</div>'; return; }
            listEl.innerHTML = list.map(item => {
                let dateStr = item.createdAt ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : '';
                let safeContent = getSafeString(item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(item.files) : '';
                let deleteBtnHtml = (canWrite && (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) ? `<button onclick="window.deleteDesign('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between items-start"><div class="flex items-center gap-2"><span class="font-bold text-teal-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div><div class="flex gap-2">${deleteBtnHtml}</div></div><div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>${attachmentsHtml}</div>`;
            }).join('');
        });
    } catch(e) { safeShowError('모달 에러', e); }
};
window.closeDesignModal = function() { const m = document.getElementById('design-modal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} if(currentDesignUnsubscribe) currentDesignUnsubscribe(); };
window.resetDesignForm = function() { const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; }; setVal('editing-des-id', ''); setVal('new-des-text', ''); setVal('new-des-file', ''); const fname = document.getElementById('des-file-name'); if(fname) fname.innerText = ''; };
window.saveDesignItem = async function() { 
    const pIdEl = document.getElementById('des-req-id'); const titleEl = document.getElementById('des-project-title'); if(!pIdEl || !titleEl) return;
    const pId = pIdEl.value; const title = titleEl.innerText; const proj = (window.currentProjectStatusList || []).find(p => p.id === pId); const folderName = proj && proj.code ? proj.code : title;
    const contentEl = document.getElementById('new-des-text'); const fileInput = document.getElementById('new-des-file'); const btn = document.getElementById('btn-des-save');
    if(!contentEl || !fileInput || !btn) return;
    const content = contentEl.value.trim(); if(!content && fileInput.files.length === 0) return safeShowError("내용/파일 첨부 필수.");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            for(let i=0; i<fileInput.files.length; i++) {
                let url = await window.uploadFileWithProgress(fileInput.files[i], folderName, '설계', i+1, fileInput.files.length);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }
        await addDoc(collection(db, "project_designs"), { projectId: pId, content: content, files: filesData, authorUid: window.currentUser?.uid||'system', authorName: window.userProfile?.name||'system', createdAt: Date.now() });
        safeShowSuccess("등록 성공"); if(window.resetDesignForm) window.resetDesignForm(); 
    } catch(e) { safeShowError("저장 실패", e); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deleteDesign = async function(id) { if(confirm("삭제하시겠습니까?")) { try { await deleteDoc(doc(db, "project_designs", id)); safeShowSuccess("삭제되었습니다."); } catch(e) { safeShowError("삭제 실패", e); } } };

window.openPjtScheduleModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('pjt-schedule-modal'); if(!modal) return;
        const reqIdEl = document.getElementById('sch-req-id'); if(reqIdEl) reqIdEl.value = projectId || '';
        const titleEl = document.getElementById('sch-project-title'); if(titleEl) titleEl.innerText = title || '';
        if(window.resetPjtScheduleForm) window.resetPjtScheduleForm();
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
        const mgr = proj ? proj.manager : '';
        const canWrite = window.checkPjtWritePermission('schedule', mgr);
        
        if (canWrite) {
            document.getElementById('sch-input-section').classList.remove('hidden'); document.getElementById('sch-input-section').classList.add('flex');
            document.getElementById('sch-readonly-banner').classList.add('hidden');
        } else {
            document.getElementById('sch-input-section').classList.add('hidden'); document.getElementById('sch-input-section').classList.remove('flex');
            document.getElementById('sch-readonly-banner').classList.remove('hidden');
        }

        modal.classList.remove('hidden'); modal.classList.add('flex');
        
        if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe();
        currentPjtScheduleUnsubscribe = onSnapshot(query(collection(db, "project_schedules"), where("projectId", "==", projectId)), function(snap) {
            let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); list.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
            const listEl = document.getElementById('pjt-schedule-list'); if(!listEl) return;
            if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 PJT 일정이 없습니다.</div>'; return; }
            listEl.innerHTML = list.map(item => {
                let dateStr = item.createdAt ? window.getDateTimeStr(new Date(getSafeMillis(item.createdAt))) : '';
                let safeContent = getSafeString(item.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let attachmentsHtml = window.generateMediaHtml ? window.generateMediaHtml(item.files) : '';
                let deleteBtnHtml = (canWrite && (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) ? `<button onclick="window.deletePjtSchedule('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between items-start"><div class="flex items-center gap-2"><span class="font-bold text-fuchsia-600 text-sm">${getSafeString(item.authorName)}</span><span class="text-[10px] text-slate-400 font-medium">${dateStr}</span></div><div class="flex gap-2">${deleteBtnHtml}</div></div><div class="text-[13px] text-slate-700 font-medium break-words leading-relaxed">${safeContent}</div>${attachmentsHtml}</div>`;
            }).join('');
        });
    } catch(e) { safeShowError('모달 에러', e); }
};
window.closePjtScheduleModal = function() { const m = document.getElementById('pjt-schedule-modal'); if(m){m.classList.add('hidden');m.classList.remove('flex');} if(currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); };
window.resetPjtScheduleForm = function() { const setVal = (eid, val) => { const el = document.getElementById(eid); if(el) el.value = val; }; setVal('editing-sch-id', ''); setVal('new-sch-text', ''); setVal('new-sch-file', ''); const fname = document.getElementById('sch-file-name'); if(fname) fname.innerText = ''; };
window.savePjtScheduleItem = async function() { 
    const pIdEl = document.getElementById('sch-req-id'); const titleEl = document.getElementById('sch-project-title'); if(!pIdEl || !titleEl) return;
    const pId = pIdEl.value; const title = titleEl.innerText; const proj = (window.currentProjectStatusList || []).find(p => p.id === pId); const folderName = proj && proj.code ? proj.code : title;
    const contentEl = document.getElementById('new-sch-text'); const fileInput = document.getElementById('new-sch-file'); const btn = document.getElementById('btn-sch-save');
    if(!contentEl || !fileInput || !btn) return;
    const content = contentEl.value.trim(); if(!content && fileInput.files.length === 0) return safeShowError("내용/파일 첨부 필수.");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let filesData = [];
        if (fileInput.files.length > 0) {
            for(let i=0; i<fileInput.files.length; i++) {
                let url = await window.uploadFileWithProgress(fileInput.files[i], folderName, '일정', i+1, fileInput.files.length);
                filesData.push({ name: fileInput.files[i].name, url: url });
            }
        }
        await addDoc(collection(db, "project_schedules"), { projectId: pId, content: content, files: filesData, authorUid: window.currentUser?.uid||'system', authorName: window.userProfile?.name||'system', createdAt: Date.now() });
        safeShowSuccess("등록 성공"); if(window.resetPjtScheduleForm) window.resetPjtScheduleForm(); 
    } catch(e) { safeShowError("저장 실패", e); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deletePjtSchedule = async function(id) { if(confirm("삭제하시겠습니까?")) { try { await deleteDoc(doc(db, "project_schedules", id)); safeShowSuccess("삭제되었습니다."); } catch(e) { safeShowError("삭제 실패", e); } } };


// ==========================================
// 💡 MD 투입 기록 모달 (팀원 전용 쓰기 권한 로직 적용)
// ==========================================
window.openMdLogModal = function(projectId, title, curMd) { 
    try {
        const modal = document.getElementById('md-log-modal'); if(!modal) return;
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        
        const reqEl = document.getElementById('md-req-id'); if(reqEl) reqEl.value = projectId; 
        const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; 
        
        if(window.resetMdLogForm) window.resetMdLogForm(); 
        
        // 💡 프로젝트 소속 팀원만 MD 수정 가능
        const user = window.userProfile || {};
        const isAdmin = user.role === 'admin' || user.role === 'master';
        const isManager = proj.manager === user.name;
        const isMember = (proj.members || '').includes(user.name);
        const canWrite = isAdmin || isManager || isMember;

        if (canWrite) {
            document.getElementById('md-input-section').classList.remove('hidden'); document.getElementById('md-input-section').classList.add('flex');
            document.getElementById('md-readonly-banner').classList.add('hidden');
        } else {
            document.getElementById('md-input-section').classList.add('hidden'); document.getElementById('md-input-section').classList.remove('flex');
            document.getElementById('md-readonly-banner').classList.remove('hidden');
        }
        
        modal.classList.remove('hidden'); modal.classList.add('flex'); 
        if(window.loadMdLogs) window.loadMdLogs(projectId, canWrite); 
    } catch(e) { safeShowError('MD 모달창 오픈 실패', e); }
};

window.loadMdLogs = function(projectId, canWrite) { 
    if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); 
    currentMdLogUnsubscribe = onSnapshot(collection(db, "project_md_logs"), function(snapshot) { 
        try {
            window.currentMdLogs = []; let totalMd = 0; 
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                if(d.projectId === projectId || d.reqId === projectId) { d.id = docSnap.id; window.currentMdLogs.push(d); totalMd += parseFloat(d.md) || 0; }
            }); 
            window.currentMdLogs.sort((a, b) => { let da = a.date || ''; let db = b.date || ''; if (da !== db) return db.localeCompare(da); return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); }); 
            const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = '총 ' + totalMd.toFixed(1) + ' MD'; 
            if(window.renderMdLogs) window.renderMdLogs(window.currentMdLogs, canWrite); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderMdLogs = function(logs, canWrite) { 
    const list = document.getElementById('md-log-list'); if(!list) return;
    if (logs.length === 0) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; return; } 
    try {
        let htmlStr = '';
        logs.forEach(log => { 
            let safeDesc = String(log.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            if(window.formatMentions) safeDesc = window.formatMentions(safeDesc);
            let btnHtml = '-';
            if (canWrite && (log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin')) {
                btnHtml = `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
            }
            htmlStr += `<tr class="hover:bg-purple-50/30 transition-colors border-b border-slate-100"><td class="p-3 text-center text-slate-500 font-bold">${getSafeString(log.date)}</td><td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td><td class="p-3 text-slate-700">${safeDesc || '-'}</td><td class="p-3 text-center text-slate-600 font-bold">${getSafeString(log.authorName)}</td><td class="p-3 text-center"><div class="flex justify-center gap-2">${btnHtml}</div></td></tr>`; 
        });
        list.innerHTML = htmlStr;
    } catch(e) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-rose-500 font-bold">렌더링 오류 발생</td></tr>'; }
};

window.saveMdLogItem = async function() { 
    const pIdEl = document.getElementById('md-req-id'), logIdEl = document.getElementById('editing-md-id'), dateEl = document.getElementById('new-md-date'), mdValEl = document.getElementById('new-md-val'), descEl = document.getElementById('new-md-desc');
    if(!pIdEl || !dateEl || !mdValEl) return;
    const projectId = pIdEl.value, logId = logIdEl ? logIdEl.value : '', date = dateEl.value, mdVal = mdValEl.value, desc = descEl ? descEl.value.trim() : ''; 
    if(!date || !mdVal) return safeShowError("날짜와 투입 MD를 입력하세요."); 
    try { 
        if (logId) { 
            await setDoc(doc(db, "project_md_logs", logId), { date: date, md: parseFloat(mdVal), desc: desc, updatedAt: Date.now() }, { merge: true }); safeShowSuccess("MD 내역이 수정되었습니다."); 
        } else { 
            await addDoc(collection(db, "project_md_logs"), { projectId: projectId, date: date, md: parseFloat(mdVal), desc: desc, authorUid: window.currentUser?.uid||'system', authorName: window.userProfile?.name||'system', createdAt: Date.now() }); safeShowSuccess("MD 내역이 등록되었습니다."); 
            if(window.processMentions) await window.processMentions(desc, projectId, "투입MD기록");
        } 
        if(window.updateProjectTotalMd) await window.updateProjectTotalMd(projectId); 
        if(window.resetMdLogForm) window.resetMdLogForm(); 
    } catch(e) { safeShowError("저장 중 오류 발생", e); } 
};

window.editMdLog = function(id) { 
    const log = (window.currentMdLogs || []).find(l => l.id === id); if(!log) return; 
    document.getElementById('editing-md-id').value = id; document.getElementById('new-md-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = log.md || ''; document.getElementById('new-md-desc').value = log.desc || ''; 
    const btnSave = document.getElementById('btn-md-save'); if(btnSave) btnSave.innerText = '수정'; 
    const btnCancel = document.getElementById('btn-md-cancel'); if(btnCancel) btnCancel.classList.remove('hidden'); 
};

window.deleteMdLog = async function(id, projectId) { 
    if(!confirm("이 MD 내역을 삭제하시겠습니까?")) return; 
    try { await deleteDoc(doc(db, "project_md_logs", id)); if(window.updateProjectTotalMd) await window.updateProjectTotalMd(projectId); safeShowSuccess("삭제되었습니다."); if(window.resetMdLogForm) window.resetMdLogForm(); } 
    catch(e) { safeShowError("삭제 실패", e); } 
};

window.updateProjectTotalMd = async function(projectId) { 
    const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); let total = 0; snap.forEach(docSnap => total += parseFloat(docSnap.data().md) || 0); 
    const projRef = doc(db, "projects_status", projectId); const projSnap = await getDoc(projRef); 
    if(projSnap.exists()) { const outMd = parseFloat(projSnap.data().outMd) || 0; await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); } 
};

window.closeMdLogModal = function() { const m = document.getElementById('md-log-modal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); };
window.resetMdLogForm = function() { 
    document.getElementById('editing-md-id').value = ''; document.getElementById('new-md-date').value = window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = ''; document.getElementById('new-md-desc').value = ''; 
    const btnSave = document.getElementById('btn-md-save'); if(btnSave) btnSave.innerText = '등록'; 
    const btnCancel = document.getElementById('btn-md-cancel'); if(btnCancel) btnCancel.classList.add('hidden'); 
};


// ==========================================
// 💡 부적합(NCR) 데이터 동기화
// ==========================================
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
        window.ncrData = rows.slice(dataStartIndex).map(r => ({ ncrNo: r[0]?getSafeString(r[0]).trim():'', date: r[1]?getSafeString(r[1]).trim():'', pjtCode: r[2]?getSafeString(r[2]).trim():'', partName: r[3]?getSafeString(r[3]).trim():'', drawingNo: r[4]?getSafeString(r[4]).trim():'', type: r[12]?getSafeString(r[12]).trim():'', content: r[13]?getSafeString(r[13]).trim():'', action: r[14]?getSafeString(r[14]).trim():'', expectedDate: r[17]?getSafeString(r[17]).trim():'', completedDate: r[18]?getSafeString(r[18]).trim():'', status: r[15]?getSafeString(r[15]).trim():'' })).filter(n => n.pjtCode !== ''); 
        
        safeShowSuccess(`부적합(NCR) 데이터 ${window.ncrData.length}건 동기화 완료!`);
        if(window.renderProjectStatusList) window.renderProjectStatusList();
    } catch(e) { safeShowError(`동기화 실패`, e); }
};

window.openNcrModal = function(pjtCode, pjtName) {
    try {
        const titleEl = document.getElementById('ncr-modal-pjt-name');
        if (titleEl) { titleEl.innerText = `[${getSafeString(pjtCode)}] ${getSafeString(pjtName)}`; titleEl.dataset.code = getSafeString(pjtCode); }
        
        if(window.toggleSidebar) window.toggleSidebar(false); 
        
        const modal = document.getElementById('ncr-modal');
        if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        
        const tbody = document.getElementById('ncr-modal-list'); if (!tbody) return;
        const safeTargetCode = getSafeString(pjtCode).replace(/\s/g, '').toUpperCase();
        const list = (window.ncrData || []).filter(n => getSafeString(n.pjtCode).replace(/\s/g, '').toUpperCase() === safeTargetCode);
        
        if (list.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center p-6 text-slate-400 font-bold bg-white">등록된 부적합 내역이 없습니다.</td></tr>'; return; }
        
        tbody.innerHTML = list.map(n => {
            const isComp = getSafeString(n.status).includes('완료') || getSafeString(n.status).includes('종결');
            return `<tr class="hover:bg-slate-50 transition-colors bg-white border-b border-slate-100"><td class="p-3 text-center font-bold text-slate-500 whitespace-nowrap">${getSafeString(n.ncrNo) || '-'}</td><td class="p-3 text-center text-slate-500 whitespace-nowrap">${getSafeString(n.date) || '-'}</td><td class="p-3 font-bold text-slate-700">${getSafeString(n.drawingNo) || '-'}</td><td class="p-3 text-slate-600">${getSafeString(n.partName) || '-'}</td><td class="p-3 text-slate-600">${getSafeString(n.content).replace(/</g, '&lt;').replace(/>/g, '&gt;') || '-'}</td><td class="p-3 text-center text-rose-500 font-bold">${getSafeString(n.expectedDate) || '-'}</td><td class="p-3 text-center text-emerald-500 font-bold">${getSafeString(n.completedDate) || '-'}</td><td class="p-3 text-center whitespace-nowrap">${isComp ? `<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">완료</span>` : `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">진행중</span>`}</td></tr>`;
        }).join('');
    } catch (e) { safeShowError('NCR 모달 에러', e); }
};
window.closeNcrModal = function() { const m = document.getElementById('ncr-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } };

// ==========================================
// 💡 외부 링크 모달
// ==========================================
window.openLinkModal = function(projectId, title) {
    const modal = document.getElementById('link-modal'); if(!modal) return;
    document.getElementById('link-req-id').value = projectId;
    document.getElementById('link-project-title').innerText = title;
    document.getElementById('new-link-name').value = '';
    document.getElementById('new-link-url').value = '';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    window.loadLinks(projectId);
};

window.closeLinkModal = function() { const m = document.getElementById('link-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } };

window.loadLinks = async function(projectId) {
    const tbody = document.getElementById('link-list-tbody'); if(!tbody) return;
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
    if(!proj || !proj.links || proj.links.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-400 font-bold text-[11px]">등록된 링크가 없습니다.</td></tr>'; return; }
    tbody.innerHTML = proj.links.map((lnk, idx) => `<tr><td class="p-2 text-center font-bold text-slate-700">${lnk.name}</td><td class="p-2 truncate max-w-[200px]"><a href="${lnk.url}" target="_blank" class="text-teal-500 hover:text-teal-700 hover:underline">${lnk.url}</a></td><td class="p-2 text-center"><button onclick="window.deleteLink('${projectId}', ${idx})" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td></tr>`).join('');
};

window.addLink = async function() {
    const pid = document.getElementById('link-req-id').value, name = document.getElementById('new-link-name').value.trim(), urlVal = document.getElementById('new-link-url').value.trim();
    if(!name || !urlVal) return safeShowError("링크명과 URL을 입력하세요.");
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === pid); let links = proj.links ? [...proj.links] : [];
        let finalUrl = urlVal.startsWith('http') ? urlVal : 'https://' + urlVal; links.push({name, url: finalUrl});
        await setDoc(doc(db, "projects_status", pid), { links: links }, { merge: true }); safeShowSuccess("링크 추가됨");
        document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; if(proj) proj.links = links; window.loadLinks(pid);
    } catch(e) { safeShowError("링크 추가 실패", e); }
};

window.deleteLink = async function(pid, idx) {
    if(!confirm("삭제하시겠습니까?")) return;
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === pid); let links = proj.links ? [...proj.links] : []; links.splice(idx, 1);
        await setDoc(doc(db, "projects_status", pid), { links: links }, { merge: true }); safeShowSuccess("링크 삭제됨"); if(proj) proj.links = links; window.loadLinks(pid);
    } catch(e) { safeShowError("삭제 실패", e); }
};

// ==========================================
// 💡 품질 완료보고서 작성 요청
// ==========================================
window.openCrReqModal = function(projectId, title) {
    const modal = document.getElementById('cr-req-modal'); if(!modal) return;
    document.getElementById('cr-req-pid').value = projectId; document.getElementById('cr-req-pname').innerText = title;
    const targetSelect = document.getElementById('cr-req-target');
    if(targetSelect) {
        const qmTeam = (window.allSystemUsers || []).filter(u => u.team === '품질경영팀');
        targetSelect.innerHTML = qmTeam.length > 0 ? qmTeam.map(u => `<option value="${u.name}">${u.name} (${u.position || '매니저'})</option>`).join('') : '<option value="">품질경영팀 인원이 없습니다.</option>';
    }
    modal.classList.remove('hidden'); modal.classList.add('flex');
};
window.closeCrReqModal = function() { const m = document.getElementById('cr-req-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } };
window.sendCrRequest = async function() {
    const pid = document.getElementById('cr-req-pid').value, targetName = document.getElementById('cr-req-target').value;
    if(!targetName) return safeShowError("대상자를 선택해주세요.");
    try {
        const success = await window.notifyUser(targetName, "품질 완료보고서 작성을 요청합니다.", pid, "완료요청");
        if(success) {
            await setDoc(doc(db, "projects_status", pid), { crSent: true }, { merge: true });
            safeShowSuccess(targetName + "님에게 완료보고 작성을 요청했습니다."); window.closeCrReqModal(); if(window.renderProjectStatusList) window.renderProjectStatusList();
        } else safeShowError("알림 전송 실패");
    } catch(e) { safeShowError("오류 발생", e); }
};
