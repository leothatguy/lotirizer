chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarize(request.url, request.content, request.title)
      .then(result => sendResponse(result))
      .catch(error =>
        sendResponse({ error: error.message || 'An error occurred during summarization.' })
      );

    return true; // keep channel open for async response
  }
});

async function handleSummarize(url, content, title) {
  if (!content || content.trim().length < 50) {
    throw new Error('Not enough content found on this page to summarize.');
  }

  const normalizedUrl = safeNormalizeUrl(url);
  const cacheKey = `summary_${normalizedUrl}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) {
    return { summary: cached[cacheKey], cached: true };
  }

  const apiUrl = 'https://lotirizer-be-production.up.railway.app/api/summarize';
  const estimatedReadMinutes = Math.max(1, Math.ceil(countWords(content) / 238));

  const prompt = `You are an expert AI summarizer. Read the page content and return a clear, structured markdown summary.
Requirements:
1. Overview: Write 1-2 complete sentences that capture the main point.
2. Key Insights: Provide 4-6 bullet points with concrete details.
3. Add a final line exactly in this format: "Estimated Reading Time: ${estimatedReadMinutes} min read".

Please use markdown formatting for the response.

Page Title: ${title}

Content:
${content}
`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, prompt }),
      signal: controller.signal
    });

    if (!response.ok) {
      let message = `API request failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        message = errorData?.error?.message || errorData?.error || errorData?.message || message;
        if (response.status === 429) {
          const waitSeconds = errorData?.retryAfterSeconds;
          if (waitSeconds && Number.isFinite(waitSeconds)) {
            message = `Rate limit reached. Please try again in about ${waitSeconds} seconds.`;
          } else if (message === `API request failed with status ${response.status}`) {
            message = 'Rate limit reached. Please wait a bit and try again.';
          }
        }
      } catch {
        const text = await response.text();
        if (text) message = text;
        if (response.status === 429 && !text) {
          message = 'Rate limit reached. Please wait a bit and try again.';
        }
      }
      throw new Error(message);
    }

    const data = await response.json();
    let summaryText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summaryText) {
      throw new Error('Unexpected response format from Gemini API.');
    }

    if (countSentences(summaryText) < 1 || !containsBulletList(summaryText)) {
      const expansionPrompt = `${prompt}

Important correction: keep the Overview to 1-2 sentences and ensure Key Insights are returned as a bullet list with concrete points.`;
      const expansionResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, prompt: expansionPrompt }),
        signal: controller.signal
      });

      if (expansionResponse.ok) {
        const expansionData = await expansionResponse.json();
        const expandedText = expansionData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (expandedText) {
          summaryText = expandedText;
        }
      }
    }

    if (!/estimated\s+reading\s+time:/i.test(summaryText)) {
      summaryText = `${summaryText}\n\nEstimated Reading Time: ${estimatedReadMinutes} min read`;
    }

    await chrome.storage.local.set({ [cacheKey]: summaryText });
    return { summary: summaryText, cached: false };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Summarization request timed out. Please try again.');
    }
    console.error('API Error:', err);
    throw new Error(err.message || 'Unknown summarization error');
  } finally {
    clearTimeout(timeout);
  }
}

function safeNormalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    return u.toString();
  } catch {
    return rawUrl || 'unknown';
  }
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countSentences(text) {
  if (!text) return 0;
  const matches = text.match(/[.!?]+(\s|$)/g);
  return matches ? matches.length : 0;
}

function containsBulletList(text) {
  if (!text) return false;
  return /^(\s*[-*]|\s*\d+\.)\s+/m.test(text);
}
