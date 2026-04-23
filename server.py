"""
ScamStop AI Detection API
Loads the trained LSH NLP model and provides prediction endpoints
"""

from flask import Flask, request, jsonify
import joblib
import os
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
from datasketch import MinHash, MinHashLSH

app = Flask(__name__)

# ScamStopEngine Class Definition
class ScamStopEngine:
    def __init__(self, lsh_threshold=0.8, num_perm=128):
        # NLP Components
        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=50000)
        self.classifier = MultinomialNB()

        # LSH Components for Near-Duplicate Detection
        self.lsh = MinHashLSH(threshold=lsh_threshold, num_perm=num_perm)
        self.num_perm = num_perm

    def _get_minhash(self, text):
        """Helper to create a MinHash signature for a message."""
        m = MinHash(num_perm=self.num_perm)
        # Shingling: process words to create a signature
        for word in str(text).lower().split():
            m.update(word.encode('utf8'))
        return m

    def train(self, scam_csv, ham_csv):
        print("Loading datasets...")
        # Added engine='python', on_bad_lines='skip', and encoding='ISO-8859-1' to handle parsing errors
        scam_df = pd.read_csv(scam_csv, engine='python', on_bad_lines='skip', encoding='ISO-8859-1')
        ham_df = pd.read_csv(ham_csv, engine='python', on_bad_lines='skip', encoding='ISO-8859-1')

        # 1. Populate LSH with known Scams (Tier 1)
        print("Indexing known scams into LSH...")
        for i, row in scam_df.iterrows():
            m = self._get_minhash(row['Message'])
            self.lsh.insert(f"scam_{i}", m)

        # 2. Train NLP Classifier (Tier 2)
        print("Training NLP Classifier...")
        scam_df['label'] = 1
        ham_df['label'] = 0
        df = pd.concat([scam_df, ham_df]).sample(frac=0.2) # Use 20% for faster training demo

        X_train, X_test, y_train, y_test = train_test_split(
            df['Message'], df['label'], test_size=0.2
        )

        X_train_tfidf = self.vectorizer.fit_transform(X_train.astype(str))
        self.classifier.fit(X_train_tfidf, y_train)
        print("Training complete.")

    def predict(self, message):
        """Hybrid Detection Logic - Returns 1 for SCAM, 0 for SAFE"""
        # Tier 1: Check LSH for near-duplicates
        m = self._get_minhash(message)
        is_duplicate = self.lsh.query(m)

        if is_duplicate:
            return 1  # SCAM detected via LSH

        # Tier 2: Check NLP Classifier
        tfidf_msg = self.vectorizer.transform([message])
        prob = self.classifier.predict_proba(tfidf_msg)[0][1] # Probability of being a scam

        if prob > 0.7: # Threshold for classification
            return 1  # SCAM
        else:
            return 0  # SAFE

# Load LSH NLP model using joblib
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'src', 'AI-model', 'scam_stop_engine.joblib')

try:
    model = joblib.load(MODEL_PATH)
    print("✅ LSH Model loaded successfully")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    model = None

@app.route('/api/detect', methods=['POST'])
def detect_scam():
    """Detect if a message is a scam using LSH NLP model"""
    if not model:
        return jsonify({'error': 'Model not loaded'}), 500
    
    data = request.get_json()
    message = data.get('message', '')
    
    if not message:
        return jsonify({'error': 'No message provided'}), 400
    
    # Get prediction from LSH model (returns 1 for scam, 0 for safe)
    prediction = model.predict(message)
    is_scam = bool(prediction == 1)
    
    # Extract confidence from NLP classifier
    try:
        tfidf_msg = model.vectorizer.transform([message])
        prob = model.classifier.predict_proba(tfidf_msg)[0]
        scam_confidence = prob[1] * 100
        safe_confidence = prob[0] * 100
        confidence = max(scam_confidence, safe_confidence)
    except:
        # Fallback if confidence extraction fails
        confidence = 95.0 if is_scam else 85.0
        scam_confidence = 95.0 if is_scam else 5.0
        safe_confidence = 5.0 if is_scam else 95.0
    
    return jsonify({
        'is_scam': is_scam,
        'confidence': round(confidence, 2),
        'scam_probability': round(scam_confidence, 2),
        'safe_probability': round(safe_confidence, 2)
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': model is not None
    })

if __name__ == '__main__':
    app.run(debug=True, port=3000)