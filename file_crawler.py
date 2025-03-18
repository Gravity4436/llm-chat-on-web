import requests
from bs4 import BeautifulSoup
import time
import random
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

def count_files():
    url = "https://file.tl.gov.cn/1"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    }
    
    # 设置重试策略
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    
    try:
        response = session.get(
            url, 
            headers=headers, 
            timeout=10,
            verify=False  # 关闭 SSL 验证
        )
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # 找到所有文件链接
        file_links = soup.find_all('a', href=True)
        file_count = 0
        
        for link in file_links:
            if link['href'].startswith('/1/'):  # 只统计/1/目录下的文件
                file_count += 1
                print(f"找到文件: {link.text.strip()}")
                time.sleep(random.uniform(0.5, 1))  # 随机延迟
        
        print(f"\n总共找到 {file_count} 个文件")
        
    except requests.exceptions.RequestException as e:
        print(f"发生错误: {e}")
    except Exception as e:
        print(f"未知错误: {e}")

if __name__ == "__main__":
    count_files()