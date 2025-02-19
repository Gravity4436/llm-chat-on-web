// 初始状态设置为未启用
let isEnabled = false;

// 只在安装时设置初始图标
chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setIcon({
    path: {
      "16": "icons/ai.png",
      "32": "icons/ai.png",
      "48": "icons/ai.png",
      "128": "icons/ai.png"
    }
  });
});

// 监听图标点击
chrome.action.onClicked.addListener((tab) => {
  isEnabled = !isEnabled;
  
  // 保存状态
  chrome.storage.local.set({ isEnabled });
  
  // 更新图标
  updateIcon();
  
  // 向内容脚本发送消息
  chrome.tabs.sendMessage(tab.id, { action: 'toggleChat' });
});

function updateIcon() {
  const iconPath = isEnabled ? 'icons/ai.png' : 'icons/ai.png';
  chrome.action.setIcon({
    path: {
      "16": iconPath,
      "32": iconPath,
      "48": iconPath,
      "128": iconPath
    }
  });
}

// 存储所有活动的连接
const connections = new Map();

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name === 'volcengine-stream') {
    // 存储连接
    const tabId = port.sender.tab.id;
    
    // 如果已存在连接，先关闭它
    if (connections.has(tabId)) {
      try {
        connections.get(tabId).disconnect();
      } catch (e) {
        console.error('Error disconnecting old port:', e);
      }
    }
    
    connections.set(tabId, port);

    port.onDisconnect.addListener(() => {
      if (connections.get(tabId) === port) {
        connections.delete(tabId);
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabId') {
    sendResponse({ tabId: sender.tab.id });
    return true;
  }
  
  if (request.action === 'volcengineRequest') {
    const tabId = sender.tab.id;
    const port = connections.get(tabId);
    
    if (!port) {
      sendResponse({ success: false, error: 'No active connection' });
      return true;
    }

    (async () => {
      const timeout = setTimeout(() => {
        if (connections.has(tabId)) {
          connections.get(tabId).postMessage({ 
            type: 'error', 
            error: 'Request timeout' 
          });
          connections.delete(tabId);
        }
      }, 30000); // 30秒超时

      try {
        const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${request.apiKey}`,
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify(request.data)
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          if (connections.has(tabId)) {
            connections.get(tabId).postMessage({ type: 'chunk', data: chunk });
          } else {
            break;
          }
        }
        
        if (connections.has(tabId)) {
          connections.get(tabId).postMessage({ type: 'done' });
        }
      } catch (error) {
        clearTimeout(timeout);
        if (connections.has(tabId)) {
          connections.get(tabId).postMessage({ 
            type: 'error', 
            error: error.message 
          });
        }
      }
    })();

    sendResponse({ success: true });
    return true;
  }
  return true;
}); 