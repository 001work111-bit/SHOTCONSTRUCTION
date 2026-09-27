import { useEffect } from 'react';
import type { AppController } from '../core/controller';
import { ControllerProvider, useSelector } from './hooks';
import { Header } from './layout/Header';
import { StatusBar } from './layout/StatusBar';
import { Sidebar } from './sidebar/Sidebar';
import { Workspace } from './workspace/Workspace';
import { Inspector } from './inspector/Inspector';
import { Toasts } from './components/Toasts';
import { PreviewOverlay } from './preview/PreviewOverlay';

/**
 * Root component. The controller is provided *above* everything that subscribes to it,
 * so no child (and no part of the shell) can ever read the store without a provider.
 */
export function App({ controller }: { controller: AppController }) {
  return (
    <ControllerProvider value={controller}>
      <AppShell controller={controller} />
      <Toasts />
      <PreviewGate />
    </ControllerProvider>
  );
}

function AppShell({ controller }: { controller: AppController }) {
  const inspectorOpen = useSelector((s) => s.ui.inspectorOpen);

  useEffect(() => controller.installHotkeys(), [controller]);

  return (
    <div className="app">
      <Header />
      <div className={`shell${inspectorOpen ? '' : ' no-inspector'}`}>
        <Sidebar />
        <Workspace />
        {inspectorOpen ? <Inspector /> : null}
      </div>
      <StatusBar />
    </div>
  );
}

function PreviewGate() {
  const mode = useSelector((s) => s.ui.mode);
  return mode === 'preview' ? <PreviewOverlay /> : null;
}
