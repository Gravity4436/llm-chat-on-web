let isEnabled = false;
let messageHistories = new Map(); // 存储每个页面的对话历史 { tabId: { provider: [], ... } }

// 修改加密/解密逻辑
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

    // 生成新的加密密钥
    const key = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );

    // 导出密钥以便存储
    const exportedKey = await window.crypto.subtle.exportKey('raw', key);
    const keyArray = Array.from(new Uint8Array(exportedKey));
    await chrome.storage.local.set({ encryptionKey: keyArray.toString() });

    return key;
  },

  // 加密函数
  encrypt: async (text) => {
    try {
      const key = await encryption.getKey();
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      
      // 生成随机 IV
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      // 加密数据
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      
      // 组合 IV 和加密数据
      const encryptedData = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
      return Array.from(encryptedData).toString();
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  },
  
  // 解密函数
  decrypt: async (encryptedText) => {
    try {
      const key = await encryption.getKey();
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

// 初始化时检查状态并设置正确的图标
document.addEventListener('DOMContentLoaded', async () => {
  const providerSelect = document.getElementById('provider');
  const modelSelect = document.getElementById('model');
  const apiKeyInput = document.getElementById('apiKey');

  // 根据选择的提供商显示相应的模型
  function updateModelOptions() {
    const provider = providerSelect.value;
    const options = modelSelect.options;
    
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      option.style.display = option.dataset.provider === provider ? '' : 'none';
    }
    
    // 选择第一个可见的选项
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      if (option.style.display !== 'none') {
        modelSelect.value = option.value;
        break;
      }
    }
  }

  providerSelect.addEventListener('change', updateModelOptions);

  try {
    // 获取保存的设置，包括 apiKey
    const settings = await chrome.storage.local.get(['apiKey', 'provider', 'model']);
    
    // 处理 API Key
    if (settings.apiKey) {
      const decryptedApiKey = await encryption.decrypt(settings.apiKey);
      if (decryptedApiKey) {
        apiKeyInput.value = decryptedApiKey;
      }
    }
    
    // 设置 provider
    if (settings.provider) {
      document.getElementById('provider').value = settings.provider;
      
      // 触发 provider 变化事件来更新界面
      const event = new Event('change');
      document.getElementById('provider').dispatchEvent(event);
      
      // 如果是火山方舟，设置保存的 model ID
      if (settings.provider === 'volcengine' && settings.model) {
        document.getElementById('modelInput').value = settings.model;
      } else if (settings.model) {
        document.getElementById('model').value = settings.model;
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }

  // 从 storage 中获取当前状态
  const { isEnabled = false } = await chrome.storage.local.get('isEnabled');
  
  // 设置图标
  chrome.action.setIcon({
    path: {
      "16": "icons/ai.png",
      "32": "icons/ai.png",
      "48": "icons/ai.png",
      "128": "icons/ai.png"
    }
  });
});

document.getElementById('startChat').addEventListener('click', async () => {
  try {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (!apiKey) {
      alert('请输入API密钥');
      return;
    }

    const provider = document.getElementById('provider').value;
    let model;
    
    // 根据provider获取model值
    if (provider === 'volcengine') {
      model = document.getElementById('modelInput').value.trim();
      if (!model) {
        alert('请输入火山方舟Model ID');
        return;
      }
    } else {
      model = document.getElementById('model').value;
    }

    // 获取当前标签页ID
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0].id;

    // 重置该provider的历史记录
    if (messageHistories.has(tabId)) {
      messageHistories.get(tabId)[provider] = [];
    }

    // 加密 API key
    const encryptedApiKey = await encryption.encrypt(apiKey);
    
    // 发送创建聊天请求
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'createChat',
      apiKey: encryptedApiKey,
      model: model,
      provider: provider
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('通信错误:', chrome.runtime.lastError);
      }
      window.close();
    });

    // 确保保存正确的模型设置
    await chrome.storage.local.set({
      apiKey: encryptedApiKey,
      provider: provider,
      model: model
    });
  } catch (error) {
    console.error('Error:', error);
    alert('启动失败: ' + error.message);
  }
});

// 添加图标点击处理
chrome.action.onClicked.addListener((tab) => {
  isEnabled = !isEnabled;
  
  // 保存状态
  chrome.storage.local.set({ isEnabled });
  
  // 更新图标
  updateIcon();
  
  // 向内容脚本发送消息
  chrome.tabs.sendMessage(tab.id, { action: 'toggleChat' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
  });
});

function updateIcon() {
  const iconPath = isEnabled ? 'icons/icon128.png' : 'icons/icon128-disabled.png';
  chrome.action.setIcon({
    path: iconPath
  });
}

// 修改 provider 变化事件处理
document.getElementById('provider').addEventListener('change', function() {
  const provider = this.value;
  const modelSelect = document.getElementById('model');
  const modelInput = document.querySelector('.model-input');
  
  // 显示/隐藏相应的输入方式
  if (provider === 'volcengine') {
    modelSelect.style.display = 'none';
    modelInput.style.display = 'block';
  } else {
    modelSelect.style.display = 'block';
    modelInput.style.display = 'none';
    
    // 原有的模型过滤逻辑
    Array.from(modelSelect.options).forEach(option => {
      const show = option.dataset.provider === provider;
      option.style.display = show ? 'block' : 'none';
    });
    
    // 自动选择第一个可用选项
    const firstVisible = modelSelect.querySelector('option[style="display: block;"], option:not([style])');
    if (firstVisible) {
      modelSelect.value = firstVisible.value;
    }
  }
}); 