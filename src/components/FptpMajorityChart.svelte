<svelte:options runes={true} />
<script>
  import { scaleLinear } from 'd3';
  import { formatNumber, formatPercent } from '../lib/format.js';

  const partyRows = [
    { id: 'labour', party: 'Labour', leader: 'Keir Starmer', votes: 9708716, share: 0.337, color: '#d94b4b' },
    { id: 'conservative', party: 'Conservative', leader: 'Rishi Sunak', votes: 6828925, share: 0.237, color: '#2563eb' },
    { id: 'reform', party: 'Reform UK', leader: 'Nigel Farage', votes: 4117610, share: 0.143, color: '#0f766e' },
    { id: 'libdem', party: 'Liberal Democrats', leader: 'Ed Davey', votes: 3519143, share: 0.122, color: '#f59e0b' },
    { id: 'green', party: 'Green', leader: 'Carla Denyer and Adrian Ramsay', votes: 1841888, share: 0.064, color: '#16a34a' },
    { id: 'snp', party: 'Scottish National Party', leader: 'John Swinney', votes: 724758, share: 0.025, color: '#f4c430' },
    { id: 'independent', party: 'Independent', leader: 'Independent candidates', votes: 564243, share: 0.02, color: '#6b7280' },
    { id: 'other', party: 'Other parties', leader: 'Other parties', votes: 1520448, share: 0.049, color: '#c084fc' }
  ];

  let selectedPartyId = $state('labour');
  let tooltip = $state({ visible: false, x: 0, y: 0, title: '', body: [] });

  const selectedParty = $derived(partyRows.find((row) => row.id === selectedPartyId) ?? partyRows[0]);
  const otherParties = $derived(partyRows.filter((row) => row.id !== selectedPartyId));
  const opposedShare = $derived(1 - selectedParty.share);
  const y = scaleLinear().domain([0, 1]).range([0, 300]);

  function showTooltip(event, row, prefix = '') {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    tooltip = {
      visible: true,
      x: rect ? event.clientX - rect.left + 12 : 0,
      y: rect ? event.clientY - rect.top + 12 : 0,
      title: prefix ? `${prefix}: ${row.party}` : row.party,
      body: [
        row.leader,
        `${formatNumber(row.votes)} votes`,
        `${formatPercent(row.share)} of the vote`
      ]
    };
  }

  function hideTooltip() {
    tooltip = { ...tooltip, visible: false };
  }
</script>

<div class="interactive-block">
  <div class="section-heading">
    <h2>First-past-the-post does not always elect majority winners</h2>
  </div>
  <p class="placeholder-copy">Choose a party to compare its vote share to the combined share won by everyone else.</p>

  <div class="toggle-row">
    {#each partyRows.slice(0, 7) as row (row.id)}
      <button class:selected={row.id === selectedPartyId} style={`--toggle-color:${row.color}`} onclick={() => selectedPartyId = row.id}>{row.party}</button>
    {/each}
  </div>

  <div class="chart-frame side-by-side-frame">
    <div class="chart-caption-row">
      <div>
        <strong>{selectedParty.party}</strong> won {formatPercent(selectedParty.share)} of the vote.
      </div>
      <div>
        That means <strong>{formatPercent(opposedShare)}</strong> of voters chose someone else.
      </div>
    </div>

    <div class="bar-chart-wrap">
      <svg viewBox="0 0 720 380" aria-label="Selected party versus everyone else vote shares">
        <g transform="translate(90,30)">
          <line x1="0" y1="0" x2="0" y2="300" stroke="#9ca3af"></line>
          <line x1="0" y1="300" x2="560" y2="300" stroke="#9ca3af"></line>

          {#each [0, 0.25, 0.5, 0.75, 1] as tick}
            <g transform={`translate(0,${300 - y(tick)})`}>
              <line x1="0" x2="560" y1="0" y2="0" stroke="#e5e7eb" stroke-dasharray="4 4"></line>
              <text x="-12" y="4" text-anchor="end" font-size="11" fill="#6b7280">{Math.round(tick * 100)}%</text>
            </g>
          {/each}

          <rect role="img"
            x="70"
            y={300 - y(selectedParty.share)}
            width="140"
            height={y(selectedParty.share)}
            fill={selectedParty.color}
            class="hover-darken"
            onmouseenter={(event) => showTooltip(event, selectedParty)}
            onmousemove={(event) => showTooltip(event, selectedParty)}
            onmouseleave={hideTooltip}
          />
          <text x="140" y={300 - y(selectedParty.share) - 10} text-anchor="middle" font-size="12" font-weight="700" fill="#111827">{formatPercent(selectedParty.share)}</text>
          <text x="140" y="325" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">{selectedParty.party}</text>

          {#each otherParties as row, index (row.id)}
            {@const offset = otherParties.slice(0, index).reduce((sum, item) => sum + item.share, 0)}
            <rect role="img"
              x="340"
              y={300 - y(offset + row.share)}
              width="140"
              height={y(row.share)}
              fill={row.color}
              class="hover-darken"
              onmouseenter={(event) => showTooltip(event, row, 'Other parties')}
              onmousemove={(event) => showTooltip(event, row, 'Other parties')}
              onmouseleave={hideTooltip}
            />
          {/each}
          <text x="410" y={300 - y(opposedShare) - 10} text-anchor="middle" font-size="12" font-weight="700" fill="#111827">{formatPercent(opposedShare)}</text>
          <text x="410" y="325" text-anchor="middle" font-size="12" font-weight="700" fill="#111827">Everyone else</text>
        </g>
      </svg>

      {#if tooltip.visible}
        <div class="tooltip chart-tooltip" style={`left:${tooltip.x}px; top:${tooltip.y}px; opacity:1;`}>
          <strong>{tooltip.title}</strong>
          {#each tooltip.body as line}
            <div>{line}</div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
