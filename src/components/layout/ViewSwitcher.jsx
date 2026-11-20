import { Briefcase, Code2 } from 'lucide-react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

const OPTIONS = [
  { value: 'owner', label: 'Owner', icon: Briefcase },
  { value: 'developer', label: 'Dev', icon: Code2 },
];

export function ViewSwitcher({ size = 'sm', className }) {
  const { viewMode, setViewMode } = useWorkspace();
  return <SegmentedControl ariaLabel="Switch view" options={OPTIONS} value={viewMode} onChange={setViewMode} size={size} className={className} />;
}
