import Papa from 'papaparse';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

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
          
          for (const item of products) {
            const category = item['TIPO'] || '';
            const name = item['PRODUCTO'] || '';
            let priceStr = item['PRECIO'] || '0';
            
            // Handle comma as decimal separator
            priceStr = priceStr.replace(',', '.');
            const price = parseFloat(priceStr);
            
            // Skip excluded names
            if (EXCLUDED_NAMES.includes(name.trim())) {
              continue;
            }
            
            if (name.trim() !== '') {
              await addDoc(collection(db, "products"), {
                category: category.trim(),
                name: name.trim(),
                price: price
              });
              count++;
            }
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
