import urllib.request
import re
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://kr.pinterest.com/pin/893331276096299508/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    html = urllib.request.urlopen(req, context=ctx).read().decode('utf-8')
    matches = re.findall(r'https://i\.pinimg\.com/[^"\']+\.jpg', html)
    if matches:
        print(f"Found image: {matches[0]}")
    else:
        print("No image found")
except Exception as e:
    print(f"Error: {e}")
