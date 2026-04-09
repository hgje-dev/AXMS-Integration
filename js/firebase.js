import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, memoryLocalCache } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBWmFHVD2wczvkHh7ovXQv0QD95dA2oAuw",
    authDomain: "axms-e9655.firebaseapp.com",
    projectId: "axms-e9655",
    storageBucket: "axms-e9655.firebasestorage.app",
    messagingSenderId: "1049294200223",
    appId: "1:1049294200223:web:7db23819234772a1ab71aa"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });
