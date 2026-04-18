/* eslint-disable */
import { auth, db } from './firebase.js';
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged, 
    updatePassword 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    onSnapshot, 
    deleteDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let allUsersUnsubscribe=null, teamMembersUnsubscribe=null;
window.isSigningUp = false; 

// 💡 데이터 전달용 전역 변수
window.tempUserEmail = "";
window.tempUserUid = "";

const googleProvider = new GoogleAuthProvider();

// 💡 [필수 수정] 공유 드라이브 및 메일 발송을 위해 'drive' 전체 권한과 'gmail.send'를 요청합니다.
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

// 💡 [핵심 해결책] 로그인을 해도 권한 창이 안 뜨는 현상을 방지하기 위해 'consent' 프롬프트를 강제합니다.
// 이 옵션이 있어야 구글이 "권한 허용 체크박스"를 다시 보여줍니다.
googleProvider.setCustomParameters({
    prompt: 'select_account consent',
    access_type: 'offline'
});

// 💡 1. 구글 로그인 실행
window.googleLogin = async () => {
    const err = document.getElementById('login-error');
    if(err) err.classList.add('hidden');
    window.isSigningUp = true; 

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // 사내 도메인 제한 (@axbis.ai)
        if (!user.email || !user.email.endsWith('@axbis.ai')) {
            try { await user.delete(); } catch(e) { await signOut(auth); } 
            window.isSigningUp = false; 
            if (err) {
                err.innerHTML = "가입 불가능 합니다";
                err.classList.remove('hidden');
            }
            return; 
        }

        // OAuth 토큰 추출 및 저장
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential && credential.accessToken) {
            window.googleAccessToken = credential.accessToken;
            localStorage.setItem('axmsGoogleTokenV2', credential.accessToken);
            localStorage.setItem('axmsGoogleTokenExpiryV2', Date.now() + 3500 * 1000); 
        }

        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            window.tempUserEmail = user.email;
            window.tempUserUid = user.uid;
            if(document.getElementById('signup-name')) document.getElementById('signup-name').value = user.displayName || '';
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('signup-view').classList.remove('hidden');
        } else {
            window.isSigningUp = false; 
            if (user.email === 'mfg@axbis.ai' && userDoc.data().role !== 'admin') {
                await setDoc(userDocRef, { role: 'admin' }, { merge: true });
            }
            location.reload();
        }
    } catch (er) {
        window.isSigningUp = false;
        console.error("❌ 로그인 실패:", er);
        if(err) { err.innerText = "로그인에 실패했습니다: " + er.message; err.classList.remove('hidden'); }
    }
};

window.completeGoogleSignup = async () => {
    const n = document.getElementById('signup-name')?.value.trim();
    const t = document.getElementById('signup-dept')?.value;
    const pos = document.getElementById('signup-position')?.value || '매니저';
    const err = document.getElementById('signup-error');
    const finalEmail = window.tempUserEmail || auth.currentUser?.email;
    const finalUid = window.tempUserUid || auth.currentUser?.uid;

    if(err) err.classList.add('hidden');
    if(!n) { if(err) err.innerHTML="이름을 입력해주세요."; return; }
    
    try {
        let initialRole = (finalEmail === 'mfg@axbis.ai') ? 'admin' : 'pending';
        await setDoc(doc(db, "users", finalUid), {
            email: finalEmail, name: n, team: t, department: t, position: pos, role: initialRole,
            permissions: { collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true }
        });
        if (initialRole === 'pending') {
            if(err) { err.innerHTML="가입 완료! 승인 대기 중입니다."; err.classList.remove('hidden'); }
            setTimeout(() => { window.isSigningUp = false; window.logout(); }, 3000);
        } else { window.isSigningUp = false; location.reload(); }
    } catch(er) { if(err) err.innerHTML="가입 오류: " + er.message; }
};

window.logout = async () => { 
    if (window.currentUser) { try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: false, lastActive: Date.now() }, { merge: true }); } catch(e) {} }
    await signOut(auth); 
    localStorage.removeItem('axmsGoogleTokenV2'); // 토큰 강제 삭제
    location.reload(); 
};

window.initAuthListeners = () => {
    onAuthStateChanged(auth, async (u) => {
        if (window.isSigningUp) return; 
        if (u) {
            const uS = await getDoc(doc(db, "users", u.uid));
            if (uS.exists()) { 
                window.userProfile = uS.data(); 
                if(window.userProfile.role === 'pending') { await signOut(auth); return; }
                window.currentUser = u;
                document.getElementById('login-modal')?.classList.add('hidden'); 
                const pt = document.getElementById('portal-container'); if(pt) { pt.classList.remove('hidden'); pt.classList.add('flex'); }
                if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = window.userProfile.name; 
                if(document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = window.userProfile.team;
                
                if(allUsersUnsubscribe) allUsersUnsubscribe(); allUsersUnsubscribe=onSnapshot(collection(db,"users"), s=>{ window.allSystemUsers=[]; s.forEach(d=>window.allSystemUsers.push({uid:d.id,...d.data()})); });
                if(teamMembersUnsubscribe) teamMembersUnsubscribe(); teamMembersUnsubscribe=onSnapshot(collection(db,"team_members"), s=>{ window.teamMembers=[]; s.forEach(d=>window.teamMembers.push({id:d.id,...d.data()})); });
                
                if(window.loadCounts) window.loadCounts(); 
                if(window.loadNotifications) window.loadNotifications();
            } else { await signOut(auth); }
        } else { window.currentUser=null; document.getElementById('login-modal')?.classList.remove('hidden'); }
    });
};
