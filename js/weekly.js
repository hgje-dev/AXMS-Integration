import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentWeeklyLogUnsubscribe = null;
let currentScheduleUnsubscribe = null;

// 상태 관리
window.currentWeeklyLogList = [];
window.currentScheduleList = [];
window.draftTasks = []; 
window.activeWeeklyTab = 'team'; 

// 탭 스위치
window.switchWeeklyTab = function(tabName) {
    window.activeWeeklyTab = tabName;
    const btnTeam = document.getElementById('tab-team-btn');
    const btnMy = document.getElementById('tab-my-btn');
    const viewTeam = document.getElementById('weekly-team-view');
    const viewMy = document.getElementById('weekly-my-view');

    if(tabName === 'team') {
        if(btnTeam) btnTeam.className = "px-6 py-2 text-sm font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-2";
        if(btnMy) btnMy.className = "px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-2";
        if(viewTeam) viewTeam.classList.remove('hidden');
        if(viewMy) viewMy.classList.add('hidden');
    } else {
        if(btnMy) btnMy.className = "px-6 py-2 text-sm font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-2";
        if(btnTeam) btnTeam.className = "px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-2";
        if(viewMy) viewMy.classList.remove('hidden');
        if(viewTeam) viewTeam.classList.add('hidden');
    }
};

window.changeWeeklyWeek = function(offset) {
    const weekInput = document.getElementById('weekly-log-filter-week');
    if(!weekInput || !weekInput.value) return;
    let [year, week] = weekInput.value.split('-W');
    let d = new Date(year, 0, (parseInt(week) + offset - 1) * 7 + 1);
    weekInput.value = window.getWeekString(d);
    window.loadWeeklyLogsData();
};

// ==========================================
// 데이터 로드 및 렌더링
// ==========================================
window.loadWeeklyLogsData = function() { 
    const weekInput = document.getElementById('weekly-log-filter-week');
    if(!weekInput) return;
    const w = weekInput.value; 
    if(!w) return; 
    
    // 1. 업무 일지 로드
    if(currentWeeklyLogUnsubscribe) currentWeeklyLogUnsubscribe(); 
    currentWeeklyLogUnsubscribe = onSnapshot(query(collection(db, "weekly_logs_v2"), where("week", "==", w)), s => { 
        window.currentWeeklyLogList = []; 
        let statSub = 0, statComp = 0, statProg = 0, statIssue = 0;

        s.forEach(d => {
            const data = { id: d.id, ...d.data() };
            window.currentWeeklyLogList.push(data);
            
            if(data.isSubmitted) {
                statSub++;
                if(data.issues && data.issues.trim() !== '') statIssue++;
                
                (data.tasks || []).forEach(t => {
                    if(t.status === '완료') statComp++;
                    if(t.status === '진행 중') statProg++;
                });
            }
        }); 

        // Dashboard Stats 업데이트
        if(document.getElementById('stat-submitted')) document.getElementById('stat-submitted').innerText = statSub;
        if(document.getElementById('stat-completed')) document.getElementById('stat-completed').innerText = statComp;
        if(document.getElementById('stat-progress')) document.getElementById('stat-progress').innerText = statProg;
        if(document.getElementById('stat-issue')) document.getElementById('stat-issue').innerText = statIssue;

        window.renderWeeklyLogs(); 
        window.checkMissingMembers();
    }); 

    // 2. 내 개인 일정 로드
    if(currentScheduleUnsubscribe) currentScheduleUnsubscribe();
    if(window.currentUser) {
        currentScheduleUnsubscribe = onSnapshot(query(collection(db, "weekly_schedules"), where("week", "==", w), where("authorUid", "==", window.currentUser.uid)), s => {
            window.currentScheduleList = [];
            s.forEach(d => window.currentScheduleList.push({ id: d.id, ...d.data() }));
            window.renderKanbanBoard();
        });
    }
};

window.checkMissingMembers = function() {
    if(!window.teamMembers || window.teamMembers.length === 0) return;
    
    const submittedUids = window.currentWeeklyLogList.filter(l => l.isSubmitted).map(l => l.authorUid);
    
    let missing = [];
    window.teamMembers.forEach(tm => {
        if(!submittedUids.includes(tm.id) && tm.name !== '시스템관리자') {
            missing.push(tm);
        }
    });

    const card = document.getElementById('missing-members-card');
    if(!card) return;

    const listEl = document.getElementById('missing-members-list');
    
    if(missing.length > 0) {
        card.classList.remove('hidden');
        if(document.getElementById('missing-count')) document.getElementById('missing-count').innerText = missing.length;
        if(listEl) {
            listEl.innerHTML = missing.map(m => `<span class="bg-white border border-orange-200 text-orange-700 px-2 py-1 rounded-full text-[10px] font-bold shadow-sm">${m.name} <span class="text-orange-400 font-normal ml-1">${m.part||''}</span></span>`).join('');
        }
    } else {
        card.classList.add('hidden');
    }
};

window.urgeMissingMembers = function() {
    window.showToast("작성 독려 알림이 발송되었습니다.", "success");
};

window.filterWeeklyLogs = function() {
    window.renderWeeklyLogs();
};

window.renderWeeklyLogs = function() { 
    const feed = document.getElementById('weekly-log-feed'); 
    if(!feed) return; 

    const searchName = document.getElementById('weekly-search-name')?.value.toLowerCase() || '';
    const searchContent = document.getElementById('weekly-search-content')?.value.toLowerCase() || '';

    // 제출된 항목만 표시
    let displayList = window.currentWeeklyLogList.filter(l => l.isSubmitted);

    if(searchName) {
        displayList = displayList.filter(l => (l.authorName || '').toLowerCase().includes(searchName));
    }
    if(searchContent) {
        displayList = displayList.filter(l => {
            let fullText = (l.issues || '') + ' ' + (l.projectName || '');
            (l.tasks || []).forEach(t => fullText += ' ' + (t.content || ''));
            return fullText.toLowerCase().includes(searchContent);
        });
    }

    displayList.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));

    if(displayList.length === 0) {
        feed.innerHTML = '<div class="text-center p-10 bg-white rounded-2xl border border-slate-200 text-slate-400 font-bold shadow-sm">제출된 일지가 없거나 검색 결과가 없습니다.</div>';
        return;
    }

    const orderMap = { "월요일":1, "화요일":2, "수요일":3, "목요일":4, "금요일":5, "토요일":6, "일요일":7, "주간 공통":99 };

    feed.innerHTML = displayList.map(log => {
        let tasksByDay = {};
        (log.tasks || []).forEach(t => {
            let safeDay = t.day || '기타';
            if(!tasksByDay[safeDay]) tasksByDay[safeDay] = [];
            tasksByDay[safeDay].push(t);
        });

        let sortedDays = Object.keys(tasksByDay).sort((a, b) => (orderMap[a]||0) - (orderMap[b]||0));

        let tasksHtml = sortedDays.map(day => {
            let dayHtml = `<div class="bg-slate-50 px-4 py-1.5 rounded-lg text-xs font-bold text-slate-500 mb-2 mt-4 flex items-center gap-1.5"><i class="fa-regular fa-clock"></i> ${day}</div><ul class="space-y-2 ml-2 border-l-2 border-slate-100 pl-4">`;
            
            tasksByDay[day].forEach(t => {
                let statusBadge = t.status === '완료' ? `<span class="text-[10px] font-bold border border-emerald-200 text-emerald-600 px-1.5 py-0.5 rounded shadow-sm bg-white">완료</span>` 
                                : (t.status === '진행 중' ? `<span class="text-[10px] font-bold border border-blue-200 text-blue-600 px-1.5 py-0.5 rounded shadow-sm bg-white">진행 중</span>` 
                                : `<span class="text-[10px] font-bold border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded shadow-sm bg-white">보류</span>`);
                
                let locBadge = `<span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1"><i class="fa-solid fa-building text-[9px]"></i> ${t.loc||'사내'}</span>`;
                let safeContent = window.formatMentions ? window.formatMentions(String(t.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : t.content;
                
                dayHtml += `<li class="flex justify-between items-start gap-4 hover:bg-slate-50 p-1.5 rounded-lg transition-colors group">
                    <div class="flex items-start gap-2 text-sm text-slate-700 font-medium">
                        <span class="text-slate-300 mt-1 text-[8px]"><i class="fa-solid fa-circle"></i></span>
                        <div>${safeContent} ${locBadge}</div>
                    </div>
                    <div class="shrink-0 pt-0.5">${statusBadge}</div>
                </li>`;
            });
            dayHtml += `</ul>`;
            return dayHtml;
        }).join('');

        let issuesHtml = '';
        if(log.issues && log.issues.trim() !== '') {
            let safeIssue = window.formatMentions ? window.formatMentions(String(log.issues || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : log.issues;
            issuesHtml = `<div class="mt-5 bg-[#fffbf0] border border-orange-100 rounded-xl p-4 shadow-sm">
                <div class="text-[11px] font-bold text-orange-600 mb-2 flex items-center gap-1.5"><i class="fa-regular fa-comment-dots"></i> 요청사항 및 이슈</div>
                <div class="text-sm font-medium text-slate-700 leading-relaxed">${safeIssue}</div>
            </div>`;
        }

        let bottomMetaHtml = `<div class="mt-4 pt-3 border-t border-slate-100 flex gap-2 flex-wrap text-[11px] font-bold text-slate-500 items-center">`;
        if(log.projectName) bottomMetaHtml += `<span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-lg shadow-sm"><i class="fa-solid fa-folder-open"></i> ${log.projectName}</span>`;
        if(log.totalHours || log.totalMins) bottomMetaHtml += `<span class="ml-auto flex items-center gap-1.5"><i class="fa-regular fa-clock"></i> 투입: ${log.totalHours||0}시간 ${log.totalMins||0}분</span>`;
        bottomMetaHtml += `</div>`;

        let actionHtml = '';
        if(window.currentUser && (log.authorUid === window.currentUser.uid || window.userProfile?.role === 'admin')) {
            actionHtml = `<div class="flex gap-2">
                <button onclick="window.editWeeklyLog('${log.id}')" class="text-emerald-500 hover:text-emerald-700 transition-colors bg-emerald-50 w-8 h-8 rounded-full flex items-center justify-center"><i class="fa-solid fa-pen"></i></button>
                <button onclick="window.deleteWeeklyLog('${log.id}')" class="text-slate-400 hover:text-rose-500 transition-colors w-8 h-8 rounded-full flex items-center justify-center"><i class="fa-solid fa-trash-can"></i></button>
            </div>`;
        }

        let dateStr = log.updatedAt ? window.getLocalDateStr(new Date(log.updatedAt)) : '';
        let authorName = log.authorName || '알수없음';
        let initial = window.getChosung ? window.getChosung(authorName).charAt(0) : authorName.charAt(0);

        return `<div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div class="flex justify-between items-start mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-lg">${initial}</div>
                    <div>
                        <div class="font-black text-slate-800 text-base">${authorName} <span class="text-[10px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded ml-1 bg-slate-50">${log.authorTeam||'소속없음'}</span></div>
                        <div class="text-[11px] text-slate-400 font-bold mt-0.5">${dateStr} (${window.getWeekString(new Date(log.updatedAt || Date.now()))})</div>
                    </div>
                </div>
                ${actionHtml}
            </div>
            ${tasksHtml}
            ${issuesHtml}
            ${bottomMetaHtml}
        </div>`;
    }).join('');
};

// ==========================================
// 일지 작성 모달 관리
// ==========================================
window.openWeeklyLogWriteModal = function(editId = null) { 
    const weekInput = document.getElementById('weekly-log-filter-week');
    if (!weekInput) {
        return window.showToast("오류: HTML 파일이 최신버전이 아닙니다. weekly.html을 교체해주세요.", "error");
    }
    const w = weekInput.value;
    let existingLog = null;
    
    // 이벤트 객체가 넘어올 수 있으므로 typeof 검사
    if (editId && typeof editId === 'string') {
        existingLog = window.currentWeeklyLogList.find(l => l.id === editId);
    } else {
        existingLog = window.currentWeeklyLogList.find(l => l.authorUid === window.currentUser?.uid && l.week === w);
    }

    const draftIdEl = document.getElementById('weekly-draft-id');
    if(!draftIdEl) {
        return window.showToast("오류: HTML 파일이 최신버전이 아닙니다. weekly.html을 교체해주세요.", "error");
    }

    draftIdEl.value = existingLog ? existingLog.id : '';
    window.draftTasks = existingLog && existingLog.tasks ? existingLog.tasks.map((t, i) => ({...t, id: t.id || Date.now() + i})) : [];
    
    document.getElementById('wl-issues').value = existingLog ? (existingLog.issues || '') : '';
    document.getElementById('wl-pjt-name').value = existingLog ? (existingLog.projectName || '') : '';
    document.getElementById('wl-pjt-code').value = existingLog ? (existingLog.projectCode || '') : '';
    document.getElementById('wl-time-h').value = existingLog ? (existingLog.totalHours || '') : '';
    document.getElementById('wl-time-m').value = existingLog ? (existingLog.totalMins || '') : '';

    const badge = document.getElementById('write-status-badge');
    if(existingLog && existingLog.isSubmitted) {
        badge.className = "bg-emerald-100 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 shadow-sm";
        badge.innerText = "제출 완료됨";
    } else {
        badge.className = "bg-indigo-100 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 shadow-sm";
        badge.innerText = "작성 중 (임시저장됨)";
    }

    document.getElementById('wl-new-content').value = '';
    window.renderDraftTasks();

    const modal = document.getElementById('weekly-log-write-modal');
    modal.classList.remove('hidden'); 
    modal.classList.add('flex'); 
};

window.closeWeeklyLogWriteModal = function() { 
    const modal = document.getElementById('weekly-log-write-modal');
    if(modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
};

window.editWeeklyLog = function(id) {
    const log = window.currentWeeklyLogList.find(l => l.id === id);
    if(!log) return;
    window.openWeeklyLogWriteModal(id);
};

window.addWeeklyTaskRow = function() {
    const contentEl = document.getElementById('wl-new-content');
    if(!contentEl) return;

    const day = document.getElementById('wl-new-day').value;
    const status = document.getElementById('wl-new-status').value;
    const loc = document.getElementById('wl-new-loc').value;
    const content = contentEl.value.trim();

    if(!content) {
        return window.showToast("업무 내용을 입력하세요.", "warning");
    }

    window.draftTasks.push({ day, status, loc, content, id: Date.now() });
    contentEl.value = '';
    window.renderDraftTasks();
};

window.removeWeeklyTaskRow = function(taskId) {
    window.draftTasks = window.draftTasks.filter(t => String(t.id) !== String(taskId));
    window.renderDraftTasks();
};

window.renderDraftTasks = function() {
    const listEl = document.getElementById('wl-task-list');
    if(!listEl) return;

    if(window.draftTasks.length === 0) {
        listEl.innerHTML = '<div class="text-center p-4 text-[11px] font-bold text-slate-400 bg-slate-100 rounded-xl border border-slate-200 border-dashed">추가된 업무가 없습니다.</div>';
        return;
    }

    const orderMap = { "월요일":1, "화요일":2, "수요일":3, "목요일":4, "금요일":5, "토요일":6, "일요일":7, "주간 공통":99 };
    let sorted = [...window.draftTasks].sort((a,b) => (orderMap[a.day]||0) - (orderMap[b.day]||0));

    listEl.innerHTML = sorted.map(t => {
        let statusClass = t.status === '완료' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (t.status === '진행 중' ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-500 bg-slate-50 border-slate-200');
        let safeContent = window.formatMentions ? window.formatMentions(String(t.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : t.content;

        return `<div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm group">
            <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded w-16 text-center shrink-0">${t.day}</span>
            <span class="text-[10px] font-bold border px-1.5 py-0.5 rounded shrink-0 w-12 text-center ${statusClass}">${t.status}</span>
            <div class="text-sm font-medium text-slate-700 flex-1 truncate" title="${t.content}">${safeContent} <span class="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded ml-1">${t.loc}</span></div>
            <button onclick="window.removeWeeklyTaskRow('${t.id}')" class="text-slate-300 hover:text-rose-500 w-6 h-6 rounded flex items-center justify-center transition-colors"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    }).join('');
};

window.saveWeeklyLog = async function(isFinalSubmit) { 
    const draftIdEl = document.getElementById('weekly-draft-id');
    const weekEl = document.getElementById('weekly-log-filter-week');
    
    if(!draftIdEl || !weekEl) {
        return window.showToast("오류: HTML 파일이 최신버전이 아닙니다. weekly.html을 교체해주세요.", "error");
    }

    const id = draftIdEl.value; 
    const week = weekEl.value; 
    
    if(window.draftTasks.length === 0 && isFinalSubmit) {
        return window.showToast("제출할 업무 내역을 1개 이상 추가해주세요.", "error");
    }

    let authorUid = window.currentUser?.uid || 'unknown';
    let authorName = window.userProfile?.name || 'unknown';
    let authorTeam = window.userProfile?.team || window.userProfile?.department || '';

    if (id) {
        const existingLog = window.currentWeeklyLogList.find(l => l.id === id);
        if (existingLog) {
            authorUid = existingLog.authorUid || authorUid;
            authorName = existingLog.authorName || authorName;
            authorTeam = existingLog.authorTeam || authorTeam;
        }
    }

    const payload = {
        week: week,
        authorUid: authorUid,
        authorName: authorName,
        authorTeam: authorTeam,
        tasks: window.draftTasks,
        issues: document.getElementById('wl-issues')?.value.trim() || '',
        projectCode: document.getElementById('wl-pjt-code')?.value || '',
        projectName: document.getElementById('wl-pjt-name')?.value.trim() || '',
        totalHours: parseInt(document.getElementById('wl-time-h')?.value) || 0,
        totalMins: parseInt(document.getElementById('wl-time-m')?.value) || 0,
        isSubmitted: isFinalSubmit,
        updatedAt: Date.now()
    };

    try { 
        if(id) {
            await setDoc(doc(db, "weekly_logs_v2", id), payload, { merge: true }); 
        } else {
            payload.createdAt = Date.now();
            await addDoc(collection(db, "weekly_logs_v2"), payload); 
        }
        
        if (isFinalSubmit && payload.issues && window.processMentions) {
            await window.processMentions(payload.issues, null, "주간업무일지(이슈)");
        }

        window.showToast(isFinalSubmit ? "최종 제출되었습니다." : "임시 저장되었습니다."); 
        window.closeWeeklyLogWriteModal(); 
    } catch(e) {
        console.error(e);
        window.showToast("저장 실패", "error");
    } 
};

window.deleteWeeklyLog = async function(id) { 
    if(confirm("이 주간 업무 일지를 정말 삭제하시겠습니까?")){ 
        try {
            await deleteDoc(doc(db, "weekly_logs_v2", id)); 
            window.showToast("삭제되었습니다."); 
        } catch(e) {
            window.showToast("삭제 실패", "error");
        }
    } 
};

// ==========================================
// 개인 일정 (Kanban) 모달 및 렌더링 관리
// ==========================================
window.renderKanbanBoard = function() {
    const board = document.getElementById('weekly-kanban-board');
    if(!board) return;

    const days = ['월요일', '화요일', '수요일', '목요일', '금요일'];
    const catMap = {
        "휴가/반차": { icon: "fa-mug-hot", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-600" },
        "회의/미팅": { icon: "fa-users", bg: "bg-purple-50 border-purple-200", text: "text-purple-700", badge: "bg-purple-100 text-purple-600" },
        "집중업무": { icon: "fa-headphones", bg: "bg-blue-50 border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-600" },
        "외근/출장": { icon: "fa-car", bg: "bg-orange-50 border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-600" },
        "기타": { icon: "fa-thumbtack", bg: "bg-slate-50 border-slate-200", text: "text-slate-700", badge: "bg-slate-200 text-slate-600" }
    };

    board.innerHTML = days.map(day => {
        let events = window.currentScheduleList.filter(s => s.day === day);
        let eventsHtml = events.map(s => {
            let style = catMap[s.category] || catMap["기타"];
            return `<div class="rounded-xl border p-3 ${style.bg} relative group cursor-pointer hover:shadow-md transition-all" onclick="window.editSchedule('${s.id}')">
                <button onclick="event.stopPropagation(); window.deleteSchedule('${s.id}')" class="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-xmark"></i></button>
                <div class="flex items-center gap-1.5 text-[10px] font-black ${style.badge} w-fit px-2 py-0.5 rounded mb-2"><i class="fa-solid ${style.icon}"></i> ${s.category}</div>
                <div class="text-sm font-bold ${style.text} mb-1">${s.content}</div>
                <div class="text-[10px] text-slate-500 font-bold flex items-center gap-1"><i class="fa-regular fa-clock"></i> ${s.time||'시간 미지정'}</div>
            </div>`;
        }).join('');

        return `<div class="bg-slate-50 rounded-2xl border border-slate-100 flex flex-col min-h-[300px]">
            <div class="text-center py-3 border-b border-slate-200 bg-white rounded-t-2xl"><h4 class="text-sm font-black text-slate-700">${day}</h4></div>
            <div class="p-3 flex-1 flex flex-col gap-3">
                ${eventsHtml}
                <button onclick="window.openScheduleModal('${day}')" class="w-full border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-white text-slate-400 hover:text-indigo-500 rounded-xl py-3 text-xs font-bold transition-colors flex items-center justify-center gap-2 mt-auto"><i class="fa-solid fa-plus"></i> 일정 추가</button>
            </div>
        </div>`;
    }).join('');
};

window.openScheduleModal = function(day = '월요일') {
    document.getElementById('sch-id').value = '';
    document.getElementById('sch-day').value = day;
    document.getElementById('sch-category').value = '휴가/반차';
    document.getElementById('sch-time').value = '';
    document.getElementById('sch-content').value = '';
    document.getElementById('sch-modal-title').innerText = '추가';
    
    document.getElementById('schedule-modal').classList.remove('hidden');
    document.getElementById('schedule-modal').classList.add('flex');
};

window.closeScheduleModal = function() {
    document.getElementById('schedule-modal').classList.add('hidden');
    document.getElementById('schedule-modal').classList.remove('flex');
};

window.editSchedule = function(id) {
    const s = window.currentScheduleList.find(x => x.id === id);
    if(!s) return;
    document.getElementById('sch-id').value = id;
    document.getElementById('sch-day').value = s.day;
    document.getElementById('sch-category').value = s.category;
    document.getElementById('sch-time').value = s.time || '';
    document.getElementById('sch-content').value = s.content || '';
    document.getElementById('sch-modal-title').innerText = '수정';
    
    document.getElementById('schedule-modal').classList.remove('hidden');
    document.getElementById('schedule-modal').classList.add('flex');
};

window.saveSchedule = async function() {
    const id = document.getElementById('sch-id').value;
    const week = document.getElementById('weekly-log-filter-week').value;
    const day = document.getElementById('sch-day').value;
    const category = document.getElementById('sch-category').value;
    const time = document.getElementById('sch-time').value.trim();
    const content = document.getElementById('sch-content').value.trim();

    if(!content) return window.showToast("일정 내용을 입력하세요.", "error");

    const payload = { week, day, category, time, content, authorUid: window.currentUser.uid, updatedAt: Date.now() };

    try {
        if(id) {
            await setDoc(doc(db, "weekly_schedules", id), payload, { merge: true });
        } else {
            payload.createdAt = Date.now();
            await addDoc(collection(db, "weekly_schedules"), payload);
        }
        window.showToast("일정이 저장되었습니다.");
        window.closeScheduleModal();
    } catch(e) {
        window.showToast("저장 실패", "error");
    }
};

window.deleteSchedule = async function(id) {
    if(confirm("이 일정을 삭제하시겠습니까?")) {
        try {
            await deleteDoc(doc(db, "weekly_schedules", id));
            window.showToast("삭제되었습니다.");
        } catch(e) {
            window.showToast("삭제 실패", "error");
        }
    }
};
