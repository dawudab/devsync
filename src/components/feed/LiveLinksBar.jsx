import { ExternalLink, Globe, FlaskConical, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';

const LINK_DEFS = [
  { key: 'productionUrl', label: 'Live App', sub: 'Production', icon: Globe, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { key: 'stagingUrl', label: 'Staging', sub: 'Test preview', icon: FlaskConical, tone: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { key: 'designUrl', label: 'Prototype', sub: 'Figma', icon: Palette, tone: 'bg-violet-50 text-violet-700 ring-violet-200' },
];

export function LiveLinksBar() {
  const { workspace, isOwner } = useWorkspace();
  const links = workspace?.workspaceLinks || {};
  const configured = LINK_DEFS.filter((d) => links[d.key]?.trim());

  if (!configured.length) {
    if (!isOwner) return null;
    return (
      <Link
        to="/settings"
        className="flex items-center justify-between rounded-2xl border border-dashed border-ink-300 bg-white/70 px-4 py-3 text-sm text-ink-600 transition hover:border-brand-300 hover:bg-white"
      >
        <span>Pin your Live App, Staging, and Figma links for one-tap previews</span>
        <span className="font-semibold text-brand-600">Add links →</span>
      </Link>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {configured.map(({ key, label, sub, icon: Icon, tone }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card ring-1 ring-ink-100 transition hover:ring-brand-200 active:scale-[0.99]"
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink-900">{label}</span>
            <span className="block truncate text-[11px] text-ink-400">{sub}</span>
          </span>
          <ExternalLink className="h-4 w-4 shrink-0 text-ink-300 transition group-hover:text-brand-600" />
        </a>
      ))}
    </div>
  );
}
