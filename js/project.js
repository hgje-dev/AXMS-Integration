import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, addDoc, deleteDoc, query, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let projectStatusSnapshotUnsubscribe=null;

window.switchProjPartTab = function(part) {
    window.currentProjPartTab = part; window.currentCategoryFilter = 'all'; const catSelect = document.getElementById('filter-category-select'); if(catSelect) catSelect.value = 'all';
    document.getElementById('btn-part-mfg').className = part === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    document.getElementById('btn-part-opt').className = part === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
    window.loadProjectStatusData();
};

window.filterByCategory = function(category) { window.currentCategoryFilter = category; if(window.currentProjDashView === 'gantt') { if(window.renderProjGantt) window.renderProjGantt(); } else { window.renderProjectStatusList(); } };

window.loadProjectStatusData = function() {
    if(projectStatusSnapshotUnsubscribe) projectStatusSnapshotUnsubscribe();
    projectStatusSnapshotUnsubscribe = onSnapshot(query(collection(db, "projects_status")), (snapshot) => {
        window.currentProjectStatusList = [];
        snapshot.forEach(doc => { const data = doc.data(); if(data.part === window.currentProjPartTab) { window.currentProjectStatusList.push({ id: doc.id, ...data }); } });
        window.currentProjectStatusList.sort((a,b) => { const tA = a.createdAt ? a.createdAt.toMillis() : 0; const tB = b.createdAt ? b.createdAt.toMillis() : 0; return tB - tA; });
        if(window.updateMiniDashboard) window.updateMiniDashboard();
        if(window.currentProjDashView === 'gantt' && window.renderProjGantt) window.renderProjGantt(); else window.renderProjectStatusList();
    });
};

window.renderProjectStatusList = function() {
    const tbody = document.getElementById('proj-dash-tbody'); if(!tbody) return;
    let displayList = window.currentProjectStatusList;
    if(window.currentCategoryFilter && window.currentCategoryFilter !== 'all') displayList = displayList.filter(item => item.category === window.currentCategoryFilter);
    if(displayList.length === 0) { tbody.innerHTML = `<tr><td colspan="28" class="text-center p-6 text-slate-400 font-bold">등록된 PJT 현황이 없습니다.</td></tr>`; return; }
    
    const statusMap = { 'pending':'대기', 'progress':'진행중', 'inspecting':'검수중', 'completed':'완료', 'rejected':'보류' };
    tbody.innerHTML = displayList.map(item => {
        const fMd = item.finalMd || ((parseFloat(item.currentMd) || 0) + (parseFloat(item.outMd) || 0));
        return `<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer" onclick="window.editProjStatus('${item.id}')">
            <td class="border border-slate-200 px-2 py-1 text-center bg-white sticky left-0 z-10" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-400 hover:text-rose-500 mx-1"><i class="fa-solid fa-trash-can"></i></button></td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.category || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${statusMap[item.status] || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700">${item.code || ''}</td>
            <td class="border border-slate-200 px-2 py-1 truncate max-w-[150px]">${item.name || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.company || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center font-black text-emerald-600">${item.progress || 0}%</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.manager || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd || 0}</td>
            <td class="border border-slate-200 px-1 py-1 text-center font-bold">${item.currentMd || 0}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-sky-600 font-bold">${fMd.toFixed(1)}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center bg-rose-50/50 text-rose-700">${item.d_shipEst || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center bg-indigo-50/50">${item.d_asmEst || ''}</td>
        </tr>`;
    }).join('');
};

window.openProjStatusWriteModal = function() {
    document.getElementById('ps-id').value = ''; document.getElementById('ps-code').value = ''; document.getElementById('ps-name').value = ''; document.getElementById('ps-company').value = ''; document.getElementById('ps-part').value = window.currentProjPartTab || '제조'; document.getElementById('ps-category').value = '설비'; document.getElementById('ps-status').value = 'pending'; document.getElementById('ps-progress-pct').value = '0';
    ['ps-est-md', 'ps-current-md', 'ps-final-md', 'ps-tot-pers', 'ps-out-pers', 'ps-out-md', 'ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-ship-est', 'ps-d-ship-en'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};

window.closeProjStatusWriteModal = function() { document.getElementById('proj-status-write-modal').classList.add('hidden'); document.getElementById('proj-status-write-modal').classList.remove('flex'); };

window.saveProjStatus = async function(btn) {
    const id = document.getElementById('ps-id').value; const code = document.getElementById('ps-code').value; const name = document.getElementById('ps-name').value;
    if(!code || !name) return window.showToast("코드와 이름을 입력하세요.", "error");
    btn.disabled = true; btn.innerHTML = '저장중...';
    const data = { code: code, name: name, company: document.getElementById('ps-company').value, part: document.getElementById('ps-part').value, category: document.getElementById('ps-category').value, status: document.getElementById('ps-status').value, progress: parseInt(document.getElementById('ps-progress-pct').value) || 0, manager: document.getElementById('ps-manager').value, estMd: parseFloat(document.getElementById('ps-est-md').value) || 0, d_shipEst: document.getElementById('ps-d-ship-est').value, updatedAt: serverTimestamp() };
    try { if(id) { await setDoc(doc(db, "projects_status", id), data, { merge: true }); window.showToast("수정되었습니다."); } else { data.createdAt = serverTimestamp(); data.currentMd = 0; await addDoc(collection(db, "projects_status"), data); window.showToast("등록되었습니다."); } window.closeProjStatusWriteModal(); } catch(e) { window.showToast("오류 발생", "error"); } finally { btn.disabled = false; btn.innerHTML = '현황 저장하기'; }
};

window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };
