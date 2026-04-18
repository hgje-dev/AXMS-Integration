/* eslint-disable */
import { auth, db } from './firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, onSnapshot, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allUsersUnsubscribe = null, teamMembersUnsubscribe = null;
window.isSigningUp = false; 

window.tempUserEmail = "";
window.tempUserUid = "";

const googleProvider = new GoogleAuthProvider();
// 💡 드라이브와 메일 발송 권한 요청
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

// 💡 팝업 차단을 최소화하면서 계정 선택 및 권한을 묻도록 설정
googleProvider.setCustomParameters({ 
    prompt: 'select_account' 
});

window.googleLogin = async () => {
    const err = document.getElementById('login-error');
    if (err) err.classList.add('hidden');
    
    window.isSigningUp = true; 

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const email = user.email ? user.email.toLowerCase() : '';

        // 1. 도메인 체크 (사내 이메일 필터링)
        if (!email.endsWith('@axbis.ai')) {
            if (window.showToast) window.showToast("사내 계정(@axbis.ai)만 가입 가능합니다.", "error");
            await signOut(auth);
            window.isSigningUp = false;
            return;
        }

        // 2. 구글 API 토큰 저장
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) {
            window.googleAccessToken = credential.accessToken;
            localStorage.setItem('axmsGoogleTokenV2', credential.accessToken);
            localStorage.setItem('axmsGoogleTokenExpiryV2', Date.now() + 3500 * 1000); 
        }

        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            // [신규 가입자] - 가입 폼 띄우기
            window.tempUserEmail = email; 
            window.tempUserUid = user.uid;
            const nameInput = document.getElementById('signup-name');
            if (nameInput) nameInput.value = user.displayName || '';
            
            document.getElementById('login-view')?.classList.add('hidden'); 
            document.getElementById('signup-view')?.classList.remove('hidden');
        } else {
            // [기존 가입자] - 관리자 계정이면 강제로 권한 복구
            const isSuperAdmin = (email === 'mfg@axbis.ai' || email === 'hgje@axbis.ai');
            if (isSuperAdmin && userDoc.data().role !== 'admin') {
                await setDoc(userDocRef, { role: 'admin' }, { merge: true });
            }
            
            // 💡 로그인 성공 후 새로고침하여 대시보드로 진입
            window.isSigningUp = false; 
            location.reload(); 
        }
    } catch (er) {
        window.isSigningUp = false; 
        console.error("❌ 로그인 에러 상세:", er);
        if (err) { 
            err.innerHTML = `로그인 실패: ${er.message}<br><span class="text-[10px] text-slate-500 mt-1 block">💡 브라우저 팝업 차단이 되어있다면 해제해주세요.</span>`; 
            err.classList.remove('hidden'); 
        }
    }
};

window.completeGoogleSignup = async () => {
    const n = document.getElementById('signup-name')?.value.trim(); 
    const t = document.getElementById('signup-dept')?.value;
    const pos = document.getElementById('signup-position')?.value || '매니저'; 
    const err = document.getElementById('signup-error');
    
    if (!n) { 
        if(err) { err.innerHTML = "이름을 입력해주세요."; err.classList.remove('hidden'); }
        return; 
    }

    const finalEmail = window.tempUserEmail || (auth.currentUser ? auth.currentUser.email : '');
    const finalUid = window.tempUserUid || (auth.currentUser ? auth.currentUser.uid : '');

    try {
        const safeEmail = finalEmail ? finalEmail.toLowerCase() : '';
        const isSuperAdmin = (safeEmail === 'mfg@axbis.ai' || safeEmail === 'hgje@axbis.ai');
        let initialRole = isSuperAdmin ? 'admin' : 'pending';
        
        await setDoc(doc(db, "users", finalUid), {
            email: safeEmail, name: n, team: t, department: t, position: pos, role: initialRole,
            permissions: { collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true },
            createdAt: Date.now()
        });
        
        if (initialRole === 'pending') {
            alert("가입 신청 완료! 관리자 승인 후 이용 가능합니다.");
            window.isSigningUp = false;
            window.logout();
        } else { 
            window.isSigningUp = false;
            location.reload(); 
        }
    } catch(er) {
        if(err) { err.innerHTML = "저장 오류: " + er.message; err.classList.remove('hidden'); }
    }
};

window.logout = async () => { 
    if (window.currentUser) { 
        try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: false, lastActive: Date.now() }, { merge: true }); } catch(e) {} 
    }
    window.isSigningUp = false;
    localStorage.removeItem('axmsGoogleTokenV2'); 
    await signOut(auth);
    location.reload(); 
};

// 💡 인증 감시자 (자동 로그인 및 UI 전환 담당)
window.initAuthListeners = () => {
    onAuthStateChanged(auth, async (u) => {
        if (window.isSigningUp) return; 
        
        if (u) {
            try {
                const uS = await getDoc(doc(db, "users", u.uid));
                const safeEmail = u.email ? u.email.toLowerCase() : '';
                const isSuperAdmin = (safeEmail === 'mfg@axbis.ai' || safeEmail === 'hgje@axbis.ai');

                if (uS.exists()) { 
                    window.userProfile = uS.data(); 
                    
                    // 💡 무한 대기 루프 방어: 관리자는 DB 상태 무관 무조건 통과
                    if (isSuperAdmin) {
                        window.userProfile.role = 'admin';
                    }

                    if (window.userProfile.role === 'pending') { 
                        alert("관리자 승인 대기 중인 계정입니다. 승인 완료 후 로그인해주세요.");
                        await signOut(auth); 
                        return; 
                    }
                    
                    window.currentUser = u; 
                    
                    document.getElementById('login-modal')?.classList.add('hidden'); 
                    document.getElementById('portal-container')?.classList.remove('hidden');
                    document.getElementById('portal-container')?.classList.add('flex');
                    
                    if (document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = window.userProfile.name; 
                    if (document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = window.userProfile.team;
                    
                    if (allUsersUnsubscribe) allUsersUnsubscribe(); 
                    allUsersUnsubscribe = onSnapshot(collection(db,"users"), s=>{ 
                        window.allSystemUsers=[]; s.forEach(d=>window.allSystemUsers.push({uid:d.id,...d.data()})); 
                    });
                    
                    if (teamMembersUnsubscribe) teamMembersUnsubscribe(); 
                    teamMembersUnsubscribe = onSnapshot(collection(db,"team_members"), s=>{ 
                        window.teamMembers=[]; s.forEach(d=>window.teamMembers.push({id:d.id,...d.data()})); 
                    });
                    
                    if (window.loadCounts) window.loadCounts(); 
                    if (window.loadNotifications) window.loadNotifications();
                } 
                else {
                    document.getElementById('login-view')?.classList.add('hidden');
                    document.getElementById('signup-view')?.classList.remove('hidden');
                }
            } catch (firestoreErr) {
                console.error("Firestore Error:", firestoreErr);
                alert("데이터베이스 연결에 실패했습니다.");
                await signOut(auth);
            }
        } 
        else { 
            window.currentUser = null; 
            document.getElementById('login-modal')?.classList.remove('hidden'); 
            document.getElementById('portal-container')?.classList.add('hidden');
            document.getElementById('login-view')?.classList.remove('hidden');
            document.getElementById('signup-view')?.classList.add('hidden');
        }
    });
};

// 💡 팝업 중복 방지 및 강제 연결 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.querySelector('button[onclick="window.googleLogin()"]');
    if (loginBtn) {
        // onclick 속성을 제거하여 함수가 두 번 실행되는 것을 막음
        loginBtn.removeAttribute('onclick');
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (typeof window.googleLogin === 'function') {
                window.googleLogin();
            } else {
                console.error("googleLogin 함수를 찾을 수 없습니다.");
            }
        });
    }
});

// ==========================================
// 💡 관리자 및 설정 모달 관련 함수들
// ==========================================
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
        window.showToast("내 정보가 저장되었습니다.", "success"); 
        window.closeSettingsModal();
    } catch (e) { window.showToast("정보 저장 실패", "error"); }
};

window.openAdminModal = () => { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('admin-modal').classList.add('flex'); window.renderAdminUsers(); };
window.closeAdminModal = () => { document.getElementById('admin-modal').classList.add('hidden'); document.getElementById('admin-modal').classList.remove('flex'); };

window.renderAdminUsers = () => {
    const tb = document.getElementById('admin-users-tbody'); if (!tb) return;
    if (window.allSystemUsers.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-500 font-bold">등록된 사용자가 없습니다.</td></tr>'; return; }
    let sortedUsers = [...window.allSystemUsers].sort((a, b) => { if (a.role === 'pending' && b.role !== 'pending') return -1; if (a.role !== 'pending' && b.role === 'pending') return 1; return 0; });
    const teamsList = ['AXBIS', '레이저사업본부', '제조기술팀', '장비기술팀', '모듈기술팀', '제어팀', 'pm팀', '영업팀', '전략기획팀', '전략구매팀', '품질경영팀', '설계팀', '선행설계팀', '공정개발팀', 'SW팀', '선행기술팀', '피플팀', '북미법인', '기술연구소'];
    let html = ''; 
    sortedUsers.forEach(u => {
        const p = u.permissions || {}; const isP = u.role === 'pending'; const trClass = isP ? 'bg-rose-50/40 border-l-4 border-rose-500' : 'hover:bg-slate-50 transition-colors border-b border-slate-100';
        const posOptions = ['대표','본부장','그룹장','팀장','책임매니저','선임매니저','매니저'].map(pos => `<option value="${pos}" ${u.position === pos ? 'selected' : ''}>${pos}</option>`).join('');
        const safePos = `<select class="block mt-1 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-indigo-600 bg-indigo-50 font-bold focus:outline-none" onchange="window.updateUserPosition('${u.uid}', this.value)">${u.position ? '' : '<option value="" disabled selected>직책 미지정</option>'}${posOptions}</select>`;
        const currentTeam = u.team || u.department || ''; const teamOpts = teamsList.map(t => `<option value="${t}" ${currentTeam === t ? 'selected' : ''}>${t}</option>`).join('');
        const safeTeam = `<select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'} w-full focus:outline-none" onchange="window.updateUserTeam('${u.uid}', this.value)">${currentTeam ? '' : '<option value="" disabled selected>팀 미지정</option>'}${teamOpts}</select>`;
        const lastActiveStr = u.lastActive ? new Date(u.lastActive).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';
        html += `<tr class="${trClass}"><td class="p-3 text-center font-bold text-slate-700">${u.name}${safePos}</td><td class="p-3 text-center">${safeTeam}</td><td class="p-3 text-center text-slate-500">${u.email}</td><td class="p-3 text-center text-[9px] text-slate-400">${lastActiveStr}</td><td class="p-3 text-center"><select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'}" onchange="window.updateUserRole('${u.uid}', this.value)"><option value="pending" ${u.role === 'pending' ? 'selected' : ''}>승인 대기</option><option value="user" ${u.role === 'user' ? 'selected' : ''}>일반 사용자</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>시스템 관리자</option></select></td><td class="p-3"><div class="flex flex-wrap gap-3 justify-center"><label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.collab ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','collab',this.checked)">협업</label></div></td><td class="p-3 text-center"><div class="flex items-center justify-center gap-2">${isP ? `<button onclick="window.approveUser('${u.uid}')" class="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold">✅ 승인</button>` : ''}<button onclick="window.deleteUser('${u.uid}')" class="text-rose-500 px-2.5 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-50 transition-colors"><i class="fa-solid fa-trash-can"></i></button></div></td></tr>`;
    });
    tb.innerHTML = html;
};

window.updateUserTeam = async (uid, team) => { try { await setDoc(doc(db, "users", uid), { team: team, department: team }, { merge: true }); window.showToast("소속 팀이 변경되었습니다.", "success"); } catch(e) {} };
window.updateUserPosition = async (uid, pos) => { try { await setDoc(doc(db, "users", uid), { position: pos }, { merge: true }); window.showToast("직책이 변경되었습니다.", "success"); } catch(e) {} };
window.updateUserRole = async (uid, role) => { try { await setDoc(doc(db, "users", uid), { role: role }, { merge: true }); window.showToast("사용자 등급이 변경되었습니다.", "success"); } catch(e) {} };
window.updateUserPerm = async (uid, key, val) => { try { const uD = await getDoc(doc(db, "users", uid)); if (uD.exists()) { let p = uD.data().permissions || {}; p[key] = val; await setDoc(doc(db, "users", uid), { permissions: p }, { merge: true }); window.showToast("권한이 업데이트되었습니다.", "success"); } } catch(e) {} };
window.approveUser = async (uid) => { try { await setDoc(doc(db, "users", uid), { role: 'user' }, { merge: true }); window.showToast("승인 처리되었습니다.", "success"); } catch(e) {} };
window.deleteUser = async (uid) => { if (!confirm("이 사용자를 정말 삭제하시겠습니까?")) return; try { await deleteDoc(doc(db, "users", uid)); window.showToast("사용자가 삭제되었습니다.", "success"); } catch (e) {} };
