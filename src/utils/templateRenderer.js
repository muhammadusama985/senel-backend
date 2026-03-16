/**
 * Renders a template by replacing {{variable}} placeholders
 * @param {string} template - The template string with {{variable}} placeholders
 * @param {object} variables - Object containing variable values
 * @returns {string} - Rendered string
 */
function renderTemplate(template, variables = {}) {
  if (!template) return "";

  return template.replace(/{{\s*([\w.]+)\s*}}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

module.exports = { renderTemplate };