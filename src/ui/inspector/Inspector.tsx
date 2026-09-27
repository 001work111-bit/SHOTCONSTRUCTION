import { useState } from 'react';
import { ASPECT_PRESETS } from '../../core/defaults';
import { formatBytes, formatDimensions, formatNote } from '../../core/formats';
import { poolSize } from '../../core/selectors';
import type { AspectPreset, TextLayerKey } from '../../core/types';
import { useAsset, useController, useSelector } from '../hooks';
import { Btn, Chip, Field, KeyValue, NumberInput, Section, Segmented, Slider, Switch, TextInput } from '../components/primitives';
import { Icon } from '../components/Icon';
import { LayerControls } from './LayerControls';

type Tab = 'image' | 'folders' | 'text' | 'overlay' | 'info';

export function Inspector() {
  const controller = useController();
  const [tab, setTab] = useState<Tab>('image');
  const selectedId = useSelector((s) => s.ui.selectedBlockId);
  const block = useSelector((s) => (s.ui.selectedBlockId ? s.project.blocks.byId[s.ui.selectedBlockId] ?? null : null));
  const index = useSelector((s) => (s.ui.selectedBlockId ? s.project.blocks.order.indexOf(s.ui.selectedBlockId) : -1));
  const total = useSelector((s) => s.project.blocks.order.length);
  const asset = useAsset(block?.imageAssetId);
  const folder = useSelector((s) => (asset?.folderId ? s.project.folders.find((f) => f.id === asset.folderId) ?? null : null));
  const pool = useSelector((s) => (block ? poolSize(s.project, block) : 0));
  const favoriteCount = useSelector((s) => (block ? (s.project.favorites[block.id] ?? []).length : 0));
  const isFavorite = useSelector((s) => (block?.imageAssetId ? (s.project.favorites[block.id] ?? []).includes(block.imageAssetId) : false));
  const missing = useSelector((s) => Boolean(block?.imageAssetId && s.project.missingAssets.includes(block.imageAssetId)));
  const globalOverlay = useSelector((s) => s.project.settings.globalOverlay);
  const globalTypo = useSelector((s) => s.project.settings.typography);
  const folders = useSelector((s) => s.project.folders);
  const template = useSelector((s) => s.project.template);

  if (!block) {
    return (
      <aside className="inspector">
        <div className="inspector-head">
          <span className="inspector-title">Nothing selected</span>
        </div>
        <Section title="How to start">
          <div className="panel-note">
            1. Load an image folder.<br />
            2. Set the number of blocks.<br />
            3. Choose folders per block.<br />
            4. Press <strong>Randomize all</strong>, star the good ones, save stacks.
          </div>
        </Section>
      </aside>
    );
  }

  const ratio = block.width / block.height;
  const overlay = block.overlayOverride ?? globalOverlay;

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <span className="inspector-title">Block #{String(index + 1).padStart(2, '0')}</span>
        <Chip>{block.width}×{block.height}</Chip>
        {block.locked ? <Chip tone="warn">locked</Chip> : null}
        <span className="header-spacer" />
        <Btn icon="chevron-left" title="Previous block" onClick={() => index > 0 && controller.selectBlock(controller.project.blocks.order[index - 1])} />
        <Btn icon="chevron-right" title="Next block" onClick={() => index < total - 1 && controller.selectBlock(controller.project.blocks.order[index + 1])} />
      </div>

      <div className="tabs">
        {(['image', 'folders', 'text', 'overlay', 'info'] as Tab[]).map((id) => (
          <button key={id} type="button" className={tab === id ? 'active' : undefined} onClick={() => setTab(id)}>
            {id === 'image' ? 'Image' : id === 'folders' ? 'Sources' : id === 'text' ? 'Text' : id === 'overlay' ? 'Overlay' : 'Info'}
          </button>
        ))}
      </div>

      {tab === 'image' ? (
        <>
          <Section
            title="Image"
            right={
              <span className="row tight">
                <Btn icon="dice" onClick={() => controller.randomizeBlock(block.id, true)} title="Randomize this block (lock is ignored for explicit actions)">
                  Randomize
                </Btn>
              </span>
            }
          >
            <div className="row wrap tight" style={{ marginBottom: 8 }}>
              <Btn icon={isFavorite ? 'star-filled' : 'star'} className="gold" active={isFavorite} onClick={() => (block.imageAssetId ? controller.toggleFavorite(block.id, block.imageAssetId) : controller.addCurrentToFavorites(block.id))}>
                Favorite for this block
              </Btn>
              <Chip tone={favoriteCount ? 'gold' : 'default'}>
                <Icon name="star-filled" size={10} /> {favoriteCount} for this block
              </Chip>
            </div>

            <Field label="Fit">
              <Segmented
                value={block.imageFit}
                onChange={(value) => controller.setFit(block.id, value)}
                options={[
                  { value: 'cover', label: 'Cover' },
                  { value: 'contain', label: 'Contain' },
                  { value: 'fill', label: 'Fill' },
                ]}
              />
            </Field>

            <Field label="Position X" value={`${Math.round(block.imagePosition.x)}%`}>
              <Slider
                min={0}
                max={100}
                value={block.imagePosition.x}
                onChange={(value) => controller.setPosition(block.id, { x: value })}
              />
            </Field>
            <Field label="Position Y" value={`${Math.round(block.imagePosition.y)}%`}>
              <Slider
                min={0}
                max={100}
                value={block.imagePosition.y}
                onChange={(value) => controller.setPosition(block.id, { y: value })}
              />
            </Field>
            <Btn icon="reset" onClick={() => controller.setPosition(block.id, { x: 50, y: 50 })}>
              Center image
            </Btn>

            <div className="panel-note">
              Drag an image from Explorer / Finder straight onto the block to replace it — the file stays outside the catalog and is referenced by name.
            </div>
          </Section>

          <Section title="Geometry">
            <Field label="Aspect">
              <Segmented
                value={block.aspect}
                onChange={(value: AspectPreset) => controller.resizeBlock(block.id, { aspect: value, driver: 'width' })}
                options={ASPECT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
              />
            </Field>
            <div className="grid-2">
              <Field label="Width">
                <NumberInput value={block.width} min={64} max={8192} onCommit={(value) => controller.resizeBlock(block.id, { width: value, driver: 'width', lockRatio: block.aspect !== 'custom' })} />
              </Field>
              <Field label="Height">
                <NumberInput value={block.height} min={64} max={8192} onCommit={(value) => controller.resizeBlock(block.id, { height: value, driver: 'height', lockRatio: block.aspect !== 'custom' })} />
              </Field>
            </div>
            <div className="row between">
              <Switch
                checked={block.aspect !== 'custom'}
                label="Lock ratio"
                onChange={(value) =>
                  controller.resizeBlock(block.id, {
                    aspect: value ? '2:1' : 'custom',
                    driver: 'width',
                  })
                }
              />
              <span className="dim mono">ratio {ratio.toFixed(3)}</span>
            </div>
            <Btn icon="blocks" onClick={() => controller.setGlobalBlockDefaults({ width: block.width, height: block.height, aspect: block.aspect })}>
              Use as default size for new blocks
            </Btn>
          </Section>

          <Section title="Actions">
            <div className="btn-row">
              <Btn icon="copy" onClick={() => controller.duplicateBlock(block.id)}>Duplicate</Btn>
              <Btn icon="up" onClick={() => controller.moveBlock(block.id, -1)}>Up</Btn>
              <Btn icon="down" onClick={() => controller.moveBlock(block.id, 1)}>Down</Btn>
              <Btn icon="trash" variant="danger" onClick={() => controller.deleteBlock(block.id)}>Delete</Btn>
            </div>
          </Section>
        </>
      ) : null}

      {tab === 'folders' ? (
        <Section
          title="Image sources"
          right={
            <span className="row tight">
              <Btn icon="check" title="Select all folders" onClick={() => controller.selectAllFolders(block.id)}>All</Btn>
              <Btn icon="close" title="Clear selection (empty = all folders)" onClick={() => controller.clearFolders(block.id)}>None</Btn>
            </span>
          }
        >
          {!folders.length ? (
            <div className="empty-state">
              No folders yet.
              <div style={{ marginTop: 8 }}>
                <Btn icon="folder-open" onClick={() => void controller.loadFolder()}>Load image folder</Btn>
              </div>
            </div>
          ) : (
            <>
              {folders.map((folderRow) => {
                const checked = block.selectedFolderIds.length === 0 || block.selectedFolderIds.includes(folderRow.id);
                return (
                  <label key={folderRow.id} className="folder-row" title={folderRow.path}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const base = block.selectedFolderIds.length ? block.selectedFolderIds : folders.map((f) => f.id);
                        const next = base.includes(folderRow.id) ? base.filter((id) => id !== folderRow.id) : [...base, folderRow.id];
                        controller.setBlockFolders(block.id, next);
                      }}
                    />
                    <span className="folder-name truncate">{folderRow.path}</span>
                    <span className="folder-count">{folderRow.imageCount}</span>
                  </label>
                );
              })}
              <div className="panel-note">
                {block.selectedFolderIds.length === 0
                  ? 'No explicit selection → every folder is used.'
                  : `${block.selectedFolderIds.length} of ${folders.length} folders selected`}
                {' · '}
                randomized pool: <strong>{pool}</strong> images
              </div>
              <div className="row between" style={{ marginTop: 8 }}>
                <Switch
                  checked={block.useFavorites}
                  label="Randomize from favorites only"
                  onChange={(value) => controller.setUseFavorites(block.id, value)}
                />
                <Chip tone={favoriteCount ? 'gold' : 'default'}>{favoriteCount} favorites</Chip>
              </div>
            </>
          )}
        </Section>
      ) : null}

      {tab === 'text' ? (
        <>
          <Section
            title="Block text"
            right={
              <span className="row tight">
                <Btn icon="reset" onClick={() => controller.resetBlockText(block.id)} title="Follow the global template again">Template</Btn>
                <Btn icon="copy" onClick={() => controller.copyTextToAllBlocks(block.id)} title="Copy this block text to every block">To all</Btn>
              </span>
            }
          >
            <div className="panel-note" style={{ marginBottom: 8 }}>
              Click any line directly on the block to edit it. Changes are stored per block and never touch other blocks.
            </div>
            <Field label="Title">
              <TextInput value={block.textOverride?.title ?? ''} placeholder="inherits template" onCommit={(value) => controller.setTextValue(block.id, 'title', value)} />
            </Field>
            <Field label="Subtitle">
              <TextInput value={block.textOverride?.subtitle ?? ''} placeholder="inherits template" onCommit={(value) => controller.setTextValue(block.id, 'subtitle', value)} />
            </Field>
            {(block.textOverride?.items ?? template.items).map((item, i) => (
              <div className="row tight" key={`item-input-${i}`}>
                <TextInput value={item} onCommit={(value) => controller.setTextValue(block.id, 'items', value, i)} />
                <Btn icon="trash" variant="ghost" title="Remove line" onClick={() => controller.removeTextLine(block.id, 'items', i)} />
              </div>
            ))}
            <Btn icon="plus" onClick={() => controller.addTextLine(block.id, 'items')}>Add item line</Btn>
            {(block.textOverride?.keywords ?? template.keywords).map((word, i) => (
              <div className="row tight" key={`kw-input-${i}`} style={{ marginTop: i === 0 ? 8 : 3 }}>
                <TextInput value={word} onCommit={(value) => controller.setTextValue(block.id, 'keywords', value, i)} />
                <Btn icon="trash" variant="ghost" title="Remove line" onClick={() => controller.removeTextLine(block.id, 'keywords', i)} />
              </div>
            ))}
            <Btn icon="plus" onClick={() => controller.addTextLine(block.id, 'keywords')}>Add keyword line</Btn>
          </Section>

          <Section title="Typography (this block)">
            {(['title', 'subtitle', 'items', 'keywords'] as TextLayerKey[]).map((layer) => (
              <LayerControls
                key={layer}
                layer={layer}
                value={block.typographyOverride?.layers?.[layer] ?? globalTypo.layers[layer]}
                overridden={Boolean(block.typographyOverride?.layers?.[layer])}
                onChange={(patch) => controller.patchBlockTypography(block.id, layer, patch)}
                onReset={() => controller.patchBlockTypography(block.id, layer, globalTypo.layers[layer])}
              />
            ))}
          </Section>
        </>
      ) : null}

      {tab === 'overlay' ? (
        <>
          <Section
            title="Overlay of this block"
            right={
              <Switch
                checked={Boolean(block.overlayOverride)}
                label="override"
                onChange={(value) => controller.setBlockOverlay(block.id, value ? { ...globalOverlay } : null)}
              />
            }
          >
            <div className="row wrap tight" style={{ marginBottom: 10 }}>
              <Btn icon="close" onClick={() => controller.setBlockOverlay(block.id, { ...overlay, enabled: false })}>Disable for this block</Btn>
              <Btn icon="reset" onClick={() => controller.setBlockOverlay(block.id, null)}>Inherit global</Btn>
            </div>
            <div className="row between" style={{ marginBottom: 8 }}>
              <Switch checked={overlay.enabled} label="enabled" onChange={(value) => controller.patchBlockOverlay(block.id, { enabled: value })} />
              <span className="dim mono">{Math.round(overlay.opacity * 100)}%</span>
            </div>
            <Field label="Color">
              <div className="row">
                <input type="color" value={overlay.color} onChange={(e) => controller.patchBlockOverlay(block.id, { color: e.target.value })} />
                <span className="dim mono">{overlay.color}</span>
              </div>
            </Field>
            <Field label="Opacity">
              <Slider min={0} max={1} step={0.01} value={overlay.opacity} onChange={(value) => controller.patchBlockOverlay(block.id, { opacity: value })} />
            </Field>
            <div className="panel-note">
              Layers: image → overlay → text. The global value is {globalOverlay.color} at {Math.round(globalOverlay.opacity * 100)}%
              {globalOverlay.enabled ? '' : ' (currently disabled globally)'}.
            </div>
          </Section>
          <Section title="Global overlay">
            <div className="row between" style={{ marginBottom: 8 }}>
              <Switch checked={globalOverlay.enabled} label="enabled" onChange={(value) => controller.setGlobalOverlay({ enabled: value })} />
            </div>
            <Field label="Color">
              <input type="color" value={globalOverlay.color} onChange={(e) => controller.setGlobalOverlay({ color: e.target.value })} />
            </Field>
            <Field label="Opacity" value={`${Math.round(globalOverlay.opacity * 100)}%`}>
              <Slider min={0} max={1} step={0.01} value={globalOverlay.opacity} onChange={(value) => controller.setGlobalOverlay({ opacity: value })} />
            </Field>
          </Section>
        </>
      ) : null}

      {tab === 'info' ? (
        <>
          <Section title="Current image">
            {asset ? (
              <KeyValue
                rows={[
                  ['file', asset.name],
                  ['folder', folder?.path ?? '— (external)'],
                  ['format', `${asset.format.toUpperCase()} · ${asset.mime || 'unknown mime'}`],
                  ['dimensions', formatDimensions(asset.width, asset.height)],
                  ['file size', formatBytes(asset.bytes)],
                  ['source', asset.source === 'manual' ? 'dropped file (outside catalog)' : 'scanned catalog'],
                  ['path', <span className="mono">{asset.path}</span>],
                ]}
              />
            ) : (
              <div className="panel-note">This block has no image yet.</div>
            )}
            {missing ? (
              <div className="row" style={{ marginTop: 8 }}>
                <Chip tone="warn">missing file</Chip>
                <Btn icon="link" onClick={() => controller.setSection('images')}>Relink folder…</Btn>
              </div>
            ) : null}
            {asset && !asset.width ? <div className="panel-note">Dimensions appear after the first decode.</div> : null}
            {asset && formatNote(asset.format) ? <div className="panel-note">{formatNote(asset.format)}</div> : null}
          </Section>

          <Section title="Block">
            <KeyValue
              rows={[
                ['id', <span className="mono">{block.id}</span>],
                ['size', `${block.width} × ${block.height}`],
                ['aspect', block.aspect],
                ['fit', block.imageFit],
                ['position', `${Math.round(block.imagePosition.x)}% / ${Math.round(block.imagePosition.y)}%`],
                ['folders', block.selectedFolderIds.length ? String(block.selectedFolderIds.length) : `all (${folders.length})`],
                ['pool', String(pool)],
                ['favorites', String(favoriteCount)],
                ['text', block.textOverride && Object.keys(block.textOverride).length ? 'local override' : 'from global template'],
                ['overlay', block.overlayOverride ? 'overridden' : 'inherited'],
                ['lock', block.locked ? 'locked (skipped by Randomize All)' : 'unlocked'],
              ]}
            />
          </Section>
        </>
      ) : null}
    </aside>
  );
}
