'use strict';
importScripts('vendor/chess.min.js', 'variants.js', 'engine.js', 'analysis.js');
onmessage = ({ data }) => {
  try {
    postMessage({
      row: StandAnalysis.grade(data.before, data.after, data.event),
    });
  } catch {
    postMessage({ error: true });
  }
};
