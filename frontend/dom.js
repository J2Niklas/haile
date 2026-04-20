/**
 * HAILE — DOM References & UI Helpers
 */

import { state } from './state.js';
import { parseProductTags, createProductCard, createComparisonCard } from './products.js';

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
export const btnToggleTranscript = document.getElementById('btn-toggle-transcript');

// ── Transcript toggle ──

const chatOverlay = document.querySelector('.chat-overlay');
const transcriptIconShow = document.getElementById('transcript-icon-show');
const transcriptIconHide = document.getElementById('transcript-icon-hide');

export function toggleTranscript() {
    const isHidden = chatOverlay.classList.toggle('transcript-hidden');
    transcriptIconShow.classList.toggle('hidden', isHidden);
    transcriptIconHide.classList.toggle('hidden', !isHidden);
}

if (btnToggleTranscript) {
    btnToggleTranscript.addEventListener('click', toggleTranscript);
}

// Start with transcript hidden by default
if (chatOverlay) {
    chatOverlay.classList.add('transcript-hidden');
}
if (transcriptIconShow) transcriptIconShow.classList.add('hidden');
if (transcriptIconHide) transcriptIconHide.classList.remove('hidden');

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

export function appendToAssistantBubble(text, meta) {
    if (!state.currentAssistantBubble) startAssistantBubble();

    // Strip any remaining product/compare tags from display text
    const { cleanText } = parseProductTags(text);

    if (state.currentAssistantText) state.currentAssistantText += ' ';
    state.currentAssistantText += cleanText;
    const p = state.currentAssistantBubble.querySelector('p');
    if (p) p.textContent = state.currentAssistantText;

    // Render product or comparison card if metadata present
    const productId = meta?.productId;
    const compareIds = meta?.compareIds;

    if (compareIds && compareIds.length >= 2) {
        attachProductCardToBubble(null, compareIds);
    } else if (productId) {
        attachProductCardToBubble(productId, null);
    }

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function attachProductCardToBubble(productId, compareIds) {
    if (!state.currentAssistantBubble) return;

    // Don't add duplicate cards
    if (state.currentAssistantBubble.querySelector('.product-card, .comparison-card')) return;

    let cardEl;
    if (compareIds && compareIds.length >= 2) {
        cardEl = createComparisonCard(compareIds);
    } else if (productId) {
        cardEl = createProductCard(productId);
    }

    if (cardEl) {
        state.currentAssistantBubble.appendChild(cardEl);
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    }
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
