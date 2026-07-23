import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, where, updateDoc, doc } from 'firebase/firestore';
import { Search, ShoppingCart, LogOut, Package, CreditCard, Banknote, Coffee, History, AlertTriangle, Send, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VendorDashboard = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Data States
  const [products, setProducts] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [cart, setCart] = useState([]);
  const [loans, setLoans] = useState([]);
  
  // UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pos'); // pos, inventory, loans, losses, orders
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Shift States
  const [activeShift, setActiveShift] = useState(null);
  const [startCash, setStartCash] = useState('');
  const [endCash, setEndCash] = useState('');
  
  // Forms States
  const [loanForm, setLoanForm] = useState({ name: '' });
  const [lossForm, setLossForm] = useState({ reason: '', productId: '', qty: 1 });
  const [orderForm, setOrderForm] = useState({ type: 'pedido', description: '', amount: '', receipt: false });

  useEffect(() => {
    if (currentUser) {
      loadInitialData();
    }
  }, [currentUser]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // Load products
      const pSnapshot = await getDocs(query(collection(db, "products")));
      const prods = [];
      pSnapshot.forEach(doc => prods.push({ id: doc.id, ...doc.data() }));
      setProducts(prods.sort((a,b) => a.name.localeCompare(b.name)));

      // Load motivos
      const mSnapshot = await getDocs(query(collection(db, "settings")));
      mSnapshot.forEach(doc => {
        if (doc.id === 'motivos') setMotivos(doc.data().list || []);
      });

      // Check active shift
      const sQuery = query(collection(db, "shifts"), where("vendorId", "==", currentUser.uid), where("status", "==", "open"));
      const sSnapshot = await getDocs(sQuery);
      if (!sSnapshot.empty) {
        setActiveShift({ id: sSnapshot.docs[0].id, ...sSnapshot.docs[0].data() });
      }

      // Load pending loans
      const lQuery = query(collection(db, "loans"), where("status", "==", "pending"));
      const lSnapshot = await getDocs(lQuery);
      const lns = [];
      lSnapshot.forEach(doc => lns.push({ id: doc.id, ...doc.data() }));
      setLoans(lns);

    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // --- SHIFT LOGIC ---
  const openShift = async (e) => {
    e.preventDefault();
    if (!startCash || isNaN(startCash)) return alert('Ingrese un monto válido');
    setIsSubmitting(true);
    try {
      const shiftData = {
        vendorId: currentUser.uid,
        vendorName: currentUser.email || currentUser.name || 'Vendedor',
        startTime: serverTimestamp(),
        startCash: parseFloat(startCash),
        status: 'open'
      };
      const docRef = await addDoc(collection(db, "shifts"), shiftData);
      setActiveShift({ id: docRef.id, ...shiftData });
    } catch (e) {
      alert('Error abriendo turno');
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeShift = async (e) => {
    e.preventDefault();
    if (!endCash || isNaN(endCash)) return alert('Ingrese el dinero físico actual');
    setIsSubmitting(true);
    try {
      // Calc sales during shift
      const salesQuery = query(collection(db, "sales"), where("shiftId", "==", activeShift.id));
      const salesSnap = await getDocs(salesQuery);
      let totalCashSales = 0;
      let totalQRSales = 0;
      salesSnap.forEach(d => {
        if (d.data().method === 'Efectivo') totalCashSales += d.data().total;
        if (d.data().method === 'QR') totalQRSales += d.data().total;
      });

      const expectedCash = activeShift.startCash + totalCashSales;
      const physicalCash = parseFloat(endCash);
      const difference = physicalCash - expectedCash;

      await updateDoc(doc(db, "shifts", activeShift.id), {
        endTime: serverTimestamp(),
        endCash: physicalCash,
        expectedCash,
        totalCashSales,
        totalQRSales,
        difference,
        status: 'closed'
      });

      alert(`Turno cerrado.\nEsperado en caja: Bs. ${expectedCash.toFixed(2)}\nFísico: Bs. ${physicalCash.toFixed(2)}\nDiferencia: Bs. ${difference.toFixed(2)}`);
      setActiveShift(null);
      setEndCash('');
    } catch (e) {
      alert('Error cerrando turno');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- POS LOGIC ---
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
    setIsSubmitting(true);
    try {
      const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
      
      await addDoc(collection(db, "sales"), {
        items: cart.map(i => ({id: i.id, name: i.name, qty: i.qty, price: i.price})),
        total,
        method,
        vendorId: currentUser.uid,
        shiftId: activeShift.id,
        timestamp: serverTimestamp()
      });

      // Update inventory (Simplified: just deduct stock)
      for (const item of cart) {
        const pRef = doc(db, "products", item.id);
        const pDoc = products.find(p => p.id === item.id);
        if(pDoc) {
          await updateDoc(pRef, { stock: (pDoc.stock || 0) - item.qty });
        }
      }

      alert(`Venta registrada con éxito (${method})`);
      setCart([]);
      loadInitialData(); // Refresh stock
    } catch(e) {
      console.error("Error al registrar venta", e);
      alert('Error registrando venta');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- LOANS LOGIC ---
  const registerLoan = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert('Agregue productos al pedido primero');
    if (!loanForm.name.trim()) return alert('Ingrese el nombre del prestatario');
    setIsSubmitting(true);
    try {
      const total = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
      await addDoc(collection(db, "loans"), {
        borrower: loanForm.name,
        items: cart.map(i => ({id: i.id, name: i.name, qty: i.qty, price: i.price})),
        total,
        vendorId: currentUser.uid,
        shiftId: activeShift.id,
        timestamp: serverTimestamp(),
        status: 'pending'
      });
      alert('Préstamo registrado');
      setCart([]);
      setLoanForm({name: ''});
      loadInitialData();
    } catch (e) {
      alert('Error registrando préstamo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const payLoan = async (loan) => {
    if(!window.confirm(`¿Confirmar pago de Bs. ${loan.total} por ${loan.borrower}?`)) return;
    try {
      await updateDoc(doc(db, "loans", loan.id), {
        status: 'paid',
        paidAt: serverTimestamp(),
        paidToShiftId: activeShift.id
      });
      // Register as income in this shift
      await addDoc(collection(db, "sales"), {
        items: [{id: 'loan_payment', name: `Pago de Préstamo: ${loan.borrower}`, qty: 1, price: loan.total}],
        total: loan.total,
        method: 'Efectivo',
        vendorId: currentUser.uid,
        shiftId: activeShift.id,
        timestamp: serverTimestamp(),
        isLoanPayment: true
      });
      alert('Pago registrado correctamente');
      loadInitialData();
    } catch (e) {
      alert('Error registrando pago');
    }
  };

  // --- LOSSES LOGIC ---
  const registerLoss = async (e) => {
    e.preventDefault();
    if(!lossForm.productId || !lossForm.reason) return alert('Seleccione producto y motivo');
    setIsSubmitting(true);
    try {
      const p = products.find(prod => prod.id === lossForm.productId);
      await addDoc(collection(db, "losses"), {
        productId: p.id,
        productName: p.name,
        qty: parseInt(lossForm.qty),
        reason: lossForm.reason,
        vendorId: currentUser.uid,
        shiftId: activeShift.id,
        timestamp: serverTimestamp(),
        status: 'pending' // Requires admin approval
      });
      alert('Reporte de pérdida enviado a administración');
      setLossForm({ reason: '', productId: '', qty: 1 });
    } catch(e) {
      alert('Error reportando pérdida');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- ORDERS / EXPENSES LOGIC ---
  const registerOrder = async (e) => {
    e.preventDefault();
    if(!orderForm.description || !orderForm.amount) return alert('Complete los datos');
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "orders"), {
        type: orderForm.type, // 'pedido' o 'compra'
        description: orderForm.description,
        amount: parseFloat(orderForm.amount),
        hasReceipt: orderForm.receipt,
        vendorId: currentUser.uid,
        shiftId: activeShift.id,
        timestamp: serverTimestamp()
      });
      alert('Registro guardado exitosamente');
      setOrderForm({ type: 'pedido', description: '', amount: '', receipt: false });
    } catch(e) {
      alert('Error registrando orden');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RENDER HELPERS ---
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  if (isLoading) return <div className="flex-center" style={{height: '100vh'}}><Coffee className="spinner" size={48} /></div>;

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header flex-between">
        <div>
          <h2>Panel de Vendedor (POS)</h2>
          <p>Usuario: {currentUser?.email || currentUser?.name}</p>
        </div>
        <div style={{display: 'flex', gap: '1rem'}}>
          {currentUser && (currentUser.email === 'admin@demob.com' || currentUser.email === 'pretsodatabase@gmail.com') && (
            <button className="btn btn-primary" onClick={() => navigate('/admin')}>
              Panel Admin
            </button>
          )}
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </div>

      {!activeShift ? (
        <div className="flex-center" style={{height: '60vh'}}>
          <div className="card glass-panel" style={{width: '400px', textAlign: 'center'}}>
            <Clock size={48} style={{margin: '0 auto 1rem', color: 'var(--primary)'}} />
            <h3>Abrir Turno</h3>
            <p style={{marginBottom: '1.5rem', color: 'var(--text-secondary)'}}>Debe abrir su caja para comenzar a registrar ventas.</p>
            <form onSubmit={openShift}>
              <div className="form-group" style={{textAlign: 'left'}}>
                <label>Efectivo Inicial en Caja (Bs.)</label>
                <input 
                  type="number" 
                  step="0.10"
                  className="input-field" 
                  value={startCash}
                  onChange={e => setStartCash(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={isSubmitting}>
                Iniciar Turno
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <div className="tabs">
            <div className={`tab ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>Ventas (POS)</div>
            <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>Inventario</div>
            <div className={`tab ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>Préstamos</div>
            <div className={`tab ${activeTab === 'losses' ? 'active' : ''}`} onClick={() => setActiveTab('losses')}>Pérdidas</div>
            <div className={`tab ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>Compras/Pedidos</div>
            <div className={`tab ${activeTab === 'shift' ? 'active' : ''}`} onClick={() => setActiveTab('shift')} style={{marginLeft: 'auto', color: 'var(--danger)'}}>
              Cerrar Caja
            </div>
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
                
                <div className="item-list" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', maxHeight: '500px', overflowY: 'auto', padding: '0.5rem'}}>
                  {filteredProducts.map(p => (
                    <div key={p.id} className="list-item" style={{flexDirection: 'column', alignItems: 'center', cursor: 'pointer', textAlign: 'center', padding: '1rem'}} onClick={() => addToCart(p)}>
                      <span className="badge badge-success" style={{marginBottom: '0.5rem', fontSize: '0.7rem'}}>{p.category}</span>
                      <h4 style={{marginBottom: '0.5rem', fontSize: '0.9rem'}}>{p.name}</h4>
                      <span className="item-action" style={{fontSize: '1.1rem'}}>Bs. {p.price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="card glass-panel cart-section">
                <h3><ShoppingCart size={20} /> Pedido Actual</h3>
                
                <div className="cart-items" style={{maxHeight: '300px', overflowY: 'auto'}}>
                  {cart.length === 0 ? (
                    <div className="flex-center" style={{height: '100%', color: 'var(--text-secondary)'}}>
                      No hay productos seleccionados
                    </div>
                  ) : (
                    <div className="item-list">
                      {cart.map(item => (
                        <div key={item.id} className="list-item" style={{padding: '0.5rem'}}>
                          <div className="item-info">
                            <h4 style={{fontSize: '0.9rem'}}>{item.name}</h4>
                            <p style={{fontSize: '0.8rem'}}>{item.qty} x Bs. {item.price}</p>
                          </div>
                          <div className="item-action" style={{fontSize: '0.9rem'}}>
                            Bs. {(item.qty * item.price).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="cart-total" style={{marginTop: 'auto', padding: '1rem 0', borderTop: '1px solid rgba(0,0,0,0.1)'}}>
                  <span style={{fontWeight: 'bold', fontSize: '1.2rem'}}>Total:</span>
                  <span style={{fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--primary)'}}>Bs. {cartTotal.toFixed(2)}</span>
                </div>
                
                <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
                  <button className="btn btn-primary flex-center" style={{flex: 1, padding: '1rem'}} onClick={() => processSale('Efectivo')} disabled={cart.length === 0 || isSubmitting}>
                    <Banknote size={18} /> Efectivo
                  </button>
                  <button className="btn btn-primary flex-center" style={{flex: 1, padding: '1rem', backgroundColor: '#10b981'}} onClick={() => processSale('QR')} disabled={cart.length === 0 || isSubmitting}>
                    <CreditCard size={18} /> QR
                  </button>
                </div>
                
                {/* Loans integration in POS */}
                <form onSubmit={registerLoan} style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderTop: '1px dashed rgba(0,0,0,0.2)', paddingTop: '1rem'}}>
                  <input type="text" className="input-field" placeholder="Nombre prestatario" value={loanForm.name} onChange={e=>setLoanForm({...loanForm, name: e.target.value})} style={{flex: 1}}/>
                  <button type="submit" className="btn btn-secondary" disabled={cart.length === 0 || isSubmitting}>A Préstamo</button>
                </form>

                <button className="btn btn-danger btn-block" onClick={clearCart} disabled={cart.length === 0}>
                  Limpiar Lista
                </button>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (
            <div className="card glass-panel">
              <h3><Package size={20} /> Inventario Actual</h3>
              <p style={{marginBottom: '1rem'}}>Vista de existencias. Solo el administrador puede editar cantidades.</p>
              
              <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '1rem'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Producto</th>
                    <th style={{padding: '0.5rem'}}>Categoría</th>
                    <th style={{padding: '0.5rem'}}>Precio</th>
                    <th style={{padding: '0.5rem', textAlign: 'right'}}>Stock Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem'}}>{p.name}</td>
                      <td style={{padding: '0.5rem'}}>{p.category}</td>
                      <td style={{padding: '0.5rem'}}>Bs. {p.price.toFixed(2)}</td>
                      <td style={{padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: p.stock <= 0 ? 'var(--danger)' : 'inherit'}}>{p.stock || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'loans' && (
            <div className="card glass-panel">
              <h3><History size={20} /> Préstamos Activos</h3>
              {loans.length === 0 ? (
                <p>No hay préstamos pendientes.</p>
              ) : (
                <div className="item-list">
                  {loans.map(loan => (
                    <div key={loan.id} className="list-item">
                      <div className="item-info">
                        <h4>{loan.borrower}</h4>
                        <p style={{fontSize: '0.8rem'}}>
                          {loan.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                        </p>
                      </div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                        <span style={{fontWeight: 'bold', color: 'var(--danger)'}}>Bs. {loan.total.toFixed(2)}</span>
                        <button className="btn btn-success" onClick={() => payLoan(loan)}>Registrar Pago</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'losses' && (
            <div className="card glass-panel" style={{maxWidth: '600px', margin: '0 auto'}}>
              <h3><AlertTriangle size={20} /> Reportar Pérdida o Robo</h3>
              <form onSubmit={registerLoss}>
                <div className="form-group">
                  <label>Producto</label>
                  <select className="input-field" value={lossForm.productId} onChange={e=>setLossForm({...lossForm, productId: e.target.value})} required>
                    <option value="">Seleccione un producto...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Cantidad</label>
                  <input type="number" min="1" className="input-field" value={lossForm.qty} onChange={e=>setLossForm({...lossForm, qty: e.target.value})} required/>
                </div>
                <div className="form-group">
                  <label>Motivo</label>
                  <select className="input-field" value={lossForm.reason} onChange={e=>setLossForm({...lossForm, reason: e.target.value})} required>
                    <option value="">Seleccione un motivo...</option>
                    {motivos.length > 0 ? motivos.map(m => <option key={m} value={m}>{m}</option>) : (
                      <>
                        <option value="Rotura">Rotura</option>
                        <option value="Vencimiento">Vencimiento</option>
                        <option value="Consumo Personal">Consumo Personal</option>
                        <option value="Robo">Robo</option>
                      </>
                    )}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Enviar a Administración</button>
              </form>
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="card glass-panel" style={{maxWidth: '600px', margin: '0 auto'}}>
              <h3><Send size={20} /> Registrar Compra o Pedido</h3>
              <form onSubmit={registerOrder}>
                <div className="form-group">
                  <label>Tipo de Egreso</label>
                  <select className="input-field" value={orderForm.type} onChange={e=>setOrderForm({...orderForm, type: e.target.value})} required>
                    <option value="pedido">Pedido a Distribuidor (Bebidas, etc.)</option>
                    <option value="compra">Compra Varia (Insumos, limpieza, etc.)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Descripción del Gasto</label>
                  <input type="text" className="input-field" value={orderForm.description} onChange={e=>setOrderForm({...orderForm, description: e.target.value})} placeholder="Ej: Pago Coca-Cola, Trapos..." required/>
                </div>
                <div className="form-group">
                  <label>Monto (Bs.)</label>
                  <input type="number" step="0.10" className="input-field" value={orderForm.amount} onChange={e=>setOrderForm({...orderForm, amount: e.target.value})} required/>
                </div>
                <div className="form-group" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <input type="checkbox" id="receipt" checked={orderForm.receipt} onChange={e=>setOrderForm({...orderForm, receipt: e.target.checked})} />
                  <label htmlFor="receipt" style={{margin: 0}}>¿Tiene Factura o Recibo?</label>
                </div>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Registrar Gasto</button>
              </form>
            </div>
          )}

          {activeTab === 'shift' && (
            <div className="card glass-panel" style={{maxWidth: '500px', margin: '0 auto', textAlign: 'center'}}>
              <h3><Clock size={20} /> Arqueo y Cierre de Caja</h3>
              <p style={{marginBottom: '1rem'}}>Para cerrar su turno, cuente el dinero físico que tiene en caja actualmente.</p>
              <form onSubmit={closeShift}>
                <div className="form-group" style={{textAlign: 'left'}}>
                  <label>Dinero Físico en Caja (Bs.)</label>
                  <input 
                    type="number" 
                    step="0.10"
                    className="input-field" 
                    value={endCash}
                    onChange={e => setEndCash(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-danger btn-block" disabled={isSubmitting}>
                  Confirmar y Cerrar Turno
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VendorDashboard;
