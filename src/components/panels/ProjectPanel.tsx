import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Section, Input, Divider, EmptyState, Badge } from '../ui/primitives';
import { IconFolder, IconOpen, IconSave, IconPlus, IconRefresh } from '../icons';

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-white/60">{label}</span>
      <span className="truncate text-white/85" title={value}>
        {value}
      </span>
    </div>
  );
}

export function ProjectPanel() {
  const {
    state,
    dispatch,
    loadFolder,
    rescanFolder,
    saveProjectFile,
    saveProjectFileAs,
    loadProjectFile,
    newProject,
    isDesktop,
    projectPath,
    catalogRootPath,
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
        {isDesktop && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-white/35">
            <Badge tone={projectPath ? 'success' : 'default'}>
              {projectPath ? 'file linked' : 'not saved yet'}
            </Badge>
            <span>Ctrl+S writes to the file</span>
          </p>
        )}
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
            <IconOpen size={14} /> {isDesktop ? 'Open project…' : 'Load project JSON'}
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={saveProjectFile}>
            <IconSave size={14} /> {isDesktop ? 'Save project' : 'Export project JSON'}
          </Button>
          {isDesktop && (
            <Button variant="outline" className="w-full justify-start" onClick={saveProjectFileAs}>
              <IconSave size={14} /> Save as…
            </Button>
          )}
        </div>
      </Section>

      <Divider />

      <Section title="Image catalog">
        <div className="flex gap-1.5">
          <Button
            variant="primary"
            className="flex-1 justify-start"
            onClick={() => void loadFolder()}
          >
            <IconFolder size={14} /> Load image folder
          </Button>
          {isDesktop && folderCount > 0 && (
            <Button
              variant="outline"
              size="icon"
              title="Пересканировать ту же папку"
              onClick={() => void rescanFolder()}
            >
              <IconRefresh size={14} />
            </Button>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          {isDesktop
            ? 'Картинки читаются прямо с диска — кэш и память не забиваются копиями, проект переживает перезапуск.'
            : 'Select a root folder with nested category folders. Images are read locally — nothing is uploaded.'}
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
            {isDesktop && catalogRootPath && (
              <PathRow label="Path" value={catalogRootPath} />
            )}
            {isDesktop && projectPath && <PathRow label="Project" value={projectPath} />}
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
          <li>Randomize &amp; save stacks</li>
          <li>Preview the page</li>
        </ol>
      </Section>
    </div>
  );
}
