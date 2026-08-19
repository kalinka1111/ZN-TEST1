// 🌈 ZNK Configuration Centralisée
window.ZNK_CONFIG = {
    PORTS: [
        { port: 3000, name: '🔄 ZNK Sync', service: 'http:// 192.168.1.142:5555/api', priority: 1 },
        { port: 3001, name: '💬 WhatsZNK', service: 'WhatsZNK Video Chat', priority: 1 },
        { port: 5000, name: '🤖 ZAZA IA', service: 'ZAZA IA System', priority: 1 },
        { port: 8080, name: 'HTTP Dev', service: 'http:// 192.168.1.142:5555/api', priority: 2 },
        { port: 5173, name: 'Vite', service: 'Vite Development', priority: 2 },
        { port: 3002, name: 'React Dev', service: 'React Development', priority: 2 }
    ],

    APPS: [
        { name: '🏠 Accueil ZNK', port: 8080, path: '/index.html', 
          description: 'Point d\'entrée utilisateurs', 
          command: 'electron . --port=3000 --app=accueil' },
        { name: '📊 Dashboard Principal', port: 3000, path: '/ZNKmembresdash.html', 
          description: 'Dashboard avec navigation', 
          command: 'electron . --port=3000 --app=dashboard' },
        { name: '🎨 ZNK Studios', port: 3000, path: '/ZNKStudiosDash.html', 
          description: 'Interface créative', 
          command: 'electron . --port=3000 --app=studios' },
        { name: '💬 WhatsZNK', port: 3001, path: '/whatsznk.html', 
          description: 'Video chat', 
          command: 'electron . --port=3001 --app=whatsznk' },
        { name: '🎥 Camera Core', port: 3000, path: '/znk-camera-core-local.html', 
          description: 'Effets vidéo', 
          command: 'electron . --port=3000 --app=camera' },
        { name: '👥 ACTV Users', port: 3000, path: '/actv.html', 
          description: 'Interface utilisateurs', 
          command: 'electron . --port=3000 --app=actv' },
        { name: '📁 Archives', port: 3000, path: '/archives.html', 
          description: 'Gestion admin', 
          command: 'electron . --port=3000 --app=archives' },
        { name: '🤖 ZAZA IA', port: 5000, path: '/', 
          description: 'App principale', 
          command: 'electron . --port=5000 --app=zaza' }
    ]
};
console.log('✅ ZNK Config loaded');
