<svelte:options runes={true} />
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { formatNumber } from '../lib/format.js';

  let { pairwise = null, candidateLookup = new Map() } = $props();

  let container;
  let tooltip;
  let width = 720;
  const height = 520;
  const margin = { top: 120, right: 24, bottom: 24, left: 120 };

  function showTooltip(event, cell) {
    if (!tooltip || cell.rowId === cell.colId) return;
    tooltip.style.opacity = '1';
    tooltip.style.left = `${event.offsetX + 18}px`;
    tooltip.style.top = `${event.offsetY + 18}px`;
    tooltip.innerHTML = `
      <strong>${cell.rowName}</strong> over <strong>${cell.colName}</strong><br>
      ${formatNumber(cell.rowVotes)} to ${formatNumber(cell.colVotes)}<br>
      Compared on ${formatNumber(cell.considered)} ballots
    `;
  }

  function hideTooltip() {
    if (tooltip) tooltip.style.opacity = '0';
  }

  function draw() {
    if (!container || !pairwise?.matrix?.length) return;

    const candidates = pairwise.candidates.map((candidate) => ({
      ...candidate,
      name: candidateLookup.get(candidate.id)?.name ?? candidate.name
    }));

    const cells = [];
    pairwise.matrix.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        cells.push({
          ...cell,
          rowId: candidates[rowIndex].id,
          colId: candidates[colIndex].id,
          rowName: candidates[rowIndex].name,
          colName: candidates[colIndex].name
        });
      });
    });

    width = Math.max(360, container.clientWidth || width);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const root = svg.selectAll('g.root').data([null]).join('g')
      .attr('class', 'root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const names = candidates.map((d) => d.name);
    const x = d3.scaleBand().domain(names).range([0, innerWidth]).padding(0.04);
    const y = d3.scaleBand().domain(names).range([0, innerHeight]).padding(0.04);

    const maxMargin = d3.max(cells, (d) => Math.abs(d.margin)) || 1;
    const color = d3.scaleDiverging([-maxMargin, 0, maxMargin], d3.interpolateRdBu);

    root.selectAll('g.x-axis').data([null]).join('g')
      .attr('class', 'x-axis')
      .call(d3.axisTop(x))
      .selectAll('text')
      .attr('transform', 'rotate(-35)')
      .style('text-anchor', 'start');

    root.selectAll('g.y-axis').data([null]).join('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y));

    root.selectAll('rect.cell').data(cells, (d) => `${d.rowId}-${d.colId}`)
      .join('rect')
      .attr('class', 'cell')
      .attr('x', (d) => x(d.colName) || 0)
      .attr('y', (d) => y(d.rowName) || 0)
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .attr('rx', 6)
      .attr('fill', (d) => (d.rowId === d.colId ? '#e2e8f0' : color(d.margin)))
      .on('pointermove', (event, d) => showTooltip(event, d))
      .on('pointerleave', hideTooltip);

    root.selectAll('text.cell-label').data(cells, (d) => `${d.rowId}-${d.colId}`)
      .join('text')
      .attr('class', 'cell-label')
      .attr('x', (d) => (x(d.colName) || 0) + x.bandwidth() / 2)
      .attr('y', (d) => (y(d.rowName) || 0) + y.bandwidth() / 2 + 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', '#0f172a')
      .text((d) => (d.rowId === d.colId ? '—' : formatNumber(d.rowVotes)));
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

<div class="chart-frame heatmap-wrap" bind:this={container}>
  <div class="tooltip" bind:this={tooltip}></div>
</div>
