import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://kr.pinterest.com/pin/579416308340974150/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
try:
    html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
    # Find pin images
    matches = re.findall(r'https://i\.pinimg\.com/[^"\']+\.jpg', html)
    if matches:
        print(f"Found images: {matches[0]}")
    else:
        print("No images found")
except Exception as e:
    print(f"Error: {e}")
