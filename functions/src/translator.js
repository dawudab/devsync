import { logger } from 'firebase-functions';
import { buildTranslationPrompt, coerceTranslation, heuristicTranslate, TRANSLATION_SCHEMA } from './shared/translator-core.js';

/**
 * Translates a normalized change into an owner-friendly summary using Gemini.
 * Falls back to the deterministic heuristic translator when no key is configured or the call fails,
 * so the feed never breaks because of the AI layer.
 */
export async function translateChange(change, { apiKey, model }) {
  if (!apiKey || apiKey === 'disabled') return heuristicTranslate(change);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildTranslationPrompt(change) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: TRANSLATION_SCHEMA },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`Gemini responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('');
    if (!text) throw new Error(`Empty Gemini response (finishReason=${data.candidates?.[0]?.finishReason})`);
    return { ...coerceTranslation(JSON.parse(text), change), model };
  } catch (err) {
    logger.warn('Gemini translation failed, using heuristic fallback', { error: err.message });
    return heuristicTranslate(change);
  }
}
