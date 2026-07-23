import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDz9ZMmlCmW6lKZdosDsefOd-Y7wPffBXE",
  authDomain: "demob-1e4a1.firebaseapp.com",
  projectId: "demob-1e4a1",
  storageBucket: "demob-1e4a1.firebasestorage.app",
  messagingSenderId: "895573652006",
  appId: "1:895573652006:web:794cc4cf99986f02312ce7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAdmin() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, 'admin@demob.com', 'Admin*123');
    await setDoc(doc(db, 'users', cred.user.uid), { role: 'admin', email: 'admin@demob.com' });
    console.log('Admin user created successfully');
    await signOut(auth);
    process.exit(0);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('User already exists. Updating password and role in firestore...');
      try {
        const cred = await signInWithEmailAndPassword(auth, 'admin@demob.com', 'admin123');
        await updatePassword(cred.user, 'Admin*123');
        await setDoc(doc(db, 'users', cred.user.uid), { role: 'admin', email: 'admin@demob.com' });
        console.log('Admin password updated to Admin*123 and role updated.');
        process.exit(0);
      } catch (innerErr) {
        // Just try to log in with new password to ensure it was already set
        const cred = await signInWithEmailAndPassword(auth, 'admin@demob.com', 'Admin*123').catch(e => {
            console.error('Failed to log in with any known password:', e.message);
            process.exit(1);
        });
        await setDoc(doc(db, 'users', cred.user.uid), { role: 'admin', email: 'admin@demob.com' });
        console.log('Admin role updated (password was already Admin*123).');
        process.exit(0);
      }
    } else {
      console.error('Error creating user:', err.message);
      process.exit(1);
    }
  }
}

createAdmin();
