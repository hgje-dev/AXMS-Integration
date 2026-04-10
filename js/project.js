// js/project.js
import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let projectStatusSnapshotUnsubscribe = null;

// 대시보드 연동 필터 및 캘린더 변수
window.currentStatusFilter = 'all';
window.calendarCurrentDate = new Date();

const getSafeMillis = (val) => { try { if (!val) return 0; if (typeof val.toMillis === 'function') return val.toMillis(); if (typeof val === 'number') return val; if (typeof val === 'string') return new Date(val).getTime() || 0; return 0; } catch(e) { return 0; } };
const getSafeString = (val) => { if (val === null || val === undefined) return ''; return String(val); };

window.filterFromDashboard = function(status) {
    window.currentStatusFilter = status;
    window.openApp('view-project-status', 'PJT 현황판');
    setTimeout(() => { window.renderProjectStatusList(); }, 200);
};

window.loadCounts = function() {
    try {
        onSnapshot(collection(db, "project_comments"), snap => { window.projectCommentCounts = {}; snap.forEach(doc => { let d = doc.data(); if(d.projectId) window.projectCommentCounts[d.projectId] = (window.projectCommentCounts[d.projectId]||0)+1; }); if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status').classList.contains('hidden')) window.renderProjectStatusList(); });
        onSnapshot(collection(db, "project_issues"), snap => { window.projectIssueCounts = {}; snap.forEach(doc => { let d = doc.data(); if(d.projectId && !d.isResolved) window.projectIssueCounts[d.projectId] = (window.projectIssueCounts[d.projectId]||0)+1; }); if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status').classList.contains('hidden')) window.renderProjectStatusList(); });
        onSnapshot(collection(db, "daily_logs"), snap => { window.projectLogCounts = {}; snap.forEach(doc => { let d = doc.data(); if(d.projectId) window.projectLogCounts[d.projectId] = (window.projectLogCounts[d.projectId]||0)+1; }); if(window.currentProjDashView === 'list' && !document.getElementById('view-project-status').classList.contains('hidden')) window.renderProjectStatusList(); });
    } catch(e) {}
};

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; window.currentCategoryFilter = 'all'; const catSelect = document.getElementById('filter-category-select'); if(catSelect) catSelect.value = 'all';
    document.getElementById('btn-part-mfg').className = part === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    document.getElementById('btn-part-opt').className = part === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    window.loadProjectStatusData();
};

window.filterByCategory = function(category) { 
    window.currentCategoryFilter = category; 
    if(window.currentProjDashView === 'gantt') window.renderProjGantt(); else if(window.currentProjDashView === 'calendar') window.renderProjCalendar(); else window.renderProjectStatusList();
};

window.searchProjectBoard = function(keyword) {
    const k = getSafeString(keyword).toLowerCase(); document.querySelectorAll('#proj-dash-tbody tr').forEach(tr => { const text = tr.innerText.toLowerCase(); tr.style.display = (text.includes(k) || window.matchString(k, text)) ? '' : 'none'; });
};

window.updateMiniDashboard = function() {
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
    if(elUpcoming7) { elUpcoming7.innerHTML = upcomingCodes7.length === 0 ? `<span class="text-[10px] text-rose-400 font-bold">임박한 프로젝트 없음</span>` : upcomingCodes7.map(u => { let dText = u.dDay === 0 ? 'D-Day' : (u.dDay < 0 ? `지연` : `D-${u.dDay}`); let bgClass = u.dDay <= 3 ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200'; return `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 ${bgClass}">${u.code} <span class="opacity-80 text-[8px]">[${dText}]</span></span>`; }).join(''); }
    const elUpcoming14 = document.getElementById('mini-dash-upcoming-14');
    if(elUpcoming14) { elUpcoming14.innerHTML = upcomingCodes14.length === 0 ? `<span class="text-[10px] text-orange-400 font-bold">임박한 프로젝트 없음</span>` : upcomingCodes14.map(u => `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 bg-white text-orange-600 border-orange-200">${u.code} <span class="opacity-80 text-[8px]">[D-${u.dDay}]</span></span>`).join(''); }
};

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    projectStatusSnapshotUnsubscribe = onSnapshot(collection(db, "projects_status"), (snapshot) => {
        window.currentProjectStatusList = []; let lastUpdated = 0; const targetPart = window.currentProjPartTab === '광학' ? '광학' : '제조';
        snapshot.forEach(doc => { 
            const data = doc.data(); const dataPart = getSafeString(data.part).trim() || '제조'; 
            if((targetPart === '광학' && dataPart === '광학') || (targetPart !== '광학' && dataPart !== '광학')) {
                window.currentProjectStatusList.push({ id: doc.id, ...data }); 
            }
            let uTime = getSafeMillis(data.updatedAt); if(uTime > lastUpdated) lastUpdated = uTime;
        });
        window.currentProjectStatusList.sort((a,b) => getSafeMillis(b.createdAt) - getSafeMillis(a.createdAt));
        
        const el = document.getElementById('pjt-last-update');
        if (lastUpdated > 0 && el) { 
            const lDate = new Date(lastUpdated); 
            el.innerText = `${lDate.getFullYear().toString().slice(2)}-${String(lDate.getMonth()+1).padStart(2,'0')}-${String(lDate.getDate()).padStart(2,'0')} ${String(lDate.getHours()).padStart(2,'0')}:${String(lDate.getMinutes()).padStart(2,'0')}`; 
            document.getElementById('pjt-last-update-wrapper')?.classList.remove('hidden');
        }
        
        window.updateMiniDashboard();
        if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
        else if(window.currentProjDashView === 'calendar') window.renderProjCalendar();
        else window.renderProjectStatusList();
    });
};

window.currentMonthFilter = '';
window.filterByMonth = function(monthStr) {
    window.currentMonthFilter = monthStr;
    window.updateMiniDashboard();
    if(window.currentProjDashView === 'gantt') window.renderProjGantt(); 
    else if(window.currentProjDashView === 'calendar') window.renderProjCalendar();
    else window.renderProjectStatusList();
};
window.clearMonthFilter = function() {
    const el = document.getElementById('filter-month-select'); if(el) el.value = '';
    window.filterByMonth('');
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    let displayList = window.currentProjectStatusList || [];
    
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') displayList = displayList.filter(item => getSafeString(item.category) === window.currentCategoryFilter);
    if(window.currentStatusFilter && window.currentStatusFilter !== 'all') displayList = displayList.filter(item => { if (window.currentStatusFilter === 'progress') return item.status === 'progress' || item.status === 'inspecting'; return item.status === window.currentStatusFilter; });
    if(window.currentMonthFilter) {
        displayList = displayList.filter(item => {
            const sEst = item.d_shipEst || ''; const sEn = item.d_shipEn || ''; const aEst = item.d_asmEst || ''; const aEn = item.d_asmEn || '';
            return sEst.startsWith(window.currentMonthFilter) || sEn.startsWith(window.currentMonthFilter) || aEst.startsWith(window.currentMonthFilter) || aEn.startsWith(window.currentMonthFilter);
        });
    }
    
    if(displayList.length === 0) { tbody.innerHTML = `<tr><td colspan="28" class="text-center p-10 text-slate-400 font-bold border-b border-slate-100 bg-white">해당 조건의 프로젝트가 없습니다.</td></tr>`; return; }
    
    const statusMap = { 'pending':'<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">대기/보류</span>', 'progress':'<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-200">진행중(제작)</span>', 'inspecting':'<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded shadow-sm border border-amber-200">진행중(검수)</span>', 'completed':'<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm border border-emerald-200">완료(출하)</span>', 'rejected':'<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded shadow-sm border border-rose-200">보류/불가</span>' };
    
    tbody.innerHTML = displayList.map(item => {
        const fMd = parseFloat(item.finalMd) || ((parseFloat(item.currentMd) || 0) + (parseFloat(item.outMd) || 0));
        const safeNameHtml = String(item.name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        let linksHtml = ''; 
        if(item.links && Array.isArray(item.links) && item.links.length > 0) { 
            linksHtml = item.links.map(lnk => `<button onclick="event.stopPropagation(); window.open('${lnk.url}', '_blank')" title="${getSafeString(lnk.name)}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded shadow-sm transition-colors ml-1"><i class="fa-solid fa-link text-[10px]"></i></button>`).join(''); 
        }
        
        let cCount = window.projectCommentCounts?.[item.id] || 0; 
        let iCount = window.projectIssueCounts?.[item.id] || 0; 
        let lCount = window.projectLogCounts?.[item.id] || 0;
        
        // 🚨 버그 수정: onclick 이벤트에는 오직 item.id 만 안전하게 전달
        return `<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.editProjStatus('${item.id}')">
            <td class="px-2 py-2 text-center bg-white sticky left-0 z-10 border-r border-slate-100" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-300 hover:bg-rose-50 hover:text-rose-500 p-1.5 rounded transition-all"><i class="fa-solid fa-trash-can"></i></button></td>
            <td class="px-2 py-2 text-center">${item.category || ''}</td>
            <td class="px-2 py-2 text-center" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}')" class="${cCount>0?'text-amber-500':'text-slate-300 hover:text-amber-500'} relative transition-colors"><i class="fa-regular fa-comment-dots text-lg"></i> ${cCount > 0 ? `<span class="absolute -top-1 -right-2 bg-amber-100 text-amber-600 text-[9px] font-black px-1 rounded-full shadow-sm">${cCount}</span>` : ''}</button></td>
            <td class="px-2 py-2 text-center" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}')" class="${iCount>0?'text-rose-500':'text-slate-300 hover:text-rose-500'} relative transition-colors"><i class="fa-solid fa-triangle-exclamation text-lg"></i> ${iCount > 0 ? `<span class="absolute -top-1 -right-2 bg-rose-100 text-rose-600 text-[9px] font-black px-1 rounded-full shadow-sm">${iCount}</span>` : ''}</button></td>
            <td class="px-2 py-2 text-center font-bold text-indigo-700">${item.code || ''}</td>
            <td class="px-2 py-2 truncate max-w-[180px] font-bold text-slate-700" title="${safeNameHtml}">${safeNameHtml}</td>
            <td class="px-2 py-2 text-center text-slate-500 truncate max-w-[100px]">${item.company || ''}</td>
            <td class="px-2 py-2 text-center font-black text-emerald-600 text-xs">${item.progress || 0}%</td>
            <td class="px-2 py-2 text-center">${statusMap[item.status] || ''}</td>
            <td class="px-2 py-2 text-center font-bold text-slate-600">${item.manager || ''}</td>
            <td class="px-2 py-2 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}')" class="${lCount>0?'text-sky-500':'text-slate-300 hover:text-sky-500'} relative transition-colors"><i class="fa-solid fa-book text-lg"></i> ${lCount > 0 ? `<span class="absolute -top-1 -right-2 bg-sky-100 text-sky-600 text-[9px] font-black px-1 rounded-full shadow-sm">${lCount}</span>` : ''}</button></td>
            <td class="px-2 py-2 text-center text-sky-600">${item.estMd || 0}</td>
            <td class="px-1 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal('${item.id}')" class="text-purple-600 hover:bg-purple-100 bg-purple-50 font-extrabold w-full h-full py-1 rounded transition-colors shadow-sm border border-purple-100">${item.currentMd || 0}</button></td>
            <td class="px-2 py-2 text-center text-sky-700 font-extrabold">${fMd.toFixed(1)}</td>
            <td class="px-2 py-2 text-center text-amber-600">${item.totPers !== undefined ? item.totPers : ''}</td>
            <td class="px-2 py-2 text-center text-amber-600">${item.outPers !== undefined ? item.outPers : ''}</td>
            <td class="px-2 py-2 text-center text-amber-600">${item.outMd !== undefined ? item.outMd : ''}</td>
            <td class="px-2 py-2 text-center bg-rose-50/50 text-rose-600">${item.d_shipEst || ''}</td>
            <td class="px-2 py-2 text-center bg-indigo-50/50">${item.d_asmEst || ''}</td>
            <td class="px-2 py-2 text-center bg-indigo-50/50">${item.d_asmEndEst || ''}</td>
            <td class="px-2 py-2 text-center text-indigo-700 font-bold">${item.d_asmSt || ''}</td>
            <td class="px-2 py-2 text-center text-indigo-700 font-bold">${item.d_asmEn || ''}</td>
            <td class="px-2 py-2 text-center">${item.d_insSt || ''}</td>
            <td class="px-2 py-2 text-center">${item.d_insEn || ''}</td>
            <td class="px-2 py-2 text-center bg-rose-50 text-rose-700 font-bold border-x border-rose-100 shadow-inner">${item.d_shipEn || ''}</td>
            <td class="px-2 py-2 text-center">${item.d_setSt || ''}</td>
            <td class="px-2 py-2 text-center">${item.d_setEn || ''}</td>
            <td class="px-2 py-2 text-center border-l border-slate-100" onclick="event.stopPropagation()"><div class="flex items-center justify-center flex-wrap"><button onclick="window.openLinkModal('${item.id}')" class="text-slate-300 hover:text-teal-500 hover:bg-teal-50 transition-colors px-1.5 py-1 rounded"><i class="fa-solid fa-link text-sm"></i></button>${linksHtml}</div></td>
        </tr>`;
    }).join('');
};

window.openProjStatusWriteModal = function() {
    document.getElementById('ps-id').value = ''; document.getElementById('ps-code').value = ''; document.getElementById('ps-name').value = ''; document.getElementById('ps-company').value = ''; document.getElementById('ps-part').value = window.currentProjPartTab || '제조'; document.getElementById('ps-category').value = ''; document.getElementById('ps-status').value = 'pending'; document.getElementById('ps-progress-pct').value = '0';
    const mHtml = '<option value="">선택</option>' + window.teamMembers.map(t => `<option value="${t.name}">${t.name} (${t.part})</option>`).join('');
    const managerSelect = document.getElementById('ps-manager'); if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); if(memberSelect) memberSelect.innerHTML = mHtml;

    ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en', 'ps-d-asm-end-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-set-st', 'ps-d-set-en'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};

window.closeProjStatusWriteModal = function() { document.getElementById('proj-status-write-modal').classList.add('hidden'); document.getElementById('proj-status-write-modal').classList.remove('flex'); };

window.editProjStatus = function(id) {
    const item = window.currentProjectStatusList.find(p => p.id === id); if(!item) return;
    const mHtml = '<option value="">선택</option>' + window.teamMembers.map(t => `<option value="${t.name}">${t.name} (${t.part})</option>`).join('');
    const managerSelect = document.getElementById('ps-manager'); if(managerSelect) managerSelect.innerHTML = mHtml;
    const memberSelect = document.getElementById('ps-member-add'); if(memberSelect) memberSelect.innerHTML = mHtml;

    document.getElementById('ps-id').value = item.id; document.getElementById('ps-code').value = item.code || ''; document.getElementById('ps-name').value = item.name || ''; document.getElementById('ps-company').value = item.company || ''; document.getElementById('ps-part').value = item.part || '제조'; document.getElementById('ps-category').value = item.category || ''; document.getElementById('ps-status').value = item.status || 'pending'; document.getElementById('ps-progress-pct').value = item.progress !== undefined ? item.progress : 0; document.getElementById('ps-manager').value = item.manager || '';
    window.currentSelectedMembers = item.members ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; window.renderSelectedMembers();
    document.getElementById('ps-est-md').value = item.estMd !== undefined ? item.estMd : ''; document.getElementById('ps-current-md').value = item.currentMd !== undefined ? item.currentMd : '';
    const cMd = parseFloat(item.currentMd) || 0; const oMd = parseFloat(item.outMd) || 0; document.getElementById('ps-final-md').value = (cMd + oMd).toFixed(1);
    document.getElementById('ps-tot-pers').value = item.totPers !== undefined ? item.totPers : ''; document.getElementById('ps-out-pers').value = item.outPers !== undefined ? item.outPers : ''; document.getElementById('ps-out-md').value = item.outMd !== undefined ? item.outMd : '';
    
    // 🚨 날짜 매핑 로직 강화
    const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
    for (const [key, elementId] of Object.entries(dateMappings)) {
        const el = document.getElementById(elementId); if (el) el.value = item[key] || '';
    }

    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};

window.saveProjStatus = async function() {
    const btn = document.getElementById('btn-proj-save'); if(btn) { btn.disabled = true; btn.innerHTML = '저장중...'; }
    const id = document.getElementById('ps-id').value; const code = document.getElementById('ps-code').value; const name = document.getElementById('ps-name').value;
    if(!code || !name) { if(btn){btn.disabled=false;btn.innerHTML='저장하기';} return window.showToast("코드와 이름을 입력하세요.", "error"); }
    
    const currentMd = parseFloat(document.getElementById('ps-current-md').value) || 0; const outMd = parseFloat(document.getElementById('ps-out-md').value) || 0;
    const data = { 
        code: code, name: name, company: document.getElementById('ps-company').value, part: document.getElementById('ps-part').value, 
        category: document.getElementById('ps-category').value, status: document.getElementById('ps-status').value, 
        progress: parseInt(document.getElementById('ps-progress-pct').value) || 0, manager: document.getElementById('ps-manager').value, 
        members: document.getElementById('ps-members').value, estMd: parseFloat(document.getElementById('ps-est-md').value) || 0, 
        outMd: outMd, finalMd: currentMd + outMd, totPers: parseInt(document.getElementById('ps-tot-pers').value)||0, outPers: parseInt(document.getElementById('ps-out-pers').value)||0, 
        updatedAt: Date.now() 
    };
    
    // 날짜 저장
    const dateMappings = { 'd_rcvEst': 'ps-d-rcv-est', 'd_asmEst': 'ps-d-asm-est', 'd_asmEndEst': 'ps-d-asm-end-est', 'd_shipEst': 'ps-d-ship-est', 'd_asmSt': 'ps-d-asm-st', 'd_asmEn': 'ps-d-asm-en', 'd_insSt': 'ps-d-ins-st', 'd_insEn': 'ps-d-ins-en', 'd_shipEn': 'ps-d-ship-en', 'd_setSt': 'ps-d-set-st', 'd_setEn': 'ps-d-set-en' };
    for (const [key, elementId] of Object.entries(dateMappings)) {
        const el = document.getElementById(elementId); if (el) data[key] = el.value;
    }

    try { 
        if(id) { await setDoc(doc(db, "projects_status", id), data, { merge: true }); window.showToast("수정되었습니다."); } 
        else { data.createdAt = Date.now(); data.currentMd = 0; await addDoc(collection(db, "projects_status"), data); window.showToast("등록되었습니다."); } 
        window.closeProjStatusWriteModal(); 
    } catch(e) { window.showToast("오류 발생", "error"); } finally { if(btn){btn.disabled=false;btn.innerHTML='저장하기';} }
};

window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.calcFinalMd = function() { const curMd = parseFloat(document.getElementById('ps-current-md').value) || 0; const outMd = parseFloat(document.getElementById('ps-out-md').value) || 0; document.getElementById('ps-final-md').value = (curMd + outMd).toFixed(1); };
window.addProjectMember = function(name) { if(!name) return; if(!window.currentSelectedMembers.includes(name)) { window.currentSelectedMembers.push(name); window.renderSelectedMembers(); } document.getElementById('ps-member-add').value = ''; };
window.removeProjectMember = function(name) { window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); window.renderSelectedMembers(); };
window.renderSelectedMembers = function() { const container = document.getElementById('ps-selected-members'); document.getElementById('ps-members').value = window.currentSelectedMembers.join(', '); container.innerHTML = window.currentSelectedMembers.map(name => `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`).join(''); };

window.toggleProjDashView = function(view) {
    window.currentProjDashView = view;
    document.getElementById('proj-dash-list-container').classList.add('hidden'); document.getElementById('proj-dash-gantt-container').classList.add('hidden'); document.getElementById('proj-dash-calendar-container').classList.add('hidden');
    ['list', 'gantt', 'calendar'].forEach(b => {const btn = document.getElementById(`btn-pd-${b}`); if(btn) btn.className = "px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-500 transition-all";});
    const activeBtn = document.getElementById(`btn-pd-${view}`); if(activeBtn) activeBtn.className = "px-3 py-1.5 text-xs font-bold bg-slate-200 shadow-inner rounded-md text-slate-700 transition-all";
    if(view === 'list') document.getElementById('proj-dash-list-container').classList.remove('hidden');
    else if(view === 'gantt') { document.getElementById('proj-dash-gantt-container').classList.remove('hidden'); window.renderProjGantt(); }
    else if(view === 'calendar') { document.getElementById('proj-dash-calendar-container').classList.remove('hidden'); window.renderProjCalendar(); }
};

// 🌟 간트 차트 완벽 복구 (조립 예정/실제, 출하 예정/실제 명확히 분리, 오늘 선)
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
        if(!hasDates) { container.innerHTML = '<div class="text-center p-10 text-slate-500 font-bold bg-white w-full h-full flex items-center justify-center rounded-xl">표시할 일정 데이터가 없습니다.</div>'; return; }
        
        minDate.setDate(minDate.getDate() - 5); maxDate.setDate(maxDate.getDate() + 10);
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)); const dayWidth = 24; const today = new Date(); today.setHours(0,0,0,0); let todayOffset = -1;

        let html = `<div class="relative min-w-max h-full min-h-[500px]" style="width: ${totalDays * dayWidth + 300}px"><div class="flex border-b border-slate-200 sticky top-0 bg-white z-30 shadow-sm"><div class="w-[300px] flex-shrink-0 p-3 font-bold text-xs text-slate-700 bg-slate-50 border-r border-slate-200 flex items-center sticky left-0 z-30"><div class="w-[100px] text-indigo-600">PJT 코드</div><div class="w-[200px]">프로젝트명</div></div>`;
        for(let i=0; i<totalDays; i++) {
            let d = new Date(minDate); d.setDate(d.getDate() + i);
            if(d.getTime() === today.getTime()) todayOffset = i * dayWidth;
            let bgClass = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50' : 'bg-white'; let textClass = d.getDay() === 0 ? 'text-rose-500' : (d.getDay() === 6 ? 'text-blue-500' : 'text-slate-500');
            if (d.getTime() === today.getTime()) { bgClass = 'bg-rose-50'; textClass = 'text-rose-600 font-black'; }
            html += `<div class="w-[${dayWidth}px] flex-shrink-0 text-center border-r border-slate-100 ${bgClass} flex flex-col justify-center relative">${(d.getDate() === 1 || i === 0) ? `<div class="text-[8px] font-black bg-slate-200 text-slate-600">${d.getMonth()+1}월</div>` : `<div class="text-[8px] font-bold bg-slate-100 text-transparent select-none">-</div>`}<div class="text-[10px] font-bold ${textClass} py-1">${d.getDate()}</div></div>`;
        }
        
        html += `</div><div class="relative w-full h-full min-h-full" style="min-height: 400px;">`;
        if(todayOffset >= 0) html += `<div class="absolute top-0 w-[2px] bg-rose-500 z-40 pointer-events-none shadow-sm" style="left: ${300 + todayOffset + (dayWidth/2)}px; height:100%; bottom:0;"><div class="absolute top-0 -translate-x-1/2 -mt-4 bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-bold whitespace-nowrap border border-white">오늘</div></div>`;

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
            
            // 조립 예정 (위쪽 얇게)
            html += drawBar(p.d_asmEst, p.d_asmEndEst, 'bg-white border-2 border-indigo-400 border-dashed text-indigo-700', '조립(예정)', 'top-1');
            // 조립 실제 (중간 굵게)
            html += drawBar(p.d_asmSt, p.d_asmEn, 'bg-indigo-600 text-white', '조립(실제)', 'top-1/2 -translate-y-1/2'); 
            html += drawBar(p.d_insSt, p.d_insEn, 'bg-teal-500 text-white', '검수', 'top-1/2 -translate-y-1/2'); 
            html += drawBar(p.d_setSt, p.d_setEn, 'bg-slate-600 text-white', 'Setup', 'top-1/2 -translate-y-1/2');
            
            // 출하 예정 (다이아몬드)
            html += drawPoint(p.d_shipEst, 'bg-white border-rose-400', '출하(예정)', 'top-1');
            // 출하 실제 (다이아몬드 색칠)
            html += drawPoint(p.d_shipEn, 'bg-rose-500 border-white', '출하(실제)', 'top-1/2 -translate-y-1/2');
            
            html += `</div></div>`;
        });
        html += `</div></div>`; container.innerHTML = html;
        setTimeout(() => { const scrollContainer = document.getElementById('proj-dash-gantt-container'); if(scrollContainer && todayOffset > 0) scrollContainer.scrollLeft = todayOffset - 200; }, 100);
    } catch(e) { container.innerHTML = `<div class="text-center p-10 text-rose-500 font-bold">🚨 간트차트 렌더링 에러: ${e.message}</div>`; }
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
