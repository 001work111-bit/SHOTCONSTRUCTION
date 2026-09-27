import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  Slider,
  Checkbox,
  Divider,
  EmptyState,
  Label,
  Input,
} from '../ui/primitives';

export function OverlayPanel() {
  const { state, dispatch } = useProjectStore();
  const global = state.settings.overlay;
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;

  return (
    <div className="space-y-4">
      <Section title="Global overlay">
        <p className="mb-2 text-[10px] text-white/35">
          Default for blocks without individual override.
        </p>
        <Checkbox
          checked={global.enabled}
          onChange={(v) => dispatch((s) => actions.setGlobalOverlay(s, { enabled: v }))}
          label="Enabled"
        />
        <div className="mt-3">
          <Label>Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={global.color}
              onChange={(e) =>
                dispatch((s) => actions.setGlobalOverlay(s, { color: e.target.value }))
              }
              className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
            />
            <Input
              value={global.color}
              onChange={(e) =>
                dispatch((s) => actions.setGlobalOverlay(s, { color: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between">
            <Label className="mb-0">Opacity</Label>
            <span className="text-[10px] tabular-nums text-white/50">{global.opacity}%</span>
          </div>
          <Slider
            value={global.opacity}
            onChange={(v) => dispatch((s) => actions.setGlobalOverlay(s, { opacity: v }))}
          />
        </div>
      </Section>

      <Divider />

      {selected ? (
        <Section title={`Block overlay · ${selected.name}`}>
          <Checkbox
            checked={!!selected.overlay.override}
            onChange={(v) => {
              if (v) {
                dispatch((s) =>
                  actions.setBlockOverlay(s, selected.id, {
                    ...selected.overlay,
                    override: true,
                  })
                );
              } else {
                // reset to global
                dispatch((s) =>
                  actions.setBlockOverlay(s, selected.id, {
                    ...s.settings.overlay,
                    override: false,
                  })
                );
              }
            }}
            label="Override global"
          />
          <div className="mt-2">
            <Checkbox
              checked={selected.overlay.enabled}
              onChange={(v) =>
                dispatch((s) => actions.setBlockOverlay(s, selected.id, { enabled: v }))
              }
              label="Enabled"
            />
          </div>
          <div className="mt-3">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={selected.overlay.color}
                onChange={(e) =>
                  dispatch((s) =>
                    actions.setBlockOverlay(s, selected.id, { color: e.target.value })
                  )
                }
                className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
              />
              <Input
                value={selected.overlay.color}
                onChange={(e) =>
                  dispatch((s) =>
                    actions.setBlockOverlay(s, selected.id, { color: e.target.value })
                  )
                }
              />
            </div>
          </div>
          <div className="mt-3">
            <div className="mb-1 flex justify-between">
              <Label className="mb-0">Opacity</Label>
              <span className="text-[10px] tabular-nums text-white/50">
                {selected.overlay.opacity}%
              </span>
            </div>
            <Slider
              value={selected.overlay.opacity}
              onChange={(v) =>
                dispatch((s) => actions.setBlockOverlay(s, selected.id, { opacity: v }))
              }
            />
          </div>
          <Button
            className="mt-3 w-full"
            size="sm"
            variant="subtle"
            onClick={() =>
              dispatch((s) =>
                actions.setBlockOverlay(s, selected.id, {
                  ...s.settings.overlay,
                  override: false,
                })
              )
            }
          >
            Reset to global
          </Button>
        </Section>
      ) : (
        <EmptyState title="Select a block" hint="for individual overlay" />
      )}
    </div>
  );
}
