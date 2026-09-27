import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  Checkbox,
  Slider,
  Select,
  Badge,
  Divider,
} from '../ui/primitives';
import { IconDice, IconLock, IconUnlock, IconStar, IconStarFilled } from '../icons';
import type { ImageFit } from '../../core/types';

/** Compact right-side inspector for the selected block */
export function Inspector() {
  const { state, dispatch } = useProjectStore();
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;
  if (!selected) return null;

  const folders = Object.values(state.folders);
  const isFav =
    selected.imageAssetId != null &&
    selected.favoriteAssetIds.includes(selected.imageAssetId);
  const asset = selected.imageAssetId ? state.assets[selected.imageAssetId] : null;

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-l border-white/8 bg-[#0e0e11]">
      <div className="flex h-10 items-center justify-between border-b border-white/8 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/55">
          {selected.name}
        </span>
        <div className="flex items-center gap-1">
          {selected.locked && <Badge tone="warning">LOCK</Badge>}
          <Badge tone={selected.favoriteAssetIds.length ? 'warning' : 'default'}>
            ★ {selected.favoriteAssetIds.length}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
        <Section title="Quick actions">
          <div className="grid grid-cols-3 gap-1">
            <Button
              size="sm"
              variant="outline"
              title="Randomize"
              onClick={() => dispatch((s) => actions.randomizeBlock(s, selected.id, true))}
            >
              <IconDice size={13} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              title={selected.locked ? 'Unlock' : 'Lock'}
              onClick={() => dispatch((s) => actions.toggleLock(s, selected.id))}
            >
              {selected.locked ? <IconUnlock size={13} /> : <IconLock size={13} />}
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Favorite"
              className={isFav ? 'text-amber-300' : ''}
              onClick={() => dispatch((s) => actions.toggleFavorite(s, selected.id))}
            >
              {isFav ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            </Button>
          </div>
        </Section>

        {folders.length > 0 && (
          <Section title="Image sources">
            <div className="mb-1.5 flex gap-1">
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
            <div className="max-h-36 space-y-0.5 overflow-y-auto rounded border border-white/8 p-1">
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
        )}

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

        <Section title="Overlay">
          <Checkbox
            checked={selected.overlay.enabled}
            onChange={(v) =>
              dispatch((s) => actions.setBlockOverlay(s, selected.id, { enabled: v }))
            }
            label="Enabled"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={selected.overlay.color}
              onChange={(e) =>
                dispatch((s) =>
                  actions.setBlockOverlay(s, selected.id, { color: e.target.value })
                )
              }
              className="h-7 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
            />
            <Slider
              value={selected.overlay.opacity}
              onChange={(v) =>
                dispatch((s) => actions.setBlockOverlay(s, selected.id, { opacity: v }))
              }
            />
            <span className="w-8 text-right text-[10px] tabular-nums text-white/45">
              {selected.overlay.opacity}%
            </span>
          </div>
        </Section>

        <Section title="Favorites">
          <Checkbox
            checked={selected.useFavorites}
            onChange={(v) =>
              dispatch((s) => actions.setUseFavorites(s, selected.id, v))
            }
            label="Use favorites as pool"
          />
          <div className="mt-1 text-[10px] text-white/40">
            {selected.favoriteAssetIds.length} saved for this block
          </div>
        </Section>

        {asset && (
          <>
            <Divider />
            <Section title="Asset">
              <div className="space-y-0.5 text-[10px] text-white/50">
                <div className="truncate text-white/80">{asset.filename}</div>
                <div>
                  {asset.folderId
                    ? state.folders[asset.folderId]?.name
                    : asset.external
                      ? 'External'
                      : '—'}
                </div>
                <div className="uppercase">{asset.format}</div>
              </div>
            </Section>
          </>
        )}
      </div>
    </aside>
  );
}
