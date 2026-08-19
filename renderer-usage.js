// Dans votre fichier JavaScript côté renderer (index.html, app.js, etc.)

// ========== EXEMPLE 1 : CHARGER TOUTES LES VIDÉOS ==========

async function loadAllVideos() {
  try {
    const videos = await window.znkAPI.videos.getAll();
    console.log('📹 Vidéos chargées:', videos);
    
    // Afficher les vidéos dans l'UI
    displayVideos(videos);
  } catch (error) {
    console.error('Erreur chargement vidéos:', error);
  }
}

function displayVideos(videos) {
  const container = document.getElementById('video-list');
  container.innerHTML = '';
  
  videos.forEach(video => {
    const videoCard = `
      <div class="video-card" data-id="${video.id}">
        <img src="${video.thumbnail}" alt="${video.name}">
        <h3>${video.name}</h3>
        <p>${video.duration}</p>
        <button onclick="playVideo('${video.id}')">▶ Play</button>
        <button onclick="deleteVideo('${video.id}')">🗑️</button>
      </div>
    `;
    container.innerHTML += videoCard;
  });
}


// ========== EXEMPLE 2 : AJOUTER UNE VIDÉO ==========

async function addNewVideo(file) {
  try {
    // Copier le fichier vers le dossier utilisateur
    const userPath = await window.znkAPI.videos.copy(
      file.path, 
      `video_${Date.now()}_${file.name}`
    );
    
    if (!userPath) {
      throw new Error('Échec copie fichier');
    }
    
    // Créer l'entrée dans le manifest
    const videoData = {
      id: `video_${Date.now()}`,
      name: file.name,
      path: userPath,
      thumbnail: await generateThumbnail(userPath),
      duration: await getVideoDuration(userPath),
      addedAt: new Date().toISOString()
    };
    
    const updatedVideos = await window.znkAPI.videos.add(videoData);
    console.log('✅ Vidéo ajoutée:', videoData);
    
    // Rafraîchir l'affichage
    displayVideos(updatedVideos);
    
  } catch (error) {
    console.error('❌ Erreur ajout vidéo:', error);
    alert('Erreur lors de l\'ajout de la vidéo');
  }
}


// ========== EXEMPLE 3 : SUPPRIMER UNE VIDÉO ==========

async function deleteVideo(videoId) {
  if (!confirm('Supprimer cette vidéo ?')) return;
  
  try {
    const updatedVideos = await window.znkAPI.videos.remove(videoId);
    console.log('🗑️ Vidéo supprimée:', videoId);
    
    displayVideos(updatedVideos);
  } catch (error) {
    console.error('Erreur suppression:', error);
  }
}


// ========== EXEMPLE 4 : GÉRER LES ICÔNES ==========

async function loadCustomIcons() {
  const icons = await window.znkAPI.icons.getAll();
  
  icons.forEach(icon => {
    const btn = document.querySelector(`[data-module="${icon.moduleId}"]`);
    if (btn) {
      btn.style.backgroundImage = `url("${icon.path}")`;
    }
  });
}

async function changeModuleIcon(moduleId, iconFile) {
  try {
    // Copier l'icône
    const iconPath = await window.znkAPI.icons.copy(
      iconFile.path,
      `icon_${moduleId}_${Date.now()}.png`
    );
    
    // Sauvegarder dans le manifest
    await window.znkAPI.icons.add({
      id: `icon_${Date.now()}`,
      moduleId: moduleId,
      path: iconPath,
      originalName: iconFile.name
    });
    
    console.log('✅ Icône changée pour module:', moduleId);
    
    // Recharger les icônes
    loadCustomIcons();
    
  } catch (error) {
    console.error('Erreur changement icône:', error);
  }
}


// ========== EXEMPLE 5 : GÉRER LA MUSIQUE ==========

async function loadPlaylist() {
  const songs = await window.znkAPI.music.getAll();
  
  const playlist = document.getElementById('playlist');
  playlist.innerHTML = songs.map(song => `
    <div class="song-item" data-id="${song.id}">
      <span>${song.title}</span>
      <span>${song.artist}</span>
      <span>${song.duration}</span>
      <button onclick="playSong('${song.path}')">▶</button>
    </div>
  `).join('');
}

async function addSongToLibrary(audioFile) {
  const songPath = await window.znkAPI.music.copy(
    audioFile.path,
    `music_${Date.now()}_${audioFile.name}`
  );
  
  await window.znkAPI.music.add({
    id: `song_${Date.now()}`,
    title: audioFile.name.replace(/\.[^/.]+$/, ''),
    path: songPath,
    addedAt: new Date().toISOString()
  });
  
  loadPlaylist();
}


// ========== EXEMPLE 6 : UTILITAIRES ==========

// Obtenir les chemins des dossiers
async function showStoragePaths() {
  const paths = await window.znkAPI.manifest.getPaths();
  console.log('📁 Dossiers de stockage:', paths);
  
  alert(`
    Dossier utilisateur: ${paths.userData}
    Vidéos: ${paths.videos}
    Musique: ${paths.music}
    Icônes: ${paths.icons}
  `);
}

// Nettoyer les entrées orphelines
async function cleanDatabase() {
  await window.znkAPI.manifest.clean('videos');
  await window.znkAPI.manifest.clean('music');
  await window.znkAPI.manifest.clean('icons');
  
  console.log('🧹 Base de données nettoyée');
}

// Exporter toutes les données
async function exportData() {
  const exportPath = '/path/to/export/folder';
  const success = await window.znkAPI.manifest.export(exportPath);
  
  if (success) {
    alert('✅ Données exportées avec succès !');
  }
}


// ========== INITIALISATION AU CHARGEMENT ==========

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 ZNK App chargée');
  
  // Charger toutes les données
  await loadAllVideos();
  await loadPlaylist();
  await loadCustomIcons();
  
  // Afficher les chemins de stockage
  const paths = await window.znkAPI.manifest.getPaths();
  console.log('📁 Stockage initialisé:', paths);
});


// ========== GESTION DES FICHIERS DRAG & DROP ==========

const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  
  const files = Array.from(e.dataTransfer.files);
  
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (['mp4', 'avi', 'mkv', 'mov'].includes(ext)) {
      await addNewVideo(file);
    } else if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) {
      await addSongToLibrary(file);
    } else if (['png', 'jpg', 'jpeg', 'svg'].includes(ext)) {
      // Gérer les icônes
      console.log('Icône détectée:', file.name);
    }
  }
});