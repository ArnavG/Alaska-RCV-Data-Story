<svelte:options runes={true} />
<script>
  import { formatNumber, formatPercent } from '../lib/format.js';
  import { getCandidateMeta } from '../lib/candidateMeta.js';
  import begichIcon from '../../images/colored_icons/begich.png';
  import palinIcon from '../../images/colored_icons/palin.png';
  import peltolaIcon from '../../images/colored_icons/peltola.png';
  import writeinIcon from '../../images/colored_icons/writein.png';

  let { patterns = [], candidateLookup = new Map() } = $props();

  const iconMap = {
    begich: begichIcon,
    palin: palinIcon,
    peltola: peltolaIcon,
    writein: writeinIcon
  };

  function depthLabel(depth) {
    if (depth === 1) return 'For voters who ranked one candidate';
    if (depth === 2) return 'For voters who ranked two candidates';
    if (depth === 3) return 'For voters who ranked three candidates';
    return `For voters who ranked ${depth} candidates`;
  }

  function candidateMeta(candidateId) {
    const candidate = candidateLookup.get(candidateId);
    return {
      candidate,
      meta: getCandidateMeta(candidate),
      iconSrc: getCandidateMeta(candidate).icon ? iconMap[getCandidateMeta(candidate).icon] : null
    };
  }
</script>

<div class="pattern-block">
  <h3>Most common ranking by ballot depth</h3>
  <div class="pattern-list">
    {#each patterns as pattern (pattern.depth)}
      <div class="pattern-card">
        <div class="pattern-text-row">
          <div class="pattern-label">{depthLabel(pattern.depth)}, the modal ranking was:</div>
          <div class="pattern-meta">{formatNumber(pattern.count)} ballots ({formatPercent(pattern.shareOfDepth)})</div>
        </div>
        <div class="pattern-sequence" aria-label={`Most common ranking pattern for depth ${pattern.depth}`}>
          {#each pattern.candidateIds as candidateId, index (candidateId)}
            {@const info = candidateMeta(candidateId)}
            <div class="pattern-candidate" style={`--candidate-tint:${info.meta.colors.tint}; --candidate-dark:${info.meta.colors.dark};`}>
              {#if info.iconSrc}
                <img src={info.iconSrc} alt={info.candidate?.name ?? info.meta.displayName} class="pattern-icon" />
              {/if}
              <div class="pattern-name">{info.meta.displayName}</div>
              <div class="pattern-rank">Rank {index + 1}</div>
            </div>
            {#if index < pattern.candidateIds.length - 1}
              <div class="pattern-arrow" aria-hidden="true">→</div>
            {/if}
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
