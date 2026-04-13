// js/request.js 파일에서 이 함수만 교체해주세요!
window.initGoogleAPI = function() {
    if (typeof google === 'undefined' || typeof gapi === 'undefined') {
        setTimeout(window.initGoogleAPI, 500);
        return;
    }
    
    const storedToken = localStorage.getItem('axmsGoogleToken');
    const storedExpiry = localStorage.getItem('axmsGoogleTokenExpiry');
    
    // 요청서 화면 UI 요소
    const authSection = document.getElementById('google-auth-section');
    const authStatus = document.getElementById('google-auth-status');
    // 🔥 PJT 현황판 구글 연동 버튼 요소 가져오기
    const pjtAuthBtn = document.getElementById('btn-pjt-google-auth'); 
    
    // 이미 연동(로그인) 되어 있는 경우
    if (storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
        window.googleAccessToken = storedToken;
        gapi.load('client', () => {
            gapi.client.init({}).then(() => {
                gapi.client.setToken({ access_token: storedToken });
                gapi.client.load('drive', 'v3');
                gapi.client.load('gmail', 'v1');
            });
        });
        
        if(authSection) authSection.classList.add('hidden');
        if(authStatus) { authStatus.classList.remove('hidden'); authStatus.classList.add('flex'); }
        if(pjtAuthBtn) pjtAuthBtn.classList.add('hidden'); // 🔥 연동되어 있으면 현황판 버튼 숨기기
    } 
    // 연동이 풀렸거나 안 되어 있는 경우
    else {
        if(authSection) authSection.classList.remove('hidden');
        if(authStatus) { authStatus.classList.add('hidden'); authStatus.classList.remove('flex'); }
        if(pjtAuthBtn) pjtAuthBtn.classList.remove('hidden'); // 🔥 연동 안되어 있으면 현황판 버튼 보이기
    }
    
    window.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: GOOGLE_SCOPES,
        callback: (response) => {
            if (response.error !== undefined) {
                window.showToast("구글 인증에 실패했습니다.", "error");
                return;
            }
            window.googleAccessToken = response.access_token;
            localStorage.setItem('axmsGoogleToken', response.access_token);
            localStorage.setItem('axmsGoogleTokenExpiry', Date.now() + 3500 * 1000);

            // 로그인 직후 UI 즉시 업데이트
            if(authSection) authSection.classList.add('hidden');
            if(authStatus) { authStatus.classList.remove('hidden'); authStatus.classList.add('flex'); }
            if(pjtAuthBtn) pjtAuthBtn.classList.add('hidden'); // 🔥 로그인 완료 시 버튼 즉시 숨기기
            
            window.showToast("구글 계정 연동이 완료되었습니다.");
            
            gapi.load('client', () => {
                gapi.client.init({}).then(() => {
                    gapi.client.load('drive', 'v3');
                    gapi.client.load('gmail', 'v1');
                });
            });
        }
    });
};
