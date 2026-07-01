import { describe, expect, it } from 'vitest';
import { AGENT_TEMPLATES, getAgentTemplate } from './agent-templates';
import { compileFlow } from './flow-compiler';
import { buildSystemPrompt, estimateTokens, lintPersona, personaSchema } from './persona';

describe('persona', () => {
  it('composes a system prompt from the structured persona', () => {
    const p = personaSchema.parse({
      role: 'a friendly receptionist',
      tone: 'warm',
      instructions: 'Help the caller book a table.',
      guardrails: ['Be concise'],
      bannedWords: ['cheap'],
    });
    const prompt = buildSystemPrompt(p);
    expect(prompt).toContain('You are a friendly receptionist.');
    expect(prompt).toContain('warm tone');
    expect(prompt).toContain('- Be concise');
    expect(prompt).toContain('Never say: cheap.');
  });

  it('uses the explicit systemPrompt override when set', () => {
    const p = personaSchema.parse({ role: 'x', systemPrompt: 'OVERRIDE' });
    expect(buildSystemPrompt(p)).toBe('OVERRIDE');
  });

  it('lints: flags a banned word that appears in the instructions', () => {
    const p = personaSchema.parse({
      role: 'agent',
      instructions: 'Tell them it is cheap.',
      bannedWords: ['cheap'],
      guardrails: ['x'],
    });
    const lint = lintPersona(p);
    expect(lint.warnings.some((w) => w.includes('cheap'))).toBe(true);
    expect(lint.tokens).toBe(estimateTokens(buildSystemPrompt(p)));
  });

  it('lints: warns on a missing role', () => {
    expect(lintPersona(personaSchema.parse({})).warnings.some((w) => w.includes('No role'))).toBe(
      true,
    );
  });
});

describe('agent templates', () => {
  it('has the five categories and each is retrievable', () => {
    expect(AGENT_TEMPLATES).toHaveLength(5);
    for (const t of AGENT_TEMPLATES) {
      expect(getAgentTemplate(t.id)?.id).toBe(t.id);
      expect(t.persona.role.length).toBeGreaterThan(0);
    }
  });

  it("every template's starter graph compiles to a runnable spec", () => {
    for (const t of AGENT_TEMPLATES) {
      const res = compileFlow(t.graph);
      expect(res.ok, `${t.id} should compile`).toBe(true);
    }
  });
});
