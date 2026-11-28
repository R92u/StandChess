'use strict';
importScripts(
  'vendor/chess.min.js',
  'variants.js?v=3',
  'engine.js?v=3',
  'analysis.js?v=3',
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
