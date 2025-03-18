# AI Chat Assistant Chrome 扩展技术文档

## 1. 项目概述

AI Chat Assistant 是一个 Chrome 扩展，允许用户在任何网页上与多种 AI 模型进行对话。该扩展支持多个 AI 提供商，包括 Moonshot AI、阿里云通义千问、DeepSeek 和火山方舟引擎。

### 1.1 主要功能

- 支持多个 AI 提供商和模型
- 可拖拽的聊天窗口
- Markdown 渲染支持
- 代码高亮显示
- 流式响应显示
- 思考过程（reasoning_content）显示
- 聊天历史记录保存和加载
- 响应式设计，适配不同设备

## 2. 技术架构

### 2.1 文件结构

```
llm-chat-on-web/
├── manifest.json       # 扩展配置文件
├── background.js       # 后台脚本
├── content.js          # 内容脚本
├── popup.html          # 弹出窗口界面
├── popup.js            # 弹出窗口逻辑
├── styles.css          # 样式文件
├── lib/
│   └── marked.min.js   # Markdown 渲染库
└── icons/              # 扩展图标
```

### 2.2 核心组件

#### 2.2.1 manifest.json

定义扩展的基本信息、权限和资源：
- 权限：activeTab, storage, scripting, tabs
- 主机权限：api.moonshot.cn, dashscope.aliyuncs.com, api.deepseek.com, ark.cn-beijing.volces.com
- 内容脚本：content.js, marked.min.js
- 后台脚本：background.js
- 弹出窗口：popup.html

#### 2.2.2 background.js

负责处理与 AI API 的通信和管理扩展状态：
- 处理来自内容脚本的消息
- 管理与 AI 提供商的 API 通信
- 处理流式响应
- 错误处理和状态管理

#### 2.2.3 content.js

负责创建和管理聊天界面：
- 创建可拖拽的聊天窗口
- 处理用户输入
- 显示 AI 响应
- 支持 Markdown 渲染
- 处理思考过程（reasoning_content）显示
- 管理聊天历史记录

#### 2.2.4 popup.html 和 popup.js

提供用户配置界面：
- API 密钥设置
- 提供商和模型选择
- 启动聊天功能

#### 2.2.5 styles.css

定义扩展的视觉样式：
- 聊天界面样式
- 消息气泡样式
- Markdown 渲染样式
- 思考过程（reasoning）样式
- 响应式布局

## 3. 功能实现详解

### 3.1 聊天界面

聊天界面通过 content.js 中的 `createChatInterface()` 函数创建，包含以下元素：
- 聊天头部（可拖拽）
- 消息容器
- 输入区域
- 发送按钮
- 调整大小的控制柄

### 3.2 AI 提供商支持

扩展支持多个 AI 提供商，每个提供商有不同的 API 端点和参数：

1. **Moonshot AI**
   - 模型：moonshot-v1-8k, moonshot-v1-32k
   - API 端点：https://api.moonshot.cn/v1/chat/completions

2. **阿里云通义千问**
   - 模型：qwen-max, qwen-max-latest, deepseek-r1, deepseek-v3
   - API 端点：https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation

3. **DeepSeek**
   - 模型：deepseek-chat, deepseek-reasoner
   - API 端点：https://api.deepseek.com/v1/chat/completions

4. **火山方舟引擎**
   - 自定义模型 ID
   - API 端点：https://ark.cn-beijing.volces.com/api/v1/chat/completions

### 3.3 思考过程（reasoning_content）支持

扩展支持显示 AI 的思考过程，主要实现在 content.js 中：

```javascript
// 处理思考过程
if (delta.reasoning_content && delta.reasoning_content.trim() !== '') {
  if (!reasoningDiv) {
    reasoningDiv = addMessage('reasoning', '', provider);
  }
  appendToMessage(reasoningDiv, delta.reasoning_content);
}
```

相关样式在 styles.css 中定义：

```css
.message.reasoning {
  background-color: var(--reasoning-bg);
  border-left: 3px solid var(--reasoning-border);
  margin-bottom: 8px;
}

.message.reasoning::before {
  content: "思考过程";
  display: block;
  font-size: var(--font-xs);
  color: var(--reasoning-label);
  margin-bottom: 4px;
  font-weight: 500;
}

.message.reasoning .message-content {
  color: var(--reasoning-text);
  font-size: var(--font-sm);
}
```

### 3.4 消息处理流程

1. 用户输入消息
2. 消息通过 content.js 发送到 background.js
3. background.js 调用相应的 AI API
4. 接收流式响应
5. 处理响应（包括思考过程和最终回答）
6. 实时渲染到聊天界面

### 3.5 历史记录管理

聊天历史记录通过 Chrome Storage API 保存和加载：

- `saveCurrentChat()`: 保存当前聊天记录
- `loadChatHistory()`: 加载历史聊天记录
- `clearChatHistory()`: 清除历史聊天记录

历史记录按提供商分类存储，使用 `chat_history_${provider}` 作为存储键。

## 4. 数据流

### 4.1 用户输入流程

```
用户输入 -> content.js (sendMessage) -> background.js (API 请求) -> AI 提供商 API -> 流式响应 -> background.js -> content.js (渲染)
```

### 4.2 配置流程

```
用户配置 (popup.html) -> popup.js -> chrome.storage.local -> content.js (读取配置)
```

### 4.3 历史记录流程

```
聊天内容 -> saveCurrentChat() -> chrome.storage.local -> loadChatHistory() -> 显示历史记录
```

## 5. 安全考虑

### 5.1 API 密钥存储

API 密钥使用 Chrome Storage API 存储，并在传输前进行加密处理。

### 5.2 内容安全策略

manifest.json 中定义了内容安全策略，限制脚本和连接来源：

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' https://api.moonshot.cn https://dashscope.aliyuncs.com https://ark.cn-beijing.volces.com;",
  "sandbox": "sandbox allow-scripts allow-forms allow-popups allow-modals"
}
```

## 6. 扩展点和未来改进

### 6.1 当前支持的扩展点

1. **添加新的 AI 提供商**
   - 在 popup.html 中添加新的提供商选项
   - 在 popup.js 中添加相应的模型选项
   - 在 content.js 中实现 API 调用逻辑

2. **自定义样式**
   - 修改 styles.css 以自定义界面外观

### 6.2 建议的改进

1. **完善 reasoning_content 支持**
   - 目前已经支持基本的思考过程显示，但可以进一步优化显示效果
   - 添加切换显示/隐藏思考过程的选项

2. **添加更多 AI 提供商**
   - 支持 OpenAI、Claude 等更多提供商

3. **增强安全性**
   - 实现更强的 API 密钥加密机制
   - 添加请求频率限制

4. **用户体验优化**
   - 添加主题切换功能
   - 支持消息引用和回复
   - 添加图像生成功能

5. **性能优化**
   - 优化大型聊天历史的加载性能
   - 实现消息分页加载

## 7. 故障排除

### 7.1 常见问题

1. **API 连接失败**
   - 检查 API 密钥是否正确
   - 确认网络连接
   - 查看浏览器控制台错误信息

2. **聊天界面不显示**
   - 检查内容脚本是否正确加载
   - 确认权限设置

3. **思考过程不显示**
   - 确认使用的模型支持 reasoning_content
   - 检查 API 响应格式

### 7.2 调试方法

1. 使用 Chrome 开发者工具检查控制台错误
2. 查看 background.js 的日志输出
3. 检查 Chrome 存储中的数据

## 8. 开发指南

### 8.1 本地开发设置

1. 克隆代码库
2. 在 Chrome 中加载解压的扩展
3. 使用 Chrome 开发者工具调试

### 8.2 添加新功能的步骤

1. 确定功能需求和设计
2. 修改相应的文件（content.js, background.js, popup.js 等）
3. 测试功能
4. 更新文档

### 8.3 发布流程

1. 更新版本号（manifest.json）
2. 打包扩展
3. 提交到 Chrome Web Store

## 9. API 参考

### 9.1 内部 API

#### 9.1.1 content.js

- `createChatInterface()`: 创建聊天界面
- `addMessage(role, content, provider)`: 添加消息
- `appendToMessage(messageElement, content)`: 追加内容到消息
- `sendToAPI(encryptedApiKey, model, message, provider)`: 发送消息到 API
- `saveCurrentChat()`: 保存当前聊天
- `loadChatHistory()`: 加载聊天历史

#### 9.1.2 background.js

- `handleMessage(request, sender, sendResponse)`: 处理消息
- `updateIcon()`: 更新扩展图标状态

#### 9.1.3 popup.js

- `updateModelOptions()`: 更新模型选项
- `saveSettings()`: 保存设置

### 9.2 外部 API

#### 9.2.1 Moonshot AI

- 端点: `https://api.moonshot.cn/v1/chat/completions`
- 方法: POST
- 参数:
  - model: 模型 ID
  - messages: 消息数组
  - stream: 是否流式响应

#### 9.2.2 阿里云通义千问

- 端点: `https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
- 方法: POST
- 参数:
  - model: 模型 ID
  - input.messages: 消息数组

#### 9.2.3 DeepSeek

- 端点: `https://api.deepseek.com/v1/chat/completions`
- 方法: POST
- 参数:
  - model: 模型 ID
  - messages: 消息数组
  - stream: 是否流式响应

#### 9.2.4 火山方舟引擎

- 端点: `https://ark.cn-beijing.volces.com/api/v1/chat/completions`
- 方法: POST
- 参数:
  - model: 模型 ID
  - messages: 消息数组
  - stream: 是否流式响应

## 10. 结论

AI Chat Assistant Chrome 扩展提供了一个功能丰富、用户友好的界面，允许用户在任何网页上与多种 AI 模型进行对话。该扩展支持思考过程显示、Markdown 渲染、代码高亮等高级功能，并具有良好的可扩展性。

通过本文档，开发者可以了解扩展的架构、功能实现和扩展点，为后续开发和维护提供参考。

---

## 附录：代码示例

### A.1 添加新的 AI 提供商

```javascript
// 在 popup.html 中添加新选项
<option value="new-provider">New Provider</option>

// 在 popup.js 中添加模型选项
if (provider === 'new-provider') {
  modelSelect.innerHTML = `
    <option value="new-model-1">New Model 1</option>
    <option value="new-model-2">New Model 2</option>
  `;
}

// 在 content.js 中添加 API 调用逻辑
if (provider === 'new-provider') {
  // 实现 API 调用
}
```

### A.2 自定义思考过程样式

```css
/* 在 styles.css 中添加或修改 */
.message.reasoning {
  background-color: #f8f9fa;
  border-left: 3px solid #4CAF50;
  margin: 8px 0;
  padding: 8px 12px;
}

.reasoning-content {
  font-size: 0.9em;
  color: #666;
}

/* 深色主题支持 */
@media (prefers-color-scheme: dark) {
  .message.reasoning {
    background-color: #2d2d2d;
    border-left-color: #45a049;
  }
  
  .reasoning-content {
    color: #aaa;
  }
}
``` 