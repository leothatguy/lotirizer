# Lotirizer Chrome Extension

Lotirizer is an AI-powered Chrome Extension built with Manifest V3 that extracts meaningful content from any webpage and generates a concise, structured summary using Google's Gemini API.

## Features
- **Clean Extraction**: Uses heuristic DOM parsing to prioritize main articles and avoid sidebars/navbars.
- **AI Summarization**: Integrates with Gemini 1.5 Flash/Pro for fast, high-quality bullet-point summaries and estimated reading time.
- **Secure Architecture**: API keys are saved locally and securely via an Options page; no secrets are hardcoded.
- **Performance**: Caches summaries per URL to avoid duplicate API calls.
- **Premium UX**: Responsive popup with loading states, error handling, clean typography, and a copy-to-clipboard feature.

---

## Setup Instructions

This extension is intended for local installation (developer mode). 

1. **Clone or Download the Repository**
   Download the source code to a local directory on your machine.

2. **Set Up the Proxy Server**
   - The extension relies on a backend proxy server to securely communicate with the Gemini API.
   - Navigate to the `proxy` directory in the repository:
     ```bash
     cd proxy
     ```
   - Install dependencies:
     ```bash
     npm install
     ```
   - Edit the `.env` file and replace `your_api_key_here` with your actual Gemini API Key.
   - Start the proxy server:
     ```bash
     npm start
     ```
   - The proxy will run on `http://localhost:3000`.

3. **Install the Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in the top right corner).
   - Click **Load unpacked** in the top left.
   - Select the root directory containing the extension files (where `manifest.json` is located).

4. **Usage**
   - Ensure the proxy server is running.
   - Pin the extension to your toolbar for easy access.
   - Navigate to any article or text-heavy webpage.
   - Click the extension icon and click **Summarize Page**.

---

## Architecture

The extension is structured using **Manifest V3** standard practices, emphasizing modularity and security:

1. **Popup (`popup/`)**: The user interface. Built with vanilla HTML, CSS, and JS. Handles user interactions, displaying loading states, rendering the final markdown summary, and caching cache clearance.
2. **Content Script (`content/content.js`)**: Injected on-demand into the active tab. It clones the main DOM, purges unwanted tags (`<nav>`, `<footer>`, `<aside>`, `<script>`, etc.), and extracts clean readable text up to a set token limit.
3. **Background Service Worker (`background/background.js`)**: The secure intermediary. It retrieves the saved API key from `chrome.storage.local`, constructs the prompt, makes the network request to the Gemini API, caches the result, and returns the markdown payload to the popup.
4. **Options Page (`options/`)**: A dedicated configuration page allowing the user to input and securely save their API Key and preferred AI model.

---

## AI Integration

The extension integrates directly with the **Google Gemini API** (`generativelanguage.googleapis.com`).
- The content script extracts up to ~20,000 characters from the webpage to ensure the prompt stays within token limits.
- The background script uses a structured prompt instructing the AI to provide:
  - A brief 1-2 sentence overview.
  - Key insights formatted as bullet points.
  - An estimated reading time based on an average of 238 WPM.
- The response format is strictly Markdown, which is then parsed by a lightweight custom parser in `popup.js` to render HTML.

---

## Security Decisions

1. **No Hardcoded Secrets**: The API key is never hardcoded or committed to the repository. The user must provide their own key via the Options page.
2. **Local Storage**: The API key is stored in `chrome.storage.local`, meaning it never leaves the user's local device.
3. **Background API Calls**: Network requests to the Gemini API are handled exclusively by the Background Service Worker. This prevents the API key from ever being injected into or exposed to the webpage DOM or the content script.
4. **Minimal Permissions**: The extension only uses the `activeTab` permission instead of broad host permissions (`<all_urls>`). The content script is injected programmatically only when the user explicitly clicks the "Summarize Page" button, protecting user privacy.
5. **Sanitization**: Output from the AI is lightly sanitized by escaping raw HTML tags before parsing the markdown to prevent potential XSS vulnerabilities in the popup.

---

## Trade-offs

1. **Heuristic DOM Parsing vs. Readability Library**: 
   - *Decision*: I used a custom heuristic DOM parsing script instead of a heavy library like Mozilla's Readability.
   - *Trade-off*: It keeps the extension extremely lightweight and fast, but might occasionally capture unrelated snippets on heavily disorganized webpages.
2. **Custom Regex Markdown Parser vs. Marked.js**: 
   - *Decision*: A tiny custom regex parser is used to convert the Gemini markdown into HTML.
   - *Trade-off*: Avoids adding external dependencies to the extension, but only supports a subset of Markdown (headers, bold, italics, lists, paragraphs). For this specific prompt, this subset is perfectly sufficient.
3. **Direct API Call vs. Proxy Server**:
   - *Decision*: The extension calls the Gemini API directly from the background script using a user-provided API key.
   - *Trade-off*: Requires the user to bring their own key (BYOK), which adds friction to setup. However, it completely eliminates the need to host, maintain, and secure a backend proxy server, making it a perfect architecture for a standalone local extension.

---

## Demo Video

> **Note to user:** Please record a 2-5 minute demo video showing the installation process, entering the API key in the options page, and summarizing an article. Link the video here.
