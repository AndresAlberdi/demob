import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
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
const db = getFirestore(app);
const auth = getAuth(app);

const adminEmail = process.env.ADMIN_EMAIL || 'admin@demob.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'Admin*123';

async function run() {
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  console.log("Logged in");

  const namesToDelete = ["CG", "DU", "PI", "SG", "TI", "."];
  const q = query(collection(db, "products"), where("name", "in", namesToDelete));
  const snapshot = await getDocs(q);

  let count = 0;
  const batch = writeBatch(db);
  snapshot.forEach(docSnap => {
    batch.delete(docSnap.ref);
    count++;
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Deleted ${count} products.`);
  } else {
    console.log("No products found to delete.");
  }
  process.exit(0);
}

run().catch(console.error);
