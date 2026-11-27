'use strict';
importScripts(
  'vendor/chess.min.js',
  'variants.js',
  'engine.js?v=2',
  'analysis.js?v=2',
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
