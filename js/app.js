import './firebase.js';
import './ui.js';
import './auth.js';
import './dashboard.js';
import './project.js';
import './request.js';
import './weekly.js';
import './simulation.js';
import './workhours.js';
import './completion-report.js';
import './product-cost.js';
import './ncr-dashboard.js';
import './quality-report.js';
import { initRouter } from './router.js';

window.addEventListener('error', (e) => {
    console.error("🚨 에러 발생:", e.filename, "줄:", e.lineno, "메시지:", e.message);
});

// 1. 초기화 함수를 따로 분리합니다.
const initApp = () => {
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('dark-mode-icon');
        if(icon) icon.className = 'fa-solid fa-sun text-amber-400';
    }
    
    // 로그인 성공 여부를 감지해 화면을 넘겨줍니다.
    if (window.initAuthListeners) {
        window.initAuthListeners();
    }
    
    initRouter();
    
    // 💡 추가됨: 퀵메뉴 렌더링 최초 1회 실행
    if (window.renderQuickMenu) {
        window.renderQuickMenu();
    }
};

// 2. 현재 화면 로딩 상태를 파악해서 즉시 실행할지, 조금 기다릴지 결정합니다.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // 이미 HTML 로딩이 끝났다면 즉시 실행!
    initApp();
}
