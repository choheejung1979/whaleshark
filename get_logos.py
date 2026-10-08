from duckduckgo_search import DDGS
import urllib.request
import os

queries = {
    "BFAR": "Bureau of Fisheries and Aquatic Resources logo",
    "DOT": "Department of Tourism Philippines logo",
    "PCG": "Philippine Coast Guard logo",
    "PTAA": "PTAA Philippine Travel Agencies Association logo",
    "PHILTOA": "PHILTOA logo",
    "Antique": "Province of Antique seal logo",
    "Libertad": "Libertad Antique logo",
    "DENR": "DENR Philippines logo"
}

os.makedirs('assets/logos', exist_ok=True)

with DDGS() as ddgs:
    for name, query in queries.items():
        print(f"Fetching {name}...")
        try:
            results = list(ddgs.images(query, max_results=1))
            if results:
                url = results[0]['image']
                ext = url.split('.')[-1].split('?')[0][:4]
                if ext not in ['png', 'jpg', 'jpeg', 'svg']: ext = 'png'
                save_path = f"assets/logos/{name}.{ext}"
                
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as response, open(save_path, 'wb') as out_file:
                    out_file.write(response.read())
                print(f"Saved {name} -> {save_path}")
        except Exception as e:
            print(f"Error for {name}: {e}")
