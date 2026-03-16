const nodemailer = require("nodemailer");

// Configure transporter based on environment
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // Production - use real SMTP
  if (process.env.NODE_ENV === "production") {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development - use ethereal.email for testing
    nodemailer.createTestAccount((err, account) => {
      if (err) {
        console.error("Failed to create test email account", err);
        return;
      }

      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      });
    });
  }

  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  try {
    // For development, just log (as you already have)
    if (process.env.NODE_ENV !== "production") {
      console.log("[DEV EMAIL]");
      console.log("To:", to);
      console.log("Subject:", subject);
      console.log("Text:", text?.substring(0, 200) + "...");
      
      // If using ethereal, we'll get preview URL when transporter is ready
      const transport = getTransporter();
      if (transport) {
        const info = await transport.sendMail({
          from: process.env.EMAIL_FROM || '"Senel Express" <noreply@senel.com>',
          to,
          subject,
          text,
          html,
        });
        
        if (info.messageId) {
          console.log("📧 Email preview:", nodemailer.getTestMessageUrl(info));
        }
      }
      
      return { success: true, preview: true };
    }

    // Production - send real email
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"Senel Express" <noreply@senel.com>',
      to,
      subject,
      text,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending failed:", error);
    
    // Fallback to logging in production too
    if (process.env.NODE_ENV === "production") {
      console.error("[EMAIL FAILED]", { to, subject, error: error.message });
    }
    
    return { success: false, error: error.message };
  }
}

module.exports = { sendEmail };