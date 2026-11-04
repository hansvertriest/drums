import { z } from 'zod';
import { Answers } from './artifact.js';

/**
 * The messages between an artifact's iframe and the app. The frame runs agent-written
 * code, so whatever it sends is untrusted: always go through `parseFrameMessage`.
 */
const FrameMessage = z.discriminatedUnion('type', [
  z.object({ source: z.literal('drums-artifact'), type: z.literal('ready') }),
  z.object({ source: z.literal('drums-artifact'), type: z.literal('answers'), answers: Answers }),
]);
export type FrameMessage = z.infer<typeof FrameMessage>;

export function parseFrameMessage(data: unknown): FrameMessage | undefined {
  const parsed = FrameMessage.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

/** What the app sends into the frame. Read by the bridge script in `artifact-kit`. */
export type HostMessage =
  | {
      source: 'drums-host';
      type: 'init';
      answers: z.infer<typeof Answers>;
      readOnly: boolean;
      changes: boolean;
    }
  | { source: 'drums-host'; type: 'changes'; on: boolean };
