/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, deleteDoc, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let qrUnsubscribe = null;
let pjtUnsubscribe = null;

window.qrReports = [];
window.qrProjects = {};
window.currentQrStatusFilter = 'all'; // 상태 필터 전역 변수

const QR_DRIVE_PARENT_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ"; // PJT 현황 메인 폴더

window.initQualityReport = function() {
    console.log("✅ 품질 완료보고 페이지 로드 완료");
    if(window.initGoogleAPI) window.initGoogleAPI();
    
    if(pjtUnsubscribe) pjtUnsubscribe();
    pjtUnsubscribe = onSnapshot(collection(db, "projects_status"), snap => {
        window.qrProjects = {};
        snap.forEach(d => { window.qrProjects[d.id] = d.data(); });
        
        window.loadQualityReports();
    });
};

window.loadQualityReports = function() {
    if(qrUnsubscribe) qrUnsubscribe();
    
    qrUnsubscribe = onSnapshot(collection(db, "project_completion_reports"), snap => {
        window.qrReports = [];
        snap.forEach(d => {
            let data = d.data();
            data.id = d.id;
            
            let pjt = window.qrProjects[data.projectId] || {};
            data.pjtCode = pjt.code || '-';
            data.pjtName = pjt.name || '알수없는 프로젝트';
            
            window.qrReports.push(data);
        });
        
        window.qrReports.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.filterQrList();
    });
};

window.filterQrStatus = function(status) {
    window.currentQrStatusFilter = status;
    window.filterQrList();
};

window.filterQrList = function() {
    const search = document.getElementById('qr-search')?.value.toLowerCase() || '';
    
    let pending = 0, writing = 0, completed = 0;

    let filtered = window.qrReports.filter(r => {
        // 1. 상태 카운트 계산 (전체 데이터 대상)
        const stat = r.qualityStatus || '대기중';
        if (stat === '대기중') pending++;
        else if (stat === '작성중') writing++;
        else if (stat === '완료') completed++;

        // 2. 대시보드 상태 필터 적용
        if (window.currentQrStatusFilter !== 'all' && stat !== window.currentQrStatusFilter) {
            return false;
        }

        // 3. 메인 검색어 필터 적용
        if (search) {
            const str = `${r.pjtCode} ${r.pjtName}`.toLowerCase();
            if(!str.includes(search) && !(window.matchString && window.matchString(search, str))) return false;
        }
        
        return true;
    });

    // 대시보드 숫자 업데이트
    if(document.getElementById('qr-dash-pending')) document.getElementById('qr-dash-pending').innerText = pending;
    if(document.getElementById('qr-dash-writing')) document.getElementById('qr-dash-writing').innerText = writing;
    if(document.getElementById('qr-dash-completed')) document.getElementById('qr-dash-completed').innerText = completed;

    window.renderQrList(filtered);
};

// 💡 상단 검색창 초성 자동완성 (PJT 마스터 기준 + 현재 리스트 기준)
window.qrShowPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    let drop = document.getElementById('qr-pjt-autocomplete-dynamic');
    
    if (!drop) {
        drop = document.createElement('ul');
        drop.id = 'qr-pjt-autocomplete-dynamic';
        drop.className = 'fixed z-[99999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm min-w-[220px] custom-scrollbar py-1';
        document.body.appendChild(drop);
    }

    if(!val) {
        drop.classList.add('hidden');
        return;
    }

    let searchPool = [];
    let seenCodes = new Set();

    if (window.pjtCodeMasterList) {
        window.pjtCodeMasterList.forEach(p => {
            if (p.code && !seenCodes.has(p.code)) {
                seenCodes.add(p.code);
                searchPool.push({code: p.code, name: p.name || ''});
            }
        });
    }

    (window.qrReports || []).forEach(d => {
        if (d.pjtCode && !seenCodes.has(d.pjtCode)) {
            seenCodes.add(d.pjtCode);
            searchPool.push({code: d.pjtCode, name: d.pjtName || ''}); 
        }
    });

    let matches = searchPool.filter(p => {
        return (window.matchString && window.matchString(val, p.code)) || (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.left = `${rect.left}px`;
        drop.style.top = `${rect.bottom + 4}px`;
        drop.style.width = `${Math.max(rect.width, 220)}px`;

        drop.innerHTML = matches.map(m => {
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            let sName = m.name ? `<span class="text-[10px] text-slate-400 truncate w-full block mt-0.5">${m.name}</span>` : '';
            return `<li class="px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex flex-col" onmousedown="window.qrSelectPjt('${sCode}')">
                        <span class="text-indigo-600 font-bold text-xs">${sCode}</span>${sName}
                    </li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.qrSelectPjt = function(code) {
    const input = document.getElementById('qr-search');
    if(input) input.value = code;
    
    const drop = document.getElementById('qr-pjt-autocomplete-dynamic');
    if(drop) drop.classList.add('hidden');
    
    window.filterQrList(); 
};

// 외부 클릭 시 드롭다운 닫기
document.addEventListener('click', function(e) {
    const drop = document.getElementById('qr-pjt-autocomplete-dynamic');
    if (drop && !drop.classList.contains('hidden') && !e.target.closest('#qr-search') && !e.target.closest('#qr-pjt-autocomplete-dynamic')) {
        drop.classList.add('hidden');
    }
});


window.renderQrList = function(list) {
    const tbody = document.getElementById('qr-tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-bold bg-white">조건에 맞는 데이터가 없습니다.</td></tr>`;
        return;
    }

    const intExtMap = {
        '미진행': '<span class="text-slate-400 font-bold">미진행</span>',
        '진행중': '<span class="text-blue-500 font-bold">진행중</span>',
        '보류': '<span class="text-amber-500 font-bold">보류</span>',
        '완료': '<span class="text-emerald-500 font-bold">완료</span>'
    };

    const statusMap = {
        '대기중': '<span class="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-1 rounded shadow-sm">대기중</span>',
        '작성중': '<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded shadow-sm">작성중</span>',
        '완료': '<span class="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded shadow-sm">✅ 완료</span>',
        '반려': '<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded shadow-sm">❌ 반려</span>'
    };

    tbody.innerHTML = list.map(r => {
        const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-';
        // '완료' 상태일 때만 품질 완료일자 표기
        const compDateStr = (r.qualityStatus === '완료' && r.qualityUpdatedAt) ? new Date(r.qualityUpdatedAt).toLocaleDateString() : '-';
        const safeName = (r.pjtName || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
        
        let qStatus = r.qualityStatus || '대기중';
        let iStatus = (r.internalSch && r.internalSch.status) ? r.internalSch.status : '미진행';
        let cStatus = (r.customerSch && r.customerSch.status) ? r.customerSch.status : '미진행';

        let adminBtn = '';
        // 최고관리자만 삭제 권한 부여
        if (window.userProfile && window.userProfile.role === 'admin') {
            adminBtn = `<button onclick="event.stopPropagation(); window.deleteQrReport('${r.id}')" class="bg-white border border-rose-200 hover:border-rose-400 hover:bg-rose-500 hover:text-white text-rose-400 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm ml-1" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onclick="window.openQrModal('${r.id}')">
                <td class="p-3 text-center text-slate-500 font-medium">${dateStr}</td>
                <td class="p-3 text-center text-emerald-600 font-bold bg-emerald-50/20">${compDateStr}</td>
                <td class="p-3 text-center font-black text-indigo-700">${r.pjtCode}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[250px]">${r.pjtName}</td>
                <td class="p-3 text-center text-[11px]">${intExtMap[iStatus] || iStatus}</td>
                <td class="p-3 text-center text-[11px]">${intExtMap[cStatus] || cStatus}</td>
                <td class="p-3 text-center text-[10px] font-bold">${statusMap[qStatus] || qStatus}</td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center">
                        <button class="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                            <i class="fa-solid fa-pen-to-square"></i> 검토
                        </button>
                        ${adminBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

// 최고 관리자용 품질보고 데이터 강제 삭제
window.deleteQrReport = async function(id) {
    if(!confirm("이 품질 완료보고 내역을 삭제하시겠습니까?\n(PJT 현황판의 프로젝트 데이터는 그대로 유지됩니다)")) return;
    try {
        await deleteDoc(doc(db, "project_completion_reports", id));
        window.showToast("삭제되었습니다.", "success");
    } catch(e) {
        window.showToast("삭제 실패: " + e.message, "error");
    }
};

window.openQrModal = function(docId) {
    const report = window.qrReports.find(r => r.id === docId);
    if(!report) return;

    document.getElementById('qr-doc-id').value = docId;
    document.getElementById('qr-pjt-id').value = report.projectId;
    document.getElementById('qr-project-title').innerText = `[${report.pjtCode}] ${report.pjtName}`;
    document.getElementById('qr-project-date').innerText = `송부일자: ${new Date(report.createdAt).toLocaleDateString()}`;
    
    // 검수 일정 폼
    if(report.internalSch) {
        document.getElementById('qr-int-start').value = report.internalSch.start || '';
        document.getElementById('qr-int-end').value = report.internalSch.end || '';
        document.getElementById('qr-int-status').value = report.internalSch.status || '미진행';
    }
    if(report.customerSch) {
        document.getElementById('qr-ext-start').value = report.customerSch.start || '';
        document.getElementById('qr-ext-end').value = report.customerSch.end || '';
        document.getElementById('qr-ext-status').value = report.customerSch.status || '미진행';
    }
    
    // 품질 개선 및 리스크 테이블 (Item / High / Low) 렌더링
    document.getElementById('qr-lessons-tbody').innerHTML = '';
    if(report.qualityLessons && report.qualityLessons.length > 0) {
        report.qualityLessons.forEach(l => window.addQrLessonRow(l));
    } else {
        window.addQrLessonRow(); // 없으면 빈 줄 1개 생성
    }

    document.getElementById('qr-comments').value = report.qualityComments || '';
    document.getElementById('qr-final-status').value = report.qualityStatus || '대기중';

    // 품질 첨부파일 초기화 및 기존 파일 렌더링
    document.getElementById('qr-files').value = '';
    document.getElementById('qr-file-names').innerText = '';
    
    const existContainer = document.getElementById('qr-existing-files');
    const filesArray = report.qualityFiles || [];
    
    if(filesArray.length === 0) {
        existContainer.innerHTML = '<span class="text-[10px] text-slate-400">첨부된 성적서 없음</span>';
    } else {
        existContainer.innerHTML = filesArray.map(f => {
            let isImg = f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i);
            if (isImg) {
                let fileIdMatch = f.url.match(/\/d\/(.+?)\/view/);
                let rawUrl = fileIdMatch ? `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}` : f.url;
                return `<div class="p-2 border border-slate-200 rounded-lg bg-white w-fit"><img src="${rawUrl}" alt="${f.name}" class="max-h-32 rounded cursor-pointer hover:opacity-80" onclick="window.open('${f.url}', '_blank')"></div>`;
            } else {
                return `<a href="${f.url}" target="_blank" class="text-xs text-rose-600 font-bold underline flex items-center gap-1 bg-white border border-slate-200 p-2 rounded-lg hover:bg-slate-50 w-fit"><i class="fa-solid fa-file-arrow-down"></i> ${f.name}</a>`;
            }
        }).join('');
    }

    // 뱃지 업데이트
    const badge = document.getElementById('qr-status-badge');
    const qStat = report.qualityStatus || '대기중';
    if(qStat === '완료') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-emerald-100 text-emerald-700 border-emerald-200";
    else if(qStat === '작성중') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-blue-100 text-blue-700 border-blue-200";
    else if(qStat === '반려') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-rose-100 text-rose-700 border-rose-200";
    else badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-slate-100 text-slate-500 border-slate-200";
    badge.innerText = qStat;

    document.getElementById('qr-detail-modal').classList.remove('hidden');
    document.getElementById('qr-detail-modal').classList.add('flex');
};

window.closeQrModal = function() {
    document.getElementById('qr-detail-modal').classList.add('hidden');
    document.getElementById('qr-detail-modal').classList.remove('flex');
};

// 동적 행 추가 로직
window.addQrLessonRow = function(data = null) {
    const tbody = document.getElementById('qr-lessons-tbody');
    const tr = document.createElement('tr');
    tr.className = "qr-lesson-row border-b border-slate-100 hover:bg-slate-50 transition-colors";
    
    const catVal = data ? data.category : '품질개선';
    const itemVal = data ? data.item : '';
    const hrVal = data ? data.highRisk : '';
    const lrVal = data ? data.lowRisk : '';

    tr.innerHTML = `
        <td class="p-2 border-r border-slate-100 align-top">
            <select class="qr-ls-category w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-700 outline-teal-500 bg-white">
                <option value="품질개선" ${catVal==='품질개선'?'selected':''}>품질개선</option>
                <option value="납기단축" ${catVal==='납기단축'?'selected':''}>납기단축</option>
                <option value="원가절감" ${catVal==='원가절감'?'selected':''}>원가절감</option>
                <option value="제작" ${catVal==='제작'?'selected':''}>제작</option>
            </select>
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <input type="text" class="qr-ls-item w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-teal-500 bg-white" value="${itemVal}" placeholder="아이템명">
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <textarea class="qr-ls-high w-full border border-slate-300 rounded p-2 text-xs outline-rose-500 custom-scrollbar resize-y min-h-[50px] bg-rose-50/30 focus:bg-white" placeholder="하이리스크 내용">${hrVal}</textarea>
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <textarea class="qr-ls-low w-full border border-slate-300 rounded p-2 text-xs outline-blue-500 custom-scrollbar resize-y min-h-[50px] bg-blue-50/30 focus:bg-white" placeholder="로우리스크 내용">${lrVal}</textarea>
        </td>
        <td class="p-2 text-center align-middle">
            <button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-rose-500 transition-colors p-1 bg-white border border-slate-200 rounded shadow-sm hover:border-rose-200"><i class="fa-solid fa-trash-can"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.updateQrFileNames = function() {
    const inputEl = document.getElementById('qr-files');
    const displayEl = document.getElementById('qr-file-names');
    if (!displayEl) return;
    if (inputEl.files.length === 0) {
        displayEl.innerHTML = '';
    } else if (inputEl.files.length === 1) {
        displayEl.innerHTML = inputEl.files[0].name;
    } else {
        displayEl.innerHTML = `${inputEl.files[0].name} 외 ${inputEl.files.length - 1}개 파일 선택됨`;
    }
};

// 구글 드라이브 업로드 유틸리티 
async function qrUploadToDrive(file, folderName) {
    if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다.");
    
    const query1 = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${QR_DRIVE_PARENT_FOLDER}' in parents and trashed=false`;
    const res1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query1)}`, { headers: { 'Authorization': 'Bearer ' + window.googleAccessToken } });
    const data1 = await res1.json();
    
    let pjtFolderId = '';
    if (data1.files && data1.files.length > 0) pjtFolderId = data1.files[0].id;
    else {
        const cRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [QR_DRIVE_PARENT_FOLDER] })
        });
        const cData = await cRes.json();
        pjtFolderId = cData.id;
    }

    const query2 = `name='품질성적서' and mimeType='application/vnd.google-apps.folder' and '${pjtFolderId}' in parents and trashed=false`;
    const res2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query2)}`, { headers: { 'Authorization': 'Bearer ' + window.googleAccessToken } });
    const data2 = await res2.json();
    
    let qFolderId = '';
    if (data2.files && data2.files.length > 0) qFolderId = data2.files[0].id;
    else {
        const cRes2 = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '품질성적서', mimeType: 'application/vnd.google-apps.folder', parents: [pjtFolderId] })
        });
        const cData2 = await cRes2.json();
        qFolderId = cData2.id;
    }

    const progressModal = document.getElementById('upload-progress-modal');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const progressSize = document.getElementById('upload-progress-size');
    const progressFilename = document.getElementById('upload-progress-filename');
    
    if(progressModal) progressModal.classList.replace('hidden', 'flex');
    if(progressBar) progressBar.style.width = '0%';
    if(progressText) progressText.innerText = '0%';
    if(progressFilename) progressFilename.innerText = file.name;
    const totalMb = (file.size / (1024 * 1024)).toFixed(2);
    if(progressSize) progressSize.innerText = `0.00 MB / ${totalMb} MB`;

    return new Promise((resolve, reject) => {
        const metadata = { name: file.name, parents: [qFolderId] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + window.googleAccessToken);

        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const loadedMb = (e.loaded / (1024 * 1024)).toFixed(2);
                if(progressBar) progressBar.style.width = percent + '%';
                if(progressText) progressText.innerText = percent + '%';
                if(progressSize) progressSize.innerText = `${loadedMb} MB / ${totalMb} MB`;
            }
        };

        xhr.onload = function() {
            if(progressModal) progressModal.classList.replace('flex', 'hidden');
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText);
                resolve(`https://drive.google.com/file/d/${data.id}/view`);
            } else { reject(new Error("업로드 실패")); }
        };
        xhr.onerror = function() {
            if(progressModal) progressModal.classList.replace('flex', 'hidden');
            reject(new Error("네트워크 오류"));
        };
        xhr.send(form);
    });
}

window.saveQualityReport = async function() {
    const docId = document.getElementById('qr-doc-id').value;
    const report = window.qrReports.find(r => r.id === docId);
    if(!report) return;

    const btn = document.getElementById('btn-qr-save');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중...';
    btn.disabled = true;

    try {
        let uploadedFiles = report.qualityFiles || [];
        const fileInput = document.getElementById('qr-files');
        
        if (fileInput && fileInput.files.length > 0) {
            if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다. 상단 버튼으로 연동해주세요.");
            const folderName = report.pjtCode || report.pjtName;
            
            for(let i=0; i<fileInput.files.length; i++) {
                let url = await qrUploadToDrive(fileInput.files[i], folderName);
                uploadedFiles.push({ name: fileInput.files[i].name, url: url });
            }
        }

        // 아이템 & 리스크 테이블 데이터 추출
        const qualityLessons = [];
        document.querySelectorAll('.qr-lesson-row').forEach(tr => {
            qualityLessons.push({
                category: tr.querySelector('.qr-ls-category').value,
                item: tr.querySelector('.qr-ls-item').value.trim(),
                highRisk: tr.querySelector('.qr-ls-high').value.trim(),
                lowRisk: tr.querySelector('.qr-ls-low').value.trim()
            });
        });

        const statusVal = document.getElementById('qr-final-status').value;
        const payload = {
            internalSch: {
                start: document.getElementById('qr-int-start').value,
                end: document.getElementById('qr-int-end').value,
                status: document.getElementById('qr-int-status').value
            },
            customerSch: {
                start: document.getElementById('qr-ext-start').value,
                end: document.getElementById('qr-ext-end').value,
                status: document.getElementById('qr-ext-status').value
            },
            qualityLessons: qualityLessons,
            qualityComments: document.getElementById('qr-comments').value.trim(),
            qualityStatus: statusVal,
            qualityFiles: uploadedFiles,
            qualityUpdatedBy: window.userProfile?.name || '시스템',
            qualityUpdatedAt: Date.now()
        };

        await setDoc(doc(db, "project_completion_reports", docId), payload, { merge: true });

        // 승인완료 알림 발송 (제조팀 담당자)
        if (payload.qualityStatus === '완료' && window.notifyUser) {
            const pjt = window.qrProjects[report.projectId];
            if (pjt && pjt.manager) {
                const msg = `[${report.pjtName}] 품질팀 최종 검수 및 승인이 완료되었습니다.`;
                await window.notifyUser(pjt.manager, msg, report.projectId, "품질승인");
            }
        }

        window.showToast("품질 검수 내역이 저장되었습니다.", "success");
        window.closeQrModal();
    } catch(e) {
        window.showToast("저장 실패: " + e.message, "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> 품질보고 저장';
        btn.disabled = false;
    }
};
