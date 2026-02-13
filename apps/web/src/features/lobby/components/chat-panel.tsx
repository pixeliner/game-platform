'use client';

import { useMemo, useState } from 'react';
import type { LobbyChatMessage } from '@game-platform/protocol';

import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Textarea } from '@/src/components/ui/textarea';

export interface ChatPanelProps {
  messages: LobbyChatMessage['payload'][];
  onSend: (text: string) => void;
}

function formatTimestamp(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleTimeString();
  } catch {
    return `${epochMs}`;
  }
}

export function ChatPanel(props: ChatPanelProps): React.JSX.Element {
  const [text, setText] = useState('');

  const sortedMessages = useMemo(() => {
    return [...props.messages].sort((a, b) => {
      if (a.sentAtMs === b.sentAtMs) {
        return a.messageId.localeCompare(b.messageId);
      }

      return a.sentAtMs - b.sentAtMs;
    });
  }, [props.messages]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>Lobby-wide text channel.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-background/40 p-3">
          {sortedMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : null}
          {sortedMessages.map((message) => (
            <div key={message.messageId} className="rounded border border-border/70 bg-background/70 p-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{message.nickname}</span>
                <span>{formatTimestamp(message.sentAtMs)}</span>
              </div>
              <p className="mt-1 text-sm">{message.text}</p>
            </div>
          ))}
        </div>

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = text.trim();
            if (trimmed.length === 0) {
              return;
            }

            props.onSend(trimmed);
            setText('');
          }}
        >
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Say something to the lobby"
            maxLength={1000}
          />
          <Button className="w-full" type="submit" variant="outline">
            Send Message
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
