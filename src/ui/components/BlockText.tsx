import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Block, TextLayerKey, TextTemplate, TypographySet } from '../../core/types';
import { Icon } from './Icon';

/**
 * The text layer of a block: IMAGE → OVERLAY → TEXT (spec §95).
 *
 * Sizes are expressed in `cqw` against the block frame, so the very same markup renders
 * proportionally in the editor (where a 1024px block is displayed ~900px wide) and in the
 * preview (where it fills the viewport) — i.e. it looks like a real site hero (spec §59).
 */

export interface BlockTextProps {
  block: Block;
  text: TextTemplate;
  typo: TypographySet;
  mode: 'edit' | 'preview';
  onCommit?: (layer: TextLayerKey, value: string, line?: number) => void;
  onEditingChange?: (editing: { layer: TextLayerKey; line: number } | null) => void;
  onAddLine?: (layer: 'items' | 'keywords', after?: number) => void;
  onRemoveLine?: (layer: 'items' | 'keywords', line: number) => void;
}

function scale(block: Block, value: number): string {
  return `calc(${value} / ${block.width} * 100cqw)`;
}

function layerStyle(block: Block, layer: TypographySet['layers'][TextLayerKey]): CSSProperties {
  return {
    fontSize: scale(block, layer.fontSize),
    fontWeight: layer.weight,
    color: layer.color,
    opacity: layer.opacity,
    textAlign: layer.align,
    lineHeight: layer.lineHeight,
    letterSpacing: `${layer.letterSpacing}em`,
    textTransform: layer.textTransform,
    marginTop: layer.marginTop ? scale(block, layer.marginTop) : undefined,
    display: layer.visible ? undefined : 'none',
    whiteSpace: 'pre-wrap',
  };
}

function EditableText({
  value,
  placeholder,
  singleLine,
  inline,
  style,
  externalEditing,
  onChange,
  onEditingChange,
}: {
  value: string;
  placeholder?: string;
  singleLine?: boolean;
  /** inline-block outline that hugs the text (used by title / subtitle) */
  inline?: boolean;
  style: CSSProperties;
  /** true while the parent tracks this element as the active editing target */
  externalEditing?: boolean;
  onChange: (value: string) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);

  // keep the DOM in sync with the store while the user is not typing in this element
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!editing && node.innerText !== value) node.innerText = value;
  }, [value, editing]);

  return (
    <div
      ref={ref}
      className={`editable${inline ? ' editable-inline' : ''}${editing || externalEditing ? ' editing' : ''}`}
      style={style}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder ?? ''}
      onFocus={() => {
        setEditing(true);
        onEditingChange(true);
        const node = ref.current;
        if (node) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }}
      onPaste={(event) => {
        // plain text only — never let rich markup into the block
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain').replace(/\r?\n/g, ' ');
        document.execCommand('insertText', false, text);
      }}
      onBlur={() => {
        const next = (ref.current?.innerText ?? '').replace(/\u00a0/g, ' ').replace(/\n+$/, '');
        setEditing(false);
        onEditingChange(false);
        if (next !== value) onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (singleLine || !event.shiftKey)) {
          event.preventDefault();
          (event.target as HTMLElement).blur();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (ref.current) ref.current.innerText = value;
          (event.target as HTMLElement).blur();
        }
      }}
    />
  );
}

export function BlockText({
  block,
  text,
  typo,
  mode,
  onCommit,
  onEditingChange,
  onAddLine,
  onRemoveLine,
}: BlockTextProps) {
  const { layers, items: itemsStyle, keywords: keywordsStyle, group } = typo;
  const editable = mode === 'edit' && Boolean(onCommit);

  const containerStyle: CSSProperties = {
    position: 'absolute',
    left: `${group.anchorX}%`,
    top: `${group.anchorY}%`,
    width: `${group.width}%`,
    transform: 'translateX(-50%)',
    zIndex: 2,
  };

  const wrap = (layer: TextLayerKey, content: ReactNode, index = 0) => {
    if (!layers[layer].visible) return null;
    return <div key={`${layer}-${index}`} style={layerStyle(block, layers[layer])}>{content}</div>;
  };

  const pillStyle = (lineIndex: number): CSSProperties => ({
    display: 'inline-block',
    border: itemsStyle.pill ? `${scale(block, itemsStyle.pillBorder)} solid ${layers.items.color}` : undefined,
    borderRadius: itemsStyle.pill ? scale(block, itemsStyle.pillRadius) : undefined,
    padding: itemsStyle.pill
      ? `${scale(block, itemsStyle.pillPadY)} ${scale(block, itemsStyle.pillPadX)}`
      : undefined,
    marginTop: lineIndex === 0 ? scale(block, layers.items.marginTop) : scale(block, itemsStyle.gap),
  });

  const keywordOpacity = (index: number) =>
    Math.max(0.05, keywordsStyle.opacityStart + keywordsStyle.opacityStep * index);

  const setEditing = (layer: TextLayerKey, line: number) => (active: boolean) =>
    onEditingChange?.(active ? { layer, line } : null);

  return (
    <div className="frame-text" style={containerStyle} data-block-text={block.id}>
      {wrap(
        'title',
        editable ? (
          <EditableText
            inline
            value={text.title}
            placeholder="Title"
            singleLine
            style={{}}
            onChange={(value) => onCommit?.('title', value)}
            onEditingChange={setEditing('title', 0)}
          />
        ) : (
          text.title
        ),
      )}

      {text.subtitle || editable
        ? wrap(
            'subtitle',
            editable ? (
              <EditableText
                inline
                value={text.subtitle}
                placeholder="Subtitle"
                singleLine
                style={{}}
                onChange={(value) => onCommit?.('subtitle', value)}
                onEditingChange={setEditing('subtitle', 0)}
              />
            ) : (
              text.subtitle
            ),
          )
        : null}

      {layers.items.visible && text.items.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: layers.items.align === 'center' ? 'center' : layers.items.align === 'right' ? 'flex-end' : 'flex-start' }}>
          {text.items.map((item, index) =>
            editable ? (
              <span key={`item-${index}`} style={pillStyle(index)} className="editable-line">
                <EditableText
                  value={item}
                  placeholder="Line"
                  singleLine
                  style={{}}
                  onChange={(value) => onCommit?.('items', value, index)}
                  onEditingChange={setEditing('items', index)}
                />
              </span>
            ) : (
              <span key={`item-${index}`} style={pillStyle(index)}>
                {item}
              </span>
            ),
          )}
        </div>
      ) : null}

      {layers.keywords.visible && text.keywords.length
        ? text.keywords.map((word, index) =>
            editable ? (
              <EditableText
                key={`kw-${index}`}
                value={word}
                placeholder="Keyword"
                singleLine
                style={{
                  ...layerStyle(block, layers.keywords),
                  opacity: layers.keywords.opacity * keywordOpacity(index),
                  marginTop: index === 0 ? scale(block, layers.keywords.marginTop) : undefined,
                }}
                onChange={(value) => onCommit?.('keywords', value, index)}
                onEditingChange={setEditing('keywords', index)}
              />
            ) : (
              <div
                key={`kw-${index}`}
                style={{
                  ...layerStyle(block, layers.keywords),
                  opacity: layers.keywords.opacity * keywordOpacity(index),
                  marginTop: index === 0 ? scale(block, layers.keywords.marginTop) : undefined,
                }}
              >
                {word}
              </div>
            ),
          )
        : null}

      {editable && onAddLine ? (
        <div className="row tight" style={{ justifyContent: 'center', marginTop: scale(block, 8), opacity: 0.55 }}>
          <button
            type="button"
            className="btn ghost icon"
            title="Add keyword line"
            onClick={() => onAddLine('keywords')}
          >
            <Icon name="plus" size={12} />
          </button>
          <button
            type="button"
            className="btn ghost icon"
            title="Add item line"
            onClick={() => onAddLine('items')}
          >
            <Icon name="drag" size={12} />
          </button>
          {text.keywords.length ? (
            <button
              type="button"
              className="btn ghost icon"
              title="Remove last keyword line"
              onClick={() => onRemoveLine?.('keywords', text.keywords.length - 1)}
            >
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
