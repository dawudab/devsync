import { useState } from 'react';
import { Webhook } from 'lucide-react';
import { backend } from '@/lib/data';
import { simulatorEnabled } from '@/config/firebase';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';

export function SimulateEventButton({ className, variant = 'dark', size = 'sm' }) {
  const { workspaceId } = useWorkspace();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  if (!simulatorEnabled) return null;

  const run = async () => {
    setLoading(true);
    try {
      await backend.simulateEvent(workspaceId);
      toast.success('Webhook delivered and translated');
    } catch (e) {
      toast.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} icon={Webhook} loading={loading} onClick={run} className={className}>
      Simulate webhook
    </Button>
  );
}
