import urllib.request
import re

pages = {
    "DENR": "https://commons.wikimedia.org/wiki/File:Logo_of_the_Department_of_Environment_and_Natural_Resources.svg",
    "Antique": "https://commons.wikimedia.org/wiki/File:Official_Seal_of_Antique.svg"
}

headers = {'User-Agent': 'Mozilla/5.0'}
for name, url in pages.items():
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req).read().decode('utf-8')
        match = re.search(r'href="(https://upload\.wikimedia\.org/wikipedia/commons/[^"]+\.svg)"', html)
        if match:
            img_url = match.group(1)
            req2 = urllib.request.Request(img_url, headers=headers)
            with urllib.request.urlopen(req2) as resp, open(f"assets/logos/{name}.svg", 'wb') as f:
                f.write(resp.read())
            print(f"Success: {name}")
    except Exception as e:
        print(f"Error {name}: {e}")
