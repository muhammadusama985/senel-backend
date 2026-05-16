const nodemailer = require("nodemailer");

// Configure transporter based on environment
let transporter = null;
let transporterReady = false;

function getTransporter() {
  if (transporter && transporterReady) return transporter;

  // Check if SMTP is properly configured
  const hasSmtpConfig = process.env.SMTP_USER && 
                        process.env.SMTP_PASS && 
                        process.env.SMTP_USER !== 'your_app_password_here';

  // If SMTP is configured, use it regardless of environment
  if (hasSmtpConfig) {
    console.log("[EMAIL] Using configured SMTP settings");
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    transporterReady = true;
  } else if (process.env.NODE_ENV === "production") {
    // Production without SMTP config - fail
    console.error("[EMAIL] Production mode requires SMTP configuration!");
    return null;
  } else {
    // Development without SMTP - use ethereal for testing
    console.log("[EMAIL] No SMTP config, using ethereal.email test account");
    
    // This is async but we need to handle it synchronously for the first call
    nodemailer.createTestAccount().then(account => {
      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      });
      transporterReady = true;
      console.log("[EMAIL] Ethereal account created:", account.user);
    }).catch(err => {
      console.error("Failed to create ethereal test account:", err);
    });
  }

  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  try {
    const transport = getTransporter();
    
    // Check SMTP config
    const hasSmtpConfig = process.env.SMTP_USER && 
                          process.env.SMTP_PASS && 
                          process.env.SMTP_USER !== 'your_app_password_here';

    // In development without SMTP, log only (no ethereal auto-setup)
    if (!hasSmtpConfig && process.env.NODE_ENV !== "production") {
      console.log("═══════════════════════════════════════════");
      console.log("[DEV EMAIL] - Would send email:");
      console.log("To:", to);
      console.log("Subject:", subject);
      console.log("═══════════════════════════════════════════");
      
      // Try ethereal if available
      if (transport && transporterReady) {
        const info = await transport.sendMail({
          from: process.env.EMAIL_FROM || '"Senel Express" <noreply@senel.com>',
          to,
          subject,
          text,
          html,
        });
        
        if (info.messageId) {
          console.log("📧 Email preview URL:", nodemailer.getTestMessageUrl(info));
        }
      }
      
      return { success: true, preview: true, devMode: true };
    }

    // Production or SMTP configured - send real email
    if (!transport) {
      throw new Error("Email transporter not configured");
    }

    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"Senel Express" <noreply@senel.com>',
      to,
      subject,
      text,
      html,
    });

    console.log("[EMAIL] ✓ Sent successfully to:", to);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[EMAIL] ✗ Failed to send:", error.message);
    
    // In development, don't fail the request - just log
    if (process.env.NODE_ENV !== "production") {
      console.log("═══════════════════════════════════════════");
      console.log("[EMAIL FAILED - DEV MODE]");
      console.log("To:", to);
      console.log("Subject:", subject);
      console.log("Error:", error.message);
      console.log("═══════════════════════════════════════════");
      return { success: true, devMode: true, error: error.message };
    }
    
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };