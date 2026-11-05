import { z } from 'zod';

/** A pasted image, kept in the workspace. */
export const ImageType = z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export type ImageType = z.infer<typeof ImageType>;

const EXTENSIONS: Record<ImageType, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/** The extension says its type. */
export const ImageName = z.string().regex(new RegExp(`^[A-Za-z0-9-]{1,64}\\.(${Object.values(EXTENSIONS).join('|')})$`));
export type ImageName = z.infer<typeof ImageName>;

export const imageExtension = (type: ImageType) => EXTENSIONS[type];

export const imageTypeOf = (name: ImageName) => ImageType.options.find((type) => name.endsWith(`.${EXTENSIONS[type]}`));

export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 10_000_000;
/** What `MAX_IMAGE_BYTES` comes to in base64. */
export const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
/** The largest message body: every image at its limit, and room for the text and the JSON around them. */
export const MAX_MESSAGE_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_BASE64 + 1_000_000;
