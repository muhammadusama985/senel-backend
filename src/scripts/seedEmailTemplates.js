const mongoose = require("mongoose");
const EmailTemplate = require("../models/EmailTemplate");
require("dotenv").config();

const templates = [
  {
    key: "daily_sales_report",
    subjectML: {
      en: "Daily Sales Report - {{date}}",
      de: "Täglicher Verkaufsbericht - {{date}}",
      tr: "Günlük Satış Raporu - {{date}}"
    },
    htmlBodyML: {
      en: `
        <h1>Daily Sales Report</h1>
        <p>Date: {{date}}</p>
        <p>Total Sales: €{{totalSales}}</p>
        <p>Total Orders: {{totalOrders}}</p>
        <p>Average Order Value: €{{averageOrderValue}}</p>
      `,
      de: `
        <h1>Täglicher Verkaufsbericht</h1>
        <p>Datum: {{date}}</p>
        <p>Gesamtumsatz: €{{totalSales}}</p>
        <p>Gesamtbestellungen: {{totalOrders}}</p>
        <p>Durchschnittlicher Bestellwert: €{{averageOrderValue}}</p>
      `,
      tr: `
        <h1>Günlük Satış Raporu</h1>
        <p>Tarih: {{date}}</p>
        <p>Toplam Satış: €{{totalSales}}</p>
        <p>Toplam Sipariş: {{totalOrders}}</p>
        <p>Ortalama Sipariş Değeri: €{{averageOrderValue}}</p>
      `
    },
    textBodyML: {
      en: "Daily Sales Report\nDate: {{date}}\nTotal Sales: €{{totalSales}}\nTotal Orders: {{totalOrders}}\nAverage Order Value: €{{averageOrderValue}}",
      de: "Täglicher Verkaufsbericht\nDatum: {{date}}\nGesamtumsatz: €{{totalSales}}\nGesamtbestellungen: {{totalOrders}}\nDurchschnittlicher Bestellwert: €{{averageOrderValue}}",
      tr: "Günlük Satış Raporu\nTarih: {{date}}\nToplam Satış: €{{totalSales}}\nToplam Sipariş: {{totalOrders}}\nOrtalama Sipariş Değeri: €{{averageOrderValue}}"
    },
    description: "Daily sales report sent to admins"
  },
  {
    key: "weekly_analytics_report",
    subjectML: {
      en: "Weekly Analytics Report - {{startDate}} to {{endDate}}",
      de: "Wöchentlicher Analysebericht - {{startDate}} bis {{endDate}}",
      tr: "Haftalık Analiz Raporu - {{startDate}} - {{endDate}}"
    },
    htmlBodyML: {
      en: `
        <h1>Weekly Analytics Report</h1>
        <p>Period: {{startDate}} - {{endDate}}</p>
        <p>Total Revenue: €{{totalRevenue}}</p>
        <p>Total Orders: {{totalOrders}}</p>
        <p>Average Order Value: €{{averageOrderValue}}</p>
        <h2>Top Vendors</h2>
        <ul>
          {{#each topVendors}}
          <li>{{name}}: €{{revenue}} ({{orders}} orders)</li>
          {{/each}}
        </ul>
      `,
      de: `
        <h1>Wöchentlicher Analysebericht</h1>
        <p>Zeitraum: {{startDate}} - {{endDate}}</p>
        <p>Gesamtumsatz: €{{totalRevenue}}</p>
        <p>Gesamtbestellungen: {{totalOrders}}</p>
        <p>Durchschnittlicher Bestellwert: €{{averageOrderValue}}</p>
        <h2>Top-Anbieter</h2>
        <ul>
          {{#each topVendors}}
          <li>{{name}}: €{{revenue}} ({{orders}} Bestellungen)</li>
          {{/each}}
        </ul>
      `,
      tr: `
        <h1>Haftalık Analiz Raporu</h1>
        <p>Dönem: {{startDate}} - {{endDate}}</p>
        <p>Toplam Gelir: €{{totalRevenue}}</p>
        <p>Toplam Sipariş: {{totalOrders}}</p>
        <p>Ortalama Sipariş Değeri: €{{averageOrderValue}}</p>
        <h2>En İyi Satıcılar</h2>
        <ul>
          {{#each topVendors}}
          <li>{{name}}: €{{revenue}} ({{orders}} sipariş)</li>
          {{/each}}
        </ul>
      `
    },
    textBodyML: {
      en: "Weekly Analytics Report\nPeriod: {{startDate}} - {{endDate}}\nTotal Revenue: €{{totalRevenue}}\nTotal Orders: {{totalOrders}}\nAverage Order Value: €{{averageOrderValue}}\n\nTop Vendors:\n{{#each topVendors}}{{name}}: €{{revenue}} ({{orders}} orders)\n{{/each}}",
      de: "Wöchentlicher Analysebericht\nZeitraum: {{startDate}} - {{endDate}}\nGesamtumsatz: €{{totalRevenue}}\nGesamtbestellungen: {{totalOrders}}\nDurchschnittlicher Bestellwert: €{{averageOrderValue}}\n\nTop-Anbieter:\n{{#each topVendors}}{{name}}: €{{revenue}} ({{orders}} Bestellungen)\n{{/each}}",
      tr: "Haftalık Analiz Raporu\nDönem: {{startDate}} - {{endDate}}\nToplam Gelir: €{{totalRevenue}}\nToplam Sipariş: {{totalOrders}}\nOrtalama Sipariş Değeri: €{{averageOrderValue}}\n\nEn İyi Satıcılar:\n{{#each topVendors}}{{name}}: €{{revenue}} ({{orders}} sipariş)\n{{/each}}"
    },
    description: "Weekly analytics report with top vendors"
  },
  {
    key: "monthly_performance_report",
    subjectML: {
      en: "Monthly Performance Report - {{month}}",
      de: "Monatlicher Leistungsbericht - {{month}}",
      tr: "Aylık Performans Raporu - {{month}}"
    },
    htmlBodyML: {
      en: `
        <h1>Monthly Performance Report</h1>
        <p>Month: {{month}}</p>
        <p>Total Revenue: €{{totalRevenue}}</p>
        <p>Total Orders: {{totalOrders}}</p>
        <p>Download full report: <a href="{{downloadLink}}">Excel Report</a></p>
      `,
      de: `
        <h1>Monatlicher Leistungsbericht</h1>
        <p>Monat: {{month}}</p>
        <p>Gesamtumsatz: €{{totalRevenue}}</p>
        <p>Gesamtbestellungen: {{totalOrders}}</p>
        <p>Vollständigen Bericht herunterladen: <a href="{{downloadLink}}">Excel-Bericht</a></p>
      `,
      tr: `
        <h1>Aylık Performans Raporu</h1>
        <p>Ay: {{month}}</p>
        <p>Toplam Gelir: €{{totalRevenue}}</p>
        <p>Toplam Sipariş: {{totalOrders}}</p>
        <p>Tam raporu indir: <a href="{{downloadLink}}">Excel Raporu</a></p>
      `
    },
    textBodyML: {
      en: "Monthly Performance Report\nMonth: {{month}}\nTotal Revenue: €{{totalRevenue}}\nTotal Orders: {{totalOrders}}\nDownload full report: {{downloadLink}}",
      de: "Monatlicher Leistungsbericht\nMonat: {{month}}\nGesamtumsatz: €{{totalRevenue}}\nGesamtbestellungen: {{totalOrders}}\nVollständigen Bericht herunterladen: {{downloadLink}}",
      tr: "Aylık Performans Raporu\nAy: {{month}}\nToplam Gelir: €{{totalRevenue}}\nToplam Sipariş: {{totalOrders}}\nTam raporu indir: {{downloadLink}}"
    },
    description: "Monthly performance report with download link"
  },
  {
    key: "low_stock_alert",
    subjectML: {
      en: "Low Stock Alert - {{vendorName}}",
      de: "Lagerbestandswarnung - {{vendorName}}",
      tr: "Düşük Stok Uyarısı - {{vendorName}}"
    },
    htmlBodyML: {
      en: `
        <h1>Low Stock Alert</h1>
        <p>Dear {{vendorName}},</p>
        <p>The following products are low on stock:</p>
        <pre>{{products}}</pre>
        <p>Please restock soon to avoid running out.</p>
      `,
      de: `
        <h1>Lagerbestandswarnung</h1>
        <p>Sehr geehrte/r {{vendorName}},</p>
        <p>Die folgenden Produkte sind bald ausverkauft:</p>
        <pre>{{products}}</pre>
        <p>Bitte bestellen Sie bald nach, um Engpässe zu vermeiden.</p>
      `,
      tr: `
        <h1>Düşük Stok Uyarısı</h1>
        <p>Sayın {{vendorName}},</p>
        <p>Aşağıdaki ürünlerin stoğu azaldı:</p>
        <pre>{{products}}</pre>
        <p>Lütfen yakında yeniden stoklayın.</p>
      `
    },
    textBodyML: {
      en: "Low Stock Alert\nDear {{vendorName}},\n\nThe following products are low on stock:\n{{products}}\n\nPlease restock soon to avoid running out.",
      de: "Lagerbestandswarnung\nSehr geehrte/r {{vendorName}},\n\nDie folgenden Produkte sind bald ausverkauft:\n{{products}}\n\nBitte bestellen Sie bald nach, um Engpässe zu vermeiden.",
      tr: "Düşük Stok Uyarısı\nSayın {{vendorName}},\n\nAşağıdaki ürünlerin stoğu azaldı:\n{{products}}\n\nLütfen yakında yeniden stoklayın."
    },
    description: "Alert sent to vendors when products are low on stock"
  },
  {
    key: "order_confirmation",
    subjectML: {
      en: "Order Confirmation #{{orderNumber}}",
      de: "Bestellbestätigung #{{orderNumber}}",
      tr: "Sipariş Onayı #{{orderNumber}}"
    },
    htmlBodyML: {
      en: `
        <h1>Thank you for your order!</h1>
        <p>Order #{{orderNumber}}</p>
        <p>Total: €{{orderTotal}}</p>
        <p>We'll notify you when your order ships.</p>
      `,
      de: `
        <h1>Vielen Dank für Ihre Bestellung!</h1>
        <p>Bestellnummer #{{orderNumber}}</p>
        <p>Gesamtbetrag: €{{orderTotal}}</p>
        <p>Wir benachrichtigen Sie, wenn Ihre Bestellung versandt wird.</p>
      `,
      tr: `
        <h1>Siparişiniz için teşekkürler!</h1>
        <p>Sipariş #{{orderNumber}}</p>
        <p>Toplam: €{{orderTotal}}</p>
        <p>Siparişiniz gönderildiğinde sizi bilgilendireceğiz.</p>
      `
    },
    textBodyML: {
      en: "Thank you for your order!\nOrder #{{orderNumber}}\nTotal: €{{orderTotal}}\nWe'll notify you when your order ships.",
      de: "Vielen Dank für Ihre Bestellung!\nBestellnummer #{{orderNumber}}\nGesamtbetrag: €{{orderTotal}}\nWir benachrichtigen Sie, wenn Ihre Bestellung versandt wird.",
      tr: "Siparişiniz için teşekkürler!\nSipariş #{{orderNumber}}\nToplam: €{{orderTotal}}\nSiparişiniz gönderildiğinde sizi bilgilendireceğiz."
    },
    description: "Sent to customer after successful checkout"
  },
  {
    key: "password_reset",
    subjectML: {
      en: "Password Reset Code",
      de: "Passwort zurücksetzen Code",
      tr: "Şifre Sıfırlama Kodu"
    },
    htmlBodyML: {
      en: `
        <h1>Password Reset</h1>
        <p>Your password reset code is: <strong>{{otp}}</strong></p>
        <p>This code expires in {{expiryMinutes}} minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      de: `
        <h1>Passwort zurücksetzen</h1>
        <p>Ihr Code zum Zurücksetzen des Passworts lautet: <strong>{{otp}}</strong></p>
        <p>Dieser Code läuft in {{expiryMinutes}} Minuten ab.</p>
        <p>Wenn Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail bitte.</p>
      `,
      tr: `
        <h1>Şifre Sıfırlama</h1>
        <p>Şifre sıfırlama kodunuz: <strong>{{otp}}</strong></p>
        <p>Bu kod {{expiryMinutes}} dakika içinde geçerliliğini yitirecek.</p>
        <p>Bunu siz talep etmediyseniz, bu e-postayı dikkate almayın.</p>
      `
    },
    textBodyML: {
      en: "Password Reset\nYour password reset code is: {{otp}}\nThis code expires in {{expiryMinutes}} minutes.\nIf you didn't request this, please ignore this email.",
      de: "Passwort zurücksetzen\nIhr Code zum Zurücksetzen des Passworts lautet: {{otp}}\nDieser Code läuft in {{expiryMinutes}} Minuten ab.\nWenn Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail bitte.",
      tr: "Şifre Sıfırlama\nŞifre sıfırlama kodunuz: {{otp}}\nBu kod {{expiryMinutes}} dakika içinde geçerliliğini yitirecek.\nBunu siz talep etmediyseniz, bu e-postayı dikkate almayın."
    },
    description: "Sent to users when they request password reset"
  }
];

async function seedTemplates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    for (const template of templates) {
      const existing = await EmailTemplate.findOne({ key: template.key });
      
      if (existing) {
        await EmailTemplate.updateOne(
          { key: template.key },
          { $set: template }
        );
        console.log(`🔄 Updated template: ${template.key}`);
      } else {
        await EmailTemplate.create(template);
        console.log(`✅ Created template: ${template.key}`);
      }
    }

    console.log("\n🎉 Email templates seeded successfully!");
    console.log(`📊 Total templates: ${templates.length}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding templates:", error);
    process.exit(1);
  }
}

seedTemplates();