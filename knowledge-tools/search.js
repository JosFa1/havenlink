#!/usr/bin/env node

/**
 * HavenLink Knowledge Search Engine
 * Simple keyword-based search over extracted website content
 * 
 * Usage:
 *   const search = require('./search.js');
 *   const results = search.searchKnowledge('adoption process');
 */

const fs = require('fs');
const path = require('path');

// Load chunks at startup
let chunksCache = null;
let sitesCache = null;

function loadChunks() {
  if (!chunksCache) {
    const chunksPath = path.join(__dirname, 'output', 'chunks.json');
    if (fs.existsSync(chunksPath)) {
      const data = fs.readFileSync(chunksPath, 'utf8');
      chunksCache = JSON.parse(data);
    } else {
      chunksCache = [];
    }
  }
  return chunksCache;
}

function loadSites() {
  if (!sitesCache) {
    const sitePath = path.join(__dirname, 'output', 'site.json');
    if (fs.existsSync(sitePath)) {
      const data = fs.readFileSync(sitePath, 'utf8');
      sitesCache = JSON.parse(data);
    } else {
      sitesCache = [];
    }
  }
  return sitesCache;
}

// Tokenize query into search terms
function tokenizeQuery(query) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(term => term.length > 2) // Ignore very short terms
    .map(term => term.replace(/[^\w]/g, '')); // Remove special characters
}

// Calculate relevance score for a chunk
function calculateScore(chunk, queryTerms) {
  let score = 0;
  const content = (chunk.content + ' ' + chunk.title).toLowerCase();
  const words = content.split(/\s+/);
  
  for (const term of queryTerms) {
    // Count exact term matches
    const matches = (content.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length;
    score += matches * 10; // 10 points per exact match
    
    // Boost if term appears in title
    if (chunk.title.toLowerCase().includes(term)) {
      score += 5;
    }
  }
  
  return score;
}

// Search for knowledge content
function searchKnowledge(query, maxResults = 10) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  const queryTerms = tokenizeQuery(query);
  if (queryTerms.length === 0) {
    return [];
  }
  
  const chunks = loadChunks();
  
  // Score all chunks
  const scored = chunks.map(chunk => ({
    ...chunk,
    score: calculateScore(chunk, queryTerms)
  }));
  
  // Filter and sort
  const results = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ score, ...rest }) => ({
      ...rest,
      score: score
    }));
  
  return results;
}

// Search at page level (returns full pages)
function searchPages(query, maxResults = 5) {
  if (!query || query.trim().length === 0) {
    return [];
  }
  
  const queryTerms = tokenizeQuery(query);
  if (queryTerms.length === 0) {
    return [];
  }
  
  const sites = loadSites();
  
  // Score all pages
  const scored = sites.map(page => ({
    ...page,
    score: calculateScore(page, queryTerms)
  }));
  
  // Filter and sort
  const results = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ wordCount, ...rest }) => ({
      ...rest,
      preview: rest.content.substring(0, 200) + '...'
    }));
  
  return results;
}

// Suggest search terms based on available content
function suggestSearchTerms(partial, maxSuggestions = 5) {
  const chunks = loadChunks();
  const words = new Set();
  
  // Extract all significant words
  for (const chunk of chunks) {
    const text = (chunk.title + ' ' + chunk.content).toLowerCase();
    const matches = text.match(/\b\w{4,}\b/g) || [];
    matches.forEach(word => words.add(word));
  }
  
  // Filter by partial match
  const partial_lower = partial.toLowerCase();
  const suggestions = Array.from(words)
    .filter(word => word.startsWith(partial_lower))
    .sort()
    .slice(0, maxSuggestions);
  
  return suggestions;
}

// Get frequently mentioned topics
function getTopicFrequency(minFrequency = 2) {
  const chunks = loadChunks();
  const topics = {};
  
  const topicKeywords = [
    'adoption', 'family', 'agency', 'home study', 'matching',
    'children', 'intake', 'profile', 'compatibility', 'support',
    'safe', 'licensed', 'process', 'application', 'background'
  ];
  
  for (const chunk of chunks) {
    const text = (chunk.title + ' ' + chunk.content).toLowerCase();
    
    for (const topic of topicKeywords) {
      const regex = new RegExp(`\\b${topic}\\b`, 'g');
      const matches = (text.match(regex) || []).length;
      
      if (matches > 0) {
        topics[topic] = (topics[topic] || 0) + matches;
      }
    }
  }
  
  // Return sorted topics
  return Object.entries(topics)
    .filter(([_, count]) => count >= minFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, mentions: count }));
}

// Get knowledge base statistics
function getKnowledgeStats() {
  const chunks = loadChunks();
  const sites = loadSites();
  
  const totalWords = sites.reduce((sum, page) => sum + (page.wordCount || 0), 0);
  const avgWordsPerPage = sites.length > 0 ? Math.round(totalWords / sites.length) : 0;
  const avgWordsPerChunk = chunks.length > 0 ? Math.round(chunks.reduce((sum, chunk) => sum + (chunk.wordCount || 0), 0) / chunks.length) : 0;
  
  return {
    pagesIndexed: sites.length,
    chunksIndexed: chunks.length,
    totalWords: totalWords,
    averageWordsPerPage: avgWordsPerPage,
    averageWordsPerChunk: avgWordsPerChunk,
    pages: sites.map(p => ({ url: p.url, title: p.title }))
  };
}

// Interactive search CLI
function interactiveSearch() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('HavenLink Knowledge Search');
  console.log('========================\n');
  
  function prompt() {
    rl.question('Search (or "quit" to exit): ', (query) => {
      if (query.toLowerCase() === 'quit') {
        rl.close();
        return;
      }
      
      if (query.trim()) {
        const results = searchKnowledge(query, 3);
        if (results.length === 0) {
          console.log('\nNo results found.\n');
        } else {
          console.log(`\nFound ${results.length} results:\n`);
          results.forEach((result, idx) => {
            console.log(`${idx + 1}. [${result.url}] ${result.title} (score: ${result.score})`);
            console.log(`   ${result.content.substring(0, 100)}...\n`);
          });
        }
      }
      
      prompt();
    });
  }
  
  prompt();
}

// Run interactive mode if executed directly
if (require.main === module && process.argv[2] === '--interactive') {
  interactiveSearch();
} else if (require.main === module) {
  // Show stats
  console.log('Knowledge Base Statistics:');
  console.log(JSON.stringify(getKnowledgeStats(), null, 2));
}

module.exports = {
  searchKnowledge,
  searchPages,
  suggestSearchTerms,
  getTopicFrequency,
  getKnowledgeStats,
  tokenizeQuery,
  calculateScore
};
