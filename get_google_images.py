import urllib.request
import re
import os

queries = {
    "DENR": "DENR Philippines logo",
    "Antique": "Province of Antique seal",
    "Libertad": "Municipality of Libertad Antique logo",
    "PTAA": "PTAA Philippine Travel Agencies Association logo",
    "PHILTOA": "PHILTOA logo"
}

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'}

for name, query in queries.items():
    try:
        url = "https://www.google.com/search?q=" + urllib.parse.quote(query) + "&tbm=isch"
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req).read().decode('utf-8')
        
        # Google images thumbnails are typically in this format or base64
        # Let's find the first image link starting with https://encrypted-tbn0.gstatic.com/images
        match = re.search(r'(https://encrypted-tbn0\.gstatic\.com/images[^"\']+)', html)
        if match:
            img_url = match.group(1).replace('&amp;', '&')
            req2 = urllib.request.Request(img_url, headers=headers)
            with urllib.request.urlopen(req2) as resp, open(f"assets/logos/{name}.png", 'wb') as f:
                f.write(resp.read())
            print(f"Success: {name}")
        else:
            print(f"Failed to find image for {name}")
    except Exception as e:
        print(f"Error {name}: {e}")
