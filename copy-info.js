// ==UserScript==
// @name         Zendesk Copy Ticket Info
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Copy Zendesk ticket fields + URL with draggable, styled button. SPA-safe autofill supported (Split Ticket flow). Purple button with hover and drag support.
// @author       Yuan Chang
// @match        https://datadog.zendesk.com/agent/tickets/*
// ==/UserScript==

/*
USAGE: 
- A draggable "Copy Ticket Info" button will appear on Zendesk ticket pages
- Click the button to automatically copy all ticket information to clipboard
- Use copied text when creating split tickets
- Button can be dragged to any position on the page
*/

(function () {
    'use strict';

    const fieldSelectors = {
        requester: '[data-test-id="ticket-system-field-requester-select"] .StyledSelect-sc-xf4qjv-0',
        assignee: '[data-test-id="assignee-field-selected-agent-tag"]',
        ccs: '[data-test-id="ticket-fields-collaborators"]',
        ticketType: '[data-test-id="ticket-form-field-multiselect-button"]'
    };

    const fieldLabels = [
        'Primary Product Component',
        'Related Product Components',
        'Impact',
        'Datadog Org ID',
        'Language Requested',
        'Tier',
        'User Region'
    ];

    function getFieldValue(label) {
        const labelElement = Array.from(document.querySelectorAll('label')).find(
            el => el.textContent.trim().replace(/\s*\*$/, '') === label
        );
        if (!labelElement) return null;

        const container = labelElement.closest('[data-test-id^="ticket-form-field-"]');
        if (!container) return null;

        if (label === 'Related Product Components') {
            const tags = container.querySelectorAll('[data-garden-id="tags.tag_view"] span, [data-garden-id="dropdowns.multiselect_item_wrapper"] span');
            if (tags.length > 0) return Array.from(tags).map(tag => tag.textContent.trim());
        }

        let value = container.querySelector('[data-garden-id="typography.ellipsis"]')?.getAttribute('title')
            || container.querySelector('[data-garden-id="dropdowns.multiselect_item_wrapper"] span')?.textContent.trim()
            || container.querySelector('input')?.value?.trim()
            || container.textContent.replace(label, '').trim();

        if (label === 'User Region' && value) value = value.replace(/\s+/g, ' ').trim();
        return value || null;
    }

    function collectAndCopy() {
        console.log('[Split Ticket] Collecting ticket info...');
        const data = {};
        const url = window.location.href;
        console.log('[Split Ticket] Ticket URL:', url);

        for (const [key, selector] of Object.entries(fieldSelectors)) {
            const containers = document.querySelectorAll(selector);
            if (containers.length > 0) {
                let value;

                if (key === 'requester') {
                    const el = containers[0].querySelector('[title]');
                    value = el ? el.getAttribute('title') : '';
                }

                else if (key === 'assignee') {
                    const divs = containers[0].querySelectorAll('[title]');
                    value = Array.from(divs).map(d => d.getAttribute('title')).join(' / ');
                }

                else if (key === 'ccs') {
                    const ccsContainer = containers[0];
                    let ccsList = [];

                    const tagItems = ccsContainer.querySelectorAll('.garden-tag-item');
                    if (tagItems.length) {
                        ccsList = Array.from(tagItems).map(el => el.textContent.trim());
                    }

                    if (!ccsList.length) {
                        const spans = ccsContainer.querySelectorAll('span');
                        ccsList = Array.from(spans)
                            .map(el => el.textContent.trim())
                            .filter(text => text && !['Add', 'CCs'].includes(text));
                    }

                    if (!ccsList.length) {
                        const input = ccsContainer.querySelector('input');
                        if (input && input.value) ccsList = [input.value.trim()];
                    }

                    if (!ccsList.length) {
                        const raw = ccsContainer.textContent.trim();
                        if (raw) {
                            ccsList = raw.split(',').map(s => s.trim()).filter(Boolean);
                        }
                    }

                    value = ccsList;
                    console.log('[Split Ticket] CCs:', value);
                }

                else if (key === 'ticketType') {
                    const el = containers[0].querySelector('[data-garden-id="dropdowns.multiselect_item_wrapper"] span');
                    value = el ? el.textContent.trim() : '';
                }

                else {
                    value = containers[0].textContent.trim();
                }

                data[key] = value;
                console.log(`[Split Ticket] ${key}:`, value);
            }
        }

        for (const label of fieldLabels) {
            const fieldKey = label.replace(/\s*\*$/, '').toLowerCase().replace(/\s+/g, '');
            const value = getFieldValue(label);
            if (value !== null) data[fieldKey] = value;
        }

        const formatted = `
Split from original ticket:
- Requester: ${data.requester || ''}
- Assignee: ${data.assignee || ''}
- CCs: ${Array.isArray(data.ccs) ? data.ccs.join(', ') : ''}
- Ticket Type: ${data.ticketType || ''}
- Primary Product Component: ${data['primaryproductcomponent'] || ''}
- Related Product Components: ${Array.isArray(data['relatedproductcomponents']) ? data['relatedproductcomponents'].join(', ') : ''}
- Impact: ${data.impact || ''}
- Datadog Org ID: ${data['datadogorgid'] || ''}
- Language Requested: ${data['languagerequested'] || ''}
- Tier: ${data.tier || ''}
- User Region: ${data['userregion'] || ''}
- Ticket URL: ${url}
`.trim();

        console.log('[Split Ticket] Final output:\n', formatted);

        navigator.clipboard.writeText(formatted).then(() => {
            alert('Ticket info + URL copied to clipboard!');
        });
    }

    function makeDraggable(element) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        element.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - element.offsetLeft;
            offsetY = e.clientY - element.offsetTop;
            element.style.cursor = 'grabbing';
            e.preventDefault(); // ÈòÌÈÁª¼èÊ¸»ú»þ´³¾ñ¿Ô±È
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                element.style.left = `${e.clientX - offsetX}px`;
                element.style.top = `${e.clientY - offsetY}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            element.style.cursor = 'grab';
        });
    }

    function addCopyButton() {
        if (document.getElementById('split-ticket-copy-button')) return;

        const btn = document.createElement('button');
        btn.id = 'split-ticket-copy-button';
        btn.innerText = 'Copy Ticket Info';

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '110px', // Èæ badge ¹¹¹â°ìóÚ
            right: '10px',
            padding: '10px 18px',
            fontSize: '14px',
            fontWeight: 'bold',
            textAlign: 'center',
            backgroundColor: '#6a0dad',
            color: '#fff',
            border: '2px solid transparent',
            borderRadius: '12px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            cursor: 'grab',
            userSelect: 'none',
            resize: 'none',
            zIndex: '9999',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap'
        });

        btn.addEventListener('mouseenter', () => {
            btn.style.backgroundColor = '#7d22e6';
            btn.style.borderColor = '#ffffff';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.backgroundColor = '#6a0dad';
            btn.style.borderColor = 'transparent';
        });

        btn.onclick = collectAndCopy;
        document.body.appendChild(btn);
        makeDraggable(btn);
    }


    window.addEventListener('load', () => {
        setTimeout(addCopyButton, 500);
    });
})();
