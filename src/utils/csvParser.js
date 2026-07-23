import Papa from 'papaparse';
import { db } from '../firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';

// Excluded names based on requirements
const EXCLUDED_NAMES = ['.', 'SG', 'CG', 'PI', 'DU', 'TI'];

export const parseAndUploadCSV = (file, hasHeader = true) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: hasHeader,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data;
          let count = 0;
          
          let batch = writeBatch(db);
          let operationsInBatch = 0;
          const productsRef = collection(db, "products");
          
          for (const item of rows) {
            let category = '';
            let name = '';
            let priceStr = '0';
            let stockVal = 0;

            if (hasHeader) {
              category = item['TIPO'] || item['CATEGORIA'] || item['Categoria'] || item['category'] || '';
              name = item['PRODUCTO'] || item['Producto'] || item['NAME'] || item['name'] || '';
              priceStr = item['PRECIO'] || item['Precio'] || item['PRICE'] || item['price'] || '0';
              stockVal = item['STOCK'] || item['Stock'] || item['stock'] || 0;
            } else {
              // Array index based
              category = item[0] || '';
              name = item[1] || '';
              priceStr = item[2] || '0';
              stockVal = item[3] || 0;
            }
            
            priceStr = String(priceStr).replace(',', '.');
            const price = parseFloat(priceStr) || 0;
            const stock = parseInt(stockVal) || 0;
            
            if (EXCLUDED_NAMES.includes(String(name).trim())) {
              continue;
            }
            
            if (String(name).trim() !== '') {
              const newDocRef = doc(productsRef);
              batch.set(newDocRef, {
                category: String(category).trim(),
                name: String(name).trim(),
                price: price,
                stock: stock
              });
              
              count++;
              operationsInBatch++;
              
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
