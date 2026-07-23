import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, Loader2, KeyRound, UserCircle } from 'lucide-react';

const Login = () => {
  const [loginMethod, setLoginMethod] = useState('pin'); // 'pin' or 'email'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, loginWithPin } = useAuth();
  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Credenciales inválidas. Por favor intente de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      await loginWithPin(pin);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al iniciar sesión con PIN.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <div className="logo-container">
            <Store className="logo-icon" size={48} />
          </div>
          <h1>Demo B POS</h1>
          <p>Sistema de Ventas e Inventarios</p>
        </div>
        
        <div className="tabs" style={{marginBottom: '1.5rem'}}>
          <div className={`tab ${loginMethod === 'pin' ? 'active' : ''}`} onClick={() => setLoginMethod('pin')}>
            <KeyRound size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Vendedor (PIN)
          </div>
          <div className={`tab ${loginMethod === 'email' ? 'active' : ''}`} onClick={() => setLoginMethod('email')}>
            <UserCircle size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Administrador
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        
        {/* Admin Form (Always in DOM for Chrome Password Manager detection) */}
        <form 
          onSubmit={handleEmailSubmit} 
          method="post" 
          action="#"
          style={{ display: loginMethod === 'email' ? 'block' : 'none' }}
        >
          <div className="form-group">
            <label htmlFor="admin-email">Correo Electrónico</label>
            <input 
              id="admin-email"
              name="email"
              type="email" 
              className="input-field" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@demob.com"
              autoComplete="username"
              required={loginMethod === 'email'}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="admin-password">Contraseña</label>
            <input 
              id="admin-password"
              name="password"
              type="password" 
              className="input-field" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required={loginMethod === 'email'}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex-center"><Loader2 className="spinner" size={18} style={{marginRight: '0.5rem'}} /> Iniciando...</span>
            ) : (
              'Ingresar como Admin'
            )}
          </button>
        </form>

        {/* Vendor PIN Form */}
        <form 
          onSubmit={handlePinSubmit}
          style={{ display: loginMethod === 'pin' ? 'block' : 'none' }}
        >
          <div className="form-group">
            <label htmlFor="vendor-pin">PIN de Acceso</label>
            <input 
              id="vendor-pin"
              name="pin"
              type="password" 
              className="input-field" 
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              maxLength="6"
              required={loginMethod === 'pin'}
              style={{textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.25rem'}}
            />
          </div>
          
          <button 
            type="submit" 
            className="btn btn-primary btn-block"
            disabled={isSubmitting || pin.length < 6}
          >
            {isSubmitting ? (
              <span className="flex-center"><Loader2 className="spinner" size={18} style={{marginRight: '0.5rem'}} /> Iniciando...</span>
            ) : (
              'Ingresar al POS'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
