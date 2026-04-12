/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let projectStatusSnapshotUnsubscribe = null;
let currentMdLogUnsubscribe = null;
let currentLogUnsubscribe = null;
let currentCommentUnsubscribe = null;
let currentIssueUnsubscribe = null;

window.currentStatusFilter = 'all';
window.currentCategoryFilter = 'all';
window.currentMonthFilter = '';
window.calendarCurrentDate = new Date();
window.hideCompletedFilter = false; 

const getSafeMillis = function(val) { 
    try { 
        if (!val) return 0; 
        if (typeof val.toMillis === 'function') return val.toMillis(); 
        if (typeof val === 'number') return val; 
        if (typeof val === 'string') return new Date(val).getTime() || 0; 
        return 0; 
    } catch(e) { 
        return 0; 
    } 
};

const getSafeString = function(val) { 
    if (val === null || val === undefined) return ''; 
    return String(val); 
};

window.loadCounts = function() {
    try {
        onSnapshot(collection(db, "project_comments"), function(snap) { 
            window.projectCommentCounts = {}; 
            snap.forEach(function(doc) { 
                let d = doc.data(); 
                let pid = d.projectId || d.reqId; 
                if(pid) window.projectCommentCounts[pid] = (window.projectCommentCounts[pid]||0)+1; 
            }); 
            try { 
                if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status')?.classList.contains('hidden')) {
                    window.renderProjectStatusList(); 
                }
            } catch(e){} 
        });
        
        onSnapshot(collection(db, "project_issues"), function(snap) { 
            window.projectIssueCounts = {}; 
            snap.forEach(function(doc) { 
                let d = doc.data(); 
                let pid = d.projectId || d.reqId; 
                if(pid && !d.isResolved) window.projectIssueCounts[pid] = (window.projectIssueCounts[pid]||0)+1; 
            }); 
            try { 
                if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status')?.classList.contains('hidden')) {
                    window.renderProjectStatusList(); 
                }
            } catch(e){} 
        });
        
        onSnapshot(collection(db, "daily_logs"), function(snap) { 
            window.projectLogCounts = {}; 
            snap.forEach(function(doc) { 
                let d = doc.data(); 
                let pid = d.projectId || d.reqId; 
                if(pid) window.projectLogCounts[pid] = (window.projectLogCounts[pid]||0)+1; 
            }); 
            try { 
                if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status')?.classList.contains('hidden')) {
                    window.renderProjectStatusList(); 
                }
            } catch(e){} 
        });
    } catch(e) { 
        console.warn("카운트 로드 실패:", e); 
    }
};

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; 
    window.resetAllFilters();
    
    let btnMfg = document.getElementById('btn-part-mfg');
    let btnOpt = document.getElementById('btn-part-opt');
    
    if (btnMfg) btnMfg.className = part === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    if (btnOpt) btnOpt.className = part === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    
    window.loadProjectStatusData();
};

window.filterProjectStatus = function(status) {
    window.currentStatusFilter = status;
    if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
    else if(window.currentProjDashView === 'calendar') window.renderProjCalendar(); 
    else window.renderProjectStatusList();
};

window.filterByCategory = function(category) { 
    window.currentCategoryFilter = category; 
    window.filterProjectStatus(window.currentStatusFilter); 
};

window.filterByMonth = function(monthStr) { 
    window.currentMonthFilter = monthStr; 
    window.updateMiniDashboard(); 
    window.filterProjectStatus(window.currentStatusFilter); 
};

window.filterByStatusOnly = function(status) {
    window.currentCategoryFilter = 'all'; 
    window.currentMonthFilter = ''; 
    window.hideCompletedFilter = false;
    
    const cSelect=document.getElementById('filter-category-select'); 
    if(cSelect) cSelect.value='all';
    
    const mSelect=document.getElementById('filter-month-select'); 
    if(mSelect) mSelect.value='';
    
    const hCb=document.getElementById('hide-completed-cb'); 
    if(hCb) hCb.checked=false;
    
    window.filterProjectStatus(status);
};

window.resetAllFilters = function() {
    window.currentStatusFilter = 'all'; 
    window.currentCategoryFilter = 'all'; 
    window.currentMonthFilter = ''; 
    window.hideCompletedFilter = false;
    
    const cSelect=document.getElementById('filter-category-select'); 
    if(cSelect) cSelect.value='all';
    
    const mSelect=document.getElementById('filter-month-select'); 
    if(mSelect) mSelect.value='';
    
    const hCb=document.getElementById('hide-completed-cb'); 
    if(hCb) hCb.checked=false;
    
    window.filterProjectStatus('all');
};

window.toggleHideCompleted = function(checked) { 
    window.hideCompletedFilter = checked; 
    window.filterProjectStatus(window.currentStatusFilter); 
};

window.getFilteredProjects = function() {
    let list = window.currentProjectStatusList || [];
    
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') {
        list = list.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
    }
    
    if(window.currentStatusFilter && window.currentStatusFilter !== 'all') { 
        list = list.filter(item => { 
            if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; 
            return item.status === window.currentStatusFilter; 
        }); 
    }
    
    if(window.hideCompletedFilter) {
        list = list.filter(item => item.status !== 'completed');
    }
    
    if(window.currentMonthFilter) { 
        list = list.filter(item => { 
            const sEn = item.d_shipEn || ''; 
            const aEst = item.d_asmEst || ''; 
            const aEn = item.d_asmEn || ''; 
            return sEn.startsWith(window.currentMonthFilter) || aEst.startsWith(window.currentMonthFilter) || aEn.startsWith(window.currentMonthFilter); 
        }); 
    }

    const priority = { 'pending': 1, 'progress': 2, 'inspecting': 2, 'rejected': 3, 'completed': 4 };
    list.sort(function(a, b) {
        const pA = priority[a.status] || 99; 
        const pB = priority[b.status] || 99;
        if (pA !== pB) return pA - pB;
        return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt);
    });
    return list;
};

window.searchProjectBoard = function(keyword) { 
    try { 
        const k = getSafeString(keyword).toLowerCase(); 
        document.querySelectorAll('#proj-dash-tbody tr').forEach(function(tr) { 
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
        if (completedLabel) {
            completedLabel.innerHTML = '<i class="fa-solid fa-truck-fast text-emerald-400"></i> 출하 완료 (' + (now.getMonth() + 1) + '월)';
        }

        (window.currentProjectStatusList || []).forEach(function(item) {
            const status = getSafeString(item.status); 
            const shipEn = getSafeString(item.d_shipEn); 
            const shipEst = getSafeString(item.d_shipEst); 
            const code = getSafeString(item.code) || '미지정';
            
            if (status === 'pending' || status === 'rejected') {
                pending++;
            } else if (status === 'progress' || status === 'inspecting') {
                progress++;
            } else if (status === 'completed') { 
                if (shipEn.startsWith(currentMonthStr)) {
                    completedThisMonth++; 
                }
            }

            if (status !== 'completed' && status !== 'rejected' && shipEst) {
                const shipDate = new Date(shipEst);
                if(!isNaN(shipDate.getTime())) {
                    const diffDays = Math.ceil((shipDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays <= 7) {
                        upcomingCodes7.push({ code: code, dDay: diffDays });
                    } else if (diffDays < 0) {
                        upcomingCodes7.push({ code: code, dDay: diffDays });
                    } else if (diffDays > 7 && diffDays <= 14) {
                        upcomingCodes14.push({ code: code, dDay: diffDays });
                    }
                }
            }
        });

        if(document.getElementById('mini-dash-pending')) document.getElementById('mini-dash-pending').innerText = pending;
        if(document.getElementById('mini-dash-progress')) document.getElementById('mini-dash-progress').innerText = progress;
        if(document.getElementById('mini-dash-completed')) document.getElementById('mini-dash-completed').innerText = completedThisMonth;

        const elUpcoming7 = document.getElementById('mini-dash-upcoming');
        if(elUpcoming7) { 
            if (upcomingCodes7.length === 0) {
                elUpcoming7.innerHTML = '<span class="text-[10px] text-rose-400 font-bold w-full text-center mt-1">임박한 프로젝트 없음</span>';
            } else {
                let html = '';
                upcomingCodes7.forEach(function(u) {
                    let dText = u.dDay === 0 ? 'D-Day' : (u.dDay < 0 ? '지연' : 'D-' + u.dDay); 
                    let bgClass = u.dDay <= 3 ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'; 
                    html += '<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 ' + bgClass + '">' + u.code + ' <span class="opacity-80 text-[8px]">[' + dText + ']</span></span>';
                });
                elUpcoming7.innerHTML = html;
            }
        }
        
        const elUpcoming14 = document.getElementById('mini-dash-upcoming-14');
        if(elUpcoming14) { 
            if (upcomingCodes14.length === 0) {
                elUpcoming14.innerHTML = '<span class="text-[10px] text-orange-400 font-bold w-full text-center mt-1">임박한 프로젝트 없음</span>';
            } else {
                let html = '';
                upcomingCodes14.forEach(function(u) {
                    html += '<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 bg-white text-orange-600 border-orange-200">' + u.code + ' <span class="opacity-80 text-[8px]">[D-' + u.dDay + ']</span></span>';
                });
                elUpcoming14.innerHTML = html;
            }
        }
    } catch(e) {}
};

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    try {
        projectStatusSnapshotUnsubscribe = onSnapshot(query(collection(db, "projects_status")), function(snapshot) {
            try {
                window.currentProjectStatusList = []; 
                let lastUpdated = 0; 
                const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
                
                snapshot.forEach(function(doc) { 
                    const data = doc.data(); 
                    const dataPart = getSafeString(data.part).trim() || '제조'; 
                    let isMatch = (targetPart === '광학') ? (dataPart === '광학') : (dataPart !== '광학');
                    if(isMatch) {
                        data.id = doc.id;
                        window.currentProjectStatusList.push(data); 
                    }
                    let uTime = getSafeMillis(data.updatedAt); 
                    if(uTime > lastUpdated) lastUpdated = uTime;
                });
                
                window.currentProjectStatusList.sort(function(a,b) {
                    return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt);
                });
                
                try {
                    if (lastUpdated > 0) { 
                        const lDate = new Date(lastUpdated); 
                        const el = document.getElementById('pjt-last-update');
                        if(el) {
                            el.innerText = lDate.getFullYear().toString().slice(2) + '-' + String(lDate.getMonth()+1).padStart(2,'0') + '-' + String(lDate.getDate()).padStart(2,'0') + ' ' + String(lDate.getHours()).padStart(2,'0') + ':' + String(lDate.getMinutes()).padStart(2,'0'); 
                        }
                    }
                } catch(e){}
                
                if(window.updateMiniDashboard) window.updateMiniDashboard();
            } catch(error) {} finally {
                try {
                    if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
                    else if(window.currentProjDashView === 'calendar') window.renderProjCalendar();
                    else window.renderProjectStatusList();
                } catch(renderError) {}
            }
        });
    } catch(e) {}
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); 
    if(!tbody) return;
    
    try {
        let displayList = window.getFilteredProjects();
        if(displayList.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="28" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">해당 조건의 프로젝트가 없습니다.</td></tr>'; 
            return; 
        }
        
        const statusMap = { 
            'pending': '<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">대기/보류</span>', 
            'progress': '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200">진행중(제작)</span>', 
            'inspecting': '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200">진행중(검수)</span>', 
            'completed': '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200">완료(출하)</span>', 
            'rejected': '<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200">보류/불가</span>' 
        };
        
        let htmlStr = '';
        displayList.forEach(function(item) {
            try {
                const currentMd = parseFloat(item.currentMd) || 0; 
                const outMd = parseFloat(item.outMd) || 0; 
                const fMd = parseFloat(item.finalMd) || (currentMd + outMd); 
                const fMdFixed = fMd.toFixed(1);
                
                const safeNameStr = getSafeString(item.name); 
                const safeCodeStr = getSafeString(item.code); 
                const safeCompStr = getSafeString(item.company); 
                const safeManagerStr = getSafeString(item.manager); 
                const safeCatStr = getSafeString(item.category); 
                const safeStatus = getSafeString(item.status);
                const safeNameJs = safeNameStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, ''); 
                const safeNameHtml = safeNameStr.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                let linksHtml = ''; 
                if(item.links && Array.isArray(item.links)) { 
                    linksHtml = item.links.map(function(lnk) {
                        return '<a href="' + getSafeString(lnk?.url) + '" target="_blank" title="' + getSafeString(lnk?.name) + '" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>';
                    }).join(''); 
                }
                
                let cCount = (window.projectCommentCounts && window.projectCommentCounts[item.id]) || 0; 
                let iCount = (window.projectIssueCounts && window.projectIssueCounts[item.id]) || 0; 
                let lCount = (window.projectLogCounts && window.projectLogCounts[item.id]) || 0;
                
                let trHtml = '<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus(\'' + item.id + '\')">';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center bg-white sticky left-0 z-10" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus(\'' + item.id + '\')" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 p-1.5 rounded transition-all"><i class="fa-solid fa-trash-can"></i></button></td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + safeCatStr + '</td>';
                
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openCommentModal(\'' + item.id + '\', \'' + safeNameJs + '\')" class="text-amber-400 hover:text-amber-500 relative"><i class="fa-regular fa-comment-dots text-lg"></i>';
                if(cCount > 0) trHtml += '<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm">' + cCount + '</span>';
                trHtml += '</button></td>';
                
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openIssueModal(\'' + item.id + '\', \'' + safeNameJs + '\')" class="text-rose-400 hover:text-rose-500 relative"><i class="fa-solid fa-triangle-exclamation text-lg"></i>';
                if(iCount > 0) trHtml += '<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm">' + iCount + '</span>';
                trHtml += '</button></td>';
                
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700">' + safeCodeStr + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 truncate max-w-[150px]">' + safeNameHtml + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + safeCompStr + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center font-black text-emerald-600">' + (parseFloat(item.progress) || 0) + '%</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + (statusMap[safeStatus] || '') + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center font-bold text-slate-600">' + safeManagerStr + '</td>';
                
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal(\'' + item.id + '\', \'' + safeNameJs + '\', ' + (parseFloat(item.progress) || 0) + ')" class="text-sky-400 hover:text-sky-500 relative"><i class="fa-solid fa-book text-lg"></i>';
                if(lCount > 0) trHtml += '<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm">' + lCount + '</span>';
                trHtml += '</button></td>';
                
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-sky-600">' + (parseFloat(item.estMd) || 0) + '</td>';
                trHtml += '<td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal(\'' + item.id + '\', \'' + safeNameJs + '\', ' + currentMd + ')" class="text-purple-600 hover:bg-purple-50 w-full h-full py-0.5 rounded underline decoration-purple-300">' + currentMd + '</button></td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-sky-600 font-bold">' + fMdFixed + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">' + (item.totPers !== undefined ? item.totPers : '') + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">' + (item.outPers !== undefined ? item.outPers : '') + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-amber-600">' + (item.outMd !== undefined ? item.outMd : '') + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">' + getSafeString(item.d_shipEst) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">' + getSafeString(item.d_asmEst) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">' + getSafeString(item.d_asmEndEst) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">' + getSafeString(item.d_asmSt) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">' + getSafeString(item.d_asmEn) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + getSafeString(item.d_insSt) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + getSafeString(item.d_insEn) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700 font-bold">' + getSafeString(item.d_shipEn) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + getSafeString(item.d_setSt) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center">' + getSafeString(item.d_setEn) + '</td>';
                trHtml += '<td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><div class="flex items-center justify-center gap-1 flex-wrap"><button onclick="window.openLinkModal(\'' + item.id + '\', \'' + safeNameJs + '\')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>' + linksHtml + '</div></td>';
                trHtml += '</tr>';
                
                htmlStr += trHtml;
            } catch(rowErr) {}
        });
        tbody.innerHTML = htmlStr;
    } catch (error) {}
};

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
    modal.classList.remove('hidden'); 
    modal.classList.add('flex');
};

window.closeProjStatusWriteModal = function() { 
    const modal = document.getElementById('proj-status-write-modal');
    modal.classList.add('hidden'); 
    modal.classList.remove('flex'); 
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
    modal.classList.remove('hidden'); 
    modal.classList.add('flex');
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
        if(btn) btn.className = "px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-500 transition-all";
    });
    
    const activeBtn = document.getElementById('btn-pd-' + view); 
    if(activeBtn) activeBtn.className = "px-3 py-1.5 text-xs font-bold bg-slate-200 shadow-inner rounded-md text-slate-700 transition-all";
    
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

        if(todayOffset >= 0) {
            html += '<div class="absolute top-0 w-[2px] bg-rose-500 z-[100] pointer-events-none shadow-sm" style="left: ' + (300 + todayOffset + (dayWidth/2)) + 'px; height:100%; bottom:0;"><div class="absolute top-10 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-md font-bold whitespace-nowrap border border-white">오늘</div></div>';
        }

        html += '<div class="flex border-b border-slate-200 sticky top-0 bg-white z-30 shadow-sm"><div class="w-[300px] flex-shrink-0 p-3 font-bold text-xs text-slate-700 bg-slate-50 border-r border-slate-200 flex items-center sticky left-0 z-30"><div class="w-[100px] text-indigo-600">PJT 코드</div><div class="w-[200px]">프로젝트명</div></div>';
        
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
            
            html += '<div class="flex border-b border-slate-100 hover:bg-slate-50 relative group cursor-pointer" onclick="window.editProjStatus(\'' + p.id + '\')"><div class="w-[300px] flex-shrink-0 p-2 text-[11px] font-bold text-slate-700 border-r border-slate-200 bg-white z-10 sticky left-0 flex items-center group-hover:bg-slate-50 transition-colors" title="' + safeNameHtml + '"><div class="w-[100px] text-indigo-600 truncate font-black pr-1">' + safeCodeStr + '</div><div class="w-[200px] truncate">' + safeNameHtml + '</div></div><div class="flex relative" style="width: ' + (totalDays * dayWidth) + 'px">';
            
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
            const scrollContainer = document.getElementById('proj-dash-gantt-container'); 
            if(scrollContainer && todayOffset > 0) scrollContainer.scrollLeft = todayOffset - 200; 
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

// ==========================================================
// 🚨 과거 데이터(reqId/projectId) 무조건 불러오는 철통 방어 렌더링 🚨
// ==========================================================

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


// 코멘트 모달 로직
window.openCommentModal = function(projectId) { 
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


// 이슈 모달 로직
window.openIssueModal = function(projectId) { 
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
            const issueCountEl = document.getElementById('issue-total-count');
            if(issueCountEl) issueCountEl.innerText = '미해결 ' + unresolvedCount + '건'; 
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

// MD Log 모달 로직
window.openMdLogModal = function(projectId) { 
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

// 링크 관리 로직
window.openLinkModal = function(projectId) { 
    const proj = window.currentProjectStatusList.find(function(p) { return p.id === projectId; }); 
    if(!proj) return; 
    document.getElementById('link-req-id').value = projectId; 
    const titleEl = document.getElementById('link-project-title'); 
    if(titleEl) titleEl.innerText = proj.name || ''; 
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
            htmlStr += '<li class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"><div class="flex flex-col truncate"><span class="font-extrabold text-slate-700 text-sm mb-1">' + lnk.name + '</span><a href="' + lnk.url + '" target="_blank" class="text-[11px] font-bold text-teal-600 hover:text-teal-800 hover:underline truncate flex items-center gap-1"><i class="fa-solid fa-link"></i> ' + lnk.url + '</a></div><button onclick="window.deleteLinkItem(\'' + projectId + '\', ' + idx + ')" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all p-2.5"><i class="fa-solid fa-trash-can"></i></button></li>';
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
