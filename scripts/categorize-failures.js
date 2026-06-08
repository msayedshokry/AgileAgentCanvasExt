/**
 * Categorize all Cucumber test failures by root cause.
 * Usage: node scripts/categorize-failures.js [report-path]
 */
const fs = require('fs');

const reportPath = process.argv[2] || 'reports/full-suite-report.json';
const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const cats = {
  vscode: { label: 'Missing vscode mock', byFeature: {}, total: 0 },
  undef:  { label: 'Undefined steps', byFeature: {}, total: 0 },
  ambig:  { label: 'Ambiguous steps', byFeature: {}, total: 0 },
  assert: { label: 'Assertion failures', byFeature: {}, total: 0 },
  runerr: { label: 'Runtime errors', byFeature: {}, total: 0 },
};

function fname(uri) { return uri.split(/[\\/]/).pop().replace('.feature', ''); }

function classify(msg) {
  if (!msg) return 'runerr';
  var m = String(msg);
  if (m.indexOf("Cannot find module 'vscode'") >= 0) return 'vscode';
  if (m.indexOf('AssertionError') >= 0) return 'assert';
  if (m.indexOf('Expected values') >= 0) return 'assert';
  if (m.indexOf('should exist') >= 0) return 'assert';
  if (m.indexOf('should be defined') >= 0) return 'assert';
  return 'runerr';
}

function add(cat, feat, scenario, detail) {
  if (!cats[cat].byFeature[feat]) cats[cat].byFeature[feat] = [];
  cats[cat].byFeature[feat].push({ s: scenario, d: detail });
  cats[cat].total++;
}

for (var i = 0; i < data.length; i++) {
  var feat = data[i];
  var fn = fname(feat.uri);
  for (var j = 0; j < feat.elements.length; j++) {
    var el = feat.elements[j];
    if (el.type !== 'scenario') continue;
    var steps = el.steps || [];

    var ambig = steps.filter(function(s) { return s.result && s.result.status === 'ambiguous'; });
    if (ambig.length > 0) {
      add('ambig', fn, el.name, ambig.map(function(s) { return s.name || (s.keyword + '...'); }).join('; '));
      continue;
    }

    var undef = steps.filter(function(s) { return s.result && s.result.status === 'undefined'; });
    if (undef.length > 0) {
      add('undef', fn, el.name, undef.map(function(s) { return s.name || (s.keyword + (s.text || '')); }).join('; '));
      continue;
    }

    var failed = steps.filter(function(s) { return s.result && s.result.status === 'failed'; });
    if (failed.length > 0) {
      var firstErr = failed[0].result.error_message || '';
      var c = classify(firstErr);
      var details = failed.map(function(s) {
        var err = (s.result.error_message || '').substring(0, 150);
        return (s.name || s.keyword) + ' -> ' + err;
      }).join('\n       ');
      add(c, fn, el.name, details);
    }
  }
}

var total = 0, passed = 0;
for (var i = 0; i < data.length; i++) {
  var feat = data[i];
  for (var j = 0; j < feat.elements.length; j++) {
    var el = feat.elements[j];
    if (el.type !== 'scenario') continue;
    total++;
    if (el.steps && el.steps.every(function(s) { return s.result && s.result.status === 'passed'; })) passed++;
  }
}

console.log('='.repeat(70));
console.log('  TEST FAILURE CATEGORIZATION REPORT');
console.log('='.repeat(70));
console.log('  Total: ' + total + ' scenarios  |  ' + passed + ' passed  |  ' + (total - passed) + ' failing');
console.log('='.repeat(70));
console.log('');

var order = ['vscode', 'undef', 'ambig', 'assert', 'runerr'];
for (var k = 0; k < order.length; k++) {
  var key = order[k];
  var cat = cats[key];
  if (cat.total === 0) continue;

  console.log('--- ' + cat.label + ' (' + cat.total + ' scenarios) ---');

  var features = Object.keys(cat.byFeature).sort(function(a, b) {
    return cat.byFeature[b].length - cat.byFeature[a].length;
  });

  for (var fi = 0; fi < features.length; fi++) {
    var featName = features[fi];
    var scenarios = cat.byFeature[featName];
    console.log('  ' + featName + ' (' + scenarios.length + ')');

    if (key === 'assert' && scenarios.length > 5) {
      // Group by error signature
      var groups = {};
      for (var si = 0; si < scenarios.length; si++) {
        var s = scenarios[si];
        var sig = s.d.substring(0, 80).replace(/\d+/g, 'N').replace(/['"]/g, '');
        if (!groups[sig]) groups[sig] = [];
        groups[sig].push(s.s);
      }
      var sorted = Object.keys(groups).sort(function(a, b) { return groups[b].length - groups[a].length; });
      for (var gi = 0; gi < Math.min(sorted.length, 8); gi++) {
        var sig = sorted[gi];
        var names = groups[sig];
        if (names.length === 1) {
          console.log('    - ' + names[0]);
          console.log('      ' + sig.substring(0, 70));
        } else {
          console.log('    - [' + names.length + 'x] ' + sig.substring(0, 65));
        }
      }
      if (sorted.length > 8) console.log('    ... and ' + (sorted.length - 8) + ' more patterns');
    } else {
      for (var si = 0; si < Math.min(scenarios.length, 8); si++) {
        console.log('    - ' + scenarios[si].s);
      }
      if (scenarios.length > 8) console.log('    ... and ' + (scenarios.length - 8) + ' more');
    }
  }
  console.log('');
}

// Feature summary
console.log('='.repeat(70));
console.log('  FAILURES BY FEATURE FILE (sorted by fail count)');
console.log('='.repeat(70));

var featStats = {};
for (var i = 0; i < data.length; i++) {
  var feat = data[i];
  var fn = fname(feat.uri);
  var sc = feat.elements.filter(function(e) { return e.type === 'scenario'; });
  var p = sc.filter(function(e) { return e.steps && e.steps.every(function(s) { return s.result && s.result.status === 'passed'; }); }).length;
  featStats[fn] = { total: sc.length, pass: p, fail: sc.length - p };
}

var failingFeats = Object.keys(featStats)
  .filter(function(k) { return featStats[k].fail > 0; })
  .sort(function(a, b) { return featStats[b].fail - featStats[a].fail; });

for (var i = 0; i < failingFeats.length; i++) {
  var k = failingFeats[i];
  var st = featStats[k];
  var pct = st.pass > 0 ? ' (' + st.pass + '/' + st.total + ' pass)' : ' (ALL ' + st.total + ' fail)';
  var bar = '#'.repeat(Math.min(st.fail, 50));
  console.log('  ' + (k + '                     ').substring(0, 32) + ' ' + (st.fail + '   ').substring(0, 4) + ' fail' + pct);
}

console.log('');
console.log('='.repeat(70));
console.log('  SUMMARY BY CATEGORY');
console.log('='.repeat(70));
for (var k = 0; k < order.length; k++) {
  var key = order[k];
  var cat = cats[key];
  if (cat.total > 0) {
    console.log('  ' + cat.label + ': ' + cat.total + ' scenarios in ' + Object.keys(cat.byFeature).length + ' features');
  }
}
console.log('  Total failing: ' + (total - passed) + ' scenarios in ' + failingFeats.length + ' features');
