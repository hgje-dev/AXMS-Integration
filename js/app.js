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

window.addEventListener('error', (e) => {
    console.error("🚨 에러 발생:", e.filename, "줄:", e.lineno, "메시지:", e.message);
});

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('dark-mode-icon');
        if(icon) icon.className = 'fa-solid fa-sun text-amber-400';
    }
    
    if (window.initAuthListeners) {
        window.initAuthListeners();
    }
    
    // 라우터 초기화 (앱 시작 시 첫 화면 렌더링)
    initRouter();
});
