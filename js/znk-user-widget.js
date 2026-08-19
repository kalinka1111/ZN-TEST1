/**
 * ZNK USER WIDGET v2.0
 * Widget de profil utilisateur réutilisable avec animations et thèmes
 * Usage: ZNKUserWidget.render('#userWidget', options);
 */

class ZNKUserWidget {
    static themes = {
        default: {
            gradient: 'linear-gradient(135deg, #00ffff, #0080ff)',
            accentColor: '#00ffff',
            shadowColor: 'rgba(0, 255, 255, 0.3)'
        },
        purple: {
            gradient: 'linear-gradient(135deg, #667eea, #764ba2)',
            accentColor: '#764ba2',
            shadowColor: 'rgba(118, 75, 162, 0.3)'
        },
        green: {
            gradient: 'linear-gradient(135deg, #25D366, #128C7E)',
            accentColor: '#25D366',
            shadowColor: 'rgba(37, 211, 102, 0.3)'
        }
    };

    static render(containerId, options = {}) {
        const container = document.querySelector(containerId);
        if (!container) {
            console.error('❌ Container non trouvé:', containerId);
            return;
        }

        const user = window.ZNKSession?.getCurrentUser();
        if (!user) {
            container.innerHTML = this.renderNotLoggedIn();
            this.attachLoginEvents(container);
            return;
        }

        const config = {
            showAvatar: true,
            showName: true,
            showRole: true,
            showWhatsZNK: true,
            showEmail: true,
            showLogout: true,
            showStats: false,
            compact: false,
            theme: 'default',
            animated: true,
            clickable: true,
            ...options
        };

        container.innerHTML = this.renderLoggedIn(user, config);
        this.attachEvents(container, user, config);
        
        if (config.animated) {
            this.applyAnimations(container);
        }
    }

    static renderNotLoggedIn() {
        return `
            <div class="znk-widget-not-logged" style="
                background: rgba(255, 255, 255, 0.03);
                border-radius: 16px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                padding: 32px 20px;
                text-align: center;
                backdrop-filter: blur(10px);
            ">
                <div class="znk-widget-icon-placeholder" style="
                    font-size: 64px;
                    margin-bottom: 16px;
                    opacity: 0.6;
                    filter: grayscale(1);
                ">👤</div>
                <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: white;">
                    Non connecté
                </h3>
                <p style="margin: 0 0 24px; font-size: 14px; color: rgba(255,255,255,0.6);">
                    Connectez-vous pour accéder à votre profil
                </p>
                <button class="znk-login-btn" style="
                    padding: 12px 28px;
                    background: linear-gradient(135deg, #00ffff, #0080ff);
                    border: none;
                    border-radius: 10px;
                    color: #000;
                    font-weight: 700;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 16px rgba(0, 255, 255, 0.3);
                ">
                    🔐 Se connecter
                </button>
            </div>
        `;
    }

    static renderLoggedIn(user, config) {
        const theme = this.themes[config.theme] || this.themes.default;
        const initials = user.prenom && user.nom 
            ? `${user.prenom[0]}${user.nom[0]}`.toUpperCase() 
            : '??';
        
        const containerStyle = config.compact 
            ? 'display: flex; align-items: center; gap: 12px;' 
            : 'display: flex; flex-direction: column; align-items: center;';

        return `
            <div class="znk-user-widget ${config.compact ? 'compact' : 'full'}" 
                 data-theme="${config.theme}"
                 style="${containerStyle}">
                
                ${config.showAvatar ? this.renderAvatar(user, config, theme, initials) : ''}
                
                <div class="znk-widget-info" style="
                    flex: 1;
                    ${config.compact ? '' : 'text-align: center; width: 100%;'}
                ">
                    ${config.showName ? this.renderName(user, config) : ''}
                    ${config.showRole ? this.renderRole(user, config, theme) : ''}
                    ${config.showWhatsZNK ? this.renderWhatsZNK(user, config) : ''}
                    ${config.showEmail ? this.renderEmail(user, config) : ''}
                    ${config.showStats ? this.renderStats(user, config, theme) : ''}
                </div>
                
                ${config.showLogout ? this.renderLogoutButton(config, theme) : ''}
            </div>
        `;
    }

    static renderAvatar(user, config, theme, initials) {
        const size = config.compact ? 48 : 80;
        return `
            <div class="znk-widget-avatar ${config.clickable ? 'clickable' : ''}" style="
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                background: ${theme.gradient};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${config.compact ? 20 : 32}px;
                font-weight: 800;
                color: #000;
                margin: ${config.compact ? '0' : '0 auto 16px'};
                box-shadow: 0 4px 20px ${theme.shadowColor};
                cursor: ${config.clickable ? 'pointer' : 'default'};
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            ">
                ${user.avatar ? `
                    <img src="${user.avatar}" alt="${user.prenom}" style="
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    ">
                ` : initials}
                <div class="znk-avatar-status" style="
                    position: absolute;
                    bottom: 2px;
                    right: 2px;
                    width: ${config.compact ? 12 : 16}px;
                    height: ${config.compact ? 12 : 16}px;
                    background: #25D366;
                    border: 2px solid #000;
                    border-radius: 50%;
                    box-shadow: 0 0 8px rgba(37, 211, 102, 0.6);
                "></div>
            </div>
        `;
    }

    static renderName(user, config) {
        return `
            <div class="znk-widget-name" style="
                font-size: ${config.compact ? 16 : 20}px;
                font-weight: 700;
                color: white;
                margin-bottom: ${config.compact ? 4 : 8}px;
                letter-spacing: -0.02em;
            ">
                ${user.prenom} ${user.nom}
            </div>
        `;
    }

    static renderRole(user, config, theme) {
        const roleDisplay = window.ZNKSession?.getRoleDisplay?.(user.role) || user.role || 'Membre';
        return `
            <div class="znk-widget-role" style="
                display: inline-block;
                font-size: 12px;
                color: ${theme.accentColor};
                background: ${theme.accentColor}15;
                padding: 4px 12px;
                border-radius: 20px;
                margin-bottom: 8px;
                font-weight: 600;
                border: 1px solid ${theme.accentColor}30;
            ">
                ✨ ${roleDisplay}
            </div>
        `;
    }

    static renderWhatsZNK(user, config) {
        if (!user.whatsznk) return '';
        return `
            <div class="znk-widget-whatsznk" style="
                font-size: 13px;
                color: rgba(255, 255, 255, 0.8);
                font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
                ${config.compact ? '' : 'justify-content: center;'}
            ">
                <span style="font-size: 16px;">📱</span>
                <span>${user.whatsznk}</span>
            </div>
        `;
    }

    static renderEmail(user, config) {
        if (!user.emailZnk) return '';
        return `
            <div class="znk-widget-email" style="
                font-size: 12px;
                color: rgba(255, 255, 255, 0.6);
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
                ${config.compact ? '' : 'justify-content: center;'}
            ">
                <span>📧</span>
                <span>${user.emailZnk}</span>
            </div>
        `;
    }

    static renderStats(user, config, theme) {
        const stats = user.stats || { posts: 0, followers: 0, following: 0 };
        return `
            <div class="znk-widget-stats" style="
                display: flex;
                gap: 16px;
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                ${config.compact ? '' : 'justify-content: center;'}
            ">
                <div style="text-align: center;">
                    <div style="font-size: 16px; font-weight: 700; color: ${theme.accentColor};">
                        ${stats.posts}
                    </div>
                    <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">Posts</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 16px; font-weight: 700; color: ${theme.accentColor};">
                        ${stats.followers}
                    </div>
                    <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">Abonnés</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 16px; font-weight: 700; color: ${theme.accentColor};">
                        ${stats.following}
                    </div>
                    <div style="font-size: 11px; color: rgba(255, 255, 255, 0.5);">Suivi</div>
                </div>
            </div>
        `;
    }

    static renderLogoutButton(config, theme) {
        return `
            <button class="znk-widget-logout" style="
                margin-top: ${config.compact ? 0 : 16}px;
                padding: ${config.compact ? '8px 16px' : '12px 24px'};
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                color: white;
                font-size: ${config.compact ? 12 : 14}px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 8px;
                ${config.compact ? '' : 'width: 100%;'}
                justify-content: center;
            ">
                <span>🚪</span>
                <span>${config.compact ? '' : "Changer d'utilisateur"}</span>
            </button>
        `;
    }

    static attachEvents(container, user, config) {
        // Logout button
        const logoutBtn = container.querySelector('.znk-widget-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.ZNKSession?.switchUser) {
                    window.ZNKSession.switchUser();
                } else {
                    window.location.href = '/user-selection.html';
                }
            });

            // Hover effects
            logoutBtn.addEventListener('mouseenter', function() {
                this.style.background = 'rgba(255, 255, 255, 0.15)';
                this.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                this.style.transform = 'translateY(-2px)';
            });

            logoutBtn.addEventListener('mouseleave', function() {
                this.style.background = 'rgba(255, 255, 255, 0.05)';
                this.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                this.style.transform = 'translateY(0)';
            });
        }

        // Avatar click
        if (config.clickable) {
            const avatar = container.querySelector('.znk-widget-avatar');
            if (avatar) {
                avatar.addEventListener('click', () => {
                    this.showUserProfile(user);
                });

                avatar.addEventListener('mouseenter', function() {
                    this.style.transform = 'scale(1.05)';
                    this.style.boxShadow = `0 8px 30px ${config.theme ? this.themes[config.theme]?.shadowColor : 'rgba(0, 255, 255, 0.5)'}`;
                });

                avatar.addEventListener('mouseleave', function() {
                    this.style.transform = 'scale(1)';
                    this.style.boxShadow = `0 4px 20px ${config.theme ? this.themes[config.theme]?.shadowColor : 'rgba(0, 255, 255, 0.3)'}`;
                });
            }
        }
    }

    static attachLoginEvents(container) {
        const loginBtn = container.querySelector('.znk-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                window.location.href = '/user-selection.html';
            });

            loginBtn.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-2px) scale(1.02)';
                this.style.boxShadow = '0 8px 24px rgba(0, 255, 255, 0.5)';
            });

            loginBtn.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0) scale(1)';
                this.style.boxShadow = '0 4px 16px rgba(0, 255, 255, 0.3)';
            });
        }
    }

    static applyAnimations(container) {
        const widget = container.querySelector('.znk-user-widget');
        if (!widget) return;

        widget.style.opacity = '0';
        widget.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            widget.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            widget.style.opacity = '1';
            widget.style.transform = 'translateY(0)';
        }, 100);
    }

    static showUserProfile(user) {
        // Ouvrir le profil complet
        const profileUrl = '/mecanismes/navigation/infosUser.html';
        window.location.href = profileUrl;
    }

    // Méthodes de rendu rapides
    static renderCompact(containerId, options = {}) {
        this.render(containerId, {
            compact: true,
            showWhatsZNK: false,
            showEmail: false,
            showStats: false,
            ...options
        });
    }

    static renderFull(containerId, options = {}) {
        this.render(containerId, {
            compact: false,
            showWhatsZNK: true,
            showEmail: true,
            showStats: true,
            ...options
        });
    }

    static renderMini(containerId, options = {}) {
        this.render(containerId, {
            compact: true,
            showName: false,
            showRole: false,
            showWhatsZNK: false,
            showEmail: false,
            showLogout: false,
            ...options
        });
    }

    // Refresh widget
    static refresh(containerId) {
        const container = document.querySelector(containerId);
        if (!container) return;
        
        const currentConfig = container.dataset.config ? JSON.parse(container.dataset.config) : {};
        this.render(containerId, currentConfig);
    }
}

// Export global
window.ZNKUserWidget = ZNKUserWidget;

// Auto-initialisation si data-znk-widget présent
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-znk-widget]').forEach(el => {
        const type = el.dataset.znkWidget || 'full';
        const containerId = `#${el.id}`;
        
        if (type === 'compact') {
            ZNKUserWidget.renderCompact(containerId);
        } else if (type === 'mini') {
            ZNKUserWidget.renderMini(containerId);
        } else {
            ZNKUserWidget.renderFull(containerId);
        }
    });
});