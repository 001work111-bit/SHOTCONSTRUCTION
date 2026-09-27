import io

p = 'src/store/ProjectStore.tsx'
s = io.open(p, encoding='utf-8').read()

def rep(old, new, tag):
    global s
    if old not in s:
        if new.strip().splitlines()[0].strip() in s:
            print('skip (уже применено):', tag)
            return
        raise AssertionError('NOT FOUND: ' + tag)
    s = s.replace(old, new, 1)

# ---------------------------------------------------------------- превью
preview_block = '''
  /* --------------------------------------------------------------- preview */

  const blocksInOrder = useCallback(
    () => state.blockOrder.filter((id) => !!state.blocks[id]),
    [state.blockOrder, state.blocks]
  );

  /** Вход в превью — с выделенного блока, а не с первого */
  const openPreview = useCallback(() => {
    const order = blocksInOrder();
    if (order.length === 0) {
      pushToast('warning', 'Нет блоков для превью');
      return;
    }
    const selected = state.selectedBlockId;
    const idx = selected ? order.indexOf(selected) : -1;
    setPreviewIndex(idx >= 0 ? idx : 0);
    dispatch((s) => actions.setMode(s, 'preview'));
  }, [blocksInOrder, state.selectedBlockId, dispatch, pushToast]);

  const closePreview = useCallback(() => {
    dispatch((s) => actions.setMode(s, 'edit'));
  }, [dispatch]);

  const previewStep = useCallback(
    (direction: 1 | -1) => {
      const total = state.blockOrder.length;
      if (total <= 1) return;
      setPreviewIndex((current) => {
        let next = current + direction;
        if (next < 0) next = state.preview.loop ? total - 1 : 0;
        if (next > total - 1) next = state.preview.loop ? 0 : total - 1;
        return next === current ? current : next;
      });
    },
    [state.blockOrder.length, state.preview.loop]
  );

  const previewGoTo = useCallback((index: number) => {
    setPreviewIndex(Math.max(0, index));
  }, []);

  /**
   * Кнопка/клавиша «дальше»: в случайном режиме — кубик,
   * в последовательном — следующая картинка по порядку (без повторов).
   */
  const advanceBlock = useCallback(
    (blockId: ID) => {
      dispatch((s) => actions.advanceBlock(s, blockId));
    },
    [dispatch]
  );

  /**
   * Экспорт всех избранных картинок в выбранную папку.
   * В браузере (без Electron) просто сохраняем список в JSON.
   */
  const exportFavorites = useCallback(async () => {
    const tasks: Array<{ from: string; to: string }> = [];
    const seen = new Set<string>();

    for (const blockId of state.blockOrder) {
      const block = state.blocks[blockId];
      if (!block) continue;
      for (const assetId of block.favoriteAssetIds) {
        const asset = state.assets[assetId];
        if (!asset || seen.has(assetId)) continue;
        seen.add(assetId);
        if (!asset.sourceKey) continue;
        const folderName = asset.folderId
          ? state.folders[asset.folderId]?.name ?? 'Без папки'
          : 'Без папки';
        tasks.push({
          from: asset.sourceKey,
          to: `${folderName}/${asset.filename}`,
        });
      }
    }

    if (tasks.length === 0) {
      pushToast('warning', 'Избранных картинок нет — отметьте звездочкой хотя бы одну');
      return;
    }

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api?.isElectron) {
      const name = `favorites-${new Date().toISOString().slice(0, 10)}.json`;
      downloadJson(
        name,
        tasks.map((t) => ({ file: t.to, path: t.from }))
      );
      pushToast('success', `Список из ${tasks.length} картинок сохранён в ${name}`);
      return;
    }

    const res = await api.copyFiles(tasks);
    if (res.canceled) return;
    if (!res.ok) {
      pushToast('error', res.error || 'Не удалось сохранить картинки');
      return;
    }
    const skipped = res.failed?.length ? `, не скопировано: ${res.failed.length}` : '';
    pushToast('success', `Сохранено ${res.copied ?? tasks.length} картинок в ${res.path}${skipped}`);
  }, [state.blockOrder, state.blocks, state.assets, state.folders, pushToast]);
'''

rep("  // Команды из нативного меню Electron", preview_block + "\n  // Команды из нативного меню Electron", 'preview block')

# ------------------------------------------------- горячие клавиши
hotkeys_block = '''
  /* ------------------------------------------------------ горячие клавиши */
  // Ctrl+Z / Ctrl+Y / Ctrl+S уже обрабатываются выше; здесь — новые функции.
  // Проверяем, что фокус не в поле ввода, чтобы не ломать набор текста.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;

      // P — войти/выйти из превью
      if (!mod && !e.altKey && (e.key === 'p' || e.key === 'P' || e.key === 'з')) {
        e.preventDefault();
        if (state.mode === 'preview') closePreview();
        else openPreview();
        return;
      }

      // Space — play/pause автоплея в превью
      if (!mod && !e.altKey && e.code === 'Space' && state.mode === 'preview') {
        e.preventDefault();
        dispatch((s) =>
          actions.updatePreviewSettings(s, { autoplay: !s.preview.autoplay })
        );
        return;
      }

      // В превью: стрелки листают блоки, Alt+стрелки — картинки внутри блока
      if (state.mode === 'preview') {
        const currentBlockId = state.blockOrder[previewIndex];

        if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          if (currentBlockId) {
            dispatch((s) => actions.advanceBlock(s, currentBlockId));
          }
          return;
        }

        if (!e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          previewStep(e.key === 'ArrowRight' ? 1 : -1);
          return;
        }

        // F — текущая картинка в избранное
        if (!mod && !e.altKey && (e.key === 'f' || e.key === 'F' || e.key === 'а')) {
          e.preventDefault();
          if (currentBlockId) dispatch((s) => actions.toggleFavorite(s, currentBlockId));
          return;
        }

        // R — рандом текущего блока
        if (!mod && !e.altKey && (e.key === 'r' || e.key === 'R' || e.key === 'к')) {
          e.preventDefault();
          if (currentBlockId) dispatch((s) => actions.randomizeBlock(s, currentBlockId, true));
          return;
        }
        return;
      }

      // В редакторе
      const selected = state.selectedBlockId;

      // Alt+стрелки — листать картинки выбранного блока
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.advanceBlock(s, selected));
        return;
      }

      // R — рандом выбранного блока
      if (!mod && !e.altKey && (e.key === 'r' || e.key === 'R' || e.key === 'к')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.advanceBlock(s, selected));
        return;
      }

      // F — текущая картинка выбранного блока в избранное
      if (!mod && !e.altKey && (e.key === 'f' || e.key === 'F' || e.key === 'а')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.toggleFavorite(s, selected));
        return;
      }

      // L — замок на блоке
      if (!mod && !e.altKey && (e.key === 'l' || e.key === 'L' || e.key === 'д')) {
        e.preventDefault();
        if (selected) dispatch((s) => actions.toggleLock(s, selected));
        return;
      }

      // 1..5 — быстрый выбор перехода
      if (!mod && !e.altKey && /^[1-5]$/.test(e.key)) {
        const map: Record<string, 1 | 2 | 3 | 4 | 5> = {};
        const transitions = [
          'fade',
          'slide-vertical',
          'slide-horizontal',
          'crossfade',
          'zoom',
        ] as const;
        const idx = Number(e.key) - 1;
        const transition = transitions[idx];
        if (transition) {
          e.preventDefault();
          dispatch((s) => actions.updatePreviewSettings(s, { transitionType: transition }));
          pushToast('info', `Переход: ${transition}`);
        }
        void map;
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    state.mode,
    state.selectedBlockId,
    state.blockOrder,
    previewIndex,
    dispatch,
    openPreview,
    closePreview,
    previewStep,
    pushToast,
  ]);
'''

rep("  const value = useMemo<ProjectStoreValue>(", hotkeys_block + "\n  const value = useMemo<ProjectStoreValue>(", 'hotkeys')

# ------------------------------------------------- проброс в value
rep(
    """      dropFileOnBlock,
      importTemplateFile,
    }),""",
    """      dropFileOnBlock,
      importTemplateFile,
      thumbs: thumbsRef.current,
      previewIndex,
      openPreview,
      closePreview,
      previewStep,
      previewGoTo,
      advanceBlock,
      exportFavorites,
    }),""",
    'value wiring')

rep(
    """      dropFileOnBlock,
      importTemplateFile,
    ] as unknown,""",
    """      dropFileOnBlock,
      importTemplateFile,
      previewIndex,
      openPreview,
      closePreview,
      previewStep,
      previewGoTo,
      advanceBlock,
      exportFavorites,
    ] as unknown,""",
    'deps wiring')

io.open(p, 'w', encoding='utf-8').write(s)
print('store: шаг 2 применён')
