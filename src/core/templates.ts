import { AppError } from './errors';
import { mergeTemplate } from './project';
import type { Block, BlockId, Project, TextTemplate } from './types';

/**
 * TemplateManager (spec §16–19, §81).
 *
 * One imported JSON template initially applies to every block. Each block then keeps
 * its own override copy; the global template is never mutated by a local edit.
 */

export interface TemplateValidationOk {
  ok: true;
  template: TextTemplate;
  warnings: string[];
}
export interface TemplateValidationFail {
  ok: false;
  error: AppError;
}
export type TemplateValidation = TemplateValidationOk | TemplateValidationFail;

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Accepts `[{text}]`, `["a","b"]`, `"a"` and objects with a `lines`/`items`/`keywords` key. */
function asStringList(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) {
      const direct = asString(item);
      if (direct !== null) {
        out.push(direct);
        continue;
      }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        const nested = asString(obj.text ?? obj.value ?? obj.label ?? obj.title);
        if (nested !== null) out.push(nested);
      }
    }
    return out;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('lines' in obj) return asStringList(obj.lines);
    if ('items' in obj) return asStringList(obj.items);
    if ('values' in obj) return asStringList(obj.values);
  }
  return null;
}

export function validateTemplate(raw: unknown): TemplateValidation {
  const warnings: string[] = [];
  if (raw === null || raw === undefined) {
    return { ok: false, error: new AppError('invalid-template', 'Template is empty.', { hint: 'A template must be a JSON object.' }) };
  }
  if (typeof raw === 'string') {
    return { ok: true, template: { title: raw, subtitle: '', items: [], keywords: [] }, warnings: ['Plain text imported as the title.'] };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      error: new AppError('invalid-template', 'Invalid template: expected a JSON object.', {
        detail: `Received ${Array.isArray(raw) ? 'an array' : typeof raw}`,
        hint: '{ "title": "...", "subtitle": "...", "items": ["..."], "keywords": ["..."] }',
      }),
    };
  }

  const source = raw as Record<string, unknown>;
  const nestedTemplate =
    source.template && typeof source.template === 'object' ? (source.template as Record<string, unknown>) : null;
  const src = nestedTemplate ? { ...nestedTemplate, ...source } : source;

  const title = asString(src.title ?? src.heading ?? src.h1) ?? '';
  const subtitle = asString(src.subtitle ?? src.sub ?? src.description) ?? '';
  const items = asStringList(src.items ?? src.lines ?? src.list ?? src.services);
  const keywords = asStringList(src.keywords ?? src.words ?? src.tags ?? src.directions);

  if (!title && !subtitle && !items?.length && !keywords?.length) {
    return {
      ok: false,
      error: new AppError('invalid-template', 'Invalid template: no recognised fields.', {
        detail: 'Looked for title / subtitle / items / keywords (and heading, lines, words).',
        hint: '{ "title": "Авто", "subtitle": "Организуем перевозки", "items": ["Автокомпонентов"], "keywords": ["Электроника"] }',
      }),
    };
  }

  if (items === null) {
    warnings.push('No `items` array found — the block will show only title / subtitle / keywords.');
  }
  if (keywords === null) warnings.push('No `keywords` array found — the fading word list will be empty.');

  return {
    ok: true,
    template: {
      title,
      subtitle,
      items: items ?? [],
      keywords: keywords ?? [],
    },
    warnings,
  };
}

export function parseTemplateJson(text: string): TemplateValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: new AppError('invalid-json', 'Invalid template JSON: parse error.', {
        detail: err instanceof Error ? err.message : String(err),
      }),
    };
  }
  return validateTemplate(parsed);
}

export interface ApplyTemplateOptions {
  /** discard per-block text overrides and re-copy the template into every block */
  discardOverrides?: boolean;
}

/**
 * Replace the global template. Blocks that follow the template are updated through the
 * stored template itself; blocks with local overrides keep them unless explicitly discarded.
 */
export function applyGlobalTemplate(project: Project, template: TextTemplate, options: ApplyTemplateOptions = {}): Project {
  const blocks = { ...project.blocks.byId };
  let touched = false;
  if (options.discardOverrides) {
    for (const id of project.blocks.order) {
      const block = blocks[id];
      if (block?.textOverride) {
        blocks[id] = { ...block, textOverride: null };
        touched = true;
      }
    }
  }
  return {
    ...project,
    template,
    blocks: touched ? { ...project.blocks, byId: blocks } : project.blocks,
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export function resetAllBlockText(project: Project): Project {
  const byId = { ...project.blocks.byId };
  for (const id of project.blocks.order) {
    const block = byId[id];
    if (block) byId[id] = { ...block, textOverride: null };
  }
  return { ...project, blocks: { ...project.blocks, byId } };
}

export function copyTextToAllBlocks(project: Project, fromBlockId: BlockId): Project {
  const source = project.blocks.byId[fromBlockId];
  if (!source) return project;
  const override = source.textOverride ? JSON.parse(JSON.stringify(source.textOverride)) : null;
  const byId = { ...project.blocks.byId };
  for (const id of project.blocks.order) {
    const block = byId[id];
    if (!block) continue;
    byId[id] = { ...block, textOverride: override ? JSON.parse(JSON.stringify(override)) : null };
  }
  return { ...project, blocks: { ...project.blocks, byId } };
}

/** Effective text of a block = template ⊕ local override. */
export function resolveBlockText(project: Project, block: Block): TextTemplate {
  return mergeTemplate(project.template, block.textOverride);
}

export function textOverrideStats(project: Project): { overridden: number; inherited: number } {
  let overridden = 0;
  for (const id of project.blocks.order) {
    const block = project.blocks.byId[id];
    if (block?.textOverride && Object.keys(block.textOverride).length) overridden += 1;
  }
  return { overridden, inherited: project.blocks.order.length - overridden };
}

export function templateToJson(template: TextTemplate): string {
  return JSON.stringify(template, null, 2);
}
