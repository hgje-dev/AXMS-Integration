import './firebase.js';
import './ui.js';
import './auth.js';
import './dashboard.js';
import './project.js';
import './request.js';
import './weekly.js';
import './simulation.js';
import './workhours.js';
import { initRouter } from './router.js';

// 알 수 없는 에러를 찾아주는 탐지기
window.addEventListener('error', (e) => {
    console.error("🚨 에러 발생:", e.filename, "줄:", e.lineno, "메시지:", e.message);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error("🚨 Promise 에러:", e.reason);
});

// 앱 초기화 함수
const initApp = () => {
    console.log("🚀 앱 초기화 시작...");
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('dark-mode-icon');
        if(icon) icon.className = 'fa-solid fa-sun text-amber-400';
    }
    
    // 로그인 감지 시스템 가동
    if (window.initAuthListeners) {
        window.initAuthListeners();
    } else {
        console.error("❌ initAuthListeners 함수를 찾을 수 없습니다.");
    }
    
    // 화면 라우터 초기화
    initRouter();
};

// 모듈 환경에 맞춘 완벽한 타이밍 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
