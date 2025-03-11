document.addEventListener('DOMContentLoaded', function() {
  // UI elements
  const summarizeBtn = document.getElementById('summarize-btn');
  const summaryContainer = document.getElementById('summary-container');
  const summaryText = document.getElementById('summary-text');
  const wordCount = document.getElementById('word-count');
  const copyBtn = document.getElementById('copy-btn');
  const loader = document.getElementById('loader');
  const error = document.getElementById('error');

  function extractiveSummarize(text, numSentences = 5) {
    // Clean the text - enhanced cleaning
    const cleaned = text
      .replace(/\[[^\]]*\]/g, '') // Remove citations [1], [2] etc
      .replace(/\^.*$/gm, '') // Remove lines starting with ^
      .replace(/https?:\/\/\S+/g, '') // Remove URLs
      .replace(/\(.*?\)/g, '') // Remove parenthetical content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.!?]/g, '') // Remove special characters except sentence endings
      .trim();
    
    // More robust sentence splitting - handles abbreviations better
    const sentenceRegex = /[^.!?]+(?:[.!?]+["']?|$)/g;
    const sentences = cleaned.match(sentenceRegex) || [];

    // Filter out very short sentences and code-like content
    const validSentences = sentences
      .map(s => s.trim())
      .filter(s => {
        // Remove sentences that are too short
        if (s.split(/\s+/).length < 4 || s.length < 20) return false;
        
        // Remove likely code snippets
        if (s.includes('import ') || s.includes('def ') || s.includes('= ') || s.includes('{') || s.includes('}')) return false;
        
        // Remove reference-like sentences
        if (s.startsWith('^') || s.startsWith('http') || /^\s*\d+\.\s*/.test(s)) return false;
        
        // Remove navigation-like content
        if (s.toLowerCase().includes('click here') || s.toLowerCase().includes('next page')) return false;
        
        return true;
      });

    if (validSentences.length <= numSentences) return validSentences.join(' ');
  
    // Enhanced stop words list
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'to', 'of', 'in', 'for', 'with', 'on', 'at', 'by', 'this', 'that',
      'there', 'here', 'what', 'where', 'when', 'how', 'all', 'any',
      'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
      'very', 'can', 'will', 'just', 'should', 'now', 'click', 'page'
    ]);
    
    // Build a frequency map of meaningful words and phrases
    const wordFreq = {};
    const phraseFreq = {};
    validSentences.forEach(sentence => {
      // Word frequency
      const words = sentence.toLowerCase().match(/\b\w+\b/g) || [];
      words.forEach(word => {
        if (!stopWords.has(word) && word.length > 2) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });
      
      // Phrase frequency (2-3 word phrases)
      for (let i = 0; i < words.length - 1; i++) {
        const phrase = words.slice(i, i + 2).join(' ');
        if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
          phraseFreq[phrase] = (phraseFreq[phrase] || 0) + 1;
        }
      }
    });
    
    // Score each sentence based on multiple factors
    const sentenceScores = validSentences.map((sentence, index) => {
      const words = sentence.toLowerCase().match(/\b\w+\b/g) || [];
      
      // Word frequency score - ignore stop words
      const frequencyScore = words
        .filter(word => !stopWords.has(word))
        .reduce((score, word) => score + (wordFreq[word] || 0), 0) / 
        (words.filter(word => !stopWords.has(word)).length || 1);
      
      // Phrase importance score
      const phraseScore = words.reduce((score, _, i) => {
        if (i === words.length - 1) return score;
        const phrase = words.slice(i, i + 2).join(' ');
        return score + (phraseFreq[phrase] || 0);
      }, 0) / (words.length || 1);
      
      // Position score (both beginning and end of article are important)
      const positionScore = index < validSentences.length * 0.2 ? 
        1 - (index / (validSentences.length * 0.2)) : // Beginning bonus
        (index > validSentences.length * 0.8 ? 
          (index - validSentences.length * 0.8) / (validSentences.length * 0.2) : // End bonus
          0.2); // Middle sentences get less weight
      
      // Length score - prefer medium length sentences
      const lengthScore = Math.exp(-(Math.abs(words.length - 20) / 20));
      
      // Diversity score - prefer sentences with more unique words
      const uniqueWords = new Set(words.filter(word => !stopWords.has(word))).size;
      const diversityScore = uniqueWords / words.length;
      
      // Final weighted score
      const finalScore = (
        frequencyScore * 0.3 +
        phraseScore * 0.2 +
        positionScore * 0.2 +
        lengthScore * 0.15 +
        diversityScore * 0.15
      );
      
      return {
        sentence: sentence.trim(),
        originalIndex: index,
        score: finalScore
      };
    });
    
    // Select top sentences and restore original order
    const topSentences = sentenceScores
      .sort((a, b) => b.score - a.score)
      .slice(0, numSentences)
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map(item => item.sentence);
    
    return topSentences.join(' ');
  }

  // Function to inject scripts
  async function injectContentScripts(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['lib/Readability.js']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      return true;
    } catch (err) {
      console.log('Script injection error:', err.message);
      return false;
    }
  }

  // Function to send message with timeout
  function sendMessageWithTimeout(tabId, message, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout: No response received'));
      }, timeout);

      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Handle the "Summarize" button click with improved error handling
  summarizeBtn.addEventListener('click', async function() {
    // Show loader, hide summary/error
    loader.classList.remove('hidden');
    summaryContainer.classList.add('hidden');
    error.classList.add('hidden');

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Check if we can inject scripts into this tab
      if (!tab.url || !tab.url.startsWith('http')) {
        throw new Error('Cannot summarize this page. Extension only works on web pages.');
      }

      // Try to inject the content scripts
      const injected = await injectContentScripts(tab.id);
      if (!injected) {
        console.log('Using existing content scripts...');
      }

      // Wait a moment for scripts to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send message to content script with timeout
      const response = await sendMessageWithTimeout(tab.id, { action: "extractContent" });
      
      if (!response) {
        throw new Error('Failed to get response from page. Please refresh and try again.');
      }

      if (!response.content || response.content.length < 50) {
        throw new Error('Could not extract meaningful content from this page. The page might be empty or still loading.');
      }

      // Status indicator update
      const statusIndicator = document.getElementById('status-indicator');
      if (statusIndicator) {
        statusIndicator.textContent = 'Content extracted!';
        statusIndicator.classList.remove('hidden');
        statusIndicator.classList.add('success');
      }

      // Get the selected summary length
      const sentenceCount = parseInt(document.getElementById('sentence-count').value) || 5;
      const summary = extractiveSummarize(response.content, sentenceCount);

      // Hide loader
      loader.classList.add('hidden');

      if (!summary || summary.trim().length === 0) {
        throw new Error('No meaningful summary could be generated. The content might be too short or not in a readable format.');
      }

      // Display summary
      summaryText.textContent = summary;

      // Show word count
      const words = summary.split(/\s+/).length;
      wordCount.textContent = `${words} words`;

      // Show the summary container
      summaryContainer.classList.remove('hidden');

    } catch (err) {
      console.error('Error:', err);
      loader.classList.add('hidden');
      error.classList.remove('hidden');
      
      // Handle different types of errors
      let errorMessage;
      if (err.message.includes('Cannot access contents of url')) {
        errorMessage = 'Cannot access this page. Try opening a regular webpage.';
      } else if (err.message.includes('Message timeout')) {
        errorMessage = 'Page took too long to respond. Please refresh and try again.';
      } else if (err.message.includes('Receiving end does not exist')) {
        errorMessage = 'Please refresh the page and try again.';
      } else {
        errorMessage = err.message || 'An unexpected error occurred. Please try again.';
      }
      
      error.querySelector('p').textContent = errorMessage;
    }
  });

  // Handle the "Copy Summary" button click.
  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(summaryText.textContent)
      .then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy Summary';
        }, 2000);
      });
  });
});