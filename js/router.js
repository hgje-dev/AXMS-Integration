/* eslint-disable */

export function initRouter() {
    // 뒤로가기/앞으로가기 브라우저 버튼 처리
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.appId) {
            loadView(event.state.appId, event.state.title, false);
        } else {
            window.navigateHome(false);
        }
    });

    // 최초 로드 시 무조건 홈 화면(대시보드)으로 세팅
    window.navigateHome(true);
}

// 💡 홈으로 가기 함수
window.navigateHome = (pushState = true) => {
    window.openApp('dashboard-home', '통합 대시보드', pushState);
};

// 💡 메뉴 클릭 시 앱(화면) 열기 함수
window.openApp = (appId, title, pushState = true) => {
    loadView(appId, title, pushState);
    if (window.toggleSidebar) {
        window.toggleSidebar(false); // 모바일에서 메뉴 누르면 사이드바 닫기
    }
};

// 💡 실제 HTML을 불러와서 화면에 꽂아주는 핵심 로직
async function loadView(appId, title, pushState) {
    try {
        // html 파일 가져오기
        const response = await fetch(`./views/${appId}.html`);
        if (!response.ok) throw new Error(`화면 파일을 찾을 수 없습니다: ${appId}.html`);
        const html = await response.text();

        // 화면에 삽입
        document.getElementById('app-content').innerHTML = html;
        
        // 상단 네비게이션 타이틀 변경
        const navTitle = document.getElementById('nav-title');
        if (navTitle) navTitle.innerText = title;

        // 주소창 URL 변경 (새로고침 없이)
        if (pushState) {
            window.history.pushState({ appId, title }, title, `?app=${appId}`);
        }

        // 전역 상태 업데이트 (어느 앱에 있는지 기록)
        window.currentAppId = appId; 

        // 🔥 각 메뉴별 전용 스크립트(데이터 불러오기) 실행 트리거
        if (appId === 'dashboard-home' && window.initDashboard) window.initDashboard();
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
            window.loadRequestsData(appId); // 요청서 공통 함수 호출
        }

        // 사이드바 버튼 활성화 색상 변경
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

// 💡 사이드바 메뉴 색상 하이라이트 함수
function updateSidebarActive(appId) {
    const navButtons = document.querySelectorAll('#sidebar nav button');
    navButtons.forEach(btn => {
        // 초기화
        btn.classList.remove('bg-slate-100');
        const iconContainer = btn.querySelector('div');
        
        // 아이콘 텍스트 색상 원래대로 복구
        if(iconContainer) {
            iconContainer.className = 'w-6 text-center text-slate-400 transition-colors group-hover:text-indigo-500';
            btn.className = btn.className.replace(/text-[a-z]+-600/g, 'text-slate-600');
        }

        // 현재 클릭한 메뉴 하이라이트 적용
        if (btn.getAttribute('onclick')?.includes(`'${appId}'`)) {
            btn.classList.add('bg-slate-100');
            
            // 메뉴별 색상 매핑
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

// 💡 모바일 사이드바 열고 닫기 함수
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
