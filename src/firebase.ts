import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit, onSnapshot, addDoc, deleteDoc, where, Timestamp, getDocFromServer, writeBatch } from 'firebase/firestore';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAacJQQOprFd6AIyllaltNJqyMJK_7YUl8",
  authDomain: "hrst-971b9.firebaseapp.com",
  projectId: "hrst-971b9",
  storageBucket: "hrst-971b9.firebasestorage.app",
  messagingSenderId: "719745014650",
  appId: "1:719745014650:web:82a31adb0dd940451894c3"
};

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Error handling for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: { userId: undefined; email: null; emailVerified: undefined; isAnonymous: undefined; tenantId: null; providerInfo: never[] };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: undefined, email: null, emailVerified: undefined, isAnonymous: undefined, tenantId: null, providerInfo: [] },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

export { Timestamp };
