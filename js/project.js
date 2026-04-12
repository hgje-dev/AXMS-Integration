/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let projectStatusSnapshotUnsubscribe = null;
let currentMdLogUnsubscribe = null;
let currentLogUnsubscribe = null;
let currentCommentUnsubscribe = null;
let currentIssueUnsubscribe = null;

// 신규 추가: 구매, 설계, 일정 리스너
let currentPurchaseUnsubscribe = null;
let currentDesignUnsubscribe = null;
let currentPjtScheduleUnsubscribe = null;

const TARGET_DRIVE_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ"; // 요청하신 구글 드라이브 공통 폴더

window.currentStatusFilter = 'all';
window.currentCategoryFilter = 'all';
window.currentMonthFilter = '';
window.calendarCurrentDate = new Date();
window.hideCompletedFilter = false; 
window.ganttTodayOffset = 0;

const getSafeMillis = function(val) { 
    try { 
        if (!val) return 0; 
        if (typeof val.toMillis === 'function') return val.toMillis(); 
        if (typeof val === 'number') return val; 
        if (typeof val === 'string') return new Date(val).getTime() || 0; 
        return 0; 
    } catch(e) { return 0; } 
};

const getSafeString = function(val) { return (val === null || val === undefined) ? '' : String(val); };

// 💡 메인 카운트 로더 (모든 항목의 실시간 개수 감시)
window.loadCounts = function() {
    try {
        // 코멘트 카운트
        onSnapshot(collection(db, "project_comments"), function(snap) { 
            window.projectCommentCounts = {}; 
            snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectCommentCounts[pid] = (window.projectCommentCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        // 이슈 카운트
        onSnapshot(collection(db, "project_issues"), function(snap) { 
            window.projectIssueCounts = {}; 
            snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid && !d.isResolved) window.projectIssueCounts[pid] = (window.projectIssueCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        // 생산일지 카운트
        onSnapshot(collection(db, "daily_logs"), function(snap) { 
            window.projectLogCounts = {}; 
            snap.forEach(doc => { let d = doc.data(); let pid = d.projectId || d.reqId; if(pid) window.projectLogCounts[pid] = (window.projectLogCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        // 구매 카운트
        onSnapshot(collection(db, "project_purchases"), function(snap) { 
            window.projectPurchaseCounts = {}; 
            snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectPurchaseCounts[pid] = (window.projectPurchaseCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        // 설계 카운트
        onSnapshot(collection(db, "project_designs"), function(snap) { 
            window.projectDesignCounts = {}; 
            snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectDesignCounts[pid] = (window.projectDesignCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
        // 일정 카운트
        onSnapshot(collection(db, "project_schedules"), function(snap) { 
            window.projectScheduleCounts = {}; 
            snap.forEach(doc => { let pid = doc.data().projectId; if(pid) window.projectScheduleCounts[pid] = (window.projectScheduleCounts[pid]||0)+1; }); 
            window.renderProjectStatusList();
        });
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
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') list = list.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
    if(window.currentStatusFilter && window.currentStatusFilter !== 'all') { 
        list = list.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; }); 
    }
    if(window.hideCompletedFilter) list = list.filter(item => item.status !== 'completed');
    if(window.currentYearFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentYearFilter) || (item.d_asmEst || '').startsWith(window.currentYearFilter));
    if(window.currentMonthFilter) list = list.filter(item => (item.d_shipEn || '').startsWith(window.currentMonthFilter) || (item.d_asmEst || '').startsWith(window.currentMonthFilter));
    const priority = { 'pending': 1, 'progress': 2, 'inspecting': 2, 'rejected': 3, 'completed': 4 };
    list.sort((a,b) => (priority[a.status] || 99) - (priority[b.status] || 99) || getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
    return list;
};

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    projectStatusSnapshotUnsubscribe = onSnapshot(query(collection(db, "projects_status")), function(snapshot) {
        window.currentProjectStatusList = []; 
        let lastUpdated = 0; const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
        snapshot.forEach(docSnap => { 
            const data = docSnap.data(); const dataPart = getSafeString(data.part).trim() || '제조'; 
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
        window.renderProjectStatusList();
    });
};

// 💡 PJT 현황판 리스트 렌더링 (전체 코드 업데이트)
window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    let displayList = window.getFilteredProjects();
    if(displayList.length === 0) { tbody.innerHTML = '<tr><td colspan="31" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">프로젝트가 없습니다.</td></tr>'; return; }
    
    const statusMap = { 'pending': '대기/보류', 'progress': '진행중(제작)', 'inspecting': '진행중(검수)', 'completed': '완료(출하)', 'rejected': '보류/불가' };
    let htmlStr = '';
    
    displayList.forEach(item => {
        const cMd = parseFloat(item.currentMd) || 0; const oMd = parseFloat(item.outMd) || 0; const fMd = parseFloat(item.finalMd) || (cMd + oMd);
        const safeNameJs = getSafeString(item.name).replace(/'/g, "\\'");
        
        // 카운트 데이터
        const cCnt = (window.projectCommentCounts && window.projectCommentCounts[item.id]) || 0;
        const iCnt = (window.projectIssueCounts && window.projectIssueCounts[item.id]) || 0;
        const lCnt = (window.projectLogCounts && window.projectLogCounts[item.id]) || 0;
        const purCnt = (window.projectPurchaseCounts && window.projectPurchaseCounts[item.id]) || 0;
        const desCnt = (window.projectDesignCounts && window.projectDesignCounts[item.id]) || 0;
        const schCnt = (window.projectScheduleCounts && window.projectScheduleCounts[item.id]) || 0;

        let trHtml = `<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-white sticky left-0 z-10" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 rounded"><i class="fa-solid fa-trash-can"></i></button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.category)}</td>`;
        
        // 코멘트 & 이슈
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-400 relative"><i class="fa-regular fa-comment-dots text-lg"></i>${cCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full">${cCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-400 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>${iCnt ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full">${iCnt}</span>` : ''}</button></td>`;
        
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700">${getSafeString(item.code)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 truncate max-w-[150px]">${getSafeString(item.name)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.company)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-black text-emerald-600">${parseFloat(item.progress) || 0}%</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${statusMap[item.status] || ''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600">${getSafeString(item.manager)}</td>`;
        
        // 🔥 새로 추가된 구매/설계/일정 버튼
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPurchaseModal('${item.id}', '${safeNameJs}')" class="text-amber-500 relative"><i class="fa-solid fa-cart-shopping text-lg"></i>${purCnt ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full">${purCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDesignModal('${item.id}', '${safeNameJs}')" class="text-teal-400 relative"><i class="fa-solid fa-pen-ruler text-lg"></i>${desCnt ? `<span class="absolute -top-1 -right-2 bg-teal-100 text-teal-600 text-[9px] font-bold px-1 rounded-full">${desCnt}</span>` : ''}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openPjtScheduleModal('${item.id}', '${safeNameJs}')" class="text-fuchsia-400 relative"><i class="fa-regular fa-calendar-check text-lg"></i>${schCnt ? `<span class="absolute -top-1 -right-2 bg-fuchsia-100 text-fuchsia-600 text-[9px] font-bold px-1 rounded-full">${schCnt}</span>` : ''}</button></td>`;

        // 생산일지
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}', '${safeNameJs}', ${parseFloat(item.progress)||0})" class="text-sky-400 relative"><i class="fa-solid fa-book text-lg"></i>${lCnt ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full">${lCnt}</span>` : ''}</button></td>`;
        
        // MD 및 날짜 데이터 (생략 없이 출력)
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd||0}</td>`;
        trHtml += `<td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal('${item.id}', '${safeNameJs}', ${cMd})" class="text-purple-600 underline">${cMd}</button></td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center font-bold">${fMd.toFixed(1)}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outPers||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outMd||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">${item.d_shipEst||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${item.d_asmEst||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${item.d_asmEndEst||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${item.d_asmSt||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${item.d_asmEn||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${item.d_insSt||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${item.d_insEn||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700 font-bold">${item.d_shipEn||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${item.d_setSt||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center">${item.d_setEn||''}</td>`;
        trHtml += `<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openLinkModal('${item.id}', '${safeNameJs}')" class="text-slate-400 hover:text-teal-500"><i class="fa-solid fa-link"></i></button></td>`;
        trHtml += `</tr>`;
        htmlStr += trHtml;
    });
    tbody.innerHTML = htmlStr;
};

// 💡 공통 Drive 업로드 헬퍼 함수
async function handleDriveUpload(fileInput, toastMsg) {
    if(!window.googleAccessToken) {
        if(window.initGoogleAPI) window.initGoogleAPI();
        if(window.authenticateGoogle && !window.googleAccessToken) window.authenticateGoogle();
        if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다. [연동하기] 버튼을 눌러주세요.");
    }
    window.showToast(toastMsg);
    if(window.uploadFileToDrive) {
        const fileId = await window.uploadFileToDrive(fileInput.files[0], TARGET_DRIVE_FOLDER);
        return `https://drive.google.com/file/d/${fileId}/view`;
    }
    throw new Error("업로드 함수를 찾을 수 없습니다.");
}

// 🛒 구매 관리 모달 로직
window.openPurchaseModal = function(projectId, title) { 
    document.getElementById('pur-req-id').value = projectId; document.getElementById('pur-project-title').innerText = title; 
    window.resetPurchaseForm(); document.getElementById('purchase-modal').classList.replace('hidden', 'flex'); 
    if(window.initGoogleAPI) window.initGoogleAPI();
    if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); 
    currentPurchaseUnsubscribe = onSnapshot(query(collection(db, "project_purchases"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); list.sort((a,b) => b.createdAt - a.createdAt);
        const listEl = document.getElementById('purchase-list'); if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 내역이 없습니다.</div>'; return; }
        listEl.innerHTML = list.map(item => `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between"><span class="font-bold text-amber-600 text-xs">${item.authorName}</span><button onclick="window.deletePurchase('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div><div class="text-sm text-slate-700">${(item.content || '').replace(/\n/g, '<br>')}</div>${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-sky-500 font-bold underline"><i class="fa-solid fa-paperclip"></i> 첨부 일정표 확인</a>` : ''}</div>`).join('');
    });
};
window.closePurchaseModal = function() { document.getElementById('purchase-modal').classList.replace('flex', 'hidden'); if (currentPurchaseUnsubscribe) currentPurchaseUnsubscribe(); };
window.resetPurchaseForm = function() { document.getElementById('editing-pur-id').value = ''; document.getElementById('new-pur-text').value = ''; document.getElementById('new-pur-file').value = ''; document.getElementById('pur-file-name').innerText = ''; };
window.savePurchaseItem = async function() { 
    const pId = document.getElementById('pur-req-id').value, content = document.getElementById('new-pur-text').value.trim(), fileInput = document.getElementById('new-pur-file'), btn = document.getElementById('btn-pur-save');
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let fileUrl = null; if(fileInput.files.length > 0) fileUrl = await handleDriveUpload(fileInput, "일정표 파일을 드라이브에 업로드 중...");
        await addDoc(collection(db, "project_purchases"), { projectId: pId, content: content, fileUrl: fileUrl, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("구매 내역이 등록되었습니다."); window.resetPurchaseForm(); 
    } catch(e) { window.showToast(e.message, "error"); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deletePurchase = async function(id) { if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_purchases", id)); };

// 📐 설계 관리 모달 로직
window.openDesignModal = function(projectId, title) { 
    document.getElementById('des-req-id').value = projectId; document.getElementById('des-project-title').innerText = title; 
    window.resetDesignForm(); document.getElementById('design-modal').classList.replace('hidden', 'flex'); 
    if(window.initGoogleAPI) window.initGoogleAPI();
    if (currentDesignUnsubscribe) currentDesignUnsubscribe(); 
    currentDesignUnsubscribe = onSnapshot(query(collection(db, "project_designs"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); list.sort((a,b) => b.createdAt - a.createdAt);
        const listEl = document.getElementById('design-list'); if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 설계 파일이 없습니다.</div>'; return; }
        listEl.innerHTML = list.map(item => `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between"><span class="font-bold text-teal-600 text-xs">${item.authorName}</span><button onclick="window.deleteDesign('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div><div class="text-sm text-slate-700">${(item.content || '').replace(/\n/g, '<br>')}</div>${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-sky-500 font-bold underline"><i class="fa-solid fa-file-arrow-down"></i> 설계 파일 확인</a>` : ''}</div>`).join('');
    });
};
window.closeDesignModal = function() { document.getElementById('design-modal').classList.replace('flex', 'hidden'); if (currentDesignUnsubscribe) currentDesignUnsubscribe(); };
window.resetDesignForm = function() { document.getElementById('editing-des-id').value = ''; document.getElementById('new-des-text').value = ''; document.getElementById('new-des-file').value = ''; document.getElementById('des-file-name').innerText = ''; };
window.saveDesignItem = async function() { 
    const pId = document.getElementById('des-req-id').value, content = document.getElementById('new-des-text').value.trim(), fileInput = document.getElementById('new-des-file'), btn = document.getElementById('btn-des-save');
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let fileUrl = null; if(fileInput.files.length > 0) fileUrl = await handleDriveUpload(fileInput, "설계 파일을 드라이브에 업로드 중...");
        await addDoc(collection(db, "project_designs"), { projectId: pId, content: content, fileUrl: fileUrl, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("설계 내역이 등록되었습니다."); window.resetDesignForm(); 
    } catch(e) { window.showToast(e.message, "error"); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deleteDesign = async function(id) { if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_designs", id)); };

// 📅 일정(PJT일정표) 관리 모달 로직
window.openPjtScheduleModal = function(projectId, title) { 
    document.getElementById('sch-req-id').value = projectId; document.getElementById('sch-project-title').innerText = title; 
    window.resetPjtScheduleForm(); document.getElementById('pjt-schedule-modal').classList.replace('hidden', 'flex'); 
    if(window.initGoogleAPI) window.initGoogleAPI();
    if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); 
    currentPjtScheduleUnsubscribe = onSnapshot(query(collection(db, "project_schedules"), where("projectId", "==", projectId)), function(snap) { 
        let list = []; snap.forEach(doc => list.push({ id: doc.id, ...doc.data() })); list.sort((a,b) => b.createdAt - a.createdAt);
        const listEl = document.getElementById('pjt-schedule-list'); if(list.length === 0) { listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 PJT 일정이 없습니다.</div>'; return; }
        listEl.innerHTML = list.map(item => `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2"><div class="flex justify-between"><span class="font-bold text-fuchsia-600 text-xs">${item.authorName}</span><button onclick="window.deletePjtSchedule('${item.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div><div class="text-sm text-slate-700">${(item.content || '').replace(/\n/g, '<br>')}</div>${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-sky-500 font-bold underline"><i class="fa-solid fa-calendar-days"></i> PJT 일정표 확인</a>` : ''}</div>`).join('');
    });
};
window.closePjtScheduleModal = function() { document.getElementById('pjt-schedule-modal').classList.replace('flex', 'hidden'); if (currentPjtScheduleUnsubscribe) currentPjtScheduleUnsubscribe(); };
window.resetPjtScheduleForm = function() { document.getElementById('editing-sch-id').value = ''; document.getElementById('new-sch-text').value = ''; document.getElementById('new-sch-file').value = ''; document.getElementById('sch-file-name').innerText = ''; };
window.savePjtScheduleItem = async function() { 
    const pId = document.getElementById('sch-req-id').value, content = document.getElementById('new-sch-text').value.trim(), fileInput = document.getElementById('new-sch-file'), btn = document.getElementById('btn-sch-save');
    if(!content && fileInput.files.length === 0) return window.showToast("내용이나 파일을 첨부하세요.", "error");
    btn.innerHTML = '저장중..'; btn.disabled = true;
    try { 
        let fileUrl = null; if(fileInput.files.length > 0) fileUrl = await handleDriveUpload(fileInput, "일정표 파일을 드라이브에 업로드 중...");
        await addDoc(collection(db, "project_schedules"), { projectId: pId, content: content, fileUrl: fileUrl, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() });
        window.showToast("PJT 일정 내역이 등록되었습니다."); window.resetPjtScheduleForm(); 
    } catch(e) { window.showToast(e.message, "error"); } finally { btn.innerHTML = '등록'; btn.disabled = false; }
};
window.deletePjtSchedule = async function(id) { if(confirm("삭제하시겠습니까?")) await deleteDoc(doc(db, "project_schedules", id)); };

// (나머지 기존 보조 기능들: openDailyLogModal, openCommentModal, openIssueModal, editProjStatus 등은 기존 프로젝트 코드를 기반으로 유지됩니다)
// ... 이 지점 하단에 기존 js/project.js 의 나머지 UI 관련 보조 함수들을 그대로 두시면 됩니다.
