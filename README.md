# Army MOS Career Outcomes

A scrollytelling data visualization built for an Introduction to Information Visualization course (Spring 2026) that traces the full arc of an Army soldier's career — from where recruits come from, to the military occupational specialties (MOS) they hold, to where veterans settle and what civilian careers await them. The project combines five public datasets (DoD OPA PopRep FY2022, VA VetPop2023, DoD MILX crosswalk, BLS OEWS May 2024, and BLS Employment Situation of Veterans 2024) into a single-page interactive experience built with D3.js, Scrollama, and TopoJSON, allowing users to select a home state, explore any of 490 Army MOS codes, and see local wage data for matched civilian careers at the county level.

## Lessons Learned

- **Data cleaning is most of the work.** Joining five datasets across different geographic levels (state, county, national) and classification systems (FIPS codes, SOC codes, MOS codes) required significant preprocessing before any visualization was possible.
- **Scrollytelling requires a different design mindset.** Building a narrative-driven scroll experience forced us to think about how to sequence information rather than just display it — each step had to earn its place in the story.
- **Crosswalk data is imperfect.** The DoD MILX crosswalk maps MOS codes to civilian SOC occupations, but several mappings were inaccurate or outdated and had to be manually corrected to produce meaningful career match results.
- **Sticky positioning has edge cases.** Getting the left panel to stay fixed while the right narrative scrolled required careful handling of heights, offsets, and overflow — small CSS mistakes caused major layout breaks.
- **State-level wage data masks local variation.** Using BLS OEWS state-level estimates as a proxy for county-level salary data is a meaningful limitation — metro and rural wages within the same state can differ dramatically.
- **Interactivity and scroll narrative can coexist.** Allowing users to override scroll-driven defaults (change MOS, click counties, toggle color modes) at any point without breaking the narrative flow required deliberate state management in JavaScript.
