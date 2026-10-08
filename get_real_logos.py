import urllib.request
import re
import os

pages = {
    "BFAR": "https://commons.wikimedia.org/wiki/File:Bureau_of_Fisheries_and_Aquatic_Resources_(BFAR).svg",
    "DOT": "https://commons.wikimedia.org/wiki/File:Department_of_Tourism_(DOT).svg",
    "PCG": "https://commons.wikimedia.org/wiki/File:Philippine_Coast_Guard_(PCG).svg",
    "DENR": "https://commons.wikimedia.org/wiki/File:Department_of_Environment_and_Natural_Resources_(DENR)_logo.svg",
    "Antique": "https://commons.wikimedia.org/wiki/File:Ph_seal_antique.png",
    "Libertad": "https://commons.wikimedia.org/wiki/File:Ph_seal_antique_libertad.png"
}

os.makedirs('assets/logos', exist_ok=True)
headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

for name, url in pages.items():
    try:
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req).read().decode('utf-8')
        # Find the original file link: href="https://upload.wikimedia.org/wikipedia/commons/..."
        match = re.search(r'href="(https://upload\.wikimedia\.org/wikipedia/commons/[^"]+)"', html)
        if match:
            img_url = match.group(1)
            ext = img_url.split('.')[-1]
            if ext.lower() not in ['png', 'jpg', 'svg']: ext = 'png'
            out_path = f"assets/logos/{name}.{ext}"
            req2 = urllib.request.Request(img_url, headers=headers)
            with urllib.request.urlopen(req2) as resp, open(out_path, 'wb') as f:
                f.write(resp.read())
            print(f"Success: {name}")
        else:
            print(f"Failed to find image in {name}")
    except Exception as e:
        print(f"Error {name}: {e}")

# Try direct links for PTAA and PHILTOA
directs = {
    "PTAA": "https://ptaa.org.ph/wp-content/uploads/2018/10/ptaa-logo.png",
    "PHILTOA": "https://philtoa.com/wp-content/uploads/2023/07/PHILTOA-Logo-e1689230588628.png" 
}
for name, url in directs.items():
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as resp, open(f"assets/logos/{name}.png", 'wb') as f:
            f.write(resp.read())
        print(f"Success: {name}")
    except Exception as e:
        print(f"Error {name}: {e}")
