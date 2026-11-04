/** For anything that goes between drums' own tags: no text may close one. Titles and answers come from agents and iframes. */
export const escapeXml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
