'use strict';
importScripts(
  'vendor/chess.min.js',
  'variants.js?v=4',
  'engine.js?v=4',
  'analysis.js?v=4',
);
onmessage = ({ data }) => {
  try {
    postMessage({
      row: StandAnalysis.grade(data.before, data.after, data.event),
    });
  } catch {
    postMessage({ error: true });
  }
};
