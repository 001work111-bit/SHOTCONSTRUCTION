import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  Select,
  Checkbox,
  NumberInput,
  Slider,
} from '../ui/primitives';
import { IconEye, IconPlay } from '../icons';
import type { TransitionType, NavigationMode } from '../../core/types';

export function PreviewPanel() {
  const { state, dispatch } = useProjectStore();
  const p = state.preview;

  return (
    <div className="space-y-4">
      <Button
        variant="primary"
        className="w-full justify-start"
        onClick={() => dispatch((s) => actions.setMode(s, 'preview'))}
      >
        <IconEye size={14} /> Enter Preview Mode
      </Button>
      <p className="text-[10px] leading-relaxed text-white/35">
        ESC exits preview. Wheel / arrows navigate. Looks like the real one-page site.
      </p>

      <Section title="Transition">
        <Select
          value={p.transitionType}
          onChange={(v) =>
            dispatch((s) =>
              actions.setPreviewSettings(s, { transitionType: v as TransitionType })
            )
          }
          options={[
            { value: 'fade', label: 'Fade' },
            { value: 'slide', label: 'Vertical Slide' },
            { value: 'crossfade', label: 'Crossfade / Overlay' },
          ]}
        />
      </Section>

      <Section title="Duration (ms)">
        <div className="flex items-center gap-2">
          <Slider
            min={100}
            max={2000}
            step={50}
            value={p.transitionDuration}
            onChange={(v) =>
              dispatch((s) => actions.setPreviewSettings(s, { transitionDuration: v }))
            }
          />
          <span className="w-10 text-right text-[10px] tabular-nums text-white/50">
            {p.transitionDuration}
          </span>
        </div>
      </Section>

      <Section title="Autoplay delay (ms)">
        <NumberInput
          min={1000}
          max={30000}
          step={500}
          value={p.transitionDelay}
          onChange={(e) =>
            dispatch((s) =>
              actions.setPreviewSettings(s, {
                transitionDelay: Number(e.target.value) || 4000,
              })
            )
          }
        />
      </Section>

      <Section title="Easing">
        <Select
          value={p.easing}
          onChange={(v) => dispatch((s) => actions.setPreviewSettings(s, { easing: v }))}
          options={[
            { value: 'ease', label: 'ease' },
            { value: 'ease-in', label: 'ease-in' },
            { value: 'ease-out', label: 'ease-out' },
            { value: 'ease-in-out', label: 'ease-in-out' },
            { value: 'linear', label: 'linear' },
          ]}
        />
      </Section>

      <Section title="Navigation">
        <Select
          value={p.navigationMode}
          onChange={(v) =>
            dispatch((s) =>
              actions.setPreviewSettings(s, { navigationMode: v as NavigationMode })
            )
          }
          options={[
            { value: 'manual', label: 'Manual only' },
            { value: 'auto', label: 'Autoplay only' },
            { value: 'both', label: 'Auto + Manual' },
          ]}
        />
      </Section>

      <div className="space-y-1">
        <Checkbox
          checked={p.autoplay}
          onChange={(v) => dispatch((s) => actions.setPreviewSettings(s, { autoplay: v }))}
          label="Autoplay"
        />
        <Checkbox
          checked={p.loop}
          onChange={(v) => dispatch((s) => actions.setPreviewSettings(s, { loop: v }))}
          label="Loop"
        />
      </div>

      <div className="rounded-md border border-white/8 bg-black/30 p-2.5 text-[10px] text-white/40">
        <div className="mb-1 flex items-center gap-1 text-white/60">
          <IconPlay size={11} /> Controls
        </div>
        <div>↑ ↓ ← → or mouse wheel — navigate</div>
        <div>🎲 on active slide — randomize current</div>
        <div>ESC — exit preview</div>
      </div>
    </div>
  );
}
