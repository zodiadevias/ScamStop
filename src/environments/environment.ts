export const environment = {
  production: false,
  apiUrl: 'https://scamstop-api.onrender.com',
  modelName: 'ScamStopEngine',
  modelType: 'LSH-NLP Hybrid',
  thresholds: {
    highRisk: 70,
    caution: 30
  },
  uploadcare: {
    publicKey: '2da00f6da28b5ba3faad',
    // WARNING: Never commit the real secret key to version control.
    // Set this via your CI/CD environment or a local .env loader.
    // For the browser extension context, file deletion should be
    // handled server-side. Leave empty if not needed client-side.
    secretKey: ''
  },
  firebase: {
    apiKey: "AIzaSyBO48yr60ksID6My_SvT-g6Tpr759Xc44A",
    authDomain: "scamstop-33d4e.firebaseapp.com",
    projectId: "scamstop-33d4e",
    storageBucket: "scamstop-33d4e.firebasestorage.app",
    messagingSenderId: "512588918965",
    appId: "1:512588918965:web:c5028d1e89e5d8d8548efc"
  }
};
