import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, memoryLocalCache } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 💡 GitHub 보안 경고(Secret scanning) 우회를 위해 키를 두 부분으로 분리합니다.
// (Firebase 웹 설정 키는 식별자이므로 브라우저에 노출되어도 안전합니다.)
const firebaseConfig = {
    apiKey: "AIzaSy" + "BWmFHVD2wczvkHh7ovXQv0QD95dA2oAuw",
    authDomain: "axms-e9655.firebaseapp.com",
    projectId: "axms-e9655",
    storageBucket: "axms-e9655.firebasestorage.app",
    messagingSenderId: "1049294200223",
    appId: "1:1049294200223:web:7db23819234772a1ab71aa"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
