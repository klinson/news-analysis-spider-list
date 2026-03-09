#!/usr/bin/env node

const APIClient = require('./src/api-client');
const ListCrawler = require('./src/crawler');
const { logger } = require('./src/utils');

async function main() {
  logger.info('='.repeat(60));
  logger.info('GlobalWatch 列表爬虫启动');
  logger.info('='.repeat(60));
  
  const apiClient = new APIClient();
  const crawler = new ListCrawler(apiClient);
  
  try {
    // 初始化浏览器
    await crawler.init();
    
    // 获取渠道列表
    const channels = await apiClient.getChannels();
    
    if (channels.length === 0) {
      logger.warn('没有找到启用的渠道');
      return;
    }
    
    logger.info(`找到 ${channels.length} 个启用的渠道`);
    
    // 统计信息
    let totalCollected = 0;
    
    // 遍历每个渠道
    for (const channel of channels) {
      try {
        // 采集渠道 (内部已按页提交)
        const articles = await crawler.crawlChannel(channel);
        
        if (articles.length > 0) {
          totalCollected += articles.length;
          logger.info(`渠道 ${channel.name} 采集完成: ${articles.length} 条文章`);
        } else {
          logger.info(`渠道 ${channel.name} 未采集到文章`);
        }
        
      } catch (error) {
        logger.error(`采集渠道失败: ${error.message}`);
      }
    }
    
    // 输出统计信息
    logger.info('\n' + '='.repeat(60));
    logger.info('采集任务完成');
    logger.info('='.repeat(60));
    logger.info(`总计采集: ${totalCollected} 条`);
    logger.info('='.repeat(60));
    
  } catch (error) {
    logger.error('程序异常:', error);
    process.exit(1);
  } finally {
    // 关闭浏览器
    await crawler.close();
  }
}

// 运行主函数
main().catch(error => {
  logger.error('未捕获的错误:', error);
  process.exit(1);
});
