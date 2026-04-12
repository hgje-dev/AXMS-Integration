/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, onSnapshot, query, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 💡 PJT 현황 파일 저장용 구글 드라이브 폴더
const PJT_STATUS_FOLDER_ID = '1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ';

let unsubscribePjt = null;

window.loadProjectStatus = function() {
    const main = document.getElementById('app-content');
    if(!main) return;
    
    main.innerHTML = `
    <div class="space-y-6">
        <div class="flex justify-between items-center bg-white p-6 rounded-3xl border shadow-sm">
            <div>
                <h2 class="text-2xl font-black text-slate-800">📊 PJT 현황판</h2>
                <p class="text-xs text-slate-400 font-bold mt-1 uppercase">Project Lifecycle Management</p>
            </div>
            <button onclick="window.initGoogleAPI()" class="bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm">구글 드라이브 연동</button>
        </div>

        <div class="bg-white rounded-3xl border shadow-sm overflow-hidden overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-[1100px]">
                <thead class="bg-slate-800 text-white text-[11px] uppercase tracking-widest">
                    <tr>
                        <th class="p-4 text-center w-16">No</th>
                        <th class="p-4 w-40">프로젝트명</th>
                        <th class="p-4 w-28 text-center text-blue-300">구매</th>
                        <th class="p-4 w-28 text-center text-emerald-300">설계</th>
                        <th class="p-4 w-28 text-center text-amber-300">일정</th>
                        <th class="p-4">생산일지(진행현황)</th>
                        <th class="p-4 text-center w-28">최종업데이트</th>
                    </tr>
                </thead>
                <tbody id="pjt-list-tbody" class="divide-y text-xs"></tbody>
            </table>
        </div>
    </div>`;

    window.syncProjectList();
};

window.syncProjectList = function() {
    if(unsubscribePjt) unsubscribePjt();
    unsubscribePjt = onSnapshot(query(collection(db, "projects"), orderBy("updatedAt", "desc")), (snapshot) => {
        const tb = document.getElementById('pjt-list-tbody');
        if(!tb) return;
        
        let html = '';
        let count = 1;
        snapshot.forEach(d => {
            const p = d.data();
            const id = d.id;
            const buyIcon = p.buyFileUrl ? 'text-blue-500' : 'text-slate-200';
            const designIcon = p.designFileUrl ? 'text-emerald-500' : 'text-slate-200';
            const schIcon = p.schFileUrl ? 'text-amber-500' : 'text-slate-200';
            const upDate = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '-';

            html += `
            <tr class="hover:bg-slate-50 cursor-pointer transition-colors border-b" onclick="window.openProjectDetailModal('${id}')">
                <td class="p-4 text-center font-bold text-slate-400">${count++}</td>
                <td class="p-4 font-black text-slate-700">${p.name || '이름 없음'}</td>
                <td class="p-4 text-center"><i class="fa-solid fa-file-invoice ${buyIcon} text-lg"></i></td>
                <td class="p-4 text-center"><i class="fa-solid fa-drafting-compass ${designIcon} text-lg"></i></td>
                <td class="p-4 text-center"><i class="fa-solid fa-calendar-days ${schIcon} text-lg"></i></td>
                <td class="p-4 text-slate-600 font-medium">${(p.statusText || '내용 없음').substring(0, 80)}...</td>
                <td class="p-4 text-center text-slate-400 font-bold">${upDate}</td>
            </tr>`;
        });
        tb.innerHTML = html || '<tr><td colspan="7" class="p-10 text-center text-slate-400 font-bold">등록된 프로젝트가 없습니다.</td></tr>';
    });
};

window.openProjectDetailModal = async function(id) {
    const querySnapshot = await getDocs(collection(db, "projects"));
    let p = null;
    querySnapshot.forEach(doc => { if(doc.id === id) p = doc.data(); });
    if(!p) return;

    document.getElementById('pjt-detail-id').value = id;
    document.getElementById('pjt-modal-title').innerText = `[${p.name}] 프로젝트 상세 관리`;
    document.getElementById('pjt-buy-text').value = p.buyText || '';
    document.getElementById('pjt-sch-text').value = p.schText || '';
    document.getElementById('pjt-detail-status').value = p.statusText || '';

    const bL = document.getElementById('pjt-buy-file-link');
    bL.innerHTML = p.buyFileUrl ? `<a href="${p.buyFileUrl}" target="_blank" class="hover:underline">📎 구매 일정표 보기</a>` : '';
    bL.classList.toggle('hidden', !p.buyFileUrl);

    const dL = document.getElementById('pjt-design-file-link');
    dL.innerHTML = p.designFileUrl ? `<a href="${p.designFileUrl}" target="_blank" class="hover:underline">📎 설계 도면 보기</a>` : '';
    dL.classList.toggle('hidden', !p.designFileUrl);

    const sL = document.getElementById('pjt-sch-file-link');
    sL.innerHTML = p.schFileUrl ? `<a href="${p.schFileUrl}" target="_blank" class="hover:underline">📎 전체 일정표 보기</a>` : '';
    sL.classList.toggle('hidden', !p.schFileUrl);

    document.getElementById('project-detail-modal').classList.remove('hidden');
    document.getElementById('project-detail-modal').classList.add('flex');
};

window.closeProjectDetailModal = function() {
    document.getElementById('project-detail-modal').classList.add('hidden');
};

window.saveProjectDetail = async function() {
    const id = document.getElementById('pjt-detail-id').value;
    if(!id) return;
    window.showToast("데이터 및 파일 업로드 중...");

    try {
        const payload = {
            buyText: document.getElementById('pjt-buy-text').value,
            schText: document.getElementById('pjt-sch-text').value,
            statusText: document.getElementById('pjt-detail-status').value,
            updatedAt: Date.now()
        };

        // 파일 업로드 처리
        const buyF = document.getElementById('pjt-buy-file').files[0];
        const designF = document.getElementById('pjt-design-file').files[0];
        const schF = document.getElementById('pjt-sch-file').files[0];

        if(buyF) { const fId = await window.uploadFileToDrive(buyF, PJT_STATUS_FOLDER_ID); payload.buyFileUrl = `https://drive.google.com/file/d/${fId}/view`; }
        if(designF) { const fId = await window.uploadFileToDrive(designF, PJT_STATUS_FOLDER_ID); payload.designFileUrl = `https://drive.google.com/file/d/${fId}/view`; }
        if(schF) { const fId = await window.uploadFileToDrive(schF, PJT_STATUS_FOLDER_ID); payload.schFileUrl = `https://drive.google.com/file/d/${fId}/view`; }

        await setDoc(doc(db, "projects", id), payload, { merge: true });
        window.showToast("저장 완료!");
        window.closeProjectDetailModal();
    } catch(e) { window.showToast("저장 에러: " + e.message, "error"); }
};
