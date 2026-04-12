/* eslint-disable */
import { auth, db } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allUsersUnsubscribe=null, teamMembersUnsubscribe=null;

window.checkLogin = async () => { 
    const e = document.getElementById('login-id')?.value.trim(); 
    const p = document.getElementById('login-pw')?.value.trim(); 
    const err = document.getElementById('login-error'); 
    
    // 클릭한 버튼 찾기 (로딩 상태 표시용)
    const btn = document.querySelector('button[onclick="window.checkLogin()"]');

    if(err) err.classList.add('hidden'); // 에러 리셋

    if(!e || !p) { 
        if(err) { err.innerText="이메일과 비밀번호를 입력하세요."; err.classList.remove('hidden'); } 
        return; 
    } 

    if(btn) { btn.innerText = "서버와 통신 중..."; btn.disabled = true; }

    try { 
        await signInWithEmailAndPassword(auth, e, p); 
        console.log("✅ 로그인 성공");
    } catch(er) { 
        console.error("❌ 로그인 실패:", er);
        if(err) { 
            err.innerText = "계정 정보가 일치하지 않습니다. (아래 신규 계정 생성을 먼저 진행해주세요!)"; 
            err.classList.remove('hidden'); 
        } 
    } finally {
        if(btn) { btn.innerText = "접속하기"; btn.disabled = false; }
    }
};

window.signUp = async () => { 
    const n = document.getElementById('login-name')?.value.trim() || document.getElementById('signup-name')?.value.trim(); 
    const t = document.getElementById('login-team')?.value || document.getElementById('signup-dept')?.value; 
    const e = document.getElementById('login-id')?.value.trim() || document.getElementById('signup-id')?.value.trim(); 
    const p = document.getElementById('login-pw')?.value.trim() || document.getElementById('signup-pw')?.value.trim(); 
    const err = document.getElementById('login-error') || document.getElementById('signup-error'); 
    
    const btn = document.querySelector('button[onclick="window.signUp()"]');
    
    if(!n || !e || !p) { if(err){ err.innerHTML="모든 정보를 입력하세요."; err.classList.remove('hidden'); } return; } 
    if(p.length < 6) { if(err){ err.innerHTML="비밀번호는 6자리 이상이어야 합니다."; err.classList.remove('hidden'); } return; } 
    
    if(btn) { btn.innerText = "가입 처리 중..."; btn.disabled = true; }

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
    } finally {
        if(btn) { btn.innerText = "가입 완료"; btn.disabled = false; }
    }
};

window.logout = async () => { await signOut(auth); location.reload(); };

window.initAuthListeners = () => {
    console.log("📡 로그인 상태 감지기 실행됨");
    onAuthStateChanged(auth, async (u) => {
        if (u) {
            try {
                const uS = await getDoc(doc(db, "users", u.uid));
                if (uS.exists()) { 
                    window.userProfile = uS.data(); 
                    if(window.userProfile.role === 'pending') { 
                        const e = document.getElementById('login-error'); 
                        if(e) { e.innerHTML="가입은 완료되었으나, 관리자 승인 대기 중입니다."; e.classList.remove('hidden'); } 
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
                if(window.loadNotifications) window.loadNotifications();
                if(window.navigateHome) window.navigateHome(); 
                
                if(window.showToast) window.showToast("환영합니다, " + window.userProfile.name + "님!");
            } catch(firestoreError) {
                console.error("데이터베이스 읽기 에러:", firestoreError);
            }
        } else { 
            window.currentUser=null; document.getElementById('login-modal')?.classList.remove('hidden'); 
            const pt=document.getElementById('portal-container'); if(pt) { pt.classList.add('hidden'); pt.classList.remove('flex'); } 
        }
    });
};

window.openAdminModal = () => { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('admin-modal').classList.add('flex'); window.renderAdminUsers(); };
window.closeAdminModal = () => { document.getElementById('admin-modal').classList.add('hidden'); document.getElementById('admin-modal').classList.remove('flex'); };
window.renderAdminUsers = () => {
    const tb = document.getElementById('admin-users-tbody'); if (!tb) return;
    if (window.allSystemUsers.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-slate-500 font-bold">등록된 사용자가 없습니다.</td></tr>'; return; }
    let sortedUsers = [...window.allSystemUsers].sort((a, b) => { if (a.role === 'pending' && b.role !== 'pending') return -1; if (a.role !== 'pending' && b.role === 'pending') return 1; return 0; });
    let html = '';
    sortedUsers.forEach(u => {
        const p = u.permissions || {}; const isP = u.role === 'pending';
        html += `<tr class="hover:bg-slate-50 transition-colors ${isP ? 'bg-amber-50/50' : ''}"><td class="p-3 text-center font-bold text-slate-700">${u.name}</td><td class="p-3 text-center text-slate-600">${u.team || u.department || ''}</td><td class="p-3 text-center text-slate-500">${u.email}</td><td class="p-3 text-center"><select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-amber-600' : 'text-slate-600'}" onchange="window.updateUserRole('${u.uid}', this.value)"><option value="pending" ${u.role === 'pending' ? 'selected' : ''}>승인 대기</option><option value="user" ${u.role === 'user' ? 'selected' : ''}>일반 사용자</option><option value="master" ${u.role === 'master' ? 'selected' : ''}>마스터</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>시스템 관리자</option></select></td><td class="p-3"><div class="flex flex-wrap gap-3 justify-center"><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.collab ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','collab',this.checked)">협업</label><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.purchase ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','purchase',this.checked)">구매</label><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.assembly ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','assembly',this.checked)">조립</label><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.repair ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','repair',this.checked)">수리/점검</label><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p['project-status'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','project-status',this.checked)">PJT현황판</label><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p['weekly-log'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','weekly-log',this.checked)">주간업무</label></div></td><td class="p-3 text-center"><div class="flex items-center justify-center gap-1">${isP ? `<button onclick="window.updateUserRole('${u.uid}', 'user')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm transition-colors whitespace-nowrap">승인하기</button>` : ''}<button onclick="window.deleteUser('${u.uid}')" class="bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white px-2 py-1 rounded transition-colors"><i class="fa-solid fa-trash-can text-sm"></i></button></div></td></tr>`;
    });
    tb.innerHTML = html;
};
window.updateUserRole = async (uid, role) => { try { await setDoc(doc(db, "users", uid), { role: role }, { merge: true }); if(window.showToast) window.showToast("등급이 변경되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };
window.updateUserPerm = async (uid, key, val) => { try { const uR = doc(db, "users", uid); const uD = await getDoc(uR); if (uD.exists()) { let p = uD.data().permissions || {}; p[key] = val; await setDoc(uR, { permissions: p }, { merge: true }); if(window.showToast) window.showToast("권한이 업데이트되었습니다."); } } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };
window.deleteUser = async (uid) => { if (!confirm("이 사용자를 정말 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "users", uid)); if(window.showToast) window.showToast("삭제되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } };
