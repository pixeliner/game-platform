'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ensureLocalProfile, loadLocalProfile } from '@/src/lib/storage/local-profile';
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

export function JoinLobbyForm(): React.JSX.Element {
  const router = useRouter();
  const initialNickname = useMemo(() => loadLocalProfile()?.nickname ?? 'LanPlayer', []);

  const [nickname, setNickname] = useState(initialNickname);
  const [lobbyId, setLobbyId] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join Lobby</CardTitle>
        <CardDescription>Enter a lobby ID shared by the host.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmedLobbyId = lobbyId.trim();
            if (trimmedLobbyId.length === 0) {
              return;
            }

            const profile = ensureLocalProfile(nickname);
            const params = new URLSearchParams({
              nickname: profile.nickname,
            });

            router.push(`/lobby/${encodeURIComponent(trimmedLobbyId)}?${params.toString()}`);
          }}
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="join-lobby-id">
              Lobby ID
            </label>
            <Input
              id="join-lobby-id"
              value={lobbyId}
              maxLength={64}
              onChange={(event) => setLobbyId(event.target.value)}
              placeholder="lobby_xxxxx"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="join-nickname">
              Nickname
            </label>
            <Input
              id="join-nickname"
              value={nickname}
              maxLength={32}
              onChange={(event) => setNickname(event.target.value)}
              required
            />
          </div>
          <CardFooter className="px-0 pt-2">
            <Button className="w-full" type="submit" variant="secondary">
              Join Lobby
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
