/**
 * HAILE — Chat / Send Message
 *
 * Handles message sending via SSE (fallback) and Realtime WebSocket.
 */

import { API_BASE } from './config.js';
import { state } from './state.js';
import { chatInput, addBubble, startAssistantBubble, authHeaders } from './dom.js';
import { stopSpeaking, queueAvatarSentence, markResponseStreamComplete } from './speech.js';
import { getSelectedLanguage } from './language.js';

// ── SSE stream reader ──

async function readSSEStream(response, handlers) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (handlers[currentEvent]) handlers[currentEvent](data);
                } catch (e) {
                    console.warn('SSE parse error:', e, line);
                }
                currentEvent = '';
            }
        }
    }
}

// ── Send message ──

export async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Prevent concurrent sends (STT can fire overlapping recognized events)
    if (state.isSending) return;
    state.isSending = true;

    chatInput.value = '';
    state.finalizedText = '';

    if (state.isSpeaking) stopSpeaking();
    state.speakingAborted = false;
    state.audioAttachedForResponse = false;

    // Reset STT text state (mic keeps running if enabled)
    state.onResetSttText();

    // Realtime mode: send text via WebSocket
    if (state.realtimeMode && state.realtimeWs?.readyState === WebSocket.OPEN) {
        addBubble('user', text);
        state.conversationMessages.push({ role: 'user', content: text });
        state.responseStreamComplete = false;
        // Suppress mic audio immediately to prevent the avatar's upcoming
        // speech from being picked up and triggering a false barge-in.
        state.muteRealtimeMic = true;
        state.realtimeWs.send(JSON.stringify({ type: 'text_input', text, language: getSelectedLanguage() }));
        state.isSending = false;
        return;
    }

    // SSE mode
    addBubble('user', text);
    state.conversationMessages.push({ role: 'user', content: text });
    state.responseStreamComplete = false;
    startAssistantBubble();

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ messages: state.conversationMessages, language: getSelectedLanguage() }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Request failed' }));
            addBubble('system', `Error: ${err.error || response.statusText}`);
            return;
        }

        let fullReply = '';

        await readSSEStream(response, {
            sentence(data) {
                if (state.speakingAborted) return;
                const meta = {};
                if (data.productId) meta.productId = data.productId;
                if (data.compareIds) meta.compareIds = data.compareIds;
                queueAvatarSentence(data.ssml, data.sentence, meta);
            },
            done(data) {
                fullReply = data.fullReply || state.currentAssistantText;
                markResponseStreamComplete();
            },
            error(data) {
                addBubble('system', `Error: ${data.error}`);
            },
        });

        if (fullReply || state.currentAssistantText) {
            state.conversationMessages.push({
                role: 'assistant',
                content: fullReply || state.currentAssistantText,
            });
        }
    } catch (err) {
        addBubble('system', `Network error: ${err.message}`);
    }

    state.currentAssistantBubble = null;
    state.isSending = false;
}
