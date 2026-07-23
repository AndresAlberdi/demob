import Papa from 'papaparse';
import { db } from '../firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';

// Excluded names based on requirements
const EXCLUDED_NAMES = ['.', 'SG', 'CG', 'PI', 'DU', 'TI'];

export const parseAndUploadCSV = (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const products = results.data;
          let count = 0;
          
          // Use writeBatch to ensure reliability and speed
          let batch = writeBatch(db);
          let operationsInBatch = 0;
          
          const productsRef = collection(db, "products");
          
          for (const item of products) {
            const category = item['TIPO'] || '';
            const name = item['PRODUCTO'] || '';
            let priceStr = item['PRECIO'];
            
            // Handle if PRECIO is empty or undefined
            if (priceStr === undefined || priceStr === null || priceStr === '') {
                priceStr = '0';
            } else {
                priceStr = String(priceStr).replace(',', '.');
            }
            
            const price = parseFloat(priceStr) || 0;
            
            // Skip excluded names
            if (EXCLUDED_NAMES.includes(name.trim())) {
              continue;
            }
            
            if (name.trim() !== '') {
              const newDocRef = doc(productsRef);
              batch.set(newDocRef, {
                category: category.trim(),
                name: name.trim(),
                price: price,
                stock: 0 // Initialize inventory stock
              });
              
              count++;
              operationsInBatch++;
              
              // Firestore batches support up to 500 operations
              if (operationsInBatch === 490) {
                  await batch.commit();
                  batch = writeBatch(db);
                  operationsInBatch = 0;
              }
            }
          }
          
          // Commit any remaining operations
          if (operationsInBatch > 0) {
              await batch.commit();
          }
          
          resolve(`Se subieron ${count} productos exitosamente.`);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};
