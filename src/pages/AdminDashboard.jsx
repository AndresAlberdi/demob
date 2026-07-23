import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, doc, updateDoc, setDoc, addDoc, deleteDoc, where, orderBy } from 'firebase/firestore';
import { LogOut, Users, BarChart3, Settings, ShieldAlert, Package, Check, X, Upload } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { parseAndUploadCSV } from '../utils/csvParser';

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
  
  // Form states
  const [newUser, setNewUser] = useState({ name: '', pin: '' });
  const [newMotivo, setNewMotivo] = useState('');
  
  // Edit states
  const [editingStock, setEditingStock] = useState(null);
  const [stockValue, setStockValue] = useState('');
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
      setProducts(pSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.name.localeCompare(b.name)));
      
      // Load users
      const uSnap = await getDocs(query(collection(db, "app_users")));
      setAppUsers(uSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
      // Load motivos
      const mSnap = await getDocs(doc(db, "settings", "motivos"));
      if (mSnap.exists()) {
        setMotivos(mSnap.data().list || []);
      }
      
      // Load pending losses
      const lSnap = await getDocs(query(collection(db, "losses"), where("status", "==", "pending")));
      setPendingLosses(lSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
      // Load sales for basic reports (limit to last 100 for demo)
      const sSnap = await getDocs(query(collection(db, "sales")));
      setSales(sSnap.docs.map(d => ({id: d.id, ...d.data()})));
      
    } catch (e) {
      console.error(e);
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
      const result = await parseAndUploadCSV(file);
      alert(result);
      loadData();
    } catch (error) {
      alert("Error subiendo CSV: " + error.message);
    } finally {
      setIsLoading(false);
      e.target.value = null;
    }
  };

  // --- INVENTORY MANAGEMENT ---
  const saveStock = async (productId) => {
    if (stockValue === '') return;
    try {
      await updateDoc(doc(db, "products", productId), { stock: parseInt(stockValue) });
      setEditingStock(null);
      loadData();
    } catch (e) {
      alert("Error actualizando stock");
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

  // --- LOSSES APPROVAL ---
  const handleLoss = async (id, approved) => {
    try {
      const status = approved ? 'approved' : 'rejected';
      await updateDoc(doc(db, "losses", id), { status });
      
      if (approved) {
        // Deduct stock
        const lossDoc = pendingLosses.find(l => l.id === id);
        if (lossDoc) {
          const p = products.find(prod => prod.id === lossDoc.productId);
          if (p) {
            await updateDoc(doc(db, "products", p.id), { stock: (p.stock || 0) - lossDoc.qty });
          }
        }
      }
      loadData();
    } catch (e) {
      alert("Error procesando");
    }
  };

  // --- RENDER ---
  // Simple Report Calcs
  const totalSales = sales.reduce((acc, s) => acc + s.total, 0);
  const totalCash = sales.filter(s => s.method === 'Efectivo').reduce((acc, s) => acc + s.total, 0);
  const totalQR = sales.filter(s => s.method === 'QR').reduce((acc, s) => acc + s.total, 0);

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header flex-between">
        <div>
          <h2>Panel de Administración</h2>
          <p>Administrador: {currentUser?.email}</p>
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
                {sales.slice(-10).reverse().map(s => (
                  <tr key={s.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                    <td style={{padding: '0.5rem'}}>{s.timestamp ? new Date(s.timestamp.toDate()).toLocaleString() : 'Reciente'}</td>
                    <td style={{padding: '0.5rem'}}>{s.method}</td>
                    <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{s.items.map(i => `${i.qty}x ${i.name}`).join(', ')}</td>
                    <td style={{padding: '0.5rem', fontWeight: 'bold'}}>Bs. {s.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && activeTab === 'inventory' && (
        <div className="card glass-panel">
          <div className="flex-between" style={{marginBottom: '1.5rem'}}>
            <h3>Gestión de Inventario y Productos</h3>
            <label className="btn btn-primary" style={{cursor: 'pointer'}}>
              <Upload size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Subir CSV
              <input type="file" accept=".csv" style={{display: 'none'}} onChange={handleCSVUpload} />
            </label>
          </div>
          
          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                <th style={{padding: '0.5rem'}}>Producto</th>
                <th style={{padding: '0.5rem'}}>Categoría</th>
                <th style={{padding: '0.5rem'}}>Precio (Bs.)</th>
                <th style={{padding: '0.5rem'}}>Stock Físico</th>
                <th style={{padding: '0.5rem', textAlign: 'center'}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                  <td style={{padding: '0.5rem'}}>{p.name}</td>
                  <td style={{padding: '0.5rem'}}>{p.category}</td>
                  <td style={{padding: '0.5rem'}}>{p.price.toFixed(2)}</td>
                  <td style={{padding: '0.5rem'}}>
                    {editingStock === p.id ? (
                      <input 
                        type="number" 
                        className="input-field" 
                        style={{width: '80px', padding: '0.25rem'}} 
                        value={stockValue} 
                        onChange={e => setStockValue(e.target.value)} 
                        autoFocus
                      />
                    ) : (
                      <span style={{fontWeight: 'bold', color: p.stock <= 0 ? 'var(--danger)' : 'inherit'}}>{p.stock || 0}</span>
                    )}
                  </td>
                  <td style={{padding: '0.5rem', textAlign: 'center'}}>
                    {editingStock === p.id ? (
                      <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
                        <button className="btn btn-success" style={{padding: '0.25rem 0.5rem'}} onClick={() => saveStock(p.id)}><Check size={16}/></button>
                        <button className="btn btn-secondary" style={{padding: '0.25rem 0.5rem'}} onClick={() => setEditingStock(null)}><X size={16}/></button>
                      </div>
                    ) : (
                      <button className="btn btn-secondary" style={{padding: '0.25rem 0.5rem'}} onClick={() => {setEditingStock(p.id); setStockValue(p.stock || 0);}}>
                        Ajustar Stock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
