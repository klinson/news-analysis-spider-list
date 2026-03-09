const axios = require('axios');
const config = require('./config');
const logger = require('./utils').logger;

class APIClient {
  constructor() {
    this.baseURL = config.apiBaseUrl;
    this.headers = {
      'Authorization': `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 获取启用的渠道列表
   * 只获取 spider 类型的渠道(动态网页爬虫)
   */
  async getChannels() {
    try {
      const response = await axios.get(`${this.baseURL}/channels/enabled`, {
        headers: this.headers,
        params: {
          type: 'spider' // 只获取 spider 类型的渠道
        },
        timeout: 10000
      });
      
      if (response.data.success) {
        logger.info(`获取到 ${response.data.data.length} 个 Spider 类型渠道`);
        return response.data.data;
      }
      
      logger.error('获取渠道失败:', response.data.message);
      return [];
    } catch (error) {
      if (error.response) {
        // 服务器返回了错误响应
        const status = error.response.status;
        const statusText = error.response.statusText;
        const data = error.response.data;
        
        logger.error(`API 请求失败 [${status} ${statusText}]`);
        
        if (status === 401) {
          logger.error('认证失败: Token 无效或未配置');
          logger.error(`请求 URL: ${this.baseURL}/channels/enabled`);
          logger.error(`Token (前10位): ${config.apiToken.substring(0, 10)}...`);
          logger.error('请检查:');
          logger.error('1. .env 文件中的 API_TOKEN 是否正确');
          logger.error('2. Laravel 服务端 .env 中的 API_TOKEN 是否一致');
          logger.error('3. Token 是否包含特殊字符或空格');
        } else if (status === 404) {
          logger.error('接口不存在: 请检查 API 路由配置');
        } else if (status === 500) {
          logger.error('服务器内部错误:', data.message || '未知错误');
        }
        
        if (data && data.message) {
          logger.error(`错误信息: ${data.message}`);
        }
      } else if (error.request) {
        // 请求已发送但没有收到响应
        logger.error('无法连接到服务器');
        logger.error(`请求 URL: ${this.baseURL}/channels/enabled`);
        logger.error('请检查:');
        logger.error('1. Laravel 服务是否正在运行');
        logger.error('2. API_BASE_URL 配置是否正确');
        logger.error('3. 防火墙或网络设置');
      } else {
        // 请求配置出错
        logger.error('请求配置错误:', error.message);
      }
      
      return [];
    }
  }

  /**
   * 获取渠道的爬虫规则
   */
  async getChannelRule(channelId) {
    try {
      const response = await axios.get(`${this.baseURL}/channels/${channelId}/rule`, {
        headers: this.headers,
        timeout: 10000
      });
      
      if (response.status === 404) {
        logger.warn(`渠道 ${channelId} 没有配置规则`);
        return null;
      }
      
      if (response.data.success) {
        return response.data.data;
      }
      
      return null;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logger.warn(`渠道 ${channelId} 没有配置规则`);
        return null;
      }
      logger.error('获取规则失败:', error.message);
      return null;
    }
  }

  /**
   * 提交 HTML 用于规则生成
   */
  async submitHtml(channelId, html, url) {
    try {
      const response = await axios.post(
        `${this.baseURL}/channels/${channelId}/html`,
        { html, url },
        {
          headers: this.headers,
          timeout: 30000,
          maxBodyLength: 5 * 1024 * 1024 // 5MB
        }
      );
      
      if (response.data.success) {
        logger.info('HTML 提交成功,等待规则配置');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('提交 HTML 失败:', error.message);
      return false;
    }
  }

  /**
   * 批量提交文章基本信息到队列
   */
  async submitArticles(articles) {
    try {
      const response = await axios.post(
        `${this.baseURL}/queue/batch`,
        { items: articles },
        {
          headers: this.headers,
          timeout: 60000
        }
      );
      
      if (response.data.success) {
        const data = response.data.data;
        logger.info(`提交成功: 接收 ${data.received} 条, 插入 ${data.inserted} 条, 跳过 ${data.duplicates} 条重复`);
        
        if (data.errors && data.errors.length > 0) {
          logger.warn(`${data.errors.length} 条文章提交失败`);
          data.errors.forEach(err => {
            logger.error(`  - 文章 ${err.index}: ${err.error}`);
          });
        }
        
        return response.data;
      }
      
      logger.error('提交失败:', response.data.message);
      return { success: false };
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        logger.error(`提交文章失败 [${status}]`);
        
        if (data && data.message) {
          logger.error(`错误信息: ${data.message}`);
        }
        
        if (data && data.errors) {
          logger.error('验证错误:');
          Object.keys(data.errors).forEach(field => {
            data.errors[field].forEach(msg => {
              logger.error(`  - ${field}: ${msg}`);
            });
          });
        }
      } else {
        logger.error('提交文章失败:', error.message);
      }
      
      return { success: false };
    }
  }
}

module.exports = APIClient;
