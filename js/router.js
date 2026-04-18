/* eslint-disable */

export function initRouter() {
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.appId) {
            loadView(event.state.appId, event.state.title, false);
        } else {
            window.navigateHome(false);
        }
    });

    window.navigateHome(true);
}

window.navigateHome = (pushState = true) => {
    window.openApp('dashboard-home', '통합 대시보드', pushState);
};

window.openApp = (appId, title, pushState = true) => {
    loadView(appId, title, pushState);
    if (window.toggleSidebar) {
        window.toggleSidebar(false); 
    }
};

async function loadView(appId, title, pushState) {
    try {
        // 💡 [핵심 해결] 메뉴 ID와 실제 파일명을 연결해주는 연결고리!
        let fileName = appId;
        if (appId === 'dashboard-home') fileName = 'dashboard';
        else if (appId === 'project-status') fileName = 'project';
        else if (appId === 'weekly-log') fileName = 'weekly';
        else if (appId === 'collab' || appId === 'purchase' || appId === 'repair') fileName = 'request';

        // html 파일 가져오기
        const response = await fetch(`./views/${fileName}.html`);
        if (!response.ok) throw new Error(`화면 파일을 찾을 수 없습니다: ${fileName}.html`);
        const html = await response.text();

        // 화면에 삽입
        document.getElementById('app-content').innerHTML = html;
        
        // 상단 네비게이션 타이틀 변경
        const navTitle = document.getElementById('nav-title');
        if (navTitle) navTitle.innerText = title;

        // 주소창 URL 변경
        if (pushState) {
            window.history.pushState({ appId, title }, title, `?app=${appId}`);
        }

        window.currentAppId = appId; 

        // 💡 각 메뉴별 데이터 불러오기 함수 실행
        if (appId === 'dashboard-home' && window.loadHomeDashboards) window.loadHomeDashboards();
        else if (appId === 'project-status' && window.loadProjectStatusData) window.loadProjectStatusData();
        else if (appId === 'weekly-log' && window.loadWeeklyLogsData) window.loadWeeklyLogsData();
        else if (appId === 'workhours' && window.loadWorkhoursData) window.loadWorkhoursData();
        else if (appId === 'quality-report' && window.initQualityReport) window.initQualityReport();
        else if (appId === 'product-cost' && window.initProductCost) window.initProductCost();
        else if (appId === 'ncr-dashboard' && window.initNcrDashboard) window.initNcrDashboard();
        else if (appId === 'mfg-cost' && window.initMfgCost) window.initMfgCost();
        else if (appId === 'completion-report' && window.initCompletionReport) window.initCompletionReport();
        else if (appId === 'simulation' && window.initSimulation) window.initSimulation();
        else if (['collab', 'purchase', 'repair'].includes(appId) && window.loadRequestsData) {
            window.loadRequestsData(appId);
        }

        updateSidebarActive(appId);

    } catch (error) {
        console.error("🚨 라우팅 에러:", error);
        document.getElementById('app-content').innerHTML = `
            <div class="flex flex-col items-center justify-center h-[60vh] text-slate-500">
                <i class="fa-solid fa-triangle-exclamation text-5xl mb-4 text-rose-400"></i>
                <h2 class="text-xl font-bold">화면을 불러올 수 없습니다.</h2>
                <p class="mt-2 text-sm text-slate-400">${error.message}</p>
            </div>
        `;
    }
}

function updateSidebarActive(appId) {
    const navButtons = document.querySelectorAll('#sidebar nav button');
    navButtons.forEach(btn => {
        btn.classList.remove('bg-slate-100');
        const iconContainer = btn.querySelector('div');
        
        if(iconContainer) {
            iconContainer.className = 'w-6 text-center text-slate-400 transition-colors group-hover:text-indigo-500';
            btn.className = btn.className.replace(/text-[a-z]+-600/g, 'text-slate-600');
        }

        if (btn.getAttribute('onclick')?.includes(`'${appId}'`)) {
            btn.classList.add('bg-slate-100');
            
            if (appId === 'product-cost' || appId === 'purchase') {
                btn.classList.replace('text-slate-600', 'text-emerald-600');
                if(iconContainer) iconContainer.className = 'w-6 text-center text-emerald-500';
            } else if (appId === 'mfg-cost' || appId === 'quality-report' || appId === 'ncr-dashboard' || appId === 'repair') {
                btn.classList.replace('text-slate-600', 'text-rose-600');
                if(iconContainer) iconContainer.className = 'w-6 text-center text-rose-500';
            } else if (appId === 'collab') {
                btn.classList.replace('text-slate-600', 'text-blue-600');
                if(iconContainer) iconContainer.className = 'w-6 text-center text-blue-500';
            } else {
                btn.classList.replace('text-slate-600', 'text-indigo-600');
                if(iconContainer) iconContainer.className = 'w-6 text-center text-indigo-500';
            }
        }
    });
}

window.toggleSidebar = (show) => {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar || !backdrop) return;

    if (show) {
        sidebar.classList.remove('-translate-x-full');
        backdrop.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        backdrop.classList.add('hidden');
    }
};
