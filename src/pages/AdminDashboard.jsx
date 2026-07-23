import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, getDoc, doc, updateDoc, setDoc, addDoc, deleteDoc, where, orderBy } from 'firebase/firestore';
import { LogOut, Users, BarChart3, Settings, ShieldAlert, Package, Check, X, Upload, Clock, Info, Activity, Download } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { parseAndUploadCSV } from '../utils/csvParser';
import { exportToCSV } from '../utils/csvExporter';

const formatDate = (val) => {
  if (!val) return '-';
  try {
    if (typeof val.toDate === 'function') return val.toDate().toLocaleString();
    if (val.seconds) return new Date(val.seconds * 1000).toLocaleString();
    if (typeof val === 'string' || typeof val === 'number') return new Date(val).toLocaleString();
  } catch (e) {
    return '-';
  }
  return '-';
};

const AdminDashboard = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('reports'); // reports, inventory, users, losses
  const [isLoading, setIsLoading] = useState(false);
  
  // Data states
  const [products, setProducts] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [pendingLosses, setPendingLosses] = useState([]);
  const [sales, setSales] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [orders, setOrders] = useState([]);
  
  // CSV Form State
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  
  // Form & Edit states
  const [newUser, setNewUser] = useState({ name: '', pin: '' });
  const [newMotivo, setNewMotivo] = useState('');
  
  // Product Edit States
  const [editingProduct, setEditingProduct] = useState(null); // product object or null
  const [editProdForm, setEditProdForm] = useState({ name: '', category: '', price: '', stock: '' });
  const [newProdForm, setNewProdForm] = useState({ name: '', category: 'CON GAS', price: '', stock: '10' });
  
  // Category Move State
  const [moveFromCategory, setMoveFromCategory] = useState('');
  const [moveToCategory, setMoveToCategory] = useState('');
  
  // Inventory Filter States
  const [adminSearch, setAdminSearch] = useState('');
  const [adminCategoryFilter, setAdminCategoryFilter] = useState('todas');
  const [adminMinPrice, setAdminMinPrice] = useState('');
  const [adminMaxPrice, setAdminMaxPrice] = useState('');
  
  const [editingUser, setEditingUser] = useState(null);
  const [editPinValue, setEditPinValue] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load products
      const pSnap = await getDocs(query(collection(db, "products")));
      setProducts(pSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
      
      // Load users
      const uSnap = await getDocs(query(collection(db, "app_users")));
      setAppUsers(uSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
      // Load motivos
      const mSnap = await getDoc(doc(db, "settings", "motivos"));
      if (mSnap.exists()) {
        setMotivos(mSnap.data().list || []);
      }
      
      // Load pending losses
      const lSnap = await getDocs(query(collection(db, "losses"), where("status", "==", "pending")));
      setPendingLosses(lSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
      // Load sales for basic reports
      const sSnap = await getDocs(query(collection(db, "sales")));
      setSales(sSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
      // Load shifts for monitoring
      const shSnap = await getDocs(query(collection(db, "shifts")));
      setShifts(shSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.startTime?.seconds || 0) - (a.startTime?.seconds || 0)));
      
      // Load orders / expenses
      const oSnap = await getDocs(query(collection(db, "orders")));
      setOrders(oSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // --- CSV UPLOAD ---
  const handleCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const result = await parseAndUploadCSV(file, csvHasHeader);
      alert(result);
      loadData();
    } catch (error) {
      alert("Error subiendo CSV: " + error.message);
    } finally {
      setIsLoading(false);
      e.target.value = null;
    }
  };

  // --- INVENTORY & PRODUCT MANAGEMENT ---
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProdForm.name || !newProdForm.price) return alert("Ingrese el nombre y precio del producto.");
    try {
      await addDoc(collection(db, "products"), {
        name: newProdForm.name.trim(),
        category: newProdForm.category.trim() || 'GENERAL',
        price: parseFloat(newProdForm.price),
        stock: parseInt(newProdForm.stock) || 0,
        isDeleted: false
      });
      alert("Producto creado exitosamente");
      setNewProdForm({ name: '', category: 'CON GAS', price: '', stock: '10' });
      loadData();
    } catch (e) {
      alert("Error creando producto");
    }
  };

  const startEditProduct = (p) => {
    setEditingProduct(p.id);
    setEditProdForm({
      name: p.name,
      category: p.category,
      price: p.price,
      stock: p.stock !== undefined ? p.stock : 0
    });
  };

  const saveProductEdit = async (productId) => {
    try {
      await updateDoc(doc(db, "products", productId), {
        name: editProdForm.name.trim(),
        category: editProdForm.category.trim(),
        price: parseFloat(editProdForm.price),
        stock: parseInt(editProdForm.stock)
      });
      setEditingProduct(null);
      loadData();
    } catch (e) {
      alert("Error actualizando producto");
    }
  };

  const softDeleteProduct = async (productId, productName) => {
    if (!window.confirm(`¿Quitar/Eliminar el producto "${productName}"? (Se ocultará del inventario y ventas).`)) return;
    try {
      await updateDoc(doc(db, "products", productId), { isDeleted: true });
      loadData();
    } catch (e) {
      alert("Error eliminando producto");
    }
  };

  const handleBulkMoveCategory = async (e) => {
    e.preventDefault();
    if (!moveFromCategory || !moveToCategory) return alert("Seleccione la categoría origen y destino.");
    if (moveFromCategory === moveToCategory) return alert("Las categorías origen y destino deben ser distintas.");
    
    setIsLoading(true);
    try {
      const prodsToMove = products.filter(p => p.category === moveFromCategory && !p.isDeleted);
      for (const p of prodsToMove) {
        await updateDoc(doc(db, "products", p.id), { category: moveToCategory });
      }
      alert(`Se movieron ${prodsToMove.length} productos de "${moveFromCategory}" a "${moveToCategory}".`);
      setMoveFromCategory('');
      setMoveToCategory('');
      loadData();
    } catch (e) {
      alert("Error reasignando categorías");
    } finally {
      setIsLoading(false);
    }
  };

  // --- USER MANAGEMENT ---
  const createUser = async (e) => {
    e.preventDefault();
    if (newUser.pin.length !== 6) return alert("El PIN debe tener 6 dígitos");
    try {
      await addDoc(collection(db, "app_users"), {
        name: newUser.name,
        pin: newUser.pin,
        role: 'vendedor'
      });
      setNewUser({name: '', pin: ''});
      loadData();
    } catch (e) {
      alert("Error creando usuario");
    }
  };
  
  const deleteUser = async (id) => {
    if(!window.confirm("¿Eliminar usuario?")) return;
    await deleteDoc(doc(db, "app_users", id));
    loadData();
  };

  const updatePin = async (id) => {
    if (editPinValue.length !== 6) return alert("El PIN debe tener 6 dígitos");
    try {
      await updateDoc(doc(db, "app_users", id), { pin: editPinValue });
      setEditingUser(null);
      loadData();
    } catch (e) {
      alert("Error cambiando PIN");
    }
  };

  // --- MOTIVOS MANAGEMENT ---
  const addMotivo = async (e) => {
    e.preventDefault();
    if (!newMotivo) return;
    try {
      const updatedList = [...motivos, newMotivo];
      await setDoc(doc(db, "settings", "motivos"), { list: updatedList });
      setNewMotivo('');
      loadData();
    } catch (e) {
      alert("Error");
    }
  };
  
  const deleteMotivo = async (m) => {
    const updatedList = motivos.filter(mot => mot !== m);
    await setDoc(doc(db, "settings", "motivos"), { list: updatedList });
    loadData();
  };

  // --- SHIFT CONTROL ---
  const forceCloseShift = async (shiftId, vendorName) => {
    if (!window.confirm(`¿Forzar el cierre del turno activo de ${vendorName}?`)) return;
    try {
      await updateDoc(doc(db, "shifts", shiftId), {
        status: 'closed',
        endTime: serverTimestamp(),
        forceClosedBy: currentUser.email || 'Admin'
      });
      alert('Turno cerrado forzosamente.');
      loadData();
    } catch (e) {
      alert('Error cerrando turno');
    }
  };

  // --- RENDER ---
  // Simple Report Calcs
  const totalSales = sales.reduce((acc, s) => acc + s.total, 0);
  const totalCash = sales.filter(s => s.method === 'Efectivo').reduce((acc, s) => acc + s.total, 0);
  const totalQR = sales.filter(s => s.method === 'QR').reduce((acc, s) => acc + s.total, 0);

  // Active shift calculations
  const activeShiftDoc = shifts.find(s => s.status === 'open');
  let activeShiftCash = 0;
  if (activeShiftDoc) {
    const shiftSales = sales.filter(s => s.shiftId === activeShiftDoc.id && s.method === 'Efectivo').reduce((acc, s) => acc + s.total, 0);
    const shiftExpenses = orders.filter(o => o.shiftId === activeShiftDoc.id).reduce((acc, o) => acc + o.amount, 0);
    activeShiftCash = (activeShiftDoc.startCash || 0) + shiftSales - shiftExpenses;
  }

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header flex-between">
        <div>
          <h2>Panel de Administración</h2>
          <p>Administrador: {currentUser?.email}</p>
          {activeShiftDoc && (
            <div style={{marginTop: '0.5rem'}}>
              <span style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                padding: '0.35rem 0.85rem',
                borderRadius: '20px',
                fontWeight: '700',
                fontSize: '0.9rem',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}>
                💰 Caja Actual (Turno Activo: {activeShiftDoc.vendorName}): Bs. {activeShiftCash.toFixed(2)}
              </span>
            </div>
          )}
        </div>
        <div style={{display: 'flex', gap: '1rem'}}>
          <Link to="/vendedor" className="btn btn-secondary">Ir a POS</Link>
          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </div>
      
      <div className="tabs">
        <div className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          <BarChart3 size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Reportes
        </div>
        <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
          <Package size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Inventario & Productos
        </div>
        <div className={`tab ${activeTab === 'shifts' ? 'active' : ''}`} onClick={() => setActiveTab('shifts')}>
          <Clock size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Seguimiento de Turnos
        </div>
        <div className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <Users size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Vendedores
        </div>
        <div className={`tab ${activeTab === 'losses' ? 'active' : ''}`} onClick={() => setActiveTab('losses')}>
          <ShieldAlert size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Pérdidas & Ajustes
        </div>
      </div>
      
      {isLoading && <div className="flex-center" style={{padding: '2rem'}}>Cargando...</div>}
      
      {!isLoading && activeTab === 'reports' && (
        <>
          <div className="dashboard-grid">
            <div className="card glass-panel">
              <h3 className="card-title">Total Ventas (Global)</h3>
              <div className="card-value">Bs. {totalSales.toFixed(2)}</div>
            </div>
            <div className="card glass-panel">
              <h3 className="card-title">Ventas en Efectivo</h3>
              <div className="card-value">Bs. {totalCash.toFixed(2)}</div>
            </div>
            <div className="card glass-panel">
              <h3 className="card-title">Ventas por QR</h3>
              <div className="card-value">Bs. {totalQR.toFixed(2)}</div>
            </div>
          </div>
          
          <div className="card glass-panel" style={{marginTop: '1.5rem'}}>
            <h3>Últimas Ventas Registradas</h3>
            <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '1rem'}}>
              <thead>
                <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                  <th style={{padding: '0.5rem'}}>Fecha (Aprox)</th>
                  <th style={{padding: '0.5rem'}}>Método</th>
                  <th style={{padding: '0.5rem'}}>Detalle</th>
                  <th style={{padding: '0.5rem'}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {[...sales]
                  .sort((a, b) => {
                    const tA = a.timestamp?.seconds || (a.timestamp ? new Date(a.timestamp).getTime()/1000 : 0);
                    const tB = b.timestamp?.seconds || (b.timestamp ? new Date(b.timestamp).getTime()/1000 : 0);
                    return tB - tA;
                  })
                  .map(s => (
                    <tr key={s.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem'}}>{formatDate(s.timestamp)}</td>
                      <td style={{padding: '0.5rem'}}>{s.method}</td>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{s.items?.map(i => `${i.qty}x ${i.name}`).join(', ') || '-'}</td>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>Bs. {(s.total || 0).toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && activeTab === 'inventory' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          {/* Top Bar: Actions & CSV Import/Export */}
          <div className="card glass-panel">
            <div className="flex-between" style={{marginBottom: '1rem'}}>
              <h3>Gestión de Inventario y Productos</h3>
              <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
                <label style={{fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer'}}>
                  <input 
                    type="checkbox" 
                    checked={csvHasHeader} 
                    onChange={e => setCsvHasHeader(e.target.checked)} 
                  />
                  ¿Fila de títulos?
                </label>
                <label className="btn btn-primary" style={{cursor: 'pointer'}}>
                  <Upload size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Cargar CSV
                  <input type="file" accept=".csv" style={{display: 'none'}} onChange={handleCSVUpload} />
                </label>
                <button 
                  className="btn btn-secondary"
                  onClick={() => exportToCSV('inventario_completo.csv', products.filter(p => !p.isDeleted).map(p => ({
                    CATEGORIA: p.category,
                    PRODUCTO: p.name,
                    PRECIO: p.price,
                    STOCK: p.stock
                  })))}
                >
                  <Download size={16} /> Exportar CSV
                </button>
              </div>
            </div>

            {/* Filters */}
            <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem'}}>
              <input 
                type="text" 
                placeholder="Buscar por producto..." 
                className="input-field" 
                style={{flex: 1, minWidth: '150px'}}
                value={adminSearch} 
                onChange={e=>setAdminSearch(e.target.value)} 
              />
              <select className="input-field" style={{width: '180px'}} value={adminCategoryFilter} onChange={e=>setAdminCategoryFilter(e.target.value)}>
                {['todas', ...Array.from(new Set(products.filter(p=>!p.isDeleted).map(p=>p.category).filter(Boolean)))].map(c => (
                  <option key={c} value={c}>Categoría: {c.toUpperCase()}</option>
                ))}
              </select>
              <input type="number" placeholder="Min Bs." className="input-field" style={{width: '100px'}} value={adminMinPrice} onChange={e=>setAdminMinPrice(e.target.value)} />
              <input type="number" placeholder="Max Bs." className="input-field" style={{width: '100px'}} value={adminMaxPrice} onChange={e=>setAdminMaxPrice(e.target.value)} />
            </div>

            {/* Products Table */}
            <table style={{width: '100%', borderCollapse: 'collapse'}}>
              <thead>
                <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                  <th style={{padding: '0.5rem'}}>Producto (Descripción)</th>
                  <th style={{padding: '0.5rem'}}>Categoría</th>
                  <th style={{padding: '0.5rem'}}>Precio (Bs.)</th>
                  <th style={{padding: '0.5rem'}}>Stock</th>
                  <th style={{padding: '0.5rem', textAlign: 'center'}}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {products
                  .filter(p => !p.isDeleted)
                  .filter(p => {
                    const prodName = p.name || '';
                    const matchSearch = prodName.toLowerCase().includes((adminSearch || '').toLowerCase());
                    const matchCat = adminCategoryFilter === 'todas' || p.category === adminCategoryFilter;
                    const price = parseFloat(p.price) || 0;
                    const minP = parseFloat(adminMinPrice);
                    const maxP = parseFloat(adminMaxPrice);
                    const matchMin = adminMinPrice === '' || isNaN(minP) || price >= minP;
                    const matchMax = adminMaxPrice === '' || isNaN(maxP) || price <= maxP;
                    return matchSearch && matchCat && matchMin && matchMax;
                  })
                  .map(p => {
                    const isEditing = editingProduct === p.id;
                    return (
                      <tr key={p.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="text" 
                              className="input-field" 
                              value={editProdForm.name} 
                              onChange={e => setEditProdForm({...editProdForm, name: e.target.value})} 
                            />
                          ) : (
                            <span style={{fontWeight: '500'}}>{p.name}</span>
                          )}
                        </td>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="text" 
                              className="input-field" 
                              value={editProdForm.category} 
                              onChange={e => setEditProdForm({...editProdForm, category: e.target.value})} 
                            />
                          ) : (
                            <span className="badge badge-success">{p.category}</span>
                          )}
                        </td>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="number" 
                              step="0.10"
                              className="input-field" 
                              style={{width: '90px'}}
                              value={editProdForm.price} 
                              onChange={e => setEditProdForm({...editProdForm, price: e.target.value})} 
                            />
                          ) : (
                            `Bs. ${p.price.toFixed(2)}`
                          )}
                        </td>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{width: '80px'}} 
                              value={editProdForm.stock} 
                              onChange={e => setEditProdForm({...editProdForm, stock: e.target.value})} 
                            />
                          ) : (
                            <span style={{fontWeight: 'bold', color: p.stock <= 0 ? 'var(--danger)' : 'inherit'}}>{p.stock || 0}</span>
                          )}
                        </td>
                        <td style={{padding: '0.5rem', textAlign: 'center'}}>
                          {isEditing ? (
                            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
                              <button className="btn btn-success" style={{padding: '0.25rem 0.5rem'}} onClick={() => saveProductEdit(p.id)}><Check size={16}/></button>
                              <button className="btn btn-secondary" style={{padding: '0.25rem 0.5rem'}} onClick={() => setEditingProduct(null)}><X size={16}/></button>
                            </div>
                          ) : (
                            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
                              <button className="btn btn-secondary" style={{padding: '0.25rem 0.5rem'}} onClick={() => startEditProduct(p)}>
                                Editar
                              </button>
                              <button className="btn btn-danger" style={{padding: '0.25rem 0.5rem'}} onClick={() => softDeleteProduct(p.id, p.name)}>
                                Quitar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Form grid: Create Product & Bulk Move Category */}
          <div className="dashboard-grid" style={{gridTemplateColumns: '1fr 1fr'}}>
            <div className="card glass-panel">
              <h3>Nuevo Producto (Manual)</h3>
              <form onSubmit={handleCreateProduct}>
                <div className="form-group">
                  <label>Nombre / Descripción</label>
                  <input type="text" className="input-field" value={newProdForm.name} onChange={e=>setNewProdForm({...newProdForm, name: e.target.value})} placeholder="Ej: Fanta 2L" required/>
                </div>
                <div className="form-group">
                  <label>Categoría</label>
                  <input type="text" className="input-field" value={newProdForm.category} onChange={e=>setNewProdForm({...newProdForm, category: e.target.value})} placeholder="Ej: CON GAS, DULCES..." required/>
                </div>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <div className="form-group" style={{flex: 1}}>
                    <label>Precio (Bs.)</label>
                    <input type="number" step="0.10" className="input-field" value={newProdForm.price} onChange={e=>setNewProdForm({...newProdForm, price: e.target.value})} required/>
                  </div>
                  <div className="form-group" style={{flex: 1}}>
                    <label>Stock Inicial</label>
                    <input type="number" className="input-field" value={newProdForm.stock} onChange={e=>setNewProdForm({...newProdForm, stock: e.target.value})} required/>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-block">Guardar Producto</button>
              </form>
            </div>

            <div className="card glass-panel">
              <h3>Reasignar Categoría en Bloque</h3>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                Transfiere todos los productos de una categoría existente hacia otra nueva o existente.
              </p>
              <form onSubmit={handleBulkMoveCategory}>
                <div className="form-group">
                  <label>Categoría Origen</label>
                  <select className="input-field" value={moveFromCategory} onChange={e=>setMoveFromCategory(e.target.value)} required>
                    <option value="">Seleccione Origen...</option>
                    {Array.from(new Set(products.filter(p=>!p.isDeleted).map(p=>p.category).filter(Boolean))).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Categoría Destino (Nombre)</label>
                  <input type="text" className="input-field" value={moveToCategory} onChange={e=>setMoveToCategory(e.target.value)} placeholder="Ej: BEBIDAS FRÍAS" required/>
                </div>
                <button type="submit" className="btn btn-secondary btn-block">Transferir Productos</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'shifts' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          {/* Active Shift Card */}
          <div className="card glass-panel" style={{borderLeft: '4px solid var(--secondary-color)'}}>
            <div className="flex-between">
              <h3><Activity size={20} style={{color: 'var(--secondary-color)'}} /> Turno Activo Actual</h3>
              {activeShiftDoc && (
                <button 
                  className="btn btn-danger"
                  style={{padding: '0.35rem 0.75rem', fontSize: '0.85rem'}}
                  onClick={() => forceCloseShift(activeShiftDoc.id, activeShiftDoc.vendorName)}
                >
                  Forzar Cierre de Turno
                </button>
              )}
            </div>
            {activeShiftDoc ? (
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '0.5rem'}}>
                <div>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Vendedor Activo</label>
                  <h4 style={{fontSize: '1.1rem'}}>{activeShiftDoc.vendorName}</h4>
                </div>
                <div>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Hora de Apertura</label>
                  <p>{activeShiftDoc.startTime ? new Date(activeShiftDoc.startTime.toDate()).toLocaleString() : 'Reciente'}</p>
                </div>
                <div>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Caja Inicial</label>
                  <p style={{fontWeight: 'bold'}}>Bs. {(activeShiftDoc.startCash || 0).toFixed(2)}</p>
                </div>
                <div>
                  <label style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>Caja Actual (Calculada)</label>
                  <p style={{fontWeight: 'bold', color: 'var(--secondary-color)', fontSize: '1.2rem'}}>Bs. {activeShiftCash.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <p style={{color: 'var(--text-secondary)'}}>No hay ningún turno activo en este momento. La caja se encuentra cerrada.</p>
            )}
          </div>

          {/* Shifts History Table */}
          <div className="card glass-panel">
            <h3><Clock size={20} /> Historial y Seguimiento de Turnos</h3>
            <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '1rem'}}>
              <thead>
                <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                  <th style={{padding: '0.5rem'}}>Vendedor</th>
                  <th style={{padding: '0.5rem'}}>Estado</th>
                  <th style={{padding: '0.5rem'}}>Apertura / Cierre</th>
                  <th style={{padding: '0.5rem'}}>💵 Ef. Inicial</th>
                  <th style={{padding: '0.5rem'}}>💵 Ventas Ef.</th>
                  <th style={{padding: '0.5rem'}}>💵 Egresos</th>
                  <th style={{padding: '0.5rem'}}>💵 Ef. Esperado</th>
                  <th style={{padding: '0.5rem'}}>💵 Ef. Contado</th>
                  <th style={{padding: '0.5rem'}}>💵 Descuadre</th>
                  <th style={{padding: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: '#1d4ed8'}}>📱 QR (Banco)</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map(sh => {
                  const isOpen = sh.status === 'open';
                  const shiftSales = sales.filter(s => s.shiftId === sh.id);
                  const cashSales = shiftSales.filter(s => s.method === 'Efectivo').reduce((acc, s) => acc + s.total, 0);
                  const qrSales = shiftSales.filter(s => s.method === 'QR').reduce((acc, s) => acc + s.total, 0);
                  const shiftExpenses = orders.filter(o => o.shiftId === sh.id).reduce((acc, o) => acc + o.amount, 0);
                  const expectedCash = (sh.startCash || 0) + cashSales - shiftExpenses;
                  
                  return (
                    <tr key={sh.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{sh.vendorName || 'Vendedor'}</td>
                      <td style={{padding: '0.5rem'}}>
                        {isOpen ? (
                          <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
                            <span className="badge badge-success">Activo</span>
                            <button className="btn btn-danger" style={{padding: '0.15rem 0.4rem', fontSize: '0.75rem'}} onClick={() => forceCloseShift(sh.id, sh.vendorName)}>Cerrar</button>
                          </div>
                        ) : (
                          <span className="badge badge-secondary" style={{background: '#e2e8f0', color: '#475569'}}>Cerrado</span>
                        )}
                      </td>
                      <td style={{padding: '0.5rem', fontSize: '0.8rem'}}>
                        <div>Apertura: {formatDate(sh.startTime)}</div>
                        <div>Cierre: {sh.endTime ? formatDate(sh.endTime) : 'En curso'}</div>
                      </td>
                      <td style={{padding: '0.5rem'}}>Bs. {(sh.startCash || 0).toFixed(2)}</td>
                      <td style={{padding: '0.5rem', color: 'var(--secondary-color)', fontWeight: '500'}}>+Bs. {cashSales.toFixed(2)}</td>
                      <td style={{padding: '0.5rem', color: 'var(--danger)'}}>-Bs. {shiftExpenses.toFixed(2)}</td>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>Bs. {(sh.expectedCash !== undefined ? sh.expectedCash : expectedCash).toFixed(2)}</td>
                      <td style={{padding: '0.5rem'}}>{sh.endCash !== undefined ? `Bs. ${sh.endCash.toFixed(2)}` : '-'}</td>
                      <td style={{padding: '0.5rem', color: sh.difference < 0 ? 'var(--danger)' : (sh.difference > 0 ? 'var(--secondary-color)' : 'inherit'), fontWeight: 'bold'}}>
                        {sh.difference !== undefined ? `Bs. ${sh.difference.toFixed(2)}` : '-'}
                      </td>
                      <td style={{padding: '0.5rem', background: 'rgba(59, 130, 246, 0.05)', fontWeight: 'bold', color: '#1e40af'}}>
                        Bs. {qrSales.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                {shifts.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                      No se han registrado turnos aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'users' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '1fr 2fr'}}>
          <div className="card glass-panel">
            <h3>Nuevo Vendedor (PIN)</h3>
            <form onSubmit={createUser}>
              <div className="form-group">
                <label>Nombre del Vendedor</label>
                <input type="text" className="input-field" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} required/>
              </div>
              <div className="form-group">
                <label>PIN de Acceso (6 dígitos)</label>
                <input type="text" className="input-field" maxLength="6" pattern="\d{6}" value={newUser.pin} onChange={e=>setNewUser({...newUser, pin: e.target.value})} required/>
              </div>
              <button type="submit" className="btn btn-primary btn-block">Registrar Vendedor</button>
            </form>
          </div>
          
          <div className="card glass-panel">
            <h3>Vendedores Registrados</h3>
            <div className="item-list">
              {appUsers.map(u => (
                <div key={u.id} className="list-item">
                  <div className="item-info">
                    <h4>{u.name}</h4>
                    {editingUser === u.id ? (
                      <input 
                        type="text" 
                        maxLength="6"
                        className="input-field"
                        style={{width: '100px', padding: '0.25rem', marginTop: '0.25rem'}}
                        value={editPinValue}
                        onChange={(e) => setEditPinValue(e.target.value)}
                        placeholder="PIN"
                      />
                    ) : (
                      <p>PIN: {u.pin}</p>
                    )}
                  </div>
                  <div style={{display: 'flex', gap: '0.5rem'}}>
                    {editingUser === u.id ? (
                      <>
                        <button className="btn btn-success" onClick={() => updatePin(u.id)}><Check size={16}/></button>
                        <button className="btn btn-secondary" onClick={() => setEditingUser(null)}><X size={16}/></button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-secondary" onClick={() => {setEditingUser(u.id); setEditPinValue(u.pin);}}>Cambiar PIN</button>
                        <button className="btn btn-danger" onClick={() => deleteUser(u.id)}>Eliminar</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {appUsers.length === 0 && <p>No hay vendedores registrados.</p>}
            </div>
          </div>
        </div>
      )}

      {!isLoading && activeTab === 'losses' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '2fr 1fr'}}>
          <div className="card glass-panel">
            <h3>Aprobación de Pérdidas y Robos</h3>
            <div className="item-list">
              {pendingLosses.map(loss => (
                <div key={loss.id} className="list-item" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                  <div className="flex-between" style={{width: '100%', marginBottom: '0.5rem'}}>
                    <h4>{loss.qty}x {loss.productName}</h4>
                    <span className="badge badge-error">{loss.reason}</span>
                  </div>
                  <div className="flex-between" style={{width: '100%'}}>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>Reportado el: {loss.timestamp ? new Date(loss.timestamp.toDate()).toLocaleString() : ''}</p>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <button className="btn btn-success" onClick={() => handleLoss(loss.id, true)}>Aprobar y Descontar</button>
                      <button className="btn btn-danger" onClick={() => handleLoss(loss.id, false)}>Rechazar</button>
                    </div>
                  </div>
                </div>
              ))}
              {pendingLosses.length === 0 && <p>No hay pérdidas pendientes de revisión.</p>}
            </div>
          </div>
          
          <div className="card glass-panel">
            <h3>Motivos de Pérdida</h3>
            <form onSubmit={addMotivo} style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
              <input type="text" className="input-field" value={newMotivo} onChange={e=>setNewMotivo(e.target.value)} placeholder="Ej: Caducado" required/>
              <button type="submit" className="btn btn-primary">+</button>
            </form>
            <div className="item-list">
              {motivos.map(m => (
                <div key={m} className="list-item" style={{padding: '0.5rem'}}>
                  <span>{m}</span>
                  <button className="btn btn-secondary" style={{padding: '0.2rem 0.5rem'}} onClick={() => deleteMotivo(m)}><X size={14}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
