/* eslint-disable */
import { db } from './firebase.js';
import { collection, addDoc, query, where, onSnapshot, doc, setDoc, getDocs, writeBatch, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 전역 상태 변수
window.currentUser = null; 
window.userProfile = null; 
window.allSystemUsers = []; 
window.teamMembers = []; 
window.allDashProjects = []; 
window.allDashMdLogs = []; 
window.currentProjectStatusList = []; 
window.pjtCodeMasterList = []; 
window.currentRequestList = []; 
window.currentWeeklyLogList = []; 
window.currentProcessData = []; 
window.projectLogs = []; 
window.masterPresets = {}; 
window.projectCommentCounts = {}; 
window.projectIssueCounts = {}; 
window.projectLogCounts = {}; 
window.currentSelectedMembers = [];
window.currentProjDashView = 'list'; 
window.currentProjPartTab = '제조'; 
window.currentCategoryFilter = 'all'; 
window.currentReqView = 'list'; 
window.currentAppId = null; 
window.editingReqId = null; 
window.latestP50Md = 0; 
window.originalProjectName = ''; 
window.pendingSaveData = null; 
window.isProjectDirty = false; 
window.pendingAction = null; 
window.currentTab = 'hist'; 
window.latestHistData = null; 
window.latestTorData = null; 
window.theChart = null; 
window.dashChartObj = null; 
window.currentProjectId = null;

// 공통 날짜 및 유틸 함수
window.getTriangularRandom = function(min, mode, max) { 
    let u = Math.random(); 
    let F = (mode - min) / (max - min); 
    if (u <= F) return min + Math.sqrt(u * (max - min) * (mode - min));
    else return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
};

window.getNormalRandom = function(mean, stdDev) { 
    let u1 = Math.random(); 
    if (u1 === 0) u1 = 0.0001; 
    return (Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * Math.random())) * stdDev + mean; 
};

window.getLocalDateStr = function(d) { 
    if (!d || isNaN(d.getTime())) return "";
    let month = String(d.getMonth() + 1).padStart(2, '0');
    let day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + "-" + month + "-" + day;
};

window.getDateTimeStr = function(d) { 
    if (!d || isNaN(d.getTime())) return "";
    let year = d.getFullYear().toString().slice(2);
    let month = String(d.getMonth() + 1).padStart(2, '0');
    let day = String(d.getDate()).padStart(2, '0');
    let hour = String(d.getHours()).padStart(2, '0');
    let min = String(d.getMinutes()).padStart(2, '0');
    return year + "-" + month + "-" + day + " " + hour + ":" + min;
};

window.getWeekString = function(d) { 
    const date = new Date(d.getTime()); 
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7)); 
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1)); 
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7); 
    return date.getUTCFullYear() + "-W" + String(weekNo).padStart(2, '0'); 
};

window.getDatesFromWeek = function(weekStr) { 
    const parts = weekStr.split('-W');
    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    const d = new Date(year, 0, 1); 
    const dayOffset = (d.getDay() <= 4 && d.getDay() !== 0) ? 1 : 8; 
    const firstMonday = new Date(year, 0, d.getDate() - d.getDay() + dayOffset); 
    const start = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000); 
    const end = new Date(start); 
    end.setDate(end.getDate() + 6); 
    end.setHours(23, 59, 59, 999); 
    return { start: start, end: end }; 
};

const koreaHolidays = new Set(['2024-01-01','2024-03-01','2024-05-06','2024-12-25','2025-01-01','2025-05-05','2025-10-06','2025-12-25']); 
window.isWorkDay = function(d) { 
    const el = document.getElementById('apply-holidays'); 
    if(!el || !el.checked) return true; 
    if(d.getDay() === 0 || d.getDay() === 6) return false; 
    return !koreaHolidays.has(window.getLocalDateStr(d)); 
};

window.calculateWorkDate = function(s, d) { 
    let dt = new Date(s); 
    if(isNaN(dt.getTime())) return new Date(); 
    let a = 0; 
    while(a < d) { 
        dt.setDate(dt.getDate() + 1); 
        if(window.isWorkDay(dt)) a++; 
    } 
    return dt; 
};

window.showToast = function(msg, type) { 
    if (!type) type = "success";
    const c = document.getElementById('toast-container'); 
    if(!c) return; 
    const t = document.createElement('div'); 
    let bgClass = type === "success" ? "bg-emerald-600" : (type === "warning" ? "bg-amber-500" : "bg-rose-600");
    t.className = "toast text-white px-6 py-3 rounded-xl shadow-lg text-sm font-bold z-[9999] flex items-center gap-2 " + bgClass; 
    let iconHtml = type === "success" ? '<i class="fa-solid fa-circle-check"></i> ' : '<i class="fa-solid fa-triangle-exclamation"></i> ';
    t.innerHTML = iconHtml + msg; 
    c.appendChild(t); 
    setTimeout(function() { 
        t.style.opacity = '0'; 
        setTimeout(function() { t.remove(); }, 300); 
    }, 3000); 
};

window.getChosung = function(str) { 
    const cho=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]; 
    let res = ""; 
    for(let i=0; i<str.length; i++) { 
        let c = str.charCodeAt(i) - 44032; 
        if(c > -1 && c < 11172) res += cho[Math.floor(c / 588)]; 
        else res += str.charAt(i); 
    } 
    return res; 
};

window.matchString = function(q, t) { 
    if(!q) return true; 
    if(!t) return false; 
    q = q.toLowerCase(); 
    t = t.toLowerCase(); 
    if(t.includes(q)) return true; 
    if(window.getChosung(t).includes(q)) return true; 
    return false; 
};

window.toggleDarkMode = function() { 
    const h = document.documentElement;
    const i = document.getElementById('dark-mode-icon'); 
    if(h.classList.contains('dark')) { 
        h.classList.remove('dark'); 
        localStorage.setItem('color-theme', 'light'); 
        if(i) i.className = 'fa-solid fa-moon'; 
    } else { 
        h.classList.add('dark'); 
        localStorage.setItem('color-theme', 'dark'); 
        if(i) i.className = 'fa-solid fa-sun text-amber-400'; 
    } 
};

window.toggleSidebar = function(forceShow) { 
    const s = document.getElementById('sidebar'); 
    const b = document.getElementById('sidebar-backdrop'); 
    if(!s || !b) return; 
    const isClosed = s.classList.contains('-translate-x-full');
    let show = isClosed;
    if (typeof forceShow === 'boolean') show = forceShow;
    
    if(show) { 
        s.classList.remove('-translate-x-full'); 
        b.classList.remove('hidden'); 
    } else { 
        s.classList.add('-translate-x-full'); 
        b.classList.add('hidden'); 
    } 
};

window.toggleAuthMode = function(mode) { 
    const signupFields = document.getElementById('signup-fields');
    const btnLogin = document.getElementById('action-buttons-login');
    const btnSignup = document.getElementById('action-buttons-signup');
    const loginView = document.getElementById('login-view');
    const signupView = document.getElementById('signup-view');
    const authTitle = document.getElementById('auth-title');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');

    if (mode === 'signup') { 
        if (signupFields) signupFields.classList.remove('hidden'); 
        if (btnLogin) btnLogin.classList.add('hidden'); 
        if (btnSignup) btnSignup.classList.remove('hidden'); 
        if (loginView) loginView.classList.add('hidden'); 
        if (signupView) signupView.classList.remove('hidden'); 
        if (authTitle) authTitle.innerText = 'AXBIS 계정 생성'; 
        if (loginError) loginError.classList.add('hidden'); 
    } else { 
        if (signupFields) signupFields.classList.add('hidden'); 
        if (btnLogin) btnLogin.classList.remove('hidden'); 
        if (btnSignup) btnSignup.classList.add('hidden'); 
        if (loginView) loginView.classList.remove('hidden'); 
        if (signupView) signupView.classList.add('hidden'); 
        if (authTitle) authTitle.innerText = 'AXBIS Cloud 접속'; 
        if (signupError) signupError.classList.add('hidden'); 
    } 
};

window.formatMentions = function(text) {
    if(!text) return '';
    let formatted = text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded shadow-sm border border-blue-200">@$1</span>');
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="text-sky-500 hover:text-sky-700 underline break-all font-bold" onclick="event.stopPropagation()">$1</a>');
    return formatted;
};

// ==========================================
// 🔔 알림 및 멘션 시스템 로직 (개별 삭제 / 모달 오픈 연동 추가)
// ==========================================
window.toggleNotifications = function(event) { 
    if(event) event.stopPropagation(); 
    const dropdown = document.getElementById('notification-dropdown'); 
    if(dropdown) {
        if (dropdown.classList.contains('hidden')) dropdown.classList.remove('hidden'); 
        else dropdown.classList.add('hidden');
    }
};

let notiUnsubscribe = null;
window.loadNotifications = function() {
    if (!window.currentUser) return;
    if (notiUnsubscribe) notiUnsubscribe();
    
    const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid));
    notiUnsubscribe = onSnapshot(q, function(snapshot) {
        let notis = []; 
        let unreadCount = 0;
        
        snapshot.forEach(function(docSnap) { 
            const data = docSnap.data(); 
            data.id = docSnap.id;
            notis.push(data); 
            if (!data.isRead) unreadCount++; 
        });
        
        notis.sort((a, b) => b.createdAt - a.createdAt);
        
        const badgeWrap = document.getElementById('notification-badge'); 
        const countEl = document.getElementById('notification-count');
        
        if (badgeWrap && countEl) { 
            if (unreadCount > 0) { 
                badgeWrap.classList.remove('hidden'); 
                countEl.innerText = unreadCount > 99 ? '99+' : unreadCount; 
            } else {
                badgeWrap.classList.add('hidden'); 
            }
        }
        
        const listEl = document.getElementById('notification-list');
        if (listEl) {
            if (notis.length === 0) {
                listEl.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-bold">새로운 알림이 없습니다.</div>';
            } else {
                let htmlStr = '';
                notis.forEach(function(n) {
                    let opacityClass = n.isRead ? 'opacity-50' : 'bg-indigo-50/40';
                    let typeText = n.type || '알림';
                    let dateText = window.getDateTimeStr ? window.getDateTimeStr(new Date(n.createdAt)) : new Date(n.createdAt).toLocaleString();
                    
                    let pId = n.projectId ? `'${n.projectId}'` : 'null';
                    let tDesc = n.type ? `'${n.type}'` : 'null';

                    // 개별 삭제 버튼 및 클릭 시 모달창 오픈 로직 연동
                    htmlStr += `<div class="p-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 group relative ${opacityClass}" onclick="window.readNotification('${n.id}', ${pId}, ${tDesc})">`;
                    htmlStr += `  <button onclick="window.deleteNotification(event, '${n.id}')" class="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"><i class="fa-solid fa-xmark"></i></button>`;
                    htmlStr += `  <div class="text-[11px] font-bold text-indigo-600 mb-1 pr-6">${typeText}</div>`;
                    htmlStr += `  <div class="text-xs text-slate-700 font-bold leading-relaxed break-words">${n.message}</div>`;
                    htmlStr += `  <div class="text-[10px] text-slate-400 mt-1.5">${dateText}</div>`;
                    htmlStr += `</div>`;
                });
                listEl.innerHTML = htmlStr;
            }
        }
    });
};

// 💡 1. 알림 클릭 시 해당하는 모달창 오픈 로직 처리
window.readNotification = async function(id, projectId, type) { 
    try { 
        await setDoc(doc(db, "notifications", id), { isRead: true }, { merge: true }); 
        
        if (projectId) {
            const n = document.getElementById('notification-dropdown'); 
            if (n) n.classList.add('hidden');

            const safeType = type || '';
            let title = "상세 보기"; 
            
            // 알림 타입에 따라 관련된 모달을 엽니다.
            if (safeType.includes('코멘트')) {
                if(window.openCommentModal) window.openCommentModal(projectId, title);
            } else if (safeType.includes('이슈')) {
                if(window.openIssueModal) window.openIssueModal(projectId, title);
            } else if (safeType.includes('생산일지')) {
                if(window.openDailyLogModal) window.openDailyLogModal(projectId);
            } else if (safeType.includes('투입MD')) {
                if(window.openMdLogModal) window.openMdLogModal(projectId, title, 0);
            } else if (safeType.includes('요청서') || safeType.includes('의뢰서')) {
                 if(window.openWriteModal) window.openWriteModal(projectId);
            }
        }
    } catch(e) { console.error(e); } 
};

// 💡 3. 알림 개별 삭제 함수
window.deleteNotification = async function(e, id) {
    if (e) e.stopPropagation();
    if (!confirm("이 알림을 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "notifications", id));
    } catch(e) {
        console.error(e);
    }
};

window.markAllNotificationsRead = async function() { if(!window.currentUser) return; try { const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid), where("isRead", "==", false)); const snapshot = await getDocs(q); const batch = writeBatch(db); snapshot.forEach(function(d) { batch.update(d.ref, { isRead: true }); }); await batch.commit(); } catch(e) { console.error(e); } };
window.deleteAllNotifications = async function() { if(!window.currentUser) return; if(!confirm("모든 알림을 삭제하시겠습니까?")) return; try { const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid)); const snapshot = await getDocs(q); const batch = writeBatch(db); snapshot.forEach(function(d) { batch.delete(d.ref); }); await batch.commit(); window.showToast("알림이 모두 삭제되었습니다."); } catch(e) { console.error(e); } };

window.handleMention = function(textarea) {
    const val = textarea.value; 
    const cursorInfo = textarea.selectionStart;
    const textBeforeCursor = val.substring(0, cursorInfo); 
    const mentionMatch = textBeforeCursor.match(/@([가-힣a-zA-Z0-9_]*)$/);
    
    let dropdown = document.getElementById('mention-dropdown'); 
    if(!dropdown) {
        dropdown = document.createElement('ul');
        dropdown.id = 'mention-dropdown';
        dropdown.className = 'hidden absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-48 custom-scrollbar py-1';
        document.body.appendChild(dropdown);
    }

    if (mentionMatch) {
        const searchKeyword = mentionMatch[1].toLowerCase();
        const users = window.allSystemUsers || []; 
        const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchKeyword));
        
        if (filteredUsers.length > 0) {
            const rect = textarea.getBoundingClientRect(); 
            dropdown.style.left = (rect.left + window.scrollX) + 'px'; 
            dropdown.style.top = (rect.bottom + window.scrollY + 5) + 'px';
            dropdown.classList.remove('hidden'); 
            
            let dropHtml = '';
            filteredUsers.forEach(function(u) {
                let safeTeam = u.team || '소속없음';
                dropHtml += `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 flex items-center justify-between transition-colors" onmousedown="window.insertMention('${textarea.id}', '${u.name}', ${mentionMatch.index}, ${cursorInfo})"><span>${u.name}</span> <span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal">${safeTeam}</span></li>`;
            });
            dropdown.innerHTML = dropHtml;
        } else dropdown.classList.add('hidden');
    } else dropdown.classList.add('hidden');
};

window.insertMention = function(textareaId, name, startIndex, endIndex) {
    const textarea = document.getElementById(textareaId); 
    if(!textarea) return;
    const val = textarea.value;
    textarea.value = val.substring(0, startIndex) + '@' + name + ' ' + val.substring(endIndex);
    textarea.focus(); 
    const drop = document.getElementById('mention-dropdown');
    if (drop) drop.classList.add('hidden');
};

// 💡 2. 구글 연동이 안 되어 있을 시 경고를 띄워주어 메일이 왜 안 가는지 안내합니다.
window.notifyUser = async function(targetName, content, projectId, typeDesc) {
    if (!targetName) return false;
    const users = window.allSystemUsers || [];
    let targetUser = users.find(u => u.name === targetName);
    
    if (!targetUser || targetUser.uid === window.currentUser?.uid) return false;

    try {
        let sysName = window.userProfile ? window.userProfile.name : '시스템';
        let msgTitle = `📢 ${sysName}님이 [${typeDesc}] 을(를) 남겼습니다.`;
        
        // Firestore 알림(내부 DB)은 무조건 저장
        await addDoc(collection(db, "notifications"), {
            targetUid: targetUser.uid,
            senderName: sysName,
            type: typeDesc,
            message: `${msgTitle}\n내용: ${content}`,
            projectId: projectId || null,
            isRead: false,
            createdAt: Date.now()
        });

        // 타겟 유저에게 이메일이 있고 작성자가 구글 연동을 한 경우에만 메일 발송
        if (targetUser.email) {
            if (window.googleAccessToken) {
                const subject = `[AXBIS 알림] ${msgTitle}`;
                const bodyHtml = `
                    <div style="font-family: sans-serif; padding: 20px; background: #f8fafc; border-radius: 10px;">
                        <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
                            <h3 style="color: #4f46e5; margin-top:0;">${msgTitle}</h3>
                            <p><strong>작성자:</strong> ${sysName}</p>
                            <p><strong>내용:</strong></p>
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; color: #334155; font-size: 14px;">
                                ${String(content).replace(/\n/g, '<br>')}
                            </div>
                            <p style="margin-top: 20px;"><a href="https://axbis-portal.web.app" style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">포털 바로가기</a></p>
                        </div>
                    </div>`;
                    
                const emailRaw = `To: ${targetUser.email}\r\nSubject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${bodyHtml}`;
                const encodedEmail = btoa(unescape(encodeURIComponent(emailRaw))).replace(/\+/g, '-').replace(/\//g, '_');
                
                fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ raw: encodedEmail })
                }).catch(e => console.log("메일 발송 에러(무시가능):", e));
            } else {
                // 구글 연동 안 함. 사용자에게 최초 1회 경고해 줄 수도 있음 (토스트 알림)
                if (window.showToast) window.showToast("구글 계정이 연동되지 않아 알림 메일은 발송되지 않았습니다. 상단 우측 버튼으로 연동을 권장합니다.", "warning");
            }
        }
        return true;
    } catch(e) { 
        console.error("알림 생성 에러:", e); 
        return false;
    }
};

window.processMentions = async function(content, projectId, typeDesc) {
    let notifiedNames = [];
    if(!content) return notifiedNames;
    const mentions = content.match(/@([가-힣a-zA-Z0-9_]+)/g); 
    if(!mentions) return notifiedNames;
    
    let targetNames = [];
    mentions.forEach(m => {
        let cleanName = m.replace('@', '');
        if (!targetNames.includes(cleanName)) targetNames.push(cleanName);
    });
    
    for (let i = 0; i < targetNames.length; i++) {
        let success = await window.notifyUser(targetNames[i], content, projectId, typeDesc || '멘션');
        if (success) notifiedNames.push(targetNames[i]);
    }
    return notifiedNames;
};

// ==========================================
// 🏷️ PJT 코드 마스터 관리 및 자동완성 로직
// ==========================================

window.openProjCodeMasterModal = function() {
    const modal = document.getElementById('proj-code-master-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
    if(window.pjtCodeMasterList.length === 0) { if(window.loadProjectCodeMaster) window.loadProjectCodeMaster(); } 
    else { if(window.renderProjectCodeMaster) window.renderProjectCodeMaster(); }
};

window.closeProjCodeMasterModal = function() {
    const modal = document.getElementById('proj-code-master-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
};

let pjtCodeMasterUnsubscribe = null;
window.loadProjectCodeMaster = function() {
    if (pjtCodeMasterUnsubscribe) pjtCodeMasterUnsubscribe();
    pjtCodeMasterUnsubscribe = onSnapshot(collection(db, "pjt_code_master"), function(snapshot) {
        window.pjtCodeMasterList = [];
        snapshot.forEach(docSnap => { let data = docSnap.data(); data.id = docSnap.id; window.pjtCodeMasterList.push(data); });
        window.pjtCodeMasterList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const modal = document.getElementById('proj-code-master-modal');
        if(modal && !modal.classList.contains('hidden')) window.renderProjectCodeMaster();
    });
};

window.renderProjectCodeMaster = function() {
    const tbody = document.getElementById('pjt-code-tbody'); if(!tbody) return;
    if(window.pjtCodeMasterList.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 코드가 없습니다.</td></tr>'; return; }
    
    let htmlStr = '';
    window.pjtCodeMasterList.forEach(p => {
        htmlStr += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
            <td class="p-3 text-center"><input type="checkbox" value="${p.id}" class="pjt-checkbox accent-indigo-500 w-4 h-4 rounded cursor-pointer" onchange="window.updatePjtSelection()"></td>
            <td class="p-3 font-bold text-indigo-700 w-32">${p.code || '-'}</td>
            <td class="p-3 font-bold text-slate-700">${p.name || '-'}</td>
            <td class="p-3 text-slate-500 w-32">${p.company || '-'}</td>
            <td class="p-3 text-center w-20"><button onclick="window.deleteProjectCode('${p.id}')" class="text-slate-400 hover:text-rose-500 transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = htmlStr;
    const masterCb = document.getElementById('pjt-master-checkbox'); if (masterCb) masterCb.checked = false; window.updatePjtSelection();
};

window.toggleAllPjtCheckboxes = function(checked) {
    const checkboxes = document.querySelectorAll('.pjt-checkbox');
    checkboxes.forEach(cb => cb.checked = checked); window.updatePjtSelection();
};

window.updatePjtSelection = function() {
    const checkboxes = document.querySelectorAll('.pjt-checkbox');
    let checkedCount = 0; checkboxes.forEach(cb => { if(cb.checked) checkedCount++; });
    const btn = document.getElementById('btn-delete-selected-pjts');
    if (btn) {
        if (checkedCount > 0) { btn.classList.remove('hidden'); btn.innerText = `선택 삭제 (${checkedCount})`; } 
        else btn.classList.add('hidden');
    }
    const masterCb = document.getElementById('pjt-master-checkbox');
    if (masterCb && checkboxes.length > 0) masterCb.checked = (checkedCount === checkboxes.length);
};

window.deleteSelectedProjectCodes = async function() {
    const checkedBoxes = document.querySelectorAll('.pjt-checkbox:checked'); if (checkedBoxes.length === 0) return;
    if (!confirm(`선택한 ${checkedBoxes.length}개의 프로젝트 코드를 삭제하시겠습니까?`)) return;
    try {
        const batch = writeBatch(db);
        checkedBoxes.forEach(cb => batch.delete(doc(db, "pjt_code_master", cb.value)));
        await batch.commit(); window.showToast('삭제되었습니다.');
        const masterCb = document.getElementById('pjt-master-checkbox'); if (masterCb) masterCb.checked = false; window.updatePjtSelection();
    } catch(e) { window.showToast("삭제 중 오류가 발생했습니다.", "error"); }
};

window.toggleBulkPjtInput = function() {
    const area = document.getElementById('pjt-bulk-input-area');
    if (area) {
        if (area.classList.contains('hidden')) { area.classList.remove('hidden'); area.classList.add('flex'); } 
        else { area.classList.add('hidden'); area.classList.remove('flex'); }
    }
};

window.processBulkPjtInput = async function() {
    const textarea = document.getElementById('bulk-pjt-data'); if (!textarea) return;
    const text = textarea.value.trim(); if (!text) return window.showToast("입력된 데이터가 없습니다.", "error");
    
    const lines = text.split('\n'); let successCount = 0, duplicateCount = 0;
    try {
        const batch = writeBatch(db); let opCount = 0;
        let currentCodesAndNames = window.pjtCodeMasterList.map(p => `${p.code}|${p.name}`);
        
        for(let i = 0; i < lines.length; i++) {
            const line = lines[i].trim(); if(!line) continue;
            const parts = line.split('\t'); 
            const code = (parts[0] || '').trim(), name = (parts[1] || '').trim(), company = (parts[2] || '').trim();
            if(!code || !name) continue; 
            
            const uniqueKey = `${code}|${name}`;
            if (currentCodesAndNames.includes(uniqueKey)) { duplicateCount++; continue; }
            
            const newRef = doc(collection(db, "pjt_code_master"));
            batch.set(newRef, { code, name, company, authorUid: window.currentUser?.uid || 'unknown', authorName: window.userProfile?.name || 'unknown', createdAt: Date.now() + i });
            
            currentCodesAndNames.push(uniqueKey); successCount++; opCount++;
            if(opCount >= 490) { await batch.commit(); opCount = 0; }
        }
        if(opCount > 0) await batch.commit();
        let msg = `${successCount}건 등록 성공.`; if(duplicateCount > 0) msg += ` (중복 제외 ${duplicateCount}건)`;
        window.showToast(msg, successCount > 0 ? "success" : "warning"); textarea.value = ''; window.toggleBulkPjtInput();
    } catch(e) { window.showToast("일괄 등록 중 오류가 발생했습니다.", "error"); }
};

window.addProjectCode = async function() {
    const codeEl = document.getElementById('new-pjt-code'), nameEl = document.getElementById('new-pjt-name'), companyEl = document.getElementById('new-pjt-company');
    if(!codeEl || !nameEl || !companyEl) return;
    
    const code = codeEl.value.trim(), name = nameEl.value.trim(), company = companyEl.value.trim();
    if(!code || !name) return window.showToast("PJT 코드와 프로젝트명을 모두 입력해 주세요.", "error");

    if (window.pjtCodeMasterList.some(p => p.code === code || p.name === name)) {
        return window.showToast("🚨 이미 동일한 PJT 코드 또는 프로젝트명이 존재합니다!", "error");
    }

    try {
        await addDoc(collection(db, "pjt_code_master"), { code, name, company, authorUid: window.currentUser?.uid || 'unknown', authorName: window.userProfile?.name || 'unknown', createdAt: Date.now() });
        window.showToast("프로젝트 코드가 성공적으로 등록되었습니다."); codeEl.value = ''; nameEl.value = ''; companyEl.value = '';
    } catch(e) { window.showToast("등록 실패", "error"); }
};

window.deleteProjectCode = async function(id) {
    if(!confirm("이 마스터 코드를 삭제하시겠습니까? (기존에 등록된 현황 데이터는 삭제되지 않습니다)")) return;
    try { await deleteDoc(doc(db, "pjt_code_master", id)); window.showToast("삭제되었습니다."); } catch(e) { window.showToast("삭제 실패", "error"); }
};

window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
    const val = inputEl.value.trim().toLowerCase();
    let dropdown = document.getElementById('pjt-autocomplete-dropdown');
    
    if(!dropdown) {
        dropdown = document.createElement('ul'); dropdown.id = 'pjt-autocomplete-dropdown';
        dropdown.className = 'absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-full custom-scrollbar py-1';
        document.body.appendChild(dropdown);
    }
    if(val.length < 1) { dropdown.classList.add('hidden'); return; }

    let matches = window.pjtCodeMasterList.filter(p => isNameSearch ? (p.name.toLowerCase().includes(val) || window.matchString(val, p.name)) : p.code.toLowerCase().includes(val));

    if(matches.length > 0) {
        const rect = inputEl.getBoundingClientRect();
        dropdown.style.left = `${rect.left + window.scrollX}px`; dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`; dropdown.style.width = `${rect.width}px`;
        dropdown.classList.remove('hidden');

        dropdown.innerHTML = matches.map(m => {
            let safeName = m.name.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            return `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors" onmousedown="window.selectAutocomplete('${m.code}', '${safeName}', '${m.company || ''}', '${inputEl.id}', '${targetId1}', '${targetId2}')"><span class="text-indigo-600">[${m.code}]</span> ${m.name} <span class="text-[10px] text-slate-400">(${m.company || '업체미상'})</span></li>`;
        }).join('');
    } else dropdown.classList.add('hidden');
};

window.selectAutocomplete = function(code, name, company, sourceId, targetId1, targetId2) {
    const sourceEl = document.getElementById(sourceId), t1 = document.getElementById(targetId1), t2 = document.getElementById(targetId2);
    if (sourceId === 'ps-code') { if (sourceEl) sourceEl.value = code; if (t1) t1.value = name; if (t2) t2.value = company; } 
    else { if (sourceEl) sourceEl.value = name; if (t1) t1.value = code; if (t2) t2.value = company; }
    const drop = document.getElementById('pjt-autocomplete-dropdown'); if (drop) drop.classList.add('hidden');
};


// ==========================================
// 💡 상단 퀵메뉴 관련 로직
// ==========================================
window.availableApps = {
    'dashboard-home': { title: '대시보드', icon: 'fa-solid fa-chart-pie', color: 'text-indigo-600' },
    'project-status': { title: 'PJT현황', icon: 'fa-solid fa-table-list', color: 'text-slate-600' },
    'workhours': { title: '투입 현황', icon: 'fa-solid fa-user-clock', color: 'text-slate-600' },
    'weekly-log': { title: '주간일지', icon: 'fa-solid fa-calendar-week', color: 'text-slate-600' },
    'collab': { title: '협업/조립', icon: 'fa-regular fa-handshake', color: 'text-blue-600' },
    'purchase': { title: '구매의뢰', icon: 'fa-solid fa-cart-flatbed', color: 'text-emerald-600' },
    'repair': { title: '수리/점검', icon: 'fa-solid fa-stethoscope', color: 'text-rose-600' },
    'simulation': { title: '시뮬레이션', icon: 'fa-solid fa-bolt', color: 'text-amber-500' }
};

window.quickMenuItems = JSON.parse(localStorage.getItem('axbis_quick_menu')) || ['dashboard-home', 'project-status', 'workhours', 'weekly-log'];

window.renderQuickMenu = function() {
    const container = document.getElementById('quick-menu-container');
    if (!container) return;

    let html = '';
    window.quickMenuItems.forEach((key, index) => {
        const app = window.availableApps[key];
        if (!app) return;
        html += `
        <div class="group relative flex items-center bg-white border border-slate-200 px-3 py-1.5 rounded-full shadow-sm cursor-pointer hover:bg-indigo-50 transition-colors shrink-0" draggable="true" ondragstart="window.dragQmStart(event, ${index})" ondragover="event.preventDefault()" ondrop="window.dragQmDrop(event, ${index})">
            <div onclick="window.openApp('${key}', '${app.title}')" class="flex items-center gap-1.5">
                <i class="${app.icon} ${app.color} text-[11px]"></i>
                <span class="text-[11px] font-bold text-slate-700 whitespace-nowrap">${app.title}</span>
            </div>
            <button onclick="window.removeQuickMenu(event, ${index})" class="ml-2 w-4 h-4 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition-all"><i class="fa-solid fa-xmark text-[9px]"></i></button>
        </div>`;
    });

    if (window.quickMenuItems.length < 5) {
        html += `<button onclick="window.openQuickMenuAdd(event)" class="w-7 h-7 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-colors shrink-0 shadow-sm"><i class="fa-solid fa-plus text-xs"></i></button>`;
    }

    container.innerHTML = html;
};

window.dragQmStart = (e, index) => { window.draggedQmIndex = index; };
window.dragQmDrop = (e, dropIndex) => {
    e.preventDefault();
    if (window.draggedQmIndex === undefined || window.draggedQmIndex === dropIndex) return;
    const item = window.quickMenuItems.splice(window.draggedQmIndex, 1)[0];
    window.quickMenuItems.splice(dropIndex, 0, item);
    localStorage.setItem('axbis_quick_menu', JSON.stringify(window.quickMenuItems));
    window.renderQuickMenu();
};

window.openQuickMenuAdd = function(e) {
    if(e) e.stopPropagation();
    const drop = document.getElementById('qm-add-dropdown');
    if (drop.classList.contains('hidden')) {
        drop.classList.remove('hidden');
        let html = '';
        for (let key in window.availableApps) {
            if (!window.quickMenuItems.includes(key)) {
                const app = window.availableApps[key];
                html += `<li class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs font-bold text-slate-600 flex items-center gap-2 border-b border-slate-50 last:border-0 transition-colors" onclick="window.addQuickMenu('${key}')"><i class="${app.icon} ${app.color}"></i> ${app.title}</li>`;
            }
        }
        if (html === '') html = '<li class="px-3 py-2 text-xs text-slate-400 text-center">추가할 메뉴가 없습니다.</li>';
        drop.innerHTML = html;
    } else {
        drop.classList.add('hidden');
    }
};

window.addQuickMenu = function(key) {
    if (window.quickMenuItems.length >= 5) return window.showToast('최대 5개까지만 추가 가능합니다.', 'warning');
    if (!window.quickMenuItems.includes(key)) {
        window.quickMenuItems.push(key);
        localStorage.setItem('axbis_quick_menu', JSON.stringify(window.quickMenuItems));
        window.renderQuickMenu();
    }
    document.getElementById('qm-add-dropdown').classList.add('hidden');
};

window.removeQuickMenu = function(e, index) {
    if(e) e.stopPropagation();
    window.quickMenuItems.splice(index, 1);
    localStorage.setItem('axbis_quick_menu', JSON.stringify(window.quickMenuItems));
    window.renderQuickMenu();
};

// 통합 클릭 리스너 병합
document.addEventListener('click', function(e) {
    const n = document.getElementById('notification-dropdown'); if (n && !n.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) n.classList.add('hidden');
    const m = document.getElementById('mention-dropdown'); if (m && !m.classList.contains('hidden') && !e.target.closest('#mention-dropdown')) m.classList.add('hidden');
    const d = document.getElementById('pjt-autocomplete-dropdown'); if (d && !d.classList.contains('hidden') && !e.target.closest('#pjt-autocomplete-dropdown') && !e.target.closest('input[oninput*="showAutocomplete"]')) d.classList.add('hidden');
    const qm = document.getElementById('qm-add-dropdown'); if (qm && !qm.classList.contains('hidden') && !e.target.closest('#qm-add-dropdown') && !e.target.closest('button[onclick*="openQuickMenuAdd"]')) qm.classList.add('hidden');
});
