import urllib.request
import re
import os

pages = {
    "DENR": "https://www.facebook.com/DENROfficial",
    "Antique": "https://www.facebook.com/PAGIOAntique",
    "Libertad": "https://www.facebook.com/municipalityoflibertadantique",
    "PTAA": "https://www.facebook.com/ptaa.ph",
    "PHILTOA": "https://www.facebook.com/philtoa"
}

os.makedirs('assets/logos', exist_ok=True)
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'}

for name, url in pages.items():
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req).read().decode('utf-8')
        match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
        if match:
            img_url = match.group(1).replace('&amp;', '&')
            req2 = urllib.request.Request(img_url, headers=headers)
            with urllib.request.urlopen(req2) as resp, open(f"assets/logos/{name}.png", 'wb') as f:
                f.write(resp.read())
            print(f"Success: {name}")
        else:
            print(f"Failed to find og:image for {name}")
    except Exception as e:
        print(f"Error {name}: {e}")
