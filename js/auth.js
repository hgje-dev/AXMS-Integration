/* eslint-disable */
import { auth, db } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allUsersUnsubscribe = null, teamMembersUnsubscribe = null;
window.isSigningUp = false; 

window.tempUserEmail = "";
window.tempUserUid = "";

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

googleProvider.setCustomParameters({ 
    prompt: 'consent',
    access_type: 'offline'
});

window.googleLogin = async () => {
    const err = document.getElementById('login-error');
    if (err) err.classList.add('hidden');
    window.isSigningUp = true; 

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // 1. 사내 이메일 도메인 검증
        if (!user.email || !user.email.endsWith('@axbis.ai')) {
            try { await user.delete(); } catch(e) { await signOut(auth); } 
            window.isSigningUp = false; 
            if (err) { err.innerHTML = "사내 이메일(@axbis.ai)만 가입 가능합니다."; err.classList.remove('hidden'); }
            return; 
        }

        // 2. 구글 드라이브 및 지메일 토큰 저장
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) {
            window.googleAccessToken = credential.accessToken;
            localStorage.setItem('axmsGoogleTokenV2', credential.accessToken);
            localStorage.setItem('axmsGoogleTokenExpiryV2', Date.now() + 3500 * 1000); 
        }

        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        // 3. 첫 로그인인 경우 회원가입 폼 표시
        if (!userDoc.exists()) {
            window.tempUserEmail = user.email; 
            window.tempUserUid = user.uid;
            const nameInput = document.getElementById('signup-name');
            if (nameInput) nameInput.value = user.displayName || '';
            
            document.getElementById('login-view').classList.add('hidden'); 
            document.getElementById('signup-view').classList.remove('hidden');
        } 
        // 4. 이미 가입된 경우
        else {
            window.isSigningUp = false; 
            const userEmail = user.email.toLowerCase();
            const isSuperAdmin = (userEmail === 'mfg@axbis.ai' || userEmail === 'hgje@axbis.ai');
            
            // 최고 관리자 계정은 로그인 시 무조건 Admin 권한 강제 업데이트
            if (isSuperAdmin && userDoc.data().role !== 'admin') { 
                await setDoc(userDocRef, { role: 'admin' }, { merge: true }); 
            }
            location.reload();
        }
    } catch (er) {
        window.isSigningUp = false; 
        console.error("❌ 로그인 실패:", er);
        if (err) { 
            err.innerHTML = `로그인 실패: ${er.message}<br><span class="text-[10px] text-slate-500 mt-1 block">💡 브라우저 팝업 차단을 해제하거나, 권한을 확인해주세요.</span>`; 
            err.classList.remove('hidden'); 
        }
    }
};

window.completeGoogleSignup = async () => {
    const n = document.getElementById('signup-name')?.value.trim(); 
    const t = document.getElementById('signup-dept')?.value;
    const pos = document.getElementById('signup-position')?.value || '매니저'; 
    const err = document.getElementById('signup-error');
    const finalEmail = window.tempUserEmail || auth.currentUser?.email; 
    const finalUid = window.tempUserUid || auth.currentUser?.uid;

    if (err) err.classList.add('hidden');
    if (!n) { 
        if (err) { err.innerHTML = "이름을 입력해주세요."; err.classList.remove('hidden'); }
        return; 
    }
    
    try {
        const safeEmail = finalEmail ? finalEmail.toLowerCase() : '';
        const isSuperAdmin = (safeEmail === 'mfg@axbis.ai' || safeEmail === 'hgje@axbis.ai');
        let initialRole = isSuperAdmin ? 'admin' : 'pending';
        
        await setDoc(doc(db, "users", finalUid), {
            email: finalEmail, name: n, team: t, department: t, position: pos, role: initialRole,
            permissions: { collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true }
        });
        
        if (initialRole === 'pending') {
            if (err) { err.innerHTML = "가입 완료! 승인 대기 중입니다."; err.classList.remove('hidden'); }
            setTimeout(() => { window.isSigningUp = false; window.logout(); }, 3000);
        } else { 
            window.isSigningUp = false; 
            location.reload(); 
        }
    } catch(er) { 
        if (err) { err.innerHTML = "가입 오류: " + er.message; err.classList.remove('hidden'); } 
    }
};

window.logout = async () => { 
    if (window.currentUser) { 
        try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: false, lastActive: Date.now() }, { merge: true }); } catch(e) {} 
    }
    await signOut(auth); 
    localStorage.removeItem('axmsGoogleTokenV2'); 
    location.reload(); 
};

// 💡 [핵심 해결] 새로고침 시 무한 루프 및 강제 로그아웃 방지 로직
window.initAuthListeners = () => {
    onAuthStateChanged(auth, async (u) => {
        if (window.isSigningUp) return; 
        
        if (u) {
            try {
                const uS = await getDoc(doc(db, "users", u.uid));
                
                if (uS.exists()) { 
                    window.userProfile = uS.data(); 
                    const safeEmail = u.email ? u.email.toLowerCase() : '';
                    const isSuperAdmin = (safeEmail === 'mfg@axbis.ai' || safeEmail === 'hgje@axbis.ai');
                    
                    // 🔥 프리패스: 대표/관리자 계정은 DB 상태와 무관하게 무조건 Admin 통과
                    if (isSuperAdmin) {
                        window.userProfile.role = 'admin';
                        setDoc(doc(db, "users", u.uid), { role: 'admin' }, { merge: true }).catch(()=>{});
                    }

                    // 일반 계정 승인 대기 처리
                    if (window.userProfile.role === 'pending') { 
                        const err = document.getElementById('login-error');
                        if (err) { err.innerHTML = "관리자 승인 대기 중입니다."; err.classList.remove('hidden'); }
                        await signOut(auth); 
                        return; 
                    }
                    
                    window.currentUser = u; 
                    
                    // UI 정상 표시
                    const loginModal = document.getElementById('login-modal'); if (loginModal) loginModal.classList.add('hidden'); 
                    const pt = document.getElementById('portal-container'); if (pt) { pt.classList.remove('hidden'); pt.classList.add('flex'); }
                    if (document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = window.userProfile.name || '이름 없음'; 
                    if (document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = window.userProfile.team || '소속 없음';
                    
                    if (allUsersUnsubscribe) allUsersUnsubscribe(); allUsersUnsubscribe = onSnapshot(collection(db,"users"), s=>{ window.allSystemUsers=[]; s.forEach(d=>window.allSystemUsers.push({uid:d.id,...d.data()})); });
                    if (teamMembersUnsubscribe) teamMembersUnsubscribe(); teamMembersUnsubscribe = onSnapshot(collection(db,"team_members"), s=>{ window.teamMembers=[]; s.forEach(d=>window.teamMembers.push({id:d.id,...d.data()})); });
                    
                    if (window.loadCounts) window.loadCounts(); 
                    if (window.loadNotifications) window.loadNotifications();
                } 
                else { 
                    // DB에 정보가 없는데 로그인 상태인 경우 (가입 도중 새로고침 등) -> 로그아웃 시키지 않고 폼 띄우기
                    window.tempUserEmail = u.email; 
                    window.tempUserUid = u.uid;
                    const nameInput = document.getElementById('signup-name');
                    if (nameInput) nameInput.value = u.displayName || '';
                    
                    const loginModal = document.getElementById('login-modal'); if (loginModal) loginModal.classList.remove('hidden');
                    const loginView = document.getElementById('login-view'); if (loginView) loginView.classList.add('hidden');
                    const signupView = document.getElementById('signup-view'); if (signupView) signupView.classList.remove('hidden');
                }
            } catch (firestoreErr) {
                console.error("DB 로드 에러:", firestoreErr);
                const err = document.getElementById('login-error');
                if (err) { err.innerHTML = "데이터베이스 연결 오류: " + firestoreErr.message; err.classList.remove('hidden'); }
                await signOut(auth);
            }
        } 
        else { 
            // 로그아웃 상태일 때 초기화
            window.currentUser = null; 
            const loginModal = document.getElementById('login-modal'); if (loginModal) loginModal.classList.remove('hidden'); 
            const loginView = document.getElementById('login-view'); if (loginView) loginView.classList.remove('hidden');
            const signupView = document.getElementById('signup-view'); if (signupView) signupView.classList.add('hidden');
            const pt = document.getElementById('portal-container'); if (pt) { pt.classList.add('hidden'); pt.classList.remove('flex'); }
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.querySelector('button[onclick="window.googleLogin()"]');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.googleLogin === 'function') {
                window.googleLogin();
            } else {
                console.error("❌ googleLogin 함수를 찾을 수 없습니다.");
                const err = document.getElementById('login-error');
                if(err) {
                    err.innerHTML = "스크립트 로드 오류입니다. 새로고침 후 다시 시도해주세요.";
                    err.classList.remove('hidden');
                }
            }
        });
    }
});

// 관리자 및 설정 모달 관련 함수들
window.openSettingsModal = () => {
    if (!window.userProfile) return;
    document.getElementById('set-name').value = window.userProfile.name || '';
    document.getElementById('set-dept').value = window.userProfile.team || window.userProfile.department || 'AXBIS';
    document.getElementById('set-position').value = window.userProfile.position || '매니저';
    document.getElementById('set-new-pw').value = '';
    document.getElementById('set-new-pw-confirm').value = '';
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
};
window.closeSettingsModal = () => { document.getElementById('settings-modal').classList.add('hidden'); document.getElementById('settings-modal').classList.remove('flex'); };
window.saveUserSettings = async () => {
    const newName = document.getElementById('set-name').value.trim();
    const newTeam = document.getElementById('set-dept').value;
    const newPos = document.getElementById('set-position').value;
    if (!newName) return window.showToast("이름을 입력해주세요.", "error");
    try {
        await setDoc(doc(db, "users", window.currentUser.uid), { name: newName, team: newTeam, department: newTeam, position: newPos }, { merge: true });
        window.userProfile.name = newName; window.userProfile.team = newTeam; window.userProfile.position = newPos;
        if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = newName; 
        if(document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = newTeam;
        window.showToast("내 정보가 저장되었습니다."); window.closeSettingsModal();
    } catch (e) { window.showToast("정보 저장 실패", "error"); }
};
window.openAdminModal = () => { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('admin-modal').classList.add('flex'); window.renderAdminUsers(); };
window.closeAdminModal = () => { document.getElementById('admin-modal').classList.add('hidden'); document.getElementById('admin-modal').classList.remove('flex'); };
window.renderAdminUsers = () => {
    const tb = document.getElementById('admin-users-tbody'); if (!tb) return;
    if (window.allSystemUsers.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-500 font-bold">등록된 사용자가 없습니다.</td></tr>'; return; }
    let sortedUsers = [...window.allSystemUsers].sort((a, b) => { if (a.role === 'pending' && b.role !== 'pending') return -1; if (a.role !== 'pending' && b.role === 'pending') return 1; return 0; });
    const teamsList = ['AXBIS', '레이저사업본부', '제조기술팀', '장비기술팀', '모듈기술팀', '제어팀', 'pm팀', '영업팀', '전략기획팀', '전략구매팀', '품질경영팀', '설계팀', '선행설계팀', '공정개발팀', 'SW팀', '선행기술팀', '피플팀', '북미법인', '기술연구소'];
    let html = ''; const now = Date.now(); 
    sortedUsers.forEach(u => {
        const p = u.permissions || {}; const isP = u.role === 'pending'; const trClass = isP ? 'bg-rose-50/40 border-l-4 border-rose-500' : 'hover:bg-slate-50 transition-colors border-b border-slate-100';
        const posOptions = ['대표','본부장','그룹장','팀장','책임매니저','선임매니저','매니저'].map(pos => `<option value="${pos}" ${u.position === pos ? 'selected' : ''}>${pos}</option>`).join('');
        const safePos = `<select class="block mt-1 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-indigo-600 bg-indigo-50 font-bold focus:outline-none" onchange="window.updateUserPosition('${u.uid}', this.value)">${u.position ? '' : '<option value="" disabled selected>직책 미지정</option>'}${posOptions}</select>`;
        const currentTeam = u.team || u.department || ''; const teamOpts = teamsList.map(t => `<option value="${t}" ${currentTeam === t ? 'selected' : ''}>${t}</option>`).join('');
        const safeTeam = `<select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'} w-full focus:outline-none" onchange="window.updateUserTeam('${u.uid}', this.value)">${currentTeam ? '' : '<option value="" disabled selected>팀 미지정</option>'}${teamOpts}</select>`;
        const lastActiveStr = u.lastActive ? new Date(u.lastActive).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';
        html += `<tr class="${trClass}"><td class="p-3 text-center font-bold text-slate-700">${u.name}${safePos}</td><td class="p-3 text-center">${safeTeam}</td><td class="p-3 text-center text-slate-500">${u.email}</td><td class="p-3 text-center text-[9px] text-slate-400">${lastActiveStr}</td><td class="p-3 text-center"><select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'}" onchange="window.updateUserRole('${u.uid}', this.value)"><option value="pending" ${u.role === 'pending' ? 'selected' : ''}>승인 대기</option><option value="user" ${u.role === 'user' ? 'selected' : ''}>일반 사용자</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>시스템 관리자</option></select></td><td class="p-3"><div class="flex flex-wrap gap-3 justify-center"><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.collab ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','collab',this.checked)">협업</label></div></td><td class="p-3 text-center"><div class="flex items-center justify-center gap-2">${isP ? `<button onclick="window.approveUser('${u.uid}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold">✅ 승인</button>` : ''}<button onclick="window.deleteUser('${u.uid}')" class="text-rose-500 px-2.5 py-1.5 rounded-lg border border-rose-200"><i class="fa-solid fa-trash-can"></i></button></div></td></tr>`;
    });
    tb.innerHTML = html;
};
window.updateUserTeam = async (uid, team) => { try { await setDoc(doc(db, "users", uid), { team: team, department: team }, { merge: true }); window.showToast("소속 팀 변경"); } catch(e) {} };
window.updateUserPosition = async (uid, pos) => { try { await setDoc(doc(db, "users", uid), { position: pos }, { merge: true }); window.showToast("직책 변경"); } catch(e) {} };
window.updateUserRole = async (uid, role) => { try { await setDoc(doc(db, "users", uid), { role: role }, { merge: true }); window.showToast("등급 변경"); } catch(e) {} };
window.updateUserPerm = async (uid, key, val) => { try { const uD = await getDoc(doc(db, "users", uid)); if (uD.exists()) { let p = uD.data().permissions || {}; p[key] = val; await setDoc(doc(db, "users", uid), { permissions: p }, { merge: true }); window.showToast("권한 업데이트"); } } catch(e) {} };
window.approveUser = async (uid) => { try { await setDoc(doc(db, "users", uid), { role: 'user' }, { merge: true }); window.showToast("승인됨"); } catch(e) {} };
window.deleteUser = async (uid) => { if (!confirm("이 사용자를 정말 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "users", uid)); window.showToast("삭제됨"); } catch (e) {} };
