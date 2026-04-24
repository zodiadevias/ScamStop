from flask import Flask, request, jsonify
from flask_cors import CORS  # Ensure CORS is installed: pip install flask-cors
import joblib
import os
import re
from datasketch import MinHash, MinHashLSH

app = Flask(__name__)
CORS(app) # Allows your Angular frontend to talk to this API

class ScamStopEngine:
    def __init__(self, lsh_threshold=0.5, num_perm=128):
        self.vectorizer = None # Loaded from joblib
        self.classifier = None # Loaded from joblib
        self.lsh = MinHashLSH(threshold=lsh_threshold, num_perm=num_perm)
        self.num_perm = num_perm
        self.signatures = {} 

    def _get_minhash(self, text):
        m = MinHash(num_perm=self.num_perm)
        tokens = re.findall(r'\w+', str(text).lower())
        for word in tokens:
            m.update(word.encode('utf8'))
        return m

    # Inside ScamStopEngine class in app.py

    def predict(self, message):
        # Tier 1: Check LSH (Near-duplicates)
        m = self._get_minhash(message)
        is_duplicate = self.lsh.query(m)
        if is_duplicate:
            return 1, 1.0  # LSH stays at 100% because it's an exact/near match

        # Tier 2: Check NLP Classifier
        tfidf_msg = self.vectorizer.transform([message])
        prob = self.classifier.predict_proba(tfidf_msg)[0][1]

        # --- UPDATE THIS LINE ---
        # Raising this from 0.5 to 0.8 makes the AI "stricter" before calling it a scam
        prediction = 1 if prob >= 0.8 else 0 
        
        return prediction, prob

# Load logic
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'src', 'AI-model', 'scam_stop_engine.joblib')

def load_model():
    try:
        loaded = joblib.load(MODEL_PATH)
        # Rebuild LSH index from signatures if empty
        if hasattr(loaded, 'signatures') and len(loaded.lsh.keys) == 0:
            for key, m in loaded.signatures.items():
                loaded.lsh.insert(key, m)
        return loaded
    except:
        return None

model = load_model()

@app.route('/api/detect', methods=['POST'])
def detect_scam():
    if not model: return jsonify({'error': 'Model Offline'}), 500
    data = request.get_json()
    msg = data.get('message', '')
    label, prob = model.predict(msg)
    return jsonify({
        'is_scam': bool(label == 1),
        'scam_probability': round(prob * 100, 2)
    })

@app.route('/api/update-index', methods=['POST'])
def update_index():
    """Allows the Report Component to teach the AI new scams instantly"""
    if not model: return jsonify({'error': 'Model Offline'}), 500
    data = request.get_json()
    msg = data.get('message', '')
    if msg:
        m = model._get_minhash(msg)
        key = f"user_report_{os.urandom(4).hex()}"
        model.lsh.insert(key, m)
        model.signatures[key] = m
        return jsonify({'status': 'AI updated'})
    return jsonify({'error': 'No message'}), 400

if __name__ == '__main__':
    app.run(debug=True, port=3000)