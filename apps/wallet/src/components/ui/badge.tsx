import { cn } from '@repo/ui/lib/utils';
import type { ComponentProps } from 'react';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

type BadgeProps = ComponentProps<'span'> & {
  variant?: BadgeVariant;
};

const variantClassMap: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'text-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
};

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden',
        variantClassMap[variant],
        className,
      )}
      {...props}
    />
  );
};
