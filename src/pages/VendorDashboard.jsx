import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Search, ShoppingCart, LogOut, Package, CreditCard, Banknote, Coffee, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VendorDashboard = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pos'); // pos, inventory, loans
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchProducts();
  }, []);
  
  const fetchProducts = async () => {
    try {
      // In a real scenario, this gets data from Firestore.
      // Since it might be empty initially, we'll try to fetch.
      const q = query(collection(db, "products"));
      const querySnapshot = await getDocs(q);
      const prods = [];
      querySnapshot.forEach((doc) => {
        prods.push({ id: doc.id, ...doc.data() });
      });
      // Just some mock data if empty for demo purposes, but normally it relies on the CSV importer
      if (prods.length === 0) {
        prods.push({id: '1', name: 'Agua Vital 2L', price: 8, category: 'SIN GAS'});
        prods.push({id: '2', name: 'Agua Vital 600', price: 5.5, category: 'SIN GAS'});
        prods.push({id: '3', name: 'Coca Cola 2L', price: 13, category: 'CON GAS'});
        prods.push({id: '4', name: 'Power Azul', price: 12, category: 'SIN GAS'});
      }
      setProducts(prods);
    } catch (e) {
      console.error("Error fetching products", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? {...item, qty: item.qty + 1} : item));
    } else {
      setCart([...cart, {...product, qty: 1}]);
    }
  };
  
  const clearCart = () => setCart([]);
  
  const processSale = async (method) => {
    if (cart.length === 0) return;
    try {
      const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
      await addDoc(collection(db, "sales"), {
        items: cart,
        total,
        method,
        vendorId: currentUser.uid,
        timestamp: serverTimestamp()
      });
      alert(`Venta registrada con éxito (${method})`);
      setCart([]);
    } catch(e) {
      console.error("Error al registrar venta", e);
      alert('Error registrando venta');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header flex-between">
        <div>
          <h2>Panel de Vendedor</h2>
          <p>Bienvenido, {currentUser?.email}</p>
        </div>
        <button className="btn btn-secondary" onClick={handleLogout}>
          <LogOut size={18} /> Salir
        </button>
      </div>
      
      <div className="tabs">
        <div className={`tab ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>Ventas (POS)</div>
        <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>Inventario Día</div>
        <div className={`tab ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>Préstamos</div>
      </div>
      
      {activeTab === 'pos' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '2fr 1fr'}}>
          <div className="card glass-panel">
            <h3><Coffee size={20} /> Productos</h3>
            <div className="search-bar">
              <Search className="search-icon" size={18} />
              <input 
                type="text" 
                placeholder="Buscar por nombre o tipo..." 
                className="input-field"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {isLoading ? <div className="flex-center" style={{height: '200px'}}>Cargando...</div> : (
              <div className="item-list" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem'}}>
                {filteredProducts.map(p => (
                  <div key={p.id} className="list-item" style={{flexDirection: 'column', alignItems: 'flex-start', cursor: 'pointer'}} onClick={() => addToCart(p)}>
                    <span className="badge badge-success" style={{marginBottom: '0.5rem'}}>{p.category}</span>
                    <h4 style={{marginBottom: '0.25rem'}}>{p.name}</h4>
                    <span className="item-action">Bs. {p.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="card glass-panel cart-section">
            <h3><ShoppingCart size={20} /> Pedido Actual</h3>
            
            <div className="cart-items">
              {cart.length === 0 ? (
                <div className="flex-center" style={{height: '100%', color: 'var(--text-secondary)'}}>
                  No hay productos seleccionados
                </div>
              ) : (
                <div className="item-list">
                  {cart.map(item => (
                    <div key={item.id} className="list-item" style={{padding: '0.5rem 1rem'}}>
                      <div className="item-info">
                        <h4>{item.name}</h4>
                        <p>{item.qty} x Bs. {item.price}</p>
                      </div>
                      <div className="item-action">
                        Bs. {item.qty * item.price}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="cart-total">
              <span>Total:</span>
              <span>Bs. {cartTotal.toFixed(2)}</span>
            </div>
            
            <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
              <button className="btn btn-primary flex-center" style={{flex: 1}} onClick={() => processSale('Efectivo')} disabled={cart.length === 0}>
                <Banknote size={18} /> Efectivo
              </button>
              <button className="btn btn-primary flex-center" style={{flex: 1, backgroundColor: '#10b981'}} onClick={() => processSale('QR')} disabled={cart.length === 0}>
                <CreditCard size={18} /> QR
              </button>
            </div>
            <button className="btn btn-danger btn-block" onClick={clearCart} disabled={cart.length === 0}>
              Limpiar
            </button>
          </div>
        </div>
      )}
      
      {activeTab === 'inventory' && (
        <div className="card glass-panel">
          <h3><Package size={20} /> Inventario del Día</h3>
          <p>Vista rápida de existencias (funcionalidad en construcción para la Demo).</p>
        </div>
      )}
      
      {activeTab === 'loans' && (
        <div className="card glass-panel">
          <h3><History size={20} /> Gestión de Préstamos</h3>
          <p>Registro y cobro de productos entregados a préstamo (funcionalidad en construcción para la Demo).</p>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
