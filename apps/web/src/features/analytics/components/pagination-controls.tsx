import Link from 'next/link';

import { Button } from '@/src/components/ui/button';

export interface PaginationControlsProps {
  basePath: string;
  limit: number;
  offset: number;
  total: number;
  query?: Record<string, string | number | undefined>;
  limitParamName?: string;
  offsetParamName?: string;
}

function buildHref(
  basePath: string,
  limitParamName: string,
  offsetParamName: string,
  limit: number,
  offset: number,
  query: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  params.set(limitParamName, String(limit));
  params.set(offsetParamName, String(offset));

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue;
    }

    params.set(key, String(value));
  }

  return `${basePath}?${params.toString()}`;
}

export function PaginationControls(props: PaginationControlsProps): React.JSX.Element {
  const safeLimit = Math.max(1, props.limit);
  const safeOffset = Math.max(0, props.offset);
  const previousOffset = Math.max(0, safeOffset - safeLimit);
  const nextOffset = safeOffset + safeLimit;
  const hasPrevious = safeOffset > 0;
  const hasNext = nextOffset < props.total;
  const query = props.query ?? {};
  const limitParamName = props.limitParamName ?? 'limit';
  const offsetParamName = props.offsetParamName ?? 'offset';

  return (
    <div className="flex items-center justify-between gap-3 rounded border border-border/70 bg-card/70 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        Showing {Math.min(safeOffset + 1, props.total)}-{Math.min(safeOffset + safeLimit, props.total)} of{' '}
        {props.total}
      </span>

      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Button asChild variant="outline" size="sm">
            <Link
              href={buildHref(
                props.basePath,
                limitParamName,
                offsetParamName,
                safeLimit,
                previousOffset,
                query,
              )}
            >
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
        )}

        {hasNext ? (
          <Button asChild variant="outline" size="sm">
            <Link
              href={buildHref(
                props.basePath,
                limitParamName,
                offsetParamName,
                safeLimit,
                nextOffset,
                query,
              )}
            >
              Next
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
