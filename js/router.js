// js/router.js
const routes = {
    'dashboard-home': { url: './views/dashboard.html', init: () => { if(window.loadHomeDashboards) window.loadHomeDashboards(); } },
    'project-status-mfg': { url: './views/project.html', init: () => { window.currentProjPartTab = '제조'; if(window.loadProjectStatusData) window.loadProjectStatusData(); } },
    'project-status-opt': { url: './views/project.html', init: () => { window.currentProjPartTab = '광학'; if(window.loadProjectStatusData) window.loadProjectStatusData(); } },
    'weekly-log': { url: './views/weekly.html', init: () => { document.getElementById('weekly-log-filter-week').value = window.getWeekString(new Date()); if(window.loadWeeklyLogsData) window.loadWeeklyLogsData(); } },
    'simulation': { url: './views/simulation.html', init: () => { if(window.handleTypeChange) window.handleTypeChange(); if(window.setupAutoSaveTriggers) window.setupAutoSaveTriggers(); } },
    // 🌟 새로 추가되는 투입공수 현황 라우트
    'workhours': { url: './views/workhours.html', init: () => { console.log('투입공수 현황 화면 로드됨!'); /* 나중에 JS 로직 연결할 곳 */ } },
    
    // 각종 요청서들
    'collab': { url: './views/request.html', init: () => { window.currentAppId = 'collab'; if(window.loadRequestsData) window.loadRequestsData('collab'); } },
    'purchase': { url: './views/request.html', init: () => { window.currentAppId = 'purchase'; if(window.loadRequestsData) window.loadRequestsData('purchase'); } },
    'assembly': { url: './views/request.html', init: () => { window.currentAppId = 'assembly'; if(window.loadRequestsData) window.loadRequestsData('assembly'); } },
    'repair': { url: './views/request.html', init: () => { window.currentAppId = 'repair'; if(window.loadRequestsData) window.loadRequestsData('repair'); } }
};

window.openApp = async function(viewId, title) {
    if(window.toggleSidebar) window.toggleSidebar(false);

    let routeKey = viewId.replace('view-', '');
    
    // 1. 권한 체크 (기존 로직 유지)
    let permissionKey = routeKey;
    if (permissionKey.startsWith('project-status')) permissionKey = 'project-status';
    if (permissionKey !== 'dashboard-proj' && permissionKey !== 'simulation' && permissionKey !== 'workhours' && window.userProfile && window.userProfile.permissions && !window.userProfile.permissions[permissionKey]) {
        if(window.showToast) window.showToast("접근 권한이 없습니다.", "error"); 
        return;
    }

    // 2. 화면 세팅 준비
    const appContent = document.getElementById('app-content');
    if(document.getElementById('nav-title')) document.getElementById('nav-title').innerText = title;

    const route = routes[routeKey] || routes['dashboard-home'];

    // 3. fetch로 HTML 불러오기 (마법의 시작 ✨)
    try {
        // 로딩 스피너 표시
        appContent.innerHTML = '<div class="flex items-center justify-center h-[60vh] w-full"><div class="text-center text-slate-400 font-bold"><i class="fa-solid fa-spinner fa-spin text-5xl text-indigo-500 mb-4"></i><br>화면을 불러오는 중입니다...</div></div>';
        
        const response = await fetch(route.url);
        if (!response.ok) throw new Error('파일을 찾을 수 없습니다.');
        const htmlData = await response.text();
        
        // 가져온 HTML을 껍데기에 쏙!
        appContent.innerHTML = htmlData;
        
        // 4. HTML이 화면에 붙은 직후에 초기화 함수(데이터 로딩 등) 실행
        if (route.init) setTimeout(route.init, 50);

    } catch (error) {
        console.error('Error loading view:', error);
        appContent.innerHTML = `<div class="flex items-center justify-center h-[60vh] w-full"><div class="text-center p-10 bg-white rounded-2xl shadow-sm border border-rose-200 text-rose-500 font-bold"><i class="fa-solid fa-triangle-exclamation text-3xl mb-3"></i><br>화면을 불러오는데 실패했습니다.<br><span class="text-xs text-slate-400">${route.url} 파일을 확인해주세요.</span></div></div>`;
    }
};

// 기존의 navigateHome 덮어쓰기
window.navigateHome = function() {
    window.openApp('view-dashboard-home', '통합 대시보드 홈');
};
