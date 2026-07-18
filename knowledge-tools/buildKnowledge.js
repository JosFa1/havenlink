#!/usr/bin/env node

/**
 * HavenLink Knowledge Extraction Tool
 * Crawls public HTML pages and extracts website content into a searchable knowledge base
 * 
 * Usage: node buildKnowledge.js
 * Output: output/site.json (all pages), output/chunks.json (chunked content)
 */

const fs = require('fs');
const path = require('path');

// Simple HTML tag stripper (extracts text content)
function stripHtmlTags(html) {
  if (!html) return '';
  
  // Remove script tags and content
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove style tags and content
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove SVG content (icons)
  html = html.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  
  // Remove event handlers and aria attributes to clean up
  html = html.replace(/\s(on\w+|aria-[a-z-]+|role|data-[a-z-]+)="[^"]*"/gi, '');
  
  // Remove meta tags, links, etc
  html = html.replace(/<(meta|link|base|title|script|style|noscript)\b[^>]*>/gi, '');
  
  // Convert closing br, hr, li to spaces
  html = html.replace(/<\s*(br|hr|li|\/li|\/p|\/div|\/section)\s*\/?>/gi, '\n');
  
  // Remove all other HTML tags
  html = html.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  html = html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'");
  
  // Clean up whitespace
  html = html.replace(/\s+/g, ' ').trim();
  
  return html;
}

// Extract title from HTML
function extractTitle(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }
  
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return stripHtmlTags(h1Match[1]);
  }
  
  return 'Untitled';
}

// Extract main content by removing navigation, footer, and non-essential elements
function extractMainContent(html) {
  let content = html;
  
  // Remove nav bars
  content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  
  // Remove footers
  content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  
  // Remove header elements that are just navigation
  content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  
  // Remove social links sections
  content = content.replace(/<div[^>]*class="[^"]*social[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  
  // Remove button elements that are just UI
  content = content.replace(/<button[^>]*(?!onclick="document)[^>]*>[\s\S]*?<\/button>/gi, '');
  
  // Remove sidebar cards with quick facts
  content = content.replace(/<div[^>]*class="[^"]*sidebar[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  
  return content;
}

// Extract structured content sections
function extractSections(html) {
  const sections = [];
  
  // Match heading + following content
  const sectionRegex = /<(h[1-6])[^>]*>([^<]+)<\/\1>([\s\S]*?)(?=<h[1-6]|$)/gi;
  let match;
  
  while ((match = sectionRegex.exec(html)) !== null) {
    const heading = stripHtmlTags(match[2]).trim();
    const content = stripHtmlTags(match[3]).trim();
    
    if (heading && content) {
      sections.push({
        heading,
        content
      });
    }
  }
  
  return sections;
}

// Get word count
function getWordCount(text) {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

// Pages to extract
const pages = [
  {
    url: '/',
    file: 'public/index.html',
    title: 'Homepage'
  },
  {
    url: '/partner',
    file: 'public/partner.html',
    title: 'Partner With HavenLink'
  },
  {
    url: '/team',
    file: 'public/team.html',
    title: 'The HavenLink Team'
  },
  {
    url: '/adopt/home-study',
    file: 'public/adopt/home-study.html',
    title: 'Home Study Service'
  },
  {
    url: '/adopt/intake-form',
    file: 'public/adopt/intake-form.html',
    title: 'Family Intake Form'
  },
  {
    url: '/adopt/resources',
    file: 'public/adopt/resources.html',
    title: 'Post-Adoption Resource Finder'
  },
  {
    url: '/adopt/matching',
    file: 'public/adopt/matching.html',
    title: 'Compatibility Matching'
  }
];

// Extract knowledge from all pages
function buildKnowledgeBase() {
  const projectRoot = path.join(__dirname, '..');
  const siteData = [];
  const allChunks = [];
  let chunkId = 1;
  let totalWords = 0;
  const skipped = [];
  
  console.log('Building HavenLink Knowledge Base...\n');
  
  for (const page of pages) {
    const filePath = path.join(projectRoot, page.file);
    
    try {
      // Read HTML file
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  SKIPPED: ${page.url} (file not found: ${page.file})`);
        skipped.push(page);
        continue;
      }
      
      const html = fs.readFileSync(filePath, 'utf8');
      
      // Extract content
      const title = extractTitle(html) || page.title;
      const mainContent = extractMainContent(html);
      const text = stripHtmlTags(mainContent).trim();
      const wordCount = getWordCount(text);
      
      if (!text || wordCount < 50) {
        console.log(`⚠️  SKIPPED: ${page.url} (insufficient content: ${wordCount} words)`);
        skipped.push(page);
        continue;
      }
      
      // Add to site data
      siteData.push({
        url: page.url,
        title: title,
        content: text,
        wordCount: wordCount
      });
      
      totalWords += wordCount;
      console.log(`✓ Extracted: ${page.url} (${wordCount} words)`);
      
      // Create chunks from this page
      const sections = extractSections(mainContent);
      let currentChunk = '';
      let currentChunkWords = 0;
      
      for (const section of sections) {
        const sectionText = `${section.heading}\n\n${section.content}`;
        const sectionWords = getWordCount(sectionText);
        
        // Start new chunk if current one would exceed limit
        if (currentChunkWords > 0 && currentChunkWords + sectionWords > 400) {
          if (currentChunk.trim()) {
            const chunkWords = getWordCount(currentChunk);
            allChunks.push({
              id: `chunk-${String(chunkId).padStart(3, '0')}`,
              url: page.url,
              title: title,
              content: currentChunk.trim(),
              wordCount: chunkWords
            });
            chunkId++;
          }
          currentChunk = '';
          currentChunkWords = 0;
        }
        
        currentChunk += (currentChunk ? '\n\n' : '') + sectionText;
        currentChunkWords += sectionWords;
      }
      
      // Add remaining chunk
      if (currentChunk.trim()) {
        const chunkWords = getWordCount(currentChunk);
        allChunks.push({
          id: `chunk-${String(chunkId).padStart(3, '0')}`,
          url: page.url,
          title: title,
          content: currentChunk.trim(),
          wordCount: chunkWords
        });
        chunkId++;
      }
      
    } catch (error) {
      console.log(`✗ ERROR processing ${page.url}: ${error.message}`);
      skipped.push(page);
    }
  }
  
  // Save site.json
  const siteJsonPath = path.join(__dirname, 'output', 'site.json');
  fs.writeFileSync(siteJsonPath, JSON.stringify(siteData, null, 2), 'utf8');
  console.log(`\n✓ Created: output/site.json (${siteData.length} pages)`);
  
  // Save chunks.json
  const chunksJsonPath = path.join(__dirname, 'output', 'chunks.json');
  fs.writeFileSync(chunksJsonPath, JSON.stringify(allChunks, null, 2), 'utf8');
  console.log(`✓ Created: output/chunks.json (${allChunks.length} chunks)`);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('KNOWLEDGE BASE BUILD SUMMARY');
  console.log('='.repeat(50));
  console.log(`Pages extracted: ${siteData.length}`);
  console.log(`Total words: ${totalWords}`);
  console.log(`Chunks created: ${allChunks.length}`);
  console.log(`Pages skipped: ${skipped.length}`);
  if (skipped.length > 0) {
    console.log(`  - ${skipped.map(p => p.url).join(', ')}`);
  }
  console.log('='.repeat(50));
  
  return {
    pages: siteData,
    chunks: allChunks,
    stats: {
      pagesExtracted: siteData.length,
      totalWords: totalWords,
      chunksCreated: allChunks.length,
      pagesSkipped: skipped.length,
      skippedPages: skipped
    }
  };
}

// Run if executed directly
if (require.main === module) {
  buildKnowledgeBase();
}

module.exports = { buildKnowledgeBase, stripHtmlTags, extractMainContent };
