import { useState } from 'react';
import { poolSizes } from '../../../core/selectors';
import { textOverrideStats } from '../../../core/templates';
import { ASPECT_PRESETS } from '../../../core/defaults';
import type { AspectPreset, PreviewEasing, PreviewNavigation, PreviewTransition, TextLayerKey } from '../../../core/types';
import { useBlockMap, useBlockOrder, useController, useFavoritesMap, useSelector, useTemplate } from '../../hooks';
import { Btn, Chip, Empty, Field, KeyValue, NumberInput, Section, Segmented, Slider, Switch, TextInput } from '../../components/primitives';
import { LayerControls } from '../../inspector/LayerControls';
import { Icon } from '../../components/Icon';

/* -------------------------------------------------------------------- text -- */

export function TextPanel() {
  const controller = useController();
  const template = useTemplate();
  const typography = useSelector((s) => s.project.settings.typography);
  const stats = useSelector((s) => textOverrideStats(s.project));
  const [json, setJson] = useState('');
  const [mode, setMode] = useState<'keep' | 'discard'>('keep');

  return (
    <>
      <Section
        title="Global text template"
        right={<span className="dim" style={{ fontSize: 10 }}>{stats.overridden} edited · {stats.inherited} inherited</span>}
      >
        <Field label="Title">
          <TextInput value={template.title} onCommit={(value) => controller.setTemplateLayer('title', value)} />
        </Field>
        <Field label="Subtitle">
          <TextInput value={template.subtitle} onCommit={(value) => controller.setTemplateLayer('subtitle', value)} />
        </Field>

        <Field label="Item lines">
          <div />
        </Field>
        {template.items.map((item, i) => (
          <div className="row tight" key={`tpl-item-${i}`}>
            <TextInput value={item} onCommit={(value) => controller.setTemplateLayer('items', value, i)} />
            <Btn icon="trash" variant="ghost" title="Remove" onClick={() => controller.removeTemplateLine('items', i)} />
          </div>
        ))}
        <Btn icon="plus" onClick={() => controller.addTemplateLine('items')}>Add item</Btn>

        <Field label="Keyword lines">
          <div />
        </Field>
        {template.keywords.map((word, i) => (
          <div className="row tight" key={`tpl-kw-${i}`}>
            <TextInput value={word} onCommit={(value) => controller.setTemplateLayer('keywords', value, i)} />
            <Btn icon="trash" variant="ghost" title="Remove" onClick={() => controller.removeTemplateLine('keywords', i)} />
          </div>
        ))}
        <Btn icon="plus" onClick={() => controller.addTemplateLine('keywords')}>Add keyword</Btn>

        <div className="btn-row" style={{ marginTop: 10 }}>
          <Btn icon="reset" onClick={() => controller.resetAllText()}>Reset all blocks to template</Btn>
        </div>
        <div className="panel-note">
          The template is the initial value for every block. Editing text on a block creates a local override and never touches the others.
        </div>
      </Section>

      <Section title="Import template JSON">
        <textarea
          className="textarea"
          value={json}
          placeholder={'{ "title": "Авто", "subtitle": "Организуем перевозки", "items": ["Автокомпонентов"], "keywords": ["Электроника"] }'}
          onChange={(e) => setJson(e.target.value)}
        />
        <div className="row between" style={{ marginTop: 6 }}>
          <Switch checked={mode === 'discard'} label="discard local overrides" onChange={(value) => setMode(value ? 'discard' : 'keep')} />
        </div>
        <div className="btn-row" style={{ marginTop: 6 }}>
          <Btn
            icon="check"
            variant="primary"
            onClick={() => {
              if (controller.importTemplateText(json, mode)) setJson('');
            }}
          >
            Apply JSON
          </Btn>
          <Btn
            icon="open"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/json,.json,.txt';
              input.onchange = () => {
                const file = input.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => controller.importTemplateText(String(reader.result ?? ''), mode);
                reader.readAsText(file);
              };
              input.click();
            }}
          >
            From file…
          </Btn>
          <Btn
            icon="save"
            onClick={() => setJson(JSON.stringify(template, null, 2))}
            title="Load the current template into the editor"
          >
            Load current
          </Btn>
        </div>
        <div className="panel-note">
          Accepted shapes: title/subtitle/items/keywords — aliases like heading, lines, words or services also work. An invalid JSON never breaks the project.
        </div>
      </Section>

      <Section title="Global typography">
        <div className="grid-3">
          <Field label="Anchor X" value={`${Math.round(typography.group.anchorX)}%`}>
            <Slider min={10} max={90} value={typography.group.anchorX} onChange={(v) => controller.patchGlobalTextStyle({ group: { anchorX: v } })} />
          </Field>
          <Field label="Anchor Y" value={`${Math.round(typography.group.anchorY)}%`}>
            <Slider min={0} max={80} value={typography.group.anchorY} onChange={(v) => controller.patchGlobalTextStyle({ group: { anchorY: v } })} />
          </Field>
          <Field label="Width" value={`${Math.round(typography.group.width)}%`}>
            <Slider min={20} max={100} value={typography.group.width} onChange={(v) => controller.patchGlobalTextStyle({ group: { width: v } })} />
          </Field>
        </div>
        {(['title', 'subtitle', 'items', 'keywords'] as TextLayerKey[]).map((layer) => (
          <LayerControls
            key={layer}
            layer={layer}
            value={typography.layers[layer]}
            overridden={false}
            onChange={(patch) => controller.patchGlobalTypography(layer, patch)}
            onReset={() => controller.patchGlobalTypography(layer, { visible: true })}
          />
        ))}
        <div className="panel-note">
          Item lines: pill border {typography.items.pill ? 'on' : 'off'} · keyword fade start {typography.keywords.opacityStart.toFixed(2)}, step{' '}
          {typography.keywords.opacityStep.toFixed(2)}
        </div>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------------- overlay -- */

export function OverlayPanel() {
  const controller = useController();
  const globalOverlay = useSelector((s) => s.project.settings.globalOverlay);
  const order = useBlockOrder();
  const blockMap = useBlockMap();
  const selectedId = useSelector((s) => s.ui.selectedBlockId);
  const overrides = order.filter((id) => Boolean(blockMap[id]?.overlayOverride)).length;
  const disabled = order.filter((id) => blockMap[id]?.overlayOverride?.enabled === false).length;

  return (
    <>
      <Section title="Global overlay (default for all blocks)">
        <div className="row between" style={{ marginBottom: 8 }}>
          <Switch checked={globalOverlay.enabled} label="enabled" onChange={(value) => controller.setGlobalOverlay({ enabled: value })} />
          <Chip>{Math.round(globalOverlay.opacity * 100)}%</Chip>
        </div>
        <Field label="Color">
          <div className="row">
            <input type="color" value={globalOverlay.color} onChange={(e) => controller.setGlobalOverlay({ color: e.target.value })} />
            <span className="dim mono">{globalOverlay.color}</span>
          </div>
        </Field>
        <Field label="Opacity">
          <Slider min={0} max={1} step={0.01} value={globalOverlay.opacity} onChange={(value) => controller.setGlobalOverlay({ opacity: value })} />
        </Field>
        <div className="panel-note">
          Layers per block: image → overlay → text. {overrides} block(s) override it, {disabled} block(s) disable it.
        </div>
      </Section>

      <Section title="Per block">
        {!order.length ? (
          <Empty>No blocks yet.</Empty>
        ) : (
          order.map((id, index) => {
            const block = blockMap[id];
            if (!block) return null;
            const own = block.overlayOverride;
            const effective = own ?? globalOverlay;
            return (
              <div
                key={id}
                className={`list-row${id === selectedId ? ' active' : ''}`}
                onClick={() => controller.selectBlock(id)}
              >
                <span className="mono tabular dim">#{String(index + 1).padStart(2, '0')}</span>
                <span className="truncate" style={{ flex: 1 }}>
                  {own ? `${own.color} · ${Math.round(own.opacity * 100)}%` : 'inherits global'}
                </span>
                {own && !own.enabled ? <Chip tone="warn">off</Chip> : null}
                <span className="row-actions">
                  <Btn
                    icon="reset"
                    variant="ghost"
                    title="Inherit global overlay"
                    onClick={(e) => {
                      e.stopPropagation();
                      controller.setBlockOverlay(id, null);
                    }}
                  />
                  <Btn
                    icon={effective.enabled ? 'close' : 'check'}
                    variant="ghost"
                    title={effective.enabled ? 'Disable overlay for this block' : 'Enable overlay for this block'}
                    onClick={(e) => {
                      e.stopPropagation();
                      controller.setBlockOverlay(id, { ...effective, enabled: !effective.enabled });
                    }}
                  />
                </span>
              </div>
            );
          })
        )}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ random -- */

export function RandomPanel() {
  const controller = useController();
  const order = useBlockOrder();
  const blockMap = useBlockMap();
  const favoritesMap = useFavoritesMap();
  const selectedId = useSelector((s) => s.ui.selectedBlockId);
  const seed = useSelector((s) => s.project.settings.lastSeed);
  const locked = order.filter((id) => blockMap[id]?.locked).length;
  // memoized: one pass over the catalog per project snapshot instead of one per block
  const poolMap = useSelector((s) => poolSizes(s.project));
  const favoritesTotal = useSelector((s) => Object.values(s.project.favorites).reduce((a, b) => a + b.length, 0));

  return (
    <>
      <Section title="Randomize">
        <div className="btn-row">
          <Btn icon="dice" variant="primary" onClick={() => controller.randomizeAll()} title="Randomize every unlocked block">
            Randomize all
          </Btn>
          <Btn icon="dice" onClick={() => controller.randomizeSelected()} disabled={!selectedId} title="Randomize the selected block (lock is ignored)">
            Randomize selected
          </Btn>
        </div>
        <div className="panel-note">
          Locked blocks are skipped by “Randomize all”. Pressing the dice on a single block always works — including for locked blocks — and every action is one undo step.
        </div>
      </Section>

      <Section title="Locks">
        <div className="btn-row">
          <Btn icon="lock" onClick={() => controller.setLockedForSelection(true)} disabled={!selectedId}>Lock selected</Btn>
          <Btn icon="unlock" onClick={() => controller.setLockedForSelection(false)} disabled={!selectedId}>Unlock selected</Btn>
          <Btn icon="lock" onClick={() => controller.setLockedAll(true)}>Lock all</Btn>
          <Btn icon="unlock" onClick={() => controller.setLockedAll(false)}>Unlock all</Btn>
        </div>
        <div className="panel-note">{locked} of {order.length} blocks are locked.</div>
      </Section>

      <Section title="Favorites">
        <KeyValue
          rows={[
            ['total favorites', favoritesTotal],
            ['blocks with favorites', Object.values(favoritesMap).filter((l) => l.length).length],
            ['blocks using them', order.filter((id) => blockMap[id]?.useFavorites).length],
          ]}
        />
        <div className="panel-note">
          When “use favorites” is on and the block has favorites, randomize picks only from them. Without favorites it silently falls back to the selected folders.
        </div>
      </Section>

      <Section title="Pools per block">
        {!order.length ? (
          <Empty>No blocks yet.</Empty>
        ) : (
          order.map((id, index) => {
            const block = blockMap[id];
            const size = poolMap[id] ?? 0;
            return (
              <div key={id} className={`list-row${id === selectedId ? ' active' : ''}`} onClick={() => controller.selectBlock(id)}>
                <span className="mono tabular dim">#{String(index + 1).padStart(2, '0')}</span>
                <span className="truncate" style={{ flex: 1 }}>
                  {block?.useFavorites && (favoritesMap[id] ?? []).length
                    ? `favorites (${(favoritesMap[id] ?? []).length})`
                    : block?.selectedFolderIds.length
                      ? `${block.selectedFolderIds.length} folders`
                      : 'all folders'}
                </span>
                {block?.locked ? <Icon name="lock" size={11} /> : null}
                <Chip tone={size ? 'default' : 'warn'}>{size} images</Chip>
                <span className="row-actions">
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
          })
        )}
      </Section>

      <Section title="Combination seed">
        <KeyValue rows={[['last seed', <span className="mono">{seed ?? '—'}</span>]]} />
        <div className="btn-row">
          <Btn icon="refresh" disabled={!seed} onClick={() => seed && controller.applyReplaySeed(seed)}>
            Reproduce this combination
          </Btn>
        </div>
        <div className="panel-note">The randomizer is seeded, so a combination can be reproduced exactly.</div>
      </Section>

      <Section title="Stacks">
        <div className="btn-row">
          <Btn icon="plus" onClick={() => controller.saveStack()}>Save stack</Btn>
          <Btn icon="chevron-left" onClick={() => controller.stepStack(-1)} />
          <Btn icon="chevron-right" onClick={() => controller.stepStack(1)} />
        </div>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------------- preview -- */

export function PreviewPanel() {
  const controller = useController();
  const preview = useSelector((s) => s.project.preview);
  const defaults = useSelector((s) => s.project.settings.blockDefaults);
  const blocks = useSelector((s) => s.project.blocks.order.length);

  return (
    <>
      <Section title="Preview">
        <Btn icon="preview" variant="primary" onClick={() => controller.openPreview()} disabled={!blocks}>
          Open preview
        </Btn>
        <div className="panel-note">Esc exits the preview; moving the mouse reveals the controls.</div>
      </Section>

      <Section title="Transition">
        <Field label="Type">
          <Segmented
            value={preview.transition}
            onChange={(value: PreviewTransition) => controller.updatePreview({ transition: value })}
            options={[
              { value: 'fade', label: 'Fade' },
              { value: 'slide-vertical', label: 'Slide ↓' },
              { value: 'slide-horizontal', label: 'Slide →' },
              { value: 'crossfade', label: 'Cross' },
              { value: 'zoom', label: 'Zoom' },
            ]}
          />
        </Field>
        <Field label="Duration" value={`${preview.duration} ms`}>
          <Slider min={120} max={2000} step={10} value={preview.duration} onChange={(v) => controller.updatePreview({ duration: v })} />
        </Field>
        <Field label="Delay (autoplay)" value={`${preview.delay} ms`}>
          <Slider min={300} max={12000} step={100} value={preview.delay} onChange={(v) => controller.updatePreview({ delay: v })} />
        </Field>
        <Field label="Easing">
          <Segmented
            value={preview.easing}
            onChange={(value: PreviewEasing) => controller.updatePreview({ easing: value })}
            options={[
              { value: 'ease', label: 'ease' },
              { value: 'ease-in-out', label: 'in-out' },
              { value: 'ease-out', label: 'out' },
              { value: 'linear', label: 'linear' },
              { value: 'cubic-bezier(.16,1,.3,1)', label: 'soft' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Behaviour">
        <div className="row between" style={{ marginBottom: 8 }}>
          <Switch checked={preview.autoplay} label="autoplay" onChange={(value) => controller.updatePreview({ autoplay: value })} />
          <Switch checked={preview.loop} label="loop" onChange={(value) => controller.updatePreview({ loop: value })} />
        </div>
        <Field label="Navigation">
          <Segmented
            value={preview.navigation}
            onChange={(value: PreviewNavigation) => controller.updatePreview({ navigation: value })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'manual', label: 'Manual' },
              { value: 'auto-manual', label: 'Auto + Manual' },
            ]}
          />
        </Field>
        <Field label="Framing">
          <Segmented
            value={preview.fit}
            onChange={(value: 'fill' | 'frame') => controller.updatePreview({ fit: value })}
            options={[
              { value: 'fill', label: 'Fill viewport' },
              { value: 'frame', label: `${defaults.width}×${defaults.height} frame` },
            ]}
          />
        </Field>
        <div className="row between">
          <Switch checked={preview.showProgress} label="progress" onChange={(value) => controller.updatePreview({ showProgress: value })} />
          <Switch checked={preview.showDice} label="dice in preview" onChange={(value) => controller.updatePreview({ showDice: value })} />
        </div>
      </Section>

      <Section title="Page defaults">
        <Field label="Aspect">
          <Segmented
            value={defaults.aspect}
            onChange={(value: AspectPreset) => {
              const preset = ASPECT_PRESETS.find((p) => p.id === value);
              controller.setGlobalBlockDefaults({ aspect: value, height: preset?.ratio ? Math.round(defaults.width / preset.ratio) : defaults.height });
            }}
            options={ASPECT_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Field>
        <div className="grid-2">
          <Field label="Width">
            <NumberInput value={defaults.width} min={64} max={8192} onCommit={(v) => controller.setGlobalBlockDefaults({ width: v })} />
          </Field>
          <Field label="Height">
            <NumberInput value={defaults.height} min={64} max={8192} onCommit={(v) => controller.setGlobalBlockDefaults({ height: v })} />
          </Field>
        </div>
        <Field label="Background">
          <div className="row">
            <input type="color" value={preview.background} onChange={(e) => controller.updatePreview({ background: e.target.value })} />
            <span className="dim mono">{preview.background}</span>
          </div>
        </Field>
      </Section>
    </>
  );
}
