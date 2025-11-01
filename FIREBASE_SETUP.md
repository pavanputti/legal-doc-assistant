# Firebase Setup Instructions

## Firebase Storage Rules

This project includes Firebase Storage security rules in `storage.rules`.

### Deploying Storage Rules

1. **Using Firebase CLI** (Recommended):

```bash
# Install Firebase CLI if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not already done)
firebase init storage

# Deploy the rules
firebase deploy --only storage
```

2. **Using Firebase Console**:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `legal-document--assistant-v2`
3. Navigate to **Storage** → **Rules**
4. Copy the contents of `storage.rules` and paste them into the console
5. Click **Publish**

### Current Rules Configuration

The current rules include:
- **Temporary permissive rules** (expires Nov 29, 2025) - allows read/write to all paths
- **Authenticated access** to `/documents/` folder
- **Public read access** to `/public/` folder

### Updating Rules for Production

For production use, update `storage.rules` to:
- Remove the temporary permissive rule
- Add user-specific access control if needed
- Add file size limits
- Add file type restrictions

Example production rules:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // User-specific document storage
    match /documents/{userId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId 
                    && request.resource.size < 10 * 1024 * 1024  // 10MB limit
                    && request.resource.contentType.matches('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Testing Storage Rules

You can test your storage rules using the Firebase Console:
1. Go to Storage → Rules
2. Click on "Rules Playground"
3. Test different scenarios

Or use the Firebase Emulator:

```bash
firebase emulators:start --only storage
```

## Firebase Configuration

The Firebase configuration is already set up in `src/config/firebase.js` with your project credentials.

To use environment variables instead (recommended for production):

1. Create a `.env` file:
```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=legal-document--assistant-v2.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=legal-document--assistant-v2
VITE_FIREBASE_STORAGE_BUCKET=legal-document--assistant-v2.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=791638553499
VITE_FIREBASE_APP_ID=1:791638553499:web:735741fe59c704d38b673e
VITE_FIREBASE_MEASUREMENT_ID=G-PQ6DHMG0VW
```

2. The app will automatically use these environment variables if they exist.

## Firebase Hosting (Optional)

To deploy the app to Firebase Hosting:

```bash
# Build the app
npm run build

# Initialize hosting (if not done)
firebase init hosting

# Deploy
firebase deploy --only hosting
```

Your app will be available at: `https://legal-document--assistant-v2.web.app`

