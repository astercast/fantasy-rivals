# RESEARCH.md: ground truth for Rivals Fantasy, wave 1

Compiled 2026-10-13/14 (PDT) from live sources read directly during the build, plus a commissioned research pass over Liquipedia. Every fact below names its source. Anything that could not be verified is listed as a gap, not filled in.

## 1. The headline: competition state right now

- **LIVE NOW: Marvel Rivals Ignite 2026, Stage 2.** Group stage began Oct 10, 2026; knockouts from Oct 24; regional grand finals Nov 1, 2026. This is the competition leagues are created for at launch. (Liquipedia, Ignite 2026 Stage 2; Dot Esports Stage 2 coverage.)
- **NEXT: Marvel Rivals Ignite 2026, Grand Finals.** Nov 27 to Dec 6, 2026, Atlanta (DreamHack). The season championship. League creation is open for it in advance. (Liquipedia, Ignite 2026 Grand Finals.)
- **ALSO LIVE, SECOND TIER: Marvel Rivals Pacific Invitational 2026**, Oct 8 to Nov 15, 2026. A separate Pacific circuit below Ignite. Listed on the calendar for completeness; it is not the launch fantasy competition. (Liquipedia, Pacific Invitational 2026.)
- **COMPLETE: Mid-Season Finals**, Aug 11 to 16, 2026, Guangzhou. 100 Thieves beat Natus Vincere 4-1 in the final. (Liquipedia; Esports Insider.)
- **COMPLETE: Stage 1** (spring to summer 2026). Americas champions 100 Thieves (Jun 28), EMEA champions Virtus.pro (Jun 21). (Liquipedia via research pass.)

Series format: best of 5 as standard (first to 3 map wins); regional grand finals best of 7. (Liquipedia.)

## 2. The circuit

Marvel Rivals Ignite is the official pro circuit (NetEase), run as regional stages (Americas, EMEA, Pacific, China) feeding international LANs (Mid-Season Finals, then the Grand Finals). Twelve partner organizations headline the 2026 season: 100 Thieves, FlyQuest, Gen.G Esports, Liquid Citadel, Natus Vincere, NRG Shock, REJECT, Sentinels, Spacestation Gaming, Team Heretics, TSM, Virtus.pro. Non-partner teams qualify through the MCS (Marvel Rivals Championship Series) path. (NetEase partner announcement via Dot Esports and Gamereactor, Feb 2026.)

## 3. Teams and rosters

The seed tracks **51 teams** across the four regions (Dot Esports, "All participating teams in Marvel Rivals Ignite 2026", the participating list for the 2026 field).

**Verified rosters with roles: 17 teams, 104 players**, seeded into the draft pool with a consensus draft rank. Primary source: Esports Insider, "2026 Marvel Rivals Ignite rosters: Americas, EMEA, Pacific, and China" (published Mar 5, 2026, read in full during this build), which lists every player with a role (Vanguard, Duelist, Strategist). Teams covered: 100 Thieves, Sentinels, NRG Shock, Liquid Citadel, NTMR, NAVI, Virtus.pro, Team Peps, FYR Strays, Team Heretics, REJECT, Gen.G Esports, OUG, Aconyx, FL eSports Club, FlyQuest (partial, see conflicts), FURIA (roster per Liquipedia via the research pass).

The remaining 34 teams are in the directory with region and short code, and their pages say the roster is still to be announced. Substitutes named by sources (for example NRG Shock's fraud and Window, Liquid Citadel's Pky) are not in the pool. Players a source lists only as "Flex" with no declared role (Sentinels' mirror, FL's bobok1ng) are held out of the pool until a role is published, because fantasy slots are role-locked.

**Source conflicts, and how they were resolved:**
- FlyQuest vs Liquid Citadel: Esports Insider lists coopertastic, energy and SparkChief on both. Its own reporting says the players moved to Liquid Citadel for 2026, so they are seeded there; FlyQuest keeps the three players no source moved (adios, Veswa, Zelos) and is marked partial.
- RAD Esports: Dot Esports lists RAD in EMEA for Ignite 2026; Esports Insider covered a RAD Americas roster of creators. Seeded as an EMEA team with no players until an Ignite roster is published.
- An early research read listed Shopify Rebellion, ENVY, DarkZero and Team Nemesis in the Americas field. Dot Esports' 2026 participating list and Esports Insider's partner reporting supersede it: Shopify Rebellion is not in Ignite 2026, and ENVY paused its Marvel Rivals division. Neither is seeded.

## 4. Match stats: what exists and where

Liquipedia is the de facto stats record. Its database (LPDB) publishes per-map player lines: eliminations, deaths, assists, damage dealt, damage blocked, healing, plus hero picks. There is no first-party public stats API from NetEase. The scoring engine is therefore built around an import pipeline: results enter through `api/admin/import-results.js`, every payload must name its source, and unresolved team or player references are reported back, never guessed or dropped. Wave 2 work: an LPDB query pass that pulls Stage 2 series and per-map lines into that same import shape.

Note: direct page fetches to liquipedia.net returned 403 from this build environment, so wave-1 roster verification was done from Esports Insider and Dot Esports directly, with Liquipedia facts carried from the research pass and marked as such above.

## 5. The League of Legends fantasy model

Fantasy LCS (Riot's official game, shut down ahead of Spring 2019) is the template, per the user's order. Its published scoring table (2016 and 2017 guides, identical): kill 2, death -0.5, assist 1.5, creep score 0.01 per CS; bonuses for a triple kill (+2), quadra kill (+5) and penta kill (+10), and +2 for a 10+ kill-or-assist game. A "Team" item scored objectives instead of a player: tower 1 each, dragon 1 each, baron 2 each, first blood 2, win 2, and +2 for a win in under 30 minutes (2017 table). Roster shape: five role starters, one Flex, one Team item, three alternates, with at most 2 players at any one position across the roster. League sizes were 4, 6 or 8. Draft: snake (order reverses each round). Format: weekly head-to-head matchups, and the best head-to-head record won the league; no total-points mode appears in the sources (a named gap in the underlying research). Lineups locked per region at that region's first match of the week, so EU and NA players locked on different days. Counting in the best-of era was a pre-draft league choice between "First Two Games" and "Best Game". There were no native playoffs: Riot's FAQ is explicit that only regular-season matches counted. Riot shut the game down after running it for two years without committing resources to improve it; a search for a partner to rebuild it failed, and it never returned. (Sources: Polygon's 2016 and 2017 Fantasy LCS guides, Riot's Fantasy LCS FAQ and support pages, PCGamesN, Engadget, Twinfinite, Dot Esports on the shutdown.)

**Translation decisions (also in ARCHITECTURE.md):** kill, death and assist values carry over untouched where they translate (eliminations 2.0, deaths -0.5, assists 1.5). The hero-shooter lines Liquipedia publishes take the place of CS: final hits 0.5, damage, blocked and healing on per-thousand rates. The Team item becomes the Squad slot: draft one pro org in a final round; it scores map wins, series wins and clean sweeps. Counting deviates from Best Game on purpose: a Marvel Rivals week is one series per team, so every series counts. Playoffs deviate too: the original had none, and a fantasy league needs an ending, so the top four play semifinals and a final.

Successors and benchmarks: DraftKings runs salary-cap daily fantasy for League of Legends. Esports One (2020) kept the five positions plus Team slot but dropped exclusivity for a salary cap, and added a captain and champion-select bonuses. Sleeper has run a Fantasy LCS since 2021: season-long head-to-head with an exclusive snake draft, five starters (one per role, no Flex, Team slot or bench in the sources found), champion pick/ban multipliers, and default scoring of kill 3, death -1, assist 2. Correction, recorded plainly: an early note in this project's research called Sleeper's League of Legends fantasy unconfirmed. The completed research pass verified it from Dot Esports' Fantasy LCS guides and Nerd Street's draft coverage, and this document follows the verified version. Summoner's Inn Fantasy (Freaks 4U, 2023 onward) is another living season-long successor.

## 6. Deadlock

Verified: Deadlock has **no official league and no Valve-run circuit** as of this build, and the game itself is still unreleased and invite-only. What exists is a real community scene: Deadlock Night Shift, a weekly invitational in separate EU and NA brackets (at edition 59 by late September 2026), with a base prize that ran about $300 historically and $2,000 to $2,500 per week in mid-2026 editions, plus a $12,000 Night Shift Open in May 2026 and occasional $10,000 opens. Most recurring top teams are unaffiliated stacks, not org rosters; Virtus.pro signed a roster in February 2025 and dropped it that August, citing limited clarity about the game's competitive future. Peak concurrent players hit 262,145 on Oct 9, 2026 (SteamDB via Inven Global), so the audience is real even though the league is not. Sources: Liquipedia (Deadlock portal and Night Shift pages), Esports.gg, Deadfrag, PSU, Showgamer, Inven Global. The data model is game-agnostic from day one (every entity is game-scoped), and Deadlock is registered in the seed as a watched game with no competitions, teams or players. Its section opens when a real pro scene exists, per the user's framing.

## 7. Open gaps (named, not filled)

1. Stage 2 fixtures and results: not yet imported. The schedule page says so plainly. The LPDB pass is wave-2 work.
2. Rosters for 34 of 51 teams are unpublished or unverified in the sources read; those teams are directory-only until a sourced roster exists.
3. Hero pools are seeded only where a source published them (100 Thieves, Virtus.pro). Everyone else's hero list is empty rather than invented.
4. FURIA's Ignite 2026 participation rests on Liquipedia's Stage 2 listing via the research pass; it is absent from Dot Esports' earlier confirmed list, consistent with an MCS ascent, but flagged here as single-source.
5. Per-player season stats (averages, form) do not exist until results are imported; the players page does not pretend otherwise.
