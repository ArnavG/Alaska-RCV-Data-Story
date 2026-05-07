<svelte:options runes={true} />
<script>
  let { summary = [], title = 'Prototype winner summaries' } = $props();
</script>

<div class="summary-block">
  <h3>{title}</h3>
  <div class="summary-grid">
    {#each summary as item}
      <article class="summary-card">
        <div class="summary-label">{item.label}</div>
        <div class="summary-value">{item.value}</div>
        {#if item.note}
          <div class="summary-note">{item.note}</div>
        {/if}
      </article>
    {/each}
  </div>
</div>
