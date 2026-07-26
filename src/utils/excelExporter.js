import * as XLSX from 'xlsx';

// Helper to format Firestore Timestamps or JavaScript Dates to YYYY-MM-DD HH:mm:ss in local time
const formatDateTime = (val) => {
  if (!val) return '';
  let date;
  if (val.seconds !== undefined && typeof val.seconds === 'number') {
    date = new Date(val.seconds * 1000);
  } else if (val instanceof Date) {
    date = val;
  } else if (typeof val === 'string') {
    date = new Date(val);
  } else {
    return JSON.stringify(val);
  }
  
  if (isNaN(date.getTime())) return '';
  const pad = (num) => String(num).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
};

// Map payment methods to Spanish
const mapPaymentMethod = (method) => {
  const mapping = {
    'cash': 'Efectivo',
    'qr': 'QR',
    'transfer': 'Transferencia',
    'mixed': 'Mixto',
    'Efectivo': 'Efectivo',
    'QR': 'QR',
    'Transferencia': 'Transferencia'
  };
  return mapping[method] || method || '';
};

// Map status to Spanish
const mapStatus = (status) => {
  const mapping = {
    'open': 'Abierto',
    'closed': 'Cerrado',
    'pending': 'Pendiente',
    'approved': 'Aprobada',
    'rejected': 'Rechazada',
    'paid': 'Pagado',
    'received': 'Recibido'
  };
  return mapping[status] || status || '';
};

// Configuration for each collection type: name, sort order, and translations
const collectionConfigs = {
  products: {
    sheetName: 'Productos',
    sort: (a, b) => (a.name || '').localeCompare(b.name || ''),
    map: doc => ({
      'Nombre Producto': doc.name || '',
      'Categoría': doc.category || '',
      'Precio Venta (Bs.)': doc.price || 0,
      'Precio Compra (Bs.)': doc.costPrice || 0,
      'Stock Actual': doc.stock !== undefined ? doc.stock : 0,
      'Stock Mínimo': doc.minStock !== undefined ? doc.minStock : 3,
      'Eliminado': doc.isDeleted ? 'Sí' : 'No'
    })
  },
  sales: {
    sheetName: 'Ventas',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Cliente': doc.clientName || 'General',
      'Nombre Vendedor': doc.vendorName || '',
      'Método Pago': mapPaymentMethod(doc.paymentMethod),
      'Monto Efectivo (Bs.)': doc.cashAmount || 0,
      'Monto QR (Bs.)': doc.qrAmount || 0,
      'Monto Transferencia (Bs.)': doc.transferAmount || 0,
      'Total Venta (Bs.)': doc.total || 0,
      'Tipo Comprobante': doc.receiptType || '',
      'Es Pérdida': doc.isLoss ? 'Sí' : 'No',
      'Detalle Productos': doc.products ? doc.products.map(p => `${p.quantity}x ${p.name}`).join(', ') : ''
    })
  },
  shifts: {
    sheetName: 'Turnos',
    sort: (a, b) => (b.startTime?.seconds || 0) - (a.startTime?.seconds || 0),
    map: doc => ({
      'Hora Inicio': formatDateTime(doc.startTime),
      'Hora Cierre': formatDateTime(doc.endTime),
      'Nombre Vendedor': doc.vendorName || '',
      'Caja Inicial (Bs.)': doc.startCash || 0,
      'Caja Final (Bs.)': doc.endCash || 0,
      'Caja Real Cierre (Bs.)': doc.actualEndCash || 0,
      'Diferencia (Bs.)': doc.difference || 0,
      'Ventas Efectivo (Bs.)': doc.salesCash || 0,
      'Ventas QR (Bs.)': doc.salesQr || 0,
      'Ventas Transferencia (Bs.)': doc.salesTransfer || 0,
      'Egresos (Bs.)': doc.expenses || 0,
      'Ingresos Extra (Bs.)': doc.extraIncomes || 0,
      'Préstamos Entregados (Bs.)': doc.loans || 0,
      'Multas Cobradas (Bs.)': doc.fines || 0,
      'Estado': mapStatus(doc.status),
      'Notas': doc.notes || ''
    })
  },
  orders: {
    sheetName: 'Pedidos',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Vendedor': doc.vendorName || '',
      'Proveedor': doc.supplier || '',
      'Monto Total (Bs.)': doc.total || 0,
      'Estado': mapStatus(doc.status),
      'Detalle Productos': doc.products ? doc.products.map(p => `${p.quantity}x ${p.name}`).join(', ') : ''
    })
  },
  losses: {
    sheetName: 'Pérdidas',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Vendedor': doc.vendorName || '',
      'Nombre Producto': doc.productName || '',
      'Cantidad': doc.quantity || 0,
      'Motivo': doc.motive || '',
      'Estado': mapStatus(doc.status),
      'Notas': doc.notes || ''
    })
  },
  loans: {
    sheetName: 'Préstamos',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Vendedor': doc.vendorName || '',
      'Monto Préstamo (Bs.)': doc.amount || 0,
      'Estado': mapStatus(doc.status),
      'Notas': doc.notes || ''
    })
  },
  extra_incomes: {
    sheetName: 'Ingresos Extraordinarios',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Usuario Registrador': doc.user || '',
      'Motivo/Concepto': doc.motive || '',
      'Monto Ingreso (Bs.)': doc.amount || 0,
      'Método Pago': mapPaymentMethod(doc.paymentMethod),
      'Notas': doc.note || ''
    })
  },
  app_users: {
    sheetName: 'Vendedores',
    sort: (a, b) => (a.name || '').localeCompare(b.name || ''),
    map: doc => ({
      'Nombre Completo': doc.name || '',
      'PIN de Acceso': doc.pin || '',
      'Rol': doc.role || 'vendedor',
      'Multas Acumuladas (Bs.)': doc.accumulatedFines || 0,
      'Fecha Creación': formatDateTime(doc.createdAt)
    })
  },
  users: {
    sheetName: 'Administradores',
    sort: (a, b) => (a.email || '').localeCompare(b.email || ''),
    map: doc => ({
      'Correo Electrónico': doc.email || '',
      'Rol': doc.role || 'admin'
    })
  },
  vendor_fines: {
    sheetName: 'Multas de Vendedores',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Vendedor': doc.vendorName || '',
      'Monto Multa (Bs.)': doc.amount || 0,
      'Motivo de Multa': doc.reason || '',
      'Estado': mapStatus(doc.status)
    })
  },
  fine_payments: {
    sheetName: 'Pagos de Multas',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Vendedor': doc.vendorName || '',
      'Monto Pagado (Bs.)': doc.amount || 0,
      'Método Pago': mapPaymentMethod(doc.paymentMethod)
    })
  },
  inventory_audits: {
    sheetName: 'Auditorías de Inventario',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Nombre Auditor': doc.vendorName || '',
      'Nombre Producto': doc.productName || '',
      'Stock Sistema': doc.systemStock || 0,
      'Stock Físico': doc.physicalStock || 0,
      'Diferencia': doc.difference || 0,
      'Observación/Justificación': doc.motive || ''
    })
  },
  system_logs: {
    sheetName: 'Logs del Sistema',
    sort: (a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0),
    map: doc => ({
      'Fecha y Hora': formatDateTime(doc.timestamp),
      'Usuario': doc.user || '',
      'Tipo de Evento': doc.type || '',
      'Detalle': doc.detail || '',
      'Monto Relacionado (Bs.)': doc.amount || 0
    })
  },
  categories: {
    sheetName: 'Categorías',
    sort: (a, b) => (a.Nombre || '').localeCompare(b.Nombre || ''),
    map: doc => ({ 'Categoría': doc.Nombre || '' })
  },
  expense_types: {
    sheetName: 'Tipos de Egresos',
    sort: (a, b) => (a.Nombre || '').localeCompare(b.Nombre || ''),
    map: doc => ({ 'Tipo de Egreso': doc.Nombre || '' })
  },
  extraordinary_motives: {
    sheetName: 'Motivos de Ingresos',
    sort: (a, b) => (a.Nombre || '').localeCompare(b.Nombre || ''),
    map: doc => ({ 'Motivo de Ingreso': doc.Nombre || '' })
  },
  receipt_types: {
    sheetName: 'Tipos de Comprobantes',
    sort: (a, b) => (a.Nombre || '').localeCompare(b.Nombre || ''),
    map: doc => ({ 'Tipo de Comprobante': doc.Nombre || '' })
  },
  loss_motives: {
    sheetName: 'Motivos de Pérdidas',
    sort: (a, b) => (a.Nombre || '').localeCompare(b.Nombre || ''),
    map: doc => ({ 'Motivo de Pérdida': doc.Nombre || '' })
  }
};

/**
 * Exports all database collections to a single XLSX file, each as a separate worksheet.
 * Translates columns and sheets to Spanish, formats fields, and sorts rows logically.
 * 
 * @param {Object} collectionsData Object where keys are collection names and values are arrays of document objects.
 */
export const exportAllToExcel = (collectionsData) => {
  const wb = XLSX.utils.book_new();

  // Process collections in the specified configs order
  Object.entries(collectionConfigs).forEach(([collectionKey, config]) => {
    const docs = collectionsData[collectionKey] || [];
    let normalizedRows = [];
    
    if (docs && docs.length > 0) {
      const sortedDocs = [...docs].sort(config.sort);
      normalizedRows = sortedDocs.map(config.map);
    } else {
      // Create empty row with Spanish header keys so the sheet is not blank and shows schema columns
      const dummyObj = config.map({});
      const emptyRow = {};
      Object.keys(dummyObj).forEach(key => {
        emptyRow[key] = '';
      });
      normalizedRows = [emptyRow];
    }

    const ws = XLSX.utils.json_to_sheet(normalizedRows);
    XLSX.utils.book_append_sheet(wb, ws, config.sheetName);
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const projectSuffix = import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'laestacion';
  XLSX.writeFile(wb, `backup_${projectSuffix}_${dateStr}.xlsx`);
};
