import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let unsubscribeRequests=null;

window.openWriteModal = function() { window.editingReqId = null; document.getElementById('req-project-name').value = ''; document.getElementById('req-title').value = ''; document.getElementById('write-modal').classList.remove('hidden'); document.getElementById('write-modal').classList.add('flex'); };
window.closeWriteModal = function() { document.getElementById('write-modal').classList.add('hidden'); document.getElementById('write-modal').classList.remove('flex'); };
window.saveRequest = async function(btn) {
    const title = document.getElementById('req-title').value; if(!title) return window.showToast("제목을 입력하세요", "error");
    btn.disabled=true; btn.innerHTML='저장중...';
    try { const data = { type: window.currentAppId, status: 'pending', title: title, authorUid: window.currentUser.uid, authorName: window.userProfile.name, authorTeam: window.userProfile.team, updatedAt: serverTimestamp() }; if(window.editingReqId) { await setDoc(doc(db,"requests",window.editingReqId), data, {merge:true}); } else { data.createdAt = serverTimestamp(); await addDoc(collection(db,"requests"), data); } window.showToast("등록 완료"); window.closeWriteModal(); } catch(e) { window.showToast("에러", "error"); } finally { btn.disabled=false; btn.innerHTML='저장하기'; }
};

// 🌟 에러가 발생하던 정렬 로직 안전하게 수정
window.loadRequestsData = function(appId) { 
    if(unsubscribeRequests) unsubscribeRequests(); 
    unsubscribeRequests = onSnapshot(query(collection(db, "requests"), where("type", "==", appId)), (s) => { 
        window.currentRequestList=[]; s.forEach(d=>window.currentRequestList.push({id:d.id,...d.data()})); 
        window.currentRequestList.sort((a,b)=>{
            const timeA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        }); 
        if(window.renderRequestList) window.renderRequestList(); 
    }); 
};
window.renderRequestList = function() { const tb = document.getElementById('request-tbody'); if(!tb) return; if(window.currentRequestList.length===0) { tb.innerHTML='<tr><td colspan="6" class="text-center p-8">데이터 없음</td></tr>'; return; } tb.innerHTML = window.currentRequestList.map(r=>`<tr class="hover:bg-slate-50"><td class="p-4 font-bold text-indigo-700">${r.title}</td><td class="p-4 text-xs">${r.authorName}</td><td class="p-4"><button onclick="window.deleteRequest('${r.id}')" class="text-slate-400 hover:text-rose-500"><i class="fa-solid fa-trash-can"></i></button></td></tr>`).join(''); };
window.deleteRequest = async function(id) { if(confirm("삭제할까요?")){ await deleteDoc(doc(db,"requests",id)); window.showToast("삭제됨"); } };
