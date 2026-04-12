/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribeRequests = null;
let currentCommentUnsubscribe = null;
let unsubscribeEmails = null; 

window.currentReqEmails = []; 

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
    
    if(document.getElementById('filter-req-year')) document.getElementById('filter-req-year').value = '';
    if(document.getElementById('filter-req-month')) document.getElementById('filter-req-month').value = '';
    if(document.getElementById('filter-req-search')) document.getElementById('filter-req-search').value = '';
    
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
        fileInput.files = dataTransfer.files;
        
        document.getElementById('req-file-name-text').innerText = files[0].name;
        document.getElementById('req-file-name').classList.remove('hidden');
    }
};

window.clearSelectedFile = function(e) {
    if(e) e.stopPropagation();
    document.getElementById('req-file').value = '';
    document.getElementById('req-file-name').classList.add('hidden');
};

window.initGoogleAPI = function() {
    if (typeof google === 'undefined' || typeof gapi === 'undefined') {
        setTimeout(window.initGoogleAPI, 500);
        return;
    }
    
    const storedToken = localStorage.getItem('axmsGoogleToken');
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiry');
    
    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
        window.googleAccessToken = storedToken;
        gapi.load('client', () => {
            gapi.client.init({}).then(() => {
                gapi.client.setToken({ access_token: storedToken });
                gapi.client.load('drive', 'v3');
                gapi.client.load('gmail', 'v1');
            });
        });
        document.getElementById('google-auth-section')?.classList.add('hidden');
        document.getElementById('google-auth-status')?.classList.remove('hidden');
        document.getElementById('google-auth-status')?.classList.add('flex');
    } else {
        document.getElementById('google-auth-section')?.classList.remove('hidden');
        document.getElementById('google-auth-status')?.classList.add('hidden');
        document.getElementById('google-auth-status')?.classList.remove('flex');
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

            document.getElementById('google-auth-section')?.classList.add('hidden');
            document.getElementById('google-auth-status')?.classList.remove('hidden');
            document.getElementById('google-auth-status')?.classList.add('flex');
            window.showToast("구글 드라이브 연동이 완료되었습니다.");
            
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
    if (!window.tokenClient) {
        window.showToast("구글 API를 불러오는 중입니다. 잠시 후 다시 시도해주세요.", "warning");
        return;
    }
    if (!window.googleAccessToken) {
        window.tokenClient.requestAccessToken({prompt: 'consent'});
    }
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
                <p><strong>요청 내용:</strong><br>${String(reqData.content || '시스템 내 상세 사양을 확인해주세요.').replace(/\n/g, '<br>')}</p>
                ${reqData.fileUrl ? `<p style="margin-top:20px;"><strong>첨부파일(원문):</strong> <a href="${reqData.fileUrl}" style="color:#4f46e5; font-weight:bold;">문서 확인하기</a></p>` : ''}
            </div>
    `;

    if(type === 'progress') {
        subject = `[AXBIS 접수완료] 요청하신 내역이 접수되었습니다 - ${safeTitle}`;
        bodyHtml = `<h2 style="color: #4f46e5; font-size:18px;">요청하신 내역이 정상적으로 접수되어 진행 중입니다.</h2>${bodyHtml}`;
    } else if (type === 'completed') {
        subject = `[AXBIS 작업완료] 요청하신 작업이 완료되었습니다 - ${safeTitle}`;
        bodyHtml = `<h2 style="color: #10b981; font-size:18px;">요청하신 작업이 성공적으로 완료되었습니다.</h2>${bodyHtml}`;
        if (reqData.resultFileUrl) {
            bodyHtml += `
            <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin-top: 15px; border-radius: 4px;">
                <p style="margin:0; font-size: 14px;"><strong>✅ 완료 결과물 (검수 리스트 등):</strong> <a href="${reqData.resultFileUrl}" style="color:#059669; font-weight:bold;">결과 확인하기</a></p>
            </div>`;
        }
    }

    bodyHtml += `<p style="font-size: 11px; color: #94a3b8; margin-top: 20px;">본 메일은 AXBIS 클라우드 포털에서 자동 발송되었습니다.</p></div>`;

    const emailRaw = `To: ${recipientEmail}\r\n` +
                     `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\n` +
                     `Content-Type: text/html; charset="UTF-8"\r\n\r\n` +
                     bodyHtml;
                     
    const encodedEmail = btoa(unescape(encodeURIComponent(emailRaw))).replace(/\+/g, '-').replace(/\//g, '_');
    
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + window.googleAccessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: encodedEmail })
    });
    
    if (!res.ok) throw new Error("메일 발송 실패");
    return true;
};

window.openEmailSettingsModal = function() {
    document.getElementById('new-req-email-user').value = '';
    document.getElementById('req-user-autocomplete').classList.add('hidden');
    window.renderReqEmailList();
    document.getElementById('req-email-setting-modal').classList.remove('hidden');
    document.getElementById('req-email-setting-modal').classList.add('flex');
};

window.closeEmailSettingsModal = function() {
    document.getElementById('req-email-setting-modal').classList.add('hidden');
    document.getElementById('req-email-setting-modal').classList.remove('flex');
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
    
    if(val.length < 1) { 
        dropdown.classList.add('hidden'); 
        return; 
    }

    const matches = (window.allSystemUsers || []).filter(u => window.matchString(val, u.name));

    if(matches.length > 0) {
        dropdown.classList.remove('hidden');
        dropdown.innerHTML = matches.map(m => `
            <li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors flex justify-between items-center" 
                onmousedown="window.addReqEmailSelected('${m.email}')">
                <span>${m.name}</span>
                <span class="text-[10px] text-slate-400">${m.email}</span>
            </li>
        `).join('');
    } else {
        dropdown.classList.add('hidden');
    }
};

window.addReqEmailSelected = async function(email) {
    document.getElementById('new-req-email-user').value = '';
    document.getElementById('req-user-autocomplete').classList.add('hidden');
    
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


// ==========================================
// 💡 폼 UI 제어 (동적 사양서 로드 로직 추가)
// ==========================================
window.openWriteModal = function(editId = null) { 
    window.editingReqId = editId; 
    
    // 콜랩용 초기화
    if(document.getElementById('req-pjt-code')) document.getElementById('req-pjt-code').value = ''; 
    if(document.getElementById('req-pjt-name')) document.getElementById('req-pjt-name').value = ''; 
    if(document.getElementById('req-title')) document.getElementById('req-title').value = ''; 
    if(document.getElementById('req-company')) document.getElementById('req-company').value = ''; 
    if(document.getElementById('req-location')) document.getElementById('req-location').value = ''; 
    if(document.getElementById('req-start-date')) document.getElementById('req-start-date').value = ''; 
    if(document.getElementById('req-end-date')) document.getElementById('req-end-date').value = ''; 
    if(document.getElementById('req-est-md')) document.getElementById('req-est-md').value = ''; 
    if(document.getElementById('req-content')) document.getElementById('req-content').value = ''; 

    // 구매의뢰(Spec) 용 초기화
    if(document.getElementById('req-pur-title')) document.getElementById('req-pur-title').value = '';
    if(document.getElementById('req-pur-pjt-code')) document.getElementById('req-pur-pjt-code').value = '';
    if(document.getElementById('req-pur-pjt-name')) document.getElementById('req-pur-pjt-name').value = '';
    if(document.getElementById('req-pur-ship-date')) document.getElementById('req-pur-ship-date').value = '';
    if(document.getElementById('pur-spec-etc-memo')) document.getElementById('pur-spec-etc-memo').value = '';
    
    // 구매 Select/Text 초기화
    ['app','qty','unit','las-wave','las-power','las-maker','las-type','las-ch','las-len','las-core','las-cool','opt-type','opt-mnt','opt-col','opt-split','opt-lens','opt-scan','opt-cam','opt-lit','acc-pc','acc-ctrl','acc-air','acc-rtc'].forEach(k => {
        if(document.getElementById(`pur-spec-${k}`)) document.getElementById(`pur-spec-${k}`).value = (k==='qty') ? '1' : '';
        if(document.getElementById(`pur-spec-${k}-etc`)) document.getElementById(`pur-spec-${k}-etc`).value = '';
    });
    // 구매 다중 체크박스 초기화
    document.querySelectorAll('input[name="pur_spec_opt_opts"]').forEach(cb => cb.checked = false);
    if(document.getElementById('pur-spec-opt-opts-etc')) document.getElementById('pur-spec-opt-opts-etc').value = '';

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
            // 콜랩 셋
            if(document.getElementById('req-pjt-code')) document.getElementById('req-pjt-code').value = req.pjtCode || ''; 
            if(document.getElementById('req-pjt-name')) document.getElementById('req-pjt-name').value = req.pjtName || ''; 
            if(document.getElementById('req-title')) document.getElementById('req-title').value = req.reqTitle || req.title || ''; 
            if(document.getElementById('req-company')) document.getElementById('req-company').value = req.company || ''; 
            if(document.getElementById('req-location')) document.getElementById('req-location').value = req.location || ''; 
            if(document.getElementById('req-start-date')) document.getElementById('req-start-date').value = req.startDate || ''; 
            if(document.getElementById('req-end-date')) document.getElementById('req-end-date').value = req.endDate || ''; 
            if(document.getElementById('req-est-md')) document.getElementById('req-est-md').value = req.estMd || ''; 
            if(document.getElementById('req-content')) document.getElementById('req-content').value = req.content || ''; 
            if(req.category) {
                const rEl = document.querySelector(`input[name="req-category"][value="${req.category}"]`);
                if(rEl) rEl.checked = true;
            }

            // 💡 구매 셋 (Spec 복원 로직)
            if(document.getElementById('req-pur-title')) document.getElementById('req-pur-title').value = req.reqTitle || req.title || '';
            if(document.getElementById('req-pur-pjt-code')) document.getElementById('req-pur-pjt-code').value = req.pjtCode || '';
            if(document.getElementById('req-pur-pjt-name')) document.getElementById('req-pur-pjt-name').value = req.pjtName || '';
            if(document.getElementById('req-pur-ship-date')) document.getElementById('req-pur-ship-date').value = req.shipDate || '';
            
            if (req.spec) {
                const s = req.spec;
                ['app','qty','unit','lasWave','lasPower','lasMaker','lasType','lasCh','lasLen','lasCore','lasCool','optType','optMnt','optCol','optSplit','optLens','optScan','optCam','optLit','accPc','accCtrl','accAir','accRtc'].forEach(k => {
                    // HTML id는 '-' 로 구분되므로 변환
                    const htmlKey = k.replace(/([A-Z])/g, "-$1").toLowerCase();
                    if(document.getElementById(`pur-spec-${htmlKey}`)) document.getElementById(`pur-spec-${htmlKey}`).value = s[k] || '';
                    if(document.getElementById(`pur-spec-${htmlKey}-etc`)) document.getElementById(`pur-spec-${htmlKey}-etc`).value = s[`${k}Etc`] || '';
                });

                if(s.optOpts && Array.isArray(s.optOpts)) {
                    s.optOpts.forEach(val => {
                        const cb = document.querySelector(`input[name="pur_spec_opt_opts"][value="${val}"]`);
                        if(cb) cb.checked = true;
                    });
                }
                if(document.getElementById('pur-spec-opt-opts-etc')) document.getElementById('pur-spec-opt-opts-etc').value = s.optOptsEtc || '';
                if(document.getElementById('pur-spec-etc-memo')) document.getElementById('pur-spec-etc-memo').value = s.etcMemo || '';
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
                } else {
                    badge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shadow-sm";
                    badge.innerText = "접수 대기중";
                }
            }

            if (window.userProfile && window.userProfile.role === 'admin') {
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
                } else {
                    if(btnAccept) btnAccept.classList.remove('hidden');
                    if(btnComplete) btnComplete.classList.add('hidden');
                    if(btnRevert) btnRevert.classList.add('hidden');
                }
            }
        }
    }

    const m = document.getElementById('write-modal');
    if(m) {
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
    }
    window.initGoogleAPI();
};

window.closeWriteModal = function() { 
    const m = document.getElementById('write-modal');
    if(m) {
        m.classList.add('hidden'); 
        m.classList.remove('flex'); 
    }
};

window.promptSaveRequest = function() {
    let reqTitle, pjtName, reqValid = false;

    if (window.currentAppId === 'collab') {
        reqTitle = document.getElementById('req-title')?.value.trim() || '';
        pjtName = document.getElementById('req-pjt-name')?.value.trim() || '';
        const startDate = document.getElementById('req-start-date')?.value || '';
        const endDate = document.getElementById('req-end-date')?.value || '';
        const content = document.getElementById('req-content')?.value.trim() || '';
        if(reqTitle && pjtName && startDate && endDate && content) reqValid = true;
    } else if (window.currentAppId === 'purchase') {
        reqTitle = document.getElementById('req-pur-title')?.value.trim() || '';
        pjtName = document.getElementById('req-pur-pjt-name')?.value.trim() || '';
        const shipDate = document.getElementById('req-pur-ship-date')?.value || '';
        if(reqTitle && pjtName && shipDate) reqValid = true;
    } else {
        reqValid = true;
    }

    if(!reqValid) {
        return window.showToast("별표(*)가 있는 필수 항목을 모두 입력해주세요.", "error");
    }

    if (!window.googleAccessToken) {
        return window.showToast("파일 업로드 및 메일 발송을 위해 [구글 계정 연동]을 먼저 진행해주세요.", "warning");
    }

    if (window.currentReqEmails.length === 0) {
        return window.showToast("상단 [수신 담당자 설정]에서 메일을 받을 사람을 먼저 지정해주세요.", "warning");
    }
    
    if(document.getElementById('req-send-email-display')) {
        document.getElementById('req-send-email-display').innerText = window.currentReqEmails.join(', ');
    }
    
    const sm = document.getElementById('req-send-modal');
    if(sm) {
        sm.classList.remove('hidden');
        sm.classList.add('flex');
    }
};

window.executeSaveRequest = async function() {
    const sm = document.getElementById('req-send-modal');
    if(sm) {
        sm.classList.add('hidden');
        sm.classList.remove('flex');
    }
    
    const btn = document.getElementById('btn-req-save');
    if(btn) {
        btn.disabled = true; 
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 전송 중...';
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
        data.reqTitle = document.getElementById('req-title')?.value.trim() || '';
        data.title = data.reqTitle;
        data.pjtName = document.getElementById('req-pjt-name')?.value.trim() || '';
        data.pjtCode = document.getElementById('req-pjt-code')?.value.trim() || '';
        data.company = document.getElementById('req-company')?.value.trim() || '';
        data.location = document.getElementById('req-location')?.value.trim() || '';
        data.startDate = document.getElementById('req-start-date')?.value || '';
        data.endDate = document.getElementById('req-end-date')?.value || '';
        data.estMd = parseFloat(document.getElementById('req-est-md')?.value) || 0;
        data.category = document.querySelector('input[name="req-category"]:checked')?.value || '';
        data.content = document.getElementById('req-content')?.value.trim() || '';
    } else if (window.currentAppId === 'purchase') {
        data.reqTitle = document.getElementById('req-pur-title')?.value.trim() || '';
        data.title = data.reqTitle;
        data.pjtName = document.getElementById('req-pur-pjt-name')?.value.trim() || '';
        data.pjtCode = document.getElementById('req-pur-pjt-code')?.value.trim() || '';
        data.shipDate = document.getElementById('req-pur-ship-date')?.value || '';
        
        // 💡 구매의뢰서 상세 스펙(Spec) 데이터 추출
        data.spec = {
            app: document.getElementById('pur-spec-app')?.value || '',
            appEtc: document.getElementById('pur-spec-app-etc')?.value || '',
            qty: document.getElementById('pur-spec-qty')?.value || '1',
            unit: document.getElementById('pur-spec-unit')?.value || 'EA',
            
            lasWave: document.getElementById('pur-spec-las-wave')?.value || '',
            lasWaveEtc: document.getElementById('pur-spec-las-wave-etc')?.value || '',
            lasPower: document.getElementById('pur-spec-las-power')?.value || '',
            lasPowerEtc: document.getElementById('pur-spec-las-power-etc')?.value || '',
            lasMaker: document.getElementById('pur-spec-las-maker')?.value || '',
            lasMakerEtc: document.getElementById('pur-spec-las-maker-etc')?.value || '',
            lasType: document.getElementById('pur-spec-las-type')?.value || '',
            lasTypeEtc: document.getElementById('pur-spec-las-type-etc')?.value || '',
            lasCh: document.getElementById('pur-spec-las-ch')?.value || '',
            lasChEtc: document.getElementById('pur-spec-las-ch-etc')?.value || '',
            lasLen: document.getElementById('pur-spec-las-len')?.value || '',
            lasLenEtc: document.getElementById('pur-spec-las-len-etc')?.value || '',
            lasCore: document.getElementById('pur-spec-las-core')?.value || '',
            lasCoreEtc: document.getElementById('pur-spec-las-core-etc')?.value || '',
            lasCool: document.getElementById('pur-spec-las-cool')?.value || '',
            lasCoolEtc: document.getElementById('pur-spec-las-cool-etc')?.value || '',

            optType: document.getElementById('pur-spec-opt-type')?.value || '',
            optTypeEtc: document.getElementById('pur-spec-opt-type-etc')?.value || '',
            optMnt: document.getElementById('pur-spec-opt-mnt')?.value || '',
            optMntEtc: document.getElementById('pur-spec-opt-mnt-etc')?.value || '',
            optCol: document.getElementById('pur-spec-opt-col')?.value || '',
            optColEtc: document.getElementById('pur-spec-opt-col-etc')?.value || '',
            optSplit: document.getElementById('pur-spec-opt-split')?.value || '',
            optSplitEtc: document.getElementById('pur-spec-opt-split-etc')?.value || '',
            optLens: document.getElementById('pur-spec-opt-lens')?.value || '',
            optLensEtc: document.getElementById('pur-spec-opt-lens-etc')?.value || '',
            optScan: document.getElementById('pur-spec-opt-scan')?.value || '',
            optScanEtc: document.getElementById('pur-spec-opt-scan-etc')?.value || '',
            optCam: document.getElementById('pur-spec-opt-cam')?.value || '',
            optCamEtc: document.getElementById('pur-spec-opt-cam-etc')?.value || '',
            optLit: document.getElementById('pur-spec-opt-lit')?.value || '',
            optLitEtc: document.getElementById('pur-spec-opt-lit-etc')?.value || '',
            
            optOpts: Array.from(document.querySelectorAll('input[name="pur_spec_opt_opts"]:checked')).map(cb => cb.value),
            optOptsEtc: document.getElementById('pur-spec-opt-opts-etc')?.value || '',

            accPc: document.getElementById('pur-spec-acc-pc')?.value || '',
            accPcEtc: document.getElementById('pur-spec-acc-pc-etc')?.value || '',
            accCtrl: document.getElementById('pur-spec-acc-ctrl')?.value || '',
            accCtrlEtc: document.getElementById('pur-spec-acc-ctrl-etc')?.value || '',
            accAir: document.getElementById('pur-spec-acc-air')?.value || '',
            accAirEtc: document.getElementById('pur-spec-acc-air-etc')?.value || '',
            accRtc: document.getElementById('pur-spec-acc-rtc')?.value || '',
            accRtcEtc: document.getElementById('pur-spec-acc-rtc-etc')?.value || '',

            etcMemo: document.getElementById('pur-spec-etc-memo')?.value || ''
        };
        // 메일 본문용 텍스트 간략화
        data.content = `[시스템 등록 사양서 확인 요망]\n요청일: ${data.shipDate}\n기타메모: ${data.spec.etcMemo}`;
    }

    const fileInput = document.getElementById('req-file');
    const recipientEmails = window.currentReqEmails.join(',');
    data.recipientEmail = recipientEmails;

    try { 
        let fileUrl = null;
        const targetFolderId = DRIVE_FOLDERS[window.currentAppId] || '';

        if (fileInput && fileInput.files.length > 0 && targetFolderId) {
            window.showToast("구글 드라이브에 파일을 업로드 중입니다...");
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

        if(recipientEmails) {
            window.showToast("지정된 수신자에게 메일을 발송합니다...");
            await window.sendNotificationEmail('pending', data, recipientEmails);
        }

        window.showToast("성공적으로 저장 및 메일 발송이 완료되었습니다."); 
        window.closeWriteModal(); 
    } catch(e) { 
        console.error(e);
        window.showToast("오류 발생: " + e.message, "error"); 
    } finally { 
        if(btn) {
            btn.disabled = false; 
            btn.innerHTML = '<i class="fa-regular fa-paper-plane"></i> 저장 및 메일 발송'; 
        }
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
    if(am) {
        am.classList.remove('hidden');
        am.classList.add('flex');
    }
};

window.executeAcceptRequest = async function() {
    const am = document.getElementById('req-accept-modal');
    if(am) {
        am.classList.add('hidden');
        am.classList.remove('flex');
    }

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    const managerName = document.getElementById('req-accept-manager')?.value || '';
    const sendEmail = document.getElementById('req-accept-email')?.value.trim() || '';

    try {
        const payload = { 
            status: 'progress', 
            manager: managerName, 
            acceptedAt: Date.now(),
            updatedAt: Date.now() 
        };
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
        } else {
            fileSection.classList.add('hidden');
        }
    }

    const emailEl = document.getElementById('req-complete-email');
    if(emailEl) emailEl.value = req ? (req.authorEmail || '') : '';

    const cm = document.getElementById('req-complete-modal');
    if(cm) {
        cm.classList.remove('hidden');
        cm.classList.add('flex');
    }
};

window.executeCompleteRequest = async function() {
    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    const sendEmail = document.getElementById('req-complete-email')?.value.trim() || '';
    const fileInput = document.getElementById('req-complete-file');

    if (window.currentAppId === 'purchase' && (!fileInput || fileInput.files.length === 0)) {
        return window.showToast("모듈 구매 의뢰서는 작업 완료 시 [레이저 검수 리스트] 파일 첨부가 필수입니다.", "error");
    }

    const cm = document.getElementById('req-complete-modal');
    if(cm) {
        cm.classList.add('hidden');
        cm.classList.remove('flex');
    }
    const btn = document.getElementById('btn-req-complete-exec');
    if(btn) { btn.disabled = true; btn.innerHTML = '처리중...'; }

    try {
        let resultFileUrl = null;
        if (fileInput && fileInput.files.length > 0) {
            window.showToast("완료 결과물(검수 리스트)을 드라이브에 업로드 중입니다...");
            const fileId = await window.uploadFileToDrive(fileInput.files[0], DRIVE_FOLDERS[window.currentAppId]);
            resultFileUrl = `https://drive.google.com/file/d/${fileId}/view`;
        }

        const payload = { 
            status: 'completed', 
            completedAt: Date.now(),
            updatedAt: Date.now() 
        };
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
    } catch(e) { 
        window.showToast("처리 실패", "error"); 
    } finally {
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
        tb.innerHTML='<tr><td colspan="11" class="text-center p-8 text-slate-400 font-bold border-b border-slate-100">조건에 맞는 요청서가 없습니다.</td></tr>'; 
        return; 
    } 

    const statusMap = {
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
                return `
                <tr class="hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.openWriteModal('${r.id}')">
                    <td class="p-3 text-center">${badge}</td>
                    <td class="p-3 text-center">${commentHtml}</td>
                    <td class="p-3 font-bold text-slate-700 truncate max-w-[200px]">${safeTitle}</td>
                    <td class="p-3 text-center font-bold text-indigo-700">${r.pjtCode||'-'}</td>
                    <td class="p-3 font-black text-indigo-800 truncate max-w-[250px]">${safeReqTitle}</td>
                    <td class="p-3 text-center font-bold text-rose-500">${safeShipDate}</td>
                    <td class="p-3 text-center font-bold text-slate-600">${r.authorName} <span class="text-[9px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded block mt-0.5 w-max mx-auto">${r.authorTeam||''}</span></td>
                    <td class="p-3 text-center text-slate-500 font-medium">${dCreate}</td>
                    <td class="p-3 text-center text-blue-500 font-bold">${dAccept}</td>
                    <td class="p-3 text-center text-emerald-500 font-bold">${dComp}</td>
                    <td class="p-3 text-center" onclick="event.stopPropagation()">
                        <button onclick="window.deleteRequest('${r.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2"><i class="fa-solid fa-trash-can"></i></button>
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
                        <button onclick="window.deleteRequest('${r.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2"><i class="fa-solid fa-trash-can"></i></button>
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

window.openCommentModal = function(reqId, title) { 
    const cmtInput = document.getElementById('cmt-req-id');
    if(cmtInput) cmtInput.value = reqId; 
    window.cancelCommentAction(); 
    
    const cModal = document.getElementById('comment-modal');
    if(cModal) {
        cModal.classList.remove('hidden'); 
        cModal.classList.add('flex'); 
    }
    window.loadComments(reqId); 
};

window.loadComments = function(reqId) { 
    if (currentCommentUnsubscribe) currentCommentUnsubscribe(); 
    currentCommentUnsubscribe = onSnapshot(collection(db, "project_comments"), function(snapshot) { 
        try {
            window.currentComments = []; 
            snapshot.forEach(function(docSnap) { 
                const d = docSnap.data(); 
                if(d.projectId === reqId || d.reqId === reqId) {
                    d.id = docSnap.id;
                    window.currentComments.push(d); 
                }
            }); 
            const topLevel = window.currentComments.filter(function(c) { return !c.parentId || c.parentId === 'null' || c.parentId === ''; }).sort(function(a,b) { return window.reqGetSafeMillis(a.createdAt) - window.reqGetSafeMillis(b.createdAt); }); 
            const replies = window.currentComments.filter(function(c) { return c.parentId && c.parentId !== 'null' && c.parentId !== ''; }).sort(function(a,b) { return window.reqGetSafeMillis(a.createdAt) - window.reqGetSafeMillis(b.createdAt); }); 
            
            topLevel.forEach(function(c) { 
                c.replies = replies.filter(function(r) { return r.parentId === c.id; }); 
            }); 
            window.renderComments(topLevel); 
        } catch(e) { console.error(e); }
    }); 
};

window.renderComments = function(topLevelComments) { 
    const list = document.getElementById('comment-list'); 
    if(!list) return;
    if (topLevelComments.length === 0) { list.innerHTML = '<div class="text-center p-10 text-slate-400 font-bold">등록된 코멘트가 없습니다.</div>'; return; } 
    
    try {
        let listHtml = '';
        topLevelComments.forEach(function(c) { 
            try {
                let safeContent = String(c.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                if(window.formatMentions) safeContent = window.formatMentions(safeContent);
                const cImgHtml = c.imageUrl ? '<div class="mt-3 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[300px]"><img src="' + c.imageUrl + '" class="w-full h-auto cursor-pointer" onclick="window.open(\'' + c.imageUrl + '\')"></div>' : ''; 
                let repliesHtml = ''; 
                
                if(c.replies && c.replies.length > 0) { 
                    repliesHtml += '<div class="pl-4 border-l-[3px] border-indigo-100/60 space-y-2 mt-4 pt-2 ml-2">'; 
                    c.replies.forEach(function(r) { 
                        let safeReplyContent = String(r.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); 
                        if(window.formatMentions) safeReplyContent = window.formatMentions(safeReplyContent); 
                        const rImgHtml = r.imageUrl ? '<div class="mt-2 rounded-lg overflow-hidden border border-slate-200 w-fit max-w-[200px]"><img src="' + r.imageUrl + '" class="w-full h-auto cursor-pointer" onclick="window.open(\'' + r.imageUrl + '\')"></div>' : ''; 
                        
                        let replyBtnHtml = '';
                        if (r.authorUid === window.currentUser?.uid || (window.userProfile && window.userProfile.role === 'admin')) {
                            replyBtnHtml = '<button onclick="window.editComment(\'' + r.id + '\')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment(\'' + r.id + '\')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>';
                        }
                        
                        let rDateStr = r.createdAt ? (window.getDateTimeStr ? window.getDateTimeStr(new Date(window.reqGetSafeMillis(r.createdAt))) : new Date(window.reqGetSafeMillis(r.createdAt)).toLocaleString()) : '';

                        repliesHtml += '<div class="bg-slate-50 p-4 rounded-xl border border-slate-100"><div class="flex justify-between items-start mb-2"><div class="flex items-center gap-2"><i class="fa-solid fa-reply text-[10px] text-slate-400 rotate-180 scale-y-[-1]"></i><span class="font-black text-slate-700 text-sm">' + (r.authorName||'익명') + '</span><span class="text-xs font-medium text-slate-400">' + rDateStr + '</span></div><div class="flex gap-2">' + replyBtnHtml + '</div></div><div class="text-slate-700 text-[13px] font-medium pl-6 break-words">' + safeReplyContent + '</div>' + rImgHtml + '</div>'; 
                    }); 
                    repliesHtml += '</div>'; 
                } 
                
                let mainBtnHtml = '';
                if (c.authorUid === window.currentUser?.uid || (window.userProfile && window.userProfile.role === 'admin')) {
                    mainBtnHtml = '<button onclick="window.editComment(\'' + c.id + '\')" class="text-slate-400 hover:text-amber-500 px-1"><i class="fa-solid fa-pen-to-square"></i></button><button onclick="window.deleteComment(\'' + c.id + '\')" class="text-slate-400 hover:text-rose-500 px-1"><i class="fa-solid fa-trash-can"></i></button>';
                }
                
                let cDateStr = c.createdAt ? (window.getDateTimeStr ? window.getDateTimeStr(new Date(window.reqGetSafeMillis(c.createdAt))) : new Date(window.reqGetSafeMillis(c.createdAt)).toLocaleString()) : '';

                listHtml += '<div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm"><div class="flex justify-between items-start mb-3"><div class="flex items-center gap-2"><span class="font-black text-slate-800 text-[15px]">' + (c.authorName||'익명') + '</span><span class="text-xs font-medium text-slate-400">' + cDateStr + '</span></div><div class="flex gap-2"><button onclick="window.setReplyTo(\'' + c.id + '\', \'' + (c.authorName||'익명') + '\')" class="text-[11px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 px-3 py-1 rounded-lg font-bold transition-colors shadow-sm">답글달기</button>' + mainBtnHtml + '</div></div><div class="text-slate-800 text-[14px] font-medium pl-1 mb-2 break-words leading-relaxed">' + safeContent + '</div>' + cImgHtml + repliesHtml + '</div>'; 
            } catch(e2) { console.error(e2); }
        });
        list.innerHTML = listHtml;
    } catch(e) { 
        list.innerHTML = '<div class="text-center p-8 text-rose-500 font-bold">렌더링 오류 발생</div>'; 
        console.error("Comment Render Error:", e);
    }
};

window.saveCommentItem = async function() { 
    const reqIdEl = document.getElementById('cmt-req-id');
    if(!reqIdEl) return;
    const reqId = reqIdEl.value; 
    
    const contentEl = document.getElementById('new-cmt-text');
    const content = contentEl ? contentEl.value.trim() : ''; 
    
    const parentIdEl = document.getElementById('reply-to-id');
    const parentId = parentIdEl ? parentIdEl.value : null; 
    
    const editIdEl = document.getElementById('editing-cmt-id');
    const editId = editIdEl ? editIdEl.value : ''; 
    
    const fileInput = document.getElementById('new-cmt-image'); 
    
    if(!content && (!fileInput || fileInput.files.length === 0)) return window.showToast("코멘트 내용이나 사진을 첨부하세요.", "error"); 
    
    const btn = document.getElementById('btn-cmt-save');
    if(btn) {
        btn.innerHTML = '저장중..'; 
        btn.disabled = true; 
    }
    
    const saveData = async function(base64Img) { 
        try { 
            const payload = { content: content, updatedAt: Date.now() }; 
            if(base64Img) payload.imageUrl = base64Img; 
            
            if (editId) { 
                await setDoc(doc(db, "project_comments", editId), payload, { merge: true }); 
                window.showToast("코멘트가 수정되었습니다."); 
            } else { 
                payload.reqId = reqId; 
                payload.parentId = parentId; 
                payload.authorUid = window.currentUser.uid; 
                payload.authorName = window.userProfile.name; 
                payload.createdAt = Date.now(); 
                await addDoc(collection(db, "project_comments"), payload); 
                window.showToast("코멘트가 등록되었습니다."); 
            } 
            if(window.processMentions) await window.processMentions(content, reqId, "코멘트");
            window.cancelCommentAction(); 
        } catch(e) { 
            window.showToast("저장 중 오류 발생", "error"); 
        } finally { 
            if(btn) {
                btn.innerHTML = '작성'; 
                btn.disabled = false; 
            }
        } 
    }; 
    if(fileInput && fileInput.files.length > 0) { 
        window.resizeAndConvertToBase64(fileInput.files[0], function(base64) { saveData(base64); }); 
    } else { 
        saveData(null); 
    } 
};

window.editComment = function(id) { 
    const comment = window.currentComments.find(function(c) { return c.id === id; }); 
    if(!comment) return; 
    window.cancelCommentAction(); 
    
    const editIdEl = document.getElementById('editing-cmt-id');
    if(editIdEl) editIdEl.value = id; 
    
    const textEl = document.getElementById('new-cmt-text');
    if(textEl) textEl.value = comment.content || ''; 
    
    const btn = document.getElementById('btn-cmt-save');
    if(btn) btn.innerText = '수정'; 
    
    const indicatorName = document.getElementById('reply-indicator-name');
    if(indicatorName) indicatorName.innerHTML = '<i class="fa-solid fa-pen mr-1"></i> 코멘트 내용 수정 중'; 
    
    const indicator = document.getElementById('reply-indicator');
    if(indicator) indicator.classList.remove('hidden'); 
    
    if(textEl) textEl.focus(); 
};

window.setReplyTo = function(commentId, authorName) { 
    window.cancelCommentAction(); 
    
    const replyToEl = document.getElementById('reply-to-id');
    if(replyToEl) replyToEl.value = commentId; 
    
    const indicatorName = document.getElementById('reply-indicator-name');
    if(indicatorName) indicatorName.innerHTML = '<i class="fa-solid fa-reply rotate-180 scale-y-[-1] mr-1"></i> <b class="text-indigo-800">' + authorName + '</b> 님에게 답글 작성 중'; 
    
    const indicator = document.getElementById('reply-indicator');
    if(indicator) indicator.classList.remove('hidden'); 
    
    const textEl = document.getElementById('new-cmt-text');
    if(textEl) textEl.focus(); 
};

window.cancelCommentAction = function() { 
    if(document.getElementById('reply-to-id')) document.getElementById('reply-to-id').value = ''; 
    if(document.getElementById('editing-cmt-id')) document.getElementById('editing-cmt-id').value = ''; 
    if(document.getElementById('new-cmt-text')) document.getElementById('new-cmt-text').value = ''; 
    if(document.getElementById('new-cmt-image')) document.getElementById('new-cmt-image').value = ''; 
    if(document.getElementById('btn-cmt-save')) document.getElementById('btn-cmt-save').innerText = '작성'; 
    if(document.getElementById('reply-indicator')) document.getElementById('reply-indicator').classList.add('hidden'); 
};

window.closeCommentModal = function() { 
    const cModal = document.getElementById('comment-modal');
    if(cModal) {
        cModal.classList.add('hidden'); 
        cModal.classList.remove('flex'); 
    }
    if (currentCommentUnsubscribe) { currentCommentUnsubscribe(); currentCommentUnsubscribe = null; } 
};

window.deleteComment = async function(id) { 
    if(!confirm("이 코멘트를 삭제하시겠습니까?")) return; 
    try { 
        await deleteDoc(doc(db, "project_comments", id)); 
        const q = query(collection(db, "project_comments"), where("parentId", "==", id)); 
        const snapshot = await getDocs(q); 
        if(!snapshot.empty) { 
            const batch = writeBatch(db); 
            snapshot.forEach(function(d) { batch.delete(d.ref); }); 
            await batch.commit(); 
        } 
        window.showToast("삭제되었습니다."); 
        window.cancelCommentAction(); 
    } catch(e) { window.showToast("삭제 실패", "error"); } 
};
