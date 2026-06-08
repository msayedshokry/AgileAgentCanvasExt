var r = require('../reports/post-fix-v2.json');
var seen = {};
r.forEach(function(f) {
  var fn = f.uri.replace(/.*[\\/]/, '').replace('.feature', '');
  f.elements.filter(function(e) { return e.type === 'scenario'; }).forEach(function(e) {
    e.steps.filter(function(s) {
      return s.result && s.result.status === 'failed' && (s.result.error_message || '').indexOf('Cannot find module') >= 0;
    }).forEach(function(s) {
      if (!seen[fn]) {
        seen[fn] = s.result.error_message;
        console.log('=== ' + fn + ' ===');
        var lines = s.result.error_message.split('\n');
        lines.forEach(function(l) {
          if (l.indexOf('Require stack') >= 0 || l.indexOf('- D:') >= 0 || l.indexOf('Error:') >= 0) {
            console.log(l.trim());
          }
        });
        console.log('');
      }
    });
  });
});
if (Object.keys(seen).length === 0) console.log('NO VSCODE ERRORS REMAIN!');
