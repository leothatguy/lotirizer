document.addEventListener('DOMContentLoaded', async () => {
    const pageTitleEl = document.getElementById('pageTitle');
    const summarizeBtn = document.getElementById('summarizeBtn');
    
    const actionArea = document.getElementById('actionArea');
    const loadingArea = document.getElementById('loadingArea');
    const errorArea = document.getElementById('errorArea');
    const errorMessageEl = document.getElementById('errorMessage');
    const resultArea = document.getElementById('resultArea');
    const summaryContent = document.getElementById('summaryContent');
    const readTimeTag = document.getElementById('readTimeTag');
    
    const copyBtn = document.getElementById('copyBtn');
    const resetBtn = document.getElementById('resetBtn');

    let currentUrl = '';
    let currentTitle = '';
    let rawSummaryText = '';

    // 1. Get current tab info
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentUrl = tab.url;
        currentTitle = tab.title;
        pageTitleEl.textContent = currentTitle;

        // Check if we already have a cached summary for this URL
        const cacheKey = `summary_${currentUrl}`;
        const cached = await chrome.storage.local.get(cacheKey);
        
        if (cached[cacheKey]) {
            displaySummary(cached[cacheKey]);
        }
    } catch (err) {
        pageTitleEl.textContent = "Unable to get page details.";
    }

    // 2. Event Listeners
    summarizeBtn.addEventListener('click', async () => {
        showLoading();

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
                throw new Error("Cannot summarize browser internal pages.");
            }

            // Inject content script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/content.js']
            });

            // Send message to extract content
            chrome.tabs.sendMessage(tab.id, { action: 'extractContent' }, async (response) => {
                if (chrome.runtime.lastError) {
                    showError("Failed to communicate with page. Please refresh the page and try again.");
                    return;
                }

                if (!response || !response.content) {
                    showError("Could not extract meaningful content from this page.");
                    return;
                }

                // Send content to background for summarization
                chrome.runtime.sendMessage({
                    action: 'summarize',
                    url: response.url,
                    content: response.content,
                    title: response.title
                }, (bgResponse) => {
                    if (chrome.runtime.lastError) {
                        showError("Background service disconnected. Try again.");
                        return;
                    }

                    if (bgResponse && bgResponse.error) {
                        showError(bgResponse.error);
                        return;
                    }

                    if (bgResponse && bgResponse.summary) {
                        displaySummary(bgResponse.summary);
                    } else {
                        showError("Failed to generate summary.");
                    }
                });
            });
        } catch (err) {
            showError(err.message);
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(rawSummaryText).then(() => {
            const originalTitle = copyBtn.title;
            copyBtn.title = "Copied!";
            const svg = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            setTimeout(() => {
                copyBtn.title = originalTitle;
                copyBtn.innerHTML = svg;
            }, 2000);
        });
    });

    resetBtn.addEventListener('click', async () => {
        if (currentUrl) {
            const cacheKey = `summary_${currentUrl}`;
            await chrome.storage.local.remove(cacheKey);
        }
        showAction();
    });

    // 3. UI Functions
    function showLoading() {
        actionArea.classList.add('hidden');
        errorArea.classList.add('hidden');
        resultArea.classList.add('hidden');
        loadingArea.classList.remove('hidden');
    }

    function showError(message) {
        loadingArea.classList.add('hidden');
        resultArea.classList.add('hidden');
        actionArea.classList.remove('hidden');
        readTimeTag.classList.add('hidden');
        readTimeTag.textContent = '';
        
        errorMessageEl.innerHTML = '';
        errorMessageEl.textContent = message;
        errorArea.classList.remove('hidden');
    }

    function displaySummary(text) {
        rawSummaryText = text;
        loadingArea.classList.add('hidden');
        errorArea.classList.add('hidden');
        actionArea.classList.add('hidden');

        const parsedSummary = parseSummarySections(text);
        summaryContent.innerHTML = renderSummaryHtml(parsedSummary);
        if (parsedSummary.readTime) {
            readTimeTag.textContent = parsedSummary.readTime;
            readTimeTag.classList.remove('hidden');
        } else {
            readTimeTag.classList.add('hidden');
            readTimeTag.textContent = '';
        }

        resultArea.classList.remove('hidden');
    }

    function showAction() {
        loadingArea.classList.add('hidden');
        errorArea.classList.add('hidden');
        resultArea.classList.add('hidden');
        actionArea.classList.remove('hidden');
        readTimeTag.classList.add('hidden');
        readTimeTag.textContent = '';
    }

    function parseSummarySections(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        let readTime = '';
        const contentLines = [];
        const insights = [];
        const overviewLines = [];
        let collectingOverview = true;

        for (const rawLine of lines) {
            const line = rawLine.replace(/^#{1,6}\s*/, '').trim();
            const readMatch = line.match(/^estimated\s+reading\s+time\s*:\s*(.+)$/i);
            if (readMatch) {
                readTime = `Read time: ${readMatch[1].trim()}`;
                continue;
            }
            contentLines.push(line);
        }

        for (const line of contentLines) {
            const bulletMatch = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
            if (/^key insights?:?/i.test(line)) {
                collectingOverview = false;
                continue;
            }
            if (bulletMatch) {
                collectingOverview = false;
                insights.push(bulletMatch[1].trim());
                continue;
            }
            if (collectingOverview) {
                overviewLines.push(line);
            } else {
                insights.push(line);
            }
        }

        let overview = overviewLines.join(' ').trim();
        if (!overview) {
            overview = contentLines.find(line => !/^(?:[-*]|\d+\.)\s+/.test(line)) || '';
        }

        if (!insights.length) {
            const fallback = contentLines
                .join(' ')
                .split(/[.!?]\s+/)
                .map(item => item.trim())
                .filter(Boolean)
                .slice(1, 6);
            insights.push(...fallback);
        }

        return { overview, insights, readTime };
    }

    function renderSummaryHtml({ overview, insights }) {
        const renderedInsights = insights
            .filter(Boolean)
            .map(item => `<li>${escapeHtml(item)}</li>`)
            .join('');

        return `
            <section class="summary-section">
                <h4>Overview</h4>
                <p>${escapeHtml(overview || 'No overview available.')}</p>
            </section>
            <section class="summary-section">
                <h4>Key Insights</h4>
                <ul class="insight-list">${renderedInsights || '<li>No insights available.</li>'}</ul>
            </section>
        `;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
