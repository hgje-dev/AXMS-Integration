/* eslint-disable */
import { auth, db } from './firebase.js';
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
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

window.tempUserEmail = "";
window.tempUserUid = "";

const googleProvider = new GoogleAuthProvider();

googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

window.googleLogin = async () => {
    const err = document.getElementById('login-error');
    if(err) err.classList.add('hidden');

    window.isSigningUp = true; 

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        if (!user.email || !user.email.endsWith('@axbis.ai')) {
            try { await user.delete(); } catch(e) { await signOut(auth); } 
            window.isSigningUp = false; 
            if (err) {
                err.innerHTML = "가입 불가능 합니다";
                err.classList.remove('hidden');
            }
            return; 
        }

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
            
            if(document.getElementById('signup-name')) {
                document.getElementById('signup-name').value = user.displayName || '';
            }
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('signup-view').classList.remove('hidden');
            if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText = "추가 정보 입력";
        } else {
            window.isSigningUp = false; 
            
            if (user.email === 'mfg@axbis.ai' && userDoc.data().role !== 'admin') {
                await setDoc(userDocRef, { role: 'admin' }, { merge: true });
            }
            
            location.reload();
        }
    } catch (er) {
        window.isSigningUp = false;
        console.error("❌ 구글 로그인 실패:", er);
        if(err) {
            err.innerText = "로그인에 실패했습니다: " + er.message;
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

    if(err) err.classList.add('hidden');
    if(!n) {
        if(err){ err.innerHTML="이름을 입력해주세요."; err.classList.remove('hidden'); }
        return;
    }
    
    if(!finalEmail || !finalUid) {
        if(err){ err.innerHTML="인증 정보가 유실되었습니다. 새로고침 후 다시 시도해주세요."; err.classList.remove('hidden'); }
        return;
    }

    try {
        let initialRole = (finalEmail === 'mfg@axbis.ai') ? 'admin' : 'pending';

        // 💡 18단계 페이지 권한(13) + PJT 세부 작성(쓰기) 권한(5) 팀별 초기화
        const dP = { 
            'dashboard-home': false, 'completion-report': false, 'project-status': true,
            'workhours': true, 'weekly-log': true, 'product-cost': false,
            'mfg-cost': false, 'ncr-dashboard': false, 'quality-report': false,
            'collab': true, 'purchase': true, 'repair': true, 'simulation': false,
            'pjt-w-status': ['pm팀', '영업팀', '제조기술팀', '장비기술팀', '모듈기술팀', '제어팀', '공정개발팀', '품질경영팀'].includes(t),
            'pjt-w-pur': ['전략구매팀'].includes(t),
            'pjt-w-des': ['설계팀', '선행설계팀', '제어팀', 'SW팀'].includes(t),
            'pjt-w-sch': ['pm팀', '제조기술팀', '장비기술팀', '모듈기술팀', '제어팀'].includes(t),
            'pjt-w-log': ['제조기술팀', '장비기술팀', '모듈기술팀', '제어팀', '공정개발팀', '품질경영팀'].includes(t)
        };

        await setDoc(doc(db, "users", finalUid), {
            email: finalEmail,
            name: n,
            team: t,
            department: t,
            position: pos,
            role: initialRole,
            permissions: dP
        });

        if (initialRole === 'pending') {
            if(err){ 
                err.innerHTML="가입 완료! 관리자 승인 대기 중입니다.<br>잠시 후 초기화면으로 돌아갑니다."; 
                err.className="text-emerald-500 text-[11px] font-bold text-center mt-2 bg-emerald-50 p-3 rounded-xl border border-emerald-100 break-words"; 
                err.classList.remove('hidden'); 
            }

            setTimeout(() => { 
                window.isSigningUp = false; 
                window.logout(); 
            }, 3000);
        } else {
            window.isSigningUp = false; 
            location.reload(); 
        }
    } catch(er) {
        if(err){ err.innerHTML="가입 처리 오류: " + er.message; err.classList.remove('hidden'); }
    }
};

window.logout = async () => { 
    if (window.currentUser) {
        try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: false, lastActive: Date.now() }, { merge: true }); } catch(e) {}
    }
    await signOut(auth); 
    location.reload(); 
};

window.initAuthListeners = () => {
    onAuthStateChanged(auth, async (u) => {
        if (window.isSigningUp) return; 

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
                    
                    if (u.email === 'mfg@axbis.ai' && window.userProfile.role !== 'admin') {
                        window.userProfile.role = 'admin';
                        await setDoc(doc(db, "users", u.uid), { role: 'admin' }, { merge: true });
                    }
                    
                } else { 
                    const e = document.getElementById('login-error'); 
                    if(e) { e.innerHTML="관리자에 의해 삭제되거나 존재하지 않는 계정입니다."; e.classList.remove('hidden'); } 
                    await signOut(auth); 
                    return; 
                }
                
                // 💡 누락된 권한 동기화 (기존 유저들 대비)
                if (!window.userProfile.permissions) window.userProfile.permissions = {}; 
                const t = window.userProfile.team || window.userProfile.department || '';
                const dP = { 
                    'dashboard-home': false, 'completion-report': false, 'project-status': true,
                    'workhours': true, 'weekly-log': true, 'product-cost': false,
                    'mfg-cost': false, 'ncr-dashboard': false, 'quality-report': false,
                    'collab': true, 'purchase': true, 'repair': true, 'simulation': false,
                    'pjt-w-status': ['pm팀', '영업팀', '제조기술팀', '장비기술팀', '모듈기술팀', '제어팀', '공정개발팀', '품질경영팀'].includes(t),
                    'pjt-w-pur': ['전략구매팀'].includes(t),
                    'pjt-w-des': ['설계팀', '선행설계팀', '제어팀', 'SW팀'].includes(t),
                    'pjt-w-sch': ['pm팀', '제조기술팀', '장비기술팀', '모듈기술팀', '제어팀'].includes(t),
                    'pjt-w-log': ['제조기술팀', '장비기술팀', '모듈기술팀', '제어팀', '공정개발팀', '품질경영팀'].includes(t)
                }; 
                
                let needsUpdate = false;
                for (let p in dP) { 
                    if (window.userProfile.permissions[p] === undefined) {
                        if (window.userProfile.role === 'admin' || window.userProfile.role === 'master') {
                            window.userProfile.permissions[p] = true;
                        } else {
                            window.userProfile.permissions[p] = dP[p];
                        }
                        needsUpdate = true;
                    } 
                }
                
                if (needsUpdate) {
                    await setDoc(doc(db, "users", u.uid), { permissions: window.userProfile.permissions }, { merge: true });
                }
                
                window.currentUser = u;
                
                const updatePresence = async () => {
                    if(window.currentUser) {
                        try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: true, lastActive: Date.now() }, { merge: true }); } catch(e){}
                    }
                };
                updatePresence(); 
                if(window.presenceInterval) clearInterval(window.presenceInterval);
                window.presenceInterval = setInterval(updatePresence, 5 * 60 * 1000); 

                document.getElementById('login-modal')?.classList.add('hidden'); 
                const pt = document.getElementById('portal-container'); if(pt) { pt.classList.remove('hidden'); pt.classList.add('flex'); }
                
                if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = window.userProfile.name; 
                if(document.getElementById('sidebar-user-position')) document.getElementById('sidebar-user-position').innerText = window.userProfile.position || '직책 미지정'; 
                if(document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = window.userProfile.team || window.userProfile.department;
                
                const rB=document.getElementById('nav-role-badge'), bA=document.getElementById('btn-admin');
                if (window.userProfile.role === 'admin') { 
                    if(rB){ rB.className='bg-purple-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='👑 최고 관리자';} 
                    if(bA){ bA.classList.remove('hidden'); bA.classList.add('flex'); } 
                } 
                else if (window.userProfile.role === 'master') { 
                    if(rB){ rB.className='bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='🛠️ 마스터';} 
                    if(bA){ bA.classList.add('hidden'); } 
                } 
                else if (window.userProfile.role === 'team_admin') { 
                    if(rB){ rB.className='bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='🛡️ 팀 관리자';} 
                    if(bA){ bA.classList.add('hidden'); } 
                } 
                else { 
                    if(rB){ rB.className='bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText="👤 사용자 (" + window.userProfile.name + ")";} 
                    if(bA){ bA.classList.add('hidden'); } 
                }
                
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
            if(window.presenceInterval) clearInterval(window.presenceInterval);
        }
    });
};

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

window.closeSettingsModal = () => {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
};

window.saveUserSettings = async () => {
    const newName = document.getElementById('set-name').value.trim();
    const newTeam = document.getElementById('set-dept').value;
    const newPos = document.getElementById('set-position').value;

    if (!newName) return window.showToast("이름을 입력해주세요.", "error");

    try {
        await setDoc(doc(db, "users", window.currentUser.uid), {
            name: newName,
            team: newTeam,
            department: newTeam,
            position: newPos
        }, { merge: true });
        
        window.userProfile.name = newName;
        window.userProfile.team = newTeam;
        window.userProfile.position = newPos;
        
        if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = newName; 
        if(document.getElementById('sidebar-user-position')) document.getElementById('sidebar-user-position').innerText = newPos; 
        if(document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = newTeam;

        window.showToast("내 정보가 저장되었습니다.");
        window.closeSettingsModal();
    } catch (e) {
        window.showToast("정보 저장 실패", "error");
    }
};

window.openAdminModal = () => { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('admin-modal').classList.add('flex'); window.renderAdminUsers(); };
window.closeAdminModal = () => { document.getElementById('admin-modal').classList.add('hidden'); document.getElementById('admin-modal').classList.remove('flex'); };
