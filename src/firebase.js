import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDz9ZMmlCmW6lKZdosDsefOd-Y7wPffBXE",
  authDomain: "demob-1e4a1.firebaseapp.com",
  projectId: "demob-1e4a1",
  storageBucket: "demob-1e4a1.firebasestorage.app",
  messagingSenderId: "895573652006",
  appId: "1:895573652006:web:794cc4cf99986f02312ce7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
