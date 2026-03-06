<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../app.css'
  import LayoutDashboard from 'lucide-svelte/icons/layout-dashboard'
  import Users from 'lucide-svelte/icons/users'
  import Settings from 'lucide-svelte/icons/settings'

  let { children }: { children: Snippet } = $props()

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/users', label: 'Users', icon: Users },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]
</script>

<div class="flex h-screen overflow-hidden bg-[var(--color-background)] text-[var(--color-foreground)]">
  <!-- Sidebar -->
  <aside class="flex w-64 flex-col border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)]">
    <!-- Logo -->
    <div class="flex h-16 items-center border-b border-[var(--color-sidebar-border)] px-6">
      <span class="text-lg font-semibold tracking-tight">Platformik</span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 space-y-1 p-4">
      {#each navItems as item (item.href)}
        <a
          href={item.href}
          class="
            flex
            items-center
            gap-3
            rounded-[var(--radius)]
            px-3
            py-2
            text-sm
            text-[var(--color-muted-foreground)]
            transition-colors
            hover:bg-[var(--color-secondary)]
            hover:text-[var(--color-foreground)]
          "
        >
          <item.icon size={18} />
          {item.label}
        </a>
      {/each}
    </nav>
  </aside>

  <!-- Main content -->
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- Top bar -->
    <header class="flex h-16 items-center border-b border-[var(--color-border)] px-6">
      <h1 class="text-sm font-medium text-[var(--color-muted-foreground)]">Platform</h1>
    </header>

    <!-- Page content -->
    <main class="flex-1 overflow-auto p-6">
      {@render children()}
    </main>
  </div>
</div>
