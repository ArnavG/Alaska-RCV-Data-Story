<svelte:options runes={true} />
<script>
  import { geoConicEqualArea, geoPath, interpolateLab, select, zoom, zoomIdentity } from 'd3';
  import { formatNumber, formatPercent } from '../lib/format.js';
  import { getCandidateMeta } from '../lib/candidateMeta.js';

  let { geography, geographyFile = '/data/alaska-precincts-slim.geojson', candidateLookup = new Map() } = $props();

  let svgElement = $state();
  let wrapElement = $state();
  let features = $state([]);
  let geoError = $state('');
  let tooltip = $state({ visible: false, x: 0, y: 0, title: '', lines: [] });
  let geometryLoaded = $state(false);
  let mapRoundIndex = $state(0);
  let selectedLegendCandidateId = $state(218);

  const width = 920;
  const height = 700;

  let svgSelection = null;
  let zoomBehavior = null;

  const rounds = $derived(geography?.rounds ?? []);
  const hasRoundData = $derived(rounds.length > 0);
  const currentRound = $derived(rounds[mapRoundIndex] ?? null);
  const visiblePrecincts = $derived((currentRound?.precincts ?? []).filter((precinct) => precinct.isStandardPrecinct));
  const omittedPrecincts = $derived((currentRound?.precincts ?? []).filter((precinct) => !precinct.isStandardPrecinct));
  const precinctByKey = $derived(new Map(visiblePrecincts.map((precinct) => [precinct.mapKey, precinct])));
  const remainingCandidates = $derived((currentRound?.remainingCandidateIds ?? []).map((candidateId) => candidateLookup.get(candidateId)).filter(Boolean));
  const selectedLegendCandidate = $derived(remainingCandidates.find((candidate) => candidate.id === selectedLegendCandidateId) ?? candidateLookup.get(selectedLegendCandidateId) ?? remainingCandidates[0] ?? null);
  const selectedLegendMeta = $derived(selectedLegendCandidate ? getCandidateMeta(selectedLegendCandidate) : null);
  const legendGradientStyle = $derived(selectedLegendMeta ? `background: linear-gradient(90deg, ${rgba(selectedLegendMeta.colors.soft, 0.18)} 0%, ${rgba(selectedLegendMeta.colors.soft, 0.42)} 35%, ${rgba(selectedLegendMeta.colors.soft, 0.68)} 70%, ${rgba(selectedLegendMeta.colors.dark, 0.92)} 100%);` : '');
  const omittedBallots = $derived(omittedPrecincts.reduce((sum, precinct) => sum + precinct.totalBallots, 0));
  const roundCount = $derived(rounds.length);

  function normalizePrecinctName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function withCacheBust(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${Date.now()}`;
  }

  function reverseRing(ring) {
    return [...ring].reverse();
  }

  function scanLongitudeSpan(coords, accumulator = { min: Infinity, max: -Infinity }) {
    if (!Array.isArray(coords)) return accumulator;
    if (typeof coords[0] === 'number') {
      accumulator.min = Math.min(accumulator.min, coords[0]);
      accumulator.max = Math.max(accumulator.max, coords[0]);
      return accumulator;
    }
    for (const part of coords) scanLongitudeSpan(part, accumulator);
    return accumulator;
  }

  function unwrapDatelineCoordinates(coords) {
    if (!Array.isArray(coords)) return coords;
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords;
      return [lon > 0 ? lon - 360 : lon, lat];
    }
    return coords.map(unwrapDatelineCoordinates);
  }

  function normalizeGeometry(feature) {
    if (!feature?.geometry) return feature;

    let coordinates = feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates.map(reverseRing)
      : feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates.map((polygon) => polygon.map(reverseRing))
        : feature.geometry.coordinates;

    const longitudeSpan = scanLongitudeSpan(coordinates);
    if (longitudeSpan.max - longitudeSpan.min > 300) {
      coordinates = unwrapDatelineCoordinates(coordinates);
    }

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates
      }
    };
  }

  function normalizeFeature(feature) {
    return {
      ...normalizeGeometry(feature),
      mapKey: normalizePrecinctName(feature.properties?.Precinct_Name)
    };
  }

  function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    const full = normalized.length === 3
      ? normalized.split('').map((value) => value + value).join('')
      : normalized;
    const int = Number.parseInt(full, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255
    };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getPrecinctState(feature) {
    const precinct = precinctByKey.get(feature.mapKey);
    if (!precinct) {
      return {
        fill: '#f3f4f6',
        hoverFill: '#d1d5db',
        opacity: 1,
        stroke: '#ffffff',
        precinct: null
      };
    }

    if (!precinct.leaderCandidateId) {
      return {
        fill: '#9ca3af',
        hoverFill: '#6b7280',
        opacity: 0.45,
        stroke: '#ffffff',
        precinct
      };
    }

    const candidate = candidateLookup.get(precinct.leaderCandidateId);
    const meta = getCandidateMeta(candidate);
    return {
      fill: meta.colors.soft,
      hoverFill: meta.colors.dark,
      opacity: Math.max(0.38, precinct.leaderShare || 0),
      stroke: '#ffffff',
      precinct
    };
  }

  function hideTooltip() {
    tooltip = { ...tooltip, visible: false };
  }

  function showTooltip(event, feature) {
    const precinct = precinctByKey.get(feature.mapKey);
    const rect = wrapElement?.getBoundingClientRect();
    const x = rect ? event.clientX - rect.left + 14 : 0;
    const y = rect ? event.clientY - rect.top + 14 : 0;

    if (!precinct) {
      tooltip = {
        visible: true,
        x,
        y,
        title: feature.properties?.Precinct_Name || 'Unmatched precinct',
        lines: ['No matched CVR precinct totals in the processed data.']
      };
      return;
    }

    const leaderName = precinct.leaderCandidateId
      ? getCandidateMeta(candidateLookup.get(precinct.leaderCandidateId)).displayName
      : 'Tie / no leader';

    const tallies = precinct.tallies
      .filter((entry) => entry.votes > 0)
      .map((entry) => {
        const candidate = candidateLookup.get(entry.candidateId);
        const meta = getCandidateMeta(candidate);
        return `${meta.displayName}: ${formatNumber(entry.votes)} (${formatPercent(entry.share)})`;
      });

    tooltip = {
      visible: true,
      x,
      y,
      title: precinct.precinctName,
      lines: [
        `Leader: ${leaderName}`,
        `Active ballots: ${formatNumber(precinct.activeBallots)}`,
        `Exhausted: ${formatNumber(precinct.exhausted)}`,
        ...tallies
      ]
    };
  }

  function handleMouseEnter(event, feature) {
    showTooltip(event, feature);
    const state = getPrecinctState(feature);
    select(event.currentTarget)
      .interrupt()
      .attr('fill', state.hoverFill)
      .attr('stroke-width', 0.9);
  }

  function handleMouseMove(event, feature) {
    showTooltip(event, feature);
  }

  function handleMouseLeave(event, feature) {
    hideTooltip();
    const state = getPrecinctState(feature);
    select(event.currentTarget)
      .interrupt()
      .attr('fill', state.fill)
      .attr('fill-opacity', state.opacity)
      .attr('stroke-width', 0.5);
  }

  function setupZoom() {
    if (!svgElement) return;
    svgSelection = select(svgElement);
    const viewport = svgSelection.select('.map-viewport');

    zoomBehavior = zoom()
      .scaleExtent([1, 8])
      .translateExtent([[-200, -200], [width + 200, height + 200]])
      .extent([[0, 0], [width, height]])
      .on('zoom', (event) => {
        viewport.attr('transform', event.transform);
      });

    svgSelection.call(zoomBehavior).on('dblclick.zoom', null);
  }

  function zoomIn() {
    if (svgSelection && zoomBehavior) {
      svgSelection.transition().duration(250).call(zoomBehavior.scaleBy, 1.35);
    }
  }

  function zoomOut() {
    if (svgSelection && zoomBehavior) {
      svgSelection.transition().duration(250).call(zoomBehavior.scaleBy, 1 / 1.35);
    }
  }

  function resetZoom() {
    if (svgSelection && zoomBehavior) {
      svgSelection.transition().duration(300).call(zoomBehavior.transform, zoomIdentity);
    }
  }

  function previousMapRound() {
    mapRoundIndex = Math.max(0, mapRoundIndex - 1);
  }

  function nextMapRound() {
    mapRoundIndex = Math.min(roundCount - 1, mapRoundIndex + 1);
  }

  function selectLegendCandidate(candidateId) {
    selectedLegendCandidateId = candidateId;
  }

  function renderMap() {
    if (!svgElement || !features.length || !hasRoundData) return;

    const projection = geoConicEqualArea()
      .rotate([154, 0])
      .center([0, 63])
      .parallels([55, 65])
      .fitExtent([[8, 8], [width - 8, height - 8]], {
        type: 'FeatureCollection',
        features
      });

    const pathGenerator = geoPath(projection);
    const svg = select(svgElement);
    const layer = svg.select('.precinct-layer');

    layer
      .selectAll('path')
      .data(features, (feature) => feature.mapKey)
      .join(
        (enter) => enter
          .append('path')
          .attr('d', pathGenerator)
          .attr('fill', '#f3f4f6')
          .attr('fill-opacity', 1)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 0.5)
          .style('cursor', 'pointer')
          .on('mouseenter', handleMouseEnter)
          .on('mousemove', handleMouseMove)
          .on('mouseleave', handleMouseLeave),
        (update) => update.attr('d', pathGenerator)
      )
      .transition()
      .duration(700)
      .attrTween('fill', function (feature) {
        const nextFill = getPrecinctState(feature).fill;
        const previousFill = select(this).attr('fill') || nextFill;
        const interpolator = interpolateLab(previousFill, nextFill);
        return (t) => interpolator(t);
      })
      .attrTween('fill-opacity', function (feature) {
        const nextOpacity = getPrecinctState(feature).opacity;
        const previousOpacity = Number(select(this).attr('fill-opacity') || nextOpacity);
        return (t) => previousOpacity + (nextOpacity - previousOpacity) * t;
      })
      .attr('stroke', (feature) => getPrecinctState(feature).stroke)
      .attr('stroke-width', 0.5);
  }

  async function fetchGeojsonWithFallback() {
    const candidateUrls = Array.from(new Set([
      geographyFile,
      '/data/alaska-precincts-slim.geojson'
    ].filter(Boolean)));

    let lastError = 'Unable to load Alaska precinct GeoJSON.';

    for (const url of candidateUrls) {
      try {
        const response = await fetch(withCacheBust(url), {
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) {
          lastError = `Unable to load map geometry from ${url}`;
          continue;
        }

        const text = await response.text();
        if (text.trim().startsWith('<')) {
          lastError = `Map geometry request returned HTML instead of GeoJSON at ${url}`;
          continue;
        }

        const geojson = JSON.parse(text);
        return { geojson, url };
      } catch (error) {
        lastError = error.message;
      }
    }

    throw new Error(lastError);
  }

  let lastLoadedUrl = null;

  $effect(() => {
    if (mapRoundIndex > Math.max(roundCount - 1, 0)) {
      mapRoundIndex = Math.max(roundCount - 1, 0);
    }
  });

  $effect(() => {
    if (remainingCandidates.length && !remainingCandidates.some((candidate) => candidate.id === selectedLegendCandidateId)) {
      selectedLegendCandidateId = remainingCandidates.some((candidate) => candidate.id === 218) ? 218 : remainingCandidates[0].id;
    }
  });

  $effect(() => {
    geometryLoaded;
    currentRound;
    precinctByKey;
    if (features.length && hasRoundData) renderMap();
  });

  $effect(() => {
    if (geometryLoaded && svgElement && !zoomBehavior) {
      setupZoom();
    }
  });

  $effect(() => {
    const targetUrl = geographyFile || '/data/alaska-precincts-slim.geojson';
    if (lastLoadedUrl === targetUrl || geometryLoaded) return;

    let cancelled = false;
    geoError = '';

    fetchGeojsonWithFallback()
      .then(({ geojson, url }) => {
        if (cancelled) return;
        features = (geojson.features || []).map(normalizeFeature);
        lastLoadedUrl = url;
        geometryLoaded = true;
      })
      .catch((error) => {
        if (cancelled) return;
        geoError = error.message;
      });

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="map-section">
  <div class="map-meta-row">
    <div>
      <div class="map-title">Round {mapRoundIndex + 1}: who leads each mapped precinct?</div>
      <p class="map-note">Color shows the current leader in each precinct. Opacity shows how large that lead is among active ballots in that round.</p>
    </div>
    <div class="map-legend-block">
      <div class="map-legend-title">Color key</div>
      <div class="map-legend">
        {#each remainingCandidates as candidate (candidate.id)}
          {@const meta = getCandidateMeta(candidate)}
          <button class:legend-chip-selected={candidate.id === selectedLegendCandidateId} class="legend-chip legend-chip-button" onclick={() => selectLegendCandidate(candidate.id)}>
            <span class="legend-swatch" style={`background:${meta.colors.soft}`}></span>
            <span>{meta.displayName}</span>
          </button>
        {/each}
      </div>
      {#if selectedLegendMeta}
        <div class="map-opacity-key gradient-key">
          <span class="map-opacity-label">{selectedLegendMeta.displayName} lead strength</span>
          <div class="map-gradient-wrap">
            <div class="map-gradient-bar" style={legendGradientStyle}></div>
            <div class="map-gradient-labels">
              <span>Narrower lead</span>
              <span>Stronger lead</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="map-toolbar">
    <div class="map-round-controls">
      <button onclick={previousMapRound} disabled={mapRoundIndex === 0}>Previous round</button>
      <span>Round {mapRoundIndex + 1} of {roundCount}</span>
      <button onclick={nextMapRound} disabled={mapRoundIndex === roundCount - 1}>Next round</button>
    </div>
    <div class="map-zoom-controls" aria-label="Map zoom controls">
      <span class="map-zoom-label">Zoom</span>
      <button onclick={zoomIn} aria-label="Zoom in">+</button>
      <button onclick={zoomOut} aria-label="Zoom out">−</button>
      <button onclick={resetZoom}>Reset</button>
    </div>
  </div>

  {#if !hasRoundData}
    <p class="map-note">Loading precinct-level round data…</p>
  {:else if geoError}
    <p>{geoError}</p>
  {:else}
    <div class="map-frame" bind:this={wrapElement}>
      <svg bind:this={svgElement} viewBox={`0 0 ${width} ${height}`} aria-label="Alaska precinct leader map">
        <g class="map-viewport">
          <g class="precinct-layer"></g>
        </g>
      </svg>
      {#if tooltip.visible}
        <div class="map-tooltip" style={`left:${tooltip.x}px; top:${tooltip.y}px;`}>
          <strong>{tooltip.title}</strong>
          {#each tooltip.lines as line}
            <div>{line}</div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="map-caption-grid">
    <div class="map-caption-card">
      <div class="map-caption-label">Mapped precincts</div>
      <div class="map-caption-value">{formatNumber(visiblePrecincts.length)}</div>
    </div>
    <div class="map-caption-card">
      <div class="map-caption-label">Omitted non-precinct buckets</div>
      <div class="map-caption-value">{formatNumber(omittedPrecincts.length)}</div>
    </div>
    <div class="map-caption-card">
      <div class="map-caption-label">Ballots outside polygon map</div>
      <div class="map-caption-value">{formatNumber(omittedBallots)}</div>
    </div>
  </div>

  <p class="map-note small">Absentee, early-voting, and overseas ballot buckets are kept in the tabulation data but omitted from the precinct map because they do not correspond to standard precinct polygons.</p>
</div>
