import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** The one dialog shell: header, optional tabs, scrolling body, footer. */
export default function Modal({ eyebrow, title, onClose, tabs, foot, children }: {
  eyebrow: string; title: string; onClose: () => void; tabs?: ReactNode; foot?: ReactNode; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = dialog.current; if (d && !d.open) d.showModal(); }, []);
  return <dialog ref={dialog} className="ui ui-modal" aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}>
    <header className="ui-modal-head">
      <img src="/favicon.svg" alt="" />
      <div><span className="ui-eyebrow">{eyebrow}</span><h2 className="ui-title">{title}</h2></div>
      <button className="ui-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
    </header>
    {tabs && <div className="ui-modal-tabs">{tabs}</div>}
    <div className="ui-modal-body">{children}</div>
    {foot && <footer className="ui-modal-foot">{foot}</footer>}
  </dialog>;
}

/** Segmented tabs; the active one is aria-pressed. */
export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (value: T) => void; label: string }) {
  return <div className="ui-tabs" role="group" aria-label={label}>
    {options.map(([id, text]) => <button key={id} type="button" aria-pressed={id === value} onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}
