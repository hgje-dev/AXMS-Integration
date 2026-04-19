window.appRoutes = {
    'dashboard-home': { url: './views/dashboard.html', init: () => { if(window.loadHomeDashboards) window.loadHomeDashboards(); } },
    'completion-report': { url: './views/completion-report.html', init: () => { if(window.initCompletionReport) window.initCompletionReport(); } },
    'project-status': { 
        url: './views/project.html', 
        init: () => { 
            if (!window.currentProjPartTab) window.currentProjPartTab = '제조'; 
            const btnMfg = document.getElementById('btn-part-mfg');
            const btnOpt = document.getElementById('btn-part-opt');
            if(btnMfg && btnOpt) {
                btnMfg.className = window.currentProjPartTab === '제조' ? "px-3 py-1 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
                btnOpt.className = window.currentProjPartTab === '광학' ? "px-3 py-1 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all whitespace-nowrap" : "px-3 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all whitespace-nowrap";
            }
            if(window.loadProjectStatusData) window.loadProjectStatusData(); 
            if(window.initGoogleAPI) window.initGoogleAPI(); 
        } 
    },
    'workhours': { url: './views/workhours.html', init: () => { if(window.loadWorkhoursData) window.loadWorkhoursData(); } },
    'weekly-log': { url: './views/weekly.html', init: () => { document.getElementById('weekly-log-filter-week').value = window.getWeekString(new Date()); if(window.loadWeeklyLogsData) window.loadWeeklyLogsData(); } },
    'product-cost': { url: './views/product-cost.html', init: () => { if(window.initProductCost) window.initProductCost(); } },
    'mfg-cost': { url: './views/mfg-cost.html', init: () => { if(window.initMfgCost) window.initMfgCost(); } },
    'ncr-dashboard': { url: './views/ncr-dashboard.html', init: () => { if(window.initNcrDashboard) window.initNcrDashboard(); } },
    'quality-report': { url: './views/quality-report.html', init: () => { if(window.initQualityReport) window.initQualityReport(); } },
    'simulation': { url: './views/simulation.html', init: () => { if(window.initSimulation) window.initSimulation(); } },
    'collab': { url: './views/request.html', init: () => { window.currentAppId = 'collab'; if(window.loadRequestsData) window.loadRequestsData('collab'); } },
    'purchase': { url: './views/request.html', init: () => { window.currentAppId = 'purchase'; if(window.loadRequestsData) window.loadRequestsData('purchase'); } },
    'repair': { url: './views/request.html', init: () => { window.currentAppId = 'repair'; if(window.loadRequestsData) window.loadRequestsData('repair'); } }
};

window.availableApps = {
    'dashboard-home': { title: '대시보드', icon: 'fa-solid fa-chart-pie', color: 'text-indigo-600' },
    'completion-report': { title: '완료보고', icon: 'fa-solid fa-clipboard-check', color: 'text-indigo-600' },
    'project-status': { title: 'PJT현황', icon: 'fa-solid fa-table-list', color: 'text-indigo-600' },
    'workhours': { title: '투입 현황', icon: 'fa-solid fa-user-clock', color: 'text-indigo-600' },
    'weekly-log': { title: '주간일지', icon: 'fa-solid fa-calendar-week', color: 'text-indigo-600' },
    'product-cost': { title: 'Product Cost', icon: 'fa-solid fa-coins', color: 'text-emerald-600' },
    'mfg-cost': { title: '제조 Cost', icon: 'fa-solid fa-sack-dollar', color: 'text-amber-600' },
    'ncr-dashboard': { title: 'NCR 대시보드', icon: 'fa-solid fa-magnifying-glass-chart', color: 'text-rose-500' },
    'quality-report': { title: '품질보고', icon: 'fa-solid fa-file-shield', color: 'text-rose-500' },
    'collab': { title: '협업/조립', icon: 'fa-regular fa-handshake', color: 'text-blue-500' },
    'purchase': { title: '구매의뢰', icon: 'fa-solid fa-cart-flatbed', color: 'text-emerald-500' },
    'repair': { title: '수리/점검', icon: 'fa-solid fa-stethoscope', color: 'text-rose-500' },
    'simulation': { title: '시뮬레이션', icon: 'fa-solid fa-bolt', color: 'text-indigo-600' }
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
        <div class="group relative flex items-center bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm cursor-pointer hover:bg-indigo-50 transition-colors shrink-0" draggable="true" ondragstart="window.dragQmStart(event, ${index})" ondragover="event.preventDefault()" ondrop="window.dragQmDrop(event, ${index})">
            <div onclick="window.openApp('${key}', '${app.title}')" class="flex items-center gap-1">
                <i class="${app.icon} ${app.color} text-[9px]"></i>
                <span class="text-[9px] font-bold text-slate-700 whitespace-nowrap">${app.title}</span>
            </div>
            <button onclick="window.removeQuickMenu(event, ${index})" class="ml-1 w-3 h-3 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition-all"><i class="fa-solid fa-xmark text-[8px]"></i></button>
        </div>`;
    });

    if (window.quickMenuItems.length < 6) {
        html += `<button onclick="window.openQuickMenuAdd(event)" class="w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center hover:bg-indigo-500 hover:text-white transition-colors shrink-0 shadow-sm"><i class="fa-solid fa-plus text-[9px]"></i></button>`;
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
                html += `<li class="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-[11px] font-bold text-slate-600 flex items-center gap-1.5 border-b border-slate-50 last:border-0 transition-colors" onclick="window.addQuickMenu('${key}')"><i class="${app.icon} ${app.color}"></i> ${app.title}</li>`;
            }
        }
        if (html === '') html = '<li class="px-3 py-2 text-[10px] text-slate-400 text-center">추가할 메뉴가 없습니다.</li>';
        drop.innerHTML = html;
    } else {
        drop.classList.add('hidden');
    }
};

window.addQuickMenu = function(key) {
    if (window.quickMenuItems.length >= 6) return window.showToast('최대 6개까지만 추가 가능합니다.', 'warning');
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

document.addEventListener('click', function(e) {
    const qm = document.getElementById('qm-add-dropdown'); 
    if (qm && !qm.classList.contains('hidden') && !e.target.closest('#qm-add-dropdown') && !e.target.closest('button[onclick*="openQuickMenuAdd"]')) {
        qm.classList.add('hidden');
    }
});

// 💡 13단계 개별 페이지 1:1 권한 매핑
const routeToPermMap = {
    'dashboard-home': 'dashboard-home',
    'completion-report': 'completion-report',
    'project-status': 'project-status',
    'workhours': 'workhours',
    'weekly-log': 'weekly-log',
    'product-cost': 'product-cost',
    'mfg-cost': 'mfg-cost',
    'ncr-dashboard': 'ncr-dashboard',
    'quality-report': 'quality-report',
    'simulation': 'simulation',
    'collab': 'collab',
    'purchase': 'purchase',
    'repair': 'repair'
};

window.openApp = async function(viewId, title) {
    if(window.toggleSidebar) window.toggleSidebar(false);
    let routeKey = viewId.replace('view-', '');
    
    // 💡 새로운 권한 통제 로직 적용
    const requiredPermission = routeToPermMap[routeKey];
    const role = window.userProfile?.role;
    const isSuperUser = (role === 'admin' || role === 'master');

    // 마스터나 관리자가 아니면 권한 보유 여부 철저히 확인
    if (!isSuperUser && requiredPermission && window.userProfile && window.userProfile.permissions) {
        if (!window.userProfile.permissions[requiredPermission]) {
            if(window.showToast) window.showToast("이 메뉴에 접근할 수 있는 권한이 없습니다.", "error"); 
            return;
        }
    }

    const appContent = document.getElementById('app-content');
    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = title || '';

    const route = window.appRoutes[routeKey] || window.appRoutes['dashboard-home'];

    try {
        appContent.innerHTML = '<div class="flex items-center justify-center h-[60vh] w-full"><div class="text-center text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin text-5xl text-indigo-500 mb-4"></i><br>화면을 불러오는 중입니다...</div></div>';
        const response = await fetch(route.url);
        if (!response.ok) throw new Error('파일 로드 실패');
        const htmlData = await response.text();
        
        appContent.innerHTML = htmlData;
        if (route.init) setTimeout(route.init, 50);
    } catch (error) {
        console.error('라우팅 에러:', error);
        appContent.innerHTML = `<div class="text-center p-10 mt-10 bg-white rounded-2xl shadow-sm border border-rose-200 text-rose-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3"></i><br>화면을 불러오는데 실패했습니다.</div>`;
    }
};

// 💡 Fallback 처리 로직: 권한이 막혔을 때 에러(빈 화면) 방지 (최종 개선판)
window.navigateHome = function() { 
    const role = window.userProfile?.role;
    const perms = window.userProfile?.permissions || {};
    
    if (role === 'admin' || role === 'master' || perms['dashboard-home']) {
        window.openApp('dashboard-home', '통합 대시보드 홈');
    } else if (perms['project-status']) {
        window.openApp('project-status', 'PJT 현황판');
    } else if (perms['weekly-log']) {
        window.openApp('weekly-log', '주간 업무 일지');
    } else {
        // 권한이 모두 막혀있어도 첫 페이지를 띄우기 위해 권한이 있는 메뉴를 찾음 (13개 페이지 접근 권한 중에서만 검색)
        const pageKeys = ['dashboard-home', 'completion-report', 'project-status', 'workhours', 'weekly-log', 'product-cost', 'mfg-cost', 'ncr-dashboard', 'quality-report', 'collab', 'purchase', 'repair', 'simulation'];
        let fallbackKey = pageKeys.find(k => perms[k] === true);
        
        if(fallbackKey) {
            window.openApp(fallbackKey, window.availableApps[fallbackKey]?.title || '페이지');
        } else {
            // 모든 페이지 권한이 없는 경우 (예: 신규가입 직후, 권한 완전 박탈자)
            window.openApp('weekly-log', '주간 업무 일지'); 
        }
    }
};

export function initRouter() {
    window.navigateHome();
}
