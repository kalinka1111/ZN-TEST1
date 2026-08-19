"""
ZNK - Routes de synchronisation VPS (leçons + soumissions)
============================================================

À intégrer dans server.py existant.

Principe : PAS de P2P temps réel entre France et USA. On réutilise le pattern
offline-first déjà en place côté client (merge par id + updatedAt) : le VPS
est juste un point d'échange asynchrone, fiable, simple.

Protocole (symétrique pour lecons et soumissions) :
  - POST /api/v1/lecons/push        -> le prof pousse ses leçons (upsert conditionnel)
  - GET  /api/v1/lecons/pull        -> l'élève récupère les leçons plus récentes qu'une date
  - POST /api/v1/soumissions/push   -> l'élève pousse ses devoirs
  - GET  /api/v1/soumissions/pull   -> le prof récupère les soumissions plus récentes

Règle d'upsert : on n'écrase une ligne existante QUE SI l'updatedAt entrant est
strictement plus récent -> c'est le même principe que le merge-by-id déjà en
place côté client (localStorage), donc aucune surprise de comportement.

Intégration dans server.py :
    from znk_sync_routes import register_sync_routes
    register_sync_routes(app, require_api_key)   # réutilise ton décorateur existant
"""

import sqlite3
import uuid
import json
from datetime import datetime, timezone
from pathlib import Path
from flask import request, jsonify

DB_PATH = Path(__file__).parent / "znk_sync.db"


# ----------------------------------------------------------------------
# Horodatage : on utilise partout des dates ISO texte (ex:
# "2026-07-23T02:15:00.000Z"), exactement le format produit par
# `new Date().toISOString()` côté client (ZNKManifest). Comparer ces
# chaînes lexicographiquement donne le même ordre que les comparer comme
# des dates -> pas besoin de les convertir en nombre nulle part.
# ----------------------------------------------------------------------
def _now_iso():
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


# ----------------------------------------------------------------------
# Initialisation DB (SQLite : suffisant pour ce volume, zéro dépendance
# externe à gérer sur le VPS, fichier facile à sauvegarder/backup)
# ----------------------------------------------------------------------
def _get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_sync_db():
    conn = _get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS lecons (
            id TEXT PRIMARY KEY,
            prof_id TEXT NOT NULL,
            niveau_groupe TEXT,
            contenu TEXT NOT NULL,      -- JSON complet de la leçon (titre, blocs, etc.)
            updated_at TEXT NOT NULL   -- date ISO texte, ex "2026-07-23T02:15:00.000Z"
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS soumissions (
            id TEXT PRIMARY KEY,
            lecon_id TEXT NOT NULL,
            prof_id TEXT NOT NULL,
            eleve_id TEXT NOT NULL,
            contenu TEXT NOT NULL,      -- JSON complet de la soumission
            updated_at TEXT NOT NULL   -- date ISO texte
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_lecons_prof ON lecons(prof_id, updated_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_soum_prof ON soumissions(prof_id, updated_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_soum_eleve ON soumissions(eleve_id, updated_at)")
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------
# Upsert générique : n'écrase que si updated_at entrant > updated_at stocké
# ----------------------------------------------------------------------
def _upsert(conn, table, row_id, updated_at, fields: dict):
    existing = conn.execute(
        f"SELECT updated_at FROM {table} WHERE id = ?", (row_id,)
    ).fetchone()

    if existing is None:
        cols = ["id", "updated_at"] + list(fields.keys())
        placeholders = ", ".join(["?"] * len(cols))
        values = [row_id, updated_at] + list(fields.values())
        conn.execute(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders})", values)
        return "inserted"

    if updated_at > existing["updated_at"]:
        set_clause = ", ".join([f"{k} = ?" for k in fields.keys()]) + ", updated_at = ?"
        values = list(fields.values()) + [updated_at, row_id]
        conn.execute(f"UPDATE {table} SET {set_clause} WHERE id = ?", values)
        return "updated"

    return "skipped"  # version distante plus ancienne, on ne touche à rien


def register_sync_routes(app, require_api_key):
    """
    require_api_key : le décorateur déjà présent dans server.py
    (celui utilisé pour znkFetch()). On le réutilise ici tel quel.
    """
    init_sync_db()

    # ------------------------------------------------------------------
    # LEÇONS
    # ------------------------------------------------------------------
    @app.route("/api/v1/lecons/push", methods=["POST"])
    @require_api_key
    def push_lecons():
        data = request.get_json(silent=True) or {}
        prof_id = data.get("profId")
        lecons = data.get("lecons", [])

        if not prof_id or not isinstance(lecons, list):
            return jsonify({"error": "profId et lecons[] requis"}), 400

        conn = _get_db()
        results = {"inserted": 0, "updated": 0, "skipped": 0}
        for lecon in lecons:
            lecon_id = lecon.get("id") or str(uuid.uuid4())
            updated_at = lecon.get("updatedAt") or _now_iso()
            status = _upsert(conn, "lecons", lecon_id, updated_at, {
                "prof_id": prof_id,
                "niveau_groupe": lecon.get("niveauGroupe"),
                "contenu": json.dumps(lecon, ensure_ascii=False),
            })
            results[status] += 1
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "results": results})

    @app.route("/api/v1/lecons/pull", methods=["GET"])
    @require_api_key
    def pull_lecons():
        prof_id = request.args.get("profId")
        since = request.args.get("since", "")  # "" = jamais synchronisé -> tout récupérer

        if not prof_id:
            return jsonify({"error": "profId requis"}), 400

        conn = _get_db()
        rows = conn.execute(
            "SELECT id, contenu, updated_at FROM lecons WHERE prof_id = ? AND updated_at > ? ORDER BY updated_at ASC",
            (prof_id, since)
        ).fetchall()
        conn.close()

        lecons = [json.loads(r["contenu"]) for r in rows]
        server_now = _now_iso()
        return jsonify({"ok": True, "lecons": lecons, "serverTime": server_now})

    # ------------------------------------------------------------------
    # SOUMISSIONS (devoirs rendus par l'élève)
    # ------------------------------------------------------------------
    @app.route("/api/v1/soumissions/push", methods=["POST"])
    @require_api_key
    def push_soumissions():
        data = request.get_json(silent=True) or {}
        eleve_id = data.get("eleveId")
        prof_id = data.get("profId")
        soumissions = data.get("soumissions", [])

        if not eleve_id or not prof_id or not isinstance(soumissions, list):
            return jsonify({"error": "eleveId, profId et soumissions[] requis"}), 400

        conn = _get_db()
        results = {"inserted": 0, "updated": 0, "skipped": 0}
        for soum in soumissions:
            soum_id = soum.get("id") or str(uuid.uuid4())
            updated_at = soum.get("updatedAt") or _now_iso()
            status = _upsert(conn, "soumissions", soum_id, updated_at, {
                "lecon_id": soum.get("leconId"),
                "prof_id": prof_id,
                "eleve_id": eleve_id,
                "contenu": json.dumps(soum, ensure_ascii=False),
            })
            results[status] += 1
        conn.commit()
        conn.close()
        return jsonify({"ok": True, "results": results})

    @app.route("/api/v1/soumissions/pull", methods=["GET"])
    @require_api_key
    def pull_soumissions():
        prof_id = request.args.get("profId")
        since = request.args.get("since", "")  # "" = jamais synchronisé -> tout récupérer

        if not prof_id:
            return jsonify({"error": "profId requis"}), 400

        conn = _get_db()
        rows = conn.execute(
            "SELECT id, contenu, updated_at FROM soumissions WHERE prof_id = ? AND updated_at > ? ORDER BY updated_at ASC",
            (prof_id, since)
        ).fetchall()
        conn.close()

        soumissions = [json.loads(r["contenu"]) for r in rows]
        server_now = _now_iso()
        return jsonify({"ok": True, "soumissions": soumissions, "serverTime": server_now})

    return app
