window.currentUser = null; window.userProfile = null; window.allSystemUsers = []; window.teamMembers = []; window.allDashProjects = []; window.allDashMdLogs = []; window.currentProjectStatusList = []; window.pjtCodeMasterList = []; window.currentRequestList = []; window.currentWeeklyLogList = []; window.currentProcessData = []; window.projectLogs = []; window.masterPresets = {}; window.projectCommentCounts = {}; window.projectIssueCounts = {}; window.projectLogCounts = {}; window.currentSelectedMembers = [];
window.currentProjDashView = 'list'; window.currentProjPartTab = '제조'; window.currentCategoryFilter = 'all'; window.currentReqView = 'list'; window.currentAppId = null; window.editingReqId = null; window.latestP50Md = 0; window.originalProjectName = ''; window.pendingSaveData = null; window.isProjectDirty = false; window.pendingAction = null; window.currentTab = 'hist'; window.latestHistData = null; window.latestTorData = null; window.theChart = null; window.dashChartObj = null; window.currentProjectId = null;

// 공통 날짜 및 유틸 함수
window.getTriangularRandom = (min, mode, max) => { let u=Math.random(); let F=(mode-min)/(max-min); return u<=F ? min+Math.sqrt(u*(max-min)*(mode-min)) : max-Math.sqrt((1-u)*(max-min)*(max-mode)); };
window.getNormalRandom = (mean, stdDev) => { let u1=Math.random(); if(u1===0) u1=0.0001; return (Math.sqrt(-2.0*Math.log(u1))*Math.cos(2.0*Math.PI*Math.random()))*stdDev + mean; };
window.getLocalDateStr = (d) => (!d||isNaN(d.getTime()))?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0');
window.getDateTimeStr = (d) => (!d||isNaN(d.getTime()))?"":d.getFullYear().toString().slice(2)+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0')+" "+String(d.getHours()).padStart(2,'0')+":"+String(d.getMinutes()).padStart(2,'0');

window.getWeekString = function(d) { const date = new Date(d.getTime()); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7)); const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7); return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`; };
window.getDatesFromWeek = function(weekStr) { const [year, week] = weekStr.split('-W'); const d = new Date(year, 0, 1); const dayOffset = (d.getDay() <= 4 && d.getDay() !== 0) ? 1 : 8; const firstMonday = new Date(year, 0, d.getDate() - d.getDay() + dayOffset); const start = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000); const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); return { start, end }; };
window.getWeekNumberInMonth = function(dateObj) { const firstDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay(); return Math.ceil((dateObj.getDate() + (firstDay === 0 ? 6 : firstDay - 1)) / 7); };

const koreaHolidays = new Set(['2024-01-01','2024-03-01','2024-05-06','2024-12-25','2025-01-01','2025-05-05','2025-10-06','2025-12-25']); 
window.isWorkDay = (d) => { const el=document.getElementById('apply-holidays'); if(!el||!el.checked) return true; if(d.getDay()===0||d.getDay()===6) return false; return !koreaHolidays.has(window.getLocalDateStr(d)); };
window.calculateWorkDate = (s, d) => { let dt = new Date(s); if(isNaN(dt.getTime())) return new Date(); let a = 0; while(a<d) { dt.setDate(dt.getDate()+1); if(window.isWorkDay(dt)) a++; } return dt; };
window.getWorkingDays = (sStr, eStr) => { let s=new Date(sStr), e=new Date(eStr); if(isNaN(s)||isNaN(e)||s>e) return 0; let c=0, cur=new Date(s); while(cur<=e) { if(window.isWorkDay(cur)) c++; cur.setDate(cur.getDate()+1); } return c; };

window.showToast = (msg, type="success") => { 
    const c=document.getElementById('toast-container'); if(!c)return; 
    const t=document.createElement('div'); 
    t.className="toast text-white px-6 py-3 rounded-xl shadow-lg text-sm font-bold z-[9999] flex items-center gap-2 " + (type==="success"?"bg-emerald-600":"bg-rose-600"); 
    t.innerHTML=(type==="success"?'<i class="fa-solid fa-circle-check"></i> ':'<i class="fa-solid fa-triangle-exclamation"></i> ')+msg; 
    c.appendChild(t); 
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); },3000); 
};

window.addSystemLog = function(msg, type='system') { console.log(`[${type}] ${msg}`); };

window.getChosung = (str) => { const cho=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]; let res=""; for(let i=0; i<str.length; i++) { let c=str.charCodeAt(i)-44032; if(c>-1&&c<11172) res+=cho[Math.floor(c/588)]; else res+=str.charAt(i); } return res; };
window.matchString = (q, t) => { if(!q) return true; if(!t) return false; q=q.toLowerCase(); t=t.toLowerCase(); if(t.includes(q)) return true; if(window.getChosung(t).includes(q)) return true; return false; };

window.toggleDarkMode = () => { const h=document.documentElement, i=document.getElementById('dark-mode-icon'); if(h.classList.contains('dark')) { h.classList.remove('dark'); localStorage.setItem('color-theme', 'light'); if(i) i.className='fa-solid fa-moon'; } else { h.classList.add('dark'); localStorage.setItem('color-theme', 'dark'); if(i) i.className='fa-solid fa-sun text-amber-400'; } };
window.toggleSidebar = (fShow) => { const s=document.getElementById('sidebar'), b=document.getElementById('sidebar-backdrop'); if(!s||!b) return; if(fShow===true||s.classList.contains('-translate-x-full')) { s.classList.remove('-translate-x-full'); b.classList.remove('hidden'); } else { s.classList.add('-translate-x-full'); b.classList.add('hidden'); } };
window.toggleAuthMode = (mode) => { 
    if (mode==='signup') { 
        document.getElementById('signup-fields')?.classList.remove('hidden'); document.getElementById('action-buttons-login')?.classList.add('hidden'); document.getElementById('action-buttons-signup')?.classList.remove('hidden'); document.getElementById('login-view')?.classList.add('hidden'); document.getElementById('signup-view')?.classList.remove('hidden'); if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText='AXBIS 계정 생성'; document.getElementById('login-error')?.classList.add('hidden'); 
    } else { 
        document.getElementById('signup-fields')?.classList.add('hidden'); document.getElementById('action-buttons-login')?.classList.remove('hidden'); document.getElementById('action-buttons-signup')?.classList.add('hidden'); document.getElementById('login-view')?.classList.remove('hidden'); document.getElementById('signup-view')?.classList.add('hidden'); if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText='AXBIS Cloud 접속'; document.getElementById('signup-error')?.classList.add('hidden'); 
    } 
};

// 🌟 멘션 텍스트 & URL 자동 하이퍼링크 변환 마법사 🌟
window.formatMentions = (text) => {
    if(!text) return '';
    
    // 1. 멘션 파란색 뱃지 처리 (@이름)
    let formatted = text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded shadow-sm border border-blue-200">@$1</span>');
    
    // 2. URL 자동 링크 변환 (http 또는 https로 시작하는 주소를 <a> 태그로 감싸기)
    formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="text-sky-500 hover:text-sky-700 underline break-all font-bold" onclick="event.stopPropagation()">$1</a>');
    
    return formatted;
};
// ============================================================================
// 🔔 알림(Notification) 및 멘션(Mention) 시스템 복구 코드
// ============================================================================
import { db } from './firebase.js';
import { collection, addDoc, query, where, onSnapshot, doc, setDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 1. 알림창 열기/닫기 토글 기능
window.toggleNotifications = function(event) {
    if(event) event.stopPropagation();
    const dropdown = document.getElementById('notification-dropdown');
    if(dropdown) dropdown.classList.toggle('hidden');
};

// 화면 빈 곳 클릭 시 알림창 닫히도록 처리
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    if(dropdown && !dropdown.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) {
        dropdown.classList.add('hidden');
    }
});

// 2. 알림 데이터 로드 (Firebase 실시간 연동)
let notiUnsubscribe = null;
window.loadNotifications = function() {
    if (!window.currentUser) return;
    if (notiUnsubscribe) notiUnsubscribe();
    
    const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid));
    notiUnsubscribe = onSnapshot(q, (snapshot) => {
        let notis = [];
        let unreadCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            notis.push({ id: doc.id, ...data });
            if (!data.isRead) unreadCount++;
        });
        
        notis.sort((a, b) => b.createdAt - a.createdAt);
        
        // 알림 뱃지 숫자 업데이트
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
        
        // 알림 리스트 HTML 렌더링
        const listEl = document.getElementById('notification-list');
        if (listEl) {
            if (notis.length === 0) {
                listEl.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-bold">새로운 알림이 없습니다.</div>';
            } else {
                listEl.innerHTML = notis.map(n => `
                    <div class="p-3 hover:bg-slate-50 cursor-pointer transition-colors ${n.isRead ? 'opacity-50' : 'bg-indigo-50/40'}" onclick="window.readNotification('${n.id}')">
                        <div class="text-[11px] font-bold text-indigo-600 mb-1">${n.type || '알림'}</div>
                        <div class="text-xs text-slate-700 font-bold leading-relaxed break-words">${n.message}</div>
                        <div class="text-[10px] text-slate-400 mt-1.5">${window.getDateTimeStr ? window.getDateTimeStr(new Date(n.createdAt)) : new Date(n.createdAt).toLocaleString()}</div>
                    </div>
                `).join('');
            }
        }
    });
};

// 단일 알림 클릭 시 읽음 처리
window.readNotification = async function(id) {
    try { await setDoc(doc(db, "notifications", id), { isRead: true }, { merge: true }); } catch(e) {}
};

// 모두 읽음 처리 버튼
window.markAllNotificationsRead = async function() {
    if(!window.currentUser) return;
    try {
        const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid), where("isRead", "==", false));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach(d => { batch.update(d.ref, { isRead: true }); });
        await batch.commit();
    } catch(e) {}
};

// 알림 전체 삭제 버튼
window.deleteAllNotifications = async function() {
    if(!window.currentUser || !confirm("모든 알림을 삭제하시겠습니까?")) return;
    try {
        const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach(d => { batch.delete(d.ref); });
        await batch.commit();
        window.showToast("알림이 모두 삭제되었습니다.");
    } catch(e) {}
};

// 3. 멘션 기능 처리 (@ 입력 시 유저 검색 드롭다운)
window.handleMention = function(textarea) {
    const val = textarea.value;
    const cursorInfo = textarea.selectionStart;
    const textBeforeCursor = val.substring(0, cursorInfo);
    // '@' 뒤에 한글/영문/숫자가 오는 패턴을 감지
    const mentionMatch = textBeforeCursor.match(/@([가-힣a-zA-Z0-9_]*)$/);
    
    let dropdown = document.getElementById('mention-dropdown');
    
    // 드롭다운 UI가 HTML에 없으면 동적으로 바디에 추가
    if(!dropdown) {
        dropdown = document.createElement('ul');
        dropdown.id = 'mention-dropdown';
        dropdown.className = 'hidden absolute z-[9999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm w-48 custom-scrollbar py-1';
        document.body.appendChild(dropdown);
    }

    if (mentionMatch) {
        const searchKeyword = mentionMatch[1].toLowerCase();
        const users = window.allSystemUsers || [];
        // 입력한 키워드가 이름에 포함된 유저 필터링
        const filteredUsers = users.filter(u => u.name.toLowerCase().includes(searchKeyword));
        
        if (filteredUsers.length > 0) {
            // 현재 텍스트 에어리어의 화면 위치를 계산해서 그 밑에 팝업 띄우기
            const rect = textarea.getBoundingClientRect();
            dropdown.style.left = `${rect.left + window.scrollX}px`;
            dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
            dropdown.classList.remove('hidden');
            
            dropdown.innerHTML = filteredUsers.map(u => `
                <li class="px-4 py-2.5 hover:bg-indigo-50 cursor-pointer text-slate-700 font-bold text-xs border-b border-slate-50 last:border-0 flex items-center justify-between transition-colors" 
                    onmousedown="window.insertMention('${textarea.id}', '${u.name}', ${mentionMatch.index}, ${cursorInfo})">
                    <span>${u.name}</span> <span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-normal">${u.team||'소속없음'}</span>
                </li>
            `).join('');
        } else {
            dropdown.classList.add('hidden');
        }
    } else {
        dropdown.classList.add('hidden');
    }
};

// 멘션 목록에서 클릭 시 텍스트 에어리어에 이름 완성하여 삽입
window.insertMention = function(textareaId, name, startIndex, endIndex) {
    const textarea = document.getElementById(textareaId);
    if(!textarea) return;
    const val = textarea.value;
    const before = val.substring(0, startIndex);
    const after = val.substring(endIndex);
    // '@이름 ' 형태로 삽입
    textarea.value = `${before}@${name} ${after}`;
    textarea.focus();
    document.getElementById('mention-dropdown')?.classList.add('hidden');
};

// 4. 작성 완료 시 본문에서 멘션을 감지하여 DB에 알림 발송
window.processMentions = async function(content, projectId, typeDesc) {
    if(!content) return;
    // 본문에서 '@이름' 추출
    const mentions = content.match(/@([가-힣a-zA-Z0-9_]+)/g);
    if(!mentions) return;
    
    const users = window.allSystemUsers || [];
    // 중복 멘션 제거
    const targetNames = [...new Set(mentions.map(m => m.replace('@', '')))];
    
    for (const tName of targetNames) {
        const targetUser = users.find(u => u.name === tName);
        // 자기 자신을 멘션한 게 아니라면 알림 발송
        if (targetUser && targetUser.uid !== window.currentUser?.uid) {
            try {
                await addDoc(collection(db, "notifications"), {
                    targetUid: targetUser.uid,
                    senderName: window.userProfile?.name || '시스템',
                    type: typeDesc || '멘션',
                    message: `📢 ${window.userProfile?.name}님이 [${typeDesc || '문서'}]에서 회원님을 언급했습니다.`,
                    projectId: projectId || null,
                    isRead: false,
                    createdAt: Date.now()
                });
            } catch(e) { console.error("멘션 발송 에러:", e); }
        }
    }
};
// 화면 빈 공간(바탕) 클릭 시 열려있는 팝업(알림창, 멘션창) 닫기
document.addEventListener('click', (e) => {
    // 1. 알림창 닫기
    const notiDropdown = document.getElementById('notification-dropdown');
    if(notiDropdown && !notiDropdown.classList.contains('hidden') && !e.target.closest('.relative.cursor-pointer')) {
        notiDropdown.classList.add('hidden');
    }
    
    // 2. 멘션창 닫기
    const mentionDropdown = document.getElementById('mention-dropdown');
    // 멘션창 내부를 클릭한 게 아니라면 숨김 처리
    if(mentionDropdown && !mentionDropdown.classList.contains('hidden') && !e.target.closest('#mention-dropdown')) {
        mentionDropdown.classList.add('hidden');
    }
});
