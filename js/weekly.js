/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentWeeklyLogUnsubscribe = null;
let currentScheduleUnsubscribe = null;
let noticeUnsubscribe = null; // 공지사항 실시간 리스너 추가

window.currentWeeklyLogList = [];
window.allSchedules = []; 
window.currentScheduleList = [];
window.draftTasks = []; 
window.wlInvolvedProjects = []; 
window.activeWeeklyTab = 'team'; 

window.switchWeeklyTab = function(tabName) {
    window.activeWeeklyTab = tabName;
    const btnTeam = document.getElementById('tab-team-btn');
    const btnMy = document.getElementById('tab-my-btn');
    const btnTeamSch = document.getElementById('tab-team-sch-btn');
    
    const viewTeam = document.getElementById('weekly-team-view');
    const viewMy = document.getElementById('weekly-my-view');
    const viewTeamSch = document.getElementById('weekly-team-sch-view');

    const activeClass = "px-5 py-2 text-sm font-bold bg-white text-indigo-700 shadow-sm rounded-lg transition-all flex items-center gap-2 whitespace-nowrap";
    const inactiveClass = "px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap";

    if (btnTeam) btnTeam.className = inactiveClass;
    if (btnMy) btnMy.className = inactiveClass;
    if (btnTeamSch) btnTeamSch.className = inactiveClass;

    if (viewTeam) viewTeam.classList.add('hidden');
    if (viewMy) viewMy.classList.add('hidden');
    if (viewTeamSch) viewTeamSch.classList.add('hidden');

    if (tabName === 'team') {
        if (btnTeam) btnTeam.className = activeClass;
        if (viewTeam) viewTeam.classList.remove('hidden');
    } else if (tabName === 'my') {
        if (btnMy) btnMy.className = activeClass;
        if (viewMy) viewMy.classList.remove('hidden');
    } else if (tabName === 'team-sch') {
        if (btnTeamSch) btnTeamSch.className = activeClass;
        if (viewTeamSch) viewTeamSch.classList.remove('hidden');
    }
};

window.updateWeekLabels = function(weekStr) {
    if(!weekStr || !window.getDatesFromWeek) return;
    const dates = window.getDatesFromWeek(weekStr); 
    
    const thu = new Date(dates.start);
    thu.setDate(thu.getDate() + 3);
    const m = thu.getMonth() + 1;
    const y = thu.getFullYear();
    
    const firstDay = new Date(y, m - 1, 1);
    let offset = firstDay.getDay() - 1; 
    if(offset === -1) offset = 6;
    
    const dateNum = thu.getDate();
    const weekNum = Math.ceil((dateNum + offset) / 7);
    
    const displayEl = document.getElementById('weekly-display-text');
    if (displayEl) displayEl.innerText = `${y}년 ${m}월 ${weekNum}주`;

    const wed = new Date(dates.start);
    wed.setDate(wed.getDate() + 2); 
    
    const prevWed = new Date(wed);
    prevWed.setDate(prevWed.getDate() - 7); 
    
    let deadline = new Date(wed);
    if(window.isWorkDay) {
        while(!window.isWorkDay(deadline)) {
            deadline.setDate(deadline.getDate() - 1);
        }
    }
    
    const periodEl = document.getElementById('weekly-period-text');
    const dLineEl = document.getElementById('weekly-deadline-text');
    
    if(periodEl) periodEl.innerText = `${window.getLocalDateStr(prevWed).substring(5)} ~ ${window.getLocalDateStr(wed).substring(5)}`;
    if(dLineEl) dLineEl.innerText = window.getLocalDateStr(deadline);
};

window.handleWeekChange = function(val) {
    if (!val) return;
    window.updateWeekLabels(val);
    window.loadWeeklyLogsData();
};

window.changeWeeklyWeek = function(offset) {
    const weekInput = document.getElementById('weekly-log-filter-week');
    if (!weekInput) return;
    
    if (!weekInput.value && window.getWeekString) {
        weekInput.value = window.getWeekString(new Date());
    }
    
    if (!weekInput.value) return;

    const parts = weekInput.value.split('-W');
    if (parts.length === 2) {
        const year = parts[0];
        const week = parts[1];
        const d = new Date(year, 0, (parseInt(week) + offset - 1) * 7 + 1);
        if (window.getWeekString) {
            weekInput.value = window.getWeekString(d);
            window.handleWeekChange(weekInput.value);
        }
    }
};

window.openTeamModal = function() {
    const m = document.getElementById('team-modal');
    if (m) { 
        m.classList.remove('hidden'); 
        m.classList.add('flex'); 
    }
    
    if (typeof window.populateUserDropdowns === 'function') {
        window.populateUserDropdowns();
    } else {
        const sel = document.getElementById('new-team-name');
        if (sel && window.allSystemUsers) {
            sel.innerHTML = '<option value="">선택</option>' + window.allSystemUsers.map(function(u) { 
                return '<option value="' + u.name + '" data-uid="' + u.uid + '">' + u.name + ' (' + (u.team || '소속없음') + ')</option>'; 
            }).join('');
        }
    }
    
    if (typeof window.renderTeamMembers === 'function') {
        window.renderTeamMembers();
    } else {
        const tbody = document.getElementById('team-list-tbody');
        const count = document.getElementById('team-modal-count');
        const list = window.teamMembers || [];
        if (count) count.innerText = '총 ' + list.length + '명';
        if (tbody) {
            if (list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center p-6 text-slate-400 font-bold">등록된 팀원이 없습니다.</td></tr>';
            } else {
                tbody.innerHTML = list.map(function(t) { 
                    return '<tr class="hover:bg-slate-50"><td class="p-3 text-center font-bold text-indigo-600">' + t.part + '</td><td class="p-3 font-bold text-slate-700">' + t.name + '</td><td class="p-3 text-center"><button onclick="window.deleteTeamMember(\'' + t.id + '\')" class="text-slate-400 hover:text-rose-500 p-1"><i class="fa-solid fa-trash-can"></i></button></td></tr>'; 
                }).join('');
            }
        }
    }
};

window.closeTeamModal = function() {
    const m = document.getElementById('team-modal');
    if (m) { 
        m.classList.add('hidden'); 
        m.classList.remove('flex'); 
    }
};

window.addTeamMember = async function() {
    const sel = document.getElementById('new-team-name');
    const partSel = document.getElementById('new-team-part');
    if (!sel || !sel.value) { 
        if (window.showToast) window.showToast("사용자를 선택하세요.", "error"); 
        return; 
    }
    
    const uid = sel.options[sel.selectedIndex].dataset.uid;
    const name = sel.value;
    const part = partSel.value;
    const members = window.teamMembers || [];
    
    const exists = members.find(function(t) { return t.name === name; });
    if (exists) {
        if (window.showToast) window.showToast("이미 등록된 팀원입니다.", "error"); 
        return;
    }
    
    try {
        await addDoc(collection(db, "team_members"), { uid: uid, name: name, part: part, createdAt: Date.now() });
        if (window.showToast) window.showToast("팀원이 추가되었습니다.");
        window.openTeamModal(); 
    } catch (e) { 
        if (window.showToast) window.showToast("추가 실패", "error"); 
    }
};

window.deleteTeamMember = async function(id) {
    if (!confirm("이 팀원을 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "team_members", id));
        if (window.showToast) window.showToast("삭제되었습니다.");
        window.openTeamModal(); 
    } catch (e) { 
        if (window.showToast) window.showToast("삭제 실패", "error"); 
    }
};

// 공지사항 편집 로직
window.editNotice = async function() {
    const el = document.getElementById('weekly-notice-text');
    const currentText = el ? el.innerText : '';
    const newText = prompt("이번 주 공지사항을 입력하세요:", currentText.includes("공지사항을 불러오는") ? '' : currentText);
    
    if (newText !== null) {
        try {
            await setDoc(doc(db, "settings", "weekly_notice"), { text: newText.trim(), updatedAt: Date.now() }, { merge: true });
            if(window.showToast) window.showToast("공지사항이 수정되었습니다.");
        } catch (e) {
            if(window.showToast) window.showToast("수정 실패", "error");
        }
    }
};

window.loadWeeklyLogsData = function() { 
    const weekInput = document.getElementById('weekly-log-filter-week');
    if (!weekInput || !weekInput.value) return;
    const w = weekInput.value; 

    if (window.updateWeekLabels) window.updateWeekLabels(w);

    // 공지사항 로드 연동
    if (!noticeUnsubscribe) {
        noticeUnsubscribe = onSnapshot(doc(db, "settings", "weekly_notice"), (docSnap) => {
            const el = document.getElementById('weekly-notice-text');
            if (el) {
                if (docSnap.exists() && docSnap.data().text) {
                    el.innerText = docSnap.data().text;
                } else {
                    el.innerText = "등록된 공지사항이 없습니다.";
                }
            }
        });
    }
    
    // 엑셀 버튼 권한 처리
    const exportBtn = document.getElementById('btn-export-weekly');
    if (exportBtn && window.userProfile && window.userProfile.role === 'admin') {
        exportBtn.classList.remove('hidden');
        exportBtn.classList.add('flex');
    }

    if (currentWeeklyLogUnsubscribe) currentWeeklyLogUnsubscribe(); 
    currentWeeklyLogUnsubscribe = onSnapshot(query(collection(db, "weekly_logs_v2"), where("week", "==", w)), function(s) { 
        window.currentWeeklyLogList = []; 
        let statSub = 0, statComp = 0, statProg = 0, statIssue = 0;

        s.forEach(function(d) {
            const data = Object.assign({ id: d.id }, d.data());
            window.currentWeeklyLogList.push(data);
            
            if (data.isSubmitted) {
                statSub++;
                const issueText = String(data.issues || '').trim();
                if (issueText !== '') statIssue++;
                
                if (data.tasks && Array.isArray(data.tasks)) {
                    data.tasks.forEach(function(t) {
                        if (t.status === '완료') statComp++;
                        if (t.status === '진행 중') statProg++;
                    });
                }
            }
        }); 

        const subEl = document.getElementById('stat-submitted'); if (subEl) subEl.innerText = statSub;
        const compEl = document.getElementById('stat-completed'); if (compEl) compEl.innerText = statComp;
        const progEl = document.getElementById('stat-progress'); if (progEl) progEl.innerText = statProg;
        const issEl = document.getElementById('stat-issue'); if (issEl) issEl.innerText = statIssue;

        const topStatusEl = document.getElementById('top-my-submit-status');
        if (topStatusEl && window.currentUser) {
            const myLog = window.currentWeeklyLogList.find(l => l.authorUid === window.currentUser.uid);
            if (myLog && myLog.isSubmitted) {
                topStatusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-600 font-bold ml-1 shadow-sm';
                topStatusEl.innerText = '제출 완료됨';
            } else {
                topStatusEl.className = 'text-[10px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-bold ml-1 shadow-sm';
                topStatusEl.innerText = '미제출';
            }
        }

        window.renderWeeklyLogs(); 
        window.checkMissingMembers();
    }); 

    if (currentScheduleUnsubscribe) currentScheduleUnsubscribe();
    if (window.currentUser) {
        currentScheduleUnsubscribe = onSnapshot(query(collection(db, "weekly_schedules"), where("week", "==", w)), function(s) {
            window.allSchedules = [];
            s.forEach(function(d) {
                window.allSchedules.push(Object.assign({ id: d.id }, d.data()));
            });
            window.currentScheduleList = window.allSchedules.filter(sch => sch.authorUid === window.currentUser.uid);
            
            window.renderKanbanBoard();
            window.renderTeamKanbanBoard();
        });
    }
};

window.checkMissingMembers = function() {
    const members = window.teamMembers || [];
    if (members.length === 0) return;
    
    const submittedNames = window.currentWeeklyLogList.filter(function(l) { 
        return l.isSubmitted; 
    }).map(function(l) { 
        return l.authorName; 
    });
    
    let missing = [];
    members.forEach(function(tm) {
        if (submittedNames.indexOf(tm.name) === -1 && tm.name !== '시스템관리자') {
            missing.push(tm);
        }
    });

    const card = document.getElementById('missing-members-card');
    if (!card) return;

    const listEl = document.getElementById('missing-members-list');
    const countEl = document.getElementById('missing-count');
    
    if (missing.length > 0) {
        card.classList.remove('hidden');
        if (countEl) countEl.innerText = missing.length;
        if (listEl) {
            listEl.innerHTML = missing.map(function(m) {
                return '<span class="bg-white border border-orange-200 text-orange-700 px-2 py-1 rounded-full text-[10px] font-bold shadow-sm">' + m.name + ' <span class="text-orange-400 font-normal ml-1">' + (m.part || '') + '</span></span>';
            }).join('');
        }
    } else {
        card.classList.add('hidden');
    }
};

window.urgeMissingMembers = function() {
    if (window.showToast) window.showToast("작성 독려 알림이 발송되었습니다.", "success");
};

window.filterWeeklyLogs = function() {
    window.renderWeeklyLogs();
};

window.renderWeeklyLogs = function() { 
    const feed = document.getElementById('weekly-log-feed'); 
    if (!feed) return; 

    const searchNameEl = document.getElementById('weekly-search-name');
    const searchContentEl = document.getElementById('weekly-search-content');
    
    const searchName = searchNameEl ? searchNameEl.value.toLowerCase() : '';
    const searchContent = searchContentEl ? searchContentEl.value.toLowerCase() : '';

    let displayList = window.currentWeeklyLogList.filter(function(l) { 
        return l.isSubmitted; 
    });

    if (searchName) {
        displayList = displayList.filter(function(l) { 
            return (l.authorName || '').toLowerCase().includes(searchName); 
        });
    }
    
    if (searchContent) {
        displayList = displayList.filter(function(l) {
            let fullText = String(l.issues || '') + ' ';
            if (l.involvedProjects && Array.isArray(l.involvedProjects)) {
                l.involvedProjects.forEach(function(p) { fullText += ' ' + String(p.name || ''); });
            } else {
                fullText += String(l.projectName || '');
            }

            if (l.tasks && Array.isArray(l.tasks)) {
                l.tasks.forEach(function(t) { fullText += ' ' + String(t.content || ''); });
            }
            return fullText.toLowerCase().includes(searchContent);
        });
    }

    displayList.sort(function(a, b) { 
        return (b.updatedAt || 0) - (a.updatedAt || 0); 
    });

    if (displayList.length === 0) {
        feed.innerHTML = '<div class="text-center p-10 bg-white rounded-2xl border border-slate-200 text-slate-400 font-bold shadow-sm">제출된 일지가 없거나 검색 결과가 없습니다.</div>';
        return;
    }

    const orderMap = { "월요일": 1, "화요일": 2, "수요일": 3, "목요일": 4, "금요일": 5, "토요일": 6, "일요일": 7, "주간 공통": 99 };

    feed.innerHTML = displayList.map(function(log) {
        let tasksByDay = {};
        if (log.tasks && Array.isArray(log.tasks)) {
            log.tasks.forEach(function(t) {
                const safeDay = t.day || '기타';
                if (!tasksByDay[safeDay]) tasksByDay[safeDay] = [];
                tasksByDay[safeDay].push(t);
            });
        }

        const sortedDays = Object.keys(tasksByDay).sort(function(a, b) { 
            return (orderMap[a] || 0) - (orderMap[b] || 0); 
        });

        const tasksHtml = sortedDays.map(function(day) {
            let dayHtml = '<div class="bg-slate-50 px-4 py-1.5 rounded-lg text-xs font-bold text-slate-500 mb-2 mt-4 flex items-center gap-1.5"><i class="fa-regular fa-clock"></i> ' + day + '</div><ul class="space-y-2 ml-2 border-l-2 border-slate-100 pl-4">';
            
            tasksByDay[day].forEach(function(t) {
                let statusBadge = '<span class="text-[10px] font-bold border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded shadow-sm bg-white">보류</span>';
                if (t.status === '완료') {
                    statusBadge = '<span class="text-[10px] font-bold border border-emerald-200 text-emerald-600 px-1.5 py-0.5 rounded shadow-sm bg-white">완료</span>';
                } else if (t.status === '진행 중') {
                    statusBadge = '<span class="text-[10px] font-bold border border-blue-200 text-blue-600 px-1.5 py-0.5 rounded shadow-sm bg-white">진행 중</span>';
                }
                
                const locBadge = '<span class="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-1"><i class="fa-solid fa-location-dot text-[9px]"></i> ' + (t.loc || '사내') + '</span>';
                const safeContent = window.formatMentions ? window.formatMentions(String(t.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : String(t.content || '');
                
                const timeBadge = t.createdAtTime ? '<span class="text-[9px] text-slate-400 ml-2 font-mono tracking-tighter">' + t.createdAtTime.split(' ')[1] + '</span>' : '';

                dayHtml += '<li class="flex justify-between items-start gap-4 hover:bg-slate-50 p-1.5 rounded-lg transition-colors group"><div class="flex items-start gap-2 text-sm text-slate-700 font-medium"><span class="text-slate-300 mt-1 text-[8px]"><i class="fa-solid fa-circle"></i></span><div>' + safeContent + ' ' + locBadge + timeBadge + '</div></div><div class="shrink-0 pt-0.5">' + statusBadge + '</div></li>';
            });
            dayHtml += '</ul>';
            return dayHtml;
        }).join('');

        let issuesHtml = '';
        const safeIssuesStr = String(log.issues || '').trim();
        if (safeIssuesStr !== '') {
            const formattedIssue = window.formatMentions ? window.formatMentions(safeIssuesStr.replace(/</g, '&lt;').replace(/>/g, '&gt;')) : safeIssuesStr;
            issuesHtml = '<div class="mt-5 bg-[#fffbf0] border border-orange-100 rounded-xl p-4 shadow-sm"><div class="text-[11px] font-bold text-orange-600 mb-2 flex items-center gap-1.5"><i class="fa-regular fa-comment-dots"></i> 요청사항 및 이슈</div><div class="text-sm font-medium text-slate-700 leading-relaxed">' + formattedIssue + '</div></div>';
        }

        let bottomMetaHtml = '<div class="mt-4 pt-3 border-t border-slate-100 flex gap-2 flex-wrap text-[11px] font-bold text-slate-500 items-center">';
        
        let pjtTags = '';
        if (log.involvedProjects && Array.isArray(log.involvedProjects)) {
            pjtTags = log.involvedProjects.map(function(p) { 
                return '<span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-lg shadow-sm"><i class="fa-solid fa-folder-open"></i> ' + (p.name || '') + '</span>'; 
            }).join('');
        } else if (log.projectName) { 
            pjtTags = '<span class="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-lg shadow-sm"><i class="fa-solid fa-folder-open"></i> ' + log.projectName + '</span>';
        }

        bottomMetaHtml += pjtTags;
        bottomMetaHtml += '</div>';

        let actionHtml = '';
        if (window.currentUser && (log.authorUid === window.currentUser.uid || (window.userProfile && window.userProfile.role === 'admin'))) {
            actionHtml = '<div class="flex gap-2"><button onclick="window.editWeeklyLog(\'' + log.id + '\')" class="text-emerald-500 hover:text-emerald-700 transition-colors bg-emerald-50 w-8 h-8 rounded-full flex items-center justify-center"><i class="fa-solid fa-pen"></i></button><button onclick="window.deleteWeeklyLog(\'' + log.id + '\')" class="text-slate-400 hover:text-rose-500 transition-colors w-8 h-8 rounded-full flex items-center justify-center"><i class="fa-solid fa-trash-can"></i></button></div>';
        }

        const dateStr = log.updatedAt ? window.getLocalDateStr(new Date(log.updatedAt)) : '';
        const authorName = log.authorName || '알수없음';
        const initial = window.getChosung ? window.getChosung(authorName).charAt(0) : authorName.charAt(0);

        return '<div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm"><div class="flex justify-between items-start mb-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-lg">' + initial + '</div><div><div class="font-black text-slate-800 text-base">' + authorName + ' <span class="text-[10px] font-bold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded ml-1 bg-slate-50">' + (log.authorTeam || '소속없음') + '</span></div><div class="text-[11px] text-slate-400 font-bold mt-0.5">' + dateStr + ' (' + window.getWeekString(new Date(log.updatedAt || Date.now())) + ')</div></div></div>' + actionHtml + '</div>' + tasksHtml + issuesHtml + bottomMetaHtml + '</div>';
    }).join('');
};

window.addWlProject = function() {
    const inputEl = document.getElementById('wl-pjt-input');
    const codeEl = document.getElementById('wl-temp-pjt-code');
    if (!inputEl) return;
    
    const name = inputEl.value.trim();
    if (!name) return;

    window.wlInvolvedProjects.push({ name: name, code: codeEl ? codeEl.value : '' });
    inputEl.value = '';
    if (codeEl) codeEl.value = '';
    window.renderWlProjects();
};

window.removeWlProject = function(index) {
    window.wlInvolvedProjects.splice(index, 1);
    window.renderWlProjects();
};

window.renderWlProjects = function() {
    const container = document.getElementById('wl-pjt-tags');
    if (!container) return;
    container.innerHTML = window.wlInvolvedProjects.map(function(p, i) {
        return '<span class="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1"><i class="fa-solid fa-folder-open text-indigo-400"></i> ' + p.name + ' <button onclick="window.removeWlProject(' + i + ')" class="text-slate-400 hover:text-rose-500 ml-1 transition-colors"><i class="fa-solid fa-xmark"></i></button></span>';
    }).join('');
};

window.openWeeklyLogWriteModal = async function(editId) { 
    const weekInput = document.getElementById('weekly-log-filter-week');
    if (!weekInput) {
        if (window.showToast) window.showToast("오류: HTML 파일이 최신버전이 아닙니다.", "error");
        return;
    }
    
    const w = weekInput.value;
    let existingLog = null;
    
    if (editId && typeof editId === 'string') {
        existingLog = window.currentWeeklyLogList.find(function(l) { return l.id === editId; });
    } else {
        existingLog = window.currentWeeklyLogList.find(function(l) { return l.authorUid === (window.currentUser ? window.currentUser.uid : null) && l.week === w; });
    }

    const draftIdEl = document.getElementById('weekly-draft-id');
    if (draftIdEl) draftIdEl.value = existingLog ? existingLog.id : '';
    
    window.draftTasks = [];
    window.wlInvolvedProjects = [];
    const issuesEl = document.getElementById('wl-issues'); 
    if (issuesEl) issuesEl.value = '';

    if (existingLog) {
        if (existingLog.tasks) {
            window.draftTasks = existingLog.tasks.map(function(t, i) { 
                return Object.assign({}, t, { id: t.id || Date.now() + i }); 
            });
        }
        if (issuesEl) issuesEl.value = existingLog.issues || '';
        
        if (existingLog.involvedProjects && Array.isArray(existingLog.involvedProjects)) {
            window.wlInvolvedProjects = existingLog.involvedProjects.slice();
        } else if (existingLog.projectName) {
            window.wlInvolvedProjects = [{ name: existingLog.projectName, code: existingLog.projectCode || '' }];
        }
    } else if (window.currentUser) {
        try {
            const d = window.getDatesFromWeek(w).start;
            d.setDate(d.getDate() - 7);
            const prevW = window.getWeekString(d);
            
            const q = query(collection(db, "weekly_logs_v2"), where("week", "==", prevW), where("authorUid", "==", window.currentUser.uid));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
                const prevLog = snap.docs[0].data();
                
                let carryOverCount = 0;
                if (prevLog.tasks && Array.isArray(prevLog.tasks)) {
                    prevLog.tasks.forEach(function(t, i) {
                        if (t.status === '진행 중') {
                            window.draftTasks.push(Object.assign({}, t, { 
                                id: Date.now() + i, 
                                isCarryOver: true,
                                createdAtTime: window.getDateTimeStr ? window.getDateTimeStr(new Date()) : new Date().toLocaleString()
                            }));
                            carryOverCount++;
                        }
                    });
                }
                
                if (carryOverCount > 0) {
                    if (prevLog.involvedProjects && Array.isArray(prevLog.involvedProjects)) {
                        window.wlInvolvedProjects = prevLog.involvedProjects.slice();
                    }
                    if (window.showToast) window.showToast("지난주 '진행 중' 업무 " + carryOverCount + "건이 자동 이월되었습니다.", "success");
                }
            }
        } catch(e) { console.error("이월 데이터 로드 실패", e); }
    }

    window.renderWlProjects();

    const badge = document.getElementById('write-status-badge');
    if (badge) {
        if (existingLog && existingLog.isSubmitted) {
            badge.className = "bg-emerald-100 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 shadow-sm";
            badge.innerText = "제출 완료됨";
        } else {
            badge.className = "bg-indigo-100 text-indigo-600 text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 shadow-sm";
            badge.innerText = "작성 중 (임시저장됨)";
        }
    }

    const contentEl = document.getElementById('wl-new-content');
    if (contentEl) contentEl.value = '';
    
    window.renderDraftTasks();

    const modal = document.getElementById('weekly-log-write-modal');
    if (modal) {
        modal.classList.remove('hidden'); 
        modal.classList.add('flex'); 
    }
};

window.closeWeeklyLogWriteModal = function() { 
    const modal = document.getElementById('weekly-log-write-modal');
    if (modal) {
        modal.classList.add('hidden'); 
        modal.classList.remove('flex'); 
    }
};

window.editWeeklyLog = function(id) {
    const log = window.currentWeeklyLogList.find(function(l) { return l.id === id; });
    if (!log) return;
    window.openWeeklyLogWriteModal(id);
};

window.addWeeklyTaskRow = function() {
    const contentEl = document.getElementById('wl-new-content');
    if (!contentEl) {
        if (window.showToast) window.showToast("입력창을 찾을 수 없습니다.", "error");
        return;
    }

    const dayEl = document.getElementById('wl-new-day');
    const statusEl = document.getElementById('wl-new-status');
    const locEl = document.getElementById('wl-new-loc');

    const day = dayEl ? dayEl.value : '기타';
    const status = statusEl ? statusEl.value : '진행 중';
    const loc = locEl ? locEl.value : '사내';
    const content = contentEl.value.trim();

    if (!content) {
        if (window.showToast) window.showToast("업무 내용을 입력하세요.", "warning");
        return;
    }
    
    const nowStr = window.getDateTimeStr ? window.getDateTimeStr(new Date()) : new Date().toLocaleString();

    window.draftTasks.push({ day: day, status: status, loc: loc, content: content, id: Date.now(), createdAtTime: nowStr });
    contentEl.value = '';
    window.renderDraftTasks();
};

window.removeWeeklyTaskRow = function(taskId) {
    window.draftTasks = window.draftTasks.filter(function(t) { return String(t.id) !== String(taskId); });
    window.renderDraftTasks();
};

window.renderDraftTasks = function() {
    const listEl = document.getElementById('wl-task-list');
    if (!listEl) return;

    if (window.draftTasks.length === 0) {
        listEl.innerHTML = '<div class="text-center p-4 text-[11px] font-bold text-slate-400 bg-slate-100 rounded-xl border border-slate-200 border-dashed">추가된 업무가 없습니다.</div>';
        return;
    }

    const orderMap = { "월요일": 1, "화요일": 2, "수요일": 3, "목요일": 4, "금요일": 5, "토요일": 6, "일요일": 7, "주간 공통": 99 };
    const sorted = window.draftTasks.slice().sort(function(a, b) { 
        return (orderMap[a.day] || 0) - (orderMap[b.day] || 0); 
    });

    listEl.innerHTML = sorted.map(function(t) {
        let statusClass = t.status === '완료' ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : (t.status === '진행 중' ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-slate-500 bg-slate-50 border-slate-200');
        const safeContent = window.formatMentions ? window.formatMentions(String(t.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : String(t.content || '');
        
        let timeBadge = '';
        if (t.isCarryOver) {
            timeBadge = '<span class="text-[9px] bg-amber-100 text-amber-600 ml-2 font-bold px-1.5 py-0.5 rounded shadow-sm tracking-tighter">자동 이월됨</span>';
        } else if (t.createdAtTime) {
            timeBadge = '<span class="text-[9px] text-slate-400 ml-2 font-mono tracking-tighter">' + t.createdAtTime.split(' ')[1] + '</span>';
        }

        return '<div class="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm group"><span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded w-16 text-center shrink-0">' + t.day + '</span><span class="text-[10px] font-bold border px-1.5 py-0.5 rounded shrink-0 w-12 text-center ' + statusClass + '">' + t.status + '</span><div class="text-sm font-medium text-slate-700 flex-1 truncate" title="' + String(t.content).replace(/"/g, '&quot;') + '">' + safeContent + ' <span class="text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded ml-1">' + t.loc + '</span>' + timeBadge + '</div><button onclick="window.removeWeeklyTaskRow(\'' + t.id + '\')" class="text-slate-300 hover:text-rose-500 w-6 h-6 rounded flex items-center justify-center transition-colors"><i class="fa-solid fa-xmark"></i></button></div>';
    }).join('');
};

window.saveWeeklyLog = async function(isFinalSubmit) { 
    const draftIdEl = document.getElementById('weekly-draft-id');
    const weekEl = document.getElementById('weekly-log-filter-week');
    
    if (!draftIdEl || !weekEl) {
        if (window.showToast) window.showToast("오류: HTML 로딩이 완료되지 않았습니다.", "error");
        return;
    }

    const id = draftIdEl.value; 
    const week = weekEl.value; 
    
    if (window.draftTasks.length === 0 && isFinalSubmit) {
        if (window.showToast) window.showToast("제출할 업무 내역을 1개 이상 추가해주세요.", "error");
        return;
    }

    let authorUid = window.currentUser ? window.currentUser.uid : 'unknown';
    let authorName = window.userProfile ? window.userProfile.name : 'unknown';
    let authorTeam = window.userProfile ? (window.userProfile.team || window.userProfile.department || '') : '';

    if (id) {
        const existingLog = window.currentWeeklyLogList.find(function(l) { return l.id === id; });
        if (existingLog) {
            authorUid = existingLog.authorUid || authorUid;
            authorName = existingLog.authorName || authorName;
            authorTeam = existingLog.authorTeam || authorTeam;
        }
    }

    const issuesEl = document.getElementById('wl-issues');

    let fullTextToScan = (issuesEl ? issuesEl.value.trim() : '') + ' ';
    window.draftTasks.forEach(function(t) { fullTextToScan += t.content + ' '; });

    const payload = {
        week: week,
        authorUid: authorUid,
        authorName: authorName,
        authorTeam: authorTeam,
        tasks: window.draftTasks,
        issues: issuesEl ? issuesEl.value.trim() : '',
        involvedProjects: window.wlInvolvedProjects, 
        isSubmitted: isFinalSubmit,
        updatedAt: Date.now()
    };

    try { 
        if (id) {
            await setDoc(doc(db, "weekly_logs_v2", id), payload, { merge: true }); 
        } else {
            payload.createdAt = Date.now();
            await addDoc(collection(db, "weekly_logs_v2"), payload); 
        }
        
        if (isFinalSubmit && window.processMentions && fullTextToScan.trim() !== '') {
            await window.processMentions(fullTextToScan, null, "주간업무일지");
        }

        if (window.showToast) window.showToast(isFinalSubmit ? "최종 제출되었습니다." : "임시 저장되었습니다."); 
        window.closeWeeklyLogWriteModal(); 
    } catch (e) {
        if (window.showToast) window.showToast("저장 실패", "error");
    } 
};

window.deleteWeeklyLog = async function(id) { 
    if (confirm("이 주간 업무 일지를 정말 삭제하시겠습니까?")) { 
        try {
            await deleteDoc(doc(db, "weekly_logs_v2", id)); 
            if (window.showToast) window.showToast("삭제되었습니다."); 
        } catch (e) { 
            if (window.showToast) window.showToast("삭제 실패", "error"); 
        }
    } 
};

// 관리자용 주간업무일지 엑셀 다운로드 함수 고도화
window.exportWeeklyLogsExcel = async function() {
    if (typeof window.ExcelJS === 'undefined') return window.showToast("ExcelJS 모듈을 불러오는 데 실패했습니다.", "error");

    try {
        window.showToast("주간 업무 일지 종합 엑셀을 생성 중입니다...", "success");
        const wb = new window.ExcelJS.Workbook();
        
        const weekInput = document.getElementById('weekly-log-filter-week');
        let wStr = weekInput ? weekInput.value : '';
        
        // 통계 계산
        let submittedCount = 0;
        let completedCount = 0;
        let progressCount = 0;
        let issueCount = 0;
        
        let submittedLogs = window.currentWeeklyLogList.filter(l => l.isSubmitted);
        submittedCount = submittedLogs.length;
        
        // 요약을 위한 데이터 추출
        let compTasks = [];
        let progTasks = [];
        let issueList = [];

        submittedLogs.forEach(log => {
            let author = log.authorName || '알수없음';
            
            if (String(log.issues || '').trim() !== '') {
                issueCount++;
                issueList.push(`[${author}] ${log.issues.trim()}`);
            }
            
            if (log.tasks && Array.isArray(log.tasks)) {
                log.tasks.forEach(t => {
                    if (t.status === '완료') {
                        completedCount++;
                        compTasks.push(`[${author}] ${t.content}`);
                    }
                    if (t.status === '진행 중') {
                        progressCount++;
                        progTasks.push(`[${author}] ${t.content}`);
                    }
                });
            }
        });

        let totalTeamCount = window.teamMembers ? window.teamMembers.length : 0;

        // 1. 요약 시트 생성
        const ws1 = wb.addWorksheet('주간_업무_요약', { views: [{ showGridLines: false }] });
        ws1.columns = [
            { width: 2 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 2 },
            { width: 15 }, { width: 15 }, { width: 15 }, { width: 2 },
            { width: 15 }, { width: 15 }, { width: 15 }
        ];

        ws1.mergeCells('B2:L3');
        const titleCell = ws1.getCell('B2');
        titleCell.value = `AXBIS 주간 업무 종합 보고서 (${wStr})`;
        titleCell.font = { name: '맑은 고딕', size: 20, bold: true, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

        ws1.mergeCells('B4:D4');
        ws1.getCell('B4').value = `출력일시: ${new Date().toLocaleString()}`;
        ws1.getCell('B4').font = { size: 10, color: { argb: 'FF64748B' } };

        ws1.mergeCells('F4:H4');
        let exporterName = window.userProfile ? window.userProfile.name : '시스템';
        let exporterTeam = window.userProfile ? window.userProfile.team : '';
        ws1.getCell('F4').value = `출력자: ${exporterName} (${exporterTeam})`;
        ws1.getCell('F4').font = { size: 10, color: { argb: 'FF64748B' } };

        const createKPICard = (startRow, startCol, endRow, endCol, title, value, subtext, bgColor, titleColor, valColor) => {
            ws1.mergeCells(`${startCol}${startRow}:${endCol}${startRow}`);
            ws1.mergeCells(`${startCol}${startRow+1}:${endCol}${endRow-1}`);
            ws1.mergeCells(`${startCol}${endRow}:${endCol}${endRow}`);

            for(let r=startRow; r<=endRow; r++) {
                for(let c=ws1.getColumn(startCol).number; c<=ws1.getColumn(endCol).number; c++) {
                    let cell = ws1.getCell(r, c);
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.border = {
                        top: {style: r===startRow?'medium':'none', color: {argb: titleColor}},
                        bottom: {style: r===endRow?'medium':'none', color: {argb: titleColor}},
                        left: {style: c===ws1.getColumn(startCol).number?'medium':'none', color: {argb: titleColor}},
                        right: {style: c===ws1.getColumn(endCol).number?'medium':'none', color: {argb: titleColor}}
                    };
                }
            }

            let tCell = ws1.getCell(`${startCol}${startRow}`);
            tCell.value = title;
            tCell.font = { bold: true, size: 11, color: { argb: titleColor } };
            tCell.alignment = { vertical: 'middle', horizontal: 'center', indent: 1 };

            let vCell = ws1.getCell(`${startCol}${startRow+1}`);
            vCell.value = value;
            vCell.font = { bold: true, size: 24, color: { argb: valColor } };
            vCell.alignment = { vertical: 'middle', horizontal: 'center' };

            let sCell = ws1.getCell(`${startCol}${endRow}`);
            sCell.value = subtext;
            sCell.font = { size: 9, color: { argb: 'FF64748B' } };
            sCell.alignment = { vertical: 'middle', horizontal: 'center' };
        };

        // KPI 정보 세팅 
        createKPICard(6, 'B', 9, 'D', '제출된 일지', `${submittedCount} 명`, `전체 팀원: ${totalTeamCount}명`, 'FFF1F5F9', 'FF475569', 'FF334155'); 
        createKPICard(6, 'F', 9, 'H', '완료된 업무', `${completedCount} 건`, '금주 완료 처리됨', 'FFF0FDF4', 'FF10B981', 'FF059669'); 
        createKPICard(6, 'J', 9, 'L', '이슈 및 지연', `${issueCount} 건`, '이슈가 등록된 일지 수', 'FFFFF1F2', 'FFF43F5E', 'FFE11D48'); 

        // 주간 내용 요약 블록 추가
        let summaryStartRow = 11;
        ws1.mergeCells(`B${summaryStartRow}:L${summaryStartRow}`);
        let secTitle = ws1.getCell(`B${summaryStartRow}`);
        secTitle.value = '■ 주간 업무 주요 내용 요약';
        secTitle.font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };

        let currentRow = summaryStartRow + 2;

        const addSummaryBlock = (title, items, titleColor, bgColor) => {
            ws1.mergeCells(`B${currentRow}:L${currentRow}`);
            let tCell = ws1.getCell(`B${currentRow}`);
            tCell.value = title;
            tCell.font = { bold: true, color: { argb: titleColor } };
            tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            tCell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            currentRow++;

            if (items.length === 0) {
                ws1.mergeCells(`B${currentRow}:L${currentRow}`);
                let cCell = ws1.getCell(`B${currentRow}`);
                cCell.value = '해당 내역이 없습니다.';
                cCell.font = { color: { argb: 'FF94A3B8' } };
                cCell.alignment = { vertical: 'middle', horizontal: 'center' };
                cCell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                currentRow++;
            } else {
                items.forEach(item => {
                    ws1.mergeCells(`B${currentRow}:L${currentRow}`);
                    let cCell = ws1.getCell(`B${currentRow}`);
                    cCell.value = '- ' + item;
                    cCell.alignment = { wrapText: true, vertical: 'top' };
                    cCell.border = { top: {style:'thin', color: {argb: 'FFE2E8F0'}}, left: {style:'thin', color: {argb: 'FFE2E8F0'}}, bottom: {style:'thin', color: {argb: 'FFE2E8F0'}}, right: {style:'thin', color: {argb: 'FFE2E8F0'}} };
                    currentRow++;
                });
            }
            currentRow++; // 블록 간 여백
        };

        addSummaryBlock('[완료된 주요 업무]', compTasks, 'FF059669', 'FFF0FDF4'); // Emerald
        addSummaryBlock('[진행 중인 주요 업무]', progTasks, 'FF1D4ED8', 'FFEFF6FF'); // Blue
        addSummaryBlock('[주요 이슈 및 지연 사항]', issueList, 'FFE11D48', 'FFFFF1F2'); // Rose


        // 2. 상세 내역 시트 생성
        const ws2 = wb.addWorksheet('주간_상세_내역', { views: [{ showGridLines: false }] });

        ws2.columns = [
            { header: '소속 팀', key: 'team', width: 15 },
            { header: '작성자', key: 'name', width: 12 },
            { header: '작성일시', key: 'updated', width: 20 },
            { header: '일자', key: 'day', width: 12 },
            { header: '상태', key: 'status', width: 12 },
            { header: '장소', key: 'loc', width: 12 },
            { header: '업무 내용', key: 'content', width: 60 },
            { header: '관여 프로젝트', key: 'pjts', width: 35 },
            { header: '이슈 및 요청사항', key: 'issues', width: 45 }
        ];

        let hr = ws2.getRow(1);
        hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        hr.height = 25;
        hr.eachCell(function(cell) {
            cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        const orderMap = { "월요일": 1, "화요일": 2, "수요일": 3, "목요일": 4, "금요일": 5, "토요일": 6, "일요일": 7, "주간 공통": 99 };

        submittedLogs.sort((a,b) => (a.authorTeam||'').localeCompare(b.authorTeam||'') || (a.authorName||'').localeCompare(b.authorName||''));

        submittedLogs.forEach(log => {
            let team = log.authorTeam || '-';
            let name = log.authorName || '-';
            let updated = log.updatedAt ? window.getDateTimeStr(new Date(log.updatedAt)) : '-';
            
            let pjtStr = (log.involvedProjects || []).map(p => p.name).join(', ');
            if(!pjtStr && log.projectName) pjtStr = log.projectName;
            
            let issues = log.issues || '';

            if(log.tasks && log.tasks.length > 0) {
                let sortedTasks = log.tasks.slice().sort((a,b) => (orderMap[a.day]||0) - (orderMap[b.day]||0));
                sortedTasks.forEach((t, i) => {
                    let row = ws2.addRow({
                        team: team, name: name, updated: updated,
                        day: t.day || '-', status: t.status || '-', loc: t.loc || '-', content: t.content || '-',
                        pjts: i === 0 ? pjtStr : '', 
                        issues: i === 0 ? issues : ''
                    });
                    row.eachCell({ includeEmpty: true }, function(cell, colNumber) {
                        cell.border = { top: {style:'thin', color:{argb:'FFE2E8F0'}}, left: {style:'thin', color:{argb:'FFE2E8F0'}}, bottom: {style:'thin', color:{argb:'FFE2E8F0'}}, right: {style:'thin', color:{argb:'FFE2E8F0'}} };
                        cell.alignment = { vertical: 'top', wrapText: true };
                        if (colNumber <= 6) cell.alignment.horizontal = 'center';
                        
                        // 상태 열 색상 강조
                        if (colNumber === 5) {
                            if (t.status === '완료') cell.font = { color: { argb: 'FF059669' }, bold: true };
                            else if (t.status === '진행 중') cell.font = { color: { argb: 'FF2563EB' }, bold: true };
                            else cell.font = { color: { argb: 'FF64748B' }, bold: true };
                        }
                    });
                });
            } else {
                let row = ws2.addRow({
                    team: team, name: name, updated: updated, day: '-', status: '-', loc: '-', content: '내역 없음', pjts: pjtStr, issues: issues
                });
                row.eachCell({ includeEmpty: true }, function(cell) {
                    cell.border = { top: {style:'thin', color:{argb:'FFE2E8F0'}}, left: {style:'thin', color:{argb:'FFE2E8F0'}}, bottom: {style:'thin', color:{argb:'FFE2E8F0'}}, right: {style:'thin', color:{argb:'FFE2E8F0'}} };
                    cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'center' };
                });
            }
        });

        const buffer = await wb.xlsx.writeBuffer();
        let todayStr = new Date().toISOString().split('T')[0];
        window.saveAs(new Blob([buffer]), `주간업무종합보고서_${wStr}_${todayStr}.xlsx`);

    } catch(e) {
        console.error(e);
        if (window.showToast) window.showToast("엑셀 저장 실패", "error");
    }
};

window.toggleScheduleComplete = async function(id, isCompleted) {
    try {
        await setDoc(doc(db, "weekly_schedules", id), { isCompleted: isCompleted, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
        if (window.showToast) window.showToast("상태 변경 실패", "error");
    }
};

window.renderKanbanBoard = function() {
    const board = document.getElementById('weekly-kanban-board');
    if (!board) return;

    const days = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
    const catMap = {
        "휴가/연차": { icon: "fa-mug-hot", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-600" },
        "휴가/오전": { icon: "fa-sun", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-600" },
        "휴가/오후": { icon: "fa-moon", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-600" },
        "회의": { icon: "fa-users", bg: "bg-purple-50 border-purple-200", text: "text-purple-700", badge: "bg-purple-100 text-purple-600" },
        "사내(작업)": { icon: "fa-headphones", bg: "bg-blue-50 border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-600" },
        "사내(공통)": { icon: "fa-building", bg: "bg-blue-50 border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-600" },
        "출장(국내)": { icon: "fa-car", bg: "bg-orange-50 border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-600" },
        "출장(국외)": { icon: "fa-plane", bg: "bg-orange-50 border-orange-200", text: "text-orange-700", badge: "bg-orange-100 text-orange-600" },
        "기타": { icon: "fa-thumbtack", bg: "bg-slate-50 border-slate-200", text: "text-slate-700", badge: "bg-slate-200 text-slate-600" }
    };

    board.innerHTML = days.map(function(day) {
        const events = window.currentScheduleList.filter(function(s) { return s.day === day; });
        const eventsHtml = events.map(function(s) {
            const style = catMap[s.category] || catMap["기타"];
            const safeTitle = String(s.title || s.content || '제목 없음').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeTime = String(s.time || '시간 미지정');
            
            const completedCardClass = s.isCompleted ? 'opacity-60 bg-slate-100 border-slate-200 grayscale' : style.bg;
            const completedTextClass = s.isCompleted ? 'line-through text-slate-400' : style.text;
            const checkedAttr = s.isCompleted ? 'checked' : '';

            return '<div class="rounded-xl border p-3 ' + completedCardClass + ' relative group cursor-pointer hover:shadow-md transition-all" onclick="window.editSchedule(\'' + s.id + '\')"><button onclick="event.stopPropagation(); window.deleteSchedule(\'' + s.id + '\')" class="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-xmark"></i></button><div class="flex items-center gap-2 mb-2"><input type="checkbox" ' + checkedAttr + ' onclick="event.stopPropagation();" onchange="window.toggleScheduleComplete(\'' + s.id + '\', this.checked)" class="accent-indigo-600 w-4 h-4 cursor-pointer shrink-0"><div class="flex items-center gap-1.5 text-[10px] font-black ' + style.badge + ' w-fit px-2 py-0.5 rounded"><i class="fa-solid ' + style.icon + '"></i> ' + s.category + '</div></div><div class="text-sm font-bold ' + completedTextClass + ' mb-1 truncate">' + safeTitle + '</div><div class="text-[10px] text-slate-500 font-bold flex items-center gap-1"><i class="fa-regular fa-clock"></i> ' + safeTime + '</div></div>';
        }).join('');

        const isWeekend = (day === '토요일' || day === '일요일');
        const headerColor = isWeekend ? 'text-rose-500' : 'text-slate-700';

        return '<div class="bg-slate-50 rounded-2xl border border-slate-100 flex flex-col min-h-[300px]"><div class="text-center py-3 border-b border-slate-200 bg-white rounded-t-2xl"><h4 class="text-sm font-black ' + headerColor + '">' + day + '</h4></div><div class="p-3 flex-1 flex flex-col gap-3">' + eventsHtml + '<button onclick="window.openScheduleModal(\'' + day + '\')" class="w-full border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-white text-slate-400 hover:text-indigo-500 rounded-xl py-3 text-xs font-bold transition-colors flex items-center justify-center gap-2 mt-auto"><i class="fa-solid fa-plus"></i> 일정 추가</button></div></div>';
    }).join('');
};

// 💡 10인 이상 환경을 고려한 팀 일정표 슬림형/스크롤 UI
window.renderTeamKanbanBoard = function() {
    const board = document.getElementById('weekly-team-kanban-board');
    if (!board) return;

    const days = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
    const catMap = {
        "휴가/연차": { icon: "fa-mug-hot", text: "text-emerald-700" },
        "휴가/오전": { icon: "fa-sun", text: "text-emerald-700" },
        "휴가/오후": { icon: "fa-moon", text: "text-emerald-700" },
        "회의": { icon: "fa-users", text: "text-purple-700" },
        "사내(작업)": { icon: "fa-headphones", text: "text-blue-700" },
        "사내(공통)": { icon: "fa-building", text: "text-blue-700" },
        "출장(국내)": { icon: "fa-car", text: "text-orange-700" },
        "출장(국외)": { icon: "fa-plane", text: "text-orange-700" },
        "기타": { icon: "fa-thumbtack", text: "text-slate-700" }
    };

    board.innerHTML = days.map(function(day) {
        const events = window.allSchedules.filter(function(s) { return s.day === day && s.isShared !== false; });
        
        const eventsHtml = events.map(function(s) {
            const style = catMap[s.category] || catMap["기타"];
            const safeTitle = String(s.title || s.content || '제목 없음').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const authorName = String(s.authorName || '팀원');
            const completedTextClass = s.isCompleted ? 'line-through text-slate-400' : 'text-slate-700';

            return '<div class="cursor-pointer hover:bg-slate-100 p-2 border-b border-slate-100 transition-colors" onclick="window.viewSchedule(\'' + s.id + '\')"><div class="flex items-center gap-1.5 mb-1"><span class="text-[9px] font-bold text-white bg-indigo-500 w-fit px-1.5 rounded">' + authorName + '</span><span class="text-[9px] font-bold ' + style.text + '"><i class="fa-solid ' + style.icon + ' mr-0.5"></i>' + s.category + '</span></div><div class="text-xs font-bold truncate ' + completedTextClass + '">' + safeTitle + '</div></div>';
        }).join('');

        const isWeekend = (day === '토요일' || day === '일요일');
        const headerColor = isWeekend ? 'text-rose-500' : 'text-slate-700';
        let emptyText = events.length === 0 ? '<div class="text-center p-4 text-[11px] font-bold text-slate-400">일정 없음</div>' : '';

        // 최대 높이 고정 & 스크롤 부착
        return '<div class="bg-slate-50 rounded-2xl border border-slate-100 flex flex-col h-[350px]"><div class="text-center py-3 border-b border-slate-200 bg-white rounded-t-2xl"><h4 class="text-sm font-black ' + headerColor + '">' + day + '</h4></div><div class="bg-white rounded-b-2xl border-t-0 flex-1 p-1 flex flex-col overflow-y-auto custom-scrollbar">' + emptyText + eventsHtml + '</div></div>';
    }).join('');
};


window.openScheduleModal = function(day) {
    if (!day) day = '월요일';
    const idEl = document.getElementById('sch-id'); if (idEl) idEl.value = '';
    const dayEl = document.getElementById('sch-day'); if (dayEl) dayEl.value = day;
    const catEl = document.getElementById('sch-category'); if (catEl) catEl.value = '휴가/연차';
    const timeEl = document.getElementById('sch-time'); if (timeEl) timeEl.value = '';
    const titleElInput = document.getElementById('sch-title'); if (titleElInput) titleElInput.value = '';
    const contEl = document.getElementById('sch-content'); if (contEl) contEl.value = '';
    const sharedEl = document.getElementById('sch-is-shared'); if (sharedEl) sharedEl.checked = true;
    const titleEl = document.getElementById('sch-modal-title'); if (titleEl) titleEl.innerText = '추가';
    
    const modal = document.getElementById('schedule-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeScheduleModal = function() {
    const modal = document.getElementById('schedule-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.editSchedule = function(id) {
    const s = window.currentScheduleList.find(function(x) { return x.id === id; });
    if (!s) return;
    
    const idEl = document.getElementById('sch-id'); if (idEl) idEl.value = id;
    const dayEl = document.getElementById('sch-day'); if (dayEl) dayEl.value = s.day;
    const catEl = document.getElementById('sch-category'); if (catEl) catEl.value = s.category;
    const timeEl = document.getElementById('sch-time'); if (timeEl) timeEl.value = s.time || '';
    
    const titleElInput = document.getElementById('sch-title'); 
    if (titleElInput) titleElInput.value = s.title || (s.content ? s.content.substring(0,20) : '');
    
    const contEl = document.getElementById('sch-content'); if (contEl) contEl.value = s.content || '';
    const sharedEl = document.getElementById('sch-is-shared'); if (sharedEl) sharedEl.checked = s.isShared !== false;
    const titleEl = document.getElementById('sch-modal-title'); if (titleEl) titleEl.innerText = '수정';
    
    const modal = document.getElementById('schedule-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

// 💡 일정 상세 보기 (팀 일정용 읽기전용)
window.viewSchedule = function(id) {
    const s = window.allSchedules.find(function(x) { return x.id === id; });
    if (!s) return;
    
    const catMap = {
        "휴가/연차": { icon: "fa-mug-hot", badge: "bg-emerald-100 text-emerald-600" },
        "휴가/오전": { icon: "fa-sun", badge: "bg-emerald-100 text-emerald-600" },
        "휴가/오후": { icon: "fa-moon", badge: "bg-emerald-100 text-emerald-600" },
        "회의": { icon: "fa-users", badge: "bg-purple-100 text-purple-600" },
        "사내(작업)": { icon: "fa-headphones", badge: "bg-blue-100 text-blue-600" },
        "사내(공통)": { icon: "fa-building", badge: "bg-blue-100 text-blue-600" },
        "출장(국내)": { icon: "fa-car", badge: "bg-orange-100 text-orange-600" },
        "출장(국외)": { icon: "fa-plane", badge: "bg-orange-100 text-orange-600" },
        "기타": { icon: "fa-thumbtack", badge: "bg-slate-200 text-slate-600" }
    };
    
    const style = catMap[s.category] || catMap["기타"];
    
    document.getElementById('sv-author').innerText = s.authorName || '팀원';
    const catBadge = document.getElementById('sv-category');
    if(catBadge) {
        catBadge.className = 'text-[10px] font-black px-2 py-0.5 rounded shadow-sm ' + style.badge;
        catBadge.innerHTML = '<i class="fa-solid ' + style.icon + '"></i> ' + s.category;
    }
    
    const titleEl = document.getElementById('sv-title');
    if(titleEl) titleEl.innerText = s.title || s.content || '제목 없음';
    
    const timeEl = document.getElementById('sv-time');
    if(timeEl) timeEl.innerText = s.time || '시간 미지정';
    
    let c = s.content || '';
    if (!s.title && s.content) {
        c = '상세 내용 없음';
    }
    
    if (c && c !== '상세 내용 없음') {
        c = String(c).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        if(window.formatMentions) c = window.formatMentions(c);
    }
    
    const contentEl = document.getElementById('sv-content');
    if(contentEl) contentEl.innerHTML = c || '<span class="text-slate-400">상세 내용 없음</span>';
    
    const modal = document.getElementById('schedule-view-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeScheduleViewModal = function() {
    const modal = document.getElementById('schedule-view-modal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.saveSchedule = async function() {
    const idEl = document.getElementById('sch-id');
    const weekEl = document.getElementById('weekly-log-filter-week');
    const dayEl = document.getElementById('sch-day');
    const categoryEl = document.getElementById('sch-category');
    const timeEl = document.getElementById('sch-time');
    const titleEl = document.getElementById('sch-title');
    const contentEl = document.getElementById('sch-content');
    const sharedEl = document.getElementById('sch-is-shared');

    if (!idEl || !weekEl || !dayEl || !categoryEl || !titleEl) return;

    const id = idEl.value;
    const week = weekEl.value;
    const day = dayEl.value;
    const category = categoryEl.value;
    const time = timeEl ? timeEl.value.trim() : '';
    const title = titleEl.value.trim();
    const content = contentEl ? contentEl.value.trim() : '';
    const isShared = sharedEl ? sharedEl.checked : true;

    if (!title) {
        if (window.showToast) window.showToast("일정 제목을 필수로 입력하세요.", "error");
        return;
    }

    const payload = { 
        week: week, 
        day: day, 
        category: category, 
        time: time, 
        title: title,
        content: content, 
        isShared: isShared,
        authorUid: window.currentUser.uid, 
        authorName: window.userProfile.name,
        updatedAt: Date.now() 
    };

    try {
        if (id) {
            await setDoc(doc(db, "weekly_schedules", id), payload, { merge: true });
        } else {
            payload.createdAt = Date.now();
            payload.isCompleted = false;
            await addDoc(collection(db, "weekly_schedules"), payload);
        }
        if (window.showToast) window.showToast("일정이 저장되었습니다.");
        window.closeScheduleModal();
    } catch (e) {
        if (window.showToast) window.showToast("저장 실패", "error");
    }
};

window.deleteSchedule = async function(id) {
    if (confirm("이 일정을 삭제하시겠습니까?")) {
        try {
            await deleteDoc(doc(db, "weekly_schedules", id));
            if (window.showToast) window.showToast("삭제되었습니다.");
        } catch (e) { 
            if (window.showToast) window.showToast("삭제 실패", "error"); 
        }
    }
};
