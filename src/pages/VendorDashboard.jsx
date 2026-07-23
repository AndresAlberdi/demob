import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, where, updateDoc, doc, increment } from 'firebase/firestore';
import { Search, ShoppingCart, LogOut, Package, CreditCard, Banknote, Coffee, History, AlertTriangle, Send, Clock, ShieldAlert, Download, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV } from '../utils/csvExporter';

const VendorDashboard = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Data States
  const [products, setProducts] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [cart, setCart] = useState([]);
  const [loans, setLoans] = useState([]);
  
  // UI & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('todas');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [activeTab, setActiveTab] = useState('pos'); // pos, inventory, loans, losses, orders, history
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shiftOperations, setShiftOperations] = useState([]);
  
  // Shift States
  const [activeShift, setActiveShift] = useState(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [activeShiftVendor, setActiveShiftVendor] = useState('');
  const [startCash, setStartCash] = useState('');
  const [endCash, setEndCash] = useState('');
  
  // Forms States
  const [loanForm, setLoanForm] = useState({ name: '' });
  const [lossForm, setLossForm] = useState({ reason: '', productId: '', qty: 1 });
  const [orderForm, setOrderForm] = useState({ type: 'pedido', description: '', amount: '', receiptType: 'ninguno', receiptNumber: '' });
  const [currentCash, setCurrentCash] = useState(0);
  
  // Vendor Self PIN Change State
  const [showPinModal, setShowPinModal] = useState(false);
  const [newVendorPin, setNewVendorPin] = useState('');

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

      // Check active shift globally across store
      const sQuery = query(collection(db, "shifts"), where("status", "==", "open"));
      const sSnapshot = await getDocs(sQuery);
      if (!sSnapshot.empty) {
        const globalShiftDoc = sSnapshot.docs[0];
        const globalShiftData = globalShiftDoc.data();
        const globalShiftId = globalShiftDoc.id;
        
        const myName = currentUser.name || currentUser.email;
        const isMyShift = globalShiftData.vendorId === currentUser.uid || globalShiftData.vendorName === myName;
        
        if (isMyShift) {
          setActiveShift({ id: globalShiftId, ...globalShiftData });
          setIsReadOnly(false);
          setActiveShiftVendor('');
        } else {
          setActiveShift(null);
          setIsReadOnly(true);
          setActiveShiftVendor(globalShiftData.vendorName || 'otro vendedor');
        }

        let cashBalance = globalShiftData.startCash;
        
        const salesQuery = query(collection(db, "sales"), where("shiftId", "==", globalShiftId));
        const salesSnap = await getDocs(salesQuery);
        salesSnap.forEach(d => {
          if (d.data().method === 'Efectivo') cashBalance += d.data().total;
        });
        
        const ordersQuery = query(collection(db, "orders"), where("shiftId", "==", globalShiftId));
        const ordersSnap = await getDocs(ordersQuery);
        ordersSnap.forEach(d => {
          cashBalance -= d.data().amount;
        });
        
        setCurrentCash(cashBalance);
        // Load shift operations
        const salesQ = query(collection(db, "sales"), where("shiftId", "==", globalShiftId));
        const salesS = await getDocs(salesQ);
        const sList = salesS.docs.map(d => ({ 
          id: d.id, 
          opType: 'Venta', 
          detail: d.data().items?.map(i => `${i.qty}x ${i.name}`).join(', ') || 'Venta',
          amount: d.data().total,
          method: d.data().method,
          rawTime: d.data().timestamp,
          time: d.data().timestamp ? new Date(d.data().timestamp.toDate()).toLocaleTimeString() : 'Reciente'
        }));

        const ordersQ = query(collection(db, "orders"), where("shiftId", "==", globalShiftId));
        const ordersS = await getDocs(ordersQ);
        const oList = ordersS.docs.map(d => ({ 
          id: d.id, 
          opType: `Gasto (${d.data().type})`, 
          detail: `${d.data().description} ${d.data().receiptNumber ? `[${d.data().receiptType}: ${d.data().receiptNumber}]` : ''}`,
          amount: -d.data().amount,
          method: 'Efectivo',
          rawTime: d.data().timestamp,
          time: d.data().timestamp ? new Date(d.data().timestamp.toDate()).toLocaleTimeString() : 'Reciente'
        }));

        const lossesQ = query(collection(db, "losses"), where("shiftId", "==", globalShiftId));
        const lossesS = await getDocs(lossesQ);
        const lList = lossesS.docs.map(d => ({ 
          id: d.id, 
          opType: 'Reporte Pérdida', 
          detail: `${d.data().qty}x ${d.data().productName} (${d.data().reason})`,
          amount: 0,
          method: '-',
          rawTime: d.data().timestamp,
          time: d.data().timestamp ? new Date(d.data().timestamp.toDate()).toLocaleTimeString() : 'Reciente'
        }));

        const sortedOps = [...sList, ...oList, ...lList].sort((a,b) => (b.rawTime?.seconds || 0) - (a.rawTime?.seconds || 0));
        setShiftOperations(sortedOps);
      } else {
        setActiveShift(null);
        setIsReadOnly(false);
        setActiveShiftVendor('');
        setCurrentCash(0);
        setShiftOperations([]);
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
    if (isReadOnly) return alert(`No puedes abrir un turno. Hay un turno activo asignado a ${activeShiftVendor}.`);
    if (!startCash || isNaN(startCash)) return alert('Ingrese un monto válido');
    setIsSubmitting(true);
    try {
      const shiftData = {
        vendorId: currentUser.uid,
        vendorName: currentUser.name || currentUser.email,
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
      // Calc sales & expenses during shift
      const salesQuery = query(collection(db, "sales"), where("shiftId", "==", activeShift.id));
      const salesSnap = await getDocs(salesQuery);
      let totalCashSales = 0;
      let totalQRSales = 0;
      salesSnap.forEach(d => {
        if (d.data().method === 'Efectivo') totalCashSales += d.data().total;
        if (d.data().method === 'QR') totalQRSales += d.data().total;
      });

      const ordersQuery = query(collection(db, "orders"), where("shiftId", "==", activeShift.id));
      const ordersSnap = await getDocs(ordersQuery);
      let totalExpenses = 0;
      ordersSnap.forEach(d => {
        totalExpenses += d.data().amount;
      });

      const expectedCash = activeShift.startCash + totalCashSales - totalExpenses;
      const physicalCash = parseFloat(endCash);
      const difference = physicalCash - expectedCash;

      await updateDoc(doc(db, "shifts", activeShift.id), {
        endTime: serverTimestamp(),
        endCash: physicalCash,
        expectedCash,
        totalCashSales,
        totalQRSales,
        totalExpenses,
        difference,
        status: 'closed'
      });

      alert(`Turno cerrado con éxito.\n\n--- CAJA LOCAL (EFECTIVO) ---\nEsperado en caja: Bs. ${expectedCash.toFixed(2)}\nFísico contado: Bs. ${physicalCash.toFixed(2)}\nDiferencia: Bs. ${difference.toFixed(2)}\n\n--- BANCO (QR) ---\nVentas por QR: Bs. ${totalQRSales.toFixed(2)}`);
      setActiveShift(null);
      setEndCash('');
    } catch (e) {
      alert('Error cerrando turno');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    if (newVendorPin.length !== 6) return alert("El PIN debe tener exactamente 6 dígitos.");
    if (!currentUser?.id) return alert("No se pudo identificar el usuario.");
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, "app_users", currentUser.id), { pin: newVendorPin });
      alert("Su PIN fue cambiado exitosamente.");
      setShowPinModal(false);
      setNewVendorPin('');
    } catch (e) {
      alert("Error cambiando PIN");
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- POS LOGIC ---
  const addToCart = (product) => {
    if (isReadOnly) return alert('Estás en modo Solo Lectura. No puedes realizar ventas.');
    const availableStock = product.stock !== undefined ? product.stock : 0;
    if (availableStock <= 0) {
      return alert(`El producto "${product.name}" no tiene stock disponible.`);
    }

    const existing = cart.find(item => item.id === product.id);
    const currentQtyInCart = existing ? existing.qty : 0;
    if (currentQtyInCart + 1 > availableStock) {
      return alert(`No hay suficiente stock. Disponible: ${availableStock}`);
    }

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

      // Update inventory stock
      for (const item of cart) {
        const pRef = doc(db, "products", item.id);
        await updateDoc(pRef, { stock: increment(-item.qty) });
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
        receiptType: orderForm.receiptType,
        receiptNumber: orderForm.receiptNumber,
        vendorId: currentUser.uid,
        shiftId: activeShift.id,
        timestamp: serverTimestamp()
      });
      alert('Registro guardado exitosamente');
      setOrderForm({ type: 'pedido', description: '', amount: '', receiptType: 'ninguno', receiptNumber: '' });
      loadInitialData(); // update cash balance
    } catch(e) {
      alert('Error registrando orden');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- RENDER HELPERS ---
  const categoriesList = ['todas', ...Array.from(new Set(products.filter(p => !p.isDeleted).map(p => p.category).filter(Boolean)))];

  const posProducts = products.filter(p => {
    if (p.isDeleted) return false;
    if ((p.stock !== undefined ? p.stock : 0) <= 0) return false; // HIDE zero stock & deleted in POS!
    
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'todas' || p.category === categoryFilter;
    const price = p.price || 0;
    const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
    const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);

    return matchesSearch && matchesCat && matchesMin && matchesMax;
  });

  const filteredInventoryProducts = products.filter(p => {
    if (p.isDeleted) return false;
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'todas' || p.category === categoryFilter;
    const price = p.price || 0;
    const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
    const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);

    return matchesSearch && matchesCat && matchesMin && matchesMax;
  });

  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);

  if (isLoading) return <div className="flex-center" style={{height: '100vh'}}><Coffee className="spinner" size={48} /></div>;

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header flex-between">
        <div>
          <h2>Panel de Vendedor (POS)</h2>
          <p>Usuario: {currentUser?.email || currentUser?.name}</p>
          <div style={{marginTop: '0.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
            <span style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              fontWeight: '700',
              fontSize: '0.95rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}>
              💵 Caja Efectivo: Bs. {currentCash.toFixed(2)}
            </span>
            <span style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: 'white',
              padding: '0.35rem 0.85rem',
              borderRadius: '20px',
              fontWeight: '700',
              fontSize: '0.95rem',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}>
              📱 QR (Banco): Bs. {shiftOperations.filter(o=>o.opType==='Venta' && o.method==='QR').reduce((acc, o)=>acc+o.amount, 0).toFixed(2)}
            </span>
            {isReadOnly && (
              <span style={{
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                padding: '0.35rem 0.85rem',
                borderRadius: '20px',
                fontWeight: '600',
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                <ShieldAlert size={16} /> MODO SOLO LECTURA (Turno activo: {activeShiftVendor})
              </span>
            )}
          </div>
        </div>
        <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center'}}>
          {currentUser && currentUser.isPinUser && (
            <button className="btn btn-secondary" onClick={() => setShowPinModal(true)}>
              <KeyRound size={16} /> Cambiar PIN
            </button>
          )}
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
            <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Historial Turno</div>
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
                <h3><Coffee size={20} /> Productos Disponibles</h3>
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem'}}>
                  <div className="search-bar" style={{marginBottom: 0}}>
                    <Search className="search-icon" size={18} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nombre..." 
                      className="input-field"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {/* Category & Price filters */}
                  <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center'}}>
                    <select 
                      className="input-field" 
                      style={{flex: 1, minWidth: '130px'}}
                      value={categoryFilter} 
                      onChange={e => setCategoryFilter(e.target.value)}
                    >
                      {categoriesList.map(c => (
                        <option key={c} value={c}>Tipo: {c.toUpperCase()}</option>
                      ))}
                    </select>

                    <input 
                      type="number" 
                      placeholder="Min Bs." 
                      className="input-field" 
                      style={{width: '90px'}} 
                      value={minPrice} 
                      onChange={e => setMinPrice(e.target.value)} 
                    />
                    <input 
                      type="number" 
                      placeholder="Max Bs." 
                      className="input-field" 
                      style={{width: '90px'}} 
                      value={maxPrice} 
                      onChange={e => setMaxPrice(e.target.value)} 
                    />
                  </div>
                </div>
                
                <div className="item-list" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', maxHeight: '500px', overflowY: 'auto', padding: '0.5rem'}}>
                  {posProducts.map(p => {
                    return (
                      <div 
                        key={p.id} 
                        className="list-item" 
                        style={{
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          cursor: isReadOnly ? 'not-allowed' : 'pointer', 
                          textAlign: 'center', 
                          padding: '1rem'
                        }} 
                        onClick={() => !isReadOnly && addToCart(p)}
                      >
                        <div style={{display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', flexWrap: 'wrap', justifyContent: 'center'}}>
                          <span className="badge badge-success" style={{fontSize: '0.7rem'}}>{p.category}</span>
                          <span className="badge" style={{fontSize: '0.7rem', background: '#e0f2fe', color: '#0369a1'}}>Stock: {p.stock}</span>
                        </div>
                        <h4 style={{marginBottom: '0.5rem', fontSize: '0.9rem'}}>{p.name}</h4>
                        <span className="item-action" style={{fontSize: '1.1rem'}}>Bs. {p.price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                  {posProducts.length === 0 && (
                    <div style={{gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem'}}>
                      No hay productos disponibles con estos filtros o sin stock.
                    </div>
                  )}
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
              <div className="flex-between" style={{marginBottom: '1rem'}}>
                <h3><Package size={20} /> Inventario Actual</h3>
              </div>

              {/* Inventory Filters */}
              <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem'}}>
                <input 
                  type="text" 
                  placeholder="Buscar producto..." 
                  className="input-field" 
                  style={{flex: 1, minWidth: '150px'}}
                  value={searchTerm} 
                  onChange={e=>setSearchTerm(e.target.value)} 
                />
                <select className="input-field" style={{width: '180px'}} value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
                  {categoriesList.map(c => <option key={c} value={c}>Tipo: {c.toUpperCase()}</option>)}
                </select>
                <input type="number" placeholder="Min Bs." className="input-field" style={{width: '100px'}} value={minPrice} onChange={e=>setMinPrice(e.target.value)} />
                <input type="number" placeholder="Max Bs." className="input-field" style={{width: '100px'}} value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} />
              </div>
              
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Producto</th>
                    <th style={{padding: '0.5rem'}}>Categoría</th>
                    <th style={{padding: '0.5rem'}}>Precio</th>
                    <th style={{padding: '0.5rem', textAlign: 'right'}}>Stock Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventoryProducts.map(p => (
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

          {activeTab === 'history' && (
            <div className="card glass-panel">
              <div className="flex-between" style={{marginBottom: '1rem'}}>
                <h3><History size={20} /> Historial de Operaciones del Turno</h3>
                <button className="btn btn-secondary" onClick={() => exportToCSV('operaciones_turno.csv', shiftOperations.map(o => ({
                  HORA: o.time,
                  TIPO: o.opType,
                  DETALLE: o.detail,
                  METODO: o.method,
                  MONTO_BS: o.amount
                })))}>
                  <Download size={16} /> Exportar CSV
                </button>
              </div>
              
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Hora</th>
                    <th style={{padding: '0.5rem'}}>Operación</th>
                    <th style={{padding: '0.5rem'}}>Detalle</th>
                    <th style={{padding: '0.5rem'}}>Método</th>
                    <th style={{padding: '0.5rem', textAlign: 'right'}}>Monto (Bs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftOperations.map(op => (
                    <tr key={op.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{op.time}</td>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{op.opType}</td>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{op.detail}</td>
                      <td style={{padding: '0.5rem'}}>{op.method}</td>
                      <td style={{
                        padding: '0.5rem', 
                        textAlign: 'right', 
                        fontWeight: 'bold',
                        color: op.amount > 0 ? 'var(--secondary-color)' : (op.amount < 0 ? 'var(--danger)' : 'inherit')
                      }}>
                        {op.amount !== 0 ? `Bs. ${op.amount.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {shiftOperations.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                        No hay operaciones en este turno aún.
                      </td>
                    </tr>
                  )}
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
                <div className="form-group">
                  <label>Tipo de Comprobante</label>
                  <select className="input-field" value={orderForm.receiptType} onChange={e=>setOrderForm({...orderForm, receiptType: e.target.value})} required>
                    <option value="ninguno">Ninguno</option>
                    <option value="factura">Factura</option>
                    <option value="recibo">Recibo</option>
                  </select>
                </div>
                {orderForm.receiptType !== 'ninguno' && (
                  <div className="form-group">
                    <label>Número de {orderForm.receiptType === 'factura' ? 'Factura' : 'Recibo'}</label>
                    <input type="text" className="input-field" value={orderForm.receiptNumber} onChange={e=>setOrderForm({...orderForm, receiptNumber: e.target.value})} required/>
                  </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Registrar Gasto</button>
              </form>
            </div>
          )}

          {activeTab === 'shift' && (
            <div className="card glass-panel" style={{maxWidth: '550px', margin: '0 auto'}}>
              <h3 style={{textAlign: 'center'}}><Clock size={20} /> Arqueo y Cierre de Caja Local</h3>
              
              <div style={{
                background: 'rgba(255,255,255,0.7)',
                padding: '1rem',
                borderRadius: '12px',
                margin: '1rem 0',
                border: '1px solid var(--border-color)'
              }}>
                <h4 style={{color: 'var(--primary-color)', marginBottom: '0.5rem'}}>💵 Arqueo de Caja Física (Efectivo)</h4>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem'}}>
                  <span>Caja Inicial:</span>
                  <span>Bs. {(activeShift?.startCash || 0).toFixed(2)}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem'}}>
                  <span>Ventas en Efectivo (+):</span>
                  <span>Bs. {shiftOperations.filter(o=>o.opType==='Venta' && o.method==='Efectivo').reduce((acc, o)=>acc+o.amount, 0).toFixed(2)}</span>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.25rem'}}>
                  <span>Egresos / Compras (-):</span>
                  <span>Bs. {Math.abs(shiftOperations.filter(o=>o.amount < 0).reduce((acc, o)=>acc+o.amount, 0)).toFixed(2)}</span>
                </div>
                <div style={{
                  display: 'flex', 
                  justify: 'space-between', 
                  fontSize: '1.05rem', 
                  fontWeight: 'bold', 
                  borderTop: '1px solid rgba(0,0,0,0.1)', 
                  paddingTop: '0.5rem',
                  marginTop: '0.5rem',
                  color: 'var(--secondary-color)'
                }}>
                  <span>Efectivo Esperado en Caja:</span>
                  <span>Bs. {currentCash.toFixed(2)}</span>
                </div>
              </div>

              <div style={{
                background: 'rgba(239, 246, 255, 0.8)',
                padding: '1rem',
                borderRadius: '12px',
                marginBottom: '1.5rem',
                border: '1px solid #bfdbfe'
              }}>
                <h4 style={{color: '#1d4ed8', marginBottom: '0.25rem'}}>📱 Transferencias QR (Banco)</h4>
                <p style={{fontSize: '0.8rem', color: '#3b82f6', marginBottom: '0.5rem'}}>
                  Este dinero no forma parte del efectivo en caja local; debe cuadrar con extractos bancarios.
                </p>
                <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#1e40af'}}>
                  <span>Total Ventas QR:</span>
                  <span>Bs. {shiftOperations.filter(o=>o.opType==='Venta' && o.method==='QR').reduce((acc, o)=>acc+o.amount, 0).toFixed(2)}</span>
                </div>
              </div>

              <form onSubmit={closeShift}>
                <div className="form-group" style={{textAlign: 'left'}}>
                  <label>Efectivo Físico Contado en Caja (Bs.)</label>
                  <input 
                    type="number" 
                    step="0.10"
                    className="input-field" 
                    value={endCash}
                    onChange={e => setEndCash(e.target.value)}
                    placeholder="Ingrese el monto en billetes y monedas"
                    required
                  />
                </div>
                <button type="submit" className="btn btn-danger btn-block" disabled={isSubmitting}>
                  Confirmar y Cerrar Turno
                </button>
              </form>
            </div>
          )}
          {/* PIN Change Modal */}
          {showPinModal && (
            <div className="flex-center" style={{
              position: 'fixed', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              background: 'rgba(0,0,0,0.5)', 
              zIndex: 1000
            }}>
              <div className="card glass-panel" style={{width: '350px', background: '#ffffff'}}>
                <h3>Cambiar Mi PIN de Acceso</h3>
                <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
                  Ingrese su nuevo PIN de 6 dígitos.
                </p>
                <form onSubmit={handleChangePin}>
                  <div className="form-group">
                    <label>Nuevo PIN (6 dígitos)</label>
                    <input 
                      type="password"
                      maxLength="6"
                      className="input-field"
                      style={{textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.25rem'}}
                      value={newVendorPin}
                      onChange={e => setNewVendorPin(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    <button type="submit" className="btn btn-primary" style={{flex: 1}} disabled={isSubmitting || newVendorPin.length < 6}>
                      Guardar
                    </button>
                    <button type="button" className="btn btn-secondary" style={{flex: 1}} onClick={() => {setShowPinModal(false); setNewVendorPin('');}}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VendorDashboard;
