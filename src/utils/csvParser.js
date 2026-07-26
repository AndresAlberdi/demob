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
          const errors = [];
          const validatedRows = [];

          for (let i = 0; i < rows.length; i++) {
            const item = rows[i];
            const rowNum = i + (hasHeader ? 2 : 1); // 1-based, offset by header row

            let category = '';
            let name = '';
            let priceStr = '';
            let costStr = '';
            let stockStr = '';
            let minStockStr = '';

            if (hasHeader) {
              name = item['Producto (Descripción)'] || item['Producto'] || item['PRODUCTO'] || item['Nombre'] || item['name'] || '';
              category = item['Categoría'] || item['Categoria'] || item['category'] || '';
              priceStr = item['Precio Venta (Bs.)'] || item['Precio Venta'] || item['Precio'] || item['price'] || '';
              costStr = item['Precio Compra (Bs.)'] || item['Precio Compra'] || item['Costo'] || item['costPrice'] || '';
              stockStr = item['Stock Actual'] || item['Stock'] || item['stock'] || '';
              minStockStr = item['Stock Mínimo'] || item['minStock'] || '';
            } else {
              category = item[1] || '';
              name = item[0] || '';
              priceStr = item[2] || '';
              costStr = item[3] || '';
              stockStr = item[4] || '';
              minStockStr = item[5] || '';
            }

            name = String(name).trim();
            category = String(category).trim();
            priceStr = String(priceStr).trim().replace(',', '.');
            costStr = String(costStr).trim().replace(',', '.');
            stockStr = String(stockStr).trim();
            minStockStr = String(minStockStr).trim();

            // Skip completely empty rows
            if (name === '' && category === '' && priceStr === '' && stockStr === '') {
              continue;
            }

            // Excluded names skip
            if (EXCLUDED_NAMES.includes(name)) {
              continue;
            }

            const rowErrors = [];

            // 1. Validate Producto (alphabetic/text, required)
            if (name === '') {
              rowErrors.push("el campo 'Producto' es requerido y no puede estar vacío");
            } else if (!isNaN(name)) {
              rowErrors.push(`el campo 'Producto' ('${name}') no debe ser puramente numérico`);
            }

            // 2. Validate Categoría (alphabetic/text)
            if (category !== '' && !isNaN(category)) {
              rowErrors.push(`el campo 'Categoría' ('${category}') debe ser texto, no puramente numérico`);
            }

            // 3. Validate Precio Venta (decimal)
            if (priceStr === '') {
              rowErrors.push("el campo 'Precio Venta (Bs.)' es requerido");
            } else if (!/^\d+(\.\d+)?$/.test(priceStr)) {
              rowErrors.push(`el campo 'Precio Venta (Bs.)' ('${priceStr}') debe ser un número decimal válido`);
            }

            // 4. Validate Precio Compra (decimal)
            if (costStr !== '' && !/^\d+(\.\d+)?$/.test(costStr)) {
              rowErrors.push(`el campo 'Precio Compra (Bs.)' ('${costStr}') debe ser un número decimal válido`);
            }

            // 5. Validate Stock Actual (integer)
            if (stockStr === '') {
              rowErrors.push("el campo 'Stock Actual' es requerido");
            } else if (!/^\d+$/.test(stockStr)) {
              rowErrors.push(`el campo 'Stock Actual' ('${stockStr}') debe ser un número entero válido`);
            }

            // 6. Validate Stock Mínimo (integer)
            if (minStockStr !== '' && !/^\d+$/.test(minStockStr)) {
              rowErrors.push(`el campo 'Stock Mínimo' ('${minStockStr}') debe ser un número entero válido`);
            }

            if (rowErrors.length > 0) {
              errors.push(`Fila ${rowNum}: ${rowErrors.join(', ')}.`);
            } else {
              const price = parseFloat(priceStr) || 0;
              const stock = parseInt(stockStr, 10) || 0;
              const costPrice = costStr !== '' ? parseFloat(costStr) : Math.round(price * 0.8 * 100) / 100;
              const minStock = minStockStr !== '' ? parseInt(minStockStr, 10) : 3;

              validatedRows.push({
                category: category || 'GENERAL',
                name: name,
                price: price,
                costPrice: costPrice,
                stock: stock,
                minStock: minStock,
                isDeleted: false
              });
            }
          }

          if (errors.length > 0) {
            const errorMsg = "Errores de formato en el archivo CSV:\n" + errors.slice(0, 10).join("\n") + (errors.length > 10 ? `\n... y ${errors.length - 10} errores más.` : "");
            reject(new Error(errorMsg));
            return;
          }

          for (const item of validatedRows) {
            const newDocRef = doc(productsRef);
            batch.set(newDocRef, item);
            
            count++;
            operationsInBatch++;
            
            if (operationsInBatch === 490) {
                await batch.commit();
                batch = writeBatch(db);
                operationsInBatch = 0;
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
