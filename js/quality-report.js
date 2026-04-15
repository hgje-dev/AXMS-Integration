/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, getDocs, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let qrUnsubscribe = null;
let pjtUnsubscribe = null;

window.qrReports = [];
window.qrProjects = {};

const QR_DRIVE_PARENT_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ"; // PJT 현황 메인 폴더

window.initQualityReport = function() {
    console.log("✅ 품질 완료보고 페이지 로드 완료");
    if(window.initGoogleAPI) window.initGoogleAPI();
    
    // 프로젝트 정보를 먼저 매핑하기 위해 projects_status 구독
    if(pjtUnsubscribe) pjtUnsubscribe();
    pjtUnsubscribe = onSnapshot(collection(db, "projects_status"), snap => {
        window.qrProjects = {};
        snap.forEach(d => { window.qrProjects[d.id] = d.data(); });
        
        // 프로젝트가 로드된 후 완료보고서 로드
        window.loadQualityReports();
    });
};

window.loadQualityReports = function() {
    if(qrUnsubscribe) qrUnsubscribe();
    
    // 제조팀에서 생성한 project_completion_reports 리스트 가져오기
    qrUnsubscribe = onSnapshot(collection(db, "project_completion_reports"), snap => {
        window.qrReports = [];
        snap.forEach(d => {
            let data = d.data();
            data.id = d.id;
            
            // PJT 정보 조인 (코드, 명칭)
            let pjt = window.qrProjects[data.projectId] || {};
            data.pjtCode = pjt.code || '-';
            data.pjtName = pjt.name || '알수없는 프로젝트';
            
            window.qrReports.push(data);
        });
        
        // 최신순 정렬
        window.qrReports.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.filterQrList();
    });
};

window.filterQrList = function() {
    const search = document.getElementById('qr-search')?.value.toLowerCase() || '';
    
    let filtered = window.qrReports.filter(r => {
        if (!search) return true;
        const str = `${r.pjtCode} ${r.pjtName}`.toLowerCase();
        return str.includes(search) || (window.matchString && window.matchString(search, str));
    });

    window.renderQrList(filtered);
};

window.renderQrList = function(list) {
    const tbody = document.getElementById('qr-tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400 font-bold bg-white">등록된 완료보고(송부) 내역이 없습니다.</td></tr>`;
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
        '검수중': '<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded shadow-sm">검수중</span>',
        '승인완료': '<span class="bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-1 rounded shadow-sm">✅ 승인완료</span>',
        '반려': '<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded shadow-sm">❌ 반려</span>'
    };

    tbody.innerHTML = list.map(r => {
        const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-';
        const safeName = r.pjtName.replace(/"/g, '&quot;').replace(/'/g, "\\'");
        
        let qStatus = r.qualityStatus || '대기중';
        let iStatus = (r.internalSch && r.internalSch.status) ? r.internalSch.status : '미진행';
        let cStatus = (r.customerSch && r.customerSch.status) ? r.customerSch.status : '미진행';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onclick="window.openQrModal('${r.id}')">
                <td class="p-3 text-center text-slate-500 font-medium">${dateStr}</td>
                <td class="p-3 text-center font-black text-indigo-700">${r.pjtCode}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[250px]">${r.pjtName}</td>
                <td class="p-3 text-center text-[11px]">${intExtMap[iStatus] || iStatus}</td>
                <td class="p-3 text-center text-[11px]">${intExtMap[cStatus] || cStatus}</td>
                <td class="p-3 text-center text-[10px] font-bold">${statusMap[qStatus] || qStatus}</td>
                <td class="p-3 text-center">
                    <button class="bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                        검토
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

window.openQrModal = function(docId) {
    const report = window.qrReports.find(r => r.id === docId);
    if(!report) return;

    document.getElementById('qr-doc-id').value = docId;
    document.getElementById('qr-pjt-id').value = report.projectId;
    document.getElementById('qr-project-title').innerText = `[${report.pjtCode}] ${report.pjtName}`;
    
    // 1. 제조팀 송부 내역 렌더링
    let goodStr = '', badStr = '';
    if(report.lessons && report.lessons.length > 0) {
        report.lessons.forEach(l => {
            if(l.type === 'Good' && l.highlight) goodStr += `- ${l.highlight}\n`;
            if(l.type === 'Bad' && l.lowlight) badStr += `- ${l.lowlight}\n`;
        });
    }
    document.getElementById('qr-good-point').innerText = goodStr || '내용 없음';
    document.getElementById('qr-bad-point').innerText = badStr || '내용 없음';

    // 첨부파일 렌더링 함수
    const renderFiles = (filesArray, containerId, iconColor) => {
        const container = document.getElementById(containerId);
        if(!filesArray || filesArray.length === 0) {
            container.innerHTML = '<span class="text-[10px] text-slate-400">첨부파일 없음</span>';
            return;
        }
        container.innerHTML = filesArray.map(f => {
            let isImg = f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i);
            if (isImg) {
                let fileIdMatch = f.url.match(/\/d\/(.+?)\/view/);
                let rawUrl = fileIdMatch ? `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}` : f.url;
                return `<img src="${rawUrl}" alt="${f.name}" class="max-h-24 rounded border border-slate-200 cursor-pointer hover:opacity-80" onclick="window.open('${f.url}', '_blank')">`;
            } else {
                return `<a href="${f.url}" target="_blank" class="text-xs ${iconColor} font-bold underline flex items-center gap-1 hover:text-slate-800"><i class="fa-solid fa-file-arrow-down"></i> ${f.name}</a>`;
            }
        }).join('');
    };

    renderFiles(report.specFiles, 'qr-spec-files', 'text-indigo-600');
    renderFiles(report.designFiles, 'qr-design-files', 'text-teal-600');

    // 2. 품질팀 폼 데이터 바인딩
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
    
    document.getElementById('qr-comments').value = report.qualityComments || '';
    document.getElementById('qr-final-status').value = report.qualityStatus || '대기중';

    // 품질 첨부파일 초기화 및 기존 파일 렌더링
    document.getElementById('qr-files').value = '';
    document.getElementById('qr-file-names').innerText = '';
    renderFiles(report.qualityFiles, 'qr-existing-files', 'text-rose-600');

    // 뱃지 업데이트
    const badge = document.getElementById('qr-status-badge');
    const qStat = report.qualityStatus || '대기중';
    if(qStat === '승인완료') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-emerald-100 text-emerald-700 border-emerald-200";
    else if(qStat === '검수중') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-blue-100 text-blue-700 border-blue-200";
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

// 드라이브 업로드 유틸리티 (project.js의 로직과 동일)
async function qrUploadToDrive(file, folderName) {
    if(!window.googleAccessToken) throw new Error("구글 인증이 필요합니다.");
    
    // 메인 폴더 탐색
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

    // 품질성적서 폴더 탐색/생성
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

    // 파일 업로드
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
            qualityComments: document.getElementById('qr-comments').value.trim(),
            qualityStatus: document.getElementById('qr-final-status').value,
            qualityFiles: uploadedFiles,
            qualityUpdatedBy: window.userProfile?.name || '시스템',
            qualityUpdatedAt: Date.now()
        };

        await setDoc(doc(db, "project_completion_reports", docId), payload, { merge: true });

        // 만약 최종 '승인완료'라면, 알림을 보낼 수도 있습니다. (제조팀 담당자 등)
        if (payload.qualityStatus === '승인완료' && window.notifyUser) {
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
