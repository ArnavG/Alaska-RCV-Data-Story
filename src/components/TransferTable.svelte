<svelte:options runes={true} />
<script>
  import { formatNumber } from '../lib/format.js';

  let { flows = [], candidateLookup = new Map() } = $props();

  function candidateName(candidateId) {
    if (candidateId === 'exhausted') return 'Exhausted ballots';
    return candidateLookup.get(candidateId)?.name ?? `Candidate ${candidateId}`;
  }
</script>

<div class="transfer-table-wrap">
  <table class="transfer-table">
    <thead>
      <tr>
        <th>Round</th>
        <th>Eliminated</th>
        <th>Destination</th>
        <th>Ballots</th>
      </tr>
    </thead>
    <tbody>
      {#each flows as flow}
        <tr>
          <td>{flow.fromRound} → {flow.toRound}</td>
          <td>{candidateName(flow.fromCandidateId)}</td>
          <td>{candidateName(flow.toCandidateId)}</td>
          <td>{formatNumber(flow.count)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
