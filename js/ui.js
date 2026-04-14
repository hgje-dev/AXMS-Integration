// ==========================================
// 💡 상단 퀵메뉴 관련 로직 (js/ui.js 하단부)
// ==========================================
window.availableApps = {
    'dashboard-home': { title: '대시보드', icon: 'fa-solid fa-chart-pie', color: 'text-indigo-600' },
    
    // 💡 [추가된 퀵 메뉴 아이템들]
    'completion-report': { title: '완료보고', icon: 'fa-solid fa-clipboard-check', color: 'text-indigo-500' },
    'project-status': { title: 'PJT현황', icon: 'fa-solid fa-table-list', color: 'text-slate-600' },
    'workhours': { title: '투입공수', icon: 'fa-solid fa-user-clock', color: 'text-slate-600' },
    'weekly-log': { title: '주간일지', icon: 'fa-solid fa-calendar-week', color: 'text-slate-600' },
    
    'product-cost': { title: 'Product Cost', icon: 'fa-solid fa-coins', color: 'text-emerald-500' },
    'ncr-dashboard': { title: 'NCR대시보드', icon: 'fa-solid fa-magnifying-glass-chart', color: 'text-rose-500' },
    
    'collab': { title: '협업/조립', icon: 'fa-regular fa-handshake', color: 'text-blue-600' },
    'purchase': { title: '구매의뢰', icon: 'fa-solid fa-cart-flatbed', color: 'text-emerald-600' },
    'repair': { title: '수리/점검', icon: 'fa-solid fa-stethoscope', color: 'text-rose-600' },
    'simulation': { title: '시뮬레이션', icon: 'fa-solid fa-bolt', color: 'text-amber-500' }
};

// ... 기존 renderQuickMenu 함수들은 동일 유지 ...
