<svelte:options runes={true} />
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import { formatNumber, formatPercent } from '../lib/format.js';

  let { data = [] } = $props();

  let container;
  let width = 720;
  const height = 280;
  const margin = { top: 20, right: 20, bottom: 40, left: 56 };

  function draw() {
    if (!container || !data?.length) return;

    width = Math.max(320, container.clientWidth || width);
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).selectAll('svg').data([null]).join('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', height);

    const root = svg.selectAll('g.root').data([null]).join('g').attr('class', 'root')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(data.map((d) => String(d.depth)))
      .range([0, innerWidth])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, (d) => d.count) || 0])
      .nice()
      .range([innerHeight, 0]);

    root.selectAll('g.x-axis').data([null]).join('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x));

    root.selectAll('g.y-axis').data([null]).join('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y).ticks(5).tickFormat((d) => d3.format('~s')(d)));

    const bars = root.selectAll('rect.depth-bar').data(data, (d) => d.depth);

    bars.join(
      (enter) => enter.append('rect')
        .attr('class', 'depth-bar')
        .attr('x', (d) => x(String(d.depth)) || 0)
        .attr('width', x.bandwidth())
        .attr('y', innerHeight)
        .attr('height', 0)
        .attr('rx', 8)
        .attr('fill', '#7c3aed')
        .on('mouseenter', function () {
          d3.select(this).interrupt().transition().duration(120).attr('fill', '#5b21b6');
        })
        .on('mouseleave', function () {
          d3.select(this).interrupt().transition().duration(120).attr('fill', '#7c3aed');
        })
        .call((enter) => enter.transition().duration(600)
          .attr('y', (d) => y(d.count))
          .attr('height', (d) => innerHeight - y(d.count))),
      (update) => update
        .attr('fill', '#7c3aed')
        .on('mouseenter', function () {
          d3.select(this).interrupt().transition().duration(120).attr('fill', '#5b21b6');
        })
        .on('mouseleave', function () {
          d3.select(this).interrupt().transition().duration(120).attr('fill', '#7c3aed');
        })
        .call((update) => update.transition().duration(600)
        .attr('x', (d) => x(String(d.depth)) || 0)
        .attr('width', x.bandwidth())
        .attr('y', (d) => y(d.count))
        .attr('height', (d) => innerHeight - y(d.count))),
      (exit) => exit.remove()
    );

    const labels = root.selectAll('text.depth-label').data(data, (d) => d.depth);
    labels.join('text')
      .attr('class', 'depth-label')
      .attr('text-anchor', 'middle')
      .attr('x', (d) => (x(String(d.depth)) || 0) + x.bandwidth() / 2)
      .attr('y', (d) => y(d.count) - 8)
      .text((d) => `${formatPercent(d.share)} · ${formatNumber(d.count)}`)
      .attr('fill', '#312e81')
      .attr('font-size', 11);
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
