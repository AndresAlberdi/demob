import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { X, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function DepositWithdrawalModal({ isOpen, onClose, banks, maxAmount, onSuccess }) {
  const { currentUser } = useAuth();
  const [bankId, setBankId] = useState('');
  const [amount, setAmount] = useState('');
  const [observations, setObservations] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!bankId) {
      setError('Por favor selecciona un banco.');
      return;
    }

    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('El monto debe ser mayor a 0.');
      return;
    }

    if (val > maxAmount) {
      setError(`El monto no puede superar el efectivo actual (Bs. ${maxAmount.toFixed(2)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedBank = banks.find(b => b.id === bankId);
      
      // Crear registro en deposits
      await addDoc(collection(db, 'deposits'), {
        amount: val,
        bankId: bankId,
        bankName: selectedBank ? `${selectedBank.name} - ${selectedBank.accountNumber}` : 'Banco Desconocido',
        observations: observations,
        status: 'EN PROCESO', // "EN PROCESO" o "CONFIRMADO"
        createdBy: currentUser.name || currentUser.email,
        createdAt: serverTimestamp(),
        // Usamos createdAt en AdminDashboard.jsx para filtrar por checkTs
      });

      if (onSuccess) onSuccess();
      onClose();
      // Reset form
      setBankId('');
      setAmount('');
      setObservations('');
    } catch (err) {
      console.error(err);
      setError('Error al registrar el depósito.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <Building size={20}/> Retiro para Depósito
          </h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        
        <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
          {error && <div className="alert error">{error}</div>}
          
          <div className="form-group">
            <label>Banco / Cuenta Destino</label>
            <select 
              className="input-field"
              value={bankId}
              onChange={e => setBankId(e.target.value)}
              required
            >
              <option value="">-- Seleccionar --</option>
              {banks.map(b => (
                <option key={b.id} value={b.id}>{b.name} - {b.accountNumber}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Monto a Retirar (Bs.)</label>
            <input 
              type="number" 
              step="0.01" 
              min="0.01"
              max={maxAmount}
              className="input-field"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={`Max: Bs. ${maxAmount.toFixed(2)}`}
              required
            />
            <small style={{color: 'var(--text-secondary)'}}>
              Efectivo Disponible: Bs. {maxAmount.toFixed(2)}
            </small>
          </div>
          
          <div className="form-group">
            <label>Observaciones (Opcional)</label>
            <textarea 
              className="input-field" 
              rows="3"
              value={observations}
              onChange={e => setObservations(e.target.value)}
              placeholder="Ej: Depósito del turno tarde"
            ></textarea>
          </div>
          
          <div style={{display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem'}}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || banks.length === 0}>
              {isSubmitting ? 'Registrando...' : 'Confirmar Retiro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
