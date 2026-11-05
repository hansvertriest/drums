import { createSdkMcpServer, tool, type CanUseTool, type HookCallback, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentSessionOptions, SystemAccess } from '@drums/core';
import { toMcpTools } from '../../mcp/sdk-tools.js';
import { qualifiedToolName, SERVER_NAME } from './messages.js';
import { boundReads, READ_TOOLS } from './read-bounds.js';

/** What `shell-and-files` means in the SDK's terms. No web, no subagents, no other built-in. */
const SHELL_AND_FILE_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];

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

export interface PermissionChoices {
  /** Where calls the SDK won't decide go, for `shell-and-files`. */
  canUseTool?: CanUseTool | undefined;
  /** Off, a session is in the fallback from the start, as if `auto` weren't available. */
  classifier: boolean;
}

const BY_ACCESS: Record<SystemAccess, (allowed: string[], choices: PermissionChoices, cwd: string) => Partial<Options>> = {
  // Exactly the role's tools. `tools: []` takes every built-in out of the session, including
  // subagents and tool search; `dontAsk` and `permissionPrompts: 'none'` turn whatever would prompt into a denial.
  'tools-only': (allowed) => ({
    tools: [],
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    hooks: { PreToolUse: [{ hooks: [denyOtherTools(allowed)] }] },
  }),
  // As above, plus the read tools. Approved up front, so `boundReads` is what keeps them in the workspace folder.
  'read-files': (allowed, _choices, cwd) => ({
    tools: READ_TOOLS,
    allowedTools: [...allowed, ...READ_TOOLS],
    permissionMode: 'dontAsk',
    permissionPrompts: 'none',
    hooks: { PreToolUse: [{ hooks: [denyOtherTools([...allowed, ...READ_TOOLS]), boundReads(cwd)] }] },
  }),
  // A shell and file tools. `auto` has a classifier approve or deny each call, and what it can't decide
  // comes to `canUseTool`. An account or model without `auto` starts in `default` instead, where everything
  // that needs approval comes to `canUseTool`. Never a bypass mode: the working directory bounds nothing.
  'shell-and-files': (allowed, { canUseTool, classifier }) => ({
    tools: SHELL_AND_FILE_TOOLS,
    permissionMode: classifier ? 'auto' : 'default',
    ...(canUseTool ? { canUseTool } : {}),
    hooks: { PreToolUse: [{ hooks: [denyOtherTools([...allowed, ...SHELL_AND_FILE_TOOLS])] }] },
  }),
};

/**
 * What every session shares: `strictMcpConfig` and `settingSources: []` keep out the user's MCP
 * servers, plugins, hooks and rules, and `allowedTools` approves drums' tools by their full names.
 * Authentication is not touched: the CLI uses whatever login the machine already has.
 */
export function sessionOptions(session: AgentSessionOptions, model: string, choices: PermissionChoices): Options {
  const allowed = session.tools.map((t) => qualifiedToolName(t.id));
  return {
    cwd: session.cwd,
    model,
    systemPrompt: session.prompt,
    allowedTools: allowed,
    settingSources: [],
    strictMcpConfig: true,
    ...BY_ACCESS[session.access](allowed, choices, session.cwd),
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
