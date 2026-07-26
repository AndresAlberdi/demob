import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin', 'supervisor' or 'vendedor'
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Check if there is a local PIN session overriding anonymous auth
      const localPinSession = localStorage.getItem('pin_user');
      
      if (localPinSession) {
        const pinUser = JSON.parse(localPinSession);
        setCurrentUser(pinUser);
        setUserRole(pinUser.role);
        setLoading(false);
        return;
      }

      if (user && !user.isAnonymous) {
        setCurrentUser(user);
        
        const adminEmailEnv = import.meta.env.VITE_ADMIN_EMAIL || 'admin@demob.com';
        // Special case for the main admin per instructions
        if (
          user.email === 'pretsodatabase@gmail.com' || 
          user.email === 'mrwally@snack.com' || 
          user.email === 'admin@demob.com' ||
          user.email === adminEmailEnv
        ) {
          setUserRole('admin');
        } else {
          // Fetch role from firestore if needed for other email users
          try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
              setUserRole(userDoc.data().role);
            } else {
              setUserRole('vendedor'); // default fallback
            }
          } catch (e) {
            console.error(e);
            setUserRole('vendedor');
          }
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = (email, password) => {
    localStorage.removeItem('pin_user');
    return signInWithEmailAndPassword(auth, email, password);
  };
  
  const loginWithPin = async (pin) => {
    try {
      // Sign in anonymously first to get Firestore read access
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (anonErr) {
          if (anonErr.code === 'auth/admin-restricted-operation' || anonErr.code === 'auth/operation-not-allowed') {
            const adminEmailEnv = import.meta.env.VITE_ADMIN_EMAIL || 'admin@demob.com';
            const adminPasswordEnv = import.meta.env.VITE_ADMIN_PASSWORD || 'Admin*123';
            await signInWithEmailAndPassword(auth, adminEmailEnv, adminPasswordEnv);
          } else {
            throw anonErr;
          }
        }
      }
      
      const q = query(collection(db, 'app_users'), where('pin', '==', pin));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        throw new Error('PIN incorrecto o usuario no encontrado');
      }
      
      const userDoc = snapshot.docs[0];
      const data = userDoc.data();
      const userData = { 
        id: userDoc.id, 
        uid: userDoc.id, 
        vendorId: userDoc.id,
        name: data.name, 
        email: data.name,
        role: data.role || 'vendedor',
        pin: data.pin,
        isPinUser: true 
      };
      
      localStorage.setItem('pin_user', JSON.stringify(userData));
      setCurrentUser(userData);
      setUserRole(userData.role);
      
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    localStorage.removeItem('pin_user');
    setCurrentUser(null);
    setUserRole(null);
    return signOut(auth);
  };

  const value = {
    currentUser,
    userRole,
    login,
    loginWithPin,
    logout,
    theme,
    toggleTheme
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
