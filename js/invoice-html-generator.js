/**
 * Générateur de factures HTML pour ZNK
 * Remplace pdfkit - Plus léger et permet l'impression PDF native
 */

const fs = require('fs-extra');
const path = require('path');

class InvoiceGenerator {
  constructor() {
    this.invoicesDir = path.join(__dirname, '..', 'invoices');
    fs.ensureDirSync(this.invoicesDir);
  }

  /**
   * Génère une facture HTML
   */
  generateInvoice(invoiceData) {
    const {
      number,
      userName,
      userEmail,
      userId,
      tier,
      amount,
      amountFCFA,
      amountEUROS,
      created,
      expiresAt,
      items = []
    } = invoiceData;

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Facture ${number}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            color: #333;
        }
        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
            color: white;
            padding: 40px;
            position: relative;
        }
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320"><path fill="rgba(255,255,255,0.1)" d="M0,96L48,112C96,128,192,160,288,160C384,160,480,128,576,112C672,96,768,96,864,112C960,128,1056,160,1152,160C1248,160,1344,128,1392,112L1440,96L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path></svg>') bottom;
            background-size: cover;
            opacity: 0.3;
        }
        .logo {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 10px;
            position: relative;
            z-index: 1;
        }
        .subtitle {
            opacity: 0.9;
            font-size: 14px;
            position: relative;
            z-index: 1;
        }
        .invoice-info {
            position: absolute;
            right: 40px;
            top: 40px;
            text-align: right;
            z-index: 1;
        }
        .invoice-number {
            font-size: 18px;
            font-weight: bold;
            background: rgba(255,255,255,0.2);
            padding: 8px 16px;
            border-radius: 6px;
            display: inline-block;
        }
        .content {
            padding: 40px;
        }
        .section {
            margin-bottom: 30px;
        }
        .section-title {
            font-size: 14px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
            margin-bottom: 30px;
        }
        .info-box {
            padding: 20px;
            background: #f8fafc;
            border-radius: 8px;
            border-left: 4px solid #06b6d4;
        }
        .info-label {
            font-size: 12px;
            color: #64748b;
            margin-bottom: 5px;
        }
        .info-value {
            font-size: 16px;
            font-weight: 600;
            color: #1e293b;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .items-table th {
            background: #f1f5f9;
            padding: 12px;
            text-align: left;
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .items-table td {
            padding: 16px 12px;
            border-bottom: 1px solid #e2e8f0;
        }
        .total-section {
            background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
            color: white;
            padding: 30px;
            border-radius: 8px;
            margin: 30px 0;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .total-row:last-child {
            margin-bottom: 0;
            padding-top: 10px;
            border-top: 2px solid rgba(255,255,255,0.3);
            font-size: 24px;
            font-weight: bold;
        }
        .payment-info {
            background: #fef3c7;
            border: 2px solid #fbbf24;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .payment-title {
            color: #92400e;
            font-weight: bold;
            font-size: 16px;
            margin-bottom: 10px;
        }
        .payment-methods {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        .payment-method {
            background: white;
            padding: 12px;
            border-radius: 6px;
            font-size: 14px;
        }
        .payment-method strong {
            display: block;
            color: #92400e;
            margin-bottom: 5px;
        }
        .footer {
            text-align: center;
            padding: 30px;
            background: #f8fafc;
            color: #64748b;
            font-size: 12px;
        }
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: #fef3c7;
            color: #92400e;
        }
        @media print {
            body { background: white; padding: 0; }
            .invoice-container { box-shadow: none; }
            .payment-info { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="header">
            <div class="logo">ZNK</div>
            <div class="subtitle">Système de gestion intelligent</div>
            <div class="invoice-info">
                <div class="invoice-number">#${number}</div>
                <div style="margin-top: 10px; font-size: 12px;">
                    Date: ${new Date(created).toLocaleDateString('fr-FR')}
                </div>
            </div>
        </div>

        <div class="content">
            <!-- Client Info -->
            <div class="section">
                <div class="section-title">Client</div>
                <div class="info-grid">
                    <div class="info-box">
                        <div class="info-label">Nom</div>
                        <div class="info-value">${userName}</div>
                    </div>
                    <div class="info-box">
                        <div class="info-label">Email</div>
                        <div class="info-value">${userEmail}</div>
                    </div>
                    <div class="info-box">
                        <div class="info-label">ID Utilisateur</div>
                        <div class="info-value">${userId}</div>
                    </div>
                    <div class="info-box">
                        <div class="info-label">Abonnement</div>
                        <div class="info-value">${tier.toUpperCase()}</div>
                    </div>
                </div>
            </div>

            <!-- Items -->
            <div class="section">
                <div class="section-title">Détails</div>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th style="text-align: right;">Quantité</th>
                            <th style="text-align: right;">Prix unitaire</th>
                            <th style="text-align: right;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <strong>Abonnement ${tier}</strong><br>
                                <span style="font-size: 13px; color: #64748b;">
                                    Accès mensuel aux services ZNK
                                </span>
                            </td>
                            <td style="text-align: right;">1</td>
                            <td style="text-align: right;">${amountFCFA.toLocaleString()} FCFA</td>
                            <td style="text-align: right; font-weight: 600;">${amountFCFA.toLocaleString()} FCFA</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Total -->
            <div class="total-section">
                <div class="total-row">
                    <span>Sous-total:</span>
                    <span>${amountFCFA.toLocaleString()} FCFA</span>
                </div>
                <div class="total-row">
                    <span>TVA (0%):</span>
                    <span>0 FCFA</span>
                </div>
                <div class="total-row">
                    <span>TOTAL À PAYER:</span>
                    <span>${amountFCFA.toLocaleString()} FCFA (${amount}€)</span>
                </div>
            </div>

            <!-- Payment Info -->
            <div class="payment-info">
                <div class="payment-title">💳 Moyens de paiement</div>
                <p style="margin-bottom: 15px; font-size: 14px; color: #92400e;">
                    Cette facture expire le <strong>${new Date(expiresAt).toLocaleDateString('fr-FR')}</strong>
                </p>
                <div class="payment-methods">
                    <div class="payment-method">
                        <strong>🟠 Orange Money</strong>
                        +237 6XX XXX XXX
                    </div>
                    <div class="payment-method">
                        <strong>🟡 MTN MoMo</strong>
                        +237 6XX XXX XXX
                    </div>
                    <div class="payment-method">
                        <strong>🏦 Virement bancaire</strong>
                        IBAN: CM21 XXXX XXXX
                    </div>
                    <div class="payment-method">
                        <strong>💳 Carte bancaire</strong>
                        Via Stripe
                    </div>
                </div>
                <p style="margin-top: 15px; font-size: 13px; color: #92400e;">
                    ⚠️ Après paiement, uploadez votre preuve dans votre profil ZNK pour activation sous 24h.
                </p>
            </div>

            <!-- Notes -->
            <div class="section">
                <div class="section-title">Notes</div>
                <p style="line-height: 1.6; color: #64748b;">
                    Merci de votre confiance en ZNK. Pour toute question concernant cette facture, 
                    contactez-nous à <strong>support@echo.znk</strong>.
                </p>
            </div>
        </div>

        <div class="footer">
            <strong>ZNK - Système de gestion intelligent</strong><br>
            Douala, Cameroun | support@echo.znk<br>
            © 2025 ZNK. Tous droits réservés.
        </div>
    </div>

    <script>
        // Auto-print pour PDFs
        // window.print();
    </script>
</body>
</html>`;

    // Sauvegarder le fichier HTML
    const filename = `${number}_${Date.now()}.html`;
    const filepath = path.join(this.invoicesDir, filename);
    fs.writeFileSync(filepath, html, 'utf8');

    return {
      success: true,
      filepath: filepath,
      filename: filename,
      html: html
    };
  }

  /**
   * Ouvrir la facture dans le navigateur
   */
  openInvoice(filepath) {
    const { shell } = require('electron');
    shell.openPath(filepath);
  }

  /**
   * Générer et ouvrir directement
   */
  createAndOpen(invoiceData) {
    const result = this.generateInvoice(invoiceData);
    if (result.success) {
      this.openInvoice(result.filepath);
    }
    return result;
  }
}

module.exports = InvoiceGenerator;

// Exemple d'utilisation:
/*
const InvoiceGenerator = require('./invoice-html-generator');
const generator = new InvoiceGenerator();

const invoice = generator.createAndOpen({
  number: 'INV-2025-0001',
  userName: 'Avatar User',
  userEmail: 'avatar@echo.znk',
  userId: 'ZNK-2024-0001',
  tier: 'member',
  amount: 5,
  amountFCFA: 1500,
  created: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
});
*/