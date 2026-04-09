import { db } from './firebase.js';
import { collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, onSnapshot, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
        const safeNameJs = (item.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const safeNameHtml = (item.name || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // 🌟 여러 개의 링크 아이콘 표시 로직
        let linksHtml = '';
        if(item.links && Array.isArray(item.links) && item.links.length > 0) {
            linksHtml = item.links.map(lnk => `<a href="${lnk.url}" target="_blank" title="${lnk.name}" class="text-teal-500 hover:text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded transition-colors"><i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i></a>`).join('');
        }
        
        return `<tr class="hover:bg-indigo-50/50 transition-colors cursor-pointer" onclick="window.editProjStatus('${item.id}')">
            <td class="border border-slate-200 px-2 py-1 text-center bg-white sticky left-0 z-10" onclick="event.stopPropagation()"><button onclick="window.deleteProjStatus('${item.id}')" class="text-slate-400 hover:text-rose-500 mx-1"><i class="fa-solid fa-trash-can"></i></button></td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.category || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">
                <button onclick="window.openCommentModal('${item.id}', '${safeNameJs}')" class="text-amber-500 hover:text-amber-600 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded shadow-sm relative"><i class="fa-regular fa-comment-dots"></i> ${window.projectCommentCounts[item.id] ? `<span class="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">${window.projectCommentCounts[item.id]}</span>` : ''}</button>
            </td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">
                <button onclick="window.openIssueModal('${item.id}', '${safeNameJs}')" class="text-rose-500 hover:text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded shadow-sm relative"><i class="fa-solid fa-triangle-exclamation"></i> ${window.projectIssueCounts[item.id] ? `<span class="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">${window.projectIssueCounts[item.id]}</span>` : ''}</button>
            </td>
            <td class="border border-slate-200 px-2 py-1 text-center font-bold text-indigo-700">${item.code || ''}</td>
            <td class="border border-slate-200 px-2 py-1 truncate max-w-[150px]">${safeNameHtml}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.company || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center font-black text-emerald-600">${item.progress || 0}%</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${statusMap[item.status] || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center">${item.manager || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center" onclick="event.stopPropagation()">
                <button onclick="window.openDailyLogModal('${item.id}', '${safeNameJs}')" class="text-sky-500 hover:text-sky-600 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded shadow-sm"><i class="fa-solid fa-book"></i></button>
            </td>
            <td class="border border-slate-200 px-2 py-1 text-center text-sky-600">${item.estMd || 0}</td>
            <td class="border border-slate-200 px-1 py-1 text-center font-bold" onclick="event.stopPropagation()">
                <button onclick="window.openMdLogModal('${item.id}', '${safeNameJs}', ${item.currentMd || 0})" class="text-purple-600 hover:bg-purple-50 w-full h-full py-0.5 rounded underline decoration-purple-300">${item.currentMd || 0}</button>
            </td>
            <td class="border border-slate-200 px-2 py-1 text-center text-sky-600 font-bold">${fMd.toFixed(1)}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.totPers || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outPers || ''}</td>
            <td class="border border-slate-200 px-2 py-1 text-center text-amber-600">${item.outMd || ''}</td>
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
    document.getElementById('ps-id').value = item.id; document.getElementById('ps-code').value = item.code || ''; document.getElementById('ps-name').value = item.name || ''; document.getElementById('ps-company').value = item.company || ''; document.getElementById('ps-part').value = item.part || '제조'; document.getElementById('ps-category').value = item.category || '설비'; document.getElementById('ps-status').value = item.status || 'pending'; document.getElementById('ps-progress-pct').value = item.progress || 0; document.getElementById('ps-manager').value = item.manager || '';
    document.getElementById('ps-est-md').value = item.estMd || ''; document.getElementById('ps-current-md').value = item.currentMd || ''; document.getElementById('ps-final-md').value = ((parseFloat(item.currentMd)||0) + (parseFloat(item.outMd)||0)).toFixed(1); document.getElementById('ps-tot-pers').value = item.totPers || ''; document.getElementById('ps-out-pers').value = item.outPers || ''; document.getElementById('ps-out-md').value = item.outMd || '';
    ['ps-d-rcv-est', 'ps-d-asm-est', 'ps-d-asm-end-est', 'ps-d-ship-est', 'ps-d-asm-st', 'ps-d-asm-en', 'ps-d-ins-st', 'ps-d-ins-en', 'ps-d-ship-en', 'ps-d-set-st', 'ps-d-set-en'].forEach(id => { const key = id.replace('ps-', '').replace(/-([a-z])/g, g => g[1].toUpperCase()); document.getElementById(id).value = item[key] || ''; });
    document.getElementById('proj-status-write-modal').classList.remove('hidden'); document.getElementById('proj-status-write-modal').classList.add('flex');
};
window.saveProjStatus = async function(btn) {
    const id = document.getElementById('ps-id').value; const code = document.getElementById('ps-code').value; const name = document.getElementById('ps-name').value;
    if(!code || !name) return window.showToast("코드와 이름을 입력하세요.", "error");
    btn.disabled = true; btn.innerHTML = '저장중...';
    const data = { code: code, name: name, company: document.getElementById('ps-company').value, part: document.getElementById('ps-part').value, category: document.getElementById('ps-category').value, status: document.getElementById('ps-status').value, progress: parseInt(document.getElementById('ps-progress-pct').value) || 0, manager: document.getElementById('ps-manager').value, estMd: parseFloat(document.getElementById('ps-est-md').value) || 0, outMd: parseFloat(document.getElementById('ps-out-md').value) || 0, totPers: parseInt(document.getElementById('ps-tot-pers').value)||0, outPers: parseInt(document.getElementById('ps-out-pers').value)||0, d_rcvEst: document.getElementById('ps-d-rcv-est').value, d_asmEst: document.getElementById('ps-d-asm-est').value, d_asmEndEst: document.getElementById('ps-d-asm-end-est').value, d_shipEst: document.getElementById('ps-d-ship-est').value, d_asmSt: document.getElementById('ps-d-asm-st').value, d_asmEn: document.getElementById('ps-d-asm-en').value, d_insSt: document.getElementById('ps-d-ins-st').value, d_insEn: document.getElementById('ps-d-ins-en').value, d_shipEn: document.getElementById('ps-d-ship-en').value, d_setSt: document.getElementById('ps-d-set-st').value, d_setEn: document.getElementById('ps-d-set-en').value, updatedAt: serverTimestamp() };
    try { if(id) { await setDoc(doc(db, "projects_status", id), data, { merge: true }); window.showToast("수정되었습니다."); } else { data.createdAt = serverTimestamp(); data.currentMd = 0; await addDoc(collection(db, "projects_status"), data); window.showToast("등록되었습니다."); } window.closeProjStatusWriteModal(); } catch(e) { window.showToast("오류 발생", "error"); } finally { btn.disabled = false; btn.innerHTML = '현황 저장하기'; }
};
window.deleteProjStatus = async function(id) { if(!confirm("삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "projects_status", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); } };


// 🌟 PJT 마스터 일괄 추가 & 삭제 기능
window.toggleBulkPjtInput = function() {
    const bulkSection = document.getElementById('bulk-pjt-section');
    bulkSection.classList.toggle('hidden');
};

window.bulkAddProjectCodes = async function() {
    const text = document.getElementById('bulk-pjt-input').value;
    if(!text.trim()) return window.showToast("데이터를 붙여넣어 주세요.", "error");

    const lines = text.split('\n');
    const validItems = [];
    for(let line of lines) {
        if(!line.trim()) continue;
        let parts = line.split('\t');
        if(parts.length < 2) parts = line.split(',');
        if(parts.length < 2) parts = line.trim().split(/\s{2,}/);
        
        if(parts.length >= 2) {
            let code = parts[0].trim();
            let name = parts[1].trim();
            let company = parts.length > 2 ? parts[2].trim() : '-';
            
            if(code && name) {
                validItems.push({ code, name, company });
            }
        }
    }

    if(validItems.length === 0) return window.showToast("등록할 유효한 데이터가 없습니다.", "error");

    window.showToast(`${validItems.length}건의 코드를 서버에 등록 중입니다...`, "success");
    try {
        for(let i=0; i<validItems.length; i+=400) {
            const chunk = validItems.slice(i, i+400);
            const batch = writeBatch(db);
            chunk.forEach((item, idx) => {
                const docRef = doc(collection(db, "project_codes"));
                batch.set(docRef, { code: item.code, name: item.name, company: item.company, createdAt: Date.now() + i + idx });
            });
            await batch.commit();
        }
        window.showToast(`총 ${validItems.length}건 일괄 등록 완료!`);
        document.getElementById('bulk-pjt-input').value = '';
        window.toggleBulkPjtInput();
    } catch(e) { window.showToast("일괄 등록 중 오류 발생", "error"); console.error(e); }
};

window.deleteAllProjectCodes = async function() {
    if(!confirm("⚠️ 경고: 등록된 모든 마스터 코드를 정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
    const pwd = prompt("전체 삭제를 진행하려면 아래 텍스트를 정확히 입력하세요.\n[ 삭제확인 ]");
    if(pwd !== '삭제확인') return window.showToast("입력이 일치하지 않아 취소되었습니다.", "error");

    window.showToast("전체 데이터를 삭제 중입니다. 잠시만 기다려주세요...", "success");
    try {
        const snap = await getDocs(query(collection(db, "project_codes")));
        let batches = []; let currentBatch = writeBatch(db); let count = 0;
        snap.forEach(doc => {
            currentBatch.delete(doc.ref); count++;
            if (count % 400 === 0) { batches.push(currentBatch.commit()); currentBatch = writeBatch(db); }
        });
        if (count % 400 !== 0) batches.push(currentBatch.commit());
        await Promise.all(batches);
        window.showToast(`총 ${count}건의 마스터 코드가 완전히 삭제되었습니다.`);
    } catch(e) { window.showToast("전체 삭제 중 오류가 발생했습니다.", "error"); console.error(e); }
};


// 🌟 생산일지 및 이미지 첨부 기능
window.resizeAndConvertToBase64 = function(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width; let height = img.height;
            const MAX = 800;
            if(width > height && width > MAX) { height *= MAX / width; width = MAX; }
            else if(height > MAX) { width *= MAX / height; height = MAX; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            callback(canvas.toDataURL('image/jpeg', 0.7)); // 압축률 70%
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.saveDailyLogItem = async function() {
    const projectId = document.getElementById('log-req-id').value;
    const logId = document.getElementById('editing-log-id').value;
    const date = document.getElementById('new-log-date').value;
    const content = document.getElementById('new-log-text').value.trim();
    const fileInput = document.getElementById('new-log-image');
    
    if(!date || !content) return window.showToast("날짜와 작업 내용을 모두 입력하세요.", "error");
    
    document.getElementById('btn-log-save').innerHTML = '저장중..';
    document.getElementById('btn-log-save').disabled = true;

    const saveData = async (base64Img) => {
        try {
            const payload = { date, content, updatedAt: Date.now() };
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
            window.resetDailyLogForm();
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
            console.error(e);
        } finally {
            document.getElementById('btn-log-save').innerHTML = '등록';
            document.getElementById('btn-log-save').disabled = false;
        }
    };

    if(fileInput.files.length > 0) {
        window.resizeAndConvertToBase64(fileInput.files[0], (base64) => {
            saveData(base64);
        });
    } else {
        saveData(null);
    }
};

window.resetDailyLogForm = function() {
    document.getElementById('editing-log-id').value = '';
    document.getElementById('new-log-date').value = window.getLocalDateStr(new Date());
    document.getElementById('new-log-text').value = '';
    document.getElementById('new-log-image').value = '';
    document.getElementById('btn-log-save').innerText = '등록';
    document.getElementById('btn-log-cancel').classList.add('hidden');
};

window.editDailyLog = function(id, date, content) {
    document.getElementById('editing-log-id').value = id;
    document.getElementById('new-log-date').value = date;
    document.getElementById('new-log-text').value = content;
    document.getElementById('btn-log-save').innerText = '수정';
    document.getElementById('btn-log-cancel').classList.remove('hidden');
    document.getElementById('new-log-text').focus();
};

window.renderDailyLogs = function(logs) {
    const list = document.getElementById('daily-log-list');
    if (logs.length === 0) { list.innerHTML = '<div class="text-center p-6 text-slate-400 font-bold">등록된 생산일지가 없습니다.</div>'; return; }
    
    list.innerHTML = logs.map(log => {
        const safeContent = (log.content || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        const imgHtml = log.imageUrl ? `<div class="mt-2 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[200px]"><img src="${log.imageUrl}" class="w-full h-auto" onclick="window.open('${log.imageUrl}')"></div>` : '';
        return `
        <li class="bg-white p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col gap-1 hover:shadow-md transition-shadow">
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-sky-600 text-[10px] bg-sky-50 px-1.5 py-0.5 rounded shadow-inner"><i class="fa-regular fa-calendar-check mr-1"></i>${log.date}</span>
                    <span class="font-bold text-slate-700 text-xs">${log.authorName}</span>
                </div>
                <div class="flex gap-2">
                    ${(log.authorUid === window.currentUser?.uid || window.userProfile?.role === 'admin') ? `
                        <button data-id="${log.id}" data-date="${log.date}" data-content="${safeContent}" onclick="window.editDailyLog(this.dataset.id, this.dataset.date, this.dataset.content)" class="text-slate-400 hover:text-sky-500 transition-colors" title="수정"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="window.deleteDailyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors" title="삭제"><i class="fa-solid fa-trash-can"></i></button>
                    ` : ''}
                </div>
            </div>
            <div class="text-slate-700 font-medium text-[13px] pl-1 mt-1 break-words">${log.content}</div>
            ${imgHtml}
        </li>
        `;
    }).join('');
};


// 🌟 다중 링크 관리 기능
window.openLinkModal = function(projectId, projectName) {
    document.getElementById('link-req-id').value = projectId;
    document.getElementById('link-project-title').innerText = projectName;
    document.getElementById('new-link-name').value = '';
    document.getElementById('new-link-url').value = '';
    document.getElementById('link-modal').classList.remove('hidden');
    document.getElementById('link-modal').classList.add('flex');
    window.renderLinksList(projectId);
};

window.closeLinkModal = function() {
    document.getElementById('link-modal').classList.add('hidden');
    document.getElementById('link-modal').classList.remove('flex');
};

window.renderLinksList = function(projectId) {
    const proj = window.currentProjectStatusList.find(p => p.id === projectId);
    const list = document.getElementById('link-list');
    
    if(!proj || !proj.links || proj.links.length === 0) {
        list.innerHTML = '<li class="p-4 text-center text-slate-400 font-bold text-xs">등록된 문서/링크가 없습니다.</li>';
        return;
    }
    
    list.innerHTML = proj.links.map((lnk, idx) => `
        <li class="flex justify-between items-center p-3 hover:bg-slate-50 transition-colors group">
            <div class="flex flex-col truncate">
                <span class="font-bold text-teal-700 text-xs">${lnk.name}</span>
                <a href="${lnk.url}" target="_blank" class="text-[10px] text-slate-400 hover:text-teal-500 truncate mt-0.5">${lnk.url}</a>
            </div>
            <button onclick="window.deleteLinkItem('${projectId}', ${idx})" class="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all p-2"><i class="fa-solid fa-trash-can"></i></button>
        </li>
    `).join('');
};

window.saveLinkItem = async function() {
    const projectId = document.getElementById('link-req-id').value;
    const name = document.getElementById('new-link-name').value.trim() || '참고 링크';
    const url = document.getElementById('new-link-url').value.trim();
    
    if(!url) return window.showToast("링크 URL을 입력하세요.", "error");
    
    const proj = window.currentProjectStatusList.find(p => p.id === projectId);
    let links = proj?.links ? [...proj.links] : [];
    links.push({ name, url: url.startsWith('http') ? url : 'https://' + url });
    
    try {
        await setDoc(doc(db, "projects_status", projectId), { links }, { merge: true });
        window.showToast("링크가 추가되었습니다.");
        document.getElementById('new-link-name').value = '';
        document.getElementById('new-link-url').value = '';
        window.renderLinksList(projectId);
    } catch(e) { window.showToast("추가 실패", "error"); }
};

window.deleteLinkItem = async function(projectId, index) {
    if(!confirm("이 링크를 삭제하시겠습니까?")) return;
    const proj = window.currentProjectStatusList.find(p => p.id === projectId);
    if(!proj || !proj.links) return;
    
    let links = [...proj.links];
    links.splice(index, 1);
    
    try {
        await setDoc(doc(db, "projects_status", projectId), { links }, { merge: true });
        window.showToast("링크가 삭제되었습니다.");
        window.renderLinksList(projectId);
    } catch(e) { window.showToast("삭제 실패", "error"); }
};


// 코멘트/일별MD 관련 자잘한 함수들은 기존 코드를 유지 (용량상 생략하지만 이전 파일을 그대로 덮어쓰거나 유지하시면 됩니다)
