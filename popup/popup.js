document.addEventListener('DOMContentLoaded', async () => {
    const pageTitleEl = document.getElementById('pageTitle');
    const summarizeBtn = document.getElementById('summarizeBtn');
    
    const actionArea = document.getElementById('actionArea');
    const loadingArea = document.getElementById('loadingArea');
    const errorArea = document.getElementById('errorArea');
    const errorMessageEl = document.getElementById('errorMessage');
    const resultArea = document.getElementById('resultArea');
    const summaryContent = document.getElementById('summaryContent');
    
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
        
        errorMessageEl.innerHTML = '';
        errorMessageEl.textContent = message;
        errorArea.classList.remove('hidden');
    }

    function displaySummary(text) {
        rawSummaryText = text;
        loadingArea.classList.add('hidden');
        errorArea.classList.add('hidden');
        actionArea.classList.add('hidden');
        
        summaryContent.innerHTML = parseMarkdown(text);
        resultArea.classList.remove('hidden');
    }

    function showAction() {
        loadingArea.classList.add('hidden');
        errorArea.classList.add('hidden');
        resultArea.classList.add('hidden');
        actionArea.classList.remove('hidden');
    }

    // Extremely simple regex markdown parser
    function parseMarkdown(md) {
        let html = md;
        
        // Escape HTML
        html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Headers
        html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
        
        // Bold and Italic
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Lists
        html = html.replace(/^\s*[-*] (.*)$/gim, '<ul><li>$1</li></ul>');
        html = html.replace(/<\/ul>\n<ul>/g, '\n');
        
        html = html.replace(/^\s*\d+\. (.*)$/gim, '<ol><li>$1</li></ol>');
        html = html.replace(/<\/ol>\n<ol>/g, '\n');

        // Paragraphs
        html = html.replace(/\n\n+/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        
        // Clean up list br tags
        html = html.replace(/<br><ul>/g, '<ul>');
        html = html.replace(/<\/ul><br>/g, '</ul>');
        html = html.replace(/<br><ol>/g, '<ol>');
        html = html.replace(/<\/ol><br>/g, '</ol>');
        html = html.replace(/<br><li>/g, '<li>');
        html = html.replace(/<\/li><br>/g, '</li>');

        return `<p>${html}</p>`.replace(/<p><\/p>/g, '');
    }
});
