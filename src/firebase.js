import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            "AIzaSyDCr_uwjiwfYtFEnLONAwts5m8jAFlqtZI",
  authDomain:        "warehousetobranch.firebaseapp.com",
  projectId:         "warehousetobranch",
  storageBucket:     "warehousetobranch.firebasestorage.app",
  messagingSenderId: "123700097409",
  appId:             "1:123700097409:web:5a0b63c9f06582cd803880",
};

const app = initializeApp(firebaseConfig);
// ignoreUndefinedProperties: ตัด field ที่เป็น undefined ทิ้งแทนการ throw ทั้ง write
// (เดิม field undefined เช่น scannedLots ทำให้ setDoc/writeBatch ล้มเงียบ → ลังปิดแล้วไม่ sync ไป Firestore)
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
export const auth = getAuth(app);

// Sign in anonymously on app load — required for Firestore rules (request.auth != null)
// เก็บ promise ร่วมกันเพื่อให้ action ที่ต้องเขียน Firestore รอ auth ได้จริง และไม่ยิง sign-in ซ้ำ
// หากรอบแรกพลาดให้ล้าง promise เพื่อให้ผู้ใช้กดใหม่แล้ว retry ได้
let authReadyPromise = null;
export function ensureAuthReady() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!authReadyPromise) {
    authReadyPromise = signInAnonymously(auth)
      .then(credential => credential.user)
      .finally(() => { authReadyPromise = null; });
  }
  return authReadyPromise;
}

ensureAuthReady().catch(() => {});

export const onAuthReady = (cb) => onAuthStateChanged(auth, (user) => { if (user) cb(user); });
