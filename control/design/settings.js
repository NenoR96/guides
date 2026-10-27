(function () {
    'use strict';
    const api = window.GuidesTranslations;
    const fields = document.getElementById('appearance-fields');
    const status = document.getElementById('status');
    const colors = { background: 'Page background', green: 'Green / completed accent', blue: 'Blue / quiz accent', heading: 'Section titles', counter: 'Counter text', counterBackground: 'Counter background', completedBackground: 'Completed button background' };
    const editableKeys = ['achievementEnabled', ...Object.keys(colors)];
    for (const [key, title] of Object.entries(colors)) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'color'; input.id = key;
        label.append(input, document.createTextNode(title));
        document.getElementById('colors').append(label);
    }
    function values() {
        return Object.fromEntries(editableKeys.map(key => {
            const input = document.getElementById(key);
            return [key, input.type === 'checkbox' ? input.checked : input.value.trim()];
        }));
    }
    buildfire.datastore.get(api.tag, (error, result) => {
        if (error) { status.textContent = 'Unable to load settings. Reload to try again.'; return; }
        const config = api.appearance(result && result.data && result.data.appearance);
        for (const key of editableKeys) {
            const value = config[key];
            const input = document.getElementById(key);
            if (input.type === 'checkbox') input.checked = value;
            else input.value = value;
        }
        fields.disabled = false; status.textContent = '';
    });
    document.getElementById('appearance-form').addEventListener('submit', event => {
        event.preventDefault();
        const config = values();
        fields.disabled = true; status.textContent = 'Saving settings…';
        buildfire.datastore.get(api.tag, (error, result) => {
            if (error) { fields.disabled = false; status.textContent = 'Unable to load current settings. Nothing was saved.'; return; }
            const latest = result && result.data || {};
            buildfire.datastore.save({ ...latest, appearance: { ...latest.appearance, ...config } }, api.tag, error => {
                fields.disabled = false;
                status.textContent = error ? 'Unable to save settings. Try again.' : 'Appearance saved. Reopen the widget to apply.';
                if (!error && buildfire.messaging) buildfire.messaging.sendMessageToWidget({ type: 'guides-release-published' });
            });
        });
    });
}());
