<svelte:options runes={true} />
<script>
  import { getCandidateMeta } from '../lib/candidateMeta.js';
  import { formatNumber, formatPercent } from '../lib/format.js';
  import begichIcon from '../../images/colored_icons/begich.png';
  import palinIcon from '../../images/colored_icons/palin.png';
  import peltolaIcon from '../../images/colored_icons/peltola.png';
  import writeinIcon from '../../images/colored_icons/writein.png';

  let { pairwise = null, candidateLookup = new Map() } = $props();

  const iconMap = {
    begich: begichIcon,
    palin: palinIcon,
    peltola: peltolaIcon,
    writein: writeinIcon
  };

  let selectedCandidateId = $state(215);
  let tooltip = $state({ visible: false, x: 0, y: 0, lines: [] });

  const candidates = $derived.by(() => {
    if (!pairwise?.candidates) return [];
    const preferredOrder = [215, 218, 217, 214];
    return [...pairwise.candidates]
      .map((candidate) => {
        const resolved = candidateLookup.get(candidate.id) ?? candidate;
        const meta = getCandidateMeta(resolved);
        return {
          ...resolved,
          meta,
          iconSrc: meta.icon ? iconMap[meta.icon] : null
        };
      })
      .sort((a, b) => preferredOrder.indexOf(a.id) - preferredOrder.indexOf(b.id));
  });

  $effect(() => {
    if (!candidates.length) return;
    if (!candidates.some((candidate) => candidate.id === selectedCandidateId)) {
      selectedCandidateId = candidates[0].id;
    }
  });

  const selectedCandidate = $derived(candidates.find((candidate) => candidate.id === selectedCandidateId) ?? null);

  function findCell(rowId, colId) {
    const row = pairwise?.matrix?.find((entry) => entry[0]?.rowCandidateId === rowId);
    return row?.find((cell) => cell.colCandidateId === colId) ?? null;
  }

  const matchups = $derived.by(() => {
    if (!selectedCandidate || !candidates.length) return [];
    return candidates
      .filter((candidate) => candidate.id !== selectedCandidate.id)
      .map((opponent) => {
        const cell = findCell(selectedCandidate.id, opponent.id);
        const selectedVotes = cell?.rowVotes ?? 0;
        const opponentVotes = cell?.colVotes ?? 0;
        const total = selectedVotes + opponentVotes;
        const selectedPct = total ? selectedVotes / total : 0;
        const opponentPct = total ? opponentVotes / total : 0;
        return {
          opponent,
          selectedVotes,
          opponentVotes,
          total,
          selectedPct,
          opponentPct,
          selectedWins: selectedVotes > opponentVotes
        };
      });
  });

  const losingOpponents = $derived(matchups.filter((matchup) => !matchup.selectedWins).map((matchup) => matchup.opponent.meta.displayName));
  const isCondorcetWinner = $derived(matchups.length > 0 && matchups.every((matchup) => matchup.selectedWins));

  const conclusionText = $derived.by(() => {
    if (!selectedCandidate) return '';
    if (isCondorcetWinner) {
      return `✓ ${selectedCandidate.meta.displayName} beats every other candidate head-to-head, so ${selectedCandidate.meta.displayName} is the Condorcet winner.`;
    }

    if (losingOpponents.length === 1) {
      return `✕ ${selectedCandidate.meta.displayName} loses to ${losingOpponents[0]}, so ${selectedCandidate.meta.displayName} is not the Condorcet winner.`;
    }

    if (losingOpponents.length === 2) {
      return `✕ ${selectedCandidate.meta.displayName} loses to ${losingOpponents[0]} and ${losingOpponents[1]}, so ${selectedCandidate.meta.displayName} is not the Condorcet winner.`;
    }

    const lastOpponent = losingOpponents.at(-1);
    const initialOpponents = losingOpponents.slice(0, -1).join(', ');
    return `✕ ${selectedCandidate.meta.displayName} loses to ${initialOpponents}, and ${lastOpponent}, so ${selectedCandidate.meta.displayName} is not the Condorcet winner.`;
  });

  function showTooltip(event, candidate, votes, pct, total) {
    const bounds = event.currentTarget.closest('.headtohead-section')?.getBoundingClientRect();
    if (!bounds) return;
    tooltip = {
      visible: true,
      x: event.clientX - bounds.left + 12,
      y: event.clientY - bounds.top + 12,
      lines: [
        candidate.meta.displayName,
        formatPercent(pct, 1),
        `${formatNumber(votes)} of ${formatNumber(total)} counted ballots`
      ]
    };
  }

  function hideTooltip() {
    tooltip = { ...tooltip, visible: false };
  }
</script>

<div class="headtohead-section">
  <div class="candidate-card-grid">
    {#each candidates as candidate}
      <button
        class:selected={candidate.id === selectedCandidateId}
        class="candidate-card"
        style={`--candidate-soft:${candidate.meta.colors.soft}; --candidate-dark:${candidate.meta.colors.dark}; --candidate-tint:${candidate.meta.colors.tint};`}
        onclick={() => selectedCandidateId = candidate.id}
        aria-pressed={candidate.id === selectedCandidateId}
      >
        {#if candidate.iconSrc}
          <img src={candidate.iconSrc} alt={`${candidate.meta.displayName} icon`} class="candidate-card-icon" />
        {/if}
        <span class="candidate-card-name">{candidate.meta.displayName}</span>
        <span class="candidate-card-state">{candidate.id === selectedCandidateId ? 'Selected' : 'Click to compare'}</span>
      </button>
    {/each}
  </div>

  {#if selectedCandidate}
    <div class="matchup-panel">
      <h3>Can {selectedCandidate.meta.displayName} beat everyone head-to-head?</h3>

      <div class="matchup-list">
        {#each matchups as matchup}
          <div class="matchup-card">
            <div class="matchup-header">
              <div class="matchup-title">{selectedCandidate.meta.displayName} vs. {matchup.opponent.meta.displayName}</div>
              <div class:loss-badge={!matchup.selectedWins} class:win-badge={matchup.selectedWins} class="matchup-badge">
                {matchup.selectedWins ? 'WIN' : 'LOSS'}
              </div>
            </div>

            <div class="matchup-labels">
              <span>{selectedCandidate.meta.displayName}</span>
              <span>{matchup.opponent.meta.displayName}</span>
            </div>

            <div class="split-bar">
              <div
                role="presentation"
                class="split-segment selected-side"
                style={`width:${matchup.selectedPct * 100}%; --segment-soft:${selectedCandidate.meta.colors.soft}; --segment-dark:${selectedCandidate.meta.colors.dark};`}
                onpointermove={(event) => showTooltip(event, selectedCandidate, matchup.selectedVotes, matchup.selectedPct, matchup.total)}
                onpointerleave={hideTooltip}
              ></div>
              <div
                role="presentation"
                class="split-segment opponent-side"
                style={`width:${matchup.opponentPct * 100}%; --segment-soft:${matchup.opponent.meta.colors.soft}; --segment-dark:${matchup.opponent.meta.colors.dark};`}
                onpointermove={(event) => showTooltip(event, matchup.opponent, matchup.opponentVotes, matchup.opponentPct, matchup.total)}
                onpointerleave={hideTooltip}
              ></div>
            </div>

            <div class="matchup-shares">
              <span>{formatPercent(matchup.selectedPct, 1)}</span>
              <span>{formatPercent(matchup.opponentPct, 1)}</span>
            </div>
          </div>
        {/each}
      </div>

      <p class:success-line={isCondorcetWinner} class:failure-line={!isCondorcetWinner} class="conclusion-line">
        {conclusionText}
      </p>
    </div>
  {/if}

  {#if tooltip.visible}
    <div class="headtohead-tooltip" style={`left:${tooltip.x}px; top:${tooltip.y}px;`}>
      <strong>{tooltip.lines[0]}</strong><br />
      {tooltip.lines[1]}<br />
      {tooltip.lines[2]}
    </div>
  {/if}
</div>
