import type { FC } from 'react';
import { useProjectStore, type PanelId } from '../../store/ProjectStore';
import { cn } from '../../utils/cn';
import {
  IconProject,
  IconBlocks,
  IconImage,
  IconText,
  IconOverlay,
  IconDice,
  IconStar,
  IconStack,
  IconEye,
  IconSettings,
  IconChevronLeft,
  IconChevronRight,
} from '../icons';
import { ProjectPanel } from '../panels/ProjectPanel';
import { BlocksPanel } from '../panels/BlocksPanel';
import { ImagesPanel } from '../panels/ImagesPanel';
import { TextPanel } from '../panels/TextPanel';
import { OverlayPanel } from '../panels/OverlayPanel';
import { RandomPanel } from '../panels/RandomPanel';
import { FavoritesPanel } from '../panels/FavoritesPanel';
import { StacksPanel } from '../panels/StacksPanel';
import { PreviewPanel } from '../panels/PreviewPanel';
import { SettingsPanel } from '../panels/SettingsPanel';

const NAV: { id: PanelId; label: string; icon: FC<{ size?: number }> }[] = [
  { id: 'project', label: 'Project', icon: IconProject },
  { id: 'blocks', label: 'Blocks', icon: IconBlocks },
  { id: 'images', label: 'Images', icon: IconImage },
  { id: 'text', label: 'Text', icon: IconText },
  { id: 'overlay', label: 'Overlay', icon: IconOverlay },
  { id: 'random', label: 'Random', icon: IconDice },
  { id: 'favorites', label: 'Favorites', icon: IconStar },
  { id: 'stacks', label: 'Stacks', icon: IconStack },
  { id: 'preview', label: 'Preview', icon: IconEye },
  { id: 'settings', label: 'Settings', icon: IconSettings },
];

function PanelBody({ id }: { id: PanelId }) {
  switch (id) {
    case 'project':
      return <ProjectPanel />;
    case 'blocks':
      return <BlocksPanel />;
    case 'images':
      return <ImagesPanel />;
    case 'text':
      return <TextPanel />;
    case 'overlay':
      return <OverlayPanel />;
    case 'random':
      return <RandomPanel />;
    case 'favorites':
      return <FavoritesPanel />;
    case 'stacks':
      return <StacksPanel />;
    case 'preview':
      return <PreviewPanel />;
    case 'settings':
      return <SettingsPanel />;
    default:
      return null;
  }
}

export function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, activePanel, setActivePanel, state } =
    useProjectStore();

  if (sidebarCollapsed) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-white/8 bg-[#0e0e11] py-2">
        <button
          type="button"
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-md text-white/50 hover:bg-white/8 hover:text-white"
          onClick={() => setSidebarCollapsed(false)}
          title="Expand sidebar"
        >
          <IconChevronRight size={16} />
        </button>
        <div className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => {
                  setActivePanel(item.id);
                  setSidebarCollapsed(false);
                }}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md transition',
                  activePanel === item.id
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:bg-white/6 hover:text-white/70'
                )}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-white/8 bg-[#0e0e11]">
      <div className="flex h-10 items-center justify-between border-b border-white/8 px-2">
        <span className="px-1 text-[10px] font-medium uppercase tracking-widest text-white/35">
          Constructor
        </span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/45 hover:bg-white/8 hover:text-white"
          onClick={() => setSidebarCollapsed(true)}
          title="Collapse sidebar"
        >
          <IconChevronLeft size={15} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Icon rail */}
        <nav className="flex w-11 shrink-0 flex-col gap-0.5 border-r border-white/6 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const favBadge =
              item.id === 'favorites'
                ? state.blockOrder.reduce(
                    (a, id) => a + (state.blocks[id]?.favoriteAssetIds.length ?? 0),
                    0
                  )
                : 0;
            const stackBadge = item.id === 'stacks' ? state.stacks.length : 0;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => setActivePanel(item.id)}
                className={cn(
                  'relative mx-auto flex h-9 w-9 items-center justify-center rounded-md transition',
                  activePanel === item.id
                    ? 'bg-white/10 text-emerald-400'
                    : 'text-white/40 hover:bg-white/6 hover:text-white/75'
                )}
              >
                <Icon size={16} />
                {favBadge > 0 && item.id === 'favorites' && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[8px] font-bold text-black">
                    {favBadge > 99 ? '99+' : favBadge}
                  </span>
                )}
                {stackBadge > 0 && item.id === 'stacks' && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold text-black">
                    {stackBadge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Panel content — independent scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/55">
            {NAV.find((n) => n.id === activePanel)?.label}
          </div>
          <PanelBody id={activePanel} />
        </div>
      </div>
    </aside>
  );
}
