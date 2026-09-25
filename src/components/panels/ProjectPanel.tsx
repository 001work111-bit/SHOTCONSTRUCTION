import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Section, Input, Divider, EmptyState } from '../ui/primitives';
import { IconFolder, IconOpen, IconSave, IconPlus } from '../icons';

export function ProjectPanel() {
  const {
    state,
    dispatch,
    loadFolder,
    saveProjectFile,
    loadProjectFile,
    newProject,
  } = useProjectStore();

  const assetCount = Object.keys(state.assets).length;
  const folderCount = Object.keys(state.folders).length;

  return (
    <div className="space-y-4">
      <Section title="Project name">
        <Input
          value={state.meta.name}
          onChange={(e) => dispatch((s) => actions.setProjectName(s, e.target.value))}
        />
      </Section>

      <Section title="Files">
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" className="w-full justify-start" onClick={newProject}>
            <IconPlus size={14} /> New project
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => void loadProjectFile()}
          >
            <IconOpen size={14} /> Load project JSON
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={saveProjectFile}>
            <IconSave size={14} /> Export project JSON
          </Button>
        </div>
      </Section>

      <Divider />

      <Section title="Image catalog">
        <Button
          variant="primary"
          className="w-full justify-start"
          onClick={() => void loadFolder()}
        >
          <IconFolder size={14} /> Load image folder
        </Button>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          Select a root folder with nested category folders. Images are read locally — nothing is
          uploaded.
        </p>
      </Section>

      {folderCount > 0 ? (
        <Section title="Catalog summary">
          <div className="space-y-1 rounded-md border border-white/8 bg-black/30 p-2.5 text-xs">
            <div className="flex justify-between text-white/60">
              <span>Root</span>
              <span className="text-white/85">{state.rootFolderName}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Folders</span>
              <span className="tabular-nums text-white/85">{folderCount}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Images</span>
              <span className="tabular-nums text-white/85">{assetCount.toLocaleString()}</span>
            </div>
          </div>
        </Section>
      ) : (
        <EmptyState title="No catalog loaded" hint="Load a folder to begin" />
      )}

      <Section title="Quick start">
        <ol className="list-decimal space-y-1 pl-4 text-[10px] leading-relaxed text-white/40">
          <li>Load image folder</li>
          <li>Set number of blocks</li>
          <li>Assign folders per block</li>
          <li>Randomize & save stacks</li>
          <li>Preview the page</li>
        </ol>
      </Section>
    </div>
  );
}
