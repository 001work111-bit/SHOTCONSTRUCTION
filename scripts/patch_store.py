import io, sys

p = 'src/store/ProjectStore.tsx'
s = io.open(p, encoding='utf-8').read()
orig = s

def rep(old, new, tag):
    global s
    assert old in s, 'NOT FOUND: ' + tag
    s = s.replace(old, new, 1)

# 1) Импорт сервиса миниатюр
rep(
    "import { assetUrlCache } from '../core/assets/AssetUrlCache';\nimport { autosaveProject, loadAutosavedProject } from '../persistence/localAutosave';",
    "import { assetUrlCache } from '../core/assets/AssetUrlCache';\nimport { ThumbService } from '../filesystem/thumbs';\nimport { autosaveProject, loadAutosavedProject } from '../persistence/localAutosave';",
    'imports')

# 2) Интерфейс значения стора
rep(
    "  dropFileOnBlock: (blockId: ID, file: File) => void;\n  importTemplateFile: () => Promise<void>;\n}",
    """  dropFileOnBlock: (blockId: ID, file: File) => void;
  importTemplateFile: () => Promise<void>;
  /** конвейер миниатюр для панели медиа и сеток */
  thumbs: ThumbService;
  /** индекс слайда в превью (превью начинается с выделенного блока) */
  previewIndex: number;
  openPreview: () => void;
  closePreview: () => void;
  previewStep: (direction: 1 | -1) => void;
  previewGoTo: (index: number) => void;
  /** рандом / следующая картинка с учётом режима */
  advanceBlock: (blockId: ID) => void;
  /** сохранить все избранные картинки в папку */
  exportFavorites: () => Promise<void>;
}""",
    'iface')

# 3) Состояние превью
rep(
    "  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);\n  const [activePanel, setActivePanel] = useState<PanelId>('project');",
    "  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);\n  const [activePanel, setActivePanel] = useState<PanelId>('project');\n  const [previewIndex, setPreviewIndex] = useState(0);",
    'previewIndex state')

# 4) Сервис миниатюр + refs
rep(
    "  const fsRef = useRef(createFileSystemAdapter());",
    """  const fsRef = useRef(createFileSystemAdapter());

  // Актуальные ссылки, чтобы ThumbService не зависел от порядка объявлений
  const stateRef = useRef<ProjectState>(state);
  stateRef.current = state;
  const ensureAssetUrlRef = useRef<(assetId: ID) => Promise<string | null>>(
    async () => null
  );

  // Конвейер миниатюр: один экземпляр на приложение
  const thumbsRef = useRef<ThumbService | null>(null);
  if (!thumbsRef.current) {
    thumbsRef.current = new ThumbService({
      getDisplayUrl: (assetId) => ensureAssetUrlRef.current(assetId),
      isUnsupported: (assetId) => !!stateRef.current.assets[assetId]?.unsupported,
      budgetMB: 48,
      concurrency: 4,
    });
  }""",
    'thumbs service')

# 5) Привязать ensureAssetUrl к ref (сразу после его объявления)
rep(
    "  const resolveAssetUrl = useCallback(",
    """  ensureAssetUrlRef.current = ensureAssetUrl;

  const resolveAssetUrl = useCallback(""",
    'bind ensureAssetUrl')

io.open(p, 'w', encoding='utf-8').write(s)
print('store: шаг 1 применён')
