// js/project.js
import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, where, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let projectStatusSnapshotUnsubscribe = null;
let masterCodeSnapshotUnsubscribe = null;
let currentMdLogUnsubscribe = null;
let currentLogUnsubscribe = null;
let currentCommentUnsubscribe = null;
let currentIssueUnsubscribe = null;

window.currentStatusFilter = 'all';
window.calendarCurrentDate = new Date();

const getSafeMillis = (val) => { try { if (!val) return 0; if (typeof val.toMillis === 'function') return val.toMillis(); if (typeof val === 'number') return val; if (typeof val === 'string') return new Date(val).getTime() || 0; return 0; } catch(e) { return 0; } };
const getSafeString = (val) => { if (val === null || val === undefined) return ''; return String(val); };

window.filterFromDashboard = function(status) {
    window.currentStatusFilter = status;
    window.openApp('project-status', 'PJT 현황판');
    setTimeout(() => { window.renderProjectStatusList(); }, 200);
};

// 🌟 예전 데이터(projectId)를 그대로 읽어오도록 완벽 복구했습니다!
window.loadCounts = function() {
    try {
        onSnapshot(collection(db, "project_comments"), snap => { window.projectCommentCounts = {}; snap.forEach(doc => { let d = doc.data(); if(d.projectId) window.projectCommentCounts[d.projectId] = (window.projectCommentCounts[d.projectId]||0)+1; }); try { if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status')?.classList.contains('hidden')) window.renderProjectStatusList(); } catch(e){} });
        onSnapshot(collection(db, "project_issues"), snap => { window.projectIssueCounts = {}; snap.forEach(doc => { let d = doc.data(); if(d.projectId && !d.isResolved) window.projectIssueCounts[d.projectId] = (window.projectIssueCounts[d.projectId]||0)+1; }); try { if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status')?.classList.contains('hidden')) window.renderProjectStatusList(); } catch(e){} });
        onSnapshot(collection(db, "daily_logs"), snap => { window.projectLogCounts = {}; snap.forEach(doc => { let d = doc.data(); if(d.projectId) window.projectLogCounts[d.projectId] = (window.projectLogCounts[d.projectId]||0)+1; }); try { if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status')?.classList.contains('hidden')) window.renderProjectStatusList(); } catch(e){} });
    } catch(e) { console.warn("카운트 로드 실패:", e); }
};

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; window.currentCategoryFilter = 'all'; const catSelect = document.getElementById('filter-category-select'); if(catSelect) catSelect.value = 'all';
    document.getElementById('btn-part-mfg').className = part === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    document.getElementById('btn-part-opt').className = part === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    window.loadProjectStatusData();
};

window.filterByCategory = function(category) { 
    window.currentCategoryFilter = category; 
    try { if(window.currentProjDashView === 'gantt') window.renderProjGantt(); else if(window.currentProjDashView === 'calendar') window.renderProjCalendar(); else window.renderProjectStatusList(); } catch(e) { console.error(e); }
};

window.searchProjectBoard = function(keyword) {
    try { const k = getSafeString(keyword).toLowerCase(); document.querySelectorAll('#proj-dash-tbody tr').forEach(tr => { const text = tr.innerText.toLowerCase(); tr.style.display = (text.includes(k) || window.matchString(k, text)) ? '' : 'none'; }); } catch(e) {}
};

window.updateMiniDashboard = function() {
    try {
        let pending = 0, progress = 0, completedThisMonth = 0; let upcomingCodes7 = [], upcomingCodes14 = [];
        const now = new Date(); const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const completedLabel = document.getElementById('mini-dash-completed-label');
        if (completedLabel) completedLabel.innerHTML = `<i class="fa-solid fa-truck-fast text-emerald-400"></i> 출하 완료 (${now.getMonth() + 1}월)`;

        (window.currentProjectStatusList || []).forEach(item => {
            const status = getSafeString(item.status); const shipEn = getSafeString(item.d_shipEn); const shipEst = getSafeString(item.d_shipEst); const code = getSafeString(item.code) || '미지정';
            if (status === 'pending' || status === 'rejected') pending++;
            else if (status === 'progress' || status === 'inspecting') progress++;
            else if (status === 'completed') { if (shipEn.startsWith(currentMonthStr) || (!shipEn && shipEst.startsWith(currentMonthStr))) completedThisMonth++; }

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
        if(elUpcoming7) { elUpcoming7.innerHTML = upcomingCodes7.length === 0 ? `<span class="text-[10px] text-rose-400 font-bold w-full text-center mt-1">임박한 프로젝트 없음</span>` : upcomingCodes7.map(u => { let dText = u.dDay === 0 ? 'D-Day' : (u.dDay < 0 ? `지연` : `D-${u.dDay}`); let bgClass = u.dDay <= 3 ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'; return `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 ${bgClass}">${u.code} <span class="opacity-80 text-[8px]">[${dText}]</span></span>`; }).join(''); }
        const elUpcoming14 = document.getElementById('mini-dash-upcoming-14');
        if(elUpcoming14) { elUpcoming14.innerHTML = upcomingCodes14.length === 0 ? `<span class="text-[10px] text-orange-400 font-bold w-full text-center mt-1">임박한 프로젝트 없음</span>` : upcomingCodes14.map(u => `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 bg-white text-orange-600 border-orange-200">${u.code} <span class="opacity-80 text-[8px]">[D-${u.dDay}]</span></span>`).join(''); }
    } catch(e) { console.warn("미니 대시보드 에러:", e); }
};

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    try {
        projectStatusSnapshotUnsubscribe = onSnapshot(query(collection(db, "projects_status")), (snapshot) => {
            try {
                window.currentProjectStatusList = []; let lastUpdated = 0; const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
                snapshot.forEach(doc => { 
                    const data = doc.data(); const dataPart = getSafeString(data.part).trim() || '제조'; 
                    let isMatch = (targetPart === '광학') ? (dataPart === '광학') : (dataPart !== '광학');
                    if(isMatch) window.currentProjectStatusList.push({ id: doc.id, ...data }); 
                    let uTime = getSafeMillis(data.updatedAt); if(uTime > lastUpdated) lastUpdated = uTime;
                });
                window.currentProjectStatusList.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
                try {
                    if (lastUpdated > 0) { 
                        const lDate = new Date(lastUpdated); const el = document.getElementById('pjt-last-update');
                        if(el) el.innerText = `${lDate.getFullYear().toString().slice(2)}-${String(lDate.getMonth()+1).padStart(2,'0')}-${String(lDate.getDate()).padStart(2,'0')} ${String(lDate.getHours()).padStart(2,'0')}:${String(lDate.getMinutes()).padStart(2,'0')}`; 
                    }
                } catch(e){}
                if(window.updateMiniDashboard) window.updateMiniDashboard();
            } catch(error) { console.error("데이터 분류 중 에러:", error); } finally {
                try {
                    if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
                    else if(window.currentProjDashView === 'calendar') window.renderProjCalendar();
                    else window.renderProjectStatusList();
                } catch(renderError) { console.error("렌더링 실패:", renderError); }
            }
        });
    } catch(e) { console.error("onSnapshot 에러:", e); }
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    try {
        let displayList = window.currentProjectStatusList || [];
        if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') { displayList = displayList.filter(item => getSafeString(item.category) === window.currentCategoryFilter); }
        if(window.currentStatusFilter && window.currentStatusFilter !== 'all') { displayList = displayList.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; }); }
        
        if(displayList.length === 0) { tbody.innerHTML = `<tr><td colspan="28" class="text-center p-6 text-slate-400 font-bold border-b border-slate-100 bg-white">해당 조건의 프로젝트가 없습니다.</td></tr>`; return; }
        
        const statusMap = { 'pending':'<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">대기/보류</span>', 'progress':'<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200">진행중(제작)</span>', 'inspecting':'<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200">진행중(검수)</span>', 'completed':'<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200">완료(출하)</span>', 'rejected':'<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200">보류/불가</span>' };
        
        let htmlStr = '';
        displayList.forEach(item => {
            try {
                const currentMd = parseFloat(item.currentMd) || 0; const outMd = parseFloat(item.outMd) || 0; const fMd = parseFloat(item.finalMd) || (currentMd + outMd); const fMdFixed = fMd.toFixed(1);
                const safeNameStr = getSafeString(item.name); const safeCodeStr = getSafeString(item.code); const safeCompStr = getSafeString(item.company); const safeManagerStr = getSafeString(item.manager); const safeCatStr = getSafeString(item.category); const safeStatus = getSafeString(item.status);
                const safeNameJs = safeNameStr.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, ''); const safeNameHtml = safeNameStr.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                let linksHtml = ''; if(item.links && Array.isArray(item.links)) { linksHtml = item.links.map(lnk => `<a href="${getSafeString(lnk?.url)}" target="_blank" title="${getSafeString(lnk?.name)}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>`).join(''); }
                let cCount = (window.projectCommentCounts && window.projectCommentCounts[item.id]) || 0; let iCount = (window.projectIssueCounts && window.projectIssueCounts[item.id]) || 0; let lCount = (window.projectLogCounts && window.projectLogCounts[item.id]) || 0;
                
                htmlStr += `<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer" onclick="window.editProjStatus('${item.id}')">
                    <td class="border border-slate-200 px-2 py-1 text-center bg-white sticky left-0 z-10" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-400 hover:text-rose-500 mx-1"><i class="fa-solid fa-trash-can"></i></button></td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${safeCatStr}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}')" class="${cCount>0?'text-amber-400 hover:text-amber-500':'text-slate-300 hover:text-amber-400'} relative transition-colors"><i class="fa-regular fa-comment-dots text-lg"></i> ${cCount > 0 ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm">${cCount}</span>` : ''}</button></td>
                    <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}')" class="${iCount>0?'text-rose-500':'text-slate-300 hover:text-rose-400'} relative transition-colors"><i class="fa-solid fa-triangle-exclamation text-lg"></i> ${iCount > 0 ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-bold px-1 rounded-full shadow-sm">${iCount}</span>` : ''}</button></td>
                    <td class="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700">${safeCodeStr}</td>
                    <td class="border border-slate-200 px-2 py-1 truncate max-w-[150px]">${safeNameHtml}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${safeCompStr}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center font-black text-emerald-600">${parseFloat(item.progress) || 0}%</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${statusMap[safeStatus] || ''}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${safeManagerStr}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}')" class="${lCount>0?'text-sky-500':'text-slate-300 hover:text-sky-400'} relative transition-colors"><i class="fa-solid fa-book text-lg"></i> ${lCount > 0 ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-bold px-1 rounded-full shadow-sm">${lCount}</span>` : ''}</button></td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${parseFloat(item.estMd) || 0}</td>
                    <td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal('${item.id}')" class="text-purple-600 hover:bg-purple-50 w-full h-full py-0.5 rounded underline decoration-purple-300">${currentMd}</button></td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-sky-600 font-bold">${fMdFixed}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers !== undefined ? item.totPers : ''}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outPers !== undefined ? item.outPers : ''}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outMd !== undefined ? item.outMd : ''}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">${getSafeString(item.d_shipEst)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${getSafeString(item.d_asmEst)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${getSafeString(item.d_asmEndEst)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${getSafeString(item.d_asmSt)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center text-indigo-700 font-bold">${getSafeString(item.d_asmEn)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_insSt)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_insEn)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700 font-bold">${getSafeString(item.d_shipEn)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_setSt)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center">${getSafeString(item.d_setEn)}</td>
                    <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><div class="flex items-center justify-center gap-1 flex-wrap"><button onclick="window.openLinkModal('${item.id}')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>${linksHtml}</div></td>
                </tr>`;
            } catch(rowErr) {}
        });
        tbody.innerHTML = htmlStr;
    } catch (error) { tbody.innerHTML = `<tr><td colspan="28" class="text-center p-6 text-rose-600 bg-rose-50 font-bold text-sm">🚨 오류 발생: ${error.message}</td></tr>`; }
};

window.openProjStatusWriteModal = function() {
    document.getElementById('ps-id').value = ''; document.getElementById('ps-code').value = ''; document.getElementById('ps-name').value = ''; document.getElementById('ps-company').value = ''; document.getElementById('ps-part').value = window.currentProjPartTab || '제조'; document.getElementById('ps-category').value = '설비'; document.getElementById('ps-status').value = 'pending'; document.getElementById('ps-progress-pct').value = '0';
    const mHtml = '<option value="">선택</option>' + window.teamMembers.map(t => `<option value="${t.name}">${t.name} (${t.part})</option>`).join('');
    const managerSelect = document.getElementById('ps-manager'); if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); if(memberSelect) memberSelect.innerHTML = mHtml;

    ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en', 'ps-d-asm-end-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-set-st', 'ps-d-set-en'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    
    document.getElementById('btn-view-history')?.classList.add('hidden'); // 등록일 땐 이력버튼 숨김
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};

window.closeProjStatusWriteModal = function() { document.getElementById('proj-status-write-modal').classList.add('hidden'); document.getElementById('proj-status-write-modal').classList.remove('flex'); };

window.editProjStatus = function(id) {
    const item = window.currentProjectStatusList.find(p => p.id === id); if(!item) return;
    const mHtml = '<option value="">선택</option>' + window.teamMembers.map(t => `<option value="${t.name}">${t.name} (${t.part})</option>`).join('');
    const managerSelect = document.getElementById('ps-manager'); if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); if(memberSelect) memberSelect.innerHTML = mHtml;

    document.getElementById('ps-id').value = item.id; document.getElementById('ps-code').value = item.code || ''; document.getElementById('ps-name').value = item.name || ''; document.getElementById('ps-company').value = item.company || ''; document.getElementById('ps-part').value = item.part || '제조'; document.getElementById('ps-category').value = item.category || '설비'; document.getElementById('ps-status').value = item.status || 'pending'; document.getElementById('ps-progress-pct').value = item.progress !== undefined ? item.progress : 0; document.getElementById('ps-manager').value = item.manager || '';
    window.currentSelectedMembers = item.members ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; window.renderSelectedMembers();
    document.getElementById('ps-est-md').value = item.estMd !== undefined ? item.estMd : ''; document.getElementById('ps-current-md').value = item.currentMd !== undefined ? item.currentMd : '';
    const cMd = parseFloat(item.currentMd) || 0; const oMd = parseFloat(item.outMd) || 0; document.getElementById('ps-final-md').value = (cMd + oMd).toFixed(1);
    document.getElementById('ps-tot-pers').value = item.totPers !== undefined ? item.totPers : ''; document.getElementById('ps-out-pers').value = item.outPers !== undefined ? item.outPers : ''; document.getElementById('ps-out-md').value = item.outMd !== undefined ? item.outMd : '';
    
    const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
    for (const [key, elementId] of Object.entries(dateMappings)) { const el = document.getElementById(elementId); if (el) el.value = item[key] || ''; }
    
    document.getElementById('btn-view-history')?.classList.remove('hidden'); // 수정일 땐 이력버튼 표시
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};

// 🌟 현황 등록 저장 로직 (에러 방어 및 이력 저장)
window.saveProjStatus = async function() {
    try {
        const btn = document.getElementById('btn-proj-save'); 
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
            code: code, name: name, 
            company: document.getElementById('ps-company')?.value || '', 
            part: document.getElementById('ps-part')?.value || '제조', 
            category: document.getElementById('ps-category')?.value || '설비', 
            status: document.getElementById('ps-status')?.value || 'pending', 
            progress: parseInt(document.getElementById('ps-progress-pct')?.value) || 0, 
            manager: document.getElementById('ps-manager')?.value || '', 
            members: document.getElementById('ps-members')?.value || '', 
            estMd: parseFloat(document.getElementById('ps-est-md')?.value) || 0, 
            outMd: outMd, finalMd: currentMd + outMd, 
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
                await addDoc(collection(db, "project_history"), {
                    projectId: id, snapshot: oldSnap.data(), changedBy: window.userProfile.name, changedAt: Date.now()
                });
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
        const btn = document.getElementById('btn-proj-save');
        if(btn){btn.disabled=false;btn.innerHTML='저장하기';}
    }
};

window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.calcFinalMd = function() { const curMd = parseFloat(document.getElementById('ps-current-md').value) || 0; const outMd = parseFloat(document.getElementById('ps-out-md').value) || 0; document.getElementById('ps-final-md').value = (curMd + outMd).toFixed(1); };
window.addProjectMember = function(name) { if(!name) return; if(!window.currentSelectedMembers.includes(name)) { window.currentSelectedMembers.push(name); window.renderSelectedMembers(); } document.getElementById('ps-member-add').value = ''; };
window.removeProjectMember = function(name) { window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); window.renderSelectedMembers(); };
window.renderSelectedMembers = function() { const container = document.getElementById('ps-selected-members'); document.getElementById('ps-members').value = window.currentSelectedMembers.join(', '); container.innerHTML = window.currentSelectedMembers.map(name => `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`).join(''); };

// 🌟 이력(History) 열기 및 복원 로직 🌟
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
        let hList = []; snap.forEach(doc => hList.push({id: doc.id, ...doc.data()})); hList.sort((a,b) => b.changedAt - a.changedAt);
        if(hList.length === 0) { listEl.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">저장된 변경 이력이 없습니다.</div>'; return; }
        listEl.innerHTML = hList.map(h => {
            const dateStr = window.getDateTimeStr(new Date(h.changedAt));
            return `<li class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                <div><div class="font-black text-sm text-slate-700">${dateStr}</div><div class="text-[11px] text-slate-500 mt-1">변경자: <span class="font-bold text-indigo-600">${h.changedBy}</span></div></div>
                <button onclick="window.restoreProjectHistory('${h.id}', '${projectId}')" class="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shadow-sm"><i class="fa-solid fa-rotate-left"></i> 이 시점으로 복원</button>
            </li>`;
        }).join('');
    } catch(e) { listEl.innerHTML = '<div class="text-center p-6 text-rose-500 font-bold">이력을 불러오는데 실패했습니다.</div>'; }
};
window.restoreProjectHistory = async function(histId, projectId) {
    if(!confirm("이 시점의 데이터로 프로젝트를 복원하시겠습니까?\n(현재 상태는 덮어씌워집니다)")) return;
    try {
        const hSnap = await getDoc(doc(db, "project_history", histId));
        if(hSnap.exists()) {
            const oldData = hSnap.data().snapshot; oldData.updatedAt = Date.now();
            await setDoc(doc(db, "projects_status", projectId), oldData);
            window.showToast("복원되었습니다."); window.closeProjHistoryModal(); window.editProjStatus(projectId);
        }
    } catch(e) { window.showToast("복원 실패", "error"); }
};

window.toggleProjDashView = function(view) {
    window.currentProjDashView = view;
    document.getElementById('proj-dash-list-container').classList.add('hidden'); document.getElementById('proj-dash-gantt-container').classList.add('hidden'); document.getElementById('proj-dash-calendar-container').classList.add('hidden');
    ['list', 'gantt', 'calendar'].forEach(b => {const btn = document.getElementById(`btn-pd-${b}`); if(btn) btn.className = "px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-500 transition-all";});
    const activeBtn = document.getElementById(`btn-pd-${view}`); if(activeBtn) activeBtn.className = "px-3 py-1.5 text-xs font-bold bg-slate-200 shadow-inner rounded-md text-slate-700 transition-all";
    if(view === 'list') document.getElementById('proj-dash-list-container').classList.remove('hidden');
    else if(view === 'gantt') { document.getElementById('proj-dash-gantt-container').classList.remove('hidden'); window.renderProjGantt(); }
    else if(view === 'calendar') { document.getElementById('proj-dash-calendar-container').classList.remove('hidden'); window.renderProjCalendar(); }
};

// 🌟 간트 차트 (오늘 기준선 절대 증발 방지)
window.renderProjGantt = function() {
    const container = document.getElementById('proj-dash-gantt-content');
    try {
        let displayList = window.currentProjectStatusList || [];
        if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') displayList = displayList.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
        if(window.currentStatusFilter && window.currentStatusFilter !== 'all') { displayList = displayList.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; }); }
        if(window.currentMonthFilter) { displayList = displayList.filter(item => { const sEst = item.d_shipEst || ''; const sEn = item.d_shipEn || ''; const aEst = item.d_asmEst || ''; const aEn = item.d_asmEn || ''; return sEst.startsWith(window.currentMonthFilter) || sEn.startsWith(window.currentMonthFilter) || aEst.startsWith(window.currentMonthFilter) || aEn.startsWith(window.currentMonthFilter); }); }

        const projects = displayList.filter(p => p.d_asmSt || p.d_asmEst || p.d_shipEst || p.d_shipEn || p.d_insSt || p.d_insEn || p.d_setSt || p.d_setEn);
        if(projects.length === 0) { container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold bg-white w-full h-full flex items-center justify-center rounded-xl">표시할 일정 데이터가 없습니다.</div>'; return; }

        let minDate = new Date(); let maxDate = new Date(); let hasDates = false;
        projects.forEach(p => {
            const dates = [p.d_asmSt, p.d_asmEn, p.d_insSt, p.d_insEn, p.d_shipEn, p.d_setSt, p.d_setEn, p.d_asmEst, p.d_shipEst, p.d_asmEndEst].filter(d => d).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
            dates.forEach(d => { if(!hasDates) { minDate = new Date(d); maxDate = new Date(d); hasDates = true; } if(d < minDate) minDate = new Date(d); if(d > maxDate) maxDate = new Date(d); });
        });
        
        // 🔥 오늘이 무조건 포함되도록 달력 범위를 늘립니다.
        const today = new Date(); today.setHours(0,0,0,0);
        if(today < minDate) minDate = new Date(today);
        if(today > maxDate) maxDate = new Date(today);

        if(!hasDates) { container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold bg-white w-full h-full flex items-center justify-center rounded-xl">표시할 일정 데이터가 없습니다.</div>'; return; }
        
        minDate.setDate(minDate.getDate() - 5); maxDate.setDate(maxDate.getDate() + 10);
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)); const dayWidth = 24; 
        
        const todayStr = window.getLocalDateStr(new Date()); 
        let todayOffset = -1;

        let html = `<div class="relative min-w-max h-full min-h-[500px]" style="width: ${totalDays * dayWidth + 300}px">`;
        
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); d.setDate(d.getDate() + i);
            let dStr = window.getLocalDateStr(d);
            if(dStr === todayStr) todayOffset = i * dayWidth; 
        }

        // 🔴 최상단에 오늘 기준선 그리기 (모든 블럭 위로 뜨게 설정)
        if(todayOffset >= 0) {
            html += `<div class="absolute top-0 w-[2px] bg-rose-500 z-[100] pointer-events-none shadow-sm" style="left: ${300 + todayOffset + (dayWidth/2)}px; height:100%; bottom:0;"><div class="absolute top-10 -translate-x-1/2 bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-md font-bold whitespace-nowrap border border-white">오늘</div></div>`;
        }

        html += `<div class="flex border-b border-slate-200 sticky top-0 bg-white z-30 shadow-sm"><div class="w-[300px] flex-shrink-0 p-3 font-bold text-xs text-slate-700 bg-slate-50 border-r border-slate-200 flex items-center sticky left-0 z-30"><div class="w-[100px] text-indigo-600">PJT 코드</div><div class="w-[200px]">프로젝트명</div></div>`;
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); d.setDate(d.getDate() + i);
            let dStr = window.getLocalDateStr(d);
            let bgClass = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50' : 'bg-white'; let textClass = d.getDay() === 0 ? 'text-rose-500' : (d.getDay() === 6 ? 'text-blue-500' : 'text-slate-500');
            if (dStr === todayStr) { bgClass = 'bg-rose-50'; textClass = 'text-rose-600 font-black'; }
            html += `<div class="w-[${dayWidth}px] flex-shrink-0 text-center border-r border-slate-100 ${bgClass} flex flex-col justify-center relative">${(d.getDate() === 1 || i === 0) ? `<div class="text-[8px] font-black bg-slate-200 text-slate-600">${d.getMonth()+1}월</div>` : `<div class="text-[8px] font-bold bg-slate-100 text-transparent select-none">-</div>`}<div class="text-[10px] font-bold ${textClass} py-1">${d.getDate()}</div></div>`;
        }
        
        html += `</div><div class="relative w-full h-full min-h-full" style="min-height: 400px;">`;

        projects.forEach(p => {
            const safeNameHtml = String(p.name||'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); const safeCodeStr = p.code || '-';
            html += `<div class="flex border-b border-slate-100 hover:bg-slate-50 relative group cursor-pointer" onclick="window.editProjStatus('${p.id}')"><div class="w-[300px] flex-shrink-0 p-2 text-[11px] font-bold text-slate-700 border-r border-slate-200 bg-white z-10 sticky left-0 flex items-center group-hover:bg-slate-50 transition-colors" title="${safeNameHtml}"><div class="w-[100px] text-indigo-600 truncate font-black pr-1">${safeCodeStr}</div><div class="w-[200px] truncate">${safeNameHtml}</div></div><div class="flex relative" style="width: ${totalDays * dayWidth}px">`;
            for(let i=0; i<totalDays; i++) { let d = new Date(minDate); d.setDate(d.getDate() + i); html += `<div class="w-[${dayWidth}px] flex-shrink-0 border-r border-slate-50 ${(d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50/50' : ''} h-12"></div>`; }
            
            const drawBar = (start, end, colorClass, label, yOffset) => {
                if(!start) return ''; let sD = new Date(start); let eD = end ? new Date(end) : new Date(start);
                if(isNaN(sD.getTime()) || isNaN(eD.getTime())) return '';
                if(sD < minDate) sD = new Date(minDate); if(eD > maxDate) eD = new Date(maxDate); if(sD > eD) eD = new Date(sD);
                let leftOffset = Math.floor((sD - minDate) / (1000 * 60 * 60 * 24)) * dayWidth; let width = Math.ceil((eD - sD) / (1000 * 60 * 60 * 24) + 1) * dayWidth;
                return `<div class="absolute ${yOffset} h-[14px] rounded-sm ${colorClass} text-[8px] flex items-center justify-center font-bold shadow-sm overflow-hidden whitespace-nowrap opacity-90 hover:opacity-100 hover:scale-y-110 transition-all cursor-pointer z-10" style="left: ${leftOffset}px; width: ${width}px;" title="${label}: ${start} ~ ${end||start}"></div>`;
            };
            const drawPoint = (dateStr, colorClass, label, yOffset) => {
                if(!dateStr) return ''; let d = new Date(dateStr); if(isNaN(d.getTime())) return '';
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
        html += `</div></div>`; container.innerHTML = html;
        setTimeout(() => { const scrollContainer = document.getElementById('proj-dash-gantt-container'); if(scrollContainer && todayOffset > 0) scrollContainer.scrollLeft = todayOffset - 200; }, 100);
    } catch(e) { console.error("간트차트 오류:", e); }
};

window.changeCalendarMonth = function(offset) { window.calendarCurrentDate.setMonth(window.calendarCurrentDate.getMonth() + offset); window.renderProjCalendar(); };
window.renderProjCalendar = function() {
    const container = document.getElementById('proj-dash-calendar-content');
    try {
        let displayList = window.currentProjectStatusList || [];
        if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') displayList = displayList.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
        if(window.currentStatusFilter && window.currentStatusFilter !== 'all') { displayList = displayList.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; }); }
        
        const year = window.calendarCurrentDate.getFullYear(); const month = window.calendarCurrentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay(); const lastDate = new Date(year, month + 1, 0).getDate();
        const today = new Date(); const isCurrentMonth = (today.getFullYear() === year && today.getMonth() === month);
        
        let html = `<div class="flex justify-between items-center mb-4"><div class="flex items-center gap-4"><button onclick="window.changeCalendarMonth(-1)" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><i class="fa-solid fa-chevron-left"></i></button><h3 class="text-lg font-black text-indigo-800 w-32 text-center">${year}년 ${month + 1}월</h3><button onclick="window.changeCalendarMonth(1)" class="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><i class="fa-solid fa-chevron-right"></i></button><button onclick="window.calendarCurrentDate = new Date(); window.renderProjCalendar();" class="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg font-bold hover:bg-indigo-100 transition-colors border border-indigo-200">이번 달</button></div><div class="flex gap-2 text-[10px] font-bold"><span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded border border-indigo-200">조립진행</span><span class="bg-rose-100 text-rose-700 px-2 py-1 rounded border border-rose-200">출하예정</span></div></div><div class="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-500 mb-2"><div class="text-rose-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div class="text-blue-500">토</div></div><div class="grid grid-cols-7 gap-1 auto-rows-fr">`;
        
        for(let i=0; i<firstDay; i++) { html += `<div class="min-h-[100px] bg-slate-50 rounded-lg border border-slate-100"></div>`; }
        
        for(let date=1; date<=lastDate; date++) {
            const currentDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(date).padStart(2,'0')}`; let dayEvents = '';
            
            displayList.forEach(p => {
                const safeNameHtml = getSafeString(p.name).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); const safeCodeStr = getSafeString(p.code) || '-';
                let isAsm = false; if(p.d_asmSt && p.d_asmEn) { if(currentDateStr >= p.d_asmSt && currentDateStr <= p.d_asmEn) isAsm = true; } else if(p.d_asmEst && p.d_asmEndEst) { if(currentDateStr >= p.d_asmEst && currentDateStr <= p.d_asmEndEst) isAsm = true; }
                if(isAsm) dayEvents += `<div class="text-[9px] bg-indigo-500 text-white px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm hover:scale-[1.02] transition-transform" onclick="window.editProjStatus('${p.id}')" title="${safeNameHtml}">${safeCodeStr} 조립</div>`;
                if(p.d_shipEn === currentDateStr || (!p.d_shipEn && p.d_shipEst === currentDateStr)) { dayEvents += `<div class="text-[9px] bg-rose-500 text-white px-1.5 py-0.5 rounded mb-0.5 truncate cursor-pointer shadow-sm hover:scale-[1.02] transition-transform" onclick="window.editProjStatus('${p.id}')" title="${safeNameHtml}">${safeCodeStr} 출하</div>`; }
            });
            const isToday = (isCurrentMonth && date === today.getDate());
            const badge = isToday ? `<span class="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center mx-auto shadow-md">${date}</span>` : date;
            html += `<div class="min-h-[100px] bg-white rounded-lg border ${isToday ? 'border-indigo-400 bg-indigo-50/10' : 'border-slate-200'} p-1 hover:bg-slate-50 transition-colors"><div class="text-xs font-bold text-slate-700 mb-1 text-center">${badge}</div><div class="flex flex-col gap-0.5 overflow-hidden">${dayEvents}</div></div>`;
        }
        html += `</div>`; container.innerHTML = html;
    } catch(e) {}
};


// ==========================================================
// 🚨 알림 및 멘션 (Notification & Mention) 로직 (본인 멘션 알림 허용 + 자동 모달 이동)
// ==========================================================

window.handleMention = function(inputEl) {
    const val = inputEl.value;
    const cursorPos = inputEl.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtSignIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtSignIndex !== -1 && !textBeforeCursor.slice(lastAtSignIndex).includes(' ')) {
        const query = textBeforeCursor.slice(lastAtSignIndex + 1); 
        
        let wrapper = document.getElementById('mention-autocomplete-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'mention-autocomplete-wrapper';
            wrapper.className = 'absolute z-[9999] w-56 bg-white border border-indigo-200 rounded-xl shadow-xl max-h-48 overflow-y-auto mb-1 bottom-full left-0'; 
        }

        if (wrapper.parentNode !== inputEl.parentNode) {
            inputEl.parentNode.style.position = 'relative';
            inputEl.parentNode.appendChild(wrapper);
        }

        const matches = query ? (window.allSystemUsers || []).filter(u => window.matchString(query, u.name)) : (window.allSystemUsers || []);
        
        if (matches.length === 0) {
            wrapper.classList.add('hidden');
            return;
        }

        wrapper.classList.remove('hidden');
        wrapper.innerHTML = matches.map(u => `
            <div class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm border-b border-slate-50 last:border-0 flex items-center gap-2"
                 onclick="window.insertMention('${inputEl.id}', '${u.name}', ${lastAtSignIndex}, ${cursorPos})">
                <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">${u.name.charAt(0)}</div>
                <div class="flex flex-col leading-tight"><span class="font-bold text-slate-700 text-xs">${u.name}</span><span class="text-[9px] text-slate-400">${u.team||'소속없음'}</span></div>
            </div>
        `).join('');
        
        document.addEventListener('click', function hideMentionAuto(e) { 
            if(e.target !== inputEl && wrapper) { 
                wrapper.classList.add('hidden'); document.removeEventListener('click', hideMentionAuto); 
            } 
        });
    } else {
        const wrapper = document.getElementById('mention-autocomplete-wrapper');
        if(wrapper) wrapper.classList.add('hidden');
    }
};

window.insertMention = function(inputId, name, startIndex, endIndex) {
    const inputEl = document.getElementById(inputId);
    const val = inputEl.value;
    const newVal = val.slice(0, startIndex) + '@' + name + ' ' + val.slice(endIndex);
    inputEl.value = newVal;
    const wrapper = document.getElementById('mention-autocomplete-wrapper');
    if(wrapper) wrapper.classList.add('hidden');
    inputEl.focus();
};

window.processMentions = async function(content, projectId, typeStr) {
    if(!content || !window.allSystemUsers || !window.currentUser) return;
    const mentionRegex = /@([가-힣a-zA-Z0-9_]+)/g;
    const mentions = [...new Set([...content.matchAll(mentionRegex)].map(m => m[1]))];
    
    if(mentions.length > 0) {
        const proj = window.currentProjectStatusList.find(p => p.id === projectId);
        const projName = proj ? proj.name : '프로젝트';
        const batch = writeBatch(db);
        let count = 0;
        
        for(const name of mentions) {
            const user = window.allSystemUsers.find(u => u.name === name);
            if(user) { // 본인 멘션도 알림 발송되도록 제한 해제!
                const newNotifRef = doc(collection(db, "notifications"));
                batch.set(newNotifRef, {
                    recipientUid: user.uid,
                    senderName: window.userProfile.name,
                    message: `[${projName}] ${typeStr}에 멘션을 남겼습니다: "${content.substring(0, 20)}..."`,
                    projectId: projectId || '',
                    type: typeStr,
                    isRead: false,
                    createdAt: Date.now()
                });
                count++;
            }
        }
        if(count > 0) { 
            try { 
                await batch.commit(); 
                window.showToast(`🔔 ${count}건의 멘션 알림 발송 완료!`);
            } catch(e) { console.error("알림 발송 실패", e); } 
        }
    }
};

window.loadNotifications = function() {
    if(!window.currentUser) return;
    const q = query(collection(db, "notifications"), where("recipientUid", "==", window.currentUser.uid));
    onSnapshot(q, (snapshot) => {
        let notifs = []; let unreadCount = 0;
        snapshot.forEach(doc => { const d = doc.data(); notifs.push({id: doc.id, ...d}); if(!d.isRead) unreadCount++; });
        notifs.sort((a,b) => b.createdAt - a.createdAt);
        window.renderNotifications(notifs, unreadCount);
    });
};

window.toggleNotifications = function(e) {
    e.stopPropagation();
    const dd = document.getElementById('notification-dropdown');
    dd.classList.toggle('hidden');
    if(!dd.classList.contains('hidden')) {
        document.addEventListener('click', function hideDD() {
            dd.classList.add('hidden'); document.removeEventListener('click', hideDD);
        }, {once: true});
    }
};

window.renderNotifications = function(notifs, unreadCount) {
    const badge = document.getElementById('notification-badge');
    const countEl = document.getElementById('notification-count');
    const listEl = document.getElementById('notification-list');
    
    if(unreadCount > 0) { badge.classList.remove('hidden'); countEl.innerText = unreadCount > 99 ? '99+' : unreadCount; } 
    else { badge.classList.add('hidden'); }

    if(notifs.length === 0) { listEl.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-bold">알림이 없습니다.</div>'; return; }

    listEl.innerHTML = notifs.map(n => `
        <div class="px-4 py-3 hover:bg-indigo-50/50 cursor-pointer transition-colors border-b border-slate-50 last:border-0 ${n.isRead ? 'opacity-50' : 'bg-white'}" onclick="window.readAndNavigateNotification('${n.id}', '${n.projectId}', '${n.type}')">
            <div class="flex items-center gap-2 mb-1">
                <span class="w-1.5 h-1.5 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-rose-500'}"></span>
                <p class="text-xs font-bold text-slate-700">${n.senderName} 님의 멘션</p>
            </div>
            <p class="text-[10px] text-slate-500 pl-3">${n.message}</p>
            <p class="text-[9px] text-slate-400 mt-1 pl-3">${new Date(n.createdAt).toLocaleString()}</p>
        </div>
    `).join('');
};

// 🌟 알림 클릭 시 모달창 다이렉트 이동 로직 🌟
window.readAndNavigateNotification = async function(notifId, projectId, type) {
    try {
        await setDoc(doc(db, "notifications", notifId), { isRead: true }, { merge: true });
        window.openApp('project-status', 'PJT 현황판'); // 현황판으로 이동
        
        // 0.5초 뒤 해당 멘션이 있는 모달창으로 자동 이동
        setTimeout(() => { 
            if(type === '코멘트') window.openCommentModal(projectId);
            else if(type === '이슈') window.openIssueModal(projectId);
            else if(type === '생산일지') window.openDailyLogModal(projectId);
            else if(type === '투입MD기록') window.openMdLogModal(projectId);
            else window.editProjStatus(projectId);
        }, 500); 
    } catch(e) {}
};

window.markAllNotificationsRead = async function() {
    if(!window.currentUser) return;
    try {
        const q = query(collection(db, "notifications"), where("recipientUid", "==", window.currentUser.uid), where("isRead", "==", false));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => { batch.update(d.ref, { isRead: true }); });
        await batch.commit();
    } catch(e) {}
};


// ==========================================================
// 🚨 기타 모달창 및 UI 로직들 (과거 데이터 불러오기 복구 완료) 🚨
// ==========================================================

window.openTeamModal = () => { const sel=document.getElementById('new-team-name'); if(sel&&window.allSystemUsers){ sel.innerHTML='<option value="">시스템 사용자 선택</option>'; window.allSystemUsers.filter(u=>u.role!=='pending').forEach(u=>{ sel.innerHTML+=`<option value="${u.name}">${u.name} (${u.team||'소속없음'})</option>`; }); } document.getElementById('team-modal').classList.remove('hidden'); document.getElementById('team-modal').classList.add('flex'); window.renderTeamMembers(); };
window.closeTeamModal = () => { document.getElementById('team-modal').classList.add('hidden'); document.getElementById('team-modal').classList.remove('flex'); };
window.renderTeamMembers = () => { const tb=document.getElementById('team-list-tbody'); if(!tb)return; document.getElementById('team-modal-count').innerText=`총 ${window.teamMembers.length}명`; if(window.teamMembers.length===0){ tb.innerHTML='<tr><td colspan="3" class="text-center p-6 text-slate-500 font-bold">등록된 팀원이 없습니다.</td></tr>'; return; } tb.innerHTML=window.teamMembers.map(t=>`<tr class="hover:bg-slate-50 transition-colors"><td class="p-3 text-center"><span class="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-[10px] font-bold border border-indigo-100">${t.part}</span></td><td class="p-3 font-bold text-slate-700">${t.name}</td><td class="p-3 text-center"><button onclick="window.deleteTeamMember('${t.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td></tr>`).join(''); };
window.addTeamMember = async () => { const n=document.getElementById('new-team-name').value.trim(); const p=document.getElementById('new-team-part').value; if(!n) return window.showToast("사용자를 선택하세요.","error"); if(window.teamMembers.find(t=>t.name===n)) return window.showToast("이미 등록된 팀원입니다.","error"); try { await addDoc(collection(db,"team_members"),{name:n, part:p, createdAt:Date.now()}); document.getElementById('new-team-name').value=''; window.showToast("팀원이 추가되었습니다."); } catch(e) { window.showToast("오류 발생","error"); } };
window.deleteTeamMember = async (id) => { if(!confirm("이 팀원을 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db,"team_members",id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("오류 발생","error"); } };

window.loadProjectCodeMaster = function() {
    if(masterCodeSnapshotUnsubscribe) masterCodeSnapshotUnsubscribe();
    masterCodeSnapshotUnsubscribe = onSnapshot(collection(db, "project_codes"), (snapshot) => {
        window.pjtCodeMasterList = []; snapshot.forEach(doc => { window.pjtCodeMasterList.push({ id: doc.id, ...doc.data() }); }); window.pjtCodeMasterList.sort((a,b) => b.createdAt - a.createdAt);
        if(!document.getElementById('proj-code-master-modal').classList.contains('hidden')) window.renderProjectCodeMaster();
    });
};
window.renderProjectCodeMaster = function() { const tbody = document.getElementById('pjt-code-tbody'); if(!tbody) return; if(window.pjtCodeMasterList.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-slate-500 font-bold">등록된 마스터 코드가 없습니다.</td></tr>'; return; } tbody.innerHTML = window.pjtCodeMasterList.map(p => `<tr class="hover:bg-indigo-50/50 transition-colors"><td class="p-3 font-bold text-indigo-600">${p.code}</td><td class="p-3 font-bold text-slate-700">${p.name}</td><td class="p-3 text-slate-600">${p.company||'-'}</td><td class="p-3 text-center"><button onclick="window.deleteProjectCode('${p.id}')" class="text-slate-400 hover:bg-rose-50 hover:text-rose-500 p-2 rounded-lg transition-colors"><i class="fa-solid fa-trash-can"></i></button></td></tr>`).join(''); };
window.openProjCodeMasterModal = function() { document.getElementById('proj-code-master-modal').classList.remove('hidden'); document.getElementById('proj-code-master-modal').classList.add('flex'); window.renderProjectCodeMaster(); };
window.closeProjCodeMasterModal = function() { document.getElementById('proj-code-master-modal').classList.add('hidden'); document.getElementById('proj-code-master-modal').classList.remove('flex'); };
window.addProjectCode = async function() { const code = document.getElementById('new-pjt-code').value.trim(); const name = document.getElementById('new-pjt-name').value.trim(); const company = document.getElementById('new-pjt-company').value.trim(); if(!code || !name) return window.showToast("코드와 프로젝트명을 입력하세요.", "error"); try { await addDoc(collection(db, "project_codes"), { code, name, company, createdAt: Date.now() }); window.showToast("등록 완료"); document.getElementById('new-pjt-code').value = ''; document.getElementById('new-pjt-name').value = ''; document.getElementById('new-pjt-company').value = ''; } catch(e) { window.showToast("등록 실패", "error"); } };
window.deleteProjectCode = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_codes", id)); window.showToast("삭제 완료"); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.toggleBulkPjtInput = function() { const el = document.getElementById('bulk-pjt-section'); if(el) el.classList.toggle('hidden'); };
window.bulkAddProjectCodes = async function() { const text = document.getElementById('bulk-pjt-input').value.trim(); if(!text) return window.showToast("데이터를 입력하세요.", "error"); const rows = text.split('\n'); const batch = writeBatch(db); let count = 0; rows.forEach(row => { const cols = row.split('\t'); if(cols.length >= 1 && cols[0].trim() !== '') { batch.set(doc(collection(db, "project_codes")), { code: cols[0].trim(), name: cols[1] ? cols[1].trim() : '', company: cols[2] ? cols[2].trim() : '', createdAt: Date.now() }); count++; } }); if(count > 0) { await batch.commit(); window.showToast(`${count}건 일괄 등록 완료`); document.getElementById('bulk-pjt-input').value = ''; window.toggleBulkPjtInput(); } };
window.deleteAllProjectCodes = async function() { if(!confirm("⚠️ 경고: 모든 PJT 마스터 코드를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return; const snap = await getDocs(collection(db, "project_codes")); const batch = writeBatch(db); snap.forEach(doc => batch.delete(doc.ref)); await batch.commit(); window.showToast("전체 삭제 완료"); };
window.showAutocomplete = function(inputEl, targetId1, targetId2, isName) { const val = inputEl.value.trim().toLowerCase(); let wrapper = document.getElementById('autocomplete-wrapper'); if(!wrapper) { wrapper = document.createElement('div'); wrapper.id = 'autocomplete-wrapper'; wrapper.className = 'absolute z-50 w-full bg-white border border-indigo-200 rounded-lg shadow-xl max-h-60 overflow-y-auto mt-1'; inputEl.parentNode.position = 'relative'; inputEl.parentNode.appendChild(wrapper); } if(!val) { wrapper.innerHTML = ''; wrapper.classList.add('hidden'); return; } const matches = window.pjtCodeMasterList.filter(p => window.matchString(val, p.code) || window.matchString(val, p.name)); if(matches.length === 0) { wrapper.innerHTML = ''; wrapper.classList.add('hidden'); return; } wrapper.classList.remove('hidden'); wrapper.innerHTML = matches.map(p => `<div class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs border-b border-slate-50 last:border-0" onclick="document.getElementById('${inputEl.id}').value='${isName ? String(p.name).replace(/'/g, "\\'") : String(p.code).replace(/'/g, "\\'")}'; document.getElementById('${targetId1}').value='${isName ? String(p.code).replace(/'/g, "\\'") : String(p.name).replace(/'/g, "\\'")}'; document.getElementById('${targetId2}').value='${String(p.company||'').replace(/'/g, "\\'")}'; document.getElementById('autocomplete-wrapper').classList.add('hidden');"><span class="font-bold text-indigo-600">${p.code}</span> - ${p.name} <span class="text-[10px] text-slate-400">(${p.company||''})</span></div>`).join(''); document.addEventListener('click', function hideAuto(e) { if(e.target !== inputEl && wrapper) { wrapper.classList.add('hidden'); document.removeEventListener('click', hideAuto); } }); };

window.resizeAndConvertToBase64 = function(file, callback) { const reader = new FileReader(); reader.onload = function(e) { const img = new Image(); img.onload = function() { try { const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; const MAX = 800; if(width > height && width > MAX) { height *= MAX / width; width = MAX; } else if(height > MAX) { width *= MAX / height; height = MAX; } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); callback(canvas.toDataURL('image/jpeg', 0.7)); } catch(err) { callback(e.target.result); } }; img.onerror = function() { callback(null); }; img.src = e.target.result; }; reader.onerror = function() { callback(null); }; reader.readAsDataURL(file); };

// 생산일지 (Daily Log)
window.openDailyLogModal = function(projectId) { const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj) return; document.getElementById('log-req-id').value = projectId; document.getElementById('log-project-title').innerText = proj.name || ''; document.getElementById('log-project-progress').value = proj.progress || 0; document.getElementById('log-project-purchase-rate').value = proj.purchaseRate || 0; window.resetDailyLogForm(); document.getElementById('daily-log-modal').classList.remove('hidden'); document.getElementById('daily-log-modal').classList.add('flex'); window.loadDailyLogs(projectId); };
window.loadDailyLogs = function(projectId) { if (currentLogUnsubscribe) currentLogUnsubscribe(); currentLogUnsubscribe = onSnapshot(query(collection(db, "daily_logs"), where("projectId", "==", projectId)), (snapshot) => { window.currentDailyLogs = []; snapshot.forEach(doc => window.currentDailyLogs.push({ id: doc.id, ...doc.data() })); window.currentDailyLogs.sort((a, b) => { const dateA = a.date || ''; const dateB = b.date || ''; if (dateA !== dateB) return dateB.localeCompare(dateA); return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); }); window.renderDailyLogs(window.currentDailyLogs); }); };
window.renderDailyLogs = function(logs) { 
    const list = document.getElementById('daily-log-list'); 
    if (logs.length === 0) { list.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; return; } 
    list.innerHTML = logs.map(log => { 
        const safeContent = window.formatMentions ? window.formatMentions(String(log.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')) : String(log.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
        const imgHtml = log.imageUrl ? `<div class="mt-3 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[300px]"><img src="${log.imageUrl}" class="w-full h-auto cursor-pointer" onclick="window.open('${log.imageUrl}')"></div>` : ''; 
        return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow"><div class="flex justify-between items-center"><div class="flex items-center gap-3"><span class="font-bold text-sky-600 text-xs flex items-center gap-1"><i class="fa-regular fa-calendar text-sky-400"></i> ${log.date}</span><span class="font-black text-slate-700 text-sm">${log.authorName}</span></div><div class="flex gap-2">${(log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button onclick="window.editDailyLog('${log.id}')" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div><div class="text-slate-700 font-medium text-[13px] pl-1 mt-2 break-words leading-relaxed">${safeContent}</div>${imgHtml}</div>`; 
    }).join(''); 
};
window.saveDailyLogItem = async function() { 
    const projectId = document.getElementById('log-req-id').value; const logId = document.getElementById('editing-log-id').value; const date = document.getElementById('new-log-date').value; const content = document.getElementById('new-log-text').value.trim(); const fileInput = document.getElementById('new-log-image'); const progressVal = parseInt(document.getElementById('log-project-progress').value) || 0; const purchaseRateVal = parseInt(document.getElementById('log-project-purchase-rate').value) || 0; 
    if(!date || (!content && fileInput.files.length === 0)) return window.showToast("날짜와 내용을 입력하거나 사진을 첨부하세요.", "error"); 
    document.getElementById('btn-log-save').innerHTML = '저장중..'; document.getElementById('btn-log-save').disabled = true; 
    const saveData = async (base64Img) => { 
        try { 
            const payload = { date, content, updatedAt: Date.now() }; if(base64Img) payload.imageUrl = base64Img; 
            if (logId) { await setDoc(doc(db, "daily_logs", logId), payload, { merge: true }); window.showToast("일지가 수정되었습니다."); } 
            else { 
                payload.projectId = projectId; payload.authorUid = window.currentUser.uid; payload.authorName = window.userProfile.name; payload.createdAt = Date.now(); 
                await addDoc(collection(db, "daily_logs"), payload); window.showToast("일지가 등록되었습니다."); 
            } 
            await setDoc(doc(db, "projects_status", projectId), { progress: progressVal, purchaseRate: purchaseRateVal }, { merge: true }); 
            if(window.processMentions) await window.processMentions(content, projectId, "생산일지"); 
            window.resetDailyLogForm(); 
        } catch(e) { window.showToast("저장 중 오류 발생", "error"); console.error(e); } finally { document.getElementById('btn-log-save').innerHTML = '등록'; document.getElementById('btn-log-save').disabled = false; } 
    }; 
    if(fileInput.files.length > 0) { window.resizeAndConvertToBase64(fileInput.files[0], (base64) => { saveData(base64); }); } else { saveData(null); } 
};
window.editDailyLog = function(id) { const log = window.currentDailyLogs.find(l => l.id === id); if(!log) return; document.getElementById('editing-log-id').value = id; document.getElementById('new-log-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-log-text').value = log.content || ''; document.getElementById('btn-log-save').innerText = '수정'; document.getElementById('btn-log-cancel').classList.remove('hidden'); document.getElementById('new-log-text').focus(); };
window.deleteDailyLog = async function(id) { if(!confirm("이 일지를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "daily_logs", id)); window.showToast("삭제되었습니다."); window.resetDailyLogForm(); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.closeDailyLogModal = function() { document.getElementById('daily-log-modal').classList.add('hidden'); document.getElementById('daily-log-modal').classList.remove('flex'); if (currentLogUnsubscribe) { currentLogUnsubscribe(); currentLogUnsubscribe = null; } };
window.resetDailyLogForm = function() { document.getElementById('editing-log-id').value = ''; document.getElementById('new-log-date').value = window.getLocalDateStr(new Date()); document.getElementById('new-log-text').value = ''; document.getElementById('new-log-image').value = ''; document.getElementById('btn-log-save').innerText = '등록'; document.getElementById('btn-log-cancel').classList.add('hidden'); };

// 코멘트 (Comment)
window.openCommentModal = function(projectId) { const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj) return; document.getElementById('cmt-req-id').value = projectId; window.cancelCommentAction(); document.getElementById('comment-modal').classList.remove('hidden'); document.getElementById('comment-modal').classList.add('flex'); window.loadComments(projectId); };
window.loadComments = function(projectId) { if (currentCommentUnsubscribe) currentCommentUnsubscribe(); currentCommentUnsubscribe = onSnapshot(query(collection(db, "project_comments"), where("projectId", "==", projectId)), (snapshot) => { window.currentComments = []; snapshot.forEach(doc => window.currentComments.push({ id: doc.id, ...doc.data() })); const topLevel = window.currentComments.filter(c => !c.parentId).sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); const replies = window.currentComments.filter(c => c.parentId).sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); topLevel.forEach(c => { c.replies = replies.filter(r => r.parentId === c.id); }); window.renderComments(topLevel); }); };
window.renderComments = function(topLevelComments) { 
    const list = document.getElementById('comment-list'); 
    if (topLevelComments.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; return; } 
    list.innerHTML = topLevelComments.map(c => { 
        const safeContent = window.formatMentions ? window.formatMentions(String(c.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')) : String(c.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
        const cImgHtml = c.imageUrl ? `<div class="mt-3 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[300px]"><img src="${c.imageUrl}" class="w-full h-auto cursor-pointer" onclick="window.open('${c.imageUrl}')"></div>` : ''; 
        let repliesHtml = ''; if(c.replies && c.replies.length > 0) { repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; c.replies.forEach(r => { const safeReplyContent = window.formatMentions ? window.formatMentions(String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')) : String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); const rImgHtml = r.imageUrl ? `<div class="mt-2 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[200px]"><img src="${r.imageUrl}" class="w-full h-auto cursor-pointer" onclick="window.open('${r.imageUrl}')"></div>` : ''; repliesHtml += `<div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-sm">${r.authorName}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(r.createdAt)))}</span></div><div class="flex gap-2">${(r.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button onclick="window.editComment('${r.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${r.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div><div class="text-slate-700 text-[13px] font-medium pl-6 break-words">${safeReplyContent}</div>${rImgHtml}</div>`; }); repliesHtml += '</div>'; } return `<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-black text-slate-800 text-[15px]">${c.authorName}</span><span class="text-xs font-medium text-slate-400">${window.getDateTimeStr(new Date(getSafeMillis(c.createdAt)))}</span></div><div class="flex gap-2"><button onclick="window.setReplyTo('${c.id}', '${c.authorName}')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-3 py-1 rounded-lg font-bold transition-colors shadow-sm">답글달기</button>${(c.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button onclick="window.editComment('${c.id}')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 mb-2 break-words leading-relaxed">${safeContent}</div>${cImgHtml}${repliesHtml}</div>`; 
    }).join(''); 
};
window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value; const content = document.getElementById('new-cmt-text').value.trim(); const parentId = document.getElementById('reply-to-id').value || null; const editId = document.getElementById('editing-cmt-id').value; const fileInput = document.getElementById('new-cmt-image'); 
    if(!content && fileInput.files.length === 0) return window.showToast("코멘트 내용이나 사진을 첨부하세요.", "error"); 
    document.getElementById('btn-cmt-save').innerHTML = '저장중..'; document.getElementById('btn-cmt-save').disabled = true; 
    const saveData = async (base64Img) => { 
        try { 
            const payload = { content, updatedAt: Date.now() }; if(base64Img) payload.imageUrl = base64Img; 
            if (editId) { await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); window.showToast("코멘트가 수정되었습니다."); } 
            else { 
                payload.projectId = projectId; payload.parentId = parentId; payload.authorUid = window.currentUser.uid; payload.authorName = window.userProfile.name; payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); window.showToast("코멘트가 등록되었습니다."); 
            } 
            if(window.processMentions) await window.processMentions(content, projectId, "코멘트");
            window.cancelCommentAction(); 
        } catch(e) { window.showToast("저장 중 오류 발생", "error"); } finally { document.getElementById('btn-cmt-save').innerHTML = '작성'; document.getElementById('btn-cmt-save').disabled = false; } 
    }; 
    if(fileInput.files.length > 0) { window.resizeAndConvertToBase64(fileInput.files[0], (base64) => { saveData(base64); }); } else { saveData(null); } 
};
window.editComment = function(id) { const comment = window.currentComments.find(c => c.id === id); if(!comment) return; window.cancelCommentAction(); document.getElementById('editing-cmt-id').value = id; document.getElementById('new-cmt-text').value = comment.content || ''; document.getElementById('btn-cmt-save').innerText = '수정'; document.getElementById('reply-indicator-name').innerHTML = `<i class="fa-solid fa-pen mr-1"></i> 코멘트 내용 수정 중`; document.getElementById('reply-indicator').classList.remove('hidden'); document.getElementById('new-cmt-text').focus(); };
window.setReplyTo = function(commentId, authorName) { window.cancelCommentAction(); document.getElementById('reply-to-id').value = commentId; document.getElementById('reply-indicator-name').innerHTML = `<i class="fa-solid fa-reply rotate-180 scale-y-[-1] mr-1"></i> <b class="text-indigo-800">${authorName}</b> 님에게 답글 작성 중`; document.getElementById('reply-indicator').classList.remove('hidden'); document.getElementById('new-cmt-text').focus(); };
window.cancelCommentAction = function() { document.getElementById('reply-to-id').value = ''; document.getElementById('editing-cmt-id').value = ''; document.getElementById('new-cmt-text').value = ''; document.getElementById('new-cmt-image').value = ''; document.getElementById('btn-cmt-save').innerText = '작성'; document.getElementById('reply-indicator').classList.add('hidden'); };
window.closeCommentModal = function() { document.getElementById('comment-modal').classList.add('hidden'); document.getElementById('comment-modal').classList.remove('flex'); if (currentCommentUnsubscribe) { currentCommentUnsubscribe(); currentCommentUnsubscribe = null; } };
window.deleteComment = async function(id) { if(!confirm("이 코멘트를 삭제하시겠습니까? (상위 코멘트 삭제 시 달린 답글도 함께 삭제됩니다)")) return; try { await deleteDoc(doc(db, "project_comments", id)); const q = query(collection(db, "project_comments"), where("parentId", "==", id)); const snapshot = await getDocs(q); if(!snapshot.empty) { const batch = writeBatch(db); snapshot.forEach(d => batch.delete(d.ref)); await batch.commit(); } window.showToast("삭제되었습니다."); window.cancelCommentAction(); } catch(e) { window.showToast("삭제 실패", "error"); } };

// 이슈 (Issue)
window.openIssueModal = function(projectId) { const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj) return; document.getElementById('issue-req-id').value = projectId; document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; document.getElementById('btn-issue-save').innerText = '등록'; document.getElementById('issue-modal').classList.remove('hidden'); document.getElementById('issue-modal').classList.add('flex'); window.loadIssues(projectId); };
window.loadIssues = function(projectId) { if (currentIssueUnsubscribe) currentIssueUnsubscribe(); currentIssueUnsubscribe = onSnapshot(query(collection(db, "project_issues"), where("projectId", "==", projectId)), (snapshot) => { window.currentIssues = []; let unresolvedCount = 0; snapshot.forEach(doc => { const data = doc.data(); window.currentIssues.push({ id: doc.id, ...data }); if(!data.isResolved) unresolvedCount++; }); window.currentIssues.sort((a,b) => getSafeMillis(a.createdAt) - getSafeMillis(b.createdAt)); document.getElementById('issue-total-count').innerText = `미해결 ${unresolvedCount}건`; window.renderIssues(window.currentIssues); }); };
window.renderIssues = function(issues) { 
    const list = document.getElementById('issue-list'); 
    if (issues.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; return; } 
    list.innerHTML = issues.map(iss => { 
        const safeText = window.formatMentions ? window.formatMentions(String(iss.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')) : String(iss.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
        return `<div class="bg-white p-4 rounded-xl border ${iss.isResolved ? 'border-slate-200 bg-slate-50' : 'border-rose-200 shadow-sm'} flex items-start gap-3 transition-all"><div class="mt-0.5"><input type="checkbox" ${iss.isResolved ? 'checked' : ''} onchange="window.toggleIssueStatus('${iss.id}', this.checked)" class="w-5 h-5 text-rose-500 rounded border-gray-300 cursor-pointer accent-rose-500 shadow-sm"></div><div class="flex-1 flex flex-col gap-1"><div class="flex justify-between items-center"><span class="font-bold text-sm ${iss.isResolved ? 'text-slate-400' : 'text-rose-600'}">${iss.authorName}</span><div class="flex gap-2">${(iss.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button onclick="window.editIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div><div class="text-[13px] font-medium mt-1 leading-relaxed ${iss.isResolved ? 'text-slate-400 line-through' : 'text-slate-700'} break-words">${safeText}</div></div></div>`; 
    }).join(''); 
};

window.saveIssueItem = async function() { 
    const projectId = document.getElementById('issue-req-id').value; const editId = document.getElementById('editing-issue-id').value; const content = document.getElementById('new-issue-text').value.trim(); 
    if(!content) return window.showToast("이슈 내용을 입력하세요.", "error"); 
    try { 
        if (editId) { await setDoc(doc(db, "project_issues", editId), { content, updatedAt: Date.now() }, { merge: true }); window.showToast("이슈가 수정되었습니다."); } 
        else { await addDoc(collection(db, "project_issues"), { projectId, content, isResolved: false, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); window.showToast("이슈가 등록되었습니다."); } 
        if(window.processMentions) await window.processMentions(content, projectId, "이슈");
        document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; document.getElementById('btn-issue-save').innerText = '등록'; 
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); } 
};
window.toggleIssueStatus = async function(id, isResolved) { try { await setDoc(doc(db, "project_issues", id), { isResolved }, { merge: true }); } catch(e) { window.showToast("상태 변경 오류", "error"); } };
window.editIssue = function(id) { const iss = window.currentIssues.find(i => i.id === id); if(!iss) return; document.getElementById('editing-issue-id').value = id; document.getElementById('new-issue-text').value = iss.content || ''; document.getElementById('btn-issue-save').innerText = '수정'; document.getElementById('new-issue-text').focus(); };
window.deleteIssue = async function(id) { if(!confirm("이 이슈를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_issues", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.closeIssueModal = function() { document.getElementById('issue-modal').classList.add('hidden'); document.getElementById('issue-modal').classList.remove('flex'); if (currentIssueUnsubscribe) { currentIssueUnsubscribe(); currentIssueUnsubscribe = null; } };

// 투입 MD (MD Log)
window.openMdLogModal = function(projectId) { const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj) return; document.getElementById('md-req-id').value = projectId; document.getElementById('md-total-badge').innerText = `총 ${proj.currentMd || 0} MD`; window.resetMdLogForm(); document.getElementById('md-log-modal').classList.remove('hidden'); document.getElementById('md-log-modal').classList.add('flex'); window.loadMdLogs(projectId); };
window.loadMdLogs = function(projectId) { if (currentMdLogUnsubscribe) currentMdLogUnsubscribe(); currentMdLogUnsubscribe = onSnapshot(query(collection(db, "project_md_logs"), where("projectId", "==", projectId)), (snapshot) => { window.currentMdLogs = []; let totalMd = 0; snapshot.forEach(doc => { const data = doc.data(); window.currentMdLogs.push({ id: doc.id, ...data }); totalMd += parseFloat(data.md) || 0; }); window.currentMdLogs.sort((a, b) => { const dateA = a.date || ''; const dateB = b.date || ''; if (dateA !== dateB) return dateB.localeCompare(dateA); return getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt); }); const badge = document.getElementById('md-total-badge'); if(badge) badge.innerText = `총 ${totalMd.toFixed(1)} MD`; window.renderMdLogs(window.currentMdLogs); }); };
window.renderMdLogs = function(logs) { 
    const list = document.getElementById('md-log-list'); 
    if (logs.length === 0) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; return; } 
    list.innerHTML = logs.map(log => { 
        const safeDesc = window.formatMentions ? window.formatMentions(String(log.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')) : String(log.desc || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
        return `<tr class="hover:bg-purple-50/30 transition-colors"><td class="p-3 text-center text-slate-500 font-bold">${log.date}</td><td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td><td class="p-3 text-slate-700">${safeDesc || '-'}</td><td class="p-3 text-center text-slate-600 font-bold">${log.authorName}</td><td class="p-3 text-center"><div class="flex justify-center gap-2">${(log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button onclick="window.editMdLog('${log.id}')" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : '-'}</div></td></tr>`; 
    }).join(''); 
};
window.saveMdLogItem = async function() { const projectId = document.getElementById('md-req-id').value; const logId = document.getElementById('editing-md-id').value; const date = document.getElementById('new-md-date').value; const mdVal = document.getElementById('new-md-val').value; const desc = document.getElementById('new-md-desc').value.trim(); if(!date || !mdVal) return window.showToast("날짜와 투입 MD를 입력하세요.", "error"); try { if (logId) { await setDoc(doc(db, "project_md_logs", logId), { date, md: parseFloat(mdVal), desc, updatedAt: Date.now() }, { merge: true }); window.showToast("MD 내역이 수정되었습니다."); } else { await addDoc(collection(db, "project_md_logs"), { projectId, date, md: parseFloat(mdVal), desc, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); window.showToast("MD 내역이 등록되었습니다."); } await window.updateProjectTotalMd(projectId); if(window.processMentions) await window.processMentions(desc, projectId, "투입MD기록"); window.resetMdLogForm(); } catch(e) { window.showToast("저장 중 오류 발생", "error"); } };
window.editMdLog = function(id) { const log = window.currentMdLogs.find(l => l.id === id); if(!log) return; document.getElementById('editing-md-id').value = id; document.getElementById('new-md-date').value = log.date || window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = log.md || ''; document.getElementById('new-md-desc').value = log.desc || ''; document.getElementById('btn-md-save').innerText = '수정'; document.getElementById('btn-md-cancel').classList.remove('hidden'); };
window.deleteMdLog = async function(id, projectId) { if(!confirm("이 MD 내역을 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_md_logs", id)); await window.updateProjectTotalMd(projectId); window.showToast("삭제되었습니다."); window.resetMdLogForm(); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.updateProjectTotalMd = async function(projectId) { const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); let total = 0; snap.forEach(doc => { total += parseFloat(doc.data().md) || 0; }); const projRef = doc(db, "projects_status", projectId); const projSnap = await getDoc(projRef); if(projSnap.exists()) { const outMd = parseFloat(projSnap.data().outMd) || 0; await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); } };
window.closeMdLogModal = function() { document.getElementById('md-log-modal').classList.add('hidden'); document.getElementById('md-log-modal').classList.remove('flex'); if (currentMdLogUnsubscribe) { currentMdLogUnsubscribe(); currentMdLogUnsubscribe = null; } };
window.resetMdLogForm = function() { document.getElementById('editing-md-id').value = ''; document.getElementById('new-md-date').value = window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = ''; document.getElementById('new-md-desc').value = ''; document.getElementById('btn-md-save').innerText = '등록'; document.getElementById('btn-md-cancel').classList.add('hidden'); };

// 문서 링크 (Links)
window.openLinkModal = function(projectId) { const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj) return; document.getElementById('link-req-id').value = projectId; document.getElementById('link-project-title').innerText = proj.name || ''; document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; document.getElementById('link-modal').classList.remove('hidden'); document.getElementById('link-modal').classList.add('flex'); window.renderLinksList(projectId); };
window.renderLinksList = function(projectId) { const proj = window.currentProjectStatusList.find(p => p.id === projectId); const list = document.getElementById('link-list'); if(!proj || !proj.links || proj.links.length === 0) { list.innerHTML = '<li class="p-8 text-center text-slate-400 font-bold text-xs bg-white rounded-xl border border-slate-200 border-dashed">등록된 문서/링크가 없습니다.</li>'; return; } list.innerHTML = proj.links.map((lnk, idx) => `<li class="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"><div class="flex flex-col truncate"><span class="font-extrabold text-slate-700 text-sm mb-1">${lnk.name}</span><a href="${lnk.url}" target="_blank" class="text-[11px] font-bold text-teal-600 hover:text-teal-800 hover:underline truncate flex items-center gap-1"><i class="fa-solid fa-link"></i> ${lnk.url}</a></div><button onclick="window.deleteLinkItem('${projectId}', ${idx})" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 rounded-lg transition-all p-2.5"><i class="fa-solid fa-trash-can"></i></button></li>`).join(''); };
window.closeLinkModal = function() { document.getElementById('link-modal').classList.add('hidden'); document.getElementById('link-modal').classList.remove('flex'); };
window.saveLinkItem = async function() { const projectId = document.getElementById('link-req-id').value; const name = document.getElementById('new-link-name').value.trim() || '참고 링크'; const url = document.getElementById('new-link-url').value.trim(); if(!url) return window.showToast("링크 URL을 입력하세요.", "error"); const proj = window.currentProjectStatusList.find(p => p.id === projectId); let links = proj?.links ? [...proj.links] : []; links.push({ name, url: url.startsWith('http') ? url : 'https://' + url }); try { await setDoc(doc(db, "projects_status", projectId), { links }, { merge: true }); window.showToast("링크가 추가되었습니다."); document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; window.renderLinksList(projectId); } catch(e) { window.showToast("추가 실패", "error"); } };
window.deleteLinkItem = async function(projectId, index) { if(!confirm("이 링크를 삭제하시겠습니까?")) return; const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj || !proj.links) return; let links = [...proj.links]; links.splice(index, 1); try { await setDoc(doc(db, "projects_status", projectId), { links }, { merge: true }); window.showToast("링크가 삭제되었습니다."); window.renderLinksList(projectId); } catch(e) { window.showToast("삭제 실패", "error"); } };
