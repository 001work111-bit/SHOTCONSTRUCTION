import {
  PROJECT_VERSION,
  type ProjectState,
  type SerializedProject,
  type ID,
  type AssetMeta,
  type FolderMeta,
  type Block,
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
      settings: raw.settings ?? {
        overlay: { enabled: true, color: '#000000', opacity: 45 },
        textStyle: {
          titleSize: 64,
          subtitleSize: 14,
          itemSize: 13,
          categorySize: 48,
          color: '#ffffff',
          opacity: 100,
          align: 'center',
          lineHeight: 1.2,
          letterSpacing: 0.5,
          titleWeight: 400,
          subtitleWeight: 400,
        },
        defaultDimensions: { width: 1024, height: 512, aspectRatio: '2:1', lockAspect: true },
        blockCount: blockOrder.length,
        useFavoritesGlobal: false,
      },
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
      preview: raw.preview ?? {
        transitionType: 'fade',
        transitionDuration: 600,
        transitionDelay: 4000,
        easing: 'ease-in-out',
        autoplay: false,
        loop: true,
        navigationMode: 'both',
      },
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
