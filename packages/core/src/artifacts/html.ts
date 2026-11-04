import { InvalidError } from '../errors.js';
import type { ArtifactKindDefinition } from './artifact-kind.js';

const DOCUMENT_TAG = /<\s*(!doctype|html|head|body)\b/i;

/** A living HTML document, shown in a sandboxed iframe. */
export const htmlArtifactKind: ArtifactKindDefinition = {
  id: 'html',
  name: 'HTML',
  renderer: 'html',
  validate(content) {
    if (content.trim().length === 0) throw new InvalidError('The html is empty.');
    if (DOCUMENT_TAG.test(content)) {
      throw new InvalidError('Send an HTML fragment: no <!doctype>, <html>, <head> or <body>.');
    }
  },
};
