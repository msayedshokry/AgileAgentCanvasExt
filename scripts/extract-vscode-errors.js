var r = require('../reports/post-fix-report.json');
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
        console.log(s.result.error_message.substring(0, 600));
        console.log('');
      }
    });
  });
});
