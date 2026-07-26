import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseAndUploadCSV } from '../utils/csvParser';
import Papa from 'papaparse';

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn()
  }
}));

vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    commit: vi.fn(() => Promise.resolve())
  }))
}));

describe('CSV Parsing & Formatting Pre-Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves successfully for valid CSV rows with header', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({
        data: [
          {
            'Producto (Descripción)': 'Coca Cola 2L',
            'Categoría': 'Bebidas',
            'Precio Venta (Bs.)': '13.50',
            'Precio Compra (Bs.)': '10.00',
            'Stock Actual': '50',
            'Stock Mínimo': '5'
          }
        ]
      });
    });

    const file = new File([''], 'test.csv');
    const result = await parseAndUploadCSV(file, true);
    expect(result).toContain('Se subieron 1 productos exitosamente.');
  });

  it('rejects with descriptive errors when fields have invalid format', async () => {
    Papa.parse.mockImplementation((file, options) => {
      options.complete({
        data: [
          {
            'Producto (Descripción)': '', // empty
            'Categoría': '12345', // numeric string
            'Precio Venta (Bs.)': 'abc', // non-decimal
            'Precio Compra (Bs.)': '1.5.0', // non-decimal
            'Stock Actual': '10.5', // float instead of int
            'Stock Mínimo': 'xyz' // non-integer
          }
        ]
      });
    });

    const file = new File([''], 'test.csv');
    await expect(parseAndUploadCSV(file, true)).rejects.toThrow(/Errores de formato/);
  });
});
