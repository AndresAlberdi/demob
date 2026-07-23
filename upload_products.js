import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, collection } from 'firebase/firestore';
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

async function upload() {
  await signInWithEmailAndPassword(auth, 'admin@demob.com', 'Admin*123');
  console.log("Logged in");

  const text = fs.readFileSync('/home/andres-alberdi/Descargas/ListasDemoB.csv', 'utf8');
  const lines = text.split('\n');
  const batch = writeBatch(db);
  const productsRef = collection(db, 'products');
  let count = 0;

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
      if (name === '.') continue; // Skip invalid rows
      let priceStr = parts[2].replace(/"/g, '').replace(',', '.').trim();
      const price = parseFloat(priceStr);

      if (name && !isNaN(price)) {
        const docRef = doc(productsRef);
        batch.set(docRef, {
          category,
          name,
          price,
          stock: 0
        });
        count++;
      }
    }
  }

  await batch.commit();
  console.log(`Successfully uploaded ${count} products.`);
  process.exit(0);
}

upload().catch(console.error);
