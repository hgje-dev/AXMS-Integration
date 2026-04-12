/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribeRequests = null;

// ==========================================
// 🚀 구글 API 연동 (Drive & Gmail) - 캐싱 기능 추가
// ==========================================
const GOOGLE_CLIENT_ID = '924354535197-joakn7gpfj4d3oirpd1pu3un9j7689q9.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/gmail.send';
const ADMIN_EMAIL = 'admin@axbis.ai'; 

window.googleAccessToken = null;

const DRIVE_FOLDERS = {
    'collab': '1q4pzChZi_FYFGK7cXuRK6GRbIeSzfkRC', 
    'purchase': '18SE2vn_OjZKWWOnthyrVA4fPoIcQP490', 
    'repair': '1YSIVOQhoq2gWnhSze-mmYgyDs0XkaeGj' 
};

// 💡 Drag & Drop 파일 선택 처리
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
    
    // 💡 로컬 스토리지에 토큰이 캐싱되어 있는지 확인 (1시간 이내)
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
        // 만료되었거나 없으면 연동 버튼 표시
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
            
            // 💡 토큰과 만료 시간(1시간 = 3600초)을 로컬 스토리지에 캐싱
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
    
    let subject = `[AXBIS] ${reqData.type === 'collab' ? '협업/조립 요청' : reqData.type} - ${reqData.title}`;
    let bodyHtml = `
        <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; border-radius: 10px;">
            <h2 style="color: #4f46e5;">AXBIS 시스템 자동 알림</h2>
            <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <p><strong>구분:</strong> ${reqData.category || '-'}</p>
                <p><strong>프로젝트명:</strong> ${reqData.pjtName || '-'}</p>
                <p><strong>요청자:</strong> ${reqData.authorName} (${reqData.authorTeam})</p>
                <p><strong>내용:</strong><br>${String(reqData.content || '').replace(/\n/g, '<br>')}</p>
                ${reqData.fileUrl ? `<p><strong>첨부파일:</strong> <a href="${reqData.fileUrl}">문서 확인하기</a></p>` : ''}
            </div>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">본 메일은 AXBIS 포털에서 자동 발송되었습니다.</p>
        </div>
    `;

    if(type === 'progress') {
        subject = `[AXBIS 접수완료] 요청하신 내역이 접수되었습니다 - ${reqData.title}`;
        bodyHtml = `<h2>요청하신 내역이 접수되어 진행 중입니다.</h2>${bodyHtml}`;
    } else if (type === 'completed') {
        subject = `[AXBIS 작업완료] 요청하신 작업이 완료되었습니다 - ${reqData.title}`;
        bodyHtml = `<h2>요청하신 작업이 성공적으로 완료되었습니다.</h2>${bodyHtml}`;
    }

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

window.openWriteModal = function(editId = null) { 
    window.editingReqId = editId; 
    
    document.getElementById('req-pjt-code').value = ''; 
    document.getElementById('req-pjt-name').value = ''; 
    document.getElementById('req-company').value = ''; 
    document.getElementById('req-location').value = ''; 
    document.getElementById('req-start-date').value = ''; 
    document.getElementById('req-end-date').value = ''; 
    document.getElementById('req-est-md').value = ''; 
    document.getElementById('req-content').value = ''; 
    window.clearSelectedFile();
    
    document.getElementById('req-file-link-wrap').classList.add('hidden');
    document.getElementById('admin-actions').classList.add('hidden');
    document.getElementById('req-modal-status-badge').classList.add('hidden');
    document.querySelector('input[name="req-category"][value="협업"]').checked = true;

    const titleMap = { 'collab': '새 협업/조립 요청서', 'purchase': '새 모듈 구매 의뢰서', 'repair': '새 수리/점검 요청서' };
    document.getElementById('req-header-title').innerText = titleMap[window.currentAppId] || '요청서 관리';
    document.getElementById('req-modal-title').innerText = titleMap[window.currentAppId] || '새 요청서 작성';

    if (window.currentAppId === 'collab') {
        document.getElementById('collab-form-fields').classList.remove('hidden');
    } else {
        document.getElementById('collab-form-fields').classList.remove('hidden');
    }

    if (editId) {
        const req = window.currentRequestList.find(r => r.id === editId);
        if (req) {
            document.getElementById('req-pjt-code').value = req.pjtCode || ''; 
            document.getElementById('req-pjt-name').value = req.pjtName || ''; 
            document.getElementById('req-company').value = req.company || ''; 
            document.getElementById('req-location').value = req.location || ''; 
            document.getElementById('req-start-date').value = req.startDate || ''; 
            document.getElementById('req-end-date').value = req.endDate || ''; 
            document.getElementById('req-est-md').value = req.estMd || ''; 
            document.getElementById('req-content').value = req.content || ''; 
            
            if(req.category) {
                const rEl = document.querySelector(`input[name="req-category"][value="${req.category}"]`);
                if(rEl) rEl.checked = true;
            }

            if(req.fileUrl) {
                document.getElementById('req-file-link-wrap').classList.remove('hidden');
                document.getElementById('req-file-link').href = req.fileUrl;
            }

            const badge = document.getElementById('req-modal-status-badge');
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

            if (window.userProfile && window.userProfile.role === 'admin') {
                const adminMenu = document.getElementById('admin-actions');
                adminMenu.classList.remove('hidden');
                if(req.status === 'completed') adminMenu.classList.add('hidden'); 
            }
        }
    }

    document.getElementById('write-modal').classList.remove('hidden'); 
    document.getElementById('write-modal').classList.add('flex'); 

    // 모달 뜰 때마다 구글 인증 초기화 (캐싱 처리 완료)
    window.initGoogleAPI();
};

window.closeWriteModal = function() { 
    document.getElementById('write-modal').classList.add('hidden'); 
    document.getElementById('write-modal').classList.remove('flex'); 
};

window.saveRequest = async function(btn) {
    const pjtName = document.getElementById('req-pjt-name').value.trim();
    const startDate = document.getElementById('req-start-date').value;
    const endDate = document.getElementById('req-end-date').value;
    const content = document.getElementById('req-content').value.trim();
    const fileInput = document.getElementById('req-file');
    
    const category = document.querySelector('input[name="req-category"]:checked')?.value || '';

    if(!pjtName || !startDate || !endDate || !content) {
        return window.showToast("별표(*)가 있는 필수 항목을 모두 입력해주세요.", "error");
    }

    if (!window.googleAccessToken) {
        return window.showToast("파일 업로드 및 메일 발송을 위해 [구글 계정 연동]을 먼저 진행해주세요.", "warning");
    }

    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 전송 중...';

    try { 
        let fileUrl = null;
        const targetFolderId = DRIVE_FOLDERS[window.currentAppId] || '';

        if (fileInput.files.length > 0 && targetFolderId) {
            window.showToast("구글 드라이브에 파일을 업로드 중입니다...");
            const fileId = await window.uploadFileToDrive(fileInput.files[0], targetFolderId);
            fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
        }

        const data = { 
            type: window.currentAppId, 
            status: 'pending', 
            title: pjtName, 
            pjtName: pjtName,
            pjtCode: document.getElementById('req-pjt-code').value.trim(),
            company: document.getElementById('req-company').value.trim(),
            location: document.getElementById('req-location').value.trim(),
            startDate: startDate,
            endDate: endDate,
            estMd: parseFloat(document.getElementById('req-est-md').value) || 0,
            category: category,
            content: content,
            fileUrl: fileUrl || (window.editingReqId ? window.currentRequestList.find(r=>r.id===window.editingReqId)?.fileUrl : null),
            authorUid: window.currentUser.uid, 
            authorName: window.userProfile.name, 
            authorEmail: window.userProfile.email,
            authorTeam: window.userProfile.team || window.userProfile.department || '미소속', 
            updatedAt: Date.now() 
        }; 

        if(window.editingReqId) { 
            await setDoc(doc(db,"requests",window.editingReqId), data, {merge:true}); 
        } else { 
            data.createdAt = Date.now(); 
            await addDoc(collection(db,"requests"), data); 
        } 

        window.showToast("관리자에게 확인 메일을 발송합니다...");
        await window.sendNotificationEmail('pending', data, ADMIN_EMAIL);

        window.showToast("성공적으로 등록 및 송부되었습니다."); 
        window.closeWriteModal(); 
    } catch(e) { 
        console.error(e);
        window.showToast("오류 발생: " + e.message, "error"); 
    } finally { 
        btn.disabled = false; 
        btn.innerHTML = '<i class="fa-regular fa-paper-plane"></i> 저장 및 메일 발송'; 
    }
};

window.acceptRequest = async function() {
    if (!window.editingReqId) return;
    if (!window.googleAccessToken) return window.showToast("구글 연동을 먼저 해주세요.", "error");

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    try {
        await setDoc(doc(db, "requests", window.editingReqId), { status: 'progress', updatedAt: Date.now() }, { merge: true });
        await window.sendNotificationEmail('progress', req, req.authorEmail);
        window.showToast("접수 완료 메일이 발송되었습니다.");
        window.closeWriteModal();
    } catch(e) { window.showToast("처리 실패", "error"); }
};

window.completeRequest = async function() {
    if (!window.editingReqId) return;
    if (!window.googleAccessToken) return window.showToast("구글 연동을 먼저 해주세요.", "error");

    const req = window.currentRequestList.find(r => r.id === window.editingReqId);
    try {
        await setDoc(doc(db, "requests", window.editingReqId), { status: 'completed', updatedAt: Date.now() }, { merge: true });
        await window.sendNotificationEmail('completed', req, req.authorEmail);
        window.showToast("작업 완료 메일이 발송되었습니다.");
        window.closeWriteModal();
    } catch(e) { window.showToast("처리 실패", "error"); }
};

window.loadRequestsData = function(appId) { 
    if(unsubscribeRequests) unsubscribeRequests(); 
    unsubscribeRequests = onSnapshot(query(collection(db, "requests"), where("type", "==", appId)), (s) => { 
        window.currentRequestList=[]; s.forEach(d=>window.currentRequestList.push({id:d.id,...d.data()})); 
        window.currentRequestList.sort((a,b)=>{ return (b.createdAt || 0) - (a.createdAt || 0); }); 
        if(window.renderRequestList) window.renderRequestList(); 
    }); 
};

window.renderRequestList = function() { 
    const tb = document.getElementById('request-tbody'); if(!tb) return; 
    
    if(window.currentRequestList.length===0) { 
        tb.innerHTML='<tr><td colspan="7" class="text-center p-8 text-slate-400 font-bold border-b border-slate-100">등록된 요청서가 없습니다.</td></tr>'; 
        return; 
    } 

    const statusMap = {
        'pending': '<span class="bg-slate-100 text-slate-600 px-2 py-1 rounded-md font-bold shadow-sm">대기중</span>',
        'progress': '<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-md font-bold shadow-sm">진행중</span>',
        'completed': '<span class="bg-emerald-100 text-emerald-600 px-2 py-1 rounded-md font-bold shadow-sm">완료</span>'
    };

    tb.innerHTML = window.currentRequestList.map(r=> {
        const safeTitle = String(r.title||'').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeCat = r.category || '-';
        const dateStr = r.createdAt ? window.getLocalDateStr(new Date(r.createdAt)) : '-';
        const badge = statusMap[r.status] || statusMap['pending'];

        return `
        <tr class="hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-100" onclick="window.openWriteModal('${r.id}')">
            <td class="p-3 text-center">${badge}</td>
            <td class="p-3 text-center font-bold text-slate-500">${safeCat}</td>
            <td class="p-3 font-bold text-indigo-700 truncate max-w-[200px]">${safeTitle}</td>
            <td class="p-3 text-center text-slate-600 font-medium">${r.authorName} <span class="text-[9px] bg-slate-100 text-slate-400 px-1 py-0.5 rounded">${r.authorTeam||''}</span></td>
            <td class="p-3 text-center font-bold text-purple-600">${r.estMd ? r.estMd.toFixed(1) : '-'}</td>
            <td class="p-3 text-center text-slate-400 font-bold">${dateStr}</td>
            <td class="p-3 text-center" onclick="event.stopPropagation()">
                <button onclick="window.deleteRequest('${r.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-2"><i class="fa-solid fa-trash-can"></i></button>
            </td>
        </tr>`;
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
