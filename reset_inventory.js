import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';

const firebaseConfig = {
  apiKey: "AIzaSyDz9ZMmlCmW6lKZdosDsefOd-Y7wPffBXE",
  authDomain: "demob-1e4a1.firebaseapp.com",
  projectId: "demob-1e4a1",
  storageBucket: "demob-1e4a1.firebasestorage.app",
  messagingSenderId: "895573652006",
  appId: "1:895573652006:web:794cc4cf99986f02312ce7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function reset() {
  await signInWithEmailAndPassword(auth, 'admin@demob.com', 'Admin*123');
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
