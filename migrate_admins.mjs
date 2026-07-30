import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
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

async function migrateAdmins() {
  try {
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    const usersSnap = await getDocs(collection(db, 'users'));
    let count = 0;
    for (const userDoc of usersSnap.docs) {
      if (userDoc.data().role === 'admin') {
        await updateDoc(doc(db, 'users', userDoc.id), { role: 'superadmin' });
        console.log(`Migrated user ${userDoc.id} (${userDoc.data().email}) to superadmin`);
        count++;
      }
    }
    console.log(`Successfully migrated ${count} users.`);
    process.exit(0);
  } catch (err) {
    console.error('Error migrating users:', err);
    process.exit(1);
  }
}

migrateAdmins();
