'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { Input } from '@/src/components/ui/input';
import { ensureLocalProfile, loadLocalProfile } from '@/src/lib/storage/local-profile';

export function WatchMatchForm(): React.JSX.Element {
  const router = useRouter();
  const initialNickname = useMemo(() => loadLocalProfile()?.nickname ?? 'LanPlayer', []);

  const [roomId, setRoomId] = useState('');
  const [nickname, setNickname] = useState(initialNickname);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watch Match</CardTitle>
        <CardDescription>Join an active room as a spectator.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedRoomId = roomId.trim();
            if (trimmedRoomId.length === 0) {
              return;
            }

            ensureLocalProfile(nickname);
            router.push(`/game/${encodeURIComponent(trimmedRoomId)}?mode=spectator`);
          }}
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="watch-room-id">
              Room ID
            </label>
            <Input
              id="watch-room-id"
              value={roomId}
              maxLength={64}
              onChange={(event) => setRoomId(event.target.value)}
              placeholder="room_xxxxx"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="watch-nickname">
              Nickname
            </label>
            <Input
              id="watch-nickname"
              value={nickname}
              maxLength={32}
              onChange={(event) => setNickname(event.target.value)}
              required
            />
          </div>
          <CardFooter className="px-0 pt-2">
            <Button className="w-full" type="submit" variant="outline">
              Spectate
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
