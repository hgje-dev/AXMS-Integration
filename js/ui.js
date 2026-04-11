window.currentUser = null; window.userProfile = null; window.allSystemUsers = []; window.teamMembers = []; window.allDashProjects = []; window.allDashMdLogs = []; window.currentProjectStatusList = []; window.pjtCodeMasterList = []; window.currentRequestList = []; window.currentWeeklyLogList = []; window.currentProcessData = []; window.projectLogs = []; window.masterPresets = {}; window.projectCommentCounts = {}; window.projectIssueCounts = {}; window.projectLogCounts = {}; window.currentSelectedMembers = [];
window.currentProjDashView = 'list'; window.currentProjPartTab = '제조'; window.currentCategoryFilter = 'all'; window.currentReqView = 'list'; window.currentAppId = null; window.editingReqId = null; window.latestP50Md = 0; window.originalProjectName = ''; window.pendingSaveData = null; window.isProjectDirty = false; window.pendingAction = null; window.currentTab = 'hist'; window.latestHistData = null; window.latestTorData = null; window.theChart = null; window.dashChartObj = null; window.currentProjectId = null;

// 공통 날짜 및 유틸 함수
window.getTriangularRandom = (min, mode, max) => { let u=Math.random(); let F=(mode-min)/(max-min); return u<=F ? min+Math.sqrt(u*(max-min)*(mode-min)) : max-Math.sqrt((1-u)*(max-min)*(max-mode)); };
window.getNormalRandom = (mean, stdDev) => { let u1=Math.random(); if(u1===0) u1=0.0001; return (Math.sqrt(-2.0*Math.log(u1))*Math.cos(2.0*Math.PI*Math.random()))*stdDev + mean; };
window.getLocalDateStr = (d) => (!d||isNaN(d.getTime()))?"":d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0');
window.getDateTimeStr = (d) => (!d||isNaN(d.getTime()))?"":d.getFullYear().toString().slice(2)+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0')+" "+String(d.getHours()).padStart(2,'0')+":"+String(d.getMinutes()).padStart(2,'0');

window.getWeekString = function(d) { const date = new Date(d.getTime()); date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7)); const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1)); const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7); return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`; };
window.getDatesFromWeek = function(weekStr) { const [year, week] = weekStr.split('-W'); const d = new Date(year, 0, 1); const dayOffset = (d.getDay() <= 4 && d.getDay() !== 0) ? 1 : 8; const firstMonday = new Date(year, 0, d.getDate() - d.getDay() + dayOffset); const start = new Date(firstMonday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000); const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999); return { start, end }; };
window.getWeekNumberInMonth = function(dateObj) { const firstDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay(); return Math.ceil((dateObj.getDate() + (firstDay === 0 ? 6 : firstDay - 1)) / 7); };

const koreaHolidays = new Set(['2024-01-01','2024-03-01','2024-05-06','2024-12-25','2025-01-01','2025-05-05','2025-10-06','2025-12-25']); 
window.isWorkDay = (d) => { const el=document.getElementById('apply-holidays'); if(!el||!el.checked) return true; if(d.getDay()===0||d.getDay()===6) return false; return !koreaHolidays.has(window.getLocalDateStr(d)); };
window.calculateWorkDate = (s, d) => { let dt = new Date(s); if(isNaN(dt.getTime())) return new Date(); let a = 0; while(a<d) { dt.setDate(dt.getDate()+1); if(window.isWorkDay(dt)) a++; } return dt; };
window.getWorkingDays = (sStr, eStr) => { let s=new Date(sStr), e=new Date(eStr); if(isNaN(s)||isNaN(e)||s>e) return 0; let c=0, cur=new Date(s); while(cur<=e) { if(window.isWorkDay(cur)) c++; cur.setDate(cur.getDate()+1); } return c; };

window.showToast = (msg, type="success") => { 
    const c=document.getElementById('toast-container'); if(!c)return; 
    const t=document.createElement('div'); 
    t.className="toast text-white px-6 py-3 rounded-xl shadow-lg text-sm font-bold z-[9999] flex items-center gap-2 " + (type==="success"?"bg-emerald-600":"bg-rose-600"); 
    t.innerHTML=(type==="success"?'<i class="fa-solid fa-circle-check"></i> ':'<i class="fa-solid fa-triangle-exclamation"></i> ')+msg; 
    c.appendChild(t); 
    setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); },3000); 
};

window.addSystemLog = function(msg, type='system') { console.log(`[${type}] ${msg}`); };

window.getChosung = (str) => { const cho=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]; let res=""; for(let i=0; i<str.length; i++) { let c=str.charCodeAt(i)-44032; if(c>-1&&c<11172) res+=cho[Math.floor(c/588)]; else res+=str.charAt(i); } return res; };
window.matchString = (q, t) => { if(!q) return true; if(!t) return false; q=q.toLowerCase(); t=t.toLowerCase(); if(t.includes(q)) return true; if(window.getChosung(t).includes(q)) return true; return false; };

window.toggleDarkMode = () => { const h=document.documentElement, i=document.getElementById('dark-mode-icon'); if(h.classList.contains('dark')) { h.classList.remove('dark'); localStorage.setItem('color-theme', 'light'); if(i) i.className='fa-solid fa-moon'; } else { h.classList.add('dark'); localStorage.setItem('color-theme', 'dark'); if(i) i.className='fa-solid fa-sun text-amber-400'; } };
window.toggleSidebar = (fShow) => { const s=document.getElementById('sidebar'), b=document.getElementById('sidebar-backdrop'); if(!s||!b) return; if(fShow===true||s.classList.contains('-translate-x-full')) { s.classList.remove('-translate-x-full'); b.classList.remove('hidden'); } else { s.classList.add('-translate-x-full'); b.classList.add('hidden'); } };
window.toggleAuthMode = (mode) => { 
    if (mode==='signup') { 
        document.getElementById('signup-fields')?.classList.remove('hidden'); document.getElementById('action-buttons-login')?.classList.add('hidden'); document.getElementById('action-buttons-signup')?.classList.remove('hidden'); document.getElementById('login-view')?.classList.add('hidden'); document.getElementById('signup-view')?.classList.remove('hidden'); if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText='AXBIS 계정 생성'; document.getElementById('login-error')?.classList.add('hidden'); 
    } else { 
        document.getElementById('signup-fields')?.classList.add('hidden'); document.getElementById('action-buttons-login')?.classList.remove('hidden'); document.getElementById('action-buttons-signup')?.classList.add('hidden'); document.getElementById('login-view')?.classList.remove('hidden'); document.getElementById('signup-view')?.classList.add('hidden'); if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText='AXBIS Cloud 접속'; document.getElementById('signup-error')?.classList.add('hidden'); 
    } 
};
// 🌟 멘션 텍스트 파란색 변환 마법사 (전역 사용)
window.formatMentions = (text) => {
    if(!text) return '';
    return text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded shadow-sm border border-blue-200">@$1</span>');
};
