import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, addDoc, serverTimestamp, where, updateDoc, doc, increment } from 'firebase/firestore';
import { Search, ShoppingCart, LogOut, Package, CreditCard, Banknote, Coffee, History, AlertTriangle, Send, Clock, ShieldAlert, Download, Filter, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { exportToCSV } from '../utils/csvExporter';
import { logEvent } from '../utils/logger';

const VendorDashboard = () => {
  const { logout, currentUser, userRole } = useAuth();
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
  const [activeTab, setActiveTab] = useState('pos'); // pos, inventory, loans, losses, orders, history, shift
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
  
  // Pago Mixto Modal State
  const [showMixtoModal, setShowMixtoModal] = useState(false);
  const [mixtoCashInput, setMixtoCashInput] = useState('');
  const [mixtoTargetType, setMixtoTargetType] = useState('sale'); // 'sale' o 'loan'
  const [selectedLoanToPay, setSelectedLoanToPay] = useState(null);

  // Pago Préstamo Modal State
  const [showLoanPayModal, setShowLoanPayModal] = useState(false);
  const [loanPayMethod, setLoanPayMethod] = useState('Efectivo'); // 'Efectivo', 'QR', 'MIXTO'

  // Vendor Self PIN Change State
  const [showPinModal, setShowPinModal] = useState(false);
  const [newVendorPin, setNewVendorPin] = useState('');

  const isAdmin = userRole === 'admin' ||
                  currentUser?.role === 'admin' || 
                  currentUser?.email === 'pretsodatabase@gmail.com' ||
                  currentUser?.email === 'admin@demob.com' ||
                  localStorage.getItem('user_role') === 'admin' ||
                  window.location.search.includes('from=admin');

  useEffect(() => {
    loadInitialData();
  }, [currentUser]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      // Load products safely
      const pSnapshot = await getDocs(query(collection(db, "products")));
      const prods = [];
      pSnapshot.forEach(doc => {
        const data = doc.data();
        prods.push({ 
          id: doc.id, 
          name: data.name || 'Sin nombre',
          category: data.category || 'GENERAL',
          price: parseFloat(data.price) || 0,
          stock: data.stock !== undefined ? parseInt(data.stock) : 0,
          isDeleted: !!data.isDeleted,
          ...data 
        });
      });
      setProducts(prods.sort((a,b) => (a.name || '').localeCompare(b.name || '')));

      // Load motivos safely
      try {
        const mSnapshot = await getDocs(query(collection(db, "settings")));
        mSnapshot.forEach(doc => {
          if (doc.id === 'motivos') setMotivos(doc.data()?.list || []);
        });
      } catch (mErr) {
        console.warn("Motivos fetch warning:", mErr);
      }

      // Check active shift globally across store
      const sQuery = query(collection(db, "shifts"), where("status", "==", "open"));
      const sSnapshot = await getDocs(sQuery);
      if (!sSnapshot.empty) {
        const globalShiftDoc = sSnapshot.docs[0];
        const globalShiftData = globalShiftDoc.data();
        const globalShiftId = globalShiftDoc.id;
        
        const myName = currentUser?.name || currentUser?.email || '';
        const myUid = currentUser?.uid || currentUser?.id || '';
        const isMyShift = (myUid && globalShiftData.vendorId === myUid) || 
                          (myName && globalShiftData.vendorName === myName);
        
        if (isMyShift) {
          setActiveShift({ id: globalShiftId, ...globalShiftData });
          setIsReadOnly(false);
          setActiveShiftVendor('');
        } else {
          setActiveShift(null);
          setIsReadOnly(true);
          setActiveShiftVendor(globalShiftData.vendorName || 'otro vendedor');
        }

        let cashBalance = parseFloat(globalShiftData.startCash) || 0;
        
        const salesQuery = query(collection(db, "sales"), where("shiftId", "==", globalShiftId));
        const salesSnap = await getDocs(salesQuery);
        salesSnap.forEach(d => {
          const data = d.data();
          if (data.method === 'Efectivo') cashBalance += (parseFloat(data.total) || 0);
          else if (data.method === 'MIXTO') cashBalance += (parseFloat(data.cashPaid) || 0);
        });
        
        const ordersQuery = query(collection(db, "orders"), where("shiftId", "==", globalShiftId));
        const ordersSnap = await getDocs(ordersQuery);
        ordersSnap.forEach(d => {
          cashBalance -= (parseFloat(d.data().amount) || 0);
        });
        
        // Evita caja negativa en todo momento
        setCurrentCash(Math.max(0, cashBalance));

        // Load shift operations safely
        const formatTime = (ts) => {
          if (!ts) return 'Reciente';
          try {
            if (typeof ts.toDate === 'function') return ts.toDate().toLocaleTimeString();
            if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleTimeString();
            return new Date(ts).toLocaleTimeString();
          } catch (e) {
            return 'Reciente';
          }
        };

        const salesQ = query(collection(db, "sales"), where("shiftId", "==", globalShiftId));
        const salesS = await getDocs(salesQ);
        const sList = salesS.docs.map(d => {
          const data = d.data();
          let methodLabel = data.method || 'Efectivo';
          if (data.method === 'MIXTO') {
            methodLabel = `MIXTO (Ef: Bs.${(data.cashPaid||0).toFixed(2)} | QR: Bs.${(data.qrPaid||0).toFixed(2)})`;
          }
          return {
            id: d.id, 
            opType: 'Venta', 
            detail: data.items?.map(i => `${i.qty}x ${i.name}`).join(', ') || 'Venta',
            amount: parseFloat(data.total) || 0,
            cashPaid: data.method === 'Efectivo' ? parseFloat(data.total)||0 : data.method === 'MIXTO' ? parseFloat(data.cashPaid)||0 : 0,
            qrPaid: data.method === 'QR' ? parseFloat(data.total)||0 : data.method === 'MIXTO' ? parseFloat(data.qrPaid)||0 : 0,
            method: methodLabel,
            rawMethod: data.method,
            rawTime: data.timestamp,
            time: formatTime(data.timestamp)
          };
        });

        const ordersQ = query(collection(db, "orders"), where("shiftId", "==", globalShiftId));
        const ordersS = await getDocs(ordersQ);
        const oList = ordersS.docs.map(d => ({ 
          id: d.id, 
          opType: `Gasto (${d.data().type || 'Gasto'})`, 
          detail: `${d.data().description || ''} ${d.data().receiptNumber ? `[${d.data().receiptType}: ${d.data().receiptNumber}]` : ''}`,
          amount: -(parseFloat(d.data().amount) || 0),
          method: 'Efectivo',
          rawTime: d.data().timestamp,
          time: formatTime(d.data().timestamp)
        }));

        const lossesQ = query(collection(db, "losses"), where("shiftId", "==", globalShiftId));
        const lossesS = await getDocs(lossesQ);
        const lList = lossesS.docs.map(d => ({ 
          id: d.id, 
          opType: 'Reporte Pérdida', 
          detail: `${d.data().qty || 1}x ${d.data().productName || ''} (${d.data().reason || ''})`,
          amount: 0,
          method: '-',
          rawTime: d.data().timestamp,
          time: formatTime(d.data().timestamp)
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

      // Load pending loans safely
      const lQuery = query(collection(db, "loans"), where("status", "==", "pending"));
      const lSnapshot = await getDocs(lQuery);
      const lns = [];
      lSnapshot.forEach(doc => lns.push({ id: doc.id, ...doc.data() }));
      setLoans(lns);

    } catch (error) {
      console.error("Error loading Vendor initial data:", error);
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
    if (startCash === '' || isNaN(startCash) || parseFloat(startCash) < 0) return alert('Ingrese un monto válido de caja inicial');
    setIsSubmitting(true);
    try {
      const initCash = parseFloat(startCash);
      const shiftRef = await addDoc(collection(db, "shifts"), {
        vendorId: currentUser?.uid || currentUser?.id || 'Vendedor',
        vendorName: currentUser?.name || currentUser?.email || 'Vendedor',
        startTime: serverTimestamp(),
        startCash: initCash,
        status: 'open'
      });
      await logEvent('OPEN_SHIFT', currentUser?.name || currentUser?.email || 'Vendedor', `Turno abierto con caja inicial de Bs. ${initCash.toFixed(2)}`, initCash);
      alert('Turno abierto con éxito');
      setStartCash('');
      loadInitialData();
    } catch (e) {
      alert('Error abriendo turno: ' + (e.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeShift = async (e) => {
    e.preventDefault();
    if (!endCash || isNaN(endCash)) return alert('Ingrese el dinero físico actual en caja');
    if (!activeShift?.id) return alert('No hay turno activo para cerrar');
    setIsSubmitting(true);
    try {
      const shiftSales = shiftOperations.filter(o => o.opType === 'Venta');
      
      let totalCashSales = shiftSales.reduce((acc, o) => {
        if (o.rawMethod === 'Efectivo') return acc + (parseFloat(o.amount) || 0);
        if (o.rawMethod === 'MIXTO') return acc + (parseFloat(o.cashPaid) || 0);
        return acc;
      }, 0);

      let totalQRSales = shiftSales.reduce((acc, o) => {
        if (o.rawMethod === 'QR') return acc + (parseFloat(o.amount) || 0);
        if (o.rawMethod === 'MIXTO') return acc + (parseFloat(o.qrPaid) || 0);
        return acc;
      }, 0);

      let totalExpenses = Math.abs(shiftOperations.filter(o => o.amount < 0).reduce((acc, o) => acc + (parseFloat(o.amount) || 0), 0));

      // Garantiza que el efectivo esperado no sea negativo
      const rawExpected = (parseFloat(activeShift.startCash) || 0) + totalCashSales - totalExpenses;
      const expectedCash = Math.max(0, rawExpected);
      const physicalCash = parseFloat(endCash) || 0;
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

      await logEvent(
        'CLOSE_SHIFT', 
        currentUser?.name || currentUser?.email || 'Vendedor', 
        `Cierre de turno. Esperado Ef.: Bs. ${expectedCash.toFixed(2)}, Físico: Bs. ${physicalCash.toFixed(2)}, Dif.: Bs. ${difference.toFixed(2)}, Ventas QR: Bs. ${totalQRSales.toFixed(2)}`,
        physicalCash
      );

      alert(`Turno cerrado con éxito.\n\n--- CAJA LOCAL (EFECTIVO) ---\nEsperado en caja: Bs. ${expectedCash.toFixed(2)}\nFísico contado: Bs. ${physicalCash.toFixed(2)}\nDiferencia: Bs. ${difference.toFixed(2)}\n\n--- BANCO (QR) ---\nVentas por QR: Bs. ${totalQRSales.toFixed(2)}`);
      setActiveShift(null);
      setEndCash('');
      loadInitialData();
    } catch (e) {
      console.error("Error closing shift:", e);
      alert('Error cerrando turno: ' + (e.message || e));
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
      await logEvent('PIN_CHANGED_SELF', currentUser?.name || currentUser?.email, 'Vendedor cambió su propio PIN de acceso');
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
    const availableStock = product.stock !== undefined ? parseInt(product.stock) : 0;
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
  
  const processSale = async (method, customCashPaid = null, customQrPaid = null) => {
    if (cart.length === 0) return;
    if (!activeShift?.id && !isReadOnly) return alert('Debes abrir un turno para realizar ventas.');
    setIsSubmitting(true);
    try {
      const total = cart.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.qty) || 1)), 0);
      
      let cashPaid = total;
      let qrPaid = 0;

      if (method === 'QR') {
        cashPaid = 0;
        qrPaid = total;
      } else if (method === 'MIXTO') {
        cashPaid = parseFloat(customCashPaid) || 0;
        qrPaid = parseFloat(customQrPaid) !== null ? parseFloat(customQrPaid) : Math.max(0, total - cashPaid);
        if (cashPaid < 0 || cashPaid > total) {
          alert(`El monto en efectivo debe estar entre Bs. 0 y Bs. ${total.toFixed(2)}`);
          setIsSubmitting(false);
          return;
        }
      }

      await addDoc(collection(db, "sales"), {
        items: cart.map(i => ({id: i.id, name: i.name, qty: i.qty, price: parseFloat(i.price) || 0})),
        total,
        method, // 'Efectivo', 'QR', 'MIXTO'
        cashPaid,
        qrPaid,
        vendorId: currentUser?.uid || currentUser?.id || 'Vendedor',
        vendorName: currentUser?.name || currentUser?.email || 'Vendedor',
        shiftId: activeShift.id,
        timestamp: serverTimestamp()
      });

      // Update inventory stock
      for (const item of cart) {
        const pRef = doc(db, "products", item.id);
        await updateDoc(pRef, { stock: increment(-item.qty) });
      }

      const logMsg = method === 'MIXTO' 
        ? `Venta Mixta registrada por Bs. ${total.toFixed(2)} (Efectivo: Bs. ${cashPaid.toFixed(2)}, QR: Bs. ${qrPaid.toFixed(2)})`
        : `Venta registrada por Bs. ${total.toFixed(2)} (${method})`;

      await logEvent('SALE', currentUser?.name || currentUser?.email || 'Vendedor', logMsg, total);
      alert(`Venta registrada con éxito (${method})`);
      setCart([]);
      setShowMixtoModal(false);
      setMixtoCashInput('');
      loadInitialData(); // Refresh stock
    } catch(e) {
      console.error("Error al registrar venta", e);
      alert('Error registrando venta: ' + (e.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- LOANS LOGIC ---
  const registerLoan = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return alert('Agregue productos al pedido primero');
    if (!loanForm.name.trim()) return alert('Ingrese el nombre del prestatario');
    if (!activeShift?.id && !isReadOnly) return alert('Debes abrir un turno para registrar préstamos.');
    setIsSubmitting(true);
    try {
      const total = cart.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.qty) || 1)), 0);
      await addDoc(collection(db, "loans"), {
        borrowerName: loanForm.name.trim(),
        items: cart.map(i => ({id: i.id, name: i.name, qty: i.qty, price: parseFloat(i.price) || 0})),
        amount: total,
        status: 'pending',
        vendorId: currentUser?.uid || currentUser?.id || 'Vendedor',
        vendorName: currentUser?.name || currentUser?.email || 'Vendedor',
        shiftId: activeShift.id,
        timestamp: serverTimestamp()
      });

      // Update stock
      for (const item of cart) {
        const pRef = doc(db, "products", item.id);
        await updateDoc(pRef, { stock: increment(-item.qty) });
      }

      await logEvent('LOAN_REGISTERED', currentUser?.name || currentUser?.email, `Préstamo registrado a "${loanForm.name}" por Bs. ${total.toFixed(2)}`, total);
      alert('Préstamo registrado correctamente');
      setCart([]);
      setLoanForm({ name: '' });
      loadInitialData();
    } catch (e) {
      alert('Error registrando préstamo: ' + (e.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPayLoanModal = (loan) => {
    setSelectedLoanToPay(loan);
    setLoanPayMethod('Efectivo');
    setMixtoCashInput('');
    setShowLoanPayModal(true);
  };

  const confirmPayLoan = async () => {
    if (!selectedLoanToPay) return;
    const amt = parseFloat(selectedLoanToPay.amount || selectedLoanToPay.total) || 0;
    setIsSubmitting(true);
    try {
      let cashPaid = amt;
      let qrPaid = 0;

      if (loanPayMethod === 'QR') {
        cashPaid = 0;
        qrPaid = amt;
      } else if (loanPayMethod === 'MIXTO') {
        cashPaid = parseFloat(mixtoCashInput) || 0;
        qrPaid = Math.max(0, amt - cashPaid);
        if (cashPaid < 0 || cashPaid > amt) {
          alert(`El monto en efectivo debe estar entre Bs. 0 y Bs. ${amt.toFixed(2)}`);
          setIsSubmitting(false);
          return;
        }
      }

      await updateDoc(doc(db, "loans", selectedLoanToPay.id), {
        status: 'repaid',
        repaidAt: serverTimestamp(),
        repaidToShiftId: activeShift?.id || 'admin',
        method: loanPayMethod,
        cashPaid,
        qrPaid
      });
      
      if (activeShift?.id) {
        await addDoc(collection(db, "sales"), {
          items: [{id: 'loan_payment', name: `Pago de Préstamo: ${selectedLoanToPay.borrowerName || selectedLoanToPay.borrower}`, qty: 1, price: amt}],
          total: amt,
          method: loanPayMethod,
          cashPaid,
          qrPaid,
          vendorId: currentUser?.uid || currentUser?.id || 'Vendedor',
          vendorName: currentUser?.name || currentUser?.email || 'Vendedor',
          shiftId: activeShift.id,
          timestamp: serverTimestamp(),
          isLoanPayment: true
        });
      }
      
      const logMsg = loanPayMethod === 'MIXTO' 
        ? `Cobro de préstamo (Mixto) a "${selectedLoanToPay.borrowerName || selectedLoanToPay.borrower}" por Bs. ${amt.toFixed(2)} (Ef: Bs.${cashPaid.toFixed(2)}, QR: Bs.${qrPaid.toFixed(2)})`
        : `Cobro de préstamo (${loanPayMethod}) a "${selectedLoanToPay.borrowerName || selectedLoanToPay.borrower}" por Bs. ${amt.toFixed(2)}`;

      await logEvent('LOAN_REPAID', currentUser?.name || currentUser?.email, logMsg, amt);
      alert('Pago de préstamo registrado correctamente');
      setShowLoanPayModal(false);
      setSelectedLoanToPay(null);
      setMixtoCashInput('');
      loadInitialData();
    } catch (e) {
      console.error("Error registrando pago de préstamo:", e);
      alert('Error registrando pago de préstamo');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- LOSSES LOGIC ---
  const registerLoss = async (e) => {
    e.preventDefault();
    if(!lossForm.productId || !lossForm.reason) return alert('Seleccione producto y motivo');
    if (!activeShift?.id && !isReadOnly) return alert('Debes abrir un turno para reportar pérdidas.');
    setIsSubmitting(true);
    try {
      const p = products.find(prod => prod.id === lossForm.productId);
      await addDoc(collection(db, "losses"), {
        productId: p.id,
        productName: p.name,
        qty: parseInt(lossForm.qty) || 1,
        reason: lossForm.reason,
        vendorId: currentUser?.uid || currentUser?.id || 'Vendedor',
        vendorName: currentUser?.name || currentUser?.email || 'Vendedor',
        shiftId: activeShift.id,
        timestamp: serverTimestamp(),
        status: 'pending' // Requires admin approval
      });
      await logEvent('LOSS_REPORTED', currentUser?.name || currentUser?.email, `Reportada pérdida: ${lossForm.qty}x ${p.name} (${lossForm.reason})`);
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
    if (!activeShift?.id && !isReadOnly) return alert('Debes abrir un turno para registrar egresos.');
    
    const amt = parseFloat(orderForm.amount) || 0;
    
    // REGLA CRÍTICA: NO CAJA NEGATIVA EN EGRESOS
    if (amt > currentCash) {
      return alert(`OPERACIÓN RECHAZADA: El monto del egreso/compra (Bs. ${amt.toFixed(2)}) supera el dinero actual en caja (Bs. ${currentCash.toFixed(2)}). No se permite dejar la caja en negativo.`);
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "orders"), {
        type: orderForm.type, // 'pedido' o 'compra'
        description: orderForm.description,
        amount: amt,
        method: 'Efectivo',
        receiptType: orderForm.receiptType,
        receiptNumber: orderForm.receiptNumber,
        vendorId: currentUser?.uid || currentUser?.id || 'Vendedor',
        vendorName: currentUser?.name || currentUser?.email || 'Vendedor',
        shiftId: activeShift.id,
        timestamp: serverTimestamp()
      });
      await logEvent('ORDER_REGISTERED', currentUser?.name || currentUser?.email, `Registrado ${orderForm.type}: ${orderForm.description} por Bs. ${amt.toFixed(2)}`);
      alert('Registro guardado con éxito');
      setOrderForm({ type: 'pedido', description: '', amount: '', receiptType: 'ninguno', receiptNumber: '' });
      loadInitialData();
    } catch(e) {
      alert('Error guardando registro');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- FILTERED PRODUCTS & POS CATEGORIES ---
  const categoriesList = ['todas', ...Array.from(new Set(products.map(p => p.category || 'GENERAL')))];

  const posProducts = products.filter(p => {
    if (p.isDeleted) return false;
    if ((p.stock !== undefined ? p.stock : 0) <= 0) return false; // Hide zero stock in POS
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'todas' || p.category === categoryFilter;
    const price = parseFloat(p.price) || 0;
    const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
    const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);
    return matchesSearch && matchesCat && matchesMin && matchesMax;
  });

  const inventoryProducts = products.filter(p => {
    if (p.isDeleted) return false; // Show in inventory even if stock is 0
    const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCat = categoryFilter === 'todas' || p.category === categoryFilter;
    const price = parseFloat(p.price) || 0;
    const matchesMin = minPrice === '' || price >= parseFloat(minPrice);
    const matchesMax = maxPrice === '' || price <= parseFloat(maxPrice);
    return matchesSearch && matchesCat && matchesMin && matchesMax;
  });

  const cartTotal = cart.reduce((acc, item) => acc + ((parseFloat(item.price) || 0) * (parseInt(item.qty) || 1)), 0);

  if (isLoading) return <div className="flex-center" style={{height: '100vh'}}><Coffee className="spinner" size={48} /></div>;

  return (
    <div className="dashboard-layout">
      {/* HEADER BAR */}
      <div className="dashboard-header flex-between">
        <div>
          <h2>Terminal de Ventas (POS)</h2>
          <p>Operador: {currentUser?.name || currentUser?.email || 'Vendedor'}</p>
        </div>
        <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center'}}>
          <button className="btn btn-secondary" onClick={() => setShowPinModal(true)}>
            Cambiar Mi PIN
          </button>
          
          {/* BOTÓN REQUERIDO: VOLVER A ADMIN SI ES USUARIO ADMIN */}
          {isAdmin && (
            <button 
              className="btn flex-center" 
              onClick={() => navigate('/admin')} 
              style={{gap: '0.5rem', background: '#2563eb', color: '#ffffff', fontWeight: 'bold', borderRadius: '8px', padding: '0.5rem 1rem'}}
            >
              <ArrowLeft size={18} /> Volver a Admin
            </button>
          )}

          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </div>

      {/* GLOBAL READ ONLY BANNER */}
      {isReadOnly && (
        <div className="card glass-panel" style={{
          background: 'linear-gradient(135deg, #fef3c7, #fde68a)', 
          borderLeft: '6px solid #d97706',
          color: '#92400e',
          marginBottom: '1rem',
          padding: '1rem'
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
            <AlertTriangle size={24} style={{color: '#d97706', flexShrink: 0}} />
            <div>
              <h3 style={{fontSize: '1.05rem', margin: 0}}>MODO SOLO LECTURA (Turno activo: {activeShiftVendor})</h3>
              <p style={{margin: 0, fontSize: '0.85rem'}}>
                Otro vendedor se encuentra realizando operaciones en este momento. Puedes explorar el inventario y préstamos pero no puedes realizar ventas ni cierres.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT BANNER */}
      {!activeShift && !isReadOnly ? (
        <div className="card glass-panel flex-between" style={{borderLeft: '4px solid var(--warning)'}}>
          <div>
            <h3>No tienes un turno activo</h3>
            <p>Debes ingresar el dinero en caja e iniciar un turno para realizar ventas.</p>
          </div>
          <form onSubmit={openShift} style={{display: 'flex', gap: '0.5rem'}}>
            <input 
              type="number" 
              step="0.10"
              placeholder="Dinero inicial (Bs.)" 
              className="input-field"
              value={startCash}
              onChange={e => setStartCash(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Abrir Turno</button>
          </form>
        </div>
      ) : activeShift && (
        <div className="card glass-panel flex-between" style={{borderLeft: '4px solid var(--secondary-color)'}}>
          <div>
            <h3>Turno Activo Actual</h3>
            <p style={{fontSize: '0.9rem'}}>
              Caja inicial: Bs. {(parseFloat(activeShift.startCash) || 0).toFixed(2)} | 
              <strong style={{color: 'var(--primary-color)'}}> Efectivo Actual en Caja: Bs. {(parseFloat(currentCash) || 0).toFixed(2)}</strong>
            </p>
          </div>
          <form onSubmit={closeShift} style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
            <input 
              type="number" 
              step="0.10"
              placeholder="Dinero físico contado (Bs.)" 
              className="input-field"
              value={endCash}
              onChange={e => setEndCash(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-danger" disabled={isSubmitting}>Cerrar Caja & Turno</button>
          </form>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <div className="tabs" style={{marginTop: '1rem', marginBottom: '1rem'}}>
        <div className={`tab ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>
          <ShoppingCart size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> POS (Ventas)
        </div>
        <div className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
          <Package size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Inventario ({inventoryProducts.length})
        </div>
        <div className={`tab ${activeTab === 'loans' ? 'active' : ''}`} onClick={() => setActiveTab('loans')}>
          <Clock size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Préstamos ({loans.length})
        </div>
        <div className={`tab ${activeTab === 'losses' ? 'active' : ''}`} onClick={() => setActiveTab('losses')}>
          <ShieldAlert size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Reportar Pérdidas
        </div>
        <div className={`tab ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
          <Send size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Egresos & Compras
        </div>
        <div className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <History size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Operaciones del Turno
        </div>
      </div>

      {/* MAIN POS VIEW */}
      {activeTab === 'pos' && (
        <div className="pos-dashboard-grid">
          <div className="card glass-panel pos-catalog">
            
            {/* Standard Search Bar Format Restored */}
            <div className="search-bar">
              <Search className="search-icon" size={18} />
              <input 
                type="text" 
                placeholder="Buscar producto por nombre..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Category & Price Filters Row */}
            <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap'}}>
              <select className="input-field" style={{flex: 1, minWidth: '150px'}} value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
                {categoriesList.map(c => <option key={c} value={c}>Tipo: {c.toUpperCase()}</option>)}
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

            {/* Product Grid (Hides zero stock and deleted items) */}
            <div className="item-grid" style={{maxHeight: '520px', overflowY: 'auto'}}>
              {posProducts.map(p => (
                <div 
                  key={p.id} 
                  className={`card item-card ${p.stock <= 0 ? 'out-of-stock' : ''}`}
                  onClick={() => addToCart(p)}
                  style={{cursor: isReadOnly || p.stock <= 0 ? 'not-allowed' : 'pointer'}}
                >
                  <h4 style={{fontSize: '1rem', marginBottom: '0.25rem'}}>{p.name}</h4>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                    <span>Tipo: {p.category}</span>
                    <span>Stock: {p.stock}</span>
                  </div>
                  <span className="item-action" style={{fontSize: '1.1rem'}}>Bs. {(parseFloat(p.price) || 0).toFixed(2)}</span>
                </div>
              ))}
              {posProducts.length === 0 && (
                <div style={{gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem'}}>
                  No hay productos disponibles con estos filtros o sin stock.
                </div>
              )}
            </div>
          </div>
          
          {/* CART SECTION */}
          <div className="card glass-panel cart-section">
            <h3><ShoppingCart size={20} /> Pedido Actual</h3>
            
            <div className="cart-items" style={{maxHeight: '280px', overflowY: 'auto'}}>
              {cart.length === 0 ? (
                <div className="flex-center" style={{height: '100%', color: 'var(--text-secondary)', padding: '2rem 0'}}>
                  No hay productos seleccionados
                </div>
              ) : (
                <div className="item-list">
                  {cart.map(item => (
                    <div key={item.id} className="list-item" style={{padding: '0.5rem'}}>
                      <div className="item-info">
                        <h4 style={{fontSize: '0.9rem'}}>{item.name}</h4>
                        <p style={{fontSize: '0.8rem'}}>{item.qty} x Bs. {(parseFloat(item.price) || 0).toFixed(2)}</p>
                      </div>
                      <div className="item-action" style={{fontSize: '0.9rem'}}>
                        Bs. {((item.qty || 1) * (parseFloat(item.price) || 0)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="cart-total" style={{marginTop: 'auto', padding: '0.75rem 0', borderTop: '1px solid rgba(0,0,0,0.1)'}}>
              <span style={{fontWeight: 'bold', fontSize: '1.2rem'}}>Total:</span>
              <span style={{fontWeight: 'bold', fontSize: '1.5rem', color: 'var(--primary-color)'}}>Bs. {(cartTotal || 0).toFixed(2)}</span>
            </div>
            
            {/* BOTONES DE PAGO: EFECTIVO, QR Y PAGO MIXTO REQUERIDO */}
            <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
              <button className="btn btn-primary flex-center" style={{flex: 1, padding: '0.75rem 0.25rem', fontSize: '0.85rem'}} onClick={() => processSale('Efectivo')} disabled={cart.length === 0 || isSubmitting || isReadOnly}>
                <Banknote size={16} /> Efectivo
              </button>
              <button className="btn btn-primary flex-center" style={{flex: 1, padding: '0.75rem 0.25rem', fontSize: '0.85rem', backgroundColor: '#10b981'}} onClick={() => processSale('QR')} disabled={cart.length === 0 || isSubmitting || isReadOnly}>
                <CreditCard size={16} /> QR
              </button>
              <button className="btn btn-primary flex-center" style={{flex: 1, padding: '0.75rem 0.25rem', fontSize: '0.85rem', backgroundColor: '#f59e0b'}} onClick={() => { setMixtoTargetType('sale'); setMixtoCashInput(''); setShowMixtoModal(true); }} disabled={cart.length === 0 || isSubmitting || isReadOnly}>
                <Banknote size={14} />+<CreditCard size={14} /> Mixto
              </button>
            </div>
            
            {/* Loans integration in POS */}
            <form onSubmit={registerLoan} style={{display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', borderTop: '1px dashed rgba(0,0,0,0.2)', paddingTop: '0.75rem'}}>
              <input type="text" className="input-field" placeholder="Nombre prestatario" value={loanForm.name} onChange={e=>setLoanForm({...loanForm, name: e.target.value})} style={{flex: 1}}/>
              <button type="submit" className="btn btn-secondary" disabled={cart.length === 0 || isSubmitting || isReadOnly}>A Préstamo</button>
            </form>

            <button className="btn btn-danger btn-block" onClick={clearCart} disabled={cart.length === 0}>
              Limpiar Lista
            </button>
          </div>
        </div>
      )}

      {/* INVENTORY TAB */}
      {activeTab === 'inventory' && (
        <div className="card glass-panel">
          <div className="flex-between" style={{marginBottom: '1rem'}}>
            <h3><Package size={20} /> Inventario Actual</h3>
          </div>

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
          </div>

          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                <th style={{padding: '0.5rem'}}>Producto</th>
                <th style={{padding: '0.5rem'}}>Tipo / Categoría</th>
                <th style={{padding: '0.5rem'}}>Precio (Bs.)</th>
                <th style={{padding: '0.5rem'}}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {inventoryProducts.map(p => (
                <tr key={p.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                  <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{p.name}</td>
                  <td style={{padding: '0.5rem'}}><span className="badge badge-primary">{p.category}</span></td>
                  <td style={{padding: '0.5rem'}}>Bs. {(parseFloat(p.price) || 0).toFixed(2)}</td>
                  <td style={{padding: '0.5rem'}}>
                    <span className={`badge ${p.stock > 0 ? 'badge-success' : 'badge-danger'}`}>
                      {p.stock} {p.stock <= 0 ? '(Agotado)' : 'unidades'}
                    </span>
                  </td>
                </tr>
              ))}
              {inventoryProducts.length === 0 && (
                <tr><td colSpan="4" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No se encontraron productos.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* LOANS TAB WITH EFECTIVO / QR / MIXTO SUPPORT */}
      {activeTab === 'loans' && (
        <div className="card glass-panel">
          <h3><Clock size={20} /> Registro de Préstamos Pendientes</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
            Permite cobrar préstamos pendientes seleccionando el método de pago (Efectivo, QR o Mixto).
          </p>

          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{borderBottom: '2px solid rgba(0,0,0,0.1)', textAlign: 'left'}}>
                <th style={{padding: '0.5rem'}}>Prestatario</th>
                <th style={{padding: '0.5rem'}}>Detalle</th>
                <th style={{padding: '0.5rem'}}>Monto Total</th>
                <th style={{padding: '0.5rem'}}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loans.map(l => (
                <tr key={l.id} style={{borderBottom: '1px solid rgba(0,0,0,0.05)'}}>
                  <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{l.borrowerName || l.borrower}</td>
                  <td style={{padding: '0.5rem', fontSize: '0.85rem'}}>
                    {l.items?.map(i => `${i.qty}x ${i.name}`).join(', ') || 'Préstamo'}
                  </td>
                  <td style={{padding: '0.5rem', fontWeight: 'bold', color: 'var(--primary-color)'}}>
                    Bs. {(parseFloat(l.amount || l.total) || 0).toFixed(2)}
                  </td>
                  <td style={{padding: '0.5rem'}}>
                    <button className="btn btn-primary" onClick={() => openPayLoanModal(l)} disabled={isReadOnly}>
                      Cobrar Préstamo
                    </button>
                  </td>
                </tr>
              ))}
              {loans.length === 0 && (
                <tr><td colSpan="4" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No hay préstamos pendientes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* LOSSES TAB */}
      {activeTab === 'losses' && (
        <div className="card glass-panel" style={{maxWidth: '600px'}}>
          <h3><ShieldAlert size={20} /> Reportar Pérdida / Daño de Producto</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
            Envía una solicitud de descuento por pérdida a administración.
          </p>

          <form onSubmit={registerLoss} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <div className="form-group">
              <label>Seleccionar Producto</label>
              <select className="input-field" value={lossForm.productId} onChange={e=>setLossForm({...lossForm, productId: e.target.value})} required>
                <option value="">-- Seleccionar --</option>
                {products.filter(p => !p.isDeleted).map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Stock actual: {p.stock})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Cantidad Perdida</label>
              <input type="number" min="1" className="input-field" value={lossForm.qty} onChange={e=>setLossForm({...lossForm, qty: e.target.value})} required />
            </div>

            <div className="form-group">
              <label>Motivo de Pérdida</label>
              <select className="input-field" value={lossForm.reason} onChange={e=>setLossForm({...lossForm, reason: e.target.value})} required>
                <option value="">-- Seleccionar Motivo --</option>
                {motivos.map((m, idx) => <option key={idx} value={m}>{m}</option>)}
                {motivos.length === 0 && <option value="Vencimiento / Mal estado">Vencimiento / Mal estado</option>}
              </select>
            </div>

            <button type="submit" className="btn btn-danger" disabled={isSubmitting || isReadOnly}>Enviar Reporte</button>
          </form>
        </div>
      )}

      {/* ORDERS / EXPENSES TAB */}
      {activeTab === 'orders' && (
        <div className="card glass-panel" style={{maxWidth: '650px'}}>
          <h3><Send size={20} /> Registrar Egreso / Compra de Mercadería</h3>
          <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
            Caja Actual Disponible: <strong style={{color: 'var(--primary-color)'}}>Bs. {currentCash.toFixed(2)}</strong>. No se permiten egresos que dejen la caja en negativo.
          </p>

          <form onSubmit={registerOrder} style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
            <div className="form-group">
              <label>Tipo de Registro</label>
              <select className="input-field" value={orderForm.type} onChange={e=>setOrderForm({...orderForm, type: e.target.value})}>
                <option value="pedido">Pedido / Encargo</option>
                <option value="compra">Compra Directa de Mercadería</option>
              </select>
            </div>

            <div className="form-group">
              <label>Monto Afectado a Caja (Bs.)</label>
              <input type="number" step="0.10" className="input-field" placeholder="Monto Bs." value={orderForm.amount} onChange={e=>setOrderForm({...orderForm, amount: e.target.value})} required />
            </div>

            <div className="form-group" style={{gridColumn: 'span 2'}}>
              <label>Descripción / Detalle</label>
              <input type="text" className="input-field" placeholder="Ej: Compra de 2 cajas de soda a Coca-Cola" value={orderForm.description} onChange={e=>setOrderForm({...orderForm, description: e.target.value})} required />
            </div>

            <div className="form-group">
              <label>Tipo Comprobante</label>
              <select className="input-field" value={orderForm.receiptType} onChange={e=>setOrderForm({...orderForm, receiptType: e.target.value})}>
                <option value="ninguno">Ninguno / Recibo Simple</option>
                <option value="factura">Factura</option>
                <option value="recibo">Recibo Oficial</option>
              </select>
            </div>

            <div className="form-group">
              <label>N° Comprobante (Opcional)</label>
              <input type="text" className="input-field" placeholder="Ej: 10429" value={orderForm.receiptNumber} onChange={e=>setOrderForm({...orderForm, receiptNumber: e.target.value})} />
            </div>

            <button type="submit" className="btn btn-primary" style={{gridColumn: 'span 2'}} disabled={isSubmitting || isReadOnly}>Guardar Registro</button>
          </form>
        </div>
      )}

      {/* SHIFT OPERATIONS HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="card glass-panel">
          <div className="flex-between" style={{marginBottom: '1rem'}}>
            <h3><History size={20} /> Historial de Operaciones del Turno (Orden cronológico)</h3>
            <button className="btn btn-secondary" onClick={() => exportToCSV('operaciones_turno.csv', shiftOperations)}>
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
                  <td style={{padding: '0.5rem'}}><span className="badge badge-primary">{op.method}</span></td>
                  <td style={{padding: '0.5rem', textAlign: 'right', fontWeight: 'bold', color: op.amount < 0 ? 'var(--danger-color)' : 'var(--primary-color)'}}>
                    Bs. {op.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
              {shiftOperations.length === 0 && (
                <tr><td colSpan="5" style={{padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)'}}>No hay operaciones en este turno.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL PAGO MIXTO */}
      {showMixtoModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="card glass-panel" style={{width: '90%', maxWidth: '420px', padding: '1.5rem', background: '#ffffff', color: '#1a2433'}}>
            <h3 style={{marginBottom: '1rem', color: 'var(--primary-color)'}}>
              💳 Registrar Pago Mixto (Efectivo + QR)
            </h3>
            
            <div style={{marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 'bold'}}>
              Monto Total a Pagar: <span style={{color: 'var(--primary-color)'}}>Bs. {cartTotal.toFixed(2)}</span>
            </div>

            <div className="form-group" style={{marginBottom: '1rem'}}>
              <label style={{fontWeight: 'bold'}}>💵 Monto pagado en EFECTIVO (Bs.)</label>
              <input 
                type="number" 
                step="0.10"
                min="0"
                max={cartTotal}
                className="input-field" 
                placeholder="Ej: 4.00"
                value={mixtoCashInput}
                onChange={e => setMixtoCashInput(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{padding: '0.75rem', background: '#ecfdf5', borderRadius: '8px', borderLeft: '4px solid #10b981', marginBottom: '1.5rem'}}>
              <span style={{fontSize: '0.85rem', color: '#065f46'}}>📱 Monto Automático Restante por QR (Banco):</span>
              <div style={{fontSize: '1.3rem', fontWeight: 'bold', color: '#047857'}}>
                Bs. {Math.max(0, cartTotal - (parseFloat(mixtoCashInput) || 0)).toFixed(2)}
              </div>
            </div>

            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button className="btn btn-secondary" onClick={() => setShowMixtoModal(false)}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  const cashVal = parseFloat(mixtoCashInput) || 0;
                  const qrVal = Math.max(0, cartTotal - cashVal);
                  processSale('MIXTO', cashVal, qrVal);
                }} 
                disabled={isSubmitting}
              >
                Confirmar Venta Mixta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL COBRO PRÉSTAMO (EFECTIVO / QR / MIXTO) */}
      {showLoanPayModal && selectedLoanToPay && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="card glass-panel" style={{width: '90%', maxWidth: '440px', padding: '1.5rem', background: '#ffffff', color: '#1a2433'}}>
            <h3 style={{marginBottom: '0.5rem', color: 'var(--primary-color)'}}>
              🔄 Cobrar Préstamo: {selectedLoanToPay.borrowerName || selectedLoanToPay.borrower}
            </h3>
            <p style={{fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
              Monto a Cobrar: <strong>Bs. {(parseFloat(selectedLoanToPay.amount || selectedLoanToPay.total) || 0).toFixed(2)}</strong>
            </p>

            <div className="form-group" style={{marginBottom: '1rem'}}>
              <label style={{fontWeight: 'bold'}}>Seleccionar Método de Pago</label>
              <select className="input-field" value={loanPayMethod} onChange={e => setLoanPayMethod(e.target.value)}>
                <option value="Efectivo">💵 Efectivo Completo</option>
                <option value="QR">📱 QR / Transferencia Banco</option>
                <option value="MIXTO">💳 Pago Mixto (Efectivo + QR)</option>
              </select>
            </div>

            {loanPayMethod === 'MIXTO' && (
              <>
                <div className="form-group" style={{marginBottom: '1rem'}}>
                  <label style={{fontWeight: 'bold'}}>Monto en EFECTIVO (Bs.)</label>
                  <input 
                    type="number" 
                    step="0.10"
                    className="input-field" 
                    placeholder="Ej: 5.00"
                    value={mixtoCashInput}
                    onChange={e => setMixtoCashInput(e.target.value)}
                    autoFocus
                  />
                </div>

                <div style={{padding: '0.75rem', background: '#ecfdf5', borderRadius: '8px', borderLeft: '4px solid #10b981', marginBottom: '1.5rem'}}>
                  <span style={{fontSize: '0.85rem', color: '#065f46'}}>📱 Monto por QR:</span>
                  <div style={{fontSize: '1.2rem', fontWeight: 'bold', color: '#047857'}}>
                    Bs. {Math.max(0, (parseFloat(selectedLoanToPay.amount || selectedLoanToPay.total) || 0) - (parseFloat(mixtoCashInput) || 0)).toFixed(2)}
                  </div>
                </div>
              </>
            )}

            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button className="btn btn-secondary" onClick={() => { setShowLoanPayModal(false); setSelectedLoanToPay(null); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmPayLoan} disabled={isSubmitting}>
                Confirmar Cobro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CAMBIO DE PIN */}
      {showPinModal && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="card glass-panel" style={{width: '90%', maxWidth: '380px', padding: '1.5rem', background: '#ffffff', color: '#1a2433'}}>
            <h3 style={{marginBottom: '1rem'}}>Cambiar Mi PIN de Acceso</h3>
            <form onSubmit={handleChangePin}>
              <div className="form-group" style={{marginBottom: '1.5rem'}}>
                <label>Nuevo PIN (6 dígitos numéricos)</label>
                <input 
                  type="password" 
                  maxLength={6} 
                  className="input-field" 
                  placeholder="••••••"
                  value={newVendorPin}
                  onChange={e => setNewVendorPin(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                />
              </div>
              <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPinModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Guardar Nuevo PIN</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default VendorDashboard;
