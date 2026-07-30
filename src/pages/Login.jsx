import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Store, Loader2, KeyRound, UserCircle } from 'lucide-react';

const Login = () => {
  const [loginMethod, setLoginMethod] = useState('pin'); // 'pin' or 'email'
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login, loginWithPin, theme, toggleTheme } = useAuth();
  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      const currentEmail = e.target.email?.value || '';
      const currentPassword = e.target.password?.value || '';
      await login(currentEmail, currentPassword);
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
    <div className="auth-container" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
        <button onClick={toggleTheme} className="theme-toggle-btn">
          {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}
        </button>
      </div>

      <div className="auth-card glass-panel">
        <div className="auth-header">
          <div className="logo-container" style={{ background: 'transparent', boxShadow: 'none' }}>
            <img src="/logo-racquet.jpeg" alt="Wally La Estación Logo" style={{ width: '80px', height: '80px', borderRadius: '18px', objectFit: 'cover', border: '3px solid #0a137c' }} />
          </div>
          <h1>
            Wally La Estación
            {import.meta.env.VITE_FIREBASE_PROJECT_ID !== 'snack-laestacion' && (
              <span className="demo-badge" style={{ 
                marginLeft: '8px', 
                fontSize: '13px', 
                background: '#ff3b30', 
                color: 'white', 
                padding: '2px 8px', 
                borderRadius: '4px', 
                fontWeight: 'bold',
                verticalAlign: 'middle',
                display: 'inline-block'
              }}>DEMO</span>
            )}
          </h1>
          <p>Sistema de Control, Inventario & POS</p>
        </div>
        
        <div className="tabs" style={{marginBottom: '1.5rem', display: 'flex', gap: '0.25rem'}}>
          <div className={`tab ${loginMethod === 'pin' ? 'active' : ''}`} onClick={() => setLoginMethod('pin')} style={{fontSize: '0.85rem', padding: '0.5rem'}}>
            <KeyRound size={14} style={{display: 'inline', marginRight: '0.25rem'}}/> Vendedor
          </div>
          <div className={`tab ${loginMethod === 'supervisor' ? 'active' : ''}`} onClick={() => setLoginMethod('supervisor')} style={{fontSize: '0.85rem', padding: '0.5rem'}}>
            <KeyRound size={14} style={{display: 'inline', marginRight: '0.25rem'}}/> Supervisor
          </div>
          <div className={`tab ${loginMethod === 'email' ? 'active' : ''}`} onClick={() => setLoginMethod('email')} style={{fontSize: '0.85rem', padding: '0.5rem'}}>
            <UserCircle size={14} style={{display: 'inline', marginRight: '0.25rem'}}/> Admin
          </div>
          <div className={`tab ${loginMethod === 'superadmin' ? 'active' : ''}`} onClick={() => setLoginMethod('superadmin')} style={{fontSize: '0.85rem', padding: '0.5rem', cursor: 'pointer'}} title="Superadmin">
            ⚙️
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        
        {/* Admin Form (Always in DOM for Chrome Password Manager detection) */}
        <form 
          onSubmit={handleEmailSubmit} 
          style={{ display: (loginMethod === 'email' || loginMethod === 'superadmin') ? 'block' : 'none' }}
        >
          <div className="form-group">
            <label htmlFor="admin-email">Correo Electrónico</label>
            <input 
              id="admin-email"
              name="email"
              type="email" 
              className="input-field" 
              placeholder="admin@demo.com"
              autoComplete="username"
              required={loginMethod === 'email' || loginMethod === 'superadmin'}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="admin-password">Contraseña</label>
            <input 
              id="admin-password"
              name="password"
              type="password" 
              className="input-field" 
              placeholder="••••••••"
              autoComplete="current-password"
              required={loginMethod === 'email' || loginMethod === 'superadmin'}
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
              loginMethod === 'superadmin' ? 'Ingresar como Superadmin' : 'Ingresar como Admin'
            )}
          </button>
        </form>

        {/* PIN Form */}
        <form 
          onSubmit={handlePinSubmit}
          style={{ display: (loginMethod === 'pin' || loginMethod === 'supervisor') ? 'block' : 'none' }}
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
              required={loginMethod === 'pin' || loginMethod === 'supervisor'}
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
              loginMethod === 'supervisor' ? 'Ingresar como Supervisor' : 'Ingresar al POS'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
