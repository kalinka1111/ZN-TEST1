/**
 * ZNK Admin Diagnostic — panneau flottant de diagnostic Electron
 * ------------------------------------------------------------
 * Usage : ajoute simplement, avant </body>, sur n'importe quelle page :
 *   <script src="./znk-admin-diagnostic.js"></script>
 * (adapte le chemin relatif selon où se trouve ce fichier par rapport à la page)
 *
 * Il crée une petite bulle 🔍 en bas à droite. Clic dessus = ouvre/ferme
 * le panneau de diagnostic. Rien ne s'affiche automatiquement en plein
 * écran : ça reste discret tant qu'on ne clique pas dessus.
 *
 * Pour l'activer uniquement en mode admin/dev, tu peux soit :
 *  - ne charger ce script que depuis les pages admin,
 *  - soit décommenter le bloc "GATE" plus bas et le conditionner à
 *    window.electronAPI.isDevMode() (si electronAPI est dispo).
 */
(function () {
    if (document.getElementById('znk-diag-bubble')) return; // évite doublon

    const style = document.createElement('style');
    style.textContent = `
        #znk-diag-bubble {
            position: fixed; bottom: 18px; right: 18px; z-index: 999999;
            width: 44px; height: 44px; border-radius: 50%;
            background: rgba(20,20,20,0.85); color: #fff;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.4);
            font-family: monospace; user-select: none;
        }
        #znk-diag-panel {
            position: fixed; bottom: 70px; right: 18px; z-index: 999999;
            width: 340px; max-height: 60vh; overflow: auto;
            background: rgba(15,15,15,0.95); color: #d7ffd7;
            border-radius: 10px; padding: 14px; font-family: monospace;
            font-size: 12px; line-height: 1.6; box-shadow: 0 6px 20px rgba(0,0,0,0.5);
            display: none;
        }
        #znk-diag-panel.open { display: block; }
        #znk-diag-panel h4 { color: #9ef0c8; margin-bottom: 8px; font-size: 13px; }
        #znk-diag-panel .row { display:flex; justify-content:space-between; gap:8px; border-bottom:1px solid rgba(255,255,255,0.08); padding:3px 0; }
        #znk-diag-panel .ok { color:#9ef0c8; }
        #znk-diag-panel .bad { color:#ff9d9d; }
        #znk-diag-panel .refresh { margin-top:8px; width:100%; padding:6px; background:#2a2a2a; color:#fff; border:none; border-radius:6px; cursor:pointer; }
    `;
    document.head.appendChild(style);

    const bubble = document.createElement('div');
    bubble.id = 'znk-diag-bubble';
    bubble.textContent = '🔍';
    document.body.appendChild(bubble);

    const panel = document.createElement('div');
    panel.id = 'znk-diag-panel';
    document.body.appendChild(panel);

    function check(label, value) {
        const isGood = value && value !== 'undefined' && value !== '❌';
        return `<div class="row"><span>${label}</span><span class="${isGood ? 'ok' : 'bad'}">${value}</span></div>`;
    }

    function render() {
        const api = window.electronAPI || window.znkApi || null;
        const rows = [
            ['Page (location)', window.location.pathname.split('/').slice(-2).join('/')],
            ['Electron (UA)', /Electron/i.test(navigator.userAgent) ? '✅ oui' : '❌ non'],
            ['window.electronAPI', typeof window.electronAPI],
            ['window.znkApi', typeof window.znkApi],
            ['window.znkManifest', typeof window.znkManifest],
            ['window.require', typeof window.require],
            ['api.selectFiles', typeof (api && api.selectFiles)],
            ['api.convertVideo', typeof (api && api.convertVideo)],
            ['api.makeVideoPersistent', typeof (api && api.makeVideoPersistent)],
            ['api.getVideoUrl', typeof (api && api.getVideoUrl)],
            ['api.terminalExecute', typeof (api && api.terminalExecute)],
            ['api.transcribeAudio', typeof (api && api.transcribeAudio)],
        ];
        panel.innerHTML =
            '<h4>🔍 Diagnostic ZNK (admin)</h4>' +
            rows.map(r => check(r[0], r[1])).join('') +
            '<button class="refresh" id="znk-diag-refresh">🔄 Rafraîchir</button>';
        const btn = document.getElementById('znk-diag-refresh');
        if (btn) btn.onclick = render;
    }

    bubble.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) render();
    });
})();
