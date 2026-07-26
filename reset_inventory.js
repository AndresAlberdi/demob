import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, collection, getDocs } from 'firebase/firestore';
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

async function reset() {
  await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
  console.log("Logged in");

  // 1. Delete all current products
  const productsRef = collection(db, 'products');
  const snapshot = await getDocs(productsRef);
  const deleteBatch = writeBatch(db);
  snapshot.forEach(docSnap => {
    deleteBatch.delete(docSnap.ref);
  });
  await deleteBatch.commit();
  console.log(`Deleted ${snapshot.size} existing products.`);

  // 2. Read CSV and upload with stock = 10
  const text = fs.readFileSync('/home/andres-alberdi/Descargas/ListasDemoB.csv', 'utf8');
  const lines = text.split('\n');
  const insertBatch = writeBatch(db);
  let count = 0;
  const invalidNames = ["CG", "DU", "PI", "SG", "TI", "."];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let parts = [];
    let currentPart = '';
    let inQuotes = false;
    for (let char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        parts.push(currentPart);
        currentPart = '';
      } else {
        currentPart += char;
      }
    }
    parts.push(currentPart);

    if (parts.length >= 3) {
      const category = parts[0].trim();
      const name = parts[1].trim();
      if (invalidNames.includes(name)) continue;

      let priceStr = parts[2].replace(/"/g, '').replace(',', '.').trim();
      const price = parseFloat(priceStr);

      if (name && !isNaN(price)) {
        const docRef = doc(productsRef);
        insertBatch.set(docRef, {
          category,
          name,
          price,
          stock: 10 // Set initial stock to 10 for testing
        });
        count++;
      }
    }
  }

  await insertBatch.commit();
  console.log(`Successfully uploaded ${count} products with stock = 10.`);
  process.exit(0);
}

reset().catch(console.error);
