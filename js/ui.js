/* eslint-disable */
import { db } from './firebase.js';
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, writeBatch, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// 💡 글로벌 유틸리티 함수 (날짜 및 주차 계산 추가)
// ==========================================
window.getWeekString = function(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return '';
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
};

window.getDatesFromWeek = function(weekStr) {
    if (!weekStr) return { start: new Date(), end: new Date() };
    const parts = weekStr.split('-W');
    if (parts.length !== 2) return { start: new Date(), end: new Date() };
    const year = parseInt(parts[0]);
    const week = parseInt(parts[1]);
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
        
    const start = new Date(ISOweekStart);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
};

// ==========================================
// 💡 토스트 메시지 (알림 팝업) 시스템
// ==========================================
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-emerald-500' : (type === 'error' ? 'bg-rose-500' : 'bg-amber-500');
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation');

    toast.className = `${bgColor} text-white px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3 transform transition-all duration-300 -translate-y-full opacity-0 pointer-events-auto`;
    toast.innerHTML = `<i class="fa-solid ${icon} text-lg"></i><span class="text-sm font-bold">${message}</span>`;

    container.appendChild(toast);

    // 나타나기 애니메이션
    requestAnimationFrame(() => {
        toast.classList.remove('-translate-y-full', 'opacity-0');
    });

    // 3초 후 사라지기 애니메이션
    setTimeout(() => {
        toast.classList.add('-translate-y-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

// ==========================================
// 💡 글로벌 이미지 뷰어 (사진 클릭 시 확대) - 수정본 (iframe 지원)
// ==========================================
window.openImageViewer = function(url) {
    let viewer = document.getElementById('global-image-viewer');
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'global-image-viewer';
        viewer.className = 'fixed inset-0 z-[9999] hidden items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4';
        viewer.innerHTML = `
            <button onclick="window.closeImageViewer()" class="absolute top-6 right-6 text-white/70 hover:text-white text-4xl transition-colors outline-none z-50"><i class="fa-solid fa-xmark"></i></button>
            <div id="global-image-viewer-content" class="w-full h-full flex items-center justify-center"></div>
        `;
        document.body.appendChild(viewer);
    }

    const content = document.getElementById('global-image-viewer-content');
    
    // 구글 드라이브 링크인지 확인하여 분기 처리
    if (url.includes('drive.google.com')) {
        let embedUrl = url;
        if (embedUrl.includes('/view')) {
            embedUrl = embedUrl.replace('/view', '/preview'); 
        } else if (embedUrl.includes('uc?export=view&id=')) {
            const fileIdMatch = embedUrl.match(/id=([^&]+)/);
            if (fileIdMatch) {
                embedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
            }
        }
        
        content.innerHTML = `<iframe src="${embedUrl}" class="w-full max-w-5xl h-[80vh] rounded-xl shadow-2xl bg-white border-0"></iframe>`;
    } else {
        content.innerHTML = `<img src="${url}" class="max-w-full max-h-full object-contain rounded-lg shadow-2xl select-none">`;
    }
    
    viewer.classList.remove('hidden');
    viewer.classList.add('flex');
};

window.closeImageViewer = function() {
    const viewer = document.getElementById('global-image-viewer');
    if (viewer) {
        viewer.classList.add('hidden');
        viewer.classList.remove('flex');
        const content = document.getElementById('global-image-viewer-content');
        if (content) content.innerHTML = ''; // 메모리 누수 방지 및 초기화
    }
};

// ==========================================
// 💡 상단 우측 종 모양 (알림) 시스템
// ==========================================
let notificationUnsubscribe = null;

window.loadNotifications = function() {
    if (!window.currentUser) return;
    if (notificationUnsubscribe) notificationUnsubscribe();

    const q = query(collection(db, "notifications"), where("targetUid", "==", window.currentUser.uid));
    
    notificationUnsubscribe = onSnapshot(q, (snapshot) => {
        let notifs = [];
        let unreadCount = 0;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            data.id = docSnap.id;
            notifs.push(data);
            if (!data.isRead) unreadCount++;
        });

        // 최신순 정렬
        notifs.sort((a, b) => b.createdAt - a.createdAt);
        window.currentNotifications = notifs;

        const badge = document.getElementById('notification-badge');
        const countEl = document.getElementById('notification-count');
        
        if (unreadCount > 0) {
            if (badge) badge.classList.remove('hidden');
            if (countEl) countEl.innerText = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            if (badge) badge.classList.add('hidden');
        }

        window.renderNotifications();
    });
};

window.renderNotifications = function() {
    const listEl = document.getElementById('notification-list');
    if (!listEl) return;

    if (!window.currentNotifications || window.currentNotifications.length === 0) {
        listEl.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-bold">새로운 알림이 없습니다.</div>';
        return;
    }

    listEl.innerHTML = window.currentNotifications.map(n => {
        const dateStr = n.createdAt ? new Date(n.createdAt).toLocaleString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
        const bgClass = n.isRead ? 'bg-white opacity-60' : 'bg-indigo-50/50';
        return `
            <div class="p-4 ${bgClass} hover:bg-slate-50 transition-colors cursor-pointer flex flex-col gap-1" onclick="window.readNotification('${n.id}', '${n.projectId}')">
                <div class="flex justify-between items-start">
                    <span class="text-[10px] font-bold text-indigo-500">${n.type || '알림'}</span>
                    <span class="text-[9px] text-slate-400">${dateStr}</span>
                </div>
                <div class="text-xs font-bold text-slate-700 leading-snug">${n.message.replace(/\n/g, '<br>')}</div>
            </div>
        `;
    }).join('');
};

window.toggleNotifications = function(e) {
    if (e) e.stopPropagation();
    const drop = document.getElementById('notification-dropdown');
    if (drop) drop.classList.toggle('hidden');
    
    // 퀵 메뉴 드롭다운 닫기 (충돌 방지)
    const qmDrop = document.getElementById('qm-add-dropdown');
    if (qmDrop) qmDrop.classList.add('hidden');
};

window.readNotification = async function(id, projectId) {
    try {
        await setDoc(doc(db, "notifications", id), { isRead: true }, { merge: true });
        document.getElementById('notification-dropdown')?.classList.add('hidden');
        
        // PJT 현황판 관련 알림이면 해당 프로젝트 열기
        if (projectId && window.editProjStatus) {
            window.openApp('project-status', 'PJT 현황판', true);
            setTimeout(() => window.editProjStatus(projectId), 500);
        }
    } catch(e) {}
};

window.markAllNotificationsRead = async function() {
    if (!window.currentUser || !window.currentNotifications) return;
    const unread = window.currentNotifications.filter(n => !n.isRead);
    if (unread.length === 0) return;

    try {
        const batch = writeBatch(db);
        unread.forEach(n => {
            batch.update(doc(db, "notifications", n.id), { isRead: true });
        });
        await batch.commit();
    } catch(e) {}
};

window.deleteAllNotifications = async function() {
    if (!window.currentUser || !window.currentNotifications || window.currentNotifications.length === 0) return;
    if (!confirm("모든 알림 내역을 삭제하시겠습니까?")) return;

    try {
        const batch = writeBatch(db);
        window.currentNotifications.forEach(n => {
            batch.delete(doc(db, "notifications", n.id));
        });
        await batch.commit();
    } catch(e) {}
};

// ==========================================
// 💡 상단 퀵 메뉴(Quick Menu) 시스템
// ==========================================
const defaultQuickMenu = [
    { id: 'project-status', name: 'PJT 현황판', icon: 'fa-table-list', color: 'text-indigo-500' },
    { id: 'workhours', name: '투입 현황', icon: 'fa-user-clock', color: 'text-indigo-500' },
    { id: 'weekly-log', name: '주간 업무 일지', icon: 'fa-calendar-week', color: 'text-indigo-500' },
    { id: 'product-cost', name: 'Product Cost', icon: 'fa-coins', color: 'text-emerald-500' },
    { id: 'ncr-dashboard', name: 'NCR 대시보드', icon: 'fa-magnifying-glass-chart', color: 'text-rose-500' }
];

const allAvailableApps = [
    { id: 'project-status', name: 'PJT 현황판', icon: 'fa-table-list', color: 'text-indigo-500' },
    { id: 'workhours', name: '투입 현황', icon: 'fa-user-clock', color: 'text-indigo-500' },
    { id: 'weekly-log', name: '주간 업무 일지', icon: 'fa-calendar-week', color: 'text-indigo-500' },
    { id: 'product-cost', name: 'Product Cost', icon: 'fa-coins', color: 'text-emerald-500' },
    { id: 'mfg-cost', name: '제조 Cost', icon: 'fa-sack-dollar', color: 'text-amber-500' },
    { id: 'ncr-dashboard', name: 'NCR 대시보드', icon: 'fa-magnifying-glass-chart', color: 'text-rose-500' },
    { id: 'quality-report', name: '품질 완료보고', icon: 'fa-file-shield', color: 'text-rose-500' },
    { id: 'collab', name: '협업/조립 요청서', icon: 'fa-handshake', color: 'text-blue-500' },
    { id: 'purchase', name: '모듈 구매 의뢰서', icon: 'fa-cart-flatbed', color: 'text-emerald-500' },
    { id: 'repair', name: '수리/점검 요청서', icon: 'fa-stethoscope', color: 'text-rose-500' },
    { id: 'simulation', name: '공수 시뮬레이션 Pro', icon: 'fa-bolt', color: 'text-indigo-500' }
];

window.getQuickMenu = function() {
    let saved = localStorage.getItem('axms_quick_menu');
    if (saved) {
        try { return JSON.parse(saved); } catch(e) { return defaultQuickMenu; }
    }
    return defaultQuickMenu;
};

window.saveQuickMenu = function(menu) {
    localStorage.setItem('axms_quick_menu', JSON.stringify(menu));
};

window.renderQuickMenu = function() {
    const container = document.getElementById('quick-menu-container');
    if (!container) return;

    let currentMenu = window.getQuickMenu();
    if (currentMenu.length > 6) {
        currentMenu = currentMenu.slice(0, 6);
        window.saveQuickMenu(currentMenu);
    }

    let html = '';
    currentMenu.forEach((item, index) => {
        html += `
            <div class="group relative flex items-center bg-white border border-slate-200 hover:border-indigo-300 rounded-full px-3 py-1.5 cursor-pointer shadow-sm transition-all hover:shadow-md" onclick="window.openApp('${item.id}', '${item.name}')">
                <i class="fa-solid ${item.icon} ${item.color} mr-1.5"></i>
                <span class="text-[11px] font-bold text-slate-600 group-hover:text-indigo-700 whitespace-nowrap">${item.name}</span>
                <button onclick="event.stopPropagation(); window.removeQuickMenu(${index})" class="ml-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none">
                    <i class="fa-solid fa-xmark text-[10px]"></i>
                </button>
            </div>
        `;
    });

    if (currentMenu.length < 6) {
        html += `
            <button onclick="window.toggleQuickMenuDropdown(event)" class="w-7 h-7 rounded-full bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white border border-indigo-100 flex items-center justify-center transition-colors shadow-sm ml-1 focus:outline-none">
                <i class="fa-solid fa-plus text-xs"></i>
            </button>
        `;
    }

    container.innerHTML = html;
    window.renderQuickMenuDropdown();
};

window.toggleQuickMenuDropdown = function(e) {
    if(e) e.stopPropagation();
    const drop = document.getElementById('qm-add-dropdown');
    if(drop) drop.classList.toggle('hidden');
    // 알림창 닫기 (충돌 방지)
    const notifDrop = document.getElementById('notification-dropdown');
    if (notifDrop) notifDrop.classList.add('hidden');
};

window.renderQuickMenuDropdown = function() {
    const drop = document.getElementById('qm-add-dropdown');
    if (!drop) return;

    let currentMenu = window.getQuickMenu();
    let available = allAvailableApps.filter(app => !currentMenu.some(m => m.id === app.id));

    if (available.length === 0) {
        drop.innerHTML = '<li class="p-3 text-center text-xs text-slate-400 font-bold">추가할 메뉴가 없습니다.</li>';
        return;
    }

    let html = '';
    available.forEach(app => {
        html += `
            <li class="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-xs font-bold text-slate-600 hover:text-indigo-700 transition-colors flex items-center border-b border-slate-50 last:border-0" onclick="window.addQuickMenu('${app.id}')">
                <i class="fa-solid ${app.icon} ${app.color} w-5 text-center mr-2"></i> ${app.name}
            </li>
        `;
    });
    drop.innerHTML = html;
};

window.addQuickMenu = function(appId) {
    let currentMenu = window.getQuickMenu();
    if (currentMenu.length >= 6) {
        if(window.showToast) window.showToast("퀵 메뉴는 최대 6개까지만 등록 가능합니다.", "warning");
        return;
    }
    let app = allAvailableApps.find(a => a.id === appId);
    if (app) {
        currentMenu.push(app);
        window.saveQuickMenu(currentMenu);
        window.renderQuickMenu();
    }
    document.getElementById('qm-add-dropdown')?.classList.add('hidden');
};

window.removeQuickMenu = function(index) {
    let currentMenu = window.getQuickMenu();
    currentMenu.splice(index, 1);
    window.saveQuickMenu(currentMenu);
    window.renderQuickMenu();
};

// 화면 바깥 클릭 시 열려있는 드롭다운 메뉴들 숨기기
document.addEventListener('click', function(e) {
    const qmDrop = document.getElementById('qm-add-dropdown');
    if (qmDrop && !qmDrop.classList.contains('hidden') && !e.target.closest('#quick-menu-container') && !e.target.closest('#qm-add-dropdown')) {
        qmDrop.classList.add('hidden');
    }

    const notifDrop = document.getElementById('notification-dropdown');
    if (notifDrop && !notifDrop.classList.contains('hidden') && !e.target.closest('#notification-dropdown') && !e.target.closest('.fa-bell')) {
        notifDrop.classList.add('hidden');
    }
});


// ==========================================
// 💡 [추가] PJT 코드 마스터 기능 통합 로직
// ==========================================

window.loadProjectCodeMaster = function() {
    onSnapshot(collection(db, "project_codes"), function(snap) {
        window.pjtCodeMasterList = [];
        snap.forEach(doc => {
            window.pjtCodeMasterList.push({ id: doc.id, ...doc.data() });
        });
        window.pjtCodeMasterList.sort((a, b) => (a.code > b.code ? 1 : -1));
        window.renderPjtCodeMaster();
    });
};

window.openProjCodeMasterModal = function() {
    const m = document.getElementById('proj-code-master-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
};

window.closeProjCodeMasterModal = function() {
    const m = document.getElementById('proj-code-master-modal');
    if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
};

window.renderPjtCodeMaster = function() {
    const tb = document.getElementById('pjt-code-tbody');
    if (!tb) return;
    if (!window.pjtCodeMasterList || window.pjtCodeMasterList.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-slate-500 font-bold">등록된 PJT 코드가 없습니다.</td></tr>';
        return;
    }
    tb.innerHTML = window.pjtCodeMasterList.map(p => `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="p-3 text-center"><input type="checkbox" class="pjt-chk w-4 h-4 accent-indigo-500" value="${p.id}" onchange="window.checkPjtSelection()"></td>
            <td class="p-3 font-black text-indigo-700">${p.code}</td>
            <td class="p-3 font-bold text-slate-700">${p.name}</td>
            <td class="p-3 text-center text-slate-600">${p.company || '-'}</td>
            <td class="p-3 text-center"><button onclick="window.deleteProjectCode('${p.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td>
        </tr>
    `).join('');
};

window.addProjectCode = async function() {
    const code = document.getElementById('new-pjt-code').value.trim();
    const name = document.getElementById('new-pjt-name').value.trim();
    const company = document.getElementById('new-pjt-company').value.trim();
    if (!code || !name) return window.showToast("코드와 프로젝트명은 필수입니다.", "error");
    try {
        await addDoc(collection(db, "project_codes"), { code, name, company, createdAt: Date.now() });
        window.showToast("PJT 코드가 등록되었습니다.");
        document.getElementById('new-pjt-code').value = '';
        document.getElementById('new-pjt-name').value = '';
        document.getElementById('new-pjt-company').value = '';
    } catch(e) { window.showToast("등록 실패", "error"); }
};

window.deleteProjectCode = async function(id) {
    if(!confirm("해당 PJT 코드를 삭제하시겠습니까?")) return;
    try { 
        await deleteDoc(doc(db, "project_codes", id)); 
        window.showToast("삭제 완료"); 
    } 
    catch(e) { window.showToast("삭제 실패", "error"); }
};

window.toggleAllPjtCheckboxes = function(checked) {
    document.querySelectorAll('.pjt-chk').forEach(cb => cb.checked = checked);
    window.checkPjtSelection();
};

window.checkPjtSelection = function() {
    const checked = document.querySelectorAll('.pjt-chk:checked').length;
    const btn = document.getElementById('btn-delete-selected-pjts');
    if (btn) {
        if (checked > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
};

window.deleteSelectedProjectCodes = async function() {
    const cbs = document.querySelectorAll('.pjt-chk:checked');
    if (cbs.length === 0) return;
    if(!confirm(`선택한 ${cbs.length}개의 프로젝트를 일괄 삭제하시겠습니까?`)) return;
    try {
        const batch = writeBatch(db);
        cbs.forEach(cb => { batch.delete(doc(db, "project_codes", cb.value)); });
        await batch.commit();
        window.showToast("일괄 삭제되었습니다.");
        document.getElementById('pjt-master-checkbox').checked = false;
        window.checkPjtSelection();
    } catch(e) { window.showToast("일괄 삭제 실패", "error"); }
};

window.toggleBulkPjtInput = function() {
    const area = document.getElementById('pjt-bulk-input-area');
    if(area.classList.contains('hidden')) { area.classList.remove('hidden'); area.classList.add('flex'); }
    else { area.classList.add('hidden'); area.classList.remove('flex'); }
};

window.processBulkPjtInput = async function() {
    const text = document.getElementById('bulk-pjt-data').value;
    if(!text.trim()) return window.showToast("데이터를 입력하세요.", "error");
    const lines = text.split('\n');
    let count = 0;
    try {
        const batch = writeBatch(db);
        lines.forEach(line => {
            const cols = line.split('\t');
            if (cols.length >= 2 && cols[0].trim() && cols[1].trim()) {
                const ref = doc(collection(db, "project_codes"));
                batch.set(ref, { code: cols[0].trim(), name: cols[1].trim(), company: cols[2] ? cols[2].trim() : '', createdAt: Date.now() });
                count++;
            }
        });
        if (count > 0) {
            await batch.commit();
            window.showToast(`${count}건의 데이터가 일괄 등록되었습니다.`);
            document.getElementById('bulk-pjt-data').value = '';
            window.toggleBulkPjtInput();
        } else { window.showToast("유효한 데이터가 없습니다.", "error"); }
    } catch(e) { window.showToast("일괄 등록 실패", "error"); }
};
