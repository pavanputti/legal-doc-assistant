import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration - all values must come from environment variables
// IMPORTANT: Never commit API keys to version control!
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validate that all required environment variables are set
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingEnvVars = requiredEnvVars.filter(
  varName => !import.meta.env[varName]
);

if (missingEnvVars.length > 0) {
  console.warn(
    '⚠️ Missing Firebase environment variables:',
    missingEnvVars.join(', ')
  );
  console.warn(
    '📝 Create a .env file with your Firebase configuration (see .env.example for reference).'
  );
  console.warn(
    'ℹ️ The app will work without Firebase (using local file handling), but file uploads will be limited.'
  );
}

// Initialize Firebase only if all required variables are present
let app = null;
try {
  // Check if at least projectId is present (minimal requirement)
  if (firebaseConfig.projectId) {
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase initialized successfully');
  } else {
    console.warn('⚠️ Firebase not initialized - missing projectId. File uploads will use local storage.');
  }
} catch (error) {
  console.warn('⚠️ Firebase initialization failed:', error.message);
  console.warn('ℹ️ The app will continue without Firebase features.');
}

// Initialize Cloud Storage and get a reference to the service
// Only initialize if app is available
let storageInstance = null;
if (app) {
  try {
    storageInstance = getStorage(app);
  } catch (error) {
    console.warn('Failed to initialize Firebase Storage:', error);
  }
}
export const storage = storageInstance;

// Initialize Analytics (only in browser environment and if app is available)
let analytics = null;
if (typeof window !== 'undefined' && app) {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    console.warn('Analytics initialization failed:', error);
  }
}

export { analytics };
export default app;
