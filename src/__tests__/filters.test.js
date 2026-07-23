import { describe, it, expect } from 'vitest';

/**
 * Product & Inventory Filtering Logic Tests
 */
describe('Product & Inventory Filtering Rules', () => {
  const sampleProducts = [
    { id: '1', name: 'Coca-Cola 2L', category: 'CON GAS', price: 13.5, stock: 10, isDeleted: false },
    { id: '2', name: 'Fanta 2L', category: 'CON GAS', price: 12.0, stock: 0, isDeleted: false },
    { id: '3', name: 'Agua Vital 600ml', category: 'SIN GAS', price: 5.5, stock: 20, isDeleted: false },
    { id: '4', name: 'Papas Fritas', category: 'PIQUEOS', price: 5.0, stock: 15, isDeleted: true }, // Soft deleted
  ];

  const filterPOSProducts = (products, search, categoryFilter, minPrice, maxPrice) => {
    return products.filter(p => {
      if (p.isDeleted) return false;
      if ((p.stock !== undefined ? p.stock : 0) <= 0) return false; // POS hides 0 stock!

      const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase());
      const matchesCat = categoryFilter === 'todas' || p.category === categoryFilter;
      const price = p.price || 0;
      const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
      const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);

      return matchesSearch && matchesCat && matchesMin && matchesMax;
    });
  };

  const filterInventoryProducts = (products, search, categoryFilter, minPrice, maxPrice) => {
    return products.filter(p => {
      if (p.isDeleted) return false; // Admin inventory hides deleted items

      const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase());
      const matchesCat = categoryFilter === 'todas' || p.category === categoryFilter;
      const price = p.price || 0;
      const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
      const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);

      return matchesSearch && matchesCat && matchesMin && matchesMax;
    });
  };

  it('hides deleted products and zero-stock products from POS grid', () => {
    const posList = filterPOSProducts(sampleProducts, '', 'todas', '', '');
    expect(posList).toHaveLength(2); // Only Coca-Cola and Agua Vital
    expect(posList.map(p => p.id)).toEqual(['1', '3']);
  });

  it('shows zero-stock items in Admin Inventory but hides soft-deleted items', () => {
    const invList = filterInventoryProducts(sampleProducts, '', 'todas', '', '');
    expect(invList).toHaveLength(3); // Coca-Cola, Fanta (stock 0), Agua Vital
    expect(invList.map(p => p.id)).toEqual(['1', '2', '3']);
  });

  it('filters correctly by category (Tipo)', () => {
    const conGasPOS = filterPOSProducts(sampleProducts, '', 'CON GAS', '', '');
    expect(conGasPOS).toHaveLength(1);
    expect(conGasPOS[0].name).toBe('Coca-Cola 2L');
  });

  it('filters correctly by price range (Min / Max)', () => {
    const cheapProducts = filterInventoryProducts(sampleProducts, '', 'todas', '5.0', '10.0');
    expect(cheapProducts).toHaveLength(1);
    expect(cheapProducts[0].name).toBe('Agua Vital 600ml');
  });
});
