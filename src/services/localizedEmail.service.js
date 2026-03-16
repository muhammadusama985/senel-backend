const User = require("../models/User");
const EmailTemplate = require("../models/EmailTemplate");
const { sendEmail } = require("./email.service");
const { renderTemplate } = require("../utils/templateRenderer");

/**
 * Send a localized email to a user
 * @param {Object} params
 * @param {string} params.toUserId - User ID
 * @param {string} params.templateKey - Email template key (e.g., "order_confirmation")
 * @param {Object} params.variables - Variables to replace in template
 * @param {string} params.language - Override language (optional)
 */
async function sendLocalizedEmail({ 
  toUserId, 
  templateKey, 
  variables = {}, 
  language = null 
}) {
  try {
    // Get user to determine language and email
    const user = await User.findById(toUserId).select("email preferredLanguage").lean();
    if (!user || !user.email) {
      console.error("User or email not found:", toUserId);
      return { success: false, reason: "User or email not found" };
    }

    // Determine language (provided > user preference > en)
    const lang = language || user.preferredLanguage || "en";

    // Get template
    const template = await EmailTemplate.findOne({ 
      key: templateKey, 
      isActive: true 
    }).lean();

    if (!template) {
      console.error("Email template not found:", templateKey);
      return { success: false, reason: "Template not found" };
    }

    // Resolve template content based on language
    const subject = template.subjectML?.[lang] || template.subjectML?.en || template.subject;
    const htmlBody = template.htmlBodyML?.[lang] || template.htmlBodyML?.en || template.htmlBody;
    const textBody = template.textBodyML?.[lang] || template.textBodyML?.en || template.textBody;

    if (!subject || !htmlBody) {
      console.error("Template missing content for language:", lang);
      return { success: false, reason: "Template content missing" };
    }

    // Render templates with variables
    const renderedSubject = renderTemplate(subject, variables);
    const renderedHtml = renderTemplate(htmlBody, variables);
    const renderedText = textBody ? renderTemplate(textBody, variables) : 
                        renderTemplate(htmlBody.replace(/<[^>]*>/g, ""), variables);

    // Send email
    const result = await sendEmail({
      to: user.email,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
    });

    return { 
      success: result.success, 
      messageId: result.messageId,
      language: lang,
      template: templateKey,
    };
  } catch (error) {
    console.error("Localized email failed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a simple email with direct content (no template)
 */
async function sendDirectEmail({ 
  toUserId, 
  subject, 
  html, 
  text = "" 
}) {
  try {
    const user = await User.findById(toUserId).select("email").lean();
    if (!user || !user.email) {
      return { success: false, reason: "User not found" };
    }

    return await sendEmail({
      to: user.email,
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error("Direct email failed:", error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendLocalizedEmail, sendDirectEmail };