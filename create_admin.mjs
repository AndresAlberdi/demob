import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

// Load environment variables from .env file
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.trim();
    }
  });
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@demob.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin*123';

async function createAdmin() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
    await setDoc(doc(db, 'users', cred.user.uid), { role: 'superadmin', email: adminEmail });
    console.log('Admin user created successfully');
    await signOut(auth);
    process.exit(0);
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log('User already exists. Updating password and role in firestore...');
      try {
        const cred = await signInWithEmailAndPassword(auth, adminEmail, 'admin123');
        await updatePassword(cred.user, adminPassword);
        await setDoc(doc(db, 'users', cred.user.uid), { role: 'superadmin', email: adminEmail });
        console.log(`Admin password updated to ${adminPassword} and role updated.`);
        process.exit(0);
      } catch (innerErr) {
        // Just try to log in with new password to ensure it was already set
        const cred = await signInWithEmailAndPassword(auth, adminEmail, adminPassword).catch(e => {
            console.error('Failed to log in with any known password:', e.message);
            process.exit(1);
        });
        await setDoc(doc(db, 'users', cred.user.uid), { role: 'superadmin', email: adminEmail });
        console.log(`Admin role updated (password was already ${adminPassword}).`);
        process.exit(0);
      }
    } else {
      console.error('Error creating user:', err.message);
      process.exit(1);
    }
  }
}

createAdmin();
