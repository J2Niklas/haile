/**
 * HAILE — Auth Gate
 */

import { API_BASE } from './config.js';
import { state } from './state.js';

export function initAuthGate() {
    const gate = document.getElementById('auth-gate');
    const input = document.getElementById('auth-input');
    const submit = document.getElementById('auth-submit');
    const error = document.getElementById('auth-error');

    // Already have token — validate it
    if (state.authToken) {
        gate.classList.add('hidden');
        (async function validateToken() {
            try {
                const resp = await fetch(`${API_BASE}/speech_token`, {
                    headers: { Authorization: `Bearer ${state.authToken}` },
                });
                if (resp.status === 401) {
                    sessionStorage.removeItem('haile-auth-token');
                    state.authToken = '';
                    gate.classList.remove('hidden');
                    input.focus();
                }
            } catch (_) {
                /* ignore */
            }
        })();
        return;
    }

    // Try empty-pin auto-login (no PIN configured → auto-pass)
    (async function autoLogin() {
        try {
            const resp = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: '' }),
            });
            const data = await resp.json();
            if (resp.ok && data.token) {
                state.authToken = data.token;
                sessionStorage.setItem('haile-auth-token', state.authToken);
                gate.classList.add('hidden');
                return;
            }
        } catch (_) {
            /* ignore */
        }
        input.focus();
    })();

    async function tryAuth() {
        const pin = input.value;
        if (!pin) return;
        submit.disabled = true;
        error.style.display = 'none';
        try {
            const resp = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin }),
            });
            const data = await resp.json();
            if (resp.ok && data.token) {
                state.authToken = data.token;
                sessionStorage.setItem('haile-auth-token', state.authToken);
                gate.classList.add('hidden');
            } else {
                error.textContent = data.error || 'Invalid access code';
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        } catch (err) {
            error.textContent = 'Connection error';
            error.style.display = 'block';
        }
        submit.disabled = false;
    }

    submit.addEventListener('click', tryAuth);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryAuth();
    });
}
