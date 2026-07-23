import { describe, it, expect } from 'vitest';

/**
 * CSV Exporter Functionality Tests
 */
describe('CSV Exporter Utility', () => {
  const generateCSVContent = (rows) => {
    if (!rows || !rows.length) return '';
    const separator = ',';
    const keys = Object.keys(rows[0]);
    
    return (
      keys.join(separator) +
      '\n' +
      rows
        .map(row => {
          return keys
            .map(k => {
              let cell = row[k] === null || row[k] === undefined ? '' : row[k];
              cell = cell instanceof Date ? cell.toLocaleString() : String(cell);
              cell = cell.replace(/"/g, '""');
              if (cell.search(/("|,|\n)/g) >= 0) {
                cell = `"${cell}"`;
              }
              return cell;
            })
            .join(separator);
        })
        .join('\n')
    );
  };

  it('formats JSON rows into a valid CSV string with headers', () => {
    const data = [
      { CATEGORIA: 'CON GAS', PRODUCTO: 'Coca-Cola 2L', PRECIO: 13.5, STOCK: 10 },
      { CATEGORIA: 'PIQUEOS', PRODUCTO: 'Papas Fritas', PRECIO: 5.0, STOCK: 15 },
    ];

    const result = generateCSVContent(data);
    const lines = result.split('\n');

    expect(lines[0]).toBe('CATEGORIA,PRODUCTO,PRECIO,STOCK');
    expect(lines[1]).toBe('CON GAS,Coca-Cola 2L,13.5,10');
    expect(lines[2]).toBe('PIQUEOS,Papas Fritas,5,15');
  });

  it('escapes cells containing commas or quotes correctly', () => {
    const data = [
      { TIPO: 'CON GAS', PRODUCTO: 'Refresco "Especial", 2.5L', PRECIO: 15.0 }
    ];

    const result = generateCSVContent(data);
    const lines = result.split('\n');

    expect(lines[1]).toBe('CON GAS,"Refresco ""Especial"", 2.5L",15');
  });
});
