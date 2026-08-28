import { useReducer, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Activity, FilePlus2, Play, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import type { IndexEvent, IndexTask } from '../types';
import { BorderGlow } from './react-bits/BorderGlow';
import { Folder } from './react-bits/Folder';
import { SpotlightCard } from './react-bits/SpotlightCard';
import { StageStepper } from './react-bits/StageStepper';
import { taskReducer } from '../lib/state';

interface Props { onCompleted: () => void }

export function IndexWorkspace({ onCompleted }: Props) {
  const [tasks, dispatchTasks] = useReducer(taskReducer, []);
  const [selectedId, setSelectedId] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = tasks.find((task) => task.id === selectedId) || tasks[0];
  const patchTask = (id: string, patch: Partial<IndexTask> | ((task: IndexTask) => Partial<IndexTask>)) => {
    dispatchTasks({ type: 'patch', id, patch });
  };

  const addFiles = async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => /\.(pdf|md|markdown)$/i.test(file.name));
    for (const file of accepted) {
      const id = crypto.randomUUID();
      const task: IndexTask = { id, file, status: 'uploading', done: 0, active: 0, peak: 0, logs: [], prompts: [] };
      dispatchTasks({ type: 'add', task }); setSelectedId((current) => current || id);
      try { const uploaded = await api.upload(file); patchTask(id, { status: 'ready', filePath: uploaded.path }); }
      catch (reason) { patchTask(id, { status: 'error', error: (reason as Error).message }); }
    }
  };

  const applyEvent = (id: string, event: IndexEvent) => {
    if (event.type === 'stage') patchTask(id, { stage: event.stage, stageLabel: event.label });
    if (event.type === 'progress') patchTask(id, { done: event.done, active: event.active, peak: event.peak });
    if (event.type === 'log') patchTask(id, (task) => ({ logs: [...task.logs, event.text].slice(-120) }));
    if (event.type === 'prompt') patchTask(id, (task) => ({ prompts: [...task.prompts, { idx: event.idx, label: event.label, text: event.text }].slice(-60) }));
    if (event.type === 'done') { patchTask(id, { status: 'done', outputName: event.output_name }); onCompleted(); }
    if (event.type === 'error') patchTask(id, { status: 'error', error: event.message });
  };

  const runTask = async (task: IndexTask): Promise<boolean> => {
    if (!task.filePath || task.status !== 'ready') return false;
    patchTask(task.id, { status: 'running', error: undefined });
    try { await api.index(task.filePath, (event) => applyEvent(task.id, event)); return true; }
    catch (reason) {
      patchTask(task.id, { status: 'error', error: (reason as Error).message });
      return false;
    }
  };

  const runReady = async () => {
    for (const task of tasks.filter((item) => item.status === 'ready')) {
      if (!await runTask(task)) break;
    }
  };
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); };

  return <main className="index-workspace">
    <section className="index-queue">
      <header className="workspace-header"><div><span className="eyebrow">INDEX TASKS</span><h1>建立文件索引</h1></div><button className="icon-button" onClick={() => inputRef.current?.click()} aria-label="加入文件"><FilePlus2 size={18}/></button></header>
      <input ref={inputRef} type="file" accept=".pdf,.md,.markdown" multiple hidden onChange={(event) => event.target.files && void addFiles(event.target.files)}/>
      <div className={`drop-zone ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <Folder active={dragging} onActivate={() => inputRef.current?.click()}/><strong>拖放 PDF 或 Markdown</strong><span>或</span><button className="text-button" onClick={() => inputRef.current?.click()}><UploadCloud size={15}/>選擇文件</button>
      </div>
      <div className="task-list">
        {tasks.map((task) => <div key={task.id} role="button" tabIndex={0} className={`task-row ${selected?.id === task.id ? 'selected' : ''}`} onClick={() => setSelectedId(task.id)} onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(task.id); }}>
          <span className={`status-dot ${task.status}`}/><span><strong>{task.file.name}</strong><small>{task.status === 'uploading' ? '正在上傳' : task.status === 'ready' ? '等待開始' : task.status === 'running' ? task.stageLabel || '執行中' : task.status === 'done' ? '索引完成' : task.error || '失敗'}</small></span>
          {task.status !== 'running' && <button className="row-action" aria-label={`移除 ${task.file.name}`} onClick={(event) => { event.stopPropagation(); dispatchTasks({ type: 'remove', id: task.id }); }}><Trash2 size={14}/></button>}
        </div>)}
      </div>
      <button className="primary-button start-index" disabled={!tasks.some((task) => task.status === 'ready') || tasks.some((task) => task.status === 'running')} onClick={() => void runReady()}><Play size={16}/>開始建立索引</button>
    </section>

    <section className="index-monitor">
      {!selected && <div className="blank-state large"><Activity size={30}/><h2>索引活動會顯示在這裡</h2><p>加入文件並開始任務，即時查看處理階段、並行工作與模型呼叫。</p></div>}
      {selected && <BorderGlow tone={selected.status === 'error' ? 'red' : selected.status === 'done' ? 'green' : 'blue'}>
        <SpotlightCard className="monitor-card">
          <header><div><span className="eyebrow">ACTIVE TASK</span><h2>{selected.file.name}</h2></div></header>
          <StageStepper current={selected.stage} complete={selected.status === 'done'}/>
          <div className="metrics">
            <div><span>完成呼叫</span><strong>{selected.done}</strong></div><div><span>執行中</span><strong>{selected.active}</strong></div><div><span>最高並行</span><strong>{selected.peak}</strong></div>
          </div>
          {selected.error && <div className="inline-error">{selected.error}</div>}
          {selected.status === 'done' && <div className="success-banner"><RefreshCw size={16}/><span>已產生 {selected.outputName}</span></div>}
          <div className="activity-grid">
            <section><h3>處理記錄</h3><div className="event-feed">{selected.logs.length ? selected.logs.map((line, index) => <p key={index}>{line}</p>) : <small>等待事件…</small>}</div></section>
            <section><h3>模型呼叫</h3><div className="prompt-feed">{selected.prompts.length ? selected.prompts.map((prompt) => <details key={`${prompt.idx}-${prompt.label}`}><summary><b>#{prompt.idx}</b>{prompt.label}</summary><pre>{prompt.text}</pre></details>) : <small>尚無模型呼叫</small>}</div></section>
          </div>
        </SpotlightCard>
      </BorderGlow>}
    </section>
  </main>;
}
