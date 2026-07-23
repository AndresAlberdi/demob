import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // Config parameters aren't strictly required to be hardcoded if we deploy with Firebase CLI and it auto-configures for hosting,
  // but let's provide a standard structure or warn the user. 
  // We can load them from env variables if needed, or just let Firebase Hosting auto-init later.
  // We'll leave them empty for now, but usually for a SPA they are needed in dev mode.
  // Actually, I'll need to create a .env with placeholder.
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demob-1e4a1.firebaseapp.com",
  projectId: "demob-1e4a1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demob-1e4a1.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
