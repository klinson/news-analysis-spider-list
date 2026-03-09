require('dotenv').config();

module.exports = {
  // API 配置
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost/api',
  apiToken: process.env.API_TOKEN || '',
  
  // 日志配置
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Puppeteer 配置
  headless: process.env.HEADLESS !== 'false',
  timeout: parseInt(process.env.TIMEOUT) || 30000,
  
  // 采集配置
  maxPages: parseInt(process.env.MAX_PAGES) || 5,
  batchSize: parseInt(process.env.BATCH_SIZE) || 50,
  
  // User Agent
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};
