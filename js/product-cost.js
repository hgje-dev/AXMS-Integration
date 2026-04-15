/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, getDocs, query, onSnapshot, where, addDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let pcUnsubscribe = null;
let pjtUnsubscribe = null;
let crUnsubscribe = null;

window.pcReports = [];
window.pcProjects = {};
window.pcCrData = {}; // 완료보고(Good/Bad) 매핑용

const PC_DRIVE_PARENT_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ"; // PJT 현황 메인 폴더

window.initProductCost = function() {
    console.log("✅ Product Cost 페이지 로드 완료");
    if(window.initGoogleAPI) window.initGoogleAPI();
    
    // 1. 프로젝트 기본 정보 구독
    if(pjtUnsubscribe) pjtUnsubscribe();
    pjtUnsubscribe = onSnapshot(collection(db, "projects_status"), snap => {
        window.pcProjects = {};
        snap.forEach(d => { window.pcProjects[d.id] = d.data(); });
        
        // 2. 제조팀이 작성한 완료보고 데이터 구독 (Good/Bad 연동용)
        if(crUnsubscribe) crUnsubscribe();
        crUnsubscribe = onSnapshot(collection(db, "project_completion_reports"), crSnap => {
            window.pcCrData = {};
            crSnap.forEach(cd => { window.pcCrData[cd.data().projectId] = cd.data(); });
            
            // 3. 마지막으로 원가 데이터 로드
            window.loadProductCostReports();
        });
    });
};

window.loadProductCostReports = function() {
    if(pcUnsubscribe) pcUnsubscribe();
    
    pcUnsubscribe = onSnapshot(collection(db, "product_costs"), snap => {
        window.pcReports = [];
        snap.forEach(d => {
            let data = d.data();
            data.id = d.id;
            
            let pjt = window.pcProjects[data.projectId] || {};
            data.pjtCode = pjt.code || '-';
            data.pjtName = pjt.name || '알수없는 프로젝트';
            
            window.pcReports.push(data);
        });
        
        window.pcReports.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.filterPcList();
    });
};

window.filterPcList = function() {
    const search = document.getElementById('pc-search')?.value.toLowerCase() || '';
    let filtered = window.pcReports.filter(r => {
        if (!search) return true;
        const str = `${r.pjtCode} ${r.pjtName}`.toLowerCase();
        return str.includes(search) || (window.matchString && window.matchString(search, str));
    });
    window.renderPcList(filtered);
};

window.renderPcList = function(list) {
    const tbody = document.getElementById('pc-tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-400 font-bold bg-white">원가 분석 대상 프로젝트가 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(r => {
        const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-';
        const target = parseFloat(r.targetCost) || 0;
        const actual = parseFloat(r.actualTotal) || 0;
        
        let variance = 0;
        if(target > 0) variance = ((target - actual) / target * 100).toFixed(1);
        
        const varianceClass = variance > 0 ? 'text-emerald-600' : (variance < 0 ? 'text-rose-600' : 'text-slate-400');
        const statusClass = r.status === '분석 완료' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onclick="window.openPcModal('${r.id}')">
                <td class="p-3 text-center text-slate-500 font-medium">${dateStr}</td>
                <td class="p-3 text-center font-black text-indigo-700">${r.pjtCode}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[250px]">${r.pjtName}</td>
                <td class="p-3 text-right font-bold">${target.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-emerald-700 bg-emerald-50/30">${actual.toLocaleString()}</td>
                <td class="p-3 text-center font-black ${varianceClass}">${variance}%</td>
                <td class="p-3 text-center"><span class="${statusClass} px-2 py-0.5 rounded text-[10px] font-bold border">${r.status || '분석 대기'}</span></td>
                <td class="p-3 text-center">
                    <button class="bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 text-slate-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">분석</button>
                </td>
            </tr>
        `;
    }).join('');
};

window.openPcModal = function(docId) {
    const report = window.pcReports.find(r => r.id === docId);
    if(!report) return;

    document.getElementById('pc-doc-id').value = docId;
    document.getElementById('pc-pjt-id').value = report.projectId;
    document.getElementById('pc-project-title').innerText = `[${report.pjtCode}] ${report.pjtName}`;

    // 1. 제조팀 송부 내역 (CR 데이터 참조)
    const cr = window.pcCrData[report.projectId] || {};
    let goodStr = '', badStr = '';
    if(cr.lessons) {
        cr.lessons.forEach(l => {
            if(l.type === 'Good') goodStr += `- ${l.highlight}\n`;
            if(l.type === 'Bad') badStr += `- ${l.lowlight}\n`;
        });
    }
    document.getElementById('pc-good-point').innerText = goodStr || '기재된 내용 없음';
    document.getElementById('pc-bad-point').innerText = badStr || '기재된 내용 없음';

    // 제조팀 첨부파일
    const mfgFilesContainer = document.getElementById('pc-mfg-files');
    const allMfgFiles = [...(cr.specFiles || []), ...(cr.designFiles || [])];
    if(allMfgFiles.length === 0) mfgFilesContainer.innerHTML = '<span class="text-[10px] text-slate-400">첨부파일 없음</span>';
    else {
        mfgFilesContainer.innerHTML = allMfgFiles.map(f => `<a href="${f.url}" target="_blank" class="text-[11px] text-indigo-600 font-bold underline flex items-center gap-1"><i class="fa-solid fa-file-arrow-down"></i> ${f.name}</a>`).join('');
    }

    // 2. 구매팀 입력 필드 채우기
    document.getElementById('pc-target-cost').value = report.targetCost || '';
    document.getElementById('pc-actual-material').value = report.actualMaterial || '';
    document.getElementById('pc-actual-proc').value = report.actualProc || '';
    document.getElementById('pc-actual-etc').value = report.actualEtc || '';
    document.getElementById('pc-comments').value = report.analysisComments || '';
    document.getElementById('pc-final-status').value = report.status || '분석 대기';

    // 기존 분석 파일 렌더링
    const renderFiles = (filesArray, containerId) => {
        const container = document.getElementById(containerId);
        if(!filesArray || filesArray.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML = filesArray.map(f => `<div class="flex items-center justify-between bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200"><a href="${f.url}" target="_blank" class="text-xs text-emerald-700 font-bold underline flex items-center gap-1"><i class="fa-solid fa-file-invoice-dollar"></i> ${f.name}</a></div>`).join('');
    };
    renderFiles(report.analysisFiles, 'pc-existing-files');

    window.calcCostVariance();

    document.getElementById('pc-detail-modal').classList.replace('hidden', 'flex');
};

window.closePcModal = function() {
    document.getElementById('pc-detail-modal').classList.replace('flex', 'hidden');
};

window.calcCostVariance = function() {
    const target = parseFloat(document.getElementById('pc-target-cost').value) || 0;
    const m = parseFloat(document.getElementById('pc-actual-material').value) || 0;
    const p = parseFloat(document.getElementById('pc-actual-proc').value) || 0;
    const e = parseFloat(document.getElementById('pc-actual-etc').value) || 0;
    
    const total = m + p + e;
    document.getElementById('pc-actual-total-display').innerText = total.toLocaleString();

    const badge = document.getElementById('pc-variance-badge');
    if(target > 0) {
        const variance = ((target - total) / target * 100).toFixed(1);
        badge.innerText = (variance > 0 ? '+' : '') + variance + '%';
        if(variance > 0) badge.className = "px-4 py-1.5 rounded-full font-black text-lg bg-emerald-100 text-emerald-700 border border-emerald-200";
        else if(variance < 0) badge.className = "px-4 py-1.5 rounded-full font-black text-lg bg-rose-100 text-rose-700 border border-rose-200";
        else badge.className = "px-4 py-1.5 rounded-full font-black text-lg bg-slate-100 text-slate-500 border border-slate-200";
    } else {
        badge.innerText = '0%';
        badge.className = "px-4 py-1.5 rounded-full font-black text-lg bg-slate-100 text-slate-500 border border-slate-200";
    }
};

window.updatePcFileNames = function() {
    const inputEl = document.getElementById('pc-files');
    const displayEl = document.getElementById('pc-file-names');
    if (inputEl.files.length === 0) displayEl.innerHTML = '';
    else displayEl.innerHTML = inputEl.files.length === 1 ? inputEl.files[0].name : `${inputEl.files[0].name} 외 ${inputEl.files.length - 1}개`;
};

// 드라이브 업로드 (원가분석 폴더 전용)
async function pcUploadToDrive(file, folderName) {
    if(!window.googleAccessToken) throw new Error("구글 연동 필요");
    
    // 1. PJT 폴더 ID 찾기
    const q1 = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${PC_DRIVE_PARENT_FOLDER}' in parents and trashed=false`;
    const r1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q1)}`, { headers: {'Authorization': 'Bearer ' + window.googleAccessToken}});
    const d1 = await r1.json();
    let pjtFid = (d1.files && d1.files.length > 0) ? d1.files[0].id : null;
    
    if(!pjtFid) {
        const res = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [PC_DRIVE_PARENT_FOLDER]})
        });
        const data = await res.json(); pjtFid = data.id;
    }

    // 2. '원가분석' 폴더 ID 찾기
    const q2 = `name='원가분석' and mimeType='application/vnd.google-apps.folder' and '${pjtFid}' in parents and trashed=false`;
    const r2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q2)}`, { headers: {'Authorization': 'Bearer ' + window.googleAccessToken}});
    const d2 = await r2.json();
    let pcFid = (d2.files && d2.files.length > 0) ? d2.files[0].id : null;

    if(!pcFid) {
        const res = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({name: '원가분석', mimeType: 'application/vnd.google-apps.folder', parents: [pjtFid]})
        });
        const data = await res.json(); pcFid = data.id;
    }

    // 3. 파일 업로드 (기존 UI ProgressBar 사용 가능)
    const metadata = { name: file.name, parents: [pcFid] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken}, body: form
    });
    const result = await res.json();
    return `https://drive.google.com/file/d/${result.id}/view`;
}

window.saveProductCostReport = async function() {
    const docId = document.getElementById('pc-doc-id').value;
    const report = window.pcReports.find(r => r.id === docId);
    if(!report) return;

    const btn = document.getElementById('btn-pc-save');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중...';
    btn.disabled = true;

    try {
        let uploadedFiles = report.analysisFiles || [];
        const fileInput = document.getElementById('pc-files');
        
        if (fileInput.files.length > 0) {
            const folderName = report.pjtCode || report.pjtName;
            for(let i=0; i<fileInput.files.length; i++) {
                let url = await pcUploadToDrive(fileInput.files[i], folderName);
                uploadedFiles.push({ name: fileInput.files[i].name, url: url });
            }
        }

        const m = parseFloat(document.getElementById('pc-actual-material').value) || 0;
        const p = parseFloat(document.getElementById('pc-actual-proc').value) || 0;
        const e = parseFloat(document.getElementById('pc-actual-etc').value) || 0;

        const payload = {
            targetCost: parseFloat(document.getElementById('pc-target-cost').value) || 0,
            actualMaterial: m,
            actualProc: p,
            actualEtc: e,
            actualTotal: m + p + e,
            analysisComments: document.getElementById('pc-comments').value.trim(),
            status: document.getElementById('pc-final-status').value,
            analysisFiles: uploadedFiles,
            updatedAt: Date.now(),
            updatedBy: window.userProfile?.name || '구매팀'
        };

        await setDoc(doc(db, "product_costs", docId), payload, { merge: true });
        window.showToast("원가 분석 결과가 저장되었습니다.", "success");
        window.closePcModal();
    } catch(err) {
        window.showToast("저장 실패: " + err.message, "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> 분석 결과 저장';
        btn.disabled = false;
    }
};
