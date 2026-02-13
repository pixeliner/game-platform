import { BombermanGameClient } from '@/src/features/bomberman/components/bomberman-game-client';

interface GamePageProps {
  params: Promise<{
    roomId: string;
  }>;
  searchParams: Promise<{
    lobbyId?: string;
    mode?: string;
  }>;
}

export default async function GamePage({ params, searchParams }: GamePageProps): Promise<React.JSX.Element> {
  const { roomId } = await params;
  const { lobbyId, mode } = await searchParams;

  return (
    <main>
      <BombermanGameClient
        roomId={roomId}
        lobbyId={lobbyId ?? null}
        mode={mode === 'spectator' ? 'spectator' : 'player'}
      />
    </main>
  );
}
