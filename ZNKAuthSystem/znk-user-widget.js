/**
 * ZNK USER WIDGET
 * Widget de profil utilisateur réutilisable
 * Usage: <div id="userWidget"></div>
 *        ZNKUserWidget.render('#userWidget');
 */

class ZNKUserWidget {
    static render(containerId, options = {}) {
        const container = document.querySelector(containerId);
        if (!container) {
            console.error('❌ Container non trouvé:', containerId);
            return;
        }

        const user = window.ZNKSession.getCurrentUser();
        if (!user) {
            container.innerHTML = this.renderNotLoggedIn();
            return;
        }

        const config = {
            showAvatar: true,
            showName: true,
            showRole: true,
            showWhatsZNK: false,
            showEmail: false,
            showLogout: true,
            compact: false,
            ...options
        };

        container.innerHTML = this.renderLoggedIn(user, config);
        this.attachEvents(container);
    }

    static renderNotLoggedIn() {
        return `
            <div class="znk-widget-not-logged">
                <div style="text-align:center;padding:20px;color:rgba(255,255,255,0.6);">
                    <div style="font-size:48px;margin-bottom:12px;">👤</div>
                    <p>Non connecté</p>
                    <button onclick="window.location.href='/user-selection.html'" 
                            style="margin-top:16px;padding:10px 20px;background:linear-gradient(135deg,#00ffff,#0080ff);border:none;border-radius:8px;color:#000;font-weight:600;cursor:pointer;">
                        Se connecter
                    </button>
                </div>
            </div>
        `;
    }

    static renderLoggedIn(user, config) {
        const initials = `${user.prenom[0]}${user.nom[0]}`.toUpperCase();
        
        return `
            <div class="znk-user-widget ${config.compact ? 'compact' : ''}">
                ${config.showAvatar ? `
                    <div class="znk-widget-avatar" style="
                        width: ${config.compact ? '48px' : '80px'};
                        height: ${config.compact ? '48px' : '80px'};
                        border-radius: 50%;
                        background: linear-gradient(135deg, #00ffff, #0080ff);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: ${config.compact ? '20px' : '32px'};
                        font-weight: bold;
                        color: #000;
                        margin: ${config.compact ? '0 12px 0 0' : '0 auto 16px'};
                        box-shadow: 0 4px 20px rgba(0, 255, 255, 0.3);
                    ">
                        ${initials}
                    </div>
                ` : ''}
                
                <div class="znk-widget-info" style="flex:1;${config.compact ? '' : 'text-align:center;'}">
                    ${config.showName ? `
                        <div class="znk-widget-name" style="
                            font-size: ${config.compact ? '16px' : '20px'};
                            font-weight: 600;
                            color: white;
                            margin-bottom: ${config.compact ? '4px' : '8px'};
                        ">
                            ${user.prenom} ${user.nom}
                        </div>
                    ` : ''}
                    
                    ${config.showRole ? `
                        <div class="znk-widget-role" style="
                            font-size: 13px;
                            color: #00ffff;
                            margin-bottom: 4px;
                        ">
                            ${window.ZNKSession.getRoleDisplay(user.role)}
                        </div>
                    ` : ''}
                    
                    ${config.showWhatsZNK ? `
                        <div class="znk-widget-whatsznk" style="
                            font-size: 12px;
                            color: rgba(255, 255, 255, 0.6);
                            font-family: 'Courier New', monospace;
                            margin-bottom: 4px;
                        ">
                            📱 ${user.whatsznk}
                        </div>
                    ` : ''}
                    
                    ${config.showEmail ? `
                        <div class="znk-widget-email" style="
                            font-size: 12px;
                            color: rgba(255, 255, 255, 0.6);
                            margin-bottom: 4px;
                        ">
                            📧 ${user.emailZnk}
                        </div>
                    ` : ''}
                </div>
                
                ${config.showLogout ? `
                    <button class="znk-widget-logout" onclick="window.ZNKSession.switchUser()" style="
                        margin-top: ${config.compact ? '0' : '16px'};
                        padding: ${config.compact ? '8px 16px' : '10px 20px'};
                        background: rgba(255, 255, 255, 0.1);
                        border: 2px solid rgba(0, 255, 255, 0.3);
                        border-radius: 8px;
                        color: white;
                        font-size: ${config.compact ? '12px' : '14px'};
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.background='rgba(0,255,255,0.2)';this.style.borderColor='#00ffff';"
                       onmouseout="this.style.background='rgba(255,255,255,0.1)';this.style.borderColor='rgba(0,255,255,0.3)';">
                        ${config.compact ? '🚪' : '🚪 Changer d\'utilisateur'}
                    </button>
                ` : ''}
            </div>
        `;
    }

    static attachEvents(container) {
        // Les événements sont déjà gérés via onclick inline
        // On pourrait ajouter des listeners supplémentaires ici si nécessaire
    }

    // Widget compact pour header
    static renderCompact(containerId) {
        this.render(containerId, {
            compact: true,
            showWhatsZNK: false,
            showEmail: false
        });
    }

    // Widget complet pour sidebar/profil
    static renderFull(containerId) {
        this.render(containerId, {
            compact: false,
            showWhatsZNK: true,
            showEmail: true
        });
    }
}

// Export global
window.ZNKUserWidget = ZNKUserWidget;