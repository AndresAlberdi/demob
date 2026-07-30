import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { Building, Plus, Trash2, CheckCircle, Clock } from 'lucide-react';
import DepositWithdrawalModal from './DepositWithdrawalModal';
import { useAuth } from '../context/AuthContext';

export default function AdminDepositsTab({ banks, deposits, loadBanksAndDeposits, pCashBalance, userRole }) {
  const { currentUser } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBankForm, setNewBankForm] = useState({ name: '', accountNumber: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddBank = async (e) => {
    e.preventDefault();
    if (!newBankForm.name || !newBankForm.accountNumber) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'banks'), {
        name: newBankForm.name,
        accountNumber: newBankForm.accountNumber,
        createdAt: serverTimestamp()
      });
      setNewBankForm({ name: '', accountNumber: '' });
      await loadBanksAndDeposits();
    } catch (err) {
      console.error(err);
      alert('Error agregando banco');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBank = async (id) => {
    if (!window.confirm('¿Eliminar este banco?')) return;
    try {
      await deleteDoc(doc(db, 'banks', id));
      await loadBanksAndDeposits();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmDeposit = async (id) => {
    if (!window.confirm('¿Confirmar que este depósito ha sido procesado?')) return;
    try {
      await updateDoc(doc(db, 'deposits', id), {
        status: 'CONFIRMADO'
      });
      await loadBanksAndDeposits();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '2rem'}}>
      <div className="flex-between">
        <h2>Gestión de Depósitos Bancarios</h2>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)} disabled={banks.length === 0}>
          <Building size={16} /> Retiro para Depósito
        </button>
      </div>

      {banks.length === 0 && (
        <div className="alert warning">
          Debe registrar al menos un banco para realizar depósitos.
        </div>
      )}

      {userRole === 'superadmin' && (
        <div className="card glass-panel" style={{maxWidth: '600px'}}>
          <h3>ABM Bancos y Cuentas</h3>
          <form onSubmit={handleAddBank} style={{display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem'}}>
            <div style={{flex: 1}}>
              <label>Nombre del Banco</label>
              <input 
                type="text" 
                className="input-field" 
                value={newBankForm.name} 
                onChange={e => setNewBankForm({...newBankForm, name: e.target.value})} 
                required 
                placeholder="Ej. Banco Bisa" 
              />
            </div>
            <div style={{flex: 1}}>
              <label>Número de Cuenta</label>
              <input 
                type="text" 
                className="input-field" 
                value={newBankForm.accountNumber} 
                onChange={e => setNewBankForm({...newBankForm, accountNumber: e.target.value})} 
                required 
                placeholder="Ej. 123456789" 
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              <Plus size={16}/> Agregar
            </button>
          </form>

          <table className="table">
            <thead>
              <tr>
                <th>Banco</th>
                <th>Cuenta</th>
                <th style={{textAlign: 'right'}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {banks.map(b => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.accountNumber}</td>
                  <td style={{textAlign: 'right'}}>
                    <button className="icon-btn" onClick={() => handleDeleteBank(b.id)} style={{color: 'var(--color-red)'}}>
                      <Trash2 size={16}/>
                    </button>
                  </td>
                </tr>
              ))}
              {banks.length === 0 && <tr><td colSpan="3" style={{textAlign: 'center', color: 'var(--text-secondary)'}}>No hay bancos registrados</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="card glass-panel">
        <h3>Historial de Depósitos</h3>
        <div style={{overflowX: 'auto'}}>
          <table className="table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px' }}>Fecha</th>
                <th style={{ padding: '12px' }}>Usuario</th>
                <th style={{ padding: '12px' }}>Banco / Cuenta</th>
                <th style={{ padding: '12px' }}>Observaciones</th>
                <th style={{ textAlign: 'right', padding: '12px' }}>Monto</th>
                <th style={{ textAlign: 'center', padding: '12px' }}>Estado</th>
                <th style={{ textAlign: 'center', padding: '12px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map(d => {
                const isConfirmed = d.status === 'CONFIRMADO';
                const dateStr = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : 'Reciente';
                return (
                  <tr key={d.id} style={{ backgroundColor: 'var(--bg-card)' }}>
                    <td style={{ padding: '12px' }}>{dateStr}</td>
                    <td style={{ padding: '12px' }}>{d.createdBy}</td>
                    <td style={{ padding: '12px' }}>{d.bankName}</td>
                    <td style={{ padding: '12px' }}>{d.observations || '-'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', padding: '12px' }}>Bs. {parseFloat(d.amount).toFixed(2)}</td>
                    <td style={{ textAlign: 'center', padding: '12px' }}>
                      <span style={{
                        padding: '0.4rem 0.8rem', 
                        borderRadius: '20px', 
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        backgroundColor: isConfirmed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: isConfirmed ? 'var(--color-green)' : 'var(--color-yellow)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {isConfirmed ? <CheckCircle size={14}/> : <Clock size={14}/>}
                        {d.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px' }}>
                      {!isConfirmed && (userRole === 'superadmin' || d.createdBy === currentUser?.name || d.createdBy === currentUser?.email) && (
                        <button className="btn btn-sm" onClick={() => handleConfirmDeposit(d.id)} style={{ backgroundColor: 'var(--color-green)', color: 'white', fontWeight: 'bold', padding: '0.4rem 1rem' }}>
                          Confirmar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {deposits.length === 0 && <tr><td colSpan="7" style={{textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)'}}>No hay depósitos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <DepositWithdrawalModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        banks={banks} 
        maxAmount={pCashBalance} 
        onSuccess={loadBanksAndDeposits} 
      />
    </div>
  );
}
