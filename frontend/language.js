/**
 * HAILE — Language Selection
 *
 * Manages multi-language support: UI toggle, voice mappings, and STT locale.
 */

import { state } from './state.js';

export const SUPPORTED_LANGUAGES = {
    'en-US': { label: 'English', country: 'gb' },
    'da-DK': { label: 'Dansk', country: 'dk' },
    'de-DE': { label: 'Deutsch', country: 'de' },
    'fr-FR': { label: 'Français', country: 'fr' },
    'es-ES': { label: 'Español', country: 'es' },
    'it-IT': { label: 'Italiano', country: 'it' },
    'pt-PT': { label: 'Português', country: 'pt' },
    'nl-NL': { label: 'Nederlands', country: 'nl' },
    'sv-SE': { label: 'Svenska', country: 'se' },
    'nb-NO': { label: 'Norsk', country: 'no' },
};

const FLAG_CDN = 'https://flagcdn.com/w40';

export function getSelectedLanguage() {
    return state.selectedLanguage || 'en-US';
}

export function getInputLanguage() {
    return state.inputLanguage || 'en-US';
}

export function initLanguageToggle() {
    const toggle = document.getElementById('language-toggle');
    const btn = document.getElementById('btn-language');
    const dropdown = document.getElementById('language-dropdown');
    if (!toggle || !btn || !dropdown) return;

    dropdown.innerHTML = '';
    for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
        const opt = document.createElement('button');
        opt.className = 'language-option' + (code === getSelectedLanguage() ? ' active' : '');
        opt.dataset.lang = code;
        opt.innerHTML = `<img class="lang-flag" src="${FLAG_CDN}/${info.country}.png" alt="${info.country}" />
                         <span class="lang-label">${info.label}</span>`;
        opt.addEventListener('click', () => selectLanguage(code));
        dropdown.appendChild(opt);
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => { dropdown.style.display = 'none'; });
    dropdown.addEventListener('click', (e) => e.stopPropagation());
}

function selectLanguage(code) {
    if (!SUPPORTED_LANGUAGES[code]) return;
    state.selectedLanguage = code;
    updateLanguageFlag();

    const dropdown = document.getElementById('language-dropdown');
    if (dropdown) dropdown.style.display = 'none';

    // On sleep screen: also update the STT input language
    const sleepScreen = document.getElementById('screen-sleep');
    if (sleepScreen && sleepScreen.classList.contains('active')) {
        state.inputLanguage = code;
        // Destroy STT recognizer so it recreates with the new locale
        if (state.sttRecognizer) {
            try { state.sttRecognizer.stopContinuousRecognitionAsync(() => {}, () => {}); } catch (_) { /* */ }
            try { state.sttRecognizer.close(); } catch (_) { /* */ }
            state.sttRecognizer = null;
        }
    }

    // Notify realtime backend of language change (for voice-input responses)
    if (state.realtimeMode && state.realtimeWs && state.realtimeWs.readyState === WebSocket.OPEN) {
        state.realtimeWs.send(JSON.stringify({ type: 'set_language', language: code }));
    }

    console.log('Language selected:', code, SUPPORTED_LANGUAGES[code].label,
        '(input:', state.inputLanguage, ')');
}

function updateLanguageFlag() {
    const flag = document.getElementById('lang-flag');
    const lang = getSelectedLanguage();
    if (flag && SUPPORTED_LANGUAGES[lang]) {
        flag.src = `${FLAG_CDN}/${SUPPORTED_LANGUAGES[lang].country}.png`;
        flag.alt = SUPPORTED_LANGUAGES[lang].country;
    }
    const dropdown = document.getElementById('language-dropdown');
    if (dropdown) {
        dropdown.querySelectorAll('.language-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.lang === lang);
        });
    }
}

export function showLanguageToggle() {
    const toggle = document.getElementById('language-toggle');
    if (toggle) toggle.style.display = 'block';
}

export function hideLanguageToggle() {
    const toggle = document.getElementById('language-toggle');
    if (toggle) toggle.style.display = 'none';
}
