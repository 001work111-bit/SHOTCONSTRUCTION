import { useCallback, useRef } from 'react';
import { useBlockMap, useBlockOrder, useController, useSelector, useVirtualWindow } from '../hooks';
import { BlockCard } from './BlockCard';
import { Btn, Chip, Empty } from '../components/primitives';
import { Icon } from '../components/Icon';

/** Vertical block list of the single page (spec §6–7) with its own scroll and virtualization. */
export function Workspace() {
  const controller = useController();
  const order = useBlockOrder();
  const blockMap = useBlockMap();
  const selectedBlockId = useSelector((s) => s.ui.selectedBlockId);
  const stacks = useSelector((s) => s.project.stacks);
  const scanProgress = useSelector((s) => s.ui.scanProgress);
  const busy = useSelector((s) => s.ui.busy);
  const missing = useSelector((s) => s.project.missingAssets.length);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { start, end, totalHeight, offsetOf, measure, virtual } = useVirtualWindow({
    count: order.length,
    containerRef,
    estimate: 420,
    overscan: 2,
    threshold: 12,
    deps: [order.join('|')],
  });

  const onBackgroundDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer.files ?? []);
      if (!files.length) return;
      const target = order[0];
      if (target) await controller.handleBlockDrop(target, event.dataTransfer);
    },
    [controller, order],
  );

  const visible = order.slice(start, end);

  return (
    <div className="workspace" ref={containerRef} onDragOver={(e) => e.preventDefault()} onDrop={onBackgroundDrop}>
      <div className="workspace-head">
        <span className="workspace-title">
          Page · {order.length} block{order.length === 1 ? '' : 's'}
        </span>
        {stacks.length ? (
          <span className="row tight">
            <Btn
              icon="chevron-left"
              title="Previous stack"
              onClick={() => controller.stepStack(-1)}
            />
            <Chip>{stacks.length} stacks</Chip>
            <Btn icon="chevron-right" title="Next stack" onClick={() => controller.stepStack(1)} />
          </span>
        ) : null}
        <span className="header-spacer" />
        {busy ? <Chip tone="acc">{busy}</Chip> : null}
        {scanProgress ? <Chip tone="acc">{scanProgress}</Chip> : null}
        {missing ? (
          <button
            type="button"
            className="btn danger"
            title="Open the images panel to relink missing files"
            onClick={() => controller.setSection('images')}
          >
            <Icon name="warn" /> {missing} missing file{missing === 1 ? '' : 's'}
          </button>
        ) : null}
        <Btn icon="dice" onClick={() => controller.randomizeAll()} title="Randomize every unlocked block (Ctrl+Z reverts all at once)">
          Randomize all
        </Btn>
        <Btn icon="plus" onClick={() => controller.addBlock()} title="Add a block">
          Block
        </Btn>
        <Btn icon="preview" onClick={() => controller.openPreview()} title="Open preview mode">
          Preview
        </Btn>
      </div>

      {!order.length ? (
        <Empty>
          <div style={{ marginBottom: 8 }}>No blocks yet.</div>
          <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
            <Btn icon="blocks" onClick={() => controller.setBlockCount(6)}>
              Create 6 blocks
            </Btn>
            <Btn icon="folder-open" onClick={() => void controller.loadFolder()}>
              Load image folder
            </Btn>
            <Btn icon="grid" onClick={() => void controller.loadDemoCatalog()} title="Bundled demo catalog — no folder permission needed">
              Try demo catalog
            </Btn>
          </div>
        </Empty>
      ) : null}

      <div className="workspace-stack" style={virtual ? { height: totalHeight, position: 'relative' } : undefined}>
        {visible.map((blockId, i) => {
          const index = start + i;
          const block = blockMap[blockId];
          if (!block) return null;
          const card = (
            <BlockCard key={blockId} block={block} index={index} selected={blockId === selectedBlockId} maxEdge={1024} />
          );
          if (!virtual) return card;
          return (
            <div
              key={blockId}
              className="block-row"
              ref={(node) => measure(index, node)}
              style={{ position: 'absolute', top: offsetOf(index), left: 0, right: 0, paddingBottom: 18 }}
            >
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
