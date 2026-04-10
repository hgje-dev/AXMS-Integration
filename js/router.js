// js/router.js
const routes = {
    'dashboard-home': { url: './views/dashboard.html', init: () => { if(window.loadHomeDashboards) window.loadHomeDashboards(); } },
    'project-status-mfg': { url: './views/project.html', init: () => { window.currentProjPartTab = '제조'; if(window.loadProjectStatusData) window.loadProjectStatusData(); } },
    'project-status-opt': { url: './views/project.html', init: () => { window.currentProjPartTab = '광학'; if(window.loadProjectStatusData) window.loadProjectStatusData(); } },
    'weekly-log': { url: './views/weekly.html', init: () => { document.getElementById('weekly-log-filter-week').value = window.getWeekString(new Date()); if(window.loadWeeklyLogsData) window.loadWeeklyLogsData(); } },
    'simulation': { url: './views/simulation.html', init: () => { if(window.handleTypeChange) window.handleTypeChange(); if(window.setupAutoSaveTriggers) window.setupAutoSaveTriggers(); } },
   // js/router.js 안의 routes 부분 수정!
    
    // 🌟 새로 추가되는 투입공수 현황 라우트 (수정됨!)
    'workhours': { 
        url: './views/workhours.html', 
        init: () => { 
            // 뷰가 로드되면 현재 날짜 기준으로 주차 세팅하고 데이터 로드!
            const weekInput = document.getElementById('workhours-week-picker');
            if(weekInput) weekInput.value = window.getWeekString(new Date());
            if(window.loadWorkhoursData) window.loadWorkhoursData(); 
        } 
    },
    'collab': { url: './views/request.html', init: () => { window.currentAppId = 'collab'; if(window.loadRequestsData) window.loadRequestsData('collab'); } },
    'purchase': { url: './views/request.html', init: () => { window.currentAppId = 'purchase'; if(window.loadRequestsData) window.loadRequestsData('purchase'); } },
    'assembly': { url: './views/request.html', init: () => { window.currentAppId = 'assembly'; if(window.loadRequestsData) window.loadRequestsData('assembly'); } },
    'repair': { url: './views/request.html', init: () => { window.currentAppId = 'repair'; if(window.loadRequestsData) window.loadRequestsData('repair'); } }
};

window.openApp = async function(viewId, title) {
    if(window.toggleSidebar) window.toggleSidebar(false);
    let routeKey = viewId.replace('view-', '');
    
    // 권한 체크
    let permissionKey = routeKey;
    if (permissionKey.startsWith('project-status')) permissionKey = 'project-status';
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

window.navigateHome = function() { window.openApp('view-dashboard-home', '통합 대시보드 홈'); };

export function initRouter() {
    // 초기 화면 로드
    window.navigateHome();
}
