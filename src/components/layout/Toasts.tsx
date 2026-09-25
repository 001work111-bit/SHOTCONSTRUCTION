import { useProjectStore } from '../../store/ProjectStore';
import { cn } from '../../utils/cn';
import { IconClose } from '../icons';

export function Toasts() {
  const { toasts, dismissToast } = useProjectStore();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-10 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs shadow-xl backdrop-blur-md',
            t.level === 'success' && 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100',
            t.level === 'error' && 'border-red-500/30 bg-red-950/90 text-red-100',
            t.level === 'warning' && 'border-amber-500/30 bg-amber-950/90 text-amber-100',
            t.level === 'info' && 'border-white/10 bg-zinc-900/95 text-white/85'
          )}
        >
          <span className="flex-1 leading-relaxed">{t.text}</span>
          <button
            type="button"
            className="shrink-0 text-white/40 hover:text-white"
            onClick={() => dismissToast(t.id)}
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
