import { useProjectStore, actions } from '../../store/ProjectStore';
import {
  Button,
  Section,
  Checkbox,
  NumberInput,
  Slider,
  Divider,
} from '../ui/primitives';
import { IconEye, IconPlay, IconDice, IconStar, IconSequence } from '../icons';
import type {
  TransitionType,
  NavigationMode,
  AspectRatioPreset,
} from '../../core/types';
import { TRANSITION_LABELS, EASING_OPTIONS } from '../../core/types';
import { cn } from '../../utils/cn';

const TRANSITIONS: Array<{ value: TransitionType; label: string; hint: string }> = [
  { value: 'fade', label: 'Fade', hint: 'Простое растворение' },
  { value: 'slide-vertical', label: 'Slide ↓', hint: 'Сдвиг вверх/вниз' },
  { value: 'slide-horizontal', label: 'Slide →', hint: 'Сдвиг влево/вправо' },
  { value: 'crossfade', label: 'Cross', hint: 'Cross dissolve — кадры пересекаются' },
  { value: 'zoom', label: 'Zoom', hint: 'Лёгкий зум входящего кадра' },
];

const NAVIGATION: Array<{ value: NavigationMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
  { value: 'both', label: 'Auto + Manual' },
];

const ASPECTS: Array<{ value: AspectRatioPreset; label: string }> = [
  { value: '2:1', label: '2:1' },
  { value: '16:9', label: '16:9' },
  { value: '16:10', label: '16:10' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '1:1', label: '1:1' },
  { value: 'custom', label: 'Custom' },
];

export function PreviewPanel() {
  const { state, dispatch, openPreview } = useProjectStore();
  const p = state.preview;
  const dims = state.settings.defaultDimensions;
  const sequential = state.settings.randomMode === 'sequential';

  const setPreview = (patch: Parameters<typeof actions.updatePreviewSettings>[1]) =>
    dispatch((s) => actions.updatePreviewSettings(s, patch));

  return (
    <div className="space-y-4">
      <Button variant="primary" className="w-full justify-start" onClick={openPreview}>
        <IconEye size={14} /> Открыть превью
      </Button>
      <p className="text-[10px] leading-relaxed text-white/35">
        Esc — выход из превью. Превращение мыши показывает управление.
        Превью открывается с того блока, который выделен в редакторе.
      </p>

      {/* ------------------------------------------------ режим смены */}
      <Section title="Режим смены картинок">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => dispatch((s) => actions.setRandomMode(s, 'random'))}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition',
              !sequential
                ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                : 'border-white/10 text-white/60 hover:border-white/25'
            )}
            title="Кубик: случайная картинка"
          >
            <IconDice size={13} /> Случайно
          </button>
          <button
            type="button"
            onClick={() => dispatch((s) => actions.setRandomMode(s, 'sequential'))}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition',
              sequential
                ? 'border-sky-500/50 bg-sky-500/15 text-white'
                : 'border-white/10 text-white/60 hover:border-white/25'
            )}
            title="По порядку, без повторов"
          >
            <IconSequence size={13} /> По порядку
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">
          {sequential
            ? 'Alt+← / Alt+→ — листать картинки блока по очереди. Когда круг закончится — начнётся заново.'
            : 'Клавиша R или кубик — случайная картинка для выделенного блока.'}
        </p>
      </Section>

      <Divider />

      {/* ------------------------------------------------ переход */}
      <Section title="Переход">
        <div className="space-y-1">
          {TRANSITIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setPreview({ transitionType: t.value })}
              className={cn(
                'flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-[11px] transition',
                p.transitionType === t.value
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                  : 'border-white/10 text-white/60 hover:border-white/25'
              )}
              title={t.hint}
            >
              <span>{t.label}</span>
              <span className="text-[9px] text-white/30">
                {p.transitionType === t.value ? '✓' : t.hint.split(' — ')[0]}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Длительность">
        <div className="flex items-center gap-2">
          <Slider
            min={100}
            max={2000}
            step={50}
            value={p.transitionDuration}
            onChange={(v) => setPreview({ transitionDuration: v })}
          />
          <span className="w-12 text-right text-[10px] tabular-nums text-white/50">
            {p.transitionDuration} ms
          </span>
        </div>
      </Section>

      <Section title="Задержка (автоплей)">
        <div className="flex items-center gap-2">
          <Slider
            min={600}
            max={15000}
            step={100}
            value={p.transitionDelay}
            onChange={(v) => setPreview({ transitionDelay: v })}
          />
          <span className="w-12 text-right text-[10px] tabular-nums text-white/50">
            {p.transitionDelay} ms
          </span>
        </div>
      </Section>

      <Section title="Плавность (easing)">
        <div className="flex flex-wrap gap-1">
          {EASING_OPTIONS.map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => setPreview({ easing: e.value })}
              className={cn(
                'rounded-md border px-2 py-1 text-[10px] transition',
                p.easing === e.value
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/25'
              )}
            >
              {e.label}
            </button>
          ))}
        </div>
      </Section>

      <Divider />

      {/* ------------------------------------------------ поведение */}
      <Section title="Поведение">
        <div className="space-y-1">
          <Checkbox
            checked={p.autoplay}
            onChange={(v) => setPreview({ autoplay: v })}
            label="автоплей"
          />
          <Checkbox checked={p.loop} onChange={(v) => setPreview({ loop: v })} label="по кругу" />
        </div>
      </Section>

      <Section title="Навигация">
        <div className="flex gap-1">
          {NAVIGATION.map((n) => (
            <button
              key={n.value}
              type="button"
              onClick={() => setPreview({ navigationMode: n.value })}
              className={cn(
                'flex-1 rounded-md border px-1 py-1.5 text-[10px] transition',
                p.navigationMode === n.value
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/25'
              )}
            >
              {n.label}
            </button>
          ))}
        </div>
      </Section>

      <Divider />

      {/* ------------------------------------------------ кадр */}
      <Section title="Кадр">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setPreview({ fit: 'fill' })}
            className={cn(
              'rounded-md border px-2 py-1.5 text-[11px] transition',
              p.fit === 'fill'
                ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                : 'border-white/10 text-white/55 hover:border-white/25'
            )}
          >
            На весь экран
          </button>
          <button
            type="button"
            onClick={() => setPreview({ fit: 'frame' })}
            className={cn(
              'rounded-md border px-2 py-1.5 text-[11px] transition',
              p.fit === 'frame'
                ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                : 'border-white/10 text-white/55 hover:border-white/25'
            )}
            title="Точный кадр блока, как на макете"
          >
            {dims.width}×{dims.height} кадр
          </button>
        </div>
        <div className="mt-2 space-y-1">
          <Checkbox
            checked={p.showProgress}
            onChange={(v) => setPreview({ showProgress: v })}
            label="полоса прогресса"
          />
          <Checkbox
            checked={p.showDice}
            onChange={(v) => setPreview({ showDice: v })}
            label="кубик в превью"
          />
        </div>
      </Section>

      {/* ------------------------------------------------ параметры страницы */}
      <Section title="Параметры страницы">
        <div className="mb-2 flex flex-wrap gap-1">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() =>
                dispatch((s) =>
                  actions.setGlobalSettings(s, {
                    defaultDimensions: { ...s.settings.defaultDimensions, aspectRatio: a.value },
                  })
                )
              }
              className={cn(
                'rounded-md border px-1.5 py-1 text-[10px] transition',
                dims.aspectRatio === a.value
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/25'
              )}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label className="w-14 text-[10px] text-white/45">ширина</label>
          <NumberInput
            min={64}
            max={8192}
            step={16}
            value={dims.width}
            onChange={(e) => {
              const width = Number(e.target.value) || dims.width;
              dispatch((s) => actions.setGlobalSettings(s, { defaultDimensions: { ...dims, width } }));
            }}
          />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <label className="w-14 text-[10px] text-white/45">высота</label>
          <NumberInput
            min={64}
            max={8192}
            step={16}
            value={dims.height}
            onChange={(e) => {
              const height = Number(e.target.value) || dims.height;
              dispatch((s) => actions.setGlobalSettings(s, { defaultDimensions: { ...dims, height } }));
            }}
          />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <label className="w-14 text-[10px] text-white/45">фон</label>
          <input
            type="color"
            value={p.background}
            onChange={(e) => setPreview({ background: e.target.value })}
            className="h-7 w-10 cursor-pointer rounded border border-white/10 bg-transparent"
          />
          <span className="text-[10px] tabular-nums text-white/40">{p.background}</span>
        </div>
      </Section>

      <div className="rounded-md border border-white/8 bg-black/30 p-2.5 text-[10px] leading-relaxed text-white/40">
        <div className="mb-1 flex items-center gap-1 text-white/60">
          <IconPlay size={11} /> Управление
        </div>
        <div>← → или колесо — блоки</div>
        <div>Alt+← → — картинки блока по порядку</div>
        <div>
          <IconDice size={10} className="inline" /> R — следующая картинка
        </div>
        <div>
          <IconStar size={10} className="inline" /> F — в избранное
        </div>
        <div>Space — пауза · P — вход/выход · L — замок</div>
        <div>Esc — выход из превью</div>
        <div className="mt-1 text-white/25">
          Текущий переход: {TRANSITION_LABELS[p.transitionType]}
        </div>
      </div>
    </div>
  );
}
