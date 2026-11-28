'use strict';
importScripts(
  'vendor/chess.min.js',
  'variants.js?v=5',
  'engine.js?v=5',
  'analysis.js?v=5',
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
