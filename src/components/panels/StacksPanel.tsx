import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Section, EmptyState, Badge } from '../ui/primitives';
import { IconStack, IconTrash, IconChevronLeft, IconChevronRight } from '../icons';
import { cn } from '../../utils/cn';

export function StacksPanel() {
  const { state, dispatch } = useProjectStore();

  return (
    <div className="space-y-4">
      <Button
        variant="primary"
        className="w-full justify-start"
        onClick={() => dispatch((s) => actions.saveStack(s))}
      >
        <IconStack size={14} /> Save current as Stack
      </Button>

      {state.stacks.length > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => dispatch((s) => actions.navigateStack(s, -1))}
          >
            <IconChevronLeft size={14} />
          </Button>
          <span className="min-w-[100px] text-center text-[11px] text-white/70">
            {state.activeStackId
              ? (() => {
                  const i = state.stacks.findIndex((s) => s.id === state.activeStackId);
                  return i >= 0
                    ? `${state.stacks[i].name}  (${i + 1}/${state.stacks.length})`
                    : `— / ${state.stacks.length}`;
                })()
              : `None / ${state.stacks.length}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => dispatch((s) => actions.navigateStack(s, 1))}
          >
            <IconChevronRight size={14} />
          </Button>
        </div>
      )}

      <Section title={`Saved stacks · ${state.stacks.length}`}>
        {state.stacks.length === 0 ? (
          <EmptyState
            title="No stacks yet"
            hint="Randomize, then save combinations you like"
          />
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {state.stacks.map((stack, idx) => {
              const active = state.activeStackId === stack.id;
              const filled = Object.values(stack.images).filter(Boolean).length;
              return (
                <div
                  key={stack.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-2 transition',
                    active
                      ? 'border-sky-500/40 bg-sky-500/10'
                      : 'border-white/8 hover:bg-white/5'
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => dispatch((s) => actions.applyStack(s, stack.id))}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] tabular-nums text-white/35">
                        {String(idx + 1).padStart(3, '0')}
                      </span>
                      <span className="truncate text-xs text-white/85">{stack.name}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/35">
                      <span>
                        {filled}/{state.blockOrder.length} images
                      </span>
                      <span>{new Date(stack.createdAt).toLocaleString()}</span>
                    </div>
                  </button>
                  {active && <Badge tone="accent">Active</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-red-300"
                    onClick={() => dispatch((s) => actions.deleteStack(s, stack.id))}
                  >
                    <IconTrash size={13} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
