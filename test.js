const { JSDOM } = require('jsdom');
const fs = require('fs');

let html = fs.readFileSync('tone-finder.html', 'utf-8');

// Inline all local <script src="..."></script>
html = html.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) => {
  const file = src.split('?')[0];
  if (fs.existsSync(file)) {
    return '<script>\n' + fs.readFileSync(file, 'utf-8') + '\n</script>';
  }
  return m;
});

// Remove external link stylesheets (fonts) to avoid load attempts
html = html.replace(/<link[^>]+fonts\.googleapis[^>]*>/g, '');
html = html.replace(/<link[^>]+shared\.css[^>]*>/g, '');

const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/tone-finder.html" });
const { window } = dom;

window.addEventListener('error', (e) => {
  console.log("ERROR:", e.message, e.filename, e.lineno);
});

setTimeout(() => {
  const doc = window.document;
  const nav = doc.querySelector('nav.site-nav');
  console.log("nav innerHTML length:", nav ? nav.innerHTML.length : 'no nav');
  const quizLink = [...doc.querySelectorAll('a')].find(a => a.textContent.trim() === '程度測驗');
  console.log("quizLink found:", !!quizLink, quizLink && quizLink.getAttribute('onclick'));
  const modal = doc.getElementById('modal-quiz');
  console.log("modal-quiz found:", !!modal, "classes before:", modal && modal.className);
  console.log("typeof openModal:", typeof window.openModal);
  console.log("typeof window.openModal:", typeof window.openModal, "global openModal via eval:", (function(){try{return typeof window.eval('openModal')}catch(e){return e.message}})());
  if (quizLink) {
    try {
      quizLink.click();
    } catch(e) { console.log("click error:", e.message); }
  }
  console.log("classes after:", modal && modal.className);
}, 1500);
