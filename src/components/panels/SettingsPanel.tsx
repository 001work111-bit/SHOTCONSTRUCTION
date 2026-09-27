import { useProjectStore, actions } from '../../store/ProjectStore';
import { Section, Slider, Label, Divider } from '../ui/primitives';

export function SettingsPanel() {
  const { state, dispatch } = useProjectStore();
  const ts = state.settings.textStyle;

  return (
    <div className="space-y-4">
      <Section title="Typography defaults">
        <p className="mb-2 text-[10px] text-white/35">
          Visual scale for text on blocks (edit mode & preview).
        </p>
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between">
              <Label className="mb-0">Title size</Label>
              <span className="text-[10px] tabular-nums text-white/45">{ts.titleSize}px</span>
            </div>
            <Slider
              min={24}
              max={120}
              value={ts.titleSize}
              onChange={(v) =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    textStyle: { ...s.settings.textStyle, titleSize: v },
                  })
                )
              }
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <Label className="mb-0">Subtitle size</Label>
              <span className="text-[10px] tabular-nums text-white/45">{ts.subtitleSize}px</span>
            </div>
            <Slider
              min={10}
              max={32}
              value={ts.subtitleSize}
              onChange={(v) =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    textStyle: { ...s.settings.textStyle, subtitleSize: v },
                  })
                )
              }
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <Label className="mb-0">Item size</Label>
              <span className="text-[10px] tabular-nums text-white/45">{ts.itemSize}px</span>
            </div>
            <Slider
              min={10}
              max={28}
              value={ts.itemSize}
              onChange={(v) =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    textStyle: { ...s.settings.textStyle, itemSize: v },
                  })
                )
              }
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <Label className="mb-0">Category size</Label>
              <span className="text-[10px] tabular-nums text-white/45">{ts.categorySize}px</span>
            </div>
            <Slider
              min={18}
              max={80}
              value={ts.categorySize}
              onChange={(v) =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    textStyle: { ...s.settings.textStyle, categorySize: v },
                  })
                )
              }
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <Label className="mb-0">Text opacity</Label>
              <span className="text-[10px] tabular-nums text-white/45">{ts.opacity}%</span>
            </div>
            <Slider
              value={ts.opacity}
              onChange={(v) =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    textStyle: { ...s.settings.textStyle, opacity: v },
                  })
                )
              }
            />
          </div>
          <div>
            <Label>Text color</Label>
            <input
              type="color"
              value={ts.color}
              onChange={(e) =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    textStyle: { ...s.settings.textStyle, color: e.target.value },
                  })
                )
              }
              className="h-8 w-full cursor-pointer rounded border border-white/10 bg-transparent"
            />
          </div>
        </div>
      </Section>

      <Divider />

      <Section title="About">
        <div className="space-y-1 rounded-md border border-white/8 bg-black/30 p-2.5 text-[10px] text-white/45">
          <div>Visual Constructor v1</div>
          <div>Local-only · Browser FS Access API</div>
          <div>Architecture ready for Electron</div>
          <div className="pt-1 text-white/30">
            Project schema version: {state.meta.version}
          </div>
        </div>
      </Section>
    </div>
  );
}
