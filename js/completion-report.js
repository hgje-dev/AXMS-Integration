import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let crProjectsUnsubscribe = null;
let currentInspUnsubscribe = null;

const CR_DRIVE_PARENT_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ"; // PJT 현황 메인 폴더

window.initQualityReport = function() {
    console.log("✅ 품질 완료보고 페이지 로드 완료");
    window.loadCrProjects();
    if(window.initGoogleAPI) window.initGoogleAPI();
};

window.loadCrProjects = function() {
    if (crProjectsUnsubscribe) crProjectsUnsubscribe();
    
    // 프로젝트 현황 전체를 가져와서 프론트에서 필터링 (검색 용이성)
    crProjectsUnsubscribe = onSnapshot(collection(db, "projects_status"), (snapshot) => {
        window.crProjectList = [];
        snapshot.forEach(docSnap => {
            window.crProjectList.push({ id: docSnap.id, ...docSnap.data() });
        });
        window.filterCrList();
    });
};

window.filterCrList = function() {
    const search = document.getElementById('cr-search')?.value.toLowerCase() || '';
    
    let filtered = window.crProjectList.filter(p => {
        // 기본적으로 '완료(출하)' 상태인 것 위주로 보여주되, 원하면 진행중인 것도 검수리스트 작성이 가능하도록
        // 일단 모든 프로젝트를 띄우되 검색으로 필터링
        let match = true;
        if (search) {
            const str = `${p.code||''} ${p.name||''} ${p.company||''}`.toLowerCase();
            match = str.includes(search) || (window.matchString && window.matchString(search, str));
        }
        return match;
    });

    // 상태순(완료가 위로 오게 하거나, 최신순 등 정렬)
    filtered.sort((a,b) => {
        if(a.status === 'completed' && b.status !== 'completed') return -1;
        if(a.status !== 'completed' && b.status === 'completed') return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    window.renderCrList(filtered);
};

window.renderCrList = function(list) {
    const tbody = document.getElementById('cr-tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 font-bold">프로젝트가 없습니다.</td></tr>`;
        return;
    }

    const sMap = { 
        'pending': '<span class="text-slate-500 font-bold text-[11px]">대기</span>', 
        'progress': '<span class="text-blue-600 font-bold text-[11px]">진행(제작)</span>', 
        'inspecting': '<span class="text-amber-600 font-bold text-[11px]">진행(검수)</span>', 
        'completed': '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-black text-[11px] border border-emerald-200">완료(출하)</span>', 
        'rejected': '<span class="text-rose-600 font-bold text-[11px]">보류</span>' 
    };

    tbody.innerHTML = list.map(p => {
        const safeName = (p.name || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        
        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="p-3 text-center text-slate-500 font-bold">${p.category || '-'}</td>
                <td class="p-3 text-center font-black text-indigo-700">${p.code || '-'}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[300px]" title="${p.name}">${p.name || '-'}</td>
                <td class="p-3 text-center text-slate-600">${p.company || '-'}</td>
                <td class="p-3 text-center">${sMap[p.status] || p.status}</td>
                <td class="p-3 text-center">
                    <button onclick="window.openInspectionModal('${p.id}', '${safeName}', '${p.code}')" class="bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-list-check"></i> 검수리스트
                    </button>
                </td>
                <td class="p-3 text-center">
                    <button onclick="window.openCompletionReportModal('${p.id}', '${safeName}', '${p.code}')" class="bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-file-shield"></i> 완료보고
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

// ==========================================
// 1. 검수 리스트 (Inspection List) 관리
// ==========================================
window.openInspectionModal = function(pId, pName, pCode) {
    document.getElementById('insp-pjt-id').value = pId;
    document.getElementById('insp-pjt-id').dataset.code = pCode || '';
    document.getElementById('insp-project-title').innerText = `[${pCode||'미지정'}] ${pName}`;
    
    document.getElementById('new-insp-text').value = '';
    document.getElementById('new-insp-file').value = '';
    document.getElementById('insp-file-name').innerText = '';
    
    document.getElementById('cr-inspection-modal').classList.remove('hidden');
    document.getElementById('cr-inspection-modal').classList.add('flex');

    if (currentInspUnsubscribe) currentInspUnsubscribe();
    currentInspUnsubscribe = onSnapshot(query(collection(db, "project_inspections"), where("projectId", "==", pId)), (snap) => {
        let list = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        list.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
        
        const listEl = document.getElementById('inspection-list');
        if(list.length === 0) {
            listEl.innerHTML = '<div class="text-center p-8 text-slate-400 font-bold">등록된 검수리스트가 없습니다.</div>';
            return;
        }

        listEl.innerHTML = list.map(item => {
            let dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : '';
            let safeContent = String(item.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            return `
                <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-emerald-700 text-sm">${item.authorName || '작성자'}</span>
                            <span class="text-[10px] text-slate-400 font-medium">${dateStr}</span>
                        </div>
                        <button onclick="window.deleteInspectionItem('${item.id}')" class="text-slate-300 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                    <div class="text-sm text-slate-700 font-medium break-words">${safeContent}</div>
                    ${item.fileUrl ? `<a href="${item.fileUrl}" target="_blank" class="text-xs text-emerald-600 hover:text-emerald-800 font-bold underline mt-1 w-fit"><i class="fa-solid fa-file-arrow-down"></i> 검수리스트 파일 열기</a>` : ''}
                </div>
            `;
        }).join('');
    });
};

window.closeInspectionModal = function() {
    document.getElementById('cr-inspection-modal').classList.add('hidden');
    document.getElementById('cr-inspection-modal').classList.remove('flex');
    if (currentInspUnsubscribe) currentInspUnsubscribe();
};

window.saveInspectionItem = async function() {
    const pId = document.getElementById('insp-pjt-id').value;
    const pCode = document.getElementById('insp-pjt-id').dataset.code;
    const title = document.getElementById('insp-project-title').innerText;
    const content = document.getElementById('new-insp-text').value.trim();
    const fileInput = document.getElementById('new-insp-file');
    const btn = document.getElementById('btn-insp-save');

    if (!content && fileInput.files.length === 0) {
        return window.showToast("내용을 입력하거나 파일을 첨부하세요.", "error");
    }

    btn.innerHTML = '저장중...'; btn.disabled = true;

    try {
        let fileUrl = null;
        if (fileInput.files.length > 0) {
            if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다. [구글 드라이브 연동] 버튼을 클릭하세요.");
            
            window.showToast("파일을 드라이브에 업로드 중입니다...");
            
            // 1. PJT 폴더 확인/생성
            const folderName = pCode ? pCode : title;
            const pjtFolderId = await window.getOrCreateDriveFolder(folderName, CR_DRIVE_PARENT_FOLDER);
            
            // 2. '검수리스트' 하위 폴더 확인/생성
            const inspFolderId = await window.getOrCreateDriveFolder("검수리스트", pjtFolderId);

            // 3. 파일 업로드 로직 (기존 함수 재활용 혹은 직접 fetch)
            const metadata = { name: fileInput.files[0].name, parents: [inspFolderId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', fileInput.files[0]);
            
            const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + window.googleAccessToken },
                body: form
            });
            
            if (!res.ok) throw new Error("업로드 실패");
            const data = await res.json();
            fileUrl = `https://drive.google.com/file/d/${data.id}/view`;
        }

        await addDoc(collection(db, "project_inspections"), {
            projectId: pId,
            content: content,
            fileUrl: fileUrl,
            authorUid: window.currentUser?.uid || 'guest',
            authorName: window.userProfile?.name || '알수없음',
            createdAt: Date.now()
        });

        window.showToast("검수리스트가 등록되었습니다.");
        document.getElementById('new-insp-text').value = '';
        document.getElementById('new-insp-file').value = '';
        document.getElementById('insp-file-name').innerText = '';

    } catch(e) {
        window.showToast(e.message, "error");
    } finally {
        btn.innerHTML = '등록'; btn.disabled = false;
    }
};

window.deleteInspectionItem = async function(id) {
    if(confirm("이 검수리스트를 삭제하시겠습니까?")) {
        try {
            await deleteDoc(doc(db, "project_inspections", id));
            window.showToast("삭제되었습니다.");
        } catch(e) { window.showToast("삭제 실패", "error"); }
    }
};


// ==========================================
// 2. 품질 완료보고 (Completion Report) 관리
// ==========================================
window.openCompletionReportModal = async function(pId, pName, pCode) {
    document.getElementById('cr-rep-pjt-id').value = pId;
    document.getElementById('cr-rep-project-title').innerText = `[${pCode||'미지정'}] ${pName}`;
    
    // 초기화
    document.getElementById('cr-rep-doc-id').value = '';
    ['cr-int-start', 'cr-int-end', 'cr-ext-start', 'cr-ext-end', 'cr-comments'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('cr-int-status').value = '미진행';
    document.getElementById('cr-ext-status').value = '미진행';
    document.getElementById('cr-lessons-tbody').innerHTML = '';
    
    document.getElementById('cr-comment-img').value = '';
    document.getElementById('cr-img-name').innerText = '';
    document.getElementById('cr-saved-img-container').classList.add('hidden');
    document.getElementById('cr-saved-img').src = '';

    document.getElementById('cr-report-modal').classList.remove('hidden');
    document.getElementById('cr-report-modal').classList.add('flex');

    try {
        const q = query(collection(db, "project_completion_reports"), where("projectId", "==", pId));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
            const docData = snap.docs[0].data();
            document.getElementById('cr-rep-doc-id').value = snap.docs[0].id;
            
            if(docData.internalSch) {
                document.getElementById('cr-int-start').value = docData.internalSch.start || '';
                document.getElementById('cr-int-end').value = docData.internalSch.end || '';
                document.getElementById('cr-int-status').value = docData.internalSch.status || '미진행';
            }
            if(docData.customerSch) {
                document.getElementById('cr-ext-start').value = docData.customerSch.start || '';
                document.getElementById('cr-ext-end').value = docData.customerSch.end || '';
                document.getElementById('cr-ext-status').value = docData.customerSch.status || '미진행';
            }
            
            document.getElementById('cr-comments').value = docData.comments || '';
            
            if(docData.commentImage) {
                document.getElementById('cr-saved-img').src = docData.commentImage;
                document.getElementById('cr-saved-img-container').classList.remove('hidden');
            }

            if(docData.lessons && docData.lessons.length > 0) {
                docData.lessons.forEach(l => window.addCrLessonRow(l));
            } else {
                window.addCrLessonRow();
            }
        } else {
            // 없으면 기본 row 1개 추가
            window.addCrLessonRow();
        }
    } catch(e) { console.error(e); }
};

window.closeCompletionReportModal = function() {
    document.getElementById('cr-report-modal').classList.add('hidden');
    document.getElementById('cr-report-modal').classList.remove('flex');
};

window.addCrLessonRow = function(data = null) {
    const tbody = document.getElementById('cr-lessons-tbody');
    const tr = document.createElement('tr');
    tr.className = "cr-lesson-row border-b border-slate-100 hover:bg-slate-50 transition-colors";
    
    const typeVal = data ? data.type : 'Good';
    const catVal = data ? data.category : '품질개선';
    const itemVal = data ? data.item : '';
    const hlVal = data ? data.highlight : '';
    const llVal = data ? data.lowlight : '';

    tr.innerHTML = `
        <td class="p-2 border-r border-slate-100">
            <select class="ls-type w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold outline-teal-500">
                <option value="Good" ${typeVal==='Good'?'selected':''} class="text-emerald-600">Good</option>
                <option value="Bad" ${typeVal==='Bad'?'selected':''} class="text-rose-600">Bad</option>
            </select>
        </td>
        <td class="p-2 border-r border-slate-100">
            <select class="ls-category w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-700 outline-teal-500">
                <option value="품질개선" ${catVal==='품질개선'?'selected':''}>품질개선</option>
                <option value="납기단축" ${catVal==='납기단축'?'selected':''}>납기단축</option>
                <option value="원가절감" ${catVal==='원가절감'?'selected':''}>원가절감</option>
                <option value="제작" ${catVal==='제작'?'selected':''}>제작</option>
            </select>
        </td>
        <td class="p-2 border-r border-slate-100">
            <input type="text" class="ls-item w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-teal-500" value="${itemVal}" placeholder="아이템명">
        </td>
        <td class="p-2 border-r border-slate-100">
            <textarea class="ls-high w-full border border-slate-300 rounded p-2 text-xs outline-teal-500 resize-y min-h-[40px]" placeholder="잘된 점 / 개선안">${hlVal}</textarea>
        </td>
        <td class="p-2 border-r border-slate-100">
            <textarea class="ls-low w-full border border-slate-300 rounded p-2 text-xs outline-teal-500 resize-y min-h-[40px]" placeholder="문제점 / 아쉬운 점">${llVal}</textarea>
        </td>
        <td class="p-2 text-center">
            <button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.removeSavedCrImage = async function() {
    if(!confirm("저장된 사진을 삭제하시겠습니까?")) return;
    document.getElementById('cr-saved-img-container').classList.add('hidden');
    document.getElementById('cr-saved-img').src = '';
    // 실제 저장은 save 버튼 누를때 반영됨 (또는 바로 업데이트 가능하지만 폼 일관성을 위해 뷰만 제거)
};

window.saveCompletionReport = async function() {
    const pId = document.getElementById('cr-rep-pjt-id').value;
    const docId = document.getElementById('cr-rep-doc-id').value;
    const btn = document.getElementById('btn-cr-save');
    
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중...';
    btn.disabled = true;

    try {
        let base64Image = document.getElementById('cr-saved-img').src; // 기존 이미지 유지
        if (document.getElementById('cr-saved-img-container').classList.contains('hidden')) {
            base64Image = null; // 사용자가 삭제 버튼을 누른 경우
        }

        const fileInput = document.getElementById('cr-comment-img');
        if (fileInput.files.length > 0) {
            base64Image = await new Promise((resolve) => {
                if(window.resizeAndConvertToBase64) {
                    window.resizeAndConvertToBase64(fileInput.files[0], res => resolve(res));
                } else { resolve(null); }
            });
        }

        const lessons = [];
        document.querySelectorAll('.cr-lesson-row').forEach(tr => {
            lessons.push({
                type: tr.querySelector('.ls-type').value,
                category: tr.querySelector('.ls-category').value,
                item: tr.querySelector('.ls-item').value.trim(),
                highlight: tr.querySelector('.ls-high').value.trim(),
                lowlight: tr.querySelector('.ls-low').value.trim()
            });
        });

        const payload = {
            projectId: pId,
            internalSch: {
                start: document.getElementById('cr-int-start').value,
                end: document.getElementById('cr-int-end').value,
                status: document.getElementById('cr-int-status').value
            },
            customerSch: {
                start: document.getElementById('cr-ext-start').value,
                end: document.getElementById('cr-ext-end').value,
                status: document.getElementById('cr-ext-status').value
            },
            comments: document.getElementById('cr-comments').value.trim(),
            commentImage: base64Image,
            lessons: lessons,
            authorUid: window.currentUser?.uid || 'guest',
            authorName: window.userProfile?.name || '알수없음',
            updatedAt: Date.now()
        };

        if (docId) {
            await setDoc(doc(db, "project_completion_reports", docId), payload, { merge: true });
        } else {
            payload.createdAt = Date.now();
            await addDoc(collection(db, "project_completion_reports"), payload);
        }

        window.showToast("완료보고서가 저장되었습니다.", "success");
        window.closeCompletionReportModal();

    } catch(e) {
        window.showToast("저장 실패: " + e.message, "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check"></i> 보고서 저장';
        btn.disabled = false;
    }
};
