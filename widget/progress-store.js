(function (global) {
    'use strict';
    const Contract = global.GuidesHomeContract;
    // v2 deliberately never reads the old, ambiguously owned anonymous caches.
    const prefix = 'guides:progress:v2:';
    const keyFor = (instance, user) => prefix + JSON.stringify([instance, user || null]);
    const call = (service, method, ...args) => new Promise((resolve, reject) => {
        global.buildfire[service][method](...args, (error, value) => error ? reject(error) : resolve(value));
    });

    async function open() {
        const user = await call('auth', 'getCurrentUser');
        const context = await new Promise((resolve, reject) => {
            const immediate = global.buildfire.getContext((error, value) => error ? reject(error) : resolve(value));
            if (immediate && typeof immediate === 'object') resolve(immediate);
        });
        const instanceId = String(context?.instanceId || context?.pluginInstanceId || '').trim();
        const userId = user ? String(user._id || '').trim() : null;
        if (!instanceId || (user && !userId)) throw new Error('Progress requires a stable instance and user identity.');
        return create({ instanceId, userId, user,
            storage: global.localStorage,
            currentUser: () => call('auth', 'getCurrentUser'),
            read: async () => (await call('appData', 'get', Contract.progressTag(instanceId, userId)))?.data,
            save: value => call('appData', 'save', value, Contract.progressTag(instanceId, userId)),
            legacy: async () => (await call('userData', 'get', 'reading-progress'))?.data
        });
    }

    function create(options) {
        const { instanceId, userId, storage } = options;
        const key = keyFor(instanceId, userId);
        const guestKey = keyFor(instanceId, null);
        let invalid = false;
        let queue = Promise.resolve();
        let legacyData;
        const blank = () => Contract.blankProgress(instanceId, userId || 'guest');
        function readLocal(target = key) {
            const raw = storage.getItem(target);
            if (!raw) return { snapshot: null, pending: [] };
            const value = JSON.parse(raw);
            if (!value || !Array.isArray(value.pending)) throw new Error('Invalid local Guides progress.');
            return value;
        }
        const writeLocal = (value, target = key) => storage.setItem(target, JSON.stringify(value));
        function apply(progress, operations) {
            return operations.reduce((next, operation) => operation.type === 'scores'
                ? { ...next, quizScores: Contract.normalizeQuizScores(operation.value) }
                : Contract.setCompleted(next, operation.type, operation.id, operation.completed), progress);
        }
        function snapshot() {
            const local = readLocal();
            // Claimed guest data belongs only to the account that claimed it.
            if (!userId && local.claimedBy) return blank();
            const saved = Contract.normalizeProgress(local.snapshot, instanceId, userId || 'guest') || blank();
            return apply(saved, local.pending);
        }
        async function guard() {
            if (invalid) throw new Error('Guides account changed.');
            const current = await options.currentUser();
            if (invalid || (current ? String(current._id || '').trim() : null) !== userId) {
                invalid = true;
                throw new Error('Guides account changed.');
            }
        }
        function enqueue(work) {
            const task = queue.then(work);
            queue = task.catch(() => {});
            return task;
        }
        // Claim before transfer: a failed upload must never let a second account
        // import the same guest history. The claim survives reloads and failures.
        function claimGuest() {
            const guest = readLocal(guestKey);
            if (guest.claimedBy && guest.claimedBy !== userId) return [];
            if (!guest.pending.length) return [];
            if (!guest.claimedBy) {
                guest.claimedBy = userId;
                writeLocal(guest, guestKey);
            }
            const local = readLocal();
            const tokens = new Set(local.pending.map(item => item.token));
            local.pending = [...guest.pending.filter(item => !tokens.has(item.token)), ...local.pending];
            writeLocal(local);
            return guest.pending.map(item => item.token);
        }
        async function flush() {
            await guard();
            if (!userId) return snapshot();
            const guestTokens = claimGuest();
            const raw = await options.read();
            await guard();
            let latest = Contract.isEmptyRecord(raw) ? blank() : Contract.normalizeProgress(raw, instanceId, userId);
            if (!latest) throw new Error('Progress ownership does not match.');
            const needsMigration = latest.migrationVersion < Contract.MIGRATION_VERSION;
            if (legacyData === undefined) {
                legacyData = (await options.legacy()) || null;
                await guard();
            }
            if (needsMigration) {
                latest = Contract.migrateProgress(latest, legacyData, {});
            }
            const batch = readLocal().pending;
            if (needsMigration || batch.length) {
                latest = apply(latest, batch);
                latest.revision += 1;
                latest.updatedAt = new Date().toISOString();
                await guard();
                await options.save(latest);
                await guard();
            }
            // New actions appended while the save was in flight must survive.
            const acknowledged = new Set(batch.map(item => item.token));
            const local = readLocal();
            local.snapshot = latest;
            local.pending = local.pending.filter(item => !acknowledged.has(item.token));
            writeLocal(local);
            if (guestTokens.length) {
                const guest = readLocal(guestKey);
                if (guest.claimedBy === userId) {
                    guest.pending = guest.pending.filter(item => !acknowledged.has(item.token));
                    if (guest.pending.length) writeLocal(guest, guestKey);
                    else storage.removeItem(guestKey);
                }
            }
            return snapshot();
        }
        async function record(operation) {
            await guard();
            const local = readLocal();
            if (!userId && local.claimedBy) throw new Error('Guest progress is awaiting its owning account.');
            // Validate before persisting, including false (uncompletion) actions.
            apply(blank(), [operation]);
            operation.token = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
            local.pending.push(operation);
            writeLocal(local);
            return enqueue(flush);
        }
        return {
            user: options.user || null, userId, instanceId, snapshot,
            get active() { return !invalid; },
            get legacyData() { return legacyData; },
            invalidate() { invalid = true; },
            sync: () => enqueue(flush),
            set: (type, id, completed) => record({ type, id, completed: completed !== false }),
            scores: value => record({ type: 'scores', value: Contract.normalizeQuizScores(value) })
        };
    }
    global.GuidesProgressStore = { open, create, keyFor };
}(typeof window === 'undefined' ? globalThis : window));
