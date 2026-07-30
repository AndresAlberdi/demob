import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import Navbar from '../components/Navbar';
import AdminDepositsTab from '../components/AdminDepositsTab';
import { useAuth } from '../context/AuthContext';
import { logEvent } from '../utils/logger';

export default function SupervisorDashboard() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('audit'); // 'audit', 'summary', 'pin'
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [auditCounts, setAuditCounts] = useState({}); // productId -> countedQty
  const [auditResult, setAuditResult] = useState(null); // calculated audit report
  const [pastAudits, setPastAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Single Loss form & motifs
  const [motivos, setMotivos] = useState([]);
  const [singleLossForm, setSingleLossForm] = useState({ productId: '', qty: 1, reason: '' });

  // PIN Change State
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const [banks, setBanks] = useState([]);
  const [deposits, setDeposits] = useState([]);

  useEffect(() => {
    loadProductsAndAudits();
  }, []);

  const loadProductsAndAudits = async () => {
    setLoading(true);
    try {
      // Load products, banks, and deposits in parallel
      const [pSnap, bSnap, dSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'banks')),
        getDocs(query(collection(db, 'deposits'), orderBy('createdAt', 'desc')))
      ]);

      setBanks(bSnap.docs.map(d => ({id: d.id, ...d.data()})));
      setDeposits(dSnap.docs.map(d => ({id: d.id, ...d.data()})));

      const pList = pSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        minStock: doc.data().minStock !== undefined ? doc.data().minStock : 3,
        costPrice: doc.data().costPrice !== undefined ? doc.data().costPrice : Math.round((doc.data().price || 0) * 0.8 * 100) / 100
      }));
      setProducts(pList);

      const cats = [...new Set(pList.map(p => p.category).filter(Boolean))];
      setCategories(cats);

      // Load motifs
      try {
        const mSnap = await getDocs(collection(db, 'settings'));
        mSnap.forEach(doc => {
          if (doc.id === 'motivos') setMotivos(doc.data()?.list || []);
        });
      } catch (e) {
        console.warn("Motivos fetch warning:", e);
      }

      // Load past audits
      const aQuery = query(collection(db, 'inventory_audits'), orderBy('timestamp', 'desc'), limit(10));
      const aSnap = await getDocs(aQuery);
      const aList = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPastAudits(aList);
    } catch (err) {
      console.error("Error loading products for audit:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleQtyChange = (productId, val) => {
    const qty = parseInt(val, 10);
    setAuditCounts(prev => ({
      ...prev,
      [productId]: isNaN(qty) || qty < 0 ? '' : qty
    }));
  };

  const calculateAuditReport = () => {
    const items = [];
    let totalFaltantes = 0;
    let totalSobrantess = 0;

    products.forEach(p => {
      const counted = auditCounts[p.id];
      if (counted !== undefined && counted !== '') {
        const systemStock = p.stock || 0;
        const diff = counted - systemStock;
        if (diff < 0) totalFaltantes += Math.abs(diff);
        if (diff > 0) totalSobrantess += diff;

        items.push({
          productId: p.id,
          productName: p.name,
          category: p.category || 'General',
          systemStock,
          countedStock: counted,
          difference: diff,
          costPrice: p.costPrice || Math.round((p.price || 0) * 0.8 * 100) / 100
        });
      }
    });

    if (items.length === 0) {
      setMessage({ type: 'error', text: 'Por favor ingresa el conteo de al menos un producto.' });
      return;
    }

    setAuditResult({
      items,
      totalFaltantes,
      totalSobrantess,
      timestamp: new Date()
    });
    setMessage({ type: '', text: '' });
  };

  const saveAuditToFirestore = async () => {
    if (!auditResult) return;
    setLoading(true);
    try {
      // 1. Save the physical audit doc
      await addDoc(collection(db, 'inventory_audits'), {
        auditorName: currentUser?.name || currentUser?.email || 'Supervisor',
        auditorRole: currentUser?.role || 'supervisor',
        items: auditResult.items,
        totalFaltantes: auditResult.totalFaltantes,
        totalSobrantess: auditResult.totalSobrantess,
        timestamp: serverTimestamp()
      });

      // 2. Also automatically report discrepancies as aggregated loss if there are faltantes
      const discrepancies = auditResult.items.filter(item => item.difference < 0);
      if (discrepancies.length > 0) {
        await addDoc(collection(db, "losses"), {
          isAggregatedAuditLoss: true,
          items: discrepancies.map(item => ({
            productId: item.productId,
            productName: item.productName,
            qty: Math.abs(item.difference),
            costPrice: parseFloat(item.costPrice) || 0,
            reason: 'Diferencia de Auditoría'
          })),
          qty: auditResult.totalFaltantes,
          productName: `Arqueo en Bloque: ${discrepancies.length} productos con faltantes`,
          reason: 'Descuadre de Auditoría',
          vendorId: currentUser?.uid || currentUser?.id || 'Supervisor',
          vendorName: currentUser?.name || currentUser?.email || 'Supervisor',
          shiftId: 'supervisor_audit',
          timestamp: serverTimestamp(),
          status: 'pending'
        });

        await logEvent('AUDIT_LOSS_REPORTED_BY_SUPERVISOR', currentUser?.name || currentUser?.email, `Supervisor reportó pérdidas en bloque de auditoría: ${auditResult.totalFaltantes} unidades de ${discrepancies.length} productos`);
      }

      setMessage({ type: 'success', text: '✅ Arqueo de Inventario registrado y diferencias reportadas exitosamente.' });
      setAuditCounts({});
      setAuditResult(null);
      loadProductsAndAudits();
    } catch (err) {
      console.error("Error saving audit & reporting losses:", err);
      setMessage({ type: 'error', text: 'Error al guardar la revisión de inventarios y reportar pérdidas.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReportSingleLoss = async (e) => {
    e.preventDefault();
    if (!singleLossForm.productId || !singleLossForm.reason) {
      setMessage({ type: 'error', text: 'Por favor complete todos los campos.' });
      return;
    }
    setLoading(true);
    try {
      const p = products.find(prod => prod.id === singleLossForm.productId);
      if (!p) throw new Error("Producto no encontrado");

      await addDoc(collection(db, "losses"), {
        productId: p.id,
        productName: p.name,
        qty: parseInt(singleLossForm.qty, 10) || 1,
        reason: singleLossForm.reason,
        vendorId: currentUser?.uid || currentUser?.id || 'Supervisor',
        vendorName: currentUser?.name || currentUser?.email || 'Supervisor',
        shiftId: 'supervisor_direct',
        timestamp: serverTimestamp(),
        status: 'pending'
      });

      await logEvent('LOSS_REPORTED_BY_SUPERVISOR', currentUser?.name || currentUser?.email, `Supervisor reportó pérdida: ${singleLossForm.qty}x ${p.name} (${singleLossForm.reason})`);
      setMessage({ type: 'success', text: `✅ Reporte de pérdida enviado a administración: ${singleLossForm.qty}x ${p.name}` });
      setSingleLossForm({ productId: '', qty: 1, reason: '' });
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al reportar la pérdida.' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    if (newPin.length < 4 || newPin.length > 6) {
      setMessage({ type: 'error', text: 'El PIN debe tener entre 4 y 6 dígitos.' });
      return;
    }
    if (newPin !== confirmPin) {
      setMessage({ type: 'error', text: 'Los PINs no coinciden.' });
      return;
    }

    setPinSubmitting(true);
    try {
      if (currentUser?.id) {
        await updateDoc(doc(db, 'app_users', currentUser.id), {
          pin: newPin
        });
        setMessage({ type: 'success', text: '✅ PIN actualizado correctamente.' });
        setNewPin('');
        setConfirmPin('');
      } else {
        setMessage({ type: 'error', text: 'No se pudo identificar la cuenta para cambiar PIN.' });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Error al cambiar PIN.' });
    } finally {
      setPinSubmitting(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCat = !selectedCategory || p.category === selectedCategory;
    const matchesSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const lowStockProducts = products.filter(p => (p.stock || 0) <= (p.minStock || 3));

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      <div className="dashboard-layout">
        <div className="dashboard-header flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>📋 Panel de Supervisor</h2>
            <p>Revisión Física de Inventarios y Monitoreo de Stock</p>
          </div>

          <div className="tabs" style={{ marginBottom: 0 }}>
            <div className={`tab ${activeTab === 'audit' ? 'active' : ''}`} onClick={() => setActiveTab('audit')}>
              🔍 Revisión de Inventario
            </div>
            <div className={`tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>
              📊 Historial de Auditorías
            </div>
            <div className={`tab ${activeTab === 'deposits' ? 'active' : ''}`} onClick={() => setActiveTab('deposits')}>
              🏦 Depósitos
            </div>
            <div className={`tab ${activeTab === 'losses' ? 'active' : ''}`} onClick={() => setActiveTab('losses')}>
              ⚠️ Reportar Pérdidas
            </div>
            <div className={`tab ${activeTab === 'pin' ? 'active' : ''}`} onClick={() => setActiveTab('pin')}>
              🔒 Mi Contraseña / PIN
            </div>
          </div>
        </div>

        {message.text && (
          <div className={`alert ${message.type === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '12px', background: message.type === 'error' ? '#fef2f2' : '#ecfdf5', color: message.type === 'error' ? '#e7716d' : '#047857', border: '1px solid currentColor' }}>
            {message.text}
          </div>
        )}

        {/* TAB 1: REVISIÓN DE INVENTARIOS (CONTEO FÍSICO CIEGO) */}
        {activeTab === 'audit' && (
          <div>
            {!auditResult ? (
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>
                  🔍 Toma Física de Inventario (Conteo a Ciegas)
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  <strong>Instrucciones:</strong> Ingresa la cantidad real contada físicamente en estantes. Para evitar sesgos, la cantidad en sistema se oculta hasta completar la revisión.
                </p>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                  <div style={{ flex: '1', minWidth: '220px' }}>
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="Buscar producto por nombre..." 
                      value={searchQuery} 
                      onChange={e => setSearchQuery(e.target.value)} 
                    />
                  </div>
                  <div style={{ width: '200px' }}>
                    <select 
                      className="input-field" 
                      value={selectedCategory} 
                      onChange={e => setSelectedCategory(e.target.value)}
                    >
                      <option value="">Todas las Categorías</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                {/* Audit Input Table */}
                <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-primary)' }}>
                        <th style={{ padding: '0.75rem' }}>Producto</th>
                        <th style={{ padding: '0.75rem' }}>Categoría</th>
                        <th style={{ padding: '0.75rem' }}>Precio Venta</th>
                        <th style={{ padding: '0.75rem', width: '180px' }}>Cantidad Física Contada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: '600' }}>{p.name}</td>
                          <td style={{ padding: '0.75rem' }}>{p.category || 'General'}</td>
                          <td style={{ padding: '0.75rem' }}>Bs. {(p.price || 0).toFixed(2)}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <input 
                              type="number" 
                              min="0" 
                              className="input-field" 
                              placeholder="0" 
                              value={auditCounts[p.id] !== undefined ? auditCounts[p.id] : ''} 
                              onChange={e => handleQtyChange(p.id, e.target.value)}
                              style={{ width: '100px', textAlign: 'center', fontWeight: '700' }} 
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button 
                  onClick={calculateAuditReport} 
                  className="btn btn-primary btn-block"
                  style={{ fontSize: '1.05rem', padding: '0.85rem' }}
                >
                  🧮 Finalizar Conteo & Comparar Diferencias
                </button>
              </div>
            ) : (
              /* Audit Comparison Summary */
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  📊 Informe Comparativo de Arqueo
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Revisa las discrepancias calculadas entre el stock físico ingresado y el stock registrado en el sistema.
                </p>

                <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '0.75rem' }}>Producto</th>
                        <th style={{ padding: '0.75rem' }}>Stock Sistema</th>
                        <th style={{ padding: '0.75rem' }}>Conteo Físico</th>
                        <th style={{ padding: '0.75rem' }}>Diferencia</th>
                        <th style={{ padding: '0.75rem' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditResult.items.map(item => {
                        const isFaltante = item.difference < 0;
                        const isSobrante = item.difference > 0;
                        return (
                          <tr 
                            key={item.productId} 
                            style={{ 
                              borderBottom: '1px solid var(--border-color)',
                              backgroundColor: isFaltante ? 'rgba(231, 113, 109, 0.12)' : isSobrante ? 'rgba(39, 108, 211, 0.12)' : 'transparent' 
                            }}
                          >
                            <td style={{ padding: '0.75rem', fontWeight: '600' }}>{item.productName}</td>
                            <td style={{ padding: '0.75rem' }}>{item.systemStock}</td>
                            <td style={{ padding: '0.75rem', fontWeight: '700' }}>{item.countedStock}</td>
                            <td style={{ padding: '0.75rem', fontWeight: '700', color: isFaltante ? '#e7716d' : isSobrante ? '#276cd3' : '#10b981' }}>
                              {item.difference > 0 ? `+${item.difference}` : item.difference}
                            </td>
                            <td style={{ padding: '0.75rem' }}>
                              {isFaltante && <span className="badge" style={{ background: '#e7716d', color: '#fff' }}>⚠️ Faltante</span>}
                              {isSobrante && <span className="badge" style={{ background: '#276cd3', color: '#fff' }}>➕ Sobrante</span>}
                              {!isFaltante && !isSobrante && <span className="badge" style={{ background: '#10b981', color: '#fff' }}>✓ Exacto</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button 
                    onClick={() => setAuditResult(null)} 
                    className="btn btn-secondary"
                  >
                    ✏️ Modificar Conteo
                  </button>
                  <button 
                    onClick={saveAuditToFirestore} 
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {auditResult.totalFaltantes > 0 
                      ? '💾 Confirmar, Guardar & Reportar Faltantes' 
                      : '💾 Confirmar & Guardar Arqueo'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RESUMEN Y CRÍTICO */}
        {activeTab === 'summary' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total de Productos</h4>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{products.length}</p>
              </div>
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Productos en Stock Crítico (≤3)</h4>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: lowStockProducts.length > 0 ? '#e7716d' : '#10b981' }}>
                  {lowStockProducts.length}
                </p>
              </div>
            </div>

            {/* Low stock table */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', color: '#e7716d' }}>⚠️ Alertas de Stock Mínimo (Mínimo 3)</h3>
              {lowStockProducts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No hay productos por debajo de la cantidad mínima.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem' }}>Producto</th>
                      <th style={{ padding: '0.75rem' }}>Categoría</th>
                      <th style={{ padding: '0.75rem' }}>Stock Actual</th>
                      <th style={{ padding: '0.75rem' }}>Stock Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map(p => (
                      <tr key={p.id} className="min-stock-row" style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: '700' }}>{p.name}</td>
                        <td style={{ padding: '0.75rem' }}>{p.category || 'General'}</td>
                        <td style={{ padding: '0.75rem', fontWeight: '800', fontSize: '1.1rem' }}>{p.stock || 0}</td>
                        <td style={{ padding: '0.75rem' }}>{p.minStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Past Audits List */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>📜 Revisiones Anteriores</h3>
              {pastAudits.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No hay revisiones de inventario registradas aún.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '0.75rem' }}>Fecha</th>
                        <th style={{ padding: '0.75rem' }}>Auditor</th>
                        <th style={{ padding: '0.75rem' }}>Items Auditados</th>
                        <th style={{ padding: '0.75rem' }}>Total Faltantes</th>
                        <th style={{ padding: '0.75rem' }}>Total Sobrantes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastAudits.map(a => {
                        const dateStr = a.timestamp?.seconds ? new Date(a.timestamp.seconds * 1000).toLocaleString() : 'Reciente';
                        return (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.75rem' }}>{dateStr}</td>
                            <td style={{ padding: '0.75rem', fontWeight: '600' }}>{a.auditorName}</td>
                            <td style={{ padding: '0.75rem' }}>{a.items?.length || 0}</td>
                            <td style={{ padding: '0.75rem', color: '#e7716d', fontWeight: '700' }}>-{a.totalFaltantes || 0}</td>
                            <td style={{ padding: '0.75rem', color: '#276cd3', fontWeight: '700' }}>+{a.totalSobrantess || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: DEPOSITS */}
        {activeTab === 'deposits' && (
          <AdminDepositsTab 
            banks={banks} 
            deposits={deposits} 
            loadBanksAndDeposits={loadProductsAndAudits} 
            pCashBalance={999999}
            userRole="supervisor" 
          />
        )}

        {/* TAB 3: REPORTAR PÉRDIDAS */}
        {activeTab === 'losses' && (
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>⚠️ Reportar Pérdida o Merma (Supervisor)</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Utilice este formulario para reportar productos dañados, vencidos, mermas o pérdidas identificadas directamente en el salón de ventas. Requiere aprobación del Administrador.
            </p>

            <form onSubmit={handleReportSingleLoss} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Seleccionar Producto</label>
                <select 
                  className="input-field" 
                  value={singleLossForm.productId} 
                  onChange={e => setSingleLossForm({ ...singleLossForm, productId: e.target.value })} 
                  required
                >
                  <option value="">Seleccione un producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock || 0})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Cantidad Perdida</label>
                <input 
                  type="number" 
                  className="input-field" 
                  min="1" 
                  value={singleLossForm.qty} 
                  onChange={e => setSingleLossForm({ ...singleLossForm, qty: e.target.value })} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Motivo de la Pérdida</label>
                <select 
                  className="input-field" 
                  value={singleLossForm.reason} 
                  onChange={e => setSingleLossForm({ ...singleLossForm, reason: e.target.value })} 
                  required
                >
                  <option value="">Seleccione Motivo...</option>
                  {motivos.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {motivos.length === 0 && (
                    <>
                      <option value="Vencimiento">Vencimiento</option>
                      <option value="Dañado / Roto">Dañado / Roto</option>
                      <option value="Consumo Interno">Consumo Interno</option>
                      <option value="Robo / Pérdida">Robo / Pérdida</option>
                    </>
                  )}
                </select>
              </div>

              <button 
                type="submit" 
                className="btn btn-danger btn-block" 
                disabled={loading}
              >
                {loading ? 'Enviando...' : '⚠️ Registrar Reporte de Pérdida'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: CAMBIO DE CONTRASEÑA / PIN */}
        {activeTab === 'pin' && (
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '480px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>🔒 Cambiar mi PIN de Acceso</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Actualiza tu código PIN numérico personal para iniciar sesión en la plataforma.
            </p>

            <form onSubmit={handleChangePin}>
              <div className="form-group">
                <label>Nuevo PIN (4 a 6 dígitos)</label>
                <input 
                  type="password" 
                  className="input-field" 
                  maxLength="6" 
                  placeholder="••••••" 
                  value={newPin} 
                  onChange={e => setNewPin(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Confirmar Nuevo PIN</label>
                <input 
                  type="password" 
                  className="input-field" 
                  maxLength="6" 
                  placeholder="••••••" 
                  value={confirmPin} 
                  onChange={e => setConfirmPin(e.target.value)} 
                  required 
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary btn-block" 
                disabled={pinSubmitting}
              >
                {pinSubmitting ? 'Guardando...' : '💾 Actualizar PIN'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
