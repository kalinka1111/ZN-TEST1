/**
 * ZNK — Service Worker générique pour les hubs exportés par AdminHubCreator.
 * ---------------------------------------------------------------------
 * Un seul fichier, partagé par tous les hubs (hub-etudes.html,
 * hub-detente.html, hub-studio.html...) placés dans le même dossier.
 * Rien à modifier ici quand tu ajoutes un nouveau hub : il n'y a pas de
 * liste de fichiers à précacher à la main, tout se cache automatiquement
 * au fur et à mesure de la navigation.
 *
 * Stratégies utilisées :
 * - Pages HTML (navigation) : réseau en priorité, secours sur le cache
 *   si hors-ligne → toujours la version la plus fraîche quand il y a du
 *   réseau, mais ça continue de marcher sans réseau.
 * - Fichiers statiques same-origin (JS/CSS/JSON/images/manifests) :
 *   cache d'abord (rapide, marche hors-ligne immédiatement), avec une
 *   mise à jour silencieuse en arrière-plan pour la prochaine visite.
 * - Tout le reste (autre domaine, ex. CDN externe) : laissé tel quel,
 *   pas mis en cache.
 *
 * Pour forcer une mise à jour de tous les hubs après une modif (ex. tu
 * changes un fichier manifest JS des leçons), incrémente juste CACHE_VERSION.
 */

const CACHE_VERSION = 'znk-hub-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_VERSION)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne touche qu'aux requêtes GET same-origin — le reste (POST,
  // domaines externes, API du futur VPS...) passe directement au réseau.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) {
    return;
  }

  // Navigation (ouverture d'un hub, retour arrière, etc.) : réseau
  // d'abord pour avoir la dernière version publiée, cache en secours.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Fichiers statiques : cache d'abord pour la vitesse + le hors-ligne,
  // avec rafraîchissement silencieux en arrière-plan.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
