import { createStackId } from './ids';
import type { AssetId, BlockId, Project, Stack, StackId } from './types';

/**
 * Stack = saved combination of images of all blocks (spec §41–44).
 * It stores references only. Applying a stack restores **images only**:
 * text, typography, overlay, folder selection, favorites, lock and block count stay untouched.
 */

function nextStackIndex(project: Project): number {
  return project.stacks.reduce((max, s) => Math.max(max, s.index), 0) + 1;
}

export function saveStack(project: Project, name?: string): { project: Project; stack: Stack } {
  const index = nextStackIndex(project);
  const entries: Stack['entries'] = {};
  for (const blockId of project.blocks.order) {
    const block = project.blocks.byId[blockId];
    entries[blockId] = {
      assetId: block.imageAssetId,
      imageFit: block.imageFit,
      imagePosition: { ...block.imagePosition },
    };
  }
  const stack: Stack = {
    id: createStackId(),
    index,
    name: name?.trim() || `Stack ${String(index).padStart(3, '0')}`,
    createdAt: Date.now(),
    entries,
  };
  return {
    project: {
      ...project,
      stacks: [...project.stacks, stack],
      meta: { ...project.meta, updatedAt: Date.now() },
    },
    stack,
  };
}

export interface ApplyStackReport {
  project: Project;
  /** blocks that exist today and received an image */
  applied: BlockId[];
  /** block ids that were saved into the stack but no longer exist (spec §78) */
  unknownBlockIds: BlockId[];
  /** entries skipped because their asset disappeared from the catalog */
  missingAssetIds: AssetId[];
  stack: Stack | null;
}

export function applyStack(project: Project, stackId: StackId): ApplyStackReport {
  const stack = project.stacks.find((s) => s.id === stackId) ?? null;
  if (!stack) return { project, applied: [], unknownBlockIds: [], missingAssetIds: [], stack: null };

  const known = new Set(project.assets.map((a) => a.id));
  const byId = { ...project.blocks.byId };
  const applied: BlockId[] = [];
  const unknownBlockIds: BlockId[] = [];
  const missingAssetIds: AssetId[] = [];

  for (const [blockId, entry] of Object.entries(stack.entries)) {
    const block = byId[blockId];
    if (!block) {
      unknownBlockIds.push(blockId);
      continue;
    }
    if (entry.assetId && !known.has(entry.assetId)) {
      missingAssetIds.push(entry.assetId);
      continue;
    }
    byId[blockId] = {
      ...block,
      imageAssetId: entry.assetId,
      imageFit: entry.imageFit ?? block.imageFit,
      imagePosition: entry.imagePosition ? { ...entry.imagePosition } : block.imagePosition,
    };
    applied.push(blockId);
  }

  // Blocks created after the stack was saved keep their current image (no accidental blanking).
  return {
    project: {
      ...project,
      blocks: { ...project.blocks, byId },
      meta: { ...project.meta, updatedAt: Date.now() },
    },
    applied,
    unknownBlockIds,
    missingAssetIds,
    stack,
  };
}

/** Stack navigation (spec §43). Returns -1 when there is nothing to show. */
export function stackPosition(project: Project, stackId: StackId | null): number {
  if (!stackId) return -1;
  return project.stacks.findIndex((s) => s.id === stackId);
}

export function stepStack(project: Project, stackId: StackId | null, direction: 1 | -1): StackId | null {
  if (!project.stacks.length) return null;
  const current = stackPosition(project, stackId);
  if (current < 0) return project.stacks[direction > 0 ? 0 : project.stacks.length - 1].id;
  const next = (current + direction + project.stacks.length) % project.stacks.length;
  return project.stacks[next].id;
}

export function deleteStack(project: Project, stackId: StackId): Project {
  return { ...project, stacks: project.stacks.filter((s) => s.id !== stackId) };
}

export function renameStack(project: Project, stackId: StackId, name: string): Project {
  return {
    ...project,
    stacks: project.stacks.map((s) => (s.id === stackId ? { ...s, name: name.trim() || s.name } : s)),
  };
}

export function duplicateStack(project: Project, stackId: StackId): { project: Project; stack: Stack | null } {
  const source = project.stacks.find((s) => s.id === stackId);
  if (!source) return { project, stack: null };
  const index = nextStackIndex(project);
  const stack: Stack = {
    ...source,
    id: createStackId(),
    index,
    name: `${source.name} copy`,
    createdAt: Date.now(),
    entries: JSON.parse(JSON.stringify(source.entries)) as Stack['entries'],
  };
  return { project: { ...project, stacks: [...project.stacks, stack] }, stack };
}

/** Number of blocks whose current image differs from the stack — shown as a dirty hint. */
export function stackDrift(project: Project, stackId: StackId | null): number {
  if (!stackId) return 0;
  const stack = project.stacks.find((s) => s.id === stackId);
  if (!stack) return 0;
  let drift = 0;
  for (const blockId of project.blocks.order) {
    const entry = stack.entries[blockId];
    if (!entry) continue;
    if (project.blocks.byId[blockId]?.imageAssetId !== entry.assetId) drift += 1;
  }
  return drift;
}

export function stackSummary(project: Project, stack: Stack): string {
  const total = Object.keys(stack.entries).length;
  const known = project.blocks.order.filter((id) => id in stack.entries).length;
  return `${known}/${total} blocks`;
}
