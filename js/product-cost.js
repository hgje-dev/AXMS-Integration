/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, deleteDoc, query, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let pcUnsubscribe = null;
let pjtUnsubscribe = null;

window.pcReports = [];
window.pcProjects = {};
window.currentPcStatusFilter = 'all'; 

const PC_DRIVE_PARENT_FOLDER = "1ae5JiICk9ZQEaPVNhR6H4TlPs_Np03kQ"; 

window.initProductCost = function() {
    console.log("✅ Product Cost 페이지 로드 완료");
    if(window.initGoogleAPI) window.initGoogleAPI();
    
    if(pjtUnsubscribe) pjtUnsubscribe();
    pjtUnsubscribe = onSnapshot(collection(db, "projects_status"), snap => {
        window.pcProjects = {};
        snap.forEach(d => { window.pcProjects[d.id] = d.data(); });
        
        window.loadProductCostReports();
    });
};

window.loadProductCostReports = function() {
    if(pcUnsubscribe) pcUnsubscribe();
    
    pcUnsubscribe = onSnapshot(collection(db, "product_costs"), snap => {
        window.pcReports = [];
        snap.forEach(d => {
            let data = d.data();
            data.id = d.id;
            
            let pjt = window.pcProjects[data.projectId] || {};
            data.pjtCode = pjt.code || '-';
            data.pjtName = pjt.name || '알수없는 프로젝트';
            
            window.pcReports.push(data);
        });
        
        window.pcReports.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
        window.filterPcList();
    });
};

window.filterPcStatus = function(status) {
    window.currentPcStatusFilter = status;
    window.filterPcList();
};

window.filterPcList = function() {
    const search = document.getElementById('pc-search')?.value.toLowerCase() || '';
    
    let pending = 0, analyzing = 0, completed = 0;

    let filtered = window.pcReports.filter(r => {
        const stat = r.status || '대기중';
        if (stat === '대기중' || stat === '분석 대기') pending++;
        else if (stat === '분석중') analyzing++;
        else if (stat === '완료' || stat === '분석 완료') completed++;

        if (window.currentPcStatusFilter !== 'all') {
            let normFilter = window.currentPcStatusFilter;
            let normStat = stat;
            if(normStat === '분석 대기') normStat = '대기중';
            if(normStat === '분석 완료') normStat = '완료';
            if (normStat !== normFilter) return false;
        }

        if (search) {
            const str = `${r.pjtCode} ${r.pjtName}`.toLowerCase();
            if(!str.includes(search) && !(window.matchString && window.matchString(search, str))) return false;
        }
        
        return true;
    });

    if(document.getElementById('pc-dash-pending')) document.getElementById('pc-dash-pending').innerText = pending;
    if(document.getElementById('pc-dash-analyzing')) document.getElementById('pc-dash-analyzing').innerText = analyzing;
    if(document.getElementById('pc-dash-completed')) document.getElementById('pc-dash-completed').innerText = completed;

    window.renderPcList(filtered);
};

window.pcShowPjtAuto = function(input) {
    const val = input.value.trim().toLowerCase();
    let drop = document.getElementById('pc-pjt-autocomplete-dynamic');
    
    if (!drop) {
        drop = document.createElement('ul');
        drop.id = 'pc-pjt-autocomplete-dynamic';
        drop.className = 'fixed z-[99999] bg-white border border-emerald-200 shadow-xl rounded-xl max-h-48 overflow-y-auto text-sm min-w-[220px] custom-scrollbar py-1 mt-1';
        document.body.appendChild(drop);
    }

    if(!val) {
        drop.classList.add('hidden');
        return;
    }

    let searchPool = [];
    let seenCodes = new Set();

    if (window.pjtCodeMasterList) {
        window.pjtCodeMasterList.forEach(p => {
            if (p.code && !seenCodes.has(p.code)) {
                seenCodes.add(p.code);
                searchPool.push({code: p.code, name: p.name || ''});
            }
        });
    }

    (window.pcReports || []).forEach(d => {
        if (d.pjtCode && !seenCodes.has(d.pjtCode)) {
            seenCodes.add(d.pjtCode);
            searchPool.push({code: d.pjtCode, name: d.pjtName || ''}); 
        }
    });

    let matches = searchPool.filter(p => {
        return (window.matchString && window.matchString(val, p.code)) || (window.matchString && window.matchString(val, p.name));
    });

    if(matches.length > 0) {
        const rect = input.getBoundingClientRect();
        drop.style.left = `${rect.left}px`;
        drop.style.top = `${rect.bottom + 4}px`;
        drop.style.width = `${Math.max(rect.width, 280)}px`;

        drop.innerHTML = matches.map(m => {
            let sCode = m.code ? m.code.replace(/'/g,"\\'").replace(/"/g,'&quot;') : '-';
            let sName = m.name ? `<span class="text-[10px] text-slate-400 truncate w-full block mt-0.5">${m.name}</span>` : '';
            return `<li class="px-4 py-2 hover:bg-emerald-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex flex-col" onmousedown="window.pcSelectPjt('${sCode}')">
                        <span class="text-emerald-600 font-bold text-xs">${sCode}</span>${sName}
                    </li>`;
        }).join('');
        drop.classList.remove('hidden');
    } else {
        drop.classList.add('hidden');
    }
};

window.pcSelectPjt = function(code) {
    const input = document.getElementById('pc-search');
    if(input) { input.value = code; window.filterPcList(); }
    const drop = document.getElementById('pc-pjt-autocomplete-dynamic');
    if(drop) drop.classList.add('hidden');
};

document.addEventListener('click', function(e) {
    const drop = document.getElementById('pc-pjt-autocomplete-dynamic');
    if (drop && !drop.classList.contains('hidden') && !e.target.closest('#pc-search') && !e.target.closest('#pc-pjt-autocomplete-dynamic')) {
        drop.classList.add('hidden');
    }
});

window.renderPcList = function(list) {
    const tbody = document.getElementById('pc-tbody');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-400 font-bold bg-white">조건에 맞는 데이터가 없습니다.</td></tr>`;
        return;
    }

    const statusMap = {
        '대기중': '<span class="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-1 rounded shadow-sm">대기중</span>',
        '분석 대기': '<span class="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-1 rounded shadow-sm">대기중</span>',
        '분석중': '<span class="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded shadow-sm">분석중</span>',
        '완료': '<span class="bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded shadow-sm">✅ 완료</span>',
        '분석 완료': '<span class="bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded shadow-sm">✅ 완료</span>',
        '반려': '<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded shadow-sm">❌ 반려</span>',
        '재확인 요망': '<span class="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded shadow-sm">❌ 반려</span>'
    };

    tbody.innerHTML = list.map(r => {
        const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-';
        const compDateStr = ((r.status === '완료' || r.status === '분석 완료') && r.updatedAt) ? new Date(r.updatedAt).toLocaleDateString() : '-';
        
        let stat = r.status || '대기중';
        const target = parseFloat(r.targetCost) || 0;
        const actual = parseFloat(r.actualTotal) || 0;
        
        let mcRate = 0;
        if(target > 0) mcRate = (actual / target * 100).toFixed(1);
        
        const mcClass = mcRate > 100 ? 'text-rose-600 font-black' : (mcRate > 0 ? 'text-emerald-600 font-bold' : 'text-slate-400');

        let adminBtn = '';
        if (window.userProfile && window.userProfile.role === 'admin') {
            adminBtn = `<button onclick="event.stopPropagation(); window.deletePcReport('${r.id}')" class="bg-white border border-rose-200 hover:border-rose-400 hover:bg-rose-500 hover:text-white text-rose-400 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm ml-1" title="삭제"><i class="fa-solid fa-trash-can"></i></button>`;
        }

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 cursor-pointer" onclick="window.openPcModal('${r.id}')">
                <td class="p-3 text-center text-slate-500 font-medium">${dateStr}</td>
                <td class="p-3 text-center text-emerald-600 font-bold bg-emerald-50/20">${compDateStr}</td>
                <td class="p-3 text-center font-black text-indigo-700">${r.pjtCode}</td>
                <td class="p-3 font-bold text-slate-700 truncate max-w-[250px]">${r.pjtName}</td>
                <td class="p-3 text-right font-bold">${target.toLocaleString()}</td>
                <td class="p-3 text-right font-black text-emerald-700 bg-emerald-50/30">${actual.toLocaleString()}</td>
                <td class="p-3 text-center ${mcClass}">${mcRate}%</td>
                <td class="p-3 text-center text-[10px] font-bold">${statusMap[stat] || stat}</td>
                <td class="p-3 text-center" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-center">
                        <button onclick="window.openPcModal('${r.id}')" class="bg-white border border-slate-200 hover:border-emerald-300 hover:text-emerald-600 text-slate-500 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                            <i class="fa-solid fa-calculator"></i> 분석
                        </button>
                        ${adminBtn}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};

window.deletePcReport = async function(id) {
    if(!confirm("이 원가 분석 내역을 삭제하시겠습니까?\n(제조팀의 품질완료보고에는 영향을 주지 않습니다)")) return;
    try {
        await deleteDoc(doc(db, "product_costs", id));
        window.showToast("삭제되었습니다.", "success");
    } catch(e) {
        window.showToast("삭제 실패: " + e.message, "error");
    }
};

window.openPcModal = function(docId) {
    const report = window.pcReports.find(r => r.id === docId);
    if(!report) return;

    document.getElementById('pc-doc-id').value = docId;
    document.getElementById('pc-pjt-id').value = report.projectId;
    document.getElementById('pc-project-title').innerText = `[${report.pjtCode}] ${report.pjtName}`;
    document.getElementById('pc-project-date').innerText = `생성일자: ${new Date(report.createdAt).toLocaleDateString()}`;

    document.getElementById('pc-planned-cost').value = report.targetCost || '';
    document.getElementById('pc-actual-new').value = report.actualMaterial || '';
    document.getElementById('pc-actual-inv').value = report.actualProc || '';
    document.getElementById('pc-actual-fail').value = report.actualEtc || '';
    window.calcPcBudget();

    document.getElementById('pc-goodbad-tbody').innerHTML = '';
    if(report.pcLessons && report.pcLessons.length > 0) {
        report.pcLessons.forEach(l => window.addPcGoodBadRow(l));
    } else {
        window.addPcGoodBadRow(); 
    }

    document.getElementById('pc-performances-tbody').innerHTML = '';
    if(report.pcPerformances && report.pcPerformances.length > 0) {
        report.pcPerformances.forEach(p => window.addPcPerformanceRow(p));
    } else {
        window.addPcPerformanceRow();
    }

    document.getElementById('pc-comments').value = report.analysisComments || '';
    
    let currentStat = report.status || '대기중';
    if(currentStat === '분석 대기') currentStat = '대기중';
    if(currentStat === '분석 완료') currentStat = '완료';
    document.getElementById('pc-final-status').value = currentStat;

    document.getElementById('pc-files').value = '';
    document.getElementById('pc-file-names').innerText = '';
    
    const existContainer = document.getElementById('pc-existing-files');
    const filesArray = report.analysisFiles || [];
    
    if(filesArray.length === 0) {
        existContainer.innerHTML = '<span class="text-[10px] text-slate-400">첨부된 증빙 자료 없음</span>';
    } else {
        existContainer.innerHTML = filesArray.map(f => {
            let isImg = f.name && f.name.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i);
            if (isImg) {
                let fileIdMatch = f.url.match(/\/d\/(.+?)\/view/);
                let rawUrl = fileIdMatch ? `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}` : f.url;
                return `<div class="p-2 border border-slate-200 rounded-lg bg-white w-fit"><img src="${rawUrl}" alt="${f.name}" class="max-h-32 rounded cursor-pointer hover:opacity-80" onclick="window.openImageViewer('${rawUrl}')"></div>`;
            } else {
                return `<a href="${f.url}" target="_blank" class="text-xs text-emerald-600 font-bold underline flex items-center gap-1 bg-white border border-slate-200 p-2 rounded-lg hover:bg-slate-50 w-fit"><i class="fa-solid fa-file-invoice-dollar"></i> ${f.name}</a>`;
            }
        }).join('');
    }

    const badge = document.getElementById('pc-status-badge');
    if(currentStat === '완료') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-blue-100 text-blue-700 border-blue-200";
    else if(currentStat === '분석중') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-emerald-100 text-emerald-700 border-emerald-200";
    else if(currentStat === '반려') badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-rose-100 text-rose-700 border-rose-200";
    else badge.className = "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border bg-slate-100 text-slate-500 border-slate-200";
    badge.innerText = currentStat;

    document.getElementById('pc-detail-modal').classList.remove('hidden');
    document.getElementById('pc-detail-modal').classList.add('flex');
};

window.closePcModal = function() {
    document.getElementById('pc-detail-modal').classList.add('hidden');
    document.getElementById('pc-detail-modal').classList.remove('flex');
};

window.calcPcBudget = function() {
    const planned = parseFloat(document.getElementById('pc-planned-cost').value) || 0;
    const actNew = parseFloat(document.getElementById('pc-actual-new').value) || 0;
    const actInv = parseFloat(document.getElementById('pc-actual-inv').value) || 0;
    const actFail = parseFloat(document.getElementById('pc-actual-fail').value) || 0;
    
    const total = actNew + actInv + actFail;
    document.getElementById('pc-actual-total').innerText = total.toLocaleString();
    
    const rem = planned - total;
    const remEl = document.getElementById('pc-remaining-budget');
    remEl.innerText = rem.toLocaleString();
    if(rem < 0) remEl.classList.replace('text-blue-600', 'text-rose-600');
    else remEl.classList.replace('text-rose-600', 'text-blue-600');

    let mcRate = 0;
    if(planned > 0) mcRate = (total / planned * 100).toFixed(1);
    const mcEl = document.getElementById('pc-mc-rate');
    mcEl.innerText = mcRate;
    
    if(mcRate > 100) mcEl.parentNode.classList.replace('text-emerald-600', 'text-rose-600');
    else mcEl.parentNode.classList.replace('text-rose-600', 'text-emerald-600');
};

window.addPcGoodBadRow = function(data = null) {
    const tbody = document.getElementById('pc-goodbad-tbody');
    const tr = document.createElement('tr');
    tr.className = "pc-goodbad-row hover:bg-slate-50/50 transition-colors bg-white border-b border-slate-100";
    
    const catVal = data ? data.category : '원가절감';
    const itemVal = data ? data.item : '';
    const hlVal = data ? data.highlight : '';
    const llVal = data ? data.lowlight : '';

    tr.innerHTML = `
        <td class="p-2 border-r border-slate-100 align-top">
            <select class="pc-gb-category w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-700 outline-emerald-500 bg-slate-50 cursor-pointer">
                <option value="원가절감" ${catVal==='원가절감'?'selected':''}>원가절감</option>
                <option value="품질개선" ${catVal==='품질개선'?'selected':''}>품질개선</option>
                <option value="납기단축" ${catVal==='납기단축'?'selected':''}>납기단축</option>
                <option value="제작" ${catVal==='제작'?'selected':''}>제작</option>
            </select>
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <input type="text" class="pc-gb-item w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-emerald-500 bg-white" value="${itemVal}" placeholder="아이템명">
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <textarea class="pc-gb-high w-full border border-slate-300 rounded p-2 text-xs outline-emerald-500 custom-scrollbar resize-y min-h-[50px] bg-emerald-50/30 focus:bg-white" placeholder="잘된 점 (Highlight)">${hlVal}</textarea>
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <textarea class="pc-gb-low w-full border border-slate-300 rounded p-2 text-xs outline-rose-500 custom-scrollbar resize-y min-h-[50px] bg-rose-50/30 focus:bg-white" placeholder="아쉬운 점 (Lowlight)">${llVal}</textarea>
        </td>
        <td class="p-2 text-center align-middle">
            <button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-rose-500 transition-colors p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-rose-200 hover:bg-rose-50"><i class="fa-solid fa-trash-can"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.addPcPerformanceRow = function(data = null) {
    const tbody = document.getElementById('pc-performances-tbody');
    const tr = document.createElement('tr');
    tr.className = "pc-perf-row hover:bg-slate-50/50 transition-colors bg-white border-b border-slate-100";
    
    const catVal = data ? data.category : '원가절감';
    const itemVal = data ? data.item : '';
    const compVal = data ? data.company : '';
    const contVal = data ? data.content : '';
    const oldVal = data ? data.oldVal : '';
    const newVal = data ? data.newVal : '';
    const res1 = data ? data.amount : '0';
    const res2 = data ? data.cr : '0';

    tr.innerHTML = `
        <td class="p-2 border-r border-slate-100 align-top">
            <select class="pc-pf-category w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-700 outline-blue-500 bg-slate-50 cursor-pointer">
                <option value="원가절감" ${catVal==='원가절감'?'selected':''}>원가절감</option>
                <option value="품질개선" ${catVal==='품질개선'?'selected':''}>품질개선</option>
                <option value="제작" ${catVal==='제작'?'selected':''}>제작</option>
                <option value="기타" ${catVal==='기타'?'selected':''}>기타</option>
            </select>
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <input type="text" class="pc-pf-item w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-blue-500 bg-white" value="${itemVal}" placeholder="아이템">
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <input type="text" class="pc-pf-company w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-blue-500 bg-white" value="${compVal}" placeholder="업체명">
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <textarea class="pc-pf-content w-full border border-slate-300 rounded p-2 text-xs outline-blue-500 custom-scrollbar resize-y min-h-[40px] bg-slate-50 focus:bg-white" placeholder="진행내용">${contVal}</textarea>
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <input type="number" class="pc-pf-old w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-blue-500 bg-slate-50 focus:bg-white text-right font-bold" value="${oldVal}" oninput="window.calcPcPerformanceRow(this)" placeholder="0">
        </td>
        <td class="p-2 border-r border-slate-100 align-top">
            <input type="number" class="pc-pf-new w-full border border-slate-300 rounded px-2 py-1.5 text-xs outline-blue-500 bg-slate-50 focus:bg-white text-right font-bold" value="${newVal}" oninput="window.calcPcPerformanceRow(this)" placeholder="0">
        </td>
        <td class="p-2 border-r border-slate-100 align-middle text-right">
            <span class="pc-pf-amt font-black text-rose-500 text-sm">${res1}</span>
        </td>
        <td class="p-2 border-r border-slate-100 align-middle text-right">
            <span class="pc-pf-cr font-black text-indigo-600 text-sm">${res2}</span>
        </td>
        <td class="p-2 text-center align-middle">
            <button onclick="this.closest('tr').remove()" class="text-slate-300 hover:text-rose-500 transition-colors p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-rose-200 hover:bg-rose-50"><i class="fa-solid fa-trash-can"></i></button>
        </td>
    `;
    tbody.appendChild(tr);
};

window.calcPcPerformanceRow = function(inputEl) {
    const tr = inputEl.closest('tr');
    const oldVal = parseFloat(tr.querySelector('.pc-pf-old').value) || 0;
    const newVal = parseFloat(tr.querySelector('.pc-pf-new').value) || 0;
    const amtEl = tr.querySelector('.pc-pf-amt');
    const crEl = tr.querySelector('.pc-pf-cr');
    
    let amt = 0, cr = 0;
    if (oldVal !== 0 || newVal !== 0) {
        amt = oldVal - newVal;
        if(oldVal > 0) cr = (amt / oldVal * 100);
    }
    
    amtEl.innerText = amt.toLocaleString();
    crEl.innerText = cr.toFixed(1);
};

window.updatePcFileNames = function() {
    const inputEl = document.getElementById('pc-files');
    const displayEl = document.getElementById('pc-file-names');
    if (!displayEl) return;
    if (inputEl.files.length === 0) displayEl.innerHTML = '';
    else displayEl.innerHTML = inputEl.files.length === 1 ? inputEl.files[0].name : `${inputEl.files[0].name} 외 ${inputEl.files.length - 1}개`;
};

// 💡 [핵심 수정] 구글 드라이브 파일 업로드 에러 캐치 강화 및 supportsAllDrives 적용
async function pcUploadToDrive(file, folderName) {
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiryV2');
    if (!window.googleAccessToken || !storedExpiry || Date.now() > parseInt(storedExpiry)) {
        throw new Error("구글 인증 토큰이 만료되었습니다. 로그아웃 후 다시 연동해주세요.");
    }
    
    const q1 = `name='${encodeURIComponent(folderName.replace(/['\/\\]/g, '_'))}' and mimeType='application/vnd.google-apps.folder' and '${PC_DRIVE_PARENT_FOLDER}' in parents and trashed=false`;
    const r1 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q1}&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: {'Authorization': 'Bearer ' + window.googleAccessToken}});
    const d1 = await r1.json();
    if(d1.error) {
        if (d1.error.code === 401) throw new Error("TOKEN_EXPIRED");
        throw new Error(`[API 조회 에러] ${d1.error.message}`);
    }
    
    let pjtFid = (d1.files && d1.files.length > 0) ? d1.files[0].id : null;
    if(!pjtFid) {
        const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({name: folderName.replace(/['\/\\]/g, '_'), mimeType: 'application/vnd.google-apps.folder', parents: [PC_DRIVE_PARENT_FOLDER]})
        });
        const data = await res.json(); 
        if(data.error) throw new Error(`[API 생성 에러] ${data.error.message}`);
        pjtFid = data.id;
    }

    const q2 = `name='원가분석' and mimeType='application/vnd.google-apps.folder' and '${pjtFid}' in parents and trashed=false`;
    const r2 = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q2)}&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: {'Authorization': 'Bearer ' + window.googleAccessToken}});
    const d2 = await r2.json();
    if(d2.error) throw new Error(`[하위 폴더 조회 에러] ${d2.error.message}`);
    
    let pcFid = (d2.files && d2.files.length > 0) ? d2.files[0].id : null;
    if(!pcFid) {
        const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true', {
            method: 'POST', headers: {'Authorization': 'Bearer ' + window.googleAccessToken, 'Content-Type': 'application/json'},
            body: JSON.stringify({name: '원가분석', mimeType: 'application/vnd.google-apps.folder', parents: [pjtFid]})
        });
        const data = await res.json(); 
        if(data.error) throw new Error(`[하위 폴더 생성 에러] ${data.error.message}`);
        pcFid = data.id;
    }

    const metadata = { name: file.name, parents: [pcFid] };
    const form = new FormData(); form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); form.append('file', file);
    
    const progressModal = document.getElementById('upload-progress-modal');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');
    const progressSize = document.getElementById('upload-progress-size');
    
    if (progressModal) progressModal.classList.replace('hidden', 'flex');

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + window.googleAccessToken);
        
        xhr.upload.onprogress = function(e) {
            if (e.lengthComputable && progressBar) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const loadedMb = (e.loaded / (1024 * 1024)).toFixed(2);
                const totalMb = (e.total / (1024 * 1024)).toFixed(2);
                progressBar.style.width = percent + '%';
                if(progressText) progressText.innerText = percent + '%';
                if(progressSize) progressSize.innerText = `${loadedMb} MB / ${totalMb} MB`;
            }
        };

        xhr.onload = function() {
            if (progressModal) progressModal.classList.replace('flex', 'hidden');
            if (xhr.status >= 200 && xhr.status < 300) { 
                resolve(`https://drive.google.com/file/d/${JSON.parse(xhr.responseText).id}/view`); 
            } else { 
                reject(new Error(`업로드 실패 (HTTP ${xhr.status})`)); 
            }
        };
        xhr.onerror = () => {
            if (progressModal) progressModal.classList.replace('flex', 'hidden');
            reject(new Error("네트워크 오류"));
        }
        xhr.send(form);
    });
}

window.saveProductCostReport = async function() {
    const docId = document.getElementById('pc-doc-id').value;
    const report = window.pcReports.find(r => r.id === docId);
    if(!report) return;

    const btn = document.getElementById('btn-pc-save');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장중...';
    btn.disabled = true;

    try {
        let uploadedFiles = report.analysisFiles || [];
        const fileInput = document.getElementById('pc-files');
        
        if (fileInput.files.length > 0) {
            const folderName = report.pjtCode || report.pjtName;
            for(let i=0; i<fileInput.files.length; i++) {
                let url = await pcUploadToDrive(fileInput.files[i], folderName);
                uploadedFiles.push({ name: fileInput.files[i].name, url: url });
            }
        }

        const pcLessons = [];
        document.querySelectorAll('.pc-goodbad-row').forEach(tr => {
            pcLessons.push({
                category: tr.querySelector('.pc-gb-category').value,
                item: tr.querySelector('.pc-gb-item').value.trim(),
                highlight: tr.querySelector('.pc-gb-high').value.trim(),
                lowlight: tr.querySelector('.pc-gb-low').value.trim()
            });
        });

        const pcPerformances = [];
        document.querySelectorAll('.pc-perf-row').forEach(tr => {
            pcPerformances.push({
                category: tr.querySelector('.pc-pf-category').value,
                item: tr.querySelector('.pc-pf-item').value.trim(),
                company: tr.querySelector('.pc-pf-company').value.trim(),
                content: tr.querySelector('.pc-pf-content').value.trim(),
                oldVal: parseFloat(tr.querySelector('.pc-pf-old').value) || 0,
                newVal: parseFloat(tr.querySelector('.pc-pf-new').value) || 0,
                amount: parseFloat(tr.querySelector('.pc-pf-amt').innerText.replace(/,/g, '')) || 0,
                cr: parseFloat(tr.querySelector('.pc-pf-cr').innerText) || 0
            });
        });

        const m = parseFloat(document.getElementById('pc-actual-new').value) || 0;
        const p = parseFloat(document.getElementById('pc-actual-inv').value) || 0;
        const e = parseFloat(document.getElementById('pc-actual-fail').value) || 0;

        const payload = {
            targetCost: parseFloat(document.getElementById('pc-planned-cost').value) || 0,
            actualMaterial: m,
            actualProc: p,
            actualEtc: e,
            actualTotal: m + p + e,
            pcLessons: pcLessons,
            pcPerformances: pcPerformances,
            analysisComments: document.getElementById('pc-comments').value.trim(),
            status: document.getElementById('pc-final-status').value,
            analysisFiles: uploadedFiles,
            updatedAt: Date.now(),
            updatedBy: window.userProfile?.name || '구매팀'
        };

        await setDoc(doc(db, "product_costs", docId), payload, { merge: true });
        window.showToast("원가 분석 결과가 저장되었습니다.", "success");
        window.closePcModal();
    } catch(err) {
        window.showToast("저장 실패: " + err.message, "error");
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-check-double"></i> 분석 결과 저장';
        btn.disabled = false;
    }
};
