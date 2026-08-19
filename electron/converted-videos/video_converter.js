// video-converter.js - Script de conversion vidéo pour ZNK237
// Installation requise : npm install fluent-ffmpeg

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

// Configuration
const CONFIG = {
  inputDir: './videos_source',      // Dossier des vidéos à convertir
  outputDir: './assets/videos',     // Dossier de sortie (pour Electron)
  
  // Profils de compression
  profiles: {
    light: {
      videoBitrate: '1500k',
      audioBitrate: '96k',
      resolution: '1280x720',
      fps: 24,
      crf: 26
    },
    medium: {
      videoBitrate: '2500k',
      audioBitrate: '128k',
      resolution: '1920x1080',
      fps: 30,
      crf: 23
    },
    high: {
      videoBitrate: '4000k',
      audioBitrate: '192k',
      resolution: '1920x1080',
      fps: 30,
      crf: 20
    }
  }
};

// Création des dossiers si nécessaire
if (!fs.existsSync(CONFIG.inputDir)) fs.mkdirSync(CONFIG.inputDir, { recursive: true });
if (!fs.existsSync(CONFIG.outputDir)) fs.mkdirSync(CONFIG.outputDir, { recursive: true });

/**
 * Convertit une vidéo au format optimisé MP4 H.264
 */
function convertVideo(inputFile, profile = 'light', options = {}) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(CONFIG.inputDir, inputFile);
    const outputFileName = path.basename(inputFile, path.extname(inputFile)) + '.mp4';
    const outputPath = path.join(CONFIG.outputDir, outputFileName);
    
    const settings = CONFIG.profiles[profile];
    
    console.log(`\n🔄 Conversion: ${inputFile}`);
    console.log(`📊 Profil: ${profile.toUpperCase()}`);
    console.log(`💾 Sortie: ${outputPath}`);
    
    const startTime = Date.now();
    
    ffmpeg(inputPath)
      // Codec vidéo H.264
      .videoCodec('libx264')
      .videoBitrate(settings.videoBitrate)
      .fps(settings.fps)
      
      // Qualité CRF (Constant Rate Factor) - plus bas = meilleure qualité
      .outputOptions([
        `-crf ${settings.crf}`,
        '-preset medium',           // Balance vitesse/qualité
        '-profile:v main',          // Profil compatible
        '-level 4.0',               // Niveau de compatibilité
        '-movflags +faststart',     // Optimisation streaming
        '-pix_fmt yuv420p'          // Format pixel universel
      ])
      
      // Résolution
      .size(options.resolution || settings.resolution)
      
      // Codec audio AAC
      .audioCodec('aac')
      .audioBitrate(settings.audioBitrate)
      .audioChannels(2)
      .audioFrequency(44100)
      
      // Progression
      .on('start', (cmd) => {
        console.log('⚙️  Commande FFmpeg:', cmd);
      })
      .on('progress', (progress) => {
        const percent = progress.percent ? progress.percent.toFixed(1) : '0.0';
        process.stdout.write(`\r⏳ Progression: ${percent}%`);
      })
      .on('end', () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        const inputSize = (fs.statSync(inputPath).size / (1024 * 1024)).toFixed(2);
        const outputSize = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
        const reduction = (((inputSize - outputSize) / inputSize) * 100).toFixed(1);
        
        console.log(`\n✅ Terminé en ${duration}s`);
        console.log(`📦 Taille: ${inputSize}MB → ${outputSize}MB (-${reduction}%)`);
        
        resolve({
          success: true,
          inputFile,
          outputFile: outputFileName,
          outputPath,
          inputSize: parseFloat(inputSize),
          outputSize: parseFloat(outputSize),
          reduction: parseFloat(reduction),
          duration: parseFloat(duration)
        });
      })
      .on('error', (err) => {
        console.error('\n❌ Erreur:', err.message);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Convertit toutes les vidéos d'un dossier
 */
async function convertAllVideos(profile = 'light') {
  console.log('\n🎬 ZNK237 VIDEO CONVERTER');
  console.log('==========================\n');
  
  const files = fs.readdirSync(CONFIG.inputDir)
    .filter(f => /\.(mp4|mov|avi|mkv|webm|flv)$/i.test(f));
  
  if (files.length === 0) {
    console.log(`⚠️  Aucune vidéo trouvée dans ${CONFIG.inputDir}`);
    console.log(`💡 Placez vos vidéos dans ce dossier et relancez le script.`);
    return;
  }
  
  console.log(`📹 ${files.length} vidéo(s) trouvée(s)`);
  console.log(`🎯 Profil: ${profile.toUpperCase()}\n`);
  
  const results = [];
  let totalInputSize = 0;
  let totalOutputSize = 0;
  
  for (let i = 0; i < files.length; i++) {
    console.log(`\n[${i + 1}/${files.length}] ${files[i]}`);
    console.log('─'.repeat(60));
    
    try {
      const result = await convertVideo(files[i], profile);
      results.push(result);
      totalInputSize += result.inputSize;
      totalOutputSize += result.outputSize;
    } catch (err) {
      results.push({
        success: false,
        inputFile: files[i],
        error: err.message
      });
    }
  }
  
  // Rapport final
  console.log('\n\n📊 RAPPORT DE CONVERSION');
  console.log('==========================\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Réussies: ${successful.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`❌ Échouées: ${failed.length}`);
    failed.forEach(f => console.log(`   - ${f.inputFile}: ${f.error}`));
  }
  
  if (successful.length > 0) {
    const totalReduction = (((totalInputSize - totalOutputSize) / totalInputSize) * 100).toFixed(1);
    console.log(`\n💾 Taille totale: ${totalInputSize.toFixed(2)}MB → ${totalOutputSize.toFixed(2)}MB`);
    console.log(`📉 Réduction: ${totalReduction}%`);
    console.log(`\n📁 Vidéos converties dans: ${CONFIG.outputDir}`);
  }
  
  // Génération du manifest
  generateManifest(successful);
}

/**
 * Génère un manifest JSON des vidéos converties
 */
function generateManifest(videos) {
  const manifest = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalVideos: videos.length,
    videos: videos.map((v, idx) => ({
      id: `video_${idx + 1}`,
      filename: v.outputFile,
      path: `./assets/videos/${v.outputFile}`,
      size: v.outputSize,
      optimized: true
    }))
  };
  
  const manifestPath = path.join(CONFIG.outputDir, 'videos-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📋 Manifest généré: ${manifestPath}`);
}

/**
 * Analyse une vidéo (dimensions, durée, codec)
 */
function analyzeVideo(filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(CONFIG.inputDir, filename);
    
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
      
      resolve({
        filename,
        duration: metadata.format.duration,
        size: (metadata.format.size / (1024 * 1024)).toFixed(2),
        bitrate: Math.round(metadata.format.bit_rate / 1000),
        video: videoStream ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: eval(videoStream.r_frame_rate)
        } : null,
        audio: audioStream ? {
          codec: audioStream.codec_name,
          channels: audioStream.channels,
          sampleRate: audioStream.sample_rate
        } : null
      });
    });
  });
}

// ============================================
// CLI Interface
// ============================================

const args = process.argv.slice(2);
const command = args[0];

if (command === 'convert') {
  const profile = args[1] || 'light';
  convertAllVideos(profile);
  
} else if (command === 'analyze') {
  const filename = args[1];
  if (!filename) {
    console.log('❌ Usage: node video-converter.js analyze <filename>');
    process.exit(1);
  }
  
  analyzeVideo(filename)
    .then(info => {
      console.log('\n📹 ANALYSE VIDÉO');
      console.log('================\n');
      console.log(JSON.stringify(info, null, 2));
    })
    .catch(err => console.error('❌ Erreur:', err.message));
  
} else {
  console.log(`
🎬 ZNK237 VIDEO CONVERTER
========================

Usage:
  node video-converter.js convert [profile]    Convertir toutes les vidéos
  node video-converter.js analyze <filename>   Analyser une vidéo

Profils disponibles:
  light   - 720p, 24fps, 1.5Mbps (Recommandé pour RAM limitée)
  medium  - 1080p, 30fps, 2.5Mbps (Défaut)
  high    - 1080p, 30fps, 4Mbps

Exemples:
  node video-converter.js convert light
  node video-converter.js convert medium
  node video-converter.js analyze mon-video.mov

Configuration:
  Dossier source: ${CONFIG.inputDir}
  Dossier sortie: ${CONFIG.outputDir}
  `);
}

module.exports = { convertVideo, convertAllVideos, analyzeVideo };