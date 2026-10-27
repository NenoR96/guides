(function (global) {
    'use strict';
    const fields = {
        lessons: ['title', 'bodyHtml', 'tldr', 'readTime', 'callOuts', 'callOut', 'callOutAnchor'],
        quizzes: ['title', 'intro', 'questions', 'bonus', 'results', 'questionCount']
    };
    const copy = value => JSON.parse(JSON.stringify(value));
    function editable(record, type) {
        return Object.fromEntries(fields[type].filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
    }
    function canonical(value) {
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
        return JSON.stringify(value);
    }
    async function hash(value) {
        const bytes = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
        return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function baseline(snapshot, exported = snapshot) {
        const result = { version: 1, lessons: Object.create(null), quizzes: Object.create(null) };
        for (const type of Object.keys(fields)) {
            const exportedRecords = new Map((exported[type] || []).map(record => [record[type === 'lessons' ? 'slug' : 'id'], record]));
            for (const record of snapshot[type] || []) {
                const id = record[type === 'lessons' ? 'slug' : 'id'];
                result[type][id] = { hash: await hash(editable(record, type)), exportedHash: await hash(editable(exportedRecords.get(id) || record, type)), published: record.published !== false, archivedAt: record.archivedAt || null };
            }
        }
        return result;
    }
    async function plan(payload, live, base, options) {
        if (!base || base.version !== 1 || !base.lessons || !base.quizzes) throw new Error('This HTML has no valid export baseline. Download a fresh working HTML file and copy your content edits into it.');
        const result = { schemaVersion: 1, lessons: [], quizzes: [], journeyData: null, archivedLessonIds: [], archivedQuizIds: [] };
        const conflicts = [];
        for (const type of Object.keys(fields)) {
            if (!options[type === 'lessons' ? 'updateGuides' : 'updateQuizzes']) continue;
            const key = type === 'lessons' ? 'slug' : 'id';
            const records = new Map((live[type] || []).map(record => [record[key], record]));
            for (const record of payload[type] || []) {
                const id = record[key], previous = Object.hasOwn(base[type], id) ? base[type][id] : null, current = records.get(id);
                const content = editable(record, type);
                const incomingHash = await hash(content);
                if (previous && incomingHash === (previous.exportedHash || previous.hash)) continue;
                if (previous) {
                    if (!current || (current.published !== false) !== previous.published || (current.archivedAt || null) !== previous.archivedAt) { conflicts.push(id); continue; }
                    const currentHash = await hash(editable(current, type));
                    if (currentHash === incomingHash) continue;
                    if (currentHash !== previous.hash) { conflicts.push(id); continue; }
                    const merged = copy(current);
                    fields[type].forEach(field => delete merged[field]);
                    result[type].push(Object.assign(merged, copy(content)));
                } else {
                    if (current) { conflicts.push(id); continue; }
                    const placement = type === 'lessons' ? { premium: false, icon: 'book', phaseKeys: [] } : {
                        afterGuideId: record.afterGuideId,
                        sourceGuideId: record.sourceGuideId || record.afterGuideId,
                        alsoAfterGuideIds: record.alsoAfterGuideIds == null ? [] : copy(record.alsoAfterGuideIds)
                    };
                    result[type].push({ schemaVersion: 1, [key]: id, ...copy(content), published: true, ...placement });
                }
            }
        }
        if (conflicts.length) throw new Error('Newer control-panel changes conflict with this export: ' + conflicts.join(', ') + '. Download fresh HTML and reapply these edits. Nothing was imported.');
        const publishedGuides = new Set([...live.lessons, ...result.lessons].filter(record => record.published !== false).map(record => record.slug));
        for (const quiz of result.quizzes.filter(record => !Object.hasOwn(base.quizzes, record.id))) {
            if (typeof quiz.afterGuideId !== 'string' || !quiz.afterGuideId || !Array.isArray(quiz.alsoAfterGuideIds)) {
                throw new Error('New quiz ' + quiz.id + ' needs afterGuideId and a valid alsoAfterGuideIds array to publish immediately.');
            }
            const missing = [quiz.afterGuideId, quiz.sourceGuideId, ...quiz.alsoAfterGuideIds].filter(id => !publishedGuides.has(id));
            if (missing.length) throw new Error('New quiz ' + quiz.id + ' references a missing or unpublished guide: ' + missing.map(String).join(', ') + '. Include the new guide in this import or choose a published guide.');
        }
        return result;
    }
    const api = { editable, canonical, baseline, plan };
    global.GuidesContentImport = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof window === 'undefined' ? globalThis : window));
