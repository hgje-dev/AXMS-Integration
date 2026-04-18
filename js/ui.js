// ==========================================
// 💡 상단 퀵 메뉴(Quick Menu) 렌더링 및 관리
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
    // 💡 퀵 메뉴 최대 6개 제한 적용
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
    if(drop) {
        drop.classList.toggle('hidden');
    }
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

document.addEventListener('click', function(e) {
    const drop = document.getElementById('qm-add-dropdown');
    if (drop && !drop.classList.contains('hidden') && !e.target.closest('#quick-menu-container') && !e.target.closest('#qm-add-dropdown')) {
        drop.classList.add('hidden');
    }
});
