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

export function CreateLobbyForm(): React.JSX.Element {
  const router = useRouter();
  const initialNickname = useMemo(() => loadLocalProfile()?.nickname ?? 'LanPlayer', []);

  const [nickname, setNickname] = useState(initialNickname);
  const [lobbyName, setLobbyName] = useState('LAN Session');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Lobby</CardTitle>
        <CardDescription>Start a new room and invite players on your LAN.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const profile = ensureLocalProfile(nickname);
            const params = new URLSearchParams({
              nickname: profile.nickname,
              lobbyName: lobbyName.trim() || 'LAN Session',
            });

            router.push(`/lobby/new?${params.toString()}`);
          }}
        >
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="create-nickname">
              Nickname
            </label>
            <Input
              id="create-nickname"
              value={nickname}
              maxLength={32}
              onChange={(event) => setNickname(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="create-lobby-name">
              Lobby Name
            </label>
            <Input
              id="create-lobby-name"
              value={lobbyName}
              maxLength={64}
              onChange={(event) => setLobbyName(event.target.value)}
            />
          </div>
          <CardFooter className="px-0 pt-2">
            <Button className="w-full" type="submit">
              Create Lobby
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
