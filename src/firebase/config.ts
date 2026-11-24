import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDocFromServer,
  getFirestore,
} from 'firebase/firestore';
import rawFirebaseConfig from '../../firebase-applet-config.json';

/**
 * תצורת Firebase המרכזית.
 * בפריסה עצמאית מחוץ לסביבה זו, ניתן להדביק כאן ישירות את מפתחות הפרויקט מ-Firebase Console
 * או לעדכן את הקובץ firebase-applet-config.json בשורש הפרויקט:
 * {
 *   apiKey: "PASTE_YOUR_API_KEY",
 *   authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
 *   projectId: "PASTE_YOUR_PROJECT_ID",
 *   storageBucket: "PASTE_YOUR_PROJECT.firebasestorage.app",
 *   messagingSenderId: "...",
 *   appId: "...",
 *   firestoreDatabaseId: "(default)" // או מזהה המסד שנוצר עבורכם
 * }
 */
export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export const firebaseConfig = rawFirebaseConfig as FirebaseAppletConfig;

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];

export const isFirebaseConfigured = Boolean(
  firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes('PASTE_') &&
    firebaseConfig.projectId !== 'remixed-project-id'
);

let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  db = firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
  auth = getAuth(app);
}

const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));

// In-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuthObserver = (
  onUserChange: (user: User | null, hasCalendarToken: boolean) => void
): (() => void) => {
  if (!auth) {
    onUserChange(null, false);
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
    } else if (!cachedAccessToken && !isSigningIn) {
      cachedAccessToken = null;
    }
    onUserChange(user, Boolean(cachedAccessToken));
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string | null;
}> => {
  if (!auth) {
    throw new Error('Firebase אינו מוגדר במצב מקומי');
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const signInAnonymousGuest = async (): Promise<User> => {
  if (!auth) {
    throw new Error('Firebase אינו מוגדר במצב מקומי');
  }
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const result = await signInAnonymously(auth);
  return result.user;
};

export const getCalendarAccessToken = (): string | null => cachedAccessToken;

export const logoutUser = async (): Promise<void> => {
  cachedAccessToken = null;
  if (auth) {
    await signOut(auth);
  }
};

export async function testConnection(): Promise<boolean> {
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Firestore client is offline.');
      return false;
    }
    // Permission denied from test/connection indicates live connectivity to Firestore rules
    return true;
  }
}

void testConnection();
