const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../control/content/release-manager.js'), 'utf8');
// A template adapter for the validator's DOM queries. The fixture is the actual
// article exported with the shared HTML, not a hand-written media example.
function template() {
    const node = { innerHTML: '' };
    node.content = {
        querySelector(selectors) {
            return selectors.split(',').some(tag => new RegExp('<' + tag.trim() + '\\b', 'i').test(node.innerHTML)) ? {} : null;
        },
        querySelectorAll(selector) {
            if (selector !== 'iframe') return [];
            return [...node.innerHTML.matchAll(/<iframe\b[^>]*>/gi)].map(([tag]) => ({
                getAttribute(name) { const match = tag.match(new RegExp('\\b' + name + '="([^"]*)"', 'i')); return match ? match[1].replace(/&amp;/g, '&') : null; }
            }));
        }
    };
    return node;
}
const start = source.indexOf('    function safeBodyHtml(');
const end = source.indexOf('    function validateAuthoringContent(', start);
const sanitize = new Function('document', source.slice(start, end) + '\nreturn safeBodyHtml;')({ createElement: template });
test('existing sinais-prontidao SoundCloud and YouTube players survive content validation', () => {
    const shell = fs.readFileSync(path.join(__dirname, '../guias-interativo.html'), 'utf8');
    const content = JSON.parse(shell.match(/<script id="guides-content"[^>]*>([\s\S]*?)<\/script>/)[1]);
    const article = content.lessons.find(guide => guide.slug === 'sinais-prontidao');
    assert.match(article.bodyHtml, /https:\/\/w\.soundcloud\.com\/player\//);
    assert.match(article.bodyHtml, /https:\/\/www\.youtube\.com\/embed\//);
    assert.equal(sanitize(article.bodyHtml, article.slug, true), article.bodyHtml.trim());
});
test('media embeds require HTTPS while page-level code stays blocked', () => {
    assert.doesNotThrow(() => sanitize('<iframe src="https://player.vimeo.com/video/123" allowfullscreen></iframe>', 'guide', true));
    for (const src of ['javascript:alert(1)', 'data:text/html,test', 'http://example.test/player', '/relative']) {
        assert.throws(() => sanitize('<iframe src="' + src + '"></iframe>', 'guide', true), /HTTPS/);
    }
    assert.throws(() => sanitize('<style>body{display:none}</style>', 'guide', true), /page-level/);
    assert.throws(() => sanitize('<script>alert(1)</script>', 'guide', true), /scripts/);
});
