import { db } from './firebase.js';
import { collection, addDoc, query, where, onSnapshot, doc, setDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

window.currentUser = null; window.userProfile = null; window.allSystemUsers = []; window.teamMembers = []; window.allDashProjects = []; window.allDashMdLogs = []; window.currentProjectStatusList = []; window.pjtCodeMasterList = []; window.currentRequestList = []; window.currentWeeklyLogList = []; window.currentProcessData = []; window.projectLogs = []; window.masterPresets = {}; window.projectCommentCounts = {}; window.projectIssueCounts = {}; window.projectLogCounts = {}; window.currentSelectedMembers = [];
window.currentProjDashView = 'list'; window.currentProjPartTab = '제조'; window.currentCategoryFilter = 'all'; window.currentReqView = 'list'; window.currentAppId = null; window.editingReqId = null; window.latestP50Md = 0; window.originalProjectName = ''; window.pendingSaveData = null; window.isProjectDirty = false; window.pendingAction = null; window.currentTab = 'hist'; window.latestHistData = null; window.latestTorData = null; window.theChart = null; window.dashChartObj = null; window.currentProjectId = null;

window.getTriangularRandom = (min, mode, max) => { let u=Math.random(); let F=(mode-min)/(max-min); return u<=F ? min+Math.sqrt(u*(max-min)*(mode-min)) : max-Math.sqrt((1-u)*(max-min)*(max-mode)); };
window.getNormalRandom = (mean, stdDev) => { let u1=Math.random(); if(u1===0) u1=0.0001; return (Math.sqrt(-2.0*Math.log(u1))*Math.cos(2.0*Math.PI*Math.random()))*stdDev + mean; };
window.getLocalDateStr = (d) => (!d||isNaN(d.getTime()))?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0');
window.getDateTimeStr = (d) => (!d||isNaN(d.getTime()))?"":d.getFullYear().toString().slice(2)+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0')+" "+String(d.getHours()).padStart(2,'0')+":"+String(d.getMinutes()).padStart(2,'0');
window.getWeekString = function(d) { const date = new Date(d.getTime()); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7)); const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7); return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`; };
window.getDatesFromWeek = function(weekStr) { const [year, week] = weekStr.split('-W'); const d = new Date(year, 0, 1); const dayOffset = (d.getDay() <= 4 && d.getDay() !== 0) ? 1 : 8; const firstMonday = new Date(year, 0, d.getDate() - d.getDay() + dayOffset); const start = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000); const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); return { start, end }; };

const koreaHolidays = new Set(['2024-01-01','2024-03-01','2024-05-06','2024-12-25','2025-01-01','2025-05-05','2025-10-06','2025-12-25']); 
window.isWorkDay = (d) => { const el=document.getElementById('apply-holidays'); if(!el||!el.checked) return true; if(d.getDay()===0||d.getDay()===6) return false; return !koreaHolidays.has(window.getLocalDateStr(d)); };
window.calculateWorkDate = (s, d) => { let dt = new Date(s); if(isNaN(dt.getTime())) return new Date(); let a = 0; while(a<d) { dt.setDate(dt.getDate()+1); if(window.isWorkDay(dt)) a++; } return dt; };

window.showToast = (msg, type="success") => { 
    const c=document.getElementById('toast-container'); if(!c)return; 
    const t=document.createElement('div'); t.className="toast text-white px-6 py-3 rounded-xl shadow-lg text-sm font-bold z-[9999] flex items-center gap-2 " + (type==="success"?"bg-emerald-600":"bg-rose-600"); t.innerHTML=(type==="success"?'<i class="fa-solid fa-circle-check"></i> ':'<i class="fa-solid fa-triangle-exclamation"></i> ')+msg; c.appendChild(t); 
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); },3000); 
};

window.getChosung = (str) => { const cho=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]; let res=""; for(let i=0; i<str.length; i++) { let c=str.charCodeAt(i)-44032; if(c>-1&&c<11172) res+=cho[Math.floor(c/588)]; else res+=str.charAt(i); } return res; };
window.matchString = (q, t) => { if(!q) return true; if(!t) return false; q=q.toLowerCase(); t=t.toLowerCase(); if(t.includes(q)) return true; if(window.getChosung(t).includes(q)) return true; return false; };

window.toggleDarkMode = () => { const h=document.documentElement, i=document.getElementById('dark-mode-icon'); if(h.classList.contains('dark')) { h.classList.remove('dark'); localStorage.setItem('color-theme', 'light'); if(i) i.className='fa-solid fa-moon'; } else { h.classList.add('dark'); localStorage.setItem('color-theme', 'dark'); if(i) i.className='fa-solid fa-sun text-amber-400'; } };

// 🚨 햄버거 메뉴 버그 수정 완료: 명시적 boolean 값에 철저히 따르도록 변경
window.toggleSidebar = (forceShow) => { 
    const s = document.getElementById('sidebar'); const b = document.getElementById('sidebar-backdrop'); if(!s || !b) return; 
    const isClosed = s.classList.contains('-translate-x-full');
    const show = typeof forceShow === 'boolean' ? forceShow : isClosed; // true면 열고, false면 닫고, 값 없으면 반전
    
    if(show) { s.classList.remove('-translate-x-full'); b.classList.remove('hidden'); } 
    else { s.classList.add('-translate-x-full'); b.classList.add('hidden'); } 
};

window.toggleAuthMode = (mode) => { 
    if (mode==='signup') { document.getElementById('signup-fields')?.classList.remove('hidden'); document.getElementById('action-buttons-login')?.classList.add('hidden'); document.getElementById('action-buttons-signup')?.classList.remove('hidden'); document.getElementById('login-view')?.classList.add('hidden'); document.getElementById('signup-view')?.classList.remove('hidden'); if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText='AXBIS 계정 생성'; document.getElementById('login-error')?.classList.add('hidden'); } 
    else { document.getElementById('signup-fields')?.classList.add('hidden'); document.getElementById('action-buttons-login')?.classList.remove('hidden'); document.getElementById('action-buttons-signup')?.classList.add('hidden'); document.getElementById('login-view')?.classList.remove('hidden'); document.getElementById('signup-view')?.classList.add('hidden'); if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText='AXBIS Cloud 접속'; document.getElementById('signup-error')?.classList.add('hidden'); } 
};

window.formatMentions = (text) => {
    if(!text) return '';
    let formatted = text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded shadow-sm border border-blue-200">@$1</span>');
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="text-sky-500 hover:text-sky-700 underline break-all font-bold" onclick="event.stopPropagation()">$1</a>');
    return formatted;
};

// ==========================================
// 🔔 알림 및 멘션 시스템 로직
// ==========================================
window.toggleNotifications = function(event) { if(event) event.stopPropagation(); const dropdown = document.getElementById('notification-dropdown'); if(dropdown) dropdown.classList.toggle('hidden'); };

let notiUnsubscribe = null;
window.loadNotifications = function() {
    if (!window.currentUser) return;
    if (notiUnsubscribe) notiUnsubscribe();
    const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid));
    notiUnsubscribe = onSnapshot(q, (snapshot) => {
        let notis = []; let unreadCount = 0;
        snapshot.forEach(doc => { const data = doc.data(); notis.push({ id: doc.id, ...data }); if (!data.isRead) unreadCount++; });
        notis.sort((a, b) => b.createdAt - a.createdAt);
        const badgeWrap = document.getElementById('notification-badge'); const countEl = document.getElementById('notification-count');
        if (badgeWrap && countEl) { if (unreadCount > 0) { badgeWrap.classList.remove('hidden'); countEl.innerText = unreadCount; } else { badgeWrap.classList.add('hidden'); } }
        const listEl = document.getElementById('notification-list');
        if (listEl) {
            if (notis.length === 0) listEl.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-bold">알림이 없습니다.</div>';
            else listEl.innerHTML = notis.map(n => `
                <div class="p-3 hover:bg-slate-50 cursor-pointer transition-colors ${n.isRead ? 'opacity-50' : 'bg-indigo-50/40'}" onclick="window.readNotification('${n.id}')">
                    <div class="text-[11px] font-bold text-indigo-600 mb-1">${n.type || '알림'}</div>
                    <div class="text-xs text-slate-700 font-bold leading-relaxed break-words">${n.message}</div>
                </div>`).join('');
        }
    });
};

window.readNotification = async function(id) { try { await setDoc(doc(db, "notifications", id), { isRead: true }, { merge: true }); } catch(e) {} };
window.markAllNotificationsRead = async function() { if(!window.currentUser) return; try { const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid), where("isRead", "==", false)); const snapshot = await getDocs(q); const batch = writeBatch(db); snapshot.forEach(d => { batch.update(d.ref, { isRead: true }); }); await batch.commit(); } catch(e) {} };
window.deleteAllNotifications = async function() { if(!window.currentUser || !confirm("모든 알림을 삭제하시겠습니까?")) return; try { const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid)); const snapshot = await getDocs(q); const batch = writeBatch(db); snapshot.forEach(d => { batch.delete(d.ref); }); await batch.commit(); window.showToast("알림이 모두 삭제되었습니다."); } catch(e) {} };

window.handleMention = function(textarea) {
    const val = textarea.value; const cursorInfo = textarea.selectionStart;
    const textBeforeCursor = val.substring(0, cursorInfo); const mentionMatch = textBeforeCursor.match(/@([가-힣a-zA-Z0-9_]*)$/);
    const dropdown = document.getElementById('mention-dropdown'); if(!dropdown) return;
    if (mentionMatch) {
        const keyword = mentionMatch[1].toLowerCase();
        const users = window.allSystemUsers || []; const filtered = users.filter(u => u.name.toLowerCase().includes(keyword));
        if (filtered.length > 0) {
            const rect = textarea.getBoundingClientRect(); dropdown.style.left = `${rect.left + window.scrollX}px`; dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
            dropdown.classList.remove('hidden'); dropdown.innerHTML = filtered.map(u => `<li class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs font-bold flex justify-between items-center" onmousedown="window.insertMention('${textarea.id}', '${u.name}', ${mentionMatch.index}, ${cursorInfo})"><span>${u.name}</span> <span class="text-[9px] bg-slate-100 px-1.5 rounded">${u.team||'소속없음'}</span></li>`).join('');
        } else dropdown.classList.add('hidden');
    } else dropdown.classList.add('hidden');
};

window.insertMention = function(id, name, start, end) {
    const el = document.getElementById(id); if(!el) return;
    el.value = el.value.substring(0, start) + `@${name} ` + el.value.substring(end);
    el.focus(); document.getElementById('mention-dropdown')?.classList.add('hidden');
};

window.processMentions = async function(content, projectId, type) {
    const mentions = content.match(/@([가-힣a-zA-Z0-9_]+)/g); if(!mentions) return;
    const names = [...new Set(mentions.map(m => m.replace('@', '')))];
    for (const name of names) {
        const user = (window.allSystemUsers || []).find(u => u.name === name);
        if (user && user.uid !== window.currentUser.uid) {
            await addDoc(collection(db, "notifications"), { targetUid: user.uid, type: type || '멘션', message: `📢 ${window.userProfile.name}님이 회원님을 언급했습니다.`, projectId: projectId || null, isRead: false, createdAt: Date.now() });
        }
    }
};

document.addEventListener('click', (e) => {
    const n = document.getElementById('notification-dropdown'); if(n && !n.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) n.classList.add('hidden');
    const m = document.getElementById('mention-dropdown'); if(m && !m.classList.contains('hidden') && !e.target.closest('#mention-dropdown')) m.classList.add('hidden');
});
