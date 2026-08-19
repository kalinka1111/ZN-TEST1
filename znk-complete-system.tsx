import React, { useState, useEffect } from 'react';
import { Mail, Users, CreditCard, FileText, Settings, Bell, Download, Check, X, AlertCircle } from 'lucide-react';

// Configuration système ZNK
const ZNK_CONFIG = {
  commission: 5,
  supportRate: 1,
  betiConversion: 0.10,
  likesToBeti: 10,
  emailDomain: '@echo.znk',
  
  tiers: {
    visitor: {
      name: 'Visiteur',
      price: 0,
      whatsznk: { lines: 80, video: 0 },
      artflow: 0,
      profile: -1,
      studios: 'test'
    },
    etudes: {
      name: 'Etudes',
      price: 1500, // FCFA
      priceEUR: 5,
      whatsznk: { lines: 200, video: 15 },
      artflow: 10,
      profile: -1,
      studios: 'test'
    },
    member: {
      name: 'Membre',
      price: 1500, // FCFA
      priceEUR: 5,
      whatsznk: { lines: 200, video: 15 },
      artflow: 10,
      profile: -1,
      studios: 'full'
    },
    memberPlus: {
      name: 'Membre+',
      price: 4000, // FCFA
      priceEUR: 10,
      whatsznk: { lines: -1, video: -1 },
      artflow: -1,
      profile: -1,
      studios: 'full'
    },
    fida: {
      name: 'Artiste FIDA',
      price: 0,
      bonusBetis: 100,
      competitionCost: 300,
      whatsznk: { lines: -1, video: -1 },
      artflow: -1,
      profile: -1,
      studios: 'unlimited',
      monthlyFidaPosts: 1
    }
  }
};

const ZNKCompleteSystem = () => {
  const [activeView, setActiveView] = useState('admin');
  const [users, setUsers] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  
  // Modal états
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);

  // Charger données au démarrage
  useEffect(() => {
    loadFromStorage();
    loadMockData();
  }, []);

  // Sauvegarder automatiquement
  useEffect(() => {
    saveToStorage();
  }, [users, pendingPayments, invoices]);

  // Stockage local
  const saveToStorage = () => {
    try {
      localStorage.setItem('znk_users', JSON.stringify(users));
      localStorage.setItem('znk_payments', JSON.stringify(pendingPayments));
      localStorage.setItem('znk_invoices', JSON.stringify(invoices));
      localStorage.setItem('znk_notifications', JSON.stringify(notifications));
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
    }
  };

  const loadFromStorage = () => {
    try {
      const savedUsers = localStorage.getItem('znk_users');
      const savedPayments = localStorage.getItem('znk_payments');
      const savedInvoices = localStorage.getItem('znk_invoices');
      const savedNotifs = localStorage.getItem('znk_notifications');
      
      if (savedUsers) setUsers(JSON.parse(savedUsers));
      if (savedPayments) setPendingPayments(JSON.parse(savedPayments));
      if (savedInvoices) setInvoices(JSON.parse(savedInvoices));
      if (savedNotifs) setNotifications(JSON.parse(savedNotifs));
    } catch (error) {
      console.error('Erreur chargement:', error);
    }
  };

  const loadMockData = () => {
    if (users.length === 0) {
      const mockUsers = [
        {
          id: 'ZNK-2024-0001',
          name: 'Avatar User',
          email: 'avatar@echo.znk',
          tier: 'member',
          betis: 247,
          balance: 24.70,
          status: 'active',
          subscriptionEnd: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
          artflowPosts: 5,
          created: new Date().toISOString()
        },
        {
          id: 'FIDA-2024-0001',
          name: 'Kaya Artist',
          email: 'kaya.artist@echo.znk',
          tier: 'fida',
          betis: 450,
          balance: 45.00,
          status: 'active',
          artflowPosts: 23,
          created: new Date().toISOString()
        }
      ];
      setUsers(mockUsers);
    }
  };

  // Générer ID unique
  const generateID = (type = 'USER') => {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const prefix = type === 'FIDA' ? 'FIDA' : 'ZNK';
    return `${prefix}-${year}-${random}`;
  };

  // Générer email @echo.znk
  const generateEmail = (name) => {
    const cleanName = name.toLowerCase().replace(/\s+/g, '.');
    return `${cleanName}${ZNK_CONFIG.emailDomain}`;
  };

  // Créer nouvel utilisateur
  const createUser = (userData) => {
    const userId = generateID(userData.tier === 'fida' ? 'FIDA' : 'USER');
    const email = userData.email || generateEmail(userData.name);
    
    const newUser = {
      id: userId,
      name: userData.name,
      email: email,
      tier: userData.tier,
      betis: userData.tier === 'fida' ? 100 : 0,
      balance: userData.tier === 'fida' ? 10.00 : 0,
      status: 'active',
      subscriptionEnd: userData.tier !== 'visitor' ? new Date(Date.now() + 30*24*60*60*1000).toISOString() : null,
      artflowPosts: 0,
      created: new Date().toISOString(),
      bankAccount: userData.bankAccount || 'Non renseigné'
    };

    setUsers([...users, newUser]);
    
    // Envoyer email de bienvenue
    sendWelcomeEmail(newUser);
    
    showNotif(`✅ Utilisateur créé: ${newUser.name} (${userId})`);
    return newUser;
  };

  // Générer facture
  const generateInvoice = (userId, tier) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const invoiceNumber = `INV-${Date.now()}`;
    const tierConfig = ZNK_CONFIG.tiers[tier];
    
    const invoice = {
      number: invoiceNumber,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      tier: tier,
      amount: tierConfig.priceEUR,
      amountFCFA: tierConfig.price,
      status: 'pending',
      created: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
    };

    setInvoices([...invoices, invoice]);
    
    // Envoyer facture par email
    sendInvoiceEmail(invoice);
    
    showNotif(`📄 Facture générée: ${invoiceNumber}`);
    return invoice;
  };

  // Upload preuve de paiement
  const uploadPaymentProof = (invoiceNumber, proofData) => {
    const invoice = invoices.find(inv => inv.number === invoiceNumber);
    if (!invoice) {
      showNotif('❌ Facture introuvable', 'error');
      return;
    }

    const payment = {
      id: `PAY-${Date.now()}`,
      invoiceNumber: invoiceNumber,
      userId: invoice.userId,
      userName: invoice.userName,
      tier: invoice.tier,
      amount: invoice.amount,
      amountFCFA: invoice.amountFCFA,
      proof: proofData,
      status: 'pending_review',
      uploadedAt: new Date().toISOString()
    };

    setPendingPayments([...pendingPayments, payment]);
    addNotification(`💳 Nouvelle preuve de paiement: ${invoice.userName}`);
    showNotif(`✅ Preuve envoyée pour validation`);
  };

  // Approuver paiement (ADMIN)
  const approvePayment = (paymentId) => {
    const payment = pendingPayments.find(p => p.id === paymentId);
    if (!payment) return;

    // Upgrade user
    const updatedUsers = users.map(user => {
      if (user.id === payment.userId) {
        return {
          ...user,
          tier: payment.tier,
          subscriptionEnd: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
          artflowPosts: 0
        };
      }
      return user;
    });
    setUsers(updatedUsers);

    // Update invoice
    const updatedInvoices = invoices.map(inv => {
      if (inv.number === payment.invoiceNumber) {
        return { ...inv, status: 'paid' };
      }
      return inv;
    });
    setInvoices(updatedInvoices);

    // Remove from pending
    setPendingPayments(pendingPayments.filter(p => p.id !== paymentId));

    // Envoyer email confirmation
    sendActivationEmail(updatedUsers.find(u => u.id === payment.userId));

    showNotif(`✅ Abonnement activé pour ${payment.userName}`);
  };

  // Rejeter paiement
  const rejectPayment = (paymentId, reason) => {
    const payment = pendingPayments.find(p => p.id === paymentId);
    if (!payment) return;

    setPendingPayments(pendingPayments.filter(p => p.id !== paymentId));
    
    // Envoyer email de rejet
    sendRejectionEmail(payment, reason);
    
    showNotif(`❌ Paiement rejeté: ${payment.userName}`);
  };

  // Système d'emails automatiques
  const sendEmail = (to, subject, body) => {
    const email = {
      to: to,
      from: `admin${ZNK_CONFIG.emailDomain}`,
      subject: subject,
      body: body,
      sentAt: new Date().toISOString()
    };

    console.log('📧 EMAIL ENVOYÉ:', email);
    
    // Dans un vrai système, utiliser EmailJS ou SMTP
    // emailjs.send('service_id', 'template_id', email);
    
    return email;
  };

  const sendWelcomeEmail = (user) => {
    const body = `
Bienvenue sur ZNK, ${user.name} !

Votre compte a été créé avec succès:
• ID: ${user.id}
• Email: ${user.email}
• Type: ${ZNK_CONFIG.tiers[user.tier].name}
${user.tier === 'fida' ? `• Bonus FIDA: ${user.betis} Betis` : ''}

Connectez-vous sur ZNK pour commencer à créer !

L'équipe ZNK
    `;

    sendEmail(user.email, '🎉 Bienvenue sur ZNK', body);
  };

  const sendInvoiceEmail = (invoice) => {
    const tierConfig = ZNK_CONFIG.tiers[invoice.tier];
    const body = `
Bonjour ${invoice.userName},

Voici votre facture pour l'abonnement ${tierConfig.name}:

📄 FACTURE: ${invoice.number}
Montant: ${invoice.amountFCFA} FCFA (${invoice.amount}€)
Valide jusqu'au: ${new Date(invoice.expiresAt).toLocaleDateString()}

MOYENS DE PAIEMENT:
• Orange Money: +237 6XX XXX XXX
• MTN MoMo: +237 6XX XXX XXX
• Virement: IBAN CM21 XXXX XXXX

Après paiement, uploadez votre preuve dans votre profil ZNK.
Activation sous 24h.

L'équipe ZNK
    `;

    sendEmail(invoice.userEmail, `📄 Facture ZNK - ${invoice.number}`, body);
  };

  const sendActivationEmail = (user) => {
    const tierConfig = ZNK_CONFIG.tiers[user.tier];
    const body = `
🎉 Félicitations ${user.name} !

Votre abonnement ${tierConfig.name} est maintenant actif.

VOS AVANTAGES:
${user.tier === 'member' ? `
• WhatsZNK: ${tierConfig.whatsznk.lines} lignes + ${tierConfig.whatsznk.video}mn vidéo
• ArtFlow: ${tierConfig.artflow} publications/mois
• Studios: Accès complet avec sauvegarde
` : user.tier === 'memberPlus' ? `
• WhatsZNK: ILLIMITÉ
• ArtFlow: Publications ILLIMITÉES
• Studios: Accès complet
• Radio personnalisée
` : ''}

Date d'expiration: ${new Date(user.subscriptionEnd).toLocaleDateString()}

Profitez pleinement de ZNK !
    `;

    sendEmail(user.email, '✅ Abonnement ZNK activé', body);
  };

  const sendRejectionEmail = (payment, reason) => {
    const body = `
Bonjour ${payment.userName},

Votre preuve de paiement pour la facture ${payment.invoiceNumber} a été rejetée.

Raison: ${reason}

Veuillez soumettre une nouvelle preuve valide ou nous contacter à support${ZNK_CONFIG.emailDomain}.

L'équipe ZNK
    `;

    const user = users.find(u => u.id === payment.userId);
    if (user) {
      sendEmail(user.email, '❌ Preuve de paiement rejetée', body);
    }
  };

  // Notifications
  const addNotification = (message) => {
    const notif = {
      id: Date.now(),
      message: message,
      timestamp: new Date().toISOString(),
      read: false
    };
    setNotifications([notif, ...notifications]);
  };

  const showNotif = (message, type = 'success') => {
    setNotificationMessage(message);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  // Export données
  const exportData = () => {
    const data = {
      users: users,
      invoices: invoices,
      payments: pendingPayments,
      config: ZNK_CONFIG,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `znk-backup-${Date.now()}.json`;
    a.click();
    
    showNotif('💾 Données exportées');
  };

  // Interface Admin
  const AdminView = () => (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Utilisateurs" value={users.length} icon="👥" />
        <StatCard title="Abonnements Actifs" value={users.filter(u => u.tier !== 'visitor').length} icon="✅" />
        <StatCard title="En Attente" value={pendingPayments.length} icon="⏳" color="orange" />
        <StatCard title="Revenus/mois" value={`${users.filter(u => u.tier !== 'visitor').reduce((sum, u) => sum + (ZNK_CONFIG.tiers[u.tier]?.priceEUR || 0), 0)}€`} icon="💰" />
      </div>

      {/* Paiements en attente */}
      {pendingPayments.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-cyan-400">🔔 Paiements à valider ({pendingPayments.length})</h3>
            <Bell className="text-cyan-400 animate-pulse" size={24} />
          </div>
          
          <div className="space-y-3">
            {pendingPayments.map(payment => (
              <div key={payment.id} className="bg-gray-900/50 rounded-lg p-4 border border-cyan-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-bold text-white">{payment.userName}</div>
                    <div className="text-sm text-gray-400">
                      Facture: {payment.invoiceNumber} • {payment.amountFCFA} FCFA ({payment.amount}€)
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(payment.uploadedAt).toLocaleString()}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => approvePayment(payment.id)}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                    >
                      <Check size={18} />
                      Approuver
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('Raison du rejet:');
                        if (reason) rejectPayment(payment.id, reason);
                      }}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
                    >
                      <X size={18} />
                      Rejeter
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste utilisateurs */}
      <div className="bg-gray-800 rounded-lg p-6 border border-cyan-500/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-cyan-400">👥 Utilisateurs ({users.length})</h3>
          <button
            onClick={exportData}
            className="bg-cyan-500 hover:bg-cyan-600 text-black px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-all"
          >
            <Download size={18} />
            Exporter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cyan-500/30">
                <th className="text-left p-3 text-cyan-400">ID</th>
                <th className="text-left p-3 text-cyan-400">Nom</th>
                <th className="text-left p-3 text-cyan-400">Email</th>
                <th className="text-left p-3 text-cyan-400">Type</th>
                <th className="text-left p-3 text-cyan-400">Betis</th>
                <th className="text-left p-3 text-cyan-400">Expire</th>
                <th className="text-left p-3 text-cyan-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className="border-b border-gray-700 hover:bg-gray-700/30">
                  <td className="p-3 font-mono text-sm text-cyan-300">{user.id}</td>
                  <td className="p-3 text-white">{user.name}</td>
                  <td className="p-3 text-gray-400 text-sm">{user.email}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      user.tier === 'visitor' ? 'bg-blue-500/20 text-blue-400' :
                      user.tier === 'member' ? 'bg-green-500/20 text-green-400' :
                      user.tier === 'memberPlus' ? 'bg-purple-500/20 text-purple-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {ZNK_CONFIG.tiers[user.tier].name}
                    </span>
                  </td>
                  <td className="p-3 text-yellow-400 font-bold">{user.betis}</td>
                  <td className="p-3 text-gray-400 text-sm">
                    {user.subscriptionEnd ? new Date(user.subscriptionEnd).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => generateInvoice(user.id, user.tier === 'visitor' ? 'member' : 'memberPlus')}
                      className="bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 px-3 py-1 rounded text-sm transition-all"
                    >
                      📄 Facture
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Factures récentes */}
      <div className="bg-gray-800 rounded-lg p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-cyan-400 mb-4">📄 Factures ({invoices.length})</h3>
        <div className="space-y-2">
          {invoices.slice(0, 5).map(invoice => (
            <div key={invoice.number} className="bg-gray-900/50 rounded p-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-white">{invoice.number}</div>
                <div className="text-sm text-gray-400">{invoice.userName} • {invoice.amountFCFA} FCFA</div>
              </div>
              <span className={`px-3 py-1 rounded text-xs font-bold ${
                invoice.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                invoice.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {invoice.status === 'paid' ? 'Payée' : 
                 invoice.status === 'pending' ? 'En attente' : 'Expirée'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Interface User (Nomad)
  const UserView = () => {
    const currentUser = users[0] || {
      id: 'DEMO',
      name: 'Utilisateur Demo',
      email: 'demo@echo.znk',
      tier: 'visitor',
      betis: 0,
      balance: 0
    };

    const tierConfig = ZNK_CONFIG.tiers[currentUser.tier];

    return (
      <div className="space-y-6">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl p-6 text-white shadow-2xl">
          <div className="text-sm opacity-90 mb-2">Mon solde</div>
          <div className="text-4xl font-bold mb-4">{currentUser.balance.toFixed(2)} €</div>
          <div className="flex justify-between items-center pt-4 border-t border-white/20">
            <div>
              <div className="text-xs opacity-75">Betis</div>
              <div className="text-lg font-bold">{currentUser.betis}</div>
            </div>
            <div className="text-right">
              <div className="text-xs opacity-75">{tierConfig.name}</div>
              <div className="text-sm">{currentUser.id}</div>
            </div>
          </div>
        </div>

        {/* Actions rapides */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => {
              const invoice = generateInvoice(currentUser.id, 'member');
              showNotif('📄 Facture générée et envoyée par email');
            }}
            className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 border border-cyan-500/30 transition-all"
          >
            <div className="text-3xl mb-2">📄</div>
            <div className="text-white font-bold">Générer Facture</div>
            <div className="text-xs text-gray-400">Upgrade Membre</div>
          </button>

          <button
            onClick={() => {
              const lastInvoice = invoices.filter(inv => inv.userId === currentUser.id).pop();
              if (lastInvoice) {
                uploadPaymentProof(lastInvoice.number, 'proof-screenshot.jpg');
              } else {
                showNotif('❌ Aucune facture en attente', 'error');
              }
            }}
            className="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 border border-cyan-500/30 transition-all"
          >
            <div className="text-3xl mb-2">💳</div>
            <div className="text-white font-bold">Upload Preuve</div>
            <div className="text-xs text-gray-400">Activer abonnement</div>
          </button>
        </div>

        {/* Mes factures */}
        <div className="bg-gray-800 rounded-lg p-6 border border-cyan-500/30">
          <h3 className="text-xl font-bold text-cyan-400 mb-4">📄 Mes Factures</h3>
          <div className="space-y-3">
            {invoices.filter(inv => inv.userId === currentUser.id).map(invoice => (
              <div key={invoice.number} className="bg-gray-900/50 rounded-lg p-4 border border-cyan-500/20">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-bold text-white">{invoice.number}</div>
                    <div className="text-sm text-gray-400">
                      {invoice.amountFCFA} FCFA ({invoice.amount}€)
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(invoice.created).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded text-xs font-bold ${
                    invoice.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {invoice.status === 'paid' ? 'Payée' : 'En attente'}
                  </span>
                </div>
              </div>
            ))}
            {invoices.filter(inv => inv.userId === currentUser.id).length === 0 && (
              <div className="text-center text-gray-400 py-8">
                Aucune facture pour le moment
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      {/* Notification */}
      {showNotification && (
        <div className="fixed top-6 right-6 bg-cyan-500 text-black px-6 py-4 rounded-lg shadow-2xl font-bold z-50 animate-pulse">
          {notificationMessage}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              ZNK System Complet
            </h1>
            <p className="text-gray-400 mt-2">Système automatisé avec emails @echo.znk</p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setActiveView('admin')}
              className={`px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 ${
                activeView === 'admin' 
                  ? 'bg-cyan-500 text-black' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Settings size={20} />
              Admin
            </button>
            
            <button
              onClick={() => setActiveView('user')}
              className={`px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 ${
                activeView === 'user' 
                  ? 'bg-cyan-500 text-black' 
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Users size={20} />
              Utilisateur
            </button>
          </div>
        </div>

        {/* Notifications badge */}
        {notifications.filter(n => !n.read).length > 0 && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="text-yellow-400" size={24} />
            <span className="text-yellow-400 font-bold">
              {notifications.filter(n => !n.read).length} nouvelle(s) notification(s)
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeView === 'admin' ? <AdminView /> : <UserView />}
      </div>
    </div>
  );
};

// Composant StatCard
const StatCard = ({ title, value, icon, color = 'cyan' }) => (
  <div className={`bg-gray-800 rounded-lg p-6 border border-${color}-500/30`}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-gray-400 text-sm">{title}</span>
      <span className="text-2xl">{icon}</span>
    </div>
    <div className={`text-3xl font-bold text-${color}-400`}>{value}</div>
  </div>
);

export default ZNKCompleteSystem;