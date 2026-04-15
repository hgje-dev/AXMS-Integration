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

// 💡 100% 안전한 데이터 전달을 위한 전역 변수
window.tempUserEmail = "";
window.tempUserUid = "";

const googleProvider = new GoogleAuthProvider();

// 💡 1. 구글 로그인 실행 (사내 도메인 제한 적용)
window.googleLogin = async () => {
    const err = document.getElementById('login-error');
    if(err) err.classList.add('hidden');

    window.isSigningUp = true; // 가입 중 튕김 방지 락(Lock) 걸기

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // 🚨 요청사항 반영: @axbis.ai 이메일이 아니면 깔끔하게 "가입 불가능 합니다" 출력 후 쫓아냄
        if (!user.email || !user.email.endsWith('@axbis.ai')) {
            try { await user.delete(); } catch(e) { await signOut(auth); } // 계정 생성 즉시 파기 및 로그아웃
            window.isSigningUp = false; // 락 해제
            if (err) {
                err.innerHTML = "가입 불가능 합니다";
                err.classList.remove('hidden');
            }
            return; // 여기서 로직 종료
        }

        // DB에 기존 유저인지 확인
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
            // [신규 사용자] 이메일과 UID를 절대 지워지지 않게 전역 변수에 꽉 묶어둠 (undefined 원천 차단)
            window.tempUserEmail = user.email;
            window.tempUserUid = user.uid;
            
            if(document.getElementById('signup-name')) {
                document.getElementById('signup-name').value = user.displayName || '';
            }
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('signup-view').classList.remove('hidden');
            if(document.getElementById('auth-title')) document.getElementById('auth-title').innerText = "추가 정보 입력";
        } else {
            // [기존 사용자] 로그인 성공
            window.isSigningUp = false; 
            
            // 최고 관리자 강제 부여 체크
            if (user.email === 'mfg@axbis.ai' && userDoc.data().role !== 'admin') {
                await setDoc(userDocRef, { role: 'admin' }, { merge: true });
            }
            
            // 안전하게 메인화면 진입
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

// 💡 2. 신규 사용자 추가 정보 저장 및 가입 처리 (알림/메일 발송 제거)
window.completeGoogleSignup = async () => {
    const n = document.getElementById('signup-name')?.value.trim();
    const t = document.getElementById('signup-dept')?.value;
    const pos = document.getElementById('signup-position')?.value || '매니저';
    const err = document.getElementById('signup-error');
    
    // 🚨 undefined 방지: 아까 안전하게 묶어둔 이메일과 UID를 가져옵니다.
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
        // 최고관리자 지정 (mfg@axbis.ai)
        let initialRole = (finalEmail === 'mfg@axbis.ai') ? 'admin' : 'pending';

        // Firestore에 데이터 저장 (이메일이 무조건 들어감)
        await setDoc(doc(db, "users", finalUid), {
            email: finalEmail,
            name: n,
            team: t,
            department: t,
            position: pos,
            role: initialRole,
            permissions: { collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true }
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
            // 최고 관리자인 경우 즉시 접속
            window.isSigningUp = false; 
            location.reload(); 
        }
    } catch(er) {
        if(err){ err.innerHTML="가입 처리 오류: " + er.message; err.classList.remove('hidden'); }
    }
};

// 💡 명시적으로 오프라인 처리하며 로그아웃
window.logout = async () => { 
    if (window.currentUser) {
        try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: false, lastActive: Date.now() }, { merge: true }); } catch(e) {}
    }
    await signOut(auth); 
    location.reload(); 
};

// 💡 3. 로그인 상태 감지 및 UI 렌더링
window.initAuthListeners = () => {
    onAuthStateChanged(auth, async (u) => {
        // 신규 가입 폼을 작성 중일 때는 시스템이 튕겨내지 않도록 방어!
        if (window.isSigningUp) return; 

        if (u) {
            try {
                const uS = await getDoc(doc(db, "users", u.uid));
                if (uS.exists()) { 
                    window.userProfile = uS.data(); 
                    
                    // 신규 가입자 승인 대기 처리
                    if(window.userProfile.role === 'pending') { 
                        const e = document.getElementById('login-error'); 
                        if(e) { e.innerHTML="가입은 완료되었으나, 관리자 승인 대기 중입니다."; e.classList.remove('hidden'); } 
                        await signOut(auth); return; 
                    } 
                    
                    // 마지막 안전장치: 최고관리자 자동 승격
                    if (u.email === 'mfg@axbis.ai' && window.userProfile.role !== 'admin') {
                        window.userProfile.role = 'admin';
                        await setDoc(doc(db, "users", u.uid), { role: 'admin' }, { merge: true });
                    }
                    
                } else { 
                    // DB에 정보가 없는 경우 차단된 계정으로 간주
                    const e = document.getElementById('login-error'); 
                    if(e) { e.innerHTML="관리자에 의해 삭제되거나 존재하지 않는 계정입니다."; e.classList.remove('hidden'); } 
                    await signOut(auth); 
                    return; 
                }
                
                // 권한 객체 초기화 보장
                if (!window.userProfile.permissions) window.userProfile.permissions = {}; 
                const dP = { collab:true, purchase:true, assembly:true, repair:true, 'project-status':true, 'weekly-log':true }; 
                for (let p in dP) { if (window.userProfile.permissions[p] === undefined) window.userProfile.permissions[p] = true; }
                
                window.currentUser = u;
                
                // 💡 접속 상태 갱신 (Heartbeat 로직)
                const updatePresence = async () => {
                    if(window.currentUser) {
                        try { await setDoc(doc(db, "users", window.currentUser.uid), { isOnline: true, lastActive: Date.now() }, { merge: true }); } catch(e){}
                    }
                };
                updatePresence(); // 로그인 즉시 갱신
                if(window.presenceInterval) clearInterval(window.presenceInterval);
                window.presenceInterval = setInterval(updatePresence, 5 * 60 * 1000); // 5분마다 상태 갱신

                document.getElementById('login-modal')?.classList.add('hidden'); 
                const pt = document.getElementById('portal-container'); if(pt) { pt.classList.remove('hidden'); pt.classList.add('flex'); }
                
                // 사이드바 유저 정보 업데이트
                if(document.getElementById('sidebar-user-name')) document.getElementById('sidebar-user-name').innerText = window.userProfile.name; 
                if(document.getElementById('sidebar-user-position')) document.getElementById('sidebar-user-position').innerText = window.userProfile.position || '직책 미지정'; 
                if(document.getElementById('sidebar-team-badge')) document.getElementById('sidebar-team-badge').innerText = window.userProfile.team || window.userProfile.department;
                
                // 역할 뱃지 렌더링
                const rB=document.getElementById('nav-role-badge'), bA=document.getElementById('btn-admin');
                if (window.userProfile.role === 'admin') { 
                    if(rB){ rB.className='bg-purple-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='👑 최고 관리자';} 
                    if(bA){ bA.classList.remove('hidden'); bA.classList.add('flex'); } 
                } 
                else if (window.userProfile.role === 'master') { 
                    if(rB){ rB.className='bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText='🛠️ 마스터';} 
                    if(bA){ bA.classList.add('hidden'); } 
                } 
                else { 
                    if(rB){ rB.className='bg-emerald-500 text-white px-2 py-0.5 rounded text-[10px] hidden sm:block'; rB.innerText="👤 사용자 (" + window.userProfile.name + ")";} 
                    if(bA){ bA.classList.add('hidden'); } 
                }
                
                // 실시간 구독 리스너 연결
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
            // 로그아웃 상태
            window.currentUser=null; document.getElementById('login-modal')?.classList.remove('hidden'); 
            const pt=document.getElementById('portal-container'); if(pt) { pt.classList.add('hidden'); pt.classList.remove('flex'); } 
            
            // 타이머 정리
            if(window.presenceInterval) clearInterval(window.presenceInterval);
        }
    });
};

// 💡 4. 내 정보 설정 모달 제어
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

// 💡 5. 관리자 유저 관리 모달
window.openAdminModal = () => { document.getElementById('admin-modal').classList.remove('hidden'); document.getElementById('admin-modal').classList.add('flex'); window.renderAdminUsers(); };
window.closeAdminModal = () => { document.getElementById('admin-modal').classList.add('hidden'); document.getElementById('admin-modal').classList.remove('flex'); };

// 💡 관리자용 유저 리스트 테이블 렌더링
window.renderAdminUsers = () => {
    const tb = document.getElementById('admin-users-tbody'); if (!tb) return;
    if (window.allSystemUsers.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="text-center p-6 text-slate-500 font-bold">등록된 사용자가 없습니다.</td></tr>'; return; }
    
    let sortedUsers = [...window.allSystemUsers].sort((a, b) => { 
        if (a.role === 'pending' && b.role !== 'pending') return -1; 
        if (a.role !== 'pending' && b.role === 'pending') return 1; 
        return 0; 
    });
    
    const teamsList = [
        'AXBIS', '레이저사업본부', '제조기술팀', '장비기술팀', '모듈기술팀', 
        '제어팀', 'pm팀', '영업팀', '전략기획팀', '전략구매팀', '품질경영팀', 
        '설계팀', '선행설계팀', '공정개발팀', 'SW팀', '선행기술팀', '피플팀', 
        '북미법인', '기술연구소'
    ];

    let html = '';
    const now = Date.now(); // 현재 시간 캐싱

    sortedUsers.forEach(u => {
        const p = u.permissions || {}; 
        const isP = u.role === 'pending';
        const trClass = isP ? 'bg-rose-50/40 border-l-4 border-rose-500' : 'hover:bg-slate-50 transition-colors border-b border-slate-100';
        
        const posOptions = ['대표','본부장','그룹장','팀장','책임매니저','선임매니저','매니저'].map(pos => `<option value="${pos}" ${u.position === pos ? 'selected' : ''}>${pos}</option>`).join('');
        const safePos = `<select class="block mt-1 border border-slate-200 rounded px-1 py-0.5 text-[10px] text-indigo-600 bg-indigo-50 font-bold focus:outline-none" onchange="window.updateUserPosition('${u.uid}', this.value)">
                            ${u.position ? '' : '<option value="" disabled selected>직책 미지정</option>'}
                            ${posOptions}
                         </select>`;

        const currentTeam = u.team || u.department || '';
        const teamOpts = teamsList.map(t => `<option value="${t}" ${currentTeam === t ? 'selected' : ''}>${t}</option>`).join('');
        const safeTeam = `<select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'} w-full focus:outline-none" onchange="window.updateUserTeam('${u.uid}', this.value)">
                            ${currentTeam ? '' : '<option value="" disabled selected>팀 미지정</option>'}
                            ${teamOpts}
                         </select>`;

        // 💡 접속 상태 판단 (10분 이내 Heartbeat가 있으면 온라인)
        const lastActive = u.lastActive || 0;
        const isOnline = u.isOnline !== false && (now - lastActive < 10 * 60 * 1000);
        
        const statusBadge = isOnline 
            ? `<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full text-[10px] font-bold border border-emerald-200"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>온라인</span>` 
            : `<span class="inline-flex items-center gap-1.5 bg-slate-50 text-slate-500 px-2 py-1 rounded-full text-[10px] font-bold border border-slate-200"><span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>오프라인</span>`;
        
        const lastActiveStr = lastActive ? new Date(lastActive).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '기록 없음';

        html += `<tr class="${trClass}">
            <td class="p-3 text-center font-bold text-slate-700">${u.name}${safePos}</td>
            <td class="p-3 text-center">${safeTeam}</td>
            <td class="p-3 text-center text-slate-500">${u.email}</td>
            
            <td class="p-3 text-center" title="마지막 활동: ${lastActiveStr}">
                ${statusBadge}
                <div class="text-[9px] text-slate-400 mt-1">${lastActiveStr}</div>
            </td>
            
            <td class="p-3 text-center">
                <select class="border border-slate-300 rounded px-2 py-1.5 text-xs font-bold ${isP ? 'text-rose-600 bg-white' : 'text-slate-600'}" onchange="window.updateUserRole('${u.uid}', this.value)">
                    <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>승인 대기</option>
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>일반 사용자</option>
                    <option value="master" ${u.role === 'master' ? 'selected' : ''}>마스터</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>시스템 관리자</option>
                </select>
            </td>
            <td class="p-3">
                <div class="flex flex-wrap gap-3 justify-center">
                    <label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.collab ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','collab',this.checked)">협업</label>
                    <label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.purchase ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','purchase',this.checked)">구매</label>
                    <label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.assembly ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','assembly',this.checked)">조립</label>
                    <label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p.repair ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','repair',this.checked)">수리/점검</label>
                    <label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p['project-status'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','project-status',this.checked)">PJT현황판</label>
                    <label class="flex items-center gap-1 text-[11px] font-bold text-slate-600 cursor-pointer"><input type="checkbox" ${p['weekly-log'] ? 'checked' : ''} onchange="window.updateUserPerm('${u.uid}','weekly-log',this.checked)">주간업무</label>
                </div>
            </td>
            <td class="p-3 text-center">
                <div class="flex items-center justify-center gap-2">
                    ${isP ? `<button onclick="window.approveUser('${u.uid}')" class="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm transition-colors whitespace-nowrap">✅ 가입 승인</button>` : ''}
                    <button onclick="window.deleteUser('${u.uid}')" class="bg-white border border-rose-200 text-rose-500 hover:bg-rose-500 hover:text-white px-2.5 py-1.5 rounded-lg transition-colors shadow-sm" title="계정 차단 및 삭제"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </td>
        </tr>`;
    });
    tb.innerHTML = html;
};

// 소속 팀 변경 함수
window.updateUserTeam = async (uid, team) => { 
    try { 
        await setDoc(doc(db, "users", uid), { team: team, department: team }, { merge: true }); 
        if(window.showToast) window.showToast("소속 팀이 변경되었습니다."); 
    } catch (e) { 
        if(window.showToast) window.showToast("오류 발생", "error"); 
    } 
};

window.updateUserPosition = async (uid, pos) => { 
    try { await setDoc(doc(db, "users", uid), { position: pos }, { merge: true }); if(window.showToast) window.showToast("직책이 변경되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } 
};

window.updateUserRole = async (uid, role) => { 
    try { await setDoc(doc(db, "users", uid), { role: role }, { merge: true }); if(window.showToast) window.showToast("등급이 변경되었습니다."); } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } 
};

window.updateUserPerm = async (uid, key, val) => { 
    try { const uR = doc(db, "users", uid); const uD = await getDoc(uR); if (uD.exists()) { let p = uD.data().permissions || {}; p[key] = val; await setDoc(uR, { permissions: p }, { merge: true }); if(window.showToast) window.showToast("권한이 업데이트되었습니다."); } } catch (e) { if(window.showToast) window.showToast("오류 발생", "error"); } 
};

// 💡 5-1. 관리자의 사용자 가입 승인 (알림/메일 발송 제거)
window.approveUser = async (uid) => {
    try {
        await setDoc(doc(db, "users", uid), { role: 'user' }, { merge: true });
        if(window.showToast) window.showToast("계정이 정상적으로 승인되었습니다.", "success");
    } catch(e) {
        if(window.showToast) window.showToast("승인 처리 실패", "error");
        console.error(e);
    }
};

window.deleteUser = async (uid) => { 
    if (!confirm("이 사용자를 정말 삭제하시겠습니까?\n\n삭제 시 해당 사용자의 시스템 접근이 즉시 영구 차단됩니다.\n(참고: 동일한 이메일로 다시 회원가입을 하려면 Firebase Authentication 콘솔에서도 계정을 삭제해주셔야 합니다.)")) return; 
    try { 
        await deleteDoc(doc(db, "users", uid)); 
        if(window.showToast) window.showToast("계정 권한이 영구적으로 삭제(차단) 되었습니다."); 
    } catch (e) { 
        if(window.showToast) window.showToast("오류 발생", "error"); 
    } 
};
