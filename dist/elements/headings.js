"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.headingRules = void 0;
const constants_1 = require("../constants");
exports.headingRules = [
    // Simplify headings by removing internal navigation elements
    {
        selector: 'h1, h2, h3, h4, h5, h6',
        element: 'keep',
        transform: (el) => {
            var _a;
            // Get document from element's owner document
            const doc = el.ownerDocument;
            if (!doc) {
                console.warn('No document available');
                return el;
            }
            // Create new heading of same level
            const newHeading = doc.createElement(el.tagName);
            // Copy allowed attributes from original heading
            Array.from(el.attributes).forEach(attr => {
                if (constants_1.ALLOWED_ATTRIBUTES.has(attr.name)) {
                    newHeading.setAttribute(attr.name, attr.value);
                }
            });
            // Clone the element so we can modify it without affecting the original
            const clone = el.cloneNode(true);
            // First extract text from navigation elements before removing them
            const navigationText = new Map();
            // Find all navigation elements and store their text content
            Array.from(clone.querySelectorAll('*')).forEach(child => {
                var _a, _b, _c, _d, _e, _f;
                let shouldRemove = false;
                if (child.tagName.toLowerCase() === 'a') {
                    const href = child.getAttribute('href');
                    if ((href === null || href === void 0 ? void 0 : href.includes('#')) || (href === null || href === void 0 ? void 0 : href.startsWith('#'))) {
                        navigationText.set(child, ((_a = child.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '');
                        shouldRemove = true;
                    }
                }
                if (child.classList.contains('anchor')) {
                    navigationText.set(child, ((_b = child.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '');
                    shouldRemove = true;
                }
                if (child.tagName.toLowerCase() === 'button') {
                    shouldRemove = true;
                }
                if ((child.tagName.toLowerCase() === 'span' || child.tagName.toLowerCase() === 'div') &&
                    child.querySelector('a[href^="#"]')) {
                    const anchor = child.querySelector('a[href^="#"]');
                    if (anchor) {
                        navigationText.set(child, ((_c = anchor.textContent) === null || _c === void 0 ? void 0 : _c.trim()) || '');
                    }
                    shouldRemove = true;
                }
                if (shouldRemove) {
                    // If this element contains the only text content of its parent,
                    // store its text to be used for the parent
                    const parent = child.parentElement;
                    if (parent && parent !== clone &&
                        ((_d = parent.textContent) === null || _d === void 0 ? void 0 : _d.trim()) === ((_e = child.textContent) === null || _e === void 0 ? void 0 : _e.trim())) {
                        navigationText.set(parent, ((_f = child.textContent) === null || _f === void 0 ? void 0 : _f.trim()) || '');
                    }
                }
            });
            // Remove navigation elements
            const toRemove = Array.from(clone.querySelectorAll('*')).filter(child => {
                if (child.tagName.toLowerCase() === 'a') {
                    const href = child.getAttribute('href');
                    return (href === null || href === void 0 ? void 0 : href.includes('#')) || (href === null || href === void 0 ? void 0 : href.startsWith('#'));
                }
                if (child.classList.contains('anchor')) {
                    return true;
                }
                if (child.tagName.toLowerCase() === 'button') {
                    return true;
                }
                if ((child.tagName.toLowerCase() === 'span' || child.tagName.toLowerCase() === 'div') &&
                    child.querySelector('a[href^="#"]')) {
                    return true;
                }
                return false;
            });
            toRemove.forEach(element => element.remove());
            // Get the text content after removing navigation elements
            let textContent = ((_a = clone.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
            // If we lost all text content but had navigation text, use that instead
            if (!textContent && navigationText.size > 0) {
                textContent = Array.from(navigationText.values())[0];
            }
            // Set the clean text content
            newHeading.textContent = textContent;
            return newHeading;
        }
    }
];
//# sourceMappingURL=headings.js.map