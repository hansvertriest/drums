const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inline = (text: string) =>
  text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isTableRule = (line: string) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

const table = ([head, rule, ...rows]: string[]) => {
  const align = cells(rule!).map((cell) => (cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : undefined));
  const row = (line: string, tag: 'th' | 'td') =>
    `<tr>${align.map((a, i) => `<${tag}${a ? ` style="text-align:${a}"` : ''}>${inline(cells(line)[i] ?? '')}</${tag}>`).join('')}</tr>`;
  return `<div class="table"><table><thead>${row(head!, 'th')}</thead><tbody>${rows.map((line) => row(line, 'td')).join('')}</tbody></table></div>`;
};

const isItem = (line: string) => /^\s*([-*]|\d+[.)]) /.test(line);
const isBullet = (line: string) => /^\s*[-*] /.test(line);

const blocks = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').filter((line) => line.trim());
      const heading = /^#{1,6} (.*)$/.exec(lines[0] ?? '');
      if (heading) return `<h4>${inline(heading[1]!)}</h4>${blocks(lines.slice(1).join('\n'))}`;
      const tableAt = lines.findIndex((line, i) => line.includes('|') && isTableRule(lines[i + 1] ?? ''));
      if (tableAt > 0) return blocks(lines.slice(0, tableAt).join('\n')) + blocks(lines.slice(tableAt).join('\n'));
      if (tableAt === 0) {
        const end = lines.findIndex((line, i) => i > 1 && !line.includes('|'));
        return table(end === -1 ? lines : lines.slice(0, end)) + (end === -1 ? '' : blocks(lines.slice(end).join('\n')));
      }
      const firstItem = lines.findIndex(isItem);
      if (firstItem > 0 && lines.slice(firstItem).every(isItem)) {
        return blocks(lines.slice(0, firstItem).join('\n')) + blocks(lines.slice(firstItem).join('\n'));
      }
      if (lines.length > 0 && lines.every(isItem)) {
        const tag = lines.every(isBullet) ? 'ul' : 'ol';
        return `<${tag}>${lines.map((line) => `<li>${inline(line.replace(/^\s*([-*]|\d+[.)]) /, ''))}</li>`).join('')}</${tag}>`;
      }
      if (lines.length > 0 && lines.every((line) => line.startsWith('&gt; '))) {
        return `<blockquote>${inline(lines.map((line) => line.slice(5)).join('<br>'))}</blockquote>`;
      }
      return lines.length > 0 ? `<p>${inline(lines.join('<br>'))}</p>` : '';
    })
    .join('');

/**
 * The Markdown agents write: headings, paragraphs, lists, tables, quotes, code blocks, `code`, **bold**,
 * *italics* and http links. Everything is escaped first and the only tags in the result come from
 * here, so agent text can't add any.
 */
export function renderMarkdown(source: string): string {
  return escapeHtml(source)
    .split(/^```[^\n]*$\n?/m)
    .map((part, i) => (i % 2 === 1 ? `<pre><code>${part.replace(/\n$/, '')}</code></pre>` : blocks(part)))
    .join('');
}
