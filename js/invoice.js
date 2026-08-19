// routes/invoice.js
const PDFDocument = require('pdfkit');
const fs = require('fs');

app.post('/generate-invoice', async (req, res) => {
  const { userId, tier } = req.body;
  const user = await User.findById(userId);
  
  // Génération numéro facture unique
  const invoiceNumber = `ZNK-${new Date().getFullYear()}-${Date.now()}`;
  
  // Prix selon tier
  const prices = {
    member: { eur: 5, fcfa: 1500 },
    memberPlus: { eur: 10, fcfa: 4000 }
  };
  
  const price = prices[tier];
  
  // Création PDF
  const doc = new PDFDocument();
  const filename = `invoice-${invoiceNumber}.pdf`;
  const filepath = `/media-uploads/invoices/${filename}`;
  
  doc.pipe(fs.createWriteStream(filepath));
  
  // Header
  doc.fontSize(25).text('ZNK FACTURE', { align: 'center' });
  doc.moveDown();
  
  // Infos facture
  doc.fontSize(12);
  doc.text(`Numéro: ${invoiceNumber}`);
  doc.text(`Date: ${new Date().toLocaleDateString()}`);
  doc.text(`Client: ${user.username} (${user.email})`);
  doc.moveDown();
  
  // Détails abonnement
  doc.text(`Abonnement: ${tier === 'member' ? 'Membre' : 'Membre+'}`);
  doc.text(`Montant: ${price.eur}€ / ${price.fcfa} FCFA`);
  doc.text(`Durée: 1 mois (renouvelable)`);
  doc.moveDown();
  
  // Infos paiement ZNK
  doc.fontSize(14).text('Moyens de paiement:', { underline: true });
  doc.fontSize(11);
  doc.text('Mobile Money:');
  doc.text('  • Orange Money: +237 6XX XXX XXX');
  doc.text('  • MTN MoMo: +237 6XX XXX XXX');
  doc.moveDown();
  doc.text('Virement bancaire:');
  doc.text('  • Banque: XXX');
  doc.text('  • IBAN: CM21 XXXX XXXX XXXX');
  doc.text('  • Titulaire: ZNK237');
  doc.moveDown();
  
  // Instructions
  doc.fontSize(10);
  doc.text('Après paiement:', { underline: true });
  doc.text('1. Prenez capture écran du reçu');
  doc.text('2. Uploadez dans ZNK > Profil > "Activer abonnement"');
  doc.text('3. Activation sous 24h max');
  doc.moveDown();
  
  // Footer
  doc.fontSize(8);
  doc.text(`Valide jusqu'au: ${new Date(Date.now() + 7*24*60*60*1000).toLocaleDateString()}`);
  doc.text('Facture générée automatiquement par ZNK237');
  
  doc.end();
  
  // Sauvegarde en DB
  await Invoice.create({
    number: invoiceNumber,
    userId: user.id,
    tier,
    amount: price,
    status: 'pending', // pending, paid, expired
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7*24*60*60*1000)
  });
  
  res.json({ 
    success: true, 
    invoiceUrl: `/invoices/${filename}`,
    invoiceNumber 
  });
});