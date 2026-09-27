import type { LayerTypography, TextLayerKey } from '../../core/types';
import { Btn, Field, NumberInput, Segmented, Slider } from '../components/primitives';

const LABELS: Record<TextLayerKey, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  items: 'Item lines',
  keywords: 'Keywords',
};

/** Compact per-layer typography editor (spec §94) — works for the global set and for one block. */
export function LayerControls({
  layer,
  value,
  overridden,
  onChange,
  onReset,
}: {
  layer: TextLayerKey;
  value: LayerTypography;
  overridden: boolean;
  onChange: (patch: Partial<LayerTypography>) => void;
  onReset: () => void;
}) {
  return (
    <div className="panel-section" style={{ paddingBottom: 8 }}>
      <div className="section-title">
        <span>
          {LABELS[layer]} {overridden ? <span className="chip acc" style={{ marginLeft: 6 }}>block</span> : null}
        </span>
        <span className="row tight">
          <label className="switch" title="Show / hide this layer">
            <input type="checkbox" checked={value.visible} onChange={(e) => onChange({ visible: e.target.checked })} />
            <span className="track" />
          </label>
          <Btn icon="reset" variant="ghost" title="Reset to global value" onClick={onReset} />
        </span>
      </div>

      <div className="grid-2">
        <Field label="Size">
          <NumberInput value={Math.round(value.fontSize * 10) / 10} min={4} max={400} step={0.5} onCommit={(v) => onChange({ fontSize: v })} />
        </Field>
        <Field label="Weight">
          <Segmented
            value={String(value.weight)}
            onChange={(v) => onChange({ weight: Number(v) })}
            options={[
              { value: '300', label: '300' },
              { value: '400', label: '400' },
              { value: '600', label: '600' },
              { value: '700', label: '700' },
            ]}
          />
        </Field>
      </div>

      <div className="grid-3">
        <Field label="Tracking" value={value.letterSpacing.toFixed(3)}>
          <Slider min={-0.05} max={0.4} step={0.005} value={value.letterSpacing} onChange={(v) => onChange({ letterSpacing: v })} />
        </Field>
        <Field label="Line height" value={value.lineHeight.toFixed(2)}>
          <Slider min={0.8} max={2} step={0.02} value={value.lineHeight} onChange={(v) => onChange({ lineHeight: v })} />
        </Field>
        <Field label="Opacity" value={`${Math.round(value.opacity * 100)}%`}>
          <Slider min={0} max={1} step={0.01} value={value.opacity} onChange={(v) => onChange({ opacity: v })} />
        </Field>
      </div>

      <div className="row between">
        <Segmented
          value={value.align}
          onChange={(v) => onChange({ align: v })}
          options={[
            { value: 'left', label: 'L' },
            { value: 'center', label: 'C' },
            { value: 'right', label: 'R' },
          ]}
        />
        <Segmented
          value={value.textTransform}
          onChange={(v) => onChange({ textTransform: v })}
          options={[
            { value: 'none', label: 'Aa' },
            { value: 'uppercase', label: 'AA' },
          ]}
        />
        <div className="row tight">
          <input type="color" value={value.color} onChange={(e) => onChange({ color: e.target.value })} />
          <Btn icon="reset" variant="ghost" title="White" onClick={() => onChange({ color: '#ffffff' })} />
        </div>
      </div>
    </div>
  );
}
