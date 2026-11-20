import { useState } from 'react';
import { Send } from 'lucide-react';
import { backend } from '@/lib/data';
import { TICKET_PRIORITIES, TONES } from '@/lib/constants';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const EMPTY = { title: '', description: '', priority: 'medium' };

export function NewTicketSheet({ open, onClose }) {
  const { workspaceId, author } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await backend.createTicket(workspaceId, form, author);
      toast.success('Request sent to your developer');
      setForm(EMPTY);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New request"
      subtitle="Describe what you’d like changed — no technical details needed."
      footer={
        <Button type="submit" form="new-ticket" size="lg" className="w-full" icon={Send} loading={saving} disabled={!form.title.trim()}>
          Send request
        </Button>
      }
    >
      <form id="new-ticket" onSubmit={submit} className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">What do you need?</span>
          <input
            autoFocus
            value={form.title}
            onChange={set('title')}
            maxLength={120}
            placeholder="e.g. Add a gift card option at checkout"
            className="h-12 w-full rounded-xl border-0 bg-ink-50 px-4 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Details</span>
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={5}
            maxLength={4000}
            placeholder="Why is this important? Any examples, links, or customer feedback?"
            className="w-full resize-none rounded-xl border-0 bg-ink-50 px-4 py-3 text-[15px] text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink-700">Priority</legend>
          <div className="grid grid-cols-3 gap-2">
            {TICKET_PRIORITIES.map((p) => {
              const active = form.priority === p.value;
              return (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => set('priority')(p.value)}
                  aria-pressed={active}
                  className={cn(
                    'flex flex-col items-center rounded-2xl px-2 py-3 ring-1 ring-inset transition',
                    active ? cn(TONES[p.tone], 'ring-2') : 'bg-white text-ink-600 ring-ink-200 hover:bg-ink-50',
                  )}
                >
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-[11px] opacity-75">{p.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Sheet>
  );
}
