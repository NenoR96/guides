const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../shared/guides-translations');
const html = fs.readFileSync(require('node:path').join(__dirname, '../guias-interativo.html'), 'utf8');
test('appearance settings update real shell selectors, metadata and dynamic confetti without altering article data', () => {
    const value = { language: 'fr-FR', pageTitle: 'Guides <France> & famille', green: '#123456', blue: '#234567', heading: '#345678', counter: '#456789', achievementEnabled: false };
    const output = api.apply(html, { appearance: value });
    assert.match(output, /<html lang="fr-FR">/);
    assert.match(output, /<title>Guides &lt;France&gt; &amp; famille<\/title>/);
    assert.match(output, /--guides-green:#123456/);
    assert.match(output, /\.jsb-row,.*color:#345678/);
    assert.match(output, /\.jsb-count,.*color:#456789/);
    assert.match(output, /var\(--guides-blue, #3B82C4\)/);
    const content = source => source.match(/<script id="guides-content"[^>]*>([\s\S]*?)<\/script>/)[1];
    assert.equal(content(output), content(html));
    assert.equal(api.apply(output, { appearance: value }), output);
    for (const match of output.replace(/<!--[\s\S]*?-->|<style\b[^>]*>[\s\S]*?<\/style>/gi, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (!match[1].includes('application/json') && match[2].trim()) {
            try { new vm.Script(match[2]); } catch (error) { throw new Error(error.message + '\nScript starts: ' + match[2].slice(0, 300)); }
        }
    }
});
test('achievement toggle controls behavior and can be turned back on', () => {
    const source = '<html><head></head><body><script>function showAchievement(title) { window.shown = title; }</script></body></html>';
    function run(enabled) {
        const result = api.applyAppearance(source, { achievementEnabled: enabled });
        const context = {}; context.window = context;
        vm.createContext(context);
        for (const match of result.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
        context.showAchievement('Complete');
        return context.shown;
    }
    assert.equal(run(false), undefined); assert.equal(run(true), 'Complete');
});
test('appearance rejects injected CSS and language values, and preserves embedded JSON examples', () => {
    const json = '<script type="application/json" id="guides-content">{"example":"<style>body{color:#1ABC9C}</style>"}</script>';
    const result = api.applyAppearance('<html lang="pt-BR"><head>' + json + '</head><body></body></html>', { language: 'en" onclick="bad()', green: 'red;}body{display:none', pageTitle: '</title><script>bad()</script>' });
    assert.ok(result.includes(json)); assert.match(result, /lang="pt-BR"/);
    assert.ok(!result.includes('<script>bad()')); assert.ok(!result.includes('display:none'));
});
