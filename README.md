多模型AI聊天助手Chrome扩展，支持DeepSeek、Moonshot、Qwen等主流AI模型的流式对话。

## 功能特性

- **多模型支持** 
  - 目前支持
   - moonshot 8k、moonshot 32k
   - 阿里云 qwen-max-latest、qwen-max、百炼DeepSeek r1、百炼DeepSeek v3
   - DeepSeek源生 DeepSeek r1、DeepSeek v3
   - 火山方舟引擎 豆包大家族、DeepSeek等
- **实时流式响应**
  - 体验类ChatGPT的逐字输出效果
  - 支持DeepSeek R1的思维链输出
- **安全存储** - 使用Web Crypto API加密存储API密钥
- **现代UI** 
  - 可拖拽调整位置
  - 可缩放窗口
  - 响应式设计
  - 代码高亮显示
- **智能错误处理**
  - 网络错误重试
  - 权限验证

## 安装步骤
Chrome加载扩展
   - 下载源代码并解压。
   - 访问 `chrome://extensions/`
   - 开启"开发者模式" 
   - 点击"加载已解压的扩展程序"
   - 选择刚才解压的文件夹。
## 使用指南

1. **配置API密钥**
   - 点击扩展图标打开设置
   - 选择AI服务商
   - 输入对应API密钥
   - 保存设置

   > 需要申请各厂商API密钥：
   > - [DeepSeek控制台](https://platform.deepseek.com/)
   > - [Moonshot控制台](https://platform.moonshot.cn/)
   > - [DashScope控制台](https://dashscope.aliyuncs.com/)

2. **开始对话**
   - 在任何网页点击扩展图标
   - 输入自己的APIKEY并选择模型后，点击start chat
   - 输入消息后点击发送
