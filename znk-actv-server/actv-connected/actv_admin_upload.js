// 🎬 ACTV Admin API - Upload Videos & Manage Manifest
// npm install express multer aws-sdk fluent-ffmpeg mongoose

const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const ffmpeg = require('fluent-ffmpeg');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ========================================
// CONFIGURATION
// ========================================

const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
    region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CDN_URL = process.env.CDN_URL; // CloudFront ou votre CDN

// ========================================
// MODELS
// ========================================

const videoSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: String,
    filename: String,
    
    // Versions
    version: { type: Number, default: 1 },
    
    // Storage
    originalUrl: String,      // URL de la vidéo originale
    transcodedUrl: String,    // URL HLS/DASH
    downloadUrl: String,      // URL pour téléchargement (app Electron)
    thumbnailUrl: String,
    
    // Metadata
    duration: Number,         // en secondes
    size: Number,             // en bytes
    resolution: String,       // "1920x1080"
    codec: String,
    bitrate: Number,
    hash: String,             // SHA256 pour vérification intégrité
    
    // Categorization
    category: String,
    tags: [String],
    
    // Publishing
    status: { 
        type: String, 
        enum: ['uploading', 'processing', 'ready', 'published', 'archived'],
        default: 'uploading'
    },
    publishedAt: Date,
    
    // Access Control
    requiresSubscription: { type: Boolean, default: true },
    minSubscriptionTier: { 
        type: String, 
        enum: ['free', 'basic', 'premium', 'pro'],
        default: 'basic'
    },
    
    // Stats
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    
    // Studio
    studioId: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Video = mongoose.model('ACTVVideo', videoSchema);

const emissionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: String,
    type: String,
    
    // Video references
    videoId: { type: String, required: true },
    
    // Metadata
    duration: String,
    views: { type: Number, default: 0 },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    
    // Publishing
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published' },
    publishedAt: { type: Date, default: Date.now },
    
    version: { type: Number, default: 1 },
    updatedAt: { type: Date, default: Date.now }
});

const Emission = mongoose.model('Emission', emissionSchema);

// Manifest global (version actuelle)
const manifestSchema = new mongoose.Schema({
    version: { type: Number, required: true },
    videos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ACTVVideo' }],
    emissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Emission' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Manifest = mongoose.model('Manifest', manifestSchema);

// ========================================
// MULTER CONFIG (Upload temporaire)
// ========================================

const upload = multer({
    dest: '/tmp/uploads/',
    limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB max
});

// ========================================
// HELPER FUNCTIONS
// ========================================

// Calculer le hash d'un fichier
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = require('fs').createReadStream(filePath);
        
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

// Extraire les métadonnées vidéo avec FFmpeg
function extractVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            
            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            
            resolve({
                duration: metadata.format.duration,
                size: metadata.format.size,
                resolution: `${videoStream.width}x${videoStream.height}`,
                codec: videoStream.codec_name,
                bitrate: metadata.format.bit_rate
            });
        });
    });
}

// Upload vers S3
async function uploadToS3(filePath, key, contentType = 'video/mp4') {
    const fileContent = await fs.readFile(filePath);
    
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ACL: 'public-read'
    };
    
    const result = await s3.upload(params).promise();
    return result.Location;
}

// Transcoder en HLS
async function transcodeToHLS(inputPath, outputDir, videoId) {
    return new Promise((resolve, reject) => {
        const outputPath = path.join(outputDir, 'index.m3u8');
        
        ffmpeg(inputPath)
            .outputOptions([
                '-codec:v libx264',
                '-codec:a aac',
                '-hls_time 10',
                '-hls_list_size 0',
                '-f hls',
                '-hls_segment_filename', path.join(outputDir, 'segment_%03d.ts')
            ])
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', reject)
            .run();
    });
}

// Générer une miniature
async function generateThumbnail(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .screenshots({
                timestamps: ['10%'],
                filename: 'thumb.jpg',
                folder: path.dirname(outputPath),
                size: '1280x720'
            })
            .on('end', () => resolve(outputPath))
            .on('error', reject);
    });
}

// ========================================
// ROUTES - UPLOAD
// ========================================

// Upload une nouvelle vidéo
app.post('/admin/videos/upload', upload.single('video'), async (req, res) => {
    try {
        const { title, description, category, studioId } = req.body;
        const file = req.file;
        
        if (!file) {
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }
        
        console.log(`📤 Upload vidéo: ${title}`);
        
        // Générer ID unique
        const videoId = `video_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        
        // 1. Extraire les métadonnées
        const metadata = await extractVideoMetadata(file.path);
        console.log('✅ Métadonnées extraites');
        
        // 2. Calculer le hash
        const hash = await calculateFileHash(file.path);
        console.log('✅ Hash calculé');
        
        // 3. Upload vers S3 (vidéo originale)
        const originalKey = `videos/original/${videoId}.mp4`;
        const originalUrl = await uploadToS3(file.path, originalKey);
        console.log('✅ Vidéo uploadée vers S3');
        
        // 4. Générer la miniature
        const thumbPath = `/tmp/uploads/${videoId}_thumb.jpg`;
        await generateThumbnail(file.path, thumbPath);
        const thumbKey = `videos/thumbs/${videoId}.jpg`;
        const thumbnailUrl = await uploadToS3(thumbPath, thumbKey, 'image/jpeg');
        console.log('✅ Miniature générée');
        
        // 5. Créer l'entrée en DB
        const video = new Video({
            id: videoId,
            title,
            description,
            filename: file.originalname,
            category: category || 'general',
            
            originalUrl,
            downloadUrl: originalUrl, // Pour Electron
            thumbnailUrl,
            
            duration: Math.round(metadata.duration),
            size: metadata.size,
            resolution: metadata.resolution,
            codec: metadata.codec,
            bitrate: metadata.bitrate,
            hash,
            
            status: 'processing',
            studioId,
            uploadedBy: req.user?.id
        });
        
        await video.save();
        console.log('✅ Vidéo enregistrée en DB');
        
        // 6. Lancer le transcodage en arrière-plan
        transcodeVideoAsync(video, file.path);
        
        // 7. Mettre à jour le manifest
        await updateManifest();
        
        // Nettoyer les fichiers temporaires
        await fs.unlink(file.path).catch(() => {});
        await fs.unlink(thumbPath).catch(() => {});
        
        res.json({
            success: true,
            video: {
                id: video.id,
                title: video.title,
                status: video.status,
                thumbnailUrl: video.thumbnailUrl
            }
        });
        
    } catch (error) {
        console.error('❌ Erreur upload:', error);
        res.status(500).json({ error: 'Erreur lors de l\'upload' });
    }
});

// Transcodage asynchrone
async function transcodeVideoAsync(video, inputPath) {
    try {
        console.log(`🎬 Transcodage HLS: ${video.title}`);
        
        const outputDir = `/tmp/transcode/${video.id}`;
        await fs.mkdir(outputDir, { recursive: true });
        
        // Transcoder en HLS
        await transcodeToHLS(inputPath, outputDir, video.id);
        console.log('✅ Transcodage terminé');
        
        // Upload tous les segments HLS vers S3
        const files = await fs.readdir(outputDir);
        for (const file of files) {
            const filePath = path.join(outputDir, file);
            const key = `videos/hls/${video.id}/${file}`;
            await uploadToS3(filePath, key, 
                file.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T'
            );
        }
        
        // Mettre à jour la vidéo
        video.transcodedUrl = `${CDN_URL}/videos/hls/${video.id}/index.m3u8`;
        video.status = 'ready';
        await video.save();
        
        console.log(`✅ Vidéo prête: ${video.title}`);
        
        // Notifier les clients (WebSocket)
        // io.emit('video:ready', { videoId: video.id });
        
    } catch (error) {
        console.error(`❌ Erreur transcodage ${video.id}:`, error);
        video.status = 'error';
        await video.save();
    }
}

// ========================================
// ROUTES - MANAGEMENT
// ========================================

// Publier une vidéo
app.post('/admin/videos/:videoId/publish', async (req, res) => {
    try {
        const { videoId } = req.params;
        const video = await Video.findOne({ id: videoId });
        
        if (!video) {
            return res.status(404).json({ error: 'Vidéo non trouvée' });
        }
        
        if (video.status !== 'ready') {
            return res.status(400).json({ error: 'Vidéo pas encore prête' });
        }
        
        video.status = 'published';
        video.publishedAt = new Date();
        await video.save();
        
        // Mettre à jour le manifest
        await updateManifest();
        
        res.json({ success: true, video });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur publication' });
    }
});

// Créer une émission
app.post('/admin/emissions', async (req, res) => {
    try {
        const { title, description, type, videoId, duration, priority } = req.body;
        
        const emission = new Emission({
            id: `emission_${Date.now()}`,
            title,
            description,
            type,
            videoId,
            duration,
            priority: priority || 'medium'
        });
        
        await emission.save();
        
        // Mettre à jour le manifest
        await updateManifest();
        
        res.json({ success: true, emission });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur création émission' });
    }
});

// ========================================
// ROUTES - MANIFEST
// ========================================

// Obtenir le manifest actuel (pour les apps Electron)
app.get('/actv/manifest', async (req, res) => {
    try {
        // Récupérer le dernier manifest
        let manifest = await Manifest.findOne()
            .sort({ version: -1 })
            .populate('videos')
            .populate('emissions');
        
        if (!manifest) {
            manifest = await createInitialManifest();
        }
        
        // Formatter pour les apps
        const response = {
            version: manifest.version,
            lastUpdate: manifest.updatedAt,
            
            videos: manifest.videos
                .filter(v => v.status === 'published')
                .map(v => ({
                    id: v.id,
                    title: v.title,
                    description: v.description,
                    filename: v.filename,
                    
                    // URLs
                    streamUrl: v.transcodedUrl,      // Pour streaming online
                    downloadUrl: v.downloadUrl,       // Pour téléchargement Electron
                    thumbnailUrl: v.thumbnailUrl,
                    
                    // Metadata
                    duration: v.duration,
                    size: v.size,
                    resolution: v.resolution,
                    hash: v.hash,
                    
                    category: v.category,
                    tags: v.tags,
                    
                    requiresSubscription: v.requiresSubscription,
                    minSubscriptionTier: v.minSubscriptionTier,
                    
                    version: v.version,
                    publishedAt: v.publishedAt
                })),
            
            emissions: manifest.emissions.map(e => ({
                id: e.id,
                title: e.title,
                description: e.description,
                type: e.type,
                videoId: e.videoId,
                duration: e.duration,
                priority: e.priority,
                version: e.version,
                publishedAt: e.publishedAt
            }))
        };
        
        res.json(response);
        
    } catch (error) {
        console.error('Erreur manifest:', error);
        res.status(500).json({ error: 'Erreur récupération manifest' });
    }
});

// Mettre à jour le manifest (appelé après chaque changement)
async function updateManifest() {
    try {
        const videos = await Video.find({ status: 'published' });
        const emissions = await Emission.find({ status: 'published' });
        
        // Récupérer la dernière version
        const lastManifest = await Manifest.findOne().sort({ version: -1 });
        const newVersion = lastManifest ? lastManifest.version + 1 : 1;
        
        const manifest = new Manifest({
            version: newVersion,
            videos: videos.map(v => v._id),
            emissions: emissions.map(e => e._id),
            updatedAt: new Date()
        });
        
        await manifest.save();
        
        console.log(`✅ Manifest mis à jour: v${newVersion}`);
        
        // Notifier les apps connectées
        // io.emit('manifest:updated', { version: newVersion });
        
        return manifest;
        
    } catch (error) {
        console.error('Erreur update manifest:', error);
    }
}

// Créer le manifest initial
async function createInitialManifest() {
    const manifest = new Manifest({
        version: 1,
        videos: [],
        emissions: []
    });
    await manifest.save();
    return manifest;
}

// ========================================
// SERVER START
// ========================================

mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log('✅ MongoDB connecté');
    
    app.listen(3003, () => {
        console.log('🎬 ACTV Admin API sur le port 3003');
    });
});