<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js'
</script>

<div class="space-y-4">
  <div>
    <h2 class="text-2xl font-bold tracking-tight">Dashboard</h2>
    <p class="text-[var(--color-muted-foreground)]">Welcome to Platformik.</p>
  </div>

  <div class="flex gap-2">
    <Button>Primary</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="outline">Outline</Button>
    <Button variant="ghost">Ghost</Button>
  </div>
</div>
