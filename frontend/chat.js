/**
 * HAILE — Chat / Send Message
 *
 * Handles message sending via SSE (fallback) and Realtime WebSocket.
 */

import { API_BASE } from './config.js';
import { state } from './state.js';
import { chatInput, addBubble, startAssistantBubble, authHeaders } from './dom.js';
import { stopSpeaking, queueAvatarSentence } from './speech.js';

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

    chatInput.value = '';
    state.finalizedText = '';

    if (state.isSpeaking) stopSpeaking();
    state.speakingAborted = false;
    state.audioAttachedForResponse = false;

    // Stop listening (via callback to avoid circular import)
    state.onStopListening();

    // Realtime mode: send text via WebSocket
    if (state.realtimeMode && state.realtimeWs?.readyState === WebSocket.OPEN) {
        addBubble('user', text);
        state.conversationMessages.push({ role: 'user', content: text });
        state.realtimeWs.send(JSON.stringify({ type: 'text_input', text }));
        return;
    }

    // SSE mode
    addBubble('user', text);
    state.conversationMessages.push({ role: 'user', content: text });
    startAssistantBubble();

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ messages: state.conversationMessages }),
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
                queueAvatarSentence(data.ssml, data.sentence);
            },
            done(data) {
                fullReply = data.fullReply || state.currentAssistantText;
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
}
