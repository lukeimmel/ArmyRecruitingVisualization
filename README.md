Description:

This project visualizes the career lifecycle of an Army soldier, covering where recruits come from, what military jobs they hold, and where veterans end up after service. Users can select a home state, explore any of 490 Army MOS codes, and see how those military jobs map to civilian careers along with local wage data at the county level. The site pulls from five public datasets including BLS wage data, the DoD MOS to civilian job crosswalk, and VA veteran population estimates, and is built as a single page scrollytelling experience using D3.js, Scrollama, and TopoJSON.

Lessons Learned:

- Joining datasets across different geographic levels (state, county, national) was harder than expected
- The DoD MOS to civilian job crosswalk had some bad mappings that had to be fixed manually
- CSS sticky positioning is finicky and small mistakes broke the whole layout
- State level wage data doesn't capture how different pay can be within the same state
- Balancing scroll driven narrative with user interactivity required more planning than expected
