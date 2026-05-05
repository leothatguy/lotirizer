function extractPageContent() {
    // Priorities for main content containers
    const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '.post-content',
        '.article-content',
        '.entry-content',
        '#content',
        'body' // Fallback
    ];

    let mainNode = null;
    for (const selector of contentSelectors) {
        const node = document.querySelector(selector);
        if (node) {
            // Avoid selecting a tiny snippet if body is huge, but usually 'article' is best.
            mainNode = node;
            break;
        }
    }

    if (!mainNode) mainNode = document.body;

    // Clone the node so we don't modify the actual page DOM
    const clone = mainNode.cloneNode(true);

    // Remove unwanted elements
    const unwantedSelectors = [
        'nav', 'footer', 'header', 'aside', '.sidebar', '#sidebar', 
        '.comments', '#comments', '.ad', '.ads', '.advertisement',
        'script', 'style', 'noscript', 'iframe', 'svg', 'button', 'form',
        'meta', 'link'
    ];
    
    unwantedSelectors.forEach(selector => {
        try {
            const elements = clone.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        } catch (e) {
            // Ignore invalid selectors
        }
    });

    // Extract text from paragraphs and headings
    const textElements = clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
    let content = '';
    
    if (textElements.length > 0) {
        textElements.forEach(el => {
            const text = el.innerText.trim();
            if (text.length > 20) { // filter out very short/useless strings
                content += text + '\n\n';
            }
        });
    } else {
        content = clone.innerText.trim();
    }

    // Clean up excessive whitespace
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    return {
        title: document.title,
        content: content.substring(0, 20000), // Limit to ~20k characters to avoid exceeding token limits
        url: window.location.href
    };
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractContent') {
        const data = extractPageContent();
        sendResponse(data);
    }
    return true; // Indicates async response (though we send it sync here, good practice)
});
