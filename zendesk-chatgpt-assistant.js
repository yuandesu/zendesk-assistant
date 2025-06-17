// ==UserScript==
// @name         Zendesk ChatGPT Multi-Function Assistant 
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  6-in-1 ChatGPT assistant: CC=Confluence, EE=Internal TEE, DD=Datadog Docs, ZZ=Zendesk, JJ=Japanese Improve, TT=Translation
// @match        https://*.zendesk.com/*
// @author       Yuan Chang
// ==/UserScript==

/*
=== USAGE INSTRUCTIONS ===

This script provides six main functions for Zendesk customer support:

1. CONFLUENCE SEARCH (Double-click CC):
   - Select customer message text
   - Quickly double-click the 'C' key twice
   - ChatGPT converts text into a technical question
   - Automatically opens Confluence search with the generated question

2. INTERNAL TEE QUESTION (Double-click EE):
   - Select customer issue text
   - Quickly double-click the 'E' key twice
   - ChatGPT formats text into professional question for internal TEE engineers
   - Question is automatically copied to clipboard
   - Ready to paste into Slack or other communication tools

3. DATADOG DOCS SEARCH (Double-click DD):
   - Select customer issue text
   - Quickly double-click the 'D' key twice
   - ChatGPT extracts Datadog-related keywords from the text
   - Automatically opens Datadog documentation search with extracted keywords

4. ZENDESK SEARCH (Double-click ZZ):
   - Select customer issue text or error logs
   - Quickly double-click the 'Z' key twice
   - For error logs: searches directly with the error message
   - For general issues: ChatGPT extracts relevant keywords
   - Automatically opens Zendesk ticket search

5. JAPANESE TEXT IMPROVEMENT (Double-click JJ):
   - Select Japanese text that needs improvement
   - Quickly double-click the 'J' key twice
   - ChatGPT provides 3 different improvement variations
   - Choose and copy the version you prefer
   - Options: Standard, Polite, Concise styles

6. TEXT TRANSLATION (Double-click TT):
   - Select any text that needs translation
   - Quickly double-click the 'T' key twice
   - ChatGPT translates text (auto-detects language and translates to appropriate target)
   - Translated text is automatically copied to clipboard
   - Supports Japanese ? English translation

Status indicators appear next to selected text:
- ? Processing... (orange)
- ? Done (green)
- ? Copied (blue)
- ? Error (red)

Requirements:
- Valid OpenAI API key configured in the script
- Text must be selected before using keyboard shortcuts
- No modifier keys (Ctrl/Cmd/Alt) should be pressed
- Works with any keyboard layout (detects physical key positions, not characters)

=== END INSTRUCTIONS ===
*/

(function () {
    'use strict';

    console.log('? Zendesk ChatGPT script loaded');

    // Configuration
    const CONFIG = {
        api: {
            key: "YOUR_OPENAI_API_KEY_HERE", // ?? Replace with your actual OpenAI API key
            model: "gpt-4",
            timeout: 30000
        },
        ui: {
            doubleClickDelay: 400,
            statusTimeout: 2000,
            dialogColor: '#632CA6'
        },
        keys: ['c', 'e', 'd', 'z', 'j', 't'],
        searchTypes: {
            c: 'confluence', e: 'internal', d: 'datadog',
            z: 'zendesk', j: 'japanese', t: 'translation'
        },
        urls: {
            confluence: 'https://datadoghq.atlassian.net/wiki/search?text=',
            datadog: 'https://docs.datadoghq.com/search/?lang_pref=en&site=us&s=',
            zendesk: 'https://datadog.zendesk.com/agent/search/1?type=ticket&q='
        },
        messages: {
            internal: 'Question to TEE  (copied to clipboard)',
            japanese: 'Improved Japanese text (copied to clipboard)',
            translation: 'Translated text (copied to clipboard)'
        }
    };

    // Global state
    let keyboardListenerActive = false;
    let selectionChangeListenerActive = false;
    let keydownHandler = null;
    let selectionChangeHandler = null;
    let isProcessing = false;

    // Custom dialog function
    function showCustomDialog(title, message, showCopyButtons = false) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '10001',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            maxWidth: showCopyButtons ? '800px' : '500px', width: '90%', fontFamily: 'Arial, sans-serif',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column'
        });

        const titleBar = document.createElement('div');
        Object.assign(titleBar.style, {
            backgroundColor: CONFIG.ui.dialogColor, color: '#fff', padding: '15px 20px',
            borderRadius: '8px 8px 0 0', fontSize: '16px', fontWeight: 'bold'
        });
        titleBar.textContent = title;

        const content = document.createElement('div');
        Object.assign(content.style, {
            padding: '20px', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap',
            overflowY: 'auto', flex: '1'
        });
        content.textContent = message;

        const buttonArea = document.createElement('div');
        Object.assign(buttonArea.style, {
            padding: '15px 20px', textAlign: 'center', borderTop: '1px solid #eee',
            flexShrink: '0'
        });

        if (showCopyButtons) {
            // Extract the three variations for copy buttons
            const variations = extractJapaneseVariations(message);

            if (variations.length > 0) {
                variations.forEach((variation, index) => {
                    const copyButton = document.createElement('button');
                    Object.assign(copyButton.style, {
                        backgroundColor: CONFIG.ui.dialogColor, color: '#fff', border: 'none',
                        padding: '8px 16px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px',
                        margin: '0 5px'
                    });
                    copyButton.textContent = `Copy ${index + 1}`;
                    copyButton.onclick = () => {
                        navigator.clipboard.writeText(variation.text).then(() => {
                            copyButton.textContent = '? Copied!';
                            copyButton.style.backgroundColor = '#28a745';
                            setTimeout(() => {
                                copyButton.textContent = `Copy ${index + 1}`;
                                copyButton.style.backgroundColor = CONFIG.ui.dialogColor;
                            }, 2000);
                        });
                    };
                    buttonArea.appendChild(copyButton);
                });
            }
        }

        const okButton = document.createElement('button');
        Object.assign(okButton.style, {
            backgroundColor: showCopyButtons ? '#6c757d' : CONFIG.ui.dialogColor,
            color: '#fff', border: 'none', padding: '10px 30px',
            borderRadius: '5px', cursor: 'pointer', fontSize: '14px',
            margin: showCopyButtons ? '0 5px' : '0'
        });
        okButton.textContent = 'Close';
        okButton.onclick = () => document.body.removeChild(overlay);

        buttonArea.appendChild(okButton);
        dialog.append(titleBar, content, buttonArea);
        overlay.appendChild(dialog);

        overlay.onclick = (e) => e.target === overlay && document.body.removeChild(overlay);

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(overlay);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        document.body.appendChild(overlay);
    }

    // Extract Japanese variations from ChatGPT response
    function extractJapaneseVariations(text) {
        const variations = [];
        const patterns = [
            /【バリエーション1[：:].*?】\s*([\s\S]*?)(?=【バリエーション[2３]|$)/,
            /【バリエーション2[：:].*?】\s*([\s\S]*?)(?=【バリエーション[3３]|$)/,
            /【バリエーション3[：:].*?】\s*([\s\S]*?)(?=【|$)/
        ];

        patterns.forEach((pattern, index) => {
            const match = text.match(pattern);
            if (match && match[1]) {
                variations.push({
                    title: `バリエーション${index + 1}`,
                    text: match[1].trim()
                });
            }
        });

        return variations;
    }

    // Generic ChatGPT API call
    async function callChatGPT(systemPrompt, userPrompt, temperature = 0.1) {
        // Check if API key is configured
        if (!CONFIG.api.key || CONFIG.api.key === "YOUR_OPENAI_API_KEY_HERE") {
            throw new Error("Please configure your OpenAI API key in the CONFIG.api.key field");
        }

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${CONFIG.api.key}`
            },
            body: JSON.stringify({
                model: CONFIG.api.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`ChatGPT API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content.trim() || null;
    }

    // Utility functions
    async function copyToClipboardWithFallback(text, successMessage) {
        try {
            await navigator.clipboard.writeText(text);
            showStatusAtSelection("copied");
            setTimeout(() => showCustomDialog(successMessage, text), 100);
        } catch (clipboardError) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                showStatusAtSelection("copied");
                showCustomDialog(successMessage, text);
            } catch (execError) {
                showStatusAtSelection("error");
                showCustomDialog('Copy failed', `Please copy manually:\n\n${text}`);
            }
            document.body.removeChild(textarea);
        }
    }

    function generateSearchUrl(type, query) {
        if (!CONFIG.urls[type]) return null;
        return CONFIG.urls[type] + encodeURIComponent(query);
    }

    function handleError(error, context) {
        console.error(`${context} error:`, error);
        showStatusAtSelection("error");
        if (error.message.includes('API')) {
            showCustomDialog('API Error', 'ChatGPT API call failed, please check API Key settings');
        } else {
            showCustomDialog('Error', `${context} processing failed, please try again`);
        }
    }

    // Confluence search
    async function askChatGPT(text) {
        const prompt = `Convert the following customer message into a short, clear technical question (maximum 10-15 words). Focus on the main issue and make it a proper question. Return only the question without quotes or additional formatting:\n\n${text}`;
        return await callChatGPT("You are a helpful support assistant.", prompt, 0.2);
    }

    // Internal TEE question format
    async function askChatGPTForInternalQuery(text) {
        const prompt = `Convert the following customer issue into a direct question format for asking internal TEE engineers. You MUST follow this exact format and ALWAYS end with "Thank you for your help in advance!":

Question:
[A single, direct, actionable question that TEE can immediately understand and answer - should be one clear sentence asking for specific help or information]

Background:
[Detailed context about the customer's situation, what they're trying to do, or what error they're encountering - only include this section if the question needs additional context to be understood]

Thank you for your help in advance!

IMPORTANT: You MUST always include "Thank you for your help in advance!" at the end of every response.

Guidelines:
- Question should be ONE clear, direct question that gets straight to the point
- Question should ask for specific help, guidance, or information
- Background should provide context that helps TEE understand the customer's situation
- Background should include relevant details like error messages, configurations, or customer goals
- Only include Background section if the question needs additional context
- Keep it concise and professional
- ALWAYS end with "Thank you for your help in advance!"

Examples:

Example 1 (Simple question - no background needed):
Customer: "How do I set up alerts for high CPU usage?"
→
Question: How can a customer set up alerts for high CPU usage in Datadog?

Thank you for your help in advance!

Example 2 (Complex issue - background needed):
Customer: "We're getting 'could not update remote-config state: rpc error: code = Unknown desc = database not open' when trying to enable APM on our Node.js app"
→
Question: How can we resolve the 'database not open' error when enabling APM?

Background:
Customer is trying to enable APM on their Node.js application but getting this specific error: "could not update remote-config state: rpc error: code = Unknown desc = database not open"

Thank you for your help in advance!

Example 3 (Feature question with context):
Customer: "Our team wants to monitor custom business metrics from our e-commerce platform but we're not sure which approach is best for high-volume data"
→
Question: What's the recommended approach for monitoring custom business metrics from a high-volume e-commerce platform?

Background:
Customer has an e-commerce platform that generates high-volume data and wants to monitor custom business metrics, but they're unsure about the best implementation approach.

Thank you for your help in advance!

Here's the customer issue:

${text}`;

        return await callChatGPT("You are a helpful assistant that formats customer issues for internal engineering discussions. Create clear, distinct Question and Background sections where the Question is direct and actionable, and Background provides necessary context.", prompt, 0.2);
    }

    // Datadog keywords extraction
    async function askChatGPTForDatadogKeywords(text) {
        const prompt = `Extract Datadog-related keywords from the following customer message. Return ONLY English keywords (maximum 3 keywords) separated by spaces. No quotes, commas, or punctuation.

IMPORTANT RULES:
- Always return keywords in ENGLISH only, never in Japanese or other languages
- Maximum 3 keywords only
- Use standard Datadog terminology in English
- Translate Japanese terms to their English equivalents

Examples:
- "ブラウザテストに設定するStep(操作記録)の実行する/しないをif分のような形で制御できないか" → browser test step
- "Is it possible to view custom events from Java Flight Recorder on Datadog's Java Profile screen" → Java Profile recorder
- "How to configure APM traces for Node.js application" → APM traces Node.js
- "ログエクスプローラーでログが表示されない" → Log Explorer logs

Customer message: ${text}

English keywords:`;

        const result = await callChatGPT("You are a helpful assistant that extracts Datadog-specific keywords for documentation search. Always return keywords in English only, maximum 3 keywords, separated by spaces without quotes, commas, or any punctuation. Translate any non-English terms to their English equivalents.", prompt);

        if (result) {
            let keywords = result.replace(/^["']|["']$/g, '').replace(/["']/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
            const keywordArray = keywords.split(' ').filter(word => word.length > 0);
            if (keywordArray.length > 3) {
                keywords = keywordArray.slice(0, 3).join(' ');
            }
            return keywords;
        }
        return null;
    }

    // Text translation
    async function askChatGPTForTranslation(text) {
        const prompt = `以下のテキストを翻訳してください。言語を自動検出して、適切な言語に翻訳してください：

- 日本語のテキストの場合：英語に翻訳
- 英語のテキストの場合：日本語に翻訳
- その他の言語の場合：英語に翻訳

翻訳のガイドライン：
1. 自然で流暢な翻訳にする
2. 技術用語は適切に翻訳する
3. 文脈を考慮した翻訳にする
4. ビジネス文書として適切な表現にする
5. 翻訳結果のみを返す（説明や注釈は不要）

翻訳対象テキスト：
${text}

翻訳結果：`;

        return await callChatGPT("あなたは専門的な翻訳者です。言語を自動検出して適切な言語に翻訳してください。日本語?英語の翻訳を中心に、自然で正確な翻訳を提供してください。", prompt, 0.3);
    }

    // Japanese text improvement with 3 variations
    async function askChatGPTForJapaneseImprovement(text) {
        const prompt = `以下の日本語テキストを、より自然で丁寧なビジネス日本語に改善してください。**3つの異なるバリエーション**を提供してください。

改善の観点：
1. 文法の正確性を向上させる
2. より自然で流暢な表現にする
3. 敬語や丁寧語を適切に使用する
4. 数値や単位の表記を統一する
5. 文章の流れを改善し、読みやすくする
6. ビジネス文書として適切な表現にする

以下の形式で回答してください：

【バリエーション1：標準的な改善】
[最も一般的で標準的な改善版]

【バリエーション2：より丁寧な表現】
[より敬語を使った丁寧な改善版]

【バリエーション3：簡潔で明確な表現】
[簡潔さを重視した改善版]

元のテキスト：
${text}`;

        return await callChatGPT("あなたは日本語の文章校正の専門家です。同じ内容を3つの異なるスタイル（標準・丁寧・簡潔）で改善し、それぞれを明確に区別して提示してください。", prompt, 0.5);
    }

    // Zendesk keywords extraction
    async function askChatGPTForZendeskKeywords(text) {
        const prompt = `Analyze the following text and determine if it's an error log or a general customer issue.

If it's an ERROR LOG (contains technical error messages, stack traces, error codes, or system logs):
- Return "ERROR_LOG:" followed by the exact error message

If it's a GENERAL ISSUE (customer questions, feature requests, general problems):
- Return "KEYWORDS:" followed by relevant keywords separated by spaces (maximum 4 keywords)

Examples:
- "could not update remote-config state: rpc error: code = Unknown desc = database not open" → ERROR_LOG:could not update remote-config state: rpc error: code = Unknown desc = database not open
- "How to configure dashboard alerts for high CPU usage?" → KEYWORDS:dashboard alerts CPU usage
- "RUM session replay feature not working properly on mobile devices" → KEYWORDS:RUM session replay mobile

Customer text: ${text}

Response:`;

        const result = await callChatGPT("You are a helpful assistant that analyzes customer text to determine if it's an error log (search directly) or general issue (extract maximum 4 keywords). Always start your response with either 'ERROR_LOG:' or 'KEYWORDS:'", prompt);

        if (result) {
            if (result.startsWith('ERROR_LOG:')) {
                return { type: 'error_log', content: result.substring(10).trim() };
            } else if (result.startsWith('KEYWORDS:')) {
                let keywords = result.substring(9).trim().replace(/["']/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
                const keywordArray = keywords.split(' ').filter(word => word.length > 0);
                if (keywordArray.length > 4) {
                    keywords = keywordArray.slice(0, 4).join(' ');
                }
                return { type: 'keywords', content: keywords };
            } else {
                let keywords = result.replace(/["']/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
                const keywordArray = keywords.split(' ').filter(word => word.length > 0);
                if (keywordArray.length > 4) {
                    keywords = keywordArray.slice(0, 4).join(' ');
                }
                return { type: 'keywords', content: keywords };
            }
        }
        return null;
    }

    // Execute search functions
    async function performSearch(type, selectedText) {
        if (!selectedText) {
            showCustomDialog('No Text Selected', `Please select text first, then double-click ${type.toUpperCase()} key`);
            return;
        }

        showStatusAtSelection("processing");

        try {
            let searchUrl = '';

            switch (type) {
                case 'confluence':
                    const question = await askChatGPT(selectedText);
                    if (question) {
                        let cleanQuestion = question.replace(/^["']|["']$/g, '').trim();
                        if (cleanQuestion.length > 100) {
                            cleanQuestion = cleanQuestion.substring(0, 100);
                            const lastSpaceIndex = cleanQuestion.lastIndexOf(' ');
                            if (lastSpaceIndex > 50) cleanQuestion = cleanQuestion.substring(0, lastSpaceIndex);
                            cleanQuestion += '...';
                        }
                        searchUrl = generateSearchUrl('confluence', cleanQuestion);
                    }
                    break;

                case 'datadog':
                    const keywords = await askChatGPTForDatadogKeywords(selectedText);
                    if (keywords) {
                        let cleanKeywords = keywords.trim();
                        if (cleanKeywords.length > 80) {
                            cleanKeywords = cleanKeywords.substring(0, 80);
                            const lastSpaceIndex = cleanKeywords.lastIndexOf(' ');
                            if (lastSpaceIndex > 30) cleanKeywords = cleanKeywords.substring(0, lastSpaceIndex);
                            cleanKeywords += '...';
                        }
                        searchUrl = generateSearchUrl('datadog', cleanKeywords);
                    }
                    break;

                case 'zendesk':
                    const result = await askChatGPTForZendeskKeywords(selectedText);
                    if (result) {
                        let searchQuery = result.content;
                        if (searchQuery.length > 150) {
                            searchQuery = searchQuery.substring(0, 150);
                            const lastSpaceIndex = searchQuery.lastIndexOf(' ');
                            if (lastSpaceIndex > 50) searchQuery = searchQuery.substring(0, lastSpaceIndex);
                            searchQuery += '...';
                        }
                        searchUrl = generateSearchUrl('zendesk', searchQuery);
                    }
                    break;

                case 'internal':
                    const internalQuery = await askChatGPTForInternalQuery(selectedText);
                    if (internalQuery) {
                        await copyToClipboardWithFallback(internalQuery, CONFIG.messages.internal);
                    }
                    return;

                case 'japanese':
                    const improvedJapanese = await askChatGPTForJapaneseImprovement(selectedText);
                    if (improvedJapanese) {
                        showStatusAtSelection("success");
                        setTimeout(() => showCustomDialog('Japanese Text Improvement - 3 Variations', improvedJapanese, true), 100);
                    }
                    return;

                case 'translation':
                    const translatedText = await askChatGPTForTranslation(selectedText);
                    if (translatedText) {
                        await copyToClipboardWithFallback(translatedText, CONFIG.messages.translation);
                    }
                    return;
            }

            if (searchUrl) {
                if (searchUrl.length > 2000) {
                    showCustomDialog('Search Error', 'Search query too long, please try selecting shorter text');
                    showStatusAtSelection("error");
                    return;
                }
                window.open(searchUrl, "_blank");
                showStatusAtSelection("success");
            } else {
                showStatusAtSelection("error");
            }
        } catch (error) {
            handleError(error, `${type} search`);
        }
    }

    // Setup keyboard listener
    function setupKeyboardListener() {
        if (keyboardListenerActive) return;
        removeExistingListeners();

        let lastKeyTimes = Object.fromEntries(CONFIG.keys.map(key => [key, 0]));
        const doubleClickDelay = CONFIG.ui.doubleClickDelay;

        keydownHandler = (event) => {
            // Always use physical key position (event.code) for international keyboard support
            const codeToKey = {
                'KeyC': 'c', 'KeyE': 'e', 'KeyD': 'd',
                'KeyZ': 'z', 'KeyJ': 'j', 'KeyT': 't'
            };

            const key = codeToKey[event.code];
            if (!key || isProcessing || event.ctrlKey || event.metaKey || event.altKey) return;

            const currentTime = Date.now();
            const timeDiff = currentTime - lastKeyTimes[key];

            // Check if we have selected text
            const selectedText = window.getSelection().toString().trim();

            // Check if we're in an input field (input, textarea, contenteditable)
            const activeElement = document.activeElement;
            const isInInputField = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.contentEditable === 'true' ||
                activeElement.isContentEditable
            );

            // If there's selected text
            if (selectedText) {
                // Always prevent default when we have selected text and it's our target keys
                event.preventDefault();
                event.stopPropagation();

                // If this is a potential double-click
                if (timeDiff > 0 && timeDiff < doubleClickDelay) {
                    isProcessing = true;
                    performSearch(CONFIG.searchTypes[key], selectedText).finally(() => {
                        isProcessing = false;
                    });
                    lastKeyTimes[key] = 0;
                } else {
                    // First key press with selected text - just record time
                    lastKeyTimes[key] = currentTime;
                }
            } else {
                // No selected text - allow normal typing
                lastKeyTimes[key] = currentTime;
            }
        };

        document.addEventListener('keydown', keydownHandler);
        keyboardListenerActive = true;

        if (!selectionChangeListenerActive) {
            selectionChangeHandler = () => {
                setTimeout(() => {
                    const selection = window.getSelection();
                    if (!selection.rangeCount || selection.toString().trim() === '') {
                        clearSelectionStatus();
                    }
                }, 100);
            };
            document.addEventListener('selectionchange', selectionChangeHandler);
            selectionChangeListenerActive = true;
        }
    }

    // Status display functions
    function showStatusAtSelection(state) {
        const oldBadge = document.getElementById('selection-status-badge');
        if (oldBadge) oldBadge.remove();
        if (state === "ready") return;

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.toString().trim() === '') return;

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const badge = document.createElement('div');
        badge.id = 'selection-status-badge';

        Object.assign(badge.style, {
            position: 'fixed',
            left: `${rect.right + 10}px`,
            top: `${rect.top + (rect.height / 2) - 15}px`,
            zIndex: '10000',
            padding: '4px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontFamily: 'Arial, sans-serif',
            pointerEvents: 'none',
            transition: 'opacity 0.3s ease'
        });

        const statusConfig = {
            processing: { bg: "#ff6b35", text: "? Processing..." },
            error: { bg: "#dc3545", text: "? Error" },
            success: { bg: "#28a745", text: "? Done" },
            copied: { bg: "#17a2b8", text: "? Copied" }
        };

        const config = statusConfig[state] || { bg: "#ccc", text: state };
        badge.textContent = config.text;
        badge.style.backgroundColor = config.bg;
        document.body.appendChild(badge);

        if (state === "success" || state === "copied") {
            setTimeout(() => {
                if (badge && badge.parentNode) {
                    badge.style.opacity = '0';
                    setTimeout(() => badge.parentNode && badge.remove(), 300);
                }
            }, CONFIG.ui.statusTimeout);
        }
    }

    function clearSelectionStatus() {
        const badge = document.getElementById('selection-status-badge');
        if (badge) badge.remove();
    }

    function removeExistingListeners() {
        if (keyboardListenerActive && keydownHandler) {
            document.removeEventListener('keydown', keydownHandler);
            keydownHandler = null;
            keyboardListenerActive = false;
        }
        if (selectionChangeListenerActive && selectionChangeHandler) {
            document.removeEventListener('selectionchange', selectionChangeHandler);
            selectionChangeHandler = null;
            selectionChangeListenerActive = false;
        }
        isProcessing = false;
    }

    // Page detection and initialization
    function isZendeskPage() {
        return window.location.hostname.includes('zendesk.com') ||
            document.title.toLowerCase().includes('zendesk') ||
            document.querySelector('div[data-garden-id="zendesk"]') !== null;
    }

    function waitForZendeskReady() {
        if (keyboardListenerActive) return;

        let attemptCount = 0;
        const maxAttempts = 15;

        const performCheck = () => {
            attemptCount++;
            if (document.readyState === 'loading') return false;

            const selectors = [
                '[data-test-id="ticket-header"]', '[data-garden-id="zendesk.ticket_view"]',
                '.ticket-view', '.zendesk', '#main_content', '[role="main"]',
                '.workspace', '[data-test-id]', '.ember-application'
            ];

            const foundElement = selectors.find(selector => document.querySelector(selector));
            const hasBasicStructure = document.body && document.body.children.length > 0;

            if (foundElement || hasBasicStructure) {
                removeExistingListeners();
                setupKeyboardListener();
                return true;
            }
            return false;
        };

        if (performCheck()) return;

        const checkInterval = setInterval(() => {
            if (performCheck() || attemptCount >= maxAttempts) {
                clearInterval(checkInterval);
                if (attemptCount >= maxAttempts) {
                    removeExistingListeners();
                    setupKeyboardListener();
                }
            }
        }, 1000);
    }

    function observePageChanges() {
        let currentUrl = window.location.href;
        let isObserving = false;
        if (isObserving) return;

        const observer = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                removeExistingListeners();
                clearSelectionStatus();
                setTimeout(() => {
                    if (isZendeskPage()) waitForZendeskReady();
                }, 1500);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        isObserving = true;

        window.addEventListener('popstate', () => {
            removeExistingListeners();
            clearSelectionStatus();
            setTimeout(() => {
                if (isZendeskPage()) waitForZendeskReady();
            }, 1500);
        });
    }

    function init() {
        if (isZendeskPage()) {
            observePageChanges();
            if (document.readyState === 'complete') {
                setTimeout(() => waitForZendeskReady(), 500);
            } else {
                window.addEventListener('load', () => {
                    setTimeout(() => waitForZendeskReady(), 500);
                });
            }
        }
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('? Usage: Select text, then double-click physical keys CC/EE/DD/ZZ/JJ/TT (works with any keyboard layout)');

})();
