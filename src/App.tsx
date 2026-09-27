import { ProjectStoreProvider, useProjectStore } from './store/ProjectStore';
import { Header, StatusBar } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Workspace } from './components/layout/Workspace';
import { Inspector } from './components/layout/Inspector';
import { Toasts } from './components/layout/Toasts';
import { PreviewMode } from './components/preview/PreviewMode';

function EditorShell() {
  const { state } = useProjectStore();

  if (state.mode === 'preview') {
    return (
      <>
        <PreviewMode />
        <Toasts />
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0c0c0e] text-white antialiased">
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <Workspace />
        {state.selectedBlockId && <Inspector />}
      </div>
      <StatusBar />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <ProjectStoreProvider>
      <EditorShell />
    </ProjectStoreProvider>
  );
}
