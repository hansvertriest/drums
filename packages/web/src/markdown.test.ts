import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders paragraphs, lists, code and bold', () => {
    expect(renderMarkdown('One **two**\n\n- a `b`\n- c')).toBe('<p>One <b>two</b></p><ul><li>a <code>b</code></li><li>c</li></ul>');
  });

  it('lets no tags from the source through', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> `<script>` **<b>**');
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain('&lt;img');
  });
});
