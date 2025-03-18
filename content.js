console.log('Content script loaded');
console.log('Marked available:', typeof marked !== 'undefined');

// 确保 marked 可用
if (typeof marked === 'undefined') {
    console.error('Marked library not loaded!');
    // 尝试动态加载 marked
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('lib/marked.min.js');
    script.onload = () => {
        console.log('Marked loaded dynamically');
    };
    document.head.appendChild(script);
}

// 初始化 marked 配置
function initMarked() {
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,     // 支持换行
            gfm: true,        // GitHub 风格 Markdown
            sanitize: false,  // 允许 HTML
            mangle: false,    // 不转义内联 HTML
            headerIds: false  // 禁用标题 ID
        });
    }
}

// 尝试初始化
initMarked();

// 使用 var 或者检查是否已经存在
var chatContainer = window.chatContainer || null;

// 在内容脚本顶部添加当前提供商变量
let currentProvider = 'deepseek'; // 默认值

// 全局变量
let currentTabId; // 当前标签页ID
let fullResponse = ''; // 用于累积助手的完整响应

// 在扩展初始化时获取当前标签页ID
function initializeTabId() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs[0]) {
      currentTabId = tabs[0].id;
      console.log('当前标签页ID:', currentTabId);
    }
  });
}

// 在文档加载时调用初始化函数
document.addEventListener('DOMContentLoaded', initializeTabId);

// 或者使用更安全的方式，将所有代码包装在一个立即执行函数中
(function() {
  // 检查是否已经初始化
  if (window.chatAssistantInitialized) {
    return;
  }
  window.chatAssistantInitialized = true;

  let chatContainer = null;
  let messageHistories = new Map(); // 存储每个页面的对话历史 { tabId: { provider: [], ... } }

  // 仅监听创建聊天界面的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'createChat') {
      console.log('Received create chat request');
      if (request.apiKey && request.model) {
        currentProvider = request.provider; // 更新当前提供商
        createChatInterface();
        sendResponse({ success: true });
      }
    }
    if (request.action === 'updateModel') {
      const modelIndicator = chatContainer.querySelector('.model-indicator');
      if (modelIndicator) {
        modelIndicator.textContent = request.model;
      }
    }
    return true;
  });

  // 添加定期自动保存功能
  let autoSaveInterval;

  function startAutoSave() {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
    }
    
    autoSaveInterval = setInterval(() => {
      console.log('定时自动保存聊天记录');
      saveCurrentChat();
    }, 30000); // 每30秒保存一次
  }

  function stopAutoSave() {
    if (autoSaveInterval) {
      clearInterval(autoSaveInterval);
      autoSaveInterval = null;
    }
  }

  function createChatInterface() {
    return new Promise((resolve) => {
      console.log('Creating chat interface');
      
      if (chatContainer) {
        console.log('Chat interface already exists');
        chatContainer.style.display = 'flex';
        resolve();
        return;
      }
      
      // 创建容器时移除调试样式
      chatContainer = document.createElement('div');
      chatContainer.className = 'ai-chat-container';
      console.log('Container created:', chatContainer);
      
      chatContainer.innerHTML = `
        <div class="chat-header">
          <div class="header-left">
            <span>AI Chat Assistant</span>
            <div class="model-indicator"></div>
          </div>
          <button class="close-button">×</button>
        </div>
        <div class="chat-messages"></div>
        <div class="status-bar"></div>
        <div class="chat-input">
          <textarea placeholder="Type your message..."></textarea>
          <button class="send-button">Send</button>
        </div>
        <div class="resize-handle"></div>
      `;

      // 更新拖动功能
      const header = chatContainer.querySelector('.chat-header');
      let isDragging = false;
      let startX;
      let startY;
      let startLeft;
      let startTop;

      header.addEventListener('mousedown', function(e) {
        isDragging = true;
        
        // 获取当前位置
        const rect = chatContainer.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        
        // 获取鼠标起始位置
        startX = e.clientX;
        startY = e.clientY;
        
        // 添加临时的移动和释放事件监听器
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      function onMouseMove(e) {
        if (!isDragging) return;

        e.preventDefault();
        
        // 计算新位置
        let newLeft = startLeft + (e.clientX - startX);
        let newTop = startTop + (e.clientY - startY);
        
        // 获取窗口尺寸和聊天框尺寸
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const boxWidth = chatContainer.offsetWidth;
        const boxHeight = chatContainer.offsetHeight;
        
        // 限制边界
        newLeft = Math.max(0, Math.min(windowWidth - boxWidth, newLeft));
        newTop = Math.max(0, Math.min(windowHeight - boxHeight, newTop));
        
        // 应用新位置
        chatContainer.style.left = `${newLeft}px`;
        chatContainer.style.top = `${newTop}px`;
      }

      function onMouseUp() {
        isDragging = false;
        // 移除临时事件监听器
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      // 添加关闭按钮事件监听
      const closeButton = chatContainer.querySelector('.close-button');
      closeButton.addEventListener('click', () => {
        console.log('关闭按钮被点击，保存聊天记录');
        saveCurrentChat();
        removeChatInterface();
      });

      document.body.appendChild(chatContainer);
      console.log('Appended to body');
      
      // 添加可见性检测
      setTimeout(() => {
        console.log('Current container display:', getComputedStyle(chatContainer).display);
        chatContainer.classList.add('visible');
        resolve();
      }, 100);

      const textarea = chatContainer.querySelector('textarea');
      const sendButton = chatContainer.querySelector('.send-button');
      const messagesContainer = chatContainer.querySelector('.chat-messages');

      sendButton.addEventListener('click', async () => {
        const message = textarea.value.trim();
        if (!message) return;

        addMessage('user', message, currentProvider);
        textarea.value = '';
        
        showThinkingIndicator();

        chrome.storage.local.get(['apiKey', 'model', 'provider'], async (data) => {
          console.log('Retrieved settings:', { model: data.model, provider: data.provider });
          
          if (!data.apiKey || !data.model || !data.provider) {
            addMessage('error', 'Error: Missing API key, model, or provider settings', currentProvider);
            return;
          }

          try {
            await sendToAPI(data.apiKey, data.model, message, data.provider);
            hideThinkingIndicator();
          } catch (error) {
            hideThinkingIndicator();
            if (error.message.includes('Insufficient Balance')) {
              addMessage('error', 'Error: 账户余额不足，请充值', currentProvider);
            } else {
              addMessage('error', 'Error: ' + error.message, currentProvider);
            }
          }
        });

        // 添加延迟保存（给API响应一些时间）
        setTimeout(() => {
          console.log('用户消息发送后延迟保存');
          saveCurrentChat();
        }, 2000);
      });

      // 添加模型显示更新逻辑
      chrome.storage.local.get(['model'], ({ model }) => {
        const modelIndicator = chatContainer.querySelector('.model-indicator');
        if (modelIndicator) {
          modelIndicator.textContent = model;
        }
      });

      // 添加调整大小功能
      initResize();

      // 在创建完聊天界面后添加历史记录按钮
      addHistoryButton();
      startAutoSave(); // 启动自动保存
    });
  }

  function toggleChat() {
    if (chatContainer) {
      chatContainer.classList.toggle('visible');
    }
  }

  // 添加拖动功能
  function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      // 限制在视窗范围内
      const rect = element.getBoundingClientRect();
      const newTop = element.offsetTop - pos2;
      const newLeft = element.offsetLeft - pos1;
      
      if (newTop >= 0 && newTop + rect.height <= window.innerHeight) {
        element.style.top = newTop + "px";
      }
      if (newLeft >= 0 && newLeft + rect.width <= window.innerWidth) {
        element.style.left = newLeft + "px";
      }
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  function addMessage(role, content, provider = currentProvider) {
    const messagesContainer = chatContainer.querySelector('.chat-messages');
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    // 添加提供商标签，只在 assistant 类型时显示
    if (role === 'assistant') {
        const providerTag = document.createElement('div');
        providerTag.className = 'provider-tag';
        providerTag.setAttribute('data-provider', provider);
        providerTag.textContent = getProviderName(provider);
        messageWrapper.appendChild(providerTag);
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // 对 assistant 和 reasoning 类型使用 Markdown 解析
    if (role === 'assistant' || role === 'reasoning') {
        try {
            if (typeof marked === 'undefined') {
                throw new Error('Marked not available');
            }
            contentDiv.innerHTML = marked.parse(content);
            contentDiv.setAttribute('data-content', content);
        } catch (error) {
            console.error('Markdown parsing error:', error);
            contentDiv.textContent = content;
        }
    } else {
        contentDiv.textContent = content;
    }
    
    messageDiv.appendChild(contentDiv);
    messageWrapper.appendChild(messageDiv);
    messagesContainer.appendChild(messageWrapper);
    
    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return contentDiv;
  }

  function appendToMessage(messageElement, content) {
    try {
        if (typeof marked === 'undefined') {
            throw new Error('Marked not available');
        }
        const currentContent = messageElement.getAttribute('data-content') || '';
        const newContent = currentContent + content;
        messageElement.setAttribute('data-content', newContent);
        
        messageElement.innerHTML = marked.parse(newContent);
        
        const messagesContainer = chatContainer.querySelector('.chat-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Markdown streaming error:', error);
        messageElement.textContent = messageElement.textContent + content;
    }
  }

  function removeChatInterface() {
    if (chatContainer) {
      chatContainer.classList.remove('visible');
      setTimeout(() => {
        if (chatContainer && chatContainer.parentNode) {
          chatContainer.remove();
          chatContainer = null;
          
          // 更新存储状态和图标
          chrome.storage.local.set({ isEnabled: false }, () => {
            chrome.action.setIcon({
              path: {
                "16": "icon/icon16.png",
                "32": "icon/icon32.png",
                "48": "icon/icon48.png",
                "128": "icon/icon128.png"
              }

            });
          });
        }
      }, 300);
      stopAutoSave(); // 停止自动保存
    }
  }

  function showThinkingIndicator() {
    const statusBar = chatContainer.querySelector('.status-bar');
    statusBar.innerHTML = `
      <div class="thinking-indicator">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
        <span>思考中···</span>
      </div>
    `;
  }

  function hideThinkingIndicator() {
    const statusBar = chatContainer.querySelector('.status-bar');
    statusBar.innerHTML = '';
  }

  // 首先定义加密/解密逻辑
  const encryption = {
    // 获取或生成加密密钥
    getKey: async () => {
      // 尝试从存储中获取密钥
      const stored = await chrome.storage.local.get(['encryptionKey']);
      if (stored.encryptionKey) {
        // 将存储的密钥转换回 CryptoKey
        const keyData = new Uint8Array(stored.encryptionKey.split(',').map(Number));
        return await window.crypto.subtle.importKey(
          'raw',
          keyData,
          'AES-GCM',
          true,
          ['encrypt', 'decrypt']
        );
      }

      // 如果没有找到密钥，返回 null
      return null;
    },

    // 解密函数
    decrypt: async (encryptedText) => {
      try {
        const key = await encryption.getKey();
        if (!key) {
          throw new Error('Encryption key not found');
        }

        const encryptedData = new Uint8Array(encryptedText.split(',').map(Number));
        
        // 分离 IV 和加密数据
        const iv = encryptedData.slice(0, 12);
        const data = encryptedData.slice(12);
        
        // 解密数据
        const decrypted = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          data
        );
        
        return new TextDecoder().decode(decrypted);
      } catch (error) {
        console.error('Decryption failed:', error);
        return null;
      }
    }
  };

  function getSystemPrompt(provider) {
    switch (provider) {
      case 'moonshot':
        return "你是 Kimi，由 Moonshot AI 提供的人工智能助手，在回应用户时，请确保使用 Github Flavored Markdown 正确地设置你的回复样式。使用 markdown 语法来处理标题、列表、彩色文本、代码块、高亮等内容。确保在实际回复中不要提及 markdown 或样式。";
      case 'qwen':
        return "你是通义千问，由阿里云提供的人工智能助手，在回应用户时，请确保使用 Github Flavored Markdown 正确地设置你的回复样式。使用 markdown 语法来处理标题、列表、彩色文本、代码块、高亮等内容。确保在实际回复中不要提及 markdown 或样式。";
      case 'deepseek':
        return "你是DeepSeek，由深度求索公司开发的人工智能助手，在回应用户时，请确保使用 Github Flavored Markdown 正确地设置你的回复样式。使用 markdown 语法来处理标题、列表、彩色文本、代码块、高亮等内容。确保在实际回复中不要提及 markdown 或样式。";
      case 'volcengine':
        return "你是豆包，是由字节跳动开发的 AI 人工智能助手，在回应用户时，请确保使用 Github Flavored Markdown 正确地设置你的回复样式。使用 markdown 语法来处理标题、列表、彩色文本、代码块、高亮等内容。确保在实际回复中不要提及 markdown 或样式。";
      default:
        return "你是一个有帮助的AI助手";
    }
  }

  async function sendToAPI(encryptedApiKey, model, message, provider) {
    try {
      console.log('Starting API request...');
      console.log('Provider:', provider);
      console.log('Model:', model);
      console.log('Message:', message.substring(0, 50)); // 显示部分消息内容

      console.log('Attempting to decrypt API key...');
      // 解密 API key
      const apiKey = await encryption.decrypt(encryptedApiKey);
      if (!apiKey) {
        throw new Error('Failed to decrypt API key');
      }
      console.log('API key decrypted successfully');

      // 获取当前页面的历史记录
      const tabId = (await chrome.runtime.sendMessage({ action: 'getTabId' })).tabId;
      const history = messageHistories.get(tabId)?.[provider] || [];
      
      // 使用动态系统提示
      const systemPrompt = getSystemPrompt(provider);
      const filteredHistory = history.filter(m => m.role !== 'system');
      const messages = [
        { role: "system", content: systemPrompt },
        ...filteredHistory.slice(-19), // 保留19条历史+1条系统消息
        { role: "user", content: message }
      ];

      // 在发送请求前添加调试日志
      console.log('Sending request with messages:', JSON.stringify(messages, null, 2));

      let response;
      console.log('Sending request to:', provider, 'with model:', model);

      let messageDiv;
      let reasoningDiv;  // 提升到函数作用域
      
      if (provider === 'volcengine') {
        try {
          let retryCount = 0;
          const maxRetries = 3;
          
          // 获取历史消息
          const providerHistory = messageHistories.get(tabId)?.[provider] || [];
          
          // 构建完整的消息数组，包含系统消息和历史记录
          const messages = [
            { role: "system", content: getSystemPrompt(provider) },
            ...providerHistory,  // 添加历史消息
            { role: "user", content: message }  // 添加当前消息
          ];

          const establishConnection = () => {
            return new Promise((resolve, reject) => {
              const port = chrome.runtime.connect({ name: 'volcengine-stream' });
              let isConnectionActive = true;
              let fullResponse = '';  // 用于保存完整响应
              
              port.onMessage.addListener(function onMessage(msg) {
                if (!isConnectionActive) return;
                
                if (msg.type === 'error') {
                  isConnectionActive = false;
                  port.onMessage.removeListener(onMessage);
                  port.disconnect();
                  reject(new Error(msg.error));
                  return;
                }
                
                if (msg.type === 'chunk') {
                  const lines = msg.data.split('\n');
                  
                  for (const line of lines) {
                    if (line.trim() === '' || line.includes('[DONE]')) continue;
                    
                    try {
                      if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        console.log('Response data:', data);
                        if (data.choices && data.choices[0].delta) {
                          const delta = data.choices[0].delta;
                          console.log('Delta object:', delta);
                          
                          // 处理思考过程
                          if (delta.reasoning_content && delta.reasoning_content.trim() !== '') {
                            if (!reasoningDiv) {
                              reasoningDiv = addMessage('reasoning', '', provider);
                            }
                            appendToMessage(reasoningDiv, delta.reasoning_content);
                          }
                          
                          // 处理回复内容
                          if (delta.content && delta.content.trim() !== '') {
                            if (!messageDiv) {
                              const thinking = document.querySelector('.message.thinking');
                              if (thinking) thinking.remove();
                              messageDiv = addMessage('assistant', '', provider);
                            }
                            appendToMessage(messageDiv, delta.content);
                            fullResponse += delta.content;
                          }
                        }
                      }
                    } catch (e) {
                      console.error('Error parsing SSE message:', e, 'Line:', line);
                    }
                  }
                }
                
                if (msg.type === 'done') {
                  isConnectionActive = false;
                  port.onMessage.removeListener(onMessage);
                  port.disconnect();
                  
                  // 保存对话历史
                  if (!messageHistories.has(tabId)) {
                    messageHistories.set(tabId, {});
                  }
                  if (!messageHistories.get(tabId)[provider]) {
                    messageHistories.get(tabId)[provider] = [];
                  }
                  
                  // 添加用户消息和助手响应到历史记录
                  messageHistories.get(tabId)[provider].push(
                    { role: "user", content: message },
                    { role: "assistant", content: fullResponse }
                  );
                  
                  // 限制历史记录长度，保留最近的对话
                  const maxHistory = 10; // 保留最近5轮对话（10条消息）
                  const history = messageHistories.get(tabId)[provider];
                  if (history.length > maxHistory * 2) {
                    messageHistories.get(tabId)[provider] = history.slice(-maxHistory * 2);
                  }
                  
                  resolve();
                }
              });

              // 发送请求
              chrome.runtime.sendMessage({
                action: 'volcengineRequest',
                apiKey: apiKey,
                data: {
                  model: model,
                  messages: messages,  // 使用包含历史记录的完整消息数组
                  temperature: 0.7,
                  stream: true
                }
              }, (response) => {
                if (!response || !response.success) {
                  isConnectionActive = false;
                  port.disconnect();
                  reject(new Error(response?.error || 'Failed to send request'));
                }
              });
            });
          };

          await establishConnection();
          return;
        } catch (error) {
          console.error('Volcengine request failed:', error);
          throw error;
        }
      } else if (provider === 'deepseek') {
        response = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.3,
            stream: true
          })
        });
      } else if (provider === 'moonshot') {
        response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.3,
            stream: true
          })
        });
      } else if (provider === 'qwen') {
        response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`,
            'X-DashScope-SSE': 'enable',  // 添加SSE支持
            'X-DashScope-Streaming': 'enable'  // 确保流式传输
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            stream: true,
            temperature: 0.7,
            top_p: 0.8,
            max_tokens: 1500,
            presence_penalty: 0,
            frequency_penalty: 0
          }),
          keepalive: true,
          mode: 'cors',
          credentials: 'omit'
        });
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }

      // 只有非火山方舟的请求才会到达这里
      if (!response || !response.ok) {
        const errorData = await response?.json().catch(() => ({}));
        console.error('API Error details:', errorData);
        
        if (provider === 'qwen' && response?.status === 429) {
          throw new Error('请求过于频繁，请稍后再试');
        }
        
        throw new Error(errorData.error?.message || `API request failed: ${response?.status}`);
      }

      let fullResponse = '';
      let buffer = '';

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.includes('[DONE]')) continue;
          
          try {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              console.log('Response data:', data);
              if (data.choices && data.choices[0].delta) {
                const delta = data.choices[0].delta;
                console.log('Delta object:', delta);
                
                // 处理思考过程
                if (delta.reasoning_content && delta.reasoning_content.trim() !== '') {
                  if (!reasoningDiv) {
                    reasoningDiv = addMessage('reasoning', '', provider);
                  }
                  appendToMessage(reasoningDiv, delta.reasoning_content);
                }
                
                // 处理回复内容
                if (delta.content && delta.content.trim() !== '') {
                  if (!messageDiv) {
                    const thinking = document.querySelector('.message.thinking');
                    if (thinking) thinking.remove();
                    messageDiv = addMessage('assistant', '', provider);
                  }
                  appendToMessage(messageDiv, delta.content);
                  fullResponse += delta.content;
                }
              }
            }
          } catch (e) {
            console.error('Error parsing SSE message:', e, 'Line:', line);
          }
        }
      }

      // 保存到历史记录
      if (!messageHistories.has(tabId)) {
        messageHistories.set(tabId, {});
      }
      const providerHistory = messageHistories.get(tabId)[provider] || [];
      providerHistory.push(
        { role: "user", content: message },
        { role: "assistant", content: fullResponse }
      );
      messageHistories.get(tabId)[provider] = providerHistory.slice(-20); // 保留最近10轮对话

      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);

      // 检查是否是最后一个响应块
      if (response.choices && response.choices[0] && response.choices[0].finish_reason === 'stop') {
        console.log('流式响应结束，保存聊天记录');
        saveCurrentChat();
      }
    } catch (error) {
      console.error('Full error details:', error);
      console.error('API request failed:', error);
      
      if (provider === 'qwen') {
        const errorMessage = error.message.includes('Failed to fetch') 
          ? '连接已断开，请重试' 
          : error.message;
        addMessage('error', 'Error: ' + errorMessage, currentProvider);
      } else {
        addMessage('error', 'Error: ' + error.message, currentProvider);
      }
      
      const thinking = document.querySelector('.message.thinking');
      if (thinking) thinking.remove();
    }
  }

  // 添加调整大小功能
  function initResize() {
    const resizeHandle = chatContainer.querySelector('.resize-handle');
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    resizeHandle.addEventListener('mousedown', function(e) {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(document.defaultView.getComputedStyle(chatContainer).width, 10);
      startHeight = parseInt(document.defaultView.getComputedStyle(chatContainer).height, 10);
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
      if (!isResizing) return;
      
      const newWidth = startWidth + (e.clientX - startX);
      const newHeight = startHeight + (e.clientY - startY);
      
      // 限制最小尺寸
      chatContainer.style.width = Math.max(300, newWidth) + 'px';
      chatContainer.style.height = Math.max(200, newHeight) + 'px';
      
      // 保持输入框可见
      chatContainer.querySelector('textarea').style.height = 'calc(100% - 40px)';
    }

    function onMouseUp() {
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
  }

  function saveToHistory(role, content, provider, tabId, message) {
    if (role === 'assistant') {
      if (!messageHistories.has(tabId)) {
        messageHistories.set(tabId, {});
      }
      const providerHistory = messageHistories.get(tabId)[provider] || [];
      
      // 只保留用户和助手的消息
      providerHistory.push(
        { role: "user", content: message }, // 用户当前消息
        { role: "assistant", content: content } // 助手回复
      );
      
      // 清理系统消息（如果有）
      messageHistories.get(tabId)[provider] = providerHistory
        .filter(m => m.role !== 'system')
        .slice(-20);
    }
  }

  // 获取提供商正式名称
  function getProviderName(providerKey) {
    const providerMap = {
      'moonshot': 'Moonshot AI',
      'qwen': '阿里云通义',
      'deepseek': '深度求索',
      'volcengine': '火山方舟引擎'
    };
    return providerMap[providerKey] || 'AI Assistant';
  }

  /**
   * 保存当前聊天记录到本地存储
   */
  function saveCurrentChat() {
    if (!chatContainer) {
      console.error('找不到聊天容器，无法保存');
      return;
    }
    
    // 获取当前提供商信息
    let provider = currentProvider;
    if (!provider) {
      // 如果全局变量不可用，尝试从DOM元素获取
      const assistantMsg = chatContainer.querySelector('.message.assistant');
      if (assistantMsg) {
        provider = assistantMsg.getAttribute('data-provider');
      }
      
      if (!provider) {
        console.error('无法确定当前提供商，使用默认值');
        provider = 'deepseek'; // 使用默认值
      }
    }
    
    console.log('准备保存聊天记录，提供商:', provider);
    
    const chatMessages = chatContainer.querySelector('.chat-messages');
    if (!chatMessages) {
      console.error('找不到聊天消息容器');
      return;
    }
    
    const messages = chatMessages.querySelectorAll('.message');
    if (messages.length === 0) {
      console.warn('没有聊天消息可保存');
      return;
    }
    
    const chatData = [];
    
    messages.forEach(msg => {
      // 用户消息
      if (msg.classList.contains('user')) {
        const content = msg.querySelector('.message-content')?.textContent || '';
        chatData.push({
          role: 'user',
          content: content
        });
      } 
      // 助手消息
      else if (msg.classList.contains('assistant')) {
        const content = msg.querySelector('.message-content')?.textContent || '';
        const providerTag = msg.querySelector('.provider-tag')?.textContent || '';
        const msgProvider = msg.getAttribute('data-provider') || provider;
        
        chatData.push({
          role: 'assistant',
          content: content,
          provider: msgProvider,
          providerTag: providerTag
        });
      }
      // reasoning消息
      else if (msg.classList.contains('reasoning')) {
        const content = msg.querySelector('.message-content')?.textContent || '';
        chatData.push({
          role: 'reasoning',
          content: content
        });
      }
    });
    
    console.log('收集到的聊天数据:', chatData.length, '条消息');
    
    // 检查数据大小
    if (JSON.stringify(chatData).length > 4000000) { // ~4MB
      console.warn('聊天记录过大，仅保存最近部分');
      chatData.splice(0, Math.floor(chatData.length / 2));
    }
    
    // 使用当前提供商作为存储键
    const storageKey = `chat_history_${provider}`;
    chrome.storage.local.set({[storageKey]: chatData}, () => {
      if (chrome.runtime.lastError) {
        console.error('保存聊天记录失败:', chrome.runtime.lastError);
      } else {
        console.log('聊天记录已成功保存，提供商:', provider, '消息数量:', chatData.length);
      }
    });
  }

  /**
   * 添加历史记录按钮到聊天界面
   */
  function addHistoryButton() {
    if (!chatContainer) {
      console.error('找不到聊天容器');
      return;
    }
    
    // 如果按钮已存在，不重复添加
    if (chatContainer.querySelector('.history-container')) {
      return;
    }
    
    const chatHeader = chatContainer.querySelector('.chat-header');
    if (!chatHeader) {
      console.error('找不到聊天头部元素');
      return;
    }
    
    // 创建历史记录按钮容器
    const historyContainer = document.createElement('div');
    historyContainer.className = 'history-container';
    historyContainer.style.cssText = 'display: flex; background-color: #f0f0f0; padding: 8px; align-items: center; border-bottom: 1px solid #ddd;';
    
    // 创建历史记录按钮
    const historyButton = document.createElement('div');
    historyButton.className = 'ai-chat-history';
    historyButton.textContent = '历史记录';
    historyButton.style.cssText = 'flex-grow: 1; text-align: center; cursor: pointer; color: #555; font-weight: bold;';
    historyButton.title = '查看历史聊天记录';
    
    // 创建清除按钮
    const clearButton = document.createElement('div');
    clearButton.className = 'clear-history';
    clearButton.innerHTML = '&#128465;'; // 垃圾桶图标
    clearButton.style.cssText = 'cursor: pointer; padding: 0 10px; color: #888; font-size: 16px;';
    clearButton.title = '清除历史记录';
    
    // 添加事件监听
    historyButton.addEventListener('click', loadChatHistory);
    clearButton.addEventListener('click', confirmClearHistory);
    
    // 将按钮添加到容器
    historyContainer.appendChild(historyButton);
    historyContainer.appendChild(clearButton);
    
    // 在header下方插入按钮容器
    chatHeader.parentNode.insertBefore(historyContainer, chatHeader.nextSibling);
  }

  /**
   * 加载并显示历史聊天记录
   */
  function loadChatHistory() {
    if (!chatContainer) {
      console.error('找不到聊天容器');
      return;
    }
    
    // 获取当前提供商信息
    let provider = currentProvider;
    if (!provider) {
      // 如果全局变量不可用，尝试从DOM元素获取
      const assistantMsg = chatContainer.querySelector('.message.assistant');
      if (assistantMsg) {
        provider = assistantMsg.getAttribute('data-provider');
      }
      
      if (!provider) {
        console.warn('未找到提供商信息，使用默认值');
        provider = 'deepseek'; // 使用默认值
      }
    }
    
    console.log('开始加载聊天记录，提供商:', provider);
    
    // 使用提供商作为存储键
    const storageKey = `chat_history_${provider}`;
    chrome.storage.local.get([storageKey], (result) => {
      console.log('获取的存储数据:', result);
      const chatData = result[storageKey];
      
      if (chatData && chatData.length > 0) {
        const chatMessages = chatContainer.querySelector('.chat-messages');
        if (!chatMessages) {
          console.error('找不到聊天消息容器');
          return;
        }
        
        // 清空当前聊天内容
        chatMessages.innerHTML = '';
        
        // 重建聊天记录
        chatData.forEach(msg => {
          if (msg.role === 'user') {
            addMessage('user', msg.content, provider);
          } else if (msg.role === 'assistant') {
            // 创建消息元素
            const messageDiv = addMessage('assistant', msg.content, msg.provider || provider);
            
            // 如果有提供商标签信息，尝试添加
            if (msg.providerTag && messageDiv) {
              const providerTag = messageDiv.querySelector('.provider-tag');
              if (providerTag) {
                providerTag.textContent = msg.providerTag;
              }
            }
          } else if (msg.role === 'reasoning') {
            // 添加 reasoning 消息
            addMessage('reasoning', msg.content, provider);
          }
        });
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } else {
        // 显示提示
        alert('没有找到聊天记录');
      }
    });
  }

  /**
   * 确认清除历史记录
   */
  function confirmClearHistory() {
    if (confirm('确定要清除所有聊天历史记录吗？')) {
      clearChatHistory();
    }
  }

  /**
   * 清除保存的聊天历史记录
   */
  function clearChatHistory() {
    if (!chatContainer) {
      console.error('找不到聊天容器');
      return;
    }
    
    // 获取当前提供商信息
    let provider = currentProvider;
    if (!provider) {
      // 如果全局变量不可用，尝试从DOM元素获取
      const assistantMsg = chatContainer.querySelector('.message.assistant');
      if (assistantMsg) {
        provider = assistantMsg.getAttribute('data-provider');
      }
      
      if (!provider) {
        console.warn('未找到提供商信息，使用默认值');
        provider = 'deepseek'; // 使用默认值
      }
    }
    
    // 使用提供商作为存储键
    const storageKey = `chat_history_${provider}`;
    chrome.storage.local.remove(storageKey, () => {
      console.log('聊天记录已清除');
      alert('历史记录已清除');
    });
  }
})();