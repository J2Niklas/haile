/**
 * HAILE — DOM References & UI Helpers
 */

import { state } from './state.js';

// ── Element references ──

export const avatarPlaceholder = document.getElementById('avatar-placeholder');
export const avatarVideo = document.getElementById('avatar-video');
export const statusText = document.getElementById('status-text');
export const speakingIndicator = document.getElementById('speaking-indicator');
export const chatMessagesEl = document.getElementById('chat-messages');
export const chatInput = document.getElementById('chat-input');
export const btnSend = document.getElementById('btn-send');
export const btnMic = document.getElementById('btn-mic');
export const listeningBadge = document.getElementById('listening-badge');

// ── Helpers ──

export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function addBubble(role, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    if (role === 'system') {
        bubble.textContent = text;
    } else {
        bubble.innerHTML = `<p>${escapeHtml(text)}</p>`;
    }
    chatMessagesEl.appendChild(bubble);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return bubble;
}

export function startAssistantBubble() {
    state.currentAssistantText = '';
    state.currentAssistantBubble = document.createElement('div');
    state.currentAssistantBubble.className = 'chat-bubble assistant';
    state.currentAssistantBubble.innerHTML = '<p></p>';
    chatMessagesEl.appendChild(state.currentAssistantBubble);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

export function appendToAssistantBubble(text) {
    if (!state.currentAssistantBubble) startAssistantBubble();
    if (state.currentAssistantText) state.currentAssistantText += ' ';
    state.currentAssistantText += text;
    const p = state.currentAssistantBubble.querySelector('p');
    if (p) p.textContent = state.currentAssistantText;
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

export function setSpeakingIndicator(active) {
    speakingIndicator.classList.toggle('active', active);
}

export function setListeningBadge(active) {
    listeningBadge.classList.toggle('hidden', !active);
}

export function setStatus(text) {
    statusText.textContent = text;
}

export function authHeaders(extra = {}) {
    const h = { ...extra };
    if (state.authToken) h['Authorization'] = `Bearer ${state.authToken}`;
    return h;
}
