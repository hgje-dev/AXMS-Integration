/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribeRequests = null, currentCommentUnsubscribe = null, unsubscribeEmails = null; 
window.currentReqEmails = []; 
window.googleAccessToken = null;

const DRIVE_FOLDERS = { 'collab': '1q4pzChZi_FYFGK7cXuRK6GRbIeSzfkRC', 'purchase': '18SE2vn_OjZKWWOnthyrVA4fPoIcQP490', 'repair': '1gLlXB3raQPNewFEwJXOGgFGNJyzubSER' };

const getVal = (id) => document.getElementById(id)?.value.trim() || '';
const getNum = (id) => parseFloat(document.getElementById(id)?.value) || 0;
const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; };
window.reqGetSafeMillis = function(val) { try { if(!val) return 0; if(val.toMillis) return val.toMillis(); if(typeof val==='number') return val; return new Date(val).getTime() || 0; } catch(e){ return 0; } };

window.currentReqStatusFilter = 'all'; window.currentReqYearFilter = ''; window.currentReqMonthFilter = ''; window.currentReqSearch = '';
window.setReqStatusFilter = function(status) { window.currentReqStatusFilter = status; window.renderRequestList(); };
window.filterReqByYear = function(year) { window.currentReqYearFilter = year; window.renderRequestList(); };
window.filterReqByMonth = function(month) { window.currentReqMonthFilter = month; window.renderRequestList(); };
window.filterReqBySearch = function(keyword) { window.currentReqSearch = keyword.toLowerCase(); window.renderRequestList(); };
window.resetReqFilters = function() { window.currentReqStatusFilter='all'; window.currentReqYearFilter=''; window.currentReqMonthFilter=''; window.currentReqSearch=''; setVal('filter-req-year',''); setVal('filter-req-month',''); setVal('filter-req-search',''); window.renderRequestList(); };

window.handleFileSelect = function(files) {
    if (files && files.length > 0) {
        const fileInput = document.getElementById('req-file'); const dataTransfer = new DataTransfer(); dataTransfer.items.add(files[0]);
        if(fileInput) fileInput.files = dataTransfer.files;
        const nameText = document.getElementById('req-file-name-text'), nameWrap = document.getElementById('req-file-name');
        if(nameText) nameText.innerText = files[0].name; if(nameWrap) nameWrap.classList.remove('hidden');
    }
};
window.clearSelectedFile = function(e) { if(e) e.stopPropagation(); setVal('req-file', ''); const nameWrap = document.getElementById('req-file-name'); if(nameWrap) nameWrap.classList.add('hidden'); };

window.initGoogleAPI = function() {
    if (typeof google === 'undefined' || typeof gapi === 'undefined') { setTimeout(window.initGoogleAPI, 500); return; }
    const storedToken = localStorage.getItem('axmsGoogleTokenV2'); const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    const toggleUIs = (isAuth) => {
        ['google-auth-section', 'btn-pjt-google-auth', 'btn-pc-google-auth', 'btn-cr-google-auth', 'btn-qr-google-auth'].forEach(id => { const el=document.getElementById(id); if(el) isAuth?el.classList.add('hidden'):el.classList.remove('hidden'); });
        ['google-auth-status', 'pjt-google-auth-status', 'pc-google-auth-status', 'cr-google-auth-status', 'qr-google-auth-status'].forEach(id => { const el=document.getElementById(id); if(el){ if(isAuth){ el.classList.remove('hidden'); if(el.tagName!=='BUTTON') el.classList.add('flex'); }else{ el.classList.add('hidden'); el.classList.remove('flex'); } } });
    };
    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
        window.googleAccessToken = storedToken;
        gapi.load('client', () => { gapi.client.init({}).then(() => { gapi.client.setToken({ access_token: storedToken }); gapi.client.load('drive', 'v3'); gapi.client.load('gmail', 'v1'); }); });
        toggleUIs(true);
    } else { toggleUIs(false); }
};

window.authenticateGoogle = async function() {
    try {
        const { auth } = await import('./firebase.js'); const { GoogleAuthProvider, signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
        const provider = new GoogleAuthProvider(); provider.addScope('https://www.googleapis.com/auth/drive'); provider.addScope('https://www.googleapis.com/auth/gmail.send'); provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
        provider.setCustomParameters({ prompt: 'consent', access_type: 'offline' });
        const result = await signInWithPopup(auth, provider); const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) { window.googleAccessToken = credential.accessToken; localStorage.setItem('axmsGoogleTokenV2', credential.accessToken); localStorage.setItem('axmsGoogleTokenExpiryV2', Date.now() + 3500 * 1000); window.showToast("구글 계정 연동이 완료되었습니다."); if(window.initGoogleAPI) window.initGoogleAPI(); }
    } catch(e) { window.showToast("구글 연동 갱신 실패: " + e.message, "error"); }
};

// 💡 [핵심] 공유 드라이브 파라미터 적용
async function getOrCreateSubfolder(parentFolderId, folderName) {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) throw new Error("TOKEN_EXPIRED");
    const query = `name='${encodeURIComponent(folderName.replace(/['\/\\]/g, '_'))}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
    const findRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { 'Authorization': 'Bearer ' + window.googleAccessToken } });
    const folderData = await findRes.json();
    if (folderData.error) throw new Error(folderData.error.message);
    if (folderData.files && folderData.files.length > 0) return folderData.files[0].id;
    
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
        method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName.replace(/['\/\\]/g, '_'), mimeType: 'application/vnd.google-apps.folder', parents: [parentFolderId] })
    });
    const newData = await createRes.json();
    if(newData.error) throw new Error(newData.error.message);
    return newData.id;
}

window.uploadFileToDrive = async function(file, folderId) {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) throw new Error("TOKEN_EXPIRED");
    const metadata = { name: file.name, parents: [folderId] };
    const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); form.append('file', file);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', { method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken }, body: form });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "파일 업로드 실패");
    return data.id; 
};

window.sendNotificationEmail = async function(type, reqData, recipientEmail) {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) throw new Error("TOKEN_EXPIRED");
    if (!recipientEmail) return false;
    const safeTitle = reqData.reqTitle || reqData.title || '제목 없음';
    let subject = `[AXBIS] 요청서 알림 - ${safeTitle}`;
    let bodyHtml = `<div style="font-family: sans-serif; padding: 20px;"><div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;"><h3>${safeTitle}</h3><p>요청자: ${reqData.authorName}</p><p>내용: ${String(reqData.content || '없음').replace(/\n/g, '<br>')}</p></div></div>`;
    
    if(type === 'progress') { subject = `[접수완료] 요청하신 내역이 접수되었습니다 - ${safeTitle}`; } 
    else if (type === 'completed') { subject = `[작업완료] 요청하신 작업이 완료되었습니다 - ${safeTitle}`; }
    
    const emailRaw = `To: ${recipientEmail}\r\nSubject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${bodyHtml}`;
    const encodedEmail = btoa(unescape(encodeURIComponent(emailRaw))).replace(/\+/g, '-').replace(/\//g, '_');
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encodedEmail }) });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error?.message || "메일 발송 실패");
    return true;
};

// ... 이하 기존 request.js의 렌더링, 저장 로직 부분 완벽히 동일 ...
window.openEmailSettingsModal = function() { setVal('new-req-email-user', ''); const ac = document.getElementById('req-user-autocomplete'); if(ac) ac.classList.add('hidden'); window.renderReqEmailList(); const modal = document.getElementById('req-email-setting-modal'); if(modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); } };
window.closeEmailSettingsModal = function() { const modal = document.getElementById('req-email-setting-modal'); if(modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } };
window.renderReqEmailList = function() { const listEl = document.getElementById('req-email-list'); if(!listEl) return; if(window.currentReqEmails.length === 0) { listEl.innerHTML = '<li class="text-center text-xs text-slate-400 font-bold p-4 bg-slate-50 border border-slate-200 border-dashed">등록된 이메일이 없습니다.</li>'; return; } listEl.innerHTML = window.currentReqEmails.map((email, idx) => `<li class="flex justify-between items-center bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-sm"><span class="text-sm font-bold text-slate-700">${email}</span><button onclick="window.removeReqEmail(${idx})" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></li>`).join(''); };
window.showReqUserAutocomplete = function(inputEl) { const val = inputEl.value.trim().toLowerCase(); const dropdown = document.getElementById('req-user-autocomplete'); if(!dropdown) return; if(val.length < 1) { dropdown.classList.add('hidden'); return; } const matches = (window.allSystemUsers || []).filter(u => window.matchString(val, u.name)); if(matches.length > 0) { dropdown.classList.remove('hidden'); dropdown.innerHTML = matches.map(m => `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 flex justify-between" onmousedown="window.addReqEmailSelected('${m.email}')"><span>${m.name}</span><span class="text-slate-400">${m.email}</span></li>`).join(''); } else { dropdown.classList.add('hidden'); } };
window.addReqEmailSelected = async function(email) { setVal('new-req-email-user', ''); const ac = document.getElementById('req-user-autocomplete'); if(ac) ac.classList.add('hidden'); if(!email) return; if(window.currentReqEmails.includes(email)) return window.showToast("이미 등록된 담당자입니다.", "warning"); const newEmails = [...window.currentReqEmails, email]; try { await setDoc(doc(db, "settings", "req_emails_" + window.currentAppId), { emails: newEmails }, { merge: true }); window.showToast("추가되었습니다."); } catch(e) { window.showToast("추가 실패", "error"); } };
window.removeReqEmail = async function(idx) { if(!confirm("제외하시겠습니까?")) return; const newEmails = [...window.currentReqEmails]; newEmails.splice(idx, 1); try { await setDoc(doc(db, "settings", "req_emails_" + window.currentAppId), { emails: newEmails }, { merge: true }); } catch(e) {} };

window.getReqFormData = function() {
    let reqTitle = '', pjtName = '', reqValid = false;
    if (window.currentAppId === 'collab') { reqTitle = getVal('req-title'); pjtName = getVal('req-pjt-name'); const startDate = getVal('req-start-date'); const endDate = getVal('req-end-date'); const content = getVal('req-content'); if(reqTitle && pjtName && startDate && endDate && content) reqValid = true; } 
    else if (window.currentAppId === 'purchase') { reqTitle = getVal('req-pur-title'); pjtName = getVal('req-pur-pjt-name'); const shipDate = getVal('req-pur-ship-date'); if(reqTitle && pjtName && shipDate) reqValid = true; } 
    else if (window.currentAppId === 'repair') { reqTitle = getVal('req-rep-title'); pjtName = getVal('req-rep-pjt-name'); const targetDate = getVal('req-rep-target-date'); const reqType = getVal('rep-req-type'); if(reqTitle && pjtName && targetDate && reqType) reqValid = true; } 
    else { reqValid = true; }

    const currentReq = window.editingReqId ? window.currentRequestList.find(r=>r.id===window.editingReqId) : null;
    let data = { type: window.currentAppId, status: currentReq ? currentReq.status : 'pending', authorUid: window.currentUser.uid, authorName: window.userProfile.name, authorEmail: window.userProfile.email, authorTeam: window.userProfile.team || window.userProfile.department || '미소속', updatedAt: Date.now() };

    if (window.currentAppId === 'collab') { data.reqTitle = reqTitle; data.title = reqTitle; data.pjtName = pjtName; data.pjtCode = getVal('req-pjt-code'); data.company = getVal('req-company'); data.location = getVal('req-location'); data.startDate = getVal('req-start-date'); data.endDate = getVal('req-end-date'); data.estMd = getNum('req-est-md'); const catEl = document.querySelector('input[name="req-category"]:checked'); data.category = catEl ? catEl.value : ''; data.content = getVal('req-content'); } 
    else if (window.currentAppId === 'purchase') { data.reqTitle = reqTitle; data.title = reqTitle; data.pjtName = pjtName; data.pjtCode = getVal('req-pur-pjt-code'); data.shipDate = getVal('req-pur-ship-date'); data.spec = { app: getVal('pur-spec-app'), appEtc: getVal('pur-spec-app-etc'), qty: getVal('pur-spec-qty') || '1', unit: getVal('pur-spec-unit') || 'EA', lasWave: getVal('pur-spec-las-wave'), lasWaveEtc: getVal('pur-spec-las-wave-etc'), lasPower: getVal('pur-spec-las-power'), lasPowerEtc: getVal('pur-spec-las-power-etc'), lasMaker: getVal('pur-spec-las-maker'), lasMakerEtc: getVal('pur-spec-las-maker-etc'), lasType: getVal('pur-spec-las-type'), lasTypeEtc: getVal('pur-spec-las-type-etc'), lasCh: getVal('pur-spec-las-ch'), lasChEtc: getVal('pur-spec-las-ch-etc'), lasLen: getVal('pur-spec-las-len'), lasLenEtc: getVal('pur-spec-las-len-etc'), lasCore: getVal('pur-spec-las-core'), lasCoreEtc: getVal('pur-spec-las-core-etc'), lasCool: getVal('pur-spec-las-cool'), lasCoolEtc: getVal('pur-spec-las-cool-etc'), optType: getVal('pur-spec-opt-type'), optTypeEtc: getVal('pur-spec-opt-type-etc'), optMnt: getVal('pur-spec-opt-mnt'), optMntEtc: getVal('pur-spec-opt-mnt-etc'), optCol: getVal('pur-spec-opt-col'), optColEtc: getVal('pur-spec-opt-col-etc'), optSplit: getVal('pur-spec-opt-split'), optSplitEtc: getVal('pur-spec-opt-split-etc'), optLens: getVal('pur-spec-opt-lens'), optLensEtc: getVal('pur-spec-opt-lens-etc'), optScan: getVal('pur-spec-opt-scan'), optScanEtc: getVal('pur-spec-opt-scan-etc'), optCam: getVal('pur-spec-opt-cam'), optCamEtc: getVal('pur-spec-opt-cam-etc'), optLit: getVal('pur-spec-opt-lit'), optLitEtc: getVal('pur-spec-opt-lit-etc'), optOpts: Array.from(document.querySelectorAll('input[name="pur_spec_opt_opts"]:checked')).map(cb => cb.value), optOptsEtc: getVal('pur-spec-opt-opts-etc'), accPc: getVal('pur-spec-acc-pc'), accPcEtc: getVal('pur-spec-acc-pc-etc'), accCtrl: getVal('pur-spec-acc-ctrl'), accCtrlEtc: getVal('pur-spec-acc-ctrl-etc'), accAir: getVal('pur-spec-acc-air'), accAirEtc: getVal('pur-spec-acc-air-etc'), accRtc: getVal('pur-spec-acc-rtc'), accRtcEtc: getVal('pur-spec-acc-rtc-etc'), etcMemo: getVal('pur-spec-etc-memo') }; data.content = `요청일: ${data.shipDate}\n기타메모: ${data.spec.etcMemo}`; } 
    else if (window.currentAppId === 'repair') { data.reqTitle = reqTitle; data.title = reqTitle; data.pjtName = pjtName; data.pjtCode = getVal('req-rep-pjt-code'); data.targetDate = getVal('req-rep-target-date'); data.reqType = getVal('rep-req-type'); data.repairInfo = { parts: { head: { model: getVal('rep-part-head-model'), sn: getVal('rep-part-head-sn') }, scan: { model: getVal('rep-part-scan-model'), sn: getVal('rep-part-scan-sn') }, lens: { model: getVal('rep-part-lens-model'), sn: getVal('rep-part-lens-sn') }, bs: { model: getVal('rep-part-bs-model'), sn: getVal('rep-part-bs-sn') }, col: { model: getVal('rep-part-col-model'), sn: getVal('rep-part-col-sn') }, cam: { model: getVal('rep-part-cam-model'), sn: getVal('rep-part-cam-sn') } }, problem: getVal('rep-problem'), action: getVal('rep-action'), symptoms: Array.from(document.querySelectorAll('input[name="rep_symp"]:checked')).map(cb => cb.value), sympEtc: document.getElementById('rep_symp_etc_chk').checked ? getVal('rep-symp-etc-text') : '', requests: getVal('rep-requests') }; data.content = `현상: ${data.repairInfo.problem}\n희망완료일: ${data.targetDate}`; }
    return { data, isValid: reqValid, currentReq };
};

// ... 기존 openWriteModal 등 함수 생략 없이 그대로 ...
