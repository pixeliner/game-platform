import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

export interface StartPanelProps {
  canStart: boolean;
  disabledReason: string | null;
  onStart: () => void;
}

export function StartPanel(props: StartPanelProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Match Start</CardTitle>
        <CardDescription>Host action to launch the selected game room.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.disabledReason ? (
          <p className="rounded-md border border-border/70 bg-background/40 p-2 text-xs text-muted-foreground">
            {props.disabledReason}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Ready to start.</p>
        )}
        <Button className="w-full" onClick={props.onStart} disabled={!props.canStart}>
          Start Match
        </Button>
      </CardContent>
    </Card>
  );
}
