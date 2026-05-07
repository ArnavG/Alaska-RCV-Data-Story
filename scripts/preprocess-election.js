import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputDir = path.join(projectRoot, 'data', 'CVR_Export_20220908084311');
const outputDir = path.join(projectRoot, 'public', 'data');
const contestOutputDir = path.join(outputDir, 'contests');

const candidatePalette = {
  215: '#8E63B8',
  218: '#4F7DE2',
  217: '#EF4444',
  214: '#F2A900'
};

const fallbackPalette = ['#4f46e5', '#0f766e', '#f97316', '#dc2626', '#7c3aed', '#0891b2'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function contestSlug(contest) {
  return `contest-${contest.id}.json`;
}

function choosePrototypeContests(contests, candidatesByContest) {
  return contests
    .filter((contest) => contest.NumOfRanks > 1)
    .filter((contest) => (candidatesByContest.get(contest.Id) || []).length >= 3)
    .map((contest, index) => ({
      id: contest.Id,
      name: contest.Description,
      numRanks: contest.NumOfRanks,
      colorSeed: index
    }));
}

function extractRankings(contestMarks) {
  const earliestRankByCandidate = new Map();
  const marksByRank = new Map();

  for (const mark of contestMarks || []) {
    if (!mark?.CandidateId || !mark?.Rank || mark.IsAmbiguous) continue;

    const currentRank = earliestRankByCandidate.get(mark.CandidateId);
    if (currentRank && currentRank <= mark.Rank) continue;
    earliestRankByCandidate.set(mark.CandidateId, mark.Rank);
  }

  for (const [candidateId, rank] of earliestRankByCandidate.entries()) {
    const current = marksByRank.get(rank) || [];
    current.push(candidateId);
    marksByRank.set(rank, current);
  }

  return Array.from(marksByRank.entries())
    .filter(([, candidateIds]) => candidateIds.length === 1)
    .map(([rank, candidateIds]) => ({ rank: Number(rank), candidateId: candidateIds[0] }))
    .sort((a, b) => a.rank - b.rank);
}

function findPreferredCandidate(rankings, remainingCandidates) {
  for (const entry of rankings) {
    if (remainingCandidates.has(entry.candidateId)) return entry.candidateId;
  }
  return null;
}

function simulateRcv(ballots, candidates) {
  const remaining = new Set(candidates.map((candidate) => candidate.id));
  const rounds = [];
  const transferFlows = [];

  while (remaining.size > 1) {
    const allocations = new Map();
    const tallies = new Map();
    let exhausted = 0;

    for (const ballot of ballots) {
      const assigned = findPreferredCandidate(ballot.rankings, remaining);
      allocations.set(ballot.ballotId, assigned);
      if (assigned === null) {
        exhausted += 1;
      } else {
        tallies.set(assigned, (tallies.get(assigned) || 0) + 1);
      }
    }

    const activeBallots = ballots.length - exhausted;
    const tallyRows = candidates.map((candidate) => ({
      candidateId: candidate.id,
      name: candidate.name,
      color: candidate.color,
      votes: tallies.get(candidate.id) || 0,
      eliminated: !remaining.has(candidate.id)
    }));

    const continuingRows = tallyRows.filter((row) => remaining.has(row.candidateId));
    continuingRows.sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

    const winner = continuingRows.find((row) => row.votes > activeBallots / 2);
    if (winner) {
      rounds.push({
        round: rounds.length + 1,
        activeBallots,
        exhausted,
        winnerCandidateId: winner.candidateId,
        eliminatedCandidateId: null,
        remainingCandidateIds: [...remaining],
        tallies: continuingRows
      });
      break;
    }

    const eliminated = [...continuingRows].sort((a, b) => a.votes - b.votes || a.name.localeCompare(b.name))[0];
    rounds.push({
      round: rounds.length + 1,
      activeBallots,
      exhausted,
      winnerCandidateId: null,
      eliminatedCandidateId: eliminated.candidateId,
      remainingCandidateIds: [...remaining],
      tallies: continuingRows
    });

    const nextRemaining = new Set(remaining);
    nextRemaining.delete(eliminated.candidateId);

    for (const ballot of ballots) {
      if (allocations.get(ballot.ballotId) !== eliminated.candidateId) continue;
      const nextChoice = findPreferredCandidate(ballot.rankings, nextRemaining);
      transferFlows.push({
        fromRound: rounds.length,
        toRound: rounds.length + 1,
        fromCandidateId: eliminated.candidateId,
        toCandidateId: nextChoice ?? 'exhausted',
        count: 1
      });
    }

    remaining.delete(eliminated.candidateId);
  }

  if (remaining.size === 1 && !rounds.at(-1)?.winnerCandidateId) {
    const winnerCandidateId = [...remaining][0];
    const tallies = candidates
      .filter((candidate) => remaining.has(candidate.id))
      .map((candidate) => ({
        candidateId: candidate.id,
        name: candidate.name,
        color: candidate.color,
        votes: ballots.filter((ballot) => findPreferredCandidate(ballot.rankings, remaining) === candidate.id).length,
        eliminated: false
      }));

    const exhausted = ballots.filter((ballot) => findPreferredCandidate(ballot.rankings, remaining) === null).length;
    rounds.push({
      round: rounds.length + 1,
      activeBallots: ballots.length - exhausted,
      exhausted,
      winnerCandidateId,
      eliminatedCandidateId: null,
      remainingCandidateIds: [...remaining],
      tallies
    });
  }

  const condensedFlows = Array.from(
    transferFlows.reduce((accumulator, flow) => {
      const key = `${flow.fromRound}-${flow.toRound}-${flow.fromCandidateId}-${flow.toCandidateId}`;
      accumulator.set(key, { ...flow, count: (accumulator.get(key)?.count || 0) + 1 });
      return accumulator;
    }, new Map()).values()
  ).sort((a, b) => a.fromRound - b.fromRound || b.count - a.count);

  return {
    winnerCandidateId: rounds.at(-1)?.winnerCandidateId ?? null,
    rounds,
    transferFlows: condensedFlows
  };
}

function computePairwise(ballots, candidates) {
  const candidateIds = candidates.map((candidate) => candidate.id);
  const matrix = candidateIds.map((rowId) => candidateIds.map((colId) => ({
    rowCandidateId: rowId,
    colCandidateId: colId,
    rowVotes: 0,
    colVotes: 0,
    considered: 0,
    margin: 0
  })));

  const positionMaps = ballots.map((ballot) => {
    const positions = new Map();
    ballot.rankings.forEach((entry, index) => positions.set(entry.candidateId, index));
    return positions;
  });

  candidateIds.forEach((rowId, rowIndex) => {
    candidateIds.forEach((colId, colIndex) => {
      if (rowId === colId) return;
      let rowVotes = 0;
      let colVotes = 0;
      let considered = 0;

      for (const positions of positionMaps) {
        const rowPos = positions.get(rowId);
        const colPos = positions.get(colId);
        const rowRanked = rowPos !== undefined;
        const colRanked = colPos !== undefined;

        if (!rowRanked && !colRanked) continue;
        considered += 1;

        if (rowRanked && !colRanked) {
          rowVotes += 1;
        } else if (!rowRanked && colRanked) {
          colVotes += 1;
        } else if (rowPos < colPos) {
          rowVotes += 1;
        } else if (colPos < rowPos) {
          colVotes += 1;
        }
      }

      matrix[rowIndex][colIndex] = {
        rowCandidateId: rowId,
        colCandidateId: colId,
        rowVotes,
        colVotes,
        considered,
        margin: rowVotes - colVotes
      };
    });
  });

  const condorcetWinnerId = candidates.find((candidate, rowIndex) => candidateIds.every((otherId, colIndex) => {
    if (candidate.id === otherId) return true;
    return matrix[rowIndex][colIndex].rowVotes > matrix[rowIndex][colIndex].colVotes;
  }))?.id ?? null;

  return {
    candidates,
    matrix,
    condorcetWinnerId
  };
}

function computeBordaWinner(ballots, candidates, numRanks) {
  const scores = new Map(candidates.map((candidate) => [candidate.id, 0]));

  for (const ballot of ballots) {
    for (const ranking of ballot.rankings) {
      const points = Math.max(numRanks - ranking.rank, 0);
      scores.set(ranking.candidateId, (scores.get(ranking.candidateId) || 0) + points);
    }
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function getFirstChoiceTotals(ballots, candidates) {
  return candidates
    .map((candidate) => ({
      candidateId: candidate.id,
      count: ballots.filter((ballot) => ballot.rankings[0]?.candidateId === candidate.id).length,
      name: candidate.name,
      color: candidate.color
    }))
    .sort((a, b) => b.count - a.count);
}

function getRankingDepthDistribution(ballots, maxDepth) {
  const total = ballots.length || 1;
  return d3Range(1, maxDepth + 1).map((depth) => {
    const count = ballots.filter((ballot) => ballot.rankings.length === depth).length;
    return { depth, count, share: count / total };
  });
}

function getMostCommonRankingsByDepth(ballots, maxDepth) {
  return d3Range(1, maxDepth + 1).map((depth) => {
    const depthBallots = ballots.filter((ballot) => ballot.rankings.length === depth);
    const patternCounts = new Map();

    for (const ballot of depthBallots) {
      const candidateIds = ballot.rankings.map((entry) => entry.candidateId);
      const key = candidateIds.join('>');
      const current = patternCounts.get(key) || { candidateIds, count: 0 };
      current.count += 1;
      patternCounts.set(key, current);
    }

    const mostCommon = [...patternCounts.values()].sort((a, b) => b.count - a.count || a.candidateIds.join('-').localeCompare(b.candidateIds.join('-')))[0];

    return {
      depth,
      count: mostCommon?.count || 0,
      shareOfDepth: depthBallots.length ? (mostCommon?.count || 0) / depthBallots.length : 0,
      candidateIds: mostCommon?.candidateIds || []
    };
  });
}

function d3Range(start, stop) {
  const values = [];
  for (let value = start; value < stop; value += 1) values.push(value);
  return values;
}

function normalizePrecinctName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isStandardPrecinctBucket(precinct) {
  return /^\d{2}-\d{3}/.test(precinct?.ExternalId || '') || /^\d{2}-\d{3}/.test(precinct?.Description || '');
}

function computeRoundGeography(ballots, candidates, rcv, precinctPortionsById) {
  const allCandidateIds = new Set(candidates.map((candidate) => candidate.id));
  const rounds = rcv.rounds.map((round) => {
    const remaining = new Set(round.remainingCandidateIds || [...allCandidateIds]);
    const precinctBuckets = new Map();

    for (const ballot of ballots) {
      const precinct = precinctPortionsById.get(ballot.precinctPortionId) || null;
      const precinctPortionId = ballot.precinctPortionId ?? 'unknown';
      const key = String(precinctPortionId);
      const precinctName = precinct?.Description || 'Unknown precinct bucket';
      const externalId = precinct?.ExternalId || null;
      const assignedCandidateId = findPreferredCandidate(ballot.rankings, remaining);

      if (!precinctBuckets.has(key)) {
        precinctBuckets.set(key, {
          precinctPortionId,
          precinctName,
          externalId,
          mapKey: normalizePrecinctName(precinctName),
          isStandardPrecinct: isStandardPrecinctBucket(precinct),
          totalBallots: 0,
          activeBallots: 0,
          exhausted: 0,
          tallies: new Map()
        });
      }

      const bucket = precinctBuckets.get(key);
      bucket.totalBallots += 1;

      if (assignedCandidateId === null) {
        bucket.exhausted += 1;
      } else {
        bucket.activeBallots += 1;
        bucket.tallies.set(assignedCandidateId, (bucket.tallies.get(assignedCandidateId) || 0) + 1);
      }
    }

    const precincts = Array.from(precinctBuckets.values()).map((bucket) => {
      const tallies = candidates
        .filter((candidate) => remaining.has(candidate.id))
        .map((candidate) => {
          const votes = bucket.tallies.get(candidate.id) || 0;
          return {
            candidateId: candidate.id,
            votes,
            share: bucket.activeBallots ? votes / bucket.activeBallots : 0
          };
        })
        .sort((a, b) => b.votes - a.votes || a.candidateId - b.candidateId);

      const leaderVotes = tallies[0]?.votes ?? 0;
      const tiedLeaders = tallies.filter((entry) => entry.votes === leaderVotes && leaderVotes > 0);
      const leaderCandidateId = tiedLeaders.length === 1 ? tiedLeaders[0].candidateId : null;

      return {
        precinctPortionId: bucket.precinctPortionId,
        precinctName: bucket.precinctName,
        externalId: bucket.externalId,
        mapKey: bucket.mapKey,
        isStandardPrecinct: bucket.isStandardPrecinct,
        totalBallots: bucket.totalBallots,
        activeBallots: bucket.activeBallots,
        exhausted: bucket.exhausted,
        leaderCandidateId,
        leaderVotes,
        leaderShare: bucket.activeBallots ? leaderVotes / bucket.activeBallots : 0,
        tallies
      };
    });

    return {
      round: round.round,
      remainingCandidateIds: [...remaining],
      eliminatedCandidateId: round.eliminatedCandidateId,
      winnerCandidateId: round.winnerCandidateId,
      precincts
    };
  });

  const allBuckets = rounds[0]?.precincts || [];
  const omittedBuckets = allBuckets.filter((bucket) => !bucket.isStandardPrecinct).map((bucket) => ({
    precinctPortionId: bucket.precinctPortionId,
    precinctName: bucket.precinctName,
    totalBallots: bucket.totalBallots
  }));

  return {
    rounds,
    summary: {
      precinctBucketCount: allBuckets.length,
      standardPrecinctCount: allBuckets.filter((bucket) => bucket.isStandardPrecinct).length,
      omittedBucketCount: omittedBuckets.length,
      omittedBuckets
    }
  };
}

function roundCoordinates(coordinates, precision = 5) {
  if (!Array.isArray(coordinates)) return coordinates;
  if (typeof coordinates[0] === 'number') {
    return coordinates.map((value) => Number(value.toFixed(precision)));
  }
  return coordinates.map((entry) => roundCoordinates(entry, precision));
}

function slimPrecinctGeojson() {
  const rawGeoPath = path.join(outputDir, 'alaska-precincts.geojson');
  const slimGeoPath = path.join(outputDir, 'alaska-precincts-slim.geojson');

  if (!fs.existsSync(rawGeoPath)) {
    console.warn('Skipping Alaska precinct slim GeoJSON export; raw file not found.');
    return null;
  }

  const rawGeo = readJson(rawGeoPath);
  const slimGeo = {
    type: rawGeo.type,
    features: (rawGeo.features || []).map((feature) => ({
      type: feature.type,
      properties: {
        Precinct_Name: feature.properties?.Precinct_Name || null,
        HouseDistrict: feature.properties?.HouseDistrict || null,
        SenateDistrict: feature.properties?.SenateDistrict || null,
        ElectionRegion: feature.properties?.ElectionRegion || null
      },
      geometry: {
        type: feature.geometry?.type || null,
        coordinates: roundCoordinates(feature.geometry?.coordinates || [])
      }
    }))
  };

  fs.writeFileSync(slimGeoPath, JSON.stringify(slimGeo));
  return '/data/alaska-precincts-slim.geojson';
}

function main() {
  ensureDir(outputDir);
  ensureDir(contestOutputDir);

  const contestManifest = readJson(path.join(inputDir, 'ContestManifest.json')).List;
  const candidateManifest = readJson(path.join(inputDir, 'CandidateManifest.json')).List;
  const partyManifest = readJson(path.join(inputDir, 'PartyManifest.json')).List;
  const precinctPortionManifest = readJson(path.join(inputDir, 'PrecinctPortionManifest.json')).List;

  const partiesById = new Map(partyManifest.map((party) => [party.Id, party.Description]));
  const precinctPortionsById = new Map(precinctPortionManifest.map((precinct) => [precinct.Id, precinct]));
  const candidatesByContest = new Map();
  for (const candidate of candidateManifest) {
    const current = candidatesByContest.get(candidate.ContestId) || [];
    current.push(candidate);
    candidatesByContest.set(candidate.ContestId, current);
  }

  const selectedContests = choosePrototypeContests(contestManifest, candidatesByContest);
  const selectedContestIds = new Set(selectedContests.map((contest) => contest.id));

  const contestStore = new Map(selectedContests.map((contest) => [contest.id, {
    contest,
    ballots: [],
    partyByCandidate: new Map()
  }]));

  const exportFiles = fs.readdirSync(inputDir)
    .filter((file) => /^CvrExport(?:_\d+)?\.json$/.test(file))
    .sort((a, b) => {
      const aMatch = a.match(/_(\d+)\.json$/);
      const bMatch = b.match(/_(\d+)\.json$/);
      const aValue = aMatch ? Number(aMatch[1]) : -1;
      const bValue = bMatch ? Number(bMatch[1]) : -1;
      return aValue - bValue;
    });

  for (const fileName of exportFiles) {
    const exportData = readJson(path.join(inputDir, fileName));
    for (const session of exportData.Sessions || []) {
      const cards = session?.Original?.Cards || [];
      const precinctPortionId = session?.Original?.PrecinctPortionId ?? null;
      for (const card of cards) {
        for (const contest of card.Contests || []) {
          if (!selectedContestIds.has(contest.Id)) continue;
          const rankings = extractRankings(contest.Marks);
          if (!rankings.length) continue;

          const contestEntry = contestStore.get(contest.Id);
          const ballotId = `${session.TabulatorId}_${session.BatchId}_${session.RecordId}_${card.Id}_${contest.Id}`;
          contestEntry.ballots.push({ ballotId, contestId: contest.Id, precinctPortionId, rankings });

          for (const mark of contest.Marks || []) {
            if (!mark?.CandidateId || !mark?.PartyId) continue;
            if (!contestEntry.partyByCandidate.has(mark.CandidateId)) {
              contestEntry.partyByCandidate.set(mark.CandidateId, mark.PartyId);
            }
          }
        }
      }
    }
  }

  const geographyFile = slimPrecinctGeojson();
  const contestIndex = [];

  for (const contest of selectedContests) {
    const contestEntry = contestStore.get(contest.id);
    const candidateRows = (candidatesByContest.get(contest.id) || []).map((candidate, index) => ({
      id: candidate.Id,
      name: candidate.Description,
      type: candidate.Type,
      party: partiesById.get(contestEntry.partyByCandidate.get(candidate.Id)) || 'Unknown / write-in',
      color: candidatePalette[candidate.Id] || fallbackPalette[(contest.colorSeed + index) % fallbackPalette.length]
    }));

    const ballots = contestEntry.ballots;
    const firstChoiceTotals = getFirstChoiceTotals(ballots, candidateRows);
    const rankingDepthDistribution = getRankingDepthDistribution(ballots, contest.numRanks);
    const mostCommonRankingsByDepth = getMostCommonRankingsByDepth(ballots, contest.numRanks);
    const averageRankingDepth = ballots.reduce((sum, ballot) => sum + ballot.rankings.length, 0) / (ballots.length || 1);
    const rcv = simulateRcv(ballots, candidateRows);
    const pairwise = computePairwise(ballots, candidateRows);
    const geography = computeRoundGeography(ballots, candidateRows, rcv, precinctPortionsById);
    const alternativeWinners = {
      pluralityWinnerId: firstChoiceTotals[0]?.candidateId ?? null,
      rcvWinnerId: rcv.winnerCandidateId,
      condorcetWinnerId: pairwise.condorcetWinnerId,
      bordaWinnerId: computeBordaWinner(ballots, candidateRows, contest.numRanks)
    };

    const file = `/data/contests/${contestSlug(contest)}`;
    const payload = {
      contest,
      ballotCount: ballots.length,
      averageRankingDepth,
      candidates: candidateRows,
      firstChoiceTotals,
      rankingDepthDistribution,
      mostCommonRankingsByDepth,
      rcv,
      pairwise,
      geography,
      geographyFile,
      alternativeWinners
    };

    fs.writeFileSync(path.join(projectRoot, 'public', file.replace(/^\//, '')), JSON.stringify(payload, null, 2));
    contestIndex.push({ ...contest, ballotCount: ballots.length, file });
  }

  fs.writeFileSync(path.join(outputDir, 'contests.json'), JSON.stringify(contestIndex, null, 2));
  console.log(`Processed ${contestIndex.length} contests into ${outputDir}`);
}

main();
