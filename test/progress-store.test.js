'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Contract = require('../shared/guides-home-contract');
const scope = { GuidesHomeContract: Contract };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../widget/progress-store.js'), 'utf8'), scope);
const Store = scope.GuidesProgressStore;
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
    const local = new Map();
    const remote = new Map();
    const env = { user: 'a', offline: false, writes: 0, beforeSave: null, afterRead: null };
    const storage = {
        getItem: key => local.get(key) || null,
        setItem: (key, value) => local.set(key, value),
        removeItem: key => local.delete(key)
    };
    function session(user = env.user, instance = 'one') {
        const remoteKey = JSON.stringify([instance, user]);
        return Store.create({ instanceId: instance, userId: user,
            user: user ? { _id: user } : null, storage,
            currentUser: async () => env.user ? { _id: env.user } : null,
            read: async () => {
                if (env.offline) throw new Error('offline');
                const result = remote.get(remoteKey);
                if (env.afterRead) await env.afterRead();
                return result && clone(result);
            },
            save: async value => {
                if (env.beforeSave) await env.beforeSave();
                if (env.offline) throw new Error('offline');
                env.writes++;
                remote.set(remoteKey, clone(value));
            }, legacy: async () => null
        });
    }
    return { env, local, remote, session, storage };
}
test('failed authenticated changes stay with their user and instance across reloads', async () => {
    const f = fixture();
    const a = f.session();
    await a.sync();
    f.env.offline = true;
    await assert.rejects(a.set('guide', 'first', true), /offline/);
    assert.deepEqual(a.snapshot().readGuideIds, ['first']);
    assert.deepEqual(f.session('a', 'two').snapshot().readGuideIds, []);
    f.env.user = 'b'; f.env.offline = false;
    const b = f.session(); await b.sync();
    assert.deepEqual(b.snapshot().readGuideIds, []);
    f.env.user = 'a';
    const reloaded = f.session(); await reloaded.sync();
    assert.deepEqual(reloaded.snapshot().readGuideIds, ['first']);
    assert.equal(JSON.parse(f.local.get(Store.keyFor('one', 'a'))).pending.length, 0);
    assert.equal(f.local.has(Store.keyFor('one', null)), false);
});
test('offline uncompletion is replayed against latest remote progress', async () => {
    const f = fixture(); const s = f.session();
    await s.set('guide', 'first', true);
    f.env.offline = true;
    await assert.rejects(s.set('guide', 'first', false), /offline/);
    const remote = f.remote.get('["one","a"]');
    remote.readGuideIds.push('other-device');
    f.env.offline = false;
    await f.session().sync();
    assert.deepEqual(f.remote.get('["one","a"]').readGuideIds, ['other-device']);
});
test('failed initial reads still allow owner-scoped completion and quiz pending changes', async () => {
    const f = fixture(); const s = f.session(); f.env.offline = true;
    await assert.rejects(s.sync(), /offline/);
    await assert.rejects(s.set('quiz', 'quiz-a', true), /offline/);
    await assert.rejects(s.scores({ 'quiz-a': { hits: 2, total: 3 } }), /offline/);
    f.env.offline = false; await s.sync();
    assert.deepEqual(s.snapshot().completedQuizIds, ['quiz-a']);
    assert.equal(s.snapshot().quizScores['quiz-a'].hits, 2);
});
test('ambiguous legacy anonymous caches are retained but never read or imported', async () => {
    const f = fixture();
    f.local.set('guides:readGuides:anonymous', '["old-user-guide"]');
    f.local.set('guides:completedQuizzes:anonymous', '["old-user-quiz"]');
    const s = f.session(); await s.sync();
    assert.deepEqual(s.snapshot().readGuideIds, []);
    assert.deepEqual(s.snapshot().completedQuizIds, []);
    assert.equal(f.local.get('guides:readGuides:anonymous'), '["old-user-guide"]');
});
test('guest history is imported once and cannot resurrect an uncompleted guide', async () => {
    const f = fixture(); f.env.user = null;
    await f.session().set('guide', 'guest-guide', true);
    f.env.user = 'a'; const a = f.session(); await a.sync();
    assert.deepEqual(a.snapshot().readGuideIds, ['guest-guide']);
    assert.equal(f.local.has(Store.keyFor('one', null)), false);
    await a.set('guide', 'guest-guide', false); await f.session().sync();
    assert.deepEqual(f.session().snapshot().readGuideIds, []);
    f.env.user = 'b'; const b = f.session(); await b.sync();
    assert.deepEqual(b.snapshot().readGuideIds, []);
});
test('guest claim survives a failed upload and excludes other users and instances', async () => {
    const f = fixture(); f.env.user = null;
    await f.session().set('quiz', 'guest-quiz', true);
    f.env.user = 'a'; f.env.offline = true;
    await assert.rejects(f.session().sync(), /offline/);
    f.env.user = 'b'; f.env.offline = false;
    const b = f.session(); await b.sync();
    assert.deepEqual(b.snapshot().completedQuizIds, []);
    f.env.user = 'a';
    const other = f.session('a', 'two'); await other.sync();
    assert.deepEqual(other.snapshot().completedQuizIds, []);
    const a = f.session(); await a.sync();
    assert.deepEqual(a.snapshot().completedQuizIds, ['guest-quiz']);
});
test('account switch between reading and writing blocks upload and keeps pending data', async () => {
    const f = fixture(); const a = f.session(); await a.sync();
    const writes = f.env.writes;
    f.env.afterRead = () => { f.env.user = 'b'; };
    await assert.rejects(a.set('guide', 'first', true), /account changed/);
    assert.equal(f.env.writes, writes);
    assert.equal(a.active, false);
    assert.equal(JSON.parse(f.local.get(Store.keyFor('one', 'a'))).pending.length, 1);
});
test('invalidating a queued session prevents any further writes', async () => {
    const f = fixture(); const s = f.session();
    s.invalidate();
    await assert.rejects(s.set('guide', 'first', true), /account changed/);
    assert.equal(f.env.writes, 0);
});
test('new actions arriving during an upload are not acknowledged by the older upload', async () => {
    const f = fixture(); const s = f.session(); await s.sync();
    let release, entered;
    const inSave = new Promise(resolve => { entered = resolve; });
    f.env.beforeSave = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
    const first = s.set('guide', 'first', true);
    await inSave;
    const second = s.set('guide', 'first', false);
    await new Promise(resolve => setImmediate(resolve));
    f.env.beforeSave = null; release();
    await Promise.all([first, second]);
    assert.deepEqual(s.snapshot().readGuideIds, []);
    assert.deepEqual(f.remote.get('["one","a"]').readGuideIds, []);
});
test('a failed save is retried and ownership-mismatched remote data is never overwritten', async () => {
    const f = fixture(); const s = f.session(); await s.sync();
    f.env.beforeSave = () => { throw new Error('save failed'); };
    await assert.rejects(s.set('guide', 'first', true), /save failed/);
    f.env.beforeSave = null;
    f.remote.set('["one","a"]', Contract.blankProgress('one', 'b'));
    await assert.rejects(s.sync(), /ownership/);
    f.remote.set('["one","a"]', Contract.blankProgress('one', 'a'));
    await s.sync();
    assert.deepEqual(s.snapshot().readGuideIds, ['first']);
});
test('both widget implementations package and use the shared persistence service', () => {
    const root = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'widget/index.html'), 'utf8');
    const runtime = fs.readFileSync(path.join(root, 'widget/release-runtime.js'), 'utf8');
    assert.ok(html.indexOf('src="progress-store.js"') < html.indexOf('src="release-runtime.js"'));
    for (const source of [html, runtime]) {
        assert.match(source, /GuidesProgressStore.open\(\)/);
        assert.doesNotMatch(source, /readGuides.*:anonymous|completedQuizzes.*:anonymous/);
        assert.match(source, /progressSession\?\.invalidate\(\)/);
    }
    assert.match(fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8'), /"widget\/progress-store"/);
});
test('SDK authentication errors never create an anonymous session', async () => {
    const context = { GuidesHomeContract: Contract, buildfire: {
        auth: { getCurrentUser: callback => callback(new Error('auth unavailable')) }
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../widget/progress-store.js'), 'utf8'), context);
    await assert.rejects(context.GuidesProgressStore.open(), /auth unavailable/);
});
test('main runtime retains pending progress after startup and save failures without exposing it to another user', async () => {
    const f = fixture();
    const source = fs.readFileSync(path.join(__dirname, '../widget/release-runtime.js'), 'utf8');
    const context = {
        GuidesHomeContract: Contract,
        GuidesProgressStore: { open: async () => f.session() },
        localStorage: f.storage,
        console: { error() {} }
    };
    context.window = context;
    vm.runInNewContext(source.replace('global.GuidesReleaseRuntime = {',
        'global.testing = { createState, loadProgress, setCompletion, useLocalProgressFallback }; global.GuidesReleaseRuntime = {'), context);
    const api = context.testing;
    const a = api.createState(); f.env.offline = true;
    await api.loadProgress(a).catch(error => api.useLocalProgressFallback(a, error));
    await api.setCompletion(a, 'guide', 'first', true);
    assert.equal(a.completed.has('first'), true);
    a.progressSession.invalidate(); f.env.user = 'b'; f.env.offline = false;
    const b = api.createState(); await api.loadProgress(b);
    assert.equal(b.completed.has('first'), false);
    f.env.user = 'a'; const reloaded = api.createState(); await api.loadProgress(reloaded);
    assert.equal(reloaded.completed.has('first'), true);
});
