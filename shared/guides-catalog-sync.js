(function (global) {
    "use strict";

    const Contract = global.GuidesHomeContract;
    const TAGS = { lessons: "guideLessons", quizzes: "guideQuizzes", journeys: "guideJourneys" };
    const PAGE_SIZE = 50;

    function context() {
        return new Promise((resolve, reject) => {
            if (!global.buildfire || typeof buildfire.getContext !== "function") return reject(new Error("BuildFire context is unavailable."));
            try {
                const immediate = buildfire.getContext((error, value) => error ? reject(error) : resolve(value || {}));
                if (immediate && typeof immediate === "object") resolve(immediate);
            } catch (error) { reject(error); }
        });
    }

    function appGet(tag) {
        return new Promise((resolve, reject) => {
            if (!buildfire.appData || typeof buildfire.appData.get !== "function") return reject(new Error("BuildFire appData is unavailable."));
            buildfire.appData.get(tag, (error, result) => error ? reject(error) : resolve(result && result.data ? result.data : null));
        });
    }

    function appSave(data, tag) {
        return new Promise((resolve, reject) => {
            buildfire.appData.save(data, tag, (error, result) => error ? reject(error) : resolve(result));
        });
    }

    function datastoreGet(tag) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.get(tag, (error, result) => error ? reject(error) : resolve(result && result.data ? result.data : null));
        });
    }

    function searchPage(tag, page) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.search({ page, pageSize: PAGE_SIZE }, tag, (error, result) => {
                if (error) reject(error);
                else resolve(Array.isArray(result) ? result : ((result && result.result) || []));
            });
        });
    }

    async function searchAll(tag) {
        const values = [];
        for (let page = 0; ; page += 1) {
            const records = await searchPage(tag, page);
            values.push(...records.map((record) => record && record.data ? record.data : record));
            if (records.length < PAGE_SIZE) return values;
        }
    }

    async function syncFromSnapshot(snapshot) {
        if (!Contract) throw new Error("Guides Home contract helpers are unavailable.");
        const appContext = await context();
        const instanceId = String(appContext.instanceId || appContext.pluginInstanceId || "").trim();
        const tag = Contract.catalogTag(instanceId);
        if (!tag) throw new Error("Cannot publish the Guides catalog without an instanceId.");
        const previous = await appGet(tag);
        const next = Contract.buildCatalog(
            snapshot && snapshot.lessons,
            snapshot && snapshot.quizzes,
            snapshot && snapshot.journeyData,
            instanceId,
            previous
        );
        if (!next) return { changed: false, tag, catalog: previous };
        await appSave(next, tag);
        return { changed: true, tag, catalog: next };
    }

    async function syncFromDatastore() {
        const [lessons, quizzes, journeyData] = await Promise.all([
            searchAll(TAGS.lessons), searchAll(TAGS.quizzes), datastoreGet(TAGS.journeys)
        ]);
        return syncFromSnapshot({ lessons, quizzes, journeyData: journeyData || { journeys: [] } });
    }

    global.GuidesCatalogSync = { syncFromSnapshot, syncFromDatastore };
}(window));
