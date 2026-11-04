const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inline = (text: string) =>
  text.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

/**
 * The little Markdown posts use: paragraphs, lists, `code` and **bold**. Everything is
 * escaped first and the only tags in the result come from here, so agent text can't add any.
 */
export function renderMarkdown(source: string): string {
  return escapeHtml(source)
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim());
      if (lines.length > 0 && lines.every((line) => /^\s*[-*] /.test(line))) {
        return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${inline(lines.join('<br>'))}</p>`;
    })
    .join('');
}
