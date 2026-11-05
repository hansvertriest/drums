import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders paragraphs, lists, code and bold', () => {
    expect(renderMarkdown('One **two**\n\n- a `b`\n- c')).toBe('<p>One <b>two</b></p><ul><li>a <code>b</code></li><li>c</li></ul>');
  });

  it('renders headings, numbered lists after a line, quotes, code blocks, italics and http links only', () => {
    expect(renderMarkdown('## Plan\nFirst:\n1. one\n2. two')).toBe('<h4>Plan</h4><p>First:</p><ol><li>one</li><li>two</li></ol>');
    expect(renderMarkdown('> note')).toBe('<blockquote>note</blockquote>');
    expect(renderMarkdown('Run:\n\n```sh\nnpm *test* <x>\n```\nDone')).toBe('<p>Run:</p><pre><code>npm *test* &lt;x&gt;</code></pre><p>Done</p>');
    expect(renderMarkdown('an *aside* and [docs](https://x.dev/a?b=1)')).toBe('<p>an <i>aside</i> and <a href="https://x.dev/a?b=1" target="_blank" rel="noopener">docs</a></p>');
    expect(renderMarkdown('[bad](javascript:alert(1))')).not.toContain('<a');
  });

  it('renders tables, with alignment, inline marks and text around them', () => {
    const html = renderMarkdown('Totals:\n| Item | Cost |\n|:-----|-----:|\n| `a` | **3** |\n| b |\nAfter');
    expect(html).toBe(
      '<p>Totals:</p><div class="table"><table><thead><tr><th>Item</th><th style="text-align:right">Cost</th></tr></thead>' +
        '<tbody><tr><td><code>a</code></td><td style="text-align:right"><b>3</b></td></tr>' +
        '<tr><td>b</td><td style="text-align:right"></td></tr></tbody></table></div><p>After</p>',
    );
    expect(renderMarkdown('a | b')).toBe('<p>a | b</p>');
  });

  it('lets no tags from the source through', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> `<script>` **<b>**');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;img');
  });
});
