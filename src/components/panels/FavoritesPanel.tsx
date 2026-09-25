import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Section, EmptyState, Badge, Checkbox, Divider } from '../ui/primitives';
import { IconStar, IconStarFilled } from '../icons';
import { cn } from '../../utils/cn';

export function FavoritesPanel() {
  const { state, dispatch, resolveAssetUrl, ensureAssetUrl } = useProjectStore();

  const rows = state.blockOrder.map((id) => {
    const b = state.blocks[id];
    return {
      block: b,
      count: b?.favoriteAssetIds.length ?? 0,
    };
  });

  const total = rows.reduce((a, r) => a + r.count, 0);
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-amber-200">
            <IconStarFilled size={14} /> Total favorites
          </span>
          <span className="text-sm font-semibold tabular-nums text-amber-100">{total}</span>
        </div>
        <p className="mt-1 text-[10px] text-amber-200/50">
          Favorites are per-block. Same image can be favorite for one block only.
        </p>
      </div>

      <Section title="Per-block counters">
        <div className="space-y-0.5">
          {rows.map(({ block, count }) => {
            if (!block) return null;
            const isSel = state.selectedBlockId === block.id;
            return (
              <button
                key={block.id}
                type="button"
                onClick={() => dispatch((s) => actions.selectBlock(s, block.id))}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition',
                  isSel ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5'
                )}
              >
                <span className="w-6 tabular-nums text-white/35">
                  {String(block.order + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate">{block.name}</span>
                <Badge tone={count > 0 ? 'warning' : 'default'}>
                  <span className="flex items-center gap-0.5">
                    <IconStar size={10} /> {count}
                  </span>
                </Badge>
                {block.useFavorites && (
                  <span className="text-[9px] uppercase tracking-wide text-amber-300/70">
                    pool
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Section>

      <Divider />

      {selected ? (
        <Section title={`Favorites · ${selected.name}`}>
          <div className="mb-2 flex items-center justify-between">
            <Checkbox
              checked={selected.useFavorites}
              onChange={(v) =>
                dispatch((s) => actions.setUseFavorites(s, selected.id, v))
              }
              label="Use as random pool"
            />
            <Badge tone="warning">{selected.favoriteAssetIds.length}</Badge>
          </div>

          {selected.favoriteAssetIds.length === 0 ? (
            <EmptyState
              title="No favorites yet"
              hint="Star the current image on the block"
            />
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {selected.favoriteAssetIds.map((aid) => {
                const asset = state.assets[aid];
                const thumb = resolveAssetUrl(aid);
                if (!thumb) void ensureAssetUrl(aid);
                const isCurrent = selected.imageAssetId === aid;
                return (
                  <div
                    key={aid}
                    className={cn(
                      'flex items-center gap-2 rounded-md border border-white/8 p-1.5',
                      isCurrent && 'border-emerald-500/40 bg-emerald-500/10'
                    )}
                  >
                    <div className="h-10 w-14 shrink-0 overflow-hidden rounded bg-black/40">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[9px] text-white/30">
                          …
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-white/80">
                        {asset?.filename ?? 'Missing'}
                      </div>
                      <div className="truncate text-[10px] text-white/35">
                        {asset?.folderId
                          ? state.folders[asset.folderId]?.name
                          : asset?.external
                            ? 'External'
                            : '—'}
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <Button
                        size="sm"
                        variant="subtle"
                        className="h-6 px-1.5"
                        onClick={() =>
                          dispatch((s) => actions.setBlockImage(s, selected.id, aid))
                        }
                      >
                        Use
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5 text-red-300"
                        onClick={() =>
                          dispatch((s) =>
                            actions.removeFavoriteAsset(s, selected.id, aid)
                          )
                        }
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      ) : (
        <EmptyState title="Select a block" />
      )}
    </div>
  );
}
