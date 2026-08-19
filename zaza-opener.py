#!/usr/bin/env python3
"""
ZAZA Opener — petit serveur local pour ZAZADash.html

Reçoit des requêtes du dashboard (ouvert dans Safari) et lance des
applications ou ouvre des dossiers via la commande `open` de macOS.
Remplace l'app Raccourcis (peu fiable), aucune dépendance externe.

Lancement :
    python3 zaza-opener.py

Le serveur écoute uniquement sur 127.0.0.1:8765 (pas accessible
depuis l'extérieur de ta machine).

Pour qu'il démarre automatiquement à l'ouverture de session, tu peux
créer un LaunchAgent — demande-moi si tu veux ce script.
"""
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == '/ping':
            self.send_response(200)
            self._cors()
            self.end_headers()
            self.wfile.write(b'ok')
            return

        if parsed.path == '/open':
            app = qs.get('app', [None])[0]
            path = qs.get('path', [None])[0]
            try:
                if app:
                    subprocess.Popen(['open', '-a', app])
                elif path:
                    subprocess.Popen(['open', path])
                else:
                    raise ValueError('paramètre app ou path manquant')
                self.send_response(200)
                self._cors()
                self.end_headers()
                self.wfile.write(b'ok')
                print(f"[ZAZA Opener] ouvert -> app={app} path={path}")
            except Exception as e:
                self.send_response(500)
                self._cors()
                self.end_headers()
                self.wfile.write(str(e).encode())
                print(f"[ZAZA Opener] erreur -> {e}")
            return

        self.send_response(404)
        self._cors()
        self.end_headers()

    def log_message(self, format, *args):
        pass  # on log nous-mêmes dans do_GET


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f"✅ ZAZA Opener actif sur http://127.0.0.1:{PORT}")
    print("   Laisse cette fenêtre de Terminal ouverte, ou lance-le en arrière-plan.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 ZAZA Opener arrêté")
