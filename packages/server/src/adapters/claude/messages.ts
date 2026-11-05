import type { AgentEvent } from '@drums/core';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { writtenFiles } from './file-writes.js';

const SUMMARY_LENGTH = 120;

/** The server name goes in tool names: `mcp__drums__post`. */
export const SERVER_NAME = 'drums';
const qualifiedPrefix = `mcp__${SERVER_NAME}__`;

export const qualifiedToolName = (id: string) => `${qualifiedPrefix}${id}`;

const toolName = (name: string) => (name.startsWith(qualifiedPrefix) ? name.slice(qualifiedPrefix.length) : name);

/** A line for the Steps view. Big values like a whole artifact's HTML are cut short. */
export function summarize(input: unknown, length = SUMMARY_LENGTH): string {
  if (typeof input !== 'object' || input === null) return '';
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' · ')
    .replace(/\s+/g, ' ')
    .slice(0, length);
}

function fromAssistant(message: Extract<SDKMessage, { type: 'assistant' }>, cwd: string): AgentEvent[] {
  return message.message.content.flatMap((block): AgentEvent[] => {
    if (block.type === 'text' && block.text.trim()) return [{ type: 'text', text: block.text }];
    if (block.type !== 'tool_use') return [];
    const writes = writtenFiles(cwd, block.name, block.input);
    return [{ type: 'step', tool: toolName(block.name), summary: summarize(block.input), ...(writes.length > 0 ? { writes } : {}) }];
  });
}

function fromResult(message: Extract<SDKMessage, { type: 'result' }>): AgentEvent {
  if (message.subtype === 'success' && !message.is_error) return { type: 'turn.ended', outcome: 'success' };
  const error =
    message.subtype === 'success' ? message.result : message.errors.join('\n') || `The turn ended with ${message.subtype}.`;
  return { type: 'turn.ended', outcome: 'error', error };
}

/** Everything drums cares about in the SDK's stream. All SDK message shapes stay in this file. */
export function toAgentEvents(message: SDKMessage, cwd: string): AgentEvent[] {
  if (message.type === 'system' && message.subtype === 'init') return [{ type: 'session', sessionId: message.session_id }];
  if (message.type === 'system' && message.subtype === 'permission_denied') {
    return [{ type: 'step', tool: 'denied', summary: `${toolName(message.tool_name)}: ${message.decision_reason ?? 'refused by the permission check'}`.slice(0, SUMMARY_LENGTH) }];
  }
  if (message.type === 'assistant') return fromAssistant(message, cwd);
  if (message.type === 'result') return [fromResult(message)];
  return [];
}
