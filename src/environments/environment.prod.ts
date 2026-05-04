export const environment = {
  production: true,
  apiUrl: 'https://scamstop-api.onrender.com',
  modelName: 'ScamStopEngine',
  modelType: 'LSH-NLP Hybrid',
  thresholds: {
    highRisk: 70,
    caution: 30
  },
  uploadcare: {
    publicKey: '2da00f6da28b5ba3faad',
    // Secret key intentionally omitted from production build.
    // File deletion must be handled server-side in production.
    secretKey: ''
  }
};
