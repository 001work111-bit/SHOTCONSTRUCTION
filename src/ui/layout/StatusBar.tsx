import { projectStats } from '../../core/selectors';
import { stackPosition } from '../../core/stacks';
import { useController, useSelector } from '../hooks';
import { Icon } from '../components/Icon';

export function StatusBar() {
  const controller = useController();
  const stats = useSelector((s) => projectStats(s.project));
  const queue = useSelector((s) => s.ui.decodeQueue);
  const busy = useSelector((s) => s.ui.busy);
  const mode = useSelector((s) => s.ui.mode);
  const previewIndex = useSelector((s) => s.ui.previewIndex);
  const stackInfo = useSelector((s) => {
    const position = stackPosition(s.project, controller.activeStackId);
    return {
      position,
      total: s.project.stacks.length,
      name: position >= 0 ? s.project.stacks[position]?.name ?? null : null,
    };
  });

  const cache = controller.imageStats();

  return (
    <footer className="status-bar">
      <span className="status-item">
        <Icon name="blocks" size={12} /> {stats.blocks} blocks
      </span>
      <span className="status-sep" />
      <span className="status-item">
        <Icon name="images" size={12} /> {stats.assets} files · {stats.folders} folders
      </span>
      <span className="status-sep" />
      <span className="status-item">
        <Icon name="star" size={12} /> {stats.favorites} favorites
      </span>
      <span className="status-sep" />
      <span className="status-item">
        <Icon name="lock" size={12} /> {stats.locked} locked
      </span>
      {stats.missing ? (
        <>
          <span className="status-sep" />
          <span className="status-item status-warn">
            <Icon name="warn" size={12} /> {stats.missing} missing
          </span>
        </>
      ) : null}
      <span className="status-spacer" />
      {stackInfo.total ? (
        <>
          <span className="status-item">
            stack {stackInfo.position >= 0 ? stackInfo.position + 1 : '–'} / {stackInfo.total}
            {stackInfo.name ? ` · ${stackInfo.name}` : ''}
          </span>
          <span className="status-sep" />
        </>
      ) : null}
      <span className="status-item">tiles {cache.entries} · {(cache.bytes / 1024 / 1024).toFixed(0)} MB</span>
      {queue ? (
        <>
          <span className="status-sep" />
          <span className="status-item">decoding {queue}</span>
        </>
      ) : null}
      <span className="status-sep" />
      <span className="status-item">{busy ? busy : controller.adapterLabel}</span>
      {mode === 'preview' ? (
        <>
          <span className="status-sep" />
          <span className="status-item">preview · block {previewIndex + 1}</span>
        </>
      ) : null}
    </footer>
  );
}
