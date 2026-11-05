import Anthropic from '@anthropic-ai/sdk';
import type { PickCall } from './role-pick-prompt.js';

/** A short answer: the instructions are a sentence or two, and thinking counts towards this. */
const MAX_TOKENS = 4000;

export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming, options: { signal: AbortSignal }) => Promise<Anthropic.Message>;

export interface ApiCallOptions {
  model: string;
  apiKey: string;
  /** The SDK's call; tests replace it so they never reach the model. */
  createMessage?: CreateMessage | undefined;
}

/** The Anthropic API with structured output. JSON if the model answered; anything else means no answer. */
export function createApiCall({ model, apiKey, createMessage }: ApiCallOptions) {
  // No retries: the caller has one time limit for the whole call, and a fallback for when it passes.
  const send: CreateMessage = createMessage ?? ((params, options) => new Anthropic({ apiKey, maxRetries: 0 }).messages.create(params, options));
  return async ({ system, user, schema }: PickCall, signal: AbortSignal): Promise<unknown> => {
    const response = await send(
      {
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      },
      { signal },
    );
    // A refusal or a cut-off answer has no JSON to read.
    if (response.stop_reason !== 'end_turn') return undefined;
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    return JSON.parse(text);
  };
}
