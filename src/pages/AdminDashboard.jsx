import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, Users, BarChart3, Settings, ShieldAlert } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';

const AdminDashboard = () => {
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('reports'); // reports, users, settings

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-layout">
      <div className="dashboard-header flex-between">
        <div>
          <h2>Panel de Administración</h2>
          <p>Administrador: {currentUser?.email}</p>
        </div>
        <div style={{display: 'flex', gap: '1rem'}}>
          <Link to="/vendedor" className="btn btn-secondary">Ir a POS</Link>
          <button className="btn btn-danger" onClick={handleLogout}>
            <LogOut size={18} /> Salir
          </button>
        </div>
      </div>
      
      <div className="tabs">
        <div className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>
          <BarChart3 size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Reportes
        </div>
        <div className={`tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          <Users size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Usuarios
        </div>
        <div className={`tab ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <Settings size={16} style={{display: 'inline', marginRight: '0.25rem'}}/> Configuración & Productos
        </div>
      </div>
      
      {activeTab === 'reports' && (
        <div className="dashboard-grid">
          <div className="card glass-panel">
            <h3 className="card-title">Ingresos Hoy</h3>
            <div className="card-value">Bs. 0.00</div>
          </div>
          <div className="card glass-panel">
            <h3 className="card-title">Ventas (QR)</h3>
            <div className="card-value">Bs. 0.00</div>
          </div>
          <div className="card glass-panel">
            <h3 className="card-title">Gastos del Día</h3>
            <div className="card-value">Bs. 0.00</div>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="card glass-panel">
          <h3>Gestión de Usuarios</h3>
          <p>Aquí el administrador crea usuarios y cambia contraseñas.</p>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card glass-panel">
          <h3>Configuración del Sistema</h3>
          <div className="item-list">
            <div className="list-item">
              <div className="item-info">
                <h4>Gestionar Productos</h4>
                <p>Crear, modificar precios y tipos de productos.</p>
              </div>
              <button className="btn btn-secondary">Editar</button>
            </div>
            <div className="list-item">
              <div className="item-info">
                <h4>Motivos de Pérdida</h4>
                <p>Configurar razones válidas (roturas, vencimiento).</p>
              </div>
              <button className="btn btn-secondary">Configurar</button>
            </div>
            <div className="list-item">
              <div className="item-info">
                <h4><ShieldAlert size={16} style={{display:'inline'}}/> Autorización de pérdidas</h4>
                <p>Aprobar reportes de robos o pérdidas ingresados por vendedores.</p>
              </div>
              <button className="btn btn-primary">Revisar (0)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
