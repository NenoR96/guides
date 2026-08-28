(function (global) {
    "use strict";

    // Persisted releases use the legacy key "lessons" for guide records.
    const TAGS = {
        lessons: "guideLessons",
        quizzes: "guideQuizzes",
        journeys: "guideJourneys",
        legacyHtml: "interactiveGuideHtml",
        releaseState: "guideReleaseState",
        shells: "guideShellRevisions",
        progress: "reading-progress"
    };
    const PAGE_SIZE = 50;
    const LOCAL_PROGRESS_PREFIX = "guides:readGuides";
    const LEGACY_LOCAL_PREFIXES = {
        babyBirthdate: "guides:babyBirthdate",
        collapsedJourneySections: "guides:journeyCollapsedSections",
        homeViewMode: "guides:homeViewMode",
        completedQuizzes: "guides:completedQuizzes",
        readerScrollPositions: "guides:readerScrollPositions"
    };
    let started = false;

    function getData(tag) {
        return new Promise((resolve, reject) => {
            buildfire.datastore.get(tag, (error, result) => {
                if (error) reject(error);
                else resolve(result && result.data ? result.data : null);
            });
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
        const records = [];
        for (let page = 0; ; page += 1) {
            const batch = await searchPage(tag, page);
            records.push(...batch);
            if (batch.length < PAGE_SIZE) break;
        }
        return records.map((record) => record && record.data ? record.data : record);
    }

    function getCurrentUser() {
        return new Promise((resolve) => {
            if (!buildfire.auth || typeof buildfire.auth.getCurrentUser !== "function") return resolve(null);
            buildfire.auth.getCurrentUser((error, user) => resolve(error ? null : (user || null)));
        });
    }

    function ownerKey(user) {
        const id = user && (user._id || user.id || user.userId || user.email);
        return id ? "user:" + encodeURIComponent(String(id)) : "anonymous";
    }

    function publicUser(user) {
        if (!user) return null;
        return {
            id: user._id || user.id || user.userId || null,
            displayName: user.displayName || user.name || null,
            firstName: user.firstName || null
        };
    }

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function parseActionItem(value) {
        const source = String(value || "").trim();
        const candidates = [source];
        try { candidates.push(decodeURIComponent(source)); } catch (error) { /* legacy Latin-1 encoding */ }
        if (typeof global.unescape === "function") candidates.push(global.unescape(source));
        for (const candidate of candidates) {
            try {
                const parsed = JSON.parse(candidate);
                if (parsed && typeof parsed === "object") return parsed;
            } catch (error) { /* try the next supported encoding */ }
        }
        return null;
    }

    function prepareGuideContent(content) {
        if (!content) return;
        content.querySelectorAll("script").forEach((script) => script.remove());
        content.querySelectorAll("*").forEach((element) => {
            Array.from(element.attributes).forEach((attribute) => {
                const name = attribute.name.toLowerCase();
                const value = attribute.value.trim().toLowerCase();
                if (name.startsWith("on") || name === "srcdoc") element.removeAttribute(attribute.name);
                else if (["href", "src", "xlink:href"].includes(name) && value.startsWith("javascript:")) {
                    element.removeAttribute(attribute.name);
                }
            });
        });
        if (buildfire.navigation && typeof buildfire.navigation.makeSafeLinks === "function") {
            buildfire.navigation.makeSafeLinks(content);
        }
        content.addEventListener("click", (event) => {
            const link = event.target.closest && event.target.closest("a");
            if (!link || !content.contains(link)) return;
            const encodedAction = link.getAttribute("data-action-item");
            if (encodedAction) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const action = parseActionItem(encodedAction);
                if (action && buildfire.actionItems && typeof buildfire.actionItems.execute === "function") {
                    buildfire.actionItems.execute(action, () => { });
                }
                return;
            }
            const href = link.getAttribute("href") || "";
            if (href.length > 1 && href.charAt(0) === "#") {
                const target = document.getElementById(decodeURIComponent(href.slice(1)));
                if (target && content.contains(target)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }
        }, true);
    }

    function shellContract(html) {
        const match = String(html || "").match(/<meta\s+[^>]*name=["']guides-shell-contract["'][^>]*content=["'](\d+)["'][^>]*>/i) ||
            String(html || "").match(/<meta\s+[^>]*content=["'](\d+)["'][^>]*name=["']guides-shell-contract["'][^>]*>/i);
        return match ? Number(match[1]) : 0;
    }

    function createState() {
        return {
            lessons: [],
            quizzes: [],
            journeyData: { journeys: [] },
            activeJourney: null,
            completed: new Set(),
            progressData: {},
            preferences: {},
            progressOwnerKey: "anonymous",
            localProgressKey: LOCAL_PROGRESS_PREFIX + ":anonymous",
            currentUser: null,
            entitlements: { hasSubscriptions: false, subscriptions: [] },
            activeRelease: null,
            frame: null
        };
    }

    async function loadProgress(state) {
        state.currentUser = await getCurrentUser();
        const scopedOwner = ownerKey(state.currentUser);
        state.progressOwnerKey = scopedOwner;
        state.localProgressKey = LOCAL_PROGRESS_PREFIX + ":" + scopedOwner;
        try {
            state.completed = new Set(JSON.parse(localStorage.getItem(state.localProgressKey) || "[]"));
        } catch (error) {
            state.completed = new Set();
        }
        await new Promise((resolve) => {
            if (!buildfire.userData) return resolve();
            buildfire.userData.get(TAGS.progress, (error, result) => {
                if (!error && result && result.data) {
                    state.progressData = result.data;
                    state.preferences = result.data.preferences && typeof result.data.preferences === "object"
                        ? { ...result.data.preferences } : {};
                    if (result.data.babyBirthdate && !state.preferences.babyBirthdate) state.preferences.babyBirthdate = result.data.babyBirthdate;
                    if (Array.isArray(result.data.collapsedJourneySections) && !state.preferences.collapsedJourneySections) {
                        state.preferences.collapsedJourneySections = result.data.collapsedJourneySections.slice();
                    }
                    if (Array.isArray(result.data.completedQuizzes) && !state.preferences.completedQuizzes) {
                        state.preferences.completedQuizzes = result.data.completedQuizzes.slice();
                    }
                    const remoteIds = result.data.readGuides || result.data.readLessons || [];
                    remoteIds.forEach((id) => state.completed.add(id));
                }
                Object.entries(LEGACY_LOCAL_PREFIXES).forEach(([key, prefix]) => {
                    if (state.preferences[key] != null) return;
                    const raw = localStorage.getItem(prefix + ":" + scopedOwner);
                    if (raw == null) return;
                    if (["homeViewMode", "babyBirthdate"].includes(key)) state.preferences[key] = raw;
                    else {
                        try { state.preferences[key] = JSON.parse(raw); }
                        catch (parseError) { /* leave malformed legacy cache unused */ }
                    }
                });
                localStorage.setItem(state.localProgressKey, JSON.stringify(Array.from(state.completed)));
                resolve();
            });
        });
    }

    function saveProgress(state) {
        const readGuides = Array.from(state.completed);
        localStorage.setItem(state.localProgressKey, JSON.stringify(readGuides));
        Object.entries(LEGACY_LOCAL_PREFIXES).forEach(([key, prefix]) => {
            const value = state.preferences[key];
            if (value == null) return;
            localStorage.setItem(
                prefix + ":" + state.progressOwnerKey,
                ["homeViewMode", "babyBirthdate"].includes(key) ? String(value) : JSON.stringify(value)
            );
        });
        if (!buildfire.userData) return Promise.resolve();
        state.progressData = {
            ...state.progressData,
            readGuides,
            preferences: { ...state.preferences },
            babyBirthdate: state.preferences.babyBirthdate || state.progressData.babyBirthdate || null,
            collapsedJourneySections: Array.isArray(state.preferences.collapsedJourneySections)
                ? state.preferences.collapsedJourneySections.slice() : (state.progressData.collapsedJourneySections || []),
            completedQuizzes: Array.isArray(state.preferences.completedQuizzes)
                ? state.preferences.completedQuizzes.slice() : (state.progressData.completedQuizzes || [])
        };
        return new Promise((resolve, reject) => {
            buildfire.userData.save(state.progressData, TAGS.progress, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    function bootstrapData(state) {
        return {
            runtime: { version: 1, shellContractVersion: 1, releaseId: state.activeRelease && state.activeRelease.releaseId || null },
            lessons: clone(state.lessons.filter((lesson) => lesson && lesson.slug && lesson.published !== false)),
            quizzes: clone(state.quizzes.filter((quiz) => quiz && quiz.id && quiz.published !== false)),
            journeyData: clone(state.journeyData),
            activeJourney: clone(state.activeJourney),
            progress: {
                readGuideIds: Array.from(state.completed),
                completedQuizIds: clone(state.preferences.completedQuizzes || []),
                collapsedJourneySections: clone(state.preferences.collapsedJourneySections || []),
                readerScrollPositions: clone(state.preferences.readerScrollPositions || {})
            },
            profile: { babyBirthdate: state.preferences.babyBirthdate || null },
            preferences: clone(state.preferences),
            currentUser: publicUser(state.currentUser),
            entitlements: clone(state.entitlements)
        };
    }

    function checkPurchased(productId) {
        return new Promise((resolve) => {
            const iap = buildfire.services && buildfire.services.commerce && buildfire.services.commerce.inAppPurchase;
            if (!iap || typeof iap.checkIsPurchased !== "function") return resolve(false);
            iap.checkIsPurchased({ productId, type: "subscriptions" }, (error, purchased) => {
                resolve(!error && purchased === true);
            });
        });
    }

    async function loadEntitlements(user) {
        const context = buildfire.getContext && buildfire.getContext() || {};
        if (context.device && context.device.platform === "web") {
            return { hasSubscriptions: true, subscriptions: [] };
        }
        const appId = context.appId;
        const appTags = user && user.tags && appId && user.tags[appId];
        if (Array.isArray(appTags) && appTags.some((tag) => {
            return ["bypass", "bypass-purchase", "bypasspurchase"].includes(tag && tag.tagName);
        })) {
            return { hasSubscriptions: true, subscriptions: [], bypass: true };
        }
        const iap = buildfire.services && buildfire.services.commerce && buildfire.services.commerce.inAppPurchase;
        if (!iap || typeof iap.getSubscriptions !== "function") {
            return { hasSubscriptions: false, subscriptions: [] };
        }
        const subscriptions = await new Promise((resolve) => {
            iap.getSubscriptions((error, result) => resolve(error ? [] : (result || [])));
        });
        const purchased = await Promise.all(subscriptions.map((item) => checkPurchased(item.id)));
        return {
            hasSubscriptions: purchased.some(Boolean),
            subscriptions: subscriptions.map((item) => ({ id: item.id, title: item.title || item.name || "" }))
        };
    }

    function injectShellBridge(html) {
        const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data: blob: https:; media-src data: blob: https:; font-src data: https:; frame-src https:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
        const bridge = policy + `<script>(function(){\n` +
            `var seq=0,pending={},initialResolve;var initial=new Promise(function(r){initialResolve=r;});\n` +
            `function send(action,payload){return new Promise(function(resolve,reject){var id='g'+(++seq);pending[id]={resolve:resolve,reject:reject};parent.postMessage({source:'guides-shell',type:'request',id:id,action:action,payload:payload||{}},'*');});}\n` +
            `window.GuidesAPI={version:1,getInitialData:function(){return initial;},setGuideCompleted:function(slug,completed){return send('setGuideCompleted',{slug:slug,completed:completed});},setQuizCompleted:function(id,completed){return send('setQuizCompleted',{id:id,completed:completed});},setBirthdate:function(value){return send('setBirthdate',{value:value});},savePreference:function(key,value){return send('savePreference',{key:key,value:value});},goBack:function(){return send('goBack');},openUrl:function(url){return send('openUrl',{url:url});},openActionItem:function(action){return send('openActionItem',{action:action});},openPaywall:function(){return send('openPaywall');},subscribe:function(fn){window.addEventListener('guides:data',function(e){fn(e.detail);});},onBack:function(fn){window.addEventListener('guides:back',fn);}};\n` +
            `window.addEventListener('message',function(e){var m=e.data||{};if(m.source!=='guides-runtime')return;if(m.type==='init'){window.__GUIDES_INITIAL_DATA__=m.data;initialResolve(m.data);window.dispatchEvent(new CustomEvent('guides:data',{detail:m.data}));}if(m.type==='back'){window.dispatchEvent(new CustomEvent('guides:back'));}if(m.type==='response'&&pending[m.id]){var p=pending[m.id];delete pending[m.id];m.error?p.reject(new Error(m.error)):p.resolve(m.data);}});\n` +
            `window.addEventListener('error',function(e){parent.postMessage({source:'guides-shell',type:'error',message:e.message||'Shell error'},'*');});\n` +
            `parent.postMessage({source:'guides-shell',type:'ready',contractVersion:1},'*');\n` +
            `}());<\/script>`;
        return /<head\b[^>]*>/i.test(html)
            ? html.replace(/<head\b[^>]*>/i, (head) => head + bridge)
            : bridge + html;
    }

    function sendFrame(frame, message) {
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ source: "guides-runtime", ...message }, "*");
    }

    function openUrl(url) {
        const safe = String(url || "").trim();
        if (!/^https?:\/\//i.test(safe)) throw new Error("Only http and https links are supported.");
        if (buildfire.navigation && typeof buildfire.navigation.openWindow === "function") {
            buildfire.navigation.openWindow(safe, "_blank");
        } else {
            window.open(safe, "_blank", "noopener");
        }
    }

    function navigateAppHome() {
        if (buildfire.navigation && typeof buildfire.navigation.navigateHome === "function") {
            buildfire.navigation.navigateHome();
        }
    }

    function renderContractShell(app, html, state) {
        app.innerHTML = "";
        const frame = document.createElement("iframe");
        frame.title = "Interactive guides";
        frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals");
        frame.style.cssText = "display:block;width:100%;min-height:100vh;border:0;background:#fff";
        state.frame = frame;
        app.appendChild(frame);

        let ready = false;
        let fallbackTimer;
        const onMessage = async (event) => {
            if (event.source !== frame.contentWindow) return;
            const message = event.data || {};
            if (message.source !== "guides-shell") return;
            if (message.type === "ready") {
                ready = true;
                clearTimeout(fallbackTimer);
                sendFrame(frame, { type: "init", data: bootstrapData(state) });
                return;
            }
            if (message.type === "error") {
                console.error("Uploaded guide shell error:", message.message);
                return;
            }
            if (message.type !== "request") return;
            try {
                let result = null;
                if (message.action === "setGuideCompleted") {
                    const slug = String(message.payload && message.payload.slug || "");
                    if (!state.lessons.some((lesson) => lesson.slug === slug)) throw new Error("Unknown guide ID.");
                    if (message.payload.completed === false) state.completed.delete(slug);
                    else state.completed.add(slug);
                    await saveProgress(state);
                    result = bootstrapData(state).progress;
                } else if (message.action === "setQuizCompleted") {
                    const id = String(message.payload && message.payload.id || "").trim();
                    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(id)) throw new Error("Invalid quiz ID.");
                    const completed = new Set(state.preferences.completedQuizzes || []);
                    message.payload.completed === false ? completed.delete(id) : completed.add(id);
                    state.preferences.completedQuizzes = Array.from(completed);
                    await saveProgress(state);
                    result = bootstrapData(state).progress;
                } else if (message.action === "setBirthdate") {
                    const value = String(message.payload && message.payload.value || "");
                    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Birthdate must use YYYY-MM-DD.");
                    if (value && new Date(value + "T00:00:00") > new Date()) throw new Error("Birthdate cannot be in the future.");
                    state.preferences.babyBirthdate = value || null;
                    await saveProgress(state);
                    result = bootstrapData(state).profile;
                } else if (message.action === "savePreference") {
                    const key = String(message.payload && message.payload.key || "").trim();
                    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(key)) throw new Error("Invalid preference key.");
                    state.preferences[key] = clone(message.payload.value);
                    await saveProgress(state);
                    result = clone(state.preferences);
                } else if (message.action === "goBack") {
                    navigateAppHome();
                } else if (message.action === "openUrl") {
                    openUrl(message.payload && message.payload.url);
                } else if (message.action === "openActionItem") {
                    const action = message.payload && message.payload.action;
                    if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("Invalid action item.");
                    if (!buildfire.actionItems || typeof buildfire.actionItems.execute !== "function") {
                        throw new Error("Action items are unavailable.");
                    }
                    buildfire.actionItems.execute(action, () => { });
                } else if (message.action === "openPaywall") {
                    if (!buildfire.navigation || typeof buildfire.navigation.navigateTo !== "function") {
                        throw new Error("Subscription screen is unavailable.");
                    }
                    const context = buildfire.getContext && buildfire.getContext() || {};
                    buildfire.navigation.navigateTo({
                        pluginId: "ccd96f38-4fe8-4751-b0dd-d7320f43a417",
                        queryString: context.instanceId ? "instanceId=" + encodeURIComponent(context.instanceId) : ""
                    });
                } else {
                    throw new Error("Unsupported GuidesAPI action: " + message.action);
                }
                sendFrame(frame, { type: "response", id: message.id, data: result });
            } catch (error) {
                sendFrame(frame, { type: "response", id: message.id, error: error.message || String(error) });
            }
        };
        window.addEventListener("message", onMessage);
        frame.addEventListener("load", () => {
            try {
                const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
                frame.style.minHeight = height + "px";
            } catch (error) { /* sandboxed frame */ }
        });
        frame.srcdoc = injectShellBridge(html);
        if (buildfire.navigation) {
            buildfire.navigation.onBackButtonClick = () => sendFrame(frame, { type: "back" });
        }
        fallbackTimer = setTimeout(() => {
            if (!ready) {
                window.removeEventListener("message", onMessage);
                console.error("Uploaded guide shell did not complete the contract handshake; using the built-in renderer.");
                renderBuiltIn(app, state, "The uploaded design could not start, so a safe fallback is shown.");
            }
        }, 5000);
    }

    function renderLegacy(html) {
        const bootstrap = '<script>(function(){if(typeof buildfire!=="undefined"&&buildfire._postMessageHandler){window.removeEventListener("message",buildfire._postMessageHandler,false);window.addEventListener("message",buildfire._postMessageHandler,false);}}());<\/script>';
        const hydrated = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => head + bootstrap) : bootstrap + html;
        document.open();
        document.write(hydrated);
        document.close();
    }

    function renderBuiltIn(app, state, notice) {
        const published = state.lessons.filter((lesson) => lesson && lesson.slug && lesson.published !== false);
        const byId = new Map(published.map((lesson) => [lesson.slug, lesson]));
        const configured = state.activeJourney && Array.isArray(state.activeJourney.sections) ? state.activeJourney.sections : [];
        const seen = new Set();
        const sections = configured.map((section) => {
            const lessons = (section.lessonIds || []).map((id) => byId.get(id)).filter(Boolean);
            lessons.forEach((lesson) => seen.add(lesson.slug));
            return { ...section, lessons };
        });
        const remaining = published.filter((lesson) => !seen.has(lesson.slug));
        if (remaining.length) sections.push({ id: "library", title: sections.length ? "More guides" : "All guides", lessons: remaining });
        let activeScreen = "home";

        function home() {
            activeScreen = "home";
            const completedCount = published.filter((lesson) => state.completed.has(lesson.slug)).length;
            app.innerHTML = (notice ? '<div style="padding:10px 14px;background:#fff4d6;color:#704f00;font:13px sans-serif">' + escapeHtml(notice) + '</div>' : '') +
                '<section><header class="home-header"><div class="home-header-inner"><div class="eyebrow">Your journey</div><h1>' +
                escapeHtml(state.activeJourney && state.activeJourney.title || "Interactive guides") + '</h1><p>' +
                escapeHtml(state.activeJourney && state.activeJourney.description || "Explore all available guides.") + '</p></div></header><div class="content">' +
                '<div class="progress-card"><div class="progress-row"><span>Journey progress</span><span>' + completedCount + ' of ' + published.length +
                '</span></div><div class="progress-track"><div class="progress-fill" style="width:' + (published.length ? Math.round(completedCount / published.length * 100) : 0) + '%"></div></div></div>' +
                sections.map((section) => '<section class="journey-section"><div class="section-title"><span class="section-icon">•</span><span class="section-heading"><span>' + escapeHtml(section.title || section.id) + '</span></span></div><div class="lesson-list">' +
                    section.lessons.map((lesson) => '<button class="lesson' + (state.completed.has(lesson.slug) ? ' done' : '') + '" data-lesson-id="' + escapeHtml(lesson.slug) + '"><span class="lesson-mark">' + (state.completed.has(lesson.slug) ? '✓' : '•') + '</span><span class="lesson-copy"><strong>' + escapeHtml(lesson.title) + '</strong><span>' + escapeHtml(lesson.readTime || '') + '</span></span><span class="lesson-arrow">›</span></button>').join('') + '</div></section>').join('') + '</div></section>';
            app.querySelectorAll("[data-lesson-id]").forEach((button) => button.addEventListener("click", () => reader(button.dataset.lessonId)));
        }

        function reader(slug) {
            const lesson = byId.get(slug);
            if (!lesson) return home();
            activeScreen = "reader";
            app.innerHTML = '<article class="reader"><nav class="reader-nav"><button class="back" id="runtime-back">‹</button><strong>' + escapeHtml(lesson.title) + '</strong></nav><main class="reader-main"><div class="reader-meta">' + escapeHtml([lesson.tag, lesson.readTime].filter(Boolean).join(" · ")) + '</div><h1>' + escapeHtml(lesson.title) + '</h1><div class="rich-text" id="runtime-content">' + (lesson.bodyHtml || '') + '</div><button class="complete' + (state.completed.has(slug) ? ' done' : '') + '" id="runtime-complete">' + (state.completed.has(slug) ? '✓ Completed' : 'Mark as completed') + '</button></main></article>';
            document.getElementById("runtime-back").addEventListener("click", home);
            document.getElementById("runtime-complete").addEventListener("click", async () => {
                state.completed.has(slug) ? state.completed.delete(slug) : state.completed.add(slug);
                await saveProgress(state).catch(console.error);
                reader(slug);
            });
            prepareGuideContent(document.getElementById("runtime-content"));
        }

        if (buildfire.navigation) {
            buildfire.navigation.onBackButtonClick = () => {
                if (activeScreen === "reader") home();
                else navigateAppHome();
            };
        }

        if (!published.length) {
            app.innerHTML = '<section class="state"><h1>No guides published</h1><p>Add and publish guides from the Content section.</p></section>';
        } else home();
    }

    async function findActiveShell(releaseState) {
        if (!releaseState || !releaseState.activeReleaseId) return null;
        const revisions = await searchAll(TAGS.shells);
        return revisions.find((revision) => revision && revision.releaseId === releaseState.activeReleaseId) || null;
    }

    async function run() {
        const app = document.getElementById("app");
        const state = createState();
        try {
            const [lessons, quizzes, journeyData, releaseState, legacyHtml] = await Promise.all([
                searchAll(TAGS.lessons),
                searchAll(TAGS.quizzes),
                getData(TAGS.journeys),
                getData(TAGS.releaseState),
                getData(TAGS.legacyHtml),
                loadProgress(state)
            ]);
            state.lessons = lessons;
            state.quizzes = quizzes;
            state.entitlements = await loadEntitlements(state.currentUser).catch((error) => {
                console.error("Unable to resolve guide subscriptions", error);
                return { hasSubscriptions: false, subscriptions: [] };
            });
            state.journeyData = journeyData || { journeys: [] };
            const publishedJourneys = (state.journeyData.journeys || []).filter((journey) => journey.published !== false);
            state.activeJourney = publishedJourneys.find((journey) => journey.id === state.journeyData.defaultJourneyId) || publishedJourneys[0] || null;
            const activeShell = await findActiveShell(releaseState);
            state.activeRelease = activeShell;
            if (activeShell && typeof activeShell.html === "string" && shellContract(activeShell.html) >= 1) {
                renderContractShell(app, activeShell.html, state);
            } else if (activeShell && typeof activeShell.html === "string") {
                renderLegacy(activeShell.html);
            } else if (legacyHtml && typeof legacyHtml.html === "string" && legacyHtml.html.trim()) {
                renderLegacy(legacyHtml.html);
            } else {
                renderBuiltIn(app, state);
            }
        } catch (error) {
            console.error("Unable to start guide release runtime", error);
            app.innerHTML = '<section class="state"><h1>Guides unavailable</h1><p>The content could not be loaded. Please try again.</p></section>';
        }
    }

    global.GuidesReleaseRuntime = {
        start() {
            if (started) return true;
            started = true;
            run();
            if (buildfire.datastore && typeof buildfire.datastore.onUpdate === "function") {
                buildfire.datastore.onUpdate(() => window.location.reload());
            }
            if (buildfire.auth) {
                if (typeof buildfire.auth.onLogin === "function") buildfire.auth.onLogin(() => window.location.reload());
                if (typeof buildfire.auth.onLogout === "function") buildfire.auth.onLogout(() => window.location.reload());
            }
            return true;
        }
    };
}(window));
