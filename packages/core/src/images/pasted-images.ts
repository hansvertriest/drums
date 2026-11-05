import { imageExtension, type ImageName, type ImageType, type WorkspaceId } from '@drums/protocol';
import type { Ids } from '../ports/ids.js';
import type { Store } from '../ports/store.js';

export interface PastedImage {
  type: ImageType;
  bytes: Uint8Array;
}

export interface SavedImage {
  name: ImageName;
  /** Where it is, for the agent to read. */
  path: string;
}

export const savePastedImages = (store: Store, ids: Ids, workspace: WorkspaceId, images: readonly PastedImage[]): Promise<SavedImage[]> =>
  Promise.all(
    images.map(async ({ type, bytes }) => {
      const name = `${ids.next()}.${imageExtension(type)}`;
      return { name, path: await store.saveImage(workspace, name, bytes) };
    }),
  );

/** What follows the user's text, so the agent knows to look. Nothing without images. */
export function imagesBlock(saved: readonly SavedImage[]): string {
  if (saved.length === 0) return '';
  const what = saved.length === 1 ? 'an image' : `${saved.length} images`;
  const them = saved.length === 1 ? 'it' : 'them';
  return `\n\n<drums-images>\nThe user pasted ${what} with this message. Look at ${them} with Read:\n${saved.map(({ path }) => `- ${path}`).join('\n')}\n</drums-images>`;
}
