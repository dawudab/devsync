import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { useAITranslator } from '@/hooks/useAITranslator';
import { useToast } from '@/context/ToastContext';
import { AISummary, AISourceTag } from '@/components/feed/AISummary';
import { Button } from '@/components/ui/Button';

const EXAMPLE = 'fix(auth): resolve JWT expiration bug in OAuth middleware';

export function TranslatorPlayground() {
  const { preview, pending } = useAITranslator();
  const toast = useToast();
  const [message, setMessage] = useState(EXAMPLE);
  const [diff, setDiff] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [result, setResult] = useState(null);

  const run = async (e) => {
    e.preventDefault();
    try {
      setResult(await preview(message, { diff }));
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <form onSubmit={run} className="space-y-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-ink-100">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink-900">AI translator playground</h3>
          <p className="text-xs text-ink-500">Preview how a commit will read to the owner.</p>
        </div>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        placeholder="Commit message(s) — separate multiple with a blank line"
        className="w-full resize-none rounded-xl bg-ink-950 px-3 py-2.5 font-mono text-[12.5px] text-emerald-300 placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {showDiff ? (
        <textarea
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          rows={5}
          placeholder="Paste a unified diff (optional)"
          className="w-full resize-y rounded-xl bg-ink-50 px-3 py-2.5 font-mono text-[11.5px] text-ink-800 ring-1 ring-inset ring-ink-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      ) : (
        <button type="button" onClick={() => setShowDiff(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
          + Add a diff for more context
        </button>
      )}
      <Button type="submit" icon={Wand2} loading={pending} disabled={!message.trim()} className="w-full">
        Translate for owner
      </Button>
      {result && (
        <div className="animate-card-in rounded-xl bg-ink-50 p-4">
          <AISummary summary={result} compact />
          <div className="mt-3">
            <AISourceTag source={result.source} />
          </div>
        </div>
      )}
    </form>
  );
}
