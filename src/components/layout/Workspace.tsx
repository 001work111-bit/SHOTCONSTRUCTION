import { useProjectStore, actions } from '../../store/ProjectStore';
import { BlockCard } from '../blocks/BlockCard';
import { Button } from '../ui/primitives';
import { IconDice, IconFolder, IconPlus } from '../icons';

export function Workspace() {
  const { state, dispatch, resolveAssetUrl, loadFolder } = useProjectStore();
  const hasAssets = Object.keys(state.assets).length > 0;

  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#121214]">
      {/* Workspace toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/6 px-4">
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/35">
          Workspace
        </span>
        <span className="text-[11px] text-white/25">
          {state.blockOrder.length} blocks · {state.settings.defaultDimensions.width}×
          {state.settings.defaultDimensions.height}
        </span>
        <div className="flex-1" />
        {!hasAssets && (
          <Button size="sm" variant="outline" onClick={() => void loadFolder()}>
            <IconFolder size={13} /> Load images
          </Button>
        )}
        <Button
          size="sm"
          variant="subtle"
          onClick={() => dispatch((s) => actions.randomizeAll(s))}
        >
          <IconDice size={13} /> Randomize
        </Button>
        <Button size="sm" variant="subtle" onClick={() => dispatch((s) => actions.addBlock(s))}>
          <IconPlus size={13} /> Block
        </Button>
      </div>

      {/* Scrollable blocks — independent from sidebar */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
          {state.blockOrder.map((id) => {
            const block = state.blocks[id];
            if (!block) return null;
            const asset = block.imageAssetId ? state.assets[block.imageAssetId] : null;
            const url = resolveAssetUrl(block.imageAssetId);
            return (
              <BlockCard
                key={id}
                block={block}
                selected={state.selectedBlockId === id}
                textStyle={state.settings.textStyle}
                imageUrl={url}
                missing={!!asset?.missing}
                onSelect={() => dispatch((s) => actions.selectBlock(s, id))}
              />
            );
          })}

          <button
            type="button"
            onClick={() => dispatch((s) => actions.addBlock(s))}
            className="flex h-16 items-center justify-center rounded-lg border border-dashed border-white/10 text-xs text-white/30 transition hover:border-white/25 hover:text-white/55"
          >
            <IconPlus size={14} className="mr-1.5" /> Add block
          </button>
        </div>
      </div>
    </main>
  );
}
