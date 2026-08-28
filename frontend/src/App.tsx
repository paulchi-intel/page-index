import { useCallback, useEffect, useReducer, useState } from 'react';
import { BookOpenText, DatabaseZap, KeyRound, Menu, MessageSquareText, PanelLeft, PanelRight, Settings, Trash2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { api } from './lib/api';
import type { ConversationMessage, DocumentPair, FilesResponse } from './types';
import { DocumentsPane } from './components/DocumentsPane';
import { IndexWorkspace } from './components/IndexWorkspace';
import { PreviewPanel } from './components/PreviewPanel';
import { QueryPaneLayout } from './components/QueryPaneLayout';
import { QueryWorkspace } from './components/QueryWorkspace';
import { SettingsDialog } from './components/SettingsDialog';
import { conversationReducer } from './lib/state';
import { useQueryPaneLayout, type QueryPaneId } from './hooks/useQueryPaneLayout';

type Tab = 'query' | 'index';

export default function App() {
  const [tab, setTab] = useState<Tab>('query');
  const [files, setFiles] = useState<FilesResponse>({ pairs: [], model: '', index_model: '', api_key_set: false });
  const [selected, setSelected] = useState<DocumentPair | null>(null);
  const [messages, dispatchMessages] = useReducer(conversationReducer, [] as ConversationMessage[]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const paneLayout = useQueryPaneLayout();
  const reduceMotion = useReducedMotion();

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true); setLoadError('');
    try {
      const response = await api.files(); setFiles(response);
      setSelected((current) => current ? response.pairs.find((pair) => pair.json_path === current.json_path) || null : null);
    } catch (reason) { setLoadError((reason as Error).message); }
    finally { setLoadingFiles(false); }
  }, []);
  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const chooseDocument = (document: DocumentPair) => {
    if (selected?.json_path !== document.json_path && messages.length && !window.confirm('切換文件會開始新的查詢工作階段並清除目前對話。要繼續嗎？')) return;
    if (selected?.json_path !== document.json_path) dispatchMessages({ type: 'reset' });
    setSelected(document); setDocumentsOpen(false); setPreviewOpen(true); setTab('query');
  };
  const clearMessages = () => { if (!messages.length || window.confirm('確定要清除目前查詢工作階段嗎？')) dispatchMessages({ type: 'reset' }); };
  const activeModel = tab === 'index' ? (files.index_model || files.model) : files.model;
  const visiblePaneCount = Object.values(paneLayout.state.visible).filter(Boolean).length;
  const paneLabels: Record<QueryPaneId, string> = { documents: '文件庫', preview: '文件預覽', workspace: '查詢工作區' };
  const paneIcons = { documents: <PanelLeft size={17}/>, preview: <PanelRight size={17}/>, workspace: <MessageSquareText size={17}/> };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><BookOpenText size={20}/></span><div><strong>PageIndex</strong><small>Document intelligence</small></div></div>
      <nav className="main-tabs" aria-label="主要功能">
        <button className={tab === 'query' ? 'active' : ''} onClick={() => setTab('query')}><MessageSquareText size={16}/>查詢</button>
        <button className={tab === 'index' ? 'active' : ''} onClick={() => setTab('index')}><DatabaseZap size={16}/>建立索引</button>
      </nav>
      <div className="top-actions">
        {tab === 'query' && <div className="desktop-pane-controls" aria-label="查詢版面">
          {(Object.keys(paneLayout.state.visible) as QueryPaneId[]).map((pane) => {
            const visible = paneLayout.state.visible[pane];
            const label = `${visible ? '隱藏' : '顯示'}${paneLabels[pane]}`;
            return <button key={pane} className={`icon-button pane-toggle ${visible ? 'is-active' : ''}`} aria-label={label} title={label} aria-pressed={visible} disabled={visible && visiblePaneCount === 1} onClick={() => paneLayout.togglePane(pane)}>{paneIcons[pane]}</button>;
          })}
        </div>}
        <span className={`key-status ${files.api_key_set ? 'ready' : 'missing'}`}><KeyRound size={14}/>{files.api_key_set ? activeModel.split('/').at(-1) : '尚未設定 API key'}</span>
        {tab === 'query' && messages.length > 0 && <button className="icon-button" onClick={clearMessages} aria-label="清除對話"><Trash2 size={17}/></button>}
        <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="開啟設定"><Settings size={18}/></button>
      </div>
    </header>

    <div className={`app-body tab-${tab}`}>
      {tab === 'query' && <QueryPaneLayout
        state={paneLayout.state}
        widthLimits={paneLayout.widthLimits}
        onPaneWidthChange={paneLayout.setPaneWidth}
        mobileDocumentsOpen={documentsOpen}
        mobilePreviewOpen={previewOpen}
        documents={<DocumentsPane documents={files.pairs} selected={selected} loading={loadingFiles} error={loadError} onSelect={chooseDocument} onRefresh={() => void loadFiles()} onCloseMobile={() => setDocumentsOpen(false)} onGoToIndex={() => setTab('index')}/>} 
        preview={<PreviewPanel document={selected} open onClose={() => setPreviewOpen(false)}/>} 
        workspace={<QueryWorkspace document={selected} messages={messages} dispatchMessages={dispatchMessages} onOpenDocuments={() => setDocumentsOpen(true)} onOpenPreview={() => setPreviewOpen(true)}/>} 
      />}
      {tab === 'index' && <IndexWorkspace onCompleted={() => void loadFiles()}/>} 
    </div>

    {tab === 'query' && <button className="drawer-trigger" onClick={() => setDocumentsOpen(true)} aria-label="開啟文件列表"><Menu size={18}/></button>}

    <AnimatePresence>{documentsOpen && <motion.button aria-label="關閉文件列表" className="drawer-scrim" onClick={() => setDocumentsOpen(false)} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}/>}</AnimatePresence>
    <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => void loadFiles()}/>
  </div>;
}
