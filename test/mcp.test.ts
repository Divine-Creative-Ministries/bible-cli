import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/mcp/server.js';

const toolNames = (server: unknown): string[] =>
  Object.keys((server as { _registeredTools?: Record<string, unknown> })._registeredTools ?? {});

const STUDY_TOOLS = ['study_start', 'study_next', 'study_prev', 'study_goto', 'study_note', 'study_notes', 'study_coverage', 'study_review'];

describe('MCP tool gating', () => {
  it('never exposes study tools on the default (HTTP) server — sessions are local files', () => {
    const names = toolNames(buildServer());
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => n.startsWith('study_'))).toEqual([]);
  });

  it('registers the study tools for stdio (includeLocalState)', () => {
    const names = toolNames(buildServer({ includeLocalState: true }));
    for (const t of STUDY_TOOLS) expect(names).toContain(t);
  });
});
