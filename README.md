# Public URL: https://alaska-rcv-datastory.netlify.app/

# Same Ballots, Different Algorithms

An interactive data story exploring how voting systems shape electoral outcomes, built for DATA 31500 Assignment 3.

---

## Overview

This project is an **explorable explanation** of ranked-choice voting (RCV) and alternative electoral systems, centered on the 2022 Alaska special U.S. House election.

The core idea is simple:

> **The same ballots can produce different winners depending on how they are counted.**

Using real cast vote record (CVR) data and interactive simulations, this project shows how different aggregation rules—RCV, pairwise comparisons, and approval voting—can lead to very different interpretations of voter preferences.

---

## Concept

Most discussions of voting systems treat ballots as fixed and outcomes as inevitable.

This project challenges that intuition by showing that:

- Voting systems are **algorithms**, not neutral procedures  
- Different systems prioritize different notions of “support”  
- The same electorate can produce different winners under different rules  

The Alaska 2022 special election provides a concrete case where:

- The RCV winner differs from the **Condorcet winner**
- A broadly acceptable candidate is eliminated early (**center squeeze**)
- Polarization interacts with electoral rules in non-obvious ways  

---

## What the article includes

### Real election data
- First-choice vote distributions  
- Ballot ranking depth  
- Round-by-round RCV transfers  
- Precinct-level geographic patterns  

### Social choice analysis
- Condorcet winner vs RCV winner  
- Pairwise head-to-head comparisons  
- Center squeeze dynamics  
- Connections to Arrow’s impossibility theorem  

### Interactive simulations
- 1D ideological voter models  
- Balanced vs polarized electorates  
- RCV outcomes under different conditions  
- Approval voting comparison  

### Comparative systems
- Ranked-choice voting (RCV)
- Pairwise (Condorcet-style) interpretation
- Approval voting
- Discussion of STAR voting as an extension  

---

## Tech stack

- **Svelte** – UI and article structure  
- **D3.js** – custom interactive visualizations  
- **Vite** – build tooling  
- **Netlify** – deployment  

The project is designed as an **interactive article**, not a dashboard, with tightly integrated narrative and visuals.

---

## Project structure

```
scripts/
preprocess-election.js # Preprocess raw CVR data

src/
components/ # Reusable D3 visual components
lib/ # Data loading + formatting helpers
App.svelte # Main interactive article

public/
data/ # Processed JSON data served to frontend
```
---

## Data

- Source: <a href="https://www.elections.alaska.gov/election-results/e/?id=22sspg">Alaska Division of Elections (2022 Special U.S. House Election)</a>
- Data type: Cast Vote Records (CVR)
- Preprocessing:
  - Cleaning rankings
  - Constructing pairwise comparisons
  - Computing RCV rounds
  - Generating simulation inputs  

---

## License

For academic use as part of DATA 31500.  
Feel free to fork or build on this for educational purposes.

---

## Author

Arnav Gurudatt
