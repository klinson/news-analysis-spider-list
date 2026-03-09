const puppeteer = require('puppeteer');
const config = require('./config');
const { logger, sleep, parseDate, resolveUrl } = require('./utils');

class ListCrawler {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.browser = null;
  }

  /**
   * 初始化浏览器
   */
  async init() {
    logger.info('启动 Puppeteer...');
    this.browser = await puppeteer.launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    logger.info('Puppeteer 启动成功');
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('Puppeteer 已关闭');
    }
  }

  /**
   * 采集指定渠道
   */
  async crawlChannel(channel) {
    const channelId = channel.id;
    const channelName = channel.name;
    
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`采集渠道: ${channelName} (ID: ${channelId})`);
    logger.info('='.repeat(60));
    
    // 获取规则
    const rule = await this.apiClient.getChannelRule(channelId);
    
    if (!rule) {
      logger.warn('渠道没有配置规则,尝试上报 HTML');
      await this.submitHtmlForRule(channelId, channel.url);
      return [];
    }
    
    // 按规则采集
    return await this.crawlWithRule(channel, rule);
  }

  /**
   * 按规则采集
   */
  async crawlWithRule(channel, rule) {
    const articles = [];
    const maxPages = Math.min(rule.max_pages || 1, config.maxPages);
    
    // 判断分页类型
    const paginationType = rule.pagination_config?.pagination_type || 'none';
    
    if (paginationType === 'click') {
      // 点击翻页模式 - 在同一个页面点击"下一页"按钮
      return await this.crawlWithClickPagination(channel, rule, maxPages);
    } else if (paginationType === 'scroll') {
      // 滚动加载模式 - 滚动到底部触发加载更多
      return await this.crawlWithScrollPagination(channel, rule, maxPages);
    } else {
      // URL 翻页模式 - 每页打开新 URL
      return await this.crawlWithUrlPagination(channel, rule, maxPages);
    }
  }
  
  /**
   * URL 翻页模式
   */
  async crawlWithUrlPagination(channel, rule, maxPages) {
    const allArticles = [];
    
    for (let page = 1; page <= maxPages; page++) {
      logger.info(`采集第 ${page} 页...`);
      
      const pageUrl = this.buildPageUrl(rule.entry_url, rule.pagination_config, page);
      const pageArticles = await this.crawlPage(channel, rule, page, pageUrl);
      
      if (pageArticles.length === 0) {
        logger.info('未采集到新内容,停止翻页');
        break;
      }
      
      // 立即提交当前页
      await this.submitPageArticles(pageArticles, page);
      allArticles.push(...pageArticles);
      
      // 翻页间隔
      if (page < maxPages) {
        await sleep(2000);
      }
    }
    
    logger.info(`共采集到 ${allArticles.length} 条文章`);
    return allArticles;
  }
  
  /**
   * 滚动加载模式 - 滚动到底部触发加载更多内容
   */
  async crawlWithScrollPagination(channel, rule, maxPages) {
    const allArticles = [];
    const page = await this.browser.newPage();
    const seenUrls = new Set();  // 用于去重
    
    try {
      // 设置 User Agent
      await page.setUserAgent(config.userAgent);
      
      // 打开首页
      logger.info(`访问: ${rule.entry_url}`);
      await page.goto(rule.entry_url, {
        waitUntil: 'networkidle2',
        timeout: config.timeout
      });
      
      await sleep(2000);
      
      const scrollDelay = rule.pagination_config?.scroll_delay || 2000;
      let noNewContentCount = 0;  // 连续没有新内容的次数
      
      // 滚动加载多次
      for (let scrollNum = 1; scrollNum <= maxPages; scrollNum++) {
        logger.info(`第 ${scrollNum} 次滚动加载...`);
        
        // 提取当前页面的文章
        const pageArticles = await this.extractArticles(
          page, 
          channel.id, 
          rule.crawl_config, 
          rule.entry_url, 
          page.url()
        );
        
        // 过滤掉已经见过的文章
        const newArticles = pageArticles.filter(article => {
          if (seenUrls.has(article.url)) {
            return false;
          }
          seenUrls.add(article.url);
          return true;
        });
        
        logger.info(`从页面提取 ${pageArticles.length} 条文章, 其中 ${newArticles.length} 条新文章`);
        
        if (newArticles.length === 0) {
          noNewContentCount++;
          if (noNewContentCount >= 2) {
            logger.info('连续2次没有新内容,停止滚动');
            break;
          }
        } else {
          noNewContentCount = 0;  // 重置计数器
          
          // 立即提交新文章
          await this.submitPageArticles(newArticles, scrollNum);
          allArticles.push(...newArticles);
        }
        
        // 如果还没到最后一次，继续滚动
        if (scrollNum < maxPages) {
          // 滚动到页面底部
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          
          logger.info(`等待 ${scrollDelay}ms 加载新内容...`);
          await sleep(scrollDelay);
          
          // 等待网络空闲，确保新内容加载完成
          try {
            await page.waitForNetworkIdle({ timeout: 5000 });
          } catch (e) {
            // 超时也继续
          }
        }
      }
      
      logger.info(`共采集到 ${allArticles.length} 条文章`);
      return allArticles;
      
    } catch (error) {
      logger.error(`滚动加载失败: ${error.message}`);
      return allArticles;
    } finally {
      await page.close();
    }
  }
  
  /**
   * 点击翻页模式
   */
  async crawlWithClickPagination(channel, rule, maxPages) {
    const allArticles = [];
    const page = await this.browser.newPage();
    
    try {
      // 设置 User Agent
      await page.setUserAgent(config.userAgent);
      
      // 打开首页
      logger.info(`访问: ${rule.entry_url}`);
      await page.goto(rule.entry_url, {
        waitUntil: 'networkidle2',
        timeout: config.timeout
      });
      
      await sleep(2000);
      
      // 采集第 1 页
      logger.info('采集第 1 页...');
      let pageArticles = await this.extractArticles(page, channel.id, rule.crawl_config, rule.entry_url, rule.entry_url);
      logger.info(`从页面提取 ${pageArticles.length} 条文章`);
      
      // 立即提交第 1 页
      if (pageArticles.length > 0) {
        await this.submitPageArticles(pageArticles, 1);
        allArticles.push(...pageArticles);
      }
      
      // 点击翻页
      const nextButtonSelector = rule.pagination_config?.next_button_selector;
      if (nextButtonSelector) {
        for (let pageNum = 2; pageNum <= maxPages; pageNum++) {
          try {
            // 等待下一页按钮出现
            await page.waitForSelector(nextButtonSelector, { timeout: 5000 });
            
            // 检查按钮是否可点击
            const isDisabled = await page.evaluate((selector) => {
              const button = document.querySelector(selector);
              if (!button) return true;
              
              // 检查是否有禁用类名或属性
              if (button.classList.contains('disabled') || 
                  button.classList.contains('pager-next-disabled') ||
                  button.hasAttribute('disabled')) {
                return true;
              }
              
              return false;
            }, nextButtonSelector);
            
            if (isDisabled) {
              logger.info('已到最后一页,停止翻页');
              break;
            }
            
            // 点击下一页
            logger.info(`点击翻页到第 ${pageNum} 页...`);
            await page.click(nextButtonSelector);
            
            // 等待页面加载
            await sleep(3000);
            
            // 获取当前页面 URL 作为 referer
            const currentUrl = page.url();
            
            // 提取文章
            pageArticles = await this.extractArticles(page, channel.id, rule.crawl_config, rule.entry_url, currentUrl);
            logger.info(`从页面提取 ${pageArticles.length} 条文章`);
            
            if (pageArticles.length === 0) {
              logger.info('未采集到新内容,停止翻页');
              break;
            }
            
            // 立即提交当前页
            await this.submitPageArticles(pageArticles, pageNum);
            allArticles.push(...pageArticles);
            
            // 翻页间隔
            if (pageNum < maxPages) {
              await sleep(2000);
            }
            
          } catch (error) {
            logger.error(`翻页失败: ${error.message}`);
            break;
          }
        }
      }
      
      logger.info(`共采集到 ${allArticles.length} 条文章`);
      return allArticles;
      
    } catch (error) {
      logger.error(`采集失败: ${error.message}`);
      return allArticles;
    } finally {
      await page.close();
    }
  }
  
  /**
   * 提交单页文章
   */
  async submitPageArticles(articles, pageNum) {
    try {
      const result = await this.apiClient.submitArticles(articles);
      
      if (result.success) {
        const data = result.data;
        logger.info(`第 ${pageNum} 页提交成功: 接收 ${data.received} 条, 插入 ${data.inserted} 条, 跳过 ${data.duplicates} 条重复`);
      } else {
        logger.error(`第 ${pageNum} 页提交失败`);
      }
      
      return result;
    } catch (error) {
      logger.error(`第 ${pageNum} 页提交失败: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 采集单个页面
   */
  async crawlPage(channel, rule, pageNum, pageUrl) {
    const page = await this.browser.newPage();
    
    try {
      // 设置 User Agent
      await page.setUserAgent(config.userAgent);
      
      // 构建页面 URL
      logger.info(`访问: ${pageUrl}`);
      
      // 打开页面
      await page.goto(pageUrl, {
        waitUntil: 'networkidle2',
        timeout: config.timeout
      });
      
      // 等待内容加载
      await sleep(2000);
      
      // 提取文章列表，传递当前页面 URL 作为 referer
      const articles = await this.extractArticles(page, channel.id, rule.crawl_config, rule.entry_url, pageUrl);
      
      logger.info(`从页面提取 ${articles.length} 条文章`);
      return articles;
      
    } catch (error) {
      logger.error(`采集页面失败: ${error.message}`);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * 提取文章列表 - 只提取基本信息(标题、链接、时间)
   */
  async extractArticles(page, channelId, crawlConfig, baseUrl, referer) {
    try {
      const articles = await page.evaluate((config, channelId) => {
        // 辅助函数: 通过 XPath 获取文本
        function getTextByXPath(xpath, contextNode = document) {
          const result = document.evaluate(
            xpath,
            contextNode,
            null,
            XPathResult.STRING_TYPE,
            null
          );
          return result.stringValue.trim();
        }
        
        // 辅助函数: 获取所有匹配的节点
        function getElementsByXPath(xpath, contextNode = document) {
          const result = document.evaluate(
            xpath,
            contextNode,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          const nodes = [];
          for (let i = 0; i < result.snapshotLength; i++) {
            nodes.push(result.snapshotItem(i));
          }
          return nodes;
        }
        
        const articles = [];
        const listItems = getElementsByXPath(config.list_item_xpath);
        
        for (const item of listItems) {
          try {
            // 提取标题
            const title = getTextByXPath(config.title_xpath, item);
            if (!title) continue;
            
            // 提取 URL
            const url = getTextByXPath(config.url_xpath, item);
            if (!url) continue;
            
            // 提取时间(可选)
            const timeStr = config.time_xpath ? 
              getTextByXPath(config.time_xpath, item) : '';
            
            articles.push({
              channel_id: channelId,
              title: title.substring(0, 500),
              url: url,
              published_at: timeStr
            });
          } catch (error) {
            console.error('提取文章失败:', error);
          }
        }
        
        return articles;
      }, crawlConfig, channelId);
      
      // 处理 URL 和日期，添加 referer
      return articles.map(article => ({
        channel_id: article.channel_id,
        title: article.title,
        url: resolveUrl(baseUrl, article.url).substring(0, 1000),
        referer: referer, // 添加来源页面 URL
        published_at: parseDate(article.published_at)
      }));
      
    } catch (error) {
      logger.error('提取文章失败:', error.message);
      return [];
    }
  }

  /**
   * 构建页面 URL
   */
  buildPageUrl(baseUrl, paginationConfig, pageNum) {
    if (!paginationConfig || pageNum === 1) {
      return baseUrl;
    }
    
    const paginationType = paginationConfig.pagination_type;
    
    if (paginationType === 'url' && paginationConfig.url_pattern) {
      return paginationConfig.url_pattern.replace('{page}', pageNum);
    }
    
    return baseUrl;
  }

  /**
   * 提交 HTML 用于规则生成
   */
  async submitHtmlForRule(channelId, url) {
    const page = await this.browser.newPage();
    
    try {
      await page.setUserAgent(config.userAgent);
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: config.timeout
      });
      
      await sleep(2000);
      
      const html = await page.content();
      await this.apiClient.submitHtml(channelId, html, url);
      
    } catch (error) {
      logger.error('提交 HTML 失败:', error.message);
    } finally {
      await page.close();
    }
  }
}

module.exports = ListCrawler;
