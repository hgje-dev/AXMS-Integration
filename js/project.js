import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, where, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let projectStatusSnapshotUnsubscribe = null;
let masterCodeSnapshotUnsubscribe = null;
let currentMdLogUnsubscribe = null;
let currentLogUnsubscribe = null;
let currentCommentUnsubscribe = null;
let currentIssueUnsubscribe = null;

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; window.currentCategoryFilter = 'all'; const catSelect = document.getElementById('filter-category-select'); if(catSelect) catSelect.value = 'all';
    document.getElementById('btn-part-mfg').className = part === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    document.getElementById('btn-part-opt').className = part === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    window.loadProjectStatusData();
};

window.filterByCategory = function(category) { window.currentCategoryFilter = category; if(window.currentProjDashView === 'gantt') { if(window.renderProjGantt) window.renderProjGantt(); } else { window.renderProjectStatusList(); } };

window.searchProjectBoard = function(keyword) {
    const k = keyword.toLowerCase();
    document.querySelectorAll('#proj-dash-tbody tr').forEach(tr => {
        const text = tr.innerText.toLowerCase();
        tr.style.display = (text.includes(k) || window.matchString(k, text)) ? '' : 'none';
    });
};

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    projectStatusSnapshotUnsubscribe = onSnapshot(query(collection(db, "projects_status")), (snapshot) => {
        window.currentProjectStatusList = [];
        let lastUpdated = 0;
        snapshot.forEach(doc => { 
            const data = doc.data(); 
            if(data.part === window.currentProjPartTab) window.currentProjectStatusList.push({ id: doc.id, ...data }); 
            if(data.updatedAt && data.updatedAt.toMillis() > lastUpdated) lastUpdated = data.updatedAt.toMillis();
        });
        
        if (lastUpdated > 0) {
            const lDate = new Date(lastUpdated);
            document.getElementById('pjt-last-update').innerText = `${lDate.getFullYear().toString().slice(2)}-${String(lDate.getMonth()+1).padStart(2,'0')}-${String(lDate.getDate()).padStart(2,'0')} ${String(lDate.getHours()).padStart(2,'0')}:${String(lDate.getMinutes()).padStart(2,'0')}`;
        }
        
        window.currentProjectStatusList.sort((a,b) => { const tA = a.createdAt ? a.createdAt.toMillis() : 0; const tB = b.createdAt ? b.createdAt.toMillis() : 0; return tB - tA; });
        if(window.updateMiniDashboard) window.updateMiniDashboard();
        if(window.currentProjDashView === 'gantt' && window.renderProjGantt) window.renderProjGantt(); else window.renderProjectStatusList();
    });
};

window.updateMiniDashboard = function() {
    let pending = 0, progress = 0, completedThisMonth = 0;
    let upcomingCodes7 = [], upcomingCodes14 = [];
    const now = new Date(); const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const completedLabel = document.getElementById('mini-dash-completed-label');
    if (completedLabel) completedLabel.innerHTML = `<i class="fa-solid fa-truck-fast text-emerald-400"></i> 출하 완료 (${now.getMonth() + 1}월)`;

    window.currentProjectStatusList.forEach(item => {
        if (item.status === 'pending' || item.status === 'rejected') pending++;
        else if (item.status === 'progress' || item.status === 'inspecting') progress++;
        else if (item.status === 'completed') {
            if ((item.d_shipEn && item.d_shipEn.startsWith(currentMonthStr)) || (!item.d_shipEn && item.d_shipEst && item.d_shipEst.startsWith(currentMonthStr))) completedThisMonth++;
        }

        if (item.status !== 'completed' && item.status !== 'rejected' && item.d_shipEst) {
            const shipDate = new Date(item.d_shipEst);
            const diffDays = Math.ceil((shipDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays <= 7) upcomingCodes7.push({ code: item.code || '미지정', dDay: diffDays });
            else if (diffDays < 0) upcomingCodes7.push({ code: item.code || '미지정', dDay: diffDays });
            else if (diffDays > 7 && diffDays <= 14) upcomingCodes14.push({ code: item.code || '미지정', dDay: diffDays });
        }
    });

    upcomingCodes7.sort((a,b) => a.dDay - b.dDay); upcomingCodes14.sort((a,b) => a.dDay - b.dDay);

    if(document.getElementById('mini-dash-pending')) document.getElementById('mini-dash-pending').innerText = pending;
    if(document.getElementById('mini-dash-progress')) document.getElementById('mini-dash-progress').innerText = progress;
    if(document.getElementById('mini-dash-completed')) document.getElementById('mini-dash-completed').innerText = completedThisMonth;
    
    const elUpcoming7 = document.getElementById('mini-dash-upcoming');
    if(elUpcoming7) {
        elUpcoming7.innerHTML = upcomingCodes7.length === 0 ? `<span class="text-[10px] text-rose-400 font-bold">임박한 프로젝트 없음</span>` : upcomingCodes7.map(u => {
            let dText = u.dDay === 0 ? 'D-Day' : (u.dDay < 0 ? `지연` : `D-${u.dDay}`);
            let bgClass = u.dDay <= 3 ? 'bg-rose-500 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200';
            return `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 ${bgClass}">${u.code} <span class="opacity-80 text-[8px]">[${dText}]</span></span>`;
        }).join('');
    }

    const elUpcoming14 = document.getElementById('mini-dash-upcoming-14');
    if(elUpcoming14) {
        elUpcoming14.innerHTML = upcomingCodes14.length === 0 ? `<span class="text-[10px] text-orange-400 font-bold">임박한 프로젝트 없음</span>` : upcomingCodes14.map(u => `<span class="text-[10px] border px-1.5 py-0.5 rounded font-bold shadow-sm flex items-center gap-1 bg-white text-orange-600 border-orange-200">${u.code} <span class="opacity-80 text-[8px]">[D-${u.dDay}]</span></span>`).join('');
    }
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    let displayList = window.currentProjectStatusList;
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') displayList = displayList.filter(item => item.category === window.currentCategoryFilter);
    if(displayList.length === 0) { tbody.innerHTML = `<tr><td colspan="28" class="text-center p-6 text-slate-400 font-bold">등록된 PJT 현황이 없습니다.</td></tr>`; return; }
    
    const statusMap = { 'pending': '<span class="text-slate-500 bg-slate-100 px-2 py-0.5 rounded">대기/보류</span>', 'progress': '<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded">진행중(제작)</span>', 'inspecting': '<span class="text-amber-600 bg-amber-50 px-2 py-0.5 rounded">진행중(검수)</span>', 'completed': '<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">완료(출하)</span>', 'rejected': '<span class="text-rose-600 bg-rose-50 px-2 py-0.5 rounded">보류/불가</span>' };
    
    tbody.innerHTML = displayList.map(item => {
        const cMd = parseFloat(item.currentMd) || 0, oMd = parseFloat(item.outMd) || 0, fMd = item.finalMd || (cMd + oMd);
        const safeNameJs = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const safeNameHtml = (item.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        let linksHtml = '';
        if(item.links && Array.isArray(item.links) && item.links.length > 0) {
            linksHtml = item.links.map(lnk => `<a href="${lnk.url}" target="_blank" title="${lnk.name}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>`).join('');
        }
        
        return `<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer" onclick="window.editProjStatus('${item.id}')">
            <td class="border border-slate-200 px-2 py-1 text-center bg-white sticky left-0 z-10" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-400 hover:text-rose-500 mx-1"><i class="fa-solid fa-trash-can"></i></button></td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.category || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-500 hover:text-amber-600 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded shadow-sm relative"><i class="fa-regular fa-comment-dots"></i> ${window.projectCommentCounts[item.id] ? `<span class="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">${window.projectCommentCounts[item.id]}</span>` : ''}</button></td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded shadow-sm relative"><i class="fa-solid fa-triangle-exclamation"></i> ${window.projectIssueCounts[item.id] ? `<span class="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">${window.projectIssueCounts[item.id]}</span>` : ''}</button></td>
            <td class="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700">${item.code || ''}</td>
            <td class="border border-slate-200 px-2 py-1 truncate max-w-[150px]">${safeNameHtml}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.company || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center font-black text-emerald-600">${item.progress || 0}%</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${statusMap[item.status] || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.manager || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()"><button onclick="window.openDailyLogModal('${item.id}', '${safeNameJs}')" class="text-sky-500 hover:text-sky-600 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded shadow-sm"><i class="fa-solid fa-book"></i></button></td>
            <td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd || 0}</td>
            <td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()"><button onclick="window.openMdLogModal('${item.id}', '${safeNameJs}', ${item.currentMd || 0})" class="text-purple-600 hover:bg-purple-50 w-full h-full py-0.5 rounded underline decoration-purple-300">${item.currentMd || 0}</button></td>
            <td class="border border-slate-200 px-2 py-1 text-center text-sky-600 font-bold">${fMd.toFixed(1)}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers !== undefined ? item.totPers : ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outPers !== undefined ? item.outPers : ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outMd !== undefined ? item.outMd : ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">${item.d_shipEst || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${item.d_asmEst || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${item.d_asmEndEst || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.d_asmSt || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.d_asmEn || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.d_insSt || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.d_insEn || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700 font-bold">${item.d_shipEn || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.d_setSt || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.d_setEn || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">
                <div class="flex items-center justify-center gap-1 flex-wrap">
                    <button onclick="window.openLinkModal('${item.id}', '${safeNameJs}')" class="text-slate-400 hover:text-teal-500 transition-colors bg-slate-50 px-1.5 py-0.5 rounded shadow-sm border border-slate-200"><i class="fa-solid fa-link"></i></button>
                    ${linksHtml}
                </div>
            </td>
        </tr>`;
    }).join('');
};

window.openProjStatusWriteModal = function() {
    document.getElementById('ps-id').value = ''; document.getElementById('ps-code').value = ''; document.getElementById('ps-name').value = ''; document.getElementById('ps-company').value = ''; document.getElementById('ps-part').value = window.currentProjPartTab || '제조'; document.getElementById('ps-category').value = '설비'; document.getElementById('ps-status').value = 'pending'; document.getElementById('ps-progress-pct').value = '0';
    ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en', 'ps-d-asm-end-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-set-st', 'ps-d-set-en'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};
window.closeProjStatusWriteModal = function() { document.getElementById('proj-status-write-modal').classList.add('hidden'); document.getElementById('proj-status-write-modal').classList.remove('flex'); };
window.editProjStatus = function(id) {
    const item = window.currentProjectStatusList.find(p => p.id === id); if(!item) return;
    document.getElementById('ps-id').value = item.id; document.getElementById('ps-code').value = item.code || ''; document.getElementById('ps-name').value = item.name || ''; document.getElementById('ps-company').value = item.company || ''; document.getElementById('ps-part').value = item.part || '제조'; document.getElementById('ps-category').value = item.category || '설비'; document.getElementById('ps-status').value = item.status || 'pending'; document.getElementById('ps-progress-pct').value = item.progress !== undefined ? item.progress : 0; document.getElementById('ps-manager').value = item.manager || '';
    window.currentSelectedMembers = item.members ? item.members.split(',').map(s=>s.trim()).filter(Boolean) : []; window.renderSelectedMembers();
    document.getElementById('ps-est-md').value = item.estMd !== undefined ? item.estMd : ''; document.getElementById('ps-current-md').value = item.currentMd !== undefined ? item.currentMd : '';
    const cMd = parseFloat(item.currentMd) || 0; const oMd = parseFloat(item.outMd) || 0; document.getElementById('ps-final-md').value = (cMd + oMd).toFixed(1);
    document.getElementById('ps-tot-pers').value = item.totPers !== undefined ? item.totPers : ''; document.getElementById('ps-out-pers').value = item.outPers !== undefined ? item.outPers : ''; document.getElementById('ps-out-md').value = item.outMd !== undefined ? item.outMd : '';
    ['ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-asm-end-est', 'ps-d-ship-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-ship-en', 'ps-d-set-st', 'ps-d-set-en'].forEach(id => { const key = id.replace('ps-', '').replace(/-([a-z])/g, g => g[1].toUpperCase()); document.getElementById(id).value = item[key] || ''; });
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};
window.saveProjStatus = async function(btn) {
    const id = document.getElementById('ps-id').value; const code = document.getElementById('ps-code').value; const name = document.getElementById('ps-name').value;
    if(!code || !name) return window.showToast("코드와 이름을 입력하세요.", "error");
    btn.disabled = true; btn.innerHTML = '저장중...';
    const currentMd = parseFloat(document.getElementById('ps-current-md').value) || 0; const outMd = parseFloat(document.getElementById('ps-out-md').value) || 0;
    const data = { code: code, name: name, company: document.getElementById('ps-company').value, part: document.getElementById('ps-part').value, category: document.getElementById('ps-category').value, status: document.getElementById('ps-status').value, progress: parseInt(document.getElementById('ps-progress-pct').value) || 0, manager: document.getElementById('ps-manager').value, members: document.getElementById('ps-members').value, estMd: parseFloat(document.getElementById('ps-est-md').value) || 0, outMd: outMd, finalMd: currentMd + outMd, totPers: parseInt(document.getElementById('ps-tot-pers').value)||0, outPers: parseInt(document.getElementById('ps-out-pers').value)||0, d_rcvEst: document.getElementById('ps-d-rcv-est').value, d_asmEst: document.getElementById('ps-d-asm-est').value, d_asmEndEst: document.getElementById('ps-d-asm-end-est').value, d_shipEst: document.getElementById('ps-d-ship-est').value, d_asmSt: document.getElementById('ps-d-asm-st').value, d_asmEn: document.getElementById('ps-d-asm-en').value, d_insSt: document.getElementById('ps-d-ins-st').value, d_insEn: document.getElementById('ps-d-ins-en').value, d_shipEn: document.getElementById('ps-d-ship-en').value, d_setSt: document.getElementById('ps-d-set-st').value, d_setEn: document.getElementById('ps-d-set-en').value, updatedAt: serverTimestamp() };
    try { if(id) { await setDoc(doc(db, "projects_status", id), data, { merge: true }); window.showToast("수정되었습니다."); } else { data.createdAt = serverTimestamp(); data.currentMd = 0; await addDoc(collection(db, "projects_status"), data); window.showToast("등록되었습니다."); } window.closeProjStatusWriteModal(); } catch(e) { window.showToast("오류 발생", "error"); } finally { btn.disabled = false; btn.innerHTML = '현황 저장하기'; }
};
window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.calcFinalMd = function() { const curMd = parseFloat(document.getElementById('ps-current-md').value) || 0; const outMd = parseFloat(document.getElementById('ps-out-md').value) || 0; document.getElementById('ps-final-md').value = (curMd + outMd).toFixed(1); };
window.addProjectMember = function(name) { if(!name) return; if(!window.currentSelectedMembers.includes(name)) { window.currentSelectedMembers.push(name); window.renderSelectedMembers(); } document.getElementById('ps-member-add').value = ''; };
window.removeProjectMember = function(name) { window.currentSelectedMembers = window.currentSelectedMembers.filter(n => n !== name); window.renderSelectedMembers(); };
window.renderSelectedMembers = function() { const container = document.getElementById('ps-selected-members'); document.getElementById('ps-members').value = window.currentSelectedMembers.join(', '); container.innerHTML = window.currentSelectedMembers.map(name => `<span class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 shadow-sm">${name} <i class="fa-solid fa-xmark cursor-pointer hover:text-rose-500 bg-white/50 rounded-full px-1 py-0.5" onclick="window.removeProjectMember('${name}')"></i></span>`).join(''); };

// 🌟 간트 차트
window.toggleProjDashView = function(view) {
    window.currentProjDashView = view;
    if(view === 'list') {
        document.getElementById('proj-dash-list-container').classList.remove('hidden'); document.getElementById('proj-dash-gantt-container').classList.add('hidden');
        document.getElementById('btn-pd-list').className = "px-3 py-1.5 text-xs font-bold bg-slate-200 shadow-inner rounded-md text-slate-700 transition-all";
        document.getElementById('btn-pd-gantt').className = "px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-500 transition-all";
    } else {
        document.getElementById('proj-dash-list-container').classList.add('hidden'); document.getElementById('proj-dash-gantt-container').classList.remove('hidden');
        document.getElementById('btn-pd-list').className = "px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-slate-500 transition-all";
        document.getElementById('btn-pd-gantt').className = "px-3 py-1.5 text-xs font-bold bg-slate-200 shadow-inner rounded-md text-slate-700 transition-all";
        window.renderProjGantt();
    }
};
window.renderProjGantt = function() {
    const container = document.getElementById('proj-dash-gantt-content');
    let displayList = window.currentProjectStatusList;
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') displayList = displayList.filter(item => item.category === window.currentCategoryFilter);
    const projects = displayList.filter(p => p.d_asmSt || p.d_asmEst);
    if(projects.length === 0) { container.innerHTML = '<div class="text-center p-10 text-slate-500">표시할 일정 데이터가 없습니다.</div>'; return; }

    let minDate = new Date(); let maxDate = new Date(); let hasDates = false;
    projects.forEach(p => {
        const dates = [p.d_asmSt, p.d_asmEn, p.d_insSt, p.d_insEn, p.d_shipEn, p.d_setSt, p.d_setEn, p.d_asmEst, p.d_shipEst].filter(d => d).map(d => new Date(d));
        dates.forEach(d => { if(!hasDates) { minDate = new Date(d); maxDate = new Date(d); hasDates = true; } if(d < minDate) minDate = new Date(d); if(d > maxDate) maxDate = new Date(d); });
    });
    if(!hasDates) { container.innerHTML = '<div class="text-center p-10 text-slate-500">표시할 일정 데이터가 없습니다.</div>'; return; }
    minDate.setDate(minDate.getDate() - 5); maxDate.setDate(maxDate.getDate() + 10);
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)); const dayWidth = 24; const today = new Date(); today.setHours(0,0,0,0); let todayOffset = -1;

    let html = `<div class="relative min-w-max" style="width: ${totalDays * dayWidth + 300}px"><div class="flex border-b border-slate-200 sticky top-0 bg-white z-30 shadow-sm"><div class="w-[300px] flex-shrink-0 p-3 font-bold text-xs text-slate-700 bg-slate-50 border-r border-slate-200 flex items-center sticky left-0 z-30"><div class="w-[100px] text-indigo-600">PJT 코드</div><div class="w-[200px]">프로젝트명</div></div>`;
    for(let i=0; i<totalDays; i++) {
        let d = new Date(minDate); d.setDate(d.getDate() + i);
        if(d.getTime() === today.getTime()) todayOffset = i * dayWidth;
        let bgClass = (d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50' : 'bg-white';
        let textClass = d.getDay() === 0 ? 'text-rose-500' : (d.getDay() === 6 ? 'text-blue-500' : 'text-slate-500');
        if (d.getTime() === today.getTime()) { bgClass = 'bg-rose-50'; textClass = 'text-rose-600 font-black'; }
        html += `<div class="w-[${dayWidth}px] flex-shrink-0 text-center border-r border-slate-100 ${bgClass} flex flex-col justify-center relative">${(d.getDate() === 1 || i === 0) ? `<div class="text-[8px] font-black bg-slate-200 text-slate-600">${d.getMonth()+1}월</div>` : `<div class="text-[8px] font-bold bg-slate-100 text-transparent select-none">-</div>`}<div class="text-[10px] font-bold ${textClass} py-1">${d.getDate()}</div></div>`;
    }
    html += `</div><div class="relative">`;
    if(todayOffset >= 0) html += `<div class="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-20 pointer-events-none" style="left: ${300 + todayOffset + (dayWidth/2)}px;"><div class="absolute top-0 -translate-x-1/2 -mt-4 bg-rose-500 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm font-bold whitespace-nowrap">오늘</div></div>`;

    projects.forEach(p => {
        const safeNameHtml = (p.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `<div class="flex border-b border-slate-100 hover:bg-slate-50 relative group cursor-pointer" onclick="window.editProjStatus('${p.id}')"><div class="w-[300px] flex-shrink-0 p-2 text-[11px] font-bold text-slate-700 border-r border-slate-200 bg-white z-10 sticky left-0 flex items-center group-hover:bg-slate-50 transition-colors" title="${safeNameHtml}"><div class="w-[100px] text-indigo-600 truncate font-black pr-1">${p.code || '-'}</div><div class="w-[200px] truncate">${safeNameHtml}</div></div><div class="flex relative" style="width: ${totalDays * dayWidth}px">`;
        for(let i=0; i<totalDays; i++) { let d = new Date(minDate); d.setDate(d.getDate() + i); html += `<div class="w-[${dayWidth}px] flex-shrink-0 border-r border-slate-50 ${(d.getDay() === 0 || d.getDay() === 6) ? 'bg-slate-50/50' : ''} h-10"></div>`; }
        const drawBar = (start, end, colorClass, label) => {
            if(!start) return ''; let sD = new Date(start); let eD = end ? new Date(end) : new Date(start);
            if(sD < minDate) sD = new Date(minDate); if(eD > maxDate) eD = new Date(maxDate); if(sD > eD) eD = new Date(sD);
            let leftOffset = Math.floor((sD - minDate) / (1000 * 60 * 60 * 24)) * dayWidth; let width = Math.ceil((eD - sD) / (1000 * 60 * 60 * 24) + 1) * dayWidth;
            return `<div class="absolute top-1/2 -translate-y-1/2 h-[18px] rounded-full ${colorClass} text-[9px] text-white flex items-center justify-center font-bold shadow-sm overflow-hidden whitespace-nowrap opacity-90 hover:opacity-100 hover:scale-y-110 transition-all cursor-pointer z-10" style="left: ${leftOffset}px; width: ${width}px;" title="${label}: ${start} ~ ${end||start}"></div>`;
        };
        html += drawBar(p.d_asmEst || p.d_asmSt, p.d_asmEndEst || p.d_asmEn, 'bg-indigo-500', '조립'); html += drawBar(p.d_insSt, p.d_insEn, 'bg-teal-500', '검수'); html += drawBar(p.d_setSt, p.d_setEn, 'bg-slate-600', 'Setup');
        if(p.d_shipEn || p.d_shipEst) { let shipD = new Date(p.d_shipEn || p.d_shipEst); let leftOffset = Math.floor((shipD - minDate) / (1000 * 60 * 60 * 24)) * dayWidth; html += `<div class="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded bg-rose-500 transform rotate-45 shadow-sm border-2 border-white z-10" style="left: ${leftOffset + dayWidth/2 - 7}px;" title="출하: ${p.d_shipEn || p.d_shipEst}"></div>`; }
        html += `</div></div>`;
    });
    html += `</div></div>`; 
    container.innerHTML = html;
    setTimeout(() => { const scrollContainer = document.getElementById('proj-dash-gantt-container'); if(scrollContainer && todayOffset > 0) scrollContainer.scrollLeft = todayOffset - 200; }, 100);
};

// 🌟 엑셀 다운로드
window.downloadProjDashExcel = async function() {
    window.showToast("엑셀 데이터를 수집하여 다운로드를 준비 중입니다. 잠시만 기다려주세요.", "success");
    try {
        const logsSnap = await getDocs(query(collection(db, "daily_logs"))); const commentsSnap = await getDocs(query(collection(db, "project_comments")));
        let logsMap = {}; logsSnap.forEach(doc => { let d = doc.data(); if(!logsMap[d.projectId]) logsMap[d.projectId] = []; logsMap[d.projectId].push(d); });
        let commentsMap = {}; commentsSnap.forEach(doc => { let d = doc.data(); if(!commentsMap[d.projectId]) commentsMap[d.projectId] = []; commentsMap[d.projectId].push(d); });
        const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet(`${window.currentProjPartTab} 파트 현황`);
        sheet.columns = [ { header: '구분', key: 'category', width: 10 }, { header: 'PJT 코드', key: 'code', width: 15 }, { header: '프로젝트명', key: 'name', width: 30 }, { header: '업체명', key: 'company', width: 15 }, { header: '진행률(%)', key: 'progress', width: 10 }, { header: '현재상태', key: 'status', width: 15 }, { header: '담당자', key: 'manager', width: 15 }, { header: '예정MD', key: 'estMd', width: 10 }, { header: '현재투입MD', key: 'currentMd', width: 10 }, { header: '최종MD', key: 'finalMd', width: 10 }, { header: '총인원', key: 'totPers', width: 10 }, { header: '외주인원', key: 'outPers', width: 10 }, { header: '외주MD', key: 'outMd', width: 10 }, { header: '출하예정', key: 'd_shipEst', width: 15 }, { header: '조립예정', key: 'd_asmEst', width: 15 }, { header: '조립완료예정', key: 'd_asmEndEst', width: 15 }, { header: '조립시작(실)', key: 'd_asmSt', width: 15 }, { header: '조립완료(실)', key: 'd_asmEn', width: 15 }, { header: '검수시작(실)', key: 'd_insSt', width: 15 }, { header: '검수완료(실)', key: 'd_insEn', width: 15 }, { header: '출하완료(최종)', key: 'd_shipEn', width: 15 }, { header: 'Setup시작', key: 'd_setSt', width: 15 }, { header: 'Setup종료', key: 'd_setEn', width: 15 }, { header: '생산일지 전체내역', key: 'logs', width: 50 }, { header: '코멘트 전체내역', key: 'comments', width: 50 } ];
        const statusMapText = { 'pending': '대기', 'progress': '진행중', 'inspecting': '검수중', 'completed': '완료', 'rejected': '보류' };
        window.currentProjectStatusList.forEach(p => {
            let pLogs = logsMap[p.id] || []; let logStr = pLogs.sort((a,b) => b.createdAt - a.createdAt).map(l => `[${l.date}] ${l.content}`).join('\n');
            let pComms = commentsMap[p.id] || []; let commStr = pComms.sort((a,b) => a.createdAt - b.createdAt).map(c => `[${window.getDateTimeStr(new Date(c.createdAt))}] ${c.authorName}: ${c.content}`).join('\n');
            sheet.addRow({ category: p.category || '', code: p.code || '', name: p.name || '', company: p.company || '', progress: p.progress || 0, status: statusMapText[p.status] || p.status, manager: p.manager || '', estMd: p.estMd || 0, currentMd: p.currentMd || 0, finalMd: p.finalMd || 0, totPers: p.totPers || 0, outPers: p.outPers || 0, outMd: p.outMd || 0, d_shipEst: p.d_shipEst || '', d_asmEst: p.d_asmEst || '', d_asmEndEst: p.d_asmEndEst || '', d_asmSt: p.d_asmSt || '', d_asmEn: p.d_asmEn || '', d_insSt: p.d_insSt || '', d_insEn: p.d_insEn || '', d_shipEn: p.d_shipEn || '', d_setSt: p.d_setSt || '', d_setEn: p.d_setEn || '', logs: logStr, comments: commStr });
        });
        sheet.getRow(1).font = { bold: true }; sheet.getRow(1).alignment = { horizontal: 'center' };
        const buffer = await workbook.xlsx.writeBuffer(); saveAs(new Blob([buffer]), `PJT현황_${window.currentProjPartTab}_${new Date().toISOString().slice(0,10)}.xlsx`); window.showToast("다운로드가 완료되었습니다.", "success");
    } catch(e) { console.error(e); window.showToast("다운로드 중 오류가 발생했습니다.", "error"); }
};

// 🌟 PJT 마스터 관리
window.openProjCodeMasterModal = function() { document.getElementById('proj-code-master-modal').classList.remove('hidden'); document.getElementById('proj-code-master-modal').classList.add('flex'); window.renderProjCodeMasterList(); };
window.closeProjCodeMasterModal = function() { document.getElementById('proj-code-master-modal').classList.add('hidden'); document.getElementById('proj-code-master-modal').classList.remove('flex'); };
window.loadProjectCodeMaster = function() {
    if(masterCodeSnapshotUnsubscribe) masterCodeSnapshotUnsubscribe();
    masterCodeSnapshotUnsubscribe = onSnapshot(collection(db, "project_codes"), (snapshot) => {
        window.pjtCodeMasterList = []; snapshot.forEach(doc => { window.pjtCodeMasterList.push({ id: doc.id, ...doc.data() }); });
        window.pjtCodeMasterList.sort((a,b) => b.createdAt - a.createdAt);
        const modal = document.getElementById('proj-code-master-modal'); if (modal && !modal.classList.contains('hidden')) { window.renderProjCodeMasterList(); }
    });
};
window.renderProjCodeMasterList = function() {
    const tbody = document.getElementById('pjt-code-tbody'); if(!tbody) return;
    if(window.pjtCodeMasterList.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-slate-400 font-bold">등록된 PJT 코드가 없습니다.</td></tr>`; return; }
    tbody.innerHTML = window.pjtCodeMasterList.map(c => `<tr class="hover:bg-slate-50 transition-colors"><td class="p-3 font-bold text-indigo-600">${c.code}</td><td class="p-3 font-bold text-slate-700">${c.name}</td><td class="p-3 text-slate-600">${c.company}</td><td class="p-3 text-center"><button onclick="window.deleteProjectCode('${c.id}')" class="text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can"></i></button></td></tr>`).join('');
};
window.addProjectCode = async function() {
    const code = document.getElementById('new-pjt-code').value.trim(); const name = document.getElementById('new-pjt-name').value.trim(); const comp = document.getElementById('new-pjt-company').value.trim();
    if(!code || !name || !comp) { window.showToast("코드, 명칭, 업체명을 모두 입력해주세요.", "error"); return; }
    try {
        window.pjtCodeMasterList.unshift({ id: 'temp-'+Date.now(), code: code, name: name, company: comp, createdAt: Date.now() }); window.renderProjCodeMasterList();
        await addDoc(collection(db, "project_codes"), { code: code, name: name, company: comp, createdAt: Date.now() });
        window.showToast("마스터 코드가 등록되었습니다."); document.getElementById('new-pjt-code').value = ''; document.getElementById('new-pjt-name').value = ''; document.getElementById('new-pjt-company').value = '';
    } catch(e) { window.showToast("등록 실패", "error"); }
};
window.toggleBulkPjtInput = function() { document.getElementById('bulk-pjt-section').classList.toggle('hidden'); };
window.bulkAddProjectCodes = async function() {
    const text = document.getElementById('bulk-pjt-input').value; if(!text.trim()) return window.showToast("데이터를 붙여넣어 주세요.", "error");
    const lines = text.split('\n'); const validItems = [];
    for(let line of lines) {
        if(!line.trim()) continue; let parts = line.split('\t'); if(parts.length < 2) parts = line.split(','); if(parts.length < 2) parts = line.trim().split(/\s{2,}/);
        if(parts.length >= 2) { let code = parts[0].trim(); let name = parts[1].trim(); let company = parts.length > 2 ? parts[2].trim() : '-'; if(code && name) validItems.push({ code, name, company }); }
    }
    if(validItems.length === 0) return window.showToast("등록할 유효한 데이터가 없습니다.", "error");
    window.showToast(`${validItems.length}건의 코드를 서버에 등록 중입니다...`, "success");
    try {
        for(let i=0; i<validItems.length; i+=400) {
            const chunk = validItems.slice(i, i+400); const batch = writeBatch(db);
            chunk.forEach((item, idx) => { const docRef = doc(collection(db, "project_codes")); batch.set(docRef, { code: item.code, name: item.name, company: item.company, createdAt: Date.now() + i + idx }); });
            await batch.commit();
        }
        window.showToast(`총 ${validItems.length}건 일괄 등록 완료!`); document.getElementById('bulk-pjt-input').value = ''; window.toggleBulkPjtInput();
    } catch(e) { window.showToast("일괄 등록 중 오류 발생", "error"); console.error(e); }
};
window.deleteProjectCode = async function(id) {
    if(!confirm("해당 마스터 코드를 삭제하시겠습니까?")) return;
    window.pjtCodeMasterList = window.pjtCodeMasterList.filter(c => c.id !== id); window.renderProjCodeMasterList();
    try { if(id && !String(id).startsWith('temp-')) { await deleteDoc(doc(db, "project_codes", id)); } window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); }
};
window.deleteAllProjectCodes = async function() {
    if(!confirm("⚠️ 경고: 등록된 모든 마스터 코드를 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
    const pwd = prompt("전체 삭제를 진행하려면 아래 텍스트를 정확히 입력하세요.\n[ 삭제확인 ]");
    if(pwd !== '삭제확인') return window.showToast("입력이 일치하지 않아 취소되었습니다.", "error");
    window.showToast("전체 데이터를 삭제 중입니다. 잠시만 기다려주세요...", "success");
    try {
        const snap = await getDocs(query(collection(db, "project_codes"))); let batches = []; let currentBatch = writeBatch(db); let count = 0;
        snap.forEach(doc => { currentBatch.delete(doc.ref); count++; if (count % 400 === 0) { batches.push(currentBatch.commit()); currentBatch = writeBatch(db); } });
        if (count % 400 !== 0) batches.push(currentBatch.commit()); await Promise.all(batches);
        window.showToast(`총 ${count}건의 마스터 코드가 완전히 삭제되었습니다.`);
    } catch(e) { window.showToast("전체 삭제 중 오류가 발생했습니다.", "error"); console.error(e); }
};
window.showAutocomplete = function(inputEl, nameId, compId, isNameSearch=false) {
    let listId = inputEl.id + '-autocomplete-list'; let listEl = document.getElementById(listId);
    if(!listEl) {
        listEl = document.createElement('div'); listEl.id = listId; listEl.className = "absolute z-50 w-[150%] max-w-[400px] bg-white border border-slate-200 shadow-2xl rounded-xl mt-1 hidden max-h-60 overflow-y-auto custom-scrollbar";
        inputEl.parentNode.style.position = 'relative'; inputEl.parentNode.appendChild(listEl);
        document.addEventListener('click', (e) => { if(e.target !== inputEl && !listEl.contains(e.target)) listEl.classList.add('hidden'); });
    }
    const query = inputEl.value; let matches = window.pjtCodeMasterList;
    if(query.trim() !== '') matches = window.pjtCodeMasterList.filter(c => window.matchString(query, c.code) || window.matchString(query, c.name) || window.matchString(query, c.company));
    matches = matches.slice(0, 100);
    if(matches.length === 0) { listEl.innerHTML = `<div class="p-3 text-xs text-slate-400 text-center font-bold">검색 결과 없음<br><span class="text-[9px] font-normal">(직접 입력하여 사용 가능)</span></div>`; } else {
        listEl.innerHTML = matches.map(c => `<div class="p-3 text-xs hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors" onclick="window.selectAutocomplete('${inputEl.id}', '${nameId}', '${compId}', '${c.code}', '${c.name}', '${c.company}', ${isNameSearch})"><div class="font-black text-indigo-600 mb-0.5">${c.code}</div><div class="text-slate-700 font-bold truncate">${c.name} <span class="text-slate-400 font-medium ml-1">(${c.company})</span></div></div>`).join('');
    }
    listEl.classList.remove('hidden');
};
window.selectAutocomplete = function(inputId, nameId, compId, code, name, company, isNameSearch) {
    if(isNameSearch) { document.getElementById(inputId).value = name; if(nameId && document.getElementById(nameId)) document.getElementById(nameId).value = code; } else { document.getElementById(inputId).value = code; if(nameId && document.getElementById(nameId)) document.getElementById(nameId).value = name; }
    if(compId && document.getElementById(compId)) document.getElementById(compId).value = company;
    document.getElementById(inputId + '-autocomplete-list').classList.add('hidden');
};

// 🌟 MD 로그 관리
window.openMdLogModal = function(projectId, projectName, currentTotal) {
    document.getElementById('md-req-id').value = projectId; document.getElementById('md-project-title').innerText = projectName; document.getElementById('md-total-badge').innerText = `총 ${currentTotal || 0} MD`;
    window.resetMdLogForm(); document.getElementById('md-log-modal').classList.remove('hidden'); document.getElementById('md-log-modal').classList.add('flex'); window.loadMdLogs(projectId);
};
window.closeMdLogModal = function() { document.getElementById('md-log-modal').classList.add('hidden'); document.getElementById('md-log-modal').classList.remove('flex'); if (currentMdLogUnsubscribe) { currentMdLogUnsubscribe(); currentMdLogUnsubscribe = null; } };
window.resetMdLogForm = function() { document.getElementById('editing-md-id').value = ''; document.getElementById('new-md-date').value = window.getLocalDateStr(new Date()); document.getElementById('new-md-val').value = ''; document.getElementById('new-md-desc').value = ''; document.getElementById('btn-md-save').innerText = '등록'; document.getElementById('btn-md-cancel').classList.add('hidden'); };
window.loadMdLogs = function(projectId) {
    if (currentMdLogUnsubscribe) currentMdLogUnsubscribe();
    currentMdLogUnsubscribe = onSnapshot(query(collection(db, "project_md_logs"), where("projectId", "==", projectId)), (snapshot) => {
        let logs = []; let totalMd = 0; snapshot.forEach(doc => { const data = doc.data(); logs.push({ id: doc.id, ...data }); totalMd += parseFloat(data.md) || 0; });
        logs.sort((a, b) => { if (a.date !== b.date) return b.date.localeCompare(a.date); return b.createdAt - a.createdAt; });
        document.getElementById('md-total-badge').innerText = `총 ${totalMd.toFixed(1)} MD`; window.renderMdLogs(logs);
    });
};
window.renderMdLogs = function(logs) {
    const list = document.getElementById('md-log-list');
    if (logs.length === 0) { list.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 투입 공수 내역이 없습니다.</td></tr>'; return; }
    list.innerHTML = logs.map(log => {
        const safeDesc = (log.desc || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        return `<tr class="hover:bg-purple-50/30 transition-colors"><td class="p-3 text-center text-slate-500 font-bold">${log.date}</td><td class="p-3 text-center text-purple-700 font-black">${parseFloat(log.md).toFixed(1)}</td><td class="p-3 text-slate-700">${log.desc || '-'}</td><td class="p-3 text-center text-slate-600 font-bold">${log.authorName}</td><td class="p-3 text-center"><div class="flex justify-center gap-2">${(log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button data-id="${log.id}" data-date="${log.date}" data-md="${log.md}" data-desc="${safeDesc}" onclick="window.editMdLog(this.dataset.id, this.dataset.date, this.dataset.md, this.dataset.desc)" class="text-slate-400 hover:text-purple-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteMdLog('${log.id}', '${log.projectId}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : '-'}</div></td></tr>`;
    }).join('');
};
window.saveMdLogItem = async function() {
    const projectId = document.getElementById('md-req-id').value; const logId = document.getElementById('editing-md-id').value; const date = document.getElementById('new-md-date').value; const mdVal = document.getElementById('new-md-val').value; const desc = document.getElementById('new-md-desc').value.trim();
    if(!date || !mdVal) return window.showToast("날짜와 투입 MD를 입력하세요.", "error");
    try {
        if (logId) { await setDoc(doc(db, "project_md_logs", logId), { date, md: parseFloat(mdVal), desc }, { merge: true }); window.showToast("MD 내역이 수정되었습니다."); } else { await addDoc(collection(db, "project_md_logs"), { projectId, date, md: parseFloat(mdVal), desc, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); window.showToast("MD 내역이 등록되었습니다."); }
        await window.updateProjectTotalMd(projectId); window.resetMdLogForm();
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); console.error(e); }
};
window.editMdLog = function(id, date, md, desc) { document.getElementById('editing-md-id').value = id; document.getElementById('new-md-date').value = date; document.getElementById('new-md-val').value = md; document.getElementById('new-md-desc').value = desc; document.getElementById('btn-md-save').innerText = '수정'; document.getElementById('btn-md-cancel').classList.remove('hidden'); };
window.deleteMdLog = async function(id, projectId) { if(!confirm("이 MD 내역을 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_md_logs", id)); await window.updateProjectTotalMd(projectId); window.showToast("삭제되었습니다."); window.resetMdLogForm(); } catch(e) { window.showToast("삭제 실패", "error"); } };
window.updateProjectTotalMd = async function(projectId) {
    const snap = await getDocs(query(collection(db, "project_md_logs"), where("projectId", "==", projectId))); let total = 0; snap.forEach(doc => { total += parseFloat(doc.data().md) || 0; });
    const projRef = doc(db, "projects_status", projectId); const projSnap = await getDoc(projRef);
    if(projSnap.exists()) { const outMd = parseFloat(projSnap.data().outMd) || 0; await setDoc(projRef, { currentMd: total, finalMd: total + outMd }, { merge: true }); }
};

// 🌟 생산일지 관리
window.resizeAndConvertToBase64 = function(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); let width = img.width; let height = img.height; const MAX = 800;
            if(width > height && width > MAX) { height *= MAX / width; width = MAX; } else if(height > MAX) { width *= MAX / height; height = MAX; }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
};
window.openDailyLogModal = function(projectId, projectName) {
    document.getElementById('log-req-id').value = projectId; document.getElementById('log-project-title').innerText = projectName;
    window.resetDailyLogForm(); document.getElementById('daily-log-modal').classList.remove('hidden'); document.getElementById('daily-log-modal').classList.add('flex'); window.loadDailyLogs(projectId);
};
window.closeDailyLogModal = function() { document.getElementById('daily-log-modal').classList.add('hidden'); document.getElementById('daily-log-modal').classList.remove('flex'); if (currentLogUnsubscribe) { currentLogUnsubscribe(); currentLogUnsubscribe = null; } };
window.resetDailyLogForm = function() { document.getElementById('editing-log-id').value = ''; document.getElementById('new-log-date').value = window.getLocalDateStr(new Date()); document.getElementById('new-log-text').value = ''; document.getElementById('new-log-image').value = ''; document.getElementById('btn-log-save').innerText = '등록'; document.getElementById('btn-log-cancel').classList.add('hidden'); };
window.loadDailyLogs = function(projectId) {
    if (currentLogUnsubscribe) currentLogUnsubscribe();
    currentLogUnsubscribe = onSnapshot(query(collection(db, "daily_logs"), where("projectId", "==", projectId)), (snapshot) => {
        let logs = []; snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));
        logs.sort((a, b) => { if (a.date !== b.date) return b.date.localeCompare(a.date); return b.createdAt - a.createdAt; }); window.renderDailyLogs(logs);
    });
};
window.renderDailyLogs = function(logs) {
    const list = document.getElementById('daily-log-list');
    if (logs.length === 0) { list.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; return; }
    list.innerHTML = logs.map(log => {
        const safeContent = (log.content || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const imgHtml = log.imageUrl ? `<div class="mt-2 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[200px]"><img src="${log.imageUrl}" class="w-full h-auto cursor-pointer" onclick="window.open('${log.imageUrl}')"></div>` : '';
        return `<li class="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow"><div class="flex justify-between items-center"><div class="flex items-center gap-2"><span class="font-bold text-sky-600 text-[10px] bg-sky-50 px-1.5 py-0.5 rounded shadow-inner"><i class="fa-regular fa-calendar-check mr-1"></i>${log.date}</span><span class="font-bold text-slate-700 text-xs">${log.authorName}</span></div><div class="flex gap-2">${(log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button data-id="${log.id}" data-date="${log.date}" data-content="${safeContent}" onclick="window.editDailyLog(this.dataset.id, this.dataset.date, this.dataset.content)" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div><div class="text-slate-700 font-medium text-[13px] pl-1 mt-1 break-words">${log.content}</div>${imgHtml}</li>`;
    }).join('');
};
window.saveDailyLogItem = async function() {
    const projectId = document.getElementById('log-req-id').value; const logId = document.getElementById('editing-log-id').value; const date = document.getElementById('new-log-date').value; const content = document.getElementById('new-log-text').value.trim(); const fileInput = document.getElementById('new-log-image');
    if(!date || !content) return window.showToast("날짜와 작업 내용을 모두 입력하세요.", "error");
    document.getElementById('btn-log-save').innerHTML = '저장중..'; document.getElementById('btn-log-save').disabled = true;
    const saveData = async (base64Img) => {
        try {
            const payload = { date, content, updatedAt: Date.now() }; if(base64Img) payload.imageUrl = base64Img;
            if (logId) { await setDoc(doc(db, "daily_logs", logId), payload, { merge: true }); window.showToast("일지가 수정되었습니다."); } else { payload.projectId = projectId; payload.authorUid = window.currentUser.uid; payload.authorName = window.userProfile.name; payload.createdAt = Date.now(); await addDoc(collection(db, "daily_logs"), payload); window.showToast("일지가 등록되었습니다."); }
            window.resetDailyLogForm();
        } catch(e) { window.showToast("저장 중 오류 발생", "error"); console.error(e); } finally { document.getElementById('btn-log-save').innerHTML = '등록'; document.getElementById('btn-log-save').disabled = false; }
    };
    if(fileInput.files.length > 0) { window.resizeAndConvertToBase64(fileInput.files[0], (base64) => { saveData(base64); }); } else { saveData(null); }
};
window.editDailyLog = function(id, date, content) { document.getElementById('editing-log-id').value = id; document.getElementById('new-log-date').value = date; document.getElementById('new-log-text').value = content; document.getElementById('btn-log-save').innerText = '수정'; document.getElementById('btn-log-cancel').classList.remove('hidden'); document.getElementById('new-log-text').focus(); };
window.deleteDailyLog = async function(id) { if(!confirm("이 일지를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "daily_logs", id)); window.showToast("삭제되었습니다."); window.resetDailyLogForm(); } catch(e) { window.showToast("삭제 실패", "error"); } };

// 🌟 코멘트 관리
window.openCommentModal = function(projectId, projectName) { document.getElementById('cmt-req-id').value = projectId; document.getElementById('cmt-project-title').innerText = projectName; window.cancelCommentAction(); document.getElementById('comment-modal').classList.remove('hidden'); document.getElementById('comment-modal').classList.add('flex'); window.loadComments(projectId); };
window.closeCommentModal = function() { document.getElementById('comment-modal').classList.add('hidden'); document.getElementById('comment-modal').classList.remove('flex'); if (currentCommentUnsubscribe) { currentCommentUnsubscribe(); currentCommentUnsubscribe = null; } };
window.cancelCommentAction = function() { document.getElementById('reply-to-id').value = ''; document.getElementById('editing-cmt-id').value = ''; document.getElementById('new-cmt-text').value = ''; document.getElementById('btn-cmt-save').innerText = '작성'; document.getElementById('reply-indicator').classList.add('hidden'); };
window.loadComments = function(projectId) {
    if (currentCommentUnsubscribe) currentCommentUnsubscribe();
    currentCommentUnsubscribe = onSnapshot(query(collection(db, "project_comments"), where("projectId", "==", projectId)), (snapshot) => {
        let comments = []; snapshot.forEach(doc => comments.push({ id: doc.id, ...doc.data() }));
        const topLevel = comments.filter(c => !c.parentId).sort((a,b) => a.createdAt - b.createdAt);
        const replies = comments.filter(c => c.parentId).sort((a,b) => a.createdAt - b.createdAt);
        topLevel.forEach(c => { c.replies = replies.filter(r => r.parentId === c.id); });
        document.getElementById('cmt-total-count').innerText = `총 ${comments.length}개`; window.renderComments(topLevel);
    });
};
window.renderComments = function(topLevelComments) {
    const list = document.getElementById('comment-list');
    if (topLevelComments.length === 0) { list.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 코멘트가 없습니다. 첫 코멘트를 남겨보세요!</div>'; return; }
    list.innerHTML = topLevelComments.map(c => {
        const safeContent = (c.content || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        let repliesHtml = '';
        if(c.replies && c.replies.length > 0) {
            repliesHtml += '<div class="pl-4 border-l-2 border-indigo-100 space-y-2 mt-3 pt-2">';
            c.replies.forEach(r => {
                const safeReplyContent = (r.content || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
                repliesHtml += `<div class="bg-slate-50 p-3 rounded-lg border border-slate-100"><div class="flex justify-between items-start mb-1"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[8px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-[11px]">${r.authorName}</span><span class="text-[9px] font-medium text-slate-400">${window.getDateTimeStr(new Date(r.createdAt))}</span></div><div class="flex gap-2">${(r.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button data-id="${r.id}" data-content="${safeReplyContent}" onclick="window.editComment(this.dataset.id, this.dataset.content)" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square text-[10px]"></i></button><button onclick="window.deleteComment('${r.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can text-[10px]"></i></button>` : ''}</div></div><div class="text-slate-600 text-xs font-medium pl-4 break-words">${r.content}</div></div>`;
            });
            repliesHtml += '</div>';
        }
        return `<div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><span class="font-black text-slate-800 text-xs">${c.authorName}</span><span class="text-[10px] font-medium text-slate-400">${window.getDateTimeStr(new Date(c.createdAt))}</span></div><div class="flex gap-2"><button onclick="window.setReplyTo('${c.id}', '${c.authorName}')" class="text-[10px] bg-indigo-50 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 px-2 py-0.5 rounded font-bold transition-colors">답글달기</button>${(c.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button data-id="${c.id}" data-content="${safeContent}" onclick="window.editComment(this.dataset.id, this.dataset.content)" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square text-[10px]"></i></button><button onclick="window.deleteComment('${c.id}')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can text-[10px]"></i></button>` : ''}</div></div><div class="text-slate-700 text-[13px] font-medium pl-1 mb-2 break-words">${c.content}</div>${repliesHtml}</div>`;
    }).join('');
};
window.setReplyTo = function(commentId, authorName) { window.cancelCommentAction(); document.getElementById('reply-to-id').value = commentId; document.getElementById('reply-indicator-name').innerHTML = `<i class="fa-solid fa-reply rotate-180 scale-y-[-1] mr-1"></i> <b class="text-indigo-800">${authorName}</b> 님에게 답글 작성 중`; document.getElementById('reply-indicator').classList.remove('hidden'); document.getElementById('new-cmt-text').focus(); };
window.editComment = function(id, content) { window.cancelCommentAction(); document.getElementById('editing-cmt-id').value = id; document.getElementById('new-cmt-text').value = content; document.getElementById('btn-cmt-save').innerText = '수정'; document.getElementById('reply-indicator-name').innerHTML = `<i class="fa-solid fa-pen mr-1"></i> 코멘트 내용 수정 중`; document.getElementById('reply-indicator').classList.remove('hidden'); document.getElementById('new-cmt-text').focus(); };
window.saveCommentItem = async function() {
    const projectId = document.getElementById('cmt-req-id').value; const content = document.getElementById('new-cmt-text').value.trim(); const parentId = document.getElementById('reply-to-id').value || null; const editId = document.getElementById('editing-cmt-id').value;
    if(!content) return window.showToast("코멘트 내용을 입력하세요.", "error");
    try {
        if (editId) { await setDoc(doc(db, "project_comments", editId), { content }, { merge: true }); window.showToast("코멘트가 수정되었습니다."); } else { await addDoc(collection(db, "project_comments"), { projectId, content, parentId, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); window.showToast("코멘트가 등록되었습니다."); }
        window.cancelCommentAction();
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); }
};
window.deleteComment = async function(id) {
    if(!confirm("이 코멘트를 삭제하시겠습니까? (상위 코멘트 삭제 시 달린 답글도 함께 삭제됩니다)")) return;
    try {
        await deleteDoc(doc(db, "project_comments", id));
        const q = query(collection(db, "project_comments"), where("parentId", "==", id)); const snapshot = await getDocs(q);
        if(!snapshot.empty) { const batch = writeBatch(db); snapshot.forEach(d => batch.delete(d.ref)); await batch.commit(); }
        window.showToast("삭제되었습니다."); window.cancelCommentAction();
    } catch(e) { window.showToast("삭제 실패", "error"); }
};

// 🌟 이슈 관리
window.openIssueModal = function(projectId, projectName) { document.getElementById('issue-req-id').value = projectId; document.getElementById('issue-project-title').innerText = projectName; document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; document.getElementById('btn-issue-save').innerText = '등록'; document.getElementById('issue-modal').classList.remove('hidden'); document.getElementById('issue-modal').classList.add('flex'); window.loadIssues(projectId); };
window.closeIssueModal = function() { document.getElementById('issue-modal').classList.add('hidden'); document.getElementById('issue-modal').classList.remove('flex'); if (currentIssueUnsubscribe) { currentIssueUnsubscribe(); currentIssueUnsubscribe = null; } };
window.loadIssues = function(projectId) {
    if (currentIssueUnsubscribe) currentIssueUnsubscribe();
    currentIssueUnsubscribe = onSnapshot(query(collection(db, "project_issues"), where("projectId", "==", projectId)), (snapshot) => {
        let issues = []; let unresolvedCount = 0; snapshot.forEach(doc => { const data = doc.data(); issues.push({ id: doc.id, ...data }); if(!data.isResolved) unresolvedCount++; });
        issues.sort((a,b) => a.createdAt - b.createdAt); document.getElementById('issue-total-count').innerText = `미해결 ${unresolvedCount}건`; window.renderIssues(issues);
    });
};
window.renderIssues = function(issues) {
    const list = document.getElementById('issue-list');
    if (issues.length === 0) { list.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">등록된 이슈가 없습니다.</div>'; return; }
    list.innerHTML = issues.map(iss => {
        const safeText = (iss.content || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        return `<li class="bg-white p-3 rounded-lg border ${iss.isResolved ? 'border-emerald-200 bg-emerald-50/30' : 'border-rose-100'} shadow-sm flex items-start gap-3 hover:shadow-md transition-shadow"><div class="mt-0.5"><input type="checkbox" ${iss.isResolved ? 'checked' : ''} onchange="window.toggleIssueStatus('${iss.id}', this.checked)" class="w-4 h-4 text-emerald-600 rounded border-gray-300 cursor-pointer"></div><div class="flex-1 flex flex-col gap-1"><div class="flex justify-between items-center"><span class="font-bold text-xs ${iss.isResolved ? 'text-emerald-700' : 'text-rose-600'}">${iss.authorName}</span><div class="flex gap-2">${(iss.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `<button data-id="${iss.id}" data-content="${safeText}" onclick="window.editIssue(this.dataset.id, this.dataset.content)" class="text-slate-400 hover:text-indigo-500"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteIssue('${iss.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>` : ''}</div></div><div class="text-[13px] font-medium ${iss.isResolved ? 'text-slate-400 line-through' : 'text-slate-700'} break-words">${iss.content}</div></div></li>`;
    }).join('');
};
window.saveIssueItem = async function() {
    const projectId = document.getElementById('issue-req-id').value; const editId = document.getElementById('editing-issue-id').value; const content = document.getElementById('new-issue-text').value.trim();
    if(!content) return window.showToast("이슈 내용을 입력하세요.", "error");
    try {
        if (editId) { await setDoc(doc(db, "project_issues", editId), { content }, { merge: true }); window.showToast("이슈가 수정되었습니다."); } else { await addDoc(collection(db, "project_issues"), { projectId, content, isResolved: false, authorUid: window.currentUser.uid, authorName: window.userProfile.name, createdAt: Date.now() }); window.showToast("이슈가 등록되었습니다."); }
        document.getElementById('editing-issue-id').value = ''; document.getElementById('new-issue-text').value = ''; document.getElementById('btn-issue-save').innerText = '등록';
    } catch(e) { window.showToast("저장 중 오류 발생", "error"); }
};
window.toggleIssueStatus = async function(id, isResolved) { try { await setDoc(doc(db, "project_issues", id), { isResolved }, { merge: true }); } catch(e) { window.showToast("상태 변경 오류", "error"); } };
window.editIssue = function(id, content) { document.getElementById('editing-issue-id').value = id; document.getElementById('new-issue-text').value = content; document.getElementById('btn-issue-save').innerText = '수정'; document.getElementById('new-issue-text').focus(); };
window.deleteIssue = async function(id) { if(!confirm("이 이슈를 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "project_issues", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };

// 🌟 다중 링크 관리
window.openLinkModal = function(projectId, projectName) { document.getElementById('link-req-id').value = projectId; document.getElementById('link-project-title').innerText = projectName; document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; document.getElementById('link-modal').classList.remove('hidden'); document.getElementById('link-modal').classList.add('flex'); window.renderLinksList(projectId); };
window.closeLinkModal = function() { document.getElementById('link-modal').classList.add('hidden'); document.getElementById('link-modal').classList.remove('flex'); };
window.renderLinksList = function(projectId) {
    const proj = window.currentProjectStatusList.find(p => p.id === projectId); const list = document.getElementById('link-list');
    if(!proj || !proj.links || proj.links.length === 0) { list.innerHTML = '<li class="p-4 text-center text-slate-400 font-bold text-xs">등록된 문서/링크가 없습니다.</li>'; return; }
    list.innerHTML = proj.links.map((lnk, idx) => `<li class="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors group"><div class="flex flex-col truncate"><span class="font-bold text-teal-700 text-xs">${lnk.name}</span><a href="${lnk.url}" target="_blank" class="text-[10px] text-slate-400 hover:text-teal-500 truncate mt-0.5">${lnk.url}</a></div><button onclick="window.deleteLinkItem('${projectId}', ${idx})" class="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-2"><i class="fa-solid fa-trash-can"></i></button></li>`).join('');
};
window.saveLinkItem = async function() {
    const projectId = document.getElementById('link-req-id').value; const name = document.getElementById('new-link-name').value.trim() || '참고 링크'; const url = document.getElementById('new-link-url').value.trim();
    if(!url) return window.showToast("링크 URL을 입력하세요.", "error");
    const proj = window.currentProjectStatusList.find(p => p.id === projectId); let links = proj?.links ? [...proj.links] : []; links.push({ name, url: url.startsWith('http') ? url : 'https://' + url });
    try { await setDoc(doc(db, "projects_status", projectId), { links }, { merge: true }); window.showToast("링크가 추가되었습니다."); document.getElementById('new-link-name').value = ''; document.getElementById('new-link-url').value = ''; window.renderLinksList(projectId); } catch(e) { window.showToast("추가 실패", "error"); }
};
window.deleteLinkItem = async function(projectId, index) {
    if(!confirm("이 링크를 삭제하시겠습니까?")) return;
    const proj = window.currentProjectStatusList.find(p => p.id === projectId); if(!proj || !proj.links) return;
    let links = [...proj.links]; links.splice(index, 1);
    try { await setDoc(doc(db, "projects_status", projectId), { links }, { merge: true }); window.showToast("링크가 삭제되었습니다."); window.renderLinksList(projectId); } catch(e) { window.showToast("삭제 실패", "error"); }
};
