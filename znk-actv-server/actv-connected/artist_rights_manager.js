// 🎤 ZNK Artists & Rights Management System
// npm install express mongoose

const express = require('express');
const mongoose = require('mongoose');
const app = express();
app.use(express.json());

// ========================================
// MODELS
// ========================================

// Artist Schema
const artistSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    stageName: String,
    avatar: String,
    bio: String,
    
    // Contact
    email: String,
    phone: String,
    
    // Social
    socials: {
        instagram: String,
        twitter: String,
        youtube: String,
        spotify: String
    },
    
    // Copyright Configuration (droits par défaut)
    defaultRights: {
        performance: { type: Boolean, default: true },      // Droit d'interprétation
        reproduction: { type: Boolean, default: false },    // Droit de reproduction
        streaming: { type: Boolean, default: true },        // Droit de diffusion streaming
        download: { type: Boolean, default: false },        // Téléchargement autorisé
        commercial: { type: Boolean, default: false },      // Usage commercial
        sync: { type: Boolean, default: false },            // Synchronisation (montages)
        publicPerformance: { type: Boolean, default: true }, // Performance publique
        broadcast: { type: Boolean, default: true }         // Diffusion TV/Radio
    },
    
    // Royalty Settings (pour monétisation future)
    royalties: {
        enabled: { type: Boolean, default: false },
        percentage: { type: Number, default: 0 },           // % des revenus
        paymentMethod: String,                              // 'stripe', 'paypal', 'bank'
        paymentDetails: Object
    },
    
    // Contract Info
    contract: {
        signed: { type: Boolean, default: false },
        signedAt: Date,
        expiresAt: Date,
        type: String,                                       // 'exclusive', 'non-exclusive', 'single-project'
        documentUrl: String
    },
    
    // Stats
    stats: {
        totalVideos: { type: Number, default: 0 },
        totalViews: { type: Number, default: 0 },
        totalRevenue: { type: Number, default: 0 }
    },
    
    // Meta
    status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'active' },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Artist = mongoose.model('Artist', artistSchema);

// Video-Artist Relationship (pour tracking des droits par vidéo)
const videoArtistSchema = new mongoose.Schema({
    videoId: { type: String, required: true },
    artistId: { type: String, required: true },
    
    // Rôle dans la vidéo
    role: { 
        type: String, 
        enum: ['featured', 'composer', 'producer', 'lyricist', 'performer', 'director'],
        default: 'featured'
    },
    
    // Droits spécifiques pour CETTE vidéo (override les droits par défaut)
    rights: {
        performance: Boolean,
        reproduction: Boolean,
        streaming: Boolean,
        download: Boolean,
        commercial: Boolean,
        sync: Boolean,
        publicPerformance: Boolean,
        broadcast: Boolean
    },
    
    // Split des revenus pour cette vidéo
    revenueShare: { type: Number, default: 0 }, // Pourcentage
    
    // Dates d'autorisation
    authorizedFrom: { type: Date, default: Date.now },
    authorizedUntil: Date,                      // null = indéfini
    
    // Approbation
    approved: { type: Boolean, default: false },
    approvedAt: Date,
    approvedBy: String,
    
    createdAt: { type: Date, default: Date.now }
});

const VideoArtist = mongoose.model('VideoArtist', videoArtistSchema);

// Copyright Claim (pour gérer les réclamations)
const copyrightClaimSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    videoId: { type: String, required: true },
    artistId: { type: String, required: true },
    
    type: { 
        type: String, 
        enum: ['unauthorized-use', 'missing-credit', 'wrong-rights', 'revenue-dispute'],
        required: true
    },
    
    description: String,
    status: { 
        type: String, 
        enum: ['pending', 'investigating', 'resolved', 'rejected'],
        default: 'pending'
    },
    
    resolution: String,
    resolvedAt: Date,
    resolvedBy: String,
    
    createdAt: { type: Date, default: Date.now }
});

const CopyrightClaim = mongoose.model('CopyrightClaim', copyrightClaimSchema);

// Rights Template (modèles de droits pré-configurés)
const rightsTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    
    rights: {
        performance: Boolean,
        reproduction: Boolean,
        streaming: Boolean,
        download: Boolean,
        commercial: Boolean,
        sync: Boolean,
        publicPerformance: Boolean,
        broadcast: Boolean
    },
    
    // Conditions
    conditions: [String],
    
    createdAt: { type: Date, default: Date.now }
});

const RightsTemplate = mongoose.model('RightsTemplate', rightsTemplateSchema);

// ========================================
// ROUTES - ARTISTS
// ========================================

// Créer un artiste
app.post('/admin/artists', async (req, res) => {
    try {
        const { name, stageName, email, avatar, defaultRights } = req.body;
        
        const artist = new Artist({
            id: `artist_${Date.now()}`,
            name,
            stageName: stageName || name,
            email,
            avatar: avatar || '🎤',
            defaultRights: defaultRights || {}
        });
        
        await artist.save();
        
        res.json({ success: true, artist });
        
    } catch (error) {
        console.error('Erreur création artiste:', error);
        res.status(500).json({ error: 'Erreur création artiste' });
    }
});

// Lister tous les artistes
app.get('/admin/artists', async (req, res) => {
    try {
        const artists = await Artist.find({ status: 'active' })
            .sort({ name: 1 });
        
        res.json({ artists });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur récupération artistes' });
    }
});

// Obtenir un artiste
app.get('/admin/artists/:artistId', async (req, res) => {
    try {
        const artist = await Artist.findOne({ id: req.params.artistId });
        
        if (!artist) {
            return res.status(404).json({ error: 'Artiste non trouvé' });
        }
        
        // Charger les vidéos de l'artiste
        const videos = await VideoArtist.find({ artistId: artist.id })
            .populate('videoId');
        
        res.json({ artist, videos });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur récupération artiste' });
    }
});

// Mettre à jour un artiste
app.put('/admin/artists/:artistId', async (req, res) => {
    try {
        const artist = await Artist.findOne({ id: req.params.artistId });
        
        if (!artist) {
            return res.status(404).json({ error: 'Artiste non trouvé' });
        }
        
        // Mettre à jour les champs autorisés
        const allowedFields = ['name', 'stageName', 'bio', 'email', 'phone', 'avatar', 'socials', 'defaultRights'];
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                artist[field] = req.body[field];
            }
        });
        
        artist.updatedAt = new Date();
        await artist.save();
        
        res.json({ success: true, artist });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur mise à jour artiste' });
    }
});

// ========================================
// ROUTES - VIDEO-ARTIST RIGHTS
// ========================================

// Assigner un artiste à une vidéo
app.post('/admin/videos/:videoId/artists', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { artistId, role, rights, revenueShare } = req.body;
        
        // Vérifier que l'artiste existe
        const artist = await Artist.findOne({ id: artistId });
        if (!artist) {
            return res.status(404).json({ error: 'Artiste non trouvé' });
        }
        
        // Utiliser les droits par défaut de l'artiste si non spécifié
        const finalRights = rights || artist.defaultRights.toObject();
        
        const videoArtist = new VideoArtist({
            videoId,
            artistId,
            role: role || 'featured',
            rights: finalRights,
            revenueShare: revenueShare || 0,
            approved: true // Auto-approuvé si créé par admin
        });
        
        await videoArtist.save();
        
        // Mettre à jour les stats de l'artiste
        artist.stats.totalVideos += 1;
        await artist.save();
        
        res.json({ success: true, videoArtist });
        
    } catch (error) {
        console.error('Erreur assignation artiste:', error);
        res.status(500).json({ error: 'Erreur assignation artiste' });
    }
});

// Obtenir tous les artistes d'une vidéo
app.get('/admin/videos/:videoId/artists', async (req, res) => {
    try {
        const videoArtists = await VideoArtist.find({ videoId: req.params.videoId });
        
        // Charger les infos complètes des artistes
        const artistsWithDetails = await Promise.all(
            videoArtists.map(async (va) => {
                const artist = await Artist.findOne({ id: va.artistId });
                return {
                    ...va.toObject(),
                    artistDetails: artist
                };
            })
        );
        
        res.json({ artists: artistsWithDetails });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur récupération artistes' });
    }
});

// Mettre à jour les droits d'un artiste pour une vidéo
app.put('/admin/videos/:videoId/artists/:artistId', async (req, res) => {
    try {
        const { videoId, artistId } = req.params;
        const { rights, revenueShare, authorizedUntil } = req.body;
        
        const videoArtist = await VideoArtist.findOne({ videoId, artistId });
        
        if (!videoArtist) {
            return res.status(404).json({ error: 'Relation non trouvée' });
        }
        
        if (rights) videoArtist.rights = { ...videoArtist.rights, ...rights };
        if (revenueShare !== undefined) videoArtist.revenueShare = revenueShare;
        if (authorizedUntil) videoArtist.authorizedUntil = authorizedUntil;
        
        await videoArtist.save();
        
        res.json({ success: true, videoArtist });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur mise à jour droits' });
    }
});

// Retirer un artiste d'une vidéo
app.delete('/admin/videos/:videoId/artists/:artistId', async (req, res) => {
    try {
        const { videoId, artistId } = req.params;
        
        const result = await VideoArtist.deleteOne({ videoId, artistId });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Relation non trouvée' });
        }
        
        // Mettre à jour les stats de l'artiste
        const artist = await Artist.findOne({ id: artistId });
        if (artist) {
            artist.stats.totalVideos = Math.max(0, artist.stats.totalVideos - 1);
            await artist.save();
        }
        
        res.json({ success: true });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur suppression' });
    }
});

// ========================================
// ROUTES - COPYRIGHT CLAIMS
// ========================================

// Créer une réclamation
app.post('/claims', async (req, res) => {
    try {
        const { videoId, artistId, type, description } = req.body;
        
        const claim = new CopyrightClaim({
            id: `claim_${Date.now()}`,
            videoId,
            artistId,
            type,
            description
        });
        
        await claim.save();
        
        // TODO: Envoyer notification à l'admin
        
        res.json({ success: true, claim });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur création réclamation' });
    }
});

// Lister les réclamations
app.get('/admin/claims', async (req, res) => {
    try {
        const status = req.query.status || 'pending';
        
        const claims = await CopyrightClaim.find({ status })
            .sort({ createdAt: -1 });
        
        // Charger les détails des artistes et vidéos
        const claimsWithDetails = await Promise.all(
            claims.map(async (claim) => {
                const artist = await Artist.findOne({ id: claim.artistId });
                // const video = await Video.findOne({ id: claim.videoId });
                
                return {
                    ...claim.toObject(),
                    artistDetails: artist,
                    // videoDetails: video
                };
            })
        );
        
        res.json({ claims: claimsWithDetails });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur récupération réclamations' });
    }
});

// Résoudre une réclamation
app.put('/admin/claims/:claimId/resolve', async (req, res) => {
    try {
        const { resolution, status } = req.body;
        
        const claim = await CopyrightClaim.findOne({ id: req.params.claimId });
        
        if (!claim) {
            return res.status(404).json({ error: 'Réclamation non trouvée' });
        }
        
        claim.status = status || 'resolved';
        claim.resolution = resolution;
        claim.resolvedAt = new Date();
        claim.resolvedBy = req.user?.id || 'admin';
        
        await claim.save();
        
        res.json({ success: true, claim });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur résolution réclamation' });
    }
});

// ========================================
// ROUTES - RIGHTS TEMPLATES
// ========================================

// Créer un modèle de droits
app.post('/admin/rights-templates', async (req, res) => {
    try {
        const { name, description, rights, conditions } = req.body;
        
        const template = new RightsTemplate({
            name,
            description,
            rights,
            conditions: conditions || []
        });
        
        await template.save();
        
        res.json({ success: true, template });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur création modèle' });
    }
});

// Lister les modèles
app.get('/admin/rights-templates', async (req, res) => {
    try {
        const templates = await RightsTemplate.find().sort({ name: 1 });
        res.json({ templates });
    } catch (error) {
        res.status(500).json({ error: 'Erreur récupération modèles' });
    }
});

// Appliquer un modèle à un artiste
app.post('/admin/artists/:artistId/apply-template', async (req, res) => {
    try {
        const { templateId } = req.body;
        
        const artist = await Artist.findOne({ id: req.params.artistId });
        const template = await RightsTemplate.findById(templateId);
        
        if (!artist || !template) {
            return res.status(404).json({ error: 'Artiste ou modèle non trouvé' });
        }
        
        artist.defaultRights = template.rights;
        artist.updatedAt = new Date();
        await artist.save();
        
        res.json({ success: true, artist });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur application modèle' });
    }
});

// ========================================
// ROUTES - VERIFICATION & VALIDATION
// ========================================

// Vérifier les droits pour une vidéo (avant publication)
app.get('/admin/videos/:videoId/rights-check', async (req, res) => {
    try {
        const { videoId } = req.params;
        
        const videoArtists = await VideoArtist.find({ videoId });
        
        const issues = [];
        
        for (const va of videoArtists) {
            const artist = await Artist.findOne({ id: va.artistId });
            
            // Vérifier contrat
            if (!artist.contract.signed) {
                issues.push({
                    severity: 'high',
                    type: 'missing-contract',
                    message: `${artist.name} n'a pas de contrat signé`
                });
            }
            
            // Vérifier expiration
            if (va.authorizedUntil && new Date() > new Date(va.authorizedUntil)) {
                issues.push({
                    severity: 'critical',
                    type: 'expired-authorization',
                    message: `Autorisation expirée pour ${artist.name}`
                });
            }
            
            // Vérifier approbation
            if (!va.approved) {
                issues.push({
                    severity: 'medium',
                    type: 'pending-approval',
                    message: `Approbation en attente pour ${artist.name}`
                });
            }
        }
        
        res.json({
            canPublish: issues.filter(i => i.severity === 'critical').length === 0,
            issues,
            artistsCount: videoArtists.length
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur vérification droits' });
    }
});

// ========================================
// SEED DATA (pour initialiser)
// ========================================

app.post('/admin/seed-templates', async (req, res) => {
    try {
        const templates = [
            {
                name: 'Standard Streaming',
                description: 'Droits standard pour streaming en ligne',
                rights: {
                    performance: true,
                    reproduction: false,
                    streaming: true,
                    download: false,
                    commercial: false,
                    sync: false,
                    publicPerformance: true,
                    broadcast: true
                },
                conditions: [
                    'Usage non-commercial uniquement',
                    'Crédit obligatoire',
                    'Durée indéterminée'
                ]
            },
            {
                name: 'Premium All Rights',
                description: 'Tous les droits inclus',
                rights: {
                    performance: true,
                    reproduction: true,
                    streaming: true,
                    download: true,
                    commercial: true,
                    sync: true,
                    publicPerformance: true,
                    broadcast: true
                },
                conditions: [
                    'Usage commercial autorisé',
                    'Téléchargement autorisé',
                    'Revenue sharing applicable'
                ]
            },
            {
                name: 'Performance Only',
                description: 'Droit d\'interprétation uniquement',
                rights: {
                    performance: true,
                    reproduction: false,
                    streaming: false,
                    download: false,
                    commercial: false,
                    sync: false,
                    publicPerformance: true,
                    broadcast: false
                },
                conditions: [
                    'Performance live uniquement',
                    'Pas de reproduction',
                    'Durée limitée'
                ]
            }
        ];
        
        await RightsTemplate.insertMany(templates);
        
        res.json({ success: true, count: templates.length });
        
    } catch (error) {
        res.status(500).json({ error: 'Erreur seed' });
    }
});

// ========================================
// SERVER START
// ========================================

mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log('✅ MongoDB connecté');
    
    app.listen(3004, () => {
        console.log('🎤 Artist Rights API sur le port 3004');
    });
});