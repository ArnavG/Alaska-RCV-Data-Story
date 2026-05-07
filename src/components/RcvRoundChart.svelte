<svelte:options runes={true} />
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { formatNumber, formatPercent } from '../lib/format.js';
  import { getCandidateMeta } from '../lib/candidateMeta.js';
  import begichIcon from '../../images/colored_icons/begich.png';
  import palinIcon from '../../images/colored_icons/palin.png';
  import peltolaIcon from '../../images/colored_icons/peltola.png';
  import writeinIcon from '../../images/colored_icons/writein.png';

  let { rounds = [], roundIndex = 0, transferFlows = [], candidateLookup = new Map() } = $props();

  let container;
  let width = 760;
  const height = 372;
  const margin = { top: 18, right: 110, bottom: 22, left: 220 };
  let previousRoundIndex = 0;

  const iconByName = {
    begich: begichIcon,
    palin: palinIcon,
    peltola: peltolaIcon,
    writein: writeinIcon
  };

  function getPartyAbbreviation(party) {
    if (!party || party === 'Unknown / write-in') return '';
    if (/democrat/i.test(party)) return 'D';
    if (/republican/i.test(party)) return 'R';
    if (/libertarian/i.test(party)) return 'L';
    if (/independence/i.test(party)) return 'AI';
    if (/green/i.test(party)) return 'G';
    if (/nonpartisan/i.test(party)) return 'NP';
    if (/undeclared/i.test(party)) return 'U';
    return party.replace(/^Registered\s+/i, '').split(/\s+/).map((word) => word[0]).join('').toUpperCase();
  }

  function formatCandidateLabel(candidate) {
    if (!candidate) return 'Candidate';
    if (candidate.id === 214) return 'Write-in';

    const [lastNamePart = '', firstNamePart = ''] = String(candidate.name || '').split(',');
    const lastName = lastNamePart.trim();
    const firstToken = firstNamePart.trim().split(/\s+/).filter(Boolean)[0] || '';
    const initial = firstToken ? `${firstToken[0]}. ` : '';
    const partyAbbr = getPartyAbbreviation(candidate.party);
    const party = partyAbbr ? ` (${partyAbbr})` : '';
    return `${initial}${lastName}${party}`.trim();
  }

  function getCandidateRows(round) {
    const candidates = Array.from(candidateLookup.values());
    const tallyMap = new Map((round?.tallies ?? []).map((entry) => [entry.candidateId, entry]));
    const roundTotal = (round?.activeBallots ?? 0) + (round?.exhausted ?? 0);

    return [
      ...candidates.map((candidate) => {
        const tally = tallyMap.get(candidate.id);
        const meta = getCandidateMeta(candidate);
        const votes = tally?.votes ?? 0;
        return {
          candidateId: candidate.id,
          label: candidate.name,
          shortLabel: formatCandidateLabel(candidate),
          votes,
          share: roundTotal ? votes / roundTotal : 0,
          color: candidate.color,
          iconHref: meta.icon ? iconByName[meta.icon] : null,
          kind: 'candidate'
        };
      }),
      {
        candidateId: 'exhausted',
        label: 'Exhausted ballots',
        shortLabel: 'Exhausted ballots',
        votes: round?.exhausted ?? 0,
        share: roundTotal ? (round?.exhausted ?? 0) / roundTotal : 0,
        color: '#94a3b8',
        iconHref: null,
        kind: 'exhausted'
      }
    ];
  }

  function shouldAnimateTransfer(nextIndex) {
    return nextIndex === previousRoundIndex + 1 && nextIndex > 0;
  }

  function draw() {
    if (!container || !rounds.length) return;

    const safeRoundIndex = Math.max(0, Math.min(roundIndex, rounds.length - 1));
    const currentRound = rounds[safeRoundIndex];
    const previousRound = rounds[Math.max(0, previousRoundIndex)] ?? currentRound;
    const currentRows = getCandidateRows(currentRound);
    const previousRows = getCandidateRows(previousRound);

    width = Math.max(480, container.clientWidth || width);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const root = svg.selectAll('g.root').data([null]).join('g')
      .attr('class', 'root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const allRows = rounds.flatMap((round) => getCandidateRows(round));
    const x = d3.scaleLinear()
      .domain([0, d3.max(allRows, (d) => d.votes) || 0])
      .nice()
      .range([0, innerWidth]);

    const y = d3.scaleBand()
      .domain(currentRows.map((d) => d.candidateId))
      .range([0, innerHeight])
      .paddingInner(0.18)
      .paddingOuter(0.08);

    root.selectAll('g.x-axis').data([null]).join('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d) => d3.format('~s')(d)));

    root.selectAll('line.grid-line').data(x.ticks(5)).join('line')
      .attr('class', 'grid-line')
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '3 3');

    const previousRowMap = new Map(previousRows.map((row) => [row.candidateId, row]));
    const currentRowMap = new Map(currentRows.map((row) => [row.candidateId, row]));

    const labelGroups = root.selectAll('g.bar-label').data(currentRows, (d) => d.candidateId);
    const labelEnter = labelGroups.join(
      (enter) => {
        const group = enter.append('g').attr('class', 'bar-label');
        group.append('image').attr('class', 'bar-label-icon');
        group.append('text').attr('class', 'bar-label-text');
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );

    labelEnter
      .attr('transform', (d) => `translate(${-margin.left + 8}, ${(y(d.candidateId) || 0) + y.bandwidth() / 2 - 14})`);

    labelEnter.select('image.bar-label-icon')
      .attr('href', (d) => d.iconHref || '')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', (d) => d.iconHref ? 28 : 0)
      .attr('height', (d) => d.iconHref ? 28 : 0)
      .attr('opacity', (d) => d.iconHref ? 1 : 0);

    labelEnter.select('text.bar-label-text')
      .attr('x', (d) => d.iconHref ? 36 : 0)
      .attr('y', 18)
      .attr('fill', '#0f172a')
      .attr('font-size', 14)
      .attr('font-weight', 700)
      .text((d) => d.shortLabel);

    const bars = root.selectAll('rect.round-bar').data(currentRows, (d) => d.candidateId);

    bars.join(
      (enter) => enter.append('rect')
        .attr('class', 'round-bar')
        .attr('rx', 10)
        .attr('x', 0)
        .attr('y', (d) => y(d.candidateId) || 0)
        .attr('height', y.bandwidth())
        .attr('width', (d) => x(previousRowMap.get(d.candidateId)?.votes ?? d.votes))
        .attr('fill', (d) => d.color)
        .attr('fill-opacity', (d) => d.votes > 0 ? 0.9 : 0.14),
      (update) => update,
      (exit) => exit.remove()
    );

    const labels = root.selectAll('text.round-value').data(currentRows, (d) => d.candidateId);

    labels.join(
      (enter) => enter.append('text')
        .attr('class', 'round-value')
        .attr('x', (d) => x(previousRowMap.get(d.candidateId)?.votes ?? d.votes) + 10)
        .attr('y', (d) => (y(d.candidateId) || 0) + y.bandwidth() / 2 + 5)
        .attr('fill', '#0f172a')
        .attr('font-size', 13)
        .attr('font-weight', 700),
      (update) => update,
      (exit) => exit.remove()
    );

    const animateTransfer = shouldAnimateTransfer(safeRoundIndex);
    const transitionDelay = animateTransfer ? 280 : 0;
    const transitionDuration = animateTransfer ? 920 : 700;

    bars.interrupt().transition().delay(transitionDelay).duration(transitionDuration).ease(d3.easeCubicInOut)
      .attr('y', (d) => y(d.candidateId) || 0)
      .attr('height', y.bandwidth())
      .attr('width', (d) => x(d.votes))
      .attr('fill', (d) => d.color)
      .attr('fill-opacity', (d) => d.votes > 0 ? 0.9 : 0.14);

    labels.interrupt().transition().delay(transitionDelay).duration(transitionDuration).ease(d3.easeCubicInOut)
      .attr('x', (d) => x(d.votes) + 10)
      .attr('y', (d) => (y(d.candidateId) || 0) + y.bandwidth() / 2 + 5)
      .attr('opacity', (d) => d.votes > 0 ? 1 : 0)
      .tween('text', function (d) {
        const element = this;
        const startVotes = previousRowMap.get(d.candidateId)?.votes ?? d.votes;
        const startShare = previousRowMap.get(d.candidateId)?.share ?? d.share;
        const voteInterpolator = d3.interpolateNumber(startVotes, d.votes);
        const shareInterpolator = d3.interpolateNumber(startShare, d.share);
        return (t) => {
          element.textContent = `${formatNumber(Math.round(voteInterpolator(t)))} (${formatPercent(shareInterpolator(t))})`;
        };
      });

    root.selectAll('g.flow-layer').data([null]).join('g').attr('class', 'flow-layer');

    const flowLayer = root.select('g.flow-layer');
    flowLayer.selectAll('*').interrupt();

    if (animateTransfer) {
      const flowRoundNumber = previousRoundIndex + 1;
      const flows = transferFlows.filter((flow) => flow.fromRound === flowRoundNumber && flow.toRound === flowRoundNumber + 1);
      const sourceRow = previousRows.find((row) => row.candidateId === previousRound?.eliminatedCandidateId);

      if (flows.length && sourceRow) {
        let sourceOffset = 0;
        const destinationOffsets = new Map();
        const chunkData = flows.map((flow) => {
          const fromVotesBefore = sourceOffset;
          sourceOffset += flow.count;

          const destinationBase = previousRowMap.get(flow.toCandidateId)?.votes ?? 0;
          const destinationOffset = destinationOffsets.get(flow.toCandidateId) || 0;
          destinationOffsets.set(flow.toCandidateId, destinationOffset + flow.count);

          const destinationRow = currentRowMap.get(flow.toCandidateId);
          return {
            ...flow,
            color: sourceRow.color,
            startX: x(fromVotesBefore),
            startY: y(sourceRow.candidateId) || 0,
            width: Math.max(2, x(flow.count) - x(0)),
            endX: x(destinationBase + destinationOffset),
            endY: destinationRow ? (y(destinationRow.candidateId) || 0) : (y('exhausted') || 0)
          };
        });

        const chunks = flowLayer.selectAll('rect.flow-chunk').data(chunkData, (d) => `${d.fromCandidateId}-${d.toCandidateId}`);

        chunks.join(
          (enter) => enter.append('rect')
            .attr('class', 'flow-chunk')
            .attr('rx', 8)
            .attr('x', (d) => d.startX)
            .attr('y', (d) => d.startY)
            .attr('width', (d) => d.width)
            .attr('height', y.bandwidth())
            .attr('fill', (d) => d.color)
            .attr('fill-opacity', 0.92)
            .call((enter) => enter.transition().duration(950).ease(d3.easeCubicInOut)
              .attr('x', (d) => d.endX)
              .attr('y', (d) => d.endY)
              .attr('fill-opacity', 0.18)
              .remove()),
          (update) => update.remove(),
          (exit) => exit.remove()
        );
      }
    } else {
      flowLayer.selectAll('*').remove();
    }

    previousRoundIndex = safeRoundIndex;
  }

  onMount(() => {
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
    draw();
    return () => resizeObserver.disconnect();
  });

  $effect(() => {
    draw();
  });
</script>

<div class="chart-frame">
  <div bind:this={container}></div>
</div>
