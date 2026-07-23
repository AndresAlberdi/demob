import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Logs system events into Firestore system_logs collection
 * @param {string} type - Event type (e.g. 'LOGIN', 'SALE', 'OPEN_SHIFT', 'CLOSE_SHIFT', etc.)
 * @param {string} user - User email or name
 * @param {string} detail - Description of the action
 * @param {number} amount - Associated monetary amount (optional)
 */
export const logEvent = async (type, user, detail, amount = 0) => {
  try {
    await addDoc(collection(db, "system_logs"), {
      type,
      user: user || 'Sistema',
      detail: detail || '',
      amount: Number(amount) || 0,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Error writing system log:", e);
  }
};
