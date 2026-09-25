import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  NumberInput,
  Select,
  Divider,
  Label,
  Checkbox,
} from '../ui/primitives';
import { IconPlus, IconTrash, IconLock, IconUnlock } from '../icons';
import { cn } from '../../utils/cn';
import type { AspectRatioPreset } from '../../core/types';

const ASPECTS: { value: AspectRatioPreset; label: string }[] = [
  { value: '2:1', label: '2:1 (1024×512)' },
  { value: '16:9', label: '16:9' },
  { value: '16:10', label: '16:10' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '1:1', label: '1:1' },
  { value: 'custom', label: 'Custom' },
];

export function BlocksPanel() {
  const { state, dispatch } = useProjectStore();
  const dims = state.settings.defaultDimensions;
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;

  return (
    <div className="space-y-4">
      <Section title="Number of blocks">
        <div className="flex items-center gap-2">
          <NumberInput
            min={1}
            max={50}
            value={state.blockOrder.length}
            onChange={(e) =>
              dispatch((s) => actions.setBlockCount(s, Number(e.target.value) || 1))
            }
          />
          <Button
            variant="subtle"
            size="icon"
            title="Add block"
            onClick={() => dispatch((s) => actions.addBlock(s))}
          >
            <IconPlus size={14} />
          </Button>
        </div>
      </Section>

      <Section title="Aspect ratio">
        <Select
          value={dims.aspectRatio}
          onChange={(v) =>
            dispatch((s) =>
              actions.setDimensions(s, { aspectRatio: v as AspectRatioPreset })
            )
          }
          options={ASPECTS}
        />
      </Section>

      <Section title="Resolution">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Width</Label>
            <NumberInput
              min={200}
              max={4096}
              value={dims.width}
              onChange={(e) =>
                dispatch((s) =>
                  actions.setDimensions(s, { width: Number(e.target.value) || 1024 })
                )
              }
            />
          </div>
          <div>
            <Label>Height</Label>
            <NumberInput
              min={100}
              max={4096}
              value={dims.height}
              onChange={(e) =>
                dispatch((s) =>
                  actions.setDimensions(s, {
                    height: Number(e.target.value) || 512,
                    aspectRatio: 'custom',
                    lockAspect: false,
                  })
                )
              }
            />
          </div>
        </div>
        <div className="mt-2">
          <Checkbox
            checked={dims.lockAspect}
            onChange={(v) => dispatch((s) => actions.setDimensions(s, { lockAspect: v }))}
            label="Lock aspect ratio"
          />
        </div>
      </Section>

      <Divider />

      <Section title="Blocks list">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {state.blockOrder.map((id) => {
            const b = state.blocks[id];
            if (!b) return null;
            const isSel = state.selectedBlockId === id;
            return (
              <div
                key={id}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition',
                  isSel ? 'bg-emerald-500/15 text-emerald-200' : 'text-white/70 hover:bg-white/6'
                )}
                onClick={() => dispatch((s) => actions.selectBlock(s, id))}
              >
                <span className="w-6 tabular-nums text-white/35">
                  {String(b.order + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 truncate">{b.name}</span>
                {b.favoriteAssetIds.length > 0 && (
                  <span className="text-[10px] text-amber-300/80">★{b.favoriteAssetIds.length}</span>
                )}
                {b.locked && <IconLock size={12} className="text-amber-300/70" />}
                <button
                  type="button"
                  className="rounded p-0.5 text-white/30 hover:bg-white/10 hover:text-red-300"
                  title="Delete block"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch((s) => actions.deleteBlock(s, id));
                  }}
                >
                  <IconTrash size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      {selected && (
        <>
          <Divider />
          <Section title={`Selected · ${selected.name}`}>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => dispatch((s) => actions.toggleLock(s, selected.id))}
              >
                {selected.locked ? <IconUnlock size={13} /> : <IconLock size={13} />}
                {selected.locked ? 'Unlock' : 'Lock'}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => dispatch((s) => actions.deleteBlock(s, selected.id))}
              >
                <IconTrash size={13} />
              </Button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
