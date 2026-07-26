import * as XLSX from 'xlsx';

/**
 * Exports all database collections to a single XLSX file, each as a separate worksheet.
 * Serializes dates and complex structures to text to allow complete reconstruction.
 * 
 * @param {Object} collectionsData Object where keys are collection names and values are arrays of document objects.
 */
export const exportAllToExcel = (collectionsData) => {
  const wb = XLSX.utils.book_new();

  Object.entries(collectionsData).forEach(([collectionName, docs]) => {
    let normalizedRows = [];
    if (docs && docs.length > 0) {
      normalizedRows = docs.map(doc => {
        // Place Document ID first to establish recovery primary keys
        const row = { id: doc.id || '' };
        
        Object.entries(doc).forEach(([key, val]) => {
          if (key === 'id') return;
          
          if (val === null || val === undefined) {
            row[key] = '';
          } else if (val instanceof Date) {
            row[key] = val.toISOString();
          } else if (typeof val === 'object') {
            // Normalize Firestore Timestamp objects
            if (val.seconds !== undefined && typeof val.seconds === 'number' && val.nanoseconds !== undefined) {
              try {
                row[key] = new Date(val.seconds * 1000).toISOString();
              } catch (e) {
                row[key] = JSON.stringify(val);
              }
            } else {
              row[key] = JSON.stringify(val);
            }
          } else {
            row[key] = val;
          }
        });
        return row;
      });
    } else {
      normalizedRows = [{ 'Estado': 'Sin datos en esta colección' }];
    }

    const ws = XLSX.utils.json_to_sheet(normalizedRows);
    
    // Sheet name length constraint: max 31 characters, remove forbidden characters
    let sheetName = collectionName.substring(0, 31).replace(/[\\\/\?\*\:\[\]]/g, '_');
    if (!sheetName) sheetName = 'Hoja';
    
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const projectSuffix = import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'laestacion';
  XLSX.writeFile(wb, `backup_${projectSuffix}_${dateStr}.xlsx`);
};
