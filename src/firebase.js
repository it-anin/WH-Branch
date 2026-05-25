import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const auth = getAuth(app);

// Sign in anonymously on app load — required for Firestore rules (request.auth != null)
signInAnonymously(auth).catch(() => {});

export const onAuthReady = (cb) => onAuthStateChanged(auth, (user) => { if (user) cb(user); });
