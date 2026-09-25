import { useProjectStore, actions } from '../../store/ProjectStore';
import { Button, Section, Input, Divider, EmptyState, Label } from '../ui/primitives';
import { DEFAULT_TEXT_TEMPLATE } from '../../core/types';

export function TextPanel() {
  const { state, dispatch, importTemplateFile } = useProjectStore();
  const selected = state.selectedBlockId ? state.blocks[state.selectedBlockId] : null;
  const t = state.template;

  return (
    <div className="space-y-4">
      <Section title="Global template">
        <p className="mb-2 text-[10px] leading-relaxed text-white/35">
          Applied to new blocks and when you re-apply. Each block can override text independently.
        </p>
        <div className="space-y-2">
          <div>
            <Label>Title</Label>
            <Input
              value={t.title}
              onChange={(e) =>
                dispatch((s) =>
                  actions.setTemplate(s, { ...s.template, title: e.target.value })
                )
              }
            />
          </div>
          <div>
            <Label>Subtitle</Label>
            <Input
              value={t.subtitle}
              onChange={(e) =>
                dispatch((s) =>
                  actions.setTemplate(s, { ...s.template, subtitle: e.target.value })
                )
              }
            />
          </div>
        </div>
      </Section>

      <Section title="Items">
        <div className="space-y-1.5">
          {t.items.map((item, i) => (
            <Input
              key={i}
              value={item}
              onChange={(e) => {
                const items = [...t.items];
                items[i] = e.target.value;
                dispatch((s) => actions.setTemplate(s, { ...s.template, items }));
              }}
            />
          ))}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="subtle"
              onClick={() =>
                dispatch((s) =>
                  actions.setTemplate(s, {
                    ...s.template,
                    items: [...s.template.items, 'New item'],
                  })
                )
              }
            >
              + Item
            </Button>
            {t.items.length > 0 && (
              <Button
                size="sm"
                variant="subtle"
                onClick={() =>
                  dispatch((s) =>
                    actions.setTemplate(s, {
                      ...s.template,
                      items: s.template.items.slice(0, -1),
                    })
                  )
                }
              >
                − Item
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Categories">
        <div className="space-y-1.5">
          {(t.categories ?? []).map((cat, i) => (
            <Input
              key={i}
              value={cat}
              onChange={(e) => {
                const categories = [...(t.categories ?? [])];
                categories[i] = e.target.value;
                dispatch((s) => actions.setTemplate(s, { ...s.template, categories }));
              }}
            />
          ))}
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="subtle"
              onClick={() =>
                dispatch((s) =>
                  actions.setTemplate(s, {
                    ...s.template,
                    categories: [...(s.template.categories ?? []), 'Category'],
                  })
                )
              }
            >
              + Category
            </Button>
            {(t.categories?.length ?? 0) > 0 && (
              <Button
                size="sm"
                variant="subtle"
                onClick={() =>
                  dispatch((s) =>
                    actions.setTemplate(s, {
                      ...s.template,
                      categories: (s.template.categories ?? []).slice(0, -1),
                    })
                  )
                }
              >
                − Category
              </Button>
            )}
          </div>
        </div>
      </Section>

      <div className="flex flex-col gap-1.5">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => dispatch((s) => actions.applyTemplateToAll(s))}
        >
          Apply template to all blocks
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void importTemplateFile()}
        >
          Import template JSON
        </Button>
        <Button
          variant="subtle"
          className="w-full"
          onClick={() =>
            dispatch((s) =>
              actions.applyTemplateToAll(s, {
                ...DEFAULT_TEXT_TEMPLATE,
                items: [...DEFAULT_TEXT_TEMPLATE.items],
                categories: [...(DEFAULT_TEXT_TEMPLATE.categories ?? [])],
              })
            )
          }
        >
          Reset to reference template
        </Button>
      </div>

      <Divider />

      {selected ? (
        <Section title={`Local text · ${selected.name}`}>
          {selected.textIsOverride && (
            <div className="mb-2 text-[10px] text-amber-300/80">Has local overrides</div>
          )}
          <div className="space-y-2">
            <div>
              <Label>Title</Label>
              <Input
                value={selected.text.title}
                onChange={(e) =>
                  dispatch((s) =>
                    actions.updateBlockText(s, selected.id, { title: e.target.value })
                  )
                }
              />
            </div>
            <div>
              <Label>Subtitle</Label>
              <Input
                value={selected.text.subtitle}
                onChange={(e) =>
                  dispatch((s) =>
                    actions.updateBlockText(s, selected.id, { subtitle: e.target.value })
                  )
                }
              />
            </div>
            <Label>Items</Label>
            {selected.text.items.map((item, i) => (
              <Input
                key={i}
                value={item}
                onChange={(e) => {
                  const items = [...selected.text.items];
                  items[i] = e.target.value;
                  dispatch((s) => actions.updateBlockText(s, selected.id, { items }));
                }}
              />
            ))}
            <Label>Categories</Label>
            {(selected.text.categories ?? []).map((cat, i) => (
              <Input
                key={i}
                value={cat}
                onChange={(e) => {
                  const categories = [...(selected.text.categories ?? [])];
                  categories[i] = e.target.value;
                  dispatch((s) => actions.updateBlockText(s, selected.id, { categories }));
                }}
              />
            ))}
            <Button
              size="sm"
              variant="subtle"
              className="w-full"
              onClick={() =>
                dispatch((s) =>
                  actions.updateBlockText(s, selected.id, {
                    title: s.template.title,
                    subtitle: s.template.subtitle,
                    items: [...s.template.items],
                    categories: [...(s.template.categories ?? [])],
                  })
                )
              }
            >
              Reset block to template
            </Button>
          </div>
        </Section>
      ) : (
        <EmptyState title="Select a block" hint="to edit local text" />
      )}
    </div>
  );
}
