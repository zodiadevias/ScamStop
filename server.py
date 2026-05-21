import os
import re
import time
import json
import hashlib
import joblib
import threading
import datetime
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
SHINGLE_SIZE = 3   # character n-gram size used for MinHash shingling (matches v3.ipynb)

class ScamStopEngine:
    def __init__(self, lsh_threshold=0.9, num_perm=128, b=20, r=4):
        from datasketch import MinHashLSH
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.naive_bayes import MultinomialNB

        self.vectorizer    = TfidfVectorizer(ngram_range=(1, 2), max_features=10000)
        self.classifier    = MultinomialNB()
        self.lsh           = MinHashLSH(threshold=lsh_threshold, num_perm=num_perm)
        self.lsh_minhashes = {}   # key → MinHash — used to compute actual Jaccard similarity
        self.num_perm      = num_perm
        self.lsh_threshold = lsh_threshold
        self.b             = b
        self.r             = r
        self.performance_data = None

    def _get_minhash(self, text):
        m = MinHash(num_perm=self.num_perm)
        # Character-level n-grams — resilient against adversarial typos (e.g. "fr3e", "GCa$h")
        clean = ' '.join(str(text).lower().split())
        for i in range(max(1, len(clean) - SHINGLE_SIZE + 1)):
            m.update(clean[i:i + SHINGLE_SIZE].encode('utf8'))
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

        # Tier 1: LSH near-duplicate — compute actual Jaccard similarity
        mh = self._get_minhash(message)
        try:
            hits = self.lsh.query(mh)
            if hits:
                # Compute actual Jaccard against all matched MinHashes, take the max
                best_similarity = 0.0
                minhashes = getattr(self, 'lsh_minhashes', {})
                for key in hits:
                    stored_mh = minhashes.get(key)
                    if stored_mh is not None:
                        sim = mh.jaccard(stored_mh)
                        if sim > best_similarity:
                            best_similarity = sim
                # Fall back to threshold if no stored MinHashes found
                if best_similarity == 0.0:
                    best_similarity = self.lsh_threshold
                return f"SCAM (Detected via LSH Near-Duplicate, Similarity: {best_similarity*100:.2f}%)"
        except Exception:
            pass

        # Tier 2: NLP classifier
        tfidf_msg = self.vectorizer.transform([message])
        prob = self.classifier.predict_proba(tfidf_msg)[0][1]
        if prob > 0.7:
            return f"SCAM (Detected via NLP Analysis, Confidence: {prob*100:.2f}%)"
        return "SAFE"


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
MODEL_PATH        = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src', 'AI-model', 'scam_stop_engine.joblib')
MODEL_BACKUP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src', 'AI-model', 'scam_stop_engine.backup.joblib')
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
    mh_count = len(getattr(model, 'lsh_minhashes', {}))
    print(f"[INFO] LSH config — num_perm={model.num_perm}, bands={b}, rows_per_band={r}, stored_minhashes={mh_count}")
    if mh_count == 0:
        print("[WARN] lsh_minhashes is empty — LSH similarity will fall back to threshold value. Re-run model.ipynb and re-upload the .joblib.")


# ---------------------------------------------------------------------------
# Local safe-samples store  (no Firestore cost)
# Texts are written to disk only — no in-memory list to avoid unbounded RAM.
# A hash set is kept in memory solely for fast deduplication on write.
# ---------------------------------------------------------------------------
safe_samples_set: set[str] = set()   # SHA-256 hashes for dedup — small footprint
_safe_samples_lock = threading.Lock()

def _load_safe_sample_hashes():
    """Load only the hashes from the safe_samples file into memory for dedup."""
    if not os.path.exists(SAFE_SAMPLES_PATH):
        return
    hashes = set()
    with open(SAFE_SAMPLES_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                h = json.loads(line).get('hash', '')
                if h:
                    hashes.add(h)
            except Exception:
                pass
    safe_samples_set.update(hashes)
    print(f"[INFO] Loaded {len(hashes)} safe sample hashes for dedup.")

def _append_safe_sample(text: str):
    """Append a new safe sample to the local file (deduplicated, file-only)."""
    h = hashlib.sha256(text.encode('utf-8')).hexdigest()
    with _safe_samples_lock:
        if h in safe_samples_set:
            return   # already seen — skip
        safe_samples_set.add(h)
        with open(SAFE_SAMPLES_PATH, 'a', encoding='utf-8') as f:
            f.write(json.dumps({'text': text[:500], 'hash': h}) + '\n')

def _stream_safe_samples():
    """Yield safe sample texts from disk one at a time — no full load into RAM."""
    if not os.path.exists(SAFE_SAMPLES_PATH):
        return
    with open(SAFE_SAMPLES_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                text = json.loads(line).get('text', '').strip()
                if text:
                    yield text
            except Exception:
                pass

def _count_safe_samples() -> int:
    if not os.path.exists(SAFE_SAMPLES_PATH):
        return 0
    count = 0
    with open(SAFE_SAMPLES_PATH, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                count += 1
    return count

def _clear_safe_samples_file():
    """Called after retraining — wipe the file and hash set."""
    with _safe_samples_lock:
        safe_samples_set.clear()
        if os.path.exists(SAFE_SAMPLES_PATH):
            os.remove(SAFE_SAMPLES_PATH)
    print("[PURGE] Cleared local safe_samples file.")

_load_safe_sample_hashes()


# ---------------------------------------------------------------------------
# Local CSV samples store  (no Firestore cost)
# Admin-uploaded CSV rows are written to local .jsonl files — disk only.
# No in-memory lists: avoids OOM when uploading 300k+ row datasets.
# ---------------------------------------------------------------------------
CSV_SCAM_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'csv_scam_samples.jsonl')
CSV_SAFE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'csv_safe_samples.jsonl')

_csv_lock = threading.Lock()

def _append_csv_samples(items: list[dict]):
    """Write a batch of {text, label} items to the appropriate local file.
    No in-memory accumulation — data lives on disk only until retrain."""
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
            else:
                safe_lines.append(entry)
        if scam_lines:
            with open(CSV_SCAM_PATH, 'a', encoding='utf-8') as f:
                f.writelines(scam_lines)
        if safe_lines:
            with open(CSV_SAFE_PATH, 'a', encoding='utf-8') as f:
                f.writelines(safe_lines)

def _stream_csv_texts(path: str):
    """Yield texts from a .jsonl file one line at a time — no full load into RAM."""
    if not os.path.exists(path):
        return
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                text = json.loads(line).get('text', '').strip()
                if text:
                    yield text
            except Exception:
                pass

def _count_csv_lines(path: str) -> int:
    """Count lines in a .jsonl file without loading content into memory."""
    if not os.path.exists(path):
        return 0
    count = 0
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                count += 1
    return count

def _clear_csv_samples():
    with _csv_lock:
        for path in (CSV_SCAM_PATH, CSV_SAFE_PATH):
            if os.path.exists(path):
                os.remove(path)
    print("[PURGE] Cleared local CSV sample files.")


# ---------------------------------------------------------------------------
# In-memory keyword cache  (refreshed every 30 min)
# ---------------------------------------------------------------------------
keyword_cache: set = set()
LSH_CACHE_REFRESH_INTERVAL = 1800   # 30 minutes

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
def _do_retrain(triggered_by: str = 'scheduler'):
    """
    Retrains the model using the same pipeline as revised_nlp.ipynb:
      - TfidfVectorizer (1-2 ngrams, 10 000 features)
      - MultinomialNB classifier
      - MinHashLSH rebuilt from scam training texts

    Old data is RETAINED across retrains — CSV and safe-sample files are NOT
    purged, so each retrain builds on all accumulated data.

    Memory guard: dataset is capped at MAX_SCAM + MAX_SAFE rows to stay
    within Render free tier's 512MB limit.

    Training data sources:
      SCAM (label=1): keywords collection + CSV scam uploads
      SAFE (label=0): safe_samples.jsonl + CSV safe uploads
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
    import numpy as np

    print("[RETRAIN] Starting retrain job (notebook-compatible pipeline)...")

    # ── Collect all texts into memory (capped) ────────────────────────────
    # Cap per class to stay within 512MB on Render free tier.
    MAX_SCAM = 50_000
    MAX_SAFE = 50_000

    scam_texts: list[str] = []
    safe_texts: list[str] = []
    counts = {'keywords': 0, 'csv_scam': 0, 'reports': 0, 'safe_samples': 0, 'csv_safe': 0}

    # SCAM: keywords from Firestore
    for doc in db.collection('keywords').stream():
        kw = (doc.to_dict().get('text') or '').strip()
        if kw:
            scam_texts.append(kw)
            counts['keywords'] += 1

    # SCAM: verified reports from Firestore (persistent across deploys)
    for doc in db.collection('reports').where('status', '==', 'verified').stream():
        if len(scam_texts) >= MAX_SCAM:
            break
        msg = (doc.to_dict().get('message') or '').strip()
        if msg:
            scam_texts.append(msg)
            counts['reports'] += 1

    # SCAM: user-flagged messages from extension modals
    for doc in db.collection('user_flagged').stream():
        if len(scam_texts) >= MAX_SCAM:
            break
        msg = (doc.to_dict().get('text') or '').strip()
        if msg:
            scam_texts.append(msg)
            counts.setdefault('user_flagged', 0)
            counts['user_flagged'] += 1

    # SCAM: CSV uploads (streamed — ephemeral, may be empty after redeploy)
    for txt in _stream_csv_texts(CSV_SCAM_PATH):
        if len(scam_texts) >= MAX_SCAM:
            break
        scam_texts.append(txt)
        counts['csv_scam'] += 1

    # SAFE: safe_samples.jsonl (streamed)
    for txt in _stream_safe_samples():
        if len(safe_texts) >= MAX_SAFE:
            break
        safe_texts.append(txt)
        counts['safe_samples'] += 1

    # SAFE: CSV uploads (streamed)
    for txt in _stream_csv_texts(CSV_SAFE_PATH):
        if len(safe_texts) >= MAX_SAFE:
            break
        safe_texts.append(txt)
        counts['csv_safe'] += 1

    # Deduplicate
    scam_texts = list(dict.fromkeys(scam_texts))
    safe_texts  = list(dict.fromkeys(safe_texts))

    total_scam = len(scam_texts)
    total_safe = len(safe_texts)

    print(f"[RETRAIN] Dataset — "
          f"scam: {total_scam} (keywords={counts['keywords']}, reports={counts['reports']}, csv={counts['csv_scam']}) | "
          f"safe: {total_safe} (safe_samples={counts['safe_samples']}, csv={counts['csv_safe']})")

    # ── Validate ──────────────────────────────────────────────────────────
    MIN_SAMPLES = 5
    if total_scam < MIN_SAMPLES:
        msg = (f"Not enough scam samples ({total_scam}). "
               f"Need at least {MIN_SAMPLES}. "
               f"Add more keywords or upload a CSV with scam samples.")
        print(f"[RETRAIN] Aborted — {msg}")
        return False, msg, {}

    # Pad safe texts with neutral fillers if sparse
    if total_safe < MIN_SAMPLES:
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
        safe_texts = safe_texts[:max(total_scam, MIN_SAMPLES)]
        total_safe = len(safe_texts)

    # ── Train / test split (mirrors notebook) ─────────────────────────────
    X = scam_texts + safe_texts
    y = [1] * total_scam + [0] * total_safe

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    # ── TF-IDF + Naive Bayes (mirrors notebook) ───────────────────────────
    print("[RETRAIN] Training TF-IDF + Naive Bayes...")
    vectorizer  = TfidfVectorizer(ngram_range=(1, 2), max_features=10000)
    X_train_vec = vectorizer.fit_transform(X_train)
    classifier  = MultinomialNB()
    classifier.fit(X_train_vec, y_train)

    # ── Rebuild MinHashLSH from scam training texts (mirrors notebook) ────
    lsh_threshold = model.lsh_threshold if model else 0.9
    num_perm      = model.num_perm      if model else 128
    print("[RETRAIN] Rebuilding LSH index from scam training texts...")
    new_lsh        = MinHashLSH(threshold=lsh_threshold, num_perm=num_perm)
    new_minhashes  = {}   # key → MinHash for actual Jaccard computation
    for i, txt in enumerate(X_train):
        if y_train[i] == 1:
            try:
                mh = MinHash(num_perm=num_perm)
                clean = ' '.join(txt.lower().split())
                for i in range(max(1, len(clean) - SHINGLE_SIZE + 1)):
                    mh.update(clean[i:i + SHINGLE_SIZE].encode('utf8'))
                new_lsh.insert(f'scam_{i}', mh)
                new_minhashes[f'scam_{i}'] = mh
            except Exception:
                pass

    # ── Evaluate hybrid pipeline on test set (mirrors notebook) ──────────
    print("[RETRAIN] Evaluating hybrid pipeline on test set...")
    y_pred:  list[int]   = []
    y_proba: list[float] = []
    tier_hits = {'LSH': 0, 'NLP': 0}

    for msg in X_test:
        mh = MinHash(num_perm=num_perm)
        clean = ' '.join(msg.lower().split())
        for i in range(max(1, len(clean) - SHINGLE_SIZE + 1)):
            mh.update(clean[i:i + SHINGLE_SIZE].encode('utf8'))
        try:
            hits = new_lsh.query(mh)
        except Exception:
            hits = []
        if hits:
            y_pred.append(1)
            y_proba.append(0.99)
            tier_hits['LSH'] += 1
        else:
            p = classifier.predict_proba(vectorizer.transform([msg]))[0][1]
            y_proba.append(float(p))
            y_pred.append(1 if p > 0.7 else 0)
            tier_hits['NLP'] += 1

    print(f"[RETRAIN] LSH hits: {tier_hits['LSH']}  NLP hits: {tier_hits['NLP']}")

    # ── Compute metrics ───────────────────────────────────────────────────
    cm = confusion_matrix(y_test, y_pred).tolist()
    cr = classification_report(y_test, y_pred, output_dict=True)
    b  = getattr(new_lsh, '_b', model.b if model else 20)
    r  = getattr(new_lsh, '_r', model.r if model else 4)

    performance = {
        'performance_metrics': {
            'accuracy':                 round(accuracy_score(y_test, y_pred),                   4),
            'precision':                round(precision_score(y_test, y_pred, zero_division=0), 4),
            'recall':                   round(recall_score(y_test, y_pred, zero_division=0),    4),
            'f1_score':                 round(f1_score(y_test, y_pred, zero_division=0),        4),
            'auc_roc':                  round(roc_auc_score(y_test, y_proba),                   4),
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
            'bands_b':               b,
            'rows_per_band_r':       r,
            'lsh_threshold':         lsh_threshold,
            'minhash_shingle_size':  f'Character-based ({SHINGLE_SIZE}-gram)',
            'vocabulary_size_tfidf': len(vectorizer.vocabulary_),
            'avg_query_time_ms':     0.0,   # filled after model is patched below
        },
        'classification_report': cr,
    }

    # ── Backup current model before patching (enables rollback) ──────────
    if os.path.exists(MODEL_PATH):
        import shutil
        shutil.copy2(MODEL_PATH, MODEL_BACKUP_PATH)
        print(f"[RETRAIN] Backed up current model to {MODEL_BACKUP_PATH}")

    # ── Patch live model and save ─────────────────────────────────────────
    # If model is None (no .joblib on disk — e.g. fresh Render deploy),
    # create a new ScamStopEngine instance to hold the trained components.
    if model is None:
        print("[RETRAIN] No model in memory — creating new ScamStopEngine instance.")
        model = ScamStopEngine(
            lsh_threshold=lsh_threshold,
            num_perm=num_perm,
        )

    model.vectorizer       = vectorizer
    model.classifier       = classifier
    model.lsh              = new_lsh
    model.lsh_minhashes    = new_minhashes
    model.b                = b
    model.r                = r
    model.performance_data = None   # clear first so _measure_query_time uses new components
    cached_metrics         = None
    _cache_invalidate('metrics')

    # Now benchmark with the freshly patched model
    performance['lsh_configurations']['avg_query_time_ms'] = _measure_query_time(model)

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
        'scam_samples':    total_scam,
        'safe_samples':    total_safe,
        'keywords':        counts['keywords'],
        'reports':         counts['reports'],
        'csv_scam':        counts['csv_scam'],
        'safe_samples_db': counts['safe_samples'],
        'csv_safe':        counts['csv_safe'],
        'accuracy':        performance['performance_metrics']['accuracy'],
        'f1_score':        performance['performance_metrics']['f1_score'],
        'triggered_by':    triggered_by,
    })

    # NOTE: Training data is intentionally NOT purged so it accumulates
    # across retrains. Each retrain builds on all historical data.
    print("[RETRAIN] Training data retained for future retrains.")

    return True, 'Retrain completed successfully.', {
        'scam_samples':    total_scam,
        'safe_samples':    total_safe,
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
        retrain_status['message'] = ''   # clear previous error/success message

    success, message, stats = False, 'Unknown error during retrain.', {}
    try:
        success, message, stats = _do_retrain(triggered_by)
    except MemoryError:
        message = 'Out of memory — dataset too large. Reduce keywords or CSV samples and try again.'
        print(f"[RETRAIN] MemoryError: {message}")
    except Exception as e:
        import traceback
        message = str(e)
        print(f"[RETRAIN] Exception: {e}")
        print(traceback.format_exc())
    finally:
        # Always reset state — prevents stuck-on-loading regardless of what happened
        with retrain_lock:
            retrain_status.update({
                'state':    'success' if success else 'error',
                'message':  message,
                'last_run': datetime.datetime.utcnow().isoformat() + 'Z',
                **(stats if success else {}),
            })


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
        return True, 100.0, 'Keyword'
    if result.startswith("SCAM (Detected via LSH"):
        # Extract actual similarity if present, otherwise fall back to threshold
        sim_match = re.search(r'Similarity:\s*([\d.]+)%', result)
        if sim_match:
            return True, round(float(sim_match.group(1)), 2), "LSH"
        lsh_prob = round(model.lsh_threshold * 100) if model else 90.0
        return True, lsh_prob, "LSH"
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

    print(f"[DETECT] is_scam={is_scam} method={method} prob={prob} latency={latency:.4f}s msg={msg[:80]!r}")

    if not is_scam:
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
    try:
        vocab_size = len(model.vectorizer.vocabulary_) \
            if hasattr(model, 'vectorizer') and hasattr(model.vectorizer, 'vocabulary_') else '—'
    except Exception:
        vocab_size = '—'

    try:
        avg_query_ms = _measure_query_time(model)
    except Exception:
        avg_query_ms = 0.0

    live_lsh = {
        'hash_functions_k':      model.num_perm,
        'bands_b':               _lsh_b(model),
        'rows_per_band_r':       _lsh_r(model),
        'lsh_threshold':         model.lsh_threshold,
        'minhash_shingle_size':  f'Character-based ({SHINGLE_SIZE}-gram)',
        'vocabulary_size_tfidf': vocab_size,
        'avg_query_time_ms':     avg_query_ms,
    }

    if not cached_metrics:
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


@app.route('/api/train', methods=['POST'])
# @limiter.limit("3 per hour")
def trigger_initial_train():
    """
    Triggers an initial training run.
    Semantically distinct from /api/retrain — intended for first-time setup
    when no model has been trained yet. Logs triggered_by='initial' to Firestore.
    """
    with retrain_lock:
        if retrain_status['state'] == 'running':
            return jsonify({'error': 'Training already in progress.'}), 409
    threading.Thread(target=run_retrain, args=('initial',), daemon=True).start()
    return jsonify({'status': 'Initial training started.', 'message': 'Poll /api/retrain/status for updates.'})


@app.route('/api/retrain', methods=['POST'])
# @limiter.limit("3 per hour")
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


@app.route('/api/retrain/rollback', methods=['POST'])
def rollback_model():
    """Restore the model from the backup saved before the last retrain."""
    global model, cached_metrics

    if not os.path.exists(MODEL_BACKUP_PATH):
        return jsonify({'error': 'No backup found. A retrain must complete at least once before rollback is available.'}), 404

    with retrain_lock:
        if retrain_status['state'] == 'running':
            return jsonify({'error': 'Retrain in progress — cannot rollback now.'}), 409

    try:
        import shutil
        # Swap: move current → temp, backup → current, temp → backup
        # This way the backup becomes the previous-current for a re-rollback.
        tmp_path = MODEL_PATH + '.tmp'
        shutil.copy2(MODEL_PATH, tmp_path)
        shutil.copy2(MODEL_BACKUP_PATH, MODEL_PATH)
        shutil.move(tmp_path, MODEL_BACKUP_PATH)

        restored = load_model()
        if restored is None:
            # Undo the swap if load failed
            shutil.copy2(MODEL_BACKUP_PATH, MODEL_PATH)
            return jsonify({'error': 'Backup file exists but could not be loaded. Rollback aborted.'}), 500

        model          = restored
        cached_metrics = model.performance_data if hasattr(model, 'performance_data') else None
        _cache_invalidate('metrics')

        print("[ROLLBACK] Model restored from backup successfully.")
        return jsonify({
            'status':  'Rollback successful. Previous model is now active.',
            'has_metrics': cached_metrics is not None,
        })
    except Exception as e:
        print(f"[ROLLBACK] Failed: {e}")
        return jsonify({'error': f'Rollback failed: {str(e)}'}), 500


@app.route('/api/retrain/backup/status', methods=['GET'])
def backup_status():
    """Check whether a model backup exists and when it was last modified."""
    if not os.path.exists(MODEL_BACKUP_PATH):
        return jsonify({'backup_available': False})
    mtime = os.path.getmtime(MODEL_BACKUP_PATH)
    return jsonify({
        'backup_available': True,
        'backup_saved_at':  datetime.datetime.utcfromtimestamp(mtime).isoformat() + 'Z',
    })


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
    scam_count = _count_csv_lines(CSV_SCAM_PATH)
    safe_count = _count_csv_lines(CSV_SAFE_PATH)
    return jsonify({
        'csv_scam': scam_count,
        'csv_safe': safe_count,
        'total':    scam_count + safe_count,
    })


@app.route('/api/stats/flag', methods=['POST'])
def record_flag():
    return jsonify({'status': 'recorded'})


@app.route('/api/flag-scam', methods=['POST'])
@limiter.limit("30 per minute; 200 per hour")
def flag_scam():
    """
    User-initiated flag from the extension badge modal or detection log modal.
    Stores the message in the `user_flagged` Firestore collection so it is
    picked up as a SCAM training sample on the next retrain cycle.
    """
    data = request.get_json(silent=True) or {}
    text = (data.get('text') or data.get('message') or '').strip()
    url  = (data.get('url') or '').strip()

    if not text:
        return jsonify({'error': 'No text provided.'}), 400

    h = hashlib.sha256(text.encode('utf-8')).hexdigest()

    db.collection('user_flagged').document(h).set({
        'text':       text[:1000],
        'url':        url or None,
        'flagged_at': firestore.SERVER_TIMESTAMP,
        'label':      1,   # scam
    }, merge=True)   # merge=True deduplicates by hash

    # Also insert into the live MinHashLSH index immediately so similar messages
    # are caught by LSH (with real Jaccard similarity) before the next retrain cycle
    try:
        mh  = model._get_minhash(text)
        key = f'flagged_{h[:16]}'
        minhashes = getattr(model, 'lsh_minhashes', {})
        if key not in minhashes:
            model.lsh.insert(key, mh)
            minhashes[key] = mh
            model.lsh_minhashes = minhashes
    except Exception:
        pass

    return jsonify({'status': 'flagged', 'hash': h})


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

    return jsonify({
        'status':        'Report submitted successfully',
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
        'csv_scam_cached':     _count_csv_lines(CSV_SCAM_PATH),
        'csv_safe_cached':     _count_csv_lines(CSV_SAFE_PATH),
        'safe_samples_cached': _count_safe_samples(),
    })


@app.route('/api/model/status', methods=['GET'])
def model_status():
    """Model status endpoint — returns whether the model is loaded and ready."""
    model_file_exists = os.path.exists(MODEL_PATH)
    return jsonify({
        'model_exists':     model_file_exists and model is not None,
        'loaded':           model is not None,
        'status':           'ready' if model is not None else 'unavailable',
        'has_metrics':      cached_metrics is not None,
        'backup_available': os.path.exists(MODEL_BACKUP_PATH),
        'retrain_state':    retrain_status.get('state', 'idle'),
    })


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    debug = os.environ.get('FLASK_ENV', 'production') != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug)
