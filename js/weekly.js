import { db } from './firebase.js';
import { collection, doc, setDoc, addDoc, deleteDoc, query, onSnapshot, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentWeeklyLogUnsubscribe=null;

window.openWeeklyLogWriteModal = function(id=null) { document.getElementById('weekly-id').value = id||''; document.getElementById('weekly-content').value = ''; document.getElementById('weekly-week').value = window.getWeekString?window.getWeekString(new Date()):''; document.getElementById('weekly-log-write-modal').classList.remove('hidden'); document.getElementById('weekly-log-write-modal').classList.add('flex'); };
window.closeWeeklyLogWriteModal = function() { document.getElementById('weekly-log-write-modal').classList.add('hidden'); document.getElementById('weekly-log-write-modal').classList.remove('flex'); };
window.saveWeeklyLog = async function() { 
    const id=document.getElementById('weekly-id').value, week=document.getElementById('weekly-week').value, content=document.getElementById('weekly-content').value.trim(); 
    if(!week||!content)return window.showToast("주차/내용 입력","error"); 
    try { 
        if(id) await setDoc(doc(db,"weekly_logs",id),{week,content,updatedAt:serverTimestamp()},{merge:true}); 
        else await addDoc(collection(db,"weekly_logs"),{week,content,authorUid:window.currentUser.uid,authorName:window.userProfile.name,createdAt:serverTimestamp()}); 
        
        if (content && window.processMentions) await window.processMentions(content, null, "주간업무일지");

        window.showToast("저장됨"); window.closeWeeklyLogWriteModal(); 
    } catch(e){} 
};

window.loadWeeklyLogsData = function() { 
    const w=document.getElementById('weekly-log-filter-week').value; if(!w)return; 
    if(currentWeeklyLogUnsubscribe) currentWeeklyLogUnsubscribe(); 
    currentWeeklyLogUnsubscribe = onSnapshot(query(collection(db,"weekly_logs"),where("week","==",w)), s=>{ 
        window.currentWeeklyLogList=[]; 
        s.forEach(d=>window.currentWeeklyLogList.push({id:d.id,...d.data()})); 
        window.currentWeeklyLogList.sort((a,b)=>{
            const timeA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        }); 
        if(window.renderWeeklyLogs) window.renderWeeklyLogs(); 
    }); 
};

window.renderWeeklyLogs = function() { 
    const g=document.getElementById('weekly-log-grid'); if(!g)return; 
    g.innerHTML=window.currentWeeklyLogList.map(l=> {
        const safeContent = window.formatMentions ? window.formatMentions(String(l.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')) : l.content;
        return `<div class="bg-white rounded-2xl border p-5 shadow-sm"><div class="flex justify-between mb-3"><span class="font-black text-xs">${l.authorName}</span><button onclick="window.deleteWeeklyLog('${l.id}')" class="text-rose-500"><i class="fa-solid fa-trash-can"></i></button></div><div class="text-sm whitespace-pre-wrap">${safeContent}</div></div>`;
    }).join(''); 
};
window.deleteWeeklyLog = async function(id) { if(confirm("삭제할까요?")){ await deleteDoc(doc(db,"weekly_logs",id)); window.showToast("삭제됨"); } };
