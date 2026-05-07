<svelte:options runes={true} />
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { formatPercent } from '../lib/format.js';

  const DEFAULT_CANDIDATES = [
    { id: 'leftie', name: 'Lt. Leftie', short: 'Leftie', x: -0.45, color: '#3B82F6' },
    { id: 'moderate', name: 'Mr. Moderate', short: 'Moderate', x: 0.0, color: '#8B5CF6' },
    { id: 'rightie', name: 'Rep. Rightie', short: 'Rightie', x: 0.45, color: '#EF4444' }
  ];

  const BALANCED_VOTER_GROUPS = [
    { share: 0.45, mean: 0.0, sd: 0.18 },
    { share: 0.275, mean: -0.55, sd: 0.14 },
    { share: 0.275, mean: 0.55, sd: 0.14 }
  ];

  const POLARIZED_VOTER_GROUPS = [
    { share: 0.20, mean: 0.0, sd: 0.20 },
    { share: 0.40, mean: -0.60, sd: 0.16 },
    { share: 0.40, mean: 0.60, sd: 0.16 }
  ];

  const MODE_CONFIGS = {
    balanced: {
      label: 'Balanced',
      voterGroups: BALANCED_VOTER_GROUPS,
      intro: 'Here, voters approve of every candidate within a fixed ideological distance of 0.60 from their own position. In a more balanced electorate, that often rewards the broadly acceptable middle candidate.'
    },
    polarized: {
      label: 'Polarized',
      voterGroups: POLARIZED_VOTER_GROUPS,
      intro: 'Using the same approval threshold of 0.60, a more polarized electorate still allows voters to support multiple acceptable candidates, but concentrated blocs can produce more competition at the extremes.'
    }
  };

  const WIDTH = 900;
  const HEIGHT = 540;
  const AXIS_Y = 208;
  const CANDIDATE_Y = 278;
  const BARS_TOP = 348;
  const BARS_LEFT = 170;
  const BARS_WIDTH = 340;
  const DEMO_VOTER_COUNT = 500;
  const APPROVAL_THRESHOLD = 0.60;
  const VOTER_GRAY = '#9CA3AF';

  let container = $state();
  let mode = $state('balanced');
  let stage = $state(0);
  let demo = $state(null);
  let highlightedApprovals = $state(new Map());
  let simulationSummary = $state(null);

  const xScale = d3.scaleLinear().domain([-1, 1]).range([86, WIDTH - 86]);
  const barScale = d3.scaleLinear().domain([0, 1]).range([0, BARS_WIDTH]);

  function currentModeConfig() {
    return MODE_CONFIGS[mode] || MODE_CONFIGS.balanced;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let result = Math.imul(t ^ (t >>> 15), 1 | t);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalSample(random, mean = 0, sd = 1) {
    const u1 = Math.max(random(), 1e-9);
    const u2 = random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * sd;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function candidateById(candidateId, candidates = DEFAULT_CANDIDATES) {
    return candidates.find((candidate) => candidate.id === candidateId) || null;
  }

  function generateVoters(seed, count, voterGroups, candidates) {
    const random = mulberry32(seed);
    const voters = [];

    for (let index = 0; index < count; index += 1) {
      const draw = random();
      let cumulative = 0;
      let group = voterGroups[0];
      for (const candidateGroup of voterGroups) {
        cumulative += candidateGroup.share;
        if (draw <= cumulative) {
          group = candidateGroup;
          break;
        }
      }

      const x = clamp(normalSample(random, group.mean, group.sd), -0.98, 0.98);
      const approvals = candidates
        .filter((candidate) => Math.abs(x - candidate.x) <= APPROVAL_THRESHOLD)
        .map((candidate) => candidate.id);
      const nearest = [...candidates]
        .sort((a, b) => Math.abs(x - a.x) - Math.abs(x - b.x) || a.id.localeCompare(b.id))[0]?.id ?? null;
      const band = Math.floor(index / 25);
      const rowOffset = index % 25;
      const y = AXIS_Y - 30 - band * 7 - (rowOffset % 2) * 6 - random() * 3;

      voters.push({ id: index, x, y, approvals, nearest });
    }

    return voters;
  }

  function condorcetWinner(voters, candidates) {
    const wins = new Map(candidates.map((candidate) => [candidate.id, 0]));
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const left = candidates[i];
        const right = candidates[j];
        let leftVotes = 0;
        let rightVotes = 0;
        voters.forEach((voter) => {
          if (Math.abs(voter.x - left.x) < Math.abs(voter.x - right.x)) leftVotes += 1;
          else rightVotes += 1;
        });
        if (leftVotes > rightVotes) wins.set(left.id, (wins.get(left.id) || 0) + 1);
        else if (rightVotes > leftVotes) wins.set(right.id, (wins.get(right.id) || 0) + 1);
      }
    }
    return candidates.find((candidate) => wins.get(candidate.id) === candidates.length - 1)?.id ?? null;
  }

  function simulateApprovalElection({ seed, voterGroups, candidates = DEFAULT_CANDIDATES, voterCount = DEMO_VOTER_COUNT }) {
    const voters = generateVoters(seed, voterCount, voterGroups, candidates);
    const tallies = candidates.map((candidate) => ({
      candidateId: candidate.id,
      approvals: voters.filter((voter) => voter.approvals.includes(candidate.id)).length
    }));
    const winnerId = [...tallies].sort((a, b) => b.approvals - a.approvals || a.candidateId.localeCompare(b.candidateId))[0]?.candidateId ?? null;
    const maxApprovals = d3.max(tallies, (entry) => entry.approvals) || 1;
    return {
      seed,
      voters,
      candidates,
      tallies: tallies.map((entry) => ({
        ...entry,
        share: entry.approvals / voters.length,
        relativeShare: entry.approvals / maxApprovals,
        candidate: candidateById(entry.candidateId, candidates)
      })),
      winnerId,
      condorcetWinnerId: condorcetWinner(voters, candidates)
    };
  }

  function createDemo(modeName = mode) {
    const voterGroups = MODE_CONFIGS[modeName]?.voterGroups || BALANCED_VOTER_GROUPS;
    return simulateApprovalElection({
      seed: modeName === 'balanced' ? 7 : 31,
      voterGroups
    });
  }

  function ensureDemo() {
    if (!demo) {
      demo = createDemo(mode);
      highlightedApprovals = new Map(demo.voters.map((voter) => [voter.id, []]));
    }
  }

  function applyStage(nextStage) {
    ensureDemo();
    stage = nextStage;
    if (nextStage < 5) simulationSummary = null;

    if (nextStage <= 1) {
      highlightedApprovals = new Map(demo.voters.map((voter) => [voter.id, []]));
      return;
    }

    if (nextStage === 2) {
      highlightedApprovals = new Map(demo.voters.map((voter) => [voter.id, []]));
      return;
    }

    if (nextStage >= 3) {
      highlightedApprovals = new Map(demo.voters.map((voter) => [voter.id, voter.approvals]));
    }
  }

  function nextStep() {
    if (stage === 0) applyStage(1);
    else if (stage === 1) applyStage(2);
    else if (stage === 2) applyStage(3);
    else if (stage === 3) applyStage(4);
    else if (stage === 4) simulateHundred();
  }

  function previousStep() {
    if (stage === 0) return;
    applyStage(stage - 1);
  }

  function resetDemo(nextMode = mode) {
    mode = nextMode;
    demo = createDemo(nextMode);
    highlightedApprovals = new Map(demo.voters.map((voter) => [voter.id, []]));
    simulationSummary = null;
    stage = 0;
  }

  function simulateHundred() {
    const voterGroups = currentModeConfig().voterGroups;
    const winnerCounts = new Map(DEFAULT_CANDIDATES.map((candidate) => [candidate.id, 0]));
    let condorcetWinnerCount = 0;
    let condorcetWinnerElectedCount = 0;

    for (let index = 0; index < 100; index += 1) {
      const random = mulberry32(7000 + index + (mode === 'polarized' ? 2000 : 0));
      const candidates = [
        { ...DEFAULT_CANDIDATES[0], x: clamp(normalSample(random, -0.45, 0.05), -0.7, -0.25) },
        { ...DEFAULT_CANDIDATES[1], x: clamp(normalSample(random, 0.0, 0.04), -0.12, 0.12) },
        { ...DEFAULT_CANDIDATES[2], x: clamp(normalSample(random, 0.45, 0.05), 0.25, 0.7) }
      ];
      const election = simulateApprovalElection({
        seed: 3000 + index + (mode === 'polarized' ? 2000 : 0),
        voterGroups,
        candidates
      });
      winnerCounts.set(election.winnerId, (winnerCounts.get(election.winnerId) || 0) + 1);
      if (election.condorcetWinnerId) {
        condorcetWinnerCount += 1;
        if (election.condorcetWinnerId === election.winnerId) condorcetWinnerElectedCount += 1;
      }
    }

    simulationSummary = {
      winners: DEFAULT_CANDIDATES.map((candidate) => ({
        ...candidate,
        wins: winnerCounts.get(candidate.id) || 0,
        share: (winnerCounts.get(candidate.id) || 0) / 100
      })),
      condorcetWinnerCount,
      condorcetWinnerElectedCount
    };
    stage = 5;
  }

  function renderBars(root) {
    root.append('text')
      .attr('x', 86)
      .attr('y', BARS_TOP)
      .attr('fill', '#0f172a')
      .attr('font-size', 14)
      .attr('font-weight', 700)
      .text('Approval totals');

    demo.tallies.forEach((row, index) => {
      const y = BARS_TOP + 20 + index * 34;
      root.append('text')
        .attr('x', 86)
        .attr('y', y + 13)
        .attr('fill', '#0f172a')
        .attr('font-size', 13)
        .text(row.candidate.short);

      const animate = stage === 4;
      const bar = root.append('rect')
        .attr('x', BARS_LEFT)
        .attr('y', y)
        .attr('width', animate ? 0 : barScale(row.share))
        .attr('height', 18)
        .attr('rx', 9)
        .attr('fill', row.candidate.color);

      if (animate) {
        bar.transition().duration(700).ease(d3.easeCubicInOut)
          .attr('width', barScale(row.share));
      }

      root.append('text')
        .attr('x', BARS_LEFT + barScale(row.share) + 10)
        .attr('y', y + 13)
        .attr('fill', '#334155')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(formatPercent(row.share));

      if (row.candidateId === demo.winnerId) {
        root.append('text')
          .attr('x', BARS_LEFT + BARS_WIDTH + 48)
          .attr('y', y + 13)
          .attr('fill', '#166534')
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .text('WINNER');
      }
    });
  }

  function render() {
    if (!container || !demo) return;

    const svg = d3.select(container).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('width', '100%')
      .attr('height', 'auto');

    svg.selectAll('*').remove();
    const root = svg.append('g');

    root.append('line')
      .attr('x1', xScale(-1))
      .attr('x2', xScale(1))
      .attr('y1', AXIS_Y)
      .attr('y2', AXIS_Y)
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 2);

    root.append('text').attr('x', xScale(-1)).attr('y', 40).attr('fill', '#64748b').attr('font-size', 14).text('Left');
    root.append('text').attr('x', xScale(0)).attr('y', 40).attr('fill', '#64748b').attr('font-size', 14).attr('text-anchor', 'middle').text('Center');
    root.append('text').attr('x', xScale(1)).attr('y', 40).attr('fill', '#64748b').attr('font-size', 14).attr('text-anchor', 'end').text('Right');

    function voterFill(voter) {
      const approvals = highlightedApprovals.get(voter.id) || [];
      if (stage < 3 || approvals.length === 0) return VOTER_GRAY;
      if (approvals.includes('moderate')) return '#A78BFA';
      if (approvals.includes('leftie') && approvals.includes('rightie')) return '#7C83A3';
      if (approvals.includes('leftie')) return '#60A5FA';
      if (approvals.includes('rightie')) return '#F87171';
      return VOTER_GRAY;
    }

    function voterOpacity(voter) {
      if (stage < 1) return 0;
      return 0.82;
    }

    const voters = root.append('g').selectAll('circle').data(demo.voters, (d) => d.id).join('circle')
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => stage >= 1 ? d.y : AXIS_Y + 4)
      .attr('r', 4.4)
      .attr('opacity', (d) => voterOpacity(d))
      .attr('fill', (d) => voterFill(d));

    voters.transition().duration(250).ease(d3.easeCubicInOut)
      .attr('cy', (d) => stage >= 1 ? d.y : AXIS_Y + 4)
      .attr('opacity', (d) => voterOpacity(d))
      .attr('fill', (d) => voterFill(d));

    const candidateGroups = root.append('g').selectAll('g').data(demo.candidates, (d) => d.id).join('g')
      .attr('transform', (d) => `translate(${xScale(d.x)}, ${CANDIDATE_Y})`)
      .attr('opacity', stage >= 2 ? 1 : 0);

    candidateGroups.append('circle')
      .attr('r', 14)
      .attr('fill', (d) => d.color);

    candidateGroups.append('text')
      .attr('y', 34)
      .attr('text-anchor', 'middle')
      .attr('fill', '#0f172a')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .text((d) => d.name);

    candidateGroups.transition().duration(450).attr('opacity', stage >= 2 ? 1 : 0);

    if (stage >= 4) {
      renderBars(root);
    }
  }

  onMount(() => {
    ensureDemo();
    render();
  });

  $effect(() => {
    demo;
    stage;
    highlightedApprovals;
    render();
  });
</script>

<div class="approval-shell">
  <div class="approval-heading">
    <h3>Approval voting in balanced and polarized electorates</h3>
    <p>{currentModeConfig().intro}</p>
    <p class="approval-assumption"><strong>Assumption:</strong> voters approve every candidate within an ideological distance of <strong>{APPROVAL_THRESHOLD.toFixed(2)}</strong> <span class="approval-assumption-note">(roughly the distance from the ideological center to the left and right candidate positions in this simulation)</span>.</p>
  </div>

  <div class="approval-mode-toggle">
    <span class="mode-label">Electorate mode:</span>
    <div class="mode-buttons">
      <button class:active={mode === 'balanced'} onclick={() => resetDemo('balanced')}>Balanced</button>
      <button class:active={mode === 'polarized'} onclick={() => resetDemo('polarized')}>Polarized</button>
    </div>
  </div>

  <div class="approval-stepper">
    <div class="approval-step-label">Step {Math.min(stage + 1, 5)} of 5</div>
    <div class="approval-controls">
      <button class="ghost" onclick={previousStep} disabled={stage === 0}>Previous step</button>
      <button onclick={nextStep} disabled={stage === 5}>{stage === 0 ? 'Simulate voters' : stage === 1 ? 'Simulate candidates' : stage === 2 ? 'Show approvals' : stage === 3 ? 'Tally approvals' : stage === 4 ? 'Simulate 100 elections' : 'Simulation complete'}</button>
      <button class="ghost" onclick={() => resetDemo(mode)}>Reset</button>
    </div>
  </div>

  {#if simulationSummary}
    <div class="approval-results approval-results-prominent">
      <div class="results-title">Across 100 simulated elections</div>
      <div class="results-bars">
        {#each simulationSummary.winners as result (result.id)}
          <div class="results-row">
            <div class="results-label">
              <span class="results-dot" style={`background:${result.color}`}></span>
              <span>{result.name}</span>
            </div>
            <div class="results-track">
              <div class="results-fill results-fill-animated" style={`width:${result.share * 100}%; background:${result.color}`}></div>
            </div>
            <div class="results-value">{result.wins}</div>
          </div>
        {/each}
      </div>
      <div class="approval-summary-card">
        <div class="approval-summary-value">{simulationSummary.condorcetWinnerElectedCount} of {simulationSummary.condorcetWinnerCount}</div>
        <div class="approval-summary-label">A Condorcet winner existed in {simulationSummary.condorcetWinnerCount} of 100 simulations, and approval voting elected that Condorcet winner in {simulationSummary.condorcetWinnerElectedCount} of those cases.</div>
      </div>
    </div>
  {/if}

  {#if stage < 5}
    <div class="approval-frame">
      <div bind:this={container}></div>
    </div>
  {/if}

  {#if stage >= 4 && stage < 5}
    <div class="approval-callout">
      <p><strong>{candidateById(demo.winnerId, demo.candidates)?.name}</strong> wins the approval tally by collecting support from the broadest acceptable coalition under this threshold.</p>
    </div>
    <p class="approval-note"><strong>Demo diagnostics:</strong> {candidateById(demo.winnerId, demo.candidates)?.name} wins with {formatPercent(demo.tallies.find((entry) => entry.candidateId === demo.winnerId)?.share ?? 0)} approval. {#if demo.condorcetWinnerId}The Condorcet winner is <strong>{candidateById(demo.condorcetWinnerId, demo.candidates)?.name}</strong>.{/if}</p>
  {/if}
</div>

<style>
  .approval-shell {
    margin: 1.6rem 0;
  }

  .approval-heading h3 {
    margin: 0 0 1rem;
    font-size: 2rem;
    line-height: 1.1;
    color: #0f172a;
  }

  .approval-heading p {
    margin: 0 0 0.65rem;
    max-width: 62ch;
    color: #475569;
  }

  .approval-assumption {
    color: #334155;
  }

  .approval-assumption-note {
    color: #64748b;
  }

  .approval-mode-toggle,
  .approval-stepper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: nowrap;
    margin-bottom: 1rem;
  }

  .approval-mode-toggle {
    justify-content: flex-start;
    flex-wrap: wrap;
    margin-bottom: 0.95rem;
  }

  .mode-label,
  .approval-step-label {
    font-size: 0.92rem;
    font-weight: 700;
    color: #475569;
    white-space: nowrap;
  }

  .approval-step-label {
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .mode-buttons,
  .approval-controls {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .mode-buttons button,
  .approval-controls button {
    border: 1px solid #d1d5db;
    background: #fff;
    color: #0f172a;
    padding: 0.62rem 0.9rem;
    cursor: pointer;
    font-weight: 600;
  }

  .mode-buttons button.active {
    border-color: #93c5fd;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .mode-buttons button:hover:not(:disabled),
  .approval-controls button:hover:not(:disabled) {
    background: #f3f4f6;
  }

  .approval-controls button.ghost {
    color: #475569;
  }

  .approval-controls button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .approval-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .approval-callout {
    max-width: 72ch;
    margin-top: 0;
    padding: 0.9rem 1rem;
    background: #f8fafc;
    border-left: 4px solid #16a34a;
    color: #334155;
  }

  .approval-callout p,
  .approval-note {
    margin: 0.35rem 0 0;
    max-width: 72ch;
    color: #374151;
  }

  .approval-results {
    margin-top: 1rem;
    max-width: 46rem;
  }

  .approval-results-prominent {
    margin-top: 0.25rem;
    margin-bottom: 1rem;
    max-width: 100%;
  }

  .results-title {
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.7rem;
  }

  .results-bars {
    display: grid;
    gap: 0.7rem;
  }

  .results-row {
    display: grid;
    grid-template-columns: 12rem 1fr 2.25rem;
    gap: 0.8rem;
    align-items: center;
  }

  .results-label {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    color: #0f172a;
    font-weight: 600;
  }

  .results-dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 999px;
    display: inline-block;
  }

  .results-track {
    height: 0.9rem;
    background: #e5e7eb;
    border-radius: 999px;
    overflow: hidden;
  }

  .results-fill {
    height: 100%;
    border-radius: 999px;
  }

  .results-fill-animated {
    animation: results-grow 0.8s ease-out;
    transform-origin: left center;
  }

  .results-value {
    text-align: right;
    font-weight: 700;
    color: #0f172a;
  }

  .approval-summary-card {
    margin-top: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .approval-summary-value {
    font-size: 1.55rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 0.35rem;
  }

  .approval-summary-label {
    color: #334155;
  }

  @keyframes results-grow {
    from { width: 0; }
  }

  @media (max-width: 780px) {
    .approval-stepper {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .results-row {
      grid-template-columns: 1fr;
    }

    .results-value {
      text-align: left;
    }
  }
</style>
