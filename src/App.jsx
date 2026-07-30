import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import VendorDashboard from './pages/VendorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import SupervisorDashboard from './pages/SupervisorDashboard';
import './index.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    if (userRole === 'superadmin' || userRole === 'admin') return <Navigate to="/admin" replace />;
    if (userRole === 'supervisor') return <Navigate to="/supervisor" replace />;
    return <Navigate to="/vendedor" replace />;
  }
  
  return children;
};

const HomeRedirect = () => {
  const { currentUser, userRole } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (userRole === 'superadmin' || userRole === 'admin') return <Navigate to="/admin" replace />;
  if (userRole === 'supervisor') return <Navigate to="/supervisor" replace />;
  return <Navigate to="/vendedor" replace />;
};

function App() {
  React.useEffect(() => {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    if (projectId !== 'snack-laestacion') {
      document.title = "(DEMO) Wally La Estación";
    }
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/vendedor/*" 
            element={
              <ProtectedRoute allowedRoles={['vendedor', 'admin', 'superadmin']}>
                <VendorDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/supervisor/*" 
            element={
              <ProtectedRoute allowedRoles={['supervisor', 'admin', 'superadmin']}>
                <SupervisorDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/*" 
            element={
              <ProtectedRoute allowedRoles={['admin', 'superadmin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          {/* Default redirect */}
          <Route 
            path="*" 
            element={<Navigate to="/" replace />} 
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
