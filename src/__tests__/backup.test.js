import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAllToExcel } from '../utils/excelExporter';
import * as XLSX from 'xlsx';

vi.mock('xlsx', () => {
  const mockBook = {
    SheetNames: [],
    Sheets: {}
  };
  return {
    utils: {
      book_new: vi.fn(() => mockBook),
      json_to_sheet: vi.fn(data => data),
      book_append_sheet: vi.fn((wb, ws, name) => {
        wb.SheetNames.push(name);
        wb.Sheets[name] = ws;
      })
    },
    writeFile: vi.fn()
  };
});

describe('Database XLSX Backup Exporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly maps and exports multiple collections into individual worksheets', () => {
    const sampleData = {
      products: [
        { id: 'p1', name: 'Product A', price: 10, isDeleted: false },
        { id: 'p2', name: 'Product B', price: 12, costPrice: 9.6 }
      ]
    };

    exportAllToExcel(sampleData);

    // Should create workbook
    expect(XLSX.utils.book_new).toHaveBeenCalled();

    // Should create worksheets for all 18 configured settings & collections
    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledTimes(18);

    // Verify Spanish sheet name mappings
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      'Productos'
    );
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      'Ventas'
    );
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      'Categorías'
    );

    // Verify writeFile was called with backup filename
    expect(XLSX.writeFile).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringMatching(/^backup_.+_\d{4}-\d{2}-\d{2}\.xlsx$/)
    );
  });
});
