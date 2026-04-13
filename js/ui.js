/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribeRequests = null;
let currentCommentUnsubscribe = null;
let unsubscribeEmails = null; 

window.currentReqEmails = []; 

const getVal = (id) => {
    const el = document.getElementById(id);
    return el && el.value ? el.value.trim() : '';
};
const getNum = (id) => {
    const el = document.getElementById(id);
    return el && el.value ? (parseFloat(el.value) || 0) : 0;
};
const setVal = (id, val) => {
    const el = document.getElementById(id);
    if(el) el.value = val;
};

window.reqGetSafeMillis = function(val) {
    try { 
        if (!val) return 0; 
        if (typeof val.toMillis === 'function') return val.toMillis(); 
        if (typeof val === 'number') return val; 
        if (typeof val === 'string') return new Date(val).getTime() || 0; 
        return 0; 
    } catch(e) { return 0; }
};

window.currentReqStatusFilter = 'all';
window.currentReqYearFilter = '';
window.currentReqMonthFilter = '';
window.currentReqSearch = '';

window.setReqStatusFilter = function(status) {
    window.currentReqStatusFilter = status;
    window.renderRequestList();
};

window.filterReqByYear = function(year) {
    window.currentReqYearFilter = year;
    window.renderRequestList();
};

window.filterReqByMonth = function(month) {
    window.currentReqMonthFilter = month;
    window.renderRequestList();
};

window.filterReqBySearch = function(keyword) {
    window.currentReqSearch = keyword.toLowerCase();
    window.renderRequestList();
};

window.resetReqFilters = function() {
    window.currentReqStatusFilter = 'all';
    window.currentReqYearFilter = '';
    window.currentReqMonthFilter = '';
    window.currentReqSearch = '';
    
    setVal('filter-req-year', '');
    setVal('filter-req-month', '');
    setVal('filter-req-search', '');
    
    window.renderRequestList();
};

const GOOGLE_CLIENT_ID = '924354535197-joakn7gpfj4d3oirpd1pu3un9j7689q9.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send';

window.googleAccessToken = null;

const DRIVE_FOLDERS = {
    'collab': '1q4pzChZi_FYFGK7cXuRK6GRbIeSzfkRC', 
    'purchase': '18SE2vn_OjZKWWOnthyrVA4fPoIcQP490', 
    'repair': '1YSIVOQhoq2gWnhSze-mmYgyDs0XkaeGj' 
};

window.handleFileSelect = function(files) {
    if (files && files.length > 0) {
        const fileInput = document.getElementById('req-file');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(files[0]);
        if(fileInput) fileInput.files = dataTransfer.files;
        
        const nameText = document.getElementById('req-file-name-text');
        const nameWrap = document.getElementById('req-file-name');
        if(nameText) nameText.innerText = files[0].name;
        if(nameWrap) nameWrap.classList.remove('hidden');
    }
};

window.clearSelectedFile = function(e) {
    if(e) e.stopPropagation();
    setVal('req-file', '');
    const nameWrap = document.getElementById('req-file-name');
    if(nameWrap) nameWrap.classList.add('hidden');
};

window.initGoogleAPI = function() {
    if (typeof google === 'undefined' || typeof gapi === 'undefined') {
        setTimeout(window.initGoogleAPI, 500);
        return;
    }
    
    const storedToken = localStorage.getItem('axmsGoogleToken');
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiry');
    const authSection = document.getElementById('google-auth-section');
    const authStatus = document.getElementById('google-auth-status');
    const pjtAuthBtn = document.getElementById('btn-pjt-google-auth'); 
    
    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
        window.googleAccessToken = storedToken;
        gapi.load('client', () => {
            gapi.client.init({}).then(() => {
                gapi.client.setToken({ access_token: storedToken });
                gapi.client.load('drive', 'v3');
                gapi.client.load('gmail', 'v1');
            });
        });
        if(authSection) authSection.classList.add('hidden');
        if(authStatus) { authStatus.classList.remove('hidden'); authStatus.classList.add('flex'); }
        if(pjtAuthBtn) pjtAuthBtn.classList.add('hidden'); 
    } else {
        if(authSection) authSection.classList.remove('hidden');
        if(authStatus) { authStatus.classList.add('hidden'); authStatus.classList.remove('flex'); }
        if(pjtAuthBtn) pjtAuthBtn.classList.remove('hidden'); 
    }
    
    window.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: (response) => {
            if (response.error !== undefined) {
                window.showToast("구글 인증에 실패했습니다.", "error");
                return;
            }
            window.googleAccessToken = response.access_token;
            localStorage.setItem('axmsGoogleToken', response.access_token);
            localStorage.setItem('axmsGoogleTokenExpiry', Date.now() + 3500 * 1000);

            if(authSection) authSection.classList.add('hidden');
            if(authStatus) { authStatus.classList.remove('hidden'); authStatus.classList.add('flex'); }
            if(pjtAuthBtn) pjtAuthBtn.classList.add('hidden'); 
            
            window.showToast("구글 계정 연동이 완료되었습니다.");
            
            gapi.load('client', () => {
                gapi.client.init({}).then(() => {
                    gapi.client.load('drive', 'v3');
                    gapi.client.load('gmail', 'v1');
                });
            });
        }
    });
};

window.authenticateGoogle = function() {
    if (!window.tokenClient) return window.showToast("구글 API를 불러오는 중입니다. 잠시 후 다시 시도해주세요.", "warning");
    if (!window.googleAccessToken) window.tokenClient.requestAccessToken({prompt: 'consent'});
};

window.uploadFileToDrive = async function(file, folderId) {
    if (!window.googleAccessToken) throw new Error("구글 인증이 필요합니다.");
    const metadata = { name: file.name, parents: [folderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + window.googleAccessToken },
        body: form
    });
    
    if (!res.ok) throw new Error("파일 업로드 실패");
    const data = await res.json();
    return data.id; 
};

async function getOrCreateSubfolder(parentFolderId, folderName) {
    if (!window.googleAccessToken) throw new Error("구글 인증이 필요합니다.");
    const query = `name='${encodeURIComponent(folderName)}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
    const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, { headers: { 'Authorization': 'Bearer ' + window.googleAccessToken } });
    const folderData = await findRes.json();
    
    if (folderData.files && folderData.files.length > 0) return folderData.files[0].id;
    else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
        });
        const newData = await createRes.json();
        return newData.id;
    }
}

window.sendNotificationEmail = async function(type, reqData, recipientEmail) {
    if (!window.googleAccessToken) throw new Error("구글 인증이 필요합니다.");
    if (!recipientEmail) return false;

    const logoUrl = "https://raw.githubusercontent.com/hgje-dev/AXMS-Integration/main/assets/%EC%97%91%EC%8A%A4%EB%B9%84%EC%8A%A4CI%20%EC%8A%AC%EB%A1%9C%EA%B1%B4_%ED%8F%AC%EC%A7%80%ED%8B%B0%EB%B8%8C.png";
    const safeTitle = reqData.reqTitle || reqData.title || '제목 없음';
    const appTitle = reqData.type === 'collab' ? '협업/조립 요청' : (reqData.type === 'purchase' ? '모듈 구매 의뢰' : '수리/점검 요청');

    let subject = `[AXBIS] ${appTitle} - ${safeTitle}`;
    let bodyHtml = `
        <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; border-radius: 10px;">
            <img src="${logoUrl}" alt="AXBIS" style="height: 28px; margin-bottom: 15px;">
            <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h3 style="margin-top:0; color:#1e293b;">${safeTitle}</h3>
                ${reqData.category ? `<p><strong>구분:</strong> ${reqData.category}</p>` : ''}
                <p><strong>프로젝트명:</strong> ${reqData.pjtName || '-'}</p>
                <p><strong>요청자:</strong> ${reqData.authorName} (${reqData.authorTeam})</p>
                ${reqData.manager ? `<p><strong>담당자:</strong> <span style="color:#4f46e5; font-weight:bold;">${reqData.manager}</span></p>` : ''}
                <p><strong>발송자(시스템 계정):</strong> ${window.userProfile.name} (${window.userProfile.email})</p>
                <p><strong>요청 내용:</strong><br>${String(reqData.content || '없음').replace(/\n/g, '<br>')}</p>
                ${reqData.fileUrl ? `<p style="margin-top:15px;"><strong>첨부파일(원문):</strong> <a href="${reqData.fileUrl}" style="color:#4f46e5; font-weight:bold;">문서 확인하기</a></p>` : ''}
                ${reqData.excelFileUrl ? `<p style="margin-top:5px;"><strong>✅ 자동생성 엑셀 양식:</strong> <a href="${reqData.excelFileUrl}" style="color:#059669; font-weight:bold;">다운로드/확인하기</a></p>` : ''}
            </div>
    `;

    if(type === 'progress') {
        subject = `[AXBIS 접수완료] 요청하신 내역이 접수되었습니다 - ${safeTitle}`;
        bodyHtml = `<h2 style="color: #4f46e5; font-size:18px;">요청하신 내역이 정상적으로 접수되어 진행 중입니다.</h2>${bodyHtml}`;
    } else if (type === 'completed') {
        subject = `[AXBIS 작업완료] 요청하신 작업이 완료되었습니다 - ${safeTitle}`;
        bodyHtml = `<h2 style="color: #10b981; font-size:18px;">요청하신 작업이 성공적으로 완료되었습니다.</h2>${bodyHtml}`;
        if (reqData.resultFileUrl) {
            bodyHtml += `<div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin-top: 15px; border-radius: 4px;"><p style="margin:0; font-size: 14px;"><strong>✅ 완료 결과물 (검수 리스트 등):</strong> <a href="${reqData.resultFileUrl}" style="color:#059669; font-weight:bold;">결과 확인하기</a></p></div>`;
        }
    }

    bodyHtml += `<p style="font-size: 11px; color: #94a3b8; margin-top: 20px;">본 메일은 AXBIS 클라우드 포털에서 자동 발송되었습니다.</p></div>`;

    const emailRaw = `To: ${recipientEmail}\r\nSubject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${bodyHtml}`;
    const encodedEmail = btoa(unescape(encodeURIComponent(emailRaw))).replace(/\+/g, '-').replace(/\//g, '_');
    
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: encodedEmail })
    });
    
    if (!res.ok) throw new Error("메일 발송 실패");
    return true;
};

window.openEmailSettingsModal = function() {
    setVal('new-req-email-user', '');
    const ac = document.getElementById('req-user-autocomplete');
    if(ac) ac.classList.add('hidden');
    window.renderReqEmailList();
    const modal = document.getElementById('req-email-setting-modal');
    if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
};

window.closeEmailSettingsModal = function() {
    const modal = document.getElementById('req-email-setting-modal');
    if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

window.renderReqEmailList = function() {
    const listEl = document.getElementById('req-email-list');
    if(!listEl) return;
    if(window.currentReqEmails.length === 0) {
        listEl.innerHTML = '<li class="text-center text-xs text-slate-400 font-bold p-4 bg-slate-50 rounded-xl border border-slate-200 border-dashed">등록된 이메일이 없습니다.</li>';
        return;
    }
    listEl.innerHTML = window.currentReqEmails.map((email, idx) => `
        <li class="flex justify-between items-center bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-sm hover:shadow-md transition-shadow">
            <span class="text-sm font-bold text-slate-700 flex items-center gap-2"><i class="fa-regular fa-envelope text-slate-400"></i> ${email}</span>
            <button onclick="window.removeReqEmail(${idx})" class="text-slate-400 hover:text-rose-500 transition-colors p-1"><i class="fa-solid fa-trash-can"></i></button>
        </li>
    `).join('');
};

window.showReqUserAutocomplete = function(inputEl) {
    const val = inputEl.value.trim().toLowerCase();
    const dropdown = document.getElementById('req-user-autocomplete');
    if(!dropdown) return;
    
    if(val.length < 1) { dropdown.classList.add('hidden'); return; }
    const matches = (window.allSystemUsers || []).filter(u => window.matchString(val, u.name));

    if(matches.length > 0) {
        dropdown.classList.remove('hidden');
        dropdown.innerHTML = matches.map(m => `
            <li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors flex justify-between items-center" 
                onmousedown="window.addReqEmailSelected('${m.email}')">
                <span>${m.name}</span><span class="text-[10px] text-slate-400">${m.email}</span>
            </li>
        `).join('');
    } else { dropdown.classList.add('hidden'); }
};

window.addReqEmailSelected = async function(email) {
    setVal('new-req-email-user', '');
    const ac = document.getElementById('req-user-autocomplete');
    if(ac) ac.classList.add('hidden');
    
    if(!email) return;
    if(window.currentReqEmails.includes(email)) return window.showToast("이미 등록된 담당자입니다.", "warning");

    const newEmails = [...window.currentReqEmails, email];
    try {
        await setDoc(doc(db, "settings", "req_emails_" + window.currentAppId), { emails: newEmails }, { merge: true });
        window.showToast("수신 담당자가 추가되었습니다.");
    } catch(e) { window.showToast("추가 실패", "error"); }
};

window.removeReqEmail = async function(idx) {
    if(!confirm("이 담당자를 수신자 목록에서 제외하시겠습니까?")) return;
    const newEmails = [...window.currentReqEmails];
    newEmails.splice(idx, 1);
    try {
        await setDoc(doc(db, "settings", "req_emails_" + window.currentAppId), { emails: newEmails }, { merge: true });
        window.showToast("제외되었습니다.");
    } catch(e) { window.showToast("삭제 실패", "error"); }
};

window.getReqFormData = function() {
    let reqTitle = '', pjtName = '', reqValid = false;

    if (window.currentAppId === 'collab') {
        reqTitle = getVal('req-title');
        pjtName = getVal('req-pjt-name');
        const startDate = getVal('req-start-date');
        const endDate = getVal('req-end-date');
        const content = getVal('req-content');
        if(reqTitle && pjtName && startDate && endDate && content) reqValid = true;
    } else if (window.currentAppId === 'purchase') {
        reqTitle = getVal('req-pur-title');
        pjtName = getVal('req-pur-pjt-name');
        const shipDate = getVal('req-pur-ship-date');
        if(reqTitle && pjtName && shipDate) reqValid = true;
    } else {
        reqValid = true;
    }

    const currentReq = window.editingReqId ? window.currentRequestList.find(r=>r.id===window.editingReqId) : null;
    let data = {
        type: window.currentAppId, 
        status: currentReq ? currentReq.status : 'pending', 
        authorUid: window.currentUser.uid, 
        authorName: window.userProfile.name, 
        authorEmail: window.userProfile.email,
        authorTeam: window.userProfile.team || window.userProfile.department || '미소속', 
        updatedAt: Date.now() 
    };

    if (window.currentAppId === 'collab') {
        data.reqTitle = reqTitle;
        data.title = reqTitle;
        data.pjtName = pjtName;
        data.pjtCode = getVal('req-pjt-code');
        data.company = getVal('req-company');
        data.location = getVal('req-location');
        data.startDate = getVal('req-start-date');
        data.endDate = getVal('req-end-date');
        data.estMd = getNum('req-est-md');
        
        const catEl = document.querySelector('input[name="req-category"]:checked');
        data.category = catEl ? catEl.value : '';
        data.content = getVal('req-content');
    } else if (window.currentAppId === 'purchase') {
        data.reqTitle = reqTitle;
        data.title = reqTitle;
        data.pjtName = pjtName;
        data.pjtCode = getVal('req-pur-pjt-code');
        data.shipDate = getVal('req-pur-ship-date');
        
        data.spec = {
            app: getVal('pur-spec-app'), appEtc: getVal('pur-spec-app-etc'),
            qty: getVal('pur-spec-qty') || '1', unit: getVal('pur-spec-unit') || 'EA',
            lasWave: getVal('pur-spec-las-wave'), lasWaveEtc: getVal('pur-spec-las-wave-etc'),
            lasPower: getVal('pur-spec-las-power'), lasPowerEtc: getVal('pur-spec-las-power-etc'),
            lasMaker: getVal('pur-spec-las-maker'), lasMakerEtc: getVal('pur-spec-las-maker-etc'),
            lasType: getVal('pur-spec-las-type'), lasTypeEtc: getVal('pur-spec-las-type-etc'),
            lasCh: getVal('pur-spec-las-ch'), lasChEtc: getVal('pur-spec-las-ch-etc'),
            lasLen: getVal('pur-spec-las-len'), lasLenEtc: getVal('pur-spec-las-len-etc'),
            lasCore: getVal('pur-spec-las-core'), lasCoreEtc: getVal('pur-spec-las-core-etc'),
            lasCool: getVal('pur-spec-las-cool'), lasCoolEtc: getVal('pur-spec-las-cool-etc'),
            optType: getVal('pur-spec-opt-type'), optTypeEtc: getVal('pur-spec-opt-type-etc'),
            optMnt: getVal('pur-spec-opt-mnt'), optMntEtc: getVal('pur-spec-opt-mnt-etc'),
            optCol: getVal('pur-spec-opt-col'), optColEtc: getVal('pur-spec-opt-col-etc'),
            optSplit: getVal('pur-spec-opt-split'), optSplitEtc: getVal('pur-spec-opt-split-etc'),
            optLens: getVal('pur-spec-opt-lens'), optLensEtc: getVal('pur-spec-opt-lens-etc'),
            optScan: getVal('pur-spec-opt-scan'), optScanEtc: getVal('pur-spec-opt-scan-etc'),
            optCam: getVal('pur-spec-opt-cam'), optCamEtc: getVal('pur-spec-opt-cam-etc'),
            optLit: getVal('pur-spec-opt-lit'), optLitEtc: getVal('pur-spec-opt-lit-etc'),
            optOpts: Array.from(document.querySelectorAll('input[name="pur_spec_opt_opts"]:checked')).map(cb => cb.value),
            optOptsEtc: getVal('pur-spec-opt-opts-etc'),
            accPc: getVal('pur-spec-acc-pc'), accPcEtc: getVal('pur-spec-acc-pc-etc'),
            accCtrl: getVal('pur-spec-acc-ctrl'), accCtrlEtc: getVal('pur-spec-acc-ctrl-etc'),
            accAir: getVal('pur-spec-acc-air'), accAirEtc: getVal('pur-spec-acc-air-etc'),
            accRtc: getVal('pur-spec-acc-rtc'), accRtcEtc: getVal('pur-spec-acc-rtc-etc'),
            etcMemo: getVal('pur-spec-etc-memo')
        };
        data.content = `[시스템 등록 사양서 확인 요망]\n요청일: ${data.shipDate}\n기타메모: ${data.spec.etcMemo}`;
    }

    return { data, isValid: reqValid, currentReq };
};

window.openWriteModal = function(editId = null) { 
    window.editingReqId = editId; 
    
    document.querySelectorAll('#collab-form-fields input, #collab-form-fields select, #collab-form-fields textarea').forEach(el => el.disabled = false);
    document.querySelectorAll('#purchase-form-fields input, #purchase-form-fields select, #purchase-form-fields textarea').forEach(el => el.disabled = false);
    
    const dropzone = document.getElementById('req-dropzone');
    if(dropzone) dropzone.style.pointerEvents = 'auto';
    
    const btnSave = document.getElementById('btn-req-save');
    if(btnSave) btnSave.classList.remove('hidden');
    
    const btnDraft = document.querySelector('button[onclick="window.saveDraftRequest()"]');
    if(btnDraft) btnDraft.classList.remove('hidden');

    ['req-pjt-code','req-pjt-name','req-title','req-company','req-location','req-start-date','req-end-date','req-est-md','req-content',
     'req-pur-title','req-pur-pjt-code','req-pur-pjt-name','req-pur-ship-date','pur-spec-etc-memo'].forEach(id => setVal(id, ''));

    ['app','qty','unit','las-wave','las-power','las-maker','las-type','las-ch','las-len','las-core','las-cool','opt-type','opt-mnt','opt-col','opt-split','opt-lens','opt-scan','opt-cam','opt-lit','acc-pc','acc-ctrl','acc-air','acc-rtc'].forEach(k => {
        setVal(`pur-spec-${k}`, (k==='qty') ? '1' : '');
        setVal(`pur-spec-${k}-etc`, '');
    });
    document.querySelectorAll('input[name="pur_spec_opt_opts"]').forEach(cb => cb.checked = false);
    setVal('pur-spec-opt-opts-etc', '');

    window.clearSelectedFile();
    
    if(document.getElementById('req-file-link-wrap')) document.getElementById('req-file-link-wrap').classList.add('hidden');
    if(document.getElementById('req-result-link-wrap')) document.getElementById('req-result-link-wrap').classList.add('hidden');
    if(document.getElementById('admin-actions')) document.getElementById('admin-actions').classList.add('hidden');
    if(document.getElementById('req-modal-status-badge')) document.getElementById('req-modal-status-badge').classList.add('hidden');
    
    const collabRadio = document.querySelector('input[name="req-category"][value="협업"]');
    if(collabRadio) collabRadio.checked = true;

    const titleMap = { 'collab': '협업/조립 요청서', 'purchase': '모듈 구매 의뢰서', 'repair': '수리/점검 요청서' };
    if(document.getElementById('req-header-title')) document.getElementById('req-header-title').innerText = titleMap[window.currentAppId] || '요청서 관리';
    if(document.getElementById('req-modal-title')) document.getElementById('req-modal-title').innerText = (titleMap[window.currentAppId] || '요청서').replace('새 ', '') + ' 작성';

    const modalContent = document.getElementById('write-modal-content');
    if (window.currentAppId === 'purchase') {
        if(modalContent) { modalContent.classList.remove('max-w-2xl'); modalContent.classList.add('max-w-4xl'); }
        if(document.getElementById('collab-form-fields')) document.getElementById('collab-form-fields').classList.add('hidden');
        if(document.getElementById('purchase-form-fields')) document.getElementById('purchase-form-fields').classList.remove('hidden');
    } else {
        if(modalContent) { modalContent.classList.add('max-w-2xl'); modalContent.classList.remove('max-w-4xl'); }
        if(document.getElementById('collab-form-fields')) document.getElementById('collab-form-fields').classList.remove('hidden');
        if(document.getElementById('purchase-form-fields')) document.getElementById('purchase-form-fields').classList.add('hidden');
    }

    if (editId) {
        const req = window.currentRequestList.find(r => r.id === editId);
        if (req) {
            setVal('req-pjt-code', req.pjtCode || '');
            setVal('req-pjt-name', req.pjtName || '');
            setVal('req-title', req.reqTitle || req.title || '');
            setVal('req-company', req.company || '');
            setVal('req-location', req.location || '');
            setVal('req-start-date', req.startDate || '');
            setVal('req-end-date', req.endDate || '');
            setVal('req-est-md', req.estMd || '');
            setVal('req-content', req.content || '');
            
            if(req.category) {
                const rEl = document.querySelector(`input[name="req-category"][value="${req.category}"]`);
                if(rEl) rEl.checked = true;
            }

            setVal('req-pur-title', req.reqTitle || req.title || '');
            setVal('req-pur-pjt-code', req.pjtCode || '');
            setVal('req-pur-pjt-name', req.pjtName || '');
            setVal('req-pur-ship-date', req.shipDate || '');
            
            if (req.spec) {
                const s = req.spec;
                ['app','qty','unit','lasWave','lasPower','lasMaker','lasType','lasCh','lasLen','lasCore','lasCool','optType','optMnt','optCol','optSplit','optLens','optScan','optCam','optLit','accPc','accCtrl','accAir','accRtc'].forEach(k => {
                    const htmlKey = k.replace(/([A-Z])/g, "-$1").toLowerCase();
                    setVal(`pur-spec-${htmlKey}`, s[k] || '');
                    setVal(`pur-spec-${htmlKey}-etc`, s[`${k}Etc`] || '');
                });

                if(s.optOpts && Array.isArray(s.optOpts)) {
                    s.optOpts.forEach(val => {
                        const cb = document.querySelector(`input[name="pur_spec_opt_opts"][value="${val}"]`);
                        if(cb) cb.checked = true;
                    });
                }
                setVal('pur-spec-opt-opts-etc', s.optOptsEtc || '');
                setVal('pur-spec-etc-memo', s.etcMemo || '');
            }

            if(req.fileUrl && document.getElementById('req-file-link-wrap')) {
                document.getElementById('req-file-link-wrap').classList.remove('hidden');
                document.getElementById('req-file-link').href = req.fileUrl;
            }
            if(req.resultFileUrl && document.getElementById('req-result-link-wrap')) {
                document.getElementById('req-result-link-wrap').classList.remove('hidden');
                document.getElementById('req-result-link').href = req.resultFileUrl;
            }

            const badge = document.getElementById('req-modal-status-badge');
            if(badge) {
                badge.classList.remove('hidden');
                if (req.status === 'completed') {
                    badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 shadow-sm";
                    badge.innerText = "작업 완료됨";
                } else if (req.status === 'progress') {
                    badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 shadow-sm";
                    badge.innerText = "진행 중";
                } else if (req.status === 'draft') {
                    badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 shadow-sm border border-slate-300";
                    badge.innerText = "임시저장";
                } else {
                    badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shadow-sm";
                    badge.innerText = "접수 대기중";
                }
            }

            const isAccepted = (req.status === 'progress' || req.status === 'completed');
            const isAdmin = window.userProfile && window.userProfile.role === 'admin';

            if (isAccepted && !isAdmin) {
                document.querySelectorAll('#collab-form-fields input, #collab-form-fields select, #collab-form-fields textarea').forEach(el => el.disabled = true);
                document.querySelectorAll('#purchase-form-fields input, #purchase-form-fields select, #purchase-form-fields textarea').forEach(el => el.disabled = true);
                if(dropzone) dropzone.style.pointerEvents = 'none';
                if(btnSave) btnSave.classList.add('hidden');
                if(btnDraft) btnDraft.classList.add('hidden');
            }

            if (isAdmin) {
                const adminMenu = document.getElementById('admin-actions');
                const btnAccept = document.getElementById('btn-admin-accept');
                const btnComplete = document.getElementById('btn-admin-complete');
                const btnRevert = document.getElementById('btn-admin-revert');

                if(adminMenu) adminMenu.classList.remove('hidden');

                if (req.status === 'completed') {
                    if(btnAccept) btnAccept.classList.add('hidden');
                    if(btnComplete) btnComplete.classList.add('hidden');
                    if(btnRevert) btnRevert.classList.remove('hidden');
                } else if (req.status === 'progress') {
                    if(btnAccept) btnAccept.classList.add('hidden');
                    if(btnComplete) btnComplete.classList.remove('hidden');
                    if(btnRevert) btnRevert.classList.add('hidden');
                } else if (req.status === 'draft') {
                    if(adminMenu) adminMenu.classList.add('hidden');
                } else {
                    if(btnAccept) btnAccept.classList.remove('hidden');
                    if(btnComplete) btnComplete.classList.add('hidden');
                    if(btnRevert) btnRevert.classList.add('hidden');
                }
            }
        }
    }

    const m = document.getElementById('write-modal');
    if(m) { m.classList.remove('hidden'); m.classList.add('flex'); }
    window.initGoogleAPI();
};

window.closeWriteModal = function() { 
    const m = document.getElementById('write-modal');
    if(m) { m.classList.add('hidden'); m.classList.remove('flex'); }
};

window.saveDraftRequest = async function() {
    const { data, currentReq } = window.getReqFormData();
    data.status = 'draft';

    const fileInput = document.getElementById('req-file');
    try { 
        let fileUrl = null;
        let targetFolderId = DRIVE_FOLDERS[window.currentAppId] || '';
        
        if (fileInput && fileInput.files.length > 0 && targetFolderId && window.googleAccessToken) {
            window.showToast("파일을 업로드 중입니다...");
            if (window.currentAppId === 'purchase' && data.pjtCode) {
                targetFolderId = await getOrCreateSubfolder(targetFolderId, data.pjtCode);
            }
            const fileId = await window.uploadFileToDrive(fileInput.files[0], targetFolderId);
            fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
        }
        data.fileUrl = fileUrl || (currentReq ? currentReq.fileUrl : null);

        if(window.editingReqId) { 
            await setDoc(doc(db,"requests",window.editingReqId), data, {merge:true}); 
        } else { 
            data.createdAt = Date.now(); 
            await addDoc(collection(db,"requests"), data); 
        } 

        window.showToast("임시 저장되었습니다."); 
        window.closeWriteModal(); 
    } catch(e) { window.showToast("오류 발생: " + e.message, "error"); }
};

window.promptSaveRequest = function() {
    const { isValid } = window.getReqFormData();
    if(!isValid) return window.showToast("별표(*)가 있는 필수 항목을 모두 입력해주세요.", "error");
    if (!window.googleAccessToken) return window.showToast("파일 업로드 및 메일 발송을 위해 [구글 계정 연동]을 먼저 진행해주세요.", "warning");
    if (window.currentReqEmails.length === 0) return window.showToast("상단 [수신 담당자 설정]에서 메일을 받을 사람을 먼저 지정해주세요.", "warning");
    
    if(document.getElementById('req-send-email-display')) document.getElementById('req-send-email-display').innerText = window.currentReqEmails.join(', ');
    
    const sm = document.getElementById('req-send-modal');
    if(sm) { sm.classList.remove('hidden'); sm.classList.add('flex'); }
};

window.executeSaveRequest = async function() {
    const sm = document.getElementById('req-send-modal');
    if(sm) { sm.classList.add('hidden'); sm.classList.remove('flex'); }
    
    const btn = document.getElementById('btn-req-save-exec');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 전송 중...'; }

    let { data, currentReq } = window.getReqFormData();
    if (data.status === 'draft') data.status = 'pending';

    const fileInput = document.getElementById('req-file');
    const recipientEmails = window.currentReqEmails.join(',');
    data.recipientEmail = recipientEmails;

    try { 
        let fileUrl = null;
        let excelFileUrl = null;
        let targetFolderId = DRIVE_FOLDERS[window.currentAppId] || '';

        if (window.currentAppId === 'purchase' && data.pjtCode) {
            targetFolderId = await getOrCreateSubfolder(targetFolderId, data.pjtCode);
        }

        if (fileInput && fileInput.files.length > 0 && targetFolderId) {
            window.showToast("구글 드라이브에 첨부 파일을 업로드 중입니다...");
            const fileId = await window.uploadFileToDrive(fileInput.files[0], targetFolderId);
            fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
        }
        data.fileUrl = fileUrl || (currentReq ? currentReq.fileUrl : null);

        if (window.currentAppId === 'purchase' && typeof window.ExcelJS !== 'undefined') {
            window.showToast("구매 의뢰서 엑셀 양식을 생성 중입니다...");
            try {
                const wb = new window.ExcelJS.Workbook();
                const ws = wb.addWorksheet('모듈구매의뢰서');
                ws.columns = [ { width: 25 }, { width: 40 }, { width: 25 }, { width: 40 } ];
                
                ws.addRow(['요청자', data.authorName + ' (' + data.authorTeam + ')', '작성일', window.getLocalDateStr(new Date())]);
                ws.addRow(['프로젝트 코드', data.pjtCode, '프로젝트명', data.pjtName]);
                ws.addRow(['출하 요청일', data.shipDate, '', '']);
                ws.addRow([]);
                
                const s = data.spec;
                ws.addRow(['[상세 사양 / Specification]', '', '', '']).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                ws.lastRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
                
                ws.addRow(['적용분야', s.app + (s.appEtc ? ` (${s.appEtc})` : ''), '수량', s.qty + ' ' + s.unit]);
                ws.addRow(['LASER Wavelength', s.lasWave + ' ' + s.lasWaveEtc, 'LASER Power', s.lasPower + ' ' + s.lasPowerEtc]);
                ws.addRow(['LASER Maker', s.lasMaker + ' ' + s.lasMakerEtc, 'LASER Type', s.lasType + ' ' + s.lasTypeEtc]);
                ws.addRow(['LASER Channel', s.lasCh + ' ' + s.lasChEtc, 'Fiber Length', s.lasLen + ' ' + s.lasLenEtc]);
                ws.addRow(['Fiber Core', s.lasCore + ' ' + s.lasCoreEtc, 'Cooling Type', s.lasCool + ' ' + s.lasCoolEtc]);
                ws.addRow(['OPTIC Type', s.optType + ' ' + s.optTypeEtc, 'Fiber Mount', s.optMnt + ' ' + s.optMntEtc]);
                ws.addRow(['Collimator', s.optCol + ' ' + s.optColEtc, 'Beam Splitter', s.optSplit + ' ' + s.optSplitEtc]);
                ws.addRow(['F-theta Lens', s.optLens + ' ' + s.optLensEtc, 'Scanner', s.optScan + ' ' + s.optScanEtc]);
                ws.addRow(['Camera', s.optCam + ' ' + s.optCamEtc, 'Light', s.optLit + ' ' + s.optLitEtc]);
                ws.addRow(['Options (다중)', s.optOpts.join(', ') + ' ' + s.optOptsEtc, '', '']);
                ws.addRow(['ACC PC Rack', s.accPc + ' ' + s.accPcEtc, 'ACC Controller', s.accCtrl + ' ' + s.accCtrlEtc]);
                ws.addRow(['ACC Air Knife', s.accAir + ' ' + s.accAirEtc, 'ACC RTC Card', s.accRtc + ' ' + s.accRtcEtc]);
                ws.addRow(['기타 메모', s.etcMemo, '', '']);
                
                const buffer = await wb.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const excelFile = new File([blob], `모듈구매의뢰서_${data.pjtCode||data.pjtName}_${data.authorName}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                
                window.showToast("생성된 엑셀을 드라이브에 업로드 중입니다...");
                const excelFileId = await window.uploadFileToDrive(excelFile, targetFolderId); 
                excelFileUrl = `https://drive.google.com/file/d/${excelFileId}/view`;
                data.excelFileUrl = excelFileUrl;
            } catch(excelErr) { console.error(excelErr); }
        }

        if(window.editingReqId) { await setDoc(doc(db,"requests",window.editingReqId), data, {merge:true}); } 
        else { data.createdAt = Date.now(); await addDoc(collection(db,"requests"), data); } 

        if(recipientEmails) {
            window.showToast("지정된 수신자에게 메일을 발송합니다...");
            await window.sendNotificationEmail('pending', data, recipientEmails);
        }

        window.showToast("성공적으로 저장 및 메일 발송이 완료되었습니다."); 
        window.closeWriteModal(); 
    } catch(e) { window.showToast("오류 발생: " + e.message, "error"); 
    } finally { 
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane mr-1"></i> 발송하기'; }
    }
};

window.promptAcceptRequest = function() {
    if (!window.editingReqId) return;
    if (!window.googleAccessToken) return window.showToast("구글 연동을 먼저 해주세요.", "error");

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    
    const managerSel = document.getElementById('req-accept-manager');
    if(managerSel) {
        managerSel.innerHTML = '<option value="">선택 안함</option>' + (window.allSystemUsers || []).map(u => `<option value="${u.name}">${u.name} (${u.team||'소속없음'})</option>`).join('');
    }

    const emailEl = document.getElementById('req-accept-email');
    if(emailEl) emailEl.value = req ? (req.authorEmail || '') : '';

    const am = document.getElementById('req-accept-modal');
    if(am) { am.classList.remove('hidden'); am.classList.add('flex'); }
};

window.executeAcceptRequest = async function() {
    const am = document.getElementById('req-accept-modal');
    if(am) { am.classList.add('hidden'); am.classList.remove('flex'); }

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    const managerName = document.getElementById('req-accept-manager')?.value || '';
    const sendEmail = document.getElementById('req-accept-email')?.value.trim() || '';

    try {
        const payload = { status: 'progress', manager: managerName, acceptedAt: Date.now(), updatedAt: Date.now() };
        await setDoc(doc(db, "requests", window.editingReqId), payload, { merge: true });
        
        const updatedReq = Object.assign({}, req, payload); 
        if (sendEmail) {
            await window.sendNotificationEmail('progress', updatedReq, sendEmail);
            window.showToast("접수 완료 메일이 발송되었습니다.");
        } else {
            window.showToast("접수 처리가 완료되었습니다.");
        }
        window.closeWriteModal();
    } catch(e) { window.showToast("처리 실패", "error"); }
};

window.promptCompleteRequest = function() {
    if (!window.editingReqId) return;
    if (!window.googleAccessToken) return window.showToast("구글 연동을 먼저 해주세요.", "error");

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    
    const fileSection = document.getElementById('req-complete-file-section');
    if (fileSection) {
        if (window.currentAppId === 'purchase') {
            fileSection.classList.remove('hidden');
            const fileInput = document.getElementById('req-complete-file');
            if(fileInput) fileInput.value = '';
            document.getElementById('req-complete-file-name').innerText = '';
        } else {
            fileSection.classList.add('hidden');
        }
    }

    const emailEl = document.getElementById('req-complete-email');
    if(emailEl) emailEl.value = req ? (req.authorEmail || '') : '';

    const cm = document.getElementById('req-complete-modal');
    if(cm) { cm.classList.remove('hidden'); cm.classList.add('flex'); }
};

window.executeCompleteRequest = async function() {
    const cm = document.getElementById('req-complete-modal');
    if(cm) { cm.classList.add('hidden'); cm.classList.remove('flex'); }
    const btn = document.getElementById('btn-req-complete-exec');
    if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 처리중...'; }

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    const sendEmail = document.getElementById('req-complete-email')?.value.trim() || '';
    const fileInput = document.getElementById('req-complete-file');

    if (window.currentAppId === 'purchase' && (!fileInput || fileInput.files.length === 0)) {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-flag-checkered mr-1"></i> 완료 처리 및 발송'; }
        return window.showToast("모듈 구매 의뢰서는 작업 완료 시 [레이저 검수 리스트] 파일 첨부가 필수입니다.", "error");
    }

    try {
        let resultFileUrl = null;
        let targetFolderId = DRIVE_FOLDERS[window.currentAppId] || '';

        if (window.currentAppId === 'purchase' && req.pjtCode) {
            targetFolderId = await getOrCreateSubfolder(targetFolderId, req.pjtCode);
        }

        if (fileInput && fileInput.files.length > 0) {
            window.showToast("완료 결과물(검수 리스트)을 드라이브에 업로드 중입니다...");
            const fileId = await window.uploadFileToDrive(fileInput.files[0], targetFolderId);
            resultFileUrl = `https://drive.google.com/file/d/${fileId}/view`;
        }

        const payload = { status: 'completed', completedAt: Date.now(), updatedAt: Date.now() };
        if (resultFileUrl) payload.resultFileUrl = resultFileUrl;

        await setDoc(doc(db, "requests", window.editingReqId), payload, { merge: true });
        
        const updatedReq = Object.assign({}, req, payload);
        if(sendEmail) {
            await window.sendNotificationEmail('completed', updatedReq, sendEmail);
            window.showToast("작업 완료 메일이 발송되었습니다.");
        } else {
            window.showToast("작업이 완료 처리되었습니다.");
        }
        window.closeWriteModal();
    } catch(e) { window.showToast("처리 실패", "error"); } finally {
        if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-flag-checkered mr-1"></i> 완료 처리 및 발송'; }
    }
};

window.revertRequest = async function() {
    if (!window.editingReqId) return;
    if(!confirm("이 요청을 다시 '진행 중' 상태로 되돌리시겠습니까?")) return;

    try {
        await setDoc(doc(db, "requests", window.editingReqId), { status: 'progress', completedAt: null, updatedAt: Date.now() }, { merge: true });
        window.showToast("진행 중 상태로 성공적으로 되돌렸습니다.");
        window.closeWriteModal();
    } catch(e) { window.showToast("처리 실패", "error"); }
};

window.loadRequestsData = function(appId) { 
    if(unsubscribeRequests) unsubscribeRequests(); 
    unsubscribeRequests = onSnapshot(query(collection(db, "requests"), where("type", "==", appId)), (s) => { 
        window.currentRequestList=[]; 
        let tTotal=0, tPend=0, tProg=0, tComp=0;
        const currentYearStr = new Date().getFullYear().toString();

        s.forEach(d => {
            const data = {id: d.id, ...d.data()};
            window.currentRequestList.push(data);
            tTotal++;
            if(data.status === 'pending') tPend++;
            else if(data.status === 'progress') tProg++;
            else if(data.status === 'completed') {
                const compDateStr = data.completedAt ? window.getLocalDateStr(new Date(window.reqGetSafeMillis(data.completedAt))) : '';
                if(compDateStr.startsWith(currentYearStr)) {
                    tComp++;
                }
            }
        }); 
        
        window.currentRequestList.sort((a,b)=>{ return window.reqGetSafeMillis(b.createdAt) - window.reqGetSafeMillis(a.createdAt); }); 
        
        if(document.getElementById('req-dash-total')) document.getElementById('req-dash-total').innerText = tTotal;
        if(document.getElementById('req-dash-pending')) document.getElementById('req-dash-pending').innerText = tPend;
        if(document.getElementById('req-dash-progress')) document.getElementById('req-dash-progress').innerText = tProg;
        if(document.getElementById('req-dash-completed')) document.getElementById('req-dash-completed').innerText = tComp;

        if(window.renderRequestList) window.renderRequestList(); 
    }); 
    
    if(unsubscribeEmails) unsubscribeEmails();
    unsubscribeEmails = onSnapshot(doc(db, "settings", "req_emails_" + appId), (docSnap) => {
        if(docSnap.exists() && docSnap.data().emails) {
            window.currentReqEmails = docSnap.data().emails;
        } else {
            window.currentReqEmails = [];
        }
    });
};

window.renderRequestList = function() { 
    const tb = document.getElementById('request-tbody'); 
    const th = document.getElementById('req-thead-tr');
    if(!tb || !th) return; 

    if (window.currentAppId === 'purchase') {
        th.innerHTML = `
            <th class="p-4 font-bold text-center w-20">현재 상태</th>
            <th class="p-4 font-bold text-center text-amber-300 w-16">코멘트</th>
            <th class="p-4 font-bold min-w-[200px] max-w-[250px]">프로젝트명</th>
            <th class="p-4 font-bold text-center">PJT 코드</th>
            <th class="p-4 font-bold min-w-[200px] max-w-[250px] text-indigo-300">의뢰서 제목</th>
            <th class="p-4 font-bold text-center text-teal-400 w-16">요청서</th>
            <th class="p-4 font-bold text-center text-emerald-400 w-16">검수</th>
            <th class="p-4 font-bold text-center text-rose-400">출하요청일</th>
            <th class="p-4 font-bold text-center">담당자</th>
            <th class="p-4 font-bold text-center text-slate-400">등록일</th>
            <th class="p-4 font-bold text-center text-blue-400">진행시작일</th>
            <th class="p-4 font-bold text-center text-emerald-400">완료일</th>
            <th class="p-4 font-bold text-center w-16">기능</th>
        `;
    } else {
        th.innerHTML = `
            <th class="p-4 font-bold text-center w-20">현재 상태</th>
            <th class="p-4 font-bold text-center text-amber-300 w-16">코멘트</th>
            <th class="p-4 font-bold text-center w-20">구분</th>
            <th class="p-4 font-bold min-w-[200px] max-w-[250px]">프로젝트명</th>
            <th class="p-4 font-bold text-center">PJT 코드</th>
            <th class="p-4 font-bold min-w-[200px] max-w-[250px] text-indigo-300">요청서 제목</th>
            <th class="p-4 font-bold text-center">담당자</th>
            <th class="p-4 font-bold text-center text-slate-400">등록일</th>
            <th class="p-4 font-bold text-center text-blue-400">진행시작일</th>
            <th class="p-4 font-bold text-center text-emerald-400">완료일</th>
            <th class="p-4 font-bold text-center w-16">기능</th>
        `;
    }
    
    let displayList = window.currentRequestList.filter(item => {
        let match = true;
        if (window.currentReqStatusFilter !== 'all') {
            if (item.status !== window.currentReqStatusFilter) match = false;
        }
        if (window.currentReqYearFilter) {
            const cDate = item.createdAt ? window.getLocalDateStr(new Date(window.reqGetSafeMillis(item.createdAt))) : '';
            if (!cDate.startsWith(window.currentReqYearFilter)) match = false;
        }
        if (window.currentReqMonthFilter) {
            const cDate = item.createdAt ? window.getLocalDateStr(new Date(window.reqGetSafeMillis(item.createdAt))) : '';
            if (!cDate.startsWith(window.currentReqMonthFilter)) match = false;
        }
        if (window.currentReqSearch) {
            const s = window.currentReqSearch;
            const fullStr = `${item.pjtName||''} ${item.pjtCode||''} ${item.reqTitle||item.title||''}`.toLowerCase();
            if (!fullStr.includes(s) && !window.matchString(s, fullStr)) match = false;
        }
        return match;
    });

    if(displayList.length === 0) { 
        tb.innerHTML=`<tr><td colspan="${window.currentAppId === 'purchase' ? 13 : 11}" class="text-center p-8 text-slate-400 font-bold border-b border-slate-100">조건에 맞는 요청서가 없습니다.</td></tr>`; 
        return; 
    } 

    const statusMap = {
        'draft': '<span class="bg-slate-200 text-slate-500 px-2 py-1 rounded-md font-bold shadow-sm border border-slate-300">임시저장</span>',
        'pending': '<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-bold shadow-sm border border-slate-200">대기중</span>',
        'progress': '<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-md font-bold shadow-sm border border-blue-200">진행중</span>',
        'completed': '<span class="bg-emerald-100 text-emerald-600 px-2 py-1 rounded-md font-bold shadow-sm border border-emerald-200">완료됨</span>'
    };

    tb.innerHTML = displayList.map(r=> {
        try {
            const safeTitle = String(r.pjtName||r.title||'').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeReqTitle = String(r.reqTitle||r.title||'').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            const safeTitleJs = safeReqTitle.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeCat = r.category || '-';
            const badge = statusMap[r.status] || statusMap['pending'];
            const safeManager = r.manager ? r.manager : '<span class="text-slate-300">-</span>';

            const dCreate = r.createdAt ? window.getLocalDateStr(new Date(window.reqGetSafeMillis(r.createdAt))) : '-';
            const dAccept = r.acceptedAt ? window.getLocalDateStr(new Date(window.reqGetSafeMillis(r.acceptedAt))) : '-';
            const dComp = r.completedAt ? window.getLocalDateStr(new Date(window.reqGetSafeMillis(r.completedAt))) : '-';

            const cCount = (window.projectCommentCounts && window.projectCommentCounts[r.id]) || 0; 
            let commentHtml = `<button onclick="event.stopPropagation(); window.openCommentModal('${r.id}', '${safeTitleJs}')" class="text-amber-400 hover:text-amber-500 relative transition-colors p-2"><i class="fa-regular fa-comment-dots text-lg"></i>`;
            if (cCount > 0) commentHtml += `<span class="absolute top-0 right-0 bg-amber-100 text-amber-600 text-[9px] font-bold px-1 rounded-full shadow-sm border border-amber-200">${cCount}</span>`;
            commentHtml += `</button>`;

            if (window.currentAppId === 'purchase') {
                const safeShipDate = r.shipDate || '-';
                const reqDocHtml = r.excelFileUrl ? `<a href="${r.excelFileUrl}" target="_blank" onclick="event.stopPropagation()" class="text-teal-600 hover:text-white hover:bg-teal-500 bg-teal-50 border border-teal-200 px-2 py-1 rounded text-[11px] shadow-sm font-bold transition-colors" title="요청서 엑셀 다운로드"><i class="fa-solid fa-file-excel"></i></a>` : `<span class="text-slate-300">-</span>`;
                const inspDocHtml = r.resultFileUrl ? `<a href="${r.resultFileUrl}" target="_blank" onclick="event.stopPropagation()" class="text-emerald-600 hover:text-white hover:bg-emerald-500 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded text-[11px] shadow-sm font-bold transition-colors" title="검수 리스트 확인"><i class="fa-solid fa-file-circle-check"></i></a>` : `<span class="text-slate-300">-</span>`;

                return `
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.openWriteModal('${r.id}')">
                    <td class="p-3 text-center">${badge}</td>
                    <td class="p-3 text-center">${commentHtml}</td>
                    <td class="p-3 font-bold text-slate-700 truncate max-w-[200px]">${safeTitle}</td>
                    <td class="p-3 text-center font-bold text-indigo-700">${r.pjtCode||'-'}</td>
                    <td class="p-3 font-black text-indigo-800 truncate max-w-[250px]">${safeReqTitle}</td>
                    <td class="p-3 text-center">${reqDocHtml}</td>
                    <td class="p-3 text-center">${inspDocHtml}</td>
                    <td class="p-3 text-center font-bold text-rose-500">${safeShipDate}</td>
                    <td class="p-3 text-center font-bold text-slate-600">${r.authorName} <span class="text-[9px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded block mt-0.5 w-max mx-auto">${r.authorTeam||''}</span></td>
                    <td class="p-3 text-center text-slate-500 font-medium">${dCreate}</td>
                    <td class="p-3 text-center text-blue-500 font-bold">${dAccept}</td>
                    <td class="p-3 text-center text-emerald-500 font-bold">${dComp}</td>
                    <td class="p-3 text-center" onclick="event.stopPropagation()">
                        <button onclick="window.deleteRequest('${r.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2 flex items-center justify-center mx-auto"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>`;
            } else {
                return `
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.openWriteModal('${r.id}')">
                    <td class="p-3 text-center">${badge}</td>
                    <td class="p-3 text-center">${commentHtml}</td>
                    <td class="p-3 text-center font-bold text-slate-500">${safeCat}</td>
                    <td class="p-3 font-bold text-slate-700 truncate max-w-[200px]">${safeTitle}</td>
                    <td class="p-3 text-center font-bold text-indigo-700">${r.pjtCode||'-'}</td>
                    <td class="p-3 font-black text-indigo-800 truncate max-w-[250px]">${safeReqTitle}</td>
                    <td class="p-3 text-center font-bold text-slate-600">${r.authorName} <span class="text-[9px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded block mt-0.5 w-max mx-auto">${r.authorTeam||''}</span></td>
                    <td class="p-3 text-center font-bold text-indigo-600">${safeManager}</td>
                    <td class="p-3 text-center text-slate-500 font-medium">${dCreate}</td>
                    <td class="p-3 text-center text-blue-500 font-bold">${dAccept}</td>
                    <td class="p-3 text-center text-emerald-500 font-bold">${dComp}</td>
                    <td class="p-3 text-center" onclick="event.stopPropagation()">
                        <button onclick="window.deleteRequest('${r.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2 flex items-center justify-center mx-auto"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>`;
            }
        } catch(e) {
            console.error("List Render Error:", e);
            return '';
        }
    }).join(''); 
};

window.deleteRequest = async function(id) { 
    if(confirm("이 요청서를 정말 삭제하시겠습니까?")){ 
        try {
            await deleteDoc(doc(db,"requests",id)); 
            window.showToast("삭제되었습니다."); 
        } catch(e) {
            window.showToast("삭제 실패", "error");
        }
    } 
};

// 💡 [핵심 수정] 코멘트 저장 기능 단일화 (ui.js를 안전하게 호출)
window.saveCommentItem = async function() { 
    const projectId = document.getElementById('cmt-req-id').value; 
    const content = document.getElementById('new-cmt-text').value.trim(); 
    const parentId = document.getElementById('reply-to-id').value || null; 
    const editId = document.getElementById('editing-cmt-id').value; 
    const fileInput = document.getElementById('new-cmt-image'); 
    
    if(!content && (!fileInput || fileInput.files.length === 0)) return window.showToast("코멘트 내용이나 사진을 첨부하세요.", "error"); 
    
    const btnSave = document.getElementById('btn-cmt-save');
    if(btnSave) { btnSave.innerHTML = '저장중..'; btnSave.disabled = true; }
    
    const saveData = async function(base64Img) { 
        try { 
            const payload = { content: content, updatedAt: Date.now() }; 
            if(base64Img) payload.imageUrl = base64Img; 
            
            if (editId) { 
                await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); 
                window.showToast("코멘트가 수정되었습니다."); 
            } else { 
                payload.projectId = projectId; 
                payload.parentId = parentId; 
                payload.authorUid = window.currentUser.uid; 
                payload.authorName = window.userProfile.name; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); 
                window.showToast("코멘트가 등록되었습니다."); 
                
                // 💡 [오류 수정 1,2번 완벽 해결]
                let notified = [];
                if (window.processMentions) {
                    notified = await window.processMentions(content, projectId, "코멘트");
                }
                
                // 요청서 작성자 및 담당자 자동 알림
                if (window.currentRequestList) {
                    const req = window.currentRequestList.find(r => r.id === projectId);
                    if (req) {
                        if(req.authorName && req.authorName !== window.userProfile.name && !notified.includes(req.authorName)) {
                            if(window.notifyUser) await window.notifyUser(req.authorName, content, projectId, "요청서 코멘트");
                        }
                        if(req.manager && req.manager !== window.userProfile.name && !notified.includes(req.manager)) {
                            if(window.notifyUser) await window.notifyUser(req.manager, content, projectId, "요청서 코멘트");
                        }
                    }
                }
            } 
            if(window.cancelCommentAction) window.cancelCommentAction(); 
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
        } finally { 
            if(btnSave) { btnSave.innerHTML = '작성'; btnSave.disabled = false; }
        } 
    }; 
    
    if(fileInput && fileInput.files.length > 0) { 
        if(window.resizeAndConvertToBase64) {
            window.resizeAndConvertToBase64(fileInput.files[0], function(base64) { saveData(base64); }); 
        } else {
            saveData(null);
        }
    } else { 
        saveData(null); 
    } 
};
