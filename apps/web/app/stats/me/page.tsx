'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';
import { loadLocalProfile } from '@/src/lib/storage/local-profile';

export default function MyStatsPage(): React.JSX.Element {
  const router = useRouter();
  const [missingProfile, setMissingProfile] = useState(false);

  useEffect(() => {
    const profile = loadLocalProfile();
    if (!profile) {
      setMissingProfile(true);
      return;
    }

    router.replace(`/stats/${encodeURIComponent(profile.guestId)}`);
  }, [router]);

  if (!missingProfile) {
    return (
      <main>
        <Card>
          <CardHeader>
            <CardTitle>Loading Stats</CardTitle>
            <CardDescription>Resolving your local player profile.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main>
      <Card>
        <CardHeader>
          <CardTitle>Missing Local Profile</CardTitle>
          <CardDescription>
            No local guest profile was found, so <code>/stats/me</code> cannot resolve a player.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/">Back Home</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
