/* eslint-disable */
import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where } from '[https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js](https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js)';

let unsubscribeRequests = null;

window.openWriteModal = function() { 
    window.editingReqId = null; 
    const pName = document.getElementById('req-project-name');
    if (pName) pName.value = ''; 
    const tEl = document.getElementById('req-title');
    if (tEl) tEl.value = ''; 
    const wModal = document.getElementById('write-modal');
    if (wModal) {
        wModal.classList.remove('hidden'); 
        wModal.classList.add('flex'); 
    }
};

window.closeWriteModal = function() { 
    const wModal = document.getElementById('write-modal');
    if (wModal) {
        wModal.classList.add('hidden'); 
        wModal.classList.remove('flex'); 
    }
};

window.saveRequest = async function(btn) {
    const tEl = document.getElementById('req-title');
    const title = tEl ? tEl.value : ''; 
    
    if(!title) {
        if (window.showToast) window.showToast("제목을 입력하세요", "error");
        return;
    }
    
    if (btn) {
        btn.disabled = true; 
        btn.innerHTML = '저장중...';
    }
    
    try { 
        const data = { 
            type: window.currentAppId, 
            status: 'pending', 
            title: title, 
            authorUid: window.currentUser.uid, 
            authorName: window.userProfile.name, 
            authorTeam: window.userProfile.team, 
            updatedAt: Date.now() 
        }; 
        
        if (window.editingReqId) { 
            await setDoc(doc(db, "requests", window.editingReqId), data, {merge: true}); 
        } else { 
            data.createdAt = Date.now(); 
            await addDoc(collection(db, "requests"), data); 
        } 
        
        if(window.processMentions) await window.processMentions(title, null, "요청서"); 
        
        if (window.showToast) window.showToast("등록 완료"); 
        window.closeWriteModal(); 
    } catch(e) { 
        if (window.showToast) window.showToast("에러", "error"); 
    } finally { 
        if (btn) {
            btn.disabled = false; 
            btn.innerHTML = '저장하기'; 
        }
    }
};

window.loadRequestsData = function(appId) { 
    if(unsubscribeRequests) unsubscribeRequests(); 
    unsubscribeRequests = onSnapshot(query(collection(db, "requests"), where("type", "==", appId)), function(s) { 
        window.currentRequestList = []; 
        s.forEach(function(d) {
            window.currentRequestList.push(Object.assign({id: d.id}, d.data()));
        }); 
        
        window.currentRequestList.sort(function(a,b) {
            const timeA = a.createdAt || 0;
            const timeB = b.createdAt || 0;
            return timeB - timeA;
        }); 
        
        if(window.renderRequestList) window.renderRequestList(); 
    }); 
};

window.renderRequestList = function() { 
    const tb = document.getElementById('request-tbody'); 
    if(!tb) return; 
    
    if(window.currentRequestList.length === 0) { 
        tb.innerHTML = '<tr><td colspan="6" class="text-center p-8">데이터 없음</td></tr>'; 
        return; 
    } 
    
    tb.innerHTML = window.currentRequestList.map(function(r) {
        const safeTitle = window.formatMentions ? window.formatMentions(String(r.title||'').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : String(r.title||'').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<tr class="hover:bg-slate-50"><td class="p-4 font-bold text-indigo-700">' + safeTitle + '</td><td class="p-4 text-xs">' + (r.authorName || '') + '</td><td class="p-4"><button onclick="window.deleteRequest(\'' + r.id + '\')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td></tr>';
    }).join(''); 
};

window.deleteRequest = async function(id) { 
    if (confirm("삭제할까요?")) { 
        try {
            await deleteDoc(doc(db, "requests", id)); 
            if (window.showToast) window.showToast("삭제됨"); 
        } catch (e) {
            if (window.showToast) window.showToast("삭제 실패", "error");
        }
    } 
};
