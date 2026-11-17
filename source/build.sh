#!/bin/sh
# Builds index.html from src/ (order matters: f_boot.js must be last).
# ZIP layout writes site/index.html; in the GitHub repo (this folder is source/) it writes ../index.html.
cd "$(dirname "$0")"
OUT=${OUT:-$( [ -d site ] && echo site || echo .. )}
{ cat src/a_head.html; echo '<script>'; cat src/b_core.js src/c_today.js src/d_sections.js src/e_voice.js src/g_brief.js src/f_boot.js; echo '</script>'; echo '</body></html>'; } > "$OUT/index.html"
node -e "const h=require('fs').readFileSync('$OUT/index.html','utf8');new Function(h.split('<script>').pop().split('</script>')[0]);console.log('built $OUT/index.html, syntax ok')"
