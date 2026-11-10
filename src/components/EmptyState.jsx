import { Inbox } from 'lucide-react';

export function EmptyState({ title, hint, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-desk-muted">
      <Icon className="h-10 w-10 opacity-40" aria-hidden />
      <p className="font-sans text-sm font-medium text-desk-text">{title}</p>
      {hint && <p className="max-w-md font-mono text-xs text-desk-muted">{hint}</p>}
    </div>
  );
}
