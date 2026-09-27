import {
  PROJECT_VERSION,
  DEFAULT_OVERLAY,
  DEFAULT_TEXT_STYLE,
  DEFAULT_DIMENSIONS,
  DEFAULT_PREVIEW,
  EASING_CSS,
  type ProjectState,
  type SerializedProject,
  type ID,
  type AssetMeta,
  type FolderMeta,
  type Block,
  type GlobalSettings,
  type PreviewSettings,
  type TransitionType,
} from '../types';

export function serializeProject(state: ProjectState): SerializedProject {
  const assets = Object.values(state.assets).map((a) => {
    // Don't persist blob: URLs — only metadata; browser will need re-link
    const { sourceKey, ...rest } = a;
    const isBlob = sourceKey?.startsWith('blob:') || sourceKey?.startsWith('idb:');
    return {
      ...rest,
      sourceKey: isBlob ? undefined : sourceKey,
    };
  });

  return {
    version: PROJECT_VERSION,
    meta: { ...state.meta, updatedAt: Date.now() },
    settings: structuredClone(state.settings),
    template: structuredClone(state.template),
    folders: Object.values(state.folders),
    assets,
    blocks: Object.values(state.blocks),
    blockOrder: [...state.blockOrder],
    stacks: structuredClone(state.stacks),
    activeStackId: state.activeStackId,
    preview: structuredClone(state.preview),
    rootFolderName: state.rootFolderName,
  };
}

/** Миграция настроек: старые проекты (v1) не знают randomMode */
function normalizeSettings(
  raw: Partial<GlobalSettings> | undefined,
  blockCount: number
): GlobalSettings {
  const base: GlobalSettings = {
    overlay: DEFAULT_OVERLAY,
    textStyle: DEFAULT_TEXT_STYLE,
    defaultDimensions: DEFAULT_DIMENSIONS,
    blockCount,
    useFavoritesGlobal: false,
    randomMode: 'random',
  };
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    overlay: { ...base.overlay, ...(raw.overlay ?? {}) },
    textStyle: { ...base.textStyle, ...(raw.textStyle ?? {}) },
    defaultDimensions: { ...base.defaultDimensions, ...(raw.defaultDimensions ?? {}) },
    randomMode: raw.randomMode === 'sequential' ? 'sequential' : 'random',
  };
}

/** Миграция настроек превью: добавляем fit/progress/dice/background */
function normalizePreview(raw: Partial<PreviewSettings> | undefined): PreviewSettings {
  if (!raw) return { ...DEFAULT_PREVIEW };
  const legacyTransition = raw.transitionType as string | undefined;
  const transition: TransitionType =
    legacyTransition === 'slide'
      ? 'slide-vertical'
      : legacyTransition === 'crossfade' || legacyTransition === 'zoom' ||
          legacyTransition === 'fade' || legacyTransition === 'slide-horizontal' ||
          legacyTransition === 'slide-vertical'
        ? (legacyTransition as TransitionType)
        : DEFAULT_PREVIEW.transitionType;

  return {
    ...DEFAULT_PREVIEW,
    ...raw,
    transitionType: transition,
    easing: raw.easing && EASING_CSS[raw.easing] ? raw.easing : DEFAULT_PREVIEW.easing,
    fit: raw.fit === 'frame' ? 'frame' : 'fill',
    showProgress: raw.showProgress ?? DEFAULT_PREVIEW.showProgress,
    showDice: raw.showDice ?? DEFAULT_PREVIEW.showDice,
    background: raw.background ?? DEFAULT_PREVIEW.background,
  };
}

export function deserializeProject(data: unknown): { ok: true; state: ProjectState } | { ok: false; error: string } {
  try {
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid project: not an object' };
    }
    const raw = data as Partial<SerializedProject>;
    if (raw.version == null) {
      return { ok: false, error: 'Invalid project: missing version' };
    }
    if (raw.version > PROJECT_VERSION) {
      return { ok: false, error: `Unsupported project version: ${raw.version}` };
    }
    if (!raw.meta || !raw.blocks || !raw.blockOrder) {
      return { ok: false, error: 'Invalid project: missing required fields' };
    }

    const folders: Record<ID, FolderMeta> = {};
    for (const f of raw.folders ?? []) {
      folders[f.id] = f;
    }

    const assets: Record<ID, AssetMeta> = {};
    for (const a of raw.assets ?? []) {
      assets[a.id] = {
        ...a,
        sourceKey: a.sourceKey ?? '',
        missing: !a.sourceKey || a.sourceKey === '',
      };
    }

    const blocks: Record<ID, Block> = {};
    for (const b of raw.blocks) {
      blocks[b.id] = b;
    }

    // Validate block order
    const blockOrder = (raw.blockOrder ?? []).filter((id) => blocks[id]);

    const state: ProjectState = {
      meta: raw.meta,
      settings: normalizeSettings(raw.settings, blockOrder.length),
      template: raw.template ?? {
        title: 'Авто',
        subtitle: 'ОРГАНИЗУЕМ ПЕРЕВОЗКИ',
        items: [],
        categories: [],
      },
      folders,
      assets,
      blocks,
      blockOrder,
      stacks: raw.stacks ?? [],
      activeStackId: raw.activeStackId ?? null,
      preview: normalizePreview(raw.preview),
      selectedBlockId: blockOrder[0] ?? null,
      mode: 'edit',
      dirty: false,
      rootFolderName: raw.rootFolderName ?? null,
    };

    return { ok: true, state };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to parse project' };
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function pickAndReadJsonFile(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      try {
        const text = await file.text();
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}
