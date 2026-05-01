export const environment = {
  production: true,
  // Replace with your Render URL after deploying server.py
  apiUrl: 'https://YOUR_RENDER_URL/api',
  modelName: 'ScamStopEngine',
  modelType: 'LSH-NLP Hybrid',
  thresholds: {
    highRisk: 70,
    caution: 30
  }
};
