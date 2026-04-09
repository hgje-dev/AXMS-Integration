import './firebase.js';
import './ui.js';
import './auth.js';
import './dashboard.js';
import './project.js';
import './request.js';
import './weekly.js';
import './simulation.js';

window.addEventListener('error', (e) => {
    console.error("🚨 문법 에러 발생 파일:", e.filename, "줄:", e.lineno, "메시지:", e.message);
});

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('dark-mode-icon');
        if(icon) icon.className = 'fa-solid fa-sun text-amber-400';
    }
    if (window.initAuthListeners) {
        window.initAuthListeners();
    } else {
        console.error("🚨 auth.js가 로드되지 않았습니다. 다른 파일에 문법 오류(SyntaxError)가 있는지 콘솔을 확인하세요.");
    }
});