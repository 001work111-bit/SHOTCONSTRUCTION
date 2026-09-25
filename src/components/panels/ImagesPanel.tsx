import { useMemo, useState } from 'react';
import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  Input,
  Checkbox,
  Divider,
  EmptyState,
  Select,
  Slider,
  Badge,
} from '../ui/primitives';
import { IconFolder, IconSearch } from '../icons';
import type { ImageFit, ID } from '../../core/types';
import { cn } from '../../utils/cn';

export function ImagesPanel() {
  const { state, dispatch, loadFolder, resolveAssetUrl, ensureAssetUrl } = useProjectStore();
  const [search, setSearch] = useState('');
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;
  const folders = useMemo(() => Object.values(state.folders), [state.folders]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return Object.values(state.assets)
      .filter((a) => {
        const folderName = a.folderId ? state.folders[a.folderId]?.name ?? '' : '';
        return (
          a.filename.toLowerCase().includes(q) || folderName.toLowerCase().includes(q)
        );
      })
      .slice(0, 80);
  }, [search, state.assets, state.folders]);

  const currentAsset = selected?.imageAssetId
    ? state.assets[selected.imageAssetId]
    : null;

  return (
    <div className="space-y-4">
      <Button variant="primary" className="w-full" onClick={() => void loadFolder()}>
        <IconFolder size={14} /> Load image folder
      </Button>

      {folders.length === 0 ? (
        <EmptyState title="No folders" hint="Load a catalog to assign sources" />
      ) : (
        <>
          <Section
            title="Folders"
            action={
              <span className="text-[10px] text-white/35">
                {Object.keys(state.assets).length.toLocaleString()} imgs
              </span>
            }
          >
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-white/8 p-1">
              {folders.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded px-2 py-1 text-xs text-white/70"
                >
                  <span className="truncate">{f.name}</span>
                  <Badge>{f.assetIds.length}</Badge>
                </div>
              ))}
            </div>
          </Section>

          <Divider />

          {selected ? (
            <Section title={`Sources · ${selected.name}`}>
              <div className="mb-2 flex gap-1">
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    dispatch((s) =>
                      actions.setBlockFolders(
                        s,
                        selected.id,
                        folders.map((f) => f.id)
                      )
                    )
                  }
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() =>
                    dispatch((s) => actions.setBlockFolders(s, selected.id, []))
                  }
                >
                  Clear
                </Button>
              </div>
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-white/8 p-1">
                {folders.map((f) => (
                  <Checkbox
                    key={f.id}
                    checked={selected.selectedFolderIds.includes(f.id)}
                    onChange={(v) => {
                      const next = v
                        ? [...selected.selectedFolderIds, f.id]
                        : selected.selectedFolderIds.filter((id) => id !== f.id);
                      dispatch((s) => actions.setBlockFolders(s, selected.id, next));
                    }}
                    label={f.name}
                    count={f.assetIds.length}
                  />
                ))}
              </div>
            </Section>
          ) : (
            <EmptyState title="Select a block" hint="to assign image sources" />
          )}
        </>
      )}

      {selected && (
        <>
          <Divider />
          <Section title="Image fit">
            <Select
              value={selected.imageFit}
              onChange={(v) =>
                dispatch((s) => actions.setImageFit(s, selected.id, v as ImageFit))
              }
              options={[
                { value: 'cover', label: 'Cover' },
                { value: 'contain', label: 'Contain' },
                { value: 'fill', label: 'Fill' },
              ]}
            />
          </Section>

          <Section title="Position X">
            <div className="flex items-center gap-2">
              <Slider
                value={selected.imagePosition.x}
                onChange={(v) =>
                  dispatch((s) => actions.setImagePosition(s, selected.id, { x: v }))
                }
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-white/50">
                {selected.imagePosition.x}
              </span>
            </div>
          </Section>
          <Section title="Position Y">
            <div className="flex items-center gap-2">
              <Slider
                value={selected.imagePosition.y}
                onChange={(v) =>
                  dispatch((s) => actions.setImagePosition(s, selected.id, { y: v }))
                }
              />
              <span className="w-8 text-right text-[10px] tabular-nums text-white/50">
                {selected.imagePosition.y}
              </span>
            </div>
          </Section>

          {currentAsset && (
            <Section title="Current image">
              <div className="space-y-1 rounded-md border border-white/8 bg-black/30 p-2 text-[10px] text-white/55">
                <div className="truncate text-white/80">{currentAsset.filename}</div>
                <div>
                  Folder:{' '}
                  {currentAsset.folderId
                    ? state.folders[currentAsset.folderId]?.name ?? '—'
                    : 'External'}
                </div>
                <div className="uppercase">{currentAsset.format}</div>
                {currentAsset.fileSize != null && (
                  <div>{(currentAsset.fileSize / 1024).toFixed(1)} KB</div>
                )}
                {currentAsset.missing && (
                  <div className="text-amber-300">⚠ Missing asset</div>
                )}
                {currentAsset.unsupported && (
                  <div className="text-amber-300">Unsupported format</div>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      <Divider />
      <Section title="Search assets">
        <div className="relative">
          <IconSearch
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/30"
          />
          <Input
            className="pl-7"
            placeholder="filename or folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
            {filteredAssets.length === 0 ? (
              <div className="py-3 text-center text-[10px] text-white/30">No matches</div>
            ) : (
              filteredAssets.map((a) => (
                <AssetRow
                  key={a.id}
                  assetId={a.id}
                  filename={a.filename}
                  folder={a.folderId ? state.folders[a.folderId]?.name : '—'}
                  selected={selected?.imageAssetId === a.id}
                  onPick={() => {
                    if (selected) {
                      void ensureAssetUrl(a.id);
                      dispatch((s) => actions.setBlockImage(s, selected.id, a.id));
                    }
                  }}
                  thumb={resolveAssetUrl(a.id)}
                />
              ))
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

function AssetRow({
  filename,
  folder,
  selected,
  onPick,
  thumb,
}: {
  assetId: ID;
  filename: string;
  folder?: string;
  selected: boolean;
  onPick: () => void;
  thumb: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition',
        selected ? 'bg-emerald-500/15' : 'hover:bg-white/6'
      )}
    >
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-black/50">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-white/5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-white/80">{filename}</div>
        <div className="truncate text-[10px] text-white/35">{folder}</div>
      </div>
    </button>
  );
}
