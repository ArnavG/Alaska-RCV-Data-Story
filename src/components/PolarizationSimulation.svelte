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
      intro: 'A broadly acceptable candidate can sit near the center of the electorate and still lose under RCV if they fail to build enough first-choice support.'
    },
    polarized: {
      label: 'Polarized',
      voterGroups: POLARIZED_VOTER_GROUPS,
      intro: 'When voters cluster into opposing blocs, RCV can make it harder for a broadly acceptable middle candidate to survive the early rounds.'
    }
  };

  const VOTER_GRAY = '#9CA3AF';
  const WIDTH = 900;
  const HEIGHT = 600;
  const AXIS_Y = 208;
  const CANDIDATE_Y = 276;
  const ROUND_ONE_TOP = 332;
  const ROUND_TWO_TOP = 468;
  const BARS_LEFT = 170;
  const BARS_WIDTH = 320;
  const DEMO_VOTER_COUNT = 500;

  let container = $state();
  let mode = $state('balanced');
  let stage = $state(0);
  let demo = $state(null);
  let currentChoices = $state(new Map());
  let rcvRoundIndex = $state(-1);
  let showRoundTwo = $state(false);
  let isAnimating = $state(false);
  let simulationSummary = $state(null);

  const xScale = d3.scaleLinear().domain([-1, 1]).range([86, WIDTH - 86]);
  const barScale = d3.scaleLinear().domain([0, 0.6]).range([0, BARS_WIDTH]);

  function currentModeConfig() {
    return MODE_CONFIGS[mode] || MODE_CONFIGS.balanced;
  }

  function candidateById(candidateId, candidates = DEFAULT_CANDIDATES) {
    return candidates.find((candidate) => candidate.id === candidateId) || null;
  }

  function candidateName(candidateId, candidates = DEFAULT_CANDIDATES) {
    return candidateById(candidateId, candidates)?.name || 'Unknown candidate';
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

  function rankCandidates(x, candidates) {
    return [...candidates]
      .map((candidate) => ({ candidateId: candidate.id, distance: Math.abs(x - candidate.x) }))
      .sort((a, b) => a.distance - b.distance || a.candidateId.localeCompare(b.candidateId))
      .map((entry) => entry.candidateId);
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
      const rankings = rankCandidates(x, candidates);
      const band = Math.floor(index / 25);
      const rowOffset = index % 25;
      const y = AXIS_Y - 30 - band * 7 - (rowOffset % 2) * 6 - random() * 3;

      voters.push({
        id: index,
        x,
        y,
        rankings,
        firstChoice: rankings[0]
      });
    }

    return voters;
  }

  function pairwiseResults(voters, candidates) {
    const ids = candidates.map((candidate) => candidate.id);
    const results = {};
    const wins = Object.fromEntries(ids.map((candidateId) => [candidateId, 0]));

    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const left = ids[i];
        const right = ids[j];
        let leftVotes = 0;
        let rightVotes = 0;

        voters.forEach((voter) => {
          const leftRank = voter.rankings.indexOf(left);
          const rightRank = voter.rankings.indexOf(right);
          if (leftRank < rightRank) leftVotes += 1;
          else rightVotes += 1;
        });

        if (leftVotes > rightVotes) wins[left] += 1;
        else if (rightVotes > leftVotes) wins[right] += 1;

        results[`${left}-${right}`] = {
          left,
          right,
          leftVotes,
          rightVotes,
          winner: leftVotes === rightVotes ? null : leftVotes > rightVotes ? left : right
        };
      }
    }

    const condorcetWinner = ids.find((candidateId) => wins[candidateId] === ids.length - 1) || null;
    return { results, condorcetWinner };
  }

  function simulateElection({ seed, voterGroups = BALANCED_VOTER_GROUPS, candidates = DEFAULT_CANDIDATES, voterCount = DEMO_VOTER_COUNT }) {
    const voters = generateVoters(seed, voterCount, voterGroups, candidates);
    const rounds = [];
    let remaining = candidates.map((candidate) => candidate.id);
    const eliminationOrder = [];

    while (remaining.length > 1) {
      const tallies = new Map(remaining.map((candidateId) => [candidateId, 0]));
      const assignments = new Map();

      voters.forEach((voter) => {
        const activeChoice = voter.rankings.find((candidateId) => remaining.includes(candidateId));
        assignments.set(voter.id, activeChoice || null);
        if (activeChoice) tallies.set(activeChoice, (tallies.get(activeChoice) || 0) + 1);
      });

      const activeBallots = d3.sum([...tallies.values()]);
      const tallyEntries = remaining.map((candidateId) => ({
        candidateId,
        votes: tallies.get(candidateId) || 0,
        share: activeBallots ? (tallies.get(candidateId) || 0) / activeBallots : 0
      }));

      const majorityWinner = tallyEntries.find((entry) => entry.share > 0.5);
      if (majorityWinner) {
        rounds.push({
          round: rounds.length + 1,
          tallies: tallyEntries,
          winnerCandidateId: majorityWinner.candidateId,
          eliminatedCandidateId: null,
          assignments,
          activeBallots
        });
        break;
      }

      const eliminatedCandidateId = [...tallyEntries]
        .sort((a, b) => a.votes - b.votes || a.candidateId.localeCompare(b.candidateId))[0]
        .candidateId;
      eliminationOrder.push(eliminatedCandidateId);

      const transfers = new Map();
      voters.forEach((voter) => {
        if (assignments.get(voter.id) !== eliminatedCandidateId) return;
        const nextChoice = voter.rankings.find((candidateId) => candidateId !== eliminatedCandidateId && remaining.includes(candidateId));
        transfers.set(voter.id, nextChoice || null);
      });

      rounds.push({
        round: rounds.length + 1,
        tallies: tallyEntries,
        winnerCandidateId: null,
        eliminatedCandidateId,
        assignments,
        transfers,
        activeBallots
      });

      remaining = remaining.filter((candidateId) => candidateId !== eliminatedCandidateId);
    }

    const { results, condorcetWinner } = pairwiseResults(voters, candidates);
    const firstChoiceShares = Object.fromEntries(
      candidates.map((candidate) => {
        const tally = rounds[0]?.tallies.find((entry) => entry.candidateId === candidate.id);
        return [candidate.id, tally?.share ?? 0];
      })
    );
    const rcvWinner = rounds.at(-1)?.winnerCandidateId ?? null;

    return {
      seed,
      voters,
      candidates,
      rounds,
      meanVoter: d3.mean(voters, (voter) => voter.x) ?? 0,
      debug: {
        firstChoiceShares,
        rcvEliminationOrder: eliminationOrder,
        rcvWinner,
        pairwiseResults: results,
        condorcetWinner
      }
    };
  }

  function satisfiesCenterSqueeze(election) {
    return election.debug.condorcetWinner === 'moderate'
      && election.debug.rcvWinner !== 'moderate'
      && election.debug.rcvEliminationOrder[0] === 'moderate';
  }

  function satisfiesPolarizedDemo(election) {
    return election.debug.rcvWinner !== 'moderate'
      && election.debug.firstChoiceShares.moderate < election.debug.firstChoiceShares.leftie
      && election.debug.firstChoiceShares.moderate < election.debug.firstChoiceShares.rightie;
  }

  function createDeterministicDemo(modeName = mode) {
    const voterGroups = MODE_CONFIGS[modeName]?.voterGroups || BALANCED_VOTER_GROUPS;
    const fallbackSeeds = modeName === 'balanced'
      ? [7, 16, 17, 73, 95, 142, 211]
      : [11, 19, 24, 31, 42, 58, 88, 144];

    const primaryPredicate = modeName === 'balanced' ? satisfiesCenterSqueeze : satisfiesPolarizedDemo;

    for (const seed of fallbackSeeds) {
      const election = simulateElection({ seed, voterGroups });
      if (primaryPredicate(election)) return election;
    }

    for (let seed = 1; seed <= 8000; seed += 1) {
      const election = simulateElection({ seed, voterGroups });
      if (primaryPredicate(election)) return election;
    }

    if (modeName === 'polarized') {
      for (let seed = 1; seed <= 8000; seed += 1) {
        const election = simulateElection({ seed, voterGroups });
        if (satisfiesCenterSqueeze(election)) return election;
      }
    }

    return simulateElection({ seed: fallbackSeeds[0], voterGroups });
  }

  function jitteredCandidates(random) {
    return [
      { ...DEFAULT_CANDIDATES[0], x: clamp(normalSample(random, -0.45, 0.05), -0.7, -0.25) },
      { ...DEFAULT_CANDIDATES[1], x: clamp(normalSample(random, 0.0, 0.04), -0.12, 0.12) },
      { ...DEFAULT_CANDIDATES[2], x: clamp(normalSample(random, 0.45, 0.05), 0.25, 0.7) }
    ];
  }

  function resetChoices(voters) {
    currentChoices = new Map(voters.map((voter) => [voter.id, null]));
  }

  function ensureDemo() {
    if (!demo) {
      demo = createDeterministicDemo(mode);
      console.log(`center-squeeze-demo:${mode}`, demo.debug);
      resetChoices(demo.voters);
    }
  }

  function simulateVoters() {
    ensureDemo();
    stage = 1;
    rcvRoundIndex = -1;
    showRoundTwo = false;
    simulationSummary = null;
    resetChoices(demo.voters);
  }

  function simulateCandidates() {
    if (stage < 1) simulateVoters();
    stage = 2;
  }

  function firstChoiceMap() {
    return new Map(demo.voters.map((voter) => [voter.id, voter.firstChoice]));
  }

  function roundTwoChoiceMap() {
    const updatedChoices = firstChoiceMap();
    const eliminatedCandidateId = demo.rounds[0]?.eliminatedCandidateId;
    demo.voters.forEach((voter) => {
      if (voter.firstChoice !== eliminatedCandidateId) return;
      const nextChoice = voter.rankings.find((candidateId) => candidateId !== eliminatedCandidateId);
      updatedChoices.set(voter.id, nextChoice || null);
    });
    return updatedChoices;
  }

  function rankBallots() {
    if (stage < 2) simulateCandidates();
    stage = 3;
    rcvRoundIndex = -1;
    currentChoices = firstChoiceMap();
  }

  function showRoundOne() {
    if (stage < 3) rankBallots();
    stage = Math.max(stage, 4);
    rcvRoundIndex = 0;
    showRoundTwo = false;
    currentChoices = firstChoiceMap();
  }

  function applyStage(targetStage) {
    ensureDemo();
    stage = targetStage;
    isAnimating = false;

    if (targetStage < 6) simulationSummary = null;

    if (targetStage <= 1) {
      rcvRoundIndex = -1;
      showRoundTwo = false;
      resetChoices(demo.voters);
      return;
    }

    if (targetStage === 2) {
      rcvRoundIndex = -1;
      showRoundTwo = false;
      resetChoices(demo.voters);
      return;
    }

    if (targetStage === 3) {
      rcvRoundIndex = -1;
      showRoundTwo = false;
      currentChoices = firstChoiceMap();
      return;
    }

    if (targetStage === 4) {
      rcvRoundIndex = 0;
      showRoundTwo = false;
      currentChoices = firstChoiceMap();
      return;
    }

    if (targetStage === 5) {
      rcvRoundIndex = 1;
      showRoundTwo = true;
      currentChoices = roundTwoChoiceMap();
    }
  }

  async function showRoundTwoStep() {
    if (isAnimating) return;
    if (stage < 4) showRoundOne();
    isAnimating = true;
    rcvRoundIndex = 0;
    showRoundTwo = false;
    currentChoices = firstChoiceMap();

    await new Promise((resolve) => setTimeout(resolve, 650));

    currentChoices = roundTwoChoiceMap();
    showRoundTwo = true;
    rcvRoundIndex = 1;
    stage = Math.max(stage, 5);
    isAnimating = false;
  }

  function previousStep() {
    if (isAnimating || stage === 0) return;
    applyStage(stage - 1);
  }

  function nextStep() {
    if (isAnimating) return;
    if (stage === 0) simulateVoters();
    else if (stage === 1) simulateCandidates();
    else if (stage === 2) rankBallots();
    else if (stage === 3) showRoundOne();
    else if (stage === 4) showRoundTwoStep();
    else if (stage === 5) simulateHundred();
  }

  async function simulateHundred() {
    if (stage < 5) await showRoundTwoStep();

    const voterGroups = currentModeConfig().voterGroups;
    const winnerCounts = new Map(DEFAULT_CANDIDATES.map((candidate) => [candidate.id, 0]));
    let condorcetExistsCount = 0;
    let condorcetWinnerElectedCount = 0;
    let moderateCondorcetCount = 0;
    let centerSqueezeCount = 0;

    for (let index = 0; index < 100; index += 1) {
      const random = mulberry32(5000 + index + (mode === 'polarized' ? 3000 : 0));
      const election = simulateElection({
        seed: 1000 + index + (mode === 'polarized' ? 3000 : 0),
        voterGroups,
        candidates: jitteredCandidates(random)
      });

      const winner = election.debug.rcvWinner;
      winnerCounts.set(winner, (winnerCounts.get(winner) || 0) + 1);

      const condorcetWinner = election.debug.condorcetWinner;
      if (condorcetWinner) {
        condorcetExistsCount += 1;
        if (condorcetWinner === winner) condorcetWinnerElectedCount += 1;
        if (condorcetWinner === 'moderate') moderateCondorcetCount += 1;
      }
      if (condorcetWinner === 'moderate' && winner !== 'moderate') centerSqueezeCount += 1;
    }

    simulationSummary = {
      winners: DEFAULT_CANDIDATES.map((candidate) => ({
        ...candidate,
        wins: winnerCounts.get(candidate.id) || 0,
        share: (winnerCounts.get(candidate.id) || 0) / 100
      })),
      condorcetExistsCount,
      condorcetWinnerElectedCount,
      moderateCondorcetCount,
      centerSqueezeCount
    };
    stage = 6;
  }

  function resetDemo(nextMode = mode) {
    mode = nextMode;
    demo = createDeterministicDemo(nextMode);
    console.log(`center-squeeze-demo:${nextMode}`, demo.debug);
    resetChoices(demo.voters);
    simulationSummary = null;
    rcvRoundIndex = -1;
    showRoundTwo = false;
    stage = 0;
    isAnimating = false;
  }

  function barRows(round) {
    if (!round) return [];
    return round.tallies.map((entry) => ({
      ...entry,
      candidate: demo.candidates.find((candidate) => candidate.id === entry.candidateId)
    }));
  }

  function renderRoundBars(root, title, yStart, rows, winnerId = null, eliminatedId = null, animate = true) {
    root.append('text')
      .attr('x', 86)
      .attr('y', yStart)
      .attr('fill', '#0f172a')
      .attr('font-size', 14)
      .attr('font-weight', 700)
      .text(title);

    rows.forEach((row, index) => {
      const y = yStart + 20 + index * 30;
      root.append('text')
        .attr('x', 86)
        .attr('y', y + 13)
        .attr('fill', '#0f172a')
        .attr('font-size', 13)
        .text(row.candidate.short);

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

      if (row.candidateId === eliminatedId) {
        root.append('text')
          .attr('x', BARS_LEFT + BARS_WIDTH + 48)
          .attr('y', y + 13)
          .attr('fill', '#b91c1c')
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .text('ELIMINATED');
      }

      if (row.candidateId === winnerId) {
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

  function renderAnnotations(root) {
    const winner = demo.candidates.find((candidate) => candidate.id === demo.debug.rcvWinner);
    const centerX = xScale(demo.meanVoter);
    const winnerX = xScale(winner?.x ?? 0);
    const centerAnchorY = AXIS_Y - 1;
    const winnerAnchorY = AXIS_Y + 1;

    root.append('circle')
      .attr('cx', centerX)
      .attr('cy', centerAnchorY)
      .attr('r', 6)
      .attr('fill', '#0f172a');
    root.append('text')
      .attr('x', centerX)
      .attr('y', centerAnchorY - 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#475569')
      .attr('font-size', 12)
      .text(mode === 'polarized' ? 'The average ideology is here' : 'Most voters are here');

    root.append('circle')
      .attr('cx', winnerX)
      .attr('cy', winnerAnchorY)
      .attr('r', 8)
      .attr('fill', winner?.color || '#0f172a');
    root.append('text')
      .attr('x', winnerX)
      .attr('y', winnerAnchorY - 14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#475569')
      .attr('font-size', 12)
      .text('But the winner is here');
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

    const voters = root.append('g').selectAll('circle').data(demo.voters, (d) => d.id).join('circle')
      .attr('cx', (d) => xScale(d.x))
      .attr('cy', (d) => stage >= 1 ? d.y : AXIS_Y + 4)
      .attr('r', 4.4)
      .attr('opacity', stage >= 1 ? 0.82 : 0)
      .attr('fill', (d) => {
        const choice = stage >= 3 ? currentChoices.get(d.id) : null;
        return choice ? demo.candidates.find((candidate) => candidate.id === choice)?.color || VOTER_GRAY : VOTER_GRAY;
      });

    voters.transition().duration(250).ease(d3.easeCubicInOut)
      .attr('cy', (d) => stage >= 1 ? d.y : AXIS_Y + 4)
      .attr('opacity', stage >= 1 ? 0.82 : 0)
      .attr('fill', (d) => {
        const choice = stage >= 3 ? currentChoices.get(d.id) : null;
        return choice ? demo.candidates.find((candidate) => candidate.id === choice)?.color || VOTER_GRAY : VOTER_GRAY;
      });

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

    candidateGroups.transition().duration(650).attr('opacity', stage >= 2 ? 1 : 0);
    candidateGroups.select('circle')
      .attr('opacity', (d) => (stage >= 5 && d.id === demo.rounds[0]?.eliminatedCandidateId ? 0.35 : 1));

    if (stage >= 4) {
      renderRoundBars(root, 'Round 1', ROUND_ONE_TOP, barRows(demo.rounds[0]), null, demo.rounds[0]?.eliminatedCandidateId, stage === 4 && !isAnimating && rcvRoundIndex === 0);
    }

    if (rcvRoundIndex >= 1 && showRoundTwo) {
      renderRoundBars(root, 'Round 2', ROUND_TWO_TOP, barRows(demo.rounds[1]), demo.rounds[1]?.winnerCandidateId, null, stage === 5 && !isAnimating);
      renderAnnotations(root);
    }
  }

  onMount(() => {
    ensureDemo();
    render();
  });

  $effect(() => {
    demo;
    stage;
    currentChoices;
    showRoundTwo;
    rcvRoundIndex;
    render();
  });
</script>

<div class="polarization-shell">
  <div class="polarization-heading">
    <h3>When the middle candidate gets squeezed</h3>
    <p>{currentModeConfig().intro}</p>
  </div>

  <div class="polarization-mode-toggle">
    <span class="mode-label">Electorate mode:</span>
    <div class="mode-buttons">
      <button class:active={mode === 'balanced'} onclick={() => resetDemo('balanced')}>Balanced</button>
      <button class:active={mode === 'polarized'} onclick={() => resetDemo('polarized')}>Polarized</button>
    </div>
  </div>

  <div class="polarization-stepper">
    <div class="polarization-step-label">Step {Math.min(stage + 1, 6)} of 6</div>
    <div class="polarization-controls">
      <button class="ghost" onclick={previousStep} disabled={isAnimating || stage === 0}>Previous step</button>
      <button onclick={nextStep} disabled={isAnimating || stage === 6}>{stage === 0 ? 'Simulate voters' : stage === 1 ? 'Simulate candidates' : stage === 2 ? 'Rank ballots' : stage === 3 ? 'Show Round 1' : stage === 4 ? 'Show Round 2' : stage === 5 ? 'Simulate 100 elections' : 'Simulation complete'}</button>
      <button class="ghost" onclick={() => resetDemo(mode)}>Reset</button>
    </div>
  </div>

  {#if simulationSummary}
    <div class="polarization-results polarization-results-prominent">
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
      <div class="center-squeeze-card">
        {#if mode === 'balanced'}
          <div class="center-squeeze-value">{simulationSummary.centerSqueezeCount} of 100</div>
          <div class="center-squeeze-label">Center squeeze occurred in {simulationSummary.centerSqueezeCount} of 100 elections.</div>
          <div class="center-squeeze-subnote">Mr. Moderate was the Condorcet winner in {simulationSummary.moderateCondorcetCount} of 100 simulated elections.</div>
        {:else}
          <div class="center-squeeze-value">{simulationSummary.centerSqueezeCount} of 100</div>
          <div class="center-squeeze-label">Center squeeze occurred in {simulationSummary.centerSqueezeCount} of 100 simulated elections.</div>
          <div class="center-squeeze-subnote">A Condorcet winner existed in {simulationSummary.condorcetExistsCount} of 100 simulations. RCV elected that Condorcet winner in {simulationSummary.condorcetWinnerElectedCount} of those {simulationSummary.condorcetExistsCount} simulations.</div>
          <div class="center-squeeze-subnote">Mr. Moderate was the Condorcet winner in {simulationSummary.moderateCondorcetCount} of those {simulationSummary.condorcetExistsCount} simulations.</div>
        {/if}
      </div>
    </div>
  {/if}

  {#if stage < 6}
    <div class="polarization-frame">
      <div bind:this={container}></div>
    </div>
  {/if}

  {#if stage >= 5 && stage < 6}
    <div class="polarization-callout">
      {#if demo.debug.condorcetWinner === 'moderate' && demo.debug.rcvWinner !== 'moderate'}
        <p><strong>Mr. Moderate is closest to the center of the electorate and would beat either opponent head-to-head.</strong> But because RCV counts first choices round by round, he is eliminated before those broader preferences can matter.</p>
      {:else if demo.debug.condorcetWinner === 'moderate'}
        <p><strong>Mr. Moderate sits closest to the center of the electorate.</strong> In this run, those broader preferences are strong enough to carry him through the RCV count.</p>
      {:else}
        <p><strong>This run does not produce a Condorcet winner for Mr. Moderate.</strong> In a more polarized electorate, the early-round first-choice contest can track the outer blocs more than the center.</p>
      {/if}
    </div>
  {/if}

  {#if stage >= 5}
    <p class="polarization-note">
      <strong>Demo diagnostics:</strong>
      first-choice shares are {formatPercent(demo.debug.firstChoiceShares.leftie)} for Leftie, {formatPercent(demo.debug.firstChoiceShares.moderate)} for Moderate, and {formatPercent(demo.debug.firstChoiceShares.rightie)} for Rightie.
      {#if demo.debug.condorcetWinner}
        The Condorcet winner is <strong>{candidateName(demo.debug.condorcetWinner, demo.candidates)}</strong>, and the RCV winner is <strong>{candidateName(demo.debug.rcvWinner, demo.candidates)}</strong>.
      {:else}
        No Condorcet winner exists in this demo, and the RCV winner is <strong>{candidateName(demo.debug.rcvWinner, demo.candidates)}</strong>.
      {/if}
    </p>
  {/if}

</div>

<style>
  .polarization-shell {
    margin: 1.6rem 0;
  }

  .polarization-heading h3 {
    margin: 0 0 0.35rem;
    font-size: 1.4rem;
    color: #0f172a;
  }

  .polarization-heading p {
    margin: 0 0 1rem;
    max-width: 62ch;
    color: #475569;
  }

  .polarization-mode-toggle {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex-wrap: wrap;
    margin-bottom: 0.95rem;
  }

  .mode-label {
    font-size: 0.95rem;
    font-weight: 600;
    color: #334155;
  }

  .mode-buttons {
    display: inline-flex;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .mode-buttons button {
    border: 1px solid #d1d5db;
    background: #fff;
    color: #0f172a;
    padding: 0.5rem 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  .mode-buttons button.active {
    border-color: #93c5fd;
    background: #eff6ff;
    color: #1d4ed8;
  }

  .polarization-stepper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.9rem;
    flex-wrap: nowrap;
    margin-bottom: 1rem;
  }

  .polarization-step-label {
    font-size: 0.92rem;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .polarization-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-bottom: 0;
  }

  .polarization-controls button {
    border: 1px solid #d1d5db;
    background: #fff;
    color: #0f172a;
    padding: 0.62rem 0.9rem;
    cursor: pointer;
    font-weight: 600;
  }

  .polarization-controls button.ghost {
    color: #475569;
  }

  .polarization-controls button:hover:not(:disabled),
  .mode-buttons button:hover:not(:disabled) {
    background: #f3f4f6;
  }

  .polarization-controls button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .polarization-frame :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .polarization-callout {
    max-width: 72ch;
    margin-top: 0;
    padding: 0.9rem 1rem;
    background: #f8fafc;
    border-left: 4px solid #8B5CF6;
    color: #334155;
  }

  .polarization-callout p,
  .polarization-note {
    margin: 0.35rem 0 0;
    max-width: 72ch;
    color: #374151;
  }

  .polarization-results {
    margin-top: 1rem;
    max-width: 46rem;
  }

  .polarization-results-prominent {
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

  .center-squeeze-card {
    margin-top: 1rem;
    padding: 1rem 1.1rem;
    border: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .center-squeeze-value {
    font-size: 1.55rem;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 0.35rem;
  }

  .center-squeeze-label {
    color: #334155;
    margin-bottom: 0.35rem;
  }

  .center-squeeze-subnote {
    color: #64748b;
    font-size: 0.92rem;
    margin-top: 0.2rem;
  }

  @keyframes results-grow {
    from {
      width: 0;
    }
  }

  @media (max-width: 780px) {
    .polarization-stepper {
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
