import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, collection, getDocs, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

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

async function run() {
  await signInWithEmailAndPassword(auth, 'admin@demob.com', 'Admin*123');
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
