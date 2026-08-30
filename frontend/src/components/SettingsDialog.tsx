import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Eye, EyeOff, RefreshCw, SearchCheck, X, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import type { AppConfig, ModelOption, ModelVerificationItem, ModelVerificationResult } from '../types';

export function SettingsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [config, setConfig] = useState<AppConfig>({ api_key: '', api_key_set: false, model: '', index_model: '' });
  const [models, setModels] = useState<ModelOption[]>([]);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [verifyingModels, setVerifyingModels] = useState(false);
  const [verification, setVerification] = useState<ModelVerificationResult | null>(null);
  const [verificationItems, setVerificationItems] = useState<ModelVerificationItem[]>([]);
  const [verificationPhase, setVerificationPhase] = useState<'idle' | 'verifying' | 'done' | 'error'>('idle');

  const loadModels = useCallback(async () => {
    setLoadingModels(true); setError('');
    try { setModels(await api.models()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoadingModels(false); }
  }, []);
  useEffect(() => {
    if (open) {
      ref.current?.showModal();
      setVerification(null);
      setVerificationItems([]);
      setVerificationPhase('idle');
      api.config().then(setConfig).catch((reason: Error) => setError(reason.message));
      void loadModels();
    } else ref.current?.close();
  }, [loadModels, open]);
  const selectableModels = [...models];
  for (const id of [config.model, config.index_model]) {
    if (id && !selectableModels.some((model) => model.id === id)) selectableModels.unshift({ id, label: id.split('/').at(-1) || id });
  }
  const verifySupportedModels = async () => {
    setVerifyingModels(true); setVerification(null); setVerificationItems([]); setVerificationPhase('verifying'); setError('');
    try {
      let receivedTerminalEvent = false;
      await api.verifyModelsStream(config.api_key, selectableModels.map((model) => model.id), (event) => {
        if (event.type === 'candidates') {
          setVerificationItems(event.models.map((model) => ({ ...model, status: 'pending' })));
        } else if (event.type === 'checking') {
          setVerificationItems((items) => items.map((item) => item.id === event.id ? { ...item, status: 'checking' } : item));
        } else if (event.type === 'result') {
          setVerificationItems((items) => items.map((item) => item.id === event.detail.id ? {
            ...item,
            status: event.detail.available ? 'available' : 'unavailable',
            httpStatus: event.detail.status,
            error: event.detail.error,
          } : item));
        } else if (event.type === 'error') {
          receivedTerminalEvent = true;
          throw new Error(event.message);
        } else if (event.type === 'done') {
          receivedTerminalEvent = true;
          const result = event.result;
          setVerification(result);
          setVerificationPhase('done');
          if (result.models.length) {
            const available = new Set(result.models.map((model) => model.id));
            setModels(result.models);
            setConfig((current) => ({
              ...current,
              model: available.has(current.model) ? current.model : result.models[0].id,
              index_model: available.has(current.index_model) ? current.index_model : result.models[0].id,
            }));
          }
        }
      });
      if (!receivedTerminalEvent) throw new Error('模型驗證串流意外中斷，請再試一次');
    } catch (reason) { setVerificationPhase('error'); setError((reason as Error).message); }
    finally { setVerifyingModels(false); }
  };
  const verifiedCount = verificationItems.filter((item) => item.status === 'available' || item.status === 'unavailable').length;
  const save = async () => { setSaving(true); setError(''); try { await api.saveConfig(config); onSaved(); onClose(); } catch (reason) { setError((reason as Error).message); } finally { setSaving(false); } };
  return <dialog ref={ref} className="settings-dialog" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><div><span className="eyebrow">PAGEINDEX SETTINGS</span><h2>模型與存取設定</h2></div><button className="icon-button" onClick={onClose} aria-label="關閉設定"><X size={18}/></button></header>
    <div className="dialog-body">
      <label>API Key<div className="input-with-button"><input autoFocus type={visible ? 'text' : 'password'} value={config.api_key} onChange={(event) => setConfig({ ...config, api_key: event.target.value })}/><button onClick={() => setVisible((value) => !value)} aria-label={visible ? '隱藏 API key' : '顯示 API key'}>{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
      <div className="label-row"><span>模型</span><div className="model-actions"><a className="model-source-link" href="https://gnai.intel.com/meta?section=models" target="_blank" rel="noopener noreferrer">模型來源文件 ↗</a><button className="text-button verify-models-button" disabled={(!config.api_key.trim() && !config.api_key_set) || loadingModels || verifyingModels} onClick={() => void verifySupportedModels()}><SearchCheck className={verifyingModels ? 'pulse' : ''} size={14}/>{verifyingModels ? '驗證模型中…' : '驗證支援模型…'}</button></div></div>
      <label>查詢模型<select value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })}>{selectableModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
      <label>索引模型<select value={config.index_model} onChange={(event) => setConfig({ ...config, index_model: event.target.value })}>{selectableModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
      {(verificationItems.length > 0 || verification) && <div className={`model-verification phase-${verificationPhase}`} role="status" aria-live="polite">
        <strong>{verificationPhase === 'done' ? <CheckCircle2 size={15}/> : verificationPhase === 'error' ? <XCircle size={15}/> : <SearchCheck className="pulse" size={15}/>} {verification ? `驗證完成：${verification.available} 個可用、${verification.unavailable} 個不可用` : `已驗證 ${verifiedCount}/${verificationItems.length} 個模型`}</strong>
        <div className="model-verification-list">{verificationItems.map((item) => <div key={item.id} className={item.status}>
          <span><b>{item.label}</b><small>{item.id.split('/', 1)[0]}</small></span>
          <span>{item.status === 'pending' ? <><Clock3 size={13}/>待驗證</> : item.status === 'checking' ? <><RefreshCw className="spin" size={13}/>驗證中</> : item.status === 'available' ? <><CheckCircle2 size={13}/>可用</> : <><XCircle size={13}/><span title={item.error || `HTTP ${item.httpStatus}`}>不可用</span></>}</span>
        </div>)}</div>
      </div>}
      {error && <div className="inline-error">{error}</div>}
    </div>
    <footer><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={saving || (!config.api_key && !config.api_key_set) || !config.model} onClick={() => void save()}>{saving ? '儲存中…' : '儲存設定'}</button></footer>
  </dialog>;
}
