import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronsDown, ChevronsUp, FileText, ListTree, PanelRightClose } from 'lucide-react';
import { api } from '../lib/api';
import type { DocumentPair, StructureNode } from '../types';
import { SafeMarkdown } from './SafeMarkdown';

type Mode = 'source' | 'structure';

function nodeKey(node: StructureNode, path: number[]) {
  return node.node_id || path.join('.');
}

function collectNodeKeys(nodes: StructureNode[], parentPath: number[] = []): string[] {
  return nodes.flatMap((node, index) => {
    const path = [...parentPath, index];
    return [nodeKey(node, path), ...collectNodeKeys(node.nodes || [], path)];
  });
}

interface TreeProps {
  nodes: StructureNode[];
  expandedNodeKeys: Set<string>;
  onToggle: (key: string, open: boolean) => void;
  depth?: number;
  parentPath?: number[];
}

function Tree({ nodes, expandedNodeKeys, onToggle, depth = 0, parentPath = [] }: TreeProps) {
  return <ul className={`structure-tree depth-${Math.min(depth, 3)}`}>
    {nodes.map((node, index) => {
      const path = [...parentPath, index];
      const key = nodeKey(node, path);
      return <li key={key}>
      <details open={expandedNodeKeys.has(key)} onToggle={(event) => onToggle(key, event.currentTarget.open)}>
        <summary><span>{node.title || '未命名章節'}</span>{node.start_index && <small>p. {node.start_index}</small>}</summary>
        {(node.summary || node.text) && <p>{node.summary || node.text}</p>}
        {node.nodes?.length ? <Tree nodes={node.nodes} expandedNodeKeys={expandedNodeKeys} onToggle={onToggle} depth={depth + 1} parentPath={path} /> : null}
      </details>
    </li>})}
  </ul>;
}

export function PreviewPanel({ document, open, onClose }: { document: DocumentPair | null; open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('source');
  const [markdown, setMarkdown] = useState('');
  const [structure, setStructure] = useState<StructureNode[]>([]);
  const [expandedNodeKeys, setExpandedNodeKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const allNodeKeys = useMemo(() => collectNodeKeys(structure), [structure]);
  const allExpanded = allNodeKeys.length > 0 && allNodeKeys.every((key) => expandedNodeKeys.has(key));

  useEffect(() => {
    setError(''); setMarkdown(''); setStructure([]); setExpandedNodeKeys(new Set());
    if (!document || !open) return;
    if (mode === 'structure') {
      api.structure(document.json_path).then((data) => {
        const nodes = data.structure || [];
        setStructure(nodes);
        setExpandedNodeKeys(new Set(nodes.map((node, index) => nodeKey(node, [index]))));
      }).catch((reason: Error) => setError(reason.message));
    } else if (document.src_path && !document.src_path.toLowerCase().endsWith('.pdf')) {
      api.previewText(document.src_path).then(setMarkdown).catch((reason: Error) => setError(reason.message));
    }
  }, [document, mode, open]);

  const toggleNode = (key: string, isOpen: boolean) => {
    setExpandedNodeKeys((current) => {
      const next = new Set(current);
      if (isOpen) next.add(key); else next.delete(key);
      return next;
    });
  };

  if (!open) return null;
  return <aside className="preview-pane" aria-label="文件預覽">
    <header className="pane-header">
      <div><span className="eyebrow">DOCUMENT PREVIEW</span><strong>{document?.src_name || document?.json_name || '尚未選擇'}</strong></div>
      <button className="icon-button mobile-close" onClick={onClose} aria-label="關閉預覽"><PanelRightClose size={18} /></button>
    </header>
    <div className="segmented" role="tablist" aria-label="預覽類型">
      <button role="tab" aria-selected={mode === 'source'} className={mode === 'source' ? 'active' : ''} onClick={() => setMode('source')}><FileText size={15} />原文</button>
      <button role="tab" aria-selected={mode === 'structure'} className={mode === 'structure' ? 'active' : ''} onClick={() => setMode('structure')}><ListTree size={15} />結構</button>
    </div>
    {document && mode === 'structure' && structure.length > 0 && <div className="structure-actions" aria-label="結構展開控制">
      <button
        className="icon-button structure-toggle"
        aria-label={allExpanded ? '全部收合' : '全部展開'}
        title={allExpanded ? '全部收合' : '全部展開'}
        onClick={() => setExpandedNodeKeys(allExpanded ? new Set() : new Set(allNodeKeys))}
      >
        {allExpanded ? <ChevronsUp size={16}/> : <ChevronsDown size={16}/>}
      </button>
    </div>}
    <div className="preview-content">
      {!document && <div className="blank-state"><BookOpen size={28} /><p>選擇文件後在此查看內容</p></div>}
      {error && <div className="inline-error">{error}</div>}
      {document && mode === 'source' && !document.has_src && <div className="blank-state"><FileText size={28} /><p>此索引沒有對應的原始文件</p></div>}
      {document && mode === 'source' && document.src_path?.toLowerCase().endsWith('.pdf') && <iframe title={`${document.src_name} 預覽`} src={`/api/preview?path=${encodeURIComponent(document.src_path)}`} />}
      {document && mode === 'source' && markdown && <SafeMarkdown>{markdown}</SafeMarkdown>}
      {document && mode === 'structure' && structure.length > 0 && <Tree nodes={structure} expandedNodeKeys={expandedNodeKeys} onToggle={toggleNode} />}
      {document && mode === 'structure' && !error && structure.length === 0 && <div className="skeleton-lines" aria-label="正在載入"><span/><span/><span/></div>}
    </div>
  </aside>;
}
