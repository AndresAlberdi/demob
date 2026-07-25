import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, getDoc, doc, updateDoc, setDoc, addDoc, deleteDoc, where, orderBy, serverTimestamp, increment } from 'firebase/firestore';
import { LogOut, Users, BarChart3, Settings, ShieldAlert, Package, Check, X, Upload, Clock, Info, Activity, Download, Filter, FileText, Calendar, ListFilter, PlusCircle, ArrowDownCircle, DollarSign } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { parseAndUploadCSV } from '../utils/csvParser';
import { exportToCSV } from '../utils/csvExporter';
import { logEvent } from '../utils/logger';
import Navbar from '../components/Navbar';

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

const HelpTooltip = ({ title, text, example }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block', marginLeft: 'auto' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        style={{
          background: 'rgba(59, 130, 246, 0.15)',
          color: '#2563eb',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.2s',
          lineHeight: 1
        }}
        title="Ver explicación contable / operativa"
      >
        ?
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '26px',
          right: 0,
          width: '270px',
          background: '#ffffff',
          color: '#1e293b',
          padding: '0.85rem',
          borderRadius: '10px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.25), 0 8px 10px -6px rgba(0,0,0,0.15)',
          border: '1px solid #cbd5e1',
          zIndex: 9999,
          fontSize: '0.82rem',
          lineHeight: '1.4',
          textAlign: 'left',
          fontWeight: 'normal'
        }}>
          <div style={{ fontWeight: 'bold', color: '#1e40af', marginBottom: '0.35rem' }}>
            ℹ️ {title}
          </div>
          <div style={{ marginBottom: '0.4rem', color: '#334155' }}>
            {text}
          </div>
          {example && (
            <div style={{ padding: '0.4rem 0.6rem', background: '#eff6ff', borderLeft: '3px solid #3b82f6', borderRadius: '4px', fontSize: '0.78rem', color: '#1e3a8a' }}>
              <strong>Ejemplo:</strong> {example}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AdminDashboard = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('reports'); // reports, inventory, shifts, users, losses, logs
  const [isLoading, setIsLoading] = useState(false);
  
  // Data states
  const [products, setProducts] = useState([]);
  const [appUsers, setAppUsers] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pendingLosses, setPendingLosses] = useState([]);
  const [allLosses, setAllLosses] = useState([]);
  const [sales, setSales] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loans, setLoans] = useState([]);
  const [extraIncomes, setExtraIncomes] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  
  // Periodicity Report Filter States
  const [periodFilter, setPeriodFilter] = useState('hoy'); // hoy, semana, mes, personalizado
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [reportSubTab, setReportSubTab] = useState('all'); // all, losses, loans, orders, extra

  // CSV Form State
  const [csvHasHeader, setCsvHasHeader] = useState(true);
  
  // Extra Income Form State
  const [extraIncomeForm, setExtraIncomeForm] = useState({
    type: 'devolucion',
    description: '',
    amount: '',
    method: 'Efectivo'
  });

  // Form & Edit states
  const [newUser, setNewUser] = useState({ name: '', pin: '', role: 'vendedor' });
  const [newMotivo, setNewMotivo] = useState('');
  
  // Category ABM State
  const [newCatName, setNewCatName] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCatName, setEditCatName] = useState('');

  // Product Edit States
  const [editingProduct, setEditingProduct] = useState(null);
  const [editProdForm, setEditProdForm] = useState({ name: '', category: '', price: '', stock: '' });
  const [newProdForm, setNewProdForm] = useState({ name: '', category: 'CON GAS', price: '', stock: '10', costPrice: '', minStock: '3' });
  
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

  // NEW FEATURES STATES:
  // 1. Expense Types ABM
  const [expenseTypes, setExpenseTypes] = useState(['Servicios Básicos', 'Alquiler', 'Mantenimiento', 'Insumos de Limpieza', 'Honorarios', 'Otros Egresos']);
  const [newExpenseType, setNewExpenseType] = useState('');

  // 2. Extraordinary Motives ABM
  const [extraordinaryMotives, setExtraordinaryMotives] = useState(['Préstamo de Funcionario', 'Sobrante de Caja', 'Aporte de Capital', 'Otro Ingreso Extraordinario']);
  const [newExtraordinaryMotive, setNewExtraordinaryMotive] = useState('');

  // 3. Standalone Product Purchase Module (up to 40 items)
  const [purchaseForm, setPurchaseForm] = useState({
    description: '',
    receiptType: 'recibo', // factura, recibo, ninguno
    receiptNumber: '',
    supplier: ''
  });
  const [purchaseCart, setPurchaseCart] = useState([]); // [{ productId, productName, qty, unitCostPrice }]
  const [purchaseFilters, setPurchaseFilters] = useState({
    search: '',
    category: 'todas',
    minSalePrice: '',
    maxSalePrice: '',
    minCostPrice: '',
    maxCostPrice: ''
  });

  // 4. Vendor Losses & Fines System
  const [fineHistory, setFineHistory] = useState([]);
  const [assignFineForm, setAssignFineForm] = useState({
    vendorId: '',
    productId: '',
    qty: 1,
    reason: '',
    deductInventory: true
  });

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [
        pSnap, catSnap, uSnap, mSnap, lSnap, sSnap, shSnap, oSnap, loanSnap, extraSnap, logSnap, expTypeSnap, extMotSnap, finesSnap
      ] = await Promise.allSettled([
        getDocs(query(collection(db, "products"))),
        getDoc(doc(db, "settings", "categories")),
        getDocs(query(collection(db, "app_users"))),
        getDoc(doc(db, "settings", "motivos")),
        getDocs(query(collection(db, "losses"))),
        getDocs(query(collection(db, "sales"))),
        getDocs(query(collection(db, "shifts"))),
        getDocs(query(collection(db, "orders"))),
        getDocs(query(collection(db, "loans"))),
        getDocs(query(collection(db, "extra_incomes"))),
        getDocs(query(collection(db, "system_logs"))),
        getDoc(doc(db, "settings", "expense_types")),
        getDoc(doc(db, "settings", "extraordinary_motives")),
        getDocs(query(collection(db, "vendor_fines")))
      ]);

      let loadedProds = [];
      if (pSnap.status === 'fulfilled') {
        loadedProds = pSnap.value.docs.map(d => ({
          id: d.id, 
          ...d.data(),
          minStock: d.data().minStock !== undefined ? d.data().minStock : 3,
          costPrice: d.data().costPrice !== undefined ? d.data().costPrice : Math.round((d.data().price || 0) * 0.8 * 100) / 100
        })).sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        setProducts(loadedProds);
      }

      let dbCats = [];
      if (catSnap.status === 'fulfilled' && catSnap.value.exists()) {
        dbCats = catSnap.value.data().list || [];
      }
      const prodCats = Array.from(new Set(loadedProds.filter(p => !p.isDeleted).map(p => p.category).filter(Boolean)));
      const fullCats = Array.from(new Set([...dbCats, ...prodCats]));
      setCategories(fullCats);

      if (fullCats.length > 0 && !fullCats.includes(newProdForm.category)) {
        setNewProdForm(prev => ({ ...prev, category: fullCats[0] }));
      }

      if (uSnap.status === 'fulfilled') {
        setAppUsers(uSnap.value.docs.map(d => ({id: d.id, ...d.data()})));
      }
      
      if (mSnap.status === 'fulfilled' && mSnap.value.exists()) {
        setMotivos(mSnap.value.data().list || []);
      }

      if (expTypeSnap.status === 'fulfilled' && expTypeSnap.value.exists()) {
        setExpenseTypes(expTypeSnap.value.data().list || []);
      }

      if (extMotSnap.status === 'fulfilled' && extMotSnap.value.exists()) {
        setExtraordinaryMotives(extMotSnap.value.data().list || []);
      }

      if (finesSnap.status === 'fulfilled') {
        const fList = finesSnap.value.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setFineHistory(fList);
      }
      
      if (lSnap.status === 'fulfilled') {
        const lList = lSnap.value.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setAllLosses(lList);
        setPendingLosses(lList.filter(l => l.status === 'pending'));
      }
      
      if (sSnap.status === 'fulfilled') {
        setSales(sSnap.value.docs.map(d => ({id: d.id, ...d.data()})));
      }
      
      if (shSnap.status === 'fulfilled') {
        setShifts(shSnap.value.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.startTime?.seconds || 0) - (a.startTime?.seconds || 0)));
      }
      
      if (oSnap.status === 'fulfilled') {
        setOrders(oSnap.value.docs.map(d => ({id: d.id, ...d.data()})));
      }

      if (loanSnap.status === 'fulfilled') {
        setLoans(loanSnap.value.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      }

      if (extraSnap.status === 'fulfilled') {
        setExtraIncomes(extraSnap.value.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      }

      if (logSnap.status === 'fulfilled') {
        setSystemLogs(logSnap.value.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
      }

    } catch (e) {
      console.error("Error loading Admin data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await logEvent('LOGOUT', currentUser?.email, 'Cierre de sesión de administrador');
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
      await logEvent('CSV_IMPORT', currentUser?.email, `Carga masiva de inventario por CSV: ${file.name}`);
      alert(result);
      loadData();
    } catch (error) {
      alert("Error subiendo CSV: " + error.message);
    } finally {
      setIsLoading(false);
      e.target.value = null;
    }
  };

  // --- ADMIN EXTRA INCOME ---
  const handleAddExtraIncome = async (e) => {
    e.preventDefault();
    if (!extraIncomeForm.description || !extraIncomeForm.amount || isNaN(extraIncomeForm.amount)) {
      return alert("Ingrese una descripción y monto válidos.");
    }
    const amt = parseFloat(extraIncomeForm.amount);
    try {
      await addDoc(collection(db, "extra_incomes"), {
        type: extraIncomeForm.type,
        description: extraIncomeForm.description.trim(),
        amount: amt,
        method: extraIncomeForm.method,
        registeredBy: currentUser?.email || 'Admin',
        timestamp: serverTimestamp()
      });
      await logEvent(
        'EXTRA_INCOME', 
        currentUser?.email, 
        `Registrado ingreso adicional (${extraIncomeForm.type}): ${extraIncomeForm.description} por Bs. ${amt.toFixed(2)} (${extraIncomeForm.method})`,
        amt
      );
      alert("Ingreso adicional registrado exitosamente.");
      setExtraIncomeForm({ type: 'devolucion', description: '', amount: '', method: 'Efectivo' });
      loadData();
    } catch (e) {
      alert("Error registrando ingreso adicional");
    }
  };

  // --- CATEGORY ABM ---
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const catUpper = newCatName.trim().toUpperCase();
    try {
      const updated = Array.from(new Set([...categories, catUpper]));
      await setDoc(doc(db, "settings", "categories"), { list: updated });
      await logEvent('CATEGORY_CREATED', currentUser?.email, `Creada nueva categoría: "${catUpper}"`);
      setNewCatName('');
      loadData();
    } catch (e) {
      alert("Error creando categoría");
    }
  };

  const handleRenameCategory = async (oldCat) => {
    if (!editCatName.trim()) return;
    const newCat = editCatName.trim().toUpperCase();
    if (oldCat === newCat) return setEditingCategory(null);
    setIsLoading(true);
    try {
      const prodsToRename = products.filter(p => p.category === oldCat);
      for (const p of prodsToRename) {
        await updateDoc(doc(db, "products", p.id), { category: newCat });
      }
      const updated = categories.map(c => c === oldCat ? newCat : c);
      await setDoc(doc(db, "settings", "categories"), { list: Array.from(new Set(updated)) });
      await logEvent('CATEGORY_RENAMED', currentUser?.email, `Renombrada categoría "${oldCat}" a "${newCat}" en ${prodsToRename.length} productos`);
      setEditingCategory(null);
      setEditCatName('');
      loadData();
    } catch (e) {
      alert("Error renombrando categoría");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCategory = async (catToDelete) => {
    const activeProds = products.filter(p => p.category === catToDelete && !p.isDeleted);
    if (activeProds.length > 0) {
      return alert(`No se puede eliminar "${catToDelete}" porque tiene ${activeProds.length} productos activos. Reasigne los productos primero.`);
    }
    if (!window.confirm(`¿Eliminar la categoría "${catToDelete}"?`)) return;
    try {
      const updated = categories.filter(c => c !== catToDelete);
      await setDoc(doc(db, "settings", "categories"), { list: updated });
      await logEvent('CATEGORY_DELETED', currentUser?.email, `Eliminada categoría: "${catToDelete}"`);
      loadData();
    } catch (e) {
      alert("Error eliminando categoría");
    }
  };

  // --- INVENTORY & PRODUCT MANAGEMENT ---
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newProdForm.name || !newProdForm.price) return alert("Ingrese el nombre y precio del producto.");
    try {
      await addDoc(collection(db, "products"), {
        name: newProdForm.name.trim(),
        category: newProdForm.category.trim() || (categories[0] || 'GENERAL'),
        price: parseFloat(newProdForm.price),
        costPrice: parseFloat(newProdForm.costPrice) || (parseFloat(newProdForm.price) * 0.8),
        stock: parseInt(newProdForm.stock) || 0,
        minStock: parseInt(newProdForm.minStock) || 3,
        isDeleted: false
      });
      await logEvent('PRODUCT_CREATED', currentUser?.email, `Creado producto manual "${newProdForm.name}" (${newProdForm.category}) - Venta: Bs. ${newProdForm.price}, Compra: Bs. ${newProdForm.costPrice || (parseFloat(newProdForm.price) * 0.8)}, Stock: ${newProdForm.stock}`);
      alert("Producto creado exitosamente");
      setNewProdForm({ name: '', category: categories[0] || 'CON GAS', price: '', stock: '10', costPrice: '', minStock: '3' });
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
      await logEvent('PRODUCT_UPDATED', currentUser?.email, `Editado producto "${editProdForm.name}": Precio Bs. ${editProdForm.price}, Stock ${editProdForm.stock}`);
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
      await logEvent('PRODUCT_DELETED', currentUser?.email, `Quitado producto "${productName}" (Soft-Delete)`);
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
      await logEvent('CATEGORY_MOVED', currentUser?.email, `Reasignación masiva de ${prodsToMove.length} productos de "${moveFromCategory}" a "${moveToCategory}"`);
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

  // --- LOSS APPROVAL FIX ---
  const handleLoss = async (lossId, approved) => {
    setIsLoading(true);
    try {
      const lossDoc = allLosses.find(l => l.id === lossId);
      if (!lossDoc) return;

      if (approved) {
        const prod = products.find(p => p.id === lossDoc.productId || p.name === lossDoc.productName);
        if (prod) {
          const newStock = Math.max(0, (prod.stock || 0) - (lossDoc.qty || 1));
          await updateDoc(doc(db, "products", prod.id), { stock: newStock });
        }
        await updateDoc(doc(db, "losses", lossId), { 
          status: 'approved',
          approvedBy: currentUser?.email || 'Admin',
          approvedAt: serverTimestamp()
        });
        await logEvent('LOSS_APPROVED', currentUser?.email, `Aprobada pérdida de ${lossDoc.qty}x ${lossDoc.productName} (${lossDoc.reason}). Stock descontado.`);
        alert('Pérdida aprobada y stock descontado correctamente.');
      } else {
        await updateDoc(doc(db, "losses", lossId), { 
          status: 'rejected',
          rejectedBy: currentUser?.email || 'Admin',
          rejectedAt: serverTimestamp()
        });
        await logEvent('LOSS_REJECTED', currentUser?.email, `Rechazada pérdida de ${lossDoc.qty}x ${lossDoc.productName}`);
        alert('Pérdida rechazada.');
      }
      loadData();
    } catch (e) {
      console.error("Error procesando pérdida:", e);
      alert("Error procesando pérdida: " + (e.message || e));
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
        role: newUser.role
      });
      await logEvent('USER_CREATED', currentUser?.email, `Registrado nuevo ${newUser.role}: "${newUser.name}"`);
      setNewUser({name: '', pin: '', role: 'vendedor'});
      loadData();
    } catch (e) {
      alert("Error creando usuario");
    }
  };
  
  const deleteUser = async (id) => {
    if(!window.confirm("¿Eliminar usuario?")) return;
    await deleteDoc(doc(db, "app_users", id));
    await logEvent('USER_DELETED', currentUser?.email, `Eliminado usuario id ${id}`);
    loadData();
  };

  const updatePin = async (id) => {
    if (editPinValue.length !== 6) return alert("El PIN debe tener 6 dígitos");
    try {
      await updateDoc(doc(db, "app_users", id), { pin: editPinValue });
      await logEvent('PIN_CHANGED', currentUser?.email, `Cambiado PIN de vendedor id ${id}`);
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
      await logEvent('MOTIVO_CREATED', currentUser?.email, `Agregado nuevo motivo de pérdida: "${newMotivo}"`);
      setNewMotivo('');
      loadData();
    } catch (e) {
      alert("Error agregando motivo");
    }
  };
  
  const deleteMotivo = async (m) => {
    const updatedList = motivos.filter(mot => mot !== m);
    await setDoc(doc(db, "settings", "motivos"), { list: updatedList });
    await logEvent('MOTIVO_DELETED', currentUser?.email, `Eliminado motivo de pérdida: "${m}"`);
    loadData();
  };

  // --- ABM TIPOS DE EGRESOS ---
  const addExpenseType = async (e) => {
    e.preventDefault();
    if (!newExpenseType.trim()) return;
    const name = newExpenseType.trim();
    try {
      const updated = Array.from(new Set([...expenseTypes, name]));
      await setDoc(doc(db, "settings", "expense_types"), { list: updated });
      await logEvent('EXPENSE_TYPE_CREATED', currentUser?.email, `Creado nuevo tipo de egreso: "${name}"`);
      setNewExpenseType('');
      loadData();
    } catch (err) {
      alert("Error guardando tipo de egreso");
    }
  };

  const deleteExpenseType = async (item) => {
    if (!window.confirm(`¿Eliminar el tipo de egreso "${item}"?`)) return;
    try {
      const updated = expenseTypes.filter(t => t !== item);
      await setDoc(doc(db, "settings", "expense_types"), { list: updated });
      await logEvent('EXPENSE_TYPE_DELETED', currentUser?.email, `Eliminado tipo de egreso: "${item}"`);
      loadData();
    } catch (err) {
      alert("Error eliminando tipo de egreso");
    }
  };

  // --- ABM MOTIVOS INGRESOS EXTRAORDINARIOS ---
  const addExtraordinaryMotive = async (e) => {
    e.preventDefault();
    if (!newExtraordinaryMotive.trim()) return;
    const name = newExtraordinaryMotive.trim();
    try {
      const updated = Array.from(new Set([...extraordinaryMotives, name]));
      await setDoc(doc(db, "settings", "extraordinary_motives"), { list: updated });
      await logEvent('EXTRAORDINARY_MOTIVE_CREATED', currentUser?.email, `Creado nuevo motivo extraordinario: "${name}"`);
      setNewExtraordinaryMotive('');
      loadData();
    } catch (err) {
      alert("Error guardando motivo extraordinario");
    }
  };

  const deleteExtraordinaryMotive = async (item) => {
    if (!window.confirm(`¿Eliminar el motivo extraordinario "${item}"?`)) return;
    try {
      const updated = extraordinaryMotives.filter(m => m !== item);
      await setDoc(doc(db, "settings", "extraordinary_motives"), { list: updated });
      await logEvent('EXTRAORDINARY_MOTIVE_DELETED', currentUser?.email, `Eliminado motivo extraordinario: "${item}"`);
      loadData();
    } catch (err) {
      alert("Error eliminando motivo");
    }
  };

  // --- STANDALONE PRODUCT PURCHASES (HASTA 40 ITEMS) ---
  const addProductToPurchaseCart = (product, qty, costPrice) => {
    if (purchaseCart.length >= 40) {
      return alert("No se pueden agregar más de 40 productos por compra.");
    }
    const q = parseInt(qty, 10) || 1;
    const unitPrice = parseFloat(costPrice) || product.costPrice || Math.round((product.price || 0) * 0.8 * 100) / 100;
    
    setPurchaseCart(prev => {
      const existingIndex = prev.findIndex(item => item.productId === product.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].qty += q;
        updated[existingIndex].unitCostPrice = unitPrice;
        return updated;
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        qty: q,
        unitCostPrice: unitPrice
      }];
    });
  };

  const removeProductFromPurchaseCart = (productId) => {
    setPurchaseCart(prev => prev.filter(item => item.productId !== productId));
  };

  const executeProductPurchase = async (e) => {
    e.preventDefault();
    if (purchaseCart.length === 0) return alert("Agrega al menos un producto a la compra.");
    if (!purchaseForm.description) return alert("Ingresa una descripción de la compra.");

    const totalAmount = purchaseCart.reduce((sum, item) => sum + (item.qty * item.unitCostPrice), 0);
    setIsLoading(true);

    try {
      await addDoc(collection(db, "orders"), {
        type: 'compra_productos',
        description: purchaseForm.description,
        supplier: purchaseForm.supplier || '',
        receiptType: purchaseForm.receiptType,
        receiptNumber: purchaseForm.receiptNumber,
        amount: totalAmount,
        items: purchaseCart,
        method: 'Efectivo',
        registeredBy: currentUser?.email || 'Admin',
        timestamp: serverTimestamp()
      });

      for (const item of purchaseCart) {
        const pRef = doc(db, "products", item.productId);
        await updateDoc(pRef, {
          stock: increment(item.qty),
          costPrice: item.unitCostPrice
        });
      }

      await logEvent('PRODUCT_PURCHASE', currentUser?.email, `Registrada compra de productos: ${purchaseCart.length} ítems por Bs. ${totalAmount.toFixed(2)}`, totalAmount);
      alert('✅ Compra de productos registrada e inventario actualizado exitosamente.');
      setPurchaseCart([]);
      setPurchaseForm({ description: '', receiptType: 'recibo', receiptNumber: '', supplier: '' });
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error registrando compra de productos');
    } finally {
      setIsLoading(false);
    }
  };

  // --- VENDOR LOSSES & FINES SYSTEM ---
  const assignVendorFine = async (e) => {
    e.preventDefault();
    if (!assignFineForm.vendorId || !assignFineForm.productId) return alert("Selecciona vendedor y producto.");
    const qty = parseInt(assignFineForm.qty, 10) || 1;
    const product = products.find(p => p.id === assignFineForm.productId);
    const vendor = appUsers.find(u => u.id === assignFineForm.vendorId);
    if (!product || !vendor) return alert("Vendedor o producto no encontrado.");

    const purchasePrice = product.costPrice || Math.round((product.price || 0) * 0.8 * 100) / 100;
    const fineAmount = qty * purchasePrice;

    setIsLoading(true);
    try {
      await addDoc(collection(db, "vendor_fines"), {
        vendorId: vendor.id,
        vendorName: vendor.name,
        productId: product.id,
        productName: product.name,
        qty,
        purchasePrice,
        fineAmount,
        reason: assignFineForm.reason || 'Pérdida de producto',
        status: 'pending',
        timestamp: serverTimestamp()
      });

      const uRef = doc(db, "app_users", vendor.id);
      await updateDoc(uRef, {
        accumulatedFines: increment(fineAmount)
      });

      if (assignFineForm.deductInventory) {
        const pRef = doc(db, "products", product.id);
        await updateDoc(pRef, { stock: increment(-qty) });
      }

      await logEvent('VENDOR_FINE_ASSIGNED', currentUser?.email, `Asignada multa a vendor "${vendor.name}": ${qty}x ${product.name} (Bs. ${fineAmount.toFixed(2)})${assignFineForm.deductInventory ? ' y descontado de inventario' : ''}`);
      alert(`Multa de Bs. ${fineAmount.toFixed(2)} asignada exitosamente a ${vendor.name}`);
      setAssignFineForm({ vendorId: '', productId: '', qty: 1, reason: '', deductInventory: true });
      loadData();
    } catch (err) {
      console.error(err);
      alert("Error asignando multa a vendedor");
    } finally {
      setIsLoading(false);
    }
  };

  const collectVendorFine = async (vendor) => {
    const amountToCollect = vendor.accumulatedFines || 0;
    if (amountToCollect <= 0) return alert("Este vendedor no tiene multas pendientes por cobrar.");

    if (!window.confirm(`¿Cobrar multa total de Bs. ${amountToCollect.toFixed(2)} al vendedor ${vendor.name}? El saldo acumulado se reiniciará a 0 y se registrará el ingreso en efectivo.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await updateDoc(doc(db, "app_users", vendor.id), {
        accumulatedFines: 0
      });

      await addDoc(collection(db, "sales"), {
        items: [{ id: 'fine_collection', name: `Cobro de Multa: ${vendor.name}`, qty: 1, price: amountToCollect }],
        total: amountToCollect,
        method: 'Efectivo',
        cashPaid: amountToCollect,
        qrPaid: 0,
        vendorId: vendor.id,
        vendorName: vendor.name,
        isFineCollection: true,
        timestamp: serverTimestamp()
      });

      const fSnap = await getDocs(query(collection(db, "vendor_fines"), where("vendorId", "==", vendor.id), where("status", "==", "pending")));
      for (const fDoc of fSnap.docs) {
        await updateDoc(doc(db, "vendor_fines", fDoc.id), {
          status: 'collected',
          collectedAt: serverTimestamp()
        });
      }

      await logEvent('VENDOR_FINE_COLLECTED', currentUser?.email, `Cobrada multa de Bs. ${amountToCollect.toFixed(2)} a ${vendor.name}`, amountToCollect);
      alert(`✅ Cobro de multa por Bs. ${amountToCollect.toFixed(2)} registrado exitosamente.`);
      loadData();
    } catch (err) {
      console.error(err);
      alert("Error al cobrar multa a vendedor");
    } finally {
      setIsLoading(false);
    }
  };

  const recalculateFines = async () => {
    if (!window.confirm("¿Estás seguro que deseas recalcular los saldos de multas de todos los vendedores en base a su histórico pendiente?")) return;
    setIsLoading(true);
    try {
      let updatedCount = 0;
      for (const vendor of appUsers) {
        if (vendor.role === 'admin') continue;
        
        const fSnap = await getDocs(query(collection(db, "vendor_fines"), where("vendorId", "==", vendor.id), where("status", "==", "pending")));
        let correctSum = 0;
        fSnap.docs.forEach(d => {
          correctSum += (d.data().fineAmount || 0);
        });

        if (correctSum !== vendor.accumulatedFines) {
          await updateDoc(doc(db, "app_users", vendor.id), { accumulatedFines: correctSum });
          updatedCount++;
        }
      }
      alert(`Saldos recalculados exitosamente. Vendedores actualizados: ${updatedCount}`);
      loadData();
    } catch (e) {
      console.error(e);
      alert("Error al recalcular saldos de multas.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- UPDATE PRODUCT COST PRICE & MIN STOCK ---
  const handleUpdateProductCostAndMinStock = async (productId, newCostPrice, newMinStock) => {
    const cost = parseFloat(newCostPrice);
    const minSt = parseInt(newMinStock, 10);

    if (isNaN(cost) || cost < 0) return alert("Precio de compra inválido");
    if (isNaN(minSt) || minSt < 0) return alert("Stock mínimo inválido");

    try {
      await updateDoc(doc(db, "products", productId), {
        costPrice: cost,
        minStock: minSt
      });
      await logEvent('PRODUCT_COST_MINSTOCK_UPDATED', currentUser?.email, `Actualizado precio compra (Bs. ${cost.toFixed(2)}) y stock mín (${minSt}) para producto ID ${productId}`);
      loadData();
    } catch (err) {
      alert("Error actualizando datos del producto");
    }
  };

  // --- SHIFT CONTROL WITH CASH ENTRY ---
  const forceCloseShift = async (shiftId, vendorName) => {
    const cashInput = window.prompt(`Ingrese el dinero físico contado en caja para cerrar el turno de ${vendorName}:`, '0');
    if (cashInput === null) return; // User cancelled
    const physicalCash = parseFloat(cashInput) || 0;

    setIsLoading(true);
    try {
      const shiftSales = sales.filter(s => s.shiftId === shiftId);
      const cashSales = shiftSales.filter(s => s.method === 'Efectivo').reduce((acc, s) => acc + s.total, 0);
      const qrSales = shiftSales.filter(s => s.method === 'QR').reduce((acc, s) => acc + s.total, 0);
      const shiftExpenses = orders.filter(o => o.shiftId === shiftId).reduce((acc, o) => acc + o.amount, 0);
      
      const shDoc = shifts.find(s => s.id === shiftId);
      const startCash = shDoc?.startCash || 0;
      const expectedCash = startCash + cashSales - shiftExpenses;
      const difference = physicalCash - expectedCash;

      await updateDoc(doc(db, "shifts", shiftId), {
        status: 'closed',
        endTime: serverTimestamp(),
        endCash: physicalCash,
        expectedCash,
        totalCashSales: cashSales,
        totalQRSales: qrSales,
        totalExpenses: shiftExpenses,
        difference,
        forceClosedBy: currentUser?.email || 'Admin'
      });

      await logEvent(
        'FORCE_CLOSE_SHIFT',
        currentUser?.email,
        `Cierre forzado de turno de ${vendorName}. Esperado: Bs. ${expectedCash.toFixed(2)}, Rendido: Bs. ${physicalCash.toFixed(2)}, Dif: Bs. ${difference.toFixed(2)}`,
        physicalCash
      );

      alert(`Turno cerrado forzosamente.\n\nEsperado en caja: Bs. ${expectedCash.toFixed(2)}\nFísico ingresado: Bs. ${physicalCash.toFixed(2)}\nDiferencia: Bs. ${difference.toFixed(2)}`);
      loadData();
    } catch (e) {
      alert('Error cerrando turno: ' + (e.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  // --- PERIODICITY FILTER CALCULATIONS ---
  const getFilteredByPeriod = () => {
    try {
      const now = new Date();
      let startLimit = new Date(0);
      let endLimit = new Date(now.getFullYear() + 10, 11, 31, 23, 59, 59);

      if (periodFilter === 'hoy') {
        startLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        endLimit = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      } else if (periodFilter === 'semana') {
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0,0,0,0);
        startLimit = startOfWeek;
      } else if (periodFilter === 'mes') {
        startLimit = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      } else if (periodFilter === 'personalizado') {
        if (startDateFilter) startLimit = new Date(`${startDateFilter}T00:00:00`);
        if (endDateFilter) endLimit = new Date(`${endDateFilter}T23:59:59`);
      }

      const checkTs = (ts) => {
        if (!ts) return false;
        try {
          let dt = null;
          if (typeof ts.toDate === 'function') {
            dt = ts.toDate();
          } else if (typeof ts === 'object' && ts !== null && typeof ts.seconds === 'number') {
            dt = new Date(ts.seconds * 1000);
          } else if (typeof ts === 'string' || typeof ts === 'number') {
            dt = new Date(ts);
          } else if (ts instanceof Date) {
            dt = ts;
          }
          if (!dt || !(dt instanceof Date) || isNaN(dt.getTime())) return false;
          return dt >= startLimit && dt <= endLimit;
        } catch (e) {
          return false;
        }
      };

      const safeSales = Array.isArray(sales) ? sales : [];
      const safeOrders = Array.isArray(orders) ? orders : [];
      const safeLoans = Array.isArray(loans) ? loans : [];
      const safeLosses = Array.isArray(allLosses) ? allLosses : [];
      const safeExtras = Array.isArray(extraIncomes) ? extraIncomes : [];

      const periodSales = safeSales.filter(s => checkTs(s?.timestamp));
      const periodOrders = safeOrders.filter(o => checkTs(o?.timestamp));
      const periodLoans = safeLoans.filter(l => checkTs(l?.timestamp) || checkTs(l?.repaidAt));
      const periodLosses = safeLosses.filter(l => checkTs(l?.timestamp));
      const periodExtraIncomes = safeExtras.filter(i => checkTs(i?.timestamp));

      return { periodSales, periodOrders, periodLoans, periodLosses, periodExtraIncomes, checkTs };
    } catch (e) {
      console.error("Error filtering by period:", e);
      return { periodSales: [], periodOrders: [], periodLoans: [], periodLosses: [], periodExtraIncomes: [], checkTs: () => false };
    }
  };

  const { periodSales = [], periodOrders = [], periodLoans = [], periodLosses = [], periodExtraIncomes = [], checkTs = () => false } = getFilteredByPeriod();

  // Metrics based on period
  const pCashSales = periodSales.reduce((acc, s) => {
    if (s?.method === 'Efectivo') return acc + (parseFloat(s.total) || 0);
    if (s?.method === 'MIXTO') return acc + (parseFloat(s.cashPaid) || 0);
    return acc;
  }, 0);

  const pQRSales = periodSales.reduce((acc, s) => {
    if (s?.method === 'QR') return acc + (parseFloat(s.total) || 0);
    if (s?.method === 'MIXTO') return acc + (parseFloat(s.qrPaid) || ((parseFloat(s.total)||0) - (parseFloat(s.cashPaid)||0)));
    return acc;
  }, 0);

  const pPurchases = periodOrders.reduce((acc, o) => acc + (parseFloat(o?.amount) || 0), 0);
  
  const pLoanRepaymentsCash = periodLoans.filter(l => l?.status === 'repaid').reduce((acc, l) => {
    if (l?.method === 'QR') return acc;
    if (l?.method === 'MIXTO') return acc + (parseFloat(l.cashPaid) || 0);
    return acc + (l?.cashPaid !== undefined ? parseFloat(l.cashPaid) : (parseFloat(l?.amount) || 0));
  }, 0);

  const pLoanRepaymentsQR = periodLoans.filter(l => l?.status === 'repaid').reduce((acc, l) => {
    if (l?.method === 'QR') return acc + (parseFloat(l.amount) || 0);
    if (l?.method === 'MIXTO') return acc + (parseFloat(l.qrPaid) || 0);
    return acc;
  }, 0);

  const pLoanRepayments = pLoanRepaymentsCash + pLoanRepaymentsQR;

  const pExtraCash = periodExtraIncomes.filter(i => i?.method === 'Efectivo').reduce((acc, i) => acc + (parseFloat(i?.amount) || 0), 0);
  const pExtraQR = periodExtraIncomes.filter(i => i?.method === 'QR').reduce((acc, i) => acc + (parseFloat(i?.amount) || 0), 0);

  const pTotalIncome = pCashSales + pQRSales + pLoanRepayments + pExtraCash + pExtraQR;
  const pTotalExpenses = pPurchases;
  
  // Initial cash of shifts opened in this period
  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const pInitialCash = safeShifts.filter(s => checkTs(s?.startTime || s?.timestamp)).reduce((acc, s) => acc + (parseFloat(s?.startCash) || 0), 0);

  // SALDO ACUMULADO EN CAJA REAL (NUNCA NEGATIVO)
  const rawCashBalance = pInitialCash + pCashSales + pLoanRepaymentsCash + pExtraCash - pPurchases;
  const pCashBalance = Math.max(0, rawCashBalance);

  // Active shift calculations
  const activeShiftDoc = safeShifts.find(s => s?.status === 'open');
  let activeShiftCash = 0;
  if (activeShiftDoc) {
    const shiftSalesCash = (Array.isArray(sales) ? sales : []).filter(s => s?.shiftId === activeShiftDoc.id).reduce((acc, s) => {
      if (s?.method === 'Efectivo') return acc + (parseFloat(s.total) || 0);
      if (s?.method === 'MIXTO') return acc + (parseFloat(s.cashPaid) || 0);
      return acc;
    }, 0);
    const shiftExpenses = (Array.isArray(orders) ? orders : []).filter(o => o?.shiftId === activeShiftDoc.id).reduce((acc, o) => acc + (parseFloat(o.amount) || 0), 0);
    activeShiftCash = Math.max(0, (parseFloat(activeShiftDoc.startCash) || 0) + shiftSalesCash - shiftExpenses);
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />

      <div className="dashboard-layout">
        <div className="dashboard-header flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>⚙️ Panel de Administración - Racquet La Estación</h2>
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
                  💵 Caja Actual (Turno Activo: {activeShiftDoc.vendorName}): Bs. {activeShiftCash.toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
            <button className="btn btn-secondary" onClick={() => navigate('/supervisor')}>
              📋 Vista Supervisor
            </button>
            <Link to="/vendedor?from=admin" className="btn btn-primary" onClick={() => localStorage.setItem('user_role', 'admin')}>
              🛒 Ir a POS
            </Link>
          </div>
        </div>
        
        <div className="tabs" style={{flexWrap: 'wrap'}}>
          <div className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
            <BarChart3 size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Reportes Financieros
          </div>
          <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
            <Package size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Inventario ({products.length})
          </div>
          <div className={`tab ${activeTab === 'purchases' ? 'active' : ''}`} onClick={() => setActiveTab('purchases')}>
            🛒 Compra de Productos
          </div>
          <div className={`tab ${activeTab === 'expense_types' ? 'active' : ''}`} onClick={() => setActiveTab('expense_types')}>
            📋 Tipos de Egresos ({expenseTypes.length})
          </div>
          <div className={`tab ${activeTab === 'extraordinary_motives' ? 'active' : ''}`} onClick={() => setActiveTab('extraordinary_motives')}>
            💵 Motivos Ingresos Extra ({extraordinaryMotives.length})
          </div>
          <div className={`tab ${activeTab === 'vendor_fines' ? 'active' : ''}`} onClick={() => setActiveTab('vendor_fines')}>
            ⚖️ Multas a Vendedores ({appUsers.reduce((sum, u) => sum + (u.accumulatedFines || 0), 0) > 0 ? 'Con pendientes' : 'Al día'})
          </div>
          <div className={`tab ${activeTab === 'shifts' ? 'active' : ''}`} onClick={() => setActiveTab('shifts')}>
            <Clock size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Turnos
          </div>
          <div className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <Users size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Vendedores ({appUsers.length})
          </div>
          <div className={`tab ${activeTab === 'losses' ? 'active' : ''}`} onClick={() => setActiveTab('losses')}>
            <ShieldAlert size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Pérdidas ({pendingLosses.length})
          </div>
          <div className={`tab ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>
            <FileText size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Logs
          </div>
        </div>
      
      {isLoading && <div className="flex-center" style={{padding: '2rem'}}>Cargando...</div>}
      
      {/* --- REPORTS TAB WITH PERIODICITY & SUB-REPORTS --- */}
      {!isLoading && activeTab === 'reports' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          
          {/* Period Filter Selector */}
          <div className="card glass-panel flex-between" style={{flexWrap: 'wrap', gap: '1rem'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <Calendar size={20} style={{color: 'var(--primary-color)'}} />
              <h3 style={{margin: 0}}>Filtro de Periodicidad</h3>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center'}}>
              <button className={`btn ${periodFilter === 'hoy' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriodFilter('hoy')}>Hoy</button>
              <button className={`btn ${periodFilter === 'semana' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriodFilter('semana')}>Esta Semana</button>
              <button className={`btn ${periodFilter === 'mes' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriodFilter('mes')}>Este Mes</button>
              <button className={`btn ${periodFilter === 'personalizado' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPeriodFilter('personalizado')}>Entre Fechas</button>

              {periodFilter === 'personalizado' && (
                <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '0.5rem'}}>
                  <input type="date" className="input-field" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} />
                  <span>a</span>
                  <input type="date" className="input-field" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Financial Summary Cards */}
          <div className="dashboard-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'}}>
            <div className="card glass-panel" style={{borderLeft: '4px solid #10b981'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>💵 Ventas Efectivo</span>
                <HelpTooltip 
                  title="Ventas Cobradas en Billetes/Monedas" 
                  text="Suma de las ventas pagadas en efectivo durante el período seleccionado."
                  example="Si vendiste 2 gaseosas a Bs. 5.50 en efectivo, aquí suma Bs. 11.00."
                />
              </h3>
              <div className="card-value">Bs. {pCashSales.toFixed(2)}</div>
            </div>

            <div className="card glass-panel" style={{borderLeft: '4px solid #3b82f6'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>📱 Ventas QR</span>
                <HelpTooltip 
                  title="Ventas Transferencia / Código QR" 
                  text="Monto ingresado directamente a la cuenta bancaria. No afecta los billetes en caja."
                  example="Si un cliente te transfirió Bs. 6.50 por QR, ingresa al banco y se suma aquí."
                />
              </h3>
              <div className="card-value">Bs. {pQRSales.toFixed(2)}</div>
            </div>

            <div className="card glass-panel" style={{borderLeft: '4px solid #ef4444'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>🛒 Compras / Egresos</span>
                <HelpTooltip 
                  title="Egresos y Compras en Efectivo" 
                  text="Pagos realizados con dinero de la caja registradora (proveedores o gastos)."
                  example="Pagaste Bs. 20.00 en efectivo por recarga de insumos a un proveedor."
                />
              </h3>
              <div className="card-value">Bs. {pPurchases.toFixed(2)}</div>
            </div>

            <div className="card glass-panel" style={{borderLeft: '4px solid #8b5cf6'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>🔄 Cobro Préstamos</span>
                <HelpTooltip 
                  title="Cobros de Deudas / Fiados" 
                  text="Dinero recuperado por pago de fiados o préstamos registrados anteriormente."
                  example="Un cliente devuelve Bs. 15.00 que debía en efectivo."
                />
              </h3>
              <div className="card-value">Bs. {pLoanRepayments.toFixed(2)}</div>
            </div>

            <div className="card glass-panel" style={{borderLeft: '4px solid #14b8a6'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>➕ Ingresos Adicionales</span>
                <HelpTooltip 
                  title="Ingresos Extraordinarios y Aportes" 
                  text="Ingresos en caja no provenientes de la venta directa de productos en catálogo."
                  example="Reembolso de Bs. 8.00 del distribuidor por envases o aporte a caja."
                />
              </h3>
              <div className="card-value">Bs. {(pExtraCash + pExtraQR).toFixed(2)}</div>
            </div>

            <div className="card glass-panel" style={{borderLeft: '4px solid #f59e0b'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>💰 Flujo Neto Efectivo</span>
                <HelpTooltip 
                  title="Flujo Neto de Efectivo del Período" 
                  text="Saldo acumulado de billetes generados netos en el período (Ventas Ef + Cobros - Egresos). Difiere de la 'Caja Actual' porque esta última incluye el Dinero Inicial de Apertura."
                  example="Si cobraste Bs. 11.00 en ventas y Bs. 8.00 extra sin gastos, el flujo neto de hoy es Bs. 19.00."
                />
              </h3>
              <div className="card-value">Bs. {pCashBalance.toFixed(2)}</div>
            </div>

            <div className="card glass-panel" style={{borderLeft: '4px solid #06b6d4'}}>
              <h3 className="card-title" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
                <span>📈 Ingresos Totales</span>
                <HelpTooltip 
                  title="Ingresos Brutos Combinados (Efectivo + QR)" 
                  text="Suma total de todas las entradas financieras (Ventas Efectivo + QR + Cobros + Extras)."
                  example="Suma total de Bs. 11.00 (Ef) + Bs. 6.50 (QR) + Bs. 13.00 (Otros) = Bs. 30.50."
                />
              </h3>
              <div className="card-value">Bs. {pTotalIncome.toFixed(2)}</div>
            </div>
          </div>

          {/* ADMIN EXTRA INCOME REGISTRATION FORM */}
          <div className="card glass-panel" style={{maxWidth: '650px'}}>
            <h3><PlusCircle size={20} style={{display: 'inline', marginRight: '0.5rem', color: 'var(--secondary-color)'}}/> Registrar Ingreso Adicional / Extraordinario (Admin)</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
              Permite registrar devoluciones de proveedores, aportes de capital o ingresos extraordinarios.
            </p>
            <form onSubmit={handleAddExtraIncome} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
              <div className="form-group">
                <label>Tipo de Ingreso</label>
                <select 
                  className="input-field" 
                  value={extraIncomeForm.type} 
                  onChange={e => setExtraIncomeForm({...extraIncomeForm, type: e.target.value})}
                  required
                >
                  <option value="devolucion">Devolución / Reembolso</option>
                  <option value="extraordinario">Ingreso Extraordinario</option>
                  <option value="aporte">Aporte a Caja</option>
                  <option value="otro">Otro Ingreso</option>
                </select>
              </div>

              <div className="form-group">
                <label>Método de Pago</label>
                <select 
                  className="input-field" 
                  value={extraIncomeForm.method} 
                  onChange={e => setExtraIncomeForm({...extraIncomeForm, method: e.target.value})}
                  required
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="QR">QR / Transferencia Bancaria</option>
                </select>
              </div>

              <div className="form-group" style={{gridColumn: 'span 2'}}>
                <label>Descripción del Ingreso</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: Reembolso Coca-Cola por cajas devueltas, Venta de envases..."
                  value={extraIncomeForm.description}
                  onChange={e => setExtraIncomeForm({...extraIncomeForm, description: e.target.value})}
                  required
                />
              </div>

              <div className="form-group" style={{gridColumn: 'span 2'}}>
                <label>Monto (Bs.)</label>
                <input 
                  type="number" 
                  step="0.10"
                  className="input-field" 
                  placeholder="0.00"
                  value={extraIncomeForm.amount}
                  onChange={e => setExtraIncomeForm({...extraIncomeForm, amount: e.target.value})}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{gridColumn: 'span 2'}}>
                Registrar Ingreso Adicional
              </button>
            </form>
          </div>

          {/* Sub-Reports Selector */}
          <div className="card glass-panel">
            <div className="flex-between" style={{marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem'}}>
              <div className="tabs" style={{margin: 0, flexWrap: 'wrap'}}>
                <div className={`tab ${reportSubTab === 'all' ? 'active' : ''}`} onClick={() => setReportSubTab('all')}>Todas las Transacciones</div>
                <div className={`tab ${reportSubTab === 'extra' ? 'active' : ''}`} onClick={() => setReportSubTab('extra')}>Ingresos Adicionales ({periodExtraIncomes.length})</div>
                <div className={`tab ${reportSubTab === 'losses' ? 'active' : ''}`} onClick={() => setReportSubTab('losses')}>Reporte de Pérdidas</div>
                <div className={`tab ${reportSubTab === 'loans' ? 'active' : ''}`} onClick={() => setReportSubTab('loans')}>Reporte de Préstamos</div>
                <div className={`tab ${reportSubTab === 'orders' ? 'active' : ''}`} onClick={() => setReportSubTab('orders')}>Compras y Pedidos</div>
              </div>
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  if (reportSubTab === 'all') {
                    exportToCSV('transacciones.csv', periodSales.map(s => ({
                      FECHA: formatDate(s.timestamp), METODO: s.method, TOTAL: s.total, VENDEDOR: s.vendorName || '-'
                    })));
                  } else if (reportSubTab === 'extra') {
                    exportToCSV('ingresos_adicionales.csv', periodExtraIncomes.map(i => ({
                      FECHA: formatDate(i.timestamp), TIPO: i.type, DESCRIPCION: i.description, METODO: i.method, MONTO: i.amount, REGISTRADO_POR: i.registeredBy
                    })));
                  } else if (reportSubTab === 'losses') {
                    exportToCSV('reporte_perdidas.csv', periodLosses.map(l => ({
                      FECHA: formatDate(l.timestamp), PRODUCTO: l.productName, CANTIDAD: l.qty, MOTIVO: l.reason, ESTADO: l.status
                    })));
                  } else if (reportSubTab === 'loans') {
                    exportToCSV('reporte_prestamos.csv', periodLoans.map(l => ({
                      FECHA: formatDate(l.timestamp), PRESTATARIO: l.borrowerName, MONTO: l.amount, ESTADO: l.status
                    })));
                  } else if (reportSubTab === 'orders') {
                    exportToCSV('reporte_compras.csv', periodOrders.map(o => ({
                      FECHA: formatDate(o.timestamp), TIPO: o.type, DESCRIPCION: o.description, COMPROBANTE: o.receiptType, NUMERO: o.receiptNumber, MONTO: o.amount
                    })));
                  }
                }}
              >
                <Download size={16} /> Exportar CSV
              </button>
            </div>

            {/* Sub-Report 1: All Sales Transactions */}
            {reportSubTab === 'all' && (
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Fecha / Hora</th>
                    <th style={{padding: '0.5rem'}}>Vendedor</th>
                    <th style={{padding: '0.5rem'}}>Método</th>
                    <th style={{padding: '0.5rem'}}>Detalle de Productos</th>
                    <th style={{padding: '0.5rem', textAlign: 'right'}}>Total (Bs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {periodSales
                    .sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
                    .map(s => (
                      <tr key={s.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                        <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(s.timestamp)}</td>
                        <td style={{padding: '0.5rem', fontWeight: '500'}}>{s.vendorName || 'Vendedor'}</td>
                        <td style={{padding: '0.5rem'}}>
                          <span className={`badge ${s.method === 'Efectivo' ? 'badge-success' : 'badge-primary'}`}>{s.method}</span>
                        </td>
                        <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{s.items?.map(i => `${i.qty}x ${i.name}`).join(', ') || '-'}</td>
                        <td style={{padding: '0.5rem', textAlign: 'right', fontWeight: 'bold'}}>Bs. {(s.total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  {periodSales.length === 0 && (
                    <tr><td colSpan="5" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No se registraron ventas en el periodo seleccionado.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Sub-Report: Extra Incomes */}
            {reportSubTab === 'extra' && (
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Fecha</th>
                    <th style={{padding: '0.5rem'}}>Tipo</th>
                    <th style={{padding: '0.5rem'}}>Descripción</th>
                    <th style={{padding: '0.5rem'}}>Método</th>
                    <th style={{padding: '0.5rem'}}>Registrado Por</th>
                    <th style={{padding: '0.5rem', textAlign: 'right'}}>Monto (Bs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {periodExtraIncomes.map(i => (
                    <tr key={i.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(i.timestamp)}</td>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{i.type?.toUpperCase()}</td>
                      <td style={{padding: '0.5rem'}}>{i.description}</td>
                      <td style={{padding: '0.5rem'}}>
                        <span className={`badge ${i.method === 'Efectivo' ? 'badge-success' : 'badge-primary'}`}>{i.method}</span>
                      </td>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{i.registeredBy}</td>
                      <td style={{padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--secondary-color)'}}>
                        +Bs. {(i.amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {periodExtraIncomes.length === 0 && (
                    <tr><td colSpan="6" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No hay ingresos adicionales registrados en este periodo.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Sub-Report 2: Losses Report */}
            {reportSubTab === 'losses' && (
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Fecha</th>
                    <th style={{padding: '0.5rem'}}>Vendedor</th>
                    <th style={{padding: '0.5rem'}}>Producto</th>
                    <th style={{padding: '0.5rem'}}>Cantidad</th>
                    <th style={{padding: '0.5rem'}}>Motivo</th>
                    <th style={{padding: '0.5rem'}}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {periodLosses.map(l => (
                    <tr key={l.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(l.timestamp)}</td>
                      <td style={{padding: '0.5rem'}}>{l.vendorName || '-'}</td>
                      <td style={{padding: '0.5rem', fontWeight: '500'}}>{l.productName}</td>
                      <td style={{padding: '0.5rem'}}>{l.qty}</td>
                      <td style={{padding: '0.5rem'}}>{l.reason}</td>
                      <td style={{padding: '0.5rem'}}>
                        <span className={`badge ${l.status === 'approved' ? 'badge-success' : (l.status === 'rejected' ? 'badge-error' : 'badge-warning')}`}>
                          {l.status === 'approved' ? 'Aprobado' : (l.status === 'rejected' ? 'Rechazado' : 'Pendiente')}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {periodLosses.length === 0 && (
                    <tr><td colSpan="6" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No hay pérdidas registradas en este periodo.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Sub-Report 3: Loans Report */}
            {reportSubTab === 'loans' && (
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Fecha Registro</th>
                    <th style={{padding: '0.5rem'}}>Prestatario / Cliente</th>
                    <th style={{padding: '0.5rem'}}>Monto (Bs.)</th>
                    <th style={{padding: '0.5rem'}}>Estado</th>
                    <th style={{padding: '0.5rem'}}>Fecha Devolución</th>
                  </tr>
                </thead>
                <tbody>
                  {periodLoans.map(l => (
                    <tr key={l.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(l.timestamp)}</td>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{l.borrowerName}</td>
                      <td style={{padding: '0.5rem'}}>Bs. {(l.amount || 0).toFixed(2)}</td>
                      <td style={{padding: '0.5rem'}}>
                        <span className={`badge ${l.status === 'repaid' ? 'badge-success' : 'badge-warning'}`}>
                          {l.status === 'repaid' ? 'Devuelto' : 'Pendiente'}
                        </span>
                      </td>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(l.repaidAt)}</td>
                    </tr>
                  ))}
                  {periodLoans.length === 0 && (
                    <tr><td colSpan="5" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No se registraron préstamos en este periodo.</td></tr>
                  )}
                </tbody>
              </table>
            )}

            {/* Sub-Report 4: Orders & Purchases Report */}
            {reportSubTab === 'orders' && (
              <table style={{width: '100%', borderCollapse: 'collapse'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Fecha</th>
                    <th style={{padding: '0.5rem'}}>Tipo</th>
                    <th style={{padding: '0.5rem'}}>Descripción del Gasto</th>
                    <th style={{padding: '0.5rem'}}>Comprobante</th>
                    <th style={{padding: '0.5rem'}}>N° Comprobante</th>
                    <th style={{padding: '0.5rem', textAlign: 'right'}}>Monto (Bs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {periodOrders.map(o => (
                    <tr key={o.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(o.timestamp)}</td>
                      <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{o.type}</td>
                      <td style={{padding: '0.5rem'}}>{o.description}</td>
                      <td style={{padding: '0.5rem'}}>{o.receiptType}</td>
                      <td style={{padding: '0.5rem'}}>{o.receiptNumber || '-'}</td>
                      <td style={{padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)'}}>Bs. {(o.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {periodOrders.length === 0 && (
                    <tr><td colSpan="6" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No hay compras ni egresos en este periodo.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* --- INVENTORY & PRODUCTS TAB (TOP CARDS + TABLE) --- */}
      {!isLoading && activeTab === 'inventory' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          
          {/* REORDERED TOP CARDS SECTION */}
          <div className="dashboard-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))'}}>
            
            {/* Card 1: Create Product with Category Drop-Down */}
            <div className="card glass-panel">
              <h3>Nuevo Producto (Manual)</h3>
              <form onSubmit={handleCreateProduct}>
                <div className="form-group">
                  <label>Nombre / Descripción</label>
                  <input type="text" className="input-field" value={newProdForm.name} onChange={e=>setNewProdForm({...newProdForm, name: e.target.value})} placeholder="Ej: Fanta 2L" required/>
                </div>
                <div className="form-group">
                  <label>Categoría</label>
                  <select 
                    className="input-field" 
                    value={newProdForm.category} 
                    onChange={e=>setNewProdForm({...newProdForm, category: e.target.value})} 
                    required
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <div className="form-group" style={{flex: 1}}>
                    <label>Precio Venta (Bs.)</label>
                    <input type="number" step="0.10" className="input-field" value={newProdForm.price} onChange={e=>setNewProdForm({...newProdForm, price: e.target.value})} required/>
                  </div>
                  <div className="form-group" style={{flex: 1}}>
                    <label>Precio Compra (Bs.)</label>
                    <input type="number" step="0.10" className="input-field" value={newProdForm.costPrice} onChange={e=>setNewProdForm({...newProdForm, costPrice: e.target.value})} placeholder="Opcional"/>
                  </div>
                </div>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <div className="form-group" style={{flex: 1}}>
                    <label>Stock Inicial</label>
                    <input type="number" className="input-field" value={newProdForm.stock} onChange={e=>setNewProdForm({...newProdForm, stock: e.target.value})} required/>
                  </div>
                  <div className="form-group" style={{flex: 1}}>
                    <label>Stock Mínimo</label>
                    <input type="number" className="input-field" value={newProdForm.minStock} onChange={e=>setNewProdForm({...newProdForm, minStock: e.target.value})} required/>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-block">Guardar Producto</button>
              </form>
            </div>

            {/* Card 2: ABM de Categorías */}
            <div className="card glass-panel">
              <h3>ABM de Categorías</h3>
              <form onSubmit={handleCreateCategory} style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
                <input 
                  type="text" 
                  className="input-field" 
                  value={newCatName} 
                  onChange={e => setNewCatName(e.target.value)} 
                  placeholder="Nueva categoría..." 
                  required
                />
                <button type="submit" className="btn btn-primary">+</button>
              </form>

              <div className="item-list" style={{maxHeight: '220px', overflowY: 'auto'}}>
                {categories.map(c => (
                  <div key={c} className="list-item" style={{padding: '0.4rem 0.6rem'}}>
                    {editingCategory === c ? (
                      <div style={{display: 'flex', gap: '0.35rem', width: '100%'}}>
                        <input 
                          type="text" 
                          className="input-field" 
                          style={{padding: '0.2rem', fontSize: '0.85rem'}}
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                        />
                        <button className="btn btn-success" style={{padding: '0.2rem 0.4rem'}} onClick={() => handleRenameCategory(c)}><Check size={14}/></button>
                        <button className="btn btn-secondary" style={{padding: '0.2rem 0.4rem'}} onClick={() => setEditingCategory(null)}><X size={14}/></button>
                      </div>
                    ) : (
                      <>
                        <span style={{fontWeight: '500'}}>{c}</span>
                        <div style={{display: 'flex', gap: '0.25rem'}}>
                          <button className="btn btn-secondary" style={{padding: '0.2rem 0.4rem', fontSize: '0.75rem'}} onClick={() => {setEditingCategory(c); setEditCatName(c);}}>
                            Editar
                          </button>
                          <button className="btn btn-danger" style={{padding: '0.2rem 0.4rem', fontSize: '0.75rem'}} onClick={() => handleDeleteCategory(c)}>
                            <X size={14}/>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Bulk Category Reassignment */}
            <div className="card glass-panel">
              <h3>Reasignar Categoría en Bloque</h3>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>
                Transfiere todos los productos de una categoría hacia otra.
              </p>
              <form onSubmit={handleBulkMoveCategory}>
                <div className="form-group">
                  <label>Categoría Origen (Mover desde)</label>
                  <select className="input-field" value={moveFromCategory} onChange={e=>setMoveFromCategory(e.target.value)} required>
                    <option value="">Seleccione Origen...</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Categoría Destino (Mover hacia)</label>
                  <select className="input-field" value={moveToCategory} onChange={e=>setMoveToCategory(e.target.value)} required>
                    <option value="">Seleccione Destino...</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary btn-block">Transferir Productos</button>
              </form>
            </div>

          </div>

          {/* MAIN INVENTORY PRODUCTS TABLE */}
          <div className="card glass-panel">
            <div className="flex-between" style={{marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem'}}>
              <h3>Catálogo de Productos ({products.filter(p => !p.isDeleted).length})</h3>
              <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
                <label style={{fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer'}}>
                  <input 
                    type="checkbox" 
                    checked={csvHasHeader} 
                    onChange={e => setCsvHasHeader(e.target.checked)} 
                  />
                  ¿Fila de títulos en CSV?
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

            {/* Search & Filters */}
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
                <option value="todas">Todas las Categorías</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
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
                  <th style={{padding: '0.5rem'}}>Precio Venta (Bs.)</th>
                  <th style={{padding: '0.5rem'}}>Precio Compra (Bs.)</th>
                  <th style={{padding: '0.5rem'}}>Stock Actual</th>
                  <th style={{padding: '0.5rem'}}>Stock Mínimo</th>
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
                    const minStockVal = p.minStock !== undefined ? p.minStock : 3;
                    const defaultCost = p.costPrice !== undefined ? p.costPrice : Math.round((p.price || 0) * 0.8 * 100) / 100;
                    const isLowStock = (p.stock || 0) <= minStockVal;

                    return (
                      <tr 
                        key={p.id} 
                        className={isLowStock ? "min-stock-row" : ""} 
                        style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}
                      >
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="text" 
                              className="input-field" 
                              value={editProdForm.name} 
                              onChange={e => setEditProdForm({...editProdForm, name: e.target.value})} 
                            />
                          ) : (
                            <span style={{fontWeight: '600'}}>{p.name}</span>
                          )}
                        </td>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <select 
                              className="input-field" 
                              value={editProdForm.category} 
                              onChange={e => setEditProdForm({...editProdForm, category: e.target.value})}
                            >
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
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
                            <span style={{fontWeight: 'bold'}}>Bs. {parseFloat(p.price || 0).toFixed(2)}</span>
                          )}
                        </td>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="number" 
                              step="0.10"
                              className="input-field" 
                              style={{width: '90px'}}
                              value={editProdForm.costPrice !== undefined ? editProdForm.costPrice : defaultCost} 
                              onChange={e => setEditProdForm({...editProdForm, costPrice: e.target.value})} 
                            />
                          ) : (
                            <span style={{fontWeight: 'bold', color: 'var(--text-muted)'}}>Bs. {parseFloat(defaultCost).toFixed(2)}</span>
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
                            <span style={{fontWeight: 'bold', color: isLowStock ? '#e7716d' : 'inherit'}}>
                              {p.stock !== undefined ? p.stock : 0} {isLowStock && '⚠️'}
                            </span>
                          )}
                        </td>
                        <td style={{padding: '0.5rem'}}>
                          {isEditing ? (
                            <input 
                              type="number" 
                              className="input-field" 
                              style={{width: '70px'}}
                              value={editProdForm.minStock !== undefined ? editProdForm.minStock : minStockVal} 
                              onChange={e => setEditProdForm({...editProdForm, minStock: e.target.value})} 
                            />
                          ) : (
                            <span style={{fontWeight: 'bold'}}>{minStockVal}</span>
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
                              <button className="btn btn-secondary" style={{padding: '0.25rem 0.5rem'}} onClick={() => {
                                startEditProduct(p);
                                setEditProdForm(prev => ({
                                  ...prev,
                                  costPrice: defaultCost,
                                  minStock: minStockVal
                                }));
                              }}>
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
        </div>
      )}

      {/* --- STANDALONE PRODUCT PURCHASES TAB --- */}
      {!isLoading && activeTab === 'purchases' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '1fr 2fr'}}>
          {/* Left Form */}
          <div className="card glass-panel">
            <h3>🛒 Datos de la Compra</h3>
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
              El registro incrementará automáticamente el stock de los productos seleccionados.
            </p>
            <form onSubmit={executeProductPurchase}>
              <div className="form-group">
                <label>Descripción de la Compra</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: Reabastecimiento de Sodas y Bebidas..."
                  value={purchaseForm.description} 
                  onChange={e => setPurchaseForm({...purchaseForm, description: e.target.value})} 
                  required
                />
              </div>

              <div className="form-group">
                <label>Proveedor / Nota (Opcional)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: Distribuidora Central S.R.L."
                  value={purchaseForm.supplier} 
                  onChange={e => setPurchaseForm({...purchaseForm, supplier: e.target.value})} 
                />
              </div>

              <div className="form-group">
                <label>Tipo de Comprobante</label>
                <select 
                  className="input-field" 
                  value={purchaseForm.receiptType} 
                  onChange={e => setPurchaseForm({...purchaseForm, receiptType: e.target.value})}
                >
                  <option value="factura">Factura</option>
                  <option value="recibo">Recibo</option>
                  <option value="ninguno">Sin Comprobante</option>
                </select>
              </div>

              <div className="form-group">
                <label>Nro. de Comprobante</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: FAC-84930"
                  value={purchaseForm.receiptNumber} 
                  onChange={e => setPurchaseForm({...purchaseForm, receiptNumber: e.target.value})} 
                />
              </div>

              <div style={{padding: '1rem', background: 'rgba(39, 108, 211, 0.1)', borderRadius: '10px', marginBottom: '1.5rem'}}>
                <span style={{fontSize: '0.9rem', color: 'var(--text-secondary)'}}>Total de la Compra:</span>
                <div style={{fontSize: '1.6rem', fontWeight: '800', color: 'var(--primary-color)'}}>
                  Bs. {purchaseCart.reduce((sum, item) => sum + (item.qty * item.unitCostPrice), 0).toFixed(2)}
                </div>
                <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                  {purchaseCart.length} de 40 productos seleccionados
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary btn-block" 
                disabled={purchaseCart.length === 0}
              >
                💾 Confirmar Compra & Aumentar Stock
              </button>
            </form>
          </div>

          {/* Right Product Selector & Cart */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
            <div className="card glass-panel">
              <h3>Seleccionar Productos (Máx. 40 ítems)</h3>
              
              {/* Filtros de Productos */}
              <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--dropdown-bg)', borderRadius: '8px', border: '1px solid var(--border-color)'}}>
                <input type="text" className="input-field" placeholder="Buscar nombre..." value={purchaseFilters.search} onChange={e => setPurchaseFilters({...purchaseFilters, search: e.target.value})} style={{flex: '1 1 150px', padding: '0.25rem 0.5rem'}} />
                <select className="input-field" value={purchaseFilters.category} onChange={e => setPurchaseFilters({...purchaseFilters, category: e.target.value})} style={{flex: '1 1 120px', padding: '0.25rem'}}>
                  <option value="todas">Categoría: Todas</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{display: 'flex', gap: '0.25rem', alignItems: 'center', flex: '1 1 120px'}}>
                  <span style={{fontSize: '0.75rem', whiteSpace: 'nowrap'}}>Venta:</span>
                  <input type="number" placeholder="Min" className="input-field" value={purchaseFilters.minSalePrice} onChange={e => setPurchaseFilters({...purchaseFilters, minSalePrice: e.target.value})} style={{padding: '0.25rem', width: '50px'}} />
                  <input type="number" placeholder="Max" className="input-field" value={purchaseFilters.maxSalePrice} onChange={e => setPurchaseFilters({...purchaseFilters, maxSalePrice: e.target.value})} style={{padding: '0.25rem', width: '50px'}} />
                </div>
                <div style={{display: 'flex', gap: '0.25rem', alignItems: 'center', flex: '1 1 120px'}}>
                  <span style={{fontSize: '0.75rem', whiteSpace: 'nowrap'}}>Compra:</span>
                  <input type="number" placeholder="Min" className="input-field" value={purchaseFilters.minCostPrice} onChange={e => setPurchaseFilters({...purchaseFilters, minCostPrice: e.target.value})} style={{padding: '0.25rem', width: '50px'}} />
                  <input type="number" placeholder="Max" className="input-field" value={purchaseFilters.maxCostPrice} onChange={e => setPurchaseFilters({...purchaseFilters, maxCostPrice: e.target.value})} style={{padding: '0.25rem', width: '50px'}} />
                </div>
              </div>

              <div style={{overflowY: 'auto', maxHeight: '280px', marginTop: '0.5rem'}}>
                <table style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                      <th style={{padding: '0.5rem'}}>Producto</th>
                      <th style={{padding: '0.5rem'}}>Precio Compra</th>
                      <th style={{padding: '0.5rem'}}>Cant. a Comprar</th>
                      <th style={{padding: '0.5rem', textAlign: 'center'}}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.filter(p => {
                      if (p.isDeleted) return false;
                      if (purchaseFilters.category !== 'todas' && p.category !== purchaseFilters.category) return false;
                      if (purchaseFilters.search && !p.name.toLowerCase().includes(purchaseFilters.search.toLowerCase())) return false;
                      if (purchaseFilters.minSalePrice && parseFloat(p.price) < parseFloat(purchaseFilters.minSalePrice)) return false;
                      if (purchaseFilters.maxSalePrice && parseFloat(p.price) > parseFloat(purchaseFilters.maxSalePrice)) return false;
                      const cost = p.costPrice !== undefined ? p.costPrice : Math.round((p.price || 0) * 0.8 * 100) / 100;
                      if (purchaseFilters.minCostPrice && cost < parseFloat(purchaseFilters.minCostPrice)) return false;
                      if (purchaseFilters.maxCostPrice && cost > parseFloat(purchaseFilters.maxCostPrice)) return false;
                      return true;
                    }).map(p => {
                      const defaultCost = p.costPrice !== undefined ? p.costPrice : Math.round((p.price || 0) * 0.8 * 100) / 100;
                      return (
                        <tr key={p.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                          <td style={{padding: '0.5rem', fontWeight: '600'}}>{p.name}</td>
                          <td style={{padding: '0.5rem'}}>
                            Bs. {defaultCost.toFixed(2)}
                          </td>
                          <td style={{padding: '0.5rem'}}>
                            <input 
                              type="number" 
                              min="1" 
                              id={`qty-inp-${p.id}`} 
                              defaultValue="1" 
                              className="input-field" 
                              style={{width: '70px', padding: '0.2rem'}}
                            />
                          </td>
                          <td style={{padding: '0.5rem', textAlign: 'center'}}>
                            <button 
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                const qtyInp = document.getElementById(`qty-inp-${p.id}`);
                                addProductToPurchaseCart(p, qtyInp?.value || 1, defaultCost);
                              }}
                            >
                              + Agregar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Purchase Cart Table */}
            <div className="card glass-panel">
              <h3>Ítems en la Compra Actual ({purchaseCart.length})</h3>
              {purchaseCart.length === 0 ? (
                <p style={{color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center'}}>
                  No has agregado productos a esta compra aún.
                </p>
              ) : (
                <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem'}}>
                  <thead>
                    <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                      <th style={{padding: '0.5rem'}}>Producto</th>
                      <th style={{padding: '0.5rem'}}>Cantidad</th>
                      <th style={{padding: '0.5rem'}}>Costo Unitario</th>
                      <th style={{padding: '0.5rem'}}>Subtotal</th>
                      <th style={{padding: '0.5rem', textAlign: 'center'}}>Quitar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseCart.map(item => (
                      <tr key={item.productId} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                        <td style={{padding: '0.5rem', fontWeight: '600'}}>{item.productName}</td>
                        <td style={{padding: '0.5rem'}}>{item.qty} u.</td>
                        <td style={{padding: '0.5rem'}}>Bs. {item.unitCostPrice.toFixed(2)}</td>
                        <td style={{padding: '0.5rem', fontWeight: 'bold'}}>Bs. {(item.qty * item.unitCostPrice).toFixed(2)}</td>
                        <td style={{padding: '0.5rem', textAlign: 'center'}}>
                          <button 
                            className="btn btn-danger btn-sm" 
                            onClick={() => removeProductFromPurchaseCart(item.productId)}
                          >
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Purchase History */}
            <div className="card glass-panel" style={{marginTop: '1.5rem'}}>
              <h3>📜 Histórico de Compras de Productos</h3>
              <div style={{overflowY: 'auto', maxHeight: '400px', marginTop: '0.5rem'}}>
                {orders.filter(o => o.type === 'compra_productos').length === 0 ? (
                  <p style={{color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center'}}>No hay registro de compras de productos.</p>
                ) : (
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem'}}>
                    <thead>
                      <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                        <th style={{padding: '0.5rem'}}>Fecha</th>
                        <th style={{padding: '0.5rem'}}>Descripción</th>
                        <th style={{padding: '0.5rem'}}>Total</th>
                        <th style={{padding: '0.5rem'}}>Ítems</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders
                        .filter(o => o.type === 'compra_productos')
                        .sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
                        .map(order => (
                        <tr key={order.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                          <td style={{padding: '0.5rem'}}>
                            {order.timestamp?.seconds ? new Date(order.timestamp.seconds * 1000).toLocaleString('es-BO') : 'N/A'}
                          </td>
                          <td style={{padding: '0.5rem'}}>
                            <strong>{order.description}</strong>
                            <div style={{fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                              {order.supplier && `Prov: ${order.supplier} | `}
                              {order.receiptType}: {order.receiptNumber || 'S/N'}
                            </div>
                          </td>
                          <td style={{padding: '0.5rem', fontWeight: 'bold'}}>Bs. {order.amount?.toFixed(2)}</td>
                          <td style={{padding: '0.5rem'}}>
                            <ul style={{margin: 0, paddingLeft: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                              {order.items?.map((item, idx) => (
                                <li key={idx}>{item.qty}x {item.productName}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- ABM TIPOS DE EGRESOS TAB --- */}
      {!isLoading && activeTab === 'expense_types' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '1fr 2fr'}}>
          <div className="card glass-panel">
            <h3>Nuevo Tipo de Egreso</h3>
            <form onSubmit={addExpenseType}>
              <div className="form-group">
                <label>Nombre del Tipo de Egreso</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: Mantenimiento de Canchas" 
                  value={newExpenseType} 
                  onChange={e => setNewExpenseType(e.target.value)} 
                  required 
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block">Agregar Tipo de Egreso</button>
            </form>
          </div>

          <div className="card glass-panel">
            <h3>Tipos de Egresos Registrados ({expenseTypes.length})</h3>
            <div className="item-list">
              {expenseTypes.map((item, idx) => (
                <div key={idx} className="list-item" style={{padding: '0.75rem 1rem'}}>
                  <span style={{fontWeight: '600'}}>{item}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteExpenseType(item)}>
                    <X size={14} /> Eliminar
                  </button>
                </div>
              ))}
              {expenseTypes.length === 0 && (
                <p style={{color: 'var(--text-secondary)'}}>No se han registrado tipos de egresos aún.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- ABM MOTIVOS INGRESOS EXTRAORDINARIOS TAB --- */}
      {!isLoading && activeTab === 'extraordinary_motives' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '1fr 2fr'}}>
          <div className="card glass-panel">
            <h3>Nuevo Motivo de Ingreso Extraordinario</h3>
            <form onSubmit={addExtraordinaryMotive}>
              <div className="form-group">
                <label>Nombre del Motivo</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej: Auspicio Evento" 
                  value={newExtraordinaryMotive} 
                  onChange={e => setNewExtraordinaryMotive(e.target.value)} 
                  required 
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block">Agregar Motivo</button>
            </form>
          </div>

          <div className="card glass-panel">
            <h3>Motivos Registrados ({extraordinaryMotives.length})</h3>
            <div className="item-list">
              {extraordinaryMotives.map((item, idx) => (
                <div key={idx} className="list-item" style={{padding: '0.75rem 1rem'}}>
                  <span style={{fontWeight: '600'}}>{item}</span>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteExtraordinaryMotive(item)}>
                    <X size={14} /> Eliminar
                  </button>
                </div>
              ))}
              {extraordinaryMotives.length === 0 && (
                <p style={{color: 'var(--text-secondary)'}}>No se han registrado motivos extraordinarios aún.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MULTAS Y PÉRDIDAS VENDEDORES TAB --- */}
      {!isLoading && activeTab === 'vendor_fines' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
          <div className="dashboard-grid" style={{gridTemplateColumns: '1fr 2fr'}}>
            {/* Form Assign Fine */}
            <div className="card glass-panel">
              <h3>⚖️ Asignar Multa por Pérdida a Vendedor</h3>
              <form onSubmit={assignVendorFine}>
                <div className="form-group">
                  <label>Seleccionar Vendedor</label>
                  <select 
                    className="input-field" 
                    value={assignFineForm.vendorId} 
                    onChange={e => setAssignFineForm({...assignFineForm, vendorId: e.target.value})} 
                    required
                  >
                    <option value="">-- Seleccionar --</option>
                    {appUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Seleccionar Producto Perdido</label>
                  <select 
                    className="input-field" 
                    value={assignFineForm.productId} 
                    onChange={e => setAssignFineForm({...assignFineForm, productId: e.target.value})} 
                    required
                  >
                    <option value="">-- Seleccionar --</option>
                    {products.filter(p => !p.isDeleted).map(p => {
                      const cost = p.costPrice || Math.round((p.price || 0) * 0.8 * 100) / 100;
                      return <option key={p.id} value={p.id}>{p.name} (Bs. {cost.toFixed(2)} cost)</option>;
                    })}
                  </select>
                </div>

                <div className="form-group">
                  <label>Cantidad Perdida</label>
                  <input 
                    type="number" 
                    min="1" 
                    className="input-field" 
                    value={assignFineForm.qty} 
                    onChange={e => setAssignFineForm({...assignFineForm, qty: e.target.value})} 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Motivo</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Ej: Producto roto en turno" 
                    value={assignFineForm.reason} 
                    onChange={e => setAssignFineForm({...assignFineForm, reason: e.target.value})} 
                  />
                </div>
                
                <div className="form-group" style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem'}}>
                  <input 
                    type="checkbox" 
                    id="deductInventory"
                    checked={assignFineForm.deductInventory}
                    onChange={e => setAssignFineForm({...assignFineForm, deductInventory: e.target.checked})}
                  />
                  <label htmlFor="deductInventory" style={{margin: 0, cursor: 'pointer'}}>Descontar del inventario general</label>
                </div>

                <button type="submit" className="btn btn-danger btn-block" disabled={isLoading}>
                  {isLoading ? 'Procesando...' : 'Asignar Multa y Guardar'}
                </button>
              </form>
            </div>

            {/* Accumulated Fines Summary */}
            <div className="card glass-panel">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h3>💰 Saldo Acumulado de Multas por Vendedor</h3>
                <button className="btn btn-secondary btn-sm" onClick={recalculateFines} disabled={isLoading}>
                  🔄 Recalcular Saldos
                </button>
              </div>
              <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '1rem'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                    <th style={{padding: '0.5rem'}}>Vendedor</th>
                    <th style={{padding: '0.5rem'}}>Multas Acumuladas Pendientes</th>
                    <th style={{padding: '0.5rem', textAlign: 'center'}}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {appUsers.map(vendor => {
                    const accumulated = vendor.accumulatedFines || 0;
                    return (
                      <tr key={vendor.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                        <td style={{padding: '0.5rem', fontWeight: '700'}}>{vendor.name}</td>
                        <td style={{padding: '0.5rem', fontWeight: '800', color: accumulated > 0 ? '#e7716d' : '#10b981'}}>
                          Bs. {accumulated.toFixed(2)}
                        </td>
                        <td style={{padding: '0.5rem', textAlign: 'center'}}>
                          <button 
                            className="btn btn-primary btn-sm" 
                            disabled={accumulated <= 0}
                            onClick={() => collectVendorFine(vendor)}
                          >
                            💵 Cobrar Multa
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Histórico de Multas */}
          <div className="card glass-panel">
            <h3>📜 Histórico de Multas (Nuevas Primero)</h3>
            <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '1rem'}}>
              <thead>
                <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                  <th style={{padding: '0.5rem'}}>Fecha</th>
                  <th style={{padding: '0.5rem'}}>Vendedor</th>
                  <th style={{padding: '0.5rem'}}>Producto</th>
                  <th style={{padding: '0.5rem'}}>Cantidad</th>
                  <th style={{padding: '0.5rem'}}>Precio Compra</th>
                  <th style={{padding: '0.5rem'}}>Monto Multa</th>
                  <th style={{padding: '0.5rem'}}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {fineHistory.map(fine => {
                  const dateStr = fine.timestamp?.seconds ? new Date(fine.timestamp.seconds * 1000).toLocaleString() : 'Reciente';
                  const isCollected = fine.status === 'collected';
                  return (
                    <tr key={fine.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                      <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{dateStr}</td>
                      <td style={{padding: '0.5rem', fontWeight: '600'}}>{fine.vendorName}</td>
                      <td style={{padding: '0.5rem'}}>{fine.productName}</td>
                      <td style={{padding: '0.5rem'}}>{fine.qty} u.</td>
                      <td style={{padding: '0.5rem'}}>Bs. {(fine.purchasePrice || 0).toFixed(2)}</td>
                      <td style={{padding: '0.5rem', fontWeight: '800', color: '#e7716d'}}>Bs. {(fine.fineAmount || 0).toFixed(2)}</td>
                      <td style={{padding: '0.5rem'}}>
                        {isCollected ? (
                          <span className="badge badge-success">✓ Cobrada</span>
                        ) : (
                          <span className="badge badge-error">Pendiente</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {fineHistory.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                      No hay historial de multas registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SHIFT MONITORING TAB --- */}
      {!isLoading && activeTab === 'shifts' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
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
                  <p>{formatDate(activeShiftDoc.startTime)}</p>
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

          <div className="card glass-panel">
            <h3><Clock size={20} /> Historial y Seguimiento de Turnos (Ordenado por Turnos Recientes)</h3>
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
                {[...shifts]
                  .sort((a,b) => {
                    const tA = a.startTime?.seconds || (a.startTime ? new Date(a.startTime).getTime()/1000 : 0);
                    const tB = b.startTime?.seconds || (b.startTime ? new Date(b.startTime).getTime()/1000 : 0);
                    return tB - tA;
                  })
                  .map(sh => {
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
                    <td colSpan="10" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>
                      No se han registrado turnos aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- VENDORS MANAGEMENT TAB --- */}
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

      {/* --- LOSSES & ADJUSTMENTS TAB --- */}
      {!isLoading && activeTab === 'losses' && (
        <div className="dashboard-grid" style={{gridTemplateColumns: '2fr 1fr'}}>
          <div className="card glass-panel">
            <h3>Aprobación de Pérdidas y Robos ({pendingLosses.length})</h3>
            <div className="item-list">
              {pendingLosses.map(loss => (
                <div key={loss.id} className="list-item" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                  <div className="flex-between" style={{width: '100%', marginBottom: '0.5rem'}}>
                    <h4>{loss.qty}x {loss.productName}</h4>
                    <span className="badge badge-error">{loss.reason}</span>
                  </div>
                  <div className="flex-between" style={{width: '100%'}}>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>
                      Vendedor: {loss.vendorName || '-'} | Fecha: {formatDate(loss.timestamp)}
                    </p>
                    <div style={{display: 'flex', gap: '0.5rem'}}>
                      <button className="btn btn-success" onClick={() => handleLoss(loss.id, true)}>Aprobar y Descontar</button>
                      <button className="btn btn-danger" onClick={() => handleLoss(loss.id, false)}>Rechazar</button>
                    </div>
                  </div>
                </div>
              ))}
              {pendingLosses.length === 0 && <p style={{color: 'var(--text-secondary)', padding: '1rem', textAlign: 'center'}}>No hay pérdidas pendientes de revisión.</p>}
            </div>
          </div>
          
          <div className="card glass-panel">
            <h3>Motivos de Pérdida Configurados</h3>
            <form onSubmit={addMotivo} style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
              <input type="text" className="input-field" value={newMotivo} onChange={e=>setNewMotivo(e.target.value)} placeholder="Ej: Caducado, Vencido..." required/>
              <button type="submit" className="btn btn-primary">+</button>
            </form>
            <div className="item-list">
              {motivos.map(m => (
                <div key={m} className="list-item" style={{padding: '0.5rem'}}>
                  <span>{m}</span>
                  <button className="btn btn-secondary" style={{padding: '0.2rem 0.5rem'}} onClick={() => deleteMotivo(m)}><X size={14}/></button>
                </div>
              ))}
              {motivos.length === 0 && <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)'}}>No se han registrado motivos aún.</p>}
            </div>
          </div>
        </div>
      )}

      {/* --- SYSTEM LOGS TAB --- */}
      {!isLoading && activeTab === 'logs' && (
        <div className="card glass-panel">
          <div className="flex-between" style={{marginBottom: '1rem'}}>
            <h3><FileText size={20} /> Historial y Auditoría de Eventos del Sistema</h3>
            <button className="btn btn-secondary" onClick={() => exportToCSV('logs_sistema.csv', systemLogs.map(l => ({
              FECHA: formatDate(l.timestamp), TIPO: l.type, USUARIO: l.user, DETALLE: l.detail, MONTO: l.amount
            })))}>
              <Download size={16} /> Exportar CSV
            </button>
          </div>
          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                <th style={{padding: '0.5rem'}}>Fecha / Hora</th>
                <th style={{padding: '0.5rem'}}>Evento</th>
                <th style={{padding: '0.5rem'}}>Usuario</th>
                <th style={{padding: '0.5rem'}}>Detalle de la Acción</th>
                <th style={{padding: '0.5rem', textAlign: 'right'}}>Monto (Bs.)</th>
              </tr>
            </thead>
            <tbody>
              {systemLogs.map(log => (
                <tr key={log.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                  <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{formatDate(log.timestamp)}</td>
                  <td style={{padding: '0.5rem'}}>
                    <span className="badge badge-primary" style={{fontSize: '0.75rem'}}>{log.type}</span>
                  </td>
                  <td style={{padding: '0.5rem', fontWeight: '500'}}>{log.user}</td>
                  <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>{log.detail}</td>
                  <td style={{padding: '0.5rem', textAlign: 'right', fontWeight: 'bold'}}>
                    {log.amount ? `Bs. ${log.amount.toFixed(2)}` : '-'}
                  </td>
                </tr>
              ))}
              {systemLogs.length === 0 && (
                <tr><td colSpan="5" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No se han registrado eventos en el log del sistema.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      </div>
    </div>
  );
};

export default AdminDashboard;
