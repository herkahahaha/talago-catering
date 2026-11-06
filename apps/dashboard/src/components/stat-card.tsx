import type { JSX } from 'solid-js';
import { Card, CardContent } from '~/components/ui/card';
import { cn } from '~/lib/cn';

export function StatCard(props: {
  label: string;
  value: string;
  meta?: string;
  icon?: JSX.Element;
  class?: string;
}) {
  return (
    <Card class={cn('gap-0 py-5 shadow-sm', props.class)}>
      <CardContent class="px-5">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-muted-foreground text-xs font-medium">{props.label}</p>
            <p class="mt-2 truncate text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>
            {props.meta ? <p class="text-muted-foreground mt-1 line-clamp-2 text-xs">{props.meta}</p> : null}
          </div>
          {props.icon ? (
            <div class="bg-muted text-muted-foreground shrink-0 rounded-md p-2 [&_svg]:size-4">
              {props.icon}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
