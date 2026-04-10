// js/router.js
const routes = {
    'dashboard-home': { url: './views/dashboard.html', init: () => { if(window.loadHomeDashboards) window.loadHomeDashboards(); } },
    
    // 🌟 제조, 광학 메뉴 1개로 통합됨!
    'project-status': { 
        url: './views/project.html', 
        init: () => { 
            // 탭 기본값 세팅 (처음 누를 땐 제조파트)
            if (!window.currentProjPartTab) window.currentProjPartTab = '제조'; 
            
            // UI 버튼 디자인 맞추기
            const btnMfg = document.getElementById('btn-part-mfg');
            const btnOpt = document.getElementById('btn-part-opt');
            if(btnMfg && btnOpt) {
                btnMfg.className = window.currentProjPartTab === '제조' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
                btnOpt.className = window.currentProjPartTab === '광학' ? "px-4 py-1.5 text-xs font-bold bg-white shadow-sm rounded-md text-indigo-700 transition-all" : "px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-md transition-all";
            }
            if(window.loadProjectStatusData) window.loadProjectStatusData(); 
        } 
    },
    
    'workhours': { url: './views/workhours.html', init: () => { const weekInput = document.getElementById('workhours-week-picker'); if(weekInput) weekInput.value = window.getWeekString(new Date()); if(window.loadWorkhoursData) window.loadWorkhoursData(); } },
    'weekly-log': { url: './views/weekly.html', init: () => { document.getElementById('weekly-log-filter-week').value = window.getWeekString(new Date()); if(window.loadWeeklyLogsData) window.loadWeeklyLogsData(); } },
    'simulation': { url: './views/simulation.html', init: () => { if(window.handleTypeChange) window.handleTypeChange(); if(window.setupAutoSaveTriggers) window.setupAutoSaveTriggers(); } },
    'collab': { url: './views/request.html', init: () => { window.currentAppId = 'collab'; if(window.loadRequestsData) window.loadRequestsData('collab'); } },
    'purchase': { url: './views/request.html', init: () => { window.currentAppId = 'purchase'; if(window.loadRequestsData) window.loadRequestsData('purchase'); } },
    'assembly': { url: './views/request.html', init: () => { window.currentAppId = 'assembly'; if(window.loadRequestsData) window.loadRequestsData('assembly'); } },
    'repair': { url: './views/request.html', init: () => { window.currentAppId = 'repair'; if(window.loadRequestsData) window.loadRequestsData('repair'); } }
};

window.openApp = async function(viewId, title) {
    if(window.toggleSidebar) window.toggleSidebar(false);
    let routeKey = viewId.replace('view-', '');
    
    let permissionKey = routeKey;
    if (permissionKey.startsWith('project-status')) permissionKey = 'project-status'; // 권한명 통일
    if (permissionKey !== 'dashboard-home' && permissionKey !== 'dashboard-proj' && permissionKey !== 'simulation' && permissionKey !== 'workhours' && window.userProfile && window.userProfile.permissions && !window.userProfile.permissions[permissionKey]) {
        if(window.showToast) window.showToast("접근 권한이 없습니다.", "error"); return;
    }

    const appContent = document.getElementById('app-content');
    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = title || '';

    const route = routes[routeKey] || routes['dashboard-home'];

    try {
        appContent.innerHTML = '<div class="flex items-center justify-center h-[60vh] w-full"><div class="text-center text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin text-5xl text-indigo-500 mb-4"></i><br>화면을 불러오는 중입니다...</div></div>';
        const response = await fetch(route.url);
        if (!response.ok) throw new Error('파일 로드 실패');
        const htmlData = await response.text();
        
        appContent.innerHTML = htmlData;
        if (route.init) setTimeout(route.init, 50);
    } catch (error) {
        console.error('라우팅 에러:', error);
        appContent.innerHTML = `<div class="text-center p-10 mt-10 bg-white rounded-2xl shadow-sm border border-rose-200 text-rose-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3"></i><br>화면을 불러오는데 실패했습니다. (${route.url})</div>`;
    }
};

window.navigateHome = function() { window.openApp('dashboard-home', '통합 대시보드 홈'); };

export function initRouter() {
    window.navigateHome();
}
