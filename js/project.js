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

// 전역 상태 초기화
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

window.toggleFreezeCol = function(checked) {
    const table = document.getElementById('proj-main-table');
    if(table) {
        if(checked) table.classList.add('freeze-col');
        else table.classList.remove('freeze-col');
    }
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
// 💡 구글 드라이브 연동 (PJT 공통) 및 진행률 모달 연결
// ==========================================
// 💡 하위 폴더명을 동적으로 받을 수 있도록 subFolderName 파라미터 추가
window.pjtUploadToDrive = async function(file, folderName, subFolderName = '생산일지') {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) {
        throw new Error("구글 인증 토큰이 만료되었습니다. 로그아웃 후 다시 연동해주세요.");
    }
    
    // 1. 프로젝트 현황 부모 폴더 검색
    const q1 = `name='${encodeURIComponent(folderName.replace(/['\/\\]/g, '_'))}' and mimeType='application/vnd.google-apps.folder' and '${TARGET_DRIVE_FOLDER}' in parents and trashed=false`;
    const r1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q1}&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: {'Authorization': 'Bearer ' + window.googleAccessToken}});
    const d1 = await r1.json();
    if(d1.error) throw new Error(`[API 조회 에러] ${d1.error.message}`);
    
    let pjtFid = (d1.files && d1.files.length > 0) ? d1.files[0].id : null;
    if(!pjtFid) {
        const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({name: folderName.replace(/['\/\\]/g, '_'), mimeType: 'application/vnd.google-apps.folder', parents: [TARGET_DRIVE_FOLDER]})
        });
        const data = await res.json(); 
        if(data.error) throw new Error(data.error.message);
        pjtFid = data.id;
    }

    // 2. 하위 폴더 자동 생성 분기 처리 (동적 폴더명 적용)
    const q2 = `name='${subFolderName}' and mimeType='application/vnd.google-apps.folder' and '${pjtFid}' in parents and trashed=false`;
    const r2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q2)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: {'Authorization': 'Bearer ' + window.googleAccessToken}});
    const d2 = await r2.json();
    if(d2.error) throw new Error(d2.error.message);
    
    let logFid = (d2.files && d2.files.length > 0) ? d2.files[0].id : null;
    if(!logFid) {
        const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({name: subFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [pjtFid]})
        });
        const data = await res.json(); 
        if(data.error) throw new Error(data.error.message);
        logFid = data.id;
    }

    // 3. 파일 업로드 실행 (진행률 UI 연결)
    const metadata = { name: file.name, parents: [logFid] };
    const form = new FormData(); 
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); 
    form.append('file', file);

    const progressModal = document.getElementById('upload-progress-modal');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const progressSize = document.getElementById('upload-progress-size');
    const progressFilename = document.getElementById('upload-progress-filename');

    if (progressModal) progressModal.classList.replace('hidden', 'flex');
    if (progressFilename) progressFilename.innerText = file.name;

    return new Promise((resolve, reject) => {
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
            if (progressModal) progressModal.classList.replace('flex', 'hidden');
            if (xhr.status >= 200 && xhr.status < 300) { 
                resolve(`https://drive.google.com/file/d/${JSON.parse(xhr.responseText).id}/view`); 
            } else { 
                reject(new Error(`업로드 실패 (HTTP ${xhr.status})`)); 
            }
        };
        xhr.onerror = () => {
            if (progressModal) progressModal.classList.replace('flex', 'hidden');
            reject(new Error("네트워크 오류"));
        };
        xhr.send(form);
    });
};

// ==========================================
// 💡 데이터 로드 및 필터링
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
// 💡 메인 리스트 렌더링
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
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center" style="min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-1 py-1 text-center" style="min-width: 50px; max-width: 50px;" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-rose-200">${iCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-bold text-indigo-700" style="min-width: 110px; max-width: 110px;">${getSafeString(item.code)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 truncate max-w-[220px]" style="min-width: 220px;">${safeNameHtml}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center truncate max-w-[110px]" style="min-width: 110px;">${getSafeString(item.company)}</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center font-black text-emerald-600" style="min-width: 60px; max-width: 60px;">${parseFloat(item.progress) || 0}%</td>`;
            htmlStr += `<td class="border-b border-r border-slate-200 px-2 py-1 text-center border-r-slate-300" style="min-width: 80px; max-width: 80px;">${statusMap[item.status] || ''}</td>`;
            
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600">${getSafeString(item.manager)}</td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openPurModal('${item.id}', '${safeNameJs}')" class="text-amber-500 relative"><i class="fa-solid fa-cart-shopping text-lg"></i>${purCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${purCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openDesModal('${item.id}', '${safeNameJs}')" class="text-teal-400 relative"><i class="fa-solid fa-pen-ruler text-lg"></i>${desCnt ? `<span class="absolute -top-1 -right-2 bg-teal-100 text-teal-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-teal-200">${desCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openSchModal('${item.id}', '${safeNameJs}')" class="text-fuchsia-400 relative"><i class="fa-regular fa-calendar-check text-lg"></i>${schCnt ? `<span class="absolute -top-1 -right-2 bg-fuchsia-100 text-fuchsia-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-fuchsia-200">${schCnt}</span>` : ''}</button></td>`;
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openDailyLogModal('${item.id}')" class="text-sky-400 relative"><i class="fa-solid fa-book text-lg"></i>${lCnt ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-sky-200">${lCnt}</span>` : ''}</button></td>`;
            
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">${ncrIconHtml}</td>`;

            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd||0}</td>`;
            htmlStr += `<td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="event.stopPropagation(); window.openMdLogModal('${item.id}', '${safeNameJs}', ${cMd})" class="text-purple-600 underline">${cMd}</button></td>`;
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
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><div class="flex items-center justify-center gap-1 flex-wrap"><button onclick="event.stopPropagation(); window.openLinkModal('${item.id}', '${safeNameJs}')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>${linksHtml}</div></td>`;
            
            htmlStr += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">${crBtnHtml}</td>`;
            htmlStr += `</tr>`;

        } catch(err) {
            console.error('리스트 렌더링 에러 (해당 항목을 건너뜀):', err);
        }
    });
    
    tbody.innerHTML = htmlStr;

    setTimeout(() => { window.applyTableLock(); }, 50);
};


// ==========================================
// 💡 모달창 & 공통 함수들
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
        
        const modal = document.getElementById('proj-status-write-modal');
        if(!modal) { safeShowError('프로젝트 등록 모달창 요소를 찾을 수 없습니다.'); return; }
        
        modal.classList.remove('hidden'); modal.classList.add('flex'); 
    } catch(e) { safeShowError('프로젝트 등록 모달을 여는 중 오류가 발생했습니다.', e); }
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
        
        const modal = document.getElementById('proj-status-write-modal');
        if(!modal) { safeShowError('프로젝트 수정 모달창 요소를 찾을 수 없습니다.'); return; }
        
        modal.classList.remove('hidden'); modal.classList.add('flex'); 
    } catch(e) { safeShowError('데이터를 불러오는 중 오류가 발생했습니다.', e); }
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
            if(oldSnap.exists()) {
                await addDoc(collection(db, "project_history"), { projectId: id, snapshot: oldSnap.data(), changedBy: (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'Unknown', changedAt: Date.now() });
            }
            await setDoc(doc(db, "projects_status", id), cleanPayload, { merge: true }); safeShowSuccess("성공적으로 수정되었습니다."); 
        } else { 
            cleanPayload.createdAt = Date.now(); cleanPayload.currentMd = 0; cleanPayload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; cleanPayload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system';
            await addDoc(collection(db, "projects_status"), cleanPayload); safeShowSuccess("성공적으로 등록되었습니다."); 
            
            try {
                const folderName = cleanPayload.code ? cleanPayload.code : cleanPayload.name;
                await window.pjtUploadToDrive({name: "init.txt", type: "text/plain", size: 4}, folderName, '기본생성폴더');
            } catch(e) {
                console.warn("폴더 생성 지연(무시가능):", e);
            }
        } 
        
        if(window.closeProjStatusWriteModal) window.closeProjStatusWriteModal(); 
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    } catch(error) {
        safeShowError("저장 중 오류 발생", error);
        if(btn){ btn.disabled = false; btn.innerHTML = '저장하기'; }
    }
};

window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); safeShowSuccess("삭제되었습니다."); } catch(e) { safeShowError("삭제 실패", e); } };
window.calcFinalMd = function() { const curMdEl = document.getElementById('ps-current-md'); const outMdEl = document.getElementById('ps-out-md'); const finalMdEl = document.getElementById('ps-final-md'); if(curMdEl && outMdEl && finalMdEl) { const curMd = parseFloat(curMdEl.value) || 0; const outMd = parseFloat(outMdEl.value) || 0; finalMdEl.value = (curMd + outMd).toFixed(1); } };

window.addProjectMember = function(name) { 
    if(!name) return; window.currentSelectedMembers = window.currentSelectedMembers || [];
    if(!window.currentSelectedMembers.includes(name)) { window.currentSelectedMembers.push(name); if(window.renderSelectedMembers) window.renderSelectedMembers(); } 
    const el = document.getElementById('ps-member-add'); if(el) el.selectedIndex = 0; 
};
window.removeProjectMember = function(name) { 
    window.currentSelectedMembers = window.currentSelectedMembers || []; window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); 
    if(window.renderSelectedMembers) window.renderSelectedMembers(); 
};
window.renderSelectedMembers = function() { 
    const container = document.getElementById('ps-selected-members'); const memInput = document.getElementById('ps-members'); const membersList = window.currentSelectedMembers || [];
    if(memInput) memInput.value = membersList.join(', '); 
    if(container) { container.innerHTML = membersList.map(function(name) { return `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`; }).join(''); }
};

window.openProjHistoryModal = function() {
    try {
        const el = document.getElementById('ps-id'); if(!el) return; const projectId = el.value; if(!projectId) return;
        const modal = document.getElementById('proj-history-modal');
        if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); if(window.loadProjectHistory) window.loadProjectHistory(projectId); }
    } catch(e) {}
};
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
// 💡 간트 & 달력 뷰 
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
        const container = document.getElementById('proj-dash-gantt-content');
        if(!container) return;
        const projects = window.getFilteredProjects();
        
        if(projects.length === 0) {
            container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold">조건에 맞는 프로젝트가 없습니다.</div>';
            return;
        }

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

        let dateHeaders = '';
        let bgLines = '';
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
            } else {
                barHtml = `<div class="text-[10px] text-slate-400 italic px-4 w-full text-center">일정 미지정</div>`;
            }
            
            rowsHtml += `
            <div class="flex items-center w-full h-12 border-b border-slate-200 hover:bg-indigo-50/40 transition-colors group" onclick="window.editProjStatus('${p.id}')">
                <div class="w-[320px] shrink-0 sticky left-0 bg-white group-hover:bg-indigo-50/80 border-r border-slate-200 px-4 h-full flex items-center z-40 shadow-[2px_0_5px_rgba(0,0,0,0.03)] cursor-pointer">
                    <div class="font-bold text-[11px] text-slate-700 truncate w-full" title="${title}">${title}</div>
                </div>
                <div class="flex-1 relative h-full flex items-center mx-0 pointer-events-none group-hover:pointer-events-auto">
                    ${barHtml}
                </div>
            </div>`;
        });

        let html = `
        <div class="relative min-w-[800px] w-full bg-white flex flex-col">
            <div class="flex w-full h-10 border-b border-slate-300 bg-slate-100 sticky top-0 z-50 shadow-sm">
                <div class="w-[320px] shrink-0 sticky left-0 bg-slate-100 border-r border-slate-300 px-4 flex items-center justify-center font-black text-xs text-slate-600 shadow-[2px_0_5px_rgba(0,0,0,0.05)] z-50">
                    프로젝트명
                </div>
                <div class="flex-1 relative mx-0">
                    ${dateHeaders}
                </div>
            </div>
            <div class="flex flex-col relative w-full flex-1 min-h-[300px]">
                <div class="absolute inset-y-0 right-0 z-0 flex pointer-events-none" style="left: 320px;">
                    ${bgLines}
                    ${todayLineHtml}
                </div>
                <div class="relative z-10 flex flex-col w-full pb-4">
                    ${rowsHtml}
                </div>
            </div>
        </div>`;
        
        container.innerHTML = html;
        
        setTimeout(() => {
            const todayLine = document.getElementById('gantt-today-line');
            if(container && todayLine) {
                const targetLeft = todayLine.offsetLeft;
                container.scrollTo({ left: targetLeft - (container.clientWidth / 2) + 160, behavior: 'smooth' });
            }
        }, 100);
        
    } catch(e) {
        console.error("Gantt Rendering Error:", e);
        const container = document.getElementById('proj-dash-gantt-content');
        if(container) container.innerHTML = `<div class="text-center p-10 text-rose-500 font-bold">간트 차트를 렌더링하는 중 오류가 발생했습니다.<br>${e.message}</div>`;
    }
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
    } catch(e) { 
        console.error("Calendar Rendering Error:", e); 
        const container = document.getElementById('proj-dash-calendar-content'); 
        if(container) container.innerHTML = `<div class="text-center p-10 text-rose-500 font-bold">달력을 렌더링하는 중 오류가 발생했습니다.<br>${e.message}</div>`; 
    }
};

// ==========================================
// 💡 코멘트 모달 (이미지 썸네일 경로 수정 포함)
// ==========================================
window.openCommentModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('comment-modal');
        if(!modal) { safeShowError("코멘트 모달 요소 없음"); return; }
        
        modal.classList.remove('hidden'); modal.classList.add('flex');
        
        document.getElementById('cmt-req-id').value = projectId; 
        if(window.cancelCommentAction) window.cancelCommentAction(); 
        
        if (currentCommentUnsubscribe) currentCommentUnsubscribe(); 
        currentCommentUnsubscribe = onSnapshot(collection(db, "project_comments"), function(snapshot) { 
            window.currentComments = []; 
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                if(d.projectId === projectId) { d.id = docSnap.id; window.currentComments.push(d); } 
            }); 
            
            const topLevel = window.currentComments.filter(c => !c.parentId || c.parentId === 'null' || c.parentId === '').sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            const replies = window.currentComments.filter(c => c.parentId && c.parentId !== 'null' && c.parentId !== '').sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            topLevel.forEach(c => c.replies = replies.filter(r => r.parentId === c.id)); 
            
            const list = document.getElementById('comment-list'); 
            if(!list) return;
            
            if (topLevel.length === 0) { 
                list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; 
                return; 
            } 
            
            list.innerHTML = topLevel.map(c => {
                let safeContent = getSafeString(c.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let files = [];
                if(c.imageUrl) files.push({name:'첨부사진.jpg', url: c.imageUrl, thumbBase64: c.imageUrl});
                
                let attachmentsHtml = '';
                if (files.length > 0) {
                    attachmentsHtml = '<div class="mt-3 flex flex-wrap gap-2">';
                    files.forEach(f => {
                        let url = f.url || f.thumbBase64;
                        let rawUrl = url;
                        // 💡 썸네일 API 오류 우회
                        let thumbUrl = f.thumbBase64 ? f.thumbBase64 : (url.startsWith('data:image') ? url : 'https://cdn-icons-png.flaticon.com/512/833/833281.png');

                        if (url.includes('drive.google.com')) {
                            let fileIdMatch = url.match(/\/d\/(.+?)\/view/);
                            if (fileIdMatch) {
                                rawUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                            }
                        }
                        
                        attachmentsHtml += `<div class="relative border border-slate-200 rounded-lg p-1 bg-slate-50 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation(); window.openImageViewer('${rawUrl}')">
                            <div class="w-14 h-14 flex items-center justify-center overflow-hidden rounded bg-white">
                                <img src="${thumbUrl}" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/833/833281.png'">
                            </div>
                        </div>`;
                    });
                    attachmentsHtml += '</div>';
                }

                let repliesHtml = ''; 
                if(c.replies && c.replies.length > 0) { 
                    repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; 
                    c.replies.forEach(r => { 
                        let safeReplyContent = getSafeString(r.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
                        let rFiles = [];
                        if(r.imageUrl) rFiles.push({name:'첨부사진.jpg', url: r.imageUrl, thumbBase64: r.imageUrl});
                        let rAttachmentsHtml = '';
                        if (rFiles.length > 0) {
                            rAttachmentsHtml = '<div class="mt-2 flex flex-wrap gap-2">';
                            rFiles.forEach(f => {
                                let url = f.url || f.thumbBase64;
                                let rawUrl = url;
                                let thumbUrl = f.thumbBase64 ? f.thumbBase64 : (url.startsWith('data:image') ? url : 'https://cdn-icons-png.flaticon.com/512/833/833281.png');

                                if (url.includes('drive.google.com')) {
                                    let fileIdMatch = url.match(/\/d\/(.+?)\/view/);
                                    if (fileIdMatch) {
                                        rawUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                                    }
                                }
                                rAttachmentsHtml += `<div class="relative border border-slate-200 rounded-lg p-1 bg-slate-50 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation(); window.openImageViewer('${rawUrl}')">
                                    <div class="w-12 h-12 flex items-center justify-center overflow-hidden rounded bg-white">
                                        <img src="${thumbUrl}" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/833/833281.png'">
                                    </div>
                                </div>`;
                            });
                            rAttachmentsHtml += '</div>';
                        }
                        
                        let replyBtnHtml = (r.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editComment('${r.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${r.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : '';
                        
                        repliesHtml += `<div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-sm">${getSafeString(r.authorName)}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(r.createdAt)))}</span></div><div class="flex gap-2">${replyBtnHtml}</div></div><div class="text-slate-700 text-[13px] font-medium pl-6 break-words">${safeReplyContent}</div>${rAttachmentsHtml}</div>`; 
                    }); 
                    repliesHtml += '</div>'; 
                } 
                
                let mainBtnHtml = (c.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : '';
                
                return `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-bold text-slate-800 text-[15px]">${getSafeString(c.authorName)}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span></div><div class="flex gap-2"><button onclick="window.setReplyTo('${c.id}', '${getSafeString(c.authorName)}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1 rounded-lg font-bold shadow-sm">답글달기</button>${mainBtnHtml}</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 break-words">${safeContent}</div>${attachmentsHtml}${repliesHtml}</div>`; 
            }).join('');
        }); 
    } catch(e) { safeShowError('코멘트 로드 에러', e); }
};

window.closeCommentModal = function() { const m = document.getElementById('comment-modal'); if(m){m.classList.add('hidden'); m.classList.remove('flex');} if (currentCommentUnsubscribe) currentCommentUnsubscribe(); };
window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value, content = document.getElementById('new-cmt-text').value.trim(), parentId = document.getElementById('reply-to-id').value || null, editId = document.getElementById('editing-cmt-id').value; 
    const fileInput = document.getElementById('new-cmt-image');
    if(!content && (!fileInput || fileInput.files.length === 0)) return safeShowError("코멘트 내용이나 사진을 첨부하세요."); 
    const btnSave = document.getElementById('btn-cmt-save'); if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
    const saveData = async function(base64Img) {
        try { 
            const payload = { content: content, updatedAt: Date.now() }; 
            if(base64Img) payload.imageUrl = base64Img;
            if (editId) { 
                await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); safeShowSuccess("수정됨"); 
            } else { 
                payload.projectId = projectId; payload.parentId = parentId; 
                payload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; 
                payload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system'; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); safeShowSuccess("등록됨"); 
            } 
            if(window.cancelCommentAction) window.cancelCommentAction(); 
        } catch(e) { safeShowError("저장 오류", e); } finally { if(btnSave) { btnSave.innerHTML = '작성'; btnSave.disabled = false; } } 
    };

    if (fileInput && fileInput.files.length > 0) {
        if(window.resizeAndConvertToBase64) window.resizeAndConvertToBase64(fileInput.files[0], saveData, 1200);
        else saveData(null);
    } else {
        saveData(null);
    }
};
window.editComment = function(id) { const c = window.currentComments.find(x => x.id === id); if(!c) return; if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('editing-cmt-id').value = id; document.getElementById('new-cmt-text').value = c.content || ''; document.getElementById('btn-cmt-save').innerText = '수정'; document.getElementById('reply-indicator-name').innerHTML = '코멘트 수정 중'; document.getElementById('reply-indicator').classList.remove('hidden'); };
window.setReplyTo = function(cid, name) { if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('reply-to-id').value = cid; document.getElementById('reply-indicator-name').innerHTML = `${name} 님에게 답글 작성 중`; document.getElementById('reply-indicator').classList.remove('hidden'); };
window.cancelCommentAction = function() { document.getElementById('reply-to-id').value = ''; document.getElementById('editing-cmt-id').value = ''; document.getElementById('new-cmt-text').value = ''; document.getElementById('btn-cmt-save').innerText = '작성'; document.getElementById('reply-indicator').classList.add('hidden'); document.getElementById('new-cmt-image').value = ''; document.getElementById('cmt-file-name').innerText = ''; };
window.deleteComment = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_comments", id)); const q = query(collection(db, "project_comments"), where("parentId", "==", id)); const snapshot = await getDocs(q); if(!snapshot.empty) { const batch = writeBatch(db); snapshot.forEach(d => batch.delete(d.ref)); await batch.commit(); } safeShowSuccess("삭제됨"); if(window.cancelCommentAction) window.cancelCommentAction(); } catch(e) { safeShowError("삭제 실패", e); } };

// ==========================================
// 💡 이슈 모달
// ==========================================
window.openIssueModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('issue-modal'); if(!modal) { safeShowError("이슈 모달 요소 없음"); return; }
        modal.classList.remove('hidden'); modal.classList.add('flex'); 
        
        document.getElementById('issue-req-id').value = projectId; document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; 
        const btn = document.getElementById('btn-issue-save'); if(btn) btn.innerText = '등록'; 
        
        if (currentIssueUnsubscribe) currentIssueUnsubscribe(); 
        currentIssueUnsubscribe = onSnapshot(collection(db, "project_issues"), function(snapshot) { 
            window.currentIssues = []; 
            snapshot.forEach(docSnap => { const d = docSnap.data(); if(d.projectId === projectId) { d.id = docSnap.id; window.currentIssues.push(d); } }); 
            window.currentIssues.sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            
            const list = document.getElementById('issue-list'); if(!list) return;
            if (window.currentIssues.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; return; } 
            
            list.innerHTML = window.currentIssues.map(iss => {
                let safeText = getSafeString(iss.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let btnHtml = (iss.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-4 rounded-xl border ${iss.isResolved ? 'border-slate-200 bg-slate-50' : 'border-rose-200 shadow-sm'} flex items-start gap-3 transition-all"><div class="mt-0.5"><input type="checkbox" ${iss.isResolved?'checked':''} onchange="window.toggleIssueStatus('${iss.id}', this.checked)" class="w-5 h-5 text-rose-500 rounded border-gray-300 cursor-pointer accent-rose-500 shadow-sm"></div><div class="flex-1 flex flex-col gap-1"><div class="flex justify-between items-center"><span class="font-bold text-sm ${iss.isResolved?'text-slate-400':'text-rose-600'}">${getSafeString(iss.authorName)}</span><div class="flex gap-2">${btnHtml}</div></div><div class="text-[13px] font-medium mt-1 leading-relaxed ${iss.isResolved?'text-slate-400 line-through':'text-slate-700'} break-words">${safeText}</div></div></div>`;
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

// ==========================================
// 💡 작업자(팀원) 추가를 위한 공통 스크립트
// ==========================================
window.addLogMember = function(name, mode = 'log') {
    if(!name) return;
    window.currentLogMembers = window.currentLogMembers || [];
    if(!window.currentLogMembers.includes(name)) {
        window.currentLogMembers.push(name);
        if(window.renderLogMembers) window.renderLogMembers(mode);
    }
    const el = document.getElementById(mode === 'md' ? 'md-member-add' : 'log-member-add');
    if(el) el.selectedIndex = 0;
};
window.removeLogMember = function(name, mode = 'log') {
    window.currentLogMembers = (window.currentLogMembers || []).filter(n => n !== name);
    if(window.renderLogMembers) window.renderLogMembers(mode);
};
window.renderLogMembers = function(mode = 'log') {
    const containerId = mode === 'md' ? 'md-selected-members' : 'log-selected-members';
    const inputId = mode === 'md' ? 'new-md-members' : 'log-members';
    const color = mode === 'md' ? 'purple' : 'sky';
    const container = document.getElementById(containerId);
    const hiddenInput = document.getElementById(inputId);
    const members = window.currentLogMembers || [];
    
    if(hiddenInput) hiddenInput.value = members.join(',');
    if(container) {
        container.innerHTML = members.map(name => `<span class="bg-${color}-100 text-${color}-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeLogMember('${name}', '${mode}')"></i></span>`).join('');
    }
};

// ==========================================
// 💡 MD 투입 기록 모달 (팀원 전용 쓰기 권한)
// ==========================================
window.openMdLogModal = function(projectId, title, curMd) { 
    try {
        const modal = document.getElementById('md-log-modal');
        if(!modal) { safeShowError('MD로그 모달 요소를 찾을 수 없습니다.'); return; }
        modal.classList.remove('hidden'); modal.classList.add('flex'); 
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        const reqEl = document.getElementById('md-req-id'); if(reqEl) reqEl.value = projectId; 
        const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = '총 ' + (proj.currentMd || 0) + ' MD'; 
        
        const members = window.teamMembers || [];
        const mHtml = '<option value="">선택</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        const logMemberSelect = document.getElementById('md-member-add');
        if(logMemberSelect) logMemberSelect.innerHTML = mHtml;

        if(window.resetMdLogForm) window.resetMdLogForm(); 
        
        // 💡 팀 인원 및 관리자만 작성 가능
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
                let btnHtml = (canWrite && (log.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin'))) ? `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : '-';
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
    if(window.renderLogMembers) window.renderLogMembers('md'); 
    if(document.getElementById('btn-md-save')) document.getElementById('btn-md-save').innerText = '등록'; 
    if(document.getElementById('btn-md-cancel')) document.getElementById('btn-md-cancel').classList.add('hidden'); 
};

window.saveMdLogItem = async function() { 
    const projectId = document.getElementById('md-req-id').value, logId = document.getElementById('editing-md-id').value, date = document.getElementById('new-md-date').value, mdVal = document.getElementById('new-md-val').value, desc = document.getElementById('new-md-desc') ? document.getElementById('new-md-desc').value.trim() : '', members = document.getElementById('new-md-members') ? document.getElementById('new-md-members').value : '';
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
window.editMdLog = function(id) { const log = (window.currentMdLogs || []).find(l => l.id === id); if(!log) return; document.getElementById('editing-md-id').value = id; document.getElementById('new-md-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = log.md || ''; document.getElementById('new-md-desc').value = log.desc || ''; window.currentLogMembers = (log.members && typeof log.members === 'string') ? log.members.split(',').map(s=>s.trim()).filter(Boolean) : []; if(window.renderLogMembers) window.renderLogMembers('md'); const btnSave = document.getElementById('btn-md-save'); if(btnSave) btnSave.innerText = '수정'; const btnCancel = document.getElementById('btn-md-cancel'); if(btnCancel) btnCancel.classList.remove('hidden'); };
window.updateProjectTotalMd = async function(projectId) { const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); let total = 0; snap.forEach(docSnap => total += parseFloat(docSnap.data().md) || 0); const projRef = doc(db, "projects_status", projectId); const projSnap = await getDoc(projRef); if(projSnap.exists()) { const outMd = parseFloat(projSnap.data().outMd) || 0; await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); } };

// ==========================================
// 💡 생산일지 모달 (팀원 전용 쓰기 권한 및 드라이브 연동, 이미지 URL 파싱 수정)
// ==========================================
window.openDailyLogModal = function(projectId) { 
    try {
        const modal = document.getElementById('daily-log-modal');
        if(!modal) { safeShowError('생산일지 모달창 요소를 찾을 수 없습니다.'); return; }
        
        const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId) || {}; 
        
        const reqEl = document.getElementById('log-req-id'); if(reqEl) reqEl.value = projectId || '';
        const titleEl = document.getElementById('log-project-title'); if(titleEl) titleEl.innerText = proj.name || '';
        const progEl = document.getElementById('log-project-progress'); if(progEl) progEl.value = proj.progress || 0;
        const rateEl = document.getElementById('log-project-purchase-rate'); if(rateEl) rateEl.value = proj.purchaseRate || 0;

        const members = window.teamMembers || [];
        const mHtml = '<option value="">선택</option>' + members.map(t => `<option value="${t.name||''}">${t.name||''} (${t.part||''})</option>`).join('');
        const logMemberSelect = document.getElementById('log-member-add');
        if(logMemberSelect) logMemberSelect.innerHTML = mHtml;

        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
        
        // 💡 생산일지도 팀 인원만 작성 가능
        const user = window.userProfile || {};
        const isAdmin = user.role === 'admin' || user.role === 'master';
        const isManager = proj.manager === user.name;
        const isMember = (proj.members || '').includes(user.name);
        const canWrite = isAdmin || isManager || isMember;

        if (canWrite) {
            document.getElementById('log-input-section').classList.remove('hidden'); document.getElementById('log-input-section').classList.add('flex');
            document.getElementById('log-readonly-banner').classList.add('hidden');
            if(progEl) progEl.disabled = false; if(rateEl) rateEl.disabled = false;
        } else {
            document.getElementById('log-input-section').classList.add('hidden'); document.getElementById('log-input-section').classList.remove('flex');
            document.getElementById('log-readonly-banner').classList.remove('hidden');
            if(progEl) progEl.disabled = true; if(rateEl) rateEl.disabled = true;
        }
        
        modal.classList.remove('hidden'); modal.classList.add('flex');
        
        if (currentLogUnsubscribe) currentLogUnsubscribe(); 
        currentLogUnsubscribe = onSnapshot(collection(db, "daily_logs"), function(snapshot) { 
            window.currentDailyLogs = []; 
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                if(d.projectId === projectId) { d.id = docSnap.id; window.currentDailyLogs.push(d); } 
            }); 
            window.currentDailyLogs.sort((a, b) => { let da = a.date || '', db = b.date || ''; if(da !== db) return db.localeCompare(da); return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); }); 
            
            const list = document.getElementById('daily-log-list'); if(!list) return;
            if (window.currentDailyLogs.length === 0) { list.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; return; } 
            
            list.innerHTML = window.currentDailyLogs.map(log => {
                let safeContent = getSafeString(log.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                
                // 💡 다중 이미지 렌더링 HTML (구글 드라이브 썸네일 지원)
                let legacyFiles = [];
                if(log.imageUrl) legacyFiles.push({ name: '첨부사진.jpg', url: log.imageUrl, thumbBase64: log.imageUrl });
                let allFiles = log.files && log.files.length > 0 ? [...legacyFiles, ...log.files] : legacyFiles;
                
                let attachmentsHtml = '';
                if (allFiles.length > 0) {
                    attachmentsHtml = '<div class="mt-3 flex flex-wrap gap-2">';
                    allFiles.forEach(f => {
                        let url = f.url || f.thumbBase64;
                        let isImg = f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || url.startsWith('data:image');
                        
                        let rawUrl = url;
                        // 💡 썸네일 API 오류 우회: Base64가 있으면 쓰고, 없으면 아이콘 출력
                        let thumbUrl = f.thumbBase64 ? f.thumbBase64 : 'https://cdn-icons-png.flaticon.com/512/833/833281.png';

                        if (url.includes('drive.google.com')) {
                            let fileIdMatch = url.match(/\/d\/(.+?)\/view/);
                            if (fileIdMatch) {
                                rawUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                            }
                        }

                        if (isImg || url.startsWith('data:image')) {
                            attachmentsHtml += `<div class="relative border border-slate-200 rounded-lg p-1 bg-slate-50 hover:border-sky-300 hover:shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation(); window.openImageViewer('${rawUrl}')">
                                <div class="w-14 h-14 flex items-center justify-center overflow-hidden rounded bg-white">
                                    <img src="${thumbUrl}" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/833/833281.png'">
                                </div>
                            </div>`;
                        } else {
                            attachmentsHtml += `<a href="${url}" target="_blank" class="text-xs text-sky-600 font-bold underline flex items-center gap-1 bg-slate-50 border border-slate-200 p-2 rounded-lg hover:bg-slate-100 w-fit" onclick="event.stopPropagation()"><i class="fa-solid fa-file-arrow-down"></i> ${f.name}</a>`;
                        }
                    });
                    attachmentsHtml += '</div>';
                }
                
                let workersHtml = `<span class="font-bold text-slate-700">${getSafeString(log.authorName)}</span>`;
                if (log.members) {
                    const membersArr = String(log.members).split(',').map(s=>s.trim()).filter(Boolean);
                    if(membersArr.length > 0) workersHtml = membersArr.map(n => `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] shadow-sm border border-slate-200">${n}</span>`).join(' ');
                }

                let btnHtml = (canWrite && (log.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin'))) ? `<button onclick="window.editDailyLog('${log.id}')" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : '';
                return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow"><div class="flex justify-between items-center"><div class="flex items-center gap-3"><span class="font-bold text-sky-600 text-xs flex items-center gap-1"><i class="fa-regular fa-calendar text-sky-400"></i> ${getSafeString(log.date)}</span><div class="flex flex-wrap gap-1">${workersHtml}</div></div><div class="flex gap-2">${btnHtml}</div></div><div class="text-slate-700 font-medium text-[13px] pl-1 mt-2 mb-1 break-words leading-relaxed">${safeContent}</div>${attachmentsHtml}</div>`; 
            }).join('');
        }); 
    } catch(e) { safeShowError('생산일지 창을 여는 중 에러 발생', e); }
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
            window.showToast("파일 처리 및 업로드 중입니다...", "success");
            const processFile = async (file) => {
                let isImage = file.type.match(/image.*/);
                let thumb = null;
                // 💡 이미지일 경우 무조건 미리보기용 가벼운 Base64 썸네일을 하나 만듭니다.
                if (isImage) {
                    thumb = await new Promise(res => window.resizeAndConvertToBase64(file, b64 => res(b64), 300));
                }

                if(window.googleAccessToken) {
                    try {
                        let url = await window.pjtUploadToDrive(file, folderName, '생산일지');
                        // 💡 드라이브 업로드 성공 시에도 썸네일 Base64를 함께 저장합니다!
                        return { name: file.name, url: url, thumbBase64: thumb };
                    } catch(e) {
                        console.warn("드라이브 업로드 실패, Base64 변환 시도", e);
                        let fullB64 = null;
                        if (isImage) {
                            fullB64 = await new Promise(res => window.resizeAndConvertToBase64(file, b64 => res(b64), 1200));
                        }
                        return { name: file.name, url: fullB64, thumbBase64: thumb };
                    }
                } else {
                     let fullB64 = null;
                     if (isImage) {
                         fullB64 = await new Promise(res => window.resizeAndConvertToBase64(file, b64 => res(b64), 1200));
                     }
                     return { name: file.name, url: fullB64, thumbBase64: thumb };
                }
            };
            
            for(let i=0; i<fileInput.files.length; i++) {
                let fData = await processFile(fileInput.files[i]);
                if(fData && (fData.url || fData.thumbBase64)) filesData.push(fData);
            }
        }

        const payload = { date: date, content: content, members: members, files: filesData, updatedAt: Date.now() }; 
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
        }
        
        await setDoc(doc(db, "projects_status", projectId), { progress: progressVal, purchaseRate: purchaseRateVal }, { merge: true }); 
        if(window.resetDailyLogForm) window.resetDailyLogForm(); 
    } catch(e) { safeShowError("저장 실패", e); } finally { if(btnSave) { btnSave.innerHTML = '등록'; btnSave.disabled = false; } } 
};
window.editDailyLog = function(id) { const log = (window.currentDailyLogs || []).find(l => l.id === id); if(!log) return; document.getElementById('editing-log-id').value = id; document.getElementById('new-log-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-log-text').value = log.content || ''; window.currentLogMembers = (log.members && typeof log.members === 'string') ? log.members.split(',').map(s=>s.trim()).filter(Boolean) : []; if(window.renderLogMembers) window.renderLogMembers('log'); const btnSave = document.getElementById('btn-log-save'); if(btnSave) btnSave.innerText = '수정'; const btnCancel = document.getElementById('btn-log-cancel'); if(btnCancel) btnCancel.classList.remove('hidden'); const txt = document.getElementById('new-log-text'); if(txt) txt.focus(); };
window.deleteDailyLog = async function(id) { if(!confirm("이 일지를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "daily_logs", id)); safeShowSuccess("삭제되었습니다."); if(window.resetDailyLogForm) window.resetDailyLogForm(); } catch(e) { safeShowError("삭제 실패", e); } };
window.resetDailyLogForm = function() { 
    if(document.getElementById('editing-log-id')) document.getElementById('editing-log-id').value = ''; 
    if(document.getElementById('new-log-date')) document.getElementById('new-log-date').value = window.getLocalDateStr(new Date()); 
    if(document.getElementById('new-log-text')) document.getElementById('new-log-text').value = ''; 
    if(document.getElementById('new-log-image')) document.getElementById('new-log-image').value = ''; 
    if(window.clearDailyLogFile) window.clearDailyLogFile();
    window.currentLogMembers = (window.userProfile && window.userProfile.name) ? [window.userProfile.name] : []; 
    if(window.renderLogMembers) window.renderLogMembers('log');
    const btnSave = document.getElementById('btn-log-save'); if(btnSave) btnSave.innerText = '등록'; 
    const btnCancel = document.getElementById('btn-log-cancel'); if(btnCancel) btnCancel.classList.add('hidden'); 
};
window.closeDailyLogModal = function() { const m = document.getElementById('daily-log-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } if (currentLogUnsubscribe) currentLogUnsubscribe(); };
window.clearDailyLogFile = function(e) { if(e && typeof e.stopPropagation === 'function') e.stopPropagation(); const input = document.getElementById('new-log-image'), wrap = document.getElementById('new-log-filename-wrap'); if(input) input.value = ''; if(wrap) wrap.classList.add('hidden'); };


// ==========================================
// 💡 구매, 설계, 일정 모달창 (접근자 Fix 및 이미지 파싱 보완)
// ==========================================
const setupModalLogic = (modalTitle, domPrefix, collectionName) => {
    window[`open${modalTitle}Modal`] = function(projectId, title) {
        const modal = document.getElementById(`${domPrefix}-modal`);
        if(!modal) return;
        modal.classList.remove('hidden'); modal.classList.add('flex');
        document.getElementById(`${domPrefix}-req-id`).value = projectId;
        document.getElementById(`${domPrefix}-project-title`).innerText = title;
        window[`reset${modalTitle}Form`]();
        
        if(window[`current${modalTitle}Unsubscribe`]) window[`current${modalTitle}Unsubscribe`]();
        window[`current${modalTitle}Unsubscribe`] = onSnapshot(collection(db, collectionName), snap => {
            window[`current${modalTitle}s`] = [];
            snap.forEach(d => { if(d.data().projectId === projectId) window[`current${modalTitle}s`].push({id: d.id, ...d.data()})});
            window[`current${modalTitle}s`].sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt));
            
            const list = document.getElementById(`${domPrefix}-list`);
            if(!list) return;
            if(window[`current${modalTitle}s`].length === 0) { list.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">내역이 없습니다.</div>'; return; }
            
            list.innerHTML = window[`current${modalTitle}s`].map(item => {
                let colorClass = domPrefix === 'pur' ? 'amber' : (domPrefix === 'des' ? 'teal' : 'fuchsia');
                let btnHtml = (item.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? 
                    `<button onclick="window.edit${modalTitle}Item('${item.id}')" class="text-${colorClass}-400 hover:text-${colorClass}-600 px-1"><i class="fa-solid fa-pen-to-square"></i></button>
                     <button onclick="window.delete${modalTitle}Item('${item.id}')" class="text-rose-400 hover:text-rose-600 px-1"><i class="fa-solid fa-trash-can"></i></button>` : '';
                     
                // 💡 다중 이미지 렌더링 (썸네일 우선 적용)
                let filesHtml = '';
                if(item.files && item.files.length > 0) {
                    filesHtml = '<div class="mt-2 flex flex-wrap gap-2">' + item.files.map(f => {
                        let url = f.url || f.thumbBase64;
                        let isImg = f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || url.startsWith('data:image');
                        
                        let rawUrl = url;
                        // 💡 썸네일 API 오류 우회: Base64가 있으면 쓰고, 없으면 아이콘 출력
                        let thumbUrl = f.thumbBase64 ? f.thumbBase64 : 'https://cdn-icons-png.flaticon.com/512/833/833281.png';

                        if (url.includes('drive.google.com')) {
                            let fileIdMatch = url.match(/\/d\/(.+?)\/view/);
                            if (fileIdMatch) {
                                rawUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                            }
                        }

                        if(isImg || url.startsWith('data:image')) {
                            return `<div class="relative border border-slate-200 rounded-lg p-1 bg-slate-50 hover:border-${colorClass}-300 hover:shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation(); window.openImageViewer('${rawUrl}')">
                                <div class="w-14 h-14 flex items-center justify-center overflow-hidden rounded bg-white">
                                    <img src="${thumbUrl}" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/833/833281.png'">
                                </div>
                            </div>`;
                        } else {
                            return `<a href="${url}" target="_blank" class="text-xs text-${colorClass}-600 font-bold underline flex items-center gap-1 bg-slate-50 border border-slate-200 p-2 rounded-lg hover:bg-slate-100 w-fit" onclick="event.stopPropagation()"><i class="fa-solid fa-file-arrow-down"></i> ${f.name}</a>`;
                        }
                    }).join('') + '</div>';
                }
                
                return `<div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-2">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold text-xs text-${colorClass}-600">${item.authorName}</span>
                        <div>${btnHtml}</div>
                    </div>
                    <div class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">${item.content}</div>
                    ${filesHtml}
                </div>`;
            }).join('');
        });
    };
    
    window[`close${modalTitle}Modal`] = function() { 
        const m = document.getElementById(`${domPrefix}-modal`);
        if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } 
        if(window[`current${modalTitle}Unsubscribe`]) window[`current${modalTitle}Unsubscribe`](); 
    };
    
    window[`reset${modalTitle}Form`] = function() { 
        document.getElementById(`editing-${domPrefix}-id`).value = ''; 
        document.getElementById(`new-${domPrefix}-text`).value = ''; 
        document.getElementById(`new-${domPrefix}-file`).value = ''; 
        document.getElementById(`${domPrefix}-file-name`).innerText = ''; 
        document.getElementById(`btn-${domPrefix}-save`).innerText = '등록'; 
        document.getElementById(`btn-${domPrefix}-cancel`).classList.add('hidden'); 
    };
    
    window[`save${modalTitle}Item`] = async function() {
        const pid = document.getElementById(`${domPrefix}-req-id`).value;
        const id = document.getElementById(`editing-${domPrefix}-id`).value;
        const content = document.getElementById(`new-${domPrefix}-text`).value.trim();
        const fileInput = document.getElementById(`new-${domPrefix}-file`);
        
        if(!content && fileInput.files.length === 0) return safeShowError("내용이나 파일을 입력하세요.");
        
        const btnSave = document.getElementById(`btn-${domPrefix}-save`);
        if(btnSave) { btnSave.disabled = true; btnSave.innerText = '저장중...'; }
        
        try {
            let filesData = [];
            const proj = (window.currentProjectStatusList || []).find(p => p.id === pid) || {};
            const folderName = proj.code || proj.name || '미지정';

            if (fileInput.files.length > 0) {
                const processFile = async (file) => {
                    let isImage = file.type.match(/image.*/);
                    let thumb = null;
                    if (isImage) {
                        thumb = await new Promise(res => window.resizeAndConvertToBase64(file, b64 => res(b64), 300));
                    }

                    // 💡 각 모달 접두사에 맞는 하위 폴더 지정
                    let targetSubFolder = '기타파일';
                    if(domPrefix === 'pur') targetSubFolder = '구매내역';
                    else if(domPrefix === 'des') targetSubFolder = '설계파일';
                    else if(domPrefix === 'sch') targetSubFolder = '일정표';

                    if(window.googleAccessToken) {
                        try {
                            let url = await window.pjtUploadToDrive(file, folderName, targetSubFolder);
                            return { name: file.name, url: url, thumbBase64: thumb };
                        } catch(e) {
                            console.warn("드라이브 업로드 실패, Base64 변환 시도", e);
                            let fullB64 = null;
                            if (isImage) fullB64 = await new Promise(res => window.resizeAndConvertToBase64(file, b64 => res(b64), 1200));
                            return { name: file.name, url: fullB64, thumbBase64: thumb };
                        }
                    } else {
                         let fullB64 = null;
                         if (isImage) fullB64 = await new Promise(res => window.resizeAndConvertToBase64(file, b64 => res(b64), 1200));
                         return { name: file.name, url: fullB64, thumbBase64: thumb };
                    }
                };

                for(let i=0; i<fileInput.files.length; i++) {
                    let fData = await processFile(fileInput.files[i]);
                    if(fData && (fData.url || fData.thumbBase64)) filesData.push(fData);
                }
            }
            
            let payload = { content, updatedAt: Date.now() };
            if(filesData.length > 0) payload.files = filesData;
            
            if(id) {
                await setDoc(doc(db, collectionName, id), payload, {merge: true});
                safeShowSuccess("수정되었습니다.");
            } else {
                payload.projectId = pid; 
                payload.authorUid = window.currentUser?.uid || 'system'; 
                payload.authorName = window.userProfile?.name || 'system'; 
                payload.createdAt = Date.now();
                await addDoc(collection(db, collectionName), payload);
                safeShowSuccess("등록되었습니다.");
            }
            window[`reset${modalTitle}Form`]();
        } catch(e) {
            safeShowError("저장 실패", e);
        } finally {
            if(btnSave) { btnSave.disabled = false; btnSave.innerText = '등록'; }
        }
    };
    
    window[`edit${modalTitle}Item`] = function(id) {
        const item = window[`current${modalTitle}s`].find(p => p.id === id);
        if(!item) return;
        document.getElementById(`editing-${domPrefix}-id`).value = id;
        document.getElementById(`new-${domPrefix}-text`).value = item.content || '';
        document.getElementById(`btn-${domPrefix}-save`).innerText = '수정';
        document.getElementById(`btn-${domPrefix}-cancel`).classList.remove('hidden');
    };
    
    window[`delete${modalTitle}Item`] = async function(id) { 
        if(!confirm('삭제하시겠습니까?')) return; 
        try {
            await deleteDoc(doc(db, collectionName, id)); 
            safeShowSuccess("삭제되었습니다.");
        } catch(e) {
            safeShowError("삭제 실패", e);
        }
    };
};

setupModalLogic('Pur', 'pur', 'project_purchases');
setupModalLogic('Des', 'des', 'project_designs');
setupModalLogic('Sch', 'sch', 'project_schedules');

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
    document.getElementById('link-req-id').value = projectId; document.getElementById('link-project-title').innerText = title; document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = '';
    modal.classList.remove('hidden'); modal.classList.add('flex');
    const tbody = document.getElementById('link-list-tbody'); if(!tbody) return;
    const proj = (window.currentProjectStatusList || []).find(p => p.id === projectId);
    if(!proj || !proj.links || proj.links.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center p-4 text-slate-400 font-bold text-[11px]">등록된 링크가 없습니다.</td></tr>'; return; }
    tbody.innerHTML = proj.links.map((lnk, idx) => `<tr><td class="p-2 text-center font-bold text-slate-700">${lnk.name}</td><td class="p-2 truncate max-w-[200px]"><a href="${lnk.url}" target="_blank" class="text-teal-500 hover:text-teal-700 hover:underline">${lnk.url}</a></td><td class="p-2 text-center"><button onclick="window.deleteLink('${projectId}', ${idx})" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td></tr>`).join('');
};
window.closeLinkModal = function() { const m = document.getElementById('link-modal'); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } };
window.addLink = async function() {
    const pid = document.getElementById('link-req-id').value, name = document.getElementById('new-link-name').value.trim(), urlVal = document.getElementById('new-link-url').value.trim();
    if(!name || !urlVal) return safeShowError("링크명과 URL을 입력하세요.");
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === pid); let links = proj.links ? [...proj.links] : [];
        let finalUrl = urlVal.startsWith('http') ? urlVal : 'https://' + urlVal; links.push({name, url: finalUrl});
        await setDoc(doc(db, "projects_status", pid), { links: links }, { merge: true }); safeShowSuccess("링크 추가됨"); document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; if(proj) proj.links = links; window.openLinkModal(pid, proj.name);
    } catch(e) { safeShowError("링크 추가 실패", e); }
};
window.deleteLink = async function(pid, idx) {
    if(!confirm("삭제하시겠습니까?")) return;
    try {
        const proj = (window.currentProjectStatusList || []).find(p => p.id === pid); let links = proj.links ? [...proj.links] : []; links.splice(idx, 1);
        await setDoc(doc(db, "projects_status", pid), { links: links }, { merge: true }); safeShowSuccess("링크 삭제됨"); if(proj) proj.links = links; window.openLinkModal(pid, proj.name);
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
        if(success) { await setDoc(doc(db, "projects_status", pid), { crSent: true }, { merge: true }); safeShowSuccess(targetName + "님에게 요청을 보냈습니다."); window.closeCrReqModal(); if(window.renderProjectStatusList) window.renderProjectStatusList(); } else safeShowError("전송 실패");
    } catch(e) { safeShowError("오류 발생", e); }
};

// ==========================================
// 💡 코멘트 모달
// ==========================================
window.openCommentModal = function(projectId, title) { 
    try {
        const modal = document.getElementById('comment-modal');
        if(!modal) { safeShowError("코멘트 모달 요소 없음"); return; }
        
        modal.classList.remove('hidden'); modal.classList.add('flex');
        
        document.getElementById('cmt-req-id').value = projectId; 
        if(window.cancelCommentAction) window.cancelCommentAction(); 
        
        if (currentCommentUnsubscribe) currentCommentUnsubscribe(); 
        currentCommentUnsubscribe = onSnapshot(collection(db, "project_comments"), function(snapshot) { 
            window.currentComments = []; 
            snapshot.forEach(docSnap => { 
                const d = docSnap.data(); 
                if(d.projectId === projectId) { d.id = docSnap.id; window.currentComments.push(d); } 
            }); 
            
            const topLevel = window.currentComments.filter(c => !c.parentId || c.parentId === 'null' || c.parentId === '').sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            const replies = window.currentComments.filter(c => c.parentId && c.parentId !== 'null' && c.parentId !== '').sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); 
            topLevel.forEach(c => c.replies = replies.filter(r => r.parentId === c.id)); 
            
            const list = document.getElementById('comment-list'); 
            if(!list) return;
            
            if (topLevel.length === 0) { 
                list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; 
                return; 
            } 
            
            list.innerHTML = topLevel.map(c => {
                let safeContent = getSafeString(c.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                let files = [];
                if(c.imageUrl) files.push({name:'첨부사진.jpg', url: c.imageUrl, thumbBase64: c.imageUrl});
                
                let attachmentsHtml = '';
                if (files.length > 0) {
                    attachmentsHtml = '<div class="mt-3 flex flex-wrap gap-2">';
                    files.forEach(f => {
                        let url = f.url || f.thumbBase64;
                        let rawUrl = url;
                        // 💡 썸네일 API 오류 우회
                        let thumbUrl = f.thumbBase64 ? f.thumbBase64 : (url.startsWith('data:image') ? url : 'https://cdn-icons-png.flaticon.com/512/833/833281.png');

                        if (url.includes('drive.google.com')) {
                            let fileIdMatch = url.match(/\/d\/(.+?)\/view/);
                            if (fileIdMatch) {
                                rawUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                            }
                        }
                        
                        attachmentsHtml += `<div class="relative border border-slate-200 rounded-lg p-1 bg-slate-50 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation(); window.openImageViewer('${rawUrl}')">
                            <div class="w-14 h-14 flex items-center justify-center overflow-hidden rounded bg-white">
                                <img src="${thumbUrl}" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/833/833281.png'">
                            </div>
                        </div>`;
                    });
                    attachmentsHtml += '</div>';
                }

                let repliesHtml = ''; 
                if(c.replies && c.replies.length > 0) { 
                    repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; 
                    c.replies.forEach(r => { 
                        let safeReplyContent = getSafeString(r.content).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
                        let rFiles = [];
                        if(r.imageUrl) rFiles.push({name:'첨부사진.jpg', url: r.imageUrl, thumbBase64: r.imageUrl});
                        let rAttachmentsHtml = '';
                        if (rFiles.length > 0) {
                            rAttachmentsHtml = '<div class="mt-2 flex flex-wrap gap-2">';
                            rFiles.forEach(f => {
                                let url = f.url || f.thumbBase64;
                                let rawUrl = url;
                                let thumbUrl = f.thumbBase64 ? f.thumbBase64 : (url.startsWith('data:image') ? url : 'https://cdn-icons-png.flaticon.com/512/833/833281.png');

                                if (url.includes('drive.google.com')) {
                                    let fileIdMatch = url.match(/\/d\/(.+?)\/view/);
                                    if (fileIdMatch) {
                                        rawUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/view`;
                                    }
                                }
                                rAttachmentsHtml += `<div class="relative border border-slate-200 rounded-lg p-1 bg-slate-50 hover:border-amber-300 hover:shadow-sm transition-all cursor-pointer" onclick="event.stopPropagation(); window.openImageViewer('${rawUrl}')">
                                    <div class="w-12 h-12 flex items-center justify-center overflow-hidden rounded bg-white">
                                        <img src="${thumbUrl}" class="max-w-full max-h-full object-contain" onerror="this.src='https://cdn-icons-png.flaticon.com/512/833/833281.png'">
                                    </div>
                                </div>`;
                            });
                            rAttachmentsHtml += '</div>';
                        }
                        
                        let replyBtnHtml = (r.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editComment('${r.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${r.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : '';
                        
                        repliesHtml += `<div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-sm">${getSafeString(r.authorName)}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(r.createdAt)))}</span></div><div class="flex gap-2">${replyBtnHtml}</div></div><div class="text-slate-700 text-[13px] font-medium pl-6 break-words">${safeReplyContent}</div>${rAttachmentsHtml}</div>`; 
                    }); 
                    repliesHtml += '</div>'; 
                } 
                
                let mainBtnHtml = (c.authorUid === (window.currentUser && window.currentUser.uid) || (window.userProfile && window.userProfile.role === 'admin')) ? `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : '';
                
                return `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-bold text-slate-800 text-[15px]">${getSafeString(c.authorName)}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span></div><div class="flex gap-2"><button onclick="window.setReplyTo('${c.id}', '${getSafeString(c.authorName)}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1 rounded-lg font-bold shadow-sm">답글달기</button>${mainBtnHtml}</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 break-words">${safeContent}</div>${attachmentsHtml}${repliesHtml}</div>`; 
            }).join('');
        }); 
    } catch(e) { safeShowError('코멘트 로드 에러', e); }
};

window.closeCommentModal = function() { const m = document.getElementById('comment-modal'); if(m){m.classList.add('hidden'); m.classList.remove('flex');} if (currentCommentUnsubscribe) currentCommentUnsubscribe(); };
window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value, content = document.getElementById('new-cmt-text').value.trim(), parentId = document.getElementById('reply-to-id').value || null, editId = document.getElementById('editing-cmt-id').value; 
    const fileInput = document.getElementById('new-cmt-image');
    if(!content && (!fileInput || fileInput.files.length === 0)) return safeShowError("코멘트 내용이나 사진을 첨부하세요."); 
    const btnSave = document.getElementById('btn-cmt-save'); if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
    const saveData = async function(base64Img) {
        try { 
            const payload = { content: content, updatedAt: Date.now() }; 
            if(base64Img) payload.imageUrl = base64Img;
            if (editId) { 
                await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); safeShowSuccess("수정됨"); 
            } else { 
                payload.projectId = projectId; payload.parentId = parentId; 
                payload.authorUid = (window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'system'; 
                payload.authorName = (window.userProfile && window.userProfile.name) ? window.userProfile.name : 'system'; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); safeShowSuccess("등록됨"); 
            } 
            if(window.cancelCommentAction) window.cancelCommentAction(); 
        } catch(e) { safeShowError("저장 오류", e); } finally { if(btnSave) { btnSave.innerHTML = '작성'; btnSave.disabled = false; } } 
    };

    if (fileInput && fileInput.files.length > 0) {
        if(window.resizeAndConvertToBase64) window.resizeAndConvertToBase64(fileInput.files[0], saveData, 1200);
        else saveData(null);
    } else {
        saveData(null);
    }
};
window.editComment = function(id) { const c = window.currentComments.find(x => x.id === id); if(!c) return; if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('editing-cmt-id').value = id; document.getElementById('new-cmt-text').value = c.content || ''; document.getElementById('btn-cmt-save').innerText = '수정'; document.getElementById('reply-indicator-name').innerHTML = '코멘트 수정 중'; document.getElementById('reply-indicator').classList.remove('hidden'); };
window.setReplyTo = function(cid, name) { if(window.cancelCommentAction) window.cancelCommentAction(); document.getElementById('reply-to-id').value = cid; document.getElementById('reply-indicator-name').innerHTML = `${name} 님에게 답글 작성 중`; document.getElementById('reply-indicator').classList.remove('hidden'); };
window.cancelCommentAction = function() { document.getElementById('reply-to-id').value = ''; document.getElementById('editing-cmt-id').value = ''; document.getElementById('new-cmt-text').value = ''; document.getElementById('btn-cmt-save').innerText = '작성'; document.getElementById('reply-indicator').classList.add('hidden'); document.getElementById('new-cmt-image').value = ''; document.getElementById('cmt-file-name').innerText = ''; };
window.deleteComment = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_comments", id)); const q = query(collection(db, "project_comments"), where("parentId", "==", id)); const snapshot = await getDocs(q); if(!snapshot.empty) { const batch = writeBatch(db); snapshot.forEach(d => batch.delete(d.ref)); await batch.commit(); } safeShowSuccess("삭제됨"); if(window.cancelCommentAction) window.cancelCommentAction(); } catch(e) { safeShowError("삭제 실패", e); } };
