import * as THREE from 'three';

let scene, camera, renderer, toonMesh;

// Fonction pour initialiser le moteur de rendu 3D "Manga-Style"
function initLuminaEngine() {
    const canvas = document.getElementById('previewCanvas');
    canvas.style.display = 'block';
    document.getElementById('canvasOverlay').style.display = 'none';

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    // Lumière type Pixar (Directionnelle forte)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(5, 5, 5);
    scene.add(sunLight);

    // Création du matériel Manga (Toon Shader)
    const colors = new Uint8Array([0, 128, 255]); // Niveaux d'ombre nets
    const map = new THREE.DataTexture(colors, colors.length, 1, THREE.LuminanceFormat);
    map.needsUpdate = true;

    const toonMaterial = new THREE.MeshToonMaterial({
        color: 0x3b82f6,
        gradientMap: map
    });

    // Exemple d'objet : Une sphère stylisée
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    toonMesh = new THREE.Mesh(geometry, toonMaterial);
    scene.add(toonMesh);

    camera.position.z = 3;
    animateLumina();
}

function animateLumina() {
    requestAnimationFrame(animateLumina);
    if (toonMesh && isPlaying) {
        toonMesh.rotation.y += 0.01; // Animation auto si "Play" est actif
    }
    renderer.render(scene, camera);
}

// Lier à ton bouton "Nouveau Projet"
function createNewProject() {
    // ... tes fonctions précédentes ...
    initLuminaEngine();
    showToast('✨ Moteur Lumina 3D/Manga activé');
}