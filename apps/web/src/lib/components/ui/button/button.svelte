<script lang="ts">
  import type { Snippet } from 'svelte'
  import { type VariantProps, cva } from 'class-variance-authority'
  import { cn } from '$lib/utils.js'

  const buttonVariants = cva(
    `inline-flex items-center justify-center gap-2
    rounded-[var(--radius)] text-sm font-medium
    transition-colorsfocus-visible:outline-none
    focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]
    disabled:pointer-events-none disabled:opacity-50`,
    {
      variants: {
        variant: {
          default:
            'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/90',
          secondary:
            'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:bg-[var(--color-secondary)]/80',
          outline: 'border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-secondary)]',
          ghost: 'hover:bg-[var(--color-secondary)] hover:text-[var(--color-secondary-foreground)]',
          destructive: 'bg-red-500 text-white hover:bg-red-500/90',
        },
        size: {
          default: 'h-9 px-4 py-2',
          sm: 'h-8 px-3 text-xs',
          lg: 'h-10 px-8',
          icon: 'h-9 w-9',
        },
      },
      defaultVariants: {
        variant: 'default',
        size: 'default',
      },
    },
  )

  type Props = {
    variant?: VariantProps<typeof buttonVariants>['variant']
    size?: VariantProps<typeof buttonVariants>['size']
    class?: string
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    onclick?: (e: MouseEvent) => void
  }

  let {
    variant = 'default',
    size = 'default',
    class: className,
    disabled,
    type = 'button',
    onclick,
    children,
  }: Props & { children?: Snippet } = $props()
</script>

<button {type} {disabled} {onclick} class={cn(buttonVariants({ variant, size }), className)}>
  {@render children?.()}
</button>
