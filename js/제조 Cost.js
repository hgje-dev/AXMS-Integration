import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let mfgCostUnsubscribe = null;
window.allMfgCosts = [];
window.filteredMfgCosts = [];

window.initMfgCost = function() {
    console.log("✅ 제조 Cost 관리 페이지 초기화 완료");
    
    // 1. 현재 날짜를 기반으로 기본 필터 세팅
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const monthFilter = document.getElementById('mfg-cost-month-filter');
    if (monthFilter && !monthFilter.value) monthFilter.value = currentMonthStr;

    const dateInput = document.getElementById('new-mfg-date');
    if (dateInput && !dateInput.value) dateInput.value = window.getLocalDateStr(now);

    // 2. 마스터 데이터(PJT 코드)가 없으면 불러오기
    if (!window.pjtCodeMasterList || window.pjtCodeMasterList.length === 0) {
        if (window.loadProjectCodeMaster) window.loadProjectCodeMaster();
    }

    // 3. Firestore 데이터 실시간 구독
    loadMfgCostData();
};

function loadMfgCostData() {
    if (mfgCostUnsubscribe) mfgCostUnsubscribe();
    
    const q = query(collection(db, "mfg_costs"));
    
    mfgCostUnsubscribe = onSnapshot(q, (snapshot) => {
        window.allMfgCosts = [];
        snapshot.forEach(docSnap => {
            window.allMfgCosts.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        // 등록일 기준 최신순 정렬
        window.allMfgCosts.sort((a, b) => b.createdAt - a.createdAt);
        
        window.filterMfgCostData();
    }, (error) => {
        console.error("데이터 로드 실패:", error);
        window.showToast("데이터를 불러오는 중 오류가 발생했습니다.", "error");
    });
}

window.filterMfgCostData = function() {
    const partFilter = document.getElementById('mfg-cost-part-filter')?.value || 'all';
    const monthFilter = document.getElementById('mfg-cost-month-filter')?.value || '';
    const searchKeyword = document.getElementById('mfg-cost-search-pjt')?.value.toLowerCase() || '';

    window.filteredMfgCosts = window.allMfgCosts.filter(cost => {
        let match = true;

        if (partFilter !== 'all' && cost.part !== partFilter) match = false;
        if (monthFilter && cost.date && !cost.date.startsWith(monthFilter)) match = false;

        if (searchKeyword) {
            const targetStr = `${cost.pjtCode || ''} ${cost.pjtName || ''}`.toLowerCase();
            if (!targetStr.includes(searchKeyword) && !(window.matchString && window.matchString(searchKeyword, targetStr))) {
                match = false;
            }
        }

        return match;
    });

    renderMfgCostDashboard();
    renderMfgCostTable();
};

window.resetMfgCostFilters = function() {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    if(document.getElementById('mfg-cost-part-filter')) document.getElementById('mfg-cost-part-filter').value = 'all';
    if(document.getElementById('mfg-cost-month-filter')) document.getElementById('mfg-cost-month-filter').value = currentMonthStr;
    if(document.getElementById('mfg-cost-search-pjt')) document.getElementById('mfg-cost-search-pjt').value = '';
    
    window.filterMfgCostData();
};

function renderMfgCostDashboard() {
    let totalCost = 0;
    let pjtCostMap = {};
    
    window.filteredMfgCosts.forEach(cost => {
        const amt = parseFloat(cost.amount) || 0;
        totalCost += amt;
        
        const pjtKey = cost.pjtCode ? `[${cost.pjtCode}] ${cost.pjtName||''}` : '미지정';
        pjtCostMap[pjtKey] = (pjtCostMap[pjtKey] || 0) + amt;
    });

    let topPjt = '-';
    let topPjtCost = 0;
    for (const [pjt, cost] of Object.entries(pjtCostMap)) {
        if (cost > topPjtCost) {
            topPjtCost = cost;
            topPjt = pjt;
        }
    }

    const totalCount = window.filteredMfgCosts.length;
    const avgCost = totalCount > 0 ? Math.round(totalCost / totalCount) : 0;

    if(document.getElementById('mfg-dash-total-cost')) document.getElementById('mfg-dash-total-cost').innerText = totalCost.toLocaleString();
    if(document.getElementById('mfg-dash-top-pjt')) document.getElementById('mfg-dash-top-pjt').innerText = topPjt;
    if(document.getElementById('mfg-dash-top-cost')) document.getElementById('mfg-dash-top-cost').innerText = topPjtCost.toLocaleString();
    if(document.getElementById('mfg-dash-total-count')) document.getElementById('mfg-dash-total-count').innerText = totalCount.toLocaleString();
    if(document.getElementById('mfg-dash-avg-cost')) document.getElementById('mfg-dash-avg-cost').innerText = avgCost.toLocaleString();

    if(document.getElementById('mfg-table-total-cost')) document.getElementById('mfg-table-total-cost').innerText = totalCost.toLocaleString();
    
    const searchPjt = document.getElementById('mfg-cost-search-pjt')?.value;
    const tableLabel = document.getElementById('mfg-table-pjt-label');
    if (tableLabel) {
        tableLabel.innerText = searchPjt ? `(${searchPjt})` : '';
    }
}

function renderMfgCostTable() {
    const tbody = document.getElementById('mfg-cost-tbody');
    if (!tbody) return;

    if (window.filteredMfgCosts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-slate-400 font-bold">해당 조건의 지출 내역이 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    window.filteredMfgCosts.forEach(cost => {
        const amtStr = (parseFloat(cost.amount) || 0).toLocaleString();
        
        let deleteBtnHtml = '';
        if (window.currentUser && (cost.authorUid === window.currentUser.uid || window.userProfile?.role === 'admin')) {
            deleteBtnHtml = `<button onclick="window.deleteMfgCost('${cost.id}')" class="text-slate-300 hover:text-rose-500 transition-colors p-1" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
        } else {
            deleteBtnHtml = `<span class="text-slate-200" title="권한 없음"><i class="fa-solid fa-lock"></i></span>`;
        }

        html += `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-3 text-center font-bold text-slate-500">${cost.date || '-'}</td>
            <td class="p-3 text-center font-bold text-indigo-600">${cost.pjtCode || '-'}</td>
            <td class="p-3 text-center"><span class="bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold">${cost.category || '-'}</span></td>
            <td class="p-3 font-bold text-slate-700">${cost.itemName || '-'}</td>
            <td class="p-3 text-center font-bold text-slate-500">${cost.qty || '-'}</td>
            <td class="p-3 text-right font-black text-blue-600 pr-6">${amtStr}</td>
            <td class="p-3 text-slate-500 font-medium truncate max-w-[200px]" title="${cost.memo || ''}">${cost.memo || '-'}</td>
            <td class="p-3 text-center">${deleteBtnHtml}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

window.saveMfgCost = async function() {
    const dateEl = document.getElementById('new-mfg-date');
    const pjtCodeEl = document.getElementById('new-mfg-pjt');
    const pjtNameEl = document.getElementById('new-mfg-pjt-name');
    const catEl = document.getElementById('new-mfg-category');
    const itemEl = document.getElementById('new-mfg-item');
    const qtyEl = document.getElementById('new-mfg-qty');
    const amtEl = document.getElementById('new-mfg-amount');
    const memoEl = document.getElementById('new-mfg-memo');

    if (!dateEl.value || !itemEl.value || !amtEl.value) {
        return window.showToast("지출일, 품목명, 금액은 필수 입력 항목입니다.", "error");
    }

    let pjtPart = '제조'; 
    if (pjtCodeEl.value && window.currentProjectStatusList) {
        const matchedPjt = window.currentProjectStatusList.find(p => p.code === pjtCodeEl.value);
        if (matchedPjt && matchedPjt.part) pjtPart = matchedPjt.part;
    }

    const payload = {
        date: dateEl.value,
        pjtCode: pjtCodeEl.value.trim(),
        pjtName: pjtNameEl.value.trim(),
        category: catEl.value,
        itemName: itemEl.value.trim(),
        qty: qtyEl.value.trim(),
        amount: parseFloat(amtEl.value) || 0,
        memo: memoEl.value.trim(),
        part: pjtPart,
        authorUid: window.currentUser.uid,
        authorName: window.userProfile.name,
        createdAt: Date.now()
    };

    try {
        await addDoc(collection(db, "mfg_costs"), payload);
        window.showToast("지출 내역이 등록되었습니다.");
        
        itemEl.value = '';
        qtyEl.value = '';
        amtEl.value = '';
        memoEl.value = '';
        itemEl.focus();

    } catch(e) {
        console.error(e);
        window.showToast("등록 실패", "error");
    }
};

window.deleteMfgCost = async function(id) {
    if (!confirm("이 지출 내역을 삭제하시겠습니까?")) return;
    try {
        await deleteDoc(doc(db, "mfg_costs", id));
        window.showToast("삭제되었습니다.");
    } catch(e) {
        window.showToast("삭제 실패", "error");
    }
};

// ==========================================
// 💡 프로젝트 초성 검색 및 자동완성 로직 (스크롤 개선형 동적 렌더링)
// ==========================================

function getCombinedPjtPool() {
    let pool = [];
    let seenCodes = new Set();

    (window.pjtCodeMasterList || []).forEach(p => {
        if (p.code && !seenCodes.has(p.code)) {
            seenCodes.add(p.code);
            pool.push(p);
        }
    });
    
    (window.currentProjectStatusList || []).forEach(p => {
        if (p.code && !seenCodes.has(p.code)) {
            seenCodes.add(p.code);
            pool.push({ code: p.code, name: p.name });
        }
    });
    
    return pool;
}

// 📌 상단 필터 전용 자동완성
window.mfgCostShowPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    let drop = document.getElementById('mfg-cost-pjt-autocomplete-dynamic');
    
    // fixed 속성으로 body에 추가하여 상위 컨테이너에 의해 잘리지 않도록 구현
    if (!drop) {
        drop = document.createElement('ul');
        drop.id = 'mfg-cost-pjt-autocomplete-dynamic';
        drop.className = 'fixed z-[99999] bg-white border border-amber-200 shadow-xl rounded-2xl max-h-60 overflow-y-auto text-sm custom-scrollbar py-2';
        document.body.appendChild(drop);
    }

    if(!val) { 
        drop.classList.add('hidden'); 
        return; 
    }

    let searchPool = getCombinedPjtPool();
    let matches = searchPool.filter(p => {
        let code = (p.code || '').toLowerCase();
        let name = (p.name || '').toLowerCase();
        return code.includes(val) || name.includes(val) || 
               (window.matchString && window.matchString(val, p.code)) || 
               (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.left = `${rect.left}px`;
        drop.style.top = `${rect.bottom + 4}px`;
        drop.style.width = `${rect.width}px`;

        drop.innerHTML = matches.map(m => {
            let sName = m.name ? m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '';
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            return `<li class="px-4 py-2.5 hover:bg-amber-50 cursor-pointer text-xs font-bold text-slate-700 border-b border-slate-50 last:border-0 transition-colors flex items-center gap-2" onmousedown="window.mfgCostSelectPjtFilter('${sCode}')">
                <span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black shrink-0">[${sCode}]</span>
                <span class="truncate flex-1">${sName}</span>
            </li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.mfgCostSelectPjtFilter = function(code) {
    const input = document.getElementById('mfg-cost-search-pjt');
    if(input) {
        input.value = code; 
        window.filterMfgCostData();
    }
    const drop = document.getElementById('mfg-cost-pjt-autocomplete-dynamic');
    if (drop) drop.classList.add('hidden');
};

// 📌 테이블 내부 신규 입력 폼 전용 자동완성
window.mfgCostShowInputPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    let drop = document.getElementById('mfg-input-pjt-autocomplete-dynamic');
    
    // 테이블 내부의 가로 스크롤 레이아웃을 회피하기 위해 body에 종속
    if (!drop) {
        drop = document.createElement('ul');
        drop.id = 'mfg-input-pjt-autocomplete-dynamic';
        drop.className = 'fixed z-[99999] bg-white border border-indigo-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm min-w-[200px] custom-scrollbar py-1';
        document.body.appendChild(drop);
    }

    document.getElementById('new-mfg-pjt-name').value = '';

    if(!val) { 
        drop.classList.add('hidden'); 
        return; 
    }

    let searchPool = getCombinedPjtPool();
    let matches = searchPool.filter(p => {
        let code = (p.code || '').toLowerCase();
        let name = (p.name || '').toLowerCase();
        return code.includes(val) || name.includes(val) || 
               (window.matchString && window.matchString(val, p.code)) || 
               (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.left = `${rect.left}px`;
        drop.style.top = `${rect.bottom + 4}px`;
        drop.style.width = `${Math.max(rect.width, 250)}px`;

        drop.innerHTML = matches.map(m => {
            let sName = m.name ? m.name.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '';
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            return `<li class="px-3 py-2 hover:bg-indigo-50 cursor-pointer text-xs font-bold text-slate-700 border-b border-slate-50 transition-colors flex flex-col gap-0.5" onmousedown="window.mfgCostSelectInputPjt('${sCode}', '${sName}')">
                <span class="text-indigo-600 font-black">${sCode}</span>
                <span class="truncate text-[10px] font-medium text-slate-500">${sName}</span>
            </li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.mfgCostSelectInputPjt = function(code, name) {
    document.getElementById('new-mfg-pjt').value = code; 
    document.getElementById('new-mfg-pjt-name').value = name; 
    
    const drop = document.getElementById('mfg-input-pjt-autocomplete-dynamic');
    if (drop) drop.classList.add('hidden');
    
    document.getElementById('new-mfg-category').focus();
};

// 📌 팝업 바깥 영역 클릭 시 동적 드롭다운 닫기 처리
document.addEventListener('click', function(e) {
    const d1 = document.getElementById('mfg-cost-pjt-autocomplete-dynamic');
    const d2 = document.getElementById('mfg-input-pjt-autocomplete-dynamic');
    
    if (d1 && !d1.classList.contains('hidden') && !e.target.closest('#mfg-cost-pjt-autocomplete-dynamic') && e.target.id !== 'mfg-cost-search-pjt') {
        d1.classList.add('hidden');
    }
    if (d2 && !d2.classList.contains('hidden') && !e.target.closest('#mfg-input-pjt-autocomplete-dynamic') && e.target.id !== 'new-mfg-pjt') {
        d2.classList.add('hidden');
    }
});
