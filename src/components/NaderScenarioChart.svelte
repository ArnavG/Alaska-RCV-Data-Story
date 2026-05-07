<svelte:options runes={true} />
<script>
  import { scaleLinear } from 'd3';
  import { formatNumber, formatPercent } from '../lib/format.js';
  import bushIcon from '../../images/colored_icons/bush.png';
  import goreIcon from '../../images/colored_icons/gore.png';

  const baseVotes = {
    bush: 2912790,
    gore: 2912253,
    nader: 97488
  };

  let abstainShare = $state(80);
  let goreShareOfRemaining = $state(60);

  const redistributedShare = $derived((100 - abstainShare) / 100);
  const goreShare = $derived(goreShareOfRemaining / 100);
  const bushShare = $derived(1 - goreShare);
  const movedVotes = $derived(baseVotes.nader * redistributedShare);
  const goreAdded = $derived(movedVotes * goreShare);
  const bushAdded = $derived(movedVotes * bushShare);
  const neitherVotes = $derived(baseVotes.nader - movedVotes);

  const goreTotal = $derived(baseVotes.gore + goreAdded);
  const bushTotal = $derived(baseVotes.bush + bushAdded);
  const winner = $derived(goreTotal > bushTotal ? 'Gore' : bushTotal > goreTotal ? 'Bush' : 'Tie');
  const margin = $derived(Math.abs(goreTotal - bushTotal));
  const thresholdGoreShare = $derived.by(() => {
    if (movedVotes <= 0) return null;
    const required = (537 + movedVotes) / (2 * movedVotes);
    return Math.min(Math.max(required, 0), 1);
  });

  const winnerIcon = $derived(winner === 'Gore' ? goreIcon : winner === 'Bush' ? bushIcon : null);

  const chartRows = $derived([
    { label: 'Al Gore (D)', value: goreTotal, color: '#2563eb', icon: goreIcon },
    { label: 'George W. Bush (R)', value: bushTotal, color: '#dc2626', icon: bushIcon }
  ]);
  const x = $derived(scaleLinear().domain([0, Math.max(...chartRows.map((row) => row.value))]).range([0, 390]));
</script>

<div class="interactive-block">
  <div class="section-heading">
    <h2>Did Nader spoil the 2000 election in Florida?</h2>
  </div>
  <p class="placeholder-copy intro-emphasis"><strong>Change the assumptions below to see how many of Ralph Nader’s 97,488 Florida voters would have needed to break toward Al Gore or George W. Bush in a two-candidate race.</strong></p>

  <div class="scenario-grid">
    <label>
      <span>Share of Nader voters who would still choose neither major candidate: <strong>{abstainShare}%</strong></span>
      <input type="range" min="0" max="100" step="1" bind:value={abstainShare} />
    </label>
    <label>
      <span>Of the Nader voters who do pick a major-party candidate, share going to Gore: <strong>{goreShareOfRemaining}%</strong></span>
      <input type="range" min="0" max="100" step="1" bind:value={goreShareOfRemaining} />
    </label>
  </div>

  <div class="callout-row">
    <div class="callout-card">
      <div class="callout-label">Votes reallocated</div>
      <div class="callout-value">{formatNumber(Math.round(movedVotes))}</div>
    </div>
    <div class="callout-card">
      <div class="callout-label">Still choosing neither</div>
      <div class="callout-value">{formatNumber(Math.round(neitherVotes))}</div>
    </div>
    <div class="callout-card winner-card">
      <div>
        <div class="callout-label">Simulated winner</div>
        <div class={`callout-value ${winner === 'Gore' ? 'winner-gore' : winner === 'Bush' ? 'winner-bush' : ''}`}>{winner}</div>
      </div>
      {#if winnerIcon}
        <img class="winner-icon" src={winnerIcon} alt={`${winner} icon`} />
      {/if}
    </div>
  </div>

  <p class={`plain-highlight outcome-line ${winner === 'Gore' ? 'winner-gore' : winner === 'Bush' ? 'winner-bush' : ''}`}>
    {#if winner === 'Gore'}
      Under these assumptions, <span class="winner-name winner-gore">Gore</span> wins Florida by {formatNumber(Math.round(margin))} votes.
    {:else if winner === 'Bush'}
      Under these assumptions, <span class="winner-name winner-bush">Bush</span> still wins Florida by {formatNumber(Math.round(margin))} votes.
    {:else}
      Under these assumptions, the Florida result is a tie.
    {/if}
  </p>

  <p class="placeholder-copy threshold-note">
    Bush’s official Florida margin was 537 votes. {#if thresholdGoreShare !== null}Given the current abstention setting, Gore would need about <strong>{formatPercent(thresholdGoreShare)}</strong> of the reallocated Nader vote to flip the state.{/if}
  </p>

  <div class="chart-frame">
    <svg viewBox="0 0 800 250" aria-label="Florida 2000 spoiler scenario chart">
      <g transform="translate(24,36)">
        {#each chartRows as row, index}
          {@const y = index * 90}
          <image href={row.icon} x="0" y={y - 2} width="42" height="42"></image>
          <text x="58" y={y + 24} text-anchor="start" font-size="13" font-weight="700" fill="#111827">{row.label}</text>
          <rect x="230" y={y} width={x(row.value)} height="34" rx="10" fill={row.color} fill-opacity="0.88"></rect>
          <text x={230 + x(row.value) + 10} y={y + 22} font-size="13" font-weight="700" fill="#111827">{formatNumber(Math.round(row.value))}</text>
        {/each}
      </g>
    </svg>
  </div>
</div>
