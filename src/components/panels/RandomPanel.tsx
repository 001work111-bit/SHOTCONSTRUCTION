import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Section, Checkbox, Divider, EmptyState } from '../ui/primitives';
import { IconDice, IconLock, IconUnlock, IconStack, IconStar } from '../icons';

export function RandomPanel() {
  const { state, dispatch } = useProjectStore();
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;
  const lockedCount = state.blockOrder.filter((id) => state.blocks[id]?.locked).length;

  return (
    <div className="space-y-4">
      <Section title="Randomize">
        <div className="flex flex-col gap-1.5">
          <Button
            variant="primary"
            className="w-full justify-start"
            onClick={() => dispatch((s) => actions.randomizeAll(s))}
          >
            <IconDice size={14} /> Randomize All
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={!selected}
            onClick={() =>
              selected && dispatch((s) => actions.randomizeBlock(s, selected.id, true))
            }
          >
            <IconDice size={14} /> Randomize Selected
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-white/35">
          Locked blocks are skipped by Randomize All. Per-block dice always works.
        </p>
      </Section>

      <Divider />

      <Section title="Lock">
        <div className="mb-2 text-[10px] text-white/40">
          Locked: {lockedCount} / {state.blockOrder.length}
        </div>
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            className="w-full justify-start"
            disabled={!selected}
            onClick={() => selected && dispatch((s) => actions.toggleLock(s, selected.id))}
          >
            {selected?.locked ? <IconUnlock size={14} /> : <IconLock size={14} />}
            {selected?.locked ? 'Unlock Selected' : 'Lock Selected'}
          </Button>
          <Button
            variant="subtle"
            className="w-full justify-start"
            onClick={() => dispatch((s) => actions.setAllLocks(s, true))}
          >
            <IconLock size={14} /> Lock All
          </Button>
          <Button
            variant="subtle"
            className="w-full justify-start"
            onClick={() => dispatch((s) => actions.setAllLocks(s, false))}
          >
            <IconUnlock size={14} /> Unlock All
          </Button>
        </div>
      </Section>

      <Divider />

      <Section title="Favorites pool">
        {selected ? (
          <>
            <Checkbox
              checked={selected.useFavorites}
              onChange={(v) =>
                dispatch((s) => actions.setUseFavorites(s, selected.id, v))
              }
              label="Use accumulated favorites"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-white/55">
              <span className="flex items-center gap-1">
                <IconStar size={12} className="text-amber-300" />
                Favorites for block
              </span>
              <span className="tabular-nums text-amber-200">
                {selected.favoriteAssetIds.length}
              </span>
            </div>
            <Button
              className="mt-2 w-full"
              size="sm"
              variant="outline"
              disabled={!selected.imageAssetId}
              onClick={() => dispatch((s) => actions.toggleFavorite(s, selected.id))}
            >
              <IconStar size={13} />
              {selected.imageAssetId &&
              selected.favoriteAssetIds.includes(selected.imageAssetId)
                ? 'Remove current from favorites'
                : 'Add current to favorites'}
            </Button>
          </>
        ) : (
          <EmptyState title="Select a block" />
        )}
      </Section>

      <Divider />

      <Section title="Stacks">
        <Button
          variant="primary"
          className="w-full justify-start"
          onClick={() => dispatch((s) => actions.saveStack(s))}
        >
          <IconStack size={14} /> Save Stack
        </Button>
        <p className="mt-2 text-[10px] text-white/35">
          Snapshot of current image combination across all blocks.
        </p>
      </Section>
    </div>
  );
}
