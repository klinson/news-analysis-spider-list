const winston = require('winston');
const config = require('./config');

// 配置日志
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'crawler.log' })
  ]
});

/**
 * 等待指定时间
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 解析日期字符串
 * 支持多种格式:
 * - 标准日期时间: 2024-03-08 12:00:00
 * - 相对时间: 3天前, 2小时前, 30分钟前, 刚刚
 * - 中文描述: 今天, 昨天, 前天
 * - 英文相对时间: 3 days ago, 2 hours ago
 * 
 * @param {string} dateStr - 日期字符串
 * @param {Date} now - 当前时间 (可选，用于测试)
 * @returns {string} ISO 8601 格式的日期字符串，无法解析时返回空字符串
 */
function parseDate(dateStr, now = null) {
  if (!dateStr) {
    return '';
  }
  
  if (!now) {
    now = new Date();
  }
  
  dateStr = String(dateStr).trim();
  const originalStr = dateStr;  // 保存原始字符串用于日志
  
  // ========== 第一步：正则提取所有可能的日期格式 ==========
  
  // 1. 提取相对时间（优先级最高）
  // 中文: "3天前", "2小时前", "30分钟前"
  let relativeMatch = dateStr.match(/(\d+)\s*(年|月|周|天|日|小时|时|分钟|分|秒)\s*前/);
  if (relativeMatch) {
    dateStr = relativeMatch[0];
  }
  
  // 英文: "3 days ago", "2 hours ago"
  if (!relativeMatch) {
    const englishMatch = dateStr.match(/(\d+)\s*(year|month|week|day|hour|minute|second)s?\s+ago/i);
    if (englishMatch) {
      dateStr = englishMatch[0];
    }
  }
  
  // 复合相对时间: "1天2小时前"
  if (!relativeMatch) {
    const compoundMatch = dateStr.match(/(?:(\d+)天)?(?:(\d+)小时)?(?:(\d+)分钟)?(?:(\d+)秒)?前/);
    if (compoundMatch && (compoundMatch[1] || compoundMatch[2] || compoundMatch[3] || compoundMatch[4])) {
      dateStr = compoundMatch[0];
    }
  }
  
  // 2. 提取标准日期格式
  // 格式: 2024-03-08 12:00:00 或 2024-03-08
  const standardMatch = dateStr.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (standardMatch) {
    dateStr = standardMatch[0];
    // 统一分隔符为 -
    dateStr = dateStr.replace(/[/.]/g, '-');
  }
  
  // 3. 提取年月日格式（无分隔符）: 20240308
  if (!standardMatch) {
    const compactMatch = dateStr.match(/(\d{4})(\d{2})(\d{2})/);
    if (compactMatch) {
      const [, year, month, day] = compactMatch;
      dateStr = `${year}-${month}-${day}`;
    }
  }
  
  // 4. 提取月日格式: 03-08 或 3月8日
  if (!standardMatch) {
    // 数字格式: 03-08, 3-8
    const monthDayMatch = dateStr.match(/(\d{1,2})[-/.](\d{1,2})/);
    if (monthDayMatch) {
      const [, month, day] = monthDayMatch;
      // 补充年份
      dateStr = `${now.getFullYear()}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } else {
      // 中文格式: 3月8日
      const chineseDateMatch = dateStr.match(/(\d{1,2})月(\d{1,2})日/);
      if (chineseDateMatch) {
        const [, month, day] = chineseDateMatch;
        dateStr = `${now.getFullYear()}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
  }
  
  // ========== 第二步：处理特殊关键词 ==========
  
  if (['今天', '最新', '刚刚', 'now', 'just now'].includes(dateStr)) {
    return now.toISOString();
  }
  
  if (['昨天', 'yesterday'].includes(dateStr)) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString();
  }
  
  if (['前天', 'day before yesterday'].includes(dateStr)) {
    const dayBefore = new Date(now);
    dayBefore.setDate(dayBefore.getDate() - 2);
    return dayBefore.toISOString();
  }
  
  // ========== 第三步：处理相对时间 ==========
  
  // 中文相对时间
  relativeMatch = dateStr.match(/(\d+)\s*(年|月|周|天|日|小时|时|分钟|分|秒)前/);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    const result = new Date(now);
    
    switch (unit) {
      case '年':
        result.setFullYear(result.getFullYear() - value);
        break;
      case '月':
        result.setMonth(result.getMonth() - value);
        break;
      case '周':
        result.setDate(result.getDate() - value * 7);
        break;
      case '天':
      case '日':
        result.setDate(result.getDate() - value);
        break;
      case '小时':
      case '时':
        result.setHours(result.getHours() - value);
        break;
      case '分钟':
      case '分':
        result.setMinutes(result.getMinutes() - value);
        break;
      case '秒':
        result.setSeconds(result.getSeconds() - value);
        break;
    }
    
    return result.toISOString();
  }
  
  // 英文相对时间
  const englishMatch = dateStr.match(/(\d+)\s*(year|month|week|day|hour|minute|second)s?\s+ago/i);
  if (englishMatch) {
    const value = parseInt(englishMatch[1]);
    const unit = englishMatch[2].toLowerCase();
    const result = new Date(now);
    
    switch (unit) {
      case 'year':
        result.setFullYear(result.getFullYear() - value);
        break;
      case 'month':
        result.setMonth(result.getMonth() - value);
        break;
      case 'week':
        result.setDate(result.getDate() - value * 7);
        break;
      case 'day':
        result.setDate(result.getDate() - value);
        break;
      case 'hour':
        result.setHours(result.getHours() - value);
        break;
      case 'minute':
        result.setMinutes(result.getMinutes() - value);
        break;
      case 'second':
        result.setSeconds(result.getSeconds() - value);
        break;
    }
    
    return result.toISOString();
  }
  
  // 复合相对时间
  const compoundMatch = dateStr.match(/(?:(\d+)天)?(?:(\d+)小时)?(?:(\d+)分钟)?(?:(\d+)秒)?前/);
  if (compoundMatch && (compoundMatch[1] || compoundMatch[2] || compoundMatch[3] || compoundMatch[4])) {
    const days = parseInt(compoundMatch[1] || 0);
    const hours = parseInt(compoundMatch[2] || 0);
    const minutes = parseInt(compoundMatch[3] || 0);
    const seconds = parseInt(compoundMatch[4] || 0);
    
    const result = new Date(now);
    result.setDate(result.getDate() - days);
    result.setHours(result.getHours() - hours);
    result.setMinutes(result.getMinutes() - minutes);
    result.setSeconds(result.getSeconds() - seconds);
    
    return result.toISOString();
  }
  
  // ========== 第四步：清理并尝试解析标准格式 ==========
  
  // 移除常见干扰词
  dateStr = dateStr.replace(/发布|更新|刷新|内/g, '');
  dateStr = dateStr.replace(/\s+/g, ' ').trim();
  
  // 检查是否包含明显的日期特征（数字和分隔符）
  const hasDatePattern = /\d{4}|\d{1,2}[-/.:]\d{1,2}|年|月|日/.test(dateStr);
  
  if (hasDatePattern) {
    // 尝试解析标准格式
    try {
      const date = new Date(dateStr);
      // 验证解析结果是否合理（年份在 1900-2100 之间）
      if (!isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100) {
        return date.toISOString();
      }
    } catch (error) {
      // 继续尝试其他方法
    }
  }
  
  // ========== 第五步：所有方法都失败，返回空字符串 ==========
  
  logger.warn(`无法解析日期字符串: ${originalStr}, 返回空字符串`);
  return '';
}

/**
 * 处理相对 URL
 */
function resolveUrl(baseUrl, relativeUrl) {
  if (!relativeUrl) return '';
  
  // 已经是完整 URL
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }
  
  // 相对 URL
  try {
    const base = new URL(baseUrl);
    return new URL(relativeUrl, base.origin).href;
  } catch (error) {
    return relativeUrl;
  }
}

module.exports = {
  logger,
  sleep,
  parseDate,
  resolveUrl
};
