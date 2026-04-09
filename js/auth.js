import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allUsersUnsubscribe=null, teamMembersUnsubscribe=null;

window.checkLogin = async () => { 
    const e=document.getElementById('login-id')?.value.trim(); 
    const p=document.getElementById('login-pw')?.value.trim(); 
    const err=document.getElementById('login-error'); 
    if(!e||!p) { if(err) { err.innerText="이메일과 비밀번호를 입력하세요."; err.classList.remove('hidden'); } return; } 
    try { await signInWithEmailAndPassword(auth, e, p); } catch(er) { if(err) { err.innerText="정보가 일치하지 않습니다."; err.classList.remove('hidden'); } } 
};

window.signUp = async () => { 
    const n=document.getElementById('login-name')?.value.trim()||document.getElementById('signup-name')?.value.trim(); 
    const t=document.getElementById('login-team')?.value||document.getElementById('signup-dept')?.value; 
    const e=document.getElementById('login-id')?.value.trim()||document.getElementById('signup-id')?.value.trim(); 
    const p=document.getElementById('login-pw')?.value.trim()||document.getElementById('signup-pw')?.value.trim(); 
    const err=document.getElementById('login-error')||document.getElementById('signup-error'); 
    if(!n||!e||!p) { if(err){ err.innerHTML="모든 정보를 입력하세요."; err.classList.remove('hidden'); } return; } 
    if(p.length<6) { if(err){ err.innerHTML="비밀번호는 6자리 이상이어야 합니다."; err.classList.remove('hidden'); } return; } 
    try { 
        const uC = await createUserWithEmailAndPassword(auth, e, p); 
        await setDoc(doc(db, "users", uC.user.uid), { 
            email:e, name:n, team:t, department:t, role:'pending', 
            permissions:{ collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true } 
        }); 
        if(err){ err.innerHTML="가입 성공! 관리자 승인 대기 중입니다."; err.className="text-emerald-500 text-[11px] font-bold text-center mt-2 bg-emerald-50 p-3 rounded-xl border border-emerald-100 break-words"; err.classList.remove('hidden'); } 
        setTimeout(()=>window.logout(), 3000); 
    } catch(er) { 
        if(err){ err.innerHTML=er.code==='auth/email-already-in-use'?"이미 가입된 이메일입니다.":er.message; err.className="text-rose-500 text-[11px] font-bold text-center mt-2 bg-rose-50 p-3 rounded-xl border border-rose-100 break-words"; err.classList.remove('hidden'); } 
    } 
};

window.logout = async () => { await signOut(auth); location.reload(); };

window.initAuthListeners = () => {
    onAuthStateChanged(auth, async (u) => {
        if (u) {
            const uS = await getDoc(doc(db, "users", u.uid));
            if (uS.exists()) { 
                window.userProfile = uS.data(); 
                if(window.userProfile.role === 'pending') { 
                    const e = document.getElementById('login-error'); 
                    if(e) { e.innerHTML="관리자 승인 대기 중입니다."; e.classList.remove('hidden'); } 
                    await signOut(auth); return; 
                } 
            } 
            else { window.userProfile = { email: u.email, name: u.email.split('@')[0], team: '미지정', role: 'user', permissions: {} }; }
            
            if (!window.userProfile.permissions) window.userProfile.permissions = {}; 
            const dP = { collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true }; 
            for (let p in dP) { if (window.userProfile.permissions[p] === undefined) window.userProfile.permissions[p] = true; }
            
            window.currentUser = u;
            document.getElementById('login-modal')?.classList.add('hidden'); 
            const pt = document.getElementById('portal-container'); if(pt) { pt.classList.remove('hidden'); pt.classList.add('flex'); }
            
            if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText=window.userProfile.name; 
            if(document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText=window.userProfile.team||window.userProfile.department;
            
            const rB=document.getElementById('nav-role-badge'), bA=document.getElementById('btn-admin');
            if (window.userProfile.role==='admin') { if(rB){ rB.className='bg-purple-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='👑 관리자';} if(bA){ bA.classList.remove('hidden'); bA.classList.add('flex'); } } 
            else if (window.userProfile.role==='master') { if(rB){ rB.className='bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='🛠️ 마스터';} if(bA){ bA.classList.add('hidden'); } } 
            else { if(rB){ rB.className='bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText="👤 일반(" + window.userProfile.name + ")";} if(bA){ bA.classList.add('hidden'); } }
            
            if(allUsersUnsubscribe) allUsersUnsubscribe(); allUsersUnsubscribe=onSnapshot(collection(db,"users"), s=>{ window.allSystemUsers=[]; s.forEach(d=>window.allSystemUsers.push({uid:d.id,...d.data()})); if(document.getElementById('admin-modal')&&!document.getElementById('admin-modal').classList.contains('hidden') && window.renderAdminUsers) window.renderAdminUsers(); });
            if(teamMembersUnsubscribe) teamMembersUnsubscribe(); teamMembersUnsubscribe=onSnapshot(collection(db,"team_members"), s=>{ window.teamMembers=[]; s.forEach(d=>window.teamMembers.push({id:d.id,...d.data()})); if(window.populateUserDropdowns) window.populateUserDropdowns(); if(window.renderTeamMembers) window.renderTeamMembers(); if(!document.getElementById('view-dashboard-home')?.classList.contains('hidden') && window.processDashboardData) window.processDashboardData(); });
            
            if(window.loadProjectCodeMaster) window.loadProjectCodeMaster(); 
            if(window.loadCounts) window.loadCounts(); 
            if(window.navigateHome) window.navigateHome(); 
            if(window.loadMasterPresets) window.loadMasterPresets(); 
            if(window.loadAiApiSettingsToPanel) window.loadAiApiSettingsToPanel(); 
            if(window.updateAiApiUi) window.updateAiApiUi();
            if(window.loadSimilarProjectsList) setTimeout(() => window.loadSimilarProjectsList(), 1000); 
            window.showToast("환영합니다, " + window.userProfile.name + "님!");
        } else { 
            window.currentUser=null; document.getElementById('login-modal')?.classList.remove('hidden'); 
            const pt=document.getElementById('portal-container'); if(pt) { pt.classList.add('hidden'); pt.classList.remove('flex'); } 
        }
    });
};