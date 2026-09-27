import type { SidebarSection } from '../../core/types';
import { projectStats } from '../../core/selectors';
import { useController, useSelector } from '../hooks';
import { Icon, type IconName } from '../components/Icon';
import { BlocksPanel, ProjectPanel, SettingsPanel } from './panels/project';
import { FavoritesPanel, ImagesPanel, StacksPanel } from './panels/media';
import { OverlayPanel, PreviewPanel, RandomPanel, TextPanel } from './panels/style';

const SECTIONS: { id: SidebarSection; label: string; icon: IconName }[] = [
  { id: 'project', label: 'Project', icon: 'project' },
  { id: 'blocks', label: 'Blocks', icon: 'blocks' },
  { id: 'images', label: 'Images', icon: 'images' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'overlay', label: 'Overlay', icon: 'overlay' },
  { id: 'random', label: 'Random', icon: 'random' },
  { id: 'favorites', label: 'Favorites', icon: 'favorites' },
  { id: 'stacks', label: 'Stacks', icon: 'stacks' },
  { id: 'preview', label: 'Preview', icon: 'preview' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar() {
  const controller = useController();
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed);
  const section = useSelector((s) => s.ui.section);
  const stats = useSelector((s) => projectStats(s.project));

  const badge = (id: SidebarSection): string | null => {
    switch (id) {
      case 'blocks':
        return stats.blocks ? String(stats.blocks) : null;
      case 'images':
        return stats.assets ? String(stats.assets) : null;
      case 'favorites':
        return stats.favorites ? String(stats.favorites) : null;
      case 'stacks':
        return stats.stacks ? String(stats.stacks) : null;
      case 'text':
        return stats.overrides ? String(stats.overrides) : null;
      default:
        return null;
    }
  };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <nav className="sidebar-nav">
        <button
          type="button"
          className="nav-item sidebar-collapse"
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
          onClick={() => controller.toggleSidebar()}
        >
          <span className="nav-icon">
            <Icon name={collapsed ? 'expand' : 'collapse'} />
          </span>
          <span className="nav-label">Hide panel</span>
        </button>
        {SECTIONS.map((item) => {
          const count = badge(item.id);
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              className={`nav-item${section === item.id ? ' active' : ''}`}
              onClick={() => controller.setSection(item.id)}
            >
              <span className="nav-icon">
                <Icon name={item.icon} />
              </span>
              <span className="nav-label">{item.label}</span>
              {count ? <span className="nav-badge">{count}</span> : null}
              {item.id === 'images' && stats.missing ? <span className="nav-badge" style={{ color: 'var(--amber)' }}>!</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-body">
        {section === 'project' ? <ProjectPanel /> : null}
        {section === 'blocks' ? <BlocksPanel /> : null}
        {section === 'images' ? <ImagesPanel /> : null}
        {section === 'text' ? <TextPanel /> : null}
        {section === 'overlay' ? <OverlayPanel /> : null}
        {section === 'random' ? <RandomPanel /> : null}
        {section === 'favorites' ? <FavoritesPanel /> : null}
        {section === 'stacks' ? <StacksPanel /> : null}
        {section === 'preview' ? <PreviewPanel /> : null}
        {section === 'settings' ? <SettingsPanel /> : null}
      </div>
    </aside>
  );
}
