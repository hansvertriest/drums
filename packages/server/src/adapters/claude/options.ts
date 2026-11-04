import { createSdkMcpServer, tool, type HookCallback, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSessionOptions } from '@drums/core';
import { toMcpTools } from '../../mcp/sdk-tools.js';
import { qualifiedToolName, SERVER_NAME } from './messages.js';

/**
 * A second lock behind the options below: anything else that ever reaches the permission
 * flow is denied here, whatever the SDK's defaults become. Hooks run before everything else.
 */
export function denyOtherTools(allowed: readonly string[]): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse' || allowed.includes(input.tool_name)) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${input.tool_name} is not one of this role's tools.`,
      },
    };
  };
}

/**
 * Agents get exactly their role's tools (until spec §12 decides how prompts look):
 * - `tools: []` takes every built-in out of the session, including subagents and tool search.
 * - `strictMcpConfig` and `settingSources: []` keep out the user's MCP servers, plugins, hooks and rules.
 * - `dontAsk` and `permissionPrompts: 'none'` turn whatever would prompt into a denial.
 * - `allowedTools` approves the role's tools by their full names.
 * Authentication is not touched: the CLI uses whatever login the machine already has.
 */
export function sessionOptions(session: AgentSessionOptions, model: string): Options {
  const allowed = session.tools.map((t) => qualifiedToolName(t.id));
  return {
    cwd: session.cwd,
    model,
    systemPrompt: session.prompt,
    tools: [],
    allowedTools: allowed,
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    settingSources: [],
    strictMcpConfig: true,
    hooks: { PreToolUse: [{ hooks: [denyOtherTools(allowed)] }] },
    mcpServers: {
      [SERVER_NAME]: createSdkMcpServer({
        name: SERVER_NAME,
        // In the prompt from the start: with no built-ins there is no tool search to load them.
        alwaysLoad: true,
        tools: toMcpTools(session.tools).map((t) => tool(t.name, t.description, t.shape, t.handler)),
      }),
    },
  };
}
