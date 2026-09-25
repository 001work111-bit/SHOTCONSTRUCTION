import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Badge } from '../ui/primitives';
import {
  IconUndo,
  IconRedo,
  IconSave,
  IconOpen,
  IconEye,
  IconDice,
  IconPlus,
} from '../icons';
import { cn } from '../../utils/cn';

export function Header() {
  const {
    state,
    canUndo,
    canRedo,
    undo,
    redo,
    dispatch,
    saveProjectFile,
    loadProjectFile,
    newProject,
  } = useProjectStore();

  const stackIdx = state.activeStackId
    ? state.stacks.findIndex((s) => s.id === state.activeStackId)
    : -1;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/8 bg-[#0c0c0e] px-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <input
            className="w-40 truncate bg-transparent text-sm font-medium text-white/90 outline-none hover:text-white focus:text-white"
            value={state.meta.name}
            onChange={(e) => dispatch((s) => actions.setProjectName(s, e.target.value))}
          />
        </div>
        <Badge tone={state.dirty ? 'warning' : 'success'}>
          {state.dirty ? 'Unsaved' : 'Saved'}
        </Badge>
      </div>

      <div className="mx-2 h-5 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <IconUndo size={15} />
        </Button>
        <Button variant="ghost" size="icon" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <IconRedo size={15} />
        </Button>
      </div>

      <div className="mx-1 h-5 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={newProject} title="New project">
          <IconPlus size={14} />
          New
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void loadProjectFile()} title="Open project">
          <IconOpen size={14} />
          Open
        </Button>
        <Button variant="ghost" size="sm" onClick={saveProjectFile} title="Save project (Ctrl+S)">
          <IconSave size={14} />
          Save
        </Button>
      </div>

      <div className="flex-1" />

      {/* Stack navigator */}
      {state.stacks.length > 0 && (
        <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1 py-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => dispatch((s) => actions.navigateStack(s, -1))}
          >
            ‹
          </Button>
          <span className="min-w-[90px] text-center text-[11px] tabular-nums text-white/70">
            {stackIdx >= 0
              ? `${state.stacks[stackIdx].name} / ${state.stacks.length}`
              : `— / ${state.stacks.length}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => dispatch((s) => actions.navigateStack(s, 1))}
          >
            ›
          </Button>
        </div>
      )}

      <div className="mx-1 h-5 w-px bg-white/10" />

      <Button
        variant="subtle"
        size="sm"
        onClick={() => dispatch((s) => actions.randomizeAll(s))}
        title="Randomize all unlocked"
      >
        <IconDice size={14} />
        Randomize All
      </Button>

      <Button
        variant="primary"
        size="sm"
        onClick={() => dispatch((s) => actions.setMode(s, 'preview'))}
      >
        <IconEye size={14} />
        Preview
      </Button>
    </header>
  );
}

export function StatusBar() {
  const { state } = useProjectStore();
  const assetCount = Object.keys(state.assets).length;
  const folderCount = Object.keys(state.folders).length;
  const favTotal = state.blockOrder.reduce(
    (acc, id) => acc + (state.blocks[id]?.favoriteAssetIds.length ?? 0),
    0
  );
  const locked = state.blockOrder.filter((id) => state.blocks[id]?.locked).length;
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-white/8 bg-[#0c0c0e] px-3 text-[10px] text-white/40">
      <span>
        Blocks <span className="text-white/70">{state.blockOrder.length}</span>
      </span>
      <span>
        Folders <span className="text-white/70">{folderCount}</span>
      </span>
      <span>
        Assets <span className="text-white/70">{assetCount.toLocaleString()}</span>
      </span>
      <span>
        Favorites <span className="text-white/70">{favTotal}</span>
      </span>
      <span>
        Stacks <span className="text-white/70">{state.stacks.length}</span>
      </span>
      <span>
        Locked <span className="text-white/70">{locked}</span>
      </span>
      <div className="flex-1" />
      {selected && (
        <span className={cn('truncate')}>
          Selected:{' '}
          <span className="text-white/70">
            {selected.name}
            {selected.imageAssetId
              ? ` · ${state.assets[selected.imageAssetId]?.filename ?? '—'}`
              : ' · no image'}
            {` · ★ ${selected.favoriteAssetIds.length}`}
          </span>
        </span>
      )}
      {state.rootFolderName && (
        <span className="truncate text-white/35">Root: {state.rootFolderName}</span>
      )}
    </footer>
  );
}
