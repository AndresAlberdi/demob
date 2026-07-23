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
  const [userRole, setUserRole] = useState(null); // 'admin' or 'vendedor'
  const [loading, setLoading] = useState(true);

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
        
        // Special case for the main admin per instructions
        if (user.email === 'pretsodatabase@gmail.com' || user.email === 'admin@demob.com') {
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
      if (!auth.currentUser || !auth.currentUser.isAnonymous) {
        await signInAnonymously(auth);
      }
      
      const q = query(collection(db, 'app_users'), where('pin', '==', pin));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        throw new Error('PIN incorrecto o usuario no encontrado');
      }
      
      const userDoc = snapshot.docs[0];
      const userData = { uid: userDoc.id, ...userDoc.data(), isPinUser: true, email: userDoc.data().name };
      
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
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
