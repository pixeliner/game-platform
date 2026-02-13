import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

export interface ReadyPanelProps {
  isReady: boolean;
  canToggle: boolean;
  onToggle: (nextReady: boolean) => void;
}

export function ReadyPanel(props: ReadyPanelProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ready Status</CardTitle>
        <CardDescription>All connected players must be ready before start.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Your state: <strong>{props.isReady ? 'Ready' : 'Not ready'}</strong>
        </p>
        <Button
          className="w-full"
          variant={props.isReady ? 'outline' : 'default'}
          disabled={!props.canToggle}
          onClick={() => props.onToggle(!props.isReady)}
        >
          {props.isReady ? 'Set Not Ready' : 'Set Ready'}
        </Button>
      </CardContent>
    </Card>
  );
}
