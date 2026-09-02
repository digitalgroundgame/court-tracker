// presidencies.js — inauguration dates + party, shared by the appointments beeswarm
// (appointments-chart.js) and the map widget's "Change" streamgraph (court-tracker.js).
// Public record; end of the last term is open (each entry's span runs to the next entry's
// start, or "now" for the last one). Two entries for the same name (Trump 2017/2025) are two
// separate, non-consecutive TERMS — anything bucketing appointments by term must match rows
// to these date ranges, not to the name, or the two terms' appointees would merge into one.
export const PRESIDENCIES = [
  ["1969-01-20", "Richard M. Nixon", "R"], ["1974-08-09", "Gerald Ford", "R"],
  ["1977-01-20", "Jimmy Carter", "D"], ["1981-01-20", "Ronald Reagan", "R"],
  ["1989-01-20", "George H.W. Bush", "R"], ["1993-01-20", "William J. Clinton", "D"],
  ["2001-01-20", "George W. Bush", "R"], ["2009-01-20", "Barack Obama", "D"],
  ["2017-01-20", "Donald J. Trump", "R"], ["2021-01-20", "Joseph R. Biden", "D"],
  ["2025-01-20", "Donald J. Trump", "R"],
];
