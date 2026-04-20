/* eslint-disable */
import { db } from './firebase.js';
// 💡 getDoc 가 누락되어 있던 문제를 해결했습니다!
import { collection, addDoc, query, where, onSnapshot, doc, setDoc, getDoc, getDocs, writeBatch, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

window.getTriangularRandom = function(min, mode, max) { 
    let u = Math.random(); 
    let F = (mode - min) / (max - min); 
    if (u <= F) return min + Math.sqrt(u * (max - min) * (mode - min));
    else return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
};

window.getNormalRandom = function(mean, stdDev) { 
    let u1 = Math.random(); if (u1 === 0) u1 = 0.0001; 
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
    q = q.toLowerCase().replace(/\s/g, '');
    t = t.toLowerCase().replace(/\s/g, '');
    if (t.includes(q)) return true;
    let choT = window.getChosung(t);
    let choQ = window.getChosung(q);
    if (choT.includes(choQ)) return true;
    const enToKr = {'q':'ㅂ','w':'ㅈ','e':'ㄷ','r':'ㄱ','t':'ㅅ','y':'ㅛ','u':'ㅕ','i':'ㅑ','o':'ㅐ','p':'ㅔ','a':'ㅁ','s':'ㄴ','d':'ㅇ','f':'ㄹ','g':'ㅎ','h':'ㅗ','j':'ㅓ','k':'ㅏ','l':'ㅣ','z':'ㅋ','x':'ㅌ','c':'ㅊ','v':'ㅍ','b':'ㅠ','n':'ㅜ','m':'ㅡ'};
    let korQ = "";
    for(let i = 0; i < q.length; i++) korQ += enToKr[q[i]] || q[i];
    if (t.includes(korQ)) return true;
    if (choT.includes(window.getChosung(korQ))) return true;
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

window.formatMentions = function(text) {
    if(!text) return '';
    let formatted = text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded shadow-sm border border-blue-200">@$1</span>');
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="text-sky-500 hover:text-sky-700 underline break-all font-bold" onclick="event.stopPropagation()">$1</a>');
    return formatted;
};

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

window.readNotification = async function(id, projectId, type) { 
    try { 
        // 1. 알림 읽음 처리
        await setDoc(doc(db, "notifications", id), { isRead: true }, { merge: true }); 
        
        if (projectId) {
            // 2. 알림 드롭다운 닫기
            const n = document.getElementById('notification-dropdown'); 
            if (n) n.classList.add('hidden');
            
            const safeType = type || '';
            let title = "상세 보기"; 
            
            // 3. 페이지 이동 및 모달 띄우기 함수
            const openModalSafe = (modalId, targetPage, openCallback) => {
                if (!document.getElementById(modalId)) {
                    // 현재 뷰에 모달 요소가 없으면 해당 페이지로 먼저 이동
                    window.openApp(targetPage).then(() => {
                        // 페이지 로딩 시간 대기 후 모달 오픈
                        setTimeout(() => openCallback(), 500);
                    });
                } else {
                    // 현재 뷰에 모달이 있으면 바로 오픈
                    openCallback();
                }
            };

            // 4. 알림 타입별 분기 처리
            if (safeType.includes('코멘트')) {
                openModalSafe('comment-modal', 'project-status', () => {
                    if(window.openCommentModal) window.openCommentModal(projectId, title);
                });
            } else if (safeType.includes('이슈')) {
                openModalSafe('issue-modal', 'project-status', () => {
                    if(window.openIssueModal) window.openIssueModal(projectId, title);
                });
            } else if (safeType.includes('생산일지')) {
                openModalSafe('daily-log-modal', 'project-status', () => {
                    if(window.openDailyLogModal) window.openDailyLogModal(projectId);
                });
            } else if (safeType.includes('투입MD')) {
                openModalSafe('md-log-modal', 'project-status', () => {
                    if(window.openMdLogModal) window.openMdLogModal(projectId, title, 0);
                });
            } else if (safeType.includes('요청서') || safeType.includes('의뢰서')) {
                // 요청서/의뢰서 관련 모달
                openModalSafe('write-modal', 'collab', () => {
                    if(window.openWriteModal) window.openWriteModal(projectId);
                });
            }
        }
    } catch(e) { 
        console.error(e); 
    } 
};

window.deleteNotification = async function(e, id) {
    if (e) e.stopPropagation();
    if (!confirm("이 알림을 삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, "notifications", id)); } catch(e) { console.error(e); }
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

window.notifyUser = async function(targetName, content, projectId, typeDesc) {
    if (!targetName) return false;
    const users = window.allSystemUsers || [];
    let targetUser = users.find(u => u.name === targetName);
    
    if (!targetUser || targetUser.uid === window.currentUser?.uid) return false;

    try {
        let sysName = window.userProfile ? window.userProfile.name : '시스템';
        let msgTitle = `📢 ${sysName}님이 [${typeDesc}] 을(를) 남겼습니다.`;
        
        await addDoc(collection(db, "notifications"), {
            targetUid: targetUser.uid,
            senderName: sysName,
            type: typeDesc,
            message: `${msgTitle}\n내용: ${content}`,
            projectId: projectId || null,
            isRead: false,
            createdAt: Date.now()
        });

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
            }
        }
        return true;
    } catch(e) { return false; }
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

window.addTeamMember = async function() {
    const nameSel = document.getElementById('new-team-name');
    const partSel = document.getElementById('new-team-part');
    if (!nameSel || !partSel) return;

    const name = nameSel.value;
    const part = partSel.value;
    if (!name) return window.showToast("팀원을 선택해주세요.", "warning");

    const members = window.teamMembers || [];
    if (members.find(m => m.name === name)) return window.showToast("이미 등록된 팀원입니다.", "warning");

    try {
        const selectedOption = nameSel.options[nameSel.selectedIndex];
        const uid = selectedOption.getAttribute('data-uid') || '';
        await addDoc(collection(db, "team_members"), { name: name, part: part, uid: uid, createdAt: Date.now() });
        window.showToast("팀원이 성공적으로 추가되었습니다.");
        nameSel.value = "";
    } catch(e) { window.showToast("추가 실패: " + e.message, "error"); }
};

window.deleteTeamMember = async function(id) {
    if (!confirm("이 팀원을 목록에서 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "team_members", id));
        window.showToast("삭제되었습니다.");
    } catch(e) { window.showToast("삭제 실패", "error"); }
};

window.renderTeamMembers = function() {
    const tbody = document.getElementById('team-list-tbody');
    const count = document.getElementById('team-modal-count');
    const list = window.teamMembers || [];
    
    if (count) count.innerText = '총 ' + list.length + '명';
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-slate-400 font-bold">등록된 팀원이 없습니다.</td></tr>';
    } else {
        let sortedList = list.slice().sort((a,b) => (a.part||'').localeCompare(b.part||'') || (a.name||'').localeCompare(b.name||''));
        tbody.innerHTML = sortedList.map(function(t) { 
            const partColor = t.part === '제조' ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-teal-600 bg-teal-50 border-teal-200';
            return `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <td class="p-3 text-center"><span class="px-2 py-1 rounded-md text-[10px] font-bold ${partColor} shadow-sm border">${t.part || '-'}</span></td>
                <td class="p-3 font-bold text-slate-700">${t.name}</td>
                <td class="p-3 text-center"><button onclick="window.deleteTeamMember('${t.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`; 
        }).join('');
    }
};

window.populateUserDropdowns = function() {
    const sel = document.getElementById('new-team-name');
    if (sel && window.allSystemUsers) {
        let html = '<option value="">선택</option>';
        window.allSystemUsers.forEach(u => {
            html += `<option value="${u.name}" data-uid="${u.uid}">${u.name} (${u.team || '소속없음'})</option>`;
        });
        sel.innerHTML = html;
    }
};

// 💡 관리자 모달: 옵셔널 체이닝(?.)을 철저히 적용하여 undefined 에러를 완벽 차단!
window.renderAdminUsers = () => {
    const tb = document.getElementById('admin-users-tbody'); 
    if (!tb) return;
    const users = window.allSystemUsers || [];
    if (users.length === 0) { 
        tb.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-500 font-bold">등록된 사용자가 없습니다.</td></tr>'; 
        return; 
    }
    
    let teamGroups = {};
    users.forEach(u => {
        let t = u.team || u.department || '소속없음';
        if(!teamGroups[t]) teamGroups[t] = [];
        teamGroups[t].push(u);
    });

    let html = '';
    const now = Date.now(); 
    
    let sortedTeams = Object.keys(teamGroups).sort((a,b) => {
        if(a === 'AXBIS') return -1;
        if(b === 'AXBIS') return 1;
        if(a === '소속없음') return 1;
        if(b === '소속없음') return -1;
        return a.localeCompare(b);
    });

    const teamsList = [
        'AXBIS', '레이저사업본부', '제조기술팀', '장비기술팀', '모듈기술팀', 
        '제어팀', 'pm팀', '영업팀', '전략기획팀', '전략구매팀', '품질경영팀', 
        '설계팀', '선행설계팀', '공정개발팀', 'SW팀', '선행기술팀', '피플팀', 
        '북미법인', '기술연구소'
    ];

    sortedTeams.forEach(team => {
        let teamUsers = teamGroups[team];
        
        teamUsers.sort((a,b) => {
            const rW = { 'pending': 0, 'admin': 1, 'master': 2, 'team_admin': 3, 'user': 4 };
            return (rW[a.role] || 99) - (rW[b.role] || 99) || (a.name || '').localeCompare(b.name || '');
        });

        html += `<tr class="bg-indigo-50/20 border-y border-indigo-100">
                    <td colspan="7" class="p-2 px-6 font-black text-indigo-800 text-[12px] shadow-[inset_4px_0_0_#6366f1]">
                        <i class="fa-solid fa-users text-indigo-500 mr-2"></i>${team} 
                        <span class="text-[10px] font-bold text-indigo-400 ml-1">(${teamUsers.length}명)</span>
                    </td>
                 </tr>`;

        teamUsers.forEach(u => {
            // 💡 만약 DB의 u.permissions가 꼬여서 null/undefined로 내려오더라도 에러가 나지 않도록 빈 객체 할당 강화
            const p = (u && u.permissions) ? u.permissions : {}; 
            
            const isP = u.role === 'pending';
            const isMaster = (u.role === 'admin' || u.role === 'master');
            const trClass = isP ? 'bg-rose-50/40 border-l-4 border-rose-500' : 'hover:bg-slate-50 transition-colors border-b border-slate-100';
            
            const posOptions = ['대표','본부장','그룹장','팀장','책임매니저','선임매니저','매니저'].map(pos => `<option value="${pos}" ${u.position === pos ? 'selected' : ''}>${pos}</option>`).join('');
            const safePos = `<select class="block mt-1 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-indigo-600 bg-indigo-50 font-bold focus:outline-none cursor-pointer w-full text-center" onchange="window.updateUserPosition('${u.uid}', this.value)">
                                ${u.position ? '' : '<option value="" disabled selected>직책 미지정</option>'}
                                ${posOptions}
                             </select>`;

            const currentTeam = u.team || u.department || '';
            const teamOpts = teamsList.map(t => `<option value="${t}" ${currentTeam === t ? 'selected' : ''}>${t}</option>`).join('');
            const safeTeam = `<select class="border border-slate-300 rounded px-2 py-1.5 text-[11px] font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'} w-full focus:outline-none cursor-pointer text-center" onchange="window.updateUserTeam('${u.uid}', this.value)">
                                ${currentTeam ? '' : '<option value="" disabled selected>팀 미지정</option>'}
                                ${teamOpts}
                             </select>`;

            const lastActive = u.lastActive || 0;
            const isOnline = u.isOnline !== false && (now - lastActive < 10 * 60 * 1000);
            const statusBadge = isOnline 
                ? `<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-[10px] font-bold border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>온라인</span>` 
                : `<span class="inline-flex items-center gap-1.5 bg-slate-50 text-slate-500 px-2 py-1 rounded-full text-[10px] font-bold border border-slate-200"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>오프라인</span>`;
            const lastActiveStr = lastActive ? new Date(lastActive).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';

            // 💡 18개 권한 UI 블록: p?.['key'] 문법(옵셔널 체이닝)을 적용하여 에러 원천 차단
            const permHtml = isMaster ? 
                `<div class="text-center text-[10px] font-black text-indigo-500 bg-indigo-50 py-3 rounded-lg border border-indigo-100"><i class="fa-solid fa-unlock-keyhole mr-1"></i>최고 관리자 (모든 메뉴 접근 및 쓰기 가능)</div>` 
                : 
                `<div class="flex flex-col gap-1.5">
                    <div class="bg-slate-50 p-2 rounded border border-slate-200">
                        <span class="block text-[9px] font-black text-slate-400 mb-1">■ 페이지 접근 권한 (13개)</span>
                        <div class="grid grid-cols-4 gap-y-1.5 gap-x-2 text-left">
                            <label class="flex items-center gap-1 text-[10px] font-bold text-indigo-600"><input type="checkbox" class="accent-indigo-500" ${p?.['dashboard-home'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','dashboard-home',this.checked)">홈 대시보드</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-indigo-600"><input type="checkbox" class="accent-indigo-500" ${p?.['completion-report'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','completion-report',this.checked)">통합 완료보고</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-blue-600"><input type="checkbox" class="accent-blue-500" ${p?.['project-status'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','project-status',this.checked)">PJT 현황판</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-blue-600"><input type="checkbox" class="accent-blue-500" ${p?.['workhours'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','workhours',this.checked)">투입 현황</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-blue-600"><input type="checkbox" class="accent-blue-500" ${p?.['weekly-log'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','weekly-log',this.checked)">주간 업무</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><input type="checkbox" class="accent-emerald-500" ${p?.['product-cost'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','product-cost',this.checked)">Product Cost</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-amber-600"><input type="checkbox" class="accent-amber-500" ${p?.['mfg-cost'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','mfg-cost',this.checked)">제조 Cost</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-rose-500"><input type="checkbox" class="accent-rose-500" ${p?.['ncr-dashboard'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','ncr-dashboard',this.checked)">NCR 대시보드</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-rose-500"><input type="checkbox" class="accent-rose-500" ${p?.['quality-report'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','quality-report',this.checked)">품질 완료보고</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" class="accent-slate-500" ${p?.['collab'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','collab',this.checked)">협업/조립</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" class="accent-slate-500" ${p?.['purchase'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','purchase',this.checked)">구매 의뢰</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-600"><input type="checkbox" class="accent-slate-500" ${p?.['repair'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','repair',this.checked)">수리/점검</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-purple-600"><input type="checkbox" class="accent-purple-500" ${p?.['simulation'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','simulation',this.checked)">시뮬레이터</label>
                        </div>
                    </div>
                    <div class="bg-indigo-50/50 p-2 rounded border border-indigo-100">
                        <span class="block text-[9px] font-black text-indigo-500 mb-1">■ PJT 현황판 세부 항목 쓰기(Write) 권한 (부서 기본값 + 개인 예외 부여)</span>
                        <div class="grid grid-cols-5 gap-y-1.5 gap-x-2 text-left">
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-700"><input type="checkbox" class="accent-indigo-500" ${p?.['pjt-w-status'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','pjt-w-status',this.checked)">기본현황 등록</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-700"><input type="checkbox" class="accent-amber-500" ${p?.['pjt-w-pur'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','pjt-w-pur',this.checked)">구매 내역</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-700"><input type="checkbox" class="accent-teal-500" ${p?.['pjt-w-des'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','pjt-w-des',this.checked)">설계 파일</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-700"><input type="checkbox" class="accent-fuchsia-500" ${p?.['pjt-w-sch'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','pjt-w-sch',this.checked)">일정표</label>
                            <label class="flex items-center gap-1 text-[10px] font-bold text-slate-700"><input type="checkbox" class="accent-sky-500" ${p?.['pjt-w-log'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','pjt-w-log',this.checked)">생산일지</label>
                        </div>
                    </div>
                </div>`;

            html += `<tr class="${trClass}">
                <td class="p-3 text-center font-bold text-slate-800 border-r border-slate-100">${u.name}${safePos}</td>
                <td class="p-3 text-center border-r border-slate-100">${safeTeam}</td>
                <td class="p-3 text-center text-slate-500 border-r border-slate-100 truncate" title="${u.email}">${u.email.split('@')[0]}</td>
                <td class="p-3 text-center border-r border-slate-100" title="마지막 활동: ${lastActiveStr}">${statusBadge}<div class="text-[9px] text-slate-400 mt-1">${lastActiveStr}</div></td>
                <td class="p-3 text-center border-r border-slate-100">
                    <select class="w-full border border-slate-300 rounded px-2 py-1.5 text-[11px] font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'} cursor-pointer text-center" onchange="window.updateUserRole('${u.uid}', this.value)">
                        <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>승인 대기</option>
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>일반 사용자</option>
                        <option value="team_admin" ${u.role === 'team_admin' ? 'selected' : ''}>🛡️ 팀 관리자</option>
                        <option value="master" ${u.role === 'master' ? 'selected' : ''}>🛠️ 마스터</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 시스템 관리자</option>
                    </select>
                </td>
                <td class="p-3 px-5 border-r border-slate-100 bg-slate-50/30">
                    ${permHtml}
                </td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-2 flex-col lg:flex-row">
                        ${isP ? `<button onclick="window.approveUser('${u.uid}')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition-colors whitespace-nowrap">✅ 가입 승인</button>` : ''}
                        <button onclick="window.deleteUser('${u.uid}')" class="bg-white border border-rose-200 text-rose-500 hover:bg-rose-500 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-colors shadow-sm" title="계정 삭제"><i class="fa-solid fa-trash-can"></i> 삭제</button>
                    </div>
                </td>
            </tr>`;
        });
    });

    tb.innerHTML = html;
};

window.updateUserTeam = async (uid, team) => { try { await setDoc(doc(db, "users", uid), { team: team, department: team }, { merge: true }); if(window.showToast) window.showToast("소속 팀이 변경되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };
window.updateUserPosition = async (uid, pos) => { try { await setDoc(doc(db, "users", uid), { position: pos }, { merge: true }); if(window.showToast) window.showToast("직책이 변경되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };
window.updateUserRole = async (uid, role) => { try { await setDoc(doc(db, "users", uid), { role: role }, { merge: true }); if(window.showToast) window.showToast("등급이 변경되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };

// 💡 권한 업데이트 저장 시 빈 객체 증발을 확실히 방어하는 코드로 업데이트 되었습니다!
window.updateUserPerm = async (uid, key, val) => { 
    try { 
        const uR = doc(db, "users", uid); 
        const uD = await getDoc(uR); 
        if (uD.exists()) { 
            const data = uD.data();
            let p = data.permissions ? data.permissions : {}; 
            p[key] = val; 
            await setDoc(uR, { permissions: p }, { merge: true }); 
            if(window.showToast) window.showToast("권한이 업데이트되었습니다."); 
        } 
    } catch (e) { 
        console.error("권한 업데이트 에러:", e);
        if(window.showToast) window.showToast("오류 발생", "error"); 
    } 
};

window.approveUser = async (uid) => { try { await setDoc(doc(db, "users", uid), { role: 'user' }, { merge: true }); if(window.showToast) window.showToast("계정이 정상적으로 승인되었습니다.", "success"); } catch(e) { window.showToast("승인 처리 실패", "error"); console.error(e); } };
window.deleteUser = async (uid) => { if (!confirm("이 사용자를 정말 삭제하시겠습니까?\n\n삭제 시 해당 사용자의 시스템 접근이 즉시 영구 차단됩니다.\n(참고: 동일한 이메일로 다시 회원가입을 하려면 Firebase Authentication 콘솔에서도 계정을 삭제해주셔야 합니다.)")) return; try { await deleteDoc(doc(db, "users", uid)); if(window.showToast) window.showToast("계정 권한이 영구적으로 삭제(차단) 되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };

window.loadProjectCodeMaster = function() {
    onSnapshot(query(collection(db, "project_codes")), function(snapshot) {
        window.pjtCodeMasterList = [];
        snapshot.forEach(function(doc) {
            window.pjtCodeMasterList.push({ id: doc.id, ...doc.data() });
        });
        window.pjtCodeMasterList.sort(function(a,b) { return b.createdAt - a.createdAt; });
        if (document.getElementById('proj-code-master-modal') && !document.getElementById('proj-code-master-modal').classList.contains('hidden')) {
            window.renderProjectCodeMaster();
        }
    });
};

window.openProjCodeMasterModal = function() {
    document.getElementById('new-pjt-code').value = '';
    document.getElementById('new-pjt-name').value = '';
    document.getElementById('new-pjt-company').value = '';
    document.getElementById('proj-code-master-modal').classList.remove('hidden');
    document.getElementById('proj-code-master-modal').classList.add('flex');
    window.renderProjectCodeMaster();
};

window.closeProjCodeMasterModal = function() {
    document.getElementById('proj-code-master-modal').classList.add('hidden');
    document.getElementById('proj-code-master-modal').classList.remove('flex');
};

window.renderProjectCodeMaster = function() {
    const tbody = document.getElementById('pjt-code-tbody');
    if(!tbody) return;
    if(window.pjtCodeMasterList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-slate-400 font-bold">등록된 PJT 코드가 없습니다.</td></tr>';
        return;
    }
    let html = '';
    window.pjtCodeMasterList.forEach(function(p) {
        html += `<tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
                    <td class="p-3 text-center"><input type="checkbox" value="${p.id}" class="pjt-master-cb accent-indigo-500 w-4 h-4 rounded cursor-pointer" onchange="window.updatePjtDeleteBtn()"></td>
                    <td class="p-3 text-center font-bold text-indigo-700">${p.code}</td>
                    <td class="p-3 font-bold text-slate-700">${p.name}</td>
                    <td class="p-3 text-center text-slate-600">${p.company || '-'}</td>
                    <td class="p-3 text-center"><button onclick="window.deleteProjectCode('${p.id}')" class="text-slate-300 hover:text-rose-500 p-1.5 transition-colors"><i class="fa-solid fa-trash-can"></i></button></td>
                </tr>`;
    });
    tbody.innerHTML = html;
    window.updatePjtDeleteBtn();
};

window.addProjectCode = async function() {
    const code = document.getElementById('new-pjt-code').value.trim();
    const name = document.getElementById('new-pjt-name').value.trim();
    const company = document.getElementById('new-pjt-company').value.trim();
    if(!code || !name) return window.showToast("PJT 코드와 프로젝트명을 모두 입력하세요.", "error");
    
    try {
        await addDoc(collection(db, "project_codes"), { code: code, name: name, company: company, createdAt: Date.now() });
        window.showToast("PJT 코드가 등록되었습니다.");
        document.getElementById('new-pjt-code').value = '';
        document.getElementById('new-pjt-name').value = '';
        document.getElementById('new-pjt-company').value = '';
    } catch(e) { window.showToast("등록 실패", "error"); }
};

window.deleteProjectCode = async function(id) {
    if(!confirm("이 PJT 코드를 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "project_codes", id));
        window.showToast("삭제되었습니다.");
    } catch(e) { window.showToast("삭제 실패", "error"); }
};

window.toggleAllPjtCheckboxes = function(checked) {
    document.querySelectorAll('.pjt-master-cb').forEach(cb => cb.checked = checked);
    window.updatePjtDeleteBtn();
};

window.updatePjtDeleteBtn = function() {
    const btn = document.getElementById('btn-delete-selected-pjts');
    const checked = document.querySelectorAll('.pjt-master-cb:checked').length;
    if(btn) {
        if(checked > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
};

window.deleteSelectedProjectCodes = async function() {
    const cbs = document.querySelectorAll('.pjt-master-cb:checked');
    if(cbs.length === 0) return;
    if(!confirm(`선택한 ${cbs.length}개의 PJT 코드를 삭제하시겠습니까?`)) return;
    try {
        const batch = writeBatch(db);
        cbs.forEach(cb => { batch.delete(doc(db, "project_codes", cb.value)); });
        await batch.commit();
        window.showToast("선택한 항목이 삭제되었습니다.");
        document.getElementById('pjt-master-checkbox').checked = false;
    } catch(e) { window.showToast("일괄 삭제 실패", "error"); }
};

window.toggleBulkPjtInput = function() {
    const area = document.getElementById('pjt-bulk-input-area');
    if(area.classList.contains('hidden')) {
        area.classList.remove('hidden');
        area.classList.add('flex');
        document.getElementById('bulk-pjt-data').value = '';
    } else {
        area.classList.add('hidden');
        area.classList.remove('flex');
    }
};

window.processBulkPjtInput = async function() {
    const data = document.getElementById('bulk-pjt-data').value.trim();
    if(!data) return window.showToast("데이터를 입력하세요.", "warning");
    
    const lines = data.split('\n');
    let validItems = [];
    lines.forEach(line => {
        const parts = line.split('\t');
        if(parts.length >= 2) {
            const code = parts[0].trim();
            const name = parts[1].trim();
            const comp = parts.length > 2 ? parts[2].trim() : '';
            if(code && name && !window.pjtCodeMasterList.some(p => p.code === code)) {
                validItems.push({code: code, name: name, company: comp, createdAt: Date.now()});
            }
        }
    });
    
    if(validItems.length === 0) return window.showToast("새로 등록할 유효한 데이터가 없습니다. (형식 오류 또는 중복)", "warning");
    if(!confirm(`${validItems.length}건의 데이터를 일괄 등록하시겠습니까?`)) return;
    
    try {
        const batch = writeBatch(db);
        validItems.forEach(item => {
            const ref = doc(collection(db, "project_codes"));
            batch.set(ref, item);
        });
        await batch.commit();
        window.showToast(`${validItems.length}건 일괄 등록 완료!`, "success");
        window.toggleBulkPjtInput();
    } catch(e) { window.showToast("일괄 등록 실패", "error"); }
};

window.openImageViewer = function(src) {
    if (!src || typeof src !== 'string') return;
    
    if (src.startsWith('data:image') || src.includes('thumbnail?id=') || src.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i)) {
        let existing = document.getElementById('axbis-lightbox');
        if (existing) existing.remove();

        const viewer = document.createElement('div');
        viewer.id = 'axbis-lightbox';
        viewer.className = 'fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm cursor-zoom-out opacity-0 transition-opacity duration-300';
        
        viewer.onclick = function() {
            viewer.classList.remove('opacity-100');
            setTimeout(() => viewer.remove(), 300);
        };

        const img = document.createElement('img');
        img.src = src;
        img.className = 'max-w-[95vw] max-h-[95vh] object-contain rounded-xl shadow-2xl transform scale-95 transition-transform duration-300';
        img.onclick = function(e) { e.stopPropagation(); };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'absolute top-6 right-6 text-white/70 hover:text-white text-4xl transition-colors';
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

        viewer.appendChild(img);
        viewer.appendChild(closeBtn);
        document.body.appendChild(viewer);

        requestAnimationFrame(() => {
            viewer.classList.add('opacity-100');
            img.classList.remove('scale-95');
            img.classList.add('scale-100');
        });
    } else {
        window.open(src, '_blank');
    }
};

window.resizeAndConvertToBase64 = function(file, callback, targetMaxSize) {
    if (!file || !file.type.match(/image.*/)) {
        callback(null);
        return;
    }
    const reader = new FileReader();
    reader.onload = function(readerEvent) {
        const image = new Image();
        image.onload = function() {
            const canvas = document.createElement('canvas');
            const maxSize = targetMaxSize || 1200; 
            let width = image.width;
            let height = image.height;
            
            if (width > height && width > maxSize) {
                height *= maxSize / width;
                width = maxSize;
            } else if (height > maxSize) {
                width *= maxSize / height;
                height = maxSize;
            }
            
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(image, 0, 0, width, height);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            callback(dataUrl);
        };
        image.onerror = function() { callback(null); };
        image.src = readerEvent.target.result;
    };
    reader.onerror = function() { callback(null); };
    reader.readAsDataURL(file);
};

window.showAutocomplete = function(inputEl, targetId1, targetId2, isNameSearch) {
    const val = inputEl.value.trim().toLowerCase(); 
    let dropdown = document.getElementById('pjt-autocomplete-dropdown');
    
    if(!dropdown) { 
        dropdown = document.createElement('ul'); 
        dropdown.id = 'pjt-autocomplete-dropdown'; 
        dropdown.className = 'absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-full custom-scrollbar py-1 mt-1'; 
        document.body.appendChild(dropdown); 
    }
    
    if(val.length < 1) { 
        dropdown.classList.add('hidden'); 
        return; 
    }
    
    let matches = [];
    const masterList = window.pjtCodeMasterList || [];
    for (let i = 0; i < masterList.length; i++) {
        let p = masterList[i];
        if (isNameSearch) { 
            if ((p.name || '').toLowerCase().includes(val) || window.matchString(val, p.name)) matches.push(p); 
        } else { 
            if ((p.code || '').toLowerCase().includes(val) || window.matchString(val, p.code)) matches.push(p); 
        }
    }
    
    if(matches.length > 0) {
        const rect = inputEl.getBoundingClientRect(); 
        dropdown.style.left = (rect.left + window.scrollX) + 'px'; 
        dropdown.style.top = (rect.bottom + window.scrollY + 5) + 'px'; 
        dropdown.style.width = rect.width + 'px'; 
        dropdown.classList.remove('hidden');
        
        let dropHtml = '';
        matches.forEach(function(m) {
            let safeCompany = m.company || '업체미상'; 
            let safeName = (m.name || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;");
            let safeCode = m.code || '-';
            dropHtml += `<li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 truncate transition-colors" onmousedown="window.selectAutocomplete('${safeCode}', '${safeName}', '${safeCompany}', '${inputEl.id}', '${targetId1}', '${targetId2}')"><span class="text-indigo-600">[${safeCode}]</span> ${m.name} <span class="text-[10px] text-slate-400">(${safeCompany})</span></li>`;
        }); 
        dropdown.innerHTML = dropHtml;
    } else { 
        dropdown.classList.add('hidden'); 
    }
};

window.selectAutocomplete = function(code, name, company, sourceId, targetId1, targetId2) { 
    const sourceEl = document.getElementById(sourceId); 
    const t1 = document.getElementById(targetId1); 
    const t2 = document.getElementById(targetId2); 
    
    // 해결: 입력창 ID에 'code'가 포함되어 있는지 범용적으로 확인
    if (sourceId.includes('code')) { 
        if (sourceEl) sourceEl.value = code; 
        if (t1) t1.value = name; 
        if (t2 && company !== 'undefined') t2.value = company; 
    } else { 
        if (sourceEl) sourceEl.value = name; 
        if (t1) t1.value = code; 
        if (t2 && company !== 'undefined') t2.value = company; 
    } 
    
    const drop = document.getElementById('pjt-autocomplete-dropdown'); 
    if (drop) drop.classList.add('hidden'); 
};

document.addEventListener('click', function(e) {
    const n = document.getElementById('notification-dropdown'); 
    if (n && !n.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) {
        n.classList.add('hidden');
    }
    const m = document.getElementById('mention-dropdown'); 
    if (m && !m.classList.contains('hidden') && !e.target.closest('#mention-dropdown')) {
        m.classList.add('hidden');
    }
    const d = document.getElementById('pjt-autocomplete-dropdown'); 
    if (d && !d.classList.contains('hidden') && !e.target.closest('#pjt-autocomplete-dropdown') && !e.target.closest('input[oninput*="showAutocomplete"]')) {
        d.classList.add('hidden');
    }
});
