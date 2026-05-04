import os
import re
import time
import json
import hashlib
import joblib
import threading
import datetime
import concurrent.futures
import firebase_admin
from firebase_admin import credentials, firestore
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from datasketch import MinHash

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

# ---------------------------------------------------------------------------
# Rate limiting  (DDoS + brute-force protection)
# Uses in-memory storage — good enough for a single-worker deployment.
# For multi-worker, swap to Redis: storage_uri="redis://..."
# ---------------------------------------------------------------------------
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["200 per minute", "1000 per hour"],
    headers_enabled=True,   # adds X-RateLimit-* headers to responses
)

# Stricter limits on sensitive endpoints are applied per-route below.

# ---------------------------------------------------------------------------
# Firebase initialisation
# ---------------------------------------------------------------------------
# In production (Render), set GOOGLE_APPLICATION_CREDENTIALS to the path
# of the secret file, or set FIREBASE_KEY_JSON to the raw JSON string.
# Locally, serviceAccountKey.json sits next to server.py.
# ---------------------------------------------------------------------------
_key_path = os.environ.get(
    'GOOGLE_APPLICATION_CREDENTIALS',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'serviceAccountKey.json')
)
_key_json = os.environ.get('FIREBASE_KEY_JSON')

if _key_json:
    import json as _json
    cred = credentials.Certificate(_json.loads(_key_json))
else:
    cred = credentials.Certificate(_key_path)

firebase_admin.initialize_app(cred)
db = firestore.client()

# ---------------------------------------------------------------------------
# ScamStopEngine
# ---------------------------------------------------------------------------
class ScamStopEngine:
    def __init__(self, lsh_threshold=0.5, num_perm=128, b=20, r=4):
        from datasketch import MinHashLSH
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.naive_bayes import MultinomialNB

        self.vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=50000)
        self.classifier = MultinomialNB()
        self.lsh = MinHashLSH(threshold=lsh_threshold, num_perm=num_perm)
        self.num_perm = num_perm
        self.lsh_threshold = lsh_threshold
        self.b = b
        self.r = r
        self.performance_data = None

    def _get_minhash(self, text):
        m = MinHash(num_perm=self.num_perm)
        for word in str(text).lower().split():
            m.update(word.encode('utf8'))
        return m

    def _get_bands(self, m):
        b = getattr(self, 'b', None) or getattr(self.lsh, '_b', 20)
        r = getattr(self, 'r', None) or getattr(self.lsh, '_r', 4)
        v = m.hashvalues
        for i in range(b):
            band = v[i * r: (i + 1) * r]
            yield (i, hashlib.sha1(str(list(band)).encode('utf-8')).hexdigest())

    def predict(self, message):
        """Hybrid detection: keyword cache → LSH near-duplicate → NLP classifier."""
        msg_lower = message.lower()

        # Tier 0: keyword exact match
        for kw in keyword_cache:
            if kw in msg_lower:
                return f"SCAM (Detected via Keyword Match: '{kw}')"

        # Tier 1: LSH near-duplicate
        m = self._get_minhash(message)
        for _, band_hash in self._get_bands(m):
            if band_hash in lsh_cache:
                return "SCAM (Detected via LSH Near-Duplicate)"

        # Tier 2: NLP classifier
        tfidf_msg = self.vectorizer.transform([message])
        prob = self.classifier.predict_proba(tfidf_msg)[0][1]
        if prob > 0.7:
            return f"SCAM (Detected via NLP Analysis, Confidence: {prob*100:.2f}%)"
        return "SAFE"


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src', 'AI-model', 'scam_stop_engine.joblib')
SAFE_SAMPLES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'safe_samples.jsonl')

def load_model():
    try:
        import sys, types

        # joblib deserializes using the class's original module path.
        # When the .joblib was saved from __main__ (script/notebook) and
        # loaded by gunicorn (module = 'server'), the class lookup fails with
        # "module '__main__' has no attribute 'ScamStopEngine'".
        # Fix: inject ScamStopEngine into sys.modules['__main__'] before loading.
        fake_main = sys.modules.get('__main__') or types.ModuleType('__main__')
        if not hasattr(fake_main, 'ScamStopEngine'):
            fake_main.ScamStopEngine = ScamStopEngine
            sys.modules['__main__'] = fake_main

        print(f"[INFO] Loading model from: {MODEL_PATH}")
        print(f"[INFO] File exists: {os.path.exists(MODEL_PATH)}")
        m = joblib.load(MODEL_PATH)
        print(f"[INFO] Model loaded successfully: {type(m)}")
        return m
    except Exception as e:
        import traceback
        print(f"[ERROR] Could not load model: {e}")
        print(traceback.format_exc())
        return None

model = load_model()

print("[INFO] Loading model metrics...")
cached_metrics = model.performance_data if model and hasattr(model, 'performance_data') else None
print("[INFO] Metrics ready." if cached_metrics else "[WARN] No performance_data on model.")

if model:
    b = getattr(model, 'b', None) or getattr(model.lsh, '_b', '?')
    r = getattr(model, 'r', None) or getattr(model.lsh, '_r', '?')
    print(f"[INFO] LSH config — num_perm={model.num_perm}, bands={b}, rows_per_band={r}")


# ---------------------------------------------------------------------------
# Local safe-samples store  (no Firestore cost)
# ---------------------------------------------------------------------------
safe_samples_set: set[str] = set()   # stores SHA-256 hashes of seen texts
safe_samples_texts: list[str] = []   # stores the actual texts for retraining
_safe_samples_lock = threading.Lock()

def _load_safe_samples():
    global safe_samples_texts
    if not os.path.exists(SAFE_SAMPLES_PATH):
        return
    texts = []
    hashes = set()
    with open(SAFE_SAMPLES_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                text = obj.get('text', '').strip()
                h    = obj.get('hash', '')
                if text and h:
                    texts.append(text)
                    hashes.add(h)
            except Exception:
                pass
    safe_samples_texts = texts
    safe_samples_set.update(hashes)
    print(f"[INFO] Loaded {len(texts)} safe samples from local file.")

def _append_safe_sample(text: str):
    """Append a new safe sample to the local file (deduplicated)."""
    h = hashlib.sha256(text.encode('utf-8')).hexdigest()
    with _safe_samples_lock:
        if h in safe_samples_set:
            return   # already seen — skip
        safe_samples_set.add(h)
        safe_samples_texts.append(text)
        with open(SAFE_SAMPLES_PATH, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'text': text[:500], 'hash': h}) + '\n')

def _clear_safe_samples_file():
    """Called after retraining — wipe the file and in-memory store."""
    global safe_samples_texts
    with _safe_samples_lock:
        safe_samples_texts = []
        safe_samples_set.clear()
        if os.path.exists(SAFE_SAMPLES_PATH):
            os.remove(SAFE_SAMPLES_PATH)
    print("[PURGE] Cleared local safe_samples file.")

_load_safe_samples()


# ---------------------------------------------------------------------------
# Local CSV samples store  (no Firestore cost)
# Admin-uploaded CSV rows are written to local .jsonl files.
# Scam rows → csv_scam_samples.jsonl
# Safe rows → csv_safe_samples.jsonl
# Both are read at retrain time and cleared afterwards.
# ---------------------------------------------------------------------------
CSV_SCAM_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'csv_scam_samples.jsonl')
CSV_SAFE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'csv_safe_samples.jsonl')

csv_scam_texts: list[str] = []
csv_safe_texts: list[str] = []
_csv_lock = threading.Lock()

def _load_csv_samples():
    global csv_scam_texts, csv_safe_texts
    def _read(path):
        texts = []
        if not os.path.exists(path):
            return texts
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        texts.append(json.loads(line).get('text', ''))
                    except Exception:
                        pass
        return [t for t in texts if t]
    csv_scam_texts = _read(CSV_SCAM_PATH)
    csv_safe_texts = _read(CSV_SAFE_PATH)
    print(f"[INFO] Loaded {len(csv_scam_texts)} CSV scam, {len(csv_safe_texts)} CSV safe samples.")

def _append_csv_samples(items: list[dict]):
    """Write a batch of {text, label} items to the appropriate local file."""
    global csv_scam_texts, csv_safe_texts
    with _csv_lock:
        scam_lines, safe_lines = [], []
        for item in items:
            text      = (item.get('text') or '').strip()[:500]
            label     = item.get('label')
            if not text:
                continue
            label_int = 1 if str(label).lower() in ('1', 'scam', 'spam', 'yes', 'true') else 0
            entry     = json.dumps({'text': text}) + '\n'
            if label_int == 1:
                scam_lines.append(entry)
                csv_scam_texts.append(text)
            else:
                safe_lines.append(entry)
                csv_safe_texts.append(text)
        if scam_lines:
            with open(CSV_SCAM_PATH, 'a', encoding='utf-8') as f:
                f.writelines(scam_lines)
        if safe_lines:
            with open(CSV_SAFE_PATH, 'a', encoding='utf-8') as f:
                f.writelines(safe_lines)

def _clear_csv_samples():
    global csv_scam_texts, csv_safe_texts
    with _csv_lock:
        csv_scam_texts = []
        csv_safe_texts = []
        for path in (CSV_SCAM_PATH, CSV_SAFE_PATH):
            if os.path.exists(path):
                os.remove(path)
    print("[PURGE] Cleared local CSV sample files.")

_load_csv_samples()


# ---------------------------------------------------------------------------
# In-memory LSH cache  (refreshed every 30 min — reduced from 5 min)
# ---------------------------------------------------------------------------
lsh_cache: set = set()
LSH_CACHE_REFRESH_INTERVAL = 1800   # 30 minutes (was 5 min)

def build_lsh_cache():
    global lsh_cache
    new_cache = set()
    try:
        b = getattr(model, 'b', None) or getattr(model.lsh, '_b', 20) if model else 20
        for band_idx in range(b):
            docs = db.collection(f'lsh_index/band_{band_idx}/hashes').stream()
            for doc in docs:
                new_cache.add(doc.id)
        lsh_cache = new_cache
        print(f"[INFO] LSH cache refreshed — {len(lsh_cache)} hashes loaded.")
    except Exception as e:
        print(f"[WARN] LSH cache refresh failed: {e}")

def schedule_cache_refresh():
    build_lsh_cache()
    timer = threading.Timer(LSH_CACHE_REFRESH_INTERVAL, schedule_cache_refresh)
    timer.daemon = True
    timer.start()

threading.Thread(target=schedule_cache_refresh, daemon=True).start()


# ---------------------------------------------------------------------------
# In-memory keyword cache  (refreshed every 5 min)
# ---------------------------------------------------------------------------
keyword_cache: set = set()

def build_keyword_cache():
    global keyword_cache
    new_cache = set()
    try:
        for doc in db.collection('keywords').stream():
            text = doc.to_dict().get('text', '').lower().strip()
            if text:
                new_cache.add(text)
        keyword_cache = new_cache
        print(f"[INFO] Keyword cache refreshed — {len(keyword_cache)} keywords loaded.")
    except Exception as e:
        print(f"[WARN] Keyword cache refresh failed: {e}")

def schedule_keyword_refresh():
    build_keyword_cache()
    timer = threading.Timer(LSH_CACHE_REFRESH_INTERVAL, schedule_keyword_refresh)
    timer.daemon = True
    timer.start()

threading.Thread(target=schedule_keyword_refresh, daemon=True).start()


# ---------------------------------------------------------------------------
# Retrain state
# ---------------------------------------------------------------------------
retrain_lock   = threading.Lock()
retrain_status = {
    'state':           'idle',
    'last_run':        None,
    'next_run':        None,
    'scam_samples':    0,
    'safe_samples':    0,
    'keyword_samples': 0,
    'message':         '',
}

RETRAIN_INTERVAL_SECONDS = 7 * 24 * 60 * 60   # 1 week


# ---------------------------------------------------------------------------
# LSH introspection helpers
# ---------------------------------------------------------------------------
def _lsh_b(m) -> int:
    """Return the actual number of bands used by the MinHashLSH object."""
    if m is None:
        return 0
    # datasketch stores it as _b on the LSH object
    lsh_obj = getattr(m, 'lsh', None)
    if lsh_obj is not None:
        b = getattr(lsh_obj, '_b', None) or getattr(lsh_obj, 'b', None)
        if b:
            return int(b)
    # Fall back to the engine's own attribute
    return int(getattr(m, 'b', 0))


def _lsh_r(m) -> int:
    """Return the actual number of rows per band."""
    if m is None:
        return 0
    lsh_obj = getattr(m, 'lsh', None)
    if lsh_obj is not None:
        r = getattr(lsh_obj, '_r', None) or getattr(lsh_obj, 'r', None)
        if r:
            return int(r)
    return int(getattr(m, 'r', 0))


def _measure_query_time(m) -> float:
    """
    Run 10 predictions on a fixed probe string and return the
    average latency in milliseconds (rounded to 2 dp).
    """
    if m is None:
        return 0.0
    probe = "send money now to claim your prize"
    runs  = 10
    start = time.perf_counter()
    for _ in range(runs):
        m.predict(probe)
    elapsed_ms = (time.perf_counter() - start) / runs * 1000
    return round(elapsed_ms, 2)


# ---------------------------------------------------------------------------
# Firestore collection purge helper
# ---------------------------------------------------------------------------
def _delete_collection(collection_name: str, batch_size: int = 400):
    """
    Delete all documents in a Firestore collection in batches.
    Firestore batch writes are capped at 500 ops; we use 400 to stay safe.
    """
    col_ref = db.collection(collection_name)
    deleted = 0
    while True:
        docs = list(col_ref.limit(batch_size).stream())
        if not docs:
            break
        batch = db.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(docs)
    print(f"[PURGE] Deleted {deleted} documents from '{collection_name}'.")


# ---------------------------------------------------------------------------
# Core retrain function
# ---------------------------------------------------------------------------
def _do_retrain():
    """
    Training data sources:
      SCAM (label=1): keywords.text + CSV scam uploads
      SAFE (label=0): local safe_samples.jsonl + CSV safe uploads

    Evaluation uses a proper train/test split with the full hybrid
    (LSH + NLP) pipeline so metrics reflect real-world performance.
    """
    global model, cached_metrics

    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score,
        f1_score, roc_auc_score, confusion_matrix,
        classification_report,
    )
    from datasketch import MinHashLSH

    print("[RETRAIN] Starting retrain job...")

    scam_texts: list[str] = []
    safe_texts: list[str] = []
    counts = {
        'keywords':     0,
        'csv_scam':     0,
        'safe_samples': 0,
        'csv_safe':     0,
    }

    # ── SCAM 1: keywords ──────────────────────────────────────────────────
    for doc in db.collection('keywords').stream():
        kw = (doc.to_dict().get('text') or '').strip()
        if kw:
            scam_texts.append(kw)
            counts['keywords'] += 1

    # ── SCAM 2: CSV-uploaded scam samples (local file) ────────────────────
    with _csv_lock:
        local_csv_scam = list(csv_scam_texts)
        local_csv_safe = list(csv_safe_texts)
    scam_texts.extend(local_csv_scam)
    safe_texts.extend(local_csv_safe)
    counts['csv_scam'] = len(local_csv_scam)
    counts['csv_safe'] = len(local_csv_safe)

    # ── SAFE 1: local safe_samples file ───────────────────────────────────
    with _safe_samples_lock:
        local_safe = list(safe_samples_texts)
    safe_texts.extend(local_safe)
    counts['safe_samples'] = len(local_safe)

    # Deduplicate to prevent accuracy inflation from repeated samples
    scam_texts = list(dict.fromkeys(scam_texts))
    safe_texts  = list(dict.fromkeys(safe_texts))

    print(f"[RETRAIN] Dataset — "
          f"scam: {len(scam_texts)} (keywords={counts['keywords']}, csv={counts['csv_scam']}) | "
          f"safe: {len(safe_texts)} (safe_samples={counts['safe_samples']}, csv={counts['csv_safe']})")

    # ── Validate ──────────────────────────────────────────────────────────
    MIN_SAMPLES = 10
    if len(scam_texts) < MIN_SAMPLES:
        msg = (f"Not enough scam samples ({len(scam_texts)}). "
               f"Need at least {MIN_SAMPLES}. Add more keywords or upload a CSV.")
        print(f"[RETRAIN] Aborted — {msg}")
        return False, msg, {}

    # Pad safe_texts with neutral fillers if still sparse
    if len(safe_texts) < MIN_SAMPLES:
        fillers = [
            "Hello, how are you today?",
            "The weather is nice outside.",
            "Please call me when you are free.",
            "I will send the document tomorrow.",
            "Thank you for your message.",
            "Let us meet at the office at 9am.",
            "The package has been delivered.",
            "Your appointment is confirmed.",
            "Happy birthday! Hope you have a great day.",
            "The report is ready for review.",
        ]
        safe_texts.extend(fillers * ((MIN_SAMPLES // len(fillers)) + 1))
        safe_texts = safe_texts[:max(len(scam_texts), MIN_SAMPLES)]

    # ── Train / test split ────────────────────────────────────────────────
    X = scam_texts + safe_texts
    y = [1] * len(scam_texts) + [0] * len(safe_texts)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── Train TF-IDF + Naive Bayes on training split only ─────────────────
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), max_features=50000)
    X_train_vec = vectorizer.fit_transform(X_train)
    classifier  = MultinomialNB()
    classifier.fit(X_train_vec, y_train)

    # ── Build a temporary LSH index from training scam texts only ─────────
    # This mirrors real-world usage: LSH is queried first, NLP second.
    lsh_threshold = model.lsh_threshold if model else 0.5
    num_perm      = model.num_perm      if model else 128
    temp_lsh = MinHashLSH(threshold=lsh_threshold, num_perm=num_perm)
    for i, txt in enumerate(X_train):
        if y_train[i] == 1:
            try:
                mh = MinHash(num_perm=num_perm)
                for word in txt.lower().split():
                    mh.update(word.encode('utf8'))
                temp_lsh.insert(f"train_{i}", mh)
            except Exception:
                pass

    # ── Evaluate on unseen test set using the full hybrid pipeline ─────────
    y_pred:  list[int]   = []
    y_proba: list[float] = []

    for msg in X_test:
        # Tier 1: LSH near-duplicate check
        mh = MinHash(num_perm=num_perm)
        for word in msg.lower().split():
            mh.update(word.encode('utf8'))

        try:
            lsh_hits = temp_lsh.query(mh)
        except Exception:
            lsh_hits = []

        if lsh_hits:
            y_pred.append(1)
            y_proba.append(1.0)
        else:
            # Tier 2: NLP classifier
            vec = vectorizer.transform([msg])
            p   = classifier.predict_proba(vec)[0][1]
            y_proba.append(float(p))
            y_pred.append(1 if p > 0.7 else 0)

    # ── Compute metrics ───────────────────────────────────────────────────
    cm = confusion_matrix(y_test, y_pred).tolist()
    cr = classification_report(y_test, y_pred, output_dict=True)

    performance = {
        'performance_metrics': {
            'accuracy':               round(accuracy_score(y_test, y_pred),                    4),
            'precision':              round(precision_score(y_test, y_pred, zero_division=0),  4),
            'recall':                 round(recall_score(y_test, y_pred, zero_division=0),     4),
            'f1_score':               round(f1_score(y_test, y_pred, zero_division=0),         4),
            'auc_roc':                round(roc_auc_score(y_test, y_proba),                    4),
            'lsh_similarity_threshold': lsh_threshold,
        },
        'confusion_matrix': {
            'true_negative':  cm[0][0],
            'false_positive': cm[0][1],
            'false_negative': cm[1][0],
            'true_positive':  cm[1][1],
        },
        'lsh_configurations': {
            'hash_functions_k':      num_perm,
            'bands_b':               _lsh_b(model),
            'rows_per_band_r':       _lsh_r(model),
            'lsh_threshold':         lsh_threshold,
            'minhash_shingle_size':  'Word-based (1-gram)',
            'vocabulary_size_tfidf': len(vectorizer.vocabulary_),
            'avg_query_time_ms':     _measure_query_time(model) if model else 0.0,
        },
        'classification_report': cr,
    }

    # ── Patch live model and save ─────────────────────────────────────────
    model.vectorizer       = vectorizer
    model.classifier       = classifier
    model.performance_data = performance
    cached_metrics         = performance
    _cache_invalidate('metrics')

    joblib.dump(model, MODEL_PATH)
    print(f"[RETRAIN] Done — saved to {MODEL_PATH}")
    print(f"[RETRAIN] Accuracy={performance['performance_metrics']['accuracy']}, "
          f"F1={performance['performance_metrics']['f1_score']}")

    # ── Log to Firestore ──────────────────────────────────────────────────
    db.collection('retrain_log').add({
        'retrained_at':    firestore.SERVER_TIMESTAMP,
        'scam_samples':    len(scam_texts),
        'safe_samples':    len(safe_texts),
        'keywords':        counts['keywords'],
        'csv_scam':        counts['csv_scam'],
        'safe_samples_db': counts['safe_samples'],
        'csv_safe':        counts['csv_safe'],
        'accuracy':        performance['performance_metrics']['accuracy'],
        'f1_score':        performance['performance_metrics']['f1_score'],
        'triggered_by':    'scheduler',
    })

    # ── Purge consumed training data ──────────────────────────────────────
    _clear_safe_samples_file()
    _clear_csv_samples()
    print("[RETRAIN] Purged training data.")

    return True, 'Retrain completed successfully.', {
        'scam_samples':    len(scam_texts),
        'safe_samples':    len(safe_texts),
        'keyword_samples': counts['keywords'],
        'accuracy':        performance['performance_metrics']['accuracy'],
        'f1_score':        performance['performance_metrics']['f1_score'],
    }

def run_retrain(triggered_by: str = 'scheduler'):
    global retrain_status

    with retrain_lock:
        if retrain_status['state'] == 'running':
            print("[RETRAIN] Already running — skipping.")
            return
        retrain_status['state']   = 'running'
        retrain_status['message'] = 'Retraining in progress…'

    try:
        success, message, stats = _do_retrain()
        if triggered_by == 'manual' and success:
            logs = list(db.collection('retrain_log').order_by(
                'retrained_at', direction=firestore.Query.DESCENDING
            ).limit(1).stream())
            if logs:
                logs[0].reference.update({'triggered_by': 'manual'})

        with retrain_lock:
            retrain_status.update({
                'state':    'success' if success else 'error',
                'message':  message,
                'last_run': datetime.datetime.utcnow().isoformat() + 'Z',
                **(stats if success else {}),
            })
    except Exception as e:
        print(f"[RETRAIN] Exception: {e}")
        with retrain_lock:
            retrain_status.update({'state': 'error', 'message': str(e)})


# ---------------------------------------------------------------------------
# Weekly scheduler
# ---------------------------------------------------------------------------
def schedule_weekly_retrain():
    next_run = datetime.datetime.utcnow() + datetime.timedelta(seconds=RETRAIN_INTERVAL_SECONDS)
    retrain_status['next_run'] = next_run.isoformat() + 'Z'
    print(f"[RETRAIN] Next scheduled run: {retrain_status['next_run']}")

    def _fire():
        print("[RETRAIN] Weekly retrain triggered by scheduler.")
        threading.Thread(target=run_retrain, args=('scheduler',), daemon=True).start()
        schedule_weekly_retrain()

    timer = threading.Timer(RETRAIN_INTERVAL_SECONDS, _fire)
    timer.daemon = True
    timer.start()

schedule_weekly_retrain()

# ---------------------------------------------------------------------------
# Server-side response cache  (reduces repeated full-collection reads)
# ---------------------------------------------------------------------------
_response_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL = 300   # 5 minutes

def _cache_get(key: str):
    with _cache_lock:
        entry = _response_cache.get(key)
        if entry and (time.time() - entry['ts']) < CACHE_TTL:
            return entry['data']
    return None

def _cache_set(key: str, data):
    with _cache_lock:
        _response_cache[key] = {'data': data, 'ts': time.time()}

def _cache_invalidate(key: str):
    with _cache_lock:
        _response_cache.pop(key, None)


# ---------------------------------------------------------------------------
# Result parsing
# ---------------------------------------------------------------------------
def parse_predict_result(result: str):
    if 'Keyword Match' in result:
        return True, 99.0, 'Keyword'
    if result.startswith("SCAM (Detected via LSH"):
        return True, 99.0, "LSH"
    match = re.search(r'Confidence:\s*([\d.]+)%', result)
    if match:
        return True, round(float(match.group(1)), 2), "NLP"
    return False, 0.0, "NLP"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/api/detect', methods=['POST'])
def detect_scam():
    if not model:
        return jsonify({'error': 'Model Offline'}), 500

    data = request.get_json(silent=True) or {}
    msg  = data.get('message', '').strip()
    if not msg:
        return jsonify({'error': 'No message provided'}), 400

    start  = time.time()
    result = model.predict(msg)
    latency = time.time() - start

    is_scam, prob, method = parse_predict_result(result)

    if is_scam:
        # ── Novel scam: add band hashes to in-memory cache only ───────────
        # Only NLP-detected scams are novel. We keep hashes in memory;
        # they persist to Firestore only via /api/report (user-submitted).
        # This avoids 20 Firestore writes per auto-detection.
        if method == 'NLP':
            try:
                m     = model._get_minhash(msg)
                bands = list(model._get_bands(m))
                already_indexed = any(bh in lsh_cache for _, bh in bands)
                if not already_indexed:
                    for _, band_hash in bands:
                        lsh_cache.add(band_hash)   # memory only — no Firestore write
            except Exception as e:
                print(f"[WARN] Could not index novel scam bands: {e}")

    else:
        # ── Safe message: store in local file (zero Firestore cost) ───────
        try:
            _append_safe_sample(msg)
        except Exception as e:
            print(f"[WARN] Could not store safe sample: {e}")

    return jsonify({
        'is_scam':          is_scam,
        'scam_probability': prob,
        'detection_method': method,
        'processing_time':  f"{latency:.4f}s",
    })


@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    if not model:
        return jsonify({'error': 'Model not loaded. Check that scam_stop_engine.joblib exists on the server.'}), 503

    # Build live LSH config regardless of whether performance_data exists
    live_lsh = {
        'hash_functions_k':      model.num_perm,
        'bands_b':               _lsh_b(model),
        'rows_per_band_r':       _lsh_r(model),
        'lsh_threshold':         model.lsh_threshold,
        'minhash_shingle_size':  'Word-based (1-gram)',
        'vocabulary_size_tfidf': len(model.vectorizer.vocabulary_)
                                 if hasattr(model, 'vectorizer') and
                                    hasattr(model.vectorizer, 'vocabulary_') else '—',
        'avg_query_time_ms':     _measure_query_time(model),
    }

    if not cached_metrics:
        # Model is loaded but has never been retrained — return LSH config only
        return jsonify({
            'lsh_configurations': live_lsh,
            'performance_metrics': None,
            'confusion_matrix':    None,
            'classification_report': None,
            '_note': 'No performance data yet. Trigger a retrain from the admin panel.',
        }), 200

    cached = _cache_get('metrics')
    if cached:
        return jsonify(cached)

    response = dict(cached_metrics)
    response['lsh_configurations'] = live_lsh
    _cache_set('metrics', response)
    return jsonify(response)


@app.route('/api/retrain', methods=['POST'])
@limiter.limit("3 per hour")
def trigger_retrain():
    with retrain_lock:
        if retrain_status['state'] == 'running':
            return jsonify({'error': 'Retrain already in progress.'}), 409
    threading.Thread(target=run_retrain, args=('manual',), daemon=True).start()
    return jsonify({'status': 'Retrain started.', 'message': 'Poll /api/retrain/status for updates.'})


@app.route('/api/retrain/status', methods=['GET'])
def get_retrain_status():
    logs = []
    try:
        for doc in db.collection('retrain_log').order_by(
            'retrained_at', direction=firestore.Query.DESCENDING
        ).limit(5).stream():
            d = doc.to_dict()
            logs.append({
                'retrained_at':    d['retrained_at'].isoformat() if d.get('retrained_at') else None,
                'scam_samples':    d.get('scam_samples', 0),
                'safe_samples':    d.get('safe_samples', 0),
                'keyword_samples': d.get('keywords', 0),
                'accuracy':        d.get('accuracy', 0),
                'f1_score':        d.get('f1_score', 0),
                'triggered_by':    d.get('triggered_by', 'scheduler'),
            })
    except Exception as e:
        print(f"[WARN] Could not fetch retrain log: {e}")

    return jsonify({**retrain_status, 'history': logs})


@app.route('/api/samples/bulk', methods=['POST', 'OPTIONS'])
@limiter.limit("20 per hour")
def add_samples_bulk():
    """Bulk-add labeled training samples from CSV upload.
    Samples are stored in local .jsonl files on the server — zero Firestore cost.
    They are read at retrain time and cleared afterwards.
    """
    if request.method == 'OPTIONS':
        return '', 204

    data   = request.get_json(silent=True) or {}
    items  = data.get('samples', [])

    if not items:
        return jsonify({'added': 0, 'errors': ['No samples provided']}), 400

    valid   = []
    errors  = []
    for i, item in enumerate(items):
        text  = (item.get('text') or '').strip()
        label = item.get('label')
        if not text or label is None:
            errors.append(f"Item {i}: missing text or label")
            continue
        valid.append({'text': text, 'label': label})

    if valid:
        _append_csv_samples(valid)

    return jsonify({'added': len(valid), 'errors': errors}), 201


@app.route('/api/samples/status', methods=['GET'])
def get_samples_status():
    """Returns the count of CSV samples currently cached on the server."""
    with _csv_lock:
        return jsonify({
            'csv_scam': len(csv_scam_texts),
            'csv_safe': len(csv_safe_texts),
            'total':    len(csv_scam_texts) + len(csv_safe_texts),
        })


@app.route('/api/stats/flag', methods=['POST'])
def record_flag():
    """Called by the browser extension when a scam is detected on a page."""
    data = request.get_json(silent=True) or {}

    # Only increment the global counter — no per-detection text is stored.
    # Scam text is NOT persisted here; training data comes from reports,
    # keywords, and admin CSV uploads only.
    db.collection('stats').document('global').set({
        'flagged':         firestore.Increment(1),
        'last_flagged_at': firestore.SERVER_TIMESTAMP,
    }, merge=True)

    return jsonify({'status': 'recorded'})


@app.route('/api/report', methods=['POST'])
@limiter.limit("10 per minute; 100 per hour")
def report_scam():
    data = request.get_json(silent=True) or {}
    msg             = data.get('message', '').strip()
    victim_name     = data.get('victim_name', '').strip()
    scam_type       = data.get('scam_type', '').strip()
    url             = data.get('url', '').strip() if data.get('url') else None
    evidence_url    = data.get('evidence_url', '').strip() if data.get('evidence_url') else None
    city            = data.get('city', '').strip() if data.get('city') else None
    latitude        = data.get('latitude')
    longitude       = data.get('longitude')
    suspect_name    = data.get('suspect_name', '').strip() if data.get('suspect_name') else None
    suspect_contact = data.get('suspect_contact', '').strip() if data.get('suspect_contact') else None
    amount_lost     = data.get('amount_lost', '').strip() if data.get('amount_lost') else None

    if not msg:
        return jsonify({'error': 'No message provided'}), 400

    report_doc = {
        'message':     msg,
        'reported_at': firestore.SERVER_TIMESTAMP,
        'status':      'pending',
    }
    if victim_name:     report_doc['victim_name']     = victim_name
    if scam_type:       report_doc['scam_type']       = scam_type
    if url:             report_doc['url']              = url
    if evidence_url:    report_doc['evidence_url']     = evidence_url
    if city:            report_doc['city']             = city
    if latitude  is not None:
        try:    report_doc['latitude']  = float(latitude)
        except: pass
    if longitude is not None:
        try:    report_doc['longitude'] = float(longitude)
        except: pass
    if suspect_name:    report_doc['suspect_name']     = suspect_name
    if suspect_contact: report_doc['suspect_contact']  = suspect_contact
    if amount_lost:     report_doc['amount_lost']      = amount_lost

    # Write the report document first — this is what the user waits for
    _, report_ref = db.collection('reports').add(report_doc)

    # Write LSH band hashes in the background — don't block the response
    def _write_bands():
        try:
            m     = model._get_minhash(msg)
            bands = list(model._get_bands(m))
            def write_band(band_idx_hash):
                band_idx, band_hash = band_idx_hash
                doc_ref = db.collection(f'lsh_index/band_{band_idx}/hashes').document(band_hash)
                doc_ref.set({'reported_at': firestore.SERVER_TIMESTAMP}, merge=True)
                lsh_cache.add(band_hash)
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                executor.map(write_band, bands)
        except Exception as e:
            print(f"[WARN] Background LSH write failed: {e}")

    threading.Thread(target=_write_bands, daemon=True).start()

    return jsonify({
        'status':        'Report submitted and LSH index updated',
        'report_id':     report_ref.id,
        'report_status': 'pending',
    })


@app.route('/api/update-index', methods=['POST'])
def update_index():
    return report_scam()


@app.route('/api/report/<report_id>', methods=['GET'])
def get_report_status(report_id):
    doc = db.collection('reports').document(report_id).get()
    if not doc.exists:
        return jsonify({'error': 'Report not found'}), 404

    data = doc.to_dict()
    return jsonify({
        'report_id':   doc.id,
        'status':      data.get('status', 'pending'),
        'scam_type':   data.get('scam_type', ''),
        'victim_name': data.get('victim_name', ''),
        'reported_at': data.get('reported_at').isoformat() if data.get('reported_at') else None,
        'admin_reply': data.get('admin_reply', ''),
        'replied_at':  data.get('replied_at').isoformat() if data.get('replied_at') else None,
    })


@app.errorhandler(429)
def rate_limit_handler(e):
    return jsonify({
        'error': 'Too many requests. Please slow down.',
        'retry_after': e.description,
    }), 429


@app.route('/api/health', methods=['GET'])
def health():
    model_path_exists = os.path.exists(MODEL_PATH)
    firebase_ok = True
    try:
        db.collection('_health').limit(1).stream()
    except Exception:
        firebase_ok = False

    return jsonify({
        'status':            'ok' if model is not None else 'degraded',
        'model_loaded':      model is not None,
        'model_path':        MODEL_PATH,
        'model_file_exists': model_path_exists,
        'has_metrics':       cached_metrics is not None,
        'firebase_ok':       firebase_ok,
        'keywords_cached':   len(keyword_cache),
        'lsh_hashes_cached': len(lsh_cache),
        'csv_scam_cached':   len(csv_scam_texts),
        'csv_safe_cached':   len(csv_safe_texts),
        'safe_samples_cached': len(safe_samples_texts),
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    debug = os.environ.get('FLASK_ENV', 'production') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
