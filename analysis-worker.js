'use strict';
importScripts(
  'vendor/chess.min.js',
  'variants.js?v=6',
  'engine.js?v=6',
  'analysis.js?v=6',
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
