export { initializeApp } from 'firebase/app';
export {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithCredential,
  signOut,
  GoogleAuthProvider,
} from 'firebase/auth';
export {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
