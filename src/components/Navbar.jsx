import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Navbar() {
  const { currentUser, userRole, logout, theme, toggleTheme } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (e) {
      console.error("Error signing out:", e);
    }
  };

  const getRoleBadge = () => {
    if (userRole === 'admin') return { label: 'Administrador', bg: '#0a137c', color: '#ffffff' };
    if (userRole === 'supervisor') return { label: 'Supervisor', bg: '#276cd3', color: '#ffffff' };
    return { label: 'Vendedor', bg: '#f3d92e', color: '#0a137c' };
  };

  const roleInfo = getRoleBadge();

  return (
    <nav className="app-navbar">
      <div className="navbar-container">
        {/* Brand & Logo */}
        <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <img 
            src="/logo-racquet.jpeg" 
            alt="Racquet La Estación Logo" 
            className="navbar-logo" 
          />
          <div className="brand-text">
            <span className="brand-title">Racquet La Estación</span>
            <span className="brand-subtitle">Sistema de Control & POS</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="navbar-actions">
          {/* User & Role Badge */}
          <div className="user-info-badge">
            <span className="user-email">{currentUser?.email || currentUser?.name || 'Usuario'}</span>
            <span className="role-tag" style={{ backgroundColor: roleInfo.bg, color: roleInfo.color }}>
              {roleInfo.label}
            </span>
          </div>

          {/* Role Navigation Switcher (for Admin) */}
          {userRole === 'admin' && (
            <div className="role-switcher-group">
              <button 
                className={`btn btn-sm ${window.location.pathname.startsWith('/admin') ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => navigate('/admin')}
                title="Ir a Panel Admin"
              >
                ⚙️ Admin
              </button>
              <button 
                className={`btn btn-sm ${window.location.pathname.startsWith('/supervisor') ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => navigate('/supervisor')}
                title="Ir a Vista Supervisor"
              >
                📋 Supervisor
              </button>
              <button 
                className={`btn btn-sm ${window.location.pathname.startsWith('/vendedor') ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => navigate('/vendedor?from=admin')}
                title="Ir a Punto de Venta (POS)"
              >
                🛒 POS
              </button>
            </div>
          )}

          {/* Theme Toggle Button */}
          <button 
            onClick={toggleTheme} 
            className="theme-toggle-btn"
            title={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
          >
            {theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}
          </button>

          {/* Logout Button */}
          <button onClick={handleLogout} className="btn btn-sm btn-logout" title="Cerrar Sesión">
            🚪 Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
