import { BookOpenText, PanelRight, RefreshCw, X } from 'lucide-react';
import type { DocumentPair } from '../types';
import { AnimatedList } from './react-bits/AnimatedList';


interface Props {
  documents: DocumentPair[];
  selected: DocumentPair | null;
  loading: boolean;
  error: string;
  onSelect: (document: DocumentPair) => void;
  onRefresh: () => void;
  onCloseMobile: () => void;
  onGoToIndex: () => void;
}

export function DocumentsPane({ documents, selected, loading, error, onSelect, onRefresh, onCloseMobile, onGoToIndex }: Props) {
  return <aside className="documents-pane">
    <header className="pane-header"><div><span className="eyebrow">INDEXED DOCUMENTS</span><strong>文件庫</strong></div><div><button className="icon-button" onClick={onRefresh} aria-label="重新整理"><RefreshCw size={16}/></button><button className="icon-button mobile-close" onClick={onCloseMobile} aria-label="關閉文件列表"><X size={18}/></button></div></header>
    {loading ? <div className="skeleton-lines"><span/><span/><span/></div> : error ? <div className="inline-error">{error}</div> : <AnimatedList
      items={documents} selectedIndex={documents.findIndex((pair) => pair.json_path === selected?.json_path)} getKey={(pair) => pair.json_path} onSelect={onSelect} ariaLabel="已建立索引的文件"
      empty={<div className="blank-state"><BookOpenText size={25}/><p>尚無已建立索引的文件</p><button className="text-button" onClick={onGoToIndex}>前往建立索引</button></div>}
      renderItem={(pair) => <><span className="doc-icon">{pair.has_src ? 'PDF' : 'IDX'}</span><span className="doc-copy"><strong>{pair.src_name || pair.json_name.replace('_structure.json', '')}</strong><small>{pair.has_src ? '含原始文件' : '僅索引摘要'}</small></span><PanelRight size={15}/></>}
    />}
  </aside>;
}
