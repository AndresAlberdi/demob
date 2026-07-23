import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import VendorDashboard from './pages/VendorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import './index.css';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser, userRole } = useAuth();
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Redirect based on role if they try to access something they shouldn't
    return <Navigate to={userRole === 'admin' ? '/admin' : '/vendedor'} replace />;
  }
  
  return children;
};

const HomeRedirect = () => {
  const { currentUser, userRole } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  // If loading role, we might want to wait, but assuming it loads fast enough:
  if (userRole === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/vendedor" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route 
            path="/vendedor/*" 
            element={
              <ProtectedRoute allowedRoles={['vendedor', 'admin']}>
                <VendorDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/*" 
            element={
              <ProtectedRoute allowedRoles={['admin']}>
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
