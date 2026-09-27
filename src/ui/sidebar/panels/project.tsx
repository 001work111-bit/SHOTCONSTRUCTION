import { useState } from 'react';
import { ASPECT_PRESETS } from '../../../core/defaults';
import { projectStats } from '../../../core/selectors';
import type { AspectPreset } from '../../../core/types';
import { useBlock, useBlockMap, useBlockOrder, useController, useSelector } from '../../hooks';
import { Btn, Chip, Empty, Field, KeyValue, NumberInput, Section, Segmented, TextInput } from '../../components/primitives';
import { Icon } from '../../components/Icon';

export function ProjectPanel() {
  const controller = useController();
  const name = useSelector((s) => s.project.meta.name);
  const stats = useSelector((s) => projectStats(s.project));
  const updatedAt = useSelector((s) => s.project.meta.updatedAt);
  const saveStatus = useSelector((s) => s.ui.saveStatus);
  const pendingRoot = controller.pendingRoot;

  return (
    <>
      <Section title="Project">
        <Field label="Name">
          <TextInput value={name} onCommit={(value) => controller.setProjectName(value || 'Untitled preview')} />
        </Field>
        <div className="btn-row">
          <Btn icon="plus" onClick={() => controller.newProject()}>New</Btn>
          <Btn icon="open" onClick={() => void controller.openProject()}>Import JSON</Btn>
          <Btn icon="save" variant="primary" onClick={() => void controller.saveProject()}>Export project</Btn>
        </div>
        <div className="panel-note">
          Export writes a JSON with metadata and references only — images are never copied, moved or re-encoded.
          Autosave keeps a local crash-recovery snapshot ({saveStatus}).
        </div>
      </Section>

      {pendingRoot ? (
        <Section title="Previous folder">
          <div className="panel-note">
            The catalog “{pendingRoot.label}” was used in the previous session. Browsers require a click to re-grant access.
          </div>
          <Btn icon="link" onClick={() => void controller.confirmPendingRoot()}>Reconnect folder</Btn>
        </Section>
      ) : null}

      <Section title="Catalog">
        <div className="btn-row">
          <Btn icon="folder-open" onClick={() => void controller.loadFolder()}>Load image folder</Btn>
          <Btn icon="refresh" onClick={() => void controller.rescanCatalog()}>Rescan</Btn>
          <Btn icon="grid" onClick={() => void controller.loadDemoCatalog()} title="Load the small catalog bundled with the app to try the flow">Demo catalog</Btn>
        </div>
        <div className="panel-note">Adapter: {controller.adapterLabel}</div>
      </Section>

      <Section title="Statistics">
        <KeyValue
          rows={[
            ['blocks', stats.blocks],
            ['with image', stats.withImage],
            ['locked', stats.locked],
            ['favorites', stats.favorites],
            ['text overrides', stats.overrides],
            ['stacks', stats.stacks],
            ['folders', stats.folders],
            ['catalog files', stats.assets],
            ['unsupported', stats.unsupported],
            ['missing', stats.missing],
            ['external images', stats.externalImages],
          ]}
        />
        <div className="panel-note">Last change: {new Date(updatedAt).toLocaleTimeString()}</div>
      </Section>
    </>
  );
}

export function BlocksPanel() {
  const controller = useController();
  const count = useSelector((s) => s.project.blocks.order.length);
  const order = useBlockOrder();
  const blockMap = useBlockMap();
  const selectedId = useSelector((s) => s.ui.selectedBlockId);
  const defaults = useSelector((s) => s.project.settings.blockDefaults);
  const [applyToAll, setApplyToAll] = useState(true);

  return (
    <>
      <Section title="Number of blocks">
        <div className="row">
          <NumberInput value={count} min={0} max={200} step={1} onCommit={(value) => controller.setBlockCount(value)} />
          <Btn icon="check" title="Apply this number of blocks" onClick={() => controller.setBlockCount(count)}>Set</Btn>
          <Btn icon="plus" onClick={() => controller.addBlock()} title="Add one block" />
        </div>
        <div className="panel-note">
          Every block keeps its own id, image, text, folders, lock and favorites when the count changes.
        </div>
      </Section>

      <Section title="Default block size">
        <Field label="Aspect">
          <Segmented
            value={defaults.aspect}
            onChange={(value: AspectPreset) => {
              const preset = ASPECT_PRESETS.find((p) => p.id === value);
              const width = defaults.width;
              const height = preset?.ratio ? Math.round(width / preset.ratio) : defaults.height;
              controller.setGlobalBlockDefaults({ aspect: value, height });
              if (applyToAll) controller.resizeBlock(selectedId ?? order[0] ?? '', { aspect: value, driver: 'width' });
            }}
            options={ASPECT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
          />
        </Field>
        <div className="grid-2">
          <Field label="Width">
            <NumberInput value={defaults.width} min={64} max={8192} onCommit={(value) => controller.setGlobalBlockDefaults({ width: value, aspect: 'custom' })} />
          </Field>
          <Field label="Height">
            <NumberInput value={defaults.height} min={64} max={8192} onCommit={(value) => controller.setGlobalBlockDefaults({ height: value, aspect: 'custom' })} />
          </Field>
        </div>
        <label className="switch" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
          <span className="track" />
          <span className="switch-label">apply to every existing block</span>
        </label>
        <div className="btn-row">
          <Btn
            icon="grid"
            onClick={() => controller.resizeBlock(selectedId ?? '', { width: defaults.width, height: defaults.height, aspect: defaults.aspect, driver: 'width' })}
            disabled={!selectedId}
          >
            Apply to selected
          </Btn>
        </div>
      </Section>

      <Section
        title={`Blocks (${count})`}
        right={
          <span className="row tight">
            <Btn icon="lock" title="Lock all" onClick={() => controller.setLockedAll(true)} />
            <Btn icon="unlock" title="Unlock all" onClick={() => controller.setLockedAll(false)} />
          </span>
        }
      >
        {!count ? (
          <Empty>
            No blocks yet.
            <div style={{ marginTop: 8 }}>
              <Btn icon="plus" onClick={() => controller.setBlockCount(6)}>Create 6 blocks</Btn>
            </div>
          </Empty>
        ) : (
          <div>
            {order.map((id, index) => {
              const block = blockMap[id];
              if (!block) return null;
              return (
                <div
                  key={id}
                  className={`list-row${id === selectedId ? ' active' : ''}`}
                  onClick={() => controller.selectBlock(id)}
                >
                  <span className="mono tabular dim">#{String(index + 1).padStart(2, '0')}</span>
                  <span className="truncate" style={{ flex: 1 }}>
                    {block.imageAssetId ? block.imageAssetId.slice(-10) : 'empty'}
                  </span>
                  <span className="frame-caption dim tabular">{block.width}×{block.height}</span>
                  <span className="row-actions">
                    <Btn
                      icon={block.locked ? 'lock' : 'unlock'}
                      variant="ghost"
                      title={block.locked ? 'Unlock' : 'Lock'}
                      onClick={(e) => {
                        e.stopPropagation();
                        controller.toggleLock(id);
                      }}
                    />
                    <Btn
                      icon="dice"
                      variant="ghost"
                      title="Randomize this block"
                      onClick={(e) => {
                        e.stopPropagation();
                        controller.randomizeBlock(id, true);
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

export function SettingsPanel() {
  const controller = useController();
  const settings = useSelector((s) => s.project.settings);
  const capabilities = controller.capabilities;
  const stats = controller.imageStats();

  return (
    <>
      <Section title="Images">
        <Field label="Thumbnail cache budget" value={`${settings.thumbnailBudgetMB} MB`}>
          <NumberInput value={settings.thumbnailBudgetMB} min={8} max={512} onCommit={(value) => controller.updateSettings({ thumbnailBudgetMB: value })} />
        </Field>
        <KeyValue
          rows={[
            ['decoded tiles', stats.entries],
            ['cache in use', `${(stats.bytes / 1024 / 1024).toFixed(1)} MB`],
            ['queue', stats.pending],
          ]}
        />
        <div className="btn-row">
          <Btn icon="reset" onClick={() => controller.images.clear()}>Clear image cache</Btn>
        </div>
      </Section>

      <Section title="History">
        <Field label="Undo steps" value={String(settings.historyLimit)}>
          <NumberInput value={settings.historyLimit} min={10} max={500} onCommit={(value) => controller.updateSettings({ historyLimit: value })} />
        </Field>
        <div className="panel-note">Ctrl+Z undoes a whole operation — e.g. a Randomize All that changed 15 blocks reverts in one step.</div>
      </Section>

      <Section title="Environment">
        <KeyValue
          rows={[
            ['adapter', controller.adapter.kind],
            ['directory picker', capabilities.directoryPicker ? 'yes' : 'no'],
            ['absolute paths', capabilities.absolutePaths ? 'yes' : 'no'],
            ['persistent handles', capabilities.persistedHandles ? 'yes' : 'no'],
            ['native decoders', capabilities.nativeDecoders ? 'yes (TIFF/HEIC)' : 'browser only'],
          ]}
        />
        <div className="panel-note">
          The same core runs in the browser and in the Electron shell; only the file-system adapter changes.
        </div>
      </Section>

      <Section title="Shortcuts">
        <KeyValue
          rows={[
            ['Ctrl+Z', 'undo'],
            ['Ctrl+Y / Ctrl+Shift+Z', 'redo'],
            ['Ctrl+S', 'export project'],
            ['Ctrl+O', 'import project'],
            ['Ctrl+B', 'add block'],
            ['Esc', 'exit preview / finish editing'],
            ['↑ ↓ ← → / wheel', 'navigate preview'],
            ['R', 'randomize current block in preview'],
          ]}
        />
      </Section>

      <Section title="Danger zone">
        <div className="btn-row">
          <Btn icon="trash" variant="danger" onClick={() => controller.newProject()}>Reset project</Btn>
        </div>
        <div className="panel-note">Source images on disk are never modified, renamed or deleted by this tool.</div>
      </Section>

      <Section title="Formats">
        <div className="row wrap tight">
          <Chip tone="ok">JPG</Chip>
          <Chip tone="ok">PNG</Chip>
          <Chip tone="ok">WebP</Chip>
          <Chip tone="ok">GIF</Chip>
          <Chip tone="ok">SVG</Chip>
          <Chip tone="ok">AVIF</Chip>
          <Chip tone="ok">BMP</Chip>
          <Chip tone="warn">TIFF*</Chip>
          <Chip tone="warn">HEIC*</Chip>
        </div>
        <div className="panel-note">
          * imported as metadata and shown as “Unsupported format”; decoded automatically in the Electron build when the native codec is installed.
        </div>
      </Section>
    </>
  );
}
