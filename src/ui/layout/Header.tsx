import { useController, useSelector } from '../hooks';
import { Btn } from '../components/primitives';
import { Icon } from '../components/Icon';

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path
        d="M11 1.6l1.9 6.1 6.1 1.9-6.1 1.9L11 17.6l-1.9-6.1L3 9.6l6.1-1.9z"
        fill="none"
        stroke="#5b9dff"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M11 6.9l4.1 2.7-4.1 2.7-4.1-2.7z" fill="#1c3454" stroke="#2f5f9e" strokeWidth=".9" />
    </svg>
  );
}

export function Header() {
  const controller = useController();
  const name = useSelector((s) => s.project.meta.name);
  const mode = useSelector((s) => s.ui.mode);
  const saveStatus = useSelector((s) => s.ui.saveStatus);
  const canUndo = controller.history.snapshot().canUndo;
  const canRedo = controller.history.snapshot().canRedo;
  const depth = controller.history.depth;

  const statusLabel =
    saveStatus === 'dirty' ? 'Unsaved changes' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Autosave failed' : 'Saved locally';

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <input
          className="brand-name"
          value={name}
          onChange={(e) => controller.setProjectName(e.target.value)}
          onBlur={(e) => !e.target.value.trim() && controller.setProjectName('Untitled preview')}
          spellCheck={false}
          title="Project name"
        />
      </div>

      <div className="header-spacer" />

      <div className="header-group">
        <Btn icon="undo" title={`Undo (${depth} steps) — Ctrl+Z`} onClick={() => controller.undo()} disabled={!canUndo} />
        <Btn icon="redo" title="Redo — Ctrl+Y" onClick={() => controller.redo()} disabled={!canRedo} />
        <span className="header-sep" />
        <Btn icon="open" title="Import project JSON — Ctrl+O" onClick={() => void controller.openProject()}>
          Import
        </Btn>
        <Btn icon="save" title="Export project JSON — Ctrl+S" onClick={() => void controller.saveProject()}>
          Export
        </Btn>
        <span className="header-sep" />
        <span className={`status-item save-status ${saveStatus}`}>{statusLabel}</span>
        <div className="mode-switch">
          <button type="button" className={mode === 'edit' ? 'active' : undefined} onClick={() => controller.closePreview()}>
            Edit
          </button>
          <button type="button" className={mode === 'preview' ? 'active' : undefined} onClick={() => controller.openPreview()}>
            Preview
          </button>
        </div>
        <Btn icon="preview" title="Open preview (Esc to exit)" onClick={() => controller.openPreview()}>
          <Icon name="external" size={12} />
        </Btn>
      </div>
    </header>
  );
}
