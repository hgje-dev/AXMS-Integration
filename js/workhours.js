import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let worklogsUnsubscribe = null;
window.currentWorkLogs = [];

// 1. 초기 데이터 로드 및 캘린더 그리기
window.loadWorkhoursData = function() {
    const weekInput = document.getElementById('workhours-week-picker');
    if(!weekInput || !weekInput.value) return;

    // 선택된 주차의 월요일~일요일 날짜 계산
    const { start, end } = window.getDatesFromWeek(weekInput.value);
    const startStr = window.getLocalDateStr(start);
    const endStr = window.getLocalDateStr(end);

    if(worklogsUnsubscribe) worklogsUnsubscribe();

    // Firebase에서 해당 주차의 공수 데이터만 실시간으로 가져옴
    const q = query(collection(db, "work_logs"), where("date", ">=", startStr), where("date", "<=", endStr));
    
    worklogsUnsubscribe = onSnapshot(q, (snapshot) => {
        window.currentWorkLogs = [];
        snapshot.forEach(doc => window.currentWorkLogs.push({ id: doc.id, ...doc.data() }));
        window.renderWorkhoursTable(start); // 데이터 가져온 후 표 그리기
    });
};

window.changeWorkhoursWeek = function(offset) {
    const weekInput = document.getElementById('workhours-week-picker');
    if(!weekInput) return;
    let [year, week] = weekInput.value.split('-W');
    let d = new Date(year, 0, (parseInt(week) + offset - 1) * 7 + 1);
    weekInput.value = window.getWeekString(d);
    window.loadWorkhoursData();
};

// 2. 표 렌더링 로직 (마법이 일어나는 곳 ✨)
window.renderWorkhoursTable = function(startDate) {
    const thead = document.querySelector('#app-content table thead tr');
    const tbody = document.querySelector('#app-content table tbody');
    if(!thead || !tbody) return;

    // 요일 배열 (월~일)
    const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
    let dates = [];

    // 헤더(날짜) 업데이트
    let headerHtml = `<th class="p-4 font-black text-center w-24 border-r border-slate-200">소속</th><th class="p-4 font-black text-center w-24 border-r border-slate-200">이름</th>`;
    
    for(let i=0; i<7; i++) {
        let currentDay = new Date(startDate);
        currentDay.setDate(currentDay.getDate() + i);
        let dateStr = window.getLocalDateStr(currentDay);
        dates.push(dateStr);
        
        let isWeekend = (i === 5 || i === 6);
        let colorClass = isWeekend ? 'text-rose-500' : 'text-slate-800';
        let subColorClass = isWeekend ? 'text-rose-400' : 'text-slate-400';
        let bgClass = isWeekend ? 'bg-rose-50/50' : '';

        headerHtml += `<th class="p-3 text-center border-r border-slate-200 w-[13%] ${bgClass}">
            <div class="text-xl font-black ${colorClass}">${String(currentDay.getDate()).padStart(2, '0')}</div>
            <div class="text-xs font-bold ${subColorClass}">${dayNames[i]}</div>
        </th>`;
    }
    thead.innerHTML = headerHtml;

    // 바디(팀원 & 공수 데이터) 업데이트
    let bodyHtml = '';
    
    // 팀별로 유저 그룹핑
    const teamGroups = {};
    (window.teamMembers || []).forEach(member => {
        if(!teamGroups[member.part]) teamGroups[member.part] = [];
        teamGroups[member.part].push(member);
    });

    for(let part in teamGroups) {
        let members = teamGroups[part];
        members.forEach((member, index) => {
            bodyHtml += `<tr class="hover:bg-slate-50/50 transition-colors">`;
            // 첫 번째 멤버일 때만 부서명(병합) 출력
            if(index === 0) {
                bodyHtml += `<td class="p-4 text-center font-bold text-slate-500 border-r border-slate-100 bg-slate-50/30" rowspan="${members.length}">${part}</td>`;
            }
            bodyHtml += `<td class="p-4 text-center font-black text-slate-700 border-r border-slate-100 bg-white">${member.name}</td>`;

            // 월~일 7칸 생성
            for(let i=0; i<7; i++) {
                let cellDate = dates[i];
                let isWeekend = (i === 5 || i === 6);
                let cellBg = isWeekend ? 'bg-rose-50/30' : '';
                
                // 해당 날짜, 해당 유저의 작업 기록 필터링
                let logs = window.currentWorkLogs.filter(log => log.date === cellDate && log.authorName === member.name);
                
                let cellHtml = `<td class="p-2 border-r border-slate-100 align-top ${cellBg}">`;
                logs.forEach(log => {
                    let pjtText = log.projectCode ? `[${log.projectCode}]` : (log.projectName || '프로젝트 미지정');
                    // 클릭 시 수정 모달 오픈
                    cellHtml += `<div onclick="window.openWorkhoursModal('${log.id}', '${cellDate}', '${member.name}', '${log.projectId}', '${log.workType}', ${log.hours})" class="bg-white border border-slate-200 text-slate-700 px-2 py-1.5 rounded-lg text-[11px] font-bold shadow-sm cursor-pointer hover:border-indigo-400 transition-colors mb-1 break-all">${pjtText}<br><span class="text-slate-500 font-medium">${log.workType} / ${log.hours}h</span></div>`;
                });

                // 빈 공간 클릭 시 새 등록 모달 오픈 (해당 팀원 & 해당 날짜)
                cellHtml += `<div onclick="window.openWorkhoursModal('', '${cellDate}', '${member.name}', '', '조립', '')" class="h-6 w-full cursor-pointer opacity-0 hover:opacity-100 flex items-center justify-center text-indigo-300 text-xs"><i class="fa-solid fa-plus"></i></div></td>`;
                bodyHtml += cellHtml;
            }
            bodyHtml += `</tr>`;
        });
    }
    
    if(!window.teamMembers || window.teamMembers.length === 0) {
        bodyHtml = `<tr><td colspan="9" class="p-10 text-center text-slate-400 font-bold">등록된 팀원이 없습니다. [팀원 관리]에서 팀원을 추가해주세요.</td></tr>`;
    }

    tbody.innerHTML = bodyHtml;
};

// 3. 모달창 제어 및 저장 로직
window.openWorkhoursModal = function(logId, dateStr, authorName, projectId, workType, hours) {
    document.getElementById('wh-id').value = logId || '';
    document.getElementById('wh-date').value = dateStr || window.getLocalDateStr(new Date());
    document.getElementById('wh-author-name').value = authorName || window.userProfile?.name || '';
    document.getElementById('wh-type').value = workType || '조립';
    document.getElementById('wh-hours').value = hours || '';

    // 진행중인 프로젝트 목록 Select 채우기
    const pjtSelect = document.getElementById('wh-project');
    pjtSelect.innerHTML = '<option value="">진행중인 프로젝트 선택</option>';
    (window.currentProjectStatusList || []).filter(p => p.status !== 'completed').forEach(p => {
        let isSelected = (p.id === projectId) ? 'selected' : '';
        pjtSelect.innerHTML += `<option value="${p.id}" data-code="${p.code||''}" data-name="${p.name||''}" ${isSelected}>[${p.code||'-'}] ${p.name||''}</option>`;
    });

    document.getElementById('wh-delete-wrap').classList.toggle('hidden', !logId);
    document.getElementById('workhours-modal').classList.remove('hidden');
    document.getElementById('workhours-modal').classList.add('flex');
};

window.closeWorkhoursModal = function() {
    document.getElementById('workhours-modal').classList.add('hidden');
    document.getElementById('workhours-modal').classList.remove('flex');
};

window.saveWorkhours = async function() {
    const id = document.getElementById('wh-id').value;
    const authorName = document.getElementById('wh-author-name').value;
    const date = document.getElementById('wh-date').value;
    const hours = parseFloat(document.getElementById('wh-hours').value) || 0;
    const workType = document.getElementById('wh-type').value;
    
    const pjtSelect = document.getElementById('wh-project');
    const projectId = pjtSelect.value;
    const projectCode = pjtSelect.options[pjtSelect.selectedIndex]?.dataset?.code || '';
    const projectName = pjtSelect.options[pjtSelect.selectedIndex]?.dataset?.name || '';

    if(!date || hours <= 0 || !projectId) {
        return window.showToast("날짜, 프로젝트, 시간을 정확히 입력하세요.", "error");
    }

    const payload = { date, authorName, hours, workType, projectId, projectCode, projectName, updatedAt: Date.now() };

    try {
        if(id) {
            await setDoc(doc(db, "work_logs", id), payload, { merge: true });
            window.showToast("수정되었습니다.");
        } else {
            payload.createdAt = Date.now();
            await addDoc(collection(db, "work_logs"), payload);
            window.showToast("등록되었습니다.");
        }
        window.closeWorkhoursModal();
    } catch(e) {
        window.showToast("저장 실패", "error");
    }
};

window.deleteWorkhours = async function() {
    const id = document.getElementById('wh-id').value;
    if(!id || !confirm("이 공수 기록을 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "work_logs", id));
        window.showToast("삭제되었습니다.");
        window.closeWorkhoursModal();
    } catch(e) {
        window.showToast("삭제 실패", "error");
    }
};
