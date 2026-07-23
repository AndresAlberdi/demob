import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, Loader2, UserPlus } from 'lucide-react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const createTestUsers = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      // 1. Create Admin
      const adminCred = await createUserWithEmailAndPassword(auth, 'admin@demob.com', 'admin123');
      await setDoc(doc(db, 'users', adminCred.user.uid), { role: 'admin', email: 'admin@demob.com' });
      await signOut(auth); // Sign out so we can create next
      
      // 2. Create Vendor
      const vendorCred = await createUserWithEmailAndPassword(auth, 'vendedor@demob.com', 'vendedor123');
      await setDoc(doc(db, 'users', vendorCred.user.uid), { role: 'vendedor', email: 'vendedor@demob.com' });
      await signOut(auth);
      
      alert('Usuarios creados:\nAdmin: admin@demob.com / admin123\nVendedor: vendedor@demob.com / vendedor123');
    } catch (err) {
      console.error(err);
      setError('Error al crear usuarios de prueba: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      await login(email, password);
      // AuthContext will handle state, the ProtectedRoute redirects properly 
      // but let's push them to a safe default and let ProtectedRoute sort it out
      navigate('/vendedor');
    } catch (err) {
      console.error(err);
      setError('Credenciales inválidas. Por favor intente de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <div className="logo-container">
            <Store size={48} className="logo-icon" />
          </div>
          <h1>DemoB</h1>
          <p>Sistema de Ventas e Inventarios</p>
        </div>
        
        {error && <div className="alert alert-error">{error}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Correo Electrónico</label>
            <input 
              type="email" 
              id="email"
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="usuario@tienda.com"
              required 
              className="input-field"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input 
              type="password" 
              id="password"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••"
              required 
              className="input-field"
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary btn-block" 
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex-center"><Loader2 className="spinner" size={20} /> Ingresando...</span>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>
        
        <div style={{marginTop: '1.5rem', borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: '1.5rem'}}>
          <button 
            type="button" 
            className="btn btn-secondary btn-block" 
            onClick={createTestUsers}
            disabled={isSubmitting}
          >
            <UserPlus size={18} /> Crear Usuarios de Prueba
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
