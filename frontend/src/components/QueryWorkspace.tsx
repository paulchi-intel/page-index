import { useRef, useState, type Dispatch } from 'react';
import { BookOpenText, PanelLeftOpen, PanelRightOpen, Send, Sparkles, Square } from 'lucide-react';
import { api } from '../lib/api';
import type { ConversationMessage, DocumentPair, SectionMatch } from '../types';
import { AnimatedContent } from './react-bits/AnimatedContent';
import { SafeMarkdown } from './SafeMarkdown';
import type { ConversationAction } from '../lib/state';

interface Props {
  document: DocumentPair | null;
  messages: ConversationMessage[];
  dispatchMessages: Dispatch<ConversationAction>;
  onOpenDocuments: () => void;
  onOpenPreview: () => void;
}

export function QueryWorkspace({ document, messages, dispatchMessages, onOpenDocuments, onOpenPreview }: Props) {
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState('');
  const [sections, setSections] = useState<SectionMatch[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const send = async () => {
    const value = question.trim();
    if (!value || !document || running) return;
    const history = messages.map((message) => ({ role: message.role, content: message.content }));
    setQuestion(''); setError(''); setSections([]); setStatus('正在連線…'); setRunning(true);
    dispatchMessages({ type: 'start-query', question: value });
    const controller = new AbortController(); abortRef.current = controller;
    try {
      await api.query({ json_path: document.json_path, src_path: document.src_path, question: value, history }, controller.signal, (event) => {
        if (event.type === 'status') setStatus(event.message);
        if (event.type === 'sections') setSections(event.sections);
        if (event.type === 'token') dispatchMessages({ type: 'append-token', text: event.text });
        if (event.type === 'error') setError(event.message);
        if (event.type === 'done') setStatus('');
      });
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError((reason as Error).message);
    } finally { setRunning(false); setStatus(''); abortRef.current = null; }
  };

  if (!document) return <main className="workspace empty-workspace">
    <button className="icon-button mobile-only" onClick={onOpenDocuments} aria-label="開啟文件列表"><PanelLeftOpen /></button>
    <AnimatedContent className="hero-state">
      <span className="hero-icon"><BookOpenText size={30} /></span>
      <span className="eyebrow">GROUNDED DOCUMENT Q&A</span>
      <h1>從文件結構開始，<br/>找到真正相關的答案。</h1>
      <p>從左側選擇一份已建立索引的文件，PageIndex 會定位章節、讀取原文並串流回答。</p>
      <button className="primary-button mobile-only" onClick={onOpenDocuments}>選擇文件</button>
    </AnimatedContent>
  </main>;

  return <main className="workspace query-workspace">
    <header className="workspace-header">
      <button className="icon-button mobile-only" onClick={onOpenDocuments} aria-label="開啟文件列表"><PanelLeftOpen size={18}/></button>
      <div><span className="eyebrow">QUERY SESSION</span><h1>{document.src_name || document.json_name.replace('_structure.json', '')}</h1></div>
      <button className="secondary-button preview-toggle" onClick={onOpenPreview}><PanelRightOpen size={16}/>文件預覽</button>
    </header>
    <div className="message-list" aria-live="polite">
      {messages.length === 0 && <AnimatedContent className="query-starter"><Sparkles size={24}/><h2>你想從這份文件了解什麼？</h2><p>回答只會根據相關章節與原文內容生成。</p></AnimatedContent>}
      {messages.map((message, index) => <article key={index} className={`message ${message.role}`}>
        <span className="message-role">{message.role === 'user' ? '你' : 'PageIndex'}</span>
        {message.role === 'assistant' ? (message.content ? <SafeMarkdown>{message.content}</SafeMarkdown> : <div className="typing"><i/><i/><i/></div>) : <p>{message.content}</p>}
      </article>)}
      {(status || sections.length > 0) && <div className="retrieval-status">
        {status && <span><Sparkles size={14}/>{status}</span>}
        {sections.map((section, index) => <small key={`${section.title}-${index}`}>{section.title || '相關章節'}{section.start_index ? ` · p.${section.start_index}` : ''}</small>)}
      </div>}
      {error && <div className="inline-error">{error}</div>}
    </div>
    <div className="composer-wrap">
      <div className="composer">
        <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="詢問這份文件…" rows={1}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}/>
        {running ? <button className="stop-button" onClick={() => abortRef.current?.abort()} aria-label="停止回答"><Square size={15}/></button>
          : <button className="send-button" onClick={() => void send()} disabled={!question.trim()} aria-label="送出問題"><Send size={17}/></button>}
      </div>
      <small>Enter 送出 · Shift + Enter 換行</small>
    </div>
  </main>;
}
