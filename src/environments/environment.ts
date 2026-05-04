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
    apiKey: "AIzaSyCKaSXtn8NFLa1-z9h9c8PB9TtFCBtc1qg",
    authDomain: "scamstop-c262b.firebaseapp.com",
    projectId: "scamstop-c262b",
    storageBucket: "scamstop-c262b.firebasestorage.app",
    messagingSenderId: "678255885730",
    appId: "1:678255885730:web:bb13db50b7e85a7f3e46fb",
    measurementId: "G-SS27643Q7E"
  }
};
