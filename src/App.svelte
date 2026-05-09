<svelte:options runes={true} />
<script>
  import { onMount } from 'svelte';
  import FptpMajorityChart from './components/FptpMajorityChart.svelte';
  import NaderScenarioChart from './components/NaderScenarioChart.svelte';
  import RankingDepthChart from './components/RankingDepthChart.svelte';
  import MostCommonRankings from './components/MostCommonRankings.svelte';
  import RcvRoundChart from './components/RcvRoundChart.svelte';
  import AlaskaRoundMap from './components/AlaskaRoundMap.svelte';
  import HeadToHeadSelector from './components/HeadToHeadSelector.svelte';
  import ApprovalSimulation from './components/ApprovalSimulation.svelte';
  import ballotImage from '../images/ballot.png';
import approvalVotingImage from '../images/approval_voting.png';
import starVotingImage from '../images/star_voting.png';
  import TransferSankey from './components/TransferSankey.svelte';
  import PolarizationSimulation from './components/PolarizationSimulation.svelte';
  import { loadContestData, loadContestIndex } from './lib/data.js';
  import { formatNumber, formatPercent } from './lib/format.js';

  let contests = $state([]);
  let contestData = $state(null);
  let selectedRoundIndex = $state(0);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      contests = await loadContestIndex();
      const firstContest = contests[0];
      if (firstContest) {
        contestData = await loadContestData(firstContest.file);
        selectedRoundIndex = 0;
      }
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  const currentContest = $derived(contests[0] ?? null);
  const candidateLookup = $derived(new Map((contestData?.candidates ?? []).map((candidate) => [candidate.id, candidate])));
  const rounds = $derived(contestData?.rcv?.rounds ?? []);
  const currentRound = $derived(rounds[selectedRoundIndex] ?? null);
</script>

<svelte:head>
  <title>Same Ballots, Different Algorithms</title>
  <meta name="description" content="Interactive Svelte + D3 explorable explanation of Alaska 2022 ranked-choice ballots." />
</svelte:head>

{#if loading}
  <main class="page-shell"><p>Loading processed contest data…</p></main>
{:else if error}
  <main class="page-shell">
    <h1>Data not ready yet</h1>
    <p>{error}</p>
    <p>Run <code>npm run preprocess</code> in the project folder before starting the dev server.</p>
  </main>
{:else if contestData}
  <main class="page-shell">
    <section class="hero">
      <h1>Same Ballots, Different Algorithms</h1>
      <p class="subtitle">An interactive look at Alaska’s 2022 special U.S. House ranked-choice election</p>
      <div class="hero-meta">
        <div><strong>Contest:</strong> {currentContest?.name}</div>
        <div><strong>Ballots processed:</strong> {formatNumber(contestData.ballotCount)}</div>
      </div>
    </section>

    <section class="story-section prose-section">
      <p>In recent American presidential elections, both the Democratic and Republican parties have run candidates who failed to garner majority support in the national popular vote. In the <a href="https://en.wikipedia.org/wiki/2016_United_States_presidential_election" target="_blank" rel="noreferrer">2016 election</a> and the <a href="https://en.wikipedia.org/wiki/2024_United_States_presidential_election" target="_blank" rel="noreferrer">2024 election</a>, no candidate crossed the 50% threshold, and in 2016 Donald Trump won the presidency despite losing the national popular vote to Hillary Clinton.<sup><a id="ref-fn1" href="#fn1">1</a></sup></p>

      <p>The winning candidates are not especially popular once in office, either. During his first term, Donald Trump frequently crossed <a href="https://ropercenter.cornell.edu/presidential-approval/" target="_blank" rel="noreferrer"> 60% disapproval in his polls</a>. On the other side of the aisle, Joe Biden — despite winning <a href="https://en.wikipedia.org/wiki/2020_United_States_presidential_election" target="_blank" rel="noreferrer">51.3% of the national popular vote in 2020</a> — saw his net approval turn negative by Labor Day 2021 and stay there for the rest of his presidency, leaving office with a 55.8% disapproval rating per <a href="https://www.natesilver.net/p/why-biden-failed" target="_blank" rel="noreferrer">Silver Bulletin</a>. As of May 1, 2026, <a href="https://www.pewresearch.org/politics/2026/05/01/trump-loses-ground-on-several-personal-traits-as-approval-rating-slips/" target="_blank" rel="noreferrer">Pew Research Center</a> found Trump’s approval at just 34%, the lowest mark of his second term so far, with a 17-point negative swing among his own 2024 voters.</p> 

      <p>The growing discontent with elected officials among prospective voters has sparked some interest in alternative voting methods to the <a href="https://en.wikipedia.org/wiki/First-past-the-post_voting" target="_blank" rel="noreferrer">first-past-the-post (FPTP)</a> system used in statewide and local races. FPTP, also called plurality voting, ensures that the candidate with the greatest number of votes in a given race wins the election, regardless of whether that candidate is selected by most (i.e., over 50% of) voters. In presidential elections, all of a state’s electoral votes are typically conveyed to the candidate who wins a plurality of votes in that state. <sup><a id="ref-fn2" href="#fn2">2</a></sup></p>

      <p>It is easy to see how that structure can fail to elect broadly acceptable candidates. In a field of three or more candidates, a plurality winner can take office with well under 50% of the vote. By definition, that means most voters preferred someone else as their first choice.</p>

      <p>One particularly egregious example of this was in the <a href="https://commonslibrary.parliament.uk/research-briefings/cbp-10009/" target="_blank" rel="noreferrer">2024 UK general election</a>, where Labour won a commanding 411 seat majority — a 211-seat gain — despite winning just 33.7% of the popular vote. In other words, nearly two-thirds of voters would have preferred a party other than Labour as their first choice, yet Labour still secured an overwhelming landslide victory.</p>

      <FptpMajorityChart />

      <p>Importantly, no one party had especially broad support in that election, but this reflects several common complaints about FPTP systems.</p>

      <ol>
        <li>FPTP elections tend to consolidate around just two viable candidates (typically the historically dominant party duopoly), while third party alternatives that receive sizable support are essentially rendered unviable. As such, voters are disincentivized from voting for candidates outside the two duopoly frontrunners. This phenomenon is known as <a href="https://en.wikipedia.org/wiki/Duverger%27s_law" target="_blank" rel="noreferrer">Duverger’s law</a>.</li>
        <li>In FPTP elections where the winner is decided by a very narrow margin, third party candidates that are ideologically similar to one of the two frontrunners can siphon votes from that viable candidate, causing the more ideologically dissimilar candidate to win the election. This is known as the <a href="https://en.wikipedia.org/wiki/Spoiler_effect" target="_blank" rel="noreferrer">spoiler effect</a>. It’s often argued that in the <a href="https://en.wikipedia.org/wiki/2000_United_States_presidential_election_in_Florida" target="_blank" rel="noreferrer">2000 US presidential election in Florida</a>, Green Party candidate Ralph Nader was a spoiler. Republican George W. Bush won the state by just 537 votes over Democrat Al Gore, but Nader received 97,488 votes, many of which could have gone to fellow left-leaning candidate Al Gore and sent him to the White House.</li>
      </ol>

      <NaderScenarioChart />

      <ol start="3">
        <li>FPTP systems do not allow voters to express support for multiple candidates, nor do they allow voters to express how much they prefer one candidate relative to another.</li>
      </ol>

      <p>Failure (3), in particular, has fostered an appetite for alternative voting mechanisms. This has led to the rise of <a href="https://en.wikipedia.org/wiki/Ranked-choice_voting_in_the_United_States" target="_blank" rel="noreferrer">ranked-choice voting (RCV)</a> across several municipal and state elections across the United States. In theory, RCV purports to solve the issues associated with two-party consolidation in FPTP by giving voters a richer way to express support while reducing pressure to abandon less viable candidates. Advocacy groups for electoral reform such as <a href="https://fairvote.org/our-reforms/ranked-choice-voting/" target="_blank" rel="noreferrer">FairVote</a> argue that this helps voters maintain both strategic flexibility and conscience. RCV recently drew renewed national attention with the <a href="https://en.wikipedia.org/wiki/2025_New_York_City_Democratic_mayoral_primary" target="_blank" rel="noreferrer">2025 New York City Democratic mayoral primary</a>, where Democratic Socialist Zohran Mamdani pulled off an upset victory over former New York governor Andrew Cuomo en route to an eventual general election victory.</p>

      <p>In this data story, I use public Cast Vote Record data from another prominent RCV election, the 2022 Alaska special election for the US House of Representatives, to explain how ranked-choice voting works, and to explore some of its limitations.</p>

    </section>

    <section class="story-section prose-section">
      <div class="section-heading">
        <h2><strong>How does Ranked Choice Voting Work? An Alaska Case Study</strong></h2>
      </div>

      <p>With the death of 49-year congressional incumbent Don Young in early 2022, Alaska held a <a href="https://en.wikipedia.org/wiki/2022_Alaska%27s_at-large_congressional_district_special_election">special election</a> for their at-large district later that year to fill the vacant seat. Former state representative Mary Peltola, former governor Sarah Palin, and businessman Nick Begich III<sup><a id="ref-fn3" href="#fn3">3</a></sup> all stood for election.</p>

      <p>What made this particular race high-profile though was that it was Alaska’s first ever ranked-choice election. Rather than selecting just one candidate per ballot, voters got to rank their preferred candidates from 1 to 3, with an option to write-in a fourth candidate.</p>

      <figure class="article-inline-figure">
        <img src={ballotImage} alt="Alaska ranked-choice ballot" loading="lazy" decoding="async" />
      </figure>

      <p>The new ranked-choice system seemed to be encouraging more expressiveness among the electorate: over 72% of Alaskan voters ranked more than one candidate on their ballot. At the same time, many ballots remained relatively shallow. Over a third of voters, about 34%, stopped short of ranking more than two candidates, and just 5.3% of voters ranked all four candidates.</p>

      <div class="callout-row">
        <div class="callout-card">
          <div class="callout-label">First-choice leader</div>
          <div class="callout-value">{candidateLookup.get(contestData.firstChoiceTotals[0]?.candidateId)?.name}</div>
        </div>
        <div class="callout-card">
          <div class="callout-label">Average ranking depth</div>
          <div class="callout-value">{contestData.averageRankingDepth.toFixed(2)}</div>
        </div>
        <div class="callout-card">
          <div class="callout-label">Fully ranked ballots</div>
          <div class="callout-value">{formatPercent(contestData.rankingDepthDistribution.find((d) => d.depth === currentContest?.numRanks)?.share ?? 0)}</div>
        </div>
      </div>
      <RankingDepthChart data={contestData.rankingDepthDistribution} />

      <p>The modal rankings help make sense of this pattern. Among voters who ranked only one candidate, the most common choice was Palin alone, suggesting that her supporters were less likely to indicate fallback preferences (Palin-or-bust, so to speak). Among voters who provided deeper rankings, Palin appears consistently in the lowest-ranked position, while the most common two- and three-candidate ballots pair Peltola and Begich at the top. Taken together, this suggests that Palin was the most polarizing candidate in the field. It also highlights a broader feature of ranked-choice elections: when voters do not rank additional candidates, their ballots can become <b>"exhausted"</b> once their top choices are eliminated, meaning they no longer play a role in determining the final outcome.</p>

      <MostCommonRankings patterns={contestData.mostCommonRankingsByDepth} {candidateLookup} />
    </section>

    <section class="story-section prose-section">
      <p>That all being said, the question remains: how do votes actually get allocated round by round under ranked-choice voting?</p>

      <p>In each round, the candidate with the fewest active votes is eliminated. Ballots for that candidate are then transferred to the next-ranked candidate who is still in the race. If a voter did not rank any remaining candidate, that ballot becomes exhausted and no longer counts toward the active total in later rounds. This process continues until one candidate wins a majority of the active continuing ballots.</p>

      <p>The interactive exhibit below demonstrates this reallocation mechanism. After each round, the lowest-ranked candidate is eliminated and their ballots are redistributed according to the next available preference on each ballot. In round 2, for example, we see Nick Begich get eliminated; in this dataset, 50.4% of his ballots (27,190) transfer to Sarah Palin, 28.8% (15,507) transfer to Mary Peltola, and 20.8% (11,204) become exhausted because they do not list another continuing candidate.</p>

      <div class="round-controls">
        <button onclick={() => selectedRoundIndex = Math.max(0, selectedRoundIndex - 1)} disabled={selectedRoundIndex === 0}>Previous round</button>
        <label>
          <span>Round {selectedRoundIndex + 1} of {rounds.length}</span>
          <input type="range" min="0" max={Math.max(rounds.length - 1, 0)} step="1" bind:value={selectedRoundIndex} />
        </label>
        <button onclick={() => selectedRoundIndex = Math.min(rounds.length - 1, selectedRoundIndex + 1)} disabled={selectedRoundIndex === rounds.length - 1}>Next round</button>
      </div>

      {#if currentRound}
        <div class="round-summary">
          <div><strong>Active ballots:</strong> {formatNumber(currentRound.activeBallots)}</div>
          <div><strong>Exhausted:</strong> {formatNumber(currentRound.exhausted)}</div>
          <div><strong>{currentRound.eliminatedCandidateId ? 'Eliminated this round:' : currentRound.winnerCandidateId ? 'Final-round loser:' : 'Eliminated this round:'}</strong> {currentRound.eliminatedCandidateId ? candidateLookup.get(currentRound.eliminatedCandidateId)?.name : currentRound.winnerCandidateId ? currentRound.tallies.find((entry) => entry.candidateId !== currentRound.winnerCandidateId)?.name ?? 'No opponent remaining' : 'No elimination'}</div>
        </div>
      {/if}

      <RcvRoundChart {rounds} roundIndex={selectedRoundIndex} transferFlows={contestData.rcv.transferFlows} {candidateLookup} />

      <TransferSankey flows={contestData.rcv.transferFlows} {rounds} roundIndex={selectedRoundIndex} {candidateLookup} />
    </section>

    <section class="story-section prose-section">
      <p>One way to see these transfers more clearly is to look at how they play out geographically. The map below shows which candidate is leading in each precinct at a given round, with color indicating the leader and opacity indicating the size of that lead among active ballots.</p>

      <AlaskaRoundMap geography={contestData.geography} geographyFile={contestData.geographyFile} {candidateLookup} />

      <p>From Round 1 to Round 2, very little changes at the precinct level. The only flip is in the northernmost precinct of Browerville, which moves from a write-in lead to a Peltola lead after the write-in candidates are eliminated. This is a small precinct with fewer than 300 active ballots in the first round, so the shift reflects a localized reallocation rather than a broader change in the statewide pattern.</p>

      <p>The more meaningful changes occur between Round 2 and Round 3, when Begich is eliminated and his votes are redistributed. Many precincts that had been narrowly led by Begich shifted toward Peltola, including places like Wainwright, Atqasuk, Anaktuvuk Pass, Sleetmute, and Tatitlek. A smaller number of Begich-leaning precincts flip to Palin, such as South Tongass and Sheep Mountain. At the same time, precincts that were already majority-Palin tend to remain so, often with larger margins after absorbing Begich’s voters. The dominant pattern is not a wholesale realignment, but a set of targeted shifts driven by where Begich’s support was concentrated and how those voters ranked their next choices.</p>
    </section>

    <section class="story-section prose-section">
      <div class="section-heading">
        <h2>What RCV Fixes and What It Misses</h2>
      </div>

      <p>So far, we’ve looked at the ways ranked-choice voting works <i>mechanically</i>, and some descriptive statistics of how a ranked-choice election has played out historically.</p>

      <p>However, the question of whether ranked-choice voting is a "good" electoral system still lingers.</p>

      <p>How do we judge the "goodness" of an electoral system? <a href="https://plato.stanford.edu/entries/social-choice/" target="_blank" rel="noreferrer">Social choice theorists</a>, who study collective decision-making problems like elections, posit that a given electoral mechanism can satisfy some set of social choice <i>criteria</i> that we as humans might deem desirable.</p>

      <p>Ranked-choice voting, in particular, satisfies some social choice criteria that first-past-the-post fails. While both satisfy the majority criterion — a candidate who wins over 50% of the vote will always win an RCV or FPTP election — RCV also satisfies the majority-loser criterion. If a majority of voters rank a candidate last, that candidate should not win. This is an important improvement over plurality voting, where a polarizing candidate can win with a narrow first-choice plurality even if most voters strongly prefer someone else.</p>

      <p>At the same time, RCV still does not satisfy every appealing criterion. Most importantly for the Alaska special election, it can fail the <b>Condorcet criterion</b>, meaning it can elect someone other than the candidate who would beat every other candidate head-to-head.</p>

      <p>Let’s take a look at this Condorcet failure in action. Mary Peltola was able to eke out a final-round win after Nick Begich was eliminated in the penultimate round of transfers, but if the election had been a head-to-head matchup between Peltola and Begich, then <b>Begich would have won the election</b>. A majority of voters ranked Begich ahead of Peltola on their ballots, and Begich would have defeated every other candidate in a head-to-head matchup, making him the Condorcet winner.</p>

      <p>Sarah Palin, on the other hand, would have lost head-to-head matchups to both Begich and Peltola. Even so, her presence in the race helped split the conservative vote in the early rounds, leaving Begich in third place and causing him to be eliminated before his broader support could matter. This phenomenon is known as <a href="https://en.wikipedia.org/wiki/Center_squeeze" target="_blank" rel="noreferrer">center squeeze</a>, where a broadly acceptable middle candidate gets eliminated because they lack enough first-choice support, while more polarizing candidates survive by holding stronger first-choice bases. In this election, RCV did not elect the Condorcet loser<sup><a id="ref-fn4" href="#fn4">4</a></sup>, but it also did not elect the Condorcet winner since Palin played spoiler and center squeezed Begich.</p>

      <HeadToHeadSelector pairwise={contestData.pairwise} {candidateLookup} />

      <p>The Alaska election is not just an isolated example. The same pattern can arise whenever a broadly acceptable candidate faces two candidates with stronger, more polarized bases of support.</p>

      <div class="article-exhibit">
        <div class="article-exhibit-heading">
          <p class="article-exhibit-label">Interactive exhibit</p>
        </div>
        <PolarizationSimulation />
      </div>

      <p>Even in the balanced simulation, where most voters cluster near the center and the moderate candidate is preferred in every head-to-head comparison, the middle candidate does not always win under RCV. In our runs, Mr. Moderate is the Condorcet winner in all 100 simulations, yet he still loses in a small number of cases due to the order in which candidates are eliminated. These cases are rare in a simple three-candidate setting, but they are not pathological; they arise naturally when first-choice support is split in a way that pushes the broadly acceptable candidate into third place early.</p>

      <p>When we shift to a more polarized electorate, however, this pattern becomes much more pronounced. Even though Mr. Moderate remains the Condorcet winner in almost every simulation, he is almost always eliminated before the final round, and RCV frequently elects one of the more ideologically extreme candidates instead. As voters cluster into opposing blocs, candidates with strong, concentrated bases are more likely to survive early rounds, while compromise candidates struggle to accumulate enough first-choice support to stay in contention. This dynamic mirrors broader trends in the American electorate, where partisan polarization has increased substantially in recent decades (<a href="https://www.pewresearch.org/politics/2014/06/12/political-polarization-in-the-american-public/" target="_blank" rel="noreferrer">Pew Research Center, 2014</a>). In this setting, RCV does not eliminate the effects of polarization; in some cases, it can amplify them by privileging intensity of first-choice support over breadth of overall acceptability, making center squeeze more common.</p>

      <p>RCV also does not necessarily make alternative candidates more salient. In the Alaska special election, the race still centered on three major candidates: Peltola, Begich, and Palin. The write-in option attracted little support, which may partly reflect the difficulty of organizing around unnamed candidates<sup><a id="ref-fn5" href="#fn5">5</a></sup>, but the <a href="https://en.wikipedia.org/wiki/2022_United_States_House_of_Representatives_election_in_Alaska" target="_blank" rel="noreferrer">November 2022 Alaska House election</a> points in the same direction. Even with Libertarian Chris Bye on the ballot, the contest again consolidated around Peltola, Begich, and Palin, with Bye eliminated early and Peltola winning after another split on the right. New York City offers a similar example at the municipal level. Its <a href="https://en.wikipedia.org/wiki/2025_New_York_City_Democratic_mayoral_primary" target="_blank" rel="noreferrer">2025 Democratic mayoral primary</a> had a wide field, but the ranked-choice count ultimately narrowed into a final matchup between Zohran Mamdani and Andrew Cuomo.<sup><a id="ref-fn6" href="#fn6">6</a></sup> RCV gives voters more room to express backup preferences, but it does not by itself guarantee that third-party or alternative candidates become viable.</p>

      <p>More broadly, the Condorcet failures in RCV elections connect to a deeper result in social choice theory known as <a href="https://en.wikipedia.org/wiki/Arrow%27s_impossibility_theorem" target="_blank" rel="noreferrer">Arrow’s impossibility theorem</a>. One of the conditions in Arrow’s framework is the <i>independence of irrelevant alternatives</i>, which says that the relative ranking between two candidates should not depend on the presence of a third candidate. In practice, this condition is very difficult to satisfy. In the Alaska election, the presence of Palin changed the outcome between Begich and Peltola, even though Begich would have beaten Peltola in a direct comparison. The outcome depends not only on how voters compare Begich and Peltola, but also on how their support is distributed across all candidates in the early rounds.</p>

      <p>This has implications for strategic behavior as well. Ranked-choice voting does not satisfy the <a href="https://en.wikipedia.org/wiki/Non-negative_responsiveness" target="_blank" rel="noreferrer">monotonicity criterion</a>, meaning that ranking a candidate higher can sometimes hurt their chances of winning. In a race like this one, voters who prefer a broadly acceptable candidate like Begich may have an incentive to rank him lower or vote strategically to prevent early elimination. These kinds of dynamics are closely related to the <i>Condorcet paradox</i>, where collective preferences can become cyclic even when individual preferences are consistent.</p>

      <p>These problems are not unique to Alaska, or even to RCV. Arrow’s theorem shows that any ranked voting system with three or more candidates will eventually have to give up at least one appealing fairness condition. That doesn’t mean all voting systems are equally flawed, but it does mean that the choice of voting system is partly a choice about which tradeoffs we are willing to accept.</p>
    </section>

    <section class="story-section prose-section">
      <div class="section-heading">
        <h2>Same ballots, different rules</h2>
      </div>

      <p>So far, we’ve treated ranked-choice voting as the natural way to interpret ranked ballots. But the ballots themselves do not dictate a single outcome. The same set of voter preferences can be aggregated in multiple ways, each emphasizing a different notion of what it means to "win."</p>

      <p>Ranked-choice voting is just one such method. It prioritizes first-choice support and resolves the election through a sequence of eliminations. As we’ve seen, this can sometimes come at the expense of broadly acceptable candidates, especially in polarized electorates.</p>

      <p>This raises a natural question: is there a way to preserve voter expressiveness while avoiding some of these failure modes?</p>

      <p>One alternative is <b>approval voting</b>, a system in which voters are not asked to rank candidates, but instead to <b>approve of as many candidates as they find acceptable</b>. The candidate with the most approvals wins.</p>

      <figure class="article-inline-figure">
        <img src={approvalVotingImage} alt="Illustration of approval voting" loading="lazy" decoding="async" />
      </figure>

      <p>This seemingly simple change has several important implications. First, it allows voters to express support for multiple candidates without forcing a tradeoff between them; approving of one candidate does not diminish support for another. Second, because voters can support more than one option, elections are less likely to collapse around two frontrunners in the same way as plurality or elimination-based systems. Third, approval voting operates outside the framework of ranked aggregation, and therefore avoids the specific constraints imposed by Arrow’s impossibility theorem.</p>

      <p>To see how this works in practice, we can revisit the same simulated electorates as before. Instead of ranking candidates, voters now approve of all candidates within some ideological distance of their own position. We then tally approvals and elect the candidate with the broadest support.</p>

      <div class="article-exhibit">
        <div class="article-exhibit-heading">
          <p class="article-exhibit-label">Interactive exhibit</p>
        </div>
        <ApprovalSimulation />
      </div>

      <p>Of course, approval voting is not without its own tradeoffs. It does not guarantee the election of the Condorcet winner, and outcomes can depend on how voters choose their approval thresholds. It also introduces strategic considerations: voters may be tempted to approve only their favorite candidate (a "<a href="https://en.wikipedia.org/wiki/Bullet_voting" target="_blank" rel="noreferrer">bullet vote</a>") or to withhold approval from viable competitors.</p>

      <p>However, these incentives differ in an important way from those in ranked-choice systems. Under approval voting, supporting an additional acceptable candidate can never harm your preferred candidate directly, which creates a more permissive environment for expressing broad support and coalition-building. In contrast, in RCV, ranking a compromise candidate highly can sometimes contribute to their early elimination or alter transfer dynamics in ways that disadvantage similar candidates.</p>

      <p>One extension of this idea is <b>STAR voting</b> (<a href="https://en.wikipedia.org/wiki/STAR_voting" target="_blank" rel="noreferrer">Score Then Automatic Runoff</a>), where voters assign each candidate a numerical score rather than a binary approval. This increases expressiveness by allowing voters to indicate degrees of preference, while still aggregating support in a way that emphasizes broadly acceptable candidates.</p>

      <figure class="article-inline-figure">
        <img src={starVotingImage} alt="Illustration of STAR voting" loading="lazy" decoding="async" />
      </figure>
    </section>

    <section class="story-section prose-section">
      <div class="section-heading">
        <h2>Where this leaves us</h2>
      </div>

      <p>No voting system is perfect. Each encodes a different set of tradeoffs about how individual preferences are translated into collective decisions. What systems like approval voting and ranked-choice voting offer, however, is a way to move beyond the limitations of first-past-the-post, which often forces voters into narrow, strategic choices and can produce outcomes that fail to reflect the electorate’s broader preferences.</p>

      <p>The choice of voting system ultimately shapes the incentives voters face, the strategies candidates adopt, and the kinds of outcomes that emerge. As we’ve seen, even with the same underlying ballots, different rules can lead to very different winners.</p>
    </section>

    <section class="story-section prose-section footnotes-section">
      <div class="section-heading">
        <h2>Footnotes</h2>
      </div>
      <div class="footnotes">
        <p id="fn1"><sup>1</sup> It should be noted that US presidents are elected via the Electoral College rather than by direct popular vote. In 2016, Trump won the Electoral College while losing the national popular vote. In 2024, he won the Electoral College and the national popular vote plurality but still fell short of an outright majority. <a class="footnote-backref" href="#ref-fn1" aria-label="Back to reference">↩</a></p>
        <p id="fn2"><sup>2</sup> Though in principle, this need not be the case; there is no requirement that all electoral votes must go to the popular vote winner in that state. Notably, Nebraska and Maine apportion one electoral vote to the winner of each congressional district, and two to the overall state winner. Additionally, the existence of faithless electors means that a state’s electoral votes may go to any candidate of that elector’s choosing (see: <a href="https://en.wikipedia.org/wiki/2016_United_States_presidential_election#Electoral_results">the 2016 election</a>). <a class="footnote-backref" href="#ref-fn2" aria-label="Back to reference">↩</a></p>
        <p id="fn3"><sup>3</sup> Nick Begich III is the grandson of former Alaska senator and congressional representative Nick Begich, Sr., who was also incidentally Don Young's predecessor. The Begich family is one of the most <a href="https://www.cato.org/blog/dynastic-politics-alaska" target="_blank" rel="noreferrer"> prominent political dynasties in Alaska</a>. <a class="footnote-backref" href="#ref-fn3" aria-label="Back to reference">↩</a></p>
        <p id="fn4"><sup>4</sup> Technically, Palin is not a Condorcet loser if write-in candidates are included as a fourth option, since write-in support was sparse and difficult to interpret as a single coherent candidate bloc. In the effective three-candidate field of Peltola, Begich, and Palin, however, Palin loses head-to-head to both major opponents, making her the effective Condorcet loser. <a class="footnote-backref" href="#ref-fn4" aria-label="Back to reference">↩</a></p>
        <p id="fn5"><sup>5</sup> Although Alaska is no stranger to highly successful write-in campaigns (see: <a href="https://en.wikipedia.org/wiki/2010_United_States_Senate_election_in_Alaska" target="_blank" rel="noreferrer">Lisa Murkowski's 2010 election to the US Senate</a>). <a class="footnote-backref" href="#ref-fn5" aria-label="Back to reference">↩</a></p>
        <p id="fn6"><sup>6</sup> In fact, Cuomo probably played spoiler and <a href="https://x.com/PoliticalKiwi/status/1947847745576047055?s=20" target="_blank" rel="noreferrer">center squeezed Brad Lander.</a> <a class="footnote-backref" href="#ref-fn6" aria-label="Back to reference">↩</a></p>
      </div>
    </section>
  </main>
{/if}
