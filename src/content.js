/*******************************************************
 * CONTENT.JS
 * 
 * This script extracts the primary textual content from
 * the current webpage using a layered approach:
 * 1. Check common article/main selectors.
 * 2. Identify the largest text block in <div>, <section>, <article>.
 * 3. Gather all paragraphs if still no success.
 * 4. Fallback to visible body text.
 * Finally, clean out references (e.g., [1]) and trim whitespace.
 *******************************************************/

/**
 * Checks if an element is visible (rough approximation).
 */
function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    parseFloat(style.opacity) > 0 &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}

/**
 * Clones an element, removes script/style tags, returns trimmed text content.
 */
function getTextContent(element) {
  const clone = element.cloneNode(true);
  const scripts = clone.getElementsByTagName('script');
  const styles = clone.getElementsByTagName('style');
  [...scripts, ...styles].forEach((el) => el.remove());
  return clone.textContent.trim();
}

/**
 * Cleans and normalizes text by removing bracketed references
 * and excessive whitespace/punctuation.
 */
function cleanText(text) {
  return text
    // Remove bracketed references like [12], [citation needed], etc.
    .replace(/\[[^\]]*\]/g, '')
    // Remove leftover @mentions or markers
    .replace(/@\w+/g, '')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    // Fix repeated periods
    .replace(/\.+/g, '.')
    .trim();
}

/**
 * Attempts to extract the main content using Readability first,
 * then falls back to our custom extraction if needed.
 */
function extractMainContent() {
  try {
    // Check if Readability is available
    if (typeof Readability === 'undefined') {
      console.log("Readability library not found, using fallback method");
      throw new Error("Readability not available");
    }
    
    const documentClone = document.cloneNode(true);
    
    // Pre-clean the document clone
    const elementsToRemove = documentClone.querySelectorAll(
      'script, style, link, iframe, nav, footer, header, aside, ' +
      '[role="complementary"], [role="navigation"], ' +
      '.ad, .ads, .advertisement, .social-share, .comments, ' +
      'form, button, input, .related-articles'
    );
    elementsToRemove.forEach(el => el.remove());

    const reader = new Readability(documentClone, {
      charThreshold: 100,
      classesToPreserve: ['article', 'content', 'post']
    });
    const article = reader.parse();
    
    if (article && article.textContent && article.textContent.trim().length > 300) {
      console.log("Content extracted using Readability");
      return {
        title: article.title,
        content: cleanText(article.textContent),
        excerpt: article.excerpt,
        byline: article.byline,
        siteName: article.siteName
      };
    }
    // If Readability returns too little content, proceed to fallback
    console.log("Readability extraction insufficient, trying fallback method");
  } catch (error) {
    console.error("Readability error:", error);
    console.log("Falling back to custom extraction");
  }

  // Enhanced content selectors for different types of sites
  const mainSelectors = [
    // Article content
    'article[role="article"]',
    'main[role="main"]',
    'div[role="main"]',
    'article',
    'main',
    // Common article content classes
    '.article-content',
    '.post-content',
    '.entry-content',
    '.story-content',
    // Medium-specific
    '.section-content',
    '.section-inner',
    // Wikipedia-specific
    '#mw-content-text',
    '.mw-parser-output',
    // Generic content classes
    '[class*="article"]:not(nav):not(header):not(footer)',
    '[class*="content"]:not(nav):not(header):not(footer)',
    '[class*="story"]:not(nav):not(header):not(footer)',
    // Fallback to any large text container
    '.post',
    '.entry',
    '.article',
    '.content'
  ];

  // Try each selector in order
  for (const selector of mainSelectors) {
    const elements = Array.from(document.querySelectorAll(selector))
      .filter(el => isVisible(el));
    
    for (const element of elements) {
      // Skip if the element is too small or likely navigation
      if (element.offsetHeight < 200) continue;
      
      const text = getTextContent(element);
      if (text.length > 300) {
        console.log("Content found using selector:", selector);
        return {
          title: document.title,
          content: cleanText(text)
        };
      }
    }
  }

  // Fallback: Find the largest text block
  const candidates = Array.from(document.querySelectorAll('div, section, article'))
    .filter(el => {
      if (!isVisible(el)) return false;
      const className = (el.className || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      
      // Skip likely non-content elements
      const skipPatterns = /(header|footer|nav|menu|comment|sidebar|related|share|meta|promo|ad|banner)/;
      if (skipPatterns.test(className) || skipPatterns.test(id)) return false;
      
      // Check for minimum content requirements
      const text = getTextContent(el);
      return text.length > 300 && el.getElementsByTagName('p').length > 2;
    })
    .map(el => {
      const text = getTextContent(el);
      const paragraphs = el.getElementsByTagName('p').length;
      const images = el.getElementsByTagName('img').length;
      return { element: el, text, paragraphs, images };
    });

  candidates.sort((a, b) => {
    // Score based on multiple factors
    const scoreA = (a.text.length * 0.6) + (a.paragraphs * 100) + (a.images * 50);
    const scoreB = (b.text.length * 0.6) + (b.paragraphs * 100) + (b.images * 50);
    return scoreB - scoreA;
  });

  if (candidates.length > 0) {
    console.log("Content found using largest text block method");
    return {
      title: document.title,
      content: cleanText(candidates[0].text)
    };
  }

  // Final fallback: Collect all paragraphs
  const paragraphs = Array.from(document.querySelectorAll('p'))
    .filter(p => isVisible(p) && p.textContent.trim().length > 40)
    .map(p => p.textContent.trim());

  if (paragraphs.length > 0) {
    console.log("Content found using paragraph collection method");
    return {
      title: document.title,
      content: cleanText(paragraphs.join(' '))
    };
  }

  // If all else fails, use body text
  console.log("Using minimal fallback");
  return {
    title: document.title,
    content: cleanText(document.body.innerText)
  };
}

/**
 * Helper function that removes obstructive elements such as paywall overlays.
 * It targets fixed position elements with high z-index that span a large width.
 */
function removeObstructiveElements() {
  const elements = document.querySelectorAll('div, section, aside');
  elements.forEach(el => {
    const style = window.getComputedStyle(el);
    if (
      style.position === 'fixed' &&
      parseInt(style.zIndex) > 1000 &&
      el.offsetWidth > window.innerWidth * 0.8
    ) {
      el.remove();
      console.log('Removed potential overlay:', el);
    }
  });
}

// More reliable detection of when page is fully loaded
function waitForContentStabilization(callback, maxWaitTime = 5000) {
  let contentSignature = {
    length: document.body.innerText.length,
    paragraphs: document.querySelectorAll('p').length,
    headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length
  };
  
  let lastChangeTime = Date.now();
  const checkInterval = 200; // Check every 200ms
  
  // Setup observer for DOM changes
  const observer = new MutationObserver(() => {
    const newSignature = {
      length: document.body.innerText.length,
      paragraphs: document.querySelectorAll('p').length,
      headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length
    };
    
    if (
      newSignature.length !== contentSignature.length ||
      newSignature.paragraphs !== contentSignature.paragraphs ||
      newSignature.headings !== contentSignature.headings
    ) {
      contentSignature = newSignature;
      lastChangeTime = Date.now();
    }
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    characterData: true 
  });
  
  // Check if content has stabilized
  const intervalId = setInterval(() => {
    if (Date.now() - lastChangeTime > 1000) { // No changes for 1 second
      clearInterval(intervalId);
      observer.disconnect();
      callback();
    } else if (Date.now() - lastChangeTime > maxWaitTime) {
      // If max wait time exceeded, proceed anyway
      clearInterval(intervalId);
      observer.disconnect();
      callback();
    }
  }, checkInterval);
}

// Update the message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractContent") {
    // Remove any potential obstructive elements
    removeObstructiveElements();
    
    // Create a promise to handle the async extraction
    const extractionPromise = new Promise((resolve) => {
      // Wait for the page to stabilize before extracting content
      waitForContentStabilization(() => {
        try {
          const content = extractMainContent();
          resolve(content);
        } catch (error) {
          resolve({
            title: document.title,
            content: "Error extracting content: " + error.message
          });
        }
      });
    });
    
    // Use the promise to send the response when ready
    extractionPromise.then((content) => {
      if (!content) {
        sendResponse({
          title: document.title,
          content: "Failed to extract content from the page."
        });
      } else {
        sendResponse(content);
      }
    }).catch((error) => {
      sendResponse({
        title: document.title,
        content: "Error: " + error.message
      });
    });
    
    return true; // Keep the message channel open for async response
  }
});