<svelte:options runes={true} />
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { formatNumber, formatPercent } from '../lib/format.js';
  import { getCandidateMeta } from '../lib/candidateMeta.js';

  let { flows = [], rounds = [], roundIndex = 0, candidateLookup = new Map() } = $props();

  let container = $state();
  let width = $state(760);
  let selectedTransferIndex = $state(0);
  let hasInitializedTransferIndex = $state(false);
  const height = 320;
  const margin = { top: 22, right: 220, bottom: 28, left: 220 };

  function getAvailableRounds() {
    return [...new Set(flows.map((flow) => flow.fromRound))].sort((a, b) => a - b);
  }

  const availableRounds = $derived(getAvailableRounds());

  function getInitialTransferIndex() {
    if (!rounds.length || !availableRounds.length) return 0;
    const safeRoundIndex = Math.max(0, Math.min(roundIndex, rounds.length - 1));
    const currentRound = rounds[safeRoundIndex];
    const desiredRound = currentRound?.eliminatedCandidateId && availableRounds.includes(currentRound.round)
      ? currentRound.round
      : Math.max(availableRounds[0], Math.min(availableRounds.at(-1), (currentRound?.round ?? 1) - 1));
    return Math.max(0, availableRounds.indexOf(desiredRound));
  }

  function getDisplayRound() {
    if (!availableRounds.length) return null;
    return availableRounds[Math.max(0, Math.min(selectedTransferIndex, availableRounds.length - 1))] ?? null;
  }

  function getDisplayData() {
    const displayRound = getDisplayRound();
    if (!displayRound) return null;
    const roundFlows = flows.filter((flow) => flow.fromRound === displayRound).sort((a, b) => b.count - a.count);
    if (!roundFlows.length) return null;

    const sourceId = roundFlows[0].fromCandidateId;
    const total = d3.sum(roundFlows, (flow) => flow.count);
    return { displayRound, sourceId, total, roundFlows };
  }

  const displayData = $derived(getDisplayData());

  function formatDisplayName(name) {
    if (!name || !String(name).includes(',')) return name;
    const [lastName = '', firstNames = ''] = String(name).split(',');
    return `${firstNames.trim()} ${lastName.trim()}`.trim();
  }

  function candidateRecord(candidateId) {
    if (candidateId === 'exhausted') {
      return {
        name: 'Exhausted ballots',
        shortName: 'Exhausted',
        colors: { soft: '#94a3b8', dark: '#475569', tint: '#f1f5f9' }
      };
    }

    const candidate = candidateLookup.get(candidateId);
    if (!candidate) {
      return {
        name: `Candidate ${candidateId}`,
        shortName: `Candidate ${candidateId}`,
        colors: { soft: '#9ca3af', dark: '#4b5563', tint: '#f3f4f6' }
      };
    }

    const meta = getCandidateMeta(candidate);
    return {
      name: formatDisplayName(candidate.name),
      shortName: meta.displayName || meta.shortName || formatDisplayName(candidate.name),
      colors: meta.colors
    };
  }

  function draw() {
    if (!container) return;

    const data = getDisplayData();
    if (!data) {
      d3.select(container).selectAll('*').remove();
      return;
    }

    width = Math.max(520, container.clientWidth || width);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const chartTop = 16;
    const chartHeight = Math.min(innerHeight - chartTop * 2, 190);
    const sourceX = 66;
    const targetX = innerWidth - 46;
    const nodeWidth = 22;
    const gap = 18;
    const total = data.total || 1;
    const scale = chartHeight / total;

    const source = candidateRecord(data.sourceId);
    const destinations = data.roundFlows.map((flow) => ({
      ...flow,
      record: candidateRecord(flow.toCandidateId),
      height: Math.max(12, flow.count * scale)
    }));

    const adjustedTotalHeight = destinations.reduce((sum, flow) => sum + flow.height, 0) + gap * Math.max(destinations.length - 1, 0);
    const startY = Math.max(chartTop, (innerHeight - adjustedTotalHeight) / 2);

    let currentDestY = startY;
    let currentSourceY = startY;
    const linkData = destinations.map((flow) => {
      const sourceHeight = flow.height;
      const link = {
        ...flow,
        sourceX,
        targetX,
        sourceY: currentSourceY,
        targetY: currentDestY,
        sourceMidY: currentSourceY + sourceHeight / 2,
        targetMidY: currentDestY + flow.height / 2,
        sourceHeight,
        targetHeight: flow.height
      };
      currentSourceY += sourceHeight;
      currentDestY += flow.height + gap;
      return link;
    });

    const sourceNode = {
      x: sourceX - nodeWidth,
      y: startY,
      width: nodeWidth,
      height: chartHeight,
      fill: source.colors.soft,
      label: source.shortName,
      fullName: source.name
    };

    const svg = d3.select(container).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const root = svg.selectAll('g.root').data([null]).join('g')
      .attr('class', 'root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const linkGroup = root.selectAll('g.sankey-links').data([null]).join('g').attr('class', 'sankey-links');
    const nodeGroup = root.selectAll('g.sankey-nodes').data([null]).join('g').attr('class', 'sankey-nodes');
    const labelGroup = root.selectAll('g.sankey-labels').data([null]).join('g').attr('class', 'sankey-labels');

    const tooltip = d3.select(container).selectAll('div.sankey-tooltip').data([null]).join('div')
      .attr('class', 'sankey-tooltip')
      .style('opacity', 0);

    function linkPath(link) {
      const x0 = link.sourceX;
      const x1 = link.targetX;
      const y0 = link.sourceMidY;
      const y1 = link.targetMidY;
      const curve = (x1 - x0) * 0.45;
      return `M${x0},${y0} C${x0 + curve},${y0} ${x1 - curve},${y1} ${x1},${y1}`;
    }

    const links = linkGroup.selectAll('path.sankey-link').data(linkData, (d) => `${d.fromRound}-${d.toCandidateId}`);

    links.join(
      (enter) => enter.append('path')
        .attr('class', 'sankey-link')
        .attr('fill', 'none')
        .attr('stroke-linecap', 'round')
        .attr('stroke-opacity', 0.68)
        .attr('stroke', (d) => d.record.colors.soft)
        .attr('stroke-width', 0)
        .attr('d', (d) => linkPath(d))
        .on('mouseenter', function (event, d) {
          d3.select(this).attr('stroke', d.record.colors.dark).attr('stroke-opacity', 0.95);
          tooltip.style('opacity', 1).html(`
            <strong>${source.name} → ${d.record.name}</strong><br/>
            ${formatNumber(d.count)} ballots<br/>
            ${formatPercent(d.count / data.total)} of redistributed ballots
          `);
        })
        .on('mousemove', function (event) {
          const bounds = container.getBoundingClientRect();
          tooltip
            .style('left', `${event.clientX - bounds.left + 14}px`)
            .style('top', `${event.clientY - bounds.top - 18}px`);
        })
        .on('mouseleave', function (event, d) {
          d3.select(this).attr('stroke', d.record.colors.soft).attr('stroke-opacity', 0.68);
          tooltip.style('opacity', 0);
        })
        .call((enter) => enter.transition().duration(850).ease(d3.easeCubicInOut)
          .attr('stroke-width', (d) => Math.max(10, d.targetHeight))),
      (update) => update,
      (exit) => exit.transition().duration(350).attr('stroke-width', 0).remove()
    )
      .interrupt()
      .transition().duration(850).ease(d3.easeCubicInOut)
      .attr('stroke', (d) => d.record.colors.soft)
      .attr('stroke-width', (d) => Math.max(10, d.targetHeight))
      .attr('d', (d) => linkPath(d));

    const destinationNodes = linkData.map((link) => ({
      key: `${link.toCandidateId}`,
      x: targetX,
      y: link.targetY,
      width: nodeWidth,
      height: link.targetHeight,
      fill: link.record.colors.soft,
      stroke: link.record.colors.dark,
      label: link.record.shortName,
      count: link.count,
      share: link.count / data.total,
      side: 'right'
    }));

    const nodeData = [
      {
        key: `source-${data.sourceId}`,
        x: sourceNode.x,
        y: sourceNode.y,
        width: sourceNode.width,
        height: sourceNode.height,
        fill: sourceNode.fill,
        stroke: source.colors.dark,
        label: source.shortName,
        count: data.total,
        share: 1,
        side: 'left'
      },
      ...destinationNodes
    ];

    const nodes = nodeGroup.selectAll('rect.sankey-node').data(nodeData, (d) => d.key);
    nodes.join(
      (enter) => enter.append('rect')
        .attr('class', 'sankey-node')
        .attr('rx', 8)
        .attr('ry', 8)
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y)
        .attr('width', (d) => d.width)
        .attr('height', 0)
        .attr('fill', (d) => d.fill)
        .attr('stroke', (d) => d.stroke)
        .attr('stroke-width', 1.2)
        .attr('fill-opacity', 0.95)
        .call((enter) => enter.transition().duration(850).ease(d3.easeCubicInOut)
          .attr('height', (d) => d.height)),
      (update) => update,
      (exit) => exit.transition().duration(350).attr('height', 0).remove()
    )
      .interrupt()
      .transition().duration(850).ease(d3.easeCubicInOut)
      .attr('x', (d) => d.x)
      .attr('y', (d) => d.y)
      .attr('height', (d) => d.height)
      .attr('fill', (d) => d.fill)
      .attr('stroke', (d) => d.stroke);

    const labels = labelGroup.selectAll('g.sankey-label-group').data(nodeData, (d) => d.key);
    const labelsEnter = labels.join(
      (enter) => {
        const group = enter.append('g').attr('class', 'sankey-label-group');
        group.append('text').attr('class', 'sankey-label-title');
        group.append('text').attr('class', 'sankey-label-meta');
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );

    labelsEnter
      .interrupt()
      .transition().duration(850).ease(d3.easeCubicInOut)
      .attr('transform', (d) => {
        const x = d.side === 'left' ? d.x - 16 : d.x + d.width + 14;
        const y = d.y + d.height / 2 - 6;
        return `translate(${x},${y})`;
      });

    labelsEnter.select('text.sankey-label-title')
      .attr('text-anchor', (d) => d.side === 'left' ? 'end' : 'start')
      .attr('fill', '#0f172a')
      .attr('font-size', 13)
      .attr('font-weight', 700)
      .text((d) => d.label);

    labelsEnter.select('text.sankey-label-meta')
      .attr('text-anchor', (d) => d.side === 'left' ? 'end' : 'start')
      .attr('y', 18)
      .attr('fill', '#4b5563')
      .attr('font-size', 12.5)
      .text((d) => d.side === 'left' ? formatNumber(d.count) : `${formatPercent(d.share)} · ${formatNumber(d.count)}`);
  }

  onMount(() => {
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
    draw();
    return () => resizeObserver.disconnect();
  });

  $effect(() => {
    if (!hasInitializedTransferIndex && availableRounds.length) {
      selectedTransferIndex = getInitialTransferIndex();
      hasInitializedTransferIndex = true;
    }
  });

  $effect(() => {
    if (availableRounds.length) {
      selectedTransferIndex = Math.max(0, Math.min(selectedTransferIndex, availableRounds.length - 1));
    }
    draw();
  });
</script>

{#if displayData}
  {@const source = candidateRecord(displayData.sourceId)}
  <div class="transfer-sankey-block">
    <div class="section-heading transfer-heading">
      <h3>Where do the eliminated ballots go?</h3>
      <p class="transfer-copy">Use the controls below to step through each elimination and see where those ballots flow next.</p>
    </div>

    <div class="round-controls transfer-round-controls">
      <button onclick={() => selectedTransferIndex = Math.max(0, selectedTransferIndex - 1)} disabled={selectedTransferIndex === 0}>Previous transfer</button>
      <label>
        <span>Transfer round {selectedTransferIndex + 1} of {availableRounds.length}</span>
        <input type="range" min="0" max={Math.max(availableRounds.length - 1, 0)} step="1" bind:value={selectedTransferIndex} />
      </label>
      <button onclick={() => selectedTransferIndex = Math.min(availableRounds.length - 1, selectedTransferIndex + 1)} disabled={selectedTransferIndex === availableRounds.length - 1}>Next transfer</button>
    </div>

    <p class="transfer-round-detail transfer-round-detail-below">Round {displayData.displayRound} sends <strong>{source.name}</strong> ballots to the next available ranked candidate — or into the exhausted pile if no continuing choice remains.</p>

    <div class="chart-frame sankey-frame">
      <div bind:this={container} class="transfer-sankey-canvas"></div>
    </div>
  </div>
{/if}
