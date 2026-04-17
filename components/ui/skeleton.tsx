import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'relative overflow-hidden rounded-md bg-accent/85 motion-reduce:animate-none',
        'before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent before:animate-[skeleton-shimmer_1.35s_ease-in-out_infinite] motion-reduce:before:animate-none dark:before:via-slate-100/10',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
