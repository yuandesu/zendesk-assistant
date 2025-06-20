// ==UserScript==
// @name         Universal Text Translator
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Universal text translator: JJ=translate to Japanese, CC=translate to Traditional Chinese
// @match        *://*/*
// @author       Yuan Chang
// @grant        none
// ==/UserScript==

/*
=== USAGE INSTRUCTIONS ===

Universal Text Translator - Works on ANY website!

How to use:
1. Select any text that needs translation
2. Choose your translation option:
   - Double-click 'J' key twice (JJ) to translate to Japanese
   - Double-click 'C' key twice (CC) to translate to Traditional Chinese
3. The text will be automatically translated and copied to clipboard
4. A popup will show the translated result

Features:
- Translates any language to Japanese (JJ) or Traditional Chinese (CC)
- Works on any website
- Translated text is automatically copied to clipboard
- Visual status indicators
- Supports keyboard layouts worldwide

Status indicators appear next to selected text:
- Processing... (orange)
- Done (green)  
- Copied (blue)
- Error (red)

Requirements:
- Valid OpenAI API key configured in the script
- Text must be selected before using JJ or CC shortcuts
- No modifier keys (Ctrl/Cmd/Alt) should be pressed

=== END INSTRUCTIONS ===
*/

(function () {
    'use strict';

    console.log('Universal Text Translator loaded');

    // Configuration
    const CONFIG = {
        api: {
            key: "YOUR_API_KEY_HERE", // Replace with your actual OpenAI API key
            model: "gpt-4o", // Fastest and most accurate model
            timeout: 30000
        },
        ui: {
            doubleClickDelay: 400,
            statusTimeout: 2000,
            dialogColor: '#2563eb'
        }
    };

    // Translation prompt configurations
    const TRANSLATION_PROMPTS = {
        japanese: {
            system: "あなたは専門的な翻訳者です。任意の言語のテキストを自然で正確な日本語に翻訳してください。",
            user: (text) => `以下のテキストを日本語に翻訳してください。言語を自動検出して、自然で流暢な日本語に翻訳してください。

翻訳のガイドライン：
1. 自然で流暢な日本語にする
2. 技術用語や専門用語は適切な日本語に翻訳する
3. 文脈を考慮した翻訳にする
4. ビジネス文書として適切な表現にする
5. 翻訳結果のみを返す（説明や注釈は不要）

翻訳対象テキスト：
${text}

日本語翻訳結果：`,
            temperature: 0.3
        },
        chinese: {
            system: "你是專業的翻譯師。請將任何語言的文本翻譯成自然準確的繁體中文。",
            user: (text) => `請將以下文本翻譯成繁體中文。請自動檢測語言並翻譯成自然流暢的繁體中文。

翻譯指導原則：
1. 翻譯成自然流暢的繁體中文
2. 技術用語和專業術語要適當翻譯
3. 考慮文本的上下文
4. 使用適合商業文?的表達方式
5. 只返回翻譯結果（不需要?明或註釋）

待翻譯文本：
${text}

繁體中文翻譯結果：`,
            temperature: 0.3
        }
    };

    // Global state
    let keyboardListenerActive = false;
    let selectionChangeListenerActive = false;
    let keydownHandler = null;
    let selectionChangeHandler = null;
    let isProcessing = false;

    // ChatGPT API call function
    async function callChatGPT(systemPrompt, userPrompt, temperature = 0.1) {
        // Check if API key is configured
        if (!CONFIG.api.key || CONFIG.api.key === "YOUR_API_KEY_HERE") {
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

    // Translation functions
    async function translateToJapanese(text) {
        const config = TRANSLATION_PROMPTS.japanese;
        return await callChatGPT(config.system, config.user(text), config.temperature);
    }

    async function translateToChinese(text) {
        const config = TRANSLATION_PROMPTS.chinese;
        return await callChatGPT(config.system, config.user(text), config.temperature);
    }

    // Copy to clipboard with fallback
    async function copyToClipboardWithFallback(text) {
        try {
            await navigator.clipboard.writeText(text);
            showStatusAtSelection("copied");
            return true;
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
                return true;
            } catch (execError) {
                showStatusAtSelection("error");
                return false;
            }
            document.body.removeChild(textarea);
        }
    }

    // Custom dialog function with clipboard button
    function showCustomDialog(title, message, translatedText) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: '10001',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            maxWidth: '500px', width: '90%', fontFamily: 'Arial, sans-serif',
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

        // Add clipboard button if translated text is provided
        if (translatedText) {
            const clipboardButton = document.createElement('button');
            Object.assign(clipboardButton.style, {
                backgroundColor: '#ffffff',
                color: '#000000',
                border: '1px solid #ccc',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                marginLeft: '8px',
                display: 'inline-block',
                verticalAlign: 'middle'
            });

            clipboardButton.textContent = '?';

            clipboardButton.onclick = async () => {
                const success = await copyToClipboardWithFallback(translatedText);
                if (success) {
                    clipboardButton.textContent = '?';
                    clipboardButton.style.backgroundColor = '#28a745';
                    clipboardButton.style.color = '#ffffff';
                    setTimeout(() => {
                        clipboardButton.textContent = '?';
                        clipboardButton.style.backgroundColor = '#ffffff';
                        clipboardButton.style.color = '#000000';
                    }, 2000);
                } else {
                    clipboardButton.textContent = '?';
                    clipboardButton.style.backgroundColor = '#dc3545';
                    clipboardButton.style.color = '#ffffff';
                    setTimeout(() => {
                        clipboardButton.textContent = '?';
                        clipboardButton.style.backgroundColor = '#ffffff';
                        clipboardButton.style.color = '#000000';
                    }, 2000);
                }
            };

            content.appendChild(clipboardButton);
        }

        const buttonArea = document.createElement('div');
        Object.assign(buttonArea.style, {
            padding: '15px 20px', textAlign: 'center', borderTop: '1px solid #eee',
            flexShrink: '0'
        });

        const okButton = document.createElement('button');
        Object.assign(okButton.style, {
            backgroundColor: CONFIG.ui.dialogColor,
            color: '#fff', border: 'none', padding: '10px 30px',
            borderRadius: '5px', cursor: 'pointer', fontSize: '14px'
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

    // Error handling
    function handleError(error) {
        console.error('Translation error:', error);
        showStatusAtSelection("error");
        if (error.message.includes('API')) {
            showCustomDialog('API Error', 'ChatGPT API call failed. Please check your API key configuration.', null);
        } else {
            showCustomDialog('Translation Error', 'Translation failed. Please try again.', null);
        }
    }

    // Main translation processing
    async function performTranslation(selectedText, targetLanguage) {
        if (!selectedText) {
            const shortcut = targetLanguage === 'japanese' ? 'JJ' : 'CC';
            showCustomDialog('No Text Selected', `Please select text first, then double-click ${shortcut} keys`, null);
            return;
        }

        showStatusAtSelection("processing");

        try {
            let translatedText;

            if (targetLanguage === 'japanese') {
                translatedText = await translateToJapanese(selectedText);
            } else if (targetLanguage === 'chinese') {
                translatedText = await translateToChinese(selectedText);
            }

            if (translatedText) {
                const title = targetLanguage === 'japanese' ? 'Translated to Japanese' : 'Translated to Traditional Chinese';
                showCustomDialog(title, translatedText, translatedText);
            }
        } catch (error) {
            handleError(error);
        }
    }

    // Setup keyboard listener
    function setupKeyboardListener() {
        if (keyboardListenerActive) return;
        removeExistingListeners();

        let lastKeyTimes = { j: 0, c: 0 };
        const doubleClickDelay = CONFIG.ui.doubleClickDelay;

        keydownHandler = (event) => {
            // Use physical key position (event.code) for international keyboard support
            const keyMap = {
                'KeyJ': 'j',
                'KeyC': 'c'
            };

            const key = keyMap[event.code];
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

            // If there's selected text and we're not in an input field
            if (selectedText && !isInInputField) {
                // Always prevent default when we have selected text
                event.preventDefault();
                event.stopPropagation();

                // If this is a potential double-click
                if (timeDiff > 0 && timeDiff < doubleClickDelay) {
                    isProcessing = true;
                    const targetLanguage = key === 'j' ? 'japanese' : 'chinese';
                    performTranslation(selectedText, targetLanguage).finally(() => {
                        isProcessing = false;
                    });
                    lastKeyTimes[key] = 0;
                } else {
                    // First key press with selected text - just record time
                    lastKeyTimes[key] = currentTime;
                }
            } else {
                // No selected text or in input field - allow normal typing
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
        const oldBadge = document.getElementById('translation-status-badge');
        if (oldBadge) oldBadge.remove();
        if (state === "ready") return;

        const selection = window.getSelection();
        if (!selection.rangeCount || selection.toString().trim() === '') return;

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        const badge = document.createElement('div');
        badge.id = 'translation-status-badge';

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
            processing: { bg: "#ff6b35", text: "Processing..." },
            error: { bg: "#dc3545", text: "Error" },
            success: { bg: "#28a745", text: "Done" },
            copied: { bg: "#17a2b8", text: "Copied" }
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
        const badge = document.getElementById('translation-status-badge');
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

    // Initialize the translator
    function init() {
        console.log('Universal Text Translator initialized');
        setupKeyboardListener();
        console.log('Usage: Select text, then double-click JJ (Japanese) or CC (Traditional Chinese)');
    }

    // Start the translator when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Handle page navigation (for SPA websites)
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            // Reinitialize on page change
            setTimeout(init, 1000);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();